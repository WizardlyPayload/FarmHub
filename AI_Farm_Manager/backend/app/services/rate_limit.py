"""Sliding-window rate limiter per arbitrary key (e.g. server_token + player)."""
from __future__ import annotations

import time
from collections import defaultdict, deque
from threading import Lock

_lock = Lock()
_windows: dict[str, deque[float]] = defaultdict(lambda: deque(maxlen=64))


def allow(rate_key: str, max_per_minute: int = 5) -> bool:
    now = time.monotonic()
    window = 60.0
    with _lock:
        dq = _windows[rate_key]
        while dq and (now - dq[0]) > window:
            dq.popleft()
        if len(dq) >= max_per_minute:
            return False
        dq.append(now)
        return True
