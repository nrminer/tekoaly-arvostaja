"""Regression tests for CV reviewer model/key fallback orchestration."""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

# Make backend importable when pytest runs from /app
BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import cv_service


def _valid_review_json() -> str:
    payload = {
        "overall_score": 8,
        "overall_assessment": "Strong CV with clear experience.",
        "key_strength": {
            "title": "Quantified achievements",
            "explanation": "Includes measurable impact relevant to the role.",
        },
        "dimensions": [
            {
                "dimension": "Formatting and Structure",
                "score": 8,
                "strengths": ["Readable layout"],
                "improvements": ["Tighten summary"],
                "observations": "Structure is clear.",
            },
            {
                "dimension": "Content Relevance",
                "score": 8,
                "strengths": ["Relevant projects"],
                "improvements": ["Add role-specific keywords"],
                "observations": "Content matches target role.",
            },
            {
                "dimension": "Language and Style",
                "score": 7,
                "strengths": ["Concise wording"],
                "improvements": ["Reduce passive voice"],
                "observations": "Tone is professional.",
            },
            {
                "dimension": "Cultural and Market Fit",
                "score": 7,
                "strengths": ["Market-aligned conventions"],
                "improvements": ["Clarify language levels"],
                "observations": "Mostly aligned with local norms.",
            },
            {
                "dimension": "Strategic Positioning",
                "score": 8,
                "strengths": ["Strong positioning"],
                "improvements": ["Sharpen value proposition"],
                "observations": "Good fit for senior roles.",
            },
        ],
        "priority_recommendations": [
            {"rank": 1, "title": "Improve summary", "impact": "high", "rationale": "Increases clarity."},
            {"rank": 2, "title": "Add metrics", "impact": "high", "rationale": "Improves credibility."},
            {"rank": 3, "title": "Tune keywords", "impact": "medium", "rationale": "Helps ATS matching."},
        ],
        "revised_excerpts": [],
        "assumptions": [],
        "market_notes": [],
    }
    return json.dumps(payload)


def test_run_cv_review_timeout_falls_through_to_next_model(monkeypatch):
    """Timeout/non-budget errors should move to the next model on the same key."""
    attempts: list[tuple[str, str]] = []

    monkeypatch.setenv("EMERGENT_LLM_KEY", "primary-key")
    monkeypatch.delenv("EMERGENT_LLM_KEY_FALLBACK", raising=False)
    cv_service._BUDGET_EXHAUSTED_UNTIL.clear()

    def fake_sync_llm_send(api_key, session_id, system_message, model_provider, model_name, prompt):
        attempts.append((api_key, model_name))
        if model_name == "claude-opus-4-7":
            raise TimeoutError("upstream timeout")
        return _valid_review_json()

    monkeypatch.setattr(cv_service, "_sync_llm_send", fake_sync_llm_send)

    review, model_used = asyncio.run(
        cv_service.run_cv_review(
            cv_text="A" * 300,
            target={"market": "Finland", "seniority": "Senior"},
            session_id="test-timeout-fallback",
            language="en",
        )
    )

    assert review.overall_score == 8
    assert model_used == "anthropic/claude-sonnet-4-6"
    assert attempts[:2] == [
        ("primary-key", "claude-opus-4-7"),
        ("primary-key", "claude-sonnet-4-6"),
    ]


def test_run_cv_review_budget_error_skips_rest_of_key_and_tries_next_key(monkeypatch):
    """Budget failure on one key should skip remaining models for that key only."""
    attempts: list[tuple[str, str]] = []

    monkeypatch.setenv("EMERGENT_LLM_KEY", "primary-key")
    monkeypatch.setenv("EMERGENT_LLM_KEY_FALLBACK", "fallback-key")
    cv_service._BUDGET_EXHAUSTED_UNTIL.clear()

    def fake_sync_llm_send(api_key, session_id, system_message, model_provider, model_name, prompt):
        attempts.append((api_key, model_name))
        if api_key == "primary-key":
            raise RuntimeError("Budget has been exceeded")
        return _valid_review_json()

    monkeypatch.setattr(cv_service, "_sync_llm_send", fake_sync_llm_send)

    review, model_used = asyncio.run(
        cv_service.run_cv_review(
            cv_text="B" * 300,
            target={"market": "Finland", "seniority": "Senior"},
            session_id="test-budget-fallback-key",
            language="en",
        )
    )

    assert review.overall_score == 8
    assert model_used == "anthropic/claude-opus-4-7"
    assert attempts == [
        ("primary-key", "claude-opus-4-7"),
        ("fallback-key", "claude-opus-4-7"),
    ]
