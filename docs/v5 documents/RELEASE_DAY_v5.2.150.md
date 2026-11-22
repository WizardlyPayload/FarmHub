# Farm Dashboard V5 5.2.150 — release handoff

Status: **private release candidate; publication pending.** This record is updated only when each gate has a substantive result. App 5.2.150 pairs with the single canonical game mod 5.1.0.140. The previous public pair is 5.2.7/5.1.0.12.

## Exact private candidate

The staged replacement pair is under `Z:\Graham\agent-comms\farmhub-companion-acceptance\release-candidate-5.2.150-security-5.1.0.140`. The earlier F2E92B6D installer/feed and its staging are **superseded; do not publish**. Rehash every replacement file before upload.

- Windows installer `FS25-Farm-Dashboard-V5-Setup-5.2.150.exe`: 384,519,348 bytes; SHA-256 `0CD9CD08D67E0B0D349516CE348B7EDA4CDEDA03FBE8855F41B2F8B28E966FAF`.
- Matching blockmap: 401,255 bytes; SHA-256 `E7DC2EFE85F9C997AACDAD2F5A2A9DE86D0E81A4E788DEC8EC80AEC2184FEA4C`.
- Game mod `FS25_FarmDashboard.zip`: 713,605 bytes; SHA-256 `2402E851019C699429D42635DAE814DD2FFA16E1D1CD6958A9AB84B567D2ECC8`.
- V5 `latest-rf.yml`: 379 bytes; SHA-256 `0FE786654E184C038BA6A560C6845E481AC041CB0257300168DF8C1074DEEBBA`. Its SHA-512 and size match this exact installer. Do not replace V4 `latest.yml`.
- Wren's private 52-path website candidate `private-candidate.zip`: SHA-256 `F828984CA2E31B87C10F5872B577291D4E290432408DE6CF3A96F60847796879`. Its `manifest.json` names every before/after file hash. This is a separate static site package, not a GitHub release asset.

## Verification so far

- Windows CI on the dependency-fixed commit passed full app Jest: 491/491 suites and 2,914 tests, with one skipped. Local MJS 160/160 and focused XML regression 124/124 passed. TypeScript, Vite, 27-locale placeholder audit, mod ZIP CRC and source-member comparison, private installer fresh UI/asar and V5 updater channel guards passed. A redundant serialized local full-Jest rerun was stopped after 49 passing suites to free PC resources; the complete CI result is the full-suite gate.
- Exact website candidate ZIP was independently checked for 52 unique members, CRC, every manifest/after byte, and absence of tester paths or installer/update binaries. Wren reviewed desktop/mobile layout and the two corrected support claims. Its versioned links remain provisional until tag/public assets exist.
- Tina's staff wording test reported full Ally hash restoration. The temporary Employees hire/counter wording passed; the exact Personnel Efficient Use label was not generated in that natural applicant set.
- Cumulative normal-mod-set smoke `FARMHUB-ALLY-20261122-RELEASE-SMOKE` was queued with frozen packet SHA-256 `D9036AA614F6FB65334BC72D97615E01C92F904A9406CDFD65431347BF724CFC`, then held when CI found new production dependency advisories. Tina reported no world load, no install, no readings, full Ally hash restoration and **ALLY RELEASED**. It is not a release pass. A new exact replacement packet/result is required.
- Replacement normal-set smoke `FARMHUB-ALLY-20261122-RELEASE-SMOKE-R1` was queued with frozen packet SHA-256 `3D0251F6A288D7BBA2877E8C2A3CA2E2E679876BEE6C44E36023CB0DB33B3A20` after rebuilt package and Windows CI passed. ACK is receipt only; a substantive result and full restoration are still required.
- Draft [PR #16](https://github.com/WizardlyPayload/FarmHub/pull/16) is for Windows CI. The first run found `basic-ftp` and `fast-xml-parser` advisories; direct dependencies were updated to 6.2.6 and 5.12.1. Local production audit is zero, MJS 160/160 and focused XML 124/124 passed; Windows CI run [45063132599](https://github.com/WizardlyPayload/FarmHub/actions/runs/45063132599) passed the complete 491-suite Jest run on dependency commit `d7a560bc`. Final documentation-head CI is still pending. Merge and publication wait for the exact final head and Ally result.

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
