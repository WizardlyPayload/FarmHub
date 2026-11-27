"""Compare two read-only vault ZIP metadata scans without implying byte identity.

Both inputs are JSON lists produced by 2026-10-31-scan-vault.py. The scan
records archive paths and selected ZIP metadata, not whole-archive hashes.
"""

import argparse
import json
from pathlib import Path


def load_index(path: Path) -> dict[str, dict]:
    rows = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(rows, list):
        raise ValueError(f"Expected a row list in {path}")
    index = {}
    for row in rows:
        if not isinstance(row, dict):
            raise ValueError(f"Expected an object row in {path}")
        category = row.get("category")
        archive = row.get("archive")
        if not isinstance(category, str) or not isinstance(archive, str):
            raise ValueError(f"Missing archive identity in {path}: {row!r}")
        key = f"{category}/{archive}".casefold()
        if key in index:
            raise ValueError(f"Duplicate archive identity in {path}: {key}")
        index[key] = row
    return index


def compare(old: dict[str, dict], new: dict[str, dict]) -> dict:
    old_keys, new_keys = set(old), set(new)
    added = sorted(new_keys - old_keys)
    removed = sorted(old_keys - new_keys)
    changed = []
    ignored = {"path", "category", "archive"}
    for key in sorted(old_keys & new_keys):
        before, after = old[key], new[key]
        differences = {
            field: {"old": before.get(field), "new": after.get(field)}
            for field in sorted((before.keys() | after.keys()) - ignored)
            if before.get(field) != after.get(field)
        }
        if differences:
            changed.append({"archive": key, "fields": differences})
    return {
        "oldArchives": len(old),
        "newArchives": len(new),
        "added": added,
        "removed": removed,
        "metadataChanged": changed,
        "byteIdentityProven": False,
        "limit": "ZIP metadata equality does not prove unchanged archive or Lua bytes; hash exact candidates separately.",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("old_scan", type=Path)
    parser.add_argument("new_scan", type=Path)
    args = parser.parse_args()
    print(json.dumps(compare(load_index(args.old_scan), load_index(args.new_scan)), indent=2))


if __name__ == "__main__":
    main()
