"""LLM calls (OpenAI or Gemini)."""
from __future__ import annotations

import asyncio
import os
import re
import time
from contextvars import ContextVar
from pathlib import Path
from typing import Any
from urllib.parse import quote

import httpx

from app.config import active_gemini_api_key, get_settings, has_gemini_credentials
from app.services.game_reference import build_game_reference_block
from app.services.gemini_budget import wait_gemini_budget_or_skip
from app.services.log_buffer import log_event

# Retry with next API key (sticky last-success first, then pool order; optional legacy time-rotation)
# on Google overload / rate limits.
_GEMINI_QUOTA_RETRY_STATUS: frozenset[int] = frozenset({429, 503})

# Stripped key string of the last Gemini key that completed generateContent successfully (process-wide).
_gemini_last_success_key: str | None = None

# When True (admin /admin/api/test-llm only): skip asyncio.sleep on 429 so the request finishes
# before reverse-proxy/browser timeouts; multi-key rotation still applies.
_GEMINI_ADMIN_TEST_NO_429_WAIT: ContextVar[bool] = ContextVar(
    "_GEMINI_ADMIN_TEST_NO_429_WAIT", default=False
)


def gemini_admin_test_no_429_wait_begin() -> Any:
    """Call before consultant LLM for admin test; pair with :func:`gemini_admin_test_no_429_wait_end`."""
    return _GEMINI_ADMIN_TEST_NO_429_WAIT.set(True)


def gemini_admin_test_no_429_wait_end(token: Any) -> None:
    _GEMINI_ADMIN_TEST_NO_429_WAIT.reset(token)

FALLBACK_REPLY = (
    "Sorry, I'm checking my notes right now, ask again in a minute!"
)


# Connectivity / probe only — reduces false "empty reply" when Google flags harmless pings.
_GEMINI_PROBE_SAFETY_SETTINGS: list[dict[str, str]] = [
    {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
    {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
    {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
    {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"},
]


def _gemini_extract_text_and_diagnostics(data: dict[str, Any]) -> tuple[str, str]:
    """
    Extract model text from generateContent JSON. Some models use ``thought`` parts or omit ``text``;
    empty body often comes with ``finishReason`` / ``promptFeedback.blockReason``.
    Returns (snippet, human_note_if_empty).
    """
    if not isinstance(data, dict):
        return "", "response JSON is not an object"

    pf = data.get("promptFeedback")
    if isinstance(pf, dict):
        br = pf.get("blockReason")
        if br:
            return "", f"prompt blocked: {br}"

    cands = data.get("candidates")
    if not isinstance(cands, list) or len(cands) == 0:
        return "", "no candidates[] (blocked or API mismatch — try GEMINI_REST_API_VERSION=v1beta)"

    first: dict[str, Any] = cands[0] if isinstance(cands[0], dict) else {}
    finish = first.get("finishReason") or ""
    content = first.get("content")
    if not isinstance(content, dict):
        content = {}
    parts = content.get("parts")
    if not isinstance(parts, list):
        parts = []

    texts: list[str] = []
    for p in parts:
        if not isinstance(p, dict):
            continue
        for key in ("text", "thought"):
            chunk = p.get(key)
            if isinstance(chunk, str) and chunk.strip():
                texts.append(chunk)
                break

    snippet = "".join(texts).strip()
    if snippet:
        return snippet, ""

    bits: list[str] = []
    if finish:
        bits.append(f"finishReason={finish}")
    if not parts:
        bits.append("content.parts missing or empty")
    elif not texts:
        bits.append("parts exist but no text/thought strings (new API part shape?)")
    if finish in ("SAFETY", "RECITATION", "OTHER") and not snippet:
        bits.append("model produced no text (often safety/recitation)")
    return "", "; ".join(bits) if bits else "empty candidates[0] content"


def _strip_gemini_key(s: str) -> str:
    return (s or "").strip().replace("\ufeff", "").replace("\u200b", "").replace("\r", "")


def _gemini_quota_rotate_warn(http_status: int, failed_key_index0: int, pool_len: int) -> str:
    """
    Human-readable line when rotating after 429/503.

    ``failed_key_index0`` is 0-based (first key tried in *this* request is 0). The try order for
    each new HTTP call starts from the sticky preferred key (last success) when enabled, so
    ``1/pool_len`` here means "first key in this call's sequence failed," not a global quota step.
    """
    return (
        f"Gemini HTTP {http_status} — try-sequence {failed_key_index0 + 1}/{pool_len}: this key slot "
        f"failed; next key immediately (no wait). "
        f"(Each new request starts from the sticky preferred key when GEMINI_STICKY_LAST_SUCCESS=1.)"
    )


def _gemini_sticky_enabled() -> bool:
    v = (os.getenv("GEMINI_STICKY_LAST_SUCCESS") or "1").strip().lower()
    return v not in ("0", "false", "no", "off")


def _gemini_deduped_pool(settings: dict[str, Any]) -> list[str]:
    """Unique keys in config order (merged GEMINI_API_KEY + GEMINI_API_KEY_2…)."""
    lst = settings.get("gemini_api_keys")
    raw: list[str] = []
    if isinstance(lst, list) and lst:
        seen: set[str] = set()
        for k in lst:
            sk = _strip_gemini_key(str(k))
            if sk and sk not in seen:
                seen.add(sk)
                raw.append(sk)
    if not raw:
        one = active_gemini_api_key(settings)
        return [one] if one else []
    return raw


def _gemini_record_success_for_key(key: str) -> None:
    """Remember which key worked so the next request tries it first (when sticky mode is on)."""
    global _gemini_last_success_key
    if not _gemini_sticky_enabled():
        return
    sk = _strip_gemini_key(key)
    if sk:
        _gemini_last_success_key = sk


def _gemini_ordered_keys(settings: dict[str, Any]) -> list[str]:
    """
    Deduplicated pool order for fallback.

    Default (GEMINI_STICKY_LAST_SUCCESS=1): last successful key first, then remaining keys in pool
    order (wrap to the start after the last key).

    Legacy (GEMINI_STICKY_LAST_SUCCESS=0): time-active key first (same as pre-sticky behaviour).

    BYOK / single-key yields a one-element list.
    """
    raw = _gemini_deduped_pool(settings)
    if len(raw) <= 1:
        return raw
    if not _gemini_sticky_enabled():
        active = active_gemini_api_key(settings)
        try:
            start = next(i for i, x in enumerate(raw) if x == active)
        except StopIteration:
            start = 0
        return raw[start:] + raw[:start]
    lk = _gemini_last_success_key
    if lk:
        try:
            idx = next(i for i, x in enumerate(raw) if x == lk)
            return raw[idx:] + raw[:idx]
        except StopIteration:
            pass
    return raw


def _gemini_generate_url_for_key(settings: dict[str, Any], api_key: str) -> str:
    """REST URL for generateContent with an explicit API key (used for multi-key fallback)."""
    key = _strip_gemini_key(api_key)
    model = (settings.get("gemini_model") or "gemini-2.5-flash").strip()
    endpoint = settings.get("gemini_api_endpoint", "generativelanguage")
    api_ver = (settings.get("gemini_rest_api_version") or "v1").strip().lower()
    if api_ver not in ("v1", "v1beta"):
        api_ver = "v1"
    if not key:
        raise RuntimeError("GEMINI_API_KEY is empty")
    qkey = quote(key, safe="")
    if endpoint == "aiplatform":
        return (
            "https://aiplatform.googleapis.com/v1/publishers/google/models/"
            f"{model}:generateContent?key={qkey}"
        )
    return (
        f"https://generativelanguage.googleapis.com/{api_ver}/models/{model}:generateContent"
        f"?key={qkey}"
    )


def _gemini_429_sleep_retry_enabled() -> bool:
    v = (os.getenv("GEMINI_429_SLEEP_RETRY") or "1").strip().lower()
    return v not in ("0", "false", "no", "off")


def _gemini_429_max_sleep_sec() -> float:
    try:
        return min(120.0, max(1.0, float((os.getenv("GEMINI_429_MAX_SLEEP_SEC") or "45").strip())))
    except (TypeError, ValueError):
        return 45.0


def _gemini_retry_after_seconds(response: httpx.Response) -> float | None:
    h = response.headers.get("Retry-After")
    if h:
        try:
            return float(h.strip())
        except ValueError:
            pass
    raw = (response.text or "")[:8000]
    m = re.search(r"retry in\s+([0-9]+(?:\.[0-9]+)?)\s*s", raw, re.I)
    if m:
        try:
            return float(m.group(1))
        except ValueError:
            pass
    return None


async def _gemini_retry_same_key_once_after_429(
    client: httpx.AsyncClient,
    url: str,
    payload: dict[str, Any],
    r: httpx.Response,
    *,
    pool_size: int = 1,
) -> httpx.Response:
    """
    First POST already returned HTTP 429 for this URL/key and there are **no** other keys left to try.
    Optionally sleep for Google's suggested window, then POST **once** more on the same key.

    When ``GEMINI_API_KEY_2``… (or a multi-key pool) is configured, callers should rotate to the next
    key **before** calling this — no sleep, so the user does not wait while another key is available.
    """
    if r.status_code != 429:
        return r
    if _GEMINI_ADMIN_TEST_NO_429_WAIT.get():
        return r
    if not _gemini_429_sleep_retry_enabled():
        return r
    delay = _gemini_retry_after_seconds(r)
    if delay is None or delay <= 0:
        return r
    cap = _gemini_429_max_sleep_sec()
    wait = min(delay, cap)
    pool_note = (
        f"After HTTP 429 on all {pool_size} distinct key(s) in the pool — "
        if pool_size > 1
        else "Only one key in the pool — "
    )
    log_event(
        "INFO",
        f"Gemini 429: {pool_note}waiting {wait:.1f}s then one retry (same key). "
        "If you expected more keys, check startup log "
        "\"Gemini API key pool\" for unique vs duplicate env slots. "
        "Free-tier quota is per Google Cloud project; billing or separate projects may be required. "
        "https://ai.google.dev/gemini-api/docs/rate-limits",
    )
    await asyncio.sleep(wait)
    return await client.post(url, json=payload)


async def _gemini_post_with_quota_fallback(
    settings: dict[str, Any],
    payload: dict[str, Any],
    *,
    timeout: float,
) -> httpx.Response:
    """
    POST generateContent; on HTTP 429 / 503 try the next key in the pool (sticky preferred key first).
    Other 4xx/5xx: no key rotation (likely same failure for every key).
    """
    keys = _gemini_ordered_keys(settings)
    if not keys:
        raise RuntimeError("GEMINI_API_KEY is empty")
    async with httpx.AsyncClient(timeout=timeout) as client:
        for i, key in enumerate(keys):
            ok = await wait_gemini_budget_or_skip(key)
            if not ok:
                log_event(
                    "INFO",
                    "Gemini budget: daily request cap for this key — trying next key in pool",
                )
                continue
            url = _gemini_generate_url_for_key(settings, key)
            r = await client.post(url, json=payload)
            if r.status_code in _GEMINI_QUOTA_RETRY_STATUS:
                if i < len(keys) - 1:
                    log_event("WARN", _gemini_quota_rotate_warn(r.status_code, i, len(keys)))
                    continue
                if r.status_code == 429:
                    r = await _gemini_retry_same_key_once_after_429(
                        client, url, payload, r, pool_size=len(keys)
                    )
                if r.status_code in _GEMINI_QUOTA_RETRY_STATUS:
                    log_event("ERROR", format_gemini_http_error(r))
                    r.raise_for_status()
            if r.status_code >= 400:
                log_event("ERROR", format_gemini_http_error(r))
            r.raise_for_status()
            _gemini_record_success_for_key(key)
            return r
    raise RuntimeError(
        "Gemini: no successful request — all keys skipped (daily budget per GEMINI_BUDGET_RPD) or exhausted"
    )


async def gemini_consultant_post_with_quota_fallback(
    settings: dict[str, Any],
    *,
    payload: dict[str, Any],
    want_json_mime: bool,
    base_generation_config: dict[str, Any],
    timeout: float = 90.0,
) -> httpx.Response:
    """
    Consultant generateContent: same key fallback on 429/503; on 400 with JSON MIME, retry once
    without JSON MIME on the **same** key (existing behaviour), then move to next key only for quota.
    """
    keys = _gemini_ordered_keys(settings)
    if not keys:
        raise RuntimeError("GEMINI_API_KEY is empty")
    async with httpx.AsyncClient(timeout=timeout) as client:
        for i, key in enumerate(keys):
            ok = await wait_gemini_budget_or_skip(key)
            if not ok:
                log_event(
                    "INFO",
                    "Gemini budget: daily request cap for this key — trying next key in pool",
                )
                continue
            url = _gemini_generate_url_for_key(settings, key)
            effective_payload: dict[str, Any] = dict(payload)
            r = await client.post(url, json=effective_payload)
            if r.status_code == 400 and want_json_mime:
                log_event(
                    "WARN",
                    "Gemini consultant: responseMimeType rejected (400); retrying without JSON MIME. "
                    "Unset GEMINI_CONSULTANT_RESPONSE_JSON or use GEMINI_REST_API_VERSION=v1beta if supported.",
                )
                ok2 = await wait_gemini_budget_or_skip(key)
                if not ok2:
                    log_event("WARN", "Gemini budget: no slot for JSON-MIME retry — rotating key")
                    if i < len(keys) - 1:
                        continue
                    raise RuntimeError(
                        "Gemini consultant: daily budget exhausted for all keys before MIME retry"
                    )
                effective_payload = {**payload, "generationConfig": dict(base_generation_config)}
                r = await client.post(url, json=effective_payload)
            if r.status_code in _GEMINI_QUOTA_RETRY_STATUS:
                if i < len(keys) - 1:
                    log_event("WARN", _gemini_quota_rotate_warn(r.status_code, i, len(keys)))
                    continue
                if r.status_code == 429:
                    r = await _gemini_retry_same_key_once_after_429(
                        client, url, effective_payload, r, pool_size=len(keys)
                    )
            if r.status_code >= 400:
                log_event("WARN", format_gemini_http_error(r))
            try:
                r.raise_for_status()
            except httpx.HTTPStatusError as e:
                code = e.response.status_code if e.response is not None else r.status_code
                raise RuntimeError(f"Gemini HTTP {code}") from e
            _gemini_record_success_for_key(key)
            return r
    raise RuntimeError(
        "Gemini consultant: no successful request — all keys skipped (daily budget per GEMINI_BUDGET_RPD) or exhausted"
    )


def format_gemini_http_error(response: httpx.Response) -> str:
    """Human-readable line for admin logs (Google returns JSON with error.message)."""
    code = response.status_code
    raw = (response.text or "")[:2500]
    try:
        data = response.json()
        err = data.get("error") if isinstance(data, dict) else None
        if isinstance(err, dict):
            msg = (err.get("message") or err.get("status") or "").strip()
            status = (err.get("status") or "").strip()
            if msg:
                line = f"Gemini HTTP {code} ({status}): {msg}"
                if code == 404:
                    line += (
                        " — Set GEMINI_MODEL to a model your API version supports (e.g. gemini-2.5-flash or "
                        "gemini-2.0-flash); or try GEMINI_REST_API_VERSION=v1beta."
                    )
                elif code == 403:
                    line += (
                        " — Check Google AI Studio / Cloud: API enabled, billing, and project not restricted."
                    )
                return line
    except Exception:
        pass
    return f"Gemini HTTP {code}: {raw}"


async def run_llm(
    user_message: str,
    dashboard_context: str,
) -> tuple[str, float | None]:
    """
    Returns (assistant_text, latency_seconds or None on hard failure before timing).
    """
    settings = get_settings()
    provider = settings["llm_provider"]
    t0 = time.perf_counter()

    extra = ""
    if settings.get("game_reference_enabled", True):
        p = settings.get("game_reference_l10n")
        extra = build_game_reference_block(Path(p) if p else None)
    merged_ctx = dashboard_context
    if extra:
        merged_ctx = dashboard_context + "\n\n" + extra

    try:
        if provider == "gemini" and has_gemini_credentials(settings):
            text = await _gemini(settings, user_message, merged_ctx)
        else:
            text = await _openai(settings, user_message, merged_ctx)
        dt = time.perf_counter() - t0
        return text, dt
    except Exception as e:
        log_event("ERROR", f"LLM error: {e}", provider=provider)
        return FALLBACK_REPLY, None


async def _openai(settings: dict[str, Any], user_message: str, dashboard_context: str) -> str:
    from openai import AsyncOpenAI

    key = settings["llm_api_key"]
    if not key:
        raise RuntimeError("LLM_API_KEY not set")

    client = AsyncOpenAI(api_key=key)
    model = settings["llm_model"]
    system = settings["system_prompt"]

    resp = await client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system + "\n\n" + dashboard_context},
            {"role": "user", "content": user_message},
        ],
        temperature=0.4,
        max_tokens=1024,
    )
    return (resp.choices[0].message.content or "").strip() or FALLBACK_REPLY


def _gemini_generate_url(settings: dict[str, Any]) -> str:
    """REST URL using the time-active key (diagnostics / single-key callers)."""
    return _gemini_generate_url_for_key(settings, active_gemini_api_key(settings))


async def _gemini(settings: dict[str, Any], user_message: str, dashboard_context: str) -> str:
    """Google Gemini via Generative Language API or Vertex AI Platform publisher REST."""
    system = settings["system_prompt"]
    prompt = f"{system}\n\n{dashboard_context}\n\nUser: {user_message}"
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.4, "maxOutputTokens": 1024},
    }
    r = await _gemini_post_with_quota_fallback(settings, payload, timeout=60.0)
    data = r.json()
    text, empty_note = _gemini_extract_text_and_diagnostics(data)
    if not (text or "").strip() and empty_note:
        log_event("WARN", f"Gemini generateContent returned no text ({empty_note})")
    return (text or "").strip() or FALLBACK_REPLY


async def test_llm_connectivity(
    *,
    probe_message: str | None = None,
    settings: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    One request to OpenAI or Gemini to verify keys and model (admin diagnostics or startup probe).

    ``probe_message`` — user text; default is a tiny ping suitable for the admin "Test LLM" button.
    ``settings`` — optional merged settings (e.g. Farm Dashboard BYOK); defaults to ``get_settings()``.
    Never returns API keys; detail is a short reply snippet or error message.
    """
    settings = settings if settings is not None else get_settings()
    provider = (settings.get("llm_provider") or "openai").strip().lower()
    t0 = time.perf_counter()
    user_msg = (
        probe_message
        if probe_message is not None
        else "Reply with exactly the word OK."
    )
    gemini_max_out = 128 if len(user_msg) > 32 else 24
    openai_max_tokens = 120 if len(user_msg) > 32 else 12

    try:
        if provider == "gemini":
            if not has_gemini_credentials(settings):
                return {
                    "ok": False,
                    "provider": "gemini",
                    "latency_ms": None,
                    "detail": "GEMINI_API_KEY not set",
                }
            keys = _gemini_ordered_keys(settings)
            if not keys:
                return {
                    "ok": False,
                    "provider": "gemini",
                    "latency_ms": None,
                    "detail": "GEMINI_API_KEY not set",
                }
            # Same single-turn shape as _gemini(); role is optional and can confuse some v1 builds.
            payload_with_safety: dict[str, Any] = {
                "contents": [{"parts": [{"text": user_msg}]}],
                "generationConfig": {
                    "temperature": 0.2,
                    "maxOutputTokens": max(gemini_max_out, 256),
                },
                "safetySettings": _GEMINI_PROBE_SAFETY_SETTINGS,
            }
            payload_no_safety: dict[str, Any] = {
                "contents": [{"parts": [{"text": user_msg}]}],
                "generationConfig": {
                    "temperature": 0.2,
                    "maxOutputTokens": max(gemini_max_out, 256),
                },
            }
            r: httpx.Response | None = None
            async with httpx.AsyncClient(timeout=45.0) as client:
                for i, key in enumerate(keys):
                    url = _gemini_generate_url_for_key(settings, key)
                    post_payload: dict[str, Any] = payload_with_safety
                    r = await client.post(url, json=post_payload)
                    if r.status_code in (400, 403):
                        post_payload = payload_no_safety
                        r = await client.post(url, json=post_payload)
                    if r.status_code in _GEMINI_QUOTA_RETRY_STATUS:
                        if i < len(keys) - 1:
                            log_event("WARN", _gemini_quota_rotate_warn(r.status_code, i, len(keys)))
                            continue
                        if r.status_code == 429:
                            r = await _gemini_retry_same_key_once_after_429(
                                client, url, post_payload, r, pool_size=len(keys)
                            )
                    if r.status_code < 400:
                        _gemini_record_success_for_key(key)
                        break
                    return {
                        "ok": False,
                        "provider": "gemini",
                        "latency_ms": round((time.perf_counter() - t0) * 1000, 1),
                        "detail": format_gemini_http_error(r),
                        "model": settings.get("gemini_model"),
                    }
            ms = round((time.perf_counter() - t0) * 1000, 1)
            if r is None or r.status_code >= 400:
                return {
                    "ok": False,
                    "provider": "gemini",
                    "latency_ms": ms,
                    "detail": format_gemini_http_error(r) if r is not None else "Gemini probe failed",
                    "model": settings.get("gemini_model"),
                }
            try:
                data = r.json()
            except Exception:
                return {
                    "ok": False,
                    "provider": "gemini",
                    "latency_ms": ms,
                    "detail": "Gemini returned non-JSON body",
                    "model": settings.get("gemini_model"),
                }
            raw_snippet, empty_note = _gemini_extract_text_and_diagnostics(data)
            snippet = raw_snippet[:120]
            if not snippet and empty_note:
                detail = f"(empty reply) — {empty_note}"
            elif not snippet:
                detail = "(empty reply) — unknown cause (check model id and GEMINI_REST_API_VERSION)"
            else:
                detail = snippet
            return {
                "ok": True,
                "provider": "gemini",
                "latency_ms": ms,
                "detail": detail,
                "model": settings.get("gemini_model"),
            }

        if not (settings.get("llm_api_key") or "").strip():
            return {
                "ok": False,
                "provider": "openai",
                "latency_ms": None,
                "detail": "LLM_API_KEY not set",
            }
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=settings["llm_api_key"])
        model = settings["llm_model"]
        resp = await client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": user_msg}],
            temperature=0.2,
            max_tokens=openai_max_tokens,
        )
        text = (resp.choices[0].message.content or "").strip()[:120]
        ms = round((time.perf_counter() - t0) * 1000, 1)
        return {
            "ok": True,
            "provider": "openai",
            "latency_ms": ms,
            "detail": text or "(empty reply)",
            "model": model,
        }
    except Exception as e:
        ms = round((time.perf_counter() - t0) * 1000, 1)
        return {
            "ok": False,
            "provider": provider,
            "latency_ms": ms,
            "detail": str(e)[:500],
        }
