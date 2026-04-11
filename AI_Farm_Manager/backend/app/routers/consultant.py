"""Proactive consultant insights for Farm Dashboard (integration key or admin)."""
from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from app.config import get_settings
from app.routers.integration import require_integration_or_admin
from app.schemas.insights import FarmInsightsResponse, InsightCategory
from app.services.consultant import (
    CONSULTANT_SYSTEM_FIELDS_FOCUS,
    CONSULTANT_SYSTEM_SINGLE_FIELD,
    consultant_system_instruction_for_view,
    generate_farm_insights,
    normalize_incoming_api_key,
)
from app.services.dashboard_service import build_dashboard_fetch_url, fetch_dashboard_json
from app.services.pipeline_log import approx_json_bytes, log_pipeline
from app.services.snapshot_pruner import (
    pick_first_owned_field_row,
    prune_snapshot_fields_context_only,
    prune_snapshot_for_dashboard_view,
    prune_snapshot_to_active_farm,
    resolve_consultant_farm_id,
    slice_snapshot_for_single_field,
)
from app.services.subscription import assert_consultant_allowed

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/consultant", tags=["consultant"])

_ALLOWED_CONSULTANT_VIEWS = frozenset(
    {"home", "fields", "vehicles", "pastures", "livestock", "productions", "economy"}
)


def _raise_if_invalid_view(view: str | None) -> None:
    if view is None:
        return
    v = str(view).strip().lower()
    if not v:
        return
    if v not in _ALLOWED_CONSULTANT_VIEWS:
        raise HTTPException(status_code=400, detail="Invalid view parameter")


async def _load_snapshot_for_consultant(server_id: str | None) -> tuple[dict[str, Any], str]:
    settings = get_settings()
    base = (settings.get("dashboard_json_url") or "").strip()
    env_sid = (settings.get("dashboard_server_id") or "").strip()
    sid = (server_id or "").strip() or env_sid
    fetch_url = build_dashboard_fetch_url(base, sid if sid else None)
    if not fetch_url:
        fetch_url = settings.get("dashboard_fetch_url") or settings.get("dashboard_json_url") or ""

    raw, err = await fetch_dashboard_json(fetch_url or None)
    if raw is None:
        logger.warning(
            "consultant: no snapshot (serverId query=%r fetch_url=%r err=%s)",
            (server_id or "").strip() or None,
            (fetch_url or "")[:160],
            err,
        )
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
    return snapshot, sid


async def _run_consultant_core(
    snapshot: dict[str, Any],
    *,
    server_id: str | None,
    farm_id_resolved: int | None = None,
    field_ref: str | None = None,
    context: str = "full",
    view: str | None = None,
    user_api_key: str | None = None,
    user_provider: str | None = None,
    consultant_out_message: str = "Responded with Smart suggestions",
) -> FarmInsightsResponse:
    ctx = (context or "full").strip().lower()
    if ctx not in ("full", "fields"):
        ctx = "full"

    vw = (view or "").strip().lower() or None
    if vw in ("full", "dashboard", "landing", "general", ""):
        vw = None

    field_ref_q = (field_ref or "").strip()
    sys_inst: str | None = None
    work = snapshot

    if field_ref_q:
        sliced = slice_snapshot_for_single_field(work, field_ref_q)
        if sliced is None:
            raise HTTPException(
                status_code=404,
                detail=f"No field matches fieldRef={field_ref_q!r} in this save's snapshot.",
            )
        work = sliced
        sys_inst = CONSULTANT_SYSTEM_SINGLE_FIELD
    elif ctx == "fields":
        # Per-row field map (GET … context=fields) — not the same as ?view=fields Smart panel.
        work = prune_snapshot_fields_context_only(work)
        sys_inst = CONSULTANT_SYSTEM_FIELDS_FOCUS
    elif vw:
        sys_inst = consultant_system_instruction_for_view(vw)
        if sys_inst is not None:
            work = prune_snapshot_for_dashboard_view(work, vw)

    up = (user_provider or "").strip().lower() or None
    if up and up not in ("openai", "gemini"):
        up = None

    nkey = normalize_incoming_api_key(user_api_key)
    insights, llm_used = await generate_farm_insights(
        work,
        user_api_key=nkey or None,
        user_provider=up,
        system_instruction=sys_inst,
        cache_server_id=(server_id or "").strip() or None,
        cache_farm_id=farm_id_resolved,
        cache_view=vw,
        cache_context=ctx,
        cache_field_ref=field_ref_q or None,
    )

    if ctx == "fields" and not field_ref_q:
        field_only = [i for i in insights if i.category == InsightCategory.FIELD]
        dropped = len(insights) - len(field_only)
        if dropped > 0:
            logger.warning(
                "consultant context=fields: dropped %s non-Field insight(s) (Animal/Production/Finance) — "
                "field map UI only uses category=Field with field_ref",
                dropped,
            )
        insights = field_only
        if llm_used and not insights:
            logger.warning(
                "consultant context=fields: LLM ran but no Field-tagged insights with field_ref — "
                "Farm Dashboard field rows will show local rules only",
            )

    log_pipeline(
        "consultant_out",
        consultant_out_message,
        insight_count=len(insights),
        llm_used=llm_used,
        snapshot_bytes=approx_json_bytes(work),
        server_id_query=(server_id or "").strip() or None,
        farm_id_resolved=farm_id_resolved,
        field_ref=field_ref_q or None,
        context=ctx,
        view=vw,
    )
    return FarmInsightsResponse(insights=insights, llm_used=llm_used)


async def compute_consultant_insights(
    *,
    server_id: str | None = None,
    farm_id: int | None = None,
    field_ref: str | None = None,
    context: str = "full",
    view: str | None = None,
    user_api_key: str | None = None,
    user_provider: str | None = None,
) -> FarmInsightsResponse:
    """
    Shared implementation for ``GET /api/v1/consultant/insights`` and admin “test” (same snapshot + LLM path).

    Uses server env LLM keys when ``user_api_key`` is empty (same as Farm Dashboard without BYOK).
    """
    _raise_if_invalid_view(view)
    snapshot, sid = await _load_snapshot_for_consultant(server_id)
    farm_resolved = resolve_consultant_farm_id(snapshot, farm_id)
    snapshot = prune_snapshot_to_active_farm(snapshot, farm_resolved)
    logger.info(
        "consultant: snapshot bytes_utf8≈%s server_id_query=%r farm_id_resolved=%s context=%s fieldRef=%s",
        approx_json_bytes(snapshot),
        sid,
        farm_resolved,
        (context or "full").strip().lower(),
        (field_ref or "").strip() or None,
    )
    return await _run_consultant_core(
        snapshot,
        server_id=server_id,
        farm_id_resolved=farm_resolved,
        field_ref=field_ref,
        context=context,
        view=view,
        user_api_key=user_api_key,
        user_provider=user_provider,
    )


async def compute_consultant_insights_first_owned_field(
    *,
    server_id: str | None = None,
    active_farm_id: int | None = None,
    user_api_key: str | None = None,
    user_provider: str | None = None,
) -> tuple[FarmInsightsResponse, dict[str, Any]]:
    """
    Load snapshot, pick the first owned parcel (same rules as Farm Dashboard field list), then run the
    **single-field** consultant (``CONSULTANT_SYSTEM_SINGLE_FIELD``) — “next job” for that field.
    """
    snapshot, sid = await _load_snapshot_for_consultant(server_id)
    af = resolve_consultant_farm_id(snapshot, active_farm_id)
    snapshot = prune_snapshot_to_active_farm(snapshot, af)
    ref, row = pick_first_owned_field_row(snapshot, af)
    if not ref or row is None:
        raise HTTPException(
            status_code=503,
            detail="No field rows in dashboard snapshot — push a snapshot or configure FTP / DASHBOARD_JSON_URL.",
        )

    log_pipeline(
        "consultant_in",
        "First owned parcel — single-field consultant (next job on field)",
        server_id_query=(server_id or "").strip() or None,
        field_ref=ref,
        fruit_type=row.get("fruitType"),
    )
    logger.info(
        "consultant: first-owned test field_ref=%r name=%r fruit=%r",
        ref,
        row.get("name"),
        row.get("fruitType"),
    )

    resp = await _run_consultant_core(
        snapshot,
        server_id=server_id,
        farm_id_resolved=af,
        field_ref=ref,
        context="full",
        view=None,
        user_api_key=user_api_key,
        user_provider=user_provider,
        consultant_out_message="Responded — first owned field (next job)",
    )
    meta = {
        "chosen_field_ref": ref,
        "field_name": row.get("name"),
        "fruit_type": row.get("fruitType"),
        "growth_label": row.get("growthLabel"),
        "harvest_ready": row.get("harvestReady"),
        "owner_farm_id": row.get("ownerFarmId", row.get("farmId")),
        "server_id_query": (server_id or "").strip() or None,
    }
    return resp, meta


@router.get("/insights", response_model=FarmInsightsResponse)
async def get_consultant_insights(
    request: Request,
    serverId: str | None = Query(
        None,
        description="Farm Dashboard save id (srv_…). Required for correct snapshot when multiple saves push.",
    ),
    farmId: int | None = Query(
        None,
        ge=1,
        description="Active farm id (Farm Dashboard farm selector). Narrows JSON to that farm only.",
    ),
    fieldRef: str | None = Query(
        None,
        description="Optional: only this parcel (farmlandId) is sent to the LLM — strict per-field suggestions.",
    ),
    context: str = Query(
        "full",
        description="full = whole snapshot; fields = drop vehicles/animals etc. for server-wide field focus.",
    ),
    view: str | None = Query(
        None,
        description=(
            "Farm Dashboard section: home (dashboard top 3 priorities), fields, vehicles, pastures, "
            "livestock, productions, economy — "
            "narrows JSON + prompt to what the user is viewing (Smart suggestions). "
            "Use with context=full. Field map uses context=fields instead."
        ),
    ),
    _: str = Depends(require_integration_or_admin),
    _subscription: None = Depends(assert_consultant_allowed),
) -> FarmInsightsResponse:
    """
    Fetch dashboard snapshot for the requested save (PC push preferred), then run heuristics + optional LLM.

    **Multi-save:** pass ``serverId`` matching the navbar / active Farm Dashboard server so the AI uses that
    push buffer, not another save.

    **Active farm:** pass ``farmId`` matching the farm dropdown so the LLM only sees that farm's fields
    and assets (same as on-screen). If omitted, the snapshot's ``activeFarmId`` is used.

    **Per-field LLM:** pass ``fieldRef`` (farmlandId) to send only that field row to the model.

    **Context:** ``context=fields`` narrows JSON to agronomic sections (still one LLM call per request).

    **View:** ``view=vehicles|pastures|…`` (with ``context=full``) sends only that section's data and a matching prompt
    (Smart suggestions panel — reduces tokens vs whole-farm JSON).
    """
    log_pipeline(
        "consultant_in",
        "GET /api/v1/consultant/insights — Farm Dashboard requested Smart suggestions",
        byok=bool(normalize_incoming_api_key(request.headers.get("X-AI-API-Key"))),
        server_id_query=(serverId or "").strip() or None,
        farm_id_query=farmId,
        field_ref=(fieldRef or "").strip() or None,
        context=(context or "full").strip().lower(),
        view_query=(view or "").strip() or None,
    )
    user_key = normalize_incoming_api_key(request.headers.get("X-AI-API-Key"))
    user_prov = (request.headers.get("X-AI-Provider") or "").strip().lower() or None
    if user_prov and user_prov not in ("openai", "gemini"):
        user_prov = None

    return await compute_consultant_insights(
        server_id=serverId,
        farm_id=farmId,
        field_ref=fieldRef,
        context=context,
        view=view,
        user_api_key=user_key or None,
        user_provider=user_prov,
    )
