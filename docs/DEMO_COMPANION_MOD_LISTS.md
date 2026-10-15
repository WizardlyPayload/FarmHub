# Demo saves (clean four-slot layout)

Site / Try-now should only ever watch **one** of these at a time. V5 Local servers are wiped to these four only (2026-09-22 fresh demo config).

| # | Slot | In-game name (create as) | Map | Role |
|---|------|--------------------------|-----|------|
| 1 | `savegame4` | **Demo Riverbend - Base** | Riverbend Springs | Vanilla base game + Farm Dashboard only |
| 2 | `savegame3` | **Demo Riverbend - PF** | Riverbend Springs | Base + Giants **Precision Farming** + Farm Dashboard |
| 3 | `savegame19` | **Demo Montana - RF + companions** | Montana Multifruit 4x | RF suite + Pack A companions (incorporated mods, RF side) |
| 4 | `savegame18` | **Demo Montana - PF + companions** | Montana Multifruit 4x | Giants PF + Pack B companions (incorporated mods, non-RF side) |

**Note:** Slots 16/17 were reserved but never got careers — Riverbend demos use existing clean slots **4** (base) and **3** (PF). Montana **18/19** are the fresh careers from 2026-09-22.

V5 Local server IDs (after first app setup / Dash re-link):

- `demo-rb-base-sg4`
- `demo-rb-pf-sg3`
- `demo-mt-rf-sg19`
- `demo-mt-pf-sg18`

Export roots: `Documents\My Games\FarmingSimulator2025\modSettings\FS25_FarmDashboard\<savegameNN>\`

**Manual drop still needed on Pack A (Montana RF):** **British Fill Units** from [itch — BigMacJ](https://bigmacj1.itch.io/british-fill-units) — not in the vault.

---

## Create order (Wizard)

1. Fresh-install **V5** app (fields-hold build) so Try-now uses the cleaned server list.
2. In FS25, create the four saves in the slots above (names matching the table).
3. Tell Dash — mod lists get written into each `careerSavegame.xml` (Riverbend: tiny lists; Montanas: Pack A / Pack B).
4. Load one save → wait one Farm Dashboard export cycle → in the app select that Local server → tunnel serves it on `demo.farmdashboard.co.uk`.

Old non-demo FD exports were moved under  
`modSettings\FS25_FarmDashboard\_archived-non-demo-*`  
Old Montana careers: `My Games\FarmingSimulator2025\demo-save-backup-*`

---

## Hard conflict families (never mix inside one save)

| Family | Pick **one** only |
|--------|-------------------|
| Soil source | RF **Soil Fertilizer** (+ Seasonal Crop Stress) **or** Giants **Precision Farming** — never both |
| Fill display | **British Fill Units** **or** **Imperial System** (**or** Unit Converter alone) — never British+Imperial |
| Diesel price | **Realistic Diesel Price** **or** **Fluctuating Diesel Price** |
| Loan philosophy | **Enhanced Loan System** **or** **No Credit** **or** vanilla loans (**I Need A Loan** / **Automatic Loan Repay**) |
| Heavy maintenance | **Advanced Maintenance** **or** **Extended Vehicle Maintenance** **or** **Realistic Vehicle Service** |
| Animal realism stack | **Realistic Livestock** (RM) **or** **Realistic Animal Losses** |

---

## Riverbend — Base (`savegame4`)

**Enable only:**

- `FS25_FarmDashboard`

No PF, no RF suite, no companions. Dashboard should read as clean vanilla Riverbend.

---

## Riverbend — PF (`savegame3`)

**Enable only:**

- `FS25_FarmDashboard`
- `FS25_precisionFarming` *(Giants)*

No RF Soil / Crop Stress, no companion zoo.

---

## Montana — RF + companions (`savegame19`) — Pack A

**Enable:**

Core / map
- `FS25_FarmDashboard`
- `FS25_Montana_MF`

RF suite (soil side — **no Precision Farming**)
- `FS25_SoilFertilizer`
- `FS25_SeasonalCropStress`
- (other RF companions already in your RF set: FarmTablet, TaxMod, IncomeMod, FuelCosts, WorkerCosts, MarketDynamics, FertilizerDepot, WorkplaceTriggers, RandomWorldEvents, NPCFavor, SettingsHub cores as you normally run)

Pack A companions (vault)
- Enhanced Loan System
- Realistic Diesel Price
- Restricted Crop Periods / RCC / Better Contracts / Livestock Monitor / Production Watcher / RealSilo / etc. per previous Pack A list
- Realistic Livestock RM *(not Realistic Animal Losses)*
- Real Dirt Color, Realistic Weather *(OK on a fresh save)*
- British Fill Units *(manual itch drop)*

**Do not enable on Pack A:** Precision Farming, Imperial System, Fluctuating Diesel, No Credit, I Need A Loan, Automatic Loan Repay, maintenance trio, Realistic Animal Losses, Bushel Plus (optional noise).

---

## Montana — PF + companions (`savegame18`) — Pack B

**Enable:**

Core / map
- `FS25_FarmDashboard`
- `FS25_Montana_MF`
- `FS25_precisionFarming`

Units / economy alt
- Imperial System
- Fluctuating Diesel Price
- Save Unit Profiles
- I Need A Loan + Automatic Loan Repay *(or No Credit — pick one loan story)*

Fields / contracts / livestock / fleet / production — Pack B list (Soil Work Yield Bonus, Animal Food Overview, Realistic Animal Losses, Advanced Maintenance **or** Extended Vehicle Maintenance, Collision Damage, Punctured Tires, Bushel Plus, etc.)

**Do not enable on Pack B:** Soil Fertilizer, Seasonal Crop Stress, British Fill Units, Realistic Diesel Price, Enhanced Loan System, Better Contracts, Livestock Monitor, Production Watcher, Realistic Livestock RM, the other maintenance mods.

---

## What each save shows

| Save | Dashboard story |
|------|-----------------|
| Riverbend Base | Vanilla fields / vehicles / economy |
| Riverbend PF | PF soil / N / pH overlays |
| Montana RF + companions | RF tabs + companion hub (loans, British units, diesel, contracts, LM, Watcher…) |
| Montana PF + companions | PF fields + Imperial / alt diesel / ALR / maintenance / animal losses… |

---

## Site demo workflow

1. Create all four saves fresh; confirm each loads clean in `log.txt`.
2. For screenshots: load one → export cycle → select matching Local server in V5.
3. Public Try-now: leave **one** save loaded (usually **Montana RF + companions**) while the tunnel is up.

Checklist: `docs/TESTERS.md` after each first load.
