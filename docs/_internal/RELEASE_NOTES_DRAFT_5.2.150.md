# Farm Dashboard V5 5.2.150 — draft release notes

**Draft for review.** The paired game mod is 5.1.0.140. These versions and links are provisional until the exact final installer, mod ZIP, updater files and normal-mod-set smoke test pass. Do not publish this draft as a release result.

Farm Dashboard shows live data from your Farming Simulator 25 save on a separate screen. The base dashboard covers fields, vehicles, animals, productions, storage, economy and the fleet map without requiring optional companion mods. This update adds read-only detail for selected optional mods when those mods are loaded and the data can be tied to your farm. Each optional reading has its own limits; it does not take actions in the game.

## Selected new limited readings

- **Field plans and jobs:** Workplan shows recorded crop plans and task status for owned land. Field To-Do shows a stored planned crop. Farm Contractor Services and Field Contractors show current bookings or claims with field and price details. Plans, bookings and claims do not prove that fieldwork finished or that a final payment was made.
- **Vehicles and equipment:** Realistic Harvesting shows the tested combine's fan, rotor, sieve and target-load settings. Adjustable Fuel Tank and Capacity Upgrade show the tested owned machine's or trailer's selected capacity changes. These readings do not prove performance or consumption changes.
- **Finance:** Agricultural Financial System shows a pending payable with its voucher, item and amount. Investment System shows a deposit, stated rate and term. A pending amount or stated rate is not proof of settlement or earned interest.
- **Planning:** Crop Rotation Planner shows named template steps and catch crops. A template is not a field assignment or a measured yield change.

The supported-mods page will identify exactly which optional readings have bounded game, export and installed-page evidence. A mod's presence alone does not mean every feature of that mod is supported.

## Compatibility and limits

- Production Control and Distribution Redux have no bound adapter in the reviewed normal StockGuard build. Do not use a StockGuard-off observation as evidence that those combinations work. The website's Distribution Redux claim is being corrected accordingly.
- Realistic Diesel Price changes the game's native price. The dashboard can show the native current price or a labelled fallback; it does not identify which mod last set that price or provide a dedicated Realistic Diesel Price page.
- Production Supply Manager's latest test stopped before the save loaded because a required saved material mapping was missing from the selected test mod set. No automatic purchase or dashboard history reading is claimed for this release.
- Other optional pages may show settings or a partial reading when a value cannot be attributed to the current farm. Read the page's freshness and coverage labels before acting on it. These tests do not establish every mod combination, map, multiplayer path or save/reload lifecycle.

## Updating

Install both files from this release: `FS25-Farm-Dashboard-V5-Setup-5.2.150.exe` and the single canonical `FS25_FarmDashboard.zip` containing mod version 5.1.0.140. Close FS25 before replacing the mod ZIP. Keep one copy of that ZIP in the game mods folder, enable it for the save, and load into the world so it can publish a current export. The first empty startup export is not live farm data. Existing V5 settings should be preserved by the upgrade; verify your selected save after launch.

Classic V4 remains a separate app and update channel. The V5 updater uses `latest-rf.yml`; this release does not change V4 `latest.yml`.

The Windows installer is unsigned, as was the previous public installer, so Windows may show an unknown-publisher prompt. Do not disable Windows security to install it. Report problems with the app and mod versions, save type, freshness/coverage label, screenshot and a short log excerpt; do not share passwords or server credentials.

## Release verification pending

Confirm final normal-mod-set game/export/installed-page parity on the exact rebuilt installer and mod ZIP; inspect Tina's complete Ally restoration; finish full app tests, manifest and website review; publish and read back the exact GitHub, itch and website assets. Replace this section with verified version, SHA-256, links and test scope after publication.
