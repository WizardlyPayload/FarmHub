#!/usr/bin/env python3
from pathlib import Path

p = Path(__file__).resolve().parents[1] / "docs" / "USER_MANUAL.md"
t = p.read_text(encoding="utf-8")
t = t.replace(".. **[", ". **[")
t = t.replace("capture.*\n---", "capture.*\n\n---")
t = t.replace("capture.*\n###", "capture.*\n\n###")
t = t.replace("TO_CAPTURE.md)).\nThere", "TO_CAPTURE.md)).\n\nThere")
t = t.replace("TO_CAPTURE.md)).\nThe ", "TO_CAPTURE.md)).\n\nThe ")
t = t.replace("TO_CAPTURE.md)).\nOpen", "TO_CAPTURE.md)).\n\nOpen")
t = t.replace("TO_CAPTURE.md)).\n###", "TO_CAPTURE.md)).\n\n###")
p.write_text(t, encoding="utf-8", newline="\n")
print("fixed")
