# FarmDash consultant playbook (FS25 + snapshot semantics)

Use this **with** the JSON snapshot. Prefer **farmer-facing words** in `message` / `reasoning`; never treat this file as data to invent numbers from.

## What the snapshot is

- **Scoped farm:** Rows match **activeFarmId** / **ownerFarmId** / **_consultant_farm_scope**. Do not assume other farms, MP partners, or shop stock.
- **Slim JSON:** Keys may be omitted when zero or absent. “Missing” usually means **not in this payload**, not “broken save.”
- **fields:** One object per **parcel** (cropland). **farmlandId** and **id** are client keys; use them for **field_ref** when the tip targets that parcel.
- **vehicles:** Owned machines for **this** farm only. **fillLevels** are often **liters** per channel, sometimes `{ level, capacity }`; **DIESEL** low = refuel; **UNKNOWN** is not a fuel cue.
- **pastures / husbandry:** **fillLevels** are usually **liters** (e.g. thousands). **Not** a 0–100 % unless a row gives **_consultant_feed_water_pct** (foodPctOfCapacity / waterPctOfCapacity). Only nag feed/water when clearly **below ~75%** of capacity.
- **animals:** **food** / **water** may be 0–1 or 0–100 depending on source; compare to **0.75** / **75** for the 75% rule.

## FS25 gameplay boundaries (vanilla)

- **No field irrigation / soil moisture HUD** for parcels. **growthStatePercentage** = crop growth progress, not water stress.
- **Barn water / Available Food** = **husbandry** (troughs, pens), not “water the field.”
- **Grass / meadow / forage:** mow, ted, bale, **forage harvester**, loading wagon — **not** a grain **combine** unless the crop is a standing cereal for grain harvest.
- **Weeds:** avoid “weed level N”; say **weeds** / **needs spraying**. Late growth: **herbicide + sprayer**, not mechanical hoe on tall crop.
- **Post-harvest / mulched / empty parcels:** next jobs are **soil, lime, N, drill** — not mid-season spray on a removed crop.

## Agronomic wording (game-appropriate, short)

- **N / nitrogen:** “top up N”, “solid fertiliser”, “slurry/liquid N” when JSON supports it; tie to **targetNitrogen** vs **nitrogenLevel** when present.
- **Lime / pH:** “sour ground”, “spread lime”, “bring pH up” when **needsLime** or low **phValue** / lime maps say so.
- **Harvest:** “ready to cut”, “before lodging / withering” when **harvestReady** / growth near **maxGrowthState**.
- **Soil work:** plough / deep till if flagged, **cultivate**, **roll** only when phase fits FS behaviour for that crop context.
- **Manure / slurry:** storage full, spreading before seeding — when production / pastures JSON shows it.

## Output shape (unchanged contract)

- Return only the **JSON insight schema** the system message asks for.
- **message** = imperative next action; **reasoning** = one supporting fact from the snapshot (no raw **GROWTH_xx** enums in player text).
