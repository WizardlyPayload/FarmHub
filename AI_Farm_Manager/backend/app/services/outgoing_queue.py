"""Per–server_token queues: each G-Portal / dedi instance only receives its own bot replies."""
from __future__ import annotations

from threading import Lock
from typing import Any

_lock = Lock()
# server_token -> list of {sender, text}
_queues: dict[str, list[dict[str, Any]]] = {}


def push_message(sender: str, text: str, server_token: str) -> None:
    if not server_token:
        return
    with _lock:
        if server_token not in _queues:
            _queues[server_token] = []
        _queues[server_token].append({"sender": sender, "text": text})


def pop_all(server_token: str) -> list[dict[str, Any]]:
    if not server_token:
        return []
    with _lock:
        q = _queues.pop(server_token, [])
        return list(q)


def peek_count(server_token: str) -> int:
    with _lock:
        return len(_queues.get(server_token, []))
