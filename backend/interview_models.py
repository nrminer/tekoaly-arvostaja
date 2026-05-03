from __future__ import annotations

from typing import Any, List, Literal, Optional

from pydantic import BaseModel, Field, field_validator

from app_config import INTERVIEW_TIMER_SECONDS_DEFAULT, INTERVIEW_TIMER_SECONDS_OPTIONS


def _coerce_list(value: Any) -> list:
    """Coerce None → [] for list fields. Leaves actual lists untouched."""
    if value is None:
        return []
    if isinstance(value, str):
        # Occasionally the LLM returns a single string instead of a list;
        # wrap it so the final structure is always a list of strings.
        return [value]
    return value


def _coerce_score(value: Any) -> int:
    """Coerce a numeric score into an int in 0-10.

    Real LLMs sometimes emit fractional scores like 6.5; Pydantic's default
    int validator rejects those. We round half-up (so 6.5 → 7, not banker's 6)
    for predictable scoring, then clamp to 0-10.
    """
    if value is None:
        return 0
    try:
        fval = float(value)
    except (TypeError, ValueError):
        return 0
    # Half-up rounding for non-negative values.
    if fval >= 0:
        rounded = int(fval + 0.5)
    else:
        rounded = -int(-fval + 0.5)
    return max(0, min(10, rounded))


class EndSessionSummary(BaseModel):
    """Final coaching summary produced by the AI interviewer."""

    overall_score: int = Field(ge=0, le=10)
    headline: str
    strengths: List[str] = Field(default_factory=list)
    improvements: List[str] = Field(default_factory=list)
    star_coaching: str = ""
    cultural_fit_note: str = ""
    next_steps: List[str] = Field(default_factory=list)

    @field_validator("overall_score", mode="before")
    @classmethod
    def _coerce_overall_score(cls, value: Any) -> int:
        return _coerce_score(value)

    @field_validator("strengths", "improvements", "next_steps", mode="before")
    @classmethod
    def _coerce_string_lists(cls, value: Any) -> list:
        return _coerce_list(value)

    @field_validator("headline", "star_coaching", "cultural_fit_note", mode="before")
    @classmethod
    def _coerce_optional_strings(cls, value: Any) -> str:
        if value is None:
            return ""
        return value


class InterviewTurn(BaseModel):
    """Strict per-turn contract from the LLM.

    Every turn (including the very first) MUST return exactly this shape.
    When `is_final` is true, `end_session_summary` must be non-null; otherwise null.
    """

    next_prompt: str
    probes: List[str] = Field(default_factory=list)
    interim_feedback: Optional[str] = None
    question_type: Literal["behavioral", "technical", "opening", "closing"] = "opening"
    is_final: bool = False
    end_session_summary: Optional[EndSessionSummary] = None

    @field_validator("probes", mode="before")
    @classmethod
    def _coerce_probes(cls, value: Any) -> list:
        return _coerce_list(value)

    @field_validator("question_type", mode="before")
    @classmethod
    def _coerce_question_type(cls, value: Any) -> str:
        if value is None:
            return "opening"
        value_str = str(value).strip().lower()
        # Normalise common model aliases.
        aliases = {
            "behaviour": "behavioral",
            "behavioural": "behavioral",
            "tech": "technical",
            "intro": "opening",
            "start": "opening",
            "final": "closing",
            "close": "closing",
            "wrap-up": "closing",
        }
        return aliases.get(value_str, value_str)

    @field_validator("interim_feedback", mode="before")
    @classmethod
    def _coerce_interim_feedback(cls, value: Any) -> Optional[str]:
        if value in (None, "", "null"):
            return None
        return str(value)


class InterviewTarget(BaseModel):
    """Interview setup context (role & market)."""

    job_title: Optional[str] = None
    industry: Optional[str] = None
    seniority: Optional[str] = None
    market: Optional[str] = "Finland"
    job_description: Optional[str] = None
    focus_areas: List[str] = Field(default_factory=list)  # CV gaps / risks from the review


def normalize_timer_seconds(value: Any) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return INTERVIEW_TIMER_SECONDS_DEFAULT
    return parsed if parsed in INTERVIEW_TIMER_SECONDS_OPTIONS else INTERVIEW_TIMER_SECONDS_DEFAULT
