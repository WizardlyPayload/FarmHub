# Farm Dashboard companion acceptance, Ally phase B1

Request ID: `FARMHUB-ALLY-20261030-COMPANIONS-B1`. This packet is queued behind RF-20261030-TINA-SAVE20-1357. ACK now if useful, but do not touch the Ally or begin this Farm Dashboard test until RF returns its result, hash-restores every original, closes FS25, and releases the Ally. If a new RF-owned active session is admitted, keep that priority and report the delay.

## Scope

The nine dashboard data readers absent from phase A's saved gameplay exports: Enhanced Loan System, Fluctuating Diesel Price, Livestock Monitor, Animal Food Calculator, Production Watcher, RealSilo, Advanced Maintenance, Save Unit Profiles, and Moisture System. Exact source ZIP hashes are in `Z:\Graham\agent-comms\farmhub-companion-acceptance\EXTERNAL-MODS.md` (SHA-256 `19762F5EEF11B4BF534310124A1B2F1702002E99B8936B33FB491E1CEE555F5D`); all nine are staged in that folder's `external-mods` directory, hash-readback verified and not installed.

Use `Z:\Graham\agent-comms\farmhub-companion-acceptance\FS25-Farm-Dashboard-V5-Setup-5.2.12.exe`, SHA-256 `0F7E1F5F84E5E2A7828438EC12B6BD2A71D1478A5701EC9E06BAD12E2255AEA6`, and the new **canonical filename** `Z:\Graham\agent-comms\farmhub-companion-acceptance\candidate-515\FS25_FarmDashboard.zip`, mod 5.1.0.15, SHA-256 `A3A7201A97FD65FB6C3EA6C7A152415FEDF68F6303FD9575100CB0429B614832`. The mod ZIP contains the source fix that exports all 65 catalog entries when loaded. Both hashes must be independently rechecked on the Ally before installation.

## Controlled Ally work

1. Back up and hash the Ally's original app, source/profile, FS25 mod ZIPs, save, game settings and modSettings. Work only in a disposable save. Keep the PC free. Do not edit RF source or production ZIPs. Record exact installed hashes, selected mods, one Windows app row, and at least two committed export generations per run.
2. Add the seven non-finance ZIPs (Livestock Monitor, Animal Food Calculator, Production Watcher, RealSilo, Advanced Maintenance, Save Unit Profiles, Moisture System) to a disposable copy of Witcombe save 20. Verify each is checked, loads without a relevant Lua error, appears in the dashboard's dedicated page or folded section, and has the expected export key and `readState`. Compare one non-empty value with the current export and game state where available. For RealSilo, Production Watcher and animal/vehicle readers, record whether the save actually contains a matching placeable, active production, animal or vehicle. An empty reader on a save without applicable objects is **unproven**, not a pass.
3. Test Enhanced Loan System separately with Automatic Loan Repay unchecked. Inspect its loan balance, payment and settings on its dedicated page against the fresh export and in-game source. If the disposable farm has no loan, record the zero state and make a disposable loan only if the mod allows it safely; do not save to Graham's source slot.
4. Test Fluctuating Diesel Price separately with Realistic Diesel Price unchecked. Compare its current game fuel price, target or change state with the dedicated dashboard page and fresh export. The two diesel writers' combined behavior is a separate compatibility case; do not call a combined run passed from a single-mod result.
5. For each test run, check that selected mods appear, unchecked mods hide, unrelated companions remain visible, and no earlier page is accidentally reused as current data. Record actual values and screenshots at full screen. Return `PASS`, `EMPTY`, `PARTIAL`, `MISSING`, or `FAIL` per reader with evidence paths.
6. Restore every Ally original by hash and report the exact outcome and any remaining live-state gap. Do not carry this staging into RF work.

This draft is a bounded test of dashboard integration. It does not claim every possible gameplay state or mod combination.

Return RESULT or BLOCKED FARMHUB-ALLY-20261030-COMPANIONS-B1 to Z:\Graham\agent-comms\to-wizard-pc.md with the exact installer/mod/external ZIP hashes, committed generation lines, per-reader matrix, screenshots, relevant Lua log excerpt and before/after restoration hashes. An ACK alone is not acceptance. Do not publish, deploy to a VPS or modify the PC/server.

