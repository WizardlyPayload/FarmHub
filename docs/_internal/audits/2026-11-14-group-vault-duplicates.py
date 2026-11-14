"""Hash same-size Lua-bearing vault ZIPs from the existing inventory, read-only.

This narrows duplicate-version triage; identical size alone is never treated as
identical bytes. The default 20 MB limit bounds a NAS read and leaves larger
archive pairs explicitly unclassified. An exact duplicate ZIP is not proof of
game compatibility or of a useful Farm Dashboard reading.
"""

import argparse
import hashlib
import json
from collections import defaultdict
from pathlib import Path


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest().upper()


def group_duplicates(scan: Path, max_bytes: int) -> dict:
    inventory = json.loads(scan.read_text(encoding="utf-8"))
    by_size = defaultdict(list)
    for entry in inventory:
        if entry.get("luaFiles", 0) > 0 and isinstance(entry.get("bytes"), int):
            by_size[entry["bytes"]].append(entry)

    candidates = [members for size, members in by_size.items() if len(members) > 1]
    selected = [members for members in candidates if members[0]["bytes"] <= max_bytes]
    deferred = [members for members in candidates if members[0]["bytes"] > max_bytes]
    identical = []
    same_size_different = []
    changed = []
    for members in sorted(selected, key=lambda group: group[0]["bytes"]):
        by_hash = defaultdict(list)
        for entry in members:
            path = Path(entry["path"])
            if not path.is_file() or path.stat().st_size != entry["bytes"]:
                changed.append(entry["path"])
                continue
            by_hash[sha256_file(path)].append(entry["path"])
        for digest, paths in by_hash.items():
            if len(paths) > 1:
                identical.append({"bytes": members[0]["bytes"], "sha256": digest, "paths": sorted(paths)})
        if len(by_hash) > 1:
            same_size_different.append({
                "bytes": members[0]["bytes"],
                "hashes": {digest: sorted(paths) for digest, paths in sorted(by_hash.items())},
            })
    return {
        "inventory": str(scan),
        "limitBytes": max_bytes,
        "luaBearingPaths": sum(1 for entry in inventory if entry.get("luaFiles", 0) > 0),
        "sameSizeGroups": len(candidates),
        "hashedGroups": len(selected),
        "deferredLargeGroups": len(deferred),
        "deferredLargePaths": sum(map(len, deferred)),
        "identicalGroups": identical,
        "sameSizeDifferentBytes": same_size_different,
        "missingOrChanged": changed,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("scan", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--max-bytes", type=int, default=20_000_000)
    args = parser.parse_args()
    result = group_duplicates(args.scan, args.max_bytes)
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: value if not isinstance(value, list) else len(value) for key, value in result.items()}, indent=2))


if __name__ == "__main__":
    main()
