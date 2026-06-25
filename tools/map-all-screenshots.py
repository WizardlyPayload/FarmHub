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
    # 4.2.0 captures (2026-06-20 – 2026-06-25)
    "Screenshot 2026-06-25 204336.png": "fd-shell-020-landing.png",
    "Screenshot 2026-06-25 204449.png": "fd-setup-080-launch-button.png",
    "Screenshot 2026-06-24 183901.png": "fd-section-economy-040-storage-tab.png",
    "Screenshot 2026-06-20 180845.png": "fd-section-pastures-020-cards.png",
    "Screenshot 2026-06-20 180909.png": "fd-modal-071-pen-information.png",
    "Screenshot 2026-06-25 205158.png": "fd-modal-065-pen-detail.png",
    "Screenshot 2026-06-25 205036.png": "fd-section-productions-020-empty.png",
    "Screenshot 2026-06-20 194121.png": "fd-section-fields-047-grass-windrow.png",
    "Screenshot 2026-06-25 220638.png": "fd-section-productions-010-list.png",
}

# Copy source manifest file -> additional manifest slots (same image reused)
COPIES: dict[str, list[str]] = {}

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
    # Non-dashboard / duplicate / not for manual (2026-06)
    "Screenshot 2026-06-15 171638.png",  # fast.com speed test
    "Screenshot 2026-06-15 225655.png",  # unrelated (car listing)
    "Screenshot 2026-06-13 212952.png",  # fast.com speed test
    "Screenshot 2026-06-18 234008.png",  # website live-demo banner
    "Screenshot 2026-06-20 180927.png",  # pen info duplicate (milking parlour)
    "Screenshot 2026-06-20 194136.png",  # in-game FS25 field overlay (not dashboard)
    "Screenshot 2026-06-21 122513.png",  # Discord community art
    "Screenshot 2026-06-21 122534.png",  # Discord community art
    "Screenshot 2026-06-23 203953.png",  # in-game silo HUD (not dashboard)
    "Screenshot 2026-06-25 182512.png",  # video frame — livestock table
    "Screenshot 2026-06-25 182727.png",  # video frame — vehicles grid
    "Screenshot 2026-06-25 183006.png",  # video frame — low health modal
    "Screenshot 2026-06-25 184913.png",  # toast with unresolved {{count}} i18n
    "Screenshot 2026-06-25 203035.png",  # pastures — missing i18n key
    "Screenshot 2026-06-25 204825.png",  # storage — unresolved fill type #118 (bug demo)
    "Screenshot 2026-06-25 205024.png",  # in-game PDA productions menu
    "Screenshot 2026-06-25 220629.png",  # accidental narrow crop — discard
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
