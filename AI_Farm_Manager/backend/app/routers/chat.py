"""Chat receive + poll endpoints for the LUA mod."""
from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from pydantic import BaseModel, Field

from app.config import get_settings
from app.services.bot_registry import normalize_server_token, resolve_auth
from app.services.dashboard_service import build_dashboard_context_block, fetch_dashboard_json
from app.services.llm_service import FALLBACK_REPLY, run_llm
from app.services.log_buffer import log_event
from app.services.outgoing_queue import push_message
from app.services.rate_limit import allow

router = APIRouter(prefix="/api/chat", tags=["chat"])


class ReceiveBody(BaseModel):
    player: str = Field(..., min_length=1, max_length=128)
    message: str = Field(..., min_length=0, max_length=2000)
    server_token: str = Field(..., min_length=1)


async def _process_llm_job(player: str, text: str, fetch_url: str | None, server_token: str) -> None:
    settings = get_settings()
    if not settings.get("llm_configured"):
        push_message(
            "Bot",
            "AI replies are off or no LLM API key is set — add LLM_API_KEY in the host environment or enable the bot in admin.",
            server_token,
        )
        log_event("WARN", "LLM skipped — missing API key or bot disabled", player=player)
        return

    raw, err = await fetch_dashboard_json(fetch_url or "")
    ctx = build_dashboard_context_block(raw, err)
    try:
        reply, latency = await asyncio.wait_for(
            run_llm(text, ctx),
            timeout=90.0,
        )
        push_message("Bot", reply, server_token)
        log_event(
            "INFO",
            "LLM reply queued",
            player=player,
            latency_s=round(latency, 3) if latency else None,
        )
    except asyncio.TimeoutError:
        log_event("WARN", "LLM timeout", player=player)
        push_message("Bot", FALLBACK_REPLY, server_token)
    except Exception as e:
        log_event("ERROR", f"LLM job failed: {e}", player=player)
        push_message("Bot", FALLBACK_REPLY, server_token)


@router.post("/receive")
async def receive_chat(body: ReceiveBody, background_tasks: BackgroundTasks) -> dict[str, Any]:
    ok, err, fetch_url, instance_on = resolve_auth(body.server_token)
    if not ok:
        log_event(
            "WARN",
            "Chat /receive auth failed — check registry_file + legacy_server_token_set on GET /health",
            error=err,
            token_len=len((body.server_token or "").strip()),
        )
        raise HTTPException(status_code=401, detail=err or "Invalid server_token")

    tok = normalize_server_token(body.server_token)
    settings = get_settings()
    if not settings["bot_enabled"]:
        return {"ok": True, "ignored": True, "reason": "bot_disabled"}
    if not instance_on:
        return {"ok": True, "ignored": True, "reason": "bot_disabled_instance"}

    msg = body.message.strip()
    prefix = settings["trigger_prefix"]
    if not msg.lower().startswith(prefix.lower()):
        return {"ok": True, "ignored": True, "reason": "no_trigger"}

    rate_key = f"{tok}:{body.player}"
    if not allow(rate_key, max_per_minute=5):
        push_message(
            "Bot",
            "You're sending messages a bit fast — wait a moment and try again.",
            tok,
        )
        log_event("WARN", "Rate limited", player=body.player)
        return {"ok": True, "queued": True, "rate_limited": True}

    user_text = msg[len(prefix) :].strip()
    if not user_text:
        push_message(
            "Bot",
            f'Say something after "{prefix}", e.g. {prefix} what is growing?',
            tok,
        )
        return {"ok": True, "queued": True}

    log_event("INFO", "Chat trigger", player=body.player, preview=user_text[:200])
    background_tasks.add_task(_process_llm_job, body.player, user_text, fetch_url, tok)
    return {"ok": True, "queued": True}


@router.get("/poll")
async def poll_chat(server_token: str = Query(..., min_length=1)) -> dict[str, Any]:
    ok, err, _, _ = resolve_auth(server_token)
    if not ok:
        raise HTTPException(status_code=401, detail=err or "Invalid server_token")
    from app.services.outgoing_queue import pop_all

    messages = pop_all(normalize_server_token(server_token))
    return {"messages": messages}
