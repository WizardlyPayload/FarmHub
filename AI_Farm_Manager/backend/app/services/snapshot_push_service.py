"""Dashboard snapshots POSTed from Farm Dashboard (PC → VPS). No inbound ports on the gaming PC."""
from __future__ import annotations

import json
import os
import threading
import time
from typing import Any

from app.services.pipeline_log import log_pipeline


_lock = threading.Lock()
_snapshots: dict[str, tuple[str, float]] = {}
_servers_meta: list[dict[str, Any]] | None = None


def is_push_mode_enabled() -> bool:
    return (os.getenv("DASHBOARD_PUSH_MODE") or "").strip().lower() in ("1", "true", "yes", "on")


def _norm_sid(server_id: str | None) -> str:
    return (server_id or "").strip()


def store_push(
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
    global _servers_meta
    with _lock:
        _snapshots[sid] = (raw, time.monotonic())
        if servers is not None:
            _servers_meta = servers
    n_srv = len(servers) if servers else 0
    log_pipeline(
        "push_in",
        "Received Farm Dashboard snapshot POST (stored in RAM for consultant / !bot)",
        bytes_utf8=len(raw.encode("utf-8")),
        server_id=sid or "(default)",
        servers_listed=n_srv,
    )
    return True, None


def get_snapshot_json(server_id: str | None) -> tuple[str | None, str | None]:
    """
    When push mode is on: return stored JSON for server_id, or single stored server if id empty.
    Returns (None, error_hint) if nothing stored yet.
    """
    if not is_push_mode_enabled():
        return None, None
    sid = _norm_sid(server_id)
    with _lock:
        if sid in _snapshots:
            return _snapshots[sid][0], None
        if sid == "" and len(_snapshots) == 1:
            _, (raw, _) = next(iter(_snapshots.items()))
            return raw, None
    return None, (
        "No snapshot received yet from Farm Dashboard. On the PC: open AI Farm Manager panel → enable "
        '"Push snapshots to AI server" → Save. On the VPS: set DASHBOARD_PUSH_MODE=1.'
    )


def get_servers_meta() -> list[dict[str, Any]] | None:
    with _lock:
        if _servers_meta is None:
            return None
        return list(_servers_meta)


def push_debug_stats() -> dict[str, Any]:
    with _lock:
        ages = {k: round(time.monotonic() - ts, 1) for k, (_, ts) in _snapshots.items()}
        return {
            "servers_with_snapshot": list(_snapshots.keys()),
            "age_seconds_by_server": ages,
            "servers_meta_count": len(_servers_meta) if _servers_meta else 0,
        }
