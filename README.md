# FS25 Farm Dashboard

Desktop companion for **Farming Simulator 25**: a Windows app plus an in-game mod that exports live farm data to a browser dashboard (local disk or FTP). **Repository root on GitHub:** **FarmHub**.

**Releases:** [github.com/WizardlyPayload/FS25-Farm-Dashboard/releases](https://github.com/WizardlyPayload/FS25-Farm-Dashboard/releases)

**Current line:** App **3.1.0** · Mod **2.0.0.0** (bump `modDesc.xml` only if you ship a new mod build).

---

## Documentation (single folder)

**Everything is under [`docs/`](docs/README.md):** install order, changelog, security, AI stack, release notes, authors.

| Quick link | |
|------------|--|
| **Install (mod first)** | [docs/INSTALL.md](docs/INSTALL.md) |
| **Doc index** | [docs/README.md](docs/README.md) |
| **Complete how-to + screenshots** | [docs/USER_MANUAL.md](docs/USER_MANUAL.md) |
| **Changelog** | [docs/CHANGELOG.md](docs/CHANGELOG.md) |
| **GitHub release blurbs** | [docs/RELEASE_NOTES.md](docs/RELEASE_NOTES.md) |
| **Authors** | [docs/AUTHORS.md](docs/AUTHORS.md) |

---

## What’s in the repo

| Path | Role |
|------|------|
| `FS25_FarmDashboard_Mod/` | FS25 mod (Lua) → game `mods` folder |
| `FS25_FarmDashboard_App/` | Electron app + web UI + merger + FTP |
| `AI_Farm_Manager/` | Optional FastAPI backend (Smart suggestions / chat API) |
| `tools/` | Build helpers (e.g. mod shop image export) — see below |

---

## Install order (short)

1. Install the **mod** into FS25 `mods`, enable it, **load the save** once.  
2. Install the **Farm Dashboard** `.exe` from Releases (or your build).  
3. Open **Settings → Servers & saves** if paths or FTP need adjustment.

Details: **[docs/INSTALL.md](docs/INSTALL.md)**.

---

## Build the Windows app (developers)

```bash
cd FS25_FarmDashboard_App/FS25_FarmDashboard_App
npm install
npm run dist
```

Default **`npm run dist`** (via `tools/run-electron-builder.mjs`) writes the installer under **`%LOCALAPPDATA%\fs25-farm-dashboard-electron-out`** to avoid file locks on `app.asar` inside the repo. See **[docs/CHANGELOG.md](docs/CHANGELOG.md)** §3.0.0 (introduced) and §**3.1.0** (current app line).

```bash
npm start
```

Run unpacked dev build without packaging.

---

## Git workflow

Use **Git** or **GitHub Desktop** in your clone of **FarmHub**. Commit from your machine; do not rely on custom sync scripts—mirror trees manually if you keep a second working copy.

Publishing a release: attach the **NSIS `.exe`** and a **zip of `FS25_FarmDashboard_Mod`**. Blurb text: **[docs/RELEASE_NOTES.md](docs/RELEASE_NOTES.md)**.

---

## Troubleshooting

| Issue | Try |
|--------|-----|
| “Waiting for data” | FS25 ran with mod enabled; check paths/FTP in Settings |
| Port **8766** in use | Close other apps using the port; restart the dashboard app |
| LAN tablet | Enable LAN in Settings; set Basic Auth + allowlist — **[docs/SECURITY.md](docs/SECURITY.md)** |

---

## Credits & licence

**JoshWalki** & **WizardlyPayload** — **[docs/AUTHORS.md](docs/AUTHORS.md)**.  
Add a **`LICENSE`** file if you want explicit terms; otherwise all rights reserved unless stated.
