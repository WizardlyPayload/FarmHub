# NEW APP - Agent coordination

## Folder ownership

| Agent | Owns | Do not edit |
|-------|------|-------------|
| **0 (foundation)** | `src/store/`, `src/types/`, `src/services/`, `src/components/ui/`, `src/app/Shell.tsx`, `src/i18n/` | - |
| **1** | `src/sections/productions/`, `src/sections/pastures/`, `src/lib/pastures-*` | store shape |
| **2** | `src/sections/fields/`, `src/lib/rules-engine/` | store shape |
| **3** | `src/sections/vehicles/`, `src/sections/fleet-map/`, `src/lib/vehicleAds*` | store shape |
| **4** | `src/sections/economy/`, `src/lib/storage/`, `src/lib/redTape/` | store shape |
| **5** | `src/sections/livestock/` | store shape |
| **6** | `src/settings/`, `src/setup/`, `src/simhub/`, `src/platform/`, `src/services/electron-bridge.ts`, `src/services/lan-auth.ts` | store shape |
| **7** | routes in `Shell.tsx`, integration, `PARITY.md` sign-off | - |

## Rules

1. Read `PARITY.md` for your section rows before coding.
2. Use `useDashboardStore` selectors - request store changes through Agent 0.
3. All user-visible strings via `t("key")`; add keys to `FS25_FarmDashboard_App/web/locales/messages/en.json` then run i18n pipeline.
4. Reuse `src/components/ui/*` - no one-off card styles.
5. Port business logic to `src/lib/` as pure TypeScript; keep components thin.
6. Images: lazy-load from `/assests/img/` (legacy Express path) - do not copy 742 MB into NEW APP.

## Dev - keep website demo and new UI separate

| Role | Port | userData | UI |
|------|------|----------|----|
| **Installed release** (website / LAN demo) | **8766** | `%APPDATA%\fs25-farm-dashboard` | Classic `web/` (leave **Use new dashboard UI** OFF) |
| **Repo second instance** (new UI + latest merge) | **8767** | `%LOCALAPPDATA%\fs25-farm-dashboard-dev` | NEW APP via `FARMDASH_UI_V2=1` |

Both can watch the **same** `Documents\My Games\FarmingSimulator2025\modSettings\FS25_FarmDashboard\…\data.json` (and the same FTP slots). Preferences are **not** shared - the demo install stays untouched.

### Recommended daily setup

1. Leave the **installed** Farm Dashboard running on `:8766` (classic UI) for the website demo.
2. From the **FarmHub repo root**, start the second instance (syncs servers/saves from the install, turns on NEW UI):

```powershell
npm run dev:new-ui
```

Open **http://127.0.0.1:8767/** (or the Electron window it opens).

3. Optional browser-only Vite (hot reload) against that same repo backend:

```powershell
npm run dev:ui:isolated
```

Open **http://127.0.0.1:5173/**

**Do not** use plain `npm run dev:ui` when testing new features (invoices, mileage, merge fixes): that proxies to `:8766` (installed classic backend) and looks crossed over / missing features.

### Why features were missing before

Proxying the new UI at `:5173` -> installed `:8766` only shows what the **shipping** app merges. New collectors/UI live in the **repo** instance on `:8767`. Default `useNewUi` stays **off** so auto-update never forces NEW APP onto users who want classic (they also skip new-UI-only features until they opt in).

### Isolated API without syncing servers

```powershell
npm run dev:api            # :8767, NEW UI, separate userData (configure saves yourself)
npm run dev:ui:isolated         # Vite -> :8767
```

Or `npm run start:dev -- --sync-config` / `--legacy-ui` from `FS25_FarmDashboard_App`.

Vite multi-page entries (Agent 6):

| URL (dev) | HTML | Entry |
|-----------|------|-------|
| `/` | `index.html` | `src/main.tsx` |
| `/setup.html` | `setup.html` | `src/setup/main.tsx` |
| `/simhub.html` | `simhub.html` | `src/simhub/main.tsx` |

When packaging NEW APP into Electron, serve `dist/setup.html` and `dist/simhub.html` alongside the main bundle (same as legacy `setup.html` / `simhub.html` routes). No Electron merge/FTP logic changes required beyond pointing those routes at the Vite build outputs.

## Enable NEW APP on the *installed* app (opt-in only)

Default remains classic. Only enable if you intentionally want THIS install on NEW APP (not recommended while the same PC hosts the public demo).

```bash
# Build UI + copy into FS25_FarmDashboard_App/ui-v2
# (from repo root)
npm run build:ui

# Or: cd "NEW APP" && npm run build   # postbuild copies to ui-v2/

# Then start Electron with cutover flag (PowerShell)
cd FS25_FarmDashboard_App
$env:FARMDASH_UI_V2 = "1"
npm start
```

Or turn on **Settings -> Appearance -> Use new dashboard UI**, save, and restart (writes `uiPreferences.useNewUi`).

`main.js` resolves UI from `FS25_FarmDashboard_App/ui-v2` first, then falls back to `NEW APP/dist` for local Vite builds.

Without the flag/toggle, Electron serves legacy `web/` unchanged. Do not delete `web/` until cutover is default and QA-complete.

When UI v2 is on, `/setup.html` is served from `ui-v2/setup.html` with `__FARMDASH_SETUP_TOKEN` injected (same as legacy). `simhub.html` is served from the same folder via static middleware.
