"""LLM calls (OpenAI or Gemini)."""
from __future__ import annotations

import asyncio
import os
import re
import threading
import time
from contextvars import ContextVar
from pathlib import Path
from typing import Any
from urllib.parse import quote

import httpx

from app.config import active_gemini_api_key, get_settings, has_gemini_credentials
from app.services.gemini_http_client import get_gemini_async_client
from app.services.game_reference import build_game_reference_block
from app.services.gemini_budget import wait_gemini_budget_or_skip
from app.services.log_buffer import log_event

# Retry: model degradation on same key (429/503), then next API key in round-robin order.
_GEMINI_QUOTA_RETRY_STATUS: frozenset[int] = frozenset({429, 503})

# Strict round-robin: each new request advances this counter to pick the first key in the rotated pool.
_gemini_rr_lock = threading.Lock()
_gemini_rr_counter: int = 0

# Default multi-model chain — stable 2.5 first (avoids 404 on v1 for unreleased preview ids). Previews last.
# Use GET /api/integration/gemini-models in Farm Dashboard to see IDs your key supports.
_DEFAULT_GEMINI_MODEL_ROLLOVER: tuple[str, ...] = (
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.5-pro",
    "gemini-3-flash-preview",
    "gemini-3.1-flash-lite-preview",
    "gemini-3.1-pro-preview",
)


def _gemini_model_pool(settings: dict[str, Any]) -> list[str] | None:
    """
    Ordered model stack (best first) for 429/503 degradation on a fixed API key.

    - ``GEMINI_MODEL_ROLLOVER=0`` / ``false`` / ``off`` → single model only: ``GEMINI_MODEL`` (legacy).
    - Unset → default 6-model chain above.
    - Non-empty comma list → custom order (comma-separated, first = preferred).
    """
    raw = (os.getenv("GEMINI_MODEL_ROLLOVER") or "").strip()
    if raw.lower() in ("0", "false", "no", "off"):
        return None
    if not raw:
        return list(_DEFAULT_GEMINI_MODEL_ROLLOVER)
    parts = [p.strip() for p in raw.split(",") if p.strip()]
    return parts if parts else list(_DEFAULT_GEMINI_MODEL_ROLLOVER)


def _gemini_single_config_model(settings: dict[str, Any]) -> str:
    """When ``GEMINI_MODEL_ROLLOVER`` is off — single explicit ``GEMINI_MODEL`` only (no cycling)."""
    return (settings.get("gemini_model") or "gemini-2.5-flash").strip()


def _gemini_models_to_try_for_key(settings: dict[str, Any]) -> list[str]:
    """
    Top-down model stack for **every** request and **every** API key: index 0 is best (``GEMINI_MODEL``
    when rollover is off, else first entry in ``GEMINI_MODEL_ROLLOVER`` / default chain).

    On 429/503, step down within this list on the **same** key before rotating to the next key.
    No cross-request “sticky” downgrade — each new request starts again from the best model.
    """
    pool = _gemini_model_pool(settings)
    if pool is None:
        return [_gemini_single_config_model(settings)]
    return list(pool)

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


def _gemini_quota_rotate_warn(
    http_status: int,
    failed_key_index0: int,
    pool_len: int,
    *,
    model_id: str | None = None,
) -> str:
    """
    Human-readable line when rotating to the next API key after 429/503 on all models for the
    current key.

    ``failed_key_index0`` is 0-based within this request’s **round-robin rotated** key order.
    """
    m = f" model={model_id!r}" if model_id else ""
    return (
        f"Gemini HTTP {http_status} — key attempt {failed_key_index0 + 1}/{pool_len}: "
        f"all models exhausted on this key; rotating to next key (best model first).{m} "
        f"(Round-robin key order; model stack from GEMINI_MODEL_ROLLOVER / GEMINI_MODEL.)"
    )


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


def _gemini_rr_next_start(pool_len: int) -> int:
    """Next round-robin offset into the deduped key pool (BYOK / single-key → always 0)."""
    global _gemini_rr_counter
    if pool_len <= 1:
        return 0
    with _gemini_rr_lock:
        start = _gemini_rr_counter % pool_len
        _gemini_rr_counter += 1
        return start


def _gemini_round_robin_key_order(settings: dict[str, Any]) -> list[str]:
    """
    Deduplicated keys rotated so each **incoming** request starts at the next key (strict RR).

    **BYOK** (exactly one key): returns that single key — no pool rotation; model degradation still
    uses the full ``GEMINI_MODEL_ROLLOVER`` stack on 429/503.
    """
    raw = _gemini_deduped_pool(settings)
    if len(raw) <= 1:
        return raw
    start = _gemini_rr_next_start(len(raw))
    return raw[start:] + raw[:start]


def _gemini_generate_url_for_key(
    settings: dict[str, Any],
    api_key: str,
    *,
    model_override: str | None = None,
) -> str:
    """REST URL for generateContent with an explicit API key (used for multi-key fallback)."""
    key = _strip_gemini_key(api_key)
    model = (model_override or settings.get("gemini_model") or "gemini-2.5-flash").strip()
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
    POST generateContent; on HTTP 429 / 503 step down the model stack on the same key, then the next
    key (round-robin start order for multi-key). Each request begins with the best model again.

    Other 4xx/5xx: no model cycling (same failure is raised immediately).
    """
    keys = _gemini_round_robin_key_order(settings)
    if not keys:
        raise RuntimeError("GEMINI_API_KEY is empty")
    client = get_gemini_async_client()
    n_keys = len(keys)
    models = _gemini_models_to_try_for_key(settings)
    for i, key in enumerate(keys):
        ok = await wait_gemini_budget_or_skip(key)
        if not ok:
            log_event(
                "INFO",
                "Gemini budget: daily request cap for this key — trying next key in pool",
            )
            continue
        for mi, model_try in enumerate(models):
            url = _gemini_generate_url_for_key(settings, key, model_override=model_try)
            r = await client.post(url, json=payload, timeout=timeout)
            if r.status_code in _GEMINI_QUOTA_RETRY_STATUS:
                if mi < len(models) - 1:
                    log_event(
                        "WARN",
                        f"Gemini HTTP {r.status_code} — same key, next model in rollover "
                        f"({mi + 2}/{len(models)}), was {model_try!r}.",
                    )
                    continue
                if i < n_keys - 1:
                    log_event(
                        "WARN",
                        _gemini_quota_rotate_warn(r.status_code, i, n_keys, model_id=model_try),
                    )
                    break
                if r.status_code == 429:
                    r = await _gemini_retry_same_key_once_after_429(
                        client, url, payload, r, pool_size=n_keys
                    )
                if r.status_code in _GEMINI_QUOTA_RETRY_STATUS:
                    log_event("ERROR", format_gemini_http_error(r))
                    r.raise_for_status()
                if r.status_code >= 400:
                    log_event("ERROR", format_gemini_http_error(r))
                r.raise_for_status()
                return r
            if r.status_code >= 400:
                log_event("ERROR", format_gemini_http_error(r))
            r.raise_for_status()
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
    Consultant generateContent: on 400 with JSON MIME, retry once without JSON MIME on the **same**
    model URL; on 429/503 use the top-down ``GEMINI_MODEL_ROLLOVER`` stack per key, then round-robin keys.
    """
    keys = _gemini_round_robin_key_order(settings)
    if not keys:
        raise RuntimeError("GEMINI_API_KEY is empty")
    client = get_gemini_async_client()
    n_keys = len(keys)
    models = _gemini_models_to_try_for_key(settings)

    for i, key in enumerate(keys):
        ok = await wait_gemini_budget_or_skip(key)
        if not ok:
            log_event(
                "INFO",
                "Gemini budget: daily request cap for this key — trying next key in pool",
            )
            continue
        for mi, model_try in enumerate(models):
            url = _gemini_generate_url_for_key(settings, key, model_override=model_try)
            effective_payload: dict[str, Any] = dict(payload)
            r = await client.post(url, json=effective_payload, timeout=timeout)
            if r.status_code == 400 and want_json_mime:
                log_event(
                    "WARN",
                    "Gemini consultant: responseMimeType rejected (400); retrying without JSON MIME. "
                    "Unset GEMINI_CONSULTANT_RESPONSE_JSON or use GEMINI_REST_API_VERSION=v1beta if supported.",
                )
                ok2 = await wait_gemini_budget_or_skip(key)
                if not ok2:
                    log_event("WARN", "Gemini budget: no slot for JSON-MIME retry — rotating key")
                    if i < n_keys - 1:
                        break
                    raise RuntimeError(
                        "Gemini consultant: daily budget exhausted for all keys before MIME retry"
                    )
                effective_payload = {**payload, "generationConfig": dict(base_generation_config)}
                r = await client.post(url, json=effective_payload, timeout=timeout)
            if r.status_code in _GEMINI_QUOTA_RETRY_STATUS:
                if mi < len(models) - 1:
                    log_event(
                        "WARN",
                        f"Gemini consultant HTTP {r.status_code} — same key, next model "
                        f"({mi + 2}/{len(models)}), was {model_try!r}.",
                    )
                    continue
                if i < n_keys - 1:
                    log_event(
                        "WARN",
                        _gemini_quota_rotate_warn(r.status_code, i, n_keys, model_id=model_try),
                    )
                    break
                if r.status_code == 429:
                    r = await _gemini_retry_same_key_once_after_429(
                        client, url, effective_payload, r, pool_size=n_keys
                    )
            if r.status_code >= 400:
                log_event("WARN", format_gemini_http_error(r))
            try:
                r.raise_for_status()
            except httpx.HTTPStatusError as e:
                code = e.response.status_code if e.response is not None else r.status_code
                raise RuntimeError(f"Gemini HTTP {code}") from e
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
            keys = _gemini_round_robin_key_order(settings)
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
            models_try = _gemini_models_to_try_for_key(settings)
            r: httpx.Response | None = None
            last_model_try: str | None = None
            client = get_gemini_async_client()
            n_keys = len(keys)
            probe_ok = False
            for ki, key in enumerate(keys):
                for mi, model_try in enumerate(models_try):
                    last_model_try = model_try
                    url = _gemini_generate_url_for_key(settings, key, model_override=model_try)
                    post_payload: dict[str, Any] = payload_with_safety
                    r = await client.post(url, json=post_payload, timeout=45.0)
                    if r.status_code in (400, 403):
                        post_payload = payload_no_safety
                        r = await client.post(url, json=post_payload, timeout=45.0)
                    if r.status_code in _GEMINI_QUOTA_RETRY_STATUS:
                        if mi < len(models_try) - 1:
                            log_event(
                                "WARN",
                                f"Gemini probe HTTP {r.status_code} — same key, next model "
                                f"({mi + 2}/{len(models_try)}), was {model_try!r}.",
                            )
                            continue
                        if ki < n_keys - 1:
                            log_event(
                                "WARN",
                                _gemini_quota_rotate_warn(r.status_code, ki, n_keys, model_id=model_try),
                            )
                            break
                        if r.status_code == 429:
                            r = await _gemini_retry_same_key_once_after_429(
                                client, url, post_payload, r, pool_size=n_keys
                            )
                        if r is not None and r.status_code < 400:
                            probe_ok = True
                        break
                    if r.status_code < 400:
                        probe_ok = True
                        break
                    return {
                        "ok": False,
                        "provider": "gemini",
                        "latency_ms": round((time.perf_counter() - t0) * 1000, 1),
                        "detail": format_gemini_http_error(r),
                        "model": last_model_try or settings.get("gemini_model"),
                    }
                if probe_ok:
                    break
            ms = round((time.perf_counter() - t0) * 1000, 1)
            if r is None or r.status_code >= 400:
                return {
                    "ok": False,
                    "provider": "gemini",
                    "latency_ms": ms,
                    "detail": format_gemini_http_error(r) if r is not None else "Gemini probe failed",
                    "model": last_model_try or settings.get("gemini_model"),
                }
            try:
                data = r.json()
            except Exception:
                return {
                    "ok": False,
                    "provider": "gemini",
                    "latency_ms": ms,
                    "detail": "Gemini returned non-JSON body",
                    "model": last_model_try or settings.get("gemini_model"),
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
                "model": last_model_try or settings.get("gemini_model"),
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
