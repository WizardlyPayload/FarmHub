# Farm Dashboard V5 — compatibility (classic vs rebuild)

**Same product, two Windows installers: V4 and V5.** The new screens are a **rebuild** of Farm Dashboard, not a different game and not Realistic Farming / Farm Tablet.

| Line | Who | UI | Auto-update | Port |
|------|-----|----|-------------|------|
| **V4** classic 4.x | People who want the old screens | Classic `web/` | **`latest.yml` only** | **8766** |
| **V5** rebuild 5.x | Anyone who installs the V5 EXE | NEW APP | **`latest-rf.yml` only** | **8768** |

Do **not** call V5 “RF edition” in product-facing names. The YAML is still `latest-rf.yml` so already-installed 5.0.x apps keep updating.

## Hard rule

> V4 auto-update clients poll **`latest.yml`**.  
> A V5 installer must **never** be the asset that V4 `latest.yml` points at.

- V5 zip + Setup.exe go **flat** in `%USERPROFILE%\Documents\FarmDash Release\`.
- V4 public feed stays in `Documents\FarmDash Final Output`.
- One in-game zip: **`FS25_FarmDashboard.zip`**.

Plain language: **Keep V4 if you want. Install V5 only if you opt in. Auto-update on V4 will not replace it.**

Tester checklist: [`TESTERS.md`](./TESTERS.md). Full engine/API gap table (RF companions): [`../COMPATIBILITY.md`](../COMPATIBILITY.md) (same facts; this folder is the V5 player-facing copy).

## Version identity

| Artifact | V4 | V5 |
|----------|----|----|
| App | **4.2.1** public classic | **5.0.3** |
| Mod zip | **3.4.0.7** classic stamp | Working tree **5.0.0.3** |
| Installer | `FS25-Farm-Dashboard-Setup-4.x.exe` | `FS25-Farm-Dashboard-V5-Setup-5.0.3.exe` |
| Update YAML | `latest.yml` | `latest-rf.yml` |

V4 and V5 share tree `package.json` for classic builds. V5 injects `extraMetadata.version: 5.0.3` at pack time so About reports **5.x**.

## What V5 UI must honour

- Sidebar core: Overview, Fields, Vehicles, Pastures, Productions, Storage, Economy, Fleet map.
- Livestock is **Pastures**.
- Field cards: **GPS painted-blob merge** + optional manual groups — not adjacent same-crop auto-merge.
- Fertilizer Depot stock = **hall bins**, not 50k shop book.
- Suite / ADS / Red Tape / Hire / NPC / World Events / Pro Staff: **soft-detect**, hidden when absent.
- About copy: out-of-game companion; not Farm Tablet; not forced over V4.

## RF companions (tested pins)

See the table in [`../COMPATIBILITY.md`](../COMPATIBILITY.md) (Soil Fertilizer, Seasonal Crop Stress, Fertilizer Depot, Tax, Market Dynamics, Fuel, Workers, Income, DairyCore, NPC Favor, World Events, Pro Staff, cores, …). Newer than tested = “untested” in About, not a hard fail. Zero RF mods ⇒ clean NEW APP, no empty RF panels.
