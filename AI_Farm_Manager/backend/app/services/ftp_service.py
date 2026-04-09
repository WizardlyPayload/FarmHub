"""Background FTP poll: download Farm Dashboard `data.json` into process memory for LLM + web UI."""
from __future__ import annotations

import asyncio
import json
import logging
import os
import threading
from io import BytesIO
from typing import Any

from app.services.pipeline_log import log_pipeline

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_raw_json: str | None = None
_last_error: str | None = None
_last_ok_at: float | None = None


def is_ftp_mode_enabled() -> bool:
    return bool(os.getenv("GPORTAL_FTP_HOST", "").strip())


def _resolve_ftp_port(default: int = 21) -> int:
    """Port from GPORTAL_FTP_PORT; default 21. Empty or invalid values fall back with a warning."""
    raw = (os.getenv("GPORTAL_FTP_PORT") or "").strip()
    if not raw:
        return default
    try:
        port = int(raw)
    except ValueError:
        logger.warning("GPORTAL_FTP_PORT=%r is not an integer; using %s", raw, default)
        return default
    if not (1 <= port <= 65535):
        logger.warning("GPORTAL_FTP_PORT=%s out of range; using %s", port, default)
        return default
    return port


def get_dashboard_json_from_memory() -> tuple[str | None, str | None]:
    """
    Returns (json_string, error_message).
    When FTP mode is off, returns (None, None) so callers can fall back to HTTP.
    When FTP mode is on but nothing loaded yet, returns (None, error_or_placeholder).
    """
    if not is_ftp_mode_enabled():
        return None, None
    with _lock:
        if _raw_json is not None:
            return _raw_json, None
        return None, _last_error or "Waiting for first FTP download…"


def get_dashboard_dict() -> dict[str, Any] | None:
    """Parsed snapshot for HTML dashboard (best-effort)."""
    with _lock:
        raw = _raw_json
    if not raw:
        return None
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {"data": data}
    except json.JSONDecodeError:
        return None


def _ftp_download_sync() -> tuple[str | None, str | None]:
    host = os.getenv("GPORTAL_FTP_HOST", "").strip()
    if not host:
        return None, "GPORTAL_FTP_HOST not set"

    user = os.getenv("GPORTAL_FTP_USER", "").strip()
    password = os.getenv("GPORTAL_FTP_PASS", "").strip()
    remote_path = (os.getenv("GPORTAL_FTP_PATH") or "").strip()
    if not remote_path:
        remote_path = "/data.json"
    use_tls = os.getenv("GPORTAL_FTP_TLS", "").lower() in ("1", "true", "yes", "on")
    port = _resolve_ftp_port(21)

    import ftplib

    buf = BytesIO()
    ftp: ftplib.FTP | ftplib.FTP_TLS
    if use_tls:
        ftp = ftplib.FTP_TLS()
    else:
        ftp = ftplib.FTP()

    try:
        # Explicit host + port (G-Portal and similar often use a non-21 port; defaulting to 21 causes wrong service / 530).
        ftp.connect(host, port, timeout=45)
        ftp.login(user, password)
        if use_tls and hasattr(ftp, "prot_p"):
            ftp.prot_p()
        ftp.retrbinary(f"RETR {remote_path}", buf.write)
        try:
            ftp.quit()
        except Exception:
            ftp.close()
    except Exception as e:
        return None, str(e)

    raw = buf.getvalue().decode("utf-8", errors="replace")
    try:
        json.loads(raw)
    except json.JSONDecodeError as e:
        return None, f"Invalid JSON from FTP: {e}"
    return raw, None


async def ftp_poll_loop(stop: asyncio.Event) -> None:
    """Periodic download; runs only when GPORTAL_FTP_HOST is set."""
    global _raw_json, _last_error, _last_ok_at
    import time

    while not stop.is_set():
        if not is_ftp_mode_enabled():
            await asyncio.sleep(5.0)
            continue

        interval = float(os.getenv("GPORTAL_FTP_POLL_SECONDS", "60") or "60")
        interval = max(15.0, interval)

        raw, err = await asyncio.to_thread(_ftp_download_sync)
        now = time.time()
        with _lock:
            if raw is not None:
                _raw_json = raw
                _last_error = None
                _last_ok_at = now
                try:
                    bu = len(raw.encode("utf-8"))
                except Exception:
                    bu = len(raw)
                log_pipeline(
                    "ftp_in",
                    "FTP poll stored data.json in RAM (G-Portal / cloud path)",
                    bytes_utf8=bu,
                )
            else:
                _last_error = err
                logger.warning("FTP dashboard fetch failed: %s", err)

        try:
            await asyncio.wait_for(stop.wait(), timeout=interval)
        except asyncio.TimeoutError:
            pass


async def run_initial_ftp_fetch() -> None:
    """Best-effort immediate fetch so / has data sooner after deploy."""
    if not is_ftp_mode_enabled():
        return
    raw, err = await asyncio.to_thread(_ftp_download_sync)
    global _raw_json, _last_error, _last_ok_at
    import time

    with _lock:
        if raw is not None:
            _raw_json = raw
            _last_error = None
            _last_ok_at = time.time()
            try:
                bu = len(raw.encode("utf-8"))
            except Exception:
                bu = len(raw)
            log_pipeline(
                "ftp_in",
                "Initial FTP download stored data.json in RAM",
                bytes_utf8=bu,
            )
        else:
            _last_error = err
            logger.warning("Initial FTP fetch failed: %s", err)
