"""Shared auth: Farm Dashboard integration key and/or admin Basic (used by integration routes and optional GET /)."""
from __future__ import annotations

import os
from urllib.parse import unquote

from fastapi import Depends, Header, HTTPException, Query
from fastapi.security import HTTPBasic, HTTPBasicCredentials

from app.config import get_settings

_security = HTTPBasic(auto_error=False)


def _parse_integration_key(header_val: str | None) -> str:
    """
    Browsers only allow ISO-8859-1 in fetch() header values. The client may send
    encodeURIComponent(FARMDASH_INTEGRATION_KEY) so Unicode is safe — decode here.
    """
    if not header_val:
        return ""
    try:
        return unquote(header_val)
    except Exception:
        return header_val


def _env_bool(name: str, default: bool = False) -> bool:
    v = (os.getenv(name) or str(default)).lower().strip()
    return v in ("1", "true", "yes", "on")


async def require_integration_or_admin(
    x_farmdash_key: str | None = Header(default=None, alias="X-FarmDash-Key"),
    farmdash_key_query: str | None = Query(default=None, alias="farmdash_key"),
    credentials: HTTPBasicCredentials | None = Depends(_security),
) -> str:
    """
    Accept ``X-FarmDash-Key`` (preferred), optional query ``?farmdash_key=`` for GET bookmarks,
    or admin HTTP Basic when ``ADMIN_PASSWORD`` is set.
    """
    expected_key = (os.getenv("FARMDASH_INTEGRATION_KEY") or "").strip()
    got = _parse_integration_key(x_farmdash_key).strip()
    if not got and farmdash_key_query:
        got = _parse_integration_key(farmdash_key_query).strip()
    if expected_key and (got == expected_key or x_farmdash_key == expected_key):
        return "integration"
    s = get_settings()
    user, pw = s["admin_username"], s["admin_password"]
    if pw and credentials and credentials.username == user and credentials.password == pw:
        return "admin"
    raise HTTPException(
        status_code=401,
        detail=(
            "Unauthorized — send header X-FarmDash-Key with the same value as FARMDASH_INTEGRATION_KEY "
            "in backend/.env (Farm Dashboard: robot panel → Farm Dashboard link key), "
            "optional ?farmdash_key= for GET requests, or use Admin Basic auth"
        ),
        headers={"WWW-Authenticate": "Basic realm=integration"},
    )


async def resolve_root_html_auth(
    x_farmdash_key: str | None = Header(default=None, alias="X-FarmDash-Key"),
    farmdash_key_query: str | None = Query(default=None, alias="farmdash_key"),
    credentials: HTTPBasicCredentials | None = Depends(_security),
) -> str:
    """
    When ``REQUIRE_AUTH_FOR_ROOT_HTML=1``, same rules as ``require_integration_or_admin``.
    Otherwise no-op (returns ``open``) so LAN/dev ``GET /`` stays unchanged.
    """
    if not _env_bool("REQUIRE_AUTH_FOR_ROOT_HTML", False):
        return "open"
    return await require_integration_or_admin(
        x_farmdash_key,
        farmdash_key_query,
        credentials,
    )
