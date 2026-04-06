"""
Optional FS25 reference text from extracted game l10n (dataS_py_extracted/l10n/l10n_en.xml).

Improves bot answers when the dashboard JSON is empty or the player asks general FS25 questions.
"""
from __future__ import annotations

import xml.etree.ElementTree as ET
from functools import lru_cache
from html import unescape
from pathlib import Path

# Official help / hint strings (English) — keys in l10n_en.xml
_L10N_KEYS: tuple[str, ...] = (
    "helpLine_FarmingBasics_ArableFarming_crop",
    "helpLine_FirstSteps_Seasons_general",
    "helpLine_FirstSteps_Seasons_months",
    "helpLine_FirstSteps_Seasons_weather",
    "helpLine_FirstSteps_Farmer_animals",
    "hintMobile_01",
    "hintMobile_02",
    "hintMobile_04",
    "hintMobile_05",
    "hintMobile_06",
    "hintMobile_07",
)


def _backend_dir() -> Path:
    return Path(__file__).resolve().parent.parent.parent


def default_l10n_path() -> Path:
    """MAIN_CODEBASE/dataS_py_extracted/l10n/l10n_en.xml when the repo layout matches this project."""
    backend = _backend_dir()
    return backend.parent.parent / "dataS_py_extracted" / "l10n" / "l10n_en.xml"


def _element_local_name(tag: str) -> str:
    return tag.split("}")[-1] if tag else ""


@lru_cache(maxsize=4)
def _load_l10n_map(path_str: str) -> dict[str, str]:
    path = Path(path_str)
    if not path.is_file():
        return {}
    try:
        tree = ET.parse(path)
    except (ET.ParseError, OSError):
        return {}
    root = tree.getroot()
    out: dict[str, str] = {}
    for el in root.iter():
        if _element_local_name(el.tag) != "e":
            continue
        k = el.get("k")
        v = el.get("v")
        if k and v is not None:
            out[k] = unescape(v)
    return out


def build_game_reference_block(l10n_path: Path | None) -> str:
    """
    Returns a markdown-ish block for the LLM, or empty string if disabled / file missing.
    """
    path = l10n_path if l10n_path is not None else default_l10n_path()
    if not path.is_file():
        return ""

    m = _load_l10n_map(str(path.resolve()))
    if not m:
        return ""

    lines: list[str] = [
        "### Farming Simulator 25 - reference (from game strings, not live save data)",
        "",
        "The in-game chat input is limited to about **150 characters** in the stock UI; "
        "keep answers concise when the player is chatting from the game.",
        "",
    ]
    for key in _L10N_KEYS:
        text = (m.get(key) or "").strip()
        if not text:
            continue
        lines.append(f"- **{key}:** {text}")
    lines.append("")
    return "\n".join(lines)
