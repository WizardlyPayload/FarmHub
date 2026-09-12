# Verified RF mission handles (local workspace)

Source root: `C:\Users\Graham\Documents\Realistic-Farming`  
Cross-checked 2026-07-26 against `ecosystem-dev-tracking/ecosystem-map.md` and each mod’s Lua. **depotManager re-verified 2026-09-01** on FertilizerDepot 1.0.4.1 (`mission.depotManager` now published). **All collector handles + read APIs re-verified 2026-09-07** against current clones — no handle renamed or removed; getter names FarmHub calls still exist. Version numbers in this table are handle-era pins; About/tested pins live in `docs/COMPATIBILITY.md`.

**Read contract (all collectors):** resolve `g_currentMission.<handle>`, then `getfenv(0)["g_<Fallback>"]` when listed; wrap every call in `pcall`; never write RF state; authority-only export.

| Handle on `g_currentMission` | Mod | Fallback | Local verification | Notes |
|------------------------------|-----|----------|--------------------|-------|
| `soilFertilityManager` | FS25_SoilFertilizer 2.4.7.0 | `g_SoilFertilityManager` | **Verified** — `main.lua` sets `mission.soilFertilityManager = sfm` | API: `mgr.soilSystem:getFieldInfo(fieldId [, x, z])` — field average when no x,z. **OM 0–10.** |
| `fieldSentry` | FS25_SoilFertilizer (bridge) | — | **Verified** — `FieldSentry.lua` sets `mission.fieldSentry = {…}` | Optional; presence / sim-disabled flags also appear on `getFieldInfo` |
| `cropStressManager` | FS25_SeasonalCropStress 1.2.3.4 | `g_cropStressManager` | **Verified** — manager published; cleanup nils handle | Facade: `getMoisture`, `getStress`, irrigation + critical-alert getters |
| `incomeManager` | FS25_IncomeMod 2.1.6.1 | — | **Verified** | |
| `taxManager` | FS25_TaxMod 1.1.5.0 | — | **Verified** | |
| `workerCostsManager` | FS25_WorkerCosts 2.2.2.2 | — | **Verified** | |
| `npcFavorSystem` | FS25_NPCFavor 1.2.7.1 | `g_NPCSystem` | **Verified** — `mission.npcFavorSystem = npcSystem` | |
| `MarketDynamics` | FS25_MarketDynamics 1.2.0.9 | `g_MarketDynamics` | **Verified** — **capital M** | |
| `randomWorldEvents` | FS25_RandomWorldEvents 2.1.7.1 | `g_RandomWorldEvents` | **Verified** | |
| `depotManager` | FS25_FertilizerDepot 1.0.4.33 | `g_DepotManager` | **Verified** — `main.lua` sets `g_currentMission.depotManager = g_DepotManager` | Placeable is a production hall. Stock export uses `spec_productionPoint.productionPoint:getFillLevel` / `getCapacity` (same as Esc). `getStorageInfo` is the walk-in 50k book only. |
| `workplaceTriggers` | FS25_WorkplaceTriggers 1.1.1.1 | `g_WorkplaceSystem` | **Verified** — `mission.workplaceTriggers = workplaceSystem` | |
| `fuelCostsManager` | FS25_FuelCosts 1.0.0.1 | `g_FuelCostsManager` | **Verified** | |
| `dairyCoreManager` | FS25_DairyCore 1.0.0.0 | `g_dairyCoreManager` | **Verified** | |
| `proStaffManager` | FS25_ProStaffCoOp 1.0.0.0 | — | **Verified** | |
| `weatherGuard` | FS25_WeatherGuard 1.0.0.0 | — | **Verified** | `getCurrentSky()`, forecast getters, `getContext()` |
| `timeGuard` | FS25_TimeGuard 1.0.0.0 | — | **Verified** | `getContext()` — calendar only, never money |
| `stateLedger` | FS25_StateLedger 1.0.0.0 | `g_stateLedger` | **Verified** | Presence / cores only |
| `networkSync` | FS25_NetworkSync **2.0.0.0** | `g_networkSync` | **Verified** | Presence only (local pin is 2.0.0.0, not 1.0.0.0) |
| `settingsHub` | FS25_SettingsHub 1.0.0.0 | — | **Verified** | Presence only — no admin UI in dashboard |
| `masterHUD` | FS25_MasterHUD 1.0.0.0 | — | **Verified** | Presence only |

## FarmTablet checklist (field coverage)

Prefer main `FS25_FarmTablet` apps (not the dairy variant) when choosing what to surface:

| Domain | FarmTablet apps / drawers |
|--------|---------------------------|
| Land | `SoilNutrientApp`, `SoilFertilizerApp` (FieldSentry), crop-stress drawer in `IncomeApp`, `IrrigationSuiteApp`, `RotationPlannerApp` |
| Economy | `TaxApp` (via IncomeApp bundle), `IncomeApp`, `MarketDynamicsApp`, `WorkerCostsApp`, `PersonnelApp`, `FinancialCockpitApp` |
| Dairy | DairyCore handle + FarmTablet-dairy docs if needed |
| Life | NPC Favor drawer, `RandomWorldEventsApp`, ProStaff via cockpit / personnel |
| Depot | Storage / depot UI in FertilizerDepot (no dedicated FarmTablet app required) |
| Cores | `WeatherApp` (WeatherGuard), TimeGuard via FinancialCockpit |

## House rules that affect handle use

- **Zero PF compatibility** — if Precision Farming wins, do not merge SF soil onto fields.
- Aggregates only — call `getFieldInfo(fieldId)` without dumping value-map cells.
- Soft-detect via `g_modIsLoaded` / mission handle; payload `{ enabled: false }` when absent.
