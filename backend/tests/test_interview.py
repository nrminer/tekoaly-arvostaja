"""Unit tests for the Mock Interview Simulator backend.

Focus:
- /api/interview/start requires captcha when configured, rejects video mode without consent.
- /api/interview/{session_id} DELETE clears the in-memory session.
- interview_service session TTL + GC.
- TTS input validation + non-existent session guard.

We DO NOT hit the live LLM or OpenAI TTS here — those are covered by the
testing-agent end-to-end pass. These tests lock down our own code paths.
"""

from __future__ import annotations

import sys
import time
import random
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# Make backend importable when pytest runs from /app
BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from server import app  # noqa: E402
import interview_service  # noqa: E402

client = TestClient(app)


def test_interview_start_requires_captcha_when_configured():
    """If Turnstile is configured, /start with a bad token MUST return 403.

    We set an explicit invalid token so the test is deterministic regardless of
    whether TURNSTILE_SECRET_KEY is present in the local env (Cloudflare's
    sandbox always-fail token `2x0000000000000000000000ab` is accepted by the
    real siteverify endpoint only when paired with the matching sandbox secret
    — with our real secret, it is rejected as invalid-input-response).
    """
    import os as _os

    from security_turnstile import is_configured

    r = client.post(
        "/api/interview/start",
        json={
            "language": "fi",
            "mode": "chat",
            "cv_summary": "x" * 200,
            "turnstile_token": "2x0000000000000000000000ab",
        },
    )
    if is_configured() and _os.environ.get("TURNSTILE_SECRET_KEY"):
        # With a real Cloudflare secret + sandbox fail token, siteverify
        # returns success=false → our handler returns 403.
        assert r.status_code in (403, 429), r.text
    else:
        # Without configured secret, captcha is skipped and the LLM runs.
        assert r.status_code in (200, 429, 502, 503), r.text


def test_interview_start_video_without_consent_returns_400():
    """Video mode MUST be gated behind explicit consent, even before captcha."""
    r = client.post(
        "/api/interview/start",
        json={
            "language": "fi",
            "mode": "video",
            "consent_video": False,
            "cv_summary": "x" * 200,
        },
    )
    assert r.status_code == 400, r.text
    assert "consent" in r.text.lower() or "suostumus" in r.text.lower()


def test_interview_turn_unknown_session_is_404():
    r = client.post(
        "/api/interview/turn",
        json={"session_id": "does-not-exist", "user_answer": "hi"},
    )
    assert r.status_code == 404, r.text


def test_interview_finish_unknown_session_is_404():
    r = client.post(
        "/api/interview/finish",
        json={"session_id": "does-not-exist", "user_answer": ""},
    )
    assert r.status_code == 404, r.text


def test_interview_tts_missing_session_is_404():
    r = client.post(
        "/api/interview/tts",
        json={"session_id": "no-such-session", "text": "hei"},
    )
    assert r.status_code == 404, r.text


def test_interview_tts_empty_text_validation_error():
    """TTS endpoint must validate empty text payloads (Pydantic min_length=1)."""
    r = client.post(
        "/api/interview/tts",
        json={"session_id": "any-session", "text": ""},
    )
    assert r.status_code == 422, r.text


def test_interview_delete_is_idempotent():
    r = client.delete("/api/interview/does-not-exist")
    assert r.status_code == 200
    assert r.json() == {"deleted": False}


def test_interview_session_gc_purges_expired(monkeypatch):
    """Sessions older than SESSION_TTL_SECONDS must be GC'd on the next start."""
    # Inject a fake expired session directly into the module registry.
    from interview_models import InterviewTarget

    fake_id = "fake-expired"
    interview_service._SESSIONS[fake_id] = interview_service.InterviewSession(
        id=fake_id,
        language="fi",
        mode="chat",
        target=InterviewTarget(),
        cv_summary="x",
        chat=None,  # type: ignore[arg-type]
        created_at=time.time() - 2 * interview_service.SESSION_TTL_SECONDS,
        last_activity=time.time() - 2 * interview_service.SESSION_TTL_SECONDS,
    )
    assert fake_id in interview_service._SESSIONS
    interview_service._gc_sessions()
    assert fake_id not in interview_service._SESSIONS


def test_synthesize_speech_rejects_empty_text():
    """Empty/whitespace text MUST raise ValueError before any OpenAI call."""
    import asyncio

    with pytest.raises(ValueError):
        asyncio.run(interview_service.synthesize_speech("   "))


def test_interview_models_strict_contract():
    """end_session_summary must be non-null when is_final is True."""
    from interview_models import EndSessionSummary, InterviewTurn

    ok = InterviewTurn(
        next_prompt="Hei.",
        question_type="opening",
        is_final=False,
    )
    assert ok.end_session_summary is None

    finalized = InterviewTurn(
        next_prompt="Kiitos haastattelusta.",
        question_type="closing",
        is_final=True,
        end_session_summary=EndSessionSummary(
            overall_score=7,
            headline="Hyvä kokonaisuus, parannettavaa STAR-rakenteessa.",
            strengths=["selkeä viestintä"],
            improvements=["mitattavat tulokset"],
        ),
    )
    assert finalized.end_session_summary is not None
    assert finalized.end_session_summary.overall_score == 7


def test_interview_models_coerce_fractional_score():
    """LLMs sometimes emit `overall_score: 6.5` — must be rounded to int."""
    from interview_models import EndSessionSummary

    for raw, expected in [(6.5, 7), (6.4, 6), (0, 0), (10.0, 10), (11, 10), (-3, 0), ("8", 8)]:
        s = EndSessionSummary(overall_score=raw, headline="x")
        assert s.overall_score == expected, f"{raw} → {s.overall_score} (expected {expected})"


def test_interview_models_coerce_null_lists():
    """LLMs sometimes emit `probes: null`, `strengths: null` — must coerce to []."""
    from interview_models import EndSessionSummary, InterviewTurn

    turn = InterviewTurn(next_prompt="q", probes=None, question_type="opening")
    assert turn.probes == []

    summary = EndSessionSummary(
        overall_score=5,
        headline="ok",
        strengths=None,
        improvements=None,
        next_steps=None,
    )
    assert summary.strengths == []
    assert summary.improvements == []
    assert summary.next_steps == []


def test_interview_models_coerce_question_type_aliases():
    from interview_models import InterviewTurn

    for raw, expected in [
        ("Behavioural", "behavioral"),
        ("TECH", "technical"),
        ("start", "opening"),
        ("close", "closing"),
        (None, "opening"),
    ]:
        t = InterviewTurn(next_prompt="x", question_type=raw)
        assert t.question_type == expected, f"{raw} → {t.question_type}"


def test_interview_rotation_profiles_vary_questions_and_focus():
    """New sessions should receive varied focus profiles and question plans."""
    rotations = [
        interview_service._choose_interview_rotation("fi", rng=random.Random(seed))
        for seed in range(12)
    ]

    rotation_ids = {rotation["id"] for rotation in rotations}
    question_plans = {tuple(rotation["question_plan"]) for rotation in rotations}

    assert len(rotation_ids) > 1
    assert len(question_plans) > 1
    for rotation in rotations:
        assert rotation["focus"]
        assert rotation["opening"]
        assert rotation["probe_focuses"]
        assert set(rotation["question_plan"]).issubset({"behavioral", "technical"})


def test_interview_system_prompt_contains_rotation_guidance():
    from interview_models import InterviewTarget

    rotation = interview_service._choose_interview_rotation("fi", rng=random.Random(3))
    prompt = interview_service._system_message(
        language="fi",
        target=InterviewTarget(job_title="Myyntipäällikkö"),
        cv_summary="Hakijalla on viiden vuoden kokemus B2B-myynnistä.",
        rotation=rotation,
    )

    assert rotation["focus"] in prompt
    assert rotation["opening"] in prompt
    assert "Älä käytä samaa aloituskysymystä" in prompt


def test_interview_model_fallback_order_is_newest_first():
    assert interview_service.LLM_MODELS_IN_ORDER == [
        "claude-opus-4-7",
        "claude-sonnet-4-6",
        "claude-haiku-4-5-20251001",
    ]
