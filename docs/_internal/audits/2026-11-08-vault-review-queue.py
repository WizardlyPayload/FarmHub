"""List vault Lua-signal leads absent from the audit and linked TSV registers.

This is a queue hygiene check. A name mentioned in the audit is not proof that
its source was fully reviewed, integrated, or accepted in game.
Grouping by title and version is only a triage aid, never duplicate-byte proof.
"""

import argparse
import csv
import json
import re
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
    evidence_names = set()
    evidence_files = []
    audit_dir = args.audit.parent.resolve()
    for link in re.findall(r"\]\(([^)#]+\.tsv)\)", audit, flags=re.IGNORECASE):
        evidence_path = (audit_dir / link).resolve()
        if not evidence_path.is_relative_to(audit_dir):
            raise ValueError(f"Linked evidence path escapes audit directory: {link}")
        with evidence_path.open(encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle, delimiter="\t")
            if reader.fieldnames is None or "archive" not in reader.fieldnames:
                raise ValueError(f"Linked evidence has no archive column: {link}")
            evidence_names.update(row["archive"] for row in reader if row.get("archive"))
        evidence_files.append(link)

    eligible = [row for row in rows if isinstance(row, dict)
                and isinstance(row.get("archive"), str)
                and isinstance(row.get("triageScore"), int)
                and row["triageScore"] >= args.min_score]
    unmentioned = [row for row in eligible
                   if row["archive"] not in audit and row["archive"] not in evidence_names]
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
        "linkedEvidenceFiles": evidence_files,
        "linkedEvidenceArchiveNames": len(evidence_names),
        "absentByScore": dict(sorted(by_score.items(), reverse=True)),
        "meaning": "Name check only; prose and linked evidence rows do not establish complete source review or missing integration",
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
