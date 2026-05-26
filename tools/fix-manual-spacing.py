#!/usr/bin/env python3
import re
from pathlib import Path

p = Path(__file__).resolve().parents[1] / "docs" / "USER_MANUAL.md"
t = p.read_text(encoding="utf-8")
# Blank line after figures and before headings/body text
t = re.sub(r"(\*Figure:[^\n]+\*)\n(?!\n)", r"\1\n\n", t)
t = re.sub(r"(</img>)\n(?!\n)", r"\1\n\n", t)
t = re.sub(r"(\*Screenshot not yet added:[^\n]+\*)\n(?!\n)", r"\1\n\n", t)
t = re.sub(r"(\*\(Same UI as[^)]+\)\*)\n(?!\n)", r"\1\n\n", t)
# Drop back-to-back duplicate images (same src)
prev = None
out = []
for line in t.splitlines():
    m = re.search(r'<img src="\./screenshots/([^"]+)"', line)
    if m and m.group(1) == prev:
        continue
    if m:
        prev = m.group(1)
    else:
        prev = None
    out.append(line)
p.write_text("\n".join(out) + "\n", encoding="utf-8")
print("spacing fixed")
