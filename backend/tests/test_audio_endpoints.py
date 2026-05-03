"""End-to-end backend tests for the Voice AI audio transcription pipeline.

Covers:
- /api/health regression (still returns 200 + service info)
- POST /api/interview/transcribe: success (wav/mp3/webm/m4a/flac),
  language hints (fi/en), session_id checks, anonymous use, invalid file type,
  empty file, oversized file.
- GET /api/audio/transcript/{id}/{fmt}: all formats + 400 / 404 branches.
- Privacy: /tmp has no residual cv-audio-* tempdirs after a call.
- Regression: /api/options, /api/review, /api/interview/start,
  /api/interview/turn, /api/interview/finish, /api/interview/extract-cv still respond.

Tests generate tiny (~1-2s, 16kHz mono) audio clips on the fly with ffmpeg.
"""

from __future__ import annotations

import io
import os
import subprocess
import sys
from pathlib import Path

import pytest
import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://aeb37a78-516b-4caa-9950-4ef655b9346d.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"

TIMEOUT = 90  # Whisper calls can take a few seconds


# --------------------------------------------------------------------------- #
# Fixtures: synthesise tiny audio test clips of different formats
# --------------------------------------------------------------------------- #

def _ffmpeg_make(ext: str, duration: float = 2.0, extra_args: list[str] | None = None) -> bytes:
    """Generate a tiny speech-like clip in the requested container."""
    out_path = Path(f"/tmp/audio_test_{ext}.{ext}")
    cmd = [
        "ffmpeg", "-y",
        "-f", "lavfi",
        "-i", f"sine=frequency=440:duration={duration}",
        "-ar", "16000",
        "-ac", "1",
    ]
    if extra_args:
        cmd.extend(extra_args)
    cmd.append(str(out_path))
    result = subprocess.run(cmd, capture_output=True, timeout=30)
    if result.returncode != 0:
        pytest.skip(f"ffmpeg failed to generate .{ext}: {result.stderr.decode()[:200]}")
    data = out_path.read_bytes()
    out_path.unlink(missing_ok=True)
    return data


@pytest.fixture(scope="session")
def wav_bytes() -> bytes:
    return _ffmpeg_make("wav")


@pytest.fixture(scope="session")
def mp3_bytes() -> bytes:
    return _ffmpeg_make("mp3", extra_args=["-codec:a", "libmp3lame", "-b:a", "64k"])


@pytest.fixture(scope="session")
def webm_bytes() -> bytes:
    return _ffmpeg_make("webm", extra_args=["-codec:a", "libopus", "-b:a", "32k"])


@pytest.fixture(scope="session")
def m4a_bytes() -> bytes:
    return _ffmpeg_make("m4a", extra_args=["-codec:a", "aac", "-b:a", "64k"])


@pytest.fixture(scope="session")
def flac_bytes() -> bytes:
    return _ffmpeg_make("flac", extra_args=["-codec:a", "flac"])


@pytest.fixture
def session() -> requests.Session:
    s = requests.Session()
    return s


# --------------------------------------------------------------------------- #
# Health + options regression
# --------------------------------------------------------------------------- #

class TestHealth:
    def test_health_ok(self, session):
        r = session.get(f"{API}/health", timeout=TIMEOUT)
        assert r.status_code == 200
        body = r.json()
        # Health should include at least a status / service indicator
        assert isinstance(body, dict)
        assert any(k in body for k in ("status", "ok", "service", "message"))

    def test_options_ok(self, session):
        r = session.get(f"{API}/options", timeout=TIMEOUT)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, dict)


# --------------------------------------------------------------------------- #
# Transcription — success paths
# --------------------------------------------------------------------------- #

def _post_transcribe(session, filename: str, content: bytes,
                     content_type: str, language: str | None = None,
                     session_id: str | None = None):
    data = {}
    if language is not None:
        data["language"] = language
    if session_id is not None:
        data["session_id"] = session_id
    files = {"file": (filename, io.BytesIO(content), content_type)}
    return session.post(f"{API}/interview/transcribe",
                        data=data, files=files, timeout=TIMEOUT)


class TestTranscribeSuccess:
    _transcript_id: str | None = None  # cached for export tests

    def test_wav_success_anonymous(self, session, wav_bytes, request):
        r = _post_transcribe(session, "sample.wav", wav_bytes, "audio/wav",
                             language="en")
        assert r.status_code == 200, r.text
        body = r.json()
        assert "transcript_id" in body and isinstance(body["transcript_id"], str)
        assert "segments" in body and isinstance(body["segments"], list)
        assert "text" in body  # full text key — the endpoint returns `text`
        assert "total_duration" in body
        assert "chunk_count" in body and body["chunk_count"] >= 1
        assert "available_formats" in body
        assert set(["json", "txt", "md", "srt", "vtt"]).issubset(set(body["available_formats"]))
        # Cache for downstream export tests
        request.config.cache.set("transcript_id", body["transcript_id"])

    def test_language_fi_hint(self, session, wav_bytes):
        r = _post_transcribe(session, "sample.wav", wav_bytes, "audio/wav",
                             language="fi")
        assert r.status_code == 200, r.text
        assert r.json()["language"] == "fi"

    def test_mp3_success(self, session, mp3_bytes):
        r = _post_transcribe(session, "sample.mp3", mp3_bytes, "audio/mpeg",
                             language="en")
        assert r.status_code == 200, r.text

    def test_webm_success(self, session, webm_bytes):
        r = _post_transcribe(session, "sample.webm", webm_bytes, "audio/webm",
                             language="en")
        assert r.status_code == 200, r.text

    def test_m4a_success(self, session, m4a_bytes):
        r = _post_transcribe(session, "sample.m4a", m4a_bytes, "audio/mp4",
                             language="en")
        assert r.status_code == 200, r.text

    def test_flac_success(self, session, flac_bytes):
        r = _post_transcribe(session, "sample.flac", flac_bytes, "audio/flac",
                             language="en")
        assert r.status_code == 200, r.text


# --------------------------------------------------------------------------- #
# Transcription — validation / negative paths
# --------------------------------------------------------------------------- #

class TestTranscribeValidation:
    def test_rejects_non_audio_txt(self, session):
        files = {"file": ("notes.txt", io.BytesIO(b"hello this is not audio"),
                          "text/plain")}
        r = session.post(f"{API}/interview/transcribe",
                         data={"language": "en"}, files=files, timeout=TIMEOUT)
        assert r.status_code == 400, r.text
        assert "detail" in r.json()

    def test_rejects_empty_file(self, session):
        files = {"file": ("empty.wav", io.BytesIO(b""), "audio/wav")}
        r = session.post(f"{API}/interview/transcribe",
                         data={"language": "en"}, files=files, timeout=TIMEOUT)
        assert r.status_code == 400, r.text
        body = r.json()
        assert "empty" in (body.get("detail") or "").lower()

    def test_rejects_oversized(self, session):
        # 51 MB dummy payload — should be rejected by 413 or body-size middleware.
        big = b"\x00" * (51 * 1024 * 1024)
        files = {"file": ("big.wav", io.BytesIO(big), "audio/wav")}
        try:
            r = session.post(f"{API}/interview/transcribe",
                             data={"language": "en"},
                             files=files, timeout=TIMEOUT)
        except requests.exceptions.RequestException as exc:
            pytest.skip(f"Oversized upload rejected at transport layer: {exc}")
            return
        assert r.status_code in (400, 413, 422), r.text

    def test_unknown_session_id_returns_404(self, session, wav_bytes):
        r = _post_transcribe(session, "sample.wav", wav_bytes, "audio/wav",
                             language="en",
                             session_id="sess_does_not_exist_xyz_123")
        assert r.status_code == 404, r.text


# --------------------------------------------------------------------------- #
# Transcript export formats
# --------------------------------------------------------------------------- #

class TestTranscriptExports:
    def _tid(self, request) -> str:
        tid = request.config.cache.get("transcript_id", None)
        if not tid:
            pytest.skip("No transcript_id cached — upstream test must run first.")
        return tid

    def test_srt_download(self, session, request):
        tid = self._tid(request)
        r = session.get(f"{API}/audio/transcript/{tid}/srt", timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        assert "attachment" in (r.headers.get("content-disposition", "").lower())
        # SRT bodies either have index-lines + --> timestamps, or are effectively empty
        # for silent clips. Accept either but require SRT-ish content-type.
        assert "subrip" in r.headers.get("content-type", "").lower() \
            or r.headers.get("content-type", "").startswith("application/x-subrip")

    def test_vtt_download(self, session, request):
        tid = self._tid(request)
        r = session.get(f"{API}/audio/transcript/{tid}/vtt", timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        assert r.text.startswith("WEBVTT")
        assert "attachment" in (r.headers.get("content-disposition", "").lower())

    def test_md_download(self, session, request):
        tid = self._tid(request)
        r = session.get(f"{API}/audio/transcript/{tid}/md", timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        assert r.text.lstrip().startswith("# Transcript")

    def test_txt_download(self, session, request):
        tid = self._tid(request)
        r = session.get(f"{API}/audio/transcript/{tid}/txt", timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type", "").startswith("text/plain")

    def test_json_download(self, session, request):
        tid = self._tid(request)
        r = session.get(f"{API}/audio/transcript/{tid}/json", timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("schema_version") == "1.0"
        assert "metadata" in body
        assert "segments" in body and isinstance(body["segments"], list)
        assert body.get("transcript_id") == tid

    def test_invalid_format_400(self, session, request):
        tid = self._tid(request)
        r = session.get(f"{API}/audio/transcript/{tid}/xml", timeout=TIMEOUT)
        assert r.status_code == 400

    def test_missing_transcript_404(self, session):
        r = session.get(f"{API}/audio/transcript/nonexistent_xyz/srt", timeout=TIMEOUT)
        assert r.status_code == 404


# --------------------------------------------------------------------------- #
# Privacy: /tmp has no residual cv-audio-* dirs after calls
# --------------------------------------------------------------------------- #

class TestPrivacy:
    def test_no_residual_tempdirs(self, session, wav_bytes):
        # Snapshot before
        before = set(p.name for p in Path("/tmp").glob("cv-audio-*"))
        r = _post_transcribe(session, "sample.wav", wav_bytes, "audio/wav",
                             language="en")
        assert r.status_code == 200, r.text
        after = set(p.name for p in Path("/tmp").glob("cv-audio-*"))
        # The pipeline lives on the server side; but since preview URL routes
        # to the same container, /tmp should be clean (no NEW tempdirs remain).
        new_dirs = after - before
        assert not new_dirs, f"Residual tempdirs after transcribe: {new_dirs}"


# --------------------------------------------------------------------------- #
# Regression: core non-audio endpoints still respond
# --------------------------------------------------------------------------- #

class TestRegression:
    def test_review_endpoint_reachable(self, session):
        # We don't run a full review (it hits an LLM). Just post a minimal body
        # and assert the endpoint responds with a sane status code (not 5xx on
        # validation) — 400/422/200 are all acceptable signs of liveness.
        r = session.post(f"{API}/review", json={}, timeout=TIMEOUT)
        assert r.status_code < 500, r.text

    def test_interview_start_reachable(self, session):
        r = session.post(f"{API}/interview/start", json={}, timeout=TIMEOUT)
        assert r.status_code < 500, r.text

    def test_interview_turn_reachable(self, session):
        r = session.post(f"{API}/interview/turn", json={}, timeout=TIMEOUT)
        assert r.status_code < 500, r.text

    def test_interview_finish_reachable(self, session):
        r = session.post(f"{API}/interview/finish", json={}, timeout=TIMEOUT)
        assert r.status_code < 500, r.text

    def test_interview_extract_cv_reachable(self, session):
        # POST with no file — expect 4xx validation, not 5xx
        r = session.post(f"{API}/interview/extract-cv", timeout=TIMEOUT)
        assert r.status_code < 500, r.text
