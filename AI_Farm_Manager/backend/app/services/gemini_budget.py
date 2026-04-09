"""
Client-side Gemini usage budgeting (per API key).

Google enforces RPM / TPM / RPD server-side; this module **proactively** stays under
configurable ceilings so multi-key setups spread load and you burn fewer 429s on free tier.

Limits apply **per key** (each key has its own counters). In-memory only — multi-process
deployments need sticky routing or Redis if strict global accounting is required.

Typical Google AI Studio free tier (varies by model): ~5 RPM, ~20 RPD, ~250K TPM per key.
Tune via GEMINI_BUDGET_RPM / GEMINI_BUDGET_RPD; set GEMINI_BUDGET_ENABLED=0 to disable.
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import threading
import time
from collections import deque
from datetime import datetime, timezone

from app.services.log_buffer import log_event

logger = logging.getLogger(__name__)

_lock = threading.Lock()
# key_id -> {"rpm": deque of monotonic timestamps, "day": "YYYY-MM-DD" UTC, "rpd": int}
_state: dict[str, dict[str, object]] = {}


def _enabled() -> bool:
    v = (os.getenv("GEMINI_BUDGET_ENABLED") or "1").strip().lower()
    return v not in ("0", "false", "no", "off")


def _rpm_limit() -> int:
    try:
        return max(1, int((os.getenv("GEMINI_BUDGET_RPM") or "4").strip()))
    except (TypeError, ValueError):
        return 4


def _rpd_limit() -> int:
    try:
        return max(1, int((os.getenv("GEMINI_BUDGET_RPD") or "18").strip()))
    except (TypeError, ValueError):
        return 18


def _key_id(api_key: str) -> str:
    k = (api_key or "").strip()
    if not k:
        return ""
    return hashlib.sha256(k.encode("utf-8")).hexdigest()[:20]


def _utc_day() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _prune_rpm_window(rpm: deque, now: float) -> None:
    while rpm and now - float(rpm[0]) >= 60.0:
        rpm.popleft()


async def wait_gemini_budget_or_skip(api_key: str) -> bool:
    """
    Reserve one generateContent "slot" for this key under RPM + RPD caps.

    - If the key's **daily** request budget is exhausted: return ``False`` (caller should try
      another key in the pool — each key has its own RPD).
    - If RPM is saturated: **async-sleep** until a slot opens in the rolling 60s window, then return ``True``.
    - Otherwise record the request and return ``True``.

    When disabled (GEMINI_BUDGET_ENABLED=0), always returns ``True`` without recording.
    """
    if not _enabled():
        return True
    kid = _key_id(api_key)
    if not kid:
        return True

    rpm_limit = _rpm_limit()
    rpd_limit = _rpd_limit()

    while True:
        sleep_s = 0.0
        with _lock:
            now = time.monotonic()
            day = _utc_day()
            st = _state.setdefault(kid, {"rpm": deque(), "day": day, "rpd": 0})
            if st.get("day") != day:
                st["day"] = day
                st["rpd"] = 0

            rpd = int(st.get("rpd") or 0)
            if rpd >= rpd_limit:
                log_event(
                    "INFO",
                    "Gemini budget: daily request cap reached for this key — try next key or wait until UTC midnight",
                    rpd=rpd,
                    rpd_limit=rpd_limit,
                )
                return False

            rpm = st["rpm"]
            assert isinstance(rpm, deque)
            _prune_rpm_window(rpm, now)

            if len(rpm) < rpm_limit:
                rpm.append(now)
                st["rpd"] = rpd + 1
                return True

            oldest = float(rpm[0])
            sleep_s = max(0.05, 60.0 - (now - oldest))

        log_event(
            "INFO",
            f"Gemini budget: RPM cap — waiting {sleep_s:.1f}s before next request on this key",
            rpm_limit=rpm_limit,
        )
        await asyncio.sleep(min(sleep_s, 120.0))


def budget_snapshot_for_debug() -> dict[str, object]:
    """Non-secret counts for admin/diagnostics (key ids are hashed)."""
    out: dict[str, object] = {}
    with _lock:
        day = _utc_day()
        for kid, st in _state.items():
            rpm = st.get("rpm")
            if not isinstance(rpm, deque):
                continue
            now = time.monotonic()
            _prune_rpm_window(rpm, now)
            out[kid] = {
                "rpm_window_len": len(rpm),
                "rpd_day": st.get("day"),
                "rpd_count": st.get("rpd"),
                "day_matches_utc": st.get("day") == day,
            }
    return {
        "enabled": _enabled(),
        "rpm_limit": _rpm_limit(),
        "rpd_limit": _rpd_limit(),
        "keys": out,
    }
