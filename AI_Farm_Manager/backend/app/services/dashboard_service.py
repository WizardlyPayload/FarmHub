"""Farm dashboard snapshot: in-memory JSON from FTP (cloud), PC push (outbound), or HTTP URL (local dev)."""
from __future__ import annotations

import json
from typing import Any
from urllib.parse import parse_qs, quote, urlparse

import httpx

from app.services import ftp_service
from app.services import snapshot_push_service
from app.services.log_buffer import log_event
from app.services.pipeline_log import log_pipeline
from app.services.snapshot_pruner import prune_dashboard_snapshot_for_llm


def _log_snapshot_selected(source: str, raw: str, **extra: Any) -> None:
    try:
        n = len(raw.encode("utf-8"))
    except Exception:
        n = len(raw)
    log_pipeline(
        "snapshot_out",
        f"Dashboard snapshot will be used next (source={source})",
        source=source,
        bytes_utf8=n,
        **extra,
    )


def build_dashboard_fetch_url(base_url: str, server_id: str | None) -> str:
    """
    Append ?serverId= / &serverId= when needed so /api/data targets the correct Farm Dashboard server.

    When ``base_url`` is empty but ``server_id`` is set (e.g. DASHBOARD_PUSH_MODE with no HTTP URL),
    returns a synthetic ``push://`` URL so :func:`server_id_from_dashboard_url` can still resolve the id.
    """
    base = (base_url or "").strip()
    sid = (server_id or "").strip()
    if not base:
        if sid:
            return f"push://farmdash/api/data?serverId={quote(sid, safe='')}"
        return ""
    if not sid or "serverId=" in base:
        return base
    sep = "&" if "?" in base else "?"
    return f"{base}{sep}serverId={quote(sid, safe='')}"


def server_id_from_dashboard_url(url: str | None) -> str:
    """Parse serverId from DASHBOARD_JSON_URL or built fetch URL (for push buffer lookup)."""
    if not (url or "").strip():
        return ""
    try:
        qs = parse_qs(urlparse(url).query)
        v = (qs.get("serverId") or [""])[0]
        return (v or "").strip()
    except Exception:
        return ""


async def fetch_dashboard_json(url: str | None, timeout: float = 8.0) -> tuple[str | None, str | None]:
    """
    Returns (json_string, error_message).

    Precedence when multiple sources exist:

    1. **PC push** (``DASHBOARD_PUSH_MODE=1``) — last POST from Farm Dashboard; preferred when set so
       merged API-shaped JSON from the desktop app is not masked by an older FTP ``data.json``.
    2. **FTP** — G-Portal / cloud ``data.json`` in memory.
    3. **HTTP GET** to ``url`` (``DASHBOARD_JSON_URL`` / local dev).

    If push mode is on but no snapshot has arrived yet, we **fall through** to FTP/HTTP so mixed setups
    still work; once a push exists, it wins on future requests.
    """
    push_wait_detail: str | None = None
    if snapshot_push_service.is_push_mode_enabled():
        sid = server_id_from_dashboard_url(url)
        pushed, perr = snapshot_push_service.get_snapshot_json(sid)
        if pushed is not None:
            _log_snapshot_selected("push", pushed, server_id_query=(sid or ""))
            return pushed, None
        push_wait_detail = perr

    mem, mem_err = ftp_service.get_dashboard_json_from_memory()
    if mem is not None:
        _log_snapshot_selected("ftp", mem)
        return mem, None
    if ftp_service.is_ftp_mode_enabled():
        return None, mem_err or "Dashboard snapshot not available"

    if not url:
        if push_wait_detail:
            return None, push_wait_detail
        return None, "DASHBOARD_JSON_URL is not configured"
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            r = await client.get(url)
            r.raise_for_status()
            text = r.text
            json.loads(text)
            _log_snapshot_selected("http_get", text, url=(url or "")[:200])
            return text, None
    except Exception as e:
        log_event("WARN", f"Dashboard fetch failed: {e}")
        return None, str(e)


def build_dashboard_context_block(raw_json: str | None, err: str | None) -> str:
    if raw_json:
        waiting_note = ""
        payload = raw_json
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
            if isinstance(data, dict):
                pruned = prune_dashboard_snapshot_for_llm(data)
                payload = json.dumps(pruned, ensure_ascii=False, default=str)
            elif isinstance(data, list):
                pruned = prune_dashboard_snapshot_for_llm(data)
                payload = json.dumps(pruned, ensure_ascii=False, default=str)
        except Exception:
            payload = raw_json
        cap = 120000
        if len(payload) > cap:
            payload = payload[:cap] + "\n…(truncated)"
        return (
            waiting_note
            + "Current farm dashboard snapshot (JSON; pruned for token efficiency). Use it for factual answers; "
            "if a field is missing, say you do not see it.\n```json\n"
            + payload
            + "\n```"
        )
    return (
        "Dashboard data is unavailable. Tell the player briefly that live dashboard "
        f"data could not be loaded ({err or 'unknown error'}) and answer only from general knowledge."
    )
