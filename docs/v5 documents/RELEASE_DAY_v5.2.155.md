# Farm Dashboard V5 5.2.155 — release handoff

Status: **private release candidate; publication pending**. App 5.2.155 pairs with the single canonical game mod 5.1.0.140. The current public pair remains 5.2.7/5.1.0.12 until publication and exact public readback.

## Exact private candidate

The four files are staged under `Z:\Graham\agent-comms\farmhub-companion-acceptance\release-candidate-5.2.155-5.1.0.140`. The previous 5.2.150 installer, updater feed, smoke packets and website package are superseded for final release acceptance.

- `FS25-Farm-Dashboard-V5-Setup-5.2.155.exe`: 384,518,214 bytes; SHA-256 `795732D6C4F98A070AC0FF0CF271D58E66C459BB00D89A93CDDA428C2E9964B6`.
- `FS25-Farm-Dashboard-V5-Setup-5.2.155.exe.blockmap`: 400,368 bytes; SHA-256 `61E5EA25B2AFE30F4895ACDFDE0E804B38F35A522BA8F2245463D8951516FFEA`.
- `FS25_FarmDashboard.zip`: 713,605 bytes; SHA-256 `2402E851019C699429D42635DAE814DD2FFA16E1D1CD6958A9AB84B567D2ECC8`.
- `latest-rf.yml`: 379 bytes; SHA-256 `B5A825F912F738B99531E3B85B829DBB3B7F8B5CC7E92A86979CD4F8C8D0C27A`. Its recorded SHA-512 and size must be rechecked against the exact installer before publication. Classic V4 uses a separate `latest.yml` feed.

## Evidence and open gates

- The Saddle Creek local-save identity fix is in release branch commit `dd628962`. The installed private 5.2.155 app selected `My game save — Saddle Creek`, rejected the old Witcombe export, and showed a waiting map state. That is a local-source isolation check, not a fresh Saddle Creek game export or a cumulative normal-set acceptance.
- The 5.2.150 cumulative R1 test was held. Tina reported no world load, V5 install or readings; she had staged an as-found baseline, exact files and disposable save, then verified full hash restoration and **ALLY RELEASED** on 26 November. The old candidate has no normal-set acceptance result.
- A new 5.2.155 normal-set smoke must prove StockGuard READY, a complete saved mod set, game/committed-export/installed-page parity for named owned data, one Windows row, logs and full as-found Ally hash restoration. No reduced mod set or StockGuard-off substitute establishes this gate.
- [Draft PR #16](https://github.com/WizardlyPayload/FarmHub/pull/16) at `ecc57bee` failed Windows CI run `45904842805`: three source-ingest test harnesses omitted the new map-identity dependency (489 suites passed, three failed; 2912 tests passed, five failed). The production change was not implicated by those failures. The three harnesses have been corrected and their 16 focused tests pass locally; a new exact-head CI pass is required. The prior passing run 45063132599 covered an earlier dependency fix, not this head.
- R2 normal-set Ally smoke was ACKed and Tina began a fresh as-found baseline without launching the game. The CI failure triggered the packet's HOLD rule; the release owner sent a hold/restore message before world load. Await a substantive HELD result and explicit full hash-restored ALLY RELEASED. The stopped R2 has no normal-set acceptance result.
- Wren and Piper prepared a new **private** 5.2.155 website package at `WEB-20261126-FARMDASH-V5-155-CANDIDATE-001`, reviewed only for private preparation. The previous 52-path package uses 5.2.150 labels and is superseded. A separate private itch description/install copy retains the current public 5.2.7 history and gallery. Neither package was published. Sarah's VPS preflight and protected-path constraints remain in force.
- Production Control and Distribution Redux have unbound adapters in the reviewed normal StockGuard build. Production Supply Manager purchase-history acceptance is blocked before world load. Bounded individual earlier readings do not prove all mod combinations, multiplayer, save/reload persistence or completed work.

## Publication sequence

1. Finish exact-head CI, app/UI/localization/package checks and the final normal-set Ally smoke. Reconcile any failure, and verify the final manifest and release copy against evidence.
2. Push the reviewed final documentation head, require green CI on that exact head, merge to `main`, and tag `v5.2.155` only after the acceptance gate passes.
3. Publish the four exact V5 files on GitHub, then the matching Windows and game-mod artifacts on itch. Independently download and hash each public file; check the V5 updater URL and preserve V4 `latest.yml`.
4. Give Sarah the reviewed website manifest. Require a fresh live preimage backup with independent copy, changed-path hash gates, atomic deployment, HTTPS and protected `/t/fs25-beta` readback. Record actual commit, CI run, tag, build IDs, live hashes, and remaining limits here.

No public publication is recorded yet.
