"""Regression tests for interview question rotation orchestration logic.

Focus:
- Session rotation profile and plan consistency.
- System prompt includes rotation guidance + CV personalization context.
- Next turn guidance enforces variety (planned type/focus + anti-repeat instruction).
"""

from __future__ import annotations

import asyncio
import random
import sys
from collections import Counter
from pathlib import Path

import interview_service
import pytest

# Make backend importable when pytest runs from /app
BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from interview_models import InterviewTarget, InterviewTurn  # noqa: E402
import cv_service  # noqa: E402


def test_choose_rotation_keeps_profile_order_multiset_and_probe_count():
    """Chosen session plan/probes should match the selected profile's source items."""
    profile_by_id = {p["id"]: p for p in interview_service._INTERVIEW_ROTATION_PROFILES}

    for seed in range(20):
        rotation = interview_service._choose_interview_rotation("fi", rng=random.Random(seed))
        src = profile_by_id[rotation["id"]]

        assert Counter(rotation["question_plan"]) == Counter(src["order"])
        assert Counter(rotation["probe_focuses"]) == Counter(src["probes_fi"])
        assert len(rotation["question_plan"]) == len(src["order"])
        assert len(rotation["probe_focuses"]) == len(src["probes_fi"])


def test_system_prompt_contains_rotation_and_cv_personalization_context():
    """System prompt should keep rotation guidance and user context placeholders."""
    target = InterviewTarget(
        job_title="Data Engineer",
        industry="SaaS",
        seniority="Senior",
        market="Finland",
        job_description="Build data pipelines for customer analytics.",
        focus_areas=["SQL", "stakeholder communication"],
    )
    rotation = interview_service._choose_interview_rotation("en", rng=random.Random(7))
    cv_summary = "8 years building ETL systems and mentoring teams."

    prompt = interview_service._system_message(
        language="en",
        target=target,
        cv_summary=cv_summary,
        rotation=rotation,
    )

    assert rotation["focus"] in prompt
    assert rotation["opening"] in prompt
    assert "Do not use the same opening question in every interview" in prompt
    assert "Do not ask two consecutive questions about the same topic" in prompt
    assert "Data Engineer" in prompt
    assert "SaaS" in prompt
    assert "SQL; stakeholder communication" in prompt
    assert cv_summary in prompt


def test_answer_turn_guidance_uses_planned_type_probe_focus_and_anti_repeat(monkeypatch):
    """answer_turn should instruct model to rotate type/focus and avoid repetition."""
    captured: dict[str, str] = {}

    async def fake_send_and_parse(_session, user_text: str) -> InterviewTurn:
        captured["user_text"] = user_text
        return InterviewTurn(next_prompt="Next", question_type="technical", is_final=False)

    monkeypatch.setattr(interview_service, "_send_and_parse", fake_send_and_parse)

    sid = "rotation-guidance-session"
    interview_service._SESSIONS[sid] = interview_service.InterviewSession(
        id=sid,
        language="en",
        mode="chat",
        target=InterviewTarget(job_title="Backend Developer"),
        cv_summary="Python and FastAPI projects",
        chat=None,  # type: ignore[arg-type]
        turn_count=0,
        question_types=["behavioral"],
        rotation_id="impact_metrics",
        rotation_focus="business impact",
        question_plan=["behavioral", "technical", "behavioral"],
        probe_focuses=["numbers and metrics", "role ownership"],
    )

    try:
        turn = asyncio.run(interview_service.answer_turn(sid, "I improved delivery speed."))
        assert turn.question_type == "technical"

        guidance = captured["user_text"]
        assert 'aim next `question_type` toward "technical"' in guidance
        assert "numbers and metrics" in guidance
        assert "Do not repeat the same question wording or the same topic" in guidance
        assert "Keep personalising the question from the CV summary and target role" in guidance
    finally:
        interview_service._SESSIONS.pop(sid, None)


def test_answer_turn_finalizes_when_session_hits_hard_cap(monkeypatch):
    """When near MAX_TURNS_PER_SESSION, answer_turn must force finalization guidance."""
    captured: dict[str, str] = {}

    async def fake_send_and_parse(_session, user_text: str) -> InterviewTurn:
        captured["user_text"] = user_text
        return InterviewTurn(next_prompt="Thanks", question_type="closing", is_final=True)

    monkeypatch.setattr(interview_service, "_send_and_parse", fake_send_and_parse)

    sid = "rotation-finalize-session"
    interview_service._SESSIONS[sid] = interview_service.InterviewSession(
        id=sid,
        language="en",
        mode="chat",
        target=InterviewTarget(),
        cv_summary="x",
        chat=None,  # type: ignore[arg-type]
        turn_count=interview_service.MAX_TURNS_PER_SESSION - 1,
        question_types=["behavioral"],
        rotation_id="impact_metrics",
        rotation_focus="business impact",
        question_plan=["behavioral", "technical"],
        probe_focuses=["numbers and metrics"],
    )

    try:
        turn = asyncio.run(interview_service.answer_turn(sid, "Final answer"))
        assert turn.is_final is True
        assert "This was the final answer" in captured["user_text"]
        assert "populate `end_session_summary` now" in captured["user_text"]
    finally:
        interview_service._SESSIONS.pop(sid, None)


def test_start_session_falls_back_through_models(monkeypatch):
    """Session startup should try newer model labels first, then keep the working chat."""
    attempts: list[str] = []

    class FakeChat:
        def __init__(self, model_name: str):
            self.model_name = model_name

    def fake_build_chat(*, api_key: str, session_id: str, system_message: str, model_name: str):
        assert api_key == "test-key"
        assert session_id
        assert system_message
        attempts.append(model_name)
        return FakeChat(model_name)

    async def fake_send_and_parse(session, _user_text: str) -> InterviewTurn:
        if session.chat.model_name != "claude-haiku-4-5-20251001":
            raise RuntimeError("model unavailable")
        return InterviewTurn(next_prompt="Hei", question_type="opening", is_final=False)

    monkeypatch.setenv("EMERGENT_LLM_KEY", "test-key")
    monkeypatch.setattr(interview_service, "_build_chat", fake_build_chat)
    monkeypatch.setattr(interview_service, "_send_and_parse", fake_send_and_parse)

    session, first_turn = asyncio.run(
        interview_service.start_session(
            language="fi",
            mode="chat",
            target=InterviewTarget(job_title="Developer"),
            cv_summary="Kokenut kehittäjä.",
            consent_video=False,
        )
    )

    try:
        assert attempts == interview_service.LLM_MODELS_IN_ORDER
        assert session.chat.model_name == "claude-haiku-4-5-20251001"
        assert first_turn.next_prompt == "Hei"
    finally:
        interview_service.end_session(session.id)


def test_cv_review_model_fallback_order_is_newest_first():
    assert cv_service.MODELS_IN_ORDER == [
        "claude-opus-4-7",
        "claude-sonnet-4-6",
        "claude-haiku-4-5-20251001",
    ]
