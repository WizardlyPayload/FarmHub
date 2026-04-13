"""Shared auth: Farm Dashboard integration key and/or admin Basic (integration routes and protected HTML)."""
from __future__ import annotations

import os
from urllib.parse import unquote

from fastapi import Depends, Header, HTTPException
from fastapi.security import HTTPBasic, HTTPBasicCredentials

from app.config import get_settings

_security = HTTPBasic(auto_error=False)


integration_http_basic = _security


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


def _integration_key_matches(got: str, x_raw: str | None) -> bool:
    """True when header matches FARMDASH_INTEGRATION_KEY or legacy SERVER_TOKEN (same header)."""
    fd = (os.getenv("FARMDASH_INTEGRATION_KEY") or "").strip()
    st = (os.getenv("SERVER_TOKEN") or "").strip()
    if fd and (got == fd or x_raw == fd):
        return True
    if st and (got == st or x_raw == st):
        return True
    return False


async def require_integration_or_admin(
    x_farmdash_key: str | None = Header(default=None, alias="X-FarmDash-Key"),
    credentials: HTTPBasicCredentials | None = Depends(_security),
) -> str:
    """
    Require ``X-FarmDash-Key`` matching ``FARMDASH_INTEGRATION_KEY`` or ``SERVER_TOKEN``, or admin HTTP Basic.
    Query-string secrets are not accepted.
    """
    got = _parse_integration_key(x_farmdash_key).strip()
    if _integration_key_matches(got, x_farmdash_key):
        return "integration"
    s = get_settings()
    user, pw = s["admin_username"], s["admin_password"]
    if pw and credentials and credentials.username == user and credentials.password == pw:
        return "admin"
    raise HTTPException(
        status_code=401,
        detail=(
            "Unauthorized — send header X-FarmDash-Key with the same value as FARMDASH_INTEGRATION_KEY "
            "(or SERVER_TOKEN) in backend/.env, or use Admin Basic auth"
        ),
        headers={"WWW-Authenticate": "Basic realm=integration"},
    )


def integration_or_admin_authenticated(
    x_farmdash_key: str | None,
    credentials: HTTPBasicCredentials | None,
) -> bool:
    """True if the same credentials would pass :func:`require_integration_or_admin` (no query params)."""
    got = _parse_integration_key(x_farmdash_key).strip()
    if _integration_key_matches(got, x_farmdash_key):
        return True
    s = get_settings()
    user, pw = s["admin_username"], s["admin_password"]
    return bool(pw and credentials and credentials.username == user and credentials.password == pw)
