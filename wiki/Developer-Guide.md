# Developer Guide

This guide is for contributors and maintainers of **FarmHub**. It covers the architecture, codebase structure, and how to work on the project.

## Quick Start for Developers

### Current Versions
- **App:** 3.9.0 (`FS25_FarmDashboard_App/FS25_FarmDashboard_App/package.json`)
- **Mod:** 2.3.0.0 (`FS25_FarmDashboard_Mod/FS25_FarmDashboard_Mod/modDesc.xml`)

### Build the Windows App

```bash
cd FS25_FarmDashboard_App/FS25_FarmDashboard_App
npm install
npm run dist
```

The installer goes to `%LOCALAPPDATA%\fs25-farm-dashboard-electron-out\`

### Run Dev Build

```bash
cd FS25_FarmDashboard_App/FS25_FarmDashboard_App
npm install
npm start
```

Opens the Electron app in dev mode.

## Architecture

```
Game (FS25)
    ↓
Mod writes data.json
    ↓
Electron (main.js) watches data.json
    ↓
Express server :8766
    ↓
Web client (browser) polls /api/*
```

### Key Components

| Component | File | Role |
|-----------|------|------|
| **Lua Mod** | `FS25_FarmDashboard_Mod/src/FarmDashboard.lua` | Runs in game; writes `data.json` every cycle |
| **Electron Main** | `FS25_FarmDashboard_App/main.js` | Watches files, manages server, IPC bridge |
| **Express Server** | `FS25_FarmDashboard_App/main.js` | HTTP/WebSocket on port 8766 |
| **Data Merger** | `FS25_FarmDashboard_App/dataMerger.js` | Combines Lua data + XML savegame data |
| **Rules Engine** | `FS25_FarmDashboard_App/web/assests/js/rules-engine.js` | AI field suggestions (browser-side) |
| **Web Client** | `FS25_FarmDashboard_App/web/assests/js/app.js` | Main dashboard UI |

## Repository Layout

```
FarmHub/
├── FS25_FarmDashboard_App/
│   └── FS25_FarmDashboard_App/
│       ├── main.js                    # Electron + Express
│       ├── preload.js                 # IPC bridge
│       ├── dataMerger.js              # Merge Lua + XML
│       ├── package.json               # v3.9.0
│       ├── web/
│       │   ├── index.html
│       │   ├── setup.html
│       │   ├── assests/
│       │   │   ├── css/styles.css
│       │   │   └── js/
│       │   │       ├── app.js
│       │   │       ├── rules-engine.js
│       │   │       ├── modules/       # Sections
│       │   │       └── i18n/          # Translations
│       │   └── locales/
│       │       ├── messages/          # Source translations
│       │       └── translations.json
│       └── build/
│           └── installer.nsh          # NSIS hooks
├── FS25_FarmDashboard_Mod/
│   └── FS25_FarmDashboard_Mod/
│       ├── modDesc.xml                # v2.3.0.0
│       ├── icon.png
│       └── src/
│           ├── FarmDashboard.lua      # Entry point
│           ├── FarmDashboardDataCollector.lua
│           ├── Diagnostics.lua
│           └── collectors/            # Per-data-type
├── tools/
│   ├── app/                           # Electron npm helpers
│   ├── Zip-FarmDashboardMod.ps1       # Package mod zip
│   └── Export-ModStoreImages.ps1      # Image extraction
└── docs/                              # Full documentation
```

## The Lua Mod

### Mission Hook

`FarmDashboard.lua` registers with `addModEventListener`. On `loadMap`, if `isAuthority()` is true (host/single-player), it adds itself to updateables.

### Staggered Orchestration

`FarmDashboardDataCollector:update(dt)` divides each `collectionCycleMs` into slots — one per enabled module. This prevents lag spikes.

### Collectors

| Collector | Produces |
|-----------|----------|
| `AnimalDataCollector.lua` | Animals, health, type |
| `VehicleDataCollector.lua` | Vehicles, fuel, damage, position |
| `FieldDataCollector.lua` | Crops, growth, PF nitrogen/pH, windrows, bales, suggestions |
| `WeatherDataCollector.lua` | Temperature, conditions |
| `FinanceDataCollector.lua` | Money, loan, asset values |
| `EconomyDataCollector.lua` | Market prices, selling stations |
| `ProductionDataCollector.lua` | Production chains, fill levels |

### Output

The mod writes `data.json` to:

```
%USERPROFILE%\Documents\My Games\FarmingSimulator2025\modSettings\FS25_FarmDashboard\<savename>\data.json
```

This file is updated every `collectionCycleMs` (default 60 seconds).

## The Electron App

### HTTP Server

- Runs on port **8766** (both HTTP and WebSocket)
- Binds to `127.0.0.1` by default (localhost only)
- If LAN enabled, binds to `0.0.0.0` and enforces HTTP Basic Auth

### File Watching

`startLocalWatching()` watches `data.json` on local servers. If the file changes, Electron:
1. Reads the new `data.json`
2. Also re-reads the savegame XML
3. Merges both with `dataMerger.mergeData()`
4. Broadcasts to all connected browsers via WebSocket

### FTP Polling

`startFtpPollingCoordinator()` handles remote (FTP) servers. Configurable:
- **Interval**: 1–25 minutes
- **Schedule**: Sync (all at once) or Staggered (spread out)

### IPC Bridge

`preload.js` exposes methods to the web UI via `window.farmDashAPI`. Every method is intentionally listed — no ad-hoc access to Node APIs.

**Key methods:**
- `saveSettings(cfg)` — Persist server config
- `saveUiPreferences(prefs)` — Save theme, field clusters, etc.
- `checkDesktopAppUpdates()` — Trigger `electron-updater`
- `exportModStoreImages()` — Run mod-image PowerShell pipeline

## Data Merge (`dataMerger.js`)

Combines Lua live data with savegame XML static data.

### Precedence

| Domain | Lua | XML | Both |
|--------|-----|-----|------|
| Animals | live counts, fill | — | — |
| Fields | live agronomy, growth, suggestions | base field rows | merged |
| Vehicles | live state, fuel | base list, ownership | merged |
| Economy | live prices | history | merged |

### Anti-Regress

If live data is missing (game just restarted), the merger caches the last known value so the UI doesn't flicker.

### Timestamps

The merged payload includes:
```json
{
  "dataTimestamps": {
    "lastLuaReceivedAt": <epoch_ms>,
    "lastXmlReceivedAt": <epoch_ms>,
    "mergeComputedAt": <epoch_ms>,
    "liveNewerThanXml": <bool>
  }
}
```

Used for the top-bar data-source badge.

## Rules Engine (`rules-engine.js`)

Runs in the browser; no network calls. Provides AI-powered field work suggestions.

### Entry Point

`getLocalFieldSuggestion(field, opts)` — called by `fields.js` for each field.

### Thresholds

| Constant | Value | Meaning |
|----------|-------|---------|
| `MIN_WINDROW_LITERS` | 120 | Ignore windrow signal below this |
| `MIN_WINDROW_AREA` | 0.0005 | Min area fraction to count windrow |
| PF nitrogen band | < 0.6 × target | "Needs nitrogen" |

### Suggestion Priority

When multiple maintenance actions apply:
1. **Lime** (highest priority)
2. **Nitrogen**
3. **Weeds**
4. **Rolling** (lowest priority)

## Web Client

### Entry Point

`web/assests/js/app.js` defines `LivestockDashboard` and mixes in modules. Assigned to `window.dashboard`.

### Module Map

| Module | Handles |
|--------|---------|
| `navigation.js` | Sidebar, landing page |
| `apiStorage.js` | Server tabs, `/api/*` calls |
| `livestock.js` | Livestock section |
| `vehicles.js` | Vehicles section |
| `fields.js` | Fields section |
| `economy.js` | Economy section |
| `pastures.js` | Pastures section |
| `productions.js` | Production chains |
| `theming.js` | Color picker |
| `i18n/i18n.js` | Translations |

### Polling

`app.js` has a `dashboard.pollInterval` (default 1s). On each tick:
1. Fetch `/api/data`
2. Merge with local state
3. Call `refresh*()` on each module (incremental DOM update)

## Internationalization (i18n)

### Adding a String

1. Add the key to `web/locales/messages/en.json` (source of truth)
2. Run `npm run i18n:sync` — copies the key to every language
3. Translate non-English files
4. Run `npm run i18n:build` — creates `translations.json`
5. Run `npm run i18n:verify` — confirms full coverage

### Build & Verify

```bash
npm run i18n:build      # Create translations.json
npm run i18n:verify     # Check coverage
npm run i18n:audit      # Find orphans/duplicates
```

## Build & Packaging

### npm Scripts

| Script | What |
|--------|------|
| `npm start` | Dev launch (`electron .`) |
| `npm run dist` | Full NSIS installer |
| `npm run pack` | Unpacked app (for testing) |
| `npm test` | Run tests |
| `npm run verify:electron-pack` | CI gate: verify all required files in `package.json` `build.files` |

### CI/CD

GitHub Actions runs on push/PR to `main`, `master`, or `develop`:
- `npm ci` — clean install
- `npm test` — unit tests
- `npm run verify:electron-pack` — file verification
- `npm run i18n:verify` — translation coverage

### Release Checklist

1. Build mod zip: `.\tools\Zip-FarmDashboardMod.ps1`
2. Build Windows app: `npm run dist`
3. Attach `.exe` and mod `.zip` to GitHub Release
4. Verify auto-update works: Settings → Check for updates

## Debugging Checklist

| Issue | Check |
|-------|-------|
| Empty dashboard | Mod enabled + save loaded; `data.json` exists; Settings path correct |
| "Waiting for field data" | `dataTimestamps.lastLuaReceivedAt` advancing? Watcher fired? |
| Wrong farm shown | `activeFarmId` in merged payload; check farm dropdown |
| Merge oddities | `dataMerger.js` precedence table; `liveNewerThanXml` should be `true` when fresh |
| LAN 401/403 | Check `lanUsername`, `lanPassword`, IP allowlist |
| FTP not polling | `intervalMinutes` must be 1–25 |
| `app.asar` locked | `npm run unlock-install`, then `npm run dist` |

## Known Gaps from the Audits

1. **Livestock Statistics / Genetics tabs** — UI buttons not wired (`index.html`, `livestock.js`)
2. **Electron `parseModConfigXml`** — ignores `debugBaleScan` flag (`main.js`)
3. **Fields error strip** — no retry button; auto-retries every 5s
4. **Notification history** — hard-codes English empty state

## Conventions

- Match existing naming, IPC channels, and merge semantics
- Prefer additive JSON fields; don't reintroduce coordinate dumps
- New translations → `messages/<code>.json` only; never hand-edit `translations.json`
- New IPC channels: add in `main.js`, expose in `preload.js`, document in this file
- Store keys: prefer `electron-store` over `localStorage` for desktop-level config
- Tests: `npm test` for JS changes; Lua/game behaviour needs manual testing

---

**Questions?** Check the [full documentation](../docs/README.md) or open a GitHub issue.
