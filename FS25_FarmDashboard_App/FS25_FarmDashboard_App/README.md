# FS25 Farm Dashboard

**Version 3.0.0** — Real-time farm management dashboard for *Farming Simulator 25*, with local save folders and dedicated (FTP) servers.

**Authors:** JoshWalki, WizardlyPayload  

---

## What it does

- Connects to the FS25 Farm Dashboard mod data (local `modSettings` paths or FTP to a dedicated server).
- Serves a web UI (Electron + Express on port **8766**) with live stock, vehicles, fields, economy, pastures, productions, weather, and notifications.
- Optional **mod shop image import**: scans your FS25 mods folder, exports PNGs and converts `icon_*.dds` for dashboard thumbnails (uses **ImageMagick** / **texconv** when available).

---

## Installation (Windows)

### 1. Run the installer

1. Run **`FS25 Farm Dashboard Setup 3.0.0.exe`** (or the current release build from `npm run dist`).
2. **The first screen is language selection** — choose the language used for the rest of the installer, the **first-run Server Manager** setup, and the default **Dashboard** language (you can change language again inside the app under **Theme & Color Settings**).
3. The installer installs the app and **automatically runs an ImageMagick helper** so DDS→PNG conversion works without manual downloads when possible (bundled/offline installer, **winget**, **Chocolatey**, or a **download** fallback — see `build/install-imagemagick.ps1`).

### 2. First launch — Server Manager

If the app is not configured yet, the **Server Manager** window opens:

1. **Language** is shown at the **very top** (same list as the installer). If you already picked a language in the installer, it is applied here; you can change it and the page reloads in the new language.
2. Add servers (**Auto-Detect Local Saves** and/or **Add Server Manually** for FTP).
3. Click **Launch Dashboard** to start the embedded server and open the dashboard.

After that, **all** server/save/FTP changes can be made from the dashboard **Settings (gear) → Servers & saves** (same options as first-run setup, plus **Open full setup window** if you prefer the legacy full-screen wizard).

Settings are stored with the app (Electron Store). The dashboard remembers your language in **localStorage** (`farmdash_locale`) and in the main process store (`locale`).

---

## Languages (EU / EEA coverage)

- **Installer (NSIS):** first page = language dropdown; writes `%APPDATA%\fs25-farm-dashboard\install-locale.txt` for the first app launch.
- **Server Manager (`setup.html`):** language bar is the first UI block; strings are loaded from `web/locales/translations.json` (`setup.*` keys).
- **Dashboard (`web/`):** `web/assests/js/i18n/i18n.js` + `data-i18n` attributes; language selector in **Theme & Color Settings**.

Strings are merged **per key** with **English** as fallback when a locale is incomplete. To add or edit text, use `web/locales/build-translations.mjs` and run:

```bash
node web/locales/build-translations.mjs
```

---

## Development

**Requirements:** Node.js, npm.

```bash
npm install
npm start
```

**Production Windows build:**

```bash
npm run dist
```

Output (folder is **next to** `package.json` in this app):  
`FS25_FarmDashboard_App/FS25_FarmDashboard_App/release/` — e.g. `FS25 Farm Dashboard Setup 3.0.0.exe`, `latest.yml`, and `win-unpacked/` (version follows `package.json`).

That `release/` directory is **gitignored** in the FarmHub repo: Git Desktop syncs **source** only; the installer files are produced locally when you run `npm run dist` and are **not** pushed as normal commits.

**Auto-update (desktop app):** Packaged builds use `electron-updater` against **GitHub Releases** (`package.json` → `build.publish`, repo `WizardlyPayload/FarmHub`). After each `npm run dist`, create or edit a **GitHub Release** (browser or `gh release`) and attach **`latest.yml`** and the **`.exe`** from your local `release/` folder so tags match `package.json` `version`. The in-game **FS25 Farm Dashboard mod** is updated separately via Giants Mod Hub / the in-game mod browser, not this mechanism.

**NSIS include:** `build/installer.nsh` (language welcome page + ImageMagick `customInstall`). `package.json` → `build.nsis.include`.

---

## Project layout (app)

| Path | Purpose |
|------|--------|
| `main.js` | Electron main: Express/WS, FTP polling, IPC, locale file consumption |
| `app-updater.js` | GitHub Releases auto-update (`electron-updater`) for the packaged Windows app |
| `setup.html` | First-run Server Manager (language-first) |
| `web/index.html` | Dashboard UI |
| `web/locales/translations.json` | Generated UI strings (do not edit by hand — regenerate from `build-translations.mjs`) |
| `web/assests/js/i18n/i18n.js` | Dashboard i18n |
| `web/assests/js/setup-i18n.js` | Setup wizard i18n |
| `build/installer.nsh` | NSIS: language page + ImageMagick install |
| `build/install-imagemagick.ps1` | ImageMagick install helper |

---

## Troubleshooting

- **Launch Dashboard stuck on “Starting…” after opening Server Manager from the dashboard (Settings → Open full setup window):** The desktop app loads `setup.html` over `http://127.0.0.1:8766`. Saving config must navigate the main window back to `/`. If that step is skipped, the button text is never restored—use **Launch Dashboard** again after updating the app, or restart the app. (Fixed in source: dashboard home vs `/setup.html` detection in `main.js`.)
- **Pastures → View all livestock / per-pasture livestock list breaks or Details stops working:** The pasture livestock table uses DataTables; reopening the modal without tearing down the previous instance causes re-init errors. (Fixed in source: destroy existing DataTable before rebuilding the table; reuse one Bootstrap modal instance.)
- **Splash shows `splash.loading` instead of English text:** The key must exist in `web/locales/build-translations.mjs`; regenerate `translations.json` with `node web/locales/build-translations.mjs` (see **Languages** above).

**Quick smoke check (desktop):** First load shows readable splash line (not a raw i18n key); **Settings → Open full setup window → Launch Dashboard** returns to the dashboard; **Pastures → View all livestock** (open twice) then **Details** on a row opens the animal modal; **Livestock → Details** still works. Watch the devtools console for DataTables “reinitialise” warnings.

---

## Release notes — v3.0.0

See **[../../docs/CHANGELOG.md](../../docs/CHANGELOG.md)** §**3.0.0**, **[../../docs/RELEASE_NOTES.md](../../docs/RELEASE_NOTES.md)**. Long-form narrative: **[../../docs/RELEASE_v3.0.0.md](../../docs/RELEASE_v3.0.0.md)**. Earlier packaged notes: **[../../docs/RELEASE_v2.0.0.md](../../docs/RELEASE_v2.0.0.md)**. Summary (v2 era):

- **Language first:** NSIS installer welcome page + Server Manager language bar; shared `locale` store and `translations.json` pipeline.
- **Dashboard i18n:** EU/EEA-oriented locales with English fallback per string.
- **ImageMagick:** Installed automatically during setup when possible (bundled / winget / Chocolatey / official download).
- **Server Manager:** FTP polling options, HTTP feed fields, mod image scan integration.

---

## Rules suggestions

Parcel priorities use the **offline rules engine** in the dashboard (`rules-engine.js`, field cards, and related field-card UI). Guidance is computed locally from merged game data.

## FarmHub repo documentation

This app lives under the **FarmHub** workspace. For **security / LAN** and the **developer handover**, see [../../README.md](../../README.md), [../../docs/SECURITY.md](../../docs/SECURITY.md), and [../../docs/DEVELOPER_HANDOVER.md](../../docs/DEVELOPER_HANDOVER.md).

---

## Licence / credits

Bundled third-party components (Electron, Chromium, ImageMagick when installed, etc.) are subject to their respective licences. Game content and mod data remain property of Giants Software and respective mod authors.
