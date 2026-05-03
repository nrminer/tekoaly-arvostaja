"""Voice AI transcription pipeline.

End-to-end: validate → preprocess (ffmpeg, 16kHz mono, EBU R128) → chunk
(overlap-aware) → transcribe (OpenAI whisper-1 verbose_json with segment+word
timestamps) → assemble → normalise → return structured result.

Privacy:
- All audio is written ONLY to a per-call tempdir which is recursively removed
  in a `try/finally`.
- We never log raw audio bytes or transcript text content. We log only sizes,
  durations, codecs, and chunk counts.
- Transcripts are kept in an in-memory TTL cache for 5 minutes so the user can
  download alternative formats (SRT/VTT/MD/TXT/JSON), then GC'd.

References: faster-whisper / OpenAI Whisper API behaviour, broadcast subtitle
reading-speed limits, `ffmpeg -af loudnorm` (EBU R128).
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import shutil
import subprocess
import tempfile
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from dotenv import load_dotenv
from emergentintegrations.llm.openai import OpenAISpeechToText

from audio_models import (
    AudioMetadata,
    TranscriptResult,
    TranscriptSegment,
    WordTimestamp,
)

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Pipeline constants — kept conservative and bilingual where they surface as
# user-facing errors. NOT sourced from security_config because they describe
# audio-domain limits that are independent of the global rate-limit posture.
# ---------------------------------------------------------------------------

SUPPORTED_EXTENSIONS = {
    ".wav", ".mp3", ".m4a", ".ogg", ".flac",
    ".mp4", ".mpeg", ".mpga", ".webm",
}
SUPPORTED_CONTENT_TYPES = {
    "audio/wav", "audio/x-wav", "audio/wave",
    "audio/mpeg", "audio/mp3", "audio/mpga",
    "audio/mp4", "audio/x-m4a", "audio/m4a",
    "audio/ogg", "audio/flac", "audio/x-flac",
    "audio/webm",
    "video/mp4", "video/webm", "video/quicktime",
    "application/octet-stream",
}

MAX_AUDIO_BYTES = 50 * 1024 * 1024            # 50 MB raw upload cap
MAX_AUDIO_DURATION_SECONDS = 30 * 60          # 30 minutes per submission
WHISPER_MAX_BYTES_PER_REQUEST = 24 * 1024 * 1024  # stay under OpenAI 25MB limit
CHUNK_DURATION_SECONDS = 8 * 60               # 8-minute chunks (well under 25MB)
CHUNK_OVERLAP_SECONDS = 12                    # overlap to avoid mid-word splits
SUBPROCESS_TIMEOUT_SECONDS = 90
WHISPER_TIMEOUT_SECONDS = 120
TRANSCRIPT_CACHE_TTL_SECONDS = 5 * 60         # 5 min — enough for the user to grab formats
MAX_CACHED_TRANSCRIPTS = 64

# Max characters per subtitle line — broadcast convention is ~42, keep it tight.
MAX_SUBTITLE_LINE_CHARS = 42


@dataclass
class _CachedTranscript:
    result: TranscriptResult
    expires_at: float


_TRANSCRIPT_CACHE: dict[str, _CachedTranscript] = {}


def _gc_cache() -> None:
    now = time.time()
    expired = [tid for tid, entry in _TRANSCRIPT_CACHE.items() if entry.expires_at < now]
    for tid in expired:
        _TRANSCRIPT_CACHE.pop(tid, None)
    # Hard size cap as belt-and-braces.
    if len(_TRANSCRIPT_CACHE) > MAX_CACHED_TRANSCRIPTS:
        oldest = sorted(_TRANSCRIPT_CACHE.items(), key=lambda kv: kv[1].expires_at)
        for tid, _ in oldest[: len(_TRANSCRIPT_CACHE) - MAX_CACHED_TRANSCRIPTS]:
            _TRANSCRIPT_CACHE.pop(tid, None)


def cache_transcript(result: TranscriptResult) -> None:
    _gc_cache()
    _TRANSCRIPT_CACHE[result.transcript_id] = _CachedTranscript(
        result=result,
        expires_at=time.time() + TRANSCRIPT_CACHE_TTL_SECONDS,
    )


def get_cached_transcript(transcript_id: str) -> Optional[TranscriptResult]:
    _gc_cache()
    entry = _TRANSCRIPT_CACHE.get(transcript_id)
    return entry.result if entry else None


# ---------------------------------------------------------------------------
# 1. Validation
# ---------------------------------------------------------------------------

class AudioPipelineError(ValueError):
    """User-facing audio pipeline error. Raised during validation/preprocess."""


def _ffprobe(path: Path) -> dict[str, Any]:
    try:
        result = subprocess.run(
            [
                "ffprobe", "-v", "quiet",
                "-print_format", "json",
                "-show_streams", "-show_format",
                str(path),
            ],
            capture_output=True,
            text=True,
            check=True,
            timeout=SUBPROCESS_TIMEOUT_SECONDS,
        )
    except FileNotFoundError as exc:
        raise AudioPipelineError(
            "ffmpeg / ffprobe is not installed on the server."
        ) from exc
    except subprocess.TimeoutExpired as exc:
        raise AudioPipelineError(
            "Audio probe timed out. Please try a shorter file."
        ) from exc
    except subprocess.CalledProcessError as exc:
        raise AudioPipelineError(
            "Audio file could not be probed — the format may be corrupted or unsupported."
        ) from exc
    return json.loads(result.stdout)


def validate_audio_file(path: Path, declared_filename: Optional[str] = None) -> AudioMetadata:
    """Validate a freshly written input file. Never trust the client extension —
    always probe the actual container.
    """
    if not path.exists():
        raise AudioPipelineError("Audio file is missing or unreadable.")
    size = path.stat().st_size
    if size == 0:
        raise AudioPipelineError("The uploaded audio file is empty.")
    if size > MAX_AUDIO_BYTES:
        raise AudioPipelineError(
            f"Audio file is too large. Please use a file under {MAX_AUDIO_BYTES // (1024 * 1024)} MB."
        )

    suffix = path.suffix.lower()
    if suffix not in SUPPORTED_EXTENSIONS:
        raise AudioPipelineError(
            "Unsupported audio format. Supported: wav, mp3, m4a, ogg, flac, mp4, webm."
        )

    probe = _ffprobe(path)
    fmt = probe.get("format", {}) or {}
    duration_raw = fmt.get("duration")
    if duration_raw is None:
        raise AudioPipelineError("Could not determine audio duration.")
    duration = float(duration_raw)
    if duration <= 0.05:
        raise AudioPipelineError("Audio file is too short to transcribe.")
    if duration > MAX_AUDIO_DURATION_SECONDS:
        raise AudioPipelineError(
            f"Audio exceeds the {MAX_AUDIO_DURATION_SECONDS // 60}-minute limit. "
            "Please trim it or split into shorter parts."
        )

    audio_streams = [s for s in probe.get("streams", []) if s.get("codec_type") == "audio"]
    if not audio_streams:
        raise AudioPipelineError("No audio stream found in this file.")
    stream = audio_streams[0]

    return AudioMetadata(
        duration=duration,
        codec=str(stream.get("codec_name", "unknown")),
        sample_rate=int(stream.get("sample_rate", 0) or 0),
        channels=int(stream.get("channels", 0) or 0),
        bit_rate=str(fmt.get("bit_rate")) if fmt.get("bit_rate") else None,
        format=str(fmt.get("format_name", "unknown")),
        size_bytes=size,
        original_filename=declared_filename,
        preprocessed=False,
    )


# ---------------------------------------------------------------------------
# 2. Preprocessing — 16kHz mono WAV + EBU R128 loudness normalisation
# ---------------------------------------------------------------------------

def preprocess_audio(input_path: Path, output_path: Path) -> Path:
    """Resample to 16kHz mono PCM WAV with EBU R128 loudness normalisation.

    Critical for Whisper accuracy:
    - 16kHz: Whisper's native sample rate.
    - mono: avoids channel-dependent variance.
    - EBU R128 loudnorm: tames quiet/loud sections so VAD and decoding behave.
    - `-vn`: strip any video track ('mp4 audio' is often actually a video file).
    """
    cmd = [
        "ffmpeg", "-y",
        "-i", str(input_path),
        "-vn",
        "-acodec", "pcm_s16le",
        "-ar", "16000",
        "-ac", "1",
        "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
        str(output_path),
    ]
    try:
        subprocess.run(
            cmd,
            check=True,
            capture_output=True,
            timeout=SUBPROCESS_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired as exc:
        raise AudioPipelineError(
            "Audio preprocessing timed out. Please try a shorter file."
        ) from exc
    except subprocess.CalledProcessError as exc:
        stderr = (exc.stderr or b"").decode("utf-8", errors="replace")[:500]
        logger.warning("ffmpeg preprocess failed: %s", stderr)
        raise AudioPipelineError(
            "Audio preprocessing failed. The file may be corrupted or in an unsupported codec."
        ) from exc
    return output_path


# ---------------------------------------------------------------------------
# 3. Chunking — overlap-aware, only triggered for long audio
# ---------------------------------------------------------------------------

def chunk_audio(input_path: Path, chunk_dir: Path,
                chunk_duration: int = CHUNK_DURATION_SECONDS,
                overlap: int = CHUNK_OVERLAP_SECONDS) -> list[dict[str, Any]]:
    """Split a long preprocessed WAV into overlapping chunks. Returns
    `[{"path": Path, "start_offset": float, "index": int}]`.

    The overlap region is trimmed during assembly to prevent duplicate words
    at chunk boundaries.
    """
    probe = _ffprobe(input_path)
    total_duration = float(probe["format"]["duration"])
    if total_duration <= chunk_duration:
        return [{"path": input_path, "start_offset": 0.0, "index": 0}]

    chunk_dir.mkdir(parents=True, exist_ok=True)
    chunks: list[dict[str, Any]] = []
    start = 0.0
    chunk_index = 0
    while start < total_duration:
        end = min(start + chunk_duration + overlap, total_duration)
        out_path = chunk_dir / f"chunk_{chunk_index:04d}.wav"
        cmd = [
            "ffmpeg", "-y",
            "-i", str(input_path),
            "-ss", f"{start:.3f}",
            "-to", f"{end:.3f}",
            # Re-encode small chunks to PCM_S16LE to ensure each is a clean,
            # standalone Whisper input (copy can break wav headers when the
            # source has loudnorm filters applied).
            "-acodec", "pcm_s16le",
            "-ar", "16000",
            "-ac", "1",
            str(out_path),
        ]
        try:
            subprocess.run(
                cmd,
                check=True,
                capture_output=True,
                timeout=SUBPROCESS_TIMEOUT_SECONDS,
            )
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
            raise AudioPipelineError(
                "Audio chunking failed for a long recording. Please try a shorter clip."
            ) from exc
        chunks.append({"path": out_path, "start_offset": start, "index": chunk_index})
        start += chunk_duration
        chunk_index += 1
    return chunks


# ---------------------------------------------------------------------------
# 4. Whisper transcription
# ---------------------------------------------------------------------------

_STT_CLIENT: OpenAISpeechToText | None = None


def _stt_client() -> OpenAISpeechToText:
    global _STT_CLIENT
    if _STT_CLIENT is None:
        api_key = os.environ.get("EMERGENT_LLM_KEY")
        if not api_key:
            raise RuntimeError("EMERGENT_LLM_KEY is not configured for transcription.")
        _STT_CLIENT = OpenAISpeechToText(api_key=api_key)
    return _STT_CLIENT


def _whisper_language_hint(language: Optional[str]) -> Optional[str]:
    if not language:
        return None
    lang = language.lower().strip()
    return lang if lang in {"fi", "en", "sv", "no", "da"} else None


def _whisper_prompt(language: str) -> str:
    """Domain prompt to nudge Whisper toward the interview transcription
    register. Keep this short — long prompts hurt transcription accuracy.
    """
    if language == "fi":
        return (
            "Tämä on suomenkielinen työhaastatteluvastaus. Käytä luonnollista "
            "suomen kieltä, asiallista välimerkitystä ja täydellisiä lauseita."
        )
    return (
        "This is a job interview answer in English. Use natural sentence "
        "casing, normal punctuation and full sentences."
    )


async def _transcribe_chunk(
    audio_path: Path,
    language: Optional[str],
) -> dict[str, Any]:
    """Call Whisper on a single chunk. Returns dict with text + segments.

    `verbose_json` + `timestamp_granularities=["segment", "word"]` gives us
    everything we need: segment-level timestamps for SRT/VTT, word-level for
    accurate split points if we ever need them downstream.
    """
    client = _stt_client()
    with open(audio_path, "rb") as fh:
        try:
            response = await asyncio.wait_for(
                client.transcribe(
                    file=fh,
                    model="whisper-1",
                    response_format="verbose_json",
                    language=_whisper_language_hint(language),
                    prompt=_whisper_prompt(language or "fi"),
                    temperature=0.0,
                    timestamp_granularities=["segment", "word"],
                ),
                timeout=WHISPER_TIMEOUT_SECONDS,
            )
        except asyncio.TimeoutError as exc:
            raise AudioPipelineError(
                "Audio transcription timed out. Please try a shorter clip."
            ) from exc

    # The OpenAI/emergent SDK returns a Pydantic-like object; normalise to dict.
    if hasattr(response, "model_dump"):
        data = response.model_dump()
    elif hasattr(response, "dict"):
        data = response.dict()
    elif isinstance(response, dict):
        data = response
    else:  # last-resort, treat the whole thing as a stringified payload
        data = {"text": str(response), "segments": []}
    return data


def _segments_from_whisper(payload: dict[str, Any]) -> list[dict[str, Any]]:
    raw_segments = payload.get("segments") or []
    raw_words = payload.get("words") or []
    if raw_segments:
        return raw_segments

    # Some response shapes only include words. Reconstruct rough segments.
    if raw_words:
        return [
            {
                "start": float(w.get("start", 0)),
                "end": float(w.get("end", 0)),
                "text": str(w.get("word", "")).strip(),
                "words": [w],
            }
            for w in raw_words
        ]
    # Plain-text fallback — single segment covering the chunk.
    return [
        {
            "start": 0.0,
            "end": 0.0,
            "text": payload.get("text", "").strip(),
            "words": [],
        }
    ]


# ---------------------------------------------------------------------------
# 5. Assembly + normalisation
# ---------------------------------------------------------------------------

_NOISE_RE = re.compile(r"^[A-ZÅÄÖ0-9\s.,!?-]+$")


def _normalise_text(text: str) -> tuple[str, bool]:
    """Clean Whisper output. Returns (text, flagged_noise).

    - Collapse whitespace.
    - Flag (do NOT silently drop) all-caps blocks longer than 20 chars — those
      are usually the model spelling out music or noise. We keep them in the
      transcript wrapped with `[NOISE: ...]` so consumers can decide.
    """
    cleaned = re.sub(r"\s+", " ", text).strip()
    if len(cleaned) > 20 and cleaned == cleaned.upper() and _NOISE_RE.match(cleaned):
        return f"[NOISE: {cleaned}]", True
    return cleaned, False


def _assemble_transcript(
    chunk_payloads: list[tuple[dict[str, Any], float, int]],
    overlap_seconds: int = CHUNK_OVERLAP_SECONDS,
) -> list[TranscriptSegment]:
    merged: list[TranscriptSegment] = []
    for payload, offset, chunk_index in sorted(chunk_payloads, key=lambda t: t[1]):
        trim_start = float(overlap_seconds) / 2.0 if chunk_index > 0 else 0.0
        for seg in _segments_from_whisper(payload):
            seg_start = float(seg.get("start", 0.0)) + offset
            seg_end = float(seg.get("end", 0.0)) + offset
            if seg_end < seg_start:
                seg_end = seg_start
            # Skip the first half of the overlap region from non-leading chunks
            # to prevent duplicate words at chunk boundaries.
            if chunk_index > 0 and seg_start < offset + trim_start:
                continue
            text_value, flagged = _normalise_text(str(seg.get("text", "")))
            if not text_value:
                continue
            words = []
            for w in seg.get("words") or []:
                try:
                    words.append(WordTimestamp(
                        word=str(w.get("word", "")).strip(),
                        start=float(w.get("start", 0.0)) + offset,
                        end=float(w.get("end", 0.0)) + offset,
                    ))
                except (TypeError, ValueError):
                    continue
            confidence = seg.get("avg_logprob")
            try:
                confidence_val = float(confidence) if confidence is not None else None
            except (TypeError, ValueError):
                confidence_val = None
            merged.append(TranscriptSegment(
                index=len(merged),
                start=round(seg_start, 3),
                end=round(seg_end, 3),
                text=text_value,
                confidence=confidence_val,
                words=words,
                flagged_noise=flagged,
            ))
    # Renumber after de-duplication.
    for i, seg in enumerate(merged):
        seg.index = i
    return merged


# ---------------------------------------------------------------------------
# 6. Public entrypoint
# ---------------------------------------------------------------------------

async def transcribe_audio(
    raw_bytes: bytes,
    *,
    declared_filename: str,
    declared_content_type: Optional[str],
    language: str = "fi",
) -> TranscriptResult:
    """Run the full pipeline for a freshly uploaded audio payload.

    Steps:
    1. Write to a per-call tempdir.
    2. Validate (ffprobe, format/duration/size).
    3. Preprocess (16kHz mono WAV + EBU R128).
    4. Chunk if needed (overlap-aware).
    5. Transcribe every chunk via Whisper-1 verbose_json.
    6. Assemble + normalise.
    7. Cache result by transcript_id and return.
    """
    if declared_content_type and declared_content_type not in SUPPORTED_CONTENT_TYPES:
        raise AudioPipelineError(
            "Unsupported audio content type. Use wav, mp3, m4a, ogg, flac, mp4, or webm."
        )

    suffix = Path(declared_filename or "").suffix.lower() or ".wav"
    if suffix not in SUPPORTED_EXTENSIONS:
        raise AudioPipelineError(
            "Unsupported audio extension. Supported: wav, mp3, m4a, ogg, flac, mp4, webm."
        )
    if not raw_bytes:
        raise AudioPipelineError("The uploaded audio file is empty.")
    if len(raw_bytes) > MAX_AUDIO_BYTES:
        raise AudioPipelineError(
            f"Audio file is too large. Please use a file under {MAX_AUDIO_BYTES // (1024 * 1024)} MB."
        )

    work_dir = Path(tempfile.mkdtemp(prefix="cv-audio-"))
    try:
        input_path = work_dir / f"input{suffix}"
        input_path.write_bytes(raw_bytes)

        metadata = validate_audio_file(input_path, declared_filename=declared_filename)

        preprocessed_path = work_dir / "preprocessed.wav"
        preprocess_audio(input_path, preprocessed_path)
        metadata.preprocessed = True

        chunk_dir = work_dir / "chunks"
        chunks = chunk_audio(preprocessed_path, chunk_dir)

        chunk_payloads: list[tuple[dict[str, Any], float, int]] = []
        for chunk in chunks:
            payload = await _transcribe_chunk(Path(chunk["path"]), language=language)
            chunk_payloads.append((payload, float(chunk["start_offset"]), int(chunk["index"])))

        segments = _assemble_transcript(chunk_payloads)
        full_text = " ".join(seg.text for seg in segments).strip()
        total_duration = max(
            (seg.end for seg in segments),
            default=metadata.duration,
        )

        result = TranscriptResult(
            transcript_id=str(uuid.uuid4()),
            language=language or "fi",
            metadata=metadata,
            segments=segments,
            full_text=full_text,
            speakers=[],
            total_duration=round(float(total_duration), 3),
            chunk_count=len(chunks),
            created_at=datetime.now(timezone.utc).isoformat(),
        )
        cache_transcript(result)
        return result
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


# ---------------------------------------------------------------------------
# 7. Export formats
# ---------------------------------------------------------------------------

def _format_srt_timestamp(seconds: float) -> str:
    if seconds < 0:
        seconds = 0
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int(round((seconds - int(seconds)) * 1000))
    if ms == 1000:
        ms = 0
        s += 1
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def _format_vtt_timestamp(seconds: float) -> str:
    if seconds < 0:
        seconds = 0
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int(round((seconds - int(seconds)) * 1000))
    if ms == 1000:
        ms = 0
        s += 1
    return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"


def _wrap_subtitle_lines(text: str, max_chars: int = MAX_SUBTITLE_LINE_CHARS) -> str:
    """Wrap a subtitle line to a max width by greedy word-splitting."""
    words = text.split()
    if not words:
        return ""
    lines: list[str] = []
    current = words[0]
    for word in words[1:]:
        if len(current) + 1 + len(word) <= max_chars:
            current = f"{current} {word}"
        else:
            lines.append(current)
            current = word
    lines.append(current)
    # Cap at 2 lines to comply with broadcast subtitle conventions.
    if len(lines) > 2:
        joined = " ".join(lines)
        # Best-effort: split as evenly as possible into 2 lines.
        midpoint = len(joined) // 2
        space_after = joined.find(" ", midpoint)
        if space_after == -1:
            return joined
        lines = [joined[:space_after].strip(), joined[space_after + 1:].strip()]
    return "\n".join(lines)


def export_srt(result: TranscriptResult) -> str:
    blocks: list[str] = []
    for seg in result.segments:
        speaker_prefix = f"[{seg.speaker}] " if seg.speaker else ""
        body = _wrap_subtitle_lines(f"{speaker_prefix}{seg.text}")
        blocks.append(
            f"{seg.index + 1}\n"
            f"{_format_srt_timestamp(seg.start)} --> {_format_srt_timestamp(seg.end)}\n"
            f"{body}\n"
        )
    return "\n".join(blocks).strip() + "\n"


def export_vtt(result: TranscriptResult) -> str:
    blocks = ["WEBVTT", ""]
    for seg in result.segments:
        speaker_prefix = f"<v {seg.speaker}>" if seg.speaker else ""
        body = _wrap_subtitle_lines(f"{speaker_prefix}{seg.text}")
        blocks.append(
            f"{_format_vtt_timestamp(seg.start)} --> {_format_vtt_timestamp(seg.end)}\n"
            f"{body}\n"
        )
    return "\n".join(blocks).strip() + "\n"


def export_markdown(result: TranscriptResult) -> str:
    lines = [
        f"# Transcript {result.transcript_id}",
        "",
        f"- Language: `{result.language}`",
        f"- Model: `{result.model}`",
        f"- Duration: `{result.total_duration:.2f}s`",
        f"- Chunks: `{result.chunk_count}`",
        f"- Created: `{result.created_at}`",
        "",
        "## Full text",
        "",
        result.full_text or "(empty)",
        "",
        "## Segments",
        "",
    ]
    for seg in result.segments:
        ts = f"`[{seg.start:.2f}s - {seg.end:.2f}s]`"
        speaker = f" **{seg.speaker}**" if seg.speaker else ""
        flag = " _(noise)_" if seg.flagged_noise else ""
        lines.append(f"- {ts}{speaker}{flag}: {seg.text}")
    lines.append("")
    return "\n".join(lines)


def export_plain_text(result: TranscriptResult) -> str:
    return result.full_text + ("\n" if result.full_text and not result.full_text.endswith("\n") else "")


def export_json(result: TranscriptResult) -> str:
    return json.dumps(result.model_dump(), ensure_ascii=False, indent=2)


__all__ = [
    "AudioPipelineError",
    "MAX_AUDIO_BYTES",
    "MAX_AUDIO_DURATION_SECONDS",
    "SUPPORTED_EXTENSIONS",
    "SUPPORTED_CONTENT_TYPES",
    "transcribe_audio",
    "validate_audio_file",
    "preprocess_audio",
    "chunk_audio",
    "get_cached_transcript",
    "cache_transcript",
    "export_srt",
    "export_vtt",
    "export_markdown",
    "export_plain_text",
    "export_json",
]
