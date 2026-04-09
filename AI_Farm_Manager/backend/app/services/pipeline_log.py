"""Structured [Pipeline] logs for admin /health-style debugging (see log_buffer in /admin)."""
from __future__ import annotations

from typing import Any

from app.services.log_buffer import log_event


def log_pipeline(stage: str, message: str, level: str = "INFO", **extra: Any) -> None:
    """
    ``stage`` — short id, e.g. ``push_in``, ``ftp_in``, ``fetch_out``, ``consultant_in``.

    All entries include ``pipeline=True`` so UIs can filter later if needed.
    """
    if level not in ("INFO", "WARN", "ERROR"):
        level = "INFO"
    log_event(level, f"[Pipeline] {stage}: {message}", pipeline=True, pipeline_stage=stage, **extra)


def approx_json_bytes(obj: Any) -> int:
    """UTF-8 length of JSON serialization (for logs only)."""
    import json

    try:
        return len(json.dumps(obj, ensure_ascii=False, default=str).encode("utf-8"))
    except Exception:
        return -1
