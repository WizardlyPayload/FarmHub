# Locked RF export schemas (FarmHub)

Authority-only Lua → `data.json` → Electron merge → NEW APP.  
Propose schema changes on `LEDGER.md` before adding keys. Soft-detect: every domain object includes `enabled: boolean`.

## Top-level shape

```ts
// data.json / DashboardPayload
{
  fields: FieldRow[],           // existing + optional enrichment below
  realisticFarming: RealisticFarmingPayload
}
```

`realisticFarming` is assembled from RF collector module-cache slots (`rfTax`, `rfMarketDynamics`, …).  
Field enrichment keys are merged onto each `fields[]` row from `rfSoilFertilizer` / `rfCropStress` caches (Coordinator assemble helper).

---

## `fields[]` enrichment (Agent Land)

### `field.soilFertilizer` (Soil Fertilizer)

From `soilSystem:getFieldInfo(fieldId)` aggregates only (no x,z cell dump). **OM is 0–10.**

| Key | Type | Notes |
|-----|------|-------|
| `enabled` | boolean | Mod present + manager ready |
| `nitrogen` | `{ value: number, status: string }` | |
| `phosphorus` | `{ value: number, status: string }` | |
| `potassium` | `{ value: number, status: string }` | |
| `pH` | number | |
| `organicMatter` | number | **0–10 scalar, never %** |
| `weedPressure` | number | |
| `pestPressure` | number | |
| `diseasePressure` | number \| null | raw; prefer UI on `shownDiseasePressure` |
| `shownDiseasePressure` | number \| null | nil = unscouted |
| `activeDisease` | string \| null | |
| `diseaseDiscovered` | boolean | |
| `lastCrop` / `lastCrop2` / `lastCrop3` | string \| null | |
| `rotationStatus` | string \| number \| null | as returned by SF |
| `rotationBonusDaysLeft` | number | |
| `yieldEfficiency` | number \| null | percent forecast when managed crop |
| `needsFertilization` | boolean | |
| `urgency` | number | 0–100 from `getFieldUrgency` when available |
| `herbicideActive` / `insecticideActive` / `fungicideActive` | boolean | |
| `compaction` | number | |
| `simDisabled` | boolean | FieldSentry |
| `simDisabledReason` | string \| null | |
| `isMeadow` | boolean | |
| `pfConflict` | boolean | true when PF loaded and SF stood down |
| `fieldArea` | number \| null | ha from `getFieldInfo` |
| `cropTargets` | `{ N?: { opt?: number }, P?: { opt?: number }, K?: { opt?: number } } \| null` | crop-specific nutrient targets |
| `targetDefaults` | `{ nitrogen?: number, phosphorus?: number, potassium?: number, pH?: number, organicMatter?: number } \| null` | fair/optimal fallbacks used when cropTargets absent |
| `growthFraction` | number \| null | live crop growth 0–1 when SF can probe FieldState |
| `coverageFraction` | number \| null | spray coverage aggregate |
| `sessionCoverageFraction` | number \| null | current treatment pass coverage |
| `sessionLastProduct` | string \| null | last product in session |
| `amendBurnRisk` | boolean | liming/manuring now would scorch crop |
| `burnDaysLeft` | number | residual burn days |
| `daysSinceHarvest` | number \| null | |
| `treatmentPlan` | `RfTreatmentStep[]` | FarmTablet Soil / SoilTreatmentDialog prescriptions (rates when SoilConstants available) |
| `ppm` | `RfSoilPpm \| null` | soil-test display values, matching FarmTablet's Soil app |

`RfTreatmentStep`: `{ key: string, label: string, text: string, priority: "urgent" \| "watch" \| "ok" \| "info", hasRates?: boolean }`  
Only actionable / informational rows (and a single `clear` row when all OK). Cap ≤12.

`RfSoilPpm`: `{ n?: number, p?: number, k?: number, nTarget?: number, pTarget?: number, kTarget?: number }`  
Internal nutrient units scaled by `SoilConstants.PPM_DISPLAY` (fallback N 3.0 / P 0.6 / K 4.0 when SoilConstants is unavailable). The UI re-scales with the same fallback when a payload predates this block.

Collector cache shape: `{ enabled, pfConflict?, byField: { [fieldId]: <row without enabled> } }`.

### `field.cropStress` (Seasonal Crop Stress)

| Key | Type | Notes |
|-----|------|-------|
| `enabled` | boolean | |
| `moisturePercent` | number \| null | 0–100 |
| `stressPercent` | number \| null | drought stress |
| `critical` | boolean | moisture at/below critical threshold |
| `irrigationActive` | boolean \| null | |
| `moistureOutlook` | `{ dayOffset: number, moisturePercent: number }[]` | capped ≤5; from `weatherIntegration:getMoistureForecast` when present (approximate) |
| `difficulty` | string \| null | settings |
| `alertHint` | string \| null | `getCriticalAlertHint` when present |

Collector cache: `{ enabled, byField: { [fieldId]: … }, alertHint? }`.

---

## `realisticFarming` object (one section per domain)

Shared envelope:

```ts
type RfModSection<T> = { enabled: boolean } & T;
```

### Land (presence only under RF object — detail is on fields)

```ts
soilFertilizer: {
  enabled: boolean
  pfConflict?: boolean
  fieldCount?: number
  // stand-down diagnostics, present only while enabled is false
  reason?: "pf-conflict" | "mod-absent" | "manager-missing" | "system-missing"
         | "api-missing" | "settings-disabled" | "not-initialized" | "not-authority"
  modLoaded?: boolean
  managerPresent?: boolean
  systemPresent?: boolean
  settingsEnabled?: boolean
}
cropStress: { enabled: boolean, fieldCount?: number, alertHint?: string | null }
```

The Fields section surfaces `reason` as a one-line "Soil Fertilizer is installed but not reporting" note, so a stood-down mod is visible instead of silently falling back to vanilla bars.

**Engine-global lookup rule (both land collectors):** read engine globals as `_G.g_currentMission`, never `rawget(_G, "g_currentMission")`. In the FS25 mod sandbox `_G` is the mod's own environment table and engine globals resolve through its `__index` chain, so `rawget` returns nil and the manager never resolves.

### Economy — `tax`

| Key | Type |
|-----|------|
| `enabled` | boolean |
| `byFarm` | `{ [farmId]: { accumulatedAnnual?: number, projectedBill?: number, taxRate?: number, nextEventLabel?: string \| null, nextEventDay?: number \| null } }` |

### Economy — `marketDynamics`

| Key | Type |
|-----|------|
| `enabled` | boolean |
| `isActive` | boolean |
| `pricesEnabled` / `eventsEnabled` | boolean |
| `eventFrequency` | number \| null |
| `volatilityScale` | number \| null |
| `activeEvents` | `{ id: string, name: string, intensity: number, endsAt?: number, remainingMin?: number }[]` | capped |
| `movers` | `{ fillType: string, pricePer1000l: number, pctFromBase: number }[]` | capped ≤12 |
| `futures` | `{ id: string, label: string, status?: string, summary?: string }[]` | capped; empty if API absent |

### Economy — `fuelCosts`

| Key | Type |
|-----|------|
| `enabled` | boolean |
| `dieselPrice` | number \| null |
| `trend` | `"up" \| "down" \| "flat" \| null` |
| `lastChangePct` | number \| null |

### Economy — `workerCosts`

| Key | Type |
|-----|------|
| `enabled` | boolean |
| `byFarm` | `{ [farmId]: { activeWorkers?: number, wageMode?: string \| null, wageRate?: number \| null, nextPaymentLabel?: string \| null, periodSpend?: number \| null } }` |

### Economy — `income`

| Key | Type |
|-----|------|
| `enabled` | boolean |
| `byFarm` | `{ [farmId]: { mode?: string \| null, amount?: number \| null, nextPayoutLabel?: string \| null, settingsEnabled?: boolean } }` |

### Economy — `workplaceTriggers`

| Key | Type |
|-----|------|
| `enabled` | boolean |
| `byFarm` | `{ [farmId]: { workplaces: { id: string, name?: string, onClock?: boolean, wage?: number \| null }[] } }` | workplaces capped |

### Dairy — `dairy`

| Key | Type |
|-----|------|
| `enabled` | boolean |
| `byFarm` | `{ [farmId]: { barns: DairyBarnRow[] } }` |

`DairyBarnRow`: `barnId`, `herdHealthScore?`, `milkQualityTier?`, `spoilageStatus?`, `lastCollectionDay?`, `feedDiseaseFlag?`, `contractSummary?` (string \| null). Cap barns.

### Life — `npcFavor`

| Key | Type |
|-----|------|
| `enabled` | boolean |
| `byFarm` | `{ [farmId]: { relationships: { npcId: string, name?: string, value?: number }[], activeFavors: { id?: string, type?: string, npcId?: string, summary?: string }[] } }` | lists capped |

### Life — `worldEvents`

| Key | Type |
|-----|------|
| `enabled` | boolean |
| `frequency` / `intensity` | number \| null |
| `eventTypeCount` | number \| null |
| `active` | `{ id: string, name: string, category?: string, remainingMin?: number, durationMin?: number } \| null` |
| `cooldownReady` | boolean \| null |

### Life — `proStaff`

| Key | Type |
|-----|------|
| `enabled` | boolean |
| `byFarm` | `{ [farmId]: { level: number, membershipActive?: boolean, investmentTotal?: number, discounts?: { id: string, label: string, value?: number }[], flags?: string[] } }` |

### Depot — `fertilizerDepot`

| Key | Type |
|-----|------|
| `enabled` | boolean |
| `seasonalPriceHint` | string \| null | optional season + buy multiplier |
| `settings` | `{ storageCapacity?: number, seasonalPricing?: boolean, stockSource?: "hall" \| "shopBook" }` | hall = production-point bins (1.0.4.33 building); shopBook = walk-in 50k ledger |
| `depots` | `{ id: string, name?: string, farmId?: number \| null, levels: { fillType: string, liters: number, capacity?: number }[], seasonalPriceHint?: string \| null }[]` | capped |
| `openOrders` | `{ id: string, summary: string, status?: string }[]` | capped |

### Cores — `weatherGuard`

| Key | Type |
|-----|------|
| `enabled` | boolean |
| `sky` | `{ rainScale?, isRaining?, cloudCoverage?, temperature?, humidity?, weatherType? } \| null` |
| `forecast` | `{ dayOffset, rain?, temperature?, minTemperature?, maxTemperature?, humidity?, weatherType? }[]` | capped ≤10 (today + 9). Daily high/low from engine `getDailyForecast` when Weather Guard hourly temp is nil. |
| `horizonDays` | number \| null |

### Cores — `timeGuard`

| Key | Type |
|-----|------|
| `enabled` | boolean |
| `period` / `year` / `monthCounter` / `monotonicDay` / `dayInPeriod` / `daysPerPeriod` | number \| null |
| `normalizationFactor` | number \| null |
| `synced` | boolean \| null |

### Cores — `presence`

| Key | Type |
|-----|------|
| `enabled` | boolean | true if any RF mod detected |
| `mods` | `{ id: string, title: string, version?: string \| null, handle?: string \| null, detected: boolean }[]` |

Include Farm Tablet + core services as presence-only rows when loaded.

---

## Module-cache → assemble map (Coordinator frozen)

| Collector registry name | Config flag | `realisticFarming` key / fields |
|-------------------------|-------------|-------------------------------|
| `rfSoilFertilizer` | `enableRfSoilFertilizer` | fields[].soilFertilizer + `realisticFarming.soilFertilizer` |
| `rfCropStress` | `enableRfCropStress` | fields[].cropStress + `realisticFarming.cropStress` |
| `rfTax` | `enableRfTax` | `tax` |
| `rfMarketDynamics` | `enableRfMarketDynamics` | `marketDynamics` |
| `rfFuelCosts` | `enableRfFuelCosts` | `fuelCosts` |
| `rfWorkerCosts` | `enableRfWorkerCosts` | `workerCosts` |
| `rfIncome` | `enableRfIncome` | `income` |
| `rfWorkplaceTriggers` | `enableRfWorkplaceTriggers` | `workplaceTriggers` |
| `rfDairy` | `enableRfDairy` | `dairy` |
| `rfNpcFavor` | `enableRfNpcFavor` | `npcFavor` |
| `rfWorldEvents` | `enableRfWorldEvents` | `worldEvents` |
| `rfProStaff` | `enableRfProStaff` | `proStaff` |
| `rfFertilizerDepot` | `enableRfFertilizerDepot` | `fertilizerDepot` |
| `rfWeatherGuard` | `enableRfWeatherGuard` | `weatherGuard` |
| `rfTimeGuard` | `enableRfTimeGuard` | `timeGuard` |
| `rfPresence` | `enableRfPresence` | `presence` |
