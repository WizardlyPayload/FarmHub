"""Generate missing env secrets on first boot so operators need fewer manual steps."""
from __future__ import annotations

import logging
import os
import secrets

from app.config import get_backend_root, get_settings, reload_backend_dotenv

logger = logging.getLogger(__name__)


def _env_file_has_nonempty_farmdash_key(text: str) -> bool:
    for line in text.splitlines():
        s = line.strip()
        if not s.startswith("FARMDASH_INTEGRATION_KEY="):
            continue
        v = s.split("=", 1)[1].strip().strip('"').strip("'")
        return len(v) >= 16
    return False


def ensure_farmdash_integration_key_if_missing() -> None:
    """
    If FARMDASH_INTEGRATION_KEY is unset, generate one and append to backend/.env.

    Embed the same value in Farm Dashboard ``branding.json`` (``embeddedFarmdashIntegrationKey``)
    for your release build. Disable with AUTO_GENERATE_FARMDASH_INTEGRATION_KEY=0.
    """
    if (os.getenv("FARMDASH_INTEGRATION_KEY") or "").strip():
        return
    flag = (os.getenv("AUTO_GENERATE_FARMDASH_INTEGRATION_KEY") or "1").strip().lower()
    if flag in ("0", "false", "no", "off"):
        return

    key = secrets.token_urlsafe(32)
    env_path = get_backend_root() / ".env"
    env_path.parent.mkdir(parents=True, exist_ok=True)
    block = (
        "\n# Auto-generated — copy into Farm Desktop branding.json as embeddedFarmdashIntegrationKey\n"
        f"FARMDASH_INTEGRATION_KEY={key}\n"
    )
    if env_path.is_file():
        text = env_path.read_text(encoding="utf-8")
        if _env_file_has_nonempty_farmdash_key(text):
            return
        lines = [
            ln
            for ln in text.splitlines()
            if not ln.strip().startswith("FARMDASH_INTEGRATION_KEY=")
        ]
        text = "\n".join(lines) + ("\n" if lines else "")
        env_path.write_text(text.rstrip() + block, encoding="utf-8")
    else:
        env_path.write_text(
            "# AI Farm Manager — see backend/.env.example\n" + block.lstrip("\n"),
            encoding="utf-8",
        )
    reload_backend_dotenv(override=True)
    get_settings.cache_clear()
    logger.warning(
        "Generated FARMDASH_INTEGRATION_KEY in %s — add the same value to client branding.json for your EXE build.",
        env_path,
    )
