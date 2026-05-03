"""Tests for the Voice AI audio transcription pipeline.

These tests exercise validation, preprocessing, chunking, normalisation and
export logic without calling the live Whisper API. The pipeline's public
`transcribe_audio` entrypoint is exercised end-to-end via the running backend
in a separate integration test (see /api/interview/transcribe smoke).
"""

from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path

import pytest

from audio_models import TranscriptResult, TranscriptSegment, AudioMetadata
from audio_pipeline import (
    AudioPipelineError,
    _assemble_transcript,
    _normalise_text,
    cache_transcript,
    chunk_audio,
    export_markdown,
    export_plain_text,
    export_srt,
    export_vtt,
    get_cached_transcript,
    preprocess_audio,
    validate_audio_file,
)

FFMPEG = shutil.which("ffmpeg")


def _make_sine_wav(path: Path, duration: int = 3, freq: int = 440) -> None:
    if FFMPEG is None:
        pytest.skip("ffmpeg not installed")
    subprocess.run(
        [
            FFMPEG, "-y",
            "-f", "lavfi",
            "-i", f"sine=frequency={freq}:duration={duration}",
            "-ar", "16000",
            "-ac", "1",
            str(path),
        ],
        check=True,
        capture_output=True,
    )


def test_validate_rejects_unsupported_extension(tmp_path: Path):
    f = tmp_path / "file.bin"
    f.write_bytes(b"\x00\x01\x02")
    with pytest.raises(AudioPipelineError):
        validate_audio_file(f, declared_filename="file.bin")


def test_validate_rejects_empty(tmp_path: Path):
    f = tmp_path / "empty.wav"
    f.write_bytes(b"")
    with pytest.raises(AudioPipelineError):
        validate_audio_file(f, declared_filename="empty.wav")


def test_validate_accepts_valid_wav(tmp_path: Path):
    src = tmp_path / "valid.wav"
    _make_sine_wav(src, duration=2)
    meta = validate_audio_file(src, declared_filename="valid.wav")
    assert meta.duration == pytest.approx(2.0, rel=0.05)
    assert meta.channels == 1
    assert meta.sample_rate == 16000


def test_preprocess_creates_16k_mono(tmp_path: Path):
    src = tmp_path / "in.wav"
    out = tmp_path / "out.wav"
    _make_sine_wav(src, duration=2)
    preprocess_audio(src, out)
    meta = validate_audio_file(out, declared_filename="out.wav")
    assert meta.sample_rate == 16000
    assert meta.channels == 1


def test_chunk_audio_no_chunking_needed(tmp_path: Path):
    src = tmp_path / "short.wav"
    _make_sine_wav(src, duration=2)
    chunks = chunk_audio(src, tmp_path / "chunks")
    assert len(chunks) == 1
    assert chunks[0]["start_offset"] == 0.0


def test_chunk_audio_splits_long_recording(tmp_path: Path):
    src = tmp_path / "long.wav"
    # Make a 20-second sine, then chunk with a tiny chunk_duration of 5s + 1s overlap.
    _make_sine_wav(src, duration=20)
    chunks = chunk_audio(src, tmp_path / "chunks", chunk_duration=5, overlap=1)
    assert len(chunks) >= 3
    assert chunks[0]["index"] == 0
    assert chunks[-1]["index"] == len(chunks) - 1


def test_normalise_text_collapses_whitespace():
    text, flagged = _normalise_text("  hello   world  ")
    assert text == "hello world"
    assert flagged is False


def test_normalise_text_flags_all_caps_noise():
    text, flagged = _normalise_text("THIS IS A LONG ALL CAPS NOISE BLOCK!")
    assert flagged is True
    assert text.startswith("[NOISE:")


def test_assemble_transcript_drops_overlap(tmp_path: Path):
    payloads = [
        ({"segments": [{"start": 0.0, "end": 5.0, "text": "first"}]}, 0.0, 0),
        # offset 5.0, segment at relative 0..2 ⇒ absolute 5..7. Trim half of overlap (1s).
        ({"segments": [{"start": 0.0, "end": 2.0, "text": "early-overlap"}]}, 5.0, 1),
        # this one starts at 0.6s relative ⇒ absolute 5.6 — past trim_start=0.5, keep.
        ({"segments": [{"start": 0.6, "end": 2.0, "text": "kept"}]}, 5.0, 1),
    ]
    segs = _assemble_transcript(payloads, overlap_seconds=1)
    texts = [s.text for s in segs]
    # Whichever survives, "first" must be present and at least one of the second
    # chunk's segments. The overlap-trim should have removed "early-overlap" but
    # kept "kept".
    assert "first" in texts
    assert "kept" in texts
    assert "early-overlap" not in texts


def _result_with_segments() -> TranscriptResult:
    return TranscriptResult(
        transcript_id="test-id",
        language="en",
        metadata=AudioMetadata(
            duration=4.0,
            codec="pcm_s16le",
            sample_rate=16000,
            channels=1,
            bit_rate="256000",
            format="wav",
            size_bytes=128_000,
        ),
        segments=[
            TranscriptSegment(index=0, start=0.0, end=2.0, text="Hello world."),
            TranscriptSegment(index=1, start=2.0, end=4.0, text="This is a test."),
        ],
        full_text="Hello world. This is a test.",
        total_duration=4.0,
        chunk_count=1,
        created_at="2026-01-01T00:00:00+00:00",
    )


def test_export_srt_produces_valid_blocks():
    srt = export_srt(_result_with_segments())
    assert "1\n00:00:00,000 --> 00:00:02,000" in srt
    assert "2\n00:00:02,000 --> 00:00:04,000" in srt
    assert "Hello world." in srt


def test_export_vtt_starts_with_header():
    vtt = export_vtt(_result_with_segments())
    assert vtt.startswith("WEBVTT")
    assert "00:00:00.000 --> 00:00:02.000" in vtt


def test_export_plain_text_returns_full_text():
    txt = export_plain_text(_result_with_segments())
    assert txt.strip() == "Hello world. This is a test."


def test_export_markdown_includes_metadata_and_segments():
    md = export_markdown(_result_with_segments())
    assert "# Transcript test-id" in md
    assert "Hello world." in md
    assert "This is a test." in md
    assert "Language: `en`" in md


def test_cache_roundtrip_returns_same_result():
    res = _result_with_segments()
    cache_transcript(res)
    fetched = get_cached_transcript(res.transcript_id)
    assert fetched is not None
    assert fetched.transcript_id == res.transcript_id
    assert fetched.full_text == res.full_text
