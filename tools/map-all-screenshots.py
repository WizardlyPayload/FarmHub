#!/usr/bin/env python3
"""Map timestamped PNGs in docs/screenshots/ to fd-* manifest names."""
from __future__ import annotations

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SHOT = ROOT / "docs" / "screenshots"

# Screenshot filename -> canonical manifest name (overwrites existing fd-*)
RENAMES: dict[str, str] = {
    # Install / setup (new captures 2026-05-28)
    "Screenshot 2026-05-28 145943.png": "fd-install-020-fs25-mod-enabled.png",
    "Screenshot 2026-05-28 150119.png": "fd-install-030-datajson-explorer.png",
    "Screenshot 2026-05-28 150211.png": "fd-setup-040-add-local.png",
    # Better installer welcome (language list open)
    "Screenshot 2026-05-26 192905.png": "fd-install-040-installer-welcome.png",
    # Dashboard UI (2026-05-28)
    "Screenshot 2026-05-28 150511.png": "fd-section-livestock-020-filters.png",
    "Screenshot 2026-05-28 150540.png": "fd-section-vehicles-020-filters.png",
    "Screenshot 2026-05-28 231941.png": "fd-modal-010-notifications.png",
    "Screenshot 2026-05-28 232005.png": "fd-shell-030-game-time-weather.png",
    "Screenshot 2026-05-28 232013.png": "fd-shell-010-navbar.png",
    # Field cards (better crops)
    "Screenshot 2026-05-27 214530.png": "fd-section-fields-040-card-windrow.png",
    "Screenshot 2026-05-27 214542.png": "fd-section-fields-050-card-soil.png",
    "Screenshot 2026-05-27 214640.png": "fd-section-fields-030-card-rules.png",
    # Modals
    "Screenshot 2026-05-27 214404.png": "fd-modal-060-animal-details.png",
    "Screenshot 2026-05-27 214736.png": "fd-modal-070-pasture-livestock.png",
    # Setup mod-images progress (full Server Manager + overlay)
    "Screenshot 2026-05-26 221149.png": "fd-setup-070-mod-images.png",
    # Dashboard modals + mod config (2026-05-28)
    "Screenshot 2026-05-28 232706.png": "fd-modal-090-weather.png",
    "Screenshot 2026-05-28 232833.png": "fd-modal-080-vehicle-image.png",
    "Screenshot 2026-05-28 233222.png": "fd-mod-010-config-xml-explorer.png",
    "Screenshot 2026-05-28 233251.png": "fd-mod-020-config-xml-editor.png",
}

# Copy source manifest file -> additional manifest slots (same image reused)
COPIES: dict[str, list[str]] = {
    "fd-setup-040-add-local.png": ["fd-setup-080-launch-button.png"],
}

# Not mapped to manual slots — kept for reference / troubleshooting only
EXTRA_FILES = [
    "Screenshot 2026-05-26 192859.png",  # installer welcome (empty dropdown)
    "Screenshot 2026-05-26 192911.png",  # installer scope step
    "Screenshot 2026-05-26 192914.png",  # installer path step
    "Screenshot 2026-05-26 192917.png",  # installer progress
    "Screenshot 2026-05-26 193010.png",  # mod export error dialog
    "Screenshot 2026-05-26 195410.png",  # mod export error (duplicate)
    "Screenshot 2026-05-26 222308.png",  # mod export success summary
    "Screenshot 2026-05-26 222330.png",  # setup toast: add server first
    "Screenshot 2026-05-27 214418.png",  # animal modal (lower half duplicate)
    "Screenshot 2026-05-27 214600.png",  # field 28 harvested / N deficit
    "Screenshot 2026-05-27 214612.png",  # field 33 monitor grass
    "Screenshot 2026-05-27 214628.png",  # field 31 mulched stubble
    "Screenshot 2026-05-27 214816.png",  # pasture livestock table modal
    "reference-home-network-topology.png",
]


def main() -> None:
    done: list[str] = []
    for src_name, dest_name in RENAMES.items():
        src = SHOT / src_name
        dest = SHOT / dest_name
        if not src.is_file():
            print(f"skip missing: {src_name}")
            continue
        if dest.is_file() and dest.resolve() != src.resolve():
            dest.unlink()
        if src.resolve() != dest.resolve():
            src.rename(dest)
        done.append(f"{src_name} -> {dest_name}")

    for src_name, dest_names in COPIES.items():
        src = SHOT / src_name
        if not src.is_file():
            print(f"skip copy source: {src_name}")
            continue
        for dest_name in dest_names:
            dest = SHOT / dest_name
            if dest.is_file():
                dest.unlink()
            shutil.copy2(src, dest)
            done.append(f"copy {src_name} -> {dest_name}")

    remaining = sorted(p.name for p in SHOT.glob("Screenshot*.png"))
    print("\n".join(done) or "(no renames)")
    if remaining:
        print("\nUnmapped Screenshot*.png (extras):")
        for name in remaining:
            print(f"  {name}")


if __name__ == "__main__":
    main()
