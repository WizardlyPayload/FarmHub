"""Filesystem roots for backend data (`.env` next to `app/`).

Kept separate from ``app.config`` so services like ``connection_registry`` can resolve
``DATA_DIR`` without participating in the config → ``dashboard_service`` import chain.
"""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

_backend_root = Path(__file__).resolve().parent.parent
load_dotenv(_backend_root / ".env", override=True)


def get_backend_root() -> Path:
    """Directory containing `data/`, `.env`, and the `app` package (the `backend` folder)."""
    return _backend_root


def reload_backend_dotenv(*, override: bool = True) -> None:
    """Re-read `backend/.env` into `os.environ` (e.g. after admin UI writes the file)."""
    load_dotenv(get_backend_root() / ".env", override=override)


def get_data_dir() -> Path:
    """
    Persistent data directory for `bot_servers.json`, `farmdash_connections.json`, etc.

    Docker Compose maps `./data:/app/data` so this resolves to `/app/data` in the container.
    Override with `DATA_DIR` if needed (absolute path recommended).
    """
    override = (os.getenv("DATA_DIR") or "").strip()
    if override:
        return Path(override).resolve()
    return get_backend_root() / "data"
