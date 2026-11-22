"""Build a source-review queue from the vault's farm-ID/save-writer signals.

Signals and Lua-content fingerprints are search leads only. Identical Lua
content is not proof that whole archives, descriptors, assets or runtime
behaviour are identical. A name in the audit is not a source review.
"""

import argparse
import csv
import json
from collections import defaultdict
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("signals", type=Path)
    parser.add_argument("audit", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()

    rows = json.loads(args.signals.read_text(encoding="utf-8-sig"))
    if not isinstance(rows, list):
        raise ValueError("Expected a list of Lua signal rows")
    audit_lines = args.audit.read_text(encoding="utf-8").splitlines()

    groups = defaultdict(list)
    for row in rows:
        if not isinstance(row, dict):
            continue
        signals = row.get("signals") or {}
        fingerprint = row.get("luaContentFingerprint")
        if not (isinstance(signals, dict) and signals.get("farm_id", 0) > 0
                and signals.get("save_writer", 0) > 0
                and isinstance(fingerprint, str) and len(fingerprint) == 64):
            continue
        if row.get("skippedLuaFiles", 0) != 0:
            raise ValueError(f"Incomplete Lua read: {row.get('archive')}")
        groups[fingerprint].append(row)

    output_rows = []
    for fingerprint, members in groups.items():
        archives = sorted({row["archive"] for row in members})
        hits = sorted({i + 1 for i, line in enumerate(audit_lines)
                       if any(name in line for name in archives)})
        output_rows.append({
            "luaContentFingerprint": fingerprint,
            "archivePaths": len(members),
            "archives": " | ".join(archives),
            "maxFarmIdSignals": max(row["signals"]["farm_id"] for row in members),
            "maxSaveWriterSignals": max(row["signals"]["save_writer"] for row in members),
            "auditMentionLines": " | ".join(map(str, hits)),
            "auditMentionCount": len(hits),
            "wholeArchiveIdentity": "unverified",
            "sourceClassification": "review-required",
        })
    output_rows.sort(key=lambda row: (
        -row["maxFarmIdSignals"] - row["maxSaveWriterSignals"],
        row["archives"],
    ))

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(output_rows[0]) if output_rows else [
            "luaContentFingerprint", "archivePaths", "archives", "maxFarmIdSignals",
            "maxSaveWriterSignals", "auditMentionLines", "auditMentionCount",
            "wholeArchiveIdentity", "sourceClassification",
        ])
        writer.writeheader()
        writer.writerows(output_rows)
    print(json.dumps({
        "signalRows": len(rows),
        "farmWriterArchivePaths": sum(len(group) for group in groups.values()),
        "luaContentFingerprints": len(groups),
        "groupsWithoutNameMention": sum(row["auditMentionCount"] == 0 for row in output_rows),
        "meaning": "Source review queue only; neither name mention nor Lua fingerprint is whole-archive or gameplay acceptance",
    }))


if __name__ == "__main__":
    main()
