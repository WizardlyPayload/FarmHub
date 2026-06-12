#!/usr/bin/env python3
"""Rename timestamped PNGs in docs/screenshots/ to fd-* manifest names."""
from __future__ import annotations

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SHOT = ROOT / "docs" / "screenshots"

# source filename -> manifest filename (first wins if target exists)
RENAMES: dict[str, str] = {
    "Screenshot 2026-05-26 183849.png": "fd-install-010-mod-folder.png",
    "Screenshot 2026-05-26 192905.png": "fd-install-040-installer-welcome.png",
    "Screenshot 2026-05-26 192935.png": "fd-install-045-installer-finished.png",
    "Screenshot 2026-05-26 192943.png": "fd-install-050-app-first-launch.png",
    "Screenshot 2026-05-26 192957.png": "fd-setup-030-auto-detect.png",
    "Screenshot 2026-05-26 221156.png": "fd-setup-070-mod-images.png",
    "Screenshot 2026-05-26 222346.png": "fd-setup-060-ftp-polling.png",
    "Screenshot 2026-05-27 214404.png": "fd-modal-060-animal-details.png",
    "Screenshot 2026-05-27 214736.png": "fd-modal-070-pasture-livestock.png",
    # June 2026 — v4.1 feature captures (Witcombe / dedicated server)
    "Screenshot 2026-06-12 121714.png": "fd-section-fleet-map-010-overview.png",
    "Screenshot 2026-06-12 203803.png": "fd-section-economy-040-storage-tab.png",
    "Screenshot 2026-06-12 104310.png": "fd-section-economy-041-bale-storage-breakdown.png",
    "Screenshot 2026-06-12 203816.png": "fd-section-redtape-010-compliance.png",
    "Screenshot 2026-06-12 203823.png": "fd-section-redtape-020-events.png",
    "Screenshot 2026-06-12 203839.png": "fd-section-vehicles-040-ads-summary.png",
    "Screenshot 2026-06-12 203913.png": "fd-section-vehicles-050-ads-breakdown.png",
    "Screenshot 2026-06-12 203936.png": "fd-section-fields-045-moisture-weeds.png",
    "Screenshot 2026-06-12 120131.png": "fd-section-fields-010-summary.png",
    "Screenshot 2026-06-12 203944.png": "fd-section-fields-046-monitor-harvest.png",
    "Screenshot 2026-06-12 123724.png": "fd-reference-pda-map.png",
}

# same source copied to additional manifest slots
COPIES: dict[str, list[str]] = {
    "Screenshot 2026-05-26 192943.png": [
        "fd-setup-010-language-corner.png",
        "fd-setup-020-empty-server-list.png",
    ],
}


def main() -> None:
    done: list[str] = []
    for src_name, dest_name in RENAMES.items():
        src = SHOT / src_name
        dest = SHOT / dest_name
        if not src.is_file():
            print(f"skip missing source: {src_name}")
            continue
        if dest.is_file() and dest.resolve() != src.resolve():
            print(f"skip existing target: {dest_name}")
            continue
        if dest.exists():
            src.unlink()
        else:
            src.rename(dest)
        done.append(f"{src_name} -> {dest_name}")

    for src_name, dest_names in COPIES.items():
        primary = RENAMES.get(src_name, "")
        src = SHOT / primary if primary else SHOT / src_name
        if not src.is_file():
            print(f"skip copy source gone: {src_name}")
            continue
        for dest_name in dest_names:
            dest = SHOT / dest_name
            if dest.is_file():
                print(f"skip copy exists: {dest_name}")
                continue
            shutil.copy2(src, dest)
            done.append(f"copy -> {dest_name}")

    print("\n".join(done) or "(nothing renamed)")


if __name__ == "__main__":
    main()
