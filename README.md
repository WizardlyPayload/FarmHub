# FS25 Farm Dashboard

Desktop companion for **Farming Simulator 25**: a Windows app plus an in-game mod that exports live farm data to a browser dashboard (local disk or FTP). **Repository root on GitHub:** **FarmHub**.

**Releases:** [github.com/WizardlyPayload/FarmHub/releases](https://github.com/WizardlyPayload/FarmHub/releases)

**Current line:** App **3.9.0** · Mod **2.3.0.0** (`modDesc.xml` and Lua aligned).

---

## Documentation (single folder)

**Everything is under [`docs/`](docs/README.md):** install order, changelog, security, release notes, authors.

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
| `FS25_FarmDashboard_Mod/` | FS25 mod **sources** (Lua). **Release zip** (`tools\Zip-FarmDashboardMod.ps1`): only `modDesc.xml`, `icon.png`, `src/` at archive root. **In `mods\`:** use **`FS25_FarmDashboard.zip`** or a folder **`FS25_FarmDashboard`** with the same three at folder root. |
| `FS25_FarmDashboard_App/` | Electron app + web UI + merger + FTP |
| `tools/` | **All** build helpers — [`tools/README.md`](tools/README.md) · Electron npm scripts use [`tools/app/`](tools/app/) |

### Other mods in this repo

**`FS25_RealisticLivestockRM/`** is a separate Farming Simulator 25 mod (not required for Farm Dashboard). It has its own lifecycle, releases, and issues — only bundle or ship it when you intend to maintain that product too.

---

## Continuous integration

On push/PR to **`main`**, **`master`**, or **`develop`**, GitHub Actions runs **`npm ci`**, **`npm test`**, **`npm run verify:electron-pack`**, **`npm run i18n:verify`**, and **`npm audit --omit=dev`** in **`FS25_FarmDashboard_App/FS25_FarmDashboard_App/`**. See [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

---

## Install order (short)

1. Install the **mod** into FS25 `mods` (zip **`FS25_FarmDashboard.zip`** or folder **`FS25_FarmDashboard`**), enable it, **load the save** once.  
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

Default **`npm run dist`** (via [`tools/app/run-electron-builder.mjs`](tools/app/run-electron-builder.mjs)) writes the installer under **`%LOCALAPPDATA%\fs25-farm-dashboard-electron-out`** to avoid file locks on `app.asar` inside the repo. In-repo output: **`npm run dist:in-repo`** → `FS25_FarmDashboard_App/electron-pack-out`. See **[docs/CHANGELOG.md](docs/CHANGELOG.md)** §**3.9.0** and §**3.0.0**. Script index: **[tools/README.md](tools/README.md)**.

```bash
npm start
```

Run unpacked dev build without packaging.

---

## Git workflow

Use **Git** or **GitHub Desktop** in your clone of **FarmHub**. Commit from your machine; do not rely on custom sync scripts—mirror trees manually if you keep a second working copy.

Publishing a release: attach the **NSIS `.exe`** and **`FS25_FarmDashboard.zip`** (built with [`tools/Zip-FarmDashboardMod.ps1`](tools/Zip-FarmDashboardMod.ps1) — **only** `modDesc.xml`, `icon.png`, `src/` at zip root). Blurb text: **[docs/RELEASE_NOTES.md](docs/RELEASE_NOTES.md)**.

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
Terms: **[LICENSE](LICENSE)** (all rights reserved unless you negotiate otherwise).
