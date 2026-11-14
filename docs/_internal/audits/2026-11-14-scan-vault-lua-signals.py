"""Read-only Lua content signals for ZIPs in an existing vault inventory.

This produces a review queue, not a capability or safety verdict. In particular,
literal identifiers may occur in comments, dead code, client-only helpers, or
scripts that the descriptor never loads. Exact candidates still need manual
source, farm-scope, version, and game review.
"""

import argparse
import hashlib
import json
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET


SIGNALS = {
    "farm_id": rb"\bfarmId\b|\bgetFarmId\b|\bownerFarmId\b",
    "save_writer": rb"\bsaveToXML\b|\bsaveXMLFile\b|\bcreateXMLFile\b|\bsetXML(?:String|Int|Float|Bool)\b|:\s*set(?:String|Int|Float|Bool)\b|\bXMLFile\s*\.\s*create\b|:\s*save\s*\(",
    "save_reader": rb"\bloadFromXML\b|\bloadXMLFile\b|\bgetXML(?:String|Int|Float|Bool)\b|:\s*get(?:String|Int|Float|Bool)\b|\bXMLFile\s*\.\s*loadIfExists\b",
    "save_directory": rb"\bsavegameDirectory\b|\bgetSavegameDirectory\b",
    "finance": rb"\baddMoney\b|\bgetMoney\b|\bMoneyType\b",
    "field_work": rb"\bfieldWork\b|\bfieldId\b|\bfarmlandId\b|\bgetFieldById\b",
    "production": rb"\bproductionPoint\b|\bproductionId\b|\bgetProductions\b",
    "vehicle_state": rb"\bvehicleId\b|\bvehicle\.uniqueId\b|\bgetOwnerFarmId\b",
}
COMPILED = {name: re.compile(pattern, re.I) for name, pattern in SIGNALS.items()}


def declared_sources(archive: zipfile.ZipFile) -> set[str]:
    names = {info.filename.lower(): info for info in archive.infolist()}
    desc = names.get("moddesc.xml")
    if desc is None or desc.file_size > 2_000_000:
        return set()
    try:
        root = ET.fromstring(archive.read(desc))
    except (ET.ParseError, UnicodeError, RuntimeError, OSError):
        return set()
    return {
        (node.get("filename") or "").replace("\\", "/").lower()
        for node in root.findall(".//extraSourceFiles/sourceFile")
    }


def scan(path: Path, max_lua_bytes: int, max_archive_lua_bytes: int) -> dict:
    result = {
        "path": str(path),
        "archive": path.name,
        "signals": {name: 0 for name in SIGNALS},
        "luaFiles": 0,
        "readLuaFiles": 0,
        "declaredLuaFiles": 0,
        "skippedLuaFiles": 0,
        "luaContentFingerprint": None,
    }
    try:
        with zipfile.ZipFile(path) as archive:
            declared = declared_sources(archive)
            hashes = []
            remaining = max_archive_lua_bytes
            for info in archive.infolist():
                if not info.filename.lower().endswith(".lua") or info.is_dir():
                    continue
                result["luaFiles"] += 1
                name = info.filename.replace("\\", "/").lower()
                if name in declared:
                    result["declaredLuaFiles"] += 1
                if info.file_size > max_lua_bytes or info.file_size > remaining:
                    result["skippedLuaFiles"] += 1
                    continue
                with archive.open(info) as handle:
                    raw = handle.read(max_lua_bytes + 1)
                if len(raw) > max_lua_bytes:
                    result["skippedLuaFiles"] += 1
                    continue
                remaining -= len(raw)
                result["readLuaFiles"] += 1
                hashes.append((name, hashlib.sha256(raw).hexdigest()))
                for signal, pattern in COMPILED.items():
                    if pattern.search(raw):
                        result["signals"][signal] += 1
            if result["skippedLuaFiles"] == 0:
                digest = hashlib.sha256()
                for name, content_hash in sorted(hashes):
                    digest.update(name.encode("utf-8", errors="replace"))
                    digest.update(b"\0")
                    digest.update(content_hash.encode("ascii"))
                    digest.update(b"\n")
                result["luaContentFingerprint"] = digest.hexdigest()
    except (OSError, zipfile.BadZipFile, RuntimeError, ValueError) as exc:
        result["error"] = f"{type(exc).__name__}: {str(exc)[:120]}"
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("inventory", type=Path, help="JSON from 2026-10-31-scan-vault.py")
    parser.add_argument("output", type=Path)
    parser.add_argument("--max-lua-bytes", type=int, default=2_000_000)
    parser.add_argument("--max-archive-lua-bytes", type=int, default=16_000_000)
    args = parser.parse_args()
    if args.max_lua_bytes <= 0 or args.max_archive_lua_bytes <= 0:
        parser.error("byte caps must be positive")
    inventory = json.loads(args.inventory.read_text(encoding="utf-8-sig"))
    paths = [Path(row["path"]) for row in inventory if row.get("luaFiles", 0) > 0]
    results = []
    for index, path in enumerate(paths, 1):
        results.append(scan(path, args.max_lua_bytes, args.max_archive_lua_bytes))
        if index % 100 == 0:
            print(f"scanned {index}/{len(paths)}", file=sys.stderr, flush=True)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    print(
        json.dumps(
            {
                "archives": len(results),
                "luaFilesRead": sum(row["readLuaFiles"] for row in results),
                "luaFilesSkipped": sum(row["skippedLuaFiles"] for row in results),
                "errors": sum("error" in row for row in results),
                "output": str(args.output),
            }
        )
    )


if __name__ == "__main__":
    main()
