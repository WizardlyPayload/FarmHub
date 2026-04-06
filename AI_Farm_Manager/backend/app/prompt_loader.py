"""Optional multiline system prompt from prompts/system_prompt.txt (overrides env)."""
from __future__ import annotations

import os
from pathlib import Path

_PROMPT_FILE = Path(__file__).resolve().parent.parent / "prompts" / "system_prompt.txt"


def read_system_prompt(fallback_env: str) -> str:
    if _PROMPT_FILE.is_file():
        try:
            return _PROMPT_FILE.read_text(encoding="utf-8").strip()
        except OSError:
            pass
    return fallback_env


def write_system_prompt(text: str) -> None:
    _PROMPT_FILE.parent.mkdir(parents=True, exist_ok=True)
    _PROMPT_FILE.write_text(text.strip() + "\n", encoding="utf-8")
