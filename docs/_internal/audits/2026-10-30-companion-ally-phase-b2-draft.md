# Farm Dashboard companion acceptance, Ally phase B2 draft

This packet is **not dispatched**. Wait for Tina to restore phase B1 and for any RF-owned session to finish. Reconcile phase B1 failures before issuing an exact request ID. The PC remains available to Graham.

## Scope and candidate

Cover the 16 data integrations staged from the mod vault in `Z:\Graham\agent-comms\farmhub-companion-acceptance\external-mods`, with exact ZIP versions and hashes in `EXTERNAL-MODS.md`: Farmland Marketplace, Everything Constructable, Extended Vehicle Maintenance, Realistic Vehicle Service, Task List, Production Schedule, Economic History, Animal Planner, VIP Order Manager, Field Profitability Ledger, Farm Reputation, Yield Tracker, Rent Your Field, Distribution Redux, Silage Compaction Monitor, and Farm Operations Dashboard. Farm Reputation declares a real dependency on Better Contracts, which must be present and selected in its run.

Use an exact Farm Dashboard candidate hash named in the dispatched packet. Do not infer acceptance from the older 5.1.0.14 export; the source-only all-catalog cap fix is in the staged 5.1.0.15 candidate.

## Controlled test sequence

1. Back up and hash the Ally's app/profile, save, mods, game settings and modSettings. Use a disposable copy of the known Witcombe save 20 or another justified disposable save with the needed production/farm assets. Keep the source save untouched. Verify every staged ZIP after copying, its `modDesc.xml` identity, the canonical Farm Dashboard ZIP name, exact installed hashes, selected mod list and one Windows app row.
2. Run the combined set first if FS25 accepts the selection. Capture at least two committed export generations, the Lua log, all 16 `detected`, `readState`, farm-scoped rows and installed full-screen dashboard sections. A launch/load failure triggers subset isolation; do not claim that all mods are incompatible from one combined failure.
3. Check land/field data: Farmland Marketplace offers and owned land, Field Profitability Ledger costs/revenue, Yield Tracker harvest records, Rent Your Field leases, Farm Operations tasks and field associations. Compare one meaningful value per mod with the fresh export and in-game source. Record `EMPTY` where the save has no event history or active lease.
4. Check production/storage/economy: Production Schedule windows, Distribution Redux routes, Economic History periods, VIP Order Manager order requirements, Task List entries, and Silage Compaction Monitor bunker status. Test a non-empty state on a disposable save if an action can be made safely; otherwise leave a named live-state gap. A settings-only card is `PARTIAL`.
5. Check vehicle and animal data: Extended Vehicle Maintenance and Realistic Vehicle Service on an owned vehicle, Animal Planner on an owned husbandry. Compare the farm ID, status and any countdown/value to game state. With both vehicle service mods selected, distinguish their readings and check neither overwrites the other in the dashboard.
6. Check Farm Reputation with Better Contracts selected. Verify reputation and contract source, then uncheck Farm Reputation while leaving Better Contracts active; the reputation page should hide and Better Contracts should remain. This declared dependency is an exception to mod independence.
7. Check Everything Constructable with **an actual active construction site**. Compare the site name, progress, each material's required/delivered/remaining amounts and cost with the game and fresh export. Make one disposable delivery if safe; check the next committed generation updates the relevant row. A page with no project is not acceptance. Historical release notes mention an older Ally cement-delivery test, but this candidate needs its own evidence.
8. Return a per-mod `PASS`, `EMPTY`, `PARTIAL`, `MISSING`, or `FAIL` matrix with export keys, screenshot paths and log lines. Record any interaction conflict as a specific mod pair and reproducible sequence, not a generic compatibility claim. Restore every Ally original by hash and release the device to RF work.

This phase validates dashboard integration and a representative combined configuration. It does not claim all possible mod combinations or every state of third-party gameplay.
