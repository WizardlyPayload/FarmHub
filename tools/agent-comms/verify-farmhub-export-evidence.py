"""Check retained Farm Dashboard active routes and committed export envelopes.

This reads evidence copied off Ally. It does not touch a live save or establish
game/page parity or restoration; those require separate evidence.
"""

from __future__ import annotations

import argparse
import base64
import json
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET
import zlib


def number(value: str | None, field: str) -> int:
    if value is None or not value.isdecimal():
        raise ValueError(f"missing/invalid {field}: {value!r}")
    return int(value)


def inspect_slot(path: Path) -> tuple[dict[str, str], object]:
    root = ET.parse(path).getroot()
    if root.tag != "farmDashboardExport":
        raise ValueError(f"{path.name}: unexpected root {root.tag}")
    a = root.attrib
    if a.get("encoding") != "base64":
        raise ValueError(f"{path.name}: unsupported encoding")
    payload = base64.b64decode(a["payload"], validate=True)
    if len(payload) != number(a.get("bytes"), "bytes"):
        raise ValueError(f"{path.name}: payload byte count differs")
    if zlib.adler32(payload) & 0xFFFFFFFF != number(a.get("crc"), "crc"):
        raise ValueError(f"{path.name}: Adler-32 differs")
    data = json.loads(payload.decode("utf-8-sig"))
    retained = path.with_name(path.stem + "-decoded.json")
    if retained.exists():
        if json.loads(retained.read_text(encoding="utf-8-sig")) != data:
            raise ValueError(f"{path.name}: retained decoded JSON differs")
    return a, data


def check(directory: Path, page: str | None) -> list[dict[str, object]]:
    if (directory / "export").is_dir():
        directory = directory / "export"
    routes = sorted(directory.glob("p*-active.xml"))
    if not routes:
        raise ValueError("no retained p*-active.xml route found")
    results = []
    for route in routes:
        if not re.fullmatch(r"p\d+-active\.xml", route.name):
            continue
        prefix = route.name.removesuffix("-active.xml")
        root = ET.parse(route).getroot()
        if root.tag != "farmDashboardRoute":
            raise ValueError(f"{route.name}: unexpected route root")
        selected = root.get("slot")
        if selected not in ("a", "b"):
            raise ValueError(f"{route.name}: invalid selected slot")
        slots = {}
        for name in ("a", "b"):
            path = directory / f"{prefix}-slot-{name}.xml"
            if not path.is_file():
                raise ValueError(f"{route.name}: missing {path.name}")
            attrs, data = inspect_slot(path)
            for field in ("careerId", "sessionId"):
                if attrs.get(field) != root.get(field):
                    raise ValueError(f"{path.name}: {field} differs from route")
            slots[name] = (attrs, data)
        attrs, data = slots[selected]
        sequence = number(root.get("publicationSequence"), "route sequence")
        if number(attrs.get("publicationSequence"), "selected slot sequence") != sequence:
            raise ValueError(f"{route.name}: selected slot sequence differs")
        page_data = None
        if page:
            page_data = data.get("companionPages", {}).get("pages", {}).get(page)
            if page_data is None:
                raise ValueError(f"{route.name}: companion page {page!r} absent")
        results.append({
            "capture": prefix,
            "selectedSlot": selected,
            "publicationSequence": sequence,
            "exportGeneration": number(attrs.get("exportGeneration"), "generation"),
            "sourceSlot": root.get("sourceSlot"),
            "page": page,
            "pageReadState": page_data.get("readState") if isinstance(page_data, dict) else None,
            "integrity": "all retained slots passed",
        })
    return results


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("evidence", type=Path, help="evidence folder or its export subfolder")
    parser.add_argument("--page", help="required companionPages.pages key")
    args = parser.parse_args()
    try:
        print(json.dumps(check(args.evidence, args.page), indent=2))
    except (OSError, ValueError, KeyError, ET.ParseError, UnicodeError, TypeError) as error:
        print(f"VERIFY FAILED: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
