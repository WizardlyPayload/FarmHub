"""Structured consultant / proactive analysis responses."""
from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


class InsightCategory(str, Enum):
    FIELD = "Field"
    ANIMAL = "Animal"
    PRODUCTION = "Production"
    FINANCE = "Finance"


class InsightPriority(str, Enum):
    LOW = "Low"
    MEDIUM = "Medium"
    HIGH = "High"


class FarmInsight(BaseModel):
    category: InsightCategory
    priority: InsightPriority
    message: str = Field(..., max_length=2000)
    reasoning: str = Field(
        ...,
        max_length=4000,
        description="Brief explanation for the dashboard.",
    )


class FarmInsightsResponse(BaseModel):
    insights: list[FarmInsight]
    llm_used: bool = Field(
        default=True,
        description="False if only heuristics ran (no LLM key or LLM failure).",
    )
