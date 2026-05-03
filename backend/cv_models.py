from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


# Five fixed evaluation dimensions for the Universal CV Review Assistant
DIMENSIONS = [
    "Formatting and Structure",
    "Content Relevance",
    "Language and Style",
    "Cultural and Market Fit",
    "Strategic Positioning",
]


class DimensionFeedback(BaseModel):
    """Feedback for one of the five evaluation dimensions."""

    dimension: str
    score: int = Field(ge=0, le=10)
    strengths: List[str] = Field(default_factory=list)
    improvements: List[str] = Field(default_factory=list)
    observations: str = ""


class KeyStrength(BaseModel):
    """One standout element of the CV with reasoning."""

    title: str
    explanation: str


class PriorityRecommendation(BaseModel):
    """Ranked, actionable improvement with optional example/rewrite."""

    rank: int = Field(ge=1)
    title: str
    impact: str  # high | medium | low (free text accepted from model)
    rationale: str
    example: Optional[str] = None  # short rewrite or example demonstrating the change


class RevisedExcerpt(BaseModel):
    """Optional rewrite of a key section to demonstrate improvement."""

    section: str  # e.g., "Professional Summary" or "Bullet point"
    original: Optional[str] = None
    revised: str
    why_it_works: str


class CVReview(BaseModel):
    """Top-level structured response from the AI reviewer."""

    overall_score: int = Field(ge=0, le=10)
    overall_assessment: str  # 2-3 sentence summary of effectiveness
    key_strength: KeyStrength
    dimensions: List[DimensionFeedback]
    priority_recommendations: List[PriorityRecommendation]
    revised_excerpts: List[RevisedExcerpt] = Field(default_factory=list)
    assumptions: List[str] = Field(default_factory=list)
    market_notes: List[str] = Field(default_factory=list)
