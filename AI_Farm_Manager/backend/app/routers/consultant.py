"""Proactive consultant insights for Farm Dashboard (integration key or admin)."""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from app.config import get_settings
from app.routers.integration import require_integration_or_admin
from app.schemas.insights import FarmInsightsResponse
from app.services.consultant import (
    CONSULTANT_SYSTEM_SINGLE_FIELD,
    generate_farm_insights,
    normalize_incoming_api_key,
)
from app.services.dashboard_service import build_dashboard_fetch_url, fetch_dashboard_json
from app.services.pipeline_log import approx_json_bytes, log_pipeline
from app.services.snapshot_pruner import prune_snapshot_fields_context_only, slice_snapshot_for_single_field
from app.services.subscription import assert_consultant_allowed

router = APIRouter(prefix="/api/v1/consultant", tags=["consultant"])


@router.get("/insights", response_model=FarmInsightsResponse)
async def get_consultant_insights(
    request: Request,
    serverId: str | None = Query(
        None,
        description="Farm Dashboard save id (srv_…). Required for correct snapshot when multiple saves push.",
    ),
    fieldRef: str | None = Query(
        None,
        description="Optional: only this parcel (farmlandId) is sent to the LLM — strict per-field suggestions.",
    ),
    context: str = Query(
        "full",
        description="full = whole snapshot; fields = drop vehicles/animals etc. for server-wide field focus.",
    ),
    _: str = Depends(require_integration_or_admin),
    _subscription: None = Depends(assert_consultant_allowed),
) -> FarmInsightsResponse:
    """
    Fetch dashboard snapshot for the requested save (PC push preferred), then run heuristics + optional LLM.

    **Multi-save:** pass ``serverId`` matching the navbar / active Farm Dashboard server so the AI uses that
    push buffer, not another save.

    **Per-field LLM:** pass ``fieldRef`` (farmlandId) to send only that field row to the model.

    **Context:** ``context=fields`` narrows JSON to agronomic sections (still one LLM call per request).
    """
    log_pipeline(
        "consultant_in",
        "GET /api/v1/consultant/insights — Farm Dashboard requested Smart suggestions",
        byok=bool(normalize_incoming_api_key(request.headers.get("X-AI-API-Key"))),
        server_id_query=(serverId or "").strip() or None,
        field_ref=(fieldRef or "").strip() or None,
        context=(context or "full").strip().lower(),
    )
    settings = get_settings()
    base = (settings.get("dashboard_json_url") or "").strip()
    env_sid = (settings.get("dashboard_server_id") or "").strip()
    sid = (serverId or "").strip() or env_sid
    fetch_url = build_dashboard_fetch_url(base, sid if sid else None)
    if not fetch_url:
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

    ctx = (context or "full").strip().lower()
    if ctx not in ("full", "fields"):
        ctx = "full"

    field_ref_q = (fieldRef or "").strip()
    sys_inst: str | None = None

    if field_ref_q:
        sliced = slice_snapshot_for_single_field(snapshot, field_ref_q)
        if sliced is None:
            raise HTTPException(
                status_code=404,
                detail=f"No field matches fieldRef={field_ref_q!r} in this save's snapshot.",
            )
        snapshot = sliced
        sys_inst = CONSULTANT_SYSTEM_SINGLE_FIELD
    elif ctx == "fields":
        snapshot = prune_snapshot_fields_context_only(snapshot)

    user_key = normalize_incoming_api_key(request.headers.get("X-AI-API-Key"))
    user_prov = (request.headers.get("X-AI-Provider") or "").strip().lower() or None
    if user_prov and user_prov not in ("openai", "gemini"):
        user_prov = None

    insights, llm_used = await generate_farm_insights(
        snapshot,
        user_api_key=user_key or None,
        user_provider=user_prov,
        system_instruction=sys_inst,
    )
    log_pipeline(
        "consultant_out",
        "Responded with Smart suggestions",
        insight_count=len(insights),
        llm_used=llm_used,
        snapshot_bytes=approx_json_bytes(snapshot),
        server_id_query=(serverId or "").strip() or None,
        field_ref=field_ref_q or None,
        context=ctx,
    )
    return FarmInsightsResponse(insights=insights, llm_used=llm_used)
