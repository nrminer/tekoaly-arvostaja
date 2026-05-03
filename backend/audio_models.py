"""Pydantic models for the audio transcription pipeline.

The schema mirrors the Voice AI Integration Engineer playbook:
- structured, time-stamped segments
- word-level timestamps when available
- preserved speaker attribution slot (filled later by diarisation)
- stable schema_version for downstream consumers
"""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class WordTimestamp(BaseModel):
    word: str
    start: float
    end: float


class TranscriptSegment(BaseModel):
    """One segment of transcribed speech with timestamps."""

    index: int
    start: float = Field(ge=0.0)
    end: float = Field(ge=0.0)
    text: str
    speaker: Optional[str] = None
    confidence: Optional[float] = None
    words: List[WordTimestamp] = Field(default_factory=list)
    flagged_noise: bool = False


class AudioMetadata(BaseModel):
    """Probe-derived metadata for the input audio file."""

    duration: float
    codec: str
    sample_rate: int
    channels: int
    bit_rate: Optional[str] = None
    format: str
    size_bytes: int
    original_filename: Optional[str] = None
    preprocessed: bool = True


class TranscriptResult(BaseModel):
    """Full structured transcript matching the Voice AI playbook contract."""

    schema_version: str = "1.0"
    transcript_id: str
    language: str
    model: str = "whisper-1"
    metadata: AudioMetadata
    segments: List[TranscriptSegment] = Field(default_factory=list)
    full_text: str = ""
    speakers: List[str] = Field(default_factory=list)
    total_duration: float = 0.0
    chunk_count: int = 1
    created_at: str = ""
