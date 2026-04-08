"""Multi-server bot instances: each game server (token) maps to Farm Dashboard serverId + isolated queue.

Optional per-instance secrets `ftp_pass` and `llm_api_key` are encrypted at rest in bot_servers.json
(see app.services.encryption). In-memory copies after load_registry() are plaintext for app use.
"""
from __future__ import annotations

import copy
import hashlib
import json
import logging
import os
import secrets
import uuid
from typing import Any

from app.config import get_data_dir, get_settings
from app.services.encryption import decrypt_value, encrypt_value
from app.services.log_buffer import log_event

logger = logging.getLogger(__name__)

def _bot_servers_json_path() -> str:
    """Persistent JSON path; in Docker Compose this is /app/data/bot_servers.json (volume-mounted)."""
    return str(get_data_dir() / "bot_servers.json")

# Persisted encrypted at rest; plaintext only in memory after load_registry().
_SECRET_INSTANCE_FIELDS = ("ftp_pass", "llm_api_key")


def _decrypt_instance_secrets_inplace(instances: list[Any]) -> None:
    for inst in instances:
        if not isinstance(inst, dict):
            continue
        for field in _SECRET_INSTANCE_FIELDS:
            raw = inst.get(field)
            if raw is None or raw == "":
                continue
            inst[field] = decrypt_value(str(raw))


def _encrypt_instance_secrets_for_disk(data: dict[str, Any]) -> dict[str, Any]:
    """Deep copy; encrypt secret fields for JSON serialization only."""
    payload = copy.deepcopy(data)
    for inst in payload.get("instances") or []:
        if not isinstance(inst, dict):
            continue
        for field in _SECRET_INSTANCE_FIELDS:
            raw = inst.get(field)
            if raw is None:
                continue
            s = str(raw).strip()
            if not s:
                inst.pop(field, None)
                continue
            inst[field] = encrypt_value(s)
    return payload


def get_registry_path() -> str:
    """Absolute path to bot_servers.json (for diagnostics)."""
    return os.path.abspath(_bot_servers_json_path())


def normalize_server_token(t: str) -> str:
    """Normalize token for comparisons and for outgoing_queue keys (receive + poll must match)."""
    return _normalize_server_token(t)


def _normalize_server_token(t: str) -> str:
    """Strip whitespace; normalize Unicode dash/minus to ASCII so copy-paste from PDF/web matches .env/JSON."""
    s = (t or "").strip()
    for ch in (
        "\u2010",
        "\u2011",
        "\u2012",
        "\u2013",
        "\u2014",
        "\u2212",
        "\ufeff",
    ):
        s = s.replace(ch, "-" if ch != "\ufeff" else "")
    if len(s) >= 2 and s[0] == s[-1] and s[0] in ("\"", "'"):
        s = s[1:-1]
    return s


def _ensure_dir() -> None:
    get_data_dir().mkdir(parents=True, exist_ok=True)


def _default_file() -> dict[str, Any]:
    return {"version": 1, "instances": []}


def load_registry() -> dict[str, Any]:
    _ensure_dir()
    path = _bot_servers_json_path()
    if not os.path.isfile(path):
        return _default_file()
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            logger.warning("bot_servers.json root is not an object: %s", path)
            return _default_file()
        data.setdefault("version", 1)
        data.setdefault("instances", [])
        if not isinstance(data["instances"], list):
            data["instances"] = []
        _decrypt_instance_secrets_inplace(data["instances"])
        for inst in data["instances"]:
            if isinstance(inst, dict):
                inst.setdefault("subscription_tier", 2)
        return data
    except json.JSONDecodeError as e:
        logger.warning("bot_servers.json invalid JSON (%s): %s", path, e)
        return _default_file()
    except OSError as e:
        logger.warning("bot_servers.json unreadable (%s): %s", path, e)
        return _default_file()


def save_registry(data: dict[str, Any]) -> None:
    _ensure_dir()
    to_write = _encrypt_instance_secrets_for_disk(data)
    path = _bot_servers_json_path()
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(to_write, f, indent=2)
        f.write("\n")
    os.replace(tmp, path)


def mask_token(t: str) -> str:
    if not t or len(t) < 12:
        return "****"
    return f"{t[:4]}…{t[-4:]}"


def find_instance_by_id(inst_id: str) -> dict[str, Any] | None:
    if not inst_id:
        return None
    reg = load_registry()
    for inst in reg["instances"]:
        if isinstance(inst, dict) and inst.get("id") == inst_id:
            return inst
    return None


def find_instance_by_token(token: str) -> dict[str, Any] | None:
    token = _normalize_server_token(token)
    if not token:
        return None
    reg = load_registry()
    for inst in reg["instances"]:
        if not isinstance(inst, dict):
            continue
        stored = _normalize_server_token(inst.get("server_token") or "")
        if stored == token:
            return inst
    return None


def _log_auth_mismatch(server_token: str, reg: dict[str, Any], expected_legacy: str) -> None:
    """Log non-secret fingerprints so /admin logs show why auth failed (encoding vs wrong token)."""

    def fp(s: str) -> str:
        return hashlib.sha256(s.encode("utf-8")).hexdigest()[:12]

    insts = reg.get("instances") or []
    st0 = ""
    if insts and isinstance(insts[0], dict):
        st0 = _normalize_server_token(insts[0].get("server_token") or "")
    log_event(
        "WARN",
        "server_token rejected — if recv_fp != inst0_fp the client sent a different string (often PowerShell UTF-16 body). Use curl.exe or UTF8 bytes body.",
        recv_len=len(server_token),
        recv_fp=fp(server_token),
        inst0_len=len(st0) if st0 else 0,
        inst0_fp=fp(st0) if st0 else None,
        same_as_profile=bool(st0 and server_token == st0),
        legacy_fp=fp(expected_legacy) if expected_legacy else None,
        same_as_legacy=bool(expected_legacy and server_token == expected_legacy),
    )
    logger.warning(
        "server_token rejected: len=%s fp=%s | inst0 fp=%s same=%s | legacy fp=%s same=%s",
        len(server_token),
        fp(server_token),
        fp(st0) if st0 else "—",
        server_token == st0 if st0 else False,
        fp(expected_legacy) if expected_legacy else "—",
        server_token == expected_legacy if expected_legacy else False,
    )


def resolve_auth(server_token: str) -> tuple[bool, str | None, str | None, bool]:
    """
    Resolve incoming server_token to (ok, error_detail, dashboard_fetch_url_for_llm, instance_enabled).

    Uses bot_servers.json instances when present; otherwise falls back to legacy .env SERVER_TOKEN + dashboard URL.
    If JSON has one or more instances, unknown tokens are rejected (legacy .env token still works if set).
    """
    from app.services.dashboard_service import build_dashboard_fetch_url

    server_token = _normalize_server_token(server_token)
    settings = get_settings()
    reg = load_registry()
    has_json_instances = len(reg.get("instances") or []) > 0

    inst = find_instance_by_token(server_token)
    if inst is not None:
        base = settings.get("dashboard_json_url") or ""
        sid = (inst.get("dashboard_server_id") or "").strip()
        fetch = build_dashboard_fetch_url(base, sid if sid else None)
        enabled = bool(inst.get("enabled", True))
        return True, None, fetch or None, enabled

    # Legacy single-token mode (same token as .env SERVER_TOKEN).
    # Read os.environ directly so we are not bitten by get_settings() lru_cache after .env edits + restart confusion.
    expected = _normalize_server_token(os.getenv("SERVER_TOKEN", ""))
    if expected and server_token == expected:
        fetch = settings.get("dashboard_fetch_url") or settings.get("dashboard_json_url") or ""
        return True, None, fetch or None, True

    _log_auth_mismatch(server_token, reg, expected)
    if has_json_instances:
        return False, "Invalid server_token", None, False
    if not expected:
        return False, "Invalid server_token", None, False
    return False, "Invalid server_token", None, False


def list_instances_masked() -> list[dict[str, Any]]:
    reg = load_registry()
    out = []
    for inst in reg["instances"]:
        if not isinstance(inst, dict):
            continue
        out.append(
            {
                "id": inst.get("id"),
                "label": inst.get("label", ""),
                "dashboard_server_id": inst.get("dashboard_server_id") or "",
                "enabled": bool(inst.get("enabled", True)),
                "subscription_tier": _clamp_subscription_tier(inst.get("subscription_tier", 2)),
                "server_token_masked": mask_token(str(inst.get("server_token", ""))),
            }
        )
    return out


def _clamp_subscription_tier(raw: Any) -> int:
    try:
        t = int(raw)
    except (TypeError, ValueError):
        return 2
    return max(0, min(2, t))


def upsert_instance(
    inst_id: str | None,
    label: str,
    dashboard_server_id: str,
    enabled: bool,
    server_token: str | None = None,
    subscription_tier: int | None = None,
) -> dict[str, Any]:
    """Create or update. If server_token is None on create, generates one."""
    reg = load_registry()
    label = (label or "").strip() or "Unnamed server"
    did = (dashboard_server_id or "").strip()

    if inst_id:
        for inst in reg["instances"]:
            if isinstance(inst, dict) and inst.get("id") == inst_id:
                inst["label"] = label
                inst["dashboard_server_id"] = did
                inst["enabled"] = enabled
                if server_token and server_token.strip():
                    inst["server_token"] = server_token.strip()
                if subscription_tier is not None:
                    inst["subscription_tier"] = _clamp_subscription_tier(subscription_tier)
                save_registry(reg)
                return inst
        raise ValueError("instance id not found")

    tok = (server_token or "").strip() or secrets.token_urlsafe(32)
    new_inst = {
        "id": str(uuid.uuid4()),
        "label": label,
        "dashboard_server_id": did,
        "enabled": enabled,
        "server_token": tok,
        "subscription_tier": _clamp_subscription_tier(subscription_tier if subscription_tier is not None else 2),
    }
    reg["instances"].append(new_inst)
    save_registry(reg)
    return new_inst


def delete_instance(inst_id: str) -> bool:
    reg = load_registry()
    before = len(reg["instances"])
    reg["instances"] = [i for i in reg["instances"] if isinstance(i, dict) and i.get("id") != inst_id]
    if len(reg["instances"]) == before:
        return False
    save_registry(reg)
    return True


def legacy_mode_active() -> bool:
    """True when no JSON instances and we rely on .env SERVER_TOKEN only."""
    reg = load_registry()
    return len(reg["instances"]) == 0
