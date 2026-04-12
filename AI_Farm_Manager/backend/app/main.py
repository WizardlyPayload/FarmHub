"""AI Farm Manager — FastAPI entrypoint."""
from __future__ import annotations

import asyncio
import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, Response
from fastapi.templating import Jinja2Templates
from starlette.middleware.gzip import GZipMiddleware

from app.config import get_settings
from app.deps.integration_auth import resolve_root_html_auth
from app.routers import admin_routes, chat, consultant, integration, mod_config_download
from app.services import ftp_service


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.services.bootstrap_env import ensure_farmdash_integration_key_if_missing
    from app.services.encryption import ensure_encryption_configured

    ensure_encryption_configured()
    ensure_farmdash_integration_key_if_missing()

    async def _startup_llm_probe() -> None:
        """Background: ping configured LLM so logs show whether keys/model work (does not block bind)."""
        await asyncio.sleep(1.5)
        raw = (os.getenv("STARTUP_LLM_PROBE") or "1").strip().lower()
        if raw in ("0", "false", "no", "off"):
            return
        try:
            from app.services.log_buffer import log_event
            from app.services.llm_service import test_llm_connectivity

            out = await test_llm_connectivity(
                probe_message='Hi — are you there? Reply in one short sentence (max 20 words).',
            )
            detail = (out.get("detail") or "").strip()
            if not out.get("ok") and "not set" in detail.lower():
                log_event("INFO", "Startup LLM check skipped — no API key for selected provider")
                return
            if out.get("ok"):
                log_event(
                    "INFO",
                    "Startup LLM check OK",
                    provider=out.get("provider"),
                    latency_ms=out.get("latency_ms"),
                    model=out.get("model"),
                    reply_preview=detail[:240] if detail else None,
                )
            else:
                log_event(
                    "WARN",
                    "Startup LLM check failed",
                    provider=out.get("provider"),
                    latency_ms=out.get("latency_ms"),
                    model=out.get("model"),
                    detail=detail[:500] if detail else None,
                )
        except Exception as e:
            from app.services.log_buffer import log_event

            log_event("ERROR", f"Startup LLM check error: {e}")

    asyncio.create_task(_startup_llm_probe())

    from app.services.gemini_http_client import get_gemini_async_client

    get_gemini_async_client()

    stop = asyncio.Event()
    poll_task: asyncio.Task | None = None
    if ftp_service.is_ftp_mode_enabled():
        await ftp_service.run_initial_ftp_fetch()
        poll_task = asyncio.create_task(ftp_service.ftp_poll_loop(stop))
    yield
    stop.set()
    if poll_task is not None:
        poll_task.cancel()
        try:
            await poll_task
        except asyncio.CancelledError:
            pass
    from app.services.gemini_http_client import close_gemini_async_client

    await close_gemini_async_client()


app = FastAPI(title="AI Farm Manager", version="1.0.0", lifespan=lifespan)
app.add_middleware(GZipMiddleware, minimum_size=800)

_s = get_settings()
_origins = [o.strip() for o in _s["cors_origins"].split(",") if o.strip()]
# Wildcard origin must not use allow_credentials=True (browser spec + avoids accidental loose creds).
_cors_creds = _origins != ["*"] and bool(_origins)
if _origins == ["*"]:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_origins or ["*"],
        allow_credentials=_cors_creds,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.include_router(chat.router)
app.include_router(admin_routes.router)
app.include_router(integration.router)
app.include_router(consultant.router)
app.include_router(mod_config_download.router)

_templates = Jinja2Templates(directory=os.path.join(os.path.dirname(__file__), "templates"))


@app.get("/", response_class=HTMLResponse, include_in_schema=False)
async def root(
    request: Request,
    _auth: str = Depends(resolve_root_html_auth),
) -> HTMLResponse:
    """Farm snapshot dashboard (in-memory JSON from FTP or placeholder).

    When ``REQUIRE_AUTH_FOR_ROOT_HTML=1``, requires the same auth as ``/api/integration/*``
    (``X-FarmDash-Key``, optional ``?farmdash_key=``, or admin Basic).
    """
    del _auth  # dependency side effect only
    data = ftp_service.get_dashboard_dict()
    _, mem_err = ftp_service.get_dashboard_json_from_memory()
    ctx = {
        "request": request,
        "snapshot": data,
        "ftp_mode": ftp_service.is_ftp_mode_enabled(),
        "snapshot_error": mem_err if data is None else None,
    }
    return _templates.TemplateResponse(request, "dashboard.html", ctx)


@app.get("/favicon.ico", include_in_schema=False)
async def favicon() -> Response:
    """Silence browser favicon requests (no file bundled)."""
    return Response(status_code=204)


_static = os.path.join(os.path.dirname(__file__), "static")
if os.path.isdir(_static):
    from fastapi.staticfiles import StaticFiles

    app.mount("/static", StaticFiles(directory=_static), name="static")


def _health_is_minimal() -> bool:
    v = (os.getenv("HEALTH_RESPONSE_DETAIL") or "full").strip().lower()
    return v in ("minimal", "min", "slim")


@app.get("/health")
@app.get("/healthz", include_in_schema=False)
async def health() -> dict:
    """Liveness for Coolify / Docker / probes. Same JSON at ``/health`` and ``/healthz``."""
    import os

    from app.config import get_backend_root, get_data_dir, get_settings
    from app.services.bot_registry import get_registry_path, load_registry

    base = {"status": "ok", "service": "ai-farm-manager"}
    if _health_is_minimal():
        return base

    reg = load_registry()
    n = len(reg.get("instances") or [])
    path = get_registry_path()
    st = (os.getenv("SERVER_TOKEN") or "").strip()
    base.update(
        {
            "backend_root": str(get_backend_root()),
            "data_dir": str(get_data_dir()),
            "bot_profiles_loaded": n,
            "registry_file": path,
            "registry_file_exists": os.path.isfile(path),
            "legacy_server_token_set": len(st) > 0,
            "ftp_dashboard": ftp_service.is_ftp_mode_enabled(),
            "dashboard_push_mode": get_settings().get("dashboard_push_mode", False),
            "encryption_at_rest": get_settings().get("encryption_key_configured", False),
        }
    )
    return base
