"""Fetch Gemini model IDs that support ``generateContent`` (Google ListModels API)."""
from __future__ import annotations

import hashlib
import os
import time
from typing import Any

from app.config import _strip_key
from app.services.gemini_http_client import get_gemini_async_client
from app.services.log_buffer import log_event

# GET https://generativelanguage.googleapis.com/{v1|v1beta}/models?key=...
_GEMINI_REST_HOST = "https://generativelanguage.googleapis.com"

_cache: dict[str, tuple[float, dict[str, Any]]] = {}
_CACHE_TTL_SEC = max(60, int((os.getenv("GEMINI_LISTMODELS_CACHE_SEC") or "3600").strip() or "3600"))


def _cache_key(api_key: str, api_version: str) -> str:
    k = _strip_key(api_key)
    h = hashlib.sha256(k.encode("utf-8")).hexdigest()[:20]
    ver = (api_version or "v1").strip().lower()
    return f"{h}:{ver}"


def _parse_models_page(data: dict[str, Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for m in data.get("models") or []:
        if not isinstance(m, dict):
            continue
        methods = m.get("supportedGenerationMethods") or []
        if not isinstance(methods, list) or "generateContent" not in methods:
            continue
        name = (m.get("name") or "").strip()
        if not name.startswith("models/"):
            continue
        mid = name.split("/", 1)[1].strip()
        if not mid:
            continue
        out.append(
            {
                "id": mid,
                "name": name,
                "displayName": (m.get("displayName") or "").strip() or mid,
                "version": (m.get("version") or "").strip(),
            }
        )
    out.sort(key=lambda x: x["id"].lower())
    return out


async def fetch_gemini_models_catalog(
    api_key: str,
    *,
    api_version: str = "v1",
    force_refresh: bool = False,
) -> dict[str, Any]:
    """
    Return ``{"ok", "models", "fetchedAt", "fromCache", "apiVersion", "detail?"}``.

    Uses in-process TTL cache per (key fingerprint, API version) unless ``force_refresh``.
    """
    key = _strip_key(api_key)
    if not key:
        return {"ok": False, "detail": "Empty Gemini API key", "models": []}

    ver = (api_version or "v1").strip().lower()
    if ver not in ("v1", "v1beta"):
        ver = "v1"

    ck = _cache_key(key, ver)
    now = time.time()
    if not force_refresh and ck in _cache:
        ts, payload = _cache[ck]
        if now - ts < _CACHE_TTL_SEC:
            p2 = dict(payload)
            p2["fromCache"] = True
            p2["cacheAgeSec"] = round(now - ts, 1)
            return p2

    client = get_gemini_async_client()
    all_rows: list[dict[str, Any]] = []
    page_token: str | None = None
    err_detail: str | None = None

    try:
        for _ in range(40):
            params: dict[str, str] = {"key": key, "pageSize": "100"}
            if page_token:
                params["pageToken"] = page_token
            url = f"{_GEMINI_REST_HOST}/{ver}/models"
            r = await client.get(url, params=params, timeout=60.0)
            if r.status_code >= 400:
                err_detail = r.text[:800] if r.text else f"HTTP {r.status_code}"
                log_event(
                    "WARN",
                    "Gemini ListModels failed",
                    status=r.status_code,
                    api_version=ver,
                )
                break
            try:
                data = r.json()
            except Exception:
                err_detail = "Invalid JSON from ListModels"
                break
            all_rows.extend(_parse_models_page(data if isinstance(data, dict) else {}))
            page_token = (data.get("nextPageToken") or "").strip() if isinstance(data, dict) else None
            if not page_token:
                break
    except Exception as e:
        err_detail = str(e)[:800]
        log_event("WARN", "Gemini ListModels exception", error=str(e)[:500])

    fetched_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now))

    if err_detail and not all_rows:
        return {
            "ok": False,
            "detail": err_detail,
            "models": [],
            "fetchedAt": fetched_iso,
            "apiVersion": ver,
            "fromCache": False,
        }

    # Dedupe by id (pages)
    seen: set[str] = set()
    uniq: list[dict[str, Any]] = []
    for row in all_rows:
        i = row["id"]
        if i in seen:
            continue
        seen.add(i)
        uniq.append(row)

    payload = {
        "ok": True,
        "models": uniq,
        "fetchedAt": fetched_iso,
        "fromCache": False,
        "apiVersion": ver,
        "count": len(uniq),
    }
    _cache[ck] = (now, {k: v for k, v in payload.items() if k != "fromCache"})
    log_event(
        "INFO",
        "Gemini ListModels OK",
        count=len(uniq),
        api_version=ver,
        force_refresh=force_refresh,
    )
    return payload


async def preferred_models_intersect_catalog(
    api_key: str,
    preferred_order: list[str],
    *,
    api_version: str = "v1",
) -> list[str]:
    """
    Keep only model IDs that ListModels reports for this key, preserving ``preferred_order``.

    Uses the same TTL cache as :func:`fetch_gemini_models_catalog`. If ListModels fails or the
    intersection would be empty, returns ``preferred_order`` unchanged so rollover still runs.
    """
    if not preferred_order:
        return preferred_order
    cat = await fetch_gemini_models_catalog(api_key, api_version=api_version, force_refresh=False)
    if not cat.get("ok"):
        return preferred_order
    rows = cat.get("models") or []
    avail: set[str] = set()
    for m in rows:
        if isinstance(m, dict):
            mid = (m.get("id") or "").strip()
            if mid:
                avail.add(mid)
    if not avail:
        return preferred_order
    out = [m for m in preferred_order if m in avail]
    return out if out else preferred_order
