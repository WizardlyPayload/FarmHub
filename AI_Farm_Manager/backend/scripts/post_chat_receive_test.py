#!/usr/bin/env python3
"""
POST /api/chat/receive using the first profile token from data/bot_servers.json.
Run from the backend folder:  python scripts/post_chat_receive_test.py

Default base URL: http://127.0.0.1:8765 (match your uvicorn --port).
Override: set AI_TEST_BASE=http://127.0.0.1:8080 (or any host:port)
"""
from __future__ import annotations

import json
import os
import sys

# backend/ on sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import httpx  # noqa: E402

from app.services.bot_registry import get_registry_path, load_registry  # noqa: E402


def main() -> None:
    base = (os.environ.get("AI_TEST_BASE") or "http://127.0.0.1:8765").rstrip("/")
    reg = load_registry()
    insts = reg.get("instances") or []
    if not insts:
        print("No instances in", get_registry_path(), file=sys.stderr)
        sys.exit(1)
    token = (insts[0].get("server_token") or "").strip()
    if not token:
        print("First instance has empty server_token", file=sys.stderr)
        sys.exit(1)

    payload = {
        "player": "Test",
        "message": "!riley hello",
        "server_token": token,
    }
    url = f"{base}/api/chat/receive"
    print("Local file:", get_registry_path())
    print("token len", len(token), "fp first 12 of sha256:", end=" ")
    import hashlib

    print(hashlib.sha256(token.encode("utf-8")).hexdigest()[:12])

    h = httpx.get(f"{base}/health", timeout=10.0)
    print("GET /health ->", h.status_code, h.text[:500])

    print("POST", url)
    r = httpx.post(url, json=payload, timeout=30.0)
    print("status", r.status_code)
    print(r.text)
    sys.exit(0 if r.status_code == 200 else 1)


if __name__ == "__main__":
    main()
