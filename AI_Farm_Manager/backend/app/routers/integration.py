"""Farm Dashboard ↔ AI Farm Manager: overview + bot instance CRUD (key or admin Basic)."""
from __future__ import annotations

import os
from typing import Any
from urllib.parse import unquote

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Request
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


def _farm_dashboard_origin() -> str:
    u = get_settings().get("dashboard_json_url") or "http://127.0.0.1:8766/api/data"
    if "/api/data" in u:
        return u.split("/api/data")[0].rstrip("/")
    parts = u.rstrip("/").rsplit("/", 1)
    return parts[0] if len(parts) == 2 and parts[1] == "api" else u.rstrip("/")


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
    origin = _farm_dashboard_origin()
    farm_servers: list[dict[str, Any]] = []
    farm_error: str | None = None
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(f"{origin}/api/servers")
            r.raise_for_status()
            data = r.json()
            if isinstance(data, list):
                farm_servers = data
    except Exception as e:
        farm_error = str(e)

    reg = load_registry()
    return {
        "farmDashboardOrigin": origin,
        "farmDashboardServers": farm_servers,
        "farmDashboardError": farm_error,
        "farmDashboardServerCount": len(farm_servers),
        "botInstances": list_instances_masked(),
        "botInstanceCount": len(reg.get("instances") or []),
        "legacySingleTokenMode": len(reg.get("instances") or []) == 0,
    }


@router.get("/overview")
async def integration_overview(_: str = Depends(require_integration_or_admin)) -> dict[str, Any]:
    """Farm Dashboard server list (proxied) + bot instances (masked tokens)."""
    return await get_overview_payload()


class InstancePayload(BaseModel):
    id: str | None = None
    label: str = Field("", max_length=200)
    dashboard_server_id: str = Field("", max_length=200)
    enabled: bool = True
    server_token: str | None = Field(None, max_length=512)


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
