"""Proactive consultant insights for Farm Dashboard (integration key or admin)."""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException, Request

from app.config import get_settings
from app.routers.integration import require_integration_or_admin
from app.schemas.insights import FarmInsightsResponse
from app.services.consultant import generate_farm_insights
from app.services.dashboard_service import fetch_dashboard_json

router = APIRouter(prefix="/api/v1/consultant", tags=["consultant"])


@router.get("/insights", response_model=FarmInsightsResponse)
async def get_consultant_insights(
    request: Request,
    _: str = Depends(require_integration_or_admin),
) -> FarmInsightsResponse:
    """
    Fetch current dashboard snapshot (FTP in-memory or DASHBOARD_JSON_URL), run heuristics + optional LLM.
    Requires `X-FarmDash-Key` matching `FARMDASH_INTEGRATION_KEY`, or Admin HTTP Basic auth.

    LLM (Gemini/OpenAI) uses **Bring Your Own Key**: send `X-AI-API-Key` (and optional `X-AI-Provider`:
    `openai` or `gemini`). If the header is omitted, the response is **heuristics only** (`llm_used=false`).
    The server does not use VPS `.env` LLM keys for this endpoint.
    """
    settings = get_settings()
    fetch_url = settings.get("dashboard_fetch_url") or settings.get("dashboard_json_url") or ""

    raw, err = await fetch_dashboard_json(fetch_url or None)
    if raw is None:
        raise HTTPException(
            status_code=503,
            detail=err or "Dashboard snapshot unavailable — configure FTP or DASHBOARD_JSON_URL",
        )

    try:
        snapshot = json.loads(raw)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=503, detail=f"Invalid dashboard JSON: {e}") from e

    if not isinstance(snapshot, dict):
        snapshot = {"_raw": snapshot}

    user_key = (request.headers.get("X-AI-API-Key") or "").strip()
    user_prov = (request.headers.get("X-AI-Provider") or "").strip().lower() or None
    if user_prov and user_prov not in ("openai", "gemini"):
        user_prov = None

    insights, llm_used = await generate_farm_insights(
        snapshot,
        user_api_key=user_key or None,
        user_provider=user_prov,
    )
    return FarmInsightsResponse(insights=insights, llm_used=llm_used)
