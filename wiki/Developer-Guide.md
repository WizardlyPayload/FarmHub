# Developer Guide

For contributors and maintainers of **FarmHub**. Deep reference: [DEVELOPER_HANDOVER.md](https://github.com/WizardlyPayload/FarmHub/blob/main/docs/DEVELOPER_HANDOVER.md).

**Versions:** app **4.0.0**, mod **2.3.0.0**

---

## Architecture

```
FS25 (Lua mod, authority only)
    │ writes data.json (+ optional config.xml)
    ▼
Electron main (Node.js)
    ├── fs.watch (local) / FTP poll (remote)
    ├── xmlCollector + dataMerger.mergeData()
    ├── Express HTTP + WebSocket :8766
    └── electron-store, auto-updater
    ▼
Chromium renderer (web/)
    ├── app.js + modules/
    ├── rules-engine.js (client-side field heuristics)
    └── realtime-connector.js (WebSocket)
```

**Rules:**

- Mod runs only when `isAuthority()` (SP / host / dedicated).
- Export **aggregate** JSON — no huge coordinate dumps.
- Collectors use **`pcall`** on density / PF APIs (mod conflicts).

---

## Repository layout

```
FarmHub/
├── docs/                         # Manuals, CHANGELOG, SECURITY
├── wiki/                         # GitHub wiki source
├── FS25_FarmDashboard_App/
│   └── FS25_FarmDashboard_App/
│       ├── main.js               # Electron + Express + FTP + IPC
│       ├── preload.js            # farmDashAPI bridge
│       ├── dataMerger.js         # Lua + XML merge
│       ├── livestockDetail.js    # Pen detail files
│       ├── serverDataCache.js    # Offline snapshot (local servers)
│       ├── lanCredentialPolicy.js
│       ├── package.json
│       ├── build/installer.nsh
│       └── web/
│           ├── index.html, setup.html, simhub.html
│           └── assests/js/       # note: typo "assests"
│               ├── app.js
│               ├── rules-engine.js
│               ├── field-rules-cache.js
│               ├── field-clusters.js
│               ├── realtime-connector.js
│               └── modules/
├── FS25_FarmDashboard_Mod/
│   └── FS25_FarmDashboard_Mod/
│       ├── modDesc.xml
│       └── src/
│           ├── FarmDashboard.lua
│           ├── FarmDashboardDataCollector.lua
│           └── collectors/
└── tools/
    ├── Zip-FarmDashboardMod.ps1
    └── Export-ModStoreImages.ps1
```

---

## Quick start

```bash
cd FS25_FarmDashboard_App
npm install
npm start          # dev
npm test           # Jest
npm run dist       # NSIS → %LOCALAPPDATA%\fs25-farm-dashboard-electron-out\
```

Mod release zip:

```powershell
.\tools\Zip-FarmDashboardMod.ps1
```

---

## Lua mod

| File | Role |
|------|------|
| `FarmDashboard.lua` | `addModEventListener`, authority gate, `addUpdateable` |
| `FarmDashboardDataCollector.lua` | Staggered slots over `collectionCycleMs` |
| `collectors/*.lua` | One data domain per collector |

| Collector | Exports (examples) |
|-----------|-------------------|
| `AnimalDataCollector` | Herds, fills, detail hooks |
| `VehicleDataCollector` | Fleet, fuel, damage |
| `FieldDataCollector` | Growth, PF N/pH, windrows, bales, `baleCountOnField`, suggestions |
| `WeatherDataCollector` | Conditions |
| `FinanceDataCollector` | Money, loan |
| `EconomyDataCollector` | Prices, stations |
| `ProductionDataCollector` | Chains, slots |

**Output path:**

```
Documents\My Games\FarmingSimulator2025\modSettings\FS25_FarmDashboard\<save>\data.json
```

**JSON:** custom `toJSON` — only acyclic plain tables (no userdata/functions).

---

## Electron main (`main.js`)

- HTTP + WebSocket on **8766**
- `getLanBindAddress()` → `127.0.0.1` vs `0.0.0.0`
- LAN middleware: Basic auth, allowlist, `lanCredentialPolicy`
- `startLocalWatching()` / FTP coordinator
- `mergeAndBroadcast()` → `dataMerger.mergeData()`
- `schedulePersistServerCache()` — local servers only; FTP skips hydrate
- IPC handlers for settings, mod config, image export, updater

---

## Data merge (`dataMerger.js`)

| Domain | Precedence |
|--------|------------|
| Animals | Lua live |
| Fields | Lua agronomy, `harvestReady`, suggestions; XML base rows |
| Vehicles | Union; Lua state wins |
| Economy | Merge live + history |

Merged payload includes `dataTimestamps` (`lastLuaReceivedAt`, `liveNewerThanXml`, etc.).

**Field merge highlights:**

- Lua wins `harvestReady`, `needsWork`, suggestions when both exist
- Anti-regress: cache last good values when live slice missing

---

## Web client

**Entry:** `app.js` → `window.dashboard` (`LivestockDashboard` + modules).

| Module | Role |
|--------|------|
| `apiStorage.js` | Servers, farms, `/api/*`, cache hydrate |
| `fields.js` | Cards, forage badges, PF, rules display |
| `rules-engine.js` | `getLocalFieldSuggestion()` |
| `field-rules-cache.js` | Cached rule output per field |
| `realtime-connector.js` | WebSocket; **serverId** guard (3.9) |
| `farm-dashboard-bg.js` | Section background crossfade |

**Polling:** default ~1s `GET /api/data`; WebSocket for push updates.

---

## Rules engine

**File:** `web/assests/js/rules-engine.js`  
**Runs in browser** — no external API.

```javascript
import { getLocalFieldSuggestion, fieldShowsNonBaleForageBadges } from './rules-engine.js';
```

Notable constants:

| Constant | Value | Use |
|----------|-------|-----|
| `MIN_FORAGE_WORKFLOW_LITERS` | 2000 | Forage badges + baling workflow |
| `MIN_WINDROW_LITERS` | 120 | Small windrow noise |
| PF N (growing) | &lt; 60% target | Needs nitrogen |
| PF N (fallow) | &lt; 95% target | Prep nitrogen |

Priority tie-break (maintenance): lime → N → weeds → roll.

---

## i18n

| Step | Command |
|------|---------|
| Add key | `web/locales/messages/en.json` |
| Sync locales | `npm run i18n:sync` |
| Build bundle | `npm run i18n:build` |
| Verify | `npm run i18n:verify` |

**Never** hand-edit `translations.json`.

---

## Build & CI

| Script | Purpose |
|--------|---------|
| `npm run dist` | NSIS installer (output outside repo) |
| `npm run pack` | Unpacked test build |
| `npm run verify:electron-pack` | CI file list gate |
| `npm run unlock-install` | Release installer file locks |

**GitHub Actions:** `npm ci`, `npm test`, `verify:electron-pack`, `i18n:verify`, `npm audit`.

**Release:**

1. Bump `package.json` + `modDesc.xml`
2. `npm run dist` + `Zip-FarmDashboardMod.ps1`
3. GitHub Release: `.exe` + `FS25_FarmDashboard.zip` + notes from `docs/GITHUB_RELEASE_v4.0.0.md`

---

## Debugging

| Symptom | Check |
|---------|--------|
| Empty fields | `data.json` timestamp; `dataTimestamps.lastLuaReceivedAt` |
| Wrong server data | `activeServerId` in realtime payload |
| FTP stale | FTP skips disk cache by design |
| LAN 401 | Credentials + `lanCredentialPolicy` |
| Merge wrong | `liveNewerThanXml`; `dataMerger` field branch |

**Paths:**

```
modSettings\FS25_FarmDashboard\<save>\data.json
%APPDATA%\fs25-farm-dashboard\
```

DevTools: **Ctrl+Shift+I** in Electron window.

---

## Known gaps (v3.9 audit)

| # | Issue |
|---|--------|
| 1 | Livestock Statistics / Genetics tabs not wired |
| 2 | `debugBaleScan` UI may not persist — edit `config.xml` |
| 3 | Fields API error strip auto-retries only (no manual button) |
| 4 | Notification empty state English-only |
| 5 | Mod version mismatch banner not implemented |

Full list: [AUDIT_v3.9_PREFINAL.md](https://github.com/WizardlyPayload/FarmHub/blob/main/docs/_internal/AUDIT_v3.9_PREFINAL.md)

---

## Contributing conventions

- Match existing IPC names and merge semantics
- **Additive** JSON fields only from collectors
- New IPC: `main.js` + `preload.js` + docs
- New strings: `messages/en.json` → `i18n:sync`
- Run `npm test` before PR
- Lua/game behaviour: test **SP first**, then MP host

---

**Related:** [Releases & Upgrades](Releases-and-Upgrades) · [Security](Security-and-Network)

*App **4.0.0**, mod **2.3.0.0***
