"""Read-only second-stage Lua source signals for the FS25 vault.

This narrows manual review. Matches are not proof of persisted farm-owned data,
safe attribution, dashboard value, or game compatibility.
"""

import argparse
import csv
import json
import re
import zipfile
from pathlib import Path


FARM = re.compile(rb"\b(?:farmId|farmID|farm_id|ownerFarmId|ownerFarmID)\b", re.I)
SAVE = re.compile(rb"(?:savegameDirectory|savegameDir|saveToXMLFile|saveToXmlFile|XMLFile\.create|createXMLFile|setXML(?:String|Int|Float|Bool)|writeStream)", re.I)
RECORD = re.compile(rb"(?:history|ledger|order|invoice|contract|booking|service|maintenance|usage|progress|stock|production)", re.I)
MAX_MEMBER = 2_000_000
MAX_ARCHIVE = 24_000_000


def source_signals(path: Path) -> tuple[int, int, int, int, int, str]:
    farm_files = save_files = paired_files = record_files = bytes_read = 0
    paired_names = []
    with zipfile.ZipFile(path) as archive:
        for member in archive.infolist():
            if not member.filename.lower().endswith(".lua") or member.file_size > MAX_MEMBER:
                continue
            if bytes_read + member.file_size > MAX_ARCHIVE:
                break
            raw = archive.read(member)
            bytes_read += len(raw)
            farm = bool(FARM.search(raw))
            save = bool(SAVE.search(raw))
            farm_files += farm
            save_files += save
            if farm and save:
                paired_files += 1
                if len(paired_names) < 4:
                    paired_names.append(member.filename)
            record_files += bool(RECORD.search(raw))
    return farm_files, save_files, paired_files, record_files, bytes_read, ";".join(paired_names)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("metadata", type=Path, help="Output of 2026-10-31-scan-vault.py")
    parser.add_argument("audit", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    rows = json.loads(args.metadata.read_text(encoding="utf-8"))
    audited = args.audit.read_text(encoding="utf-8")
    result = []
    for row in rows:
        if not row.get("luaFiles"):
            continue
        path = Path(row["path"])
        try:
            farm, save, paired, record, size, names = source_signals(path)
            error = ""
        except (OSError, RuntimeError, zipfile.BadZipFile) as exc:
            farm = save = paired = record = size = 0
            names = ""
            error = str(exc)[:120]
        result.append({
            "archive": row["archive"],
            "category": row.get("category", ""),
            "title": row.get("title", ""),
            "version": row.get("version", ""),
            "luaFiles": row.get("luaFiles", 0),
            "farmFiles": farm,
            "saveFiles": save,
            "pairedFiles": paired,
            "recordFiles": record,
            "bytesRead": size,
            # A name match is only a navigation aid; it is not a source-review verdict.
            "archiveNameInAudit": row["archive"] in audited,
            "pairedNames": names,
            "error": error,
            "path": str(path),
        })
    result.sort(key=lambda x: (-x["pairedFiles"], -x["farmFiles"], -x["saveFiles"], x["archive"].lower()))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=result[0].keys())
        writer.writeheader()
        writer.writerows(result)
    print(json.dumps({
        "luaArchives": len(result),
        "pairedSignal": sum(row["pairedFiles"] > 0 for row in result),
        "pairedArchiveNamesAbsentFromAudit": sum(row["pairedFiles"] > 0 and not row["archiveNameInAudit"] for row in result),
        "readErrors": sum(bool(row["error"]) for row in result),
        "output": str(args.output),
    }))


if __name__ == "__main__":
    main()
