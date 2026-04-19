"""Shared auth: Farm Dashboard integration key and/or admin Basic (integration routes and protected HTML)."""
from __future__ import annotations

import os
from urllib.parse import unquote

from fastapi import Depends, Header, HTTPException, Request
from fastapi.security import HTTPBasic, HTTPBasicCredentials

from app.config import get_settings
from app.services.connection_registry import find_by_key_plain

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


def parse_integration_key_header(header_val: str | None) -> str:
    """Decoded ``X-FarmDash-Key`` value for routing (connection registry + default bucket)."""
    return _parse_integration_key(header_val).strip()


def _integration_key_matches(got: str, x_raw: str | None) -> bool:
    """True for env keys, or a key registered in ``farmdash_connections.json`` (multi-tenant)."""
    fd = (os.getenv("FARMDASH_INTEGRATION_KEY") or "").strip()
    st = (os.getenv("SERVER_TOKEN") or "").strip()
    if fd and (got == fd or x_raw == fd):
        return True
    if st and (got == st or x_raw == st):
        return True
    if got and find_by_key_plain(got):
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
            "Unauthorized — send header X-FarmDash-Key with FARMDASH_INTEGRATION_KEY, SERVER_TOKEN, "
            "a key from Admin → Client connections, or use Admin Basic auth"
        ),
        headers={"WWW-Authenticate": "Basic realm=integration"},
    )


def get_farmdash_connection_bucket(
    request: Request,
    _: str = Depends(require_integration_or_admin),
) -> str:
    """Resolve RAM bucket for push/consultant (``__default__`` or registered connection UUID)."""
    from app.services.connection_registry import resolve_connection_bucket_id

    got = parse_integration_key_header(request.headers.get("X-FarmDash-Key"))
    return resolve_connection_bucket_id(got)


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
