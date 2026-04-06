"""Farm dashboard snapshot: in-memory JSON from FTP (cloud) or optional HTTP URL (local dev)."""
from __future__ import annotations

import json
from typing import Any
from urllib.parse import quote

import httpx

from app.services import ftp_service
from app.services.log_buffer import log_event


def build_dashboard_fetch_url(base_url: str, server_id: str | None) -> str:
    """
    Append ?serverId= / &serverId= when needed so /api/data targets the correct Farm Dashboard server.
    """
    base = (base_url or "").strip()
    if not base:
        return ""
    sid = (server_id or "").strip()
    if not sid or "serverId=" in base:
        return base
    sep = "&" if "?" in base else "?"
    return f"{base}{sep}serverId={quote(sid, safe='')}"


async def fetch_dashboard_json(url: str | None, timeout: float = 8.0) -> tuple[str | None, str | None]:
    """
    Returns (json_string, error_message).
    Cloud: reads JSON loaded by ftp_service from G-Portal FTP `data.json`.
    Local: if FTP is not configured, falls back to HTTP GET `url` (legacy Farm Dashboard app).
    """
    mem, mem_err = ftp_service.get_dashboard_json_from_memory()
    if mem is not None:
        return mem, None
    if ftp_service.is_ftp_mode_enabled():
        return None, mem_err or "Dashboard snapshot not available"

    if not url:
        return None, "DASHBOARD_JSON_URL is not configured"
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            r = await client.get(url)
            r.raise_for_status()
            text = r.text
            json.loads(text)
            return text, None
    except Exception as e:
        log_event("WARN", f"Dashboard fetch failed: {e}")
        return None, str(e)


def build_dashboard_context_block(raw_json: str | None, err: str | None) -> str:
    if raw_json:
        waiting_note = ""
        try:
            data = json.loads(raw_json)
            if isinstance(data, dict) and data.get("error"):
                em = str(data.get("error", "")).lower()
                if "waiting" in em or "no data" in em:
                    waiting_note = (
                        "NOTE: The Farm Dashboard has not received live game data yet "
                        "(e.g. game not running, mod not exporting, or wrong server). "
                        "Do not invent numbers; say data is not available yet.\n\n"
                    )
        except Exception:
            pass
        return (
            waiting_note
            + "Current farm dashboard snapshot (JSON). Use it for factual answers; "
            "if a field is missing, say you do not see it.\n```json\n"
            + raw_json[:120000]
            + "\n```"
        )
    return (
        "Dashboard data is unavailable. Tell the player briefly that live dashboard "
        f"data could not be loaded ({err or 'unknown error'}) and answer only from general knowledge."
    )
