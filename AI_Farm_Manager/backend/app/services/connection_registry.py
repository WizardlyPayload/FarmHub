"""Registered Farm Dashboard clients (multiple link keys on one AI server).

Each connection gets a unique ``integration_key`` (same header as ``X-FarmDash-Key`` / ``FARMDASH_INTEGRATION_KEY``).
Push snapshots and consultant lookups are isolated per connection id.

Global env keys (``FARMDASH_INTEGRATION_KEY``, ``SERVER_TOKEN``) map to the synthetic id ``__default__``.
"""
from __future__ import annotations

import json
import logging
import os
import secrets
import uuid
from datetime import datetime, timezone
from typing import Any

from app.config import get_data_dir

logger = logging.getLogger(__name__)

DEFAULT_BUCKET_ID = "__default__"
# One-time plaintext key display after Admin “Create connection” (in-memory; lost on process restart).
_pending_key_reveal: dict[str, str] = {}


def _path() -> str:
    return str(get_data_dir() / "farmdash_connections.json")


def _empty() -> dict[str, Any]:
    return {"version": 1, "connections": []}


def load_document() -> dict[str, Any]:
    get_data_dir().mkdir(parents=True, exist_ok=True)
    p = _path()
    if not os.path.isfile(p):
        return _empty()
    try:
        with open(p, encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            return _empty()
        data.setdefault("version", 1)
        data.setdefault("connections", [])
        if not isinstance(data["connections"], list):
            data["connections"] = []
        return data
    except (OSError, json.JSONDecodeError) as e:
        logger.warning("farmdash_connections.json unreadable: %s", e)
        return _empty()


def save_document(data: dict[str, Any]) -> None:
    get_data_dir().mkdir(parents=True, exist_ok=True)
    p = _path()
    tmp = f"{p}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, p)


def list_connections() -> list[dict[str, Any]]:
    doc = load_document()
    out = []
    for c in doc.get("connections") or []:
        if not isinstance(c, dict):
            continue
        key = str(c.get("integration_key") or "")
        out.append(
            {
                "id": c.get("id"),
                "label": c.get("label") or "",
                "integration_key_masked": _mask(key),
                "created_utc": c.get("created_utc") or "",
            }
        )
    return out


def _mask(key: str) -> str:
    key = (key or "").strip()
    if len(key) <= 8:
        return "(short)" if key else "(empty)"
    return f"{key[:4]}…{key[-4:]} ({len(key)} chars)"


def find_by_key_plain(integration_key: str) -> dict[str, Any] | None:
    """Return connection dict if ``integration_key`` matches a registered client (timing-safe per candidate)."""
    want = (integration_key or "").strip()
    if not want:
        return None
    for c in load_document().get("connections") or []:
        if not isinstance(c, dict):
            continue
        cand = str(c.get("integration_key") or "").strip()
        if not cand or len(cand) != len(want):
            continue
        if secrets.compare_digest(want.encode("utf-8"), cand.encode("utf-8")):
            return c
    return None


def matches_env_default_key(integration_key: str) -> bool:
    """True if key matches global ``FARMDASH_INTEGRATION_KEY`` or ``SERVER_TOKEN``."""
    got = (integration_key or "").strip()
    if not got:
        return False
    fd = (os.getenv("FARMDASH_INTEGRATION_KEY") or "").strip()
    st = (os.getenv("SERVER_TOKEN") or "").strip()
    for cand in (x for x in (fd, st) if x):
        if len(cand) != len(got):
            continue
        if secrets.compare_digest(got.encode("utf-8"), cand.encode("utf-8")):
            return True
    return False


def resolve_connection_bucket_id(integration_key_plain: str) -> str:
    """
    Bucket id for snapshot RAM + routing.

    - Env ``FARMDASH_INTEGRATION_KEY`` / ``SERVER_TOKEN`` → ``__default__``
    - Registered client key → connection UUID
    - Unknown key must not be passed here (caller authenticates first)
    """
    if matches_env_default_key(integration_key_plain):
        return DEFAULT_BUCKET_ID
    hit = find_by_key_plain(integration_key_plain)
    if hit:
        return str(hit.get("id") or DEFAULT_BUCKET_ID)
    return DEFAULT_BUCKET_ID


def create_connection(label: str) -> dict[str, Any]:
    """Generate a new integration key; returns full row (including plaintext key once)."""
    doc = load_document()
    key = secrets.token_urlsafe(32)
    row = {
        "id": str(uuid.uuid4()),
        "label": (label or "").strip() or "Unnamed client",
        "integration_key": key,
        "created_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    conns = doc.setdefault("connections", [])
    if not isinstance(conns, list):
        doc["connections"] = [row]
    else:
        conns.append(row)
    save_document(doc)
    _pending_key_reveal[row["id"]] = key
    logger.info("Registered Farm Dashboard connection id=%s label=%r", row["id"], row["label"])
    return row


def take_pending_key_for_admin(connection_id: str) -> str | None:
    """Return plaintext key once for /admin banner, then forget."""
    cid = (connection_id or "").strip()
    if not cid:
        return None
    return _pending_key_reveal.pop(cid, None)


def delete_connection(connection_id: str) -> bool:
    doc = load_document()
    cid = (connection_id or "").strip()
    conns = doc.get("connections")
    if not isinstance(conns, list):
        return False
    new_list = [c for c in conns if isinstance(c, dict) and str(c.get("id")) != cid]
    if len(new_list) == len(conns):
        return False
    doc["connections"] = new_list
    save_document(doc)
    logger.info("Removed Farm Dashboard connection id=%s", cid)
    return True


def get_connection(connection_id: str) -> dict[str, Any] | None:
    cid = (connection_id or "").strip()
    for c in load_document().get("connections") or []:
        if isinstance(c, dict) and str(c.get("id")) == cid:
            return c
    return None
