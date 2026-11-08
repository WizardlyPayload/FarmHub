"""List vault Lua-signal leads whose exact archive name is absent from the audit.

This is a queue hygiene check. A name mentioned in the audit is not proof that
its source was fully reviewed, integrated, or accepted in game.
Grouping by title and version is only a triage aid, never duplicate-byte proof.
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
    parser.add_argument("--group", action="store_true",
                        help="Group unmentioned paths by title and version for triage")
    args = parser.parse_args()

    rows = json.loads(args.signals.read_text(encoding="utf-8-sig"))
    if not isinstance(rows, list):
        raise ValueError("Expected a JSON list of archive rows")
    audit = args.audit.read_text(encoding="utf-8")
    audit_folded = audit.casefold()

    eligible = [row for row in rows if isinstance(row, dict)
                and isinstance(row.get("archive"), str)
                and isinstance(row.get("triageScore"), int)
                and row["triageScore"] >= args.min_score]
    unmentioned = [row for row in eligible if row["archive"] not in audit]
    by_score = Counter(row["triageScore"] for row in unmentioned)
    groups = {}
    if args.group:
        for row in unmentioned:
            key = (str(row.get("title") or "").casefold(),
                   str(row.get("version") or ""))
            groups.setdefault(key, []).append(row)
    summary = {
        "sourceRows": len(rows),
        "minScore": args.min_score,
        "eligible": len(eligible),
        "exactArchiveNameAbsent": len(unmentioned),
        "absentByScore": dict(sorted(by_score.items(), reverse=True)),
        "meaning": "Mention check only; neither mention nor absence establishes source review or missing integration",
    }
    if args.group:
        summary["titleVersionGroups"] = len(groups)
        summary["groupingMeaning"] = "Same title/version is a triage lead, not duplicate-byte proof"
    print(json.dumps(summary, ensure_ascii=False))
    if args.group:
        for group in sorted(groups.values(),
                            key=lambda rows: (-max(row["triageScore"] for row in rows),
                                              str(rows[0].get("title") or "").casefold(),
                                              str(rows[0].get("version") or ""))):
            first = group[0]
            title = str(first.get("title") or "")
            print(json.dumps({
                "maxScore": max(row["triageScore"] for row in group),
                "title": title,
                "version": first.get("version"),
                "titleMentionedInAudit": bool(title and title.casefold() in audit_folded),
                "archives": [row["archive"] for row in group],
                "duplicateBytesStatus": "unverified",
            }, ensure_ascii=False))
        return
    for row in sorted(unmentioned, key=lambda row: (-row["triageScore"], row["archive"])):
        print(json.dumps({key: row.get(key) for key in
                          ("triageScore", "archive", "title", "version", "path")},
                         ensure_ascii=False))


if __name__ == "__main__":
    main()
