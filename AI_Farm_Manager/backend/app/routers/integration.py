"""Farm Dashboard ↔ AI Farm Manager: overview + bot instance CRUD (key or admin Basic)."""
from __future__ import annotations

import os
from typing import Any
from urllib.parse import unquote

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from fastapi.responses import Response
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from pydantic import BaseModel, Field

from app.config import get_settings
from app.services.bot_registry import (
    delete_instance,
    find_instance_by_id,
    list_instances_masked,
    load_registry,
    upsert_instance,
)
from app.services.mod_config_xml import build_mod_config_xml, resolve_backend_url_for_xml
from app.services import snapshot_push_service
from app.services.consultant import normalize_incoming_api_key, resolve_consultant_llm_settings
from app.services.llm_service import test_llm_connectivity

router = APIRouter(prefix="/api/integration", tags=["integration"])
_security = HTTPBasic(auto_error=False)


def _parse_integration_key(header_val: str | None) -> str:
    """
    Browsers only allow ISO-8859-1 in fetch() header values. The client may send
    encodeURIComponent(FARMDASH_INTEGRATION_KEY) so Unicode is safe — decode here.
    """
    if not header_val:
        return ""
    try:
        return unquote(header_val)
    except Exception:
        return header_val


def _farm_dashboard_origin() -> str | None:
    """
    Base URL for Farm Dashboard HTTP API (e.g. http://host:8766).

    Returns None when DASHBOARD_JSON_URL is unset — do not default to 127.0.0.1 on a VPS
    (that points at the VPS itself, not the player's PC). Use DASHBOARD_PUSH_MODE=1 instead.
    """
    u = (get_settings().get("dashboard_json_url") or "").strip()
    if not u:
        return None
    if "/api/data" in u:
        return u.split("/api/data")[0].rstrip("/")
    parts = u.rstrip("/").rsplit("/", 1)
    return parts[0] if len(parts) == 2 and parts[1] == "api" else u.rstrip("/")


def _farm_dashboard_connect_hint(origin: str, error: str | None) -> str | None:
    """Short troubleshooting when /api/servers fails (no secrets)."""
    if not error:
        return None
    o = origin.lower()
    if "127.0.0.1" not in o and "localhost" not in o:
        return (
            "If Farm Dashboard runs on your PC, this URL must be reachable from wherever AI Farm Manager runs "
            "(firewall, VPN, or wrong host). For a cloud VPS, use FTP snapshot mode or a tunnel to your PC."
        )
    return (
        "127.0.0.1 / localhost here means this server (e.g. your VPS), not your gaming PC. "
        "If Farm Dashboard runs on your PC and AI Farm Manager runs in the cloud, the VPS cannot reach your PC at 127.0.0.1. "
        "Use one of: (1) G-Portal FTP snapshot env vars on the VPS so it pulls data.json from your hoster; "
        "(2) a secure tunnel or VPN exposing your PC’s port 8766, then set Farm Dashboard JSON URL on the VPS to that HTTPS URL with path /api/data; "
        "(3) run AI Farm Manager on the same machine as Farm Dashboard. "
        "Same PC but AI in Docker only: http://host.docker.internal:8766/api/data . "
        "Keep Farm Dashboard running on the PC with the game save."
    )


async def require_integration_or_admin(
    x_farmdash_key: str | None = Header(default=None, alias="X-FarmDash-Key"),
    credentials: HTTPBasicCredentials | None = Depends(_security),
) -> str:
    expected_key = (os.getenv("FARMDASH_INTEGRATION_KEY") or "").strip()
    got = _parse_integration_key(x_farmdash_key).strip()
    if expected_key and (got == expected_key or x_farmdash_key == expected_key):
        return "integration"
    s = get_settings()
    user, pw = s["admin_username"], s["admin_password"]
    if pw and credentials and credentials.username == user and credentials.password == pw:
        return "admin"
    raise HTTPException(
        status_code=401,
        detail=(
            "Unauthorized — send header X-FarmDash-Key with the same value as FARMDASH_INTEGRATION_KEY "
            "in backend/.env (Farm Dashboard: robot panel → Farm Dashboard link key), or use Admin Basic auth"
        ),
        headers={"WWW-Authenticate": "Basic realm=integration"},
    )


async def get_overview_payload() -> dict[str, Any]:
    """Shared by /api/integration/overview and Admin bot panel."""
    reg = load_registry()
    base_out: dict[str, Any] = {
        "botInstances": list_instances_masked(),
        "botInstanceCount": len(reg.get("instances") or []),
        "legacySingleTokenMode": len(reg.get("instances") or []) == 0,
    }

    if snapshot_push_service.is_push_mode_enabled():
        meta = snapshot_push_service.get_servers_meta() or []
        hint = None
        if not meta:
            hint = (
                "Push mode: the server list arrives with the next snapshot from Farm Dashboard "
                '(desktop app → enable "Push snapshots to AI server"). You can still type a Farm Dashboard server id manually in /admin.'
            )
        base_out.update(
            {
                "farmDashboardOrigin": "(snapshots pushed from your PC — no inbound ports)",
                "farmDashboardServers": meta,
                "farmDashboardError": None,
                "farmDashboardConnectHint": hint,
                "farmDashboardServerCount": len(meta),
                "farmDashboardPushMode": True,
            }
        )
        return base_out

    origin = _farm_dashboard_origin()
    farm_servers: list[dict[str, Any]] = []
    farm_error: str | None = None
    connect_hint: str | None = None

    if origin is None:
        farm_error = (
            "Farm Dashboard JSON URL is not configured on this server. "
            "If Farm Dashboard runs on a PC and AI Farm Manager on a VPS: set DASHBOARD_PUSH_MODE=1 and enable push in the desktop app "
            "(do not use 127.0.0.1 here — that is the VPS itself). "
            "For local dev on the same machine, set DASHBOARD_JSON_URL=http://127.0.0.1:8766/api/data explicitly."
        )
        connect_hint = (
            "Empty URL is correct only with push mode. Otherwise set Farm Dashboard JSON URL in /admin to a URL this server can reach."
        )
    else:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                r = await client.get(f"{origin}/api/servers")
                r.raise_for_status()
                data = r.json()
                if isinstance(data, list):
                    farm_servers = data
        except Exception as e:
            farm_error = str(e)
        connect_hint = _farm_dashboard_connect_hint(origin, farm_error)

    base_out.update(
        {
            "farmDashboardOrigin": origin or "(not set — use push mode or configure URL)",
            "farmDashboardServers": farm_servers,
            "farmDashboardError": farm_error,
            "farmDashboardConnectHint": connect_hint,
            "farmDashboardServerCount": len(farm_servers),
            "farmDashboardPushMode": False,
        }
    )
    return base_out


@router.get("/overview")
async def integration_overview(_: str = Depends(require_integration_or_admin)) -> dict[str, Any]:
    """Farm Dashboard server list (proxied) + bot instances (masked tokens)."""
    return await get_overview_payload()


@router.get("/llm-ping")
async def integration_llm_ping(
    request: Request,
    _: str = Depends(require_integration_or_admin),
) -> dict[str, Any]:
    """
    Same auth as ``/overview`` (``X-FarmDash-Key``). Optional ``X-AI-API-Key`` / ``X-AI-Provider`` (BYOK)
    like ``/consultant/insights``. Verifies the path **Farm Dashboard → this API → LLM** with a short ping.
    """
    user_key = normalize_incoming_api_key(request.headers.get("X-AI-API-Key"))
    user_prov = (request.headers.get("X-AI-Provider") or "").strip().lower() or None
    if user_prov and user_prov not in ("openai", "gemini"):
        user_prov = None
    merged = resolve_consultant_llm_settings(user_key or None, user_prov)
    if merged is None:
        return {
            "ok": False,
            "detail": "No LLM API key — set keys on the server or BYOK in Farm Dashboard (robot panel).",
        }
    return await test_llm_connectivity(
        probe_message='Hi — are you there? Reply in one short sentence (max 20 words).',
        settings=merged,
    )


@router.post("/push-snapshot")
async def integration_push_snapshot(
    request: Request,
    server_id: str | None = Query(None, alias="serverId"),
    _: str = Depends(require_integration_or_admin),
) -> dict[str, Any]:
    """
    Farm Dashboard (desktop) POSTs JSON here on an outbound connection — no open ports on the gaming PC.
    Requires DASHBOARD_PUSH_MODE=1 on this server. Same auth as /overview (X-FarmDash-Key or admin Basic).

    Body: ``{"snapshot": { ... same shape as GET /api/data ... }, "servers": [ optional /api/servers shape ]}``
    If ``snapshot`` is omitted, the root object is treated as the snapshot (for simple clients).
    """
    if not snapshot_push_service.is_push_mode_enabled():
        raise HTTPException(
            status_code=503,
            detail="Set DASHBOARD_PUSH_MODE=1 in AI Farm Manager environment to accept pushed snapshots.",
        )
    try:
        body: Any = await request.json()
    except Exception:
        raise HTTPException(400, "Request body must be JSON") from None
    if not isinstance(body, dict):
        raise HTTPException(400, "JSON object expected")

    servers_raw = body.get("servers")
    servers: list[dict[str, Any]] | None = None
    if isinstance(servers_raw, list):
        servers = [x for x in servers_raw if isinstance(x, dict)]

    if "snapshot" in body and isinstance(body["snapshot"], dict):
        snap = body["snapshot"]
    else:
        snap = {k: v for k, v in body.items() if k != "servers"}

    if not snap:
        raise HTTPException(400, "Missing snapshot object")

    ok, err = snapshot_push_service.store_push(server_id, snap, servers)
    if not ok:
        raise HTTPException(400, err or "Invalid snapshot")
    return {"ok": True, "serverId": (server_id or "").strip() or None}


class InstancePayload(BaseModel):
    id: str | None = None
    label: str = Field("", max_length=200)
    dashboard_server_id: str = Field("", max_length=200)
    enabled: bool = True
    server_token: str | None = Field(None, max_length=512)
    # 0=free (local), 1=consultant, 2=consultant+chat — used when ENABLE_SUBSCRIPTION_TIERS=true
    subscription_tier: int | None = Field(None, ge=0, le=2)


@router.post("/instances")
async def create_or_update_instance(
    body: InstancePayload,
    _: str = Depends(require_integration_or_admin),
) -> dict[str, Any]:
    try:
        inst = upsert_instance(
            body.id,
            body.label,
            body.dashboard_server_id,
            body.enabled,
            body.server_token,
            subscription_tier=body.subscription_tier,
        )
        return {"ok": True, "instance": inst}
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@router.delete("/instances/{inst_id}")
async def remove_instance(
    inst_id: str,
    _: str = Depends(require_integration_or_admin),
) -> dict[str, Any]:
    if not delete_instance(inst_id):
        raise HTTPException(404, "Instance not found")
    return {"ok": True}


class ConfigXmlPayload(BaseModel):
    instance_id: str = Field(..., min_length=1)


@router.post("/config-xml")
async def download_config_xml_for_instance(
    request: Request,
    body: ConfigXmlPayload,
    _: str = Depends(require_integration_or_admin),
) -> Response:
    """
    Return ready-to-drop ai_farm_manager_config.xml for a bot profile (Farm Dashboard / G-Portal).
    Used by the Electron app to write the file automatically — no manual Lua/XML editing.
    """
    inst = find_instance_by_id(body.instance_id.strip())
    if not inst:
        raise HTTPException(404, "Instance not found")
    settings = get_settings()
    xml = build_mod_config_xml(
        resolve_backend_url_for_xml(settings, str(request.base_url)),
        str(inst.get("server_token") or ""),
        settings["trigger_prefix"],
    )
    return Response(
        content=xml,
        media_type="application/xml; charset=utf-8",
        headers={
            "Content-Disposition": 'attachment; filename="ai_farm_manager_config.xml"',
        },
    )
