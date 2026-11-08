"""List vault Lua-signal leads whose exact archive name is absent from the audit.

This is a queue hygiene check. A name mentioned in the audit is not proof that
its source was fully reviewed, integrated, or accepted in game.
"""

import argparse
import json
import sys
from collections import Counter
from pathlib import Path


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser()
    parser.add_argument("signals", type=Path, help="VAULT-LUA-SIGNALS JSON list")
    parser.add_argument("audit", type=Path, help="Current vault capability audit Markdown")
    parser.add_argument("--min-score", type=int, default=4)
    args = parser.parse_args()

    rows = json.loads(args.signals.read_text(encoding="utf-8-sig"))
    if not isinstance(rows, list):
        raise ValueError("Expected a JSON list of archive rows")
    audit = args.audit.read_text(encoding="utf-8")

    eligible = [row for row in rows if isinstance(row, dict)
                and isinstance(row.get("archive"), str)
                and isinstance(row.get("triageScore"), int)
                and row["triageScore"] >= args.min_score]
    unmentioned = [row for row in eligible if row["archive"] not in audit]
    by_score = Counter(row["triageScore"] for row in unmentioned)
    print(json.dumps({
        "sourceRows": len(rows),
        "minScore": args.min_score,
        "eligible": len(eligible),
        "exactArchiveNameAbsent": len(unmentioned),
        "absentByScore": dict(sorted(by_score.items(), reverse=True)),
        "meaning": "Mention check only; neither mention nor absence establishes source review or missing integration",
    }, ensure_ascii=False))
    for row in sorted(unmentioned, key=lambda row: (-row["triageScore"], row["archive"])):
        print(json.dumps({key: row.get(key) for key in
                          ("triageScore", "archive", "title", "version", "path")},
                         ensure_ascii=False))


if __name__ == "__main__":
    main()
