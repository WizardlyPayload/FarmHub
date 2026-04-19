"""Admin UI + settings API (HTTP Basic)."""
from __future__ import annotations

import os
from typing import Any

from fastapi import APIRouter, Depends, Form, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, RedirectResponse, Response
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel

from app.config import (
    get_backend_root,
    get_settings,
    has_gemini_credentials,
    raw_openai_or_ollama_base_url,
    reload_backend_dotenv,
)
from app.prompt_loader import write_system_prompt
from app.routers.consultant import compute_consultant_insights
from app.routers.integration import get_overview_payload
from app.services import connection_registry
from app.services.connection_registry import DEFAULT_BUCKET_ID
from app.services.bot_registry import delete_instance, find_instance_by_id, upsert_instance
from app.services.mod_config_xml import build_mod_config_xml, resolve_backend_url_for_xml
from app.services.log_buffer import get_recent_logs
from app.services.log_buffer import log_event as push_log
from app.services.llm_service import (
    gemini_admin_test_no_429_wait_begin,
    gemini_admin_test_no_429_wait_end,
)

router = APIRouter(tags=["admin"])
security = HTTPBasic(auto_error=False)

_templates = Jinja2Templates(directory=os.path.join(os.path.dirname(__file__), "..", "templates"))


def _mask_secret(raw: str | None, head: int = 4, tail: int = 4) -> str:
    s = (raw or "").strip()
    if not s:
        return "(not set — add FARMDASH_INTEGRATION_KEY to the server environment)"
    if len(s) <= head + tail + 1:
        return "•" * min(len(s), 12) + " (short key)"
    return f"{s[:head]}…{s[-tail:]} ({len(s)} chars)"


def require_admin(credentials: HTTPBasicCredentials | None = Depends(security)) -> str:
    s = get_settings()
    user = s["admin_username"]
    pw = s["admin_password"]
    if not pw:
        raise HTTPException(503, "Admin password not configured (set ADMIN_PASSWORD in .env)")
    if credentials is None or credentials.username != user or credentials.password != pw:
        raise HTTPException(
            status_code=401,
            detail="Unauthorized",
            headers={"WWW-Authenticate": "Basic realm=admin"},
        )
    return credentials.username


@router.get("/admin", response_class=HTMLResponse)
async def admin_page(request: Request, _: str = Depends(require_admin)) -> HTMLResponse:
    s = get_settings()
    overview = await get_overview_payload()
    qtab = (request.query_params.get("tab") or "").strip().lower()
    allowed_tabs = ("overview", "clients", "farm", "bot", "hank", "mod", "logs")
    active_tab = qtab if qtab in allowed_tabs else "overview"
    reveal_cid = (request.query_params.get("reveal") or "").strip()
    revealed_key = connection_registry.take_pending_key_for_admin(reveal_cid) if reveal_cid else None
    _env_path = get_backend_root() / ".env"
    # Explicit render avoids rare Jinja2 cache / TemplateResponse arg issues on some Starlette+Jinja builds.
    _base = str(request.base_url).rstrip("/")
    _invite = (s.get("farmdash_invite_base_url") or "").strip().rstrip("/")
    ctx: dict[str, Any] = {
        "request": request,
        "active_tab": active_tab,
        "client_server_url_display": _invite or _base,
        "env_file_path": str(_env_path),
        "env_file_exists": _env_path.is_file(),
        "bot_enabled": s["bot_enabled"],
        "trigger_prefix": s["trigger_prefix"],
        "dashboard_url": s["dashboard_json_url"],
        "dashboard_server_id": s.get("dashboard_server_id", ""),
        "llm_model": s["llm_model"],
        "llm_provider": s["llm_provider"],
        "openai_base_url": raw_openai_or_ollama_base_url(),
        "gemini_model": s.get("gemini_model", "gemini-2.5-flash"),
        "gemini_api_endpoint": s.get("gemini_api_endpoint", "generativelanguage"),
        "system_prompt": s["system_prompt"],
        "has_llm_key": bool(s["llm_api_key"]) or bool((s.get("openai_base_url") or "").strip()),
        "has_gemini_key": has_gemini_credentials(s),
        "dashboard_push_mode": bool(s.get("dashboard_push_mode")),
        "llm_configured": bool(s.get("llm_configured")),
        "openai_base_configured": bool(s.get("openai_base_configured")),
        "public_base_url": (s.get("public_base_url") or "").strip(),
        "farmdash_invite_base_url": (s.get("farmdash_invite_base_url") or "").strip(),
        "farmdash_integration_key_masked": _mask_secret(os.getenv("FARMDASH_INTEGRATION_KEY")),
        "encryption_key_configured": bool(s.get("encryption_key_configured")),
        "overview": overview,
        "farmdash_connections": connection_registry.list_connections(),
        "revealed_new_key": revealed_key,
        "reveal_connection_id": reveal_cid if revealed_key else "",
    }
    for cp in _templates.context_processors:
        ctx.update(cp(request))
    html = _templates.env.get_template("admin.html").render(ctx)
    return HTMLResponse(html)


def _admin_redirect_url(tab: str | None, *, reveal: str | None = None) -> str:
    allowed = ("overview", "clients", "farm", "bot", "hank", "mod", "logs")
    if tab and tab.strip().lower() in allowed:
        u = f"/admin?tab={tab.strip().lower()}"
        if reveal and reveal.strip():
            u += f"&reveal={reveal.strip()}"
        return u
    return "/admin"


class SettingsUpdate(BaseModel):
    bot_enabled: bool | None = None
    trigger_prefix: str | None = None
    dashboard_json_url: str | None = None
    llm_api_key: str | None = None
    llm_model: str | None = None
    llm_provider: str | None = None
    system_prompt: str | None = None


def _write_env_updates(updates: dict[str, str]) -> None:
    """Merge updates into backend `.env` (simple key=value lines).

    Creates the file if missing (Docker/Coolify often inject env via `env_file` without a real `/app/.env`).
    """
    env_path = get_backend_root() / ".env"
    if env_path.is_file():
        lines = env_path.read_text(encoding="utf-8").splitlines(keepends=True)
    else:
        env_path.parent.mkdir(parents=True, exist_ok=True)
        lines = [
            "# Auto-created — settings from /admin were saved here.\n"
            "# For a full template, copy backend/.env.example locally and merge as needed.\n"
        ]

    keys = set(updates.keys())
    out: list[str] = []
    seen: set[str] = set()
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            out.append(line)
            continue
        k = stripped.split("=", 1)[0].strip()
        if k in keys:
            seen.add(k)
            out.append(f"{k}={updates[k]}\n")
        else:
            out.append(line)
    for k, v in updates.items():
        if k not in seen:
            out.append(f"{k}={v}\n")

    try:
        env_path.write_text("".join(out), encoding="utf-8")
    except OSError as e:
        push_log(
            "WARN",
            "Admin could not write .env",
            path=str(env_path),
            error=str(e),
        )
        raise HTTPException(
            status_code=503,
            detail=(
                f"Cannot write settings file ({env_path}): {e}. "
                "Use a writable path (e.g. bind-mount host .env to /app/.env in Docker) "
                "or change variables only in Coolify / compose environment."
            ),
        ) from e
    reload_backend_dotenv(override=True)
    get_settings.cache_clear()


@router.post("/admin/api/settings")
async def admin_save_settings(
    request: Request,
    _: str = Depends(require_admin),
    bot_enabled: str | None = Form(None),
    trigger_prefix: str | None = Form(None),
    dashboard_json_url: str | None = Form(None),
    dashboard_server_id: str | None = Form(None),
    dashboard_push_mode: str | None = Form(None),
    llm_api_key: str | None = Form(None),
    llm_model: str | None = Form(None),
    llm_provider: str | None = Form(None),
    openai_base_url: str | None = Form(None),
    gemini_api_key: str | None = Form(None),
    gemini_model: str | None = Form(None),
    gemini_api_endpoint: str | None = Form(None),
    system_prompt: str | None = Form(None),
    farmdash_invite_base_url: str | None = Form(None),
    redirect_tab: str | None = Form(None),
) -> RedirectResponse:
    updates: dict[str, str] = {}
    if bot_enabled is not None:
        updates["ENABLE_AI_BOT"] = "true" if bot_enabled in ("on", "true", "1") else "false"
    if trigger_prefix is not None and trigger_prefix.strip():
        updates["TRIGGER_PREFIX"] = trigger_prefix.strip()
    if dashboard_json_url is not None:
        updates["DASHBOARD_JSON_URL"] = dashboard_json_url.strip()
    if dashboard_server_id is not None:
        updates["DASHBOARD_SERVER_ID"] = dashboard_server_id.strip()
    # Farm tab only — enables POST /api/integration/push-snapshot (PC → server). Written to .env + reloads os.environ.
    if dashboard_push_mode is not None:
        v = (dashboard_push_mode or "").strip().lower()
        updates["DASHBOARD_PUSH_MODE"] = "1" if v in ("1", "true", "on", "yes") else "0"
    # Client connections tab — URL players paste in Farm Dashboard (http://host:port, no path).
    if farmdash_invite_base_url is not None:
        updates["FARMDASH_INVITE_BASE_URL"] = farmdash_invite_base_url.strip().rstrip("/")
    if llm_api_key is not None and llm_api_key.strip():
        updates["LLM_API_KEY"] = llm_api_key.strip()
    if llm_model is not None and llm_model.strip():
        updates["LLM_MODEL"] = llm_model.strip()
    if llm_provider is not None and llm_provider.strip():
        updates["LLM_PROVIDER"] = llm_provider.strip().lower()
    if openai_base_url is not None:
        updates["OPENAI_BASE_URL"] = openai_base_url.strip()
    if gemini_api_key is not None and gemini_api_key.strip():
        updates["GEMINI_API_KEY"] = gemini_api_key.strip()
    if gemini_model is not None and gemini_model.strip():
        updates["GEMINI_MODEL"] = gemini_model.strip()
    if gemini_api_endpoint is not None and gemini_api_endpoint.strip():
        updates["GEMINI_API_ENDPOINT"] = gemini_api_endpoint.strip().lower()
    if system_prompt is not None:
        write_system_prompt(system_prompt)
        get_settings.cache_clear()

    if updates:
        _write_env_updates(updates)
        push_log("INFO", "Admin updated settings", keys=list(updates.keys()))

    return RedirectResponse(url=_admin_redirect_url(redirect_tab), status_code=303)


@router.get("/admin/api/test-llm")
async def admin_test_llm(
    _: str = Depends(require_admin),
    connectionId: str | None = Query(
        None,
        description="Optional: Farmdash connection UUID — use that client's per-connection snapshot routing (Admin → Client connections).",
    ),
    serverId: str | None = Query(
        None,
        description="Same as Farm Dashboard consultant ?serverId= (else DASHBOARD_SERVER_ID / push buffer).",
    ),
    farmId: int | None = Query(
        None,
        ge=1,
        description="Same as Farm Dashboard ?farmId= (active farm); omit to use snapshot activeFarmId.",
    ),
    view: str | None = Query(
        None,
        description="Same as Farm Dashboard ?view= (section-scoped consultant).",
    ),
    context: str = Query(
        "full",
        description="Same as GET /api/v1/consultant/insights (full = Smart suggestions).",
    ),
) -> dict[str, Any]:
    """
    Same pipeline as Farm Dashboard Smart suggestions: ``GET /api/v1/consultant/insights`` with server API keys.
    """
    ctx = (context or "full").strip().lower()
    if ctx not in ("full", "fields"):
        ctx = "full"
    # Avoid multi-minute stalls from GEMINI 429 sleep × keys (proxies often timeout & the button looks "broken").
    _tok = gemini_admin_test_no_429_wait_begin()
    bucket = DEFAULT_BUCKET_ID
    cid = (connectionId or "").strip()
    if cid:
        if connection_registry.get_connection(cid):
            bucket = cid
        else:
            return {
                "ok": False,
                "mode": "consultant_insights",
                "detail": f"Unknown connectionId {cid!r}",
                "status_code": 404,
            }
    try:
        resp = await compute_consultant_insights(
            server_id=serverId,
            farm_id=farmId,
            field_ref=None,
            context=ctx,
            view=view,
            user_api_key=None,
            user_provider=None,
            connection_bucket_id=bucket,
        )
    except HTTPException as e:
        det = e.detail
        if not isinstance(det, str):
            det = str(det)
        push_log(
            "WARN",
            "Admin consultant test failed",
            status_code=e.status_code,
            detail=det[:400],
        )
        return {
            "ok": False,
            "mode": "consultant_insights",
            "detail": det,
            "status_code": e.status_code,
        }
    finally:
        gemini_admin_test_no_429_wait_end(_tok)

    preview: list[dict[str, Any]] = []
    for ins in resp.insights[:8]:
        preview.append(
            {
                "category": ins.category.value,
                "priority": ins.priority.value,
                "message": (ins.message or "")[:280],
                "reasoning": (ins.reasoning or "")[:280],
                "field_ref": ins.field_ref,
            }
        )
    s2 = get_settings()
    prov = (s2.get("llm_provider") or "").strip().lower()
    model_out = (
        (s2.get("gemini_model") or "")
        if prov == "gemini"
        else (s2.get("llm_model") or "")
    )
    push_log(
        "INFO",
        "Admin consultant test OK",
        llm_used=resp.llm_used,
        insight_count=len(resp.insights),
        provider=prov,
    )
    return {
        "ok": True,
        "mode": "consultant_insights",
        "llm_used": resp.llm_used,
        "insight_count": len(resp.insights),
        "insights_preview": preview,
        "detail": (
            "Same as GET /api/v1/consultant/insights "
            f"(context={ctx!r}, server API keys). llm_used={resp.llm_used}."
            + (
                " Insights may be rule-based only (e.g. storage/production fill) — the Gemini call did not "
                "return usable JSON; check Admin → API logs for WARNING lines (HTTP errors, parse failures)."
                if not resp.llm_used
                else ""
            )
        ),
        "provider": prov,
        "model": model_out,
    }


@router.get("/admin/api/logs")
async def admin_logs(tail: int = 200, _: str = Depends(require_admin)) -> dict[str, Any]:
    items, total = get_recent_logs(tail)
    return {"logs": items, "total": total}


@router.get("/admin/api/bot-config.xml")
async def admin_download_bot_config_xml(
    request: Request,
    _: str = Depends(require_admin),
    instance_id: str = Query(..., min_length=1),
) -> Response:
    """Download generated mod config XML (no hand-editing) for a bot profile."""
    inst = find_instance_by_id(instance_id.strip())
    if not inst:
        raise HTTPException(404, "Instance not found")
    s = get_settings()
    xml = build_mod_config_xml(
        resolve_backend_url_for_xml(s, str(request.base_url)),
        str(inst.get("server_token") or ""),
        s["trigger_prefix"],
    )
    return Response(
        content=xml,
        media_type="application/xml; charset=utf-8",
        headers={
            "Content-Disposition": 'attachment; filename="ai_farm_manager_config.xml"',
        },
    )


@router.post("/admin/api/bot/save")
async def admin_bot_save(
    _: str = Depends(require_admin),
    label: str = Form(""),
    dashboard_server_id: str = Form(""),
    enabled: str = Form("true"),
    server_token: str = Form(""),
    instance_id: str = Form(""),
) -> RedirectResponse:
    """Create or update a bot instance (multi-server)."""
    try:
        enabled_bool = enabled not in ("false", "0", "off", "")
        upsert_instance(
            instance_id.strip() or None,
            label,
            dashboard_server_id,
            enabled_bool,
            server_token.strip() or None,
        )
        push_log("INFO", "Admin saved bot instance", label=label)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    return RedirectResponse(url=_admin_redirect_url("mod"), status_code=303)


@router.post("/admin/api/bot/delete")
async def admin_bot_delete(
    _: str = Depends(require_admin),
    instance_id: str = Form(...),
) -> RedirectResponse:
    if not delete_instance(instance_id.strip()):
        raise HTTPException(404, "Instance not found")
    push_log("INFO", "Admin deleted bot instance", instance_id=instance_id)
    return RedirectResponse(url=_admin_redirect_url("mod"), status_code=303)


@router.post("/admin/api/connections/create")
async def admin_connection_create(
    _: str = Depends(require_admin),
    label: str = Form(""),
    redirect_tab: str | None = Form(None),
) -> RedirectResponse:
    try:
        row = connection_registry.create_connection(label)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    push_log("INFO", "Farm Dashboard connection created", connection_id=row["id"])
    tab = (redirect_tab or "clients").strip().lower()
    if tab not in ("clients",):
        tab = "clients"
    return RedirectResponse(
        url=_admin_redirect_url(tab, reveal=row["id"]),
        status_code=303,
    )


@router.post("/admin/api/connections/update")
async def admin_connection_update(
    _: str = Depends(require_admin),
    connection_id: str = Form(...),
    dashboard_server_id: str = Form(""),
    dashboard_json_url: str = Form(""),
    redirect_tab: str | None = Form(None),
) -> RedirectResponse:
    if not connection_registry.update_connection_settings(
        connection_id.strip(),
        dashboard_server_id=dashboard_server_id,
        dashboard_json_url=dashboard_json_url,
    ):
        raise HTTPException(404, "Connection not found")
    push_log(
        "INFO",
        "Farm Dashboard connection routing updated",
        connection_id=connection_id.strip(),
    )
    return RedirectResponse(url=_admin_redirect_url(redirect_tab or "clients"), status_code=303)


@router.post("/admin/api/connections/delete")
async def admin_connection_delete(
    _: str = Depends(require_admin),
    connection_id: str = Form(...),
    redirect_tab: str | None = Form(None),
) -> RedirectResponse:
    if not connection_registry.delete_connection(connection_id.strip()):
        raise HTTPException(404, "Connection not found")
    push_log("INFO", "Farm Dashboard connection deleted", connection_id=connection_id.strip())
    return RedirectResponse(url=_admin_redirect_url(redirect_tab or "clients"), status_code=303)
