"""Public download of mod XML — authenticated by server_token (same secret the game uses)."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import Response

from app.config import get_settings
from app.services.bot_registry import resolve_auth
from app.services.mod_config_xml import build_mod_config_xml, resolve_backend_url_for_xml

router = APIRouter(prefix="/api/mod", tags=["mod"])


@router.get("/config.xml")
async def download_mod_config_xml(
    request: Request,
    server_token: str = Query(..., min_length=1, description="Same token as in the Lua mod / bot profile"),
) -> Response:
    """
    Download `ai_farm_manager_config.xml` for curl/scripts — no hand-editing.
    Set PUBLIC_BASE_URL in .env so backendUrl in the XML matches your public API host.
    """
    ok, err, _, _ = resolve_auth(server_token)
    if not ok:
        raise HTTPException(status_code=401, detail=err or "Invalid server_token")

    settings = get_settings()
    xml = build_mod_config_xml(
        resolve_backend_url_for_xml(settings, str(request.base_url)),
        server_token,
        settings["trigger_prefix"],
    )
    return Response(
        content=xml,
        media_type="application/xml; charset=utf-8",
        headers={
            "Content-Disposition": 'attachment; filename="ai_farm_manager_config.xml"',
        },
    )
