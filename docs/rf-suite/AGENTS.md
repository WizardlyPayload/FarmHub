# Realistic Farming → Farm Dashboard — Agent coordination

> **Ownership banner:** Realistic Farming *suite* dashboard work stays in FarmHub; **Dash** owns FarmHub. Do not treat this kit as permission to edit Realistic-Farming suite repos or RF ledgers.

FarmHub product work for **V5** (NEW APP) plus optional Realistic Farming suite panels.  
API / handle source of truth: local workspace `C:\Users\Graham\Documents\Realistic-Farming` (do **not** re-clone).


## Dual-ledger rule (read this first)

| Kit | Location | Who writes | Purpose |
|-----|----------|------------|---------|
| **FarmHub RF suite kit** | `docs/rf-suite/` (this folder) | Farm Dashboard agents | Ownership, locked schemas, session history for **dashboard** builds |
| **RF ecosystem tracking** | `Realistic-Farming/ecosystem-dev-tracking/` | Wizard / Claude(A) / Claude(T) | Suite design among RF seats |

**Hard rule:** Do **not** append Farm Dashboard build chatter to `Realistic-Farming/ecosystem-dev-tracking/CLAUDE-LOG.md`. That ledger is read-only for dashboard agents unless you are coordinating a real RF-side API change (and even then, prefer Discord / an explicit RF seat ask).

Use this FarmHub kit only:

1. Read `AGENTS.md` → `LEDGER.md` → `MEMORY.md` → `SCHEMAS.md` → `HANDLES.md`
2. For APIs, read **local** Realistic-Farming source + `ecosystem-dev-tracking/ecosystem-map.md`
3. End of session: append `MEMORY.md`; update `LEDGER.md` rows

Also see repo root `docs/COMPATIBILITY.md` (V4 vs V5 product lines).

---

## Agent roster

| Agent | Owns (edit freely) | Must not touch |
|-------|--------------------|----------------|
| **Coordinator (0)** | Shared contracts below (frozen after Wave 0), Overview RF chip strip scaffolding, merge passthrough, collector **registry** | Section UI **bodies** / domain collector **logic** |
| **Land** | `collectors/rf/RfSoilFertilizerDataCollector.lua`, `RfCropStressDataCollector.lua`, Fields UI RF panels, `lib/realisticFarming/land/` | Economy / pastures / life tabs; frozen contracts without Ledger ACK |
| **Economy** | Tax / Market / Fuel / Workers / Income / Workplace collectors + Economy RF panels, `lib/realisticFarming/economy/` | Fields soil UI; frozen contracts |
| **Dairy** | `RfDairyDataCollector.lua`, Pastures dairy panel, `lib/realisticFarming/dairy/` | Fields / finance cores |
| **Life** | NPC Favor / RWE / Pro Staff collectors + section bodies under `sections/npcfavor|worldevents|prostaff`, `lib/realisticFarming/life/` | Shared types without Ledger ACK |
| **Depot** | `RfFertilizerDepotDataCollector.lua`, Storage depot panel, `lib/realisticFarming/depot/` | Unrelated economy panels |
| **Cores** | Weather Guard / Time Guard / presence collectors, top-bar enrichments, `lib/realisticFarming/cores/` | Deep companion admin UIs |
| **Release** | Versioning, packaging, `COMPATIBILITY.md` updates, About, i18n sync/fill/build batches, SP/MP QA | Feature collectors |

**IA:** put RF data where players already look (Fields / Economy / Pastures / Storage). New mod tabs only for NPC Favor, World Events, Pro Staff.

---

## Frozen vs domain-owned (after Wave 0 Coordinator)

### Coordinator-owned / FROZEN (propose changes on LEDGER → Coordinator ACK)

| Path | Why frozen |
|------|------------|
| `docs/rf-suite/SCHEMAS.md` | Locked export contract |
| `docs/rf-suite/HANDLES.md` | Verified handle map |
| `docs/rf-suite/AGENTS.md` | Ownership map |
| `docs/COMPATIBILITY.md` | Product-line matrix (Release may update version pins after ACK) |
| `NEW APP/src/types/dashboard.ts` (`realisticFarming*`, `SectionId` RF ids, field enrichment types) | Shared payload contract |
| `NEW APP/src/lib/modPresence.ts` | RF detection + mod-gated section ids |
| `NEW APP/src/app/section-meta.ts` | Nav meta for RF sections |
| `NEW APP/src/sections/SectionRouter.tsx` | Route wiring only (bodies live elsewhere) |
| `NEW APP/src/lib/realisticFarming/index.ts` | Public barrel |
| `FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua` | Collector **registry**, module toggles, assemble nesting of `realisticFarming` |
| `FS25_FarmDashboard_Mod/modDesc.xml` | `sourceFile` list for RF stubs |
| `FS25_FarmDashboard_App/dataMerger.js` | `realisticFarming` passthrough |
| `FS25_FarmDashboard_App/mergedSnapshotHold.js` | Hold rules for `realisticFarming` |
| V5 build scripts / `electron-builder.rf.yml` | Must never publish to V4 `latest.yml` |

### Domain-owned (fill these; do not edit another agent's paths)

| Agent | Paths |
|-------|--------|
| **Land** | `FS25_FarmDashboard_Mod/src/collectors/rf/RfSoilFertilizerDataCollector.lua`, `RfCropStressDataCollector.lua`; `NEW APP/src/lib/realisticFarming/land/**`; Fields section RF panels under `NEW APP/src/sections/fields/` (RF-only files you add) |
| **Economy** | `RfTaxDataCollector.lua`, `RfMarketDynamicsDataCollector.lua`, `RfFuelCostsDataCollector.lua`, `RfWorkerCostsDataCollector.lua`, `RfIncomeDataCollector.lua`, `RfWorkplaceTriggersDataCollector.lua`; `NEW APP/src/lib/realisticFarming/economy/**`; Economy RF panels you add |
| **Dairy** | `RfDairyDataCollector.lua`; `NEW APP/src/lib/realisticFarming/dairy/**`; Pastures dairy panel files you add |
| **Life** | `RfNpcFavorDataCollector.lua`, `RfWorldEventsDataCollector.lua`, `RfProStaffDataCollector.lua`; `NEW APP/src/lib/realisticFarming/life/**`; `NEW APP/src/sections/npcfavor/**`, `worldevents/**`, `prostaff/**` |
| **Depot** | `RfFertilizerDepotDataCollector.lua`; `NEW APP/src/lib/realisticFarming/depot/**`; Storage depot panel files you add |
| **Cores** | `RfWeatherGuardDataCollector.lua`, `RfTimeGuardDataCollector.lua`, `RfPresenceDataCollector.lua`; `NEW APP/src/lib/realisticFarming/cores/**` |

### Shared rules

1. Soft-detect + `pcall`; aggregates only; authority-only export; **never write** RF mod state.
2. NEW APP only — do not touch classic `FS25_FarmDashboard_App/web/` UI modules.
3. Zero Precision Farming compatibility: SF and PF are mutually exclusive soil sources.
4. Soil Fertilizer **organic matter is 0–10**, never a percentage.
5. Propose new top-level JSON keys on the Ledger before inventing them.
6. English i18n keys in `FS25_FarmDashboard_App/web/locales/messages/en.json` only — **Release** runs sync/fill/build.
7. Do not commit/push unless Wizard explicitly asks.
