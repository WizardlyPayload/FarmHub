# FS25 Farm Dashboard — Wiki Home

<<<<<<< Updated upstream
Welcome to the **FS25 Farm Dashboard** project! This is a Windows desktop companion for **Farming Simulator 25** that provides a live farm data browser dashboard. The app works together with an in-game mod to export live farm data, which is then displayed in your browser.

## Quick Links

- **[Installation Guide](Installation-Guide)** — Step-by-step setup instructions
- **[User Manual](User-Manual)** — Complete feature walkthrough with screenshots
- **[Developer Guide](Developer-Guide)** — For contributors and maintainers
- **[Security & Network](Security-and-Network)** — LAN access, authentication, and security notes
- **[Troubleshooting](Troubleshooting)** — Common issues and solutions

## What is FarmHub?

**FarmHub** is a desktop app + in-game mod combo that lets you monitor your Farming Simulator 25 farm in real-time:

- **Live data** from the mod while the game is running
- **Desktop app** (Windows Electron app) that reads the live data
- **Browser dashboard** accessible at `http://localhost:8766`
- **Optional LAN access** for tablets, phones, or other PCs on your network
- **Multi-server support** for local saves and dedicated/rented servers (via FTP)

## Current Version

- **App:** 4.0.0
- **Mod:** 2.3.0.0

## Getting Started

### For Players

1. **[Install the mod](Installation-Guide#stage-a--install-the-mod)** into your FS25 `mods` folder
2. **[Enable and load](Installation-Guide#stage-b--enable-per-save)** the mod in your saves
3. **[Install the Windows app](Installation-Guide#stage-d--install-the-windows-app)** from Releases
4. **[Complete Setup](User-Manual#3-first-run-setup)** to configure servers
5. **[Open the dashboard](Installation-Guide#stage-e--first-launch)** at `http://localhost:8766`

### For Developers

- Start with the **[Developer Guide](Developer-Guide)** for architecture and codebase overview
- Review **[Known Gaps](Developer-Guide#known-gaps-from-the-audits)** for current audit findings
- Check **[Debugging Checklist](Developer-Guide#debugging-checklist)** for common issues

## Main Features

- **Livestock Management** — Animals, health, lactation, genetics
- **Vehicles & Equipment** — Fleet tracking, fuel, damage status
- **Fields** — Crop growth, work suggestions, windrows, soil (Precision Farming)
- **Economy** — Money, purchases, equipment tracking
- **Pastures** — Animal distribution, birth warnings
- **Production Chains** — Production slots, fill levels, recipes
- **Weather** — Forecast and current conditions
- **Rules Engine** — AI-powered field work suggestions

## Repository Structure

```
FarmHub/
├── docs/                      # User & developer documentation
├── FS25_FarmDashboard_App/    # Electron app + web UI
├── FS25_FarmDashboard_Mod/    # Lua mod source
├── tools/                     # Build scripts & helpers
└── wiki/                      # This wiki
```

## Key Concepts

### Mod First, App Second

The **order matters**:
1. Mod must be installed and **loaded in saves** first — this creates the `data.json` file
2. Then install the Windows app — it reads that `data.json`
3. If you skip step 1, the app shows "waiting for data" because there's nothing to read yet

### Local vs. Remote Servers

- **Local**: Runs on the same PC; app watches `data.json` directly
- **Remote (FTP)**: Runs on a dedicated/rented server; app polls via FTP

### LAN Access

By default, the dashboard only works on the same PC (`http://localhost:8766`). Enable **Settings → Servers & saves → LAN access** to allow tablets and other devices on your home network to connect.

## Support & Contributing

- **Bug reports**: Use GitHub Issues
- **Security concerns**: Contact maintainers privately
- **Contributing**: Review [Developer Guide](Developer-Guide) and open a PR
- **Authors**: [JoshWalki & WizardlyPayload](https://github.com/WizardlyPayload/FarmHub/blob/main/docs/AUTHORS.md)

---

**Last updated:** Aligned with app **4.0.0** and mod **2.3.0.0**
=======
Welcome to the **FS25 Farm Dashboard** (FarmHub) wiki. This project is a **Windows desktop companion** for **Farming Simulator 25**: an in-game **Lua mod** exports live farm data; the **Electron app** merges it with savegame XML and serves a **browser dashboard** at `http://localhost:8766`.

## Quick links

| Page | For |
|------|-----|
| **[Installation Guide](Installation-Guide)** | First-time setup (mod → app, in order) |
| **[User Manual](User-Manual)** | Every screen, setting, and section |
| **[Troubleshooting](Troubleshooting)** | “Waiting for data”, FTP, LAN, port 8766 |
| **[Security & Network](Security-and-Network)** | LAN access, passwords, tablets |
| **[Developer Guide](Developer-Guide)** | Architecture, build, contribute |
| **[Releases & Upgrades](Releases-and-Upgrades)** | 4.0.0 notes, upgrade from public 2.0.0 |

Extended manuals (screenshots, runbooks): [docs folder on GitHub](https://github.com/WizardlyPayload/FarmHub/tree/main/docs).

## Current versions

| Component | Version |
|-----------|---------|
| **Windows app** | **4.0.0** |
| **FS25 mod** | **2.3.0.0** |

Download both from **[GitHub Releases](https://github.com/WizardlyPayload/FarmHub/releases)**.

## Getting started (players)

1. **[Install the mod](Installation-Guide#stage-a--install-the-mod)** → `FS25_FarmDashboard.zip` in FS25 `mods`
2. **[Enable per save & load world](Installation-Guide#stage-b--enable-per-save)** → creates `data.json`
3. **[Install the Windows app](Installation-Guide#stage-d--install-the-windows-app)** → `FS25 Farm Dashboard Setup 4.0.0.exe`
4. **Open** [http://localhost:8766](http://localhost:8766)

**Order matters:** mod first → load save → app second.

## Getting started (developers)

1. Read **[Developer Guide](Developer-Guide)** — data flow, repo layout, `npm run dist`
2. See **[DEVELOPER_HANDOVER.md](https://github.com/WizardlyPayload/FarmHub/blob/main/docs/DEVELOPER_HANDOVER.md)** for IPC, merge rules, and file map
3. Run tests: `cd FS25_FarmDashboard_App/FS25_FarmDashboard_App && npm test`

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
- **Authors:** [JoshWalki](https://github.com/JoshWalki) & **WizardlyPayload**

---

*Last updated: app **4.0.0**, mod **2.3.0.0***
>>>>>>> Stashed changes
