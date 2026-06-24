# FS25 Farm Dashboard — Wiki Home

Welcome to the **FS25 Farm Dashboard** (FarmHub) wiki. This project is a **Windows desktop companion** for **Farming Simulator 25**: an in-game **Lua mod** exports live farm data; the **Electron app** merges it with savegame XML and serves a **browser dashboard** at `http://localhost:8766`.

## Quick links

| Page | For |
|------|-----|
| **[Installation Guide](Installation-Guide)** | First-time setup (mod → app, in order) |
| **[User Manual](User-Manual)** | Every screen, setting, and section |
| **[Troubleshooting](Troubleshooting)** | “Waiting for data”, FTP, LAN, port 8766 |
| **[Security & Network](Security-and-Network)** | LAN access, passwords, tablets |
| **[Developer Guide](Developer-Guide)** | Architecture, build, contribute |
| **[Releases & Upgrades](Releases-and-Upgrades)** | 4.2.0 notes, upgrade path |

Extended manuals (screenshots, runbooks): [docs folder on GitHub](https://github.com/WizardlyPayload/FarmHub/tree/main/docs).

## Current versions

| Component | Version |
|-----------|---------|
| **Windows app** | **4.2.0** |
| **FS25 mod** | **3.4.0.0** |

Download both from **[GitHub Releases](https://github.com/WizardlyPayload/FarmHub/releases)**.

## Getting started (players)

1. **[Install the mod](Installation-Guide#stage-a--install-the-mod)** → `FS25_FarmDashboard.zip` in FS25 `mods`
2. **[Enable per save & load world](Installation-Guide#stage-b--enable-per-save)** → creates `data.json`
3. **[Install the Windows app](Installation-Guide#stage-d--install-the-windows-app)** → `FS25-Farm-Dashboard-Setup-4.2.0.exe`
4. **Open** [http://localhost:8766](http://localhost:8766)

**Order matters:** mod first → load save → app second.

## Getting started (developers)

1. Read **[Developer Guide](Developer-Guide)** — data flow, repo layout, `npm run dist`
2. See **[DEVELOPER_HANDOVER.md](https://github.com/WizardlyPayload/FarmHub/blob/main/docs/DEVELOPER_HANDOVER.md)** for IPC, merge rules, and file map
3. Run tests: `cd FS25_FarmDashboard_App && npm test`

## Main features

- **Livestock** — Animals, health, lactation, detail drill-down, export
- **Vehicles** — Fleet, fuel, damage, **mod-shop thumbnails**
- **Fields** — Growth, **local rules** suggestions, windrows, **forage/bale badges**, Precision Farming N/pH
- **Economy** — Money, purchases, market-style data
- **Pastures** — Distribution, birth / stock warnings
- **Productions** — Chains, slots, fill levels
- **Weather** — Current + forecast (merged XML)
- **Multi-server** — Local saves + **FTP** for dedicated hosts
- **LAN tablets** — Optional `0.0.0.0` bind with strong HTTP Basic auth
- **SimHub page** — Read-only overlay for streaming (`simhub.html`)
- **Themes & backgrounds** — Per-section **crossfade backgrounds** + color themes in Settings
- **27 languages** — Full UI i18n

## Key concepts

### Mod first, app second

The app **does not** read FS25 memory. It reads **`data.json`** written by the mod:

```
%USERPROFILE%\Documents\My Games\FarmingSimulator2025\modSettings\FS25_FarmDashboard\<savegame>\data.json
```

No file → dashboard shows **“waiting for data”**.

### Local vs FTP

| Mode | How data arrives |
|------|------------------|
| **Local** | App watches `data.json` on this PC |
| **FTP** | App polls a remote server folder (dedicated / GPortal-style) |

**3.9:** Local servers can **restore last merged data** on app restart; **FTP always pulls fresh** data.

### Authority (multiplayer)

The mod exports on **single-player** and **MP host / dedicated** only (`isAuthority()`). MP **clients** do not write full exports.

## Repository layout

```
FarmHub/
├── docs/                    # Full documentation
├── wiki/                    # This wiki (sync to GitHub Wiki)
├── FS25_FarmDashboard_App/  # Electron + web UI
├── FS25_FarmDashboard_Mod/  # Lua mod
└── tools/                   # Zip mod, export images, build helpers
```

## Support

- **Bugs:** [GitHub Issues](https://github.com/WizardlyPayload/FarmHub/issues) — include app version, mod version, local vs FTP
- **Security:** See [Security & Network](Security-and-Network) — do not post exploits publicly
- **Authors:** [JoshWalki](https://github.com/JoshWalki) & **WizardlyPayload** · optional [Ko-fi](https://ko-fi.com/wizarlypayload)

---

*Last updated: app **4.2.0**, mod **3.4.0.0***
