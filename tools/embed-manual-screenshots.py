#!/usr/bin/env python3
"""Embed docs/screenshots into USER_MANUAL.md and INSTALL.md as Markdown images."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
SHOT = DOCS / "screenshots"

ALIASES: dict[str, str] = {
    "fd-shell-010-navbar.png": "fd-shell-020-landing.png",
    "fd-shell-040-landing-badges.png": "fd-shell-020-landing.png",
    "fd-section-000-landing.png": "fd-shell-020-landing.png",
    "fd-settings-000-modal-overview.png": "fd-settings-010-dashboard-toggles.png",
    "fd-settings-015-dashboard-exclusions.png": "fd-settings-010-dashboard-toggles.png",
    "fd-settings-021-servers-lan.png": "fd-lan-010-toggle-on.png",
    "fd-settings-022-servers-ftp-polling.png": "fd-settings-020-servers-list.png",
    "fd-settings-040-appearance-language.png": "fd-settings-041-appearance-theme.png",
    "fd-section-fields-020-filter-bar.png": "fd-section-fields-010-summary.png",
    "fd-modal-020-export-livestock.png": "fd-section-livestock-020-filters.png",
    "fd-setup-010-language-corner.png": "fd-install-050-app-first-launch.png",
    "fd-setup-020-empty-server-list.png": "fd-install-050-app-first-launch.png",
}

BLOCKQUOTE = re.compile(
    r"^> Screenshot: `([^`]+)` — (.+?) \*\*\[(auto|manual)\]\*\*\s*$",
    re.MULTILINE,
)

PENDING_INSTALL = re.compile(
    r"^> \*\*Screenshot pending:\*\* `([^`]+)` — (.+?) \*\*\[(auto|manual)\]\*\*.*$",
    re.MULTILINE,
)

MISSING_LINE = re.compile(
    r"^\*Screenshot not yet added:\* `([^`]+)` — (.+?)\. See \[SCREENSHOTS\.md\]\(\./SCREENSHOTS\.md\)\.\s*$",
    re.MULTILINE,
)


def resolve(name: str) -> str | None:
    if (SHOT / name).is_file():
        return name
    alt = ALIASES.get(name)
    if alt and (SHOT / alt).is_file():
        return alt
    return None


def image_block(file: str, caption: str) -> str:
    cap = re.sub(r"\s+", " ", caption.strip().rstrip("."))
    return f"![{cap}](screenshots/{file})\n\n*Figure: {cap}.*\n"


def missing_block(name: str, caption: str) -> str:
    cap = caption.strip().rstrip(".")
    return (
        f"*Screenshot not yet added:* `{name}` — {cap}. "
        "See [SCREENSHOTS.md](./SCREENSHOTS.md)."
    )


def embed(name: str, caption: str) -> str:
    resolved = resolve(name)
    if resolved:
        block = image_block(resolved, caption)
        if resolved != name:
            block += f"\n\n*(Same UI as `{name}` — shown using `{resolved}`.)*\n"
        return block
    return missing_block(name, caption)


def repl_blockquote(m: re.Match) -> str:
    return embed(m.group(1), m.group(2))


def repl_missing(m: re.Match) -> str:
    return embed(m.group(1), m.group(2))


def process_file(path: Path) -> int:
    text = path.read_text(encoding="utf-8")
    text = BLOCKQUOTE.sub(repl_blockquote, text)
    text = PENDING_INSTALL.sub(repl_blockquote, text)
    text = MISSING_LINE.sub(repl_missing, text)
    path.write_text(text, encoding="utf-8", newline="\n")
    return text.count("![") - text.count("![http")  # rough; count markdown images


def main() -> None:
    manual = DOCS / "USER_MANUAL.md"
    process_file(manual)
    install = DOCS / "INSTALL.md"
    if install.is_file():
        process_file(install)
    t = manual.read_text(encoding="utf-8")
    embedded = len(re.findall(r"!\[[^\]]*\]\(screenshots/", t))
    missing = t.count("Screenshot not yet added")
    print(f"manual images={embedded} still_missing={missing}")


if __name__ == "__main__":
    main()
