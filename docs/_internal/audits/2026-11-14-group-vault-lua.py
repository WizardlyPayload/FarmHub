"""Group current FS25 vault ZIPs by exact Lua payload bytes, read-only.

This is a deduplication aid. Matching Lua bytes do not prove matching XML,
assets, settings, game behavior, or Farm Dashboard value.
"""

import argparse
import hashlib
import json
import sys
import zipfile
from collections import Counter, defaultdict
from pathlib import Path


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest().upper()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("scan", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()

    scan = json.loads(args.scan.read_text(encoding="utf-8"))
    candidates = [row for row in scan if row.get("luaFiles", 0) > 0]
    rows = []
    for index, row in enumerate(candidates, 1):
        item = {
            "archive": row["archive"],
            "path": row["path"],
            "category": row["category"],
            "title": row.get("title", ""),
            "version": row.get("version", ""),
            "luaFilesExpected": row["luaFiles"],
        }
        try:
            with zipfile.ZipFile(row["path"]) as archive:
                infos = sorted(
                    (info for info in archive.infolist() if info.filename.lower().endswith(".lua")),
                    key=lambda info: (info.filename, info.header_offset),
                )
                source_hashes = [digest(archive.read(info)) for info in infos]
                if len(infos) != row["luaFiles"]:
                    raise ValueError(f"Lua count changed: {len(infos)} vs {row['luaFiles']}")
                item["sourceSetSha256"] = digest("\n".join(sorted(source_hashes)).encode("ascii"))
                item["memberSetSha256"] = digest("\n".join(
                    f"{info.filename}\t{source_hash}" for info, source_hash in zip(infos, source_hashes)
                ).encode("utf-8"))
                item["luaFiles"] = len(infos)
                item["luaUncompressedBytes"] = sum(info.file_size for info in infos)
        except (OSError, RuntimeError, ValueError, zipfile.BadZipFile) as error:
            item["error"] = f"{type(error).__name__}: {str(error)[:160]}"
        rows.append(item)
        if index % 100 == 0:
            print(f"Lua source {index}/{len(candidates)}", file=sys.stderr, flush=True)

    groups = defaultdict(list)
    for item in rows:
        if "sourceSetSha256" in item:
            groups[item["sourceSetSha256"]].append(item)
    sizes = Counter(len(group) for group in groups.values())
    result = {
        "method": "SHA-256 of sorted SHA-256 Lua payloads in each ZIP; ignores member names and all non-Lua bytes",
        "input": str(args.scan),
        "luaArchives": len(candidates),
        "processed": len(rows) - sum("error" in row for row in rows),
        "errors": sum("error" in row for row in rows),
        "distinctLuaSourceSets": len(groups),
        "groupSizeDistribution": dict(sorted(sizes.items())),
        "rows": rows,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({key: value for key, value in result.items() if key != "rows"}))
    return 0 if result["errors"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
