"""AI Farm Manager — FastAPI entrypoint."""
from __future__ import annotations

import asyncio
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, Response
from fastapi.templating import Jinja2Templates

from app.config import get_settings
from app.routers import admin_routes, chat, consultant, integration, mod_config_download
from app.services import ftp_service


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.services.bootstrap_env import ensure_farmdash_integration_key_if_missing
    from app.services.encryption import ensure_encryption_configured

    ensure_encryption_configured()
    ensure_farmdash_integration_key_if_missing()

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


app = FastAPI(title="AI Farm Manager", version="1.0.0", lifespan=lifespan)

_s = get_settings()
_origins = [o.strip() for o in _s["cors_origins"].split(",") if o.strip()]
if _origins == ["*"]:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_origins,
        allow_credentials=True,
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
async def root(request: Request) -> HTMLResponse:
    """Farm snapshot dashboard (in-memory JSON from FTP or placeholder)."""
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


@app.get("/health")
async def health() -> dict:
    """Liveness + how many bot profiles the running process loaded (0 = wrong/missing data/bot_servers.json)."""
    import os

    from app.config import get_backend_root, get_data_dir, get_settings
    from app.services.bot_registry import get_registry_path, load_registry

    reg = load_registry()
    n = len(reg.get("instances") or [])
    path = get_registry_path()
    st = (os.getenv("SERVER_TOKEN") or "").strip()
    return {
        "status": "ok",
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
