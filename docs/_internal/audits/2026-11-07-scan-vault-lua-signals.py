"""Read-only source-signal triage for ZIPs in the existing vault inventory.

Signals only select archives for manual review. A hit does not establish mod-owned
state, farm scope, safe runtime access, distinct value, or game compatibility.
No ZIP is modified and this script does not hash entire archives.
"""

import argparse
import json
import re
import sys
import zipfile
from pathlib import Path


MAX_LUA_FILES = 256
MAX_SCRIPT_BYTES = 2_000_000
SIGNALS = {
    "savegamePath": re.compile(rb"savegameDirectory|savegameFolderPath|savegameDirectoryName", re.I),
    "xmlPersistence": re.compile(rb"saveToXML|loadFromXML|registerXMLPaths|XMLFile\.(?:create|load)", re.I),
    "farmKey": re.compile(rb"\bfarmId\b|\bownerFarmId\b|\bgetOwnerFarmId\b", re.I),
    "ownerLookup": re.compile(rb"getFarmById|getFarmlandOwner|getOwnerFarmId|ownedVehicle", re.I),
    "vehicleState": re.compile(rb"spec_[A-Za-z0-9_]+|registerVehicleType|addSpecialization", re.I),
    "placeableState": re.compile(rb"placeable[s]?\b|registerPlaceableType", re.I),
    "recordHint": re.compile(rb"\bhistory\b|\bledger\b|\brecords\b|\btransactions\b|\bcontracts\b", re.I),
    "profilePath": re.compile(rb"getUserProfileAppPath|modSettings[/\\]", re.I),
    "network": re.compile(rb"writeStream|readStream|sendEvent", re.I),
}


def scan_archive(row: dict) -> dict:
    result = {
        "archive": row["archive"],
        "path": row["path"],
        "category": row.get("category", ""),
        "title": row.get("title", ""),
        "version": row.get("version", ""),
        "luaFilesDeclared": row.get("luaFiles", 0),
        "signals": {},
    }
    try:
        with zipfile.ZipFile(row["path"]) as archive:
            scripts = [item for item in archive.infolist() if item.filename.lower().endswith(".lua")]
            result["luaFilesSeen"] = min(len(scripts), MAX_LUA_FILES)
            result["incomplete"] = len(scripts) > MAX_LUA_FILES
            for item in scripts[:MAX_LUA_FILES]:
                if item.file_size > MAX_SCRIPT_BYTES:
                    result["incomplete"] = True
                with archive.open(item) as source:
                    data = source.read(MAX_SCRIPT_BYTES)
                for key, pattern in SIGNALS.items():
                    if pattern.search(data):
                        hit = result["signals"].setdefault(key, {"files": 0, "example": item.filename})
                        hit["files"] += 1
    except (OSError, zipfile.BadZipFile, RuntimeError, EOFError) as exc:
        result["error"] = str(exc)[:160]
    signals = result["signals"]
    result["triageScore"] = sum(weight for key, weight in {
        "savegamePath": 4, "xmlPersistence": 3, "farmKey": 3,
        "ownerLookup": 2, "recordHint": 2, "vehicleState": 1,
        "placeableState": 1, "network": 1,
    }.items() if key in signals)
    if "profilePath" in signals and "savegamePath" not in signals:
        result["triageScore"] -= 2
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("inventory", type=Path, help="JSON from 2026-10-31-scan-vault.py")
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    inventory = json.loads(args.inventory.read_text(encoding="utf-8"))
    candidates = [row for row in inventory if row.get("luaFiles", 0) > 0 and "zipError" not in row]
    results = []
    for index, row in enumerate(candidates, 1):
        results.append(scan_archive(row))
        if index % 200 == 0:
            print(f"source-scanned {index}/{len(candidates)}", file=sys.stderr, flush=True)
    results.sort(key=lambda row: (-row["triageScore"], row["archive"].casefold()))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "luaArchives": len(results),
        "errors": sum("error" in row for row in results),
        "incomplete": sum(row.get("incomplete", False) for row in results),
        "scoreAtLeast10": sum(row["triageScore"] >= 10 for row in results),
        "output": str(args.output),
    }))


if __name__ == "__main__":
    main()
