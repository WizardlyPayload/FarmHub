#!/usr/bin/env python3
"""Move unreferenced screenshots to docs/screenshots/discard/."""
from __future__ import annotations

import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SHOT = ROOT / "docs" / "screenshots"
DISCARD = SHOT / "discard"

# Canonical fd-* kept for USER_MANUAL, INSTALL, README (direct refs + alias targets).
KEEP: set[str] = {
    "fd-install-010-mod-folder.png",
    "fd-install-020-fs25-mod-enabled.png",
    "fd-install-030-datajson-explorer.png",
    "fd-install-040-installer-welcome.png",
    "fd-install-045-installer-finished.png",
    "fd-install-050-app-first-launch.png",
    "fd-setup-010-language-corner.png",
    "fd-setup-020-empty-server-list.png",
    "fd-setup-030-auto-detect.png",
    "fd-setup-040-add-local.png",
    "fd-setup-050-add-ftp.png",
    "fd-setup-060-ftp-polling.png",
    "fd-setup-070-mod-images.png",
    "fd-setup-080-launch-button.png",
    "fd-shell-020-landing.png",
    "fd-shell-030-game-time-weather.png",
    "fd-shell-050-import-mod-images.png",
    "fd-settings-010-dashboard-toggles.png",
    "fd-settings-016-dashboard-clusters.png",
    "fd-settings-017-dashboard-simhub.png",
    "fd-settings-020-servers-list.png",
    "fd-settings-023-servers-add-server.png",
    "fd-settings-030-mod-tab.png",
    "fd-settings-041-appearance-theme.png",
    "fd-lan-010-toggle-on.png",
    "fd-section-livestock-010-summary.png",
    "fd-section-livestock-020-filters.png",
    "fd-section-livestock-030-table.png",
    "fd-section-vehicles-020-filters.png",
    "fd-section-vehicles-030-grid.png",
    "fd-section-vehicles-040-ads-summary.png",
    "fd-section-vehicles-050-ads-breakdown.png",
    "fd-section-fields-010-summary.png",
    "fd-section-fields-030-card-rules.png",
    "fd-section-fields-045-moisture-weeds.png",
    "fd-section-fields-046-monitor-harvest.png",
    "fd-section-fields-047-grass-windrow.png",
    "fd-section-fields-050-card-soil.png",
    "fd-section-fields-060-tools-shop.png",
    "fd-section-economy-010-summary.png",
    "fd-section-economy-020-purchases.png",
    "fd-section-economy-030-market.png",
    "fd-section-economy-040-storage-tab.png",
    "fd-section-economy-041-bale-storage-breakdown.png",
    "fd-section-redtape-010-compliance.png",
    "fd-section-redtape-020-events.png",
    "fd-section-pastures-010-summary.png",
    "fd-section-pastures-020-cards.png",
    "fd-section-productions-010-list.png",
    "fd-section-productions-020-empty.png",
    "fd-section-fleet-map-010-overview.png",
    "fd-reference-pda-map.png",
    "fd-modal-010-notifications.png",
    "fd-modal-060-animal-details.png",
    "fd-modal-065-pen-detail.png",
    "fd-modal-070-pasture-livestock.png",
    "fd-modal-071-pen-information.png",
    "fd-modal-080-vehicle-image.png",
    "fd-modal-090-weather.png",
    "fd-modal-100-mod-export.png",
    "fd-mod-010-config-xml-explorer.png",
    "fd-mod-020-config-xml-editor.png",
    ".gitkeep",
}


def collect_referenced() -> set[str]:
    names: set[str] = set(KEEP)
    pat = re.compile(r"screenshots/([A-Za-z0-9_.-]+\.png)")
    for md in (ROOT / "docs").glob("*.md"):
        text = md.read_text(encoding="utf-8")
        names.update(pat.findall(text))
    readme = ROOT / "README.md"
    if readme.is_file():
        names.update(pat.findall(readme.read_text(encoding="utf-8")))
    return names


def main() -> None:
    DISCARD.mkdir(parents=True, exist_ok=True)
    keep = collect_referenced()
    moved: list[str] = []
    for path in sorted(SHOT.iterdir()):
        if not path.is_file():
            continue
        if path.name in keep:
            continue
        dest = DISCARD / path.name
        if dest.exists():
            dest.unlink()
        shutil.move(str(path), str(dest))
        moved.append(path.name)
    print(f"Kept {len(keep)} manifest file(s) in {SHOT}")
    print(f"Moved {len(moved)} file(s) to {DISCARD}")
    if moved:
        for name in moved[:20]:
            print(f"  {name}")
        if len(moved) > 20:
            print(f"  ... and {len(moved) - 20} more")


if __name__ == "__main__":
    main()
