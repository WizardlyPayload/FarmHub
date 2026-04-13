"""Dashboard snapshots POSTed from Farm Dashboard (PC → VPS). No inbound ports on the gaming PC."""
from __future__ import annotations

import json
import logging
import os
import threading
import time
from typing import Any

from app.services.pipeline_log import log_pipeline

logger = logging.getLogger(__name__)


_lock = threading.Lock()
_snapshots: dict[str, tuple[str, float]] = {}
_servers_meta: list[dict[str, Any]] | None = None


def is_push_mode_enabled() -> bool:
    return (os.getenv("DASHBOARD_PUSH_MODE") or "").strip().lower() in ("1", "true", "yes", "on")


def _norm_sid(server_id: str | None) -> str:
    return (server_id or "").strip()


def _active_farm_id_from_raw(raw: str) -> int | None:
    """Parse ``activeFarmId`` from a dashboard JSON string (for disambiguating multi-push RAM)."""
    try:
        data = json.loads(raw)
        if not isinstance(data, dict):
            return None
        v = data.get("activeFarmId")
        if v is None:
            return None
        n = int(v)
        return n if n >= 1 else None
    except (TypeError, ValueError, json.JSONDecodeError):
        return None


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
        "Received Farm Dashboard snapshot POST (stored in RAM for consultant / in-game Hank)",
        bytes_utf8=len(raw.encode("utf-8")),
        server_id=sid or "(default)",
        servers_listed=n_srv,
    )
    logger.info(
        "snapshot_push: RAM key=%r bytes_utf8=%s servers_listed=%s (must match GET consultant ?serverId=)",
        sid or "(default)",
        len(raw.encode("utf-8")),
        n_srv,
    )
    return True, None


def get_snapshot_json(server_id: str | None, farm_id: int | None = None) -> tuple[str | None, str | None, str]:
    """
    When push mode is on: return stored JSON for server_id, or resolve an ambiguous id.

    Resolution when ``server_id`` is empty (e.g. ``DASHBOARD_JSON_URL`` has no ``?serverId=``):

    - Exactly one pushed server → use it.
    - Multiple pushed servers → use the **newest** by push time (monotonic), so PC merges still beat FTP.

    When ``server_id`` is **non-empty** but not in RAM (stale ``DASHBOARD_SERVER_ID`` or request arrived before
    that PC's push): if ``farm_id`` is set, prefer the in-RAM push whose JSON ``activeFarmId`` equals
    ``farm_id`` (newest among ties) before falling back to global newest.

    Returns ``(json, error_hint, chosen_server_id)``. ``chosen_server_id`` is which RAM key was used, or "".
    """
    if not is_push_mode_enabled():
        return None, None, ""
    sid = _norm_sid(server_id)
    err = (
        "No snapshot received yet from Farm Dashboard. On the PC: open AI Farm Manager panel → enable "
        '"Push snapshots to AI server" → Save. On the VPS: set DASHBOARD_PUSH_MODE=1.'
    )
    def _newest_push() -> tuple[str, str]:
        best_sid, (raw, _ts) = max(_snapshots.items(), key=lambda kv: kv[1][1])
        return best_sid, raw

    with _lock:
        if sid in _snapshots:
            return _snapshots[sid][0], None, sid
        # Requested id from DASHBOARD_SERVER_ID / URL does not match any RAM key (stale env or another farm).
        # Still prefer real PC pushes over FTP whenever we have any snapshot.
        if sid != "" and len(_snapshots) > 0:
            fid = int(farm_id) if farm_id is not None else None
            if fid is not None and fid >= 1:
                matched: list[tuple[str, str, float]] = []
                for k, (raw, ts) in _snapshots.items():
                    if _active_farm_id_from_raw(raw) == fid:
                        matched.append((k, raw, ts))
                if matched:
                    best_sid, raw, _ts = max(matched, key=lambda x: x[2])
                    log_pipeline(
                        "push_resolve",
                        "serverId not in RAM; using push whose activeFarmId matches farmId query",
                        requested_server_id=sid,
                        chosen_server_id=best_sid,
                        farm_id_query=fid,
                        candidates=len(_snapshots),
                    )
                    return raw, None, best_sid
                log_pipeline(
                    "push_resolve",
                    "serverId not in RAM; no push matched farmId — using newest PC push (fix DASHBOARD_SERVER_ID)",
                    requested_server_id=sid,
                    farm_id_query=fid,
                    candidates=len(_snapshots),
                )
            else:
                log_pipeline(
                    "push_resolve",
                    "serverId from env/URL not in push RAM; using newest PC push (fix DASHBOARD_SERVER_ID to match this farm)",
                    requested_server_id=sid,
                    candidates=len(_snapshots),
                )
            best_sid, raw = _newest_push()
            return raw, None, best_sid
        if sid != "":
            return None, err, ""
        if len(_snapshots) == 0:
            return None, err, ""
        if len(_snapshots) == 1:
            only_sid, (raw, _) = next(iter(_snapshots.items()))
            return raw, None, only_sid
        # Ambiguous: several PCs/saves pushing; URL did not specify serverId — pick freshest push.
        best_sid, raw = _newest_push()
        log_pipeline(
            "push_resolve",
            "Multiple PC snapshots in RAM; using newest push (add ?serverId= to DASHBOARD_JSON_URL to pin one save)",
            chosen_server_id=best_sid,
            candidates=len(_snapshots),
        )
        return raw, None, best_sid


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
