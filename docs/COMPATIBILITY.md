# Farm Dashboard compatibility — Classic 4.x vs Realistic Farming edition 5.x

**These are two product lines, not an in-place upgrade.**

| Line | Who | UI | Auto-update feed | RF suite panels |
|------|-----|----|------------------|-----------------|
| **Classic 4.x** | Existing users, website demo, classic preference | Classic `web/` | **`latest.yml` only** | Not the focus |
| **RF / NEW APP 5.x** | RF players / testers (fresh install) | NEW APP default | **`latest-rf.yml` only** — never classic `latest.yml` | Soft-detect full suite |

## Hard rule (enforced in build tooling)

> Classic auto-update clients poll **`latest.yml`**.  
> An RF / NEW-APP installer must **never** be published as the asset that classic `latest.yml` points at.

Enforcement:

- Default `npm run build:app` / `build:all` = **classic** channel (`latest.yml`).
- RF builds use `npm run build:app:rf` / `build:all:rf` with `electron-builder.rf.yml` (`publish.channel: latest-rf` → `latest-rf.yml`, distinct `appId` / artifact name).
- Output goes to `%USERPROFILE%\Documents\FarmDash Final Output\RF-edition\` (classic stays in the parent Final Output folder).
- After every RF dist, `tools/app/assert-rf-update-channel.mjs` **fails the build** if classic `latest.yml` appears, if a stray `rf.yml` is left without `latest-rf.yml`, or if an RF Setup.exe is present without `latest-rf.yml`.
- Release checklist: never upload an RF Setup.exe into a GitHub Release that updates classic `latest.yml`.

Plain language: **Classic and RF edition are different downloads. Auto-update on classic will not install the RF edition.** For RF support you need the 5.x app + matching RF-edition mod zip; RF companion mods are optional and auto-detected.

## Version identity (shipped)

**Classic public hotfix 4.2.1 / mod 3.4.0.7 (2026-07-28)** — FS 1.21 `copyFile` Bool fix for classic GitHub/itch.  
**RF edition 5.0.0 cut (2026-07-26)**; local RF mod zip may be **5.0.0.1** (same copyFile fix + RF collectors).

Classic and RF share `FS25_FarmDashboard_App/package.json` (`version: 4.2.1`). The RF build never
edits that field: `electron-builder.rf.yml` sets `extraMetadata.version: 5.0.0`, which
electron-builder merges into the packaged metadata only for the RF product line. Result: the RF
Setup filename, `latest-rf.yml`, and `app.getVersion()` (About) report **5.0.0**, while the classic
`build:app` / `build:all` line keeps reporting **4.2.1**.

Classic mod zips are stamped at pack time with `npm run package:mod:classic`
(`-VersionOverride 3.4.0.7`) so the working-tree `modDesc` can remain on the RF line (**5.0.0.1**)
for GPortal / local dedicated without confusing classic players into installing “RF 5.0”.

| Artifact | Classic track | RF edition track |
|----------|---------------|------------------|
| Desktop app version source | `package.json` 4.2.1 (classic builds) | 5.0.0 via `electron-builder.rf.yml` `extraMetadata.version` (package.json untouched) |
| Installer filename | `FS25-Farm-Dashboard-Setup-4.2.1.exe` | `FS25-Farm-Dashboard-RF-Setup-5.0.0.exe` |
| Update YAML | `latest.yml` | `latest-rf.yml` only (reports 5.0.0) |
| FarmDashboard mod zip | **3.4.0.7** via `package:mod:classic` | Working tree / `package:mod` → **5.0.0.1** (RF collectors; inert without RF mods) |
| In-app About | App + mod versions | App 5.0.0 + mod 5.0.0.x + detected RF mods, tested pins, ✓ / “newer than tested” |

### App ↔ mod version matrix

| Line | App version | FarmDashboard mod | Update feed |
|------|-------------|-------------------|-------------|
| **Classic 4.x (public)** | **4.2.1** | **3.4.0.7** | `latest.yml` |
| **RF edition** | **5.0.0** | **5.0.0.1** (local / GPortal) | `latest-rf.yml` |

In-app About copy must not imply the dashboard *is* Realistic Farming or Farm Tablet.  
Wording: “Farm Dashboard — Realistic Farming edition (out-of-game companion; works alongside the RF suite and Farm Tablet).”

## RF companion mods — pinned / tested (2026-07-26)

| Mod | Local `modDesc` / tested | Dashboard surface |
|-----|--------------------------|-------------------|
| FS25_SoilFertilizer | 2.4.7.0 | Fields soil (OM **0–10**) |
| FS25_SeasonalCropStress | 1.2.3.4 | Fields moisture / stress |
| FS25_FertilizerDepot | 1.0.3.1 | Storage / depot |
| FS25_TaxMod | 1.1.5.0 | Economy tax |
| FS25_MarketDynamics | 1.2.0.9 | Economy market |
| FS25_FuelCosts | 1.0.0.1 | Economy / fuel |
| FS25_WorkerCosts | 2.2.2.2 | Economy labor |
| FS25_IncomeMod | 2.1.6.1 | Economy income |
| FS25_WorkplaceTriggers | 1.1.1.1 | Economy workplaces |
| FS25_DairyCore | 1.0.0.0 | Pastures dairy |
| FS25_NPCFavor | 1.2.7.1 | NPC Favor tab |
| FS25_RandomWorldEvents | 2.1.7.1 | World Events tab + Overview |
| FS25_ProStaffCoOp | 1.0.0.0 | Pro Staff tab |
| FS25_WeatherGuard | 1.0.0.0 | Weather modal enrichment |
| FS25_TimeGuard | 1.0.0.0 | Time / calendar badge |
| FS25_FarmTablet | 2.5.3.0 | Presence only |
| FS25_StateLedger | 1.0.0.0 | Presence |
| FS25_NetworkSync | **2.0.0.0** | Presence (not 1.0.0.0) |
| FS25_SettingsHub | 1.0.0.0 | Presence |
| FS25_MasterHUD | 1.0.0.0 | Presence |

Soft-detect: missing companions hide their panels/tabs. Zero RF mods ⇒ classic NEW APP experience (no empty RF panels, no orphan chips).

## Documented API gaps (build-time findings)

| Area | Gap | Dashboard behaviour |
|------|-----|---------------------|
| Seasonal Crop Stress | Moisture outlook is approximate (`weatherIntegration:getMoistureForecast`) | Exported as `moistureOutlook` (≤5 days); UI labels it approximate |
| Soil Fertilizer | Treatment *rates* need `SoilConstants` (FERTILIZER_PROFILES / SPRAYER_RATE) visible to the collector | `treatmentPlan` always exported (FarmTablet / SoilTreatmentDialog rules); `hasRates=true` when constants resolve — otherwise product action text without kg/ha totals |
| Tax Mod | Global stats, not true per-farm | Collector mirrors the same row into each `byFarm[farmId]` |
| Income Mod | Global stats, not true per-farm | Same mirror pattern as Tax |
| Worker Costs | Roster / wage state shared across farms | Same shared row mirrored per farmId |
| Fuel Costs | API `getTrend()` returns `stable` | Mapped to schema enum `flat` |
| Fertilizer Depot | No `g_currentMission.depotManager` in local clone | Collector uses `getfenv(0).g_DepotManager`; `mission.depotManager` only as forward-compat |
| NPC Favor | Relationships are shared, not true per-farm | Relationships mirrored per farm; active favors filtered by owner farm when available |
| Random World Events | No history API in mod source | Only active event + cooldown exported; history unused |
| Network Sync | Local pin is **2.0.0.0** | Presence reads live `modDesc` version |

## Release notes template (RF edition)

- RF mods newly supported / updated
- Any RF version that changed a handle the collector depends on
- Explicit: “Does not update classic 4.x clients via `latest.yml`”
- Call out any new rows in the API gaps table

Classic release notes must **not** claim RF suite features.
