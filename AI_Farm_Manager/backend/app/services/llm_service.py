"""LLM calls (OpenAI or Gemini)."""
from __future__ import annotations

import time
from typing import Any

import httpx
from pathlib import Path
from urllib.parse import quote

from app.config import get_settings
from app.services.game_reference import build_game_reference_block
from app.services.log_buffer import log_event

FALLBACK_REPLY = (
    "Sorry, I'm checking my notes right now, ask again in a minute!"
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
        if provider == "gemini" and settings["gemini_api_key"]:
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
    """REST URL for non-streaming generateContent (same body as streamGenerateContent minus SSE)."""
    key = (settings.get("gemini_api_key") or "").strip().replace("\ufeff", "").replace("\u200b", "")
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


async def _gemini(settings: dict[str, Any], user_message: str, dashboard_context: str) -> str:
    """Google Gemini via Generative Language API or Vertex AI Platform publisher REST."""
    system = settings["system_prompt"]
    url = _gemini_generate_url(settings)
    prompt = f"{system}\n\n{dashboard_context}\n\nUser: {user_message}"
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.4, "maxOutputTokens": 1024},
    }
    async with httpx.AsyncClient(timeout=60.0) as client:
        r = await client.post(url, json=payload)
        if r.status_code >= 400:
            log_event("ERROR", format_gemini_http_error(r))
        r.raise_for_status()
        data = r.json()
    parts = (
        data.get("candidates", [{}])[0]
        .get("content", {})
        .get("parts", [])
    )
    text = "".join(p.get("text", "") for p in parts).strip()
    return text or FALLBACK_REPLY


async def test_llm_connectivity(
    *,
    probe_message: str | None = None,
) -> dict[str, Any]:
    """
    One request to OpenAI or Gemini to verify keys and model (admin diagnostics or startup probe).

    ``probe_message`` — user text; default is a tiny ping suitable for the admin "Test LLM" button.
    Never returns API keys; detail is a short reply snippet or error message.
    """
    settings = get_settings()
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
            if not (settings.get("gemini_api_key") or "").strip():
                return {
                    "ok": False,
                    "provider": "gemini",
                    "latency_ms": None,
                    "detail": "GEMINI_API_KEY not set",
                }
            url = _gemini_generate_url(settings)
            payload = {
                "contents": [{"parts": [{"text": user_msg}]}],
                "generationConfig": {"temperature": 0.2, "maxOutputTokens": gemini_max_out},
            }
            async with httpx.AsyncClient(timeout=45.0) as client:
                r = await client.post(url, json=payload)
            ms = round((time.perf_counter() - t0) * 1000, 1)
            if r.status_code >= 400:
                return {
                    "ok": False,
                    "provider": "gemini",
                    "latency_ms": ms,
                    "detail": format_gemini_http_error(r),
                    "model": settings.get("gemini_model"),
                }
            data = r.json()
            parts = (
                data.get("candidates", [{}])[0]
                .get("content", {})
                .get("parts", [])
            )
            snippet = ("".join(p.get("text", "") for p in parts) or "").strip()[:120]
            return {
                "ok": True,
                "provider": "gemini",
                "latency_ms": ms,
                "detail": snippet or "(empty reply)",
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
