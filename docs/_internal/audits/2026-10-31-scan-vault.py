"""Read-only metadata scan of the local FS25 mod vault.

The output is a screening aid, not evidence that an archive works in-game or
that a Lua script exposes a useful dashboard value.
"""

import argparse
import json
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET


def descriptor_info(archive: zipfile.ZipFile, names: list[str]) -> dict:
    candidates = [name for name in names if name.lower() == "moddesc.xml"]
    if not candidates:
        return {"descriptor": False}
    try:
        root = ET.fromstring(archive.read(candidates[0]))
        title = root.findtext("./title/en") or root.findtext("./title") or ""
        version = root.findtext("./version") or ""
        source_files = [
            element.get("filename", "")
            for element in root.findall(".//extraSourceFiles/sourceFile")
        ]
        return {
            "descriptor": True,
            "title": title.strip(),
            "version": version.strip(),
            "declaredSourceFiles": len(source_files),
        }
    except (ET.ParseError, KeyError, UnicodeError) as exc:
        return {"descriptor": False, "descriptorError": str(exc)[:120]}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("vault", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()

    files = sorted((args.vault / "by-category").glob("*/*.zip"))
    rows = []
    for index, path in enumerate(files, 1):
        row = {
            "archive": path.name,
            "path": str(path),
            "category": path.parent.name,
            "bytes": path.stat().st_size,
        }
        try:
            with zipfile.ZipFile(path) as archive:
                names = archive.namelist()
                lua = [name for name in names if name.lower().endswith(".lua")]
                row.update(descriptor_info(archive, names))
                row["luaFiles"] = len(lua)
                row["xmlFiles"] = sum(name.lower().endswith(".xml") for name in names)
                row["members"] = len(names)
                row["saveOrStateHint"] = sum(
                    bool(re.search(r"save|state|history|statistics|config", name, re.I))
                    for name in lua
                )
        except (OSError, zipfile.BadZipFile, RuntimeError) as exc:
            row["zipError"] = str(exc)[:120]
        rows.append(row)
        if index % 500 == 0:
            print(f"scanned {index}/{len(files)}", file=sys.stderr, flush=True)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    print(
        json.dumps(
            {
                "archives": len(rows),
                "withLua": sum(row.get("luaFiles", 0) > 0 for row in rows),
                "withDeclaredSource": sum(row.get("declaredSourceFiles", 0) > 0 for row in rows),
                "errors": sum("zipError" in row for row in rows),
                "output": str(args.output),
            }
        )
    )


if __name__ == "__main__":
    main()
