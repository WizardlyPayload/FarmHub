# Farm Dashboard V5 5.2.155 — release handoff

Status: **private release candidate; publication pending**. App 5.2.155 pairs with the single canonical game mod 5.1.0.140. The current public pair remains 5.2.7/5.1.0.12 until publication and exact public readback.

## Exact private candidate

The four current files are staged under `Z:\Graham\agent-comms\farmhub-companion-acceptance\release-candidate-5.2.155-r4-5.1.0.140`. The earlier 5.2.155 installer used for R3 is superseded because R3 exposed a native-weed display omission. The mod ZIP is byte-identical.

- `FS25-Farm-Dashboard-V5-Setup-5.2.155.exe`: 384,515,661 bytes; SHA-256 `2782D9360AA03DE3DE25AE9E06FE93808A88FEFCFDF9E3969384745017FEF482`.
- `FS25-Farm-Dashboard-V5-Setup-5.2.155.exe.blockmap`: 399,401 bytes; SHA-256 `811A47C0B4A98DC8BD2B5F162264E6D0AC157849007EF0FC242EECF6414721A0`.
- `FS25_FarmDashboard.zip`: 713,605 bytes; SHA-256 `2402E851019C699429D42635DAE814DD2FFA16E1D1CD6958A9AB84B567D2ECC8`.
- `latest-rf.yml`: 379 bytes; SHA-256 `501284E7885CB3461F20194005850D03FE8C09241A0DF470A3B26033172B0C73`. Its recorded SHA-512 and size must be rechecked against the exact installer before publication. Classic V4 uses a separate `latest.yml` feed.

## Evidence and open gates

- The Saddle Creek local-save identity fix is in release branch commit `dd628962`. The installed private 5.2.155 app selected `My game save — Saddle Creek`, rejected the old Witcombe export, and showed a waiting map state. That is a local-source isolation check, not a fresh Saddle Creek game export or a cumulative normal-set acceptance.
- The 5.2.150 cumulative R1 test was held. Tina reported no world load, V5 install or readings; she had staged an as-found baseline, exact files and disposable save, then verified full hash restoration and **ALLY RELEASED** on 26 November. The old candidate has no normal-set acceptance result.
- Exact-head CI run `45907394621` passed on `ca11295c` (492/492 Jest suites, 2,917 passing and one skipped, 160/160 MJS, package and locale checks). R3 then loaded the full recorded 23-mod set with normal StockGuard READY, committed exports, installed the earlier 5.2.155 build, and fully restored Ally by hash. Economy and a nonempty pasture matched game/export/app. R3 was **PARTIAL**: it lacked a game-side named machine reading and nonempty production/storage; Field 89 exposed native weed cover 25% while RF Soil pressure was 0%. The app had hidden the native weed badge under RF Soil. Brian confirmed these are distinct readings. Commit `08ce7e6f` shows the native badge in the base-game section while retaining RF Soil pressure; the new private installer above needs a fresh bounded installed check. R3 evidence remains in `Z:\Graham\agent-comms\ally-fh-release-smoke-r3-evidence`.
- A new 5.2.155 normal-set smoke must prove StockGuard READY, a complete saved mod set, game/committed-export/installed-page parity for named owned data, one Windows row, logs and full as-found Ally hash restoration. No reduced mod set or StockGuard-off substitute establishes this gate.
- [Draft PR #16](https://github.com/WizardlyPayload/FarmHub/pull/16) remains private. R2 stopped before game launch when CI run `45904842805` failed on three test-harness dependencies; Tina verified full as-found readback and **ALLY RELEASED**. The corrected harness passed CI in run `45907394621`. The R3 display correction and updated handoff passed exact-head Windows CI run `45913633628` on `6e352f7e` (full Jest/MJS, package, localization and production audit). Frozen R4 packet SHA-256 `4FEB76A0F5240ED1A0F75CEB1D3B876AB6A436D72A6FA95400628B1A3F8D068F` was sent to Tina after that pass; her ACK is only receipt. The later documentation-only release-head commit still requires its own exact-head green check.
- Wren and Piper prepared a new **private** 5.2.155 website package at `WEB-20261126-FARMDASH-V5-155-CANDIDATE-001`, reviewed only for private preparation. The previous 52-path package uses 5.2.150 labels and is superseded. A separate private itch description/install copy retains the current public 5.2.7 history and gallery. Neither package was published. Sarah's VPS preflight and protected-path constraints remain in force.
- Production Control and Distribution Redux have unbound adapters in the reviewed normal StockGuard build. Production Supply Manager purchase-history acceptance is blocked before world load. Bounded individual earlier readings do not prove all mod combinations, multiplayer, save/reload persistence or completed work.

## Publication sequence

1. Finish exact-head CI, app/UI/localization/package checks and the final normal-set Ally smoke. Reconcile any failure, and verify the final manifest and release copy against evidence.
2. Push the reviewed final documentation head, require green CI on that exact head, merge to `main`, and tag `v5.2.155` only after the acceptance gate passes.
3. Publish the four exact V5 files on GitHub, then the matching Windows and game-mod artifacts on itch. Independently download and hash each public file; check the V5 updater URL and preserve V4 `latest.yml`.
4. Give Sarah the reviewed website manifest. Require a fresh live preimage backup with independent copy, changed-path hash gates, atomic deployment, HTTPS and protected `/t/fs25-beta` readback. Record actual commit, CI run, tag, build IDs, live hashes, and remaining limits here.

No public publication is recorded yet.
