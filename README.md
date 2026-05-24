# FS25 Farm Dashboard

Real-time farm management dashboard for **Farming Simulator 25** — a Windows desktop app plus an in-game mod that streams live fields, livestock, vehicles, economy, and more to your browser.

---

## Download (start here)

### ➡️ [**Get the latest release — app + mod**](https://github.com/WizardlyPayload/FarmHub/releases)

| Download from Releases | Version |
|------------------------|---------|
| **`FS25 Farm Dashboard Setup 4.0.0.exe`** | Windows app |
| **`FS25_FarmDashboard.zip`** | FS25 mod |

**Current stable line:** App **4.0.0** · Mod **3.0.0.0**

Install **mod first**, load your save once, then install the app. Step-by-step instructions are on the **[Releases page](https://github.com/WizardlyPayload/FarmHub/releases)** and in **[docs/INSTALL.md](docs/INSTALL.md)**.

Open the dashboard at **[http://localhost:8766](http://localhost:8766)** after setup.

---

## Quick install

1. **Mod** — Put **`FS25_FarmDashboard.zip`** in `Documents\My Games\FarmingSimulator2025\mods\`, enable on your save, **load the save once**.
2. **App** — Run **`FS25 Farm Dashboard Setup 4.0.0.exe`** from [Releases](https://github.com/WizardlyPayload/FarmHub/releases).
3. **Configure** — **Settings → Servers & saves** (local path or FTP for dedicated servers).

**Full guide:** [docs/USER_MANUAL.md](docs/USER_MANUAL.md) · [GitHub Wiki](https://github.com/WizardlyPayload/FarmHub/wiki)

---

## About this project (fork & lineage)

This repository (**[FarmHub](https://github.com/WizardlyPayload/FarmHub)**) is **continued development** of Josh Walki’s Farm Dashboard — not a separate product.

| Project | What it is |
|---------|------------|
| **[JoshWalki / FarmDashboard](https://github.com/JoshWalki/FarmDashboard)** | Original FS25 mod + web dashboard (**Josh Walki**) |
| **[WizardlyPayload / FS25-Farm-Dashboard](https://github.com/WizardlyPayload/FS25-Farm-Dashboard/releases)** | Public **2.0.0** release — Electron desktop fork of Josh’s work |
| **[WizardlyPayload / FarmHub](https://github.com/WizardlyPayload/FarmHub/releases)** *(this repo)* | **4.0.0** stable line — security, FTP/multi-server, field rules, auto-update, mod version checks |

**Coming from 2.0.0 or Josh’s repo?** See **[docs/UPGRADE_FROM_FS25-Farm-Dashboard.md](docs/UPGRADE_FROM_FS25-Farm-Dashboard.md)** for what changed.

**Authors:** **[JoshWalki](https://github.com/JoshWalki)** (Josh) — original concept & FS25 mod · **WizardlyPayload** — Electron app, maintenance, releases · [docs/AUTHORS.md](docs/AUTHORS.md)

---

## What you get in 4.0.0

- **Live dashboard** — livestock, pastures, vehicles, fields, economy, productions, weather (port **8766**).
- **Local + FTP** — single-player / LAN host on disk, or dedicated server over FTP.
- **Offline field rules** — suggested next steps from merged game data (no cloud service).
- **Windrows, bales, forage badges** — field workflow hints aligned with in-game state.
- **27 languages**, themes, section backgrounds, unified Settings.
- **Auto-update** (Windows app) and **mod version badge** when the in-game mod is behind.

**Release notes (full public copy):** [docs/GITHUB_RELEASE_v4.0.0.md](docs/GITHUB_RELEASE_v4.0.0.md) · **History:** [docs/CHANGELOG.md](docs/CHANGELOG.md)

---

## Documentation

| Link | |
|------|--|
| **[Releases / downloads](https://github.com/WizardlyPayload/FarmHub/releases)** | App installer + mod zip |
| **[Wiki](https://github.com/WizardlyPayload/FarmHub/wiki)** | Install, user manual, troubleshooting |
| [docs/INSTALL.md](docs/INSTALL.md) | Short install order |
| [docs/USER_MANUAL.md](docs/USER_MANUAL.md) | Complete how-to |
| [docs/SECURITY.md](docs/SECURITY.md) | LAN access & passwords |
| [docs/README.md](docs/README.md) | Full doc index |

---

## Repository layout (developers)

| Path | Role |
|------|------|
| `FS25_FarmDashboard_Mod/` | FS25 mod (Lua) — release as **`FS25_FarmDashboard.zip`** |
| `FS25_FarmDashboard_App/` | Electron app + web UI + merge/FTP layer |
| `tools/` | Build scripts — [tools/README.md](tools/README.md) |

**Build the Windows installer:**

```bash
cd FS25_FarmDashboard_App/FS25_FarmDashboard_App
npm install
npm run dist
```

Default output: `%LOCALAPPDATA%\fs25-farm-dashboard-electron-out\`

CI on `main` runs tests, electron-pack verify, and i18n verify — see [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

---

## Troubleshooting

| Issue | Try |
|--------|-----|
| “Waiting for data” | Mod enabled; save loaded once; check path in Settings |
| Port **8766** in use | Close other apps on that port; restart Farm Dashboard |
| LAN tablet | Enable LAN in Settings; strong password — [docs/SECURITY.md](docs/SECURITY.md) |
| Mod version badge | Update **`FS25_FarmDashboard.zip`** from [Releases](https://github.com/WizardlyPayload/FarmHub/releases) |

---

## Licence & credits

**JoshWalki** & **WizardlyPayload** — [docs/AUTHORS.md](docs/AUTHORS.md) · [LICENSE](LICENSE)
