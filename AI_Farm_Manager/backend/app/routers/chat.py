"""Chat receive + poll endpoints for the LUA mod."""
from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, Request
from pydantic import BaseModel, Field

from app.config import get_settings
from app.services.bot_registry import normalize_server_token, resolve_auth
from app.services.dashboard_service import build_dashboard_context_block, fetch_dashboard_json
from app.services.llm_service import FALLBACK_REPLY, run_llm
from app.services.log_buffer import log_event
from app.services.outgoing_queue import push_message
from app.services.rate_limit import allow
from app.services.pipeline_log import log_pipeline
from app.services.subscription import assert_chat_allowed

router = APIRouter(prefix="/api/chat", tags=["chat"])

# Display name in poll queue + in-game chat (classic farmer persona; matches consultant mentor voice).
CHAT_BOT_DISPLAY_NAME = "Hank"


class ReceiveBody(BaseModel):
    player: str = Field(..., min_length=1, max_length=128)
    message: str = Field(..., min_length=0, max_length=2000)
    server_token: str = Field(..., min_length=1)


async def _process_llm_job(player: str, text: str, fetch_url: str | None, server_token: str) -> None:
    settings = get_settings()
    if not settings.get("llm_configured"):
        push_message(
            CHAT_BOT_DISPLAY_NAME,
            "AI replies are off or no LLM API key is set — add LLM_API_KEY in the host environment or enable the bot in admin.",
            server_token,
        )
        log_event("WARN", "LLM skipped — missing API key or bot disabled", player=player)
        return

    raw, err = await fetch_dashboard_json(fetch_url or "")
    ctx = build_dashboard_context_block(raw, err)
    if raw is None:
        log_pipeline(
            "chat_snapshot",
            "chat LLM job: no dashboard snapshot available",
            "WARN",
            detail=(err or "")[:300],
        )
    try:
        reply, latency = await asyncio.wait_for(
            run_llm(text, ctx),
            timeout=90.0,
        )
        push_message(CHAT_BOT_DISPLAY_NAME, reply, server_token)
        log_event(
            "INFO",
            "LLM reply queued",
            player=player,
            latency_s=round(latency, 3) if latency else None,
        )
        log_pipeline(
            "chat_out",
            "Hank reply ready for GET /api/chat/poll (game mod)",
            player=player,
            reply_chars=len(reply or ""),
            latency_s=round(latency, 3) if latency else None,
            snapshot_ok=raw is not None,
        )
    except asyncio.TimeoutError:
        log_event("WARN", "LLM timeout", player=player)
        push_message(CHAT_BOT_DISPLAY_NAME, FALLBACK_REPLY, server_token)
    except Exception as e:
        log_event("ERROR", f"LLM job failed: {e}", player=player)
        push_message(CHAT_BOT_DISPLAY_NAME, FALLBACK_REPLY, server_token)


@router.post("/receive")
async def receive_chat(
    request: Request,
    body: ReceiveBody,
    background_tasks: BackgroundTasks,
) -> dict[str, Any]:
    ok, err, fetch_url, instance_on = resolve_auth(body.server_token)
    if not ok:
        log_event(
            "WARN",
            "Chat /receive auth failed — check registry_file + legacy_server_token_set on GET /health",
            error=err,
            token_len=len((body.server_token or "").strip()),
        )
        raise HTTPException(status_code=401, detail=err or "Invalid server_token")

    try:
        assert_chat_allowed(request, body.server_token)
    except HTTPException as exc:
        log_pipeline(
            "chat_blocked",
            f"POST /api/chat/receive rejected ({exc.status_code}): {exc.detail}",
            "WARN",
            player=body.player,
        )
        raise

    tok = normalize_server_token(body.server_token)
    settings = get_settings()
    prefix = settings["trigger_prefix"]
    msg = body.message.strip()

    log_pipeline(
        "chat_receive",
        "POST /api/chat/receive — authenticated; evaluating trigger and bot flags",
        player=body.player,
        trigger_prefix=prefix,
        trigger_matched=msg.lower().startswith(prefix.lower()),
    )

    if not settings["bot_enabled"]:
        log_pipeline(
            "chat_ignored",
            "bot disabled globally (ENABLE_AI_BOT / LLM keys)",
            "WARN",
            player=body.player,
        )
        return {"ok": True, "ignored": True, "reason": "bot_disabled"}
    if not instance_on:
        log_pipeline(
            "chat_ignored",
            "bot disabled for this server_token instance (admin / integration toggle)",
            "WARN",
            player=body.player,
        )
        return {"ok": True, "ignored": True, "reason": "bot_disabled_instance"}

    if not msg.lower().startswith(prefix.lower()):
        log_pipeline(
            "chat_ignored",
            "message does not match TRIGGER_PREFIX — sync server .env with modSettings triggerPrefix",
            "WARN",
            player=body.player,
            trigger_prefix=prefix,
            preview=msg[:160],
        )
        return {"ok": True, "ignored": True, "reason": "no_trigger"}

    rate_key = f"{tok}:{body.player}"
    if not allow(rate_key, max_per_minute=5):
        push_message(
            CHAT_BOT_DISPLAY_NAME,
            "You're sending messages a bit fast — wait a moment and try again.",
            tok,
        )
        log_event("WARN", "Rate limited", player=body.player)
        return {"ok": True, "queued": True, "rate_limited": True}

    user_text = msg[len(prefix) :].strip()
    if not user_text:
        push_message(
            CHAT_BOT_DISPLAY_NAME,
            f'Say something after "{prefix}", e.g. {prefix} what is growing?',
            tok,
        )
        return {"ok": True, "queued": True}

    log_event("INFO", "Chat trigger", player=body.player, preview=user_text[:200])
    log_pipeline(
        "chat_in",
        "POST /api/chat/receive — in-game trigger accepted; will fetch snapshot + LLM",
        player=body.player,
        preview_chars=len(user_text),
        trigger_prefix=prefix,
    )
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
