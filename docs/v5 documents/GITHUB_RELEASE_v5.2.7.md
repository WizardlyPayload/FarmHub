# Farm Dashboard V5 5.2.7

**Windows app 5.2.7 · in-game mod 5.1.0.12 · Farming Simulator 25**

Farm Dashboard shows your save's fields, vehicles, animals, productions, storage and economy on a second screen. The base dashboard needs only its own game mod. Optional pages and cards appear when their supporting mods are loaded for the selected save.

## What's new since 5.2.0

- **Packaging security:** app 5.2.7 includes `qs` 6.16.1, resolving the advisory that caused the release CI audit to fail on 6.16.0. The in-game mod remains the same 5.1.0.12 ZIP accepted with 5.2.6.
- **Orchards** shows grapes and olives as well as supported banana and coffee orchards. On Catuaí, coffee rows now reflect ownership of their farmland instead of appearing unowned after purchase.
- **DLC summaries** add honest, read-only Highlands Fishing, Pumps N' Hoses and Emergency Pack cards when those packs are loaded. A zero-state card does not claim that fishing, slurry delivery or an incident has occurred.
- **Productions and maps** display DLC fill names and small volumes correctly and load Catuaí and Kinlaig map images without reading their entire DLC archives into memory.
- **Windows upgrades** correctly refresh the single Installed apps entry. The 5.2.6 Keep-data uninstall and reinstall path was exercised on a second Windows machine, with linked sources retained. The 5.2.7 app also updates its packaged `qs` dependency to 6.16.1 and passed the PC install/launch check.

## Install or upgrade

1. Close Farming Simulator 25. Put exactly one file named `FS25_FarmDashboard.zip` in its `mods` folder; do not rename or unpack it. Enable it for the save. A dedicated server and joining clients need matching mod ZIPs.
2. Run `FS25-Farm-Dashboard-V5-Setup-5.2.7.exe` and launch **Farm Dashboard V5**.
3. Select your save or linked server. For a newly created local save, first save it in-game, then use **Settings > Servers & saves > Auto-Detect Local Saves**, followed by **Save**.
4. Wait for a completed export. A **held** snapshot is the last received farm picture, not proof that the game is still exporting.

Read the [installation guide](https://github.com/WizardlyPayload/FarmHub/blob/main/docs/v5%20documents/INSTALL.md), [user manual](https://github.com/WizardlyPayload/FarmHub/blob/main/docs/v5%20documents/USER_MANUAL.md), [optional-mod guide](https://github.com/WizardlyPayload/FarmHub/blob/main/docs/v5%20documents/COMPANION_MODS.md) and [DLC coverage limits](https://github.com/WizardlyPayload/FarmHub/blob/main/docs/DLC-COVERAGE-AUDIT-2026-10-28.md).

## Release files

- `FS25-Farm-Dashboard-V5-Setup-5.2.7.exe` — Windows app, 384,055,994 bytes, SHA-256 `B204BAF48DA9F24B16D52FCF564A569CAC7447E27E5C910B655B7DFEB8996884`.
- `FS25_FarmDashboard.zip` — game mod, 470,369 bytes, SHA-256 `9D51ACA937BE74D42427923A8A3FE78F44DF2FE34D6B3C5770B1ABD2779A1064`.
- `latest-rf.yml` — V5 updater metadata for this exact installer. Classic V4 has a separate update feed.

The installer is unsigned, so Windows may show an Unknown publisher or SmartScreen warning. Keep Windows security protections enabled. Please report issues with the app and mod versions, map/save type, freshness badge, and a relevant screenshot or log excerpt; remove passwords and pairing tokens before posting.
