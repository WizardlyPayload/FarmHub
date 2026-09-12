# NEW APP parity checklist

Mark ✅ when verified against legacy `web/` behavior. **Do not cut over until 100%.**

## Parity audit (2026-07-10)

Full gap matrix: **`PARITY_GAPS.md`**. Nav icon spec: **`ICON_WISHLIST.md`**.

**Headline:** All sections compile, route, and render. Logic for ADS, Vehicle Years, storage, moisture, Red Tape, field rules, pastures, productions, genetics, notifications, map, and settings is **largely ported** to `src/lib/`. Remaining work is **wiring + QA**, not greenfield features.

| Priority | Item |
|----------|------|
| P0 | Live SP/MP QA sign-off; **Fields must read `fieldClusterPrefsByServer`** (currently hardcoded in `FieldsSection.tsx`); dedicated sidebar nav icons |
| P1 | Top bar Live API vs Snap/XML badge; mod-required banner; overview ADS/red-tape alerts; vehicles table depth + `{ id }` deep link; SimHub pasture/production cards; market base-price modal; storage commodity icons |
| P2 | Background crossfade; vehicles scroll perf; notification bell SVG; livestock statistics chart (unwired in legacy too) |

**Improvements over legacy:** persistent sidebar (no hub gateway), overview command center, livestock genetics overview tab, TanStack livestock table, master–detail Fields UX.

---

## Integration status (Agent 7 — 2026-07-09)

| Check | Result |
|-------|--------|
| `npm run typecheck` | ✅ clean |
| `npm run build` (multi-page) | ✅ `dist/index.html`, `dist/setup.html`, `dist/simhub.html` |
| Section router | ✅ home + livestock, vehicles, fields, economy, pastures, productions, map |
| Electron cutover flag | ✅ `FARMDASH_UI_V2=1` or Settings `useNewUi` serves `ui-v2/` (fallback `NEW APP/dist`) |
| Packaging embed | ✅ `npm run build:ui` → `FS25_FarmDashboard_App/ui-v2`; `verify:electron-pack` requires it |
| Settings useNewUi toggle | ✅ Appearance tab; restart required; **default remains off** (never auto-push NEW APP; classic users skip new-UI-only features until they opt in) |
| Setup token injection under UI v2 | ✅ `/setup.html` injects `__FARMDASH_SETUP_TOKEN` from ui-v2 when enabled |
| Legacy `web/` | **Kept** — default until flag is set; do not delete yet |
| i18n | ✅ `i18n:sync` / `i18n:build` / `i18n:verify` OK (1519 keys, 27 locales) |

### How to enable NEW APP (dev / tester)

```bash
# 1) Build UI v2 into App/ui-v2 (from repo root)
npm run build:ui

# 2) Start Electron with cutover flag (PowerShell)
cd FS25_FarmDashboard_App
$env:FARMDASH_UI_V2 = "1"
npm start
```

Or **Settings → Appearance → Use new dashboard UI**, Save, restart. Without the flag/toggle, Electron continues to serve legacy `web/`.

Dev without packaging: Electron API on `:8767` + `cd "NEW APP" && npm run dev` (Vite `:5173`, proxies `/api` `/locales` `/assests`).

---

## Shell (Agent 0 + 7 + Wave 2 polish + navigation redesign)

- [x] Vite + Preact + TS scaffold
- [x] Zustand store + `/api/data` bootstrap
- [x] WebSocket primary + HTTP fallback
- [x] **Persistent left sidebar** — one-click section switch (no hub-and-spoke Home)
- [x] **Top bar** — server/save tabs, farm select, weather/time, settings
- [x] **Overview** command center (replaces landing image cards)
- [x] Hash routing `#/fields`, `#/economy/storage` + last-section memory
- [x] Settings: default section on open; sidebar hides disabled sections
- [x] Splash screen parity (brand logo, backdrop, progress bar, min hold ~5s local / ~1.2s remote)
- [x] Settings modal (Agent 6)
- [x] All section bodies wired (Agents 1–5) — **feature depth still below legacy in places**

### Navigation redesign (2026-07-10)

| Item | Status |
|------|--------|
| Left sidebar always visible | ✅ |
| No Home gateway required | ✅ |
| Overview alerts → deep links | ✅ |
| Fields master–detail + sticky filters | ✅ |
| Vehicles table/cards toggle + filter deep links | ✅ |
| Economy tab deep links | ✅ |
| Pastures search + expand food/water | ✅ |
| Productions search | ✅ |
| Re-QA section switching without Home | ⏳ live QA |
| Sidebar uses dedicated nav icons (not Dashboard Pictures) | ❌ see `ICON_WISHLIST.md` |
| `fieldClusterPrefsByServer` applied in Fields section | ❌ P0 — `PARITY_GAPS.md` |

## Sections

| Section | Agent | Status | Notes |
|---------|-------|--------|-------|
| Productions | 1 | ✅ wired | Chains / fill tables; needs live save QA vs legacy |
| Pastures | 1 | ✅ wired | Cards, warnings, modals; needs live save QA |
| Fields + rules | 2 | ⚠️ wired | Rules-engine + card UX ported; **cluster prefs not loaded in UI** — see `PARITY_GAPS.md` P0 |
| Vehicles + ADS + Vehicle Years | 3 | ✅ wired | Lean cards + year badge; select → right inspector ADS; dedicated `#/ads` motorized tab; VY summary cards removed |
| Fleet map | 3 | ✅ wired | Overview optional; tooltip in pin layer; pin → Vehicles detail; viewport rebind on overview |
| Economy + Storage + Red Tape | 4 | ✅ wired | `#/storage` first-class; Red Tape `#/redtape` (+ `#/economy/redtape` alias); Economy Storage tab deep-links |
| Moisture | — | ✅ wired | `#/moisture` when Moisture System payload active; links to Storage/Fields |
| Livestock + pen detail | 5 | ✅ wired | TanStack columnPinning fix; table, filters, export, pen modal; genetics overview **exceeds** legacy |

## Platform (Agent 6)

- [x] Settings 5 tabs (Dashboard, Servers & saves, FS25 mod, Appearance, About)
- [x] Setup page (`setup.html` Vite entry → `src/setup/`)
- [x] SimHub page (`simhub.html` Vite entry → `src/simhub/`)
- [x] Notifications + urgent alerts (+ changes modal helpers)
- [x] Major-only alerts scoped by server+farm+save; stock/bale/pallet/animal deltas; silent re-baseline on switch
- [x] Dynamic Mods sidebar (Red Tape, ADS, Moisture) via `src/lib/modPresence.ts` + right vehicle inspector (ADS + Vehicle Years)
- [x] Overview “Active mods” chips when payload detects Red Tape / ADS / Moisture
- [x] `#/redtape`, `#/ads`, `#/moisture` routes; `#/economy/redtape` alias
- [x] LAN auth overlay + remote viewer guards
- [x] Electron IPC bridge (`src/services/electron-bridge.ts`)

## Wave 2 polish (2026-07-09)

| Item | Status | Notes |
|------|--------|-------|
| Splash polish | ✅ | Logo, home backdrop, progress fill, min hold, demo hint, fade-out |
| Landing weather chip | ✅ | Temp + condition; opens forecast modal (current + 3-day) |
| Landing import CTA | ✅ | Local Electron only via `exportModStoreImages` |
| Landing game time / badges | ✅ | Clock badge + per-card counts (farm-scoped) |
| Genetics overview | ✅ | Herd averages, band distribution, top animals; placeholder only when no genetics |
| MP farm ownership inference | ✅ | `resolveActiveFarmId` mirrors legacy field → husbandry ownership pick |

### Still needs live SP/MP QA

1. Splash timing / first-paint feel on cold Electron start and remote LAN viewer.
2. Weather chip vs in-game weather (temp, condition labels, forecast days).
3. Import mod images end-to-end (progress UX is lighter than legacy PowerShell attach).
4. Genetics overview against RealisticLivestock saves (and vanilla with no genetics → placeholder).
5. Multi-farm dedicated/FTP: wrong saved farm id auto-corrects to farm that owns fields/livestock.
6. Full section behavioral parity (productions, pastures, fields rules, vehicles ADS, economy/storage/redtape, fleet map).

## Remaining blockers before soft-cutover 5.0.0

1. **Behavioral QA** against a live SP + MP save for every section (not just compile/route) — sign-off required.
2. **Default `useNewUi` remains off** until QA signed off (do not flip in releases). Use `npm run dev:new-ui` for a second instance on :8767 that shares the same mod data paths.
3. **Packaging** — Release agent owns `build:all`; `ui-v2/` refreshed by NEW APP `postbuild` / `build:ui`.
4. **Do not delete `web/`** until flag is default-on and QA signed off.
5. Optional polish leftovers: richer mod-export progress UI; livestock statistics chart (legacy also unwired); navbar weather strip (landing chip covers home).

Full matrix: see plan `new_app_gui_rebuild_1ad53e5a.plan.md` and `docs/_internal/AUDIT_v3.0.md`.
