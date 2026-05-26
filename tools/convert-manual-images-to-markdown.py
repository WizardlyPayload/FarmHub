#!/usr/bin/env python3
"""Convert <img> tags to Markdown images for IDE/GitHub preview compatibility."""
import re
from pathlib import Path

DOCS = Path(__file__).resolve().parents[1] / "docs"

IMG = re.compile(
    r'<img src="\./screenshots/([^"]+)" alt="([^"]*)"(?:\s+width="\d+")?\s*/>\s*\n*',
    re.MULTILINE,
)


def convert(path: Path) -> int:
    text = path.read_text(encoding="utf-8")
    n = 0

    def repl(m: re.Match) -> str:
        nonlocal n
        n += 1
        file, alt = m.group(1), m.group(2).strip() or m.group(1)
        return f"![{alt}](screenshots/{file})\n\n"

    text = IMG.sub(repl, text)
    path.write_text(text, encoding="utf-8", newline="\n")
    return n


def main() -> None:
    for name in ("USER_MANUAL.md", "INSTALL.md"):
        p = DOCS / name
        if p.is_file():
            print(f"{name}: converted {convert(p)} images")


if __name__ == "__main__":
    main()
