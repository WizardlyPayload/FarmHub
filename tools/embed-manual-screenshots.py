#!/usr/bin/env python3
"""Replace screenshot blockquotes in docs with Markdown images (![]())."""
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
}

BLOCKQUOTE = re.compile(
    r"^> Screenshot: `([^`]+)` — (.+?) \*\*\[(auto|manual)\]\*\*\s*$",
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
        "See [SCREENSHOTS_TO_CAPTURE.md](./SCREENSHOTS_TO_CAPTURE.md)."
    )


def repl(m: re.Match) -> str:
    name, caption, _tag = m.group(1), m.group(2), m.group(3)
    resolved = resolve(name)
    if resolved:
        block = image_block(resolved, caption)
        if resolved != name:
            block += f"\n\n*(Same UI as `{name}` — shown using `{resolved}`.)*"
        return block
    return missing_block(name, caption)


def process_file(path: Path) -> None:
    text = BLOCKQUOTE.sub(repl, path.read_text(encoding="utf-8"))
    path.write_text(text, encoding="utf-8", newline="\n")


def patch_manual_header() -> None:
    manual = DOCS / "USER_MANUAL.md"
    text = manual.read_text(encoding="utf-8")
    text = text.replace(
        "# FS25 Farm Dashboard — User manual (v3.9)",
        "# FS25 Farm Dashboard — User manual (v4.0)",
    )
    text = text.replace("**mod version 2.3.0.0**", "**mod version 3.0.0.0**")
    text = text.replace(
        "and points to a labelled screenshot for each.",
        "with **inline screenshots** (below each section). "
        "Where we already have a similar capture, one image is reused instead of asking twice.",
    )
    text = text.replace(
        "**Companion docs:** [`INSTALL.md`](./INSTALL.md) · [`USER_GUIDE.md`](./USER_GUIDE.md) (short reference) ·",
        "**Companion docs:** [`INSTALL.md`](./INSTALL.md) ·",
    )
    text = text.replace(
        "[`SCREENSHOT_MANIFEST.md`](./SCREENSHOT_MANIFEST.md)",
        "[`SCREENSHOT_MANIFEST.md`](./SCREENSHOT_MANIFEST.md) · [`SCREENSHOTS_TO_CAPTURE.md`](./SCREENSHOTS_TO_CAPTURE.md)",
        1,
    )
    text = text.replace(
        "**Document version:** aligned with app **4.0.0** and mod **2.3.0.0**.",
        "**Document version:** aligned with app **4.0.0** and mod **3.0.0.0**.",
    )
    manual.write_text(text, encoding="utf-8", newline="\n")


def main() -> None:
    patch_manual_header()
    manual = DOCS / "USER_MANUAL.md"
    process_file(manual)
    install = DOCS / "INSTALL.md"
    if install.is_file():
        # INSTALL uses pending blockquotes too
        pending = re.compile(
            r"^> \*\*Screenshot pending:\*\* `([^`]+)` — (.+?) \*\*\[(auto|manual)\]\*\*.*$",
            re.MULTILINE,
        )
        text = pending.sub(
            lambda m: repl(
                type(
                    "M",
                    (),
                    {
                        "group": lambda self, i: [None, m.group(1), m.group(2), "manual"][
                            i
                        ]
                    },
                )()
            ),
            install.read_text(encoding="utf-8"),
        )
        install.write_text(text, encoding="utf-8", newline="\n")
        process_file(install)
    t = manual.read_text(encoding="utf-8")
    print(f"<img count={t.count('<img ')} missing={t.count('Screenshot not yet added')}")


if __name__ == "__main__":
    main()
