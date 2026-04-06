"""In-memory ring buffer for admin UI logs (not durable)."""
from __future__ import annotations

from collections import deque
from datetime import datetime, timezone
from threading import Lock
from typing import Any

_MAX = 2000
_lock = Lock()
_buffer: deque[dict[str, Any]] = deque(maxlen=_MAX)


def log_event(level: str, message: str, **extra: Any) -> None:
    row = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "level": level,
        "message": message,
        **extra,
    }
    with _lock:
        _buffer.append(row)


def get_logs(since_index: int = 0) -> tuple[list[dict[str, Any]], int]:
    """Return logs from *since_index* (line number 0-based) and current total count."""
    with _lock:
        total = len(_buffer)
        items = list(_buffer)[since_index:]
    return items, total


def get_recent_logs(limit: int = 200) -> tuple[list[dict[str, Any]], int]:
    """Return the last *limit* entries and total rows in buffer (for admin polling)."""
    with _lock:
        total = len(_buffer)
        buf = list(_buffer)
    if limit <= 0:
        return [], total
    return buf[-limit:], total
