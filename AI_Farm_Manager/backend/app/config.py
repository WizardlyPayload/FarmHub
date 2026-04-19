"""Load settings from environment (.env supported via python-dotenv)."""
from __future__ import annotations

import logging
import os
import time
from functools import lru_cache
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

from app.prompt_loader import read_system_prompt
from app.services.dashboard_service import build_dashboard_fetch_url

logger = logging.getLogger(__name__)

# Always load backend/.env (not only when CWD happens to be the backend folder).
# override=True: values in `.env` win over duplicate keys already injected by Docker / Coolify / systemd.
# Without this, Coolify's env blocks admin-saved keys on every process restart until the file is ignored.
_backend_root = Path(__file__).resolve().parent.parent
load_dotenv(_backend_root / ".env", override=True)


def get_backend_root() -> Path:
    """Directory containing `data/`, `.env`, and the `app` package (the `backend` folder)."""
    return _backend_root


def reload_backend_dotenv(*, override: bool = True) -> None:
    """Re-read `backend/.env` into `os.environ` (e.g. after admin UI writes the file)."""
    load_dotenv(_backend_root / ".env", override=override)


def get_data_dir() -> Path:
    """
    Persistent data directory for `bot_servers.json` and other runtime files.

    Docker Compose maps `./data:/app/data` so this resolves to `/app/data` in the container.
    Override with `DATA_DIR` if needed (absolute path recommended).
    """
    override = (os.getenv("DATA_DIR") or "").strip()
    if override:
        return Path(override).resolve()
    return get_backend_root() / "data"


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


def _gemini_rest_api_version() -> str:
    """Path segment for AI Studio REST: v1 (current docs / gemini-2.5+) or v1beta."""
    v = (os.getenv("GEMINI_REST_API_VERSION") or "v1").strip().lower()
    return v if v in ("v1", "v1beta") else "v1"


def _clamp_int(raw: str, lo: int, hi: int, default: int) -> int:
    try:
        v = int((raw or "").strip())
    except (TypeError, ValueError):
        return default
    return max(lo, min(hi, v))


def _strip_key(s: str) -> str:
    return (s or "").strip().replace("\ufeff", "").replace("\u200b", "").replace("\r", "")


def _chat_allowed_ip_set() -> frozenset[str] | None:
    """Comma-separated IPs; None = allow all. Matches FS25 handover optional chat IP hardening."""
    raw = (os.getenv("CHAT_ALLOWED_IPS") or "").strip()
    if not raw:
        return None
    return frozenset(x.strip() for x in raw.split(",") if x.strip())


def _parse_gemini_key_list(llm_provider: str, llm_api_key: str) -> tuple[list[str], int]:
    """
    Ordered unique Gemini keys for rotation and 429 fallback, plus a raw slot count.

    All of the following are merged (first occurrence sets order; duplicates are skipped):

    - ``GEMINI_API_KEYS`` (comma- or newline-separated), if set
    - ``GEMINI_API_KEY`` (and ``LLM_API_KEY`` when provider is gemini and it looks like ``AIza…``)
    - ``GEMINI_API_KEY_2`` … ``GEMINI_API_KEY_16``

    The second return value counts **non-empty env slots** (before dedupe). If it is greater than
    ``len(keys)``, the same key string was repeated in multiple variables.
    """
    keys: list[str] = []
    seen: set[str] = set()
    raw_slots = 0

    def consider(raw: str) -> None:
        nonlocal raw_slots
        k = _strip_key(raw)
        if not k:
            return
        raw_slots += 1
        if k not in seen:
            seen.add(k)
            keys.append(k)

    raw_multi = (os.getenv("GEMINI_API_KEYS") or "").strip()
    if raw_multi:
        for part in raw_multi.replace("\n", ",").split(","):
            consider(part)

    primary = _strip_key(os.getenv("GEMINI_API_KEY", ""))
    if llm_provider == "gemini" and not primary:
        lk = _strip_key(llm_api_key)
        if lk.startswith("AIza"):
            primary = lk
    consider(primary)

    for i in range(2, 17):
        consider(os.getenv(f"GEMINI_API_KEY_{i}", ""))

    return keys, raw_slots


def active_gemini_api_key(settings: dict[str, Any]) -> str:
    """
    Pick the Gemini key for this request.

    If ``gemini_api_keys`` has more than one entry, rotate by wall-clock time: the
    window ``gemini_rotation_window_sec`` (default 900) is split into equal slots
    so each key is active for ``window / N`` seconds before the next key.
    BYOK / single-key dicts use the sole ``gemini_api_key`` string.
    """
    lst = settings.get("gemini_api_keys")
    if isinstance(lst, list) and len(lst) > 1:
        window = int(settings.get("gemini_rotation_window_sec") or 900)
        window = max(60, min(window, 86400))
        n = len(lst)
        tmod = time.time() % float(window)
        idx = int(tmod * n // window)
        if idx >= n:
            idx = n - 1
        return _strip_key(lst[idx])
    single = _strip_key(settings.get("gemini_api_key") or "")
    if single:
        return single
    if isinstance(lst, list) and len(lst) == 1:
        return _strip_key(lst[0])
    return ""


def has_gemini_credentials(settings: dict[str, Any]) -> bool:
    """True if server-side Gemini calls can run (single key, multi-key pool, or BYOK merge)."""
    return bool(active_gemini_api_key(settings))


def normalize_openai_base_url_for_sdk(raw: str | None) -> str:
    """
    Normalized OpenAI-compatible API base for ``AsyncOpenAI(base_url=…)``.

    Empty string means use the default OpenAI cloud endpoint (omit ``base_url``).

    Accepts e.g. ``http://192.168.1.10:11434`` — appends ``/v1`` when the path does not already
    include ``/v1`` (Ollama and most proxies expose ``…/v1/chat/completions``).
    """
    s = (raw or "").strip()
    if not s:
        return ""
    s = s.rstrip("/")
    low = s.lower()
    if "/v1" not in low:
        s = f"{s}/v1"
    return s


@lru_cache
def get_settings() -> dict:
    llm_provider = os.getenv("LLM_PROVIDER", "openai").lower().strip()
    llm_api_key = os.getenv("LLM_API_KEY", "")
    gemini_api_key = _strip_key(os.getenv("GEMINI_API_KEY", ""))
    gemini_api_keys, gemini_key_raw_slots = _parse_gemini_key_list(llm_provider, llm_api_key)
    if gemini_api_keys:
        gemini_api_key = gemini_api_keys[0]
    if llm_provider == "gemini" and gemini_api_keys:
        n_u, n_r = len(gemini_api_keys), gemini_key_raw_slots
        if n_r > n_u:
            logger.info(
                "Gemini API key pool: %s unique key(s), %s non-empty env slot(s) — %s duplicate slot(s) "
                "(same AIza… string repeated; only unique strings rotate). Key values are not logged.",
                n_u,
                n_r,
                n_r - n_u,
            )
        else:
            logger.info(
                "Gemini API key pool: %s unique key(s), %s env slot(s) (no duplicate strings among slots). "
                "Key values are not logged.",
                n_u,
                n_r,
            )
    be = _bot_enabled()
    openai_base_url = normalize_openai_base_url_for_sdk(os.getenv("OPENAI_BASE_URL", ""))
    openai_base_configured = bool((os.getenv("OPENAI_BASE_URL") or "").strip())
    if llm_provider == "gemini":
        llm_configured = be and bool(gemini_api_keys or gemini_api_key)
    else:
        llm_configured = be and (bool(_strip_key(llm_api_key)) or openai_base_configured)

    rotation_window = _clamp_int(os.getenv("GEMINI_ROTATION_WINDOW_SEC", "900"), 60, 86400, 900)

    return {
        "server_token": os.getenv("SERVER_TOKEN", ""),
        "llm_api_key": llm_api_key,
        "openai_base_url": openai_base_url,
        "llm_model": os.getenv("LLM_MODEL", "gpt-4o-mini"),
        "llm_provider": llm_provider,
        "gemini_api_key": gemini_api_key,
        "gemini_api_keys": gemini_api_keys,
        "gemini_rotation_window_sec": rotation_window,
        # generativelanguage v1: use a current model id (1.5 short names often 404 on v1 — see Google ListModels).
        "gemini_model": os.getenv("GEMINI_MODEL", "gemini-2.5-flash"),
        # generativelanguage = AI Studio (AIza…); aiplatform = Vertex publisher API (Cloud API key)
        "gemini_api_endpoint": _gemini_api_endpoint(),
        "gemini_rest_api_version": _gemini_rest_api_version(),
        "dashboard_json_url": os.getenv("DASHBOARD_JSON_URL", "").strip(),
        "dashboard_server_id": os.getenv("DASHBOARD_SERVER_ID", "").strip(),
        "dashboard_fetch_url": _dashboard_fetch_url(),
        # PC → VPS snapshot POST (/api/integration/push-snapshot); no inbound ports on the gaming PC
        "dashboard_push_mode": _b("DASHBOARD_PUSH_MODE", False),
        "bot_enabled": be,
        "llm_configured": llm_configured,
        # In-game chat trigger — must match modSettings ai_farm_manager_config.xml triggerPrefix (default: Hank).
        "trigger_prefix": os.getenv("TRIGGER_PREFIX", "!hank").strip(),
        "game_reference_enabled": _b("GAME_REFERENCE_ENABLED", True),
        # Optional override; if unset, backend uses MAIN_CODEBASE/dataS_py_extracted/l10n/l10n_en.xml
        "game_reference_l10n": os.getenv("GAME_REFERENCE_L10N", "").strip() or None,
        # In-game Hank chat LLM only (see llm_service). Consultant uses consultant.py prompts.
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
        # Fernet key for encrypting ftp_pass / llm_api_key in bot_servers.json (never store the raw key in git).
        "encryption_key_configured": bool(os.getenv("ENCRYPTION_KEY", "").strip()),
        # Subscription tiers (0=free local, 1=consultant, 2=+chat). When false, all routes behave as tier 2.
        "enable_subscription_tiers": _b("ENABLE_SUBSCRIPTION_TIERS", False),
        # When X-Bot-Instance-Id is omitted, tier checks use this (0–2). Default 2 preserves today’s behaviour.
        "default_subscription_tier": _clamp_int(os.getenv("DEFAULT_SUBSCRIPTION_TIER", "2"), 0, 2, 2),
        # In-game chat: optional IP allowlist (dedicated egress → VPS). Empty = allow any.
        "chat_allowed_ips": _chat_allowed_ip_set(),
        "chat_trust_x_forwarded_for": _b("CHAT_TRUST_X_FORWARDED_FOR", False),
    }
