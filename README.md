# FS25 Farm Dashboard

Farm Dashboard is a free Windows companion app and in-game mod for Farming Simulator 25. It brings fields, vehicles, livestock, storage, economy, productions, and supported companion-mod data into one dashboard outside the game.

## Get started

The repository is preparing **V5 app 5.1.0** and the matching **5.1.0.0** game mod. Source in `main` is not itself a published installer: check [GitHub Releases](https://github.com/WizardlyPayload/FarmHub/releases) for the actual available download and its version before installing. Keep the app and mod from the same release together.

1. Download the V5 Windows installer and **`FS25_FarmDashboard.zip`** from the same release.
2. Put the ZIP, under that exact filename, in `Documents\My Games\FarmingSimulator2025\mods\`. Enable it for the save. Dedicated multiplayer needs the matching mod on the server and clients.
3. Install and open Farm Dashboard V5, then follow setup to select a local save, link a multiplayer source, or configure a dedicated server.

Read the [V5 installation guide](docs/v5%20documents/INSTALL.md) for first launch, upgrades, dedicated servers, and removal. For the screens and features, use the [V5 user manual](docs/v5%20documents/USER_MANUAL.md).

## Current V5 screens

These full-resolution images show the 5.1.0 source UI displaying **held demo-save snapshots**. They illustrate the interface, not a live gameplay or installed-release acceptance test. See the [screenshot notes](docs/v5%20documents/SCREENSHOTS.md) for remaining capture gaps.

![V5 overview on a held base-game save](docs/v5%20documents/doc-screenshots/current-5057/base-overview.png)

![V5 fields on a held RF and companion-mod save](docs/v5%20documents/doc-screenshots/current-5057/suite-fields.png)

## What it covers

- Core dashboard: save overview, fields and soil, vehicles and fleet map, pastures, productions, storage, economy, weather, and alerts.
- Optional integrations: companion pages and extra readings appear only when the corresponding mods are actually loaded. The base dashboard does not require any companion mod. See the [companion-mod guide](docs/v5%20documents/COMPANION_MODS.md) for what each integration can and cannot show.
- Local and dedicated play: local save watching, in-game multiplayer linking, and FTP where appropriate. See [V5 compatibility](docs/v5%20documents/COMPATIBILITY.md).
- Privacy: game data stays with the app unless you deliberately enable LAN access. Review [LAN and security guidance](docs/v5%20documents/SECURITY.md) before making the dashboard available to other devices.

Farm Dashboard reads game and mod data. It does not plant, buy, repair, or change another mod's settings for you.

## V4 and project history

Classic V4 is a separate, older product line with its own update feed and [manuals](docs/README.md). Do not use the V4 installer or screenshots as instructions for V5. The V5 source and documentation do not replace an existing public V4 release or make it a new V4 build.

This repository continues [Josh Walki's original FarmDashboard](https://github.com/JoshWalki/FarmDashboard). See [authors and credits](docs/AUTHORS.md) and [licence](LICENSE).

## Building from source

The V5 installer and game mod are separate artifacts. From the repository root, `npm run build:all:v5` builds the UI, canonical mod ZIP, and V5 installer. V5 writes `latest-rf.yml`; classic V4 uses `latest.yml`. Do not publish one line's update metadata over the other.

Development and release guidance lives in [docs](docs/README.md) and [tools](tools/README.md). For help, use [GitHub Issues](https://github.com/WizardlyPayload/FarmHub/issues) or [Discord](https://discord.gg/ZCG9C7h7aT).
