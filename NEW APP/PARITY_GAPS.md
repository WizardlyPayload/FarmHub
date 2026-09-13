# Parity gaps — NEW APP vs legacy `web/`

**Audit date:** 2026-07-10  
**Method:** Compared `FS25_FarmDashboard_App/web/assests/js/modules/` + `web/index.html` against `NEW APP/src/sections/`, `src/lib/`, `src/platform/`, `src/settings/`, and existing `PARITY.md`.

## Executive summary

NEW APP has **all major sections routed and most business logic ported** to TypeScript under `src/lib/`. Gaps are mostly **wiring, polish, and live-QA-sensitive behavior** — not missing routes.

| Area | NEW APP status | Gap severity |
|------|----------------|--------------|
| Shell / nav | Sidebar + top bar wired | Medium (icons, data-source badges) |
| Overview | Replaces landing cards | Low–medium |
| Fields + rules | Rules engine ported; master–detail UX | **High** (cluster prefs, rules refresh UX) |
| Vehicles + ADS + Years | Cards + right inspector; ADS/Red Tape/Moisture mod tabs | Low |
| Economy + storage + moisture + red tape | Storage / Red Tape / Moisture are first-class sections; `#/economy/redtape` alias | Low |
| Productions | Owned-only + optional public toggle; Lua ownership fix | Low |
| Fleet map | Viewport rebuild; pin → vehicles detail; overview optional | Low |
| Notifications / urgent / changes | Scoped major-only + stock/animal deltas | Low |
| Settings / setup / SimHub | 5-tab settings + pages exist | Medium (SimHub pasture/production depth) |
| i18n / theming | Pipeline OK; section themes partial | Low |

**Cutover blockers (P0):** live SP/MP QA sign-off; **field cluster prefs not applied** in Fields UI; no dedicated nav icons (uses Dashboard Pictures photos in sidebar — see `ICON_WISHLIST.md`).

---

## Priority order (fix / QA)

### P0 — Block soft cutover

1. **Live behavioral QA** — every section on real SP + MP host saves (already tracked in `PARITY.md`).
2. **Fields: cluster prefs ignored** — `FieldsSection.tsx` hardcodes `{ autoMerge: true, manualGroups: [] }`; legacy reads `dashboard.fieldClusterPrefsByServer` (`fields.js` `getFieldClusterPrefForActiveServer`, settings in `dashboard-settings.js`). Settings UI saves prefs but Fields never loads them.
3. **Sidebar nav icons** — `SectionSidebar.tsx` uses full **Dashboard Pictures** PNGs as thumbnails; design intent in `section-meta.ts` is dedicated glyphs (`ICON_WISHLIST.md`).

### P1 — User-visible parity gaps

4. **Top bar: Live API vs Snap/XML badge** — legacy `environment.js` `resolveNavbarConnectionBadge` + stale-export timer; NEW APP shows generic Online/Polling/Error only (`AppTopBar.tsx`).
5. **Top bar: mod version pill** — legacy `#navbar-mod-version` (`index.html`, `navigation.js`); NEW APP only in Settings About tab.
6. **Environment: mod-required banner** — legacy `environment.js` dismissible banner when mod/export missing; not ported to NEW APP shell.
7. **Overview alerts: ADS / red tape / moisture** — ✅ wired (2026-07-10): Overview alerts include ADS needs-repair, Red Tape policy/events, and bale moisture rot when mods are active.
8. **Vehicles: overview deep link `{ id }`** — ✅ wired: `VehiclesSection` syncs `sectionParams.id`, highlights, and scrolls; Shell right inspector opens.
9. **Vehicles: table view** — ✅ improved: table includes ADS status column + year/condition; full ADS detail remains in Shell right inspector (not in-card duplicate).
10. **Vehicles: fleet-level Vehicle Years summary** — intentionally removed (year badge on cards/inspector only per Vehicles/ADS UX wave).
11. **Vehicles: scroll perf** — legacy `bindVehiclesScrollPerf` pauses heavy re-renders during scroll; not ported.
12. **Economy: market base-price explainer** — legacy `showMarketBasePricesModal()` (`economy.js`); no equivalent in `EconomySection.tsx` `MarketTab`.
13. **Storage: commodity row icons** — legacy `commodityIcon()` in `storage.js`; NEW APP table is text-only (`EconomySection.tsx` `StorageTab`, `src/lib/storage/`).
14. **Storage: expanded-row persistence on refresh** — legacy `restoreExpandedStockRows()`; NEW APP resets expand state each render (acceptable but different UX).
15. **SimHub: pasture/production cards** — `simhub/main.tsx` uses `JSON.stringify(p).slice(0, 400)` for pasture body; legacy `simhub-page.js` renders structured cards with warnings/food like main dashboard.
16. **SimHub: field cluster prefs** — legacy simhub uses `cfg.fieldClusterPrefs` from `/api/simhub-view-config`; SimHub fields view filters by `fieldClusterIds` only, not cluster merge prefs.
17. **Global API error / folder selection panel** — legacy `#folder-selection` card with local vs remote copy (`index.html`); NEW APP relies on per-section empty states + connection badge.
18. **Field rules: manual refresh control** — legacy Fields toolbar button `refreshFieldRulesOnCards()` + cache listener (`fields.js`); NEW APP has cache module but no UI trigger or event listener in `FieldsSection.tsx` (network rules disabled — low impact unless re-enabled).

### P2 — Polish / intentional redesign deltas

19. **Fields layout** — legacy responsive **card grid**; NEW APP **master–detail** list + single card (redesign — verify acceptable).
20. **Landing / section backgrounds** — legacy `farm-dashboard-bg.js` crossfades `#farm-dash-bg` planes; NEW APP static per-section backdrop in `Shell.tsx` / `section-meta.ts` (no crossfade).
21. **Livestock statistics tab** — placeholder in **both** legacy and NEW APP (legacy chart unwired); NEW APP explicitly documents omission (`LivestockSection.tsx`).
22. **Genetics overview tab** — **NEW APP exceeds legacy** (herd averages, bands, top animals in `genetics-overview.ts`); legacy genetics tab was mostly per-animal in table/modal.
23. **Notification bell icon** — emoji 🔔 vs Bootstrap icon (`NotificationBell.tsx` vs `index.html`).
24. **Import mod images progress** — overview CTA exists; legacy has richer PowerShell attach progress (noted in `PARITY.md`).
25. **DataTables vs TanStack Table** — livestock uses `@tanstack/react-table` with sort/pagination/export; different UX, feature parity largely OK.
26. **Productions fill-type labels** — both show raw fill type keys; neither resolves via `fillTypeResolve` in UI (parity).

---

## Per-section gap detail

### Shell, navigation, platform

| Gap | Legacy pointer | NEW APP | Notes |
|-----|----------------|---------|-------|
| Hub landing image cards | `navigation.js` `showLanding`, `index.html` landing row | `OverviewSection.tsx` | Intentional redesign |
| Section photo sidebar icons | `navigation.js`, landing assets | `SectionSidebar.tsx` uses Dashboard Pictures | Should switch to dedicated nav icons |
| Glyph meta unused | — | `section-meta.ts` `SECTION_NAV_META` | Defined but not wired in sidebar |
| Live API / Snap XML badge | `environment.js` `resolveNavbarConnectionBadge` | `AppTopBar.tsx` | Missing nuanced data-source pill |
| Game time + weather in navbar | `index.html` `#navbar-game-time`, `#navbar-weather` | Top bar + overview chip | Parity OK (weather in top bar when data present) |
| Mod version navbar badge | `index.html` `#navbar-mod-version` | Settings About only | |
| Mod-required / stale export banners | `environment.js` | — | |
| Folder selection error card | `index.html` `#folder-selection` | — | Per-section errors only |
| Dynamic bg crossfade | `farm-dashboard-bg.js` | `Shell.tsx` static `SECTION_BACKGROUNDS` | |
| Viewer / demo / LAN | `viewer-mode.js`, `index.html` body classes | `platform/viewer-mode.ts`, `LanAuthOverlay`, `DemoBanner` | Ported |
| Notifications history | `notifications.js` | `platform/notifications.ts`, `NotificationBell.tsx` | Ported; emoji icon |
| Urgent alerts + changes modal | `urgent-notifications.js`, `changes.js` | `UrgentAlertsWatcher`, `ChangesModal` | Ported |
| Farm scope / MP inference | `farmScope.js`, `apiStorage.js` | `farm-scope.ts`, `ws-client.ts` | Ported |

### Overview

| Gap | Legacy pointer | NEW APP |
|-----|----------------|---------|
| Per-section count badges on image cards | `navigation.js` `updateLandingPageCounts` | Overview tiles + alert row |
| ADS / red tape / moisture alerts | Scattered in landing refresh | Wired in Overview alert row when mods active |
| Import mod images | Landing CTA | `OverviewSection.tsx` — lighter progress |
| Fleet preview deep link | — | Passes vehicle `id` — **not consumed** |

### Fields + field rules UX

| Gap | Legacy pointer | NEW APP |
|-----|----------------|---------|
| Cluster merge prefs | `fields.js` `getFieldClusterPrefForActiveServer` | **Hardcoded** in `FieldsSection.tsx` |
| Field parcel exclusions | Server-side `main.js` `filterFieldsByExclusions` | Works via API — OK |
| Rules engine suggestions | `fields.js` `buildSuggestion`, `rules-engine` | `FieldCard.tsx` / `field-helpers.ts` — ported |
| PF badges, moisture, forage, windrow | `fields.js` card builders | `FieldCard.tsx` — ported |
| Soil N / pH bars | `fields.js` `buildConditions` | `buildSoilBars` — ported |
| Optional organic skip | `fields.js` `skipOptionalOrganicStep` | Ported |
| Grid vs master–detail | `fields.js` `renderFields` col grid | Master–detail list |
| Rules cache refresh button | `fields.js` `refreshFieldRulesOnCards` | Missing UI |
| Fields tab polling | `fields.js` 45s `loadFieldsData` | Relies on WS payload updates |

### Vehicles + ADS + Vehicle Years

| Gap | Legacy pointer | NEW APP |
|-----|----------------|---------|
| ADS per-vehicle panel | `vehicleAds.js`, `vehicles.js` `buildVehicleYearsPanelHtml` | `AdsVehiclePanel.tsx` — **ported** |
| Vehicle Years per card | `vehicleYears.js` | `VehicleCard.tsx` `fd-vy-panel` — **ported** |
| ADS fleet summary cards | `vehicles.js` show section | `VehiclesSection.tsx` summary — **ported** |
| Shop/mod image matching | `vehicles.js` extensive matchers | `lib/vehicles.ts` — ported |
| Filters + summary chips | `vehicles.js` | `VehiclesSection.tsx` — ported |
| Table vs cards toggle | Legacy cards only | NEW APP adds table — **partial table** |
| Fleet Years fleet summary | `vehicleYears.js` | Missing section-level summary |
| Scroll performance guard | `vehicles.js` `bindVehiclesScrollPerf` | Missing |

### Fleet map

| Gap | Legacy pointer | NEW APP |
|-----|----------------|---------|
| Overview image fetch | `fleet-map.js` | `FleetMapSection.tsx` — ported |
| Zoom / fit / all farms | `fleet-map.js` `bindMapControls` | Toolbar buttons — ported |
| Marker icons by type | `fleet-map.js` `markerIconClass` | Text glyphs T/W/H — simpler |
| Pin click tooltip | `fleet-map.js` | `FleetMapSection.tsx` tooltip — ported |

### Economy + storage + moisture + red tape

| Gap | Legacy pointer | NEW APP |
|-----|----------------|---------|
| Finance summary | `economy.js` `updateFinancialSummary` | `EconomySection.tsx` — ported |
| Market by crop / location | `economy.js` `displayMarketPrices` | `MarketTab` — ported |
| Market base price modal | `economy.js` `showMarketBasePricesModal` | Missing |
| Purchases filter/sort | `economy.js` | `PurchasesTab` — ported |
| Storage enriched table + expand | `storage.js` | `StorageTab` — ported |
| Bale inventory + moisture env | `economy.js`, `moisture.js` | `StorageTab` — ported |
| Red Tape tab | `redTape.js` | `RedTapeTab` — ported |
| Commodity icons | `storage.js` `commodityIcon` | Missing |
| Consumables aggregation | `economy.js` | Ported in storage tab |

### Pastures

| Gap | Legacy pointer | NEW APP |
|-----|----------------|---------|
| Parse + warnings pipeline | `pastures.js` | `pastures-parsers.ts`, `PasturesSection.tsx` — ported |
| Warning detail modal | `pastures.js` `showWarningDetails` | Warning modal — largely ported |
| Low-health drilldown | `pastures.js` | Ported |
| Food/water duration hints | `pastures.js` | Ported |
| Pasture detail / livestock modals | `pastures.js` | Ported |
| Search + expand food/water | — | NEW APP adds search — OK |

### Productions

| Gap | Legacy pointer | NEW APP |
|-----|----------------|---------|
| Chain cards, fill tables, recipes | `productions.js` | `ProductionsSection.tsx` — ported |
| Empty / collector-off states | `productions.js` | Ported |
| Search | — | NEW APP adds search — OK |

### Livestock + genetics + pen detail

| Gap | Legacy pointer | NEW APP |
|-----|----------------|---------|
| Animals table + filters | `livestock.js` DataTables + sliders | TanStack table + numeric filters — different UX |
| Export CSV/XLSX/PDF/print | `livestock.js` | `livestock-export.ts` — ported |
| Animal details modal | `livestock.js` | `AnimalDetailsModal.tsx` — ported |
| Pen detail modal | `livestock.penDetail.js` | `PenDetailModal.tsx` — ported |
| Genetics per-animal in modal | `livestock.js` | Ported |
| Genetics overview tab | Legacy placeholder / table only | **NEW** `genetics-overview.ts` |
| Statistics chart | Unwired in legacy | Placeholder in NEW APP |
| Value breakdown | `livestock.js` | Ported |

### Settings + setup + SimHub

| Gap | Legacy pointer | NEW APP |
|-----|----------------|---------|
| 5 settings tabs | `dashboard-settings.js` | `SettingsModal.tsx` — ported |
| Section toggles, exclusions, clusters | `dashboard-settings.js` | Ported in settings — clusters not consumed by Fields |
| SimHub view prefs | `dashboard-settings.js` | Settings + `simhub/main.tsx` |
| SimHub render quality | `simhub-page.js` | Simplified cards for pastures/production |
| Setup page | `setup.html` | `src/setup/` — ported |
| Desktop updater status | `dashboard-settings.js` `renderDesktopAppUpdateStatus` | Basic check button in About |
| Per-section theme colors | `theming.js` | `settings/theming.ts` — applied on section change |
| `useNewUi` toggle | Settings | Ported |

---

## Files intentionally out of scope (legacy modules)

| Module | Reason |
|--------|--------|
| `parsers.js` | Logic distributed into `src/lib/*` |
| `apiStorage.js` | Replaced by `ws-client.ts` + `api-client.ts` + server `main.js` |
| `farm-dashboard-bg.js` | Replaced by `section-meta.ts` + `Shell.tsx` (different effect) |
| `navigation.js` hub routing | Replaced by sidebar router |

---

## Recommended QA matrix (sign-off)

Run with `FARMDASH_UI_V2=1` on the same saves used for legacy sign-off:

1. **Fields** — PF scanned/unscanned, cluster prefs from Settings, organic skip, forage/windrow badges, suggestion tools with fleet.
2. **Vehicles** — ADS overdue, Vehicle Years decades, shop images for mod vehicles, table vs cards.
3. **Economy** — storage expand rows, bale moisture rot, Red Tape farm with active schemes.
4. **Pastures** — birth warnings, food duration, low-health drilldown.
5. **Livestock** — RealisticLivestock genetics tab, pen detail refresh, export.
6. **Map** — DLC map missing image hints, all-farms toggle, fit-to-pins.
7. **MP** — farm switch, dedicated server farm inference, LAN viewer read-only.

See also: `PARITY.md`, `AGENTS.md`, `docs/_internal/AUDIT_v3.0.md`.
