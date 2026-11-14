"""Verify one Farm Dashboard marker-selected XML export without changing it.

Usage: python verify-export-envelope.py ACTIVE_XML SLOT_A_XML SLOT_B_XML [DECODED_JSON]

This proves envelope integrity and that the marker selects these bytes. It does
not prove the game's source values, installed UI, or an Ally restoration.
"""

import argparse
import base64
import hashlib
import json
import xml.etree.ElementTree as ET
import zlib
from pathlib import Path


def verify(active: Path, slot_a: Path, slot_b: Path, decoded: Path | None) -> dict:
    marker = ET.parse(active).getroot()
    if marker.tag != "farmDashboardRoute":
        raise ValueError("unexpected route marker")
    slot = marker.get("slot")
    if slot not in {"a", "b"}:
        raise ValueError("marker has no valid slot")
    source = {"a": slot_a, "b": slot_b}[slot]
    envelope = ET.parse(source).getroot()
    if envelope.tag != "farmDashboardExport" or envelope.get("encoding") != "base64":
        raise ValueError("unexpected selected envelope")
    for attr in ("careerId", "sessionId", "publicationSequence"):
        if marker.get(attr) != envelope.get(attr):
            raise ValueError(f"marker and selected envelope differ on {attr}")
    payload_text = envelope.get("payload")
    if payload_text is None:
        raise ValueError("missing payload")
    payload = base64.b64decode(payload_text, validate=True)
    declared_bytes = int(envelope.get("bytes") or "-1")
    declared_crc = int(envelope.get("crc") or "-1")
    if len(payload) != declared_bytes or (zlib.adler32(payload) & 0xFFFFFFFF) != declared_crc:
        raise ValueError("selected envelope length or Adler-32 mismatch")
    data = json.loads(payload)
    if decoded is not None and json.loads(decoded.read_bytes()) != data:
        raise ValueError("retained decoded JSON differs from selected envelope")
    return {
        "slot": slot,
        "sourceSlot": marker.get("sourceSlot"),
        "careerId": marker.get("careerId"),
        "sessionId": marker.get("sessionId"),
        "publicationSequence": int(marker.get("publicationSequence") or "-1"),
        "exportGeneration": int(envelope.get("exportGeneration") or "-1"),
        "bytes": len(payload),
        "adler32": declared_crc,
        "sha256": hashlib.sha256(payload).hexdigest().upper(),
        "decodedMatch": decoded is not None,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("active", type=Path)
    parser.add_argument("slot_a", type=Path)
    parser.add_argument("slot_b", type=Path)
    parser.add_argument("decoded", nargs="?", type=Path)
    args = parser.parse_args()
    print(json.dumps(verify(args.active, args.slot_a, args.slot_b, args.decoded), indent=2))


if __name__ == "__main__":
    main()
