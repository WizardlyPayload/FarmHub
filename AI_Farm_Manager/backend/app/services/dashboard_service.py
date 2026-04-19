"""Farm dashboard snapshot: in-memory JSON from FTP (cloud), PC push (outbound), or HTTP URL (local dev)."""
from __future__ import annotations

import json
from typing import Any
from urllib.parse import parse_qs, quote, urlparse

import httpx

from app.services import ftp_service
from app.services import snapshot_push_service
from app.services.connection_registry import DEFAULT_BUCKET_ID
from app.services.log_buffer import log_event
from app.services.pipeline_log import log_pipeline
from app.services.snapshot_pruner import (
    DEFAULT_LLM_CONTEXT_MAX_UTF8_BYTES,
    prune_dashboard_snapshot_for_llm,
    truncate_snapshot_dict_to_max_utf8_bytes,
)


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


async def fetch_dashboard_json(
    url: str | None,
    timeout: float = 8.0,
    farm_id: int | None = None,
    *,
    connection_bucket_id: str | None = None,
) -> tuple[str | None, str | None]:
    """
    Returns (json_string, error_message).

    Precedence when multiple sources exist:

    1. **PC push** (``DASHBOARD_PUSH_MODE=1``) — last POST from Farm Dashboard; preferred when set so
       merged API-shaped JSON from the desktop app is not masked by an older FTP ``data.json``.
    2. **FTP** — G-Portal / cloud ``data.json`` in memory.
    3. **HTTP GET** to ``url`` (``DASHBOARD_JSON_URL`` / local dev).

    If push mode is on but no snapshot has arrived yet, we **fall through** to FTP/HTTP so mixed setups
    still work; once a push exists, it wins on future requests.

    ``connection_bucket_id`` isolates PC push RAM per registered client key (see Admin → Client connections).
    """
    bucket = (connection_bucket_id or DEFAULT_BUCKET_ID).strip() or DEFAULT_BUCKET_ID
    push_wait_detail: str | None = None
    if snapshot_push_service.is_push_mode_enabled():
        sid = server_id_from_dashboard_url(url)
        pushed, perr, chosen_push_sid = snapshot_push_service.get_snapshot_json(
            bucket, sid, farm_id=farm_id
        )
        if pushed is not None:
            extra: dict[str, Any] = {"server_id_query": sid or ""}
            if chosen_push_sid:
                extra["chosen_push_server_id"] = chosen_push_sid
            if farm_id is not None:
                extra["farm_id_query"] = farm_id
            _log_snapshot_selected("push", pushed, **extra)
            return pushed, None
        push_wait_detail = perr

    mem, mem_err = ftp_service.get_dashboard_json_from_memory()
    if mem is not None:
        _log_snapshot_selected("ftp", mem)
        return mem, None
    if ftp_service.is_ftp_mode_enabled():
        return None, mem_err or "Dashboard snapshot not available"

    u = (url or "").strip()
    is_push_scheme = u.lower().startswith("push:")
    # Synthetic push:// URLs are not HTTP — do not call httpx. If the buffer is empty, surface the push hint.
    if is_push_scheme:
        if push_wait_detail:
            return None, push_wait_detail
        if snapshot_push_service.is_push_mode_enabled():
            return (
                None,
                "No Farm Dashboard snapshot in push buffer yet — enable Send farm data on the desktop app "
                "or wait for the first POST.",
            )
        return (
            None,
            "DASHBOARD_SERVER_ID is set but PC push is off — set DASHBOARD_PUSH_MODE=1 (and matching env on "
            "the desktop), or set DASHBOARD_JSON_URL for HTTP pull / use FTP.",
        )

    if not url:
        if push_wait_detail:
            return None, push_wait_detail
        return (
            None,
            "No dashboard JSON source — set DASHBOARD_PUSH_MODE=1 for PC push, or configure FTP, or set "
            "DASHBOARD_JSON_URL (reachable from this server).",
        )
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
                pruned = truncate_snapshot_dict_to_max_utf8_bytes(
                    pruned, DEFAULT_LLM_CONTEXT_MAX_UTF8_BYTES
                )
                payload = json.dumps(pruned, ensure_ascii=False, default=str)
            elif isinstance(data, list):
                pruned = prune_dashboard_snapshot_for_llm(data)
                pruned = truncate_snapshot_dict_to_max_utf8_bytes(
                    pruned, DEFAULT_LLM_CONTEXT_MAX_UTF8_BYTES
                )
                payload = json.dumps(pruned, ensure_ascii=False, default=str)
        except Exception:
            payload = raw_json
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
