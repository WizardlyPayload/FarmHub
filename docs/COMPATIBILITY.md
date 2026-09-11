# Farm Dashboard compatibility — classic app vs new rebuild

**Same product, two Windows installers: V4 and V5.** The new screens are a **rebuild** of Farm Dashboard, not a different game and not Realistic Farming / Farm Tablet.

People who want the **classic screens** keep **Farm Dashboard V4** (4.x). **Farm Dashboard V5** is a **separate download**. It is **not** pushed over V4 via auto-update (`latest.yml`). The **same** `FS25_FarmDashboard.zip` in-game mod works with both apps.

| Line | Who | UI | Auto-update feed | RF suite panels |
|------|-----|----|------------------|-----------------|
| **V4** (classic 4.x) | Existing users who want the old screens | Classic `web/` | **`latest.yml` only** | Not the focus |
| **V5** (rebuild 5.x) | Testers / anyone who installs the V5 EXE | NEW APP default | **`latest-rf.yml` only** — never V4 `latest.yml` | Soft-detect; hidden if those mods are absent |

Do **not** call V5 “RF edition” in product-facing names. The update file is still named `latest-rf.yml` so already-installed 5.0.x apps keep updating.

## Hard rule (enforced in build tooling)

> V4 auto-update clients poll **`latest.yml`**.  
> A V5 installer must **never** be published as the asset that V4 `latest.yml` points at.

Enforcement:

- Default `npm run build:app` / `build:all` = **V4** channel (`latest.yml`).
- V5 builds use `npm run build:app:v5` / `build:all:v5` (`build:app:rf` is an alias) with `electron-builder.rf.yml` (`publish.channel: latest-rf` → `latest-rf.yml`, distinct `appId` / artifact name so both apps can stay installed).
- V5 zip + Setup.exe go **flat** in `%USERPROFILE%\Documents\FarmDash Release\` (not a nested `V5\` folder). V4 public `latest.yml` stays in `Documents\FarmDash Final Output`.
- After every V5 dist, `tools/app/assert-rf-update-channel.mjs` **fails the build** if `latest.yml` points at a V5 Setup, if a stray `rf.yml` is left, or if a V5 Setup.exe is present without `latest-rf.yml`.
- Release checklist: never upload the V5 Setup.exe into a GitHub Release that updates V4 `latest.yml`.

Plain language: **Keep using V4 if you want. Install V5 only if you opt in. Auto-update on V4 will not replace it. One Farming Simulator mod works with both.**

Tester checklist: [`TESTERS.md`](./TESTERS.md).

## Version identity (shipped)

**Classic public hotfix 4.2.1 / mod 3.4.0.7 (2026-07-28)** — FS 1.21 `copyFile` Bool fix for classic GitHub/itch.  
**V5 5.0.0 cut (2026-07-26)** (then labelled “RF edition” on disk); local V5 mod zip may be **5.0.0.2** (hall depot stock + Realistic Farming collectors).  
**V5 5.0.2 tester drop (2026-09-08)** — matching zip + Setup in `Documents/FarmDash Release`; not pushed onto V4 `latest.yml`.  
**V5 5.0.3 (2026-09-10)** — current-tree rebuild; GitHub Latest. Replaces the 8 September 5.0.2 upload.

V4 and V5 share `FS25_FarmDashboard_App/package.json` (`version: 4.2.2` in tree). The V5 build never
edits that field: `electron-builder.rf.yml` sets `extraMetadata.version: 5.0.3`, which
electron-builder merges into the packaged metadata only for V5. Result: the V5
Setup filename, `latest-rf.yml`, and `app.getVersion()` (About) report **5.x**, while the V4
`build:app` / `build:all` line keeps reporting **4.x**.

V4 mod zips are stamped at pack time with `npm run package:mod:classic`
(`-VersionOverride 3.4.0.8`) so the working-tree `modDesc` can remain on the V5 line (**5.0.0.3**)
for GPortal / local dedicated without confusing V4 players into installing a 5.x mod stamp.

| Artifact | V4 track | V5 track |
|----------|----------|----------|
| Desktop app version source | `package.json` 4.2.2 (V4 builds) | 5.0.3 via `electron-builder.rf.yml` `extraMetadata.version` (package.json untouched) |
| Installer filename | `FS25-Farm-Dashboard-Setup-4.2.2.exe` | `FS25-Farm-Dashboard-V5-Setup-5.0.3.exe` (older local 5.0.x used `…-RF-Setup-…`) |
| Update YAML | `latest.yml` | `latest-rf.yml` only (reports 5.x) |
| FarmDashboard mod zip | **3.4.0.8** via `package:mod:classic` | Working tree / `package:mod` → **5.0.0.3** (suite collectors; inert without those mods) |
| In-app About | App + mod versions | App 5.x + mod 5.0.0.x + detected Realistic Farming mods, tested pins, ✓ / “newer than tested” |

### App ↔ mod version matrix

| Line | App version | FarmDashboard mod | Update feed |
|------|-------------|-------------------|-------------|
| **V4 (public classic)** | **4.2.1** | **3.4.0.7** | `latest.yml` |
| **V5** | **5.0.3** | **5.0.0.3** | `latest-rf.yml` |

In-app About copy must not imply the dashboard *is* Realistic Farming or Farm Tablet.  
Wording: Farm Dashboard is an out-of-game companion. This installer is **V5** (new screens); it is not pushed over **V4**. One in-game mod works with both. Realistic Farming suite panels are optional.

## RF companion mods — pinned / tested (2026-09-07)

Local Realistic-Farming clones. Collectors still soft-detect; newer than tested shows “untested” in About, not a hard fail. Handle names and collector APIs were re-checked the same day — no mission-handle or read-API break.

| Mod | Local `modDesc` / tested | Dashboard surface |
|-----|--------------------------|-------------------|
| FS25_SoilFertilizer | 2.5.0.126 | Fields soil (OM **0–10**) |
| FS25_SeasonalCropStress | 1.2.5.142 | Fields moisture / stress |
| FS25_FertilizerDepot | 1.0.4.33 | Storage / depot |
| FS25_TaxMod | 1.1.6.31 | Economy tax |
| FS25_MarketDynamics | 1.3.1.34 | Economy market |
| FS25_FuelCosts | 1.0.0.1 | Economy / fuel |
| FS25_WorkerCosts | 2.2.3.76 | Economy labor |
| FS25_IncomeMod | 2.1.8.31 | Economy income |
| FS25_WorkplaceTriggers | 1.1.2.0 | Economy workplaces |
| FS25_DairyCore | 1.0.5.39 | Pastures dairy |
| FS25_NPCFavor | 1.2.7.101 | NPC Favor tab |
| FS25_RandomWorldEvents | 2.2.0.1 | World Events tab + Overview |
| FS25_ProStaffCoOp | 1.0.0.25 | Pro Staff tab |
| FS25_WeatherGuard | 1.0.0.0 | Weather modal enrichment |
| FS25_TimeGuard | 1.0.1.0 | Time / calendar badge |
| FS25_FarmTablet | 2.6.0.11 | Presence only |
| FS25_StateLedger | 1.0.1.0 | Presence |
| FS25_NetworkSync | **2.0.1.0** | Presence |
| FS25_SettingsHub | 1.0.1.0 | Presence |
| FS25_MasterHUD | 1.0.1.1 | Presence |
| FS25_RFSoilScanner | 1.0.0.4 | Presence (new companion) |

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
| Fertilizer Depot | Building is a Giants production hall. Dumping fill writes hall bins (`ProductionPoint:getFillLevel` / `getCapacity`), not the 50k walk-in shop book (`getStorageInfo`). | Collector prefers hall bins; shop book only if the production point is missing. |
| NPC Favor | Relationships are shared, not true per-farm | Relationships mirrored per farm; active favors filtered by owner farm when available |
| Random World Events | No history API in mod source | Only active event + cooldown exported; history unused |
| Network Sync | Local pin is **2.0.1.0** | Presence reads live `modDesc` version |

## Release notes template (rebuild / side-by-side)

- Explicit: “Does not update classic 4.x clients via `latest.yml`”
- Same `FS25_FarmDashboard` mod works with classic app and this rebuild
- RF mods newly supported / updated (optional)
- Any RF version that changed a handle the collector depends on
- Call out any new rows in the API gaps table

Classic release notes must **not** claim RF suite features or tell classic users they were upgraded to the new screens.
