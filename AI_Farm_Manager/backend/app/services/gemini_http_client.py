"""Shared ``httpx.AsyncClient`` for Gemini REST calls — TCP/TLS connection reuse across requests."""
from __future__ import annotations

import httpx

_client: httpx.AsyncClient | None = None


def get_gemini_async_client() -> httpx.AsyncClient:
    """
    Lazy singleton. Per-request timeouts are still passed to ``client.post(..., timeout=…)``.
    """
    global _client
    if _client is None:
        _client = httpx.AsyncClient(
            limits=httpx.Limits(max_keepalive_connections=32, max_connections=64),
            timeout=httpx.Timeout(150.0, connect=25.0),
        )
    return _client


async def close_gemini_async_client() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None
