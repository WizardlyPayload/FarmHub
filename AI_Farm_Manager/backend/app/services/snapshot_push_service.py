"""Dashboard snapshots POSTed from Farm Dashboard (PC → VPS). No inbound ports on the gaming PC."""
from __future__ import annotations

import json
import logging
import os
import threading
import time
from typing import Any

from app.services.connection_registry import DEFAULT_BUCKET_ID
from app.services.pipeline_log import log_pipeline

logger = logging.getLogger(__name__)


_lock = threading.Lock()
# connection_bucket_id -> server_id -> (raw_json, monotonic_ts)
_snapshots_by_conn: dict[str, dict[str, tuple[str, float]]] = {}
_servers_meta_by_conn: dict[str, list[dict[str, Any]] | None] = {}


def is_push_mode_enabled() -> bool:
    return (os.getenv("DASHBOARD_PUSH_MODE") or "").strip().lower() in ("1", "true", "yes", "on")


def _norm_sid(server_id: str | None) -> str:
    return (server_id or "").strip()


def _push_wait_err() -> str:
    return (
        "No snapshot received yet from Farm Dashboard. On the PC: Settings → AI Farm Manager → Hosted AI: "
        "turn on Send farm data to the AI server, set server URL + link key (same value as this connection’s key "
        "or FARMDASH_INTEGRATION_KEY for the default slot), then Save & load. Start FS25 with the mod so the "
        "dashboard loads save data. On the server: set DASHBOARD_PUSH_MODE=1 and restart the API. "
        "POST /api/integration/push-snapshot — HTTP 401 = wrong link key; 503 = push mode off."
    )


# Returned when ?serverId= / env id does not match any key in this connection's push RAM (no silent fallback).
_MISS_MATCH_SERVER_ID_MSG = (
    "Mismatched serverId: no snapshot in the PC push buffer for this server id. "
    "Use the same id as in Farm Dashboard’s server list (Settings → servers), and set DASHBOARD_SERVER_ID "
    "or the connection’s dashboard_server_id to match."
)

# Multiple pushes stored but the request did not pin serverId (synthetic push:// URL has no query).
_AMBIGUOUS_SERVER_ID_MSG = (
    "Missing serverId: multiple Farm Dashboard snapshots are in the push buffer for this link key. "
    "Set DASHBOARD_SERVER_ID (or dashboard_server_id on the client connection) to the correct server id, "
    "or add ?serverId= to the dashboard URL used for fetch."
)


def _resolve_snapshot_map(
    snapshots_map: dict[str, tuple[str, float]],
    sid: str,
    err: str,
) -> tuple[str | None, str | None, str]:
    """
    Strict resolution: no “newest push” or activeFarmId guessing — wrong id must fail loudly (503 upstream).
    """
    if len(snapshots_map) == 0:
        return None, err, ""

    norm = _norm_sid(sid)
    if norm in snapshots_map:
        return snapshots_map[norm][0], None, norm

    if norm != "":
        log_pipeline(
            "push_resolve",
            "serverId not in push buffer (strict; no fallback)",
            requested_server_id=norm,
            candidates=len(snapshots_map),
            keys_preview=list(snapshots_map.keys())[:12],
        )
        return None, _MISS_MATCH_SERVER_ID_MSG, ""

    if len(snapshots_map) == 1:
        only_sid, (raw, _) = next(iter(snapshots_map.items()))
        return raw, None, only_sid

    log_pipeline(
        "push_resolve",
        "missing serverId with multiple pushes (strict)",
        candidates=len(snapshots_map),
        keys_preview=list(snapshots_map.keys())[:12],
    )
    return None, _AMBIGUOUS_SERVER_ID_MSG, ""


def store_push(
    connection_bucket_id: str,
    server_id: str | None,
    snapshot: dict[str, Any],
    servers: list[dict[str, Any]] | None,
) -> tuple[bool, str | None]:
    try:
        raw = json.dumps(snapshot, ensure_ascii=False, default=str)
        json.loads(raw)
    except (TypeError, ValueError) as e:
        return False, f"Invalid snapshot JSON: {e}"
    sid = _norm_sid(server_id)
    cid = (connection_bucket_id or DEFAULT_BUCKET_ID).strip() or DEFAULT_BUCKET_ID
    with _lock:
        bucket = _snapshots_by_conn.setdefault(cid, {})
        bucket[sid] = (raw, time.monotonic())
        if servers is not None:
            _servers_meta_by_conn[cid] = servers
    n_srv = len(servers) if servers else 0
    log_pipeline(
        "push_in",
        "Received Farm Dashboard snapshot POST (stored in RAM for consultant / in-game Hank)",
        bytes_utf8=len(raw.encode("utf-8")),
        connection_bucket_id=cid,
        server_id=sid or "(default)",
        servers_listed=n_srv,
    )
    logger.info(
        "snapshot_push: conn=%r RAM key=%r bytes_utf8=%s servers_listed=%s",
        cid,
        sid or "(default)",
        len(raw.encode("utf-8")),
        n_srv,
    )
    return True, None


def get_snapshot_json(
    connection_bucket_id: str,
    server_id: str | None,
    farm_id: int | None = None,
) -> tuple[str | None, str | None, str]:
    """
    When push mode is on: return stored JSON for this connection bucket + **exact** server_id key.

    ``connection_bucket_id`` is ``__default__`` for env FARMDASH key, or a UUID for a registered client connection.

    ``farm_id`` is ignored (kept for call-site compatibility); resolution does not guess by farm.
    """
    del farm_id  # strict serverId-only resolution — no activeFarmId fallback
    if not is_push_mode_enabled():
        return None, None, ""
    cid = (connection_bucket_id or DEFAULT_BUCKET_ID).strip() or DEFAULT_BUCKET_ID
    sid = _norm_sid(server_id)
    err = _push_wait_err()
    with _lock:
        snapshots_map = dict(_snapshots_by_conn.get(cid) or {})
    return _resolve_snapshot_map(snapshots_map, sid, err)


def get_servers_meta() -> list[dict[str, Any]] | None:
    merged: list[dict[str, Any]] = []
    seen: set[str] = set()
    with _lock:
        for meta in _servers_meta_by_conn.values():
            if not meta:
                continue
            for s in meta:
                if not isinstance(s, dict):
                    continue
                i = str(s.get("id") or "")
                if i and i in seen:
                    continue
                if i:
                    seen.add(i)
                merged.append(s)
    return merged if merged else None


def push_debug_stats() -> dict[str, Any]:
    with _lock:
        by_conn: dict[str, Any] = {}
        for cid, smap in _snapshots_by_conn.items():
            ages = {k: round(time.monotonic() - ts, 1) for k, (_, ts) in smap.items()}
            by_conn[cid] = {
                "servers_with_snapshot": list(smap.keys()),
                "age_seconds_by_server": ages,
                "servers_meta_count": len(_servers_meta_by_conn.get(cid) or []) if _servers_meta_by_conn.get(cid) else 0,
            }
        return {"by_connection": by_conn, "connection_count": len(_snapshots_by_conn)}
