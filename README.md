# FS25 Farm Dashboard

Farm Dashboard is a free Windows companion app and in-game mod for Farming Simulator 25. It brings fields, orchards, vehicles, livestock, storage, economy, productions, and supported DLC and companion-mod data into one dashboard outside the game.

## Get started

The `main` branch contains the **V5 app 5.2.7** and matching **5.1.0.12** game mod. V5 is the repository's default development and build line. Download the matching files from [GitHub v5.2.7](https://github.com/WizardlyPayload/FarmHub/releases/tag/v5.2.7) or the [itch.io V5 page](https://wizardlypayload.itch.io/farm-dashobaord-fs25). Keep the app and mod from the same release together.

1. Download the V5 Windows installer and **`FS25_FarmDashboard.zip`** from the same release.
2. Put the ZIP, under that exact filename, in `Documents\My Games\FarmingSimulator2025\mods\`. Enable it for the save. Dedicated multiplayer needs the matching mod on the server and clients.
3. Install and open Farm Dashboard V5, then follow setup to select a local save, link a multiplayer source, or configure a dedicated server.

Read the [V5 installation guide](docs/v5%20documents/INSTALL.md) for first launch, upgrades, dedicated servers, and removal. For the screens and features, use the [V5 user manual](docs/v5%20documents/USER_MANUAL.md).

## Current V5 screens

These full-resolution Catuaí images were captured from the installed V5 5.2.7 app at 1920 × 1080. They show the dashboard source state; the game was not operated for the captures. Other manual screenshots have their own version and data provenance in the [screenshot notes](docs/v5%20documents/SCREENSHOTS.md).

![V5 5.2.7 Catuaí save overview](docs/v5%20documents/doc-screenshots/current-527/catua-overview.png)

![V5 5.2.7 Catuaí Orchards page](docs/v5%20documents/doc-screenshots/current-527/catua-orchards.png)

## What it covers

- Core dashboard: save overview, fields and soil, vehicles and fleet map, pastures, productions, storage, economy, weather, and alerts.
- Optional integrations: companion pages and extra readings appear only when the corresponding mods are actually loaded. The base dashboard does not require any companion mod. See the [companion-mod guide](docs/v5%20documents/COMPANION_MODS.md) for what each integration can and cannot show.
- Local and dedicated play: local save watching, in-game multiplayer linking, and FTP where appropriate. See [V5 compatibility](docs/v5%20documents/COMPATIBILITY.md).
- Privacy: game data stays with the app unless you deliberately enable LAN access. Review [LAN and security guidance](docs/v5%20documents/SECURITY.md) before making the dashboard available to other devices.

Farm Dashboard reads game and mod data. It does not plant, buy, repair, or change another mod's settings for you.

## V4 and project history

Classic V4 is an older, separately packaged product line retained for existing users and project history, with its own update feed and [manuals](docs/README.md). Do not use the V4 installer or screenshots as instructions for V5. This repository's V5 source does not replace an existing public V4 release or make it a new V4 build.

This repository continues [Josh Walki's original FarmDashboard](https://github.com/JoshWalki/FarmDashboard). See [authors and credits](docs/AUTHORS.md) and [licence](LICENSE).

## Building from source

The V5 installer and game mod are separate artifacts. From the repository root, `npm run build:all` (or `npm run build:all:v5`) builds the UI, canonical mod ZIP, and V5 installer. The explicit `build:all:classic` command remains for historical V4 builds. V5 writes `latest-rf.yml`; classic V4 uses `latest.yml`. Do not publish one line's update metadata over the other. The nested app's `package.json` retains classic 4.x metadata; the V5 packaging overlay stamps the current V5 installer as 5.2.7.

Development and release guidance lives in [docs](docs/README.md) and [tools](tools/README.md). For help, use [GitHub Issues](https://github.com/WizardlyPayload/FarmHub/issues) or [Discord](https://discord.gg/ZCG9C7h7aT).
