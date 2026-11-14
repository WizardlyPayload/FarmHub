"""Read-only source inventory for Lua ZIP paths absent from the vault audit.

Outputs exact archive hashes and the Lua source lines that could indicate
savegame state, farm ownership, runtime registration, or player-facing data.
The output is a review aid, never an automatic integration verdict.
"""

import hashlib
import json
from pathlib import Path
import re
import sys
import zipfile


ROOT = Path(__file__).resolve().parents[3]
AUDIT = ROOT / "docs/_internal/audits/2026-10-31-vault-capability-audit.md"
SCAN = Path(r"Z:\Graham\agent-comms\farmhub-companion-acceptance\VAULT-SCAN-2026-11-14.json")
OUTPUT = Path(r"Z:\Graham\agent-comms\farmhub-companion-acceptance\VAULT-UNMENTIONED-LUA-2026-11-14.json")
REVIEW_ANCHOR = "**Previously unmentioned Lua-path triage (14 November, exact current bytes):**"
MARKER = re.compile(
    r"farmId|farmland|savegame|saveToXML|loadFromXML|onSave|onLoad|"
    r"registerEventListener|registerSpecialization|addSpecialization|"
    r"addModEventListener|writeStream|readStream|vehicle|placeable|"
    r"workArea|fillLevel|money|price|storage|production|contract|mission",
    re.IGNORECASE,
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def main() -> int:
    # Reproduce the pre-review queue even after its exact archive names are
    # appended to the audit below this anchor.
    audit = AUDIT.read_text(encoding="utf-8").split(REVIEW_ANCHOR, 1)[0].casefold()
    scan = json.loads(SCAN.read_text(encoding="utf-8"))
    missing = [row for row in scan if row.get("luaFiles", 0) and row["archive"].casefold() not in audit]
    results = []
    for row in missing:
        path = Path(row["path"])
        result = {"archive": row["archive"], "path": str(path), "category": row.get("category"),
                  "title": row.get("title"), "version": row.get("version"), "sha256": sha256(path),
                  "bytes": path.stat().st_size, "lua": [], "error": None}
        try:
            with zipfile.ZipFile(path) as archive:
                for name in archive.namelist():
                    if not name.lower().endswith(".lua"):
                        continue
                    source = archive.read(name).decode("utf-8-sig", errors="replace")
                    lines = source.splitlines()
                    hits = [{"line": index, "text": line.strip()[:240]}
                            for index, line in enumerate(lines, 1)
                            if MARKER.search(line) and not line.lstrip().startswith("--")]
                    result["lua"].append({"name": name, "lines": len(lines),
                                          "hits": hits[:100], "hitCount": len(hits),
                                          "head": [line.strip()[:160] for line in lines[:12]]})
        except (OSError, zipfile.BadZipFile, RuntimeError) as error:
            result["error"] = type(error).__name__ + ": " + str(error)[:240]
        results.append(result)
        print(row["archive"], result["sha256"][:12],
              ", ".join(item["name"] for item in result["lua"]), result["error"] or "")
    OUTPUT.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(results)} exact-path source inventories to {OUTPUT}")
    return 0 if all(item["error"] is None for item in results) else 1


if __name__ == "__main__":
    sys.exit(main())
