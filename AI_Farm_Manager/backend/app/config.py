"""Load settings from environment (.env supported via python-dotenv)."""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

from app.prompt_loader import read_system_prompt
from app.services.dashboard_service import build_dashboard_fetch_url

# Always load backend/.env (not only when CWD happens to be the backend folder).
_backend_root = Path(__file__).resolve().parent.parent
load_dotenv(_backend_root / ".env")


def get_backend_root() -> Path:
    """Directory containing `data/`, `.env`, and the `app` package (the `backend` folder)."""
    return _backend_root


def _dashboard_fetch_url() -> str:
    """Legacy global dashboard URL (used when bot_servers.json has no instances)."""
    base = os.getenv("DASHBOARD_JSON_URL", "").strip()
    sid = os.getenv("DASHBOARD_SERVER_ID", "").strip()
    return build_dashboard_fetch_url(base, sid or None)


def _b(name: str, default: bool = False) -> bool:
    v = os.getenv(name, str(default)).lower().strip()
    return v in ("1", "true", "yes", "on")


def _bot_enabled() -> bool:
    """ENABLE_AI_BOT (preferred); if unset, BOT_ENABLED for older .env files."""
    if os.getenv("ENABLE_AI_BOT") is not None:
        return _b("ENABLE_AI_BOT", False)
    return _b("BOT_ENABLED", False)


def _gemini_api_endpoint() -> str:
    v = os.getenv("GEMINI_API_ENDPOINT", "generativelanguage").lower().strip()
    if v in ("aiplatform", "vertex", "google-cloud"):
        return "aiplatform"
    return "generativelanguage"


@lru_cache
def get_settings() -> dict:
    llm_provider = os.getenv("LLM_PROVIDER", "openai").lower().strip()
    llm_api_key = os.getenv("LLM_API_KEY", "")
    gemini_api_key = os.getenv("GEMINI_API_KEY", "")
    be = _bot_enabled()
    if llm_provider == "gemini":
        llm_configured = be and bool(gemini_api_key)
    else:
        llm_configured = be and bool(llm_api_key)

    return {
        "server_token": os.getenv("SERVER_TOKEN", ""),
        "llm_api_key": llm_api_key,
        "llm_model": os.getenv("LLM_MODEL", "gpt-4o-mini"),
        "llm_provider": llm_provider,
        "gemini_api_key": gemini_api_key,
        "gemini_model": os.getenv("GEMINI_MODEL", "gemini-1.5-flash"),
        # generativelanguage = AI Studio (AIza…); aiplatform = Vertex publisher API (Cloud API key)
        "gemini_api_endpoint": _gemini_api_endpoint(),
        "dashboard_json_url": os.getenv("DASHBOARD_JSON_URL", "").strip(),
        "dashboard_server_id": os.getenv("DASHBOARD_SERVER_ID", "").strip(),
        "dashboard_fetch_url": _dashboard_fetch_url(),
        "bot_enabled": be,
        "llm_configured": llm_configured,
        "trigger_prefix": os.getenv("TRIGGER_PREFIX", "!bot").strip(),
        "game_reference_enabled": _b("GAME_REFERENCE_ENABLED", True),
        # Optional override; if unset, backend uses MAIN_CODEBASE/dataS_py_extracted/l10n/l10n_en.xml
        "game_reference_l10n": os.getenv("GAME_REFERENCE_L10N", "").strip() or None,
        "system_prompt": read_system_prompt(
            os.getenv(
                "SYSTEM_PROMPT",
                "You are a helpful AI farm assistant for Farming Simulator 25.",
            ).strip()
        ),
        "admin_username": os.getenv("ADMIN_USERNAME", "admin"),
        "admin_password": os.getenv("ADMIN_PASSWORD", ""),
        "cors_origins": os.getenv("CORS_ORIGINS", "*"),
        # Used in generated mod config XML (backendUrl). Set on VPS to https://your-domain (no path).
        "public_base_url": os.getenv("PUBLIC_BASE_URL", "").strip().rstrip("/"),
    }
