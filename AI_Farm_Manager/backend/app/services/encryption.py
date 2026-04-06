"""Symmetric encryption for secrets persisted in bot_servers.json (Fernet)."""
from __future__ import annotations

import logging
import os
from typing import Final

from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)

_FERNET: Fernet | None = None

# Fernet url-safe base64 ciphertext is typically long and starts with this prefix (version + timestamp…).
_FERNET_PREFIX: Final = "gAAAA"


def _looks_like_fernet_token(s: str) -> bool:
    return len(s) >= 48 and s.startswith(_FERNET_PREFIX)


def ensure_encryption_configured() -> None:
    """
    Load ENCRYPTION_KEY and construct Fernet. Call at process startup so production never
    runs without encryption for persisted secrets.
    """
    global _FERNET
    if _FERNET is not None:
        return

    raw = (os.getenv("ENCRYPTION_KEY") or "").strip()
    if not raw:
        raise RuntimeError(
            "ENCRYPTION_KEY is not set. Generate one with: "
            'python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())" '
            "and add it to your environment (never commit it)."
        )
    try:
        f = Fernet(raw.encode("utf-8"))
    except (ValueError, TypeError) as e:
        raise RuntimeError(
            "ENCRYPTION_KEY is invalid — must be a url-safe base64-encoded 32-byte key "
            "(output of Fernet.generate_key().decode())."
        ) from e
    # Smoke test (wrong key length would already have failed)
    f.encrypt(b"__ai_farm_manager_key_check__")
    _FERNET = f


def _fernet() -> Fernet:
    ensure_encryption_configured()
    assert _FERNET is not None
    return _FERNET


def encrypt_value(plaintext: str) -> str:
    """Encrypt a UTF-8 string; empty string stays empty (not written as ciphertext)."""
    ensure_encryption_configured()
    if not plaintext:
        return ""
    token = _fernet().encrypt(plaintext.encode("utf-8"))
    return token.decode("ascii")


def decrypt_value(ciphertext: str) -> str:
    """
    Decrypt a value stored by encrypt_value.

    If decryption fails and the value does not look like Fernet output, treat it as
    legacy plaintext (pre-encryption migration) and return it unchanged so callers still
    work; the next save_registry() will persist an encrypted form.
    """
    ensure_encryption_configured()
    if not ciphertext:
        return ""
    s = ciphertext.strip()
    try:
        return _fernet().decrypt(s.encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError, TypeError):
        pass

    if _looks_like_fernet_token(s):
        logger.error(
            "Registry secret looks encrypted but failed to decrypt — wrong ENCRYPTION_KEY or corrupted data."
        )
        raise ValueError(
            "Cannot decrypt stored secret — check ENCRYPTION_KEY matches the key used to encrypt bot_servers.json."
        )

    # Short plaintext passwords or legacy values before encryption was enabled.
    logger.info("Using legacy plaintext registry secret; will be encrypted on next save.")
    return s
