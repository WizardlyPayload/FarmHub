# Farm Dashboard V5 5.2.150 — release handoff

Status: **private release candidate; publication pending.** This record is updated only when each gate has a substantive result. App 5.2.150 pairs with the single canonical game mod 5.1.0.140. The previous public pair is 5.2.7/5.1.0.12.

## Exact private candidate

The staged source of truth is `Z:\Graham\agent-comms\farmhub-companion-acceptance\release-candidate-5.2.150-5.1.0.140\RELEASE-MANIFEST-CANDIDATE.json` at source commit `bdf66c8bb7a7269ea0cb94234bd4e184872b0d93` plus documentation commits. Rehash every file before upload.

- Windows installer `FS25-Farm-Dashboard-V5-Setup-5.2.150.exe`: 384,520,757 bytes; SHA-256 `F2E92B6D88D4D565EA4BA1435DD5451C322A7BED954C850F60639D73D2373BE4`.
- Matching blockmap: 400,509 bytes; SHA-256 `99CC186E3B081A90F9B7918CE002D45DDFCE6B2372EE5EB43C624BBF42AA13E9`.
- Game mod `FS25_FarmDashboard.zip`: 713,605 bytes; SHA-256 `2402E851019C699429D42635DAE814DD2FFA16E1D1CD6958A9AB84B567D2ECC8`.
- V5 `latest-rf.yml`: 379 bytes; SHA-256 `88AD8AC9D9CF219B8C2F09DD1D06A8CAF053C4A8F25D2155CFF8EEF4229676E2`. Its SHA-512 and size match this exact installer. Do not replace V4 `latest.yml`.
- Wren's private 52-path website candidate `private-candidate.zip`: SHA-256 `F828984CA2E31B87C10F5872B577291D4E290432408DE6CF3A96F60847796879`. Its `manifest.json` names every before/after file hash. This is a separate static site package, not a GitHub release asset.

## Verification so far

- Full local app Jest: 491/491 suites passed; 2,914 tests passed, one skipped. App MJS 160/160 passed. TypeScript, Vite, 27-locale placeholder audit, mod ZIP CRC and source-member comparison, private installer fresh UI/asar and V5 updater channel guards passed.
- Exact website candidate ZIP was independently checked for 52 unique members, CRC, every manifest/after byte, and absence of tester paths or installer/update binaries. Wren reviewed desktop/mobile layout and the two corrected support claims. Its versioned links remain provisional until tag/public assets exist.
- Tina's staff wording test reported full Ally hash restoration. The temporary Employees hire/counter wording passed; the exact Personnel Efficient Use label was not generated in that natural applicant set.
- Cumulative normal-mod-set smoke `FARMHUB-ALLY-20261122-RELEASE-SMOKE` was queued with frozen packet SHA-256 `D9036AA614F6FB65334BC72D97615E01C92F904A9406CDFD65431347BF724CFC`; ACK at 19:31 UTC is receipt only.
- Draft [PR #16](https://github.com/WizardlyPayload/FarmHub/pull/16) is for Windows CI. Merge and publication wait for its exact final head to pass and the final Ally result.

## Claims excluded from this release

- Production Control and Distribution Redux coexistence with the reviewed normal StockGuard build: their adapters are unbound. Production Control's one positive reading was isolated with StockGuard off.
- Production Supply Manager automatic purchase history: the latest test blocked before world load because the selected mod set omitted a saved fill-type provider. The dependency-corrected packet is undispatched.
- Every vault mod, all mod combinations, realised fieldwork/profit/payroll/interest, multiplayer, and save/reload persistence. Individual bounded observations do not establish those claims.

## Publication order and record

1. Review Tina's substantive normal-set result, committed generations, game/export/installed-page parity, one Windows row, logs and **full Ally restoration**. Resolve or explicitly narrow any failed claim.
2. Push final docs/acceptance record to the release branch, require Windows CI on the exact final head, then merge to `main` and verify the merge/CI. Tag the exact release commit `v5.2.150`.
3. Publish a GitHub release with the four exact V5 files and [release notes](GITHUB_RELEASE_v5.2.150.md). Download the public asset URLs and hash all four; verify the `releases/latest/download/latest-rf.yml` response and leave V4 `latest.yml` unchanged.
4. Push the same installer to itch `windows-v5` and the canonical mod ZIP plus `INSTALL.txt` to itch `mod-v5`. Read back both channel builds and exact inner file hashes. Update itch description/install instructions from the reviewed 5.2.150 HTML drafts only after the matching downloads work.
5. Give Sarah the exact reviewed website package and manifest. She must hash-gate fresh live preimages, make a metadata-preserving server backup and independently verified PC copy, then atomically replace only the 52 reviewed paths. Preserve `/t/fs25-beta`, V4 and other sites. Verify origin and public after hashes, HTTPS, script cache keys, download/document links and protected Access routing.
6. Record actual commit, CI run, tag, GitHub/itch build IDs, public hashes, Sarah result, website readback and remaining limits here. No checkbox is complete merely because an ACK or upload command succeeded.

No public publication is recorded yet.
