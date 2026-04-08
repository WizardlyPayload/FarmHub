"""Subscription tier checks (optional; gated by ENABLE_SUBSCRIPTION_TIERS)."""
from __future__ import annotations

from typing import Any

from fastapi import HTTPException, Request

from app.config import get_settings
from app.services.bot_registry import find_instance_by_id, find_instance_by_token
from app.services.consultant import normalize_incoming_api_key

# Tier 0: dashboard only (BYOK allowed for AI elsewhere — not server-paid)
# Tier 1: server-paid consultant API
# Tier 2: consultant + in-game chat


def _tier_from_instance(inst: dict[str, Any] | None) -> int:
    if not inst:
        return int(get_settings().get("default_subscription_tier") or 2)
    raw = inst.get("subscription_tier")
    try:
        t = int(raw)
    except (TypeError, ValueError):
        return 2
    if t < 0:
        return 0
    if t > 2:
        return 2
    return t


def byok_headers_present(request: Request) -> bool:
    return bool(normalize_incoming_api_key(request.headers.get("X-AI-API-Key")))


def assert_consultant_allowed(request: Request) -> None:
    """
    Tier >= 1 required for server-paid consultant when tiers are enabled.
    BYOK bypasses. Anonymous integration uses DEFAULT_SUBSCRIPTION_TIER.
    """
    s = get_settings()
    if not s.get("enable_subscription_tiers"):
        return
    if byok_headers_present(request):
        return
    inst_id = (request.headers.get("X-Bot-Instance-Id") or "").strip()
    inst = find_instance_by_id(inst_id) if inst_id else None
    tier = _tier_from_instance(inst)
    if tier < 1:
        raise HTTPException(
            status_code=403,
            detail=(
                "This integration tier does not include server-paid Web Consultant. "
                "Add your own API key (BYOK) in Farm Dashboard, upgrade subscription, or set "
                "X-Bot-Instance-Id to a bot profile with tier >= 1."
            ),
        )


def assert_chat_allowed(request: Request, server_token: str) -> None:
    """
    Tier >= 2 required for in-game chat when tiers are enabled.
    BYOK (X-AI-API-Key) bypasses — for future proxies / tooling.
    """
    s = get_settings()
    if not s.get("enable_subscription_tiers"):
        return
    if byok_headers_present(request):
        return
    tok = (server_token or "").strip()
    inst = find_instance_by_token(tok) if tok else None
    tier = _tier_from_instance(inst)
    if tier < 2:
        raise HTTPException(
            status_code=403,
            detail=(
                "This subscription tier does not include in-game AI chat (!bot). "
                "Upgrade to Full Auto-Farm (tier 2) or use BYOK where supported."
            ),
        )
