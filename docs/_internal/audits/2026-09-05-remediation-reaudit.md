# FarmHub application and mod: remediation re-audit

Date: 5 September 2026. Private Classic 4.2.2 / mod 3.4.0.8 and RF 5.0.1 / mod 5.0.0.1 candidates.

## Verdict

**HOLD. The remediation is not complete. Do not treat this as release or tester sign-off.**

The check found **29 actionable issues: 4 P1, 24 P2 and 1 P3**. Of the 35 findings carried into the execution plan, **24 still have a remaining mechanism confirmed in this pass** and **11 lack sufficient fresh closure evidence**. Five additional findings concern FTP replacement, imported transport policy, IPC coverage, hydration lifecycle and copied summary tests. The IPC finding is a demonstrated guard weakness with conditional exploit reachability, not a proven renderer compromise.

The visible pasture remediation is real progress, but it does not close the data lifecycle or security boundaries. Supervised internal validation can continue; distribution as a cleared build should wait for the gates below.

[Interactive audit view](C:/Users/Graham/.cursor/projects/c-Users-Graham-Documents-JoshWalki-Farmdash-server-edit-MAIN-CODEBASE-FarmHub/canvases/farmhub-remediation-reaudit-2026-09-05.canvas.tsx) | [Source and command evidence](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt) | [Previous execution plan](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-installed-candidate-remediation-plan.md)

## 1. Findings, ordered by severity

### R2-MOD-01 | P1 | Mod export success still does not prove bytes were written

**Area:** Mod integrity. **Evidence:** Confirmed in the newly packaged RF mod source; no game fault injection.

The copy wrapper discards copyFile's result and accepts a nonthrowing call plus an existing destination. Move recovery can then delete the source. Atomic/direct/mirror write paths do not consistently check write and close outcomes; saveFile fallback equates pcall success with persisted success.

**End-user impact:** Disk, permission or nonthrowing I/O failures can leave stale or damaged exports while success bookkeeping advances. This finding concerns the packaged code; it does not claim the current save has been damaged.

**Required change:** Use one explicit persistence result contract for copy/write/close/save/mirror paths. Preserve the previous good export and recoverable temporary bytes until replacement is confirmed.

**Close only when:**

- Inject false/nil-plus-error write, close and copy results with an existing destination.
- The previous export remains usable, temporary recovery data is retained and no success/mirror notification occurs on failure.
- A subsequent successful retry recovers; verify in the supported game runtime as well as isolated fixtures.

**Locations:** [RF mod ZIP / src/FarmDashboardDataCollector.lua:438](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L4440); [RF mod ZIP / src/FarmDashboardDataCollector.lua:596](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L4440); [RF mod ZIP / src/FarmDashboardDataCollector.lua:3545](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L4440); [RF mod ZIP / src/FarmDashboardDataCollector.lua:4011](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L4440); [RF mod ZIP / src/FarmDashboardExportMirror.lua:138](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L4440).

### R2-SEC-01 | P1 | Opaque browser origins still inherit native loopback trust

**Area:** Security. **Evidence:** Reproduced in isolated candidate-code fixtures.

`getRequestOrigin` turns explicit Origin: null and malformed origins into an empty string. Both the write guard and WebSocket origin guard then take the no-origin local-client branch. The fixture accepted both, while rejecting an ordinary hostile HTTPS origin.

**End-user impact:** A browser-origin boundary can be bypassed on locally reachable privileged HTTP/WS paths. This is a boundary reproduction, not a live browser exploit against your machine.

**Required change:** Preserve absent, opaque, malformed and valid origins as different states. Reject opaque/malformed browser origins before any locality exemption; share the policy between HTTP and WS.

**Close only when:**

- Origin: null and malformed Origin are rejected for every privileged HTTP route and WS upgrade.
- An actually absent Origin follows an explicit native-client policy, without allowing browser cases to masquerade as native.
- Exercise the full Express middleware chain and a sandboxed browser origin against an isolated profile.

**Locations:** [RF candidate ASAR / main.js:1485](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L1554); [RF candidate ASAR / main.js:1507](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L1554); [RF candidate ASAR / main.js:1838](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L1554).

### R2-SEC-02 | P1 | FTP detail filenames can escape the intended cache

**Area:** Security. **Evidence:** Reproduced in an isolated Windows-path fixture.

`syncFtpDetailsCache` only checks that a remote entry starts with animals_ and ends with .json. Backslashes and traversal components survive into path.join. A mocked listing directed the download to C:\audit\outside.json instead of the userData subtree.

**End-user impact:** A malicious or compromised configured FTP source can influence a local write destination outside the cache. No real files were created or overwritten by the fixture.

**Required change:** Accept only the supported pen-filename grammar, reject separators/drive syntax/dot traversal, and validate the resolved destination against the exact details root before any unlink, download or rename.

**Close only when:**

- Reject Windows and POSIX traversal, absolute paths, UNC/drive forms, alternate-data-stream syntax and unsupported pen names.
- Assert the exact expected destination for legitimate integer and composite pen filenames.
- Run the same hostile listing through bulk sync and per-pen download paths with a fake filesystem.

**Locations:** [RF candidate ASAR / main.js:2925](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L1554); [RF candidate ASAR / main.js:2930](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L1554).

### R3-PIPE-09 | P1 | Failed FTP replacement deletes the last good cache first

**Area:** Data pipeline. **Evidence:** Reproduced in an isolated filesystem fixture.

`safeDownload` unlinks localFinal before attempting rename. With a simulated EACCES at rename, it returned false with the final file absent and only the temporary file remaining. Per-pen FTP replacement contains the same unlink-before-rename sequence.

**End-user impact:** A transient replacement failure removes the last usable local snapshot and degrades offline/recovery behavior. This is local cache loss, not demonstrated game-save corruption.

**Required change:** Introduce a last-good-preserving replacement primitive with explicit failure cleanup and recovery. Apply it to main Lua/XML downloads and per-pen cache replacement.

**Close only when:**

- Simulate rename denial after a successful download and assert the original final bytes still exist.
- Exercise retry, process interruption and replacement of an existing target on Windows.
- Do not accept a download merely because it is nonempty; validate its expected document before making it current.

**Locations:** [RF candidate ASAR / main.js:2846](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L1554); [RF candidate ASAR / main.js:2871](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L1554); [RF candidate ASAR / livestockDetail.js:414](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L3016).

### R2-MOD-02 | P2 | Sampled animal count correction still changes averages

**Area:** Mod data. **Evidence:** Packaged-mod source confirmation.

Sampled buckets scale count and weighted sums together, then correct count alone to meet the reported population. Later averages divide unchanged sums by corrected counts. The inspected average helper also drops nonpositive sums, so measured all-zero health does not become an explicit aggregate zero.

**End-user impact:** Herd average health, weight, age and genetics can change solely because head counts were reconciled; unknown and measured zero remain conflated at the aggregate boundary.

**Required change:** Retain sample means and sample sizes separately from estimated population counts; preserve measured zero with an explicit known/unknown state.

**Close only when:**

- Changing an estimated bucket population does not change its measured sample mean.
- Weighted farm means use the declared weighting basis.
- All-zero measured health remains known zero, not omitted or healthy-by-default.

**Locations:** [RF mod ZIP / src/collectors/AnimalDataCollector.lua:90](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L4330); [RF mod ZIP / src/collectors/AnimalDataCollector.lua:96](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L4330); [RF mod ZIP / src/collectors/AnimalDataCollector.lua:127](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L4330); [RF mod ZIP / src/collectors/AnimalDataCollector.lua:695](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L4330).

### R2-MOD-03 | P2 | Courseplay finance still falls back to purchase price

**Area:** Mod data. **Evidence:** Packaged-mod source confirmation.

The incremental-fleet finance branch reads row.sellValue, row.sellPrice or row.price. The inspected vehicle serializer writes purchase price into row.price and the shown sell-value path stores it under ads.sellValue.

**End-user impact:** Vehicle asset value and net worth can be inflated on this collection path.

**Required change:** Export a canonical top-level valuation with a valuation basis and use it consistently in finance and vehicle views. Do not silently substitute purchase cost for resale value.

**Close only when:**

- A vehicle with purchase 100000 and sell value 40000 contributes the declared resale value on both collector paths.
- Zero sell value remains valid; missing value remains explicitly unknown.
- ADS absence and Courseplay on/off do not silently change valuation meaning.

**Locations:** [RF mod ZIP / src/collectors/FinanceDataCollector.lua:59](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L4440); [RF mod ZIP / src/collectors/VehicleDataCollector.lua:372](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L4440); [RF mod ZIP / src/collectors/VehicleDataCollector.lua:749](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L4440).

### R2-MOD-04 | P2 | Courseplay compatibility still traverses the fleet twice per update

**Area:** Efficiency. **Evidence:** Packaged-mod source confirmation; no FPS benchmark.

FarmDashboard:update calls the compatibility tick. When Courseplay is loaded, shieldFleetIfNeeded performs two complete fleet passes on each tick, without the no-Courseplay pending-work gate.

**End-user impact:** Steady-state frame work grows with fleet size even when no shop/vehicle transition needs repair. The audit did not measure an FPS loss.

**Required change:** Retain the required two-phase ordering for pending transitions, but process a bounded dirty set or incremental cursor instead of every vehicle every update.

**Close only when:**

- A stable 400-vehicle fleet does not require 800 guard iterations every update.
- Shop spawn and multiplayer join cases retain correct ordering and stream behavior.
- Capture per-slice duration and iteration counts on small and large saves before/after.

**Locations:** [RF mod ZIP / src/FarmDashboard.lua:183](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L4440); [RF mod ZIP / src/FarmDashboardCourseplayCompat.lua:437](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L4440); [RF mod ZIP / src/FarmDashboardCourseplayCompat.lua:575](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L4440).

### R2-MOD-05 | P2 | Adaptive cadence still uses a requested interval that setters do not update

**Area:** Mod settings. **Evidence:** Packaged-mod source confirmation.

_userCollectionCycleMs is captured during config load and preferred by adaptive cadence. The inspected synced-settings and setInt paths update config.collectionCycleMs but not that requested-value field.

**End-user impact:** The user's interval choice can be overwritten or ignored by the next adaptive adjustment.

**Required change:** Use one authoritative requested cadence and compute effective cadence separately. Route local, synced and persisted changes through the same setter.

**Close only when:**

- Changing cadence through each supported settings path changes requested cadence.
- Adaptive scaling may slow collection for load but does not forget the user's request.
- Save/reload preserves both intent and documented effective behavior.

**Locations:** [RF mod ZIP / src/FarmDashboardDataCollector.lua:993](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L4440); [RF mod ZIP / src/FarmDashboardDataCollector.lua:1429](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L4440); [RF mod ZIP / src/FarmDashboardSettingsApi.lua:169](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L4440); [RF mod ZIP / src/FarmDashboardSettingsApi.lua:236](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L4440).

### R2-MOD-06 | P2 | Collector failure still collapses into an empty payload

**Area:** Mod integrity. **Evidence:** Packaged-mod source confirmation; full scheduler fault injection outstanding.

`safeCollect` returns an empty table both for missing/failed collection and for empty results, without an error status. Legacy collection consumes that result, and other completion paths still update cached data/finish slices without a uniform failure envelope.

**End-user impact:** Downstream code cannot reliably distinguish a successful empty section from a failed collection; stale/clear/freshness decisions remain fragile.

**Required change:** Return an explicit collected/empty/failed result with generation and diagnostic state, and propagate it through incremental and legacy scheduling without marking failures fresh.

**Close only when:**

- Force each supported collector to throw or return an explicit failure.
- Keep the last good value labelled stale, do not fabricate a successful empty collection, and do not advance a successful cycle marker.
- Request servicing remains responsive during sustained collector failure.

**Locations:** [RF mod ZIP / src/FarmDashboardDataCollector.lua:2730](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L4440); [RF mod ZIP / src/FarmDashboardDataCollector.lua:3030](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L4440); [RF mod ZIP / src/FarmDashboardDataCollector.lua:3055](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L4440); [RF mod ZIP / src/FarmDashboardDataCollector.lua:3596](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L4440).

### R2-MOD-07 | P2 | Station-name rules still fabricate sell offers

**Area:** Mod data. **Evidence:** Packaged-mod source confirmation.

Although synthetic whole stations were removed, Method 8 still inserts products and fixed multipliers into existing named stations, including Grain Mill and Biogas Plant. Those prices feed the crop min/max/best-location calculation.

**End-user impact:** The dashboard can recommend an offer that was inferred from a station name rather than observed from the game.

**Required change:** Export real supported station/fill-type offers only. If estimates are useful, keep them explicitly labelled and out of authoritative best-price calculations.

**Close only when:**

- A real station with a familiar name but no matching fill-type offer gains no fabricated offer.
- Best location is based only on observed comparable prices.
- Localized/custom station names do not control price validity.

**Locations:** [RF mod ZIP / src/collectors/EconomyDataCollector.lua:791](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L4440); [RF mod ZIP / src/collectors/EconomyDataCollector.lua:838](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L4440); [RF mod ZIP / src/collectors/EconomyDataCollector.lua:889](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L4440).

### R2-MOD-08 | P2 | Bale enumeration still budgets accepted rows rather than examined entries

**Area:** Efficiency. **Evidence:** Packaged-mod source confirmation.

The iterator restarts pairs over a source table, skips previously seen entries, and increments its cap primarily for newly accepted entries. A large table of non-bale or already-seen objects can therefore require a broad scan in one slice.

**End-user impact:** The nominal row budget does not bound actual work and can still cause long game-thread slices.

**Required change:** Retain a stable enumeration cursor and charge the budget for every inspected entry, including rejected and duplicate objects.

**Close only when:**

- A source with many non-bales stops after the configured examined-entry/time budget.
- Large repeated scans do not restart through all previously seen objects.
- Mutation between slices does not duplicate/lose accepted bales or trap the cursor.

**Locations:** [RF mod ZIP / src/InventoryScan.lua:1059](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L4440); [RF mod ZIP / src/InventoryScan.lua:1072](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L4440); [RF mod ZIP / src/InventoryScan.lua:1102](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L4440).

### R2-PERF-01 | P2 | FTP intervals can overlap and stale downloads can still commit files

**Area:** Efficiency. **Evidence:** Candidate-source confirmation of the overlapping FTP branch.

The interval starts another batch without awaiting the previous batch. Poll generation checks occur before safeDownload and after it, but safeDownload replaces the final file internally before the post-download generation check. Generation-specific temporary names do not prevent an older operation from committing the shared final file.

**End-user impact:** Slow connections or configuration changes can create duplicate work and replace current disk data with an obsolete operation, even if renderer ingestion is later skipped.

**Required change:** Use one in-flight operation per server/context, cancel superseded transfers, and check generation immediately before committing bytes. Carry that identity through XML/detail work and teardown.

**Close only when:**

- Delay an old transfer across a newer completed poll: old bytes never become final.
- Configuration changes and shutdown cancel pending work and leave no active timers/watchers.
- Instrument concurrency and verify no overlapping work per server under sustained slow feeds.

**Locations:** [RF candidate ASAR / main.js:2976](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L1554); [RF candidate ASAR / main.js:2981](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L1554); [RF candidate ASAR / main.js:3085](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L1554).

### R2-PERF-02 | P2 | The HTTP total deadline still behaves as an idle timeout

**Area:** Efficiency. **Evidence:** Reproduced with candidate code and a simulated trickle response.

The 45-second deadline is checked when entering a request/redirect, but there is no independent wall-clock cancellation timer for an active body. A mocked stream was still pending at 60 seconds and then returned HTTP 200. Response aborted/error settlement also remains incomplete in the inspected function.

**End-user impact:** A slowly streaming or prematurely aborted feed can keep collection work pending beyond the advertised deadline and amplify polling overlap.

**Required change:** Use an absolute timer and one settle/cleanup path across redirects, request errors, response errors, aborts and body completion.

**Close only when:**

- Continuous small chunks cannot exceed the total request budget.
- Aborted and errored response bodies settle exactly once and remove listeners/timers.
- A late response cannot mutate a superseded poll generation.

**Locations:** [Classic candidate ASAR / httpFeedXml.js:84](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L773); [Classic candidate ASAR / httpFeedXml.js:102](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L773); [Classic candidate ASAR / httpFeedXml.js:130](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L773).

### R2-PIPE-01 | P2 | FTP pen freshness still trusts client mtime and a missing dirty index

**Area:** Data pipeline. **Evidence:** Candidate-source confirmation.

Bulk detail sync compares remote mtime with the downloaded file's local mtime. Per-pen detail re-fetches only when dirtyAt is positive and newer than the local timestamp; a cached file with a missing index can therefore be reused indefinitely.

**End-user impact:** Clock skew and missing/stale indexes can leave animal detail old even while the overview continues updating.

**Required change:** Persist remote generation identity separately from local receipt time and apply a bounded revalidation policy when an index is absent or unreliable.

**Close only when:**

- Equal-sized remote updates are detected across host/client clock skew.
- A missing index cannot suppress revalidation indefinitely.
- Display age/source and distinguish cache fallback from confirmed current detail.

**Locations:** [RF candidate ASAR / main.js:2933](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L1554); [RF candidate ASAR / livestockDetail.js:589](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L3016).

### R2-PIPE-02 | P2 | Unstamped export freshness is still renewed after restart

**Area:** Data pipeline. **Evidence:** Candidate-source confirmation of the accepted unstamped-export path.

The content hash excludes weather and is not included in the persisted cache identity. On new in-memory state, the same unstamped export receives a new receipt-based lastLuaReceivedAt.

**End-user impact:** Old cached data can appear fresh after a restart; an unstamped weather-only update can also be missed by freshness detection. This is a legacy/unstamped-input path, not a claim that every current export lacks a timestamp.

**Required change:** Persist accepted source identity and production age. Keep transport receipt separate from generation time and cover every supported section in the identity contract.

**Close only when:**

- Restarting with identical unstamped bytes does not make them newly live.
- A genuinely new generation is recognized even when numeric farm values are unchanged.
- Weather-only changes and malformed timestamps have explicit, tested behavior.

**Locations:** [RF candidate ASAR / main.js:2053](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L1554); [RF candidate ASAR / main.js:2097](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L1554); [RF candidate ASAR / main.js:2447](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L1554).

### R2-PIPE-03 | P2 | Hold and snapshot logic still retains legitimately cleared sections

**Area:** Data pipeline. **Evidence:** Candidate-source confirmation.

Backup updates remember nonempty animals without clearing the prior backup on an authoritative empty result. Snapshot forwarding restores previous animals/stock when the next section is empty; stock and RF hold branches still conflate empty with unavailable.

**End-user impact:** Removed animals, exhausted stock or disabled optional data can reappear during fallback/restart, undermining confidence in the dashboard.

**Required change:** Represent collected-empty, omitted, failed and disabled states explicitly. Carry generation-scoped clears through in-memory hold, persisted snapshots and restart hydration.

**Close only when:**

- A valid empty collection remains empty through subsequent omission and restart.
- Disabled optional mods do not reappear from old snapshots.
- Failed collection may retain a labelled last-known value, never silently convert a clear into stale content.

**Locations:** [RF candidate ASAR / mergedSnapshotHold.js:466](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L3016); [RF candidate ASAR / mergedSnapshotHold.js:615](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L3016); [RF candidate ASAR / mergedSnapshotHold.js:645](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L3016); [RF candidate ASAR / mergedSnapshotHold.js:688](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L3016).

### R2-PIPE-04 | P2 | Detail generations are still dropped and zero pens can receive old animals

**Area:** Data pipeline. **Evidence:** Reproduced in isolated candidate-helper fixtures.

`makeCacheEntry` still drops generatedAt. A husbandry reporting zero animals accepted two retained detail rows and was marked hydrated. The newer code prefers some smaller unique-ID lists, but does not establish generation correctness or a zero-population tombstone.

**End-user impact:** Sold or removed animals can reappear as detail rows, and choosing the newest complete pen snapshot remains unreliable.

**Required change:** Carry generation through cache construction, choose detail by validated identity/generation rather than row count, and treat an authoritative zero population as a clear that rejects prior detail.

**Close only when:**

- generatedAt survives load/cache/selection round trips.
- A zero-head pen produces zero detail rows despite an old file on disk.
- A newer smaller herd wins over an older larger one, independent of filename ordering.

**Locations:** [RF candidate ASAR / detailAnimalsHydrate.js:65](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L3016); [RF candidate ASAR / detailAnimalsHydrate.js:115](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L3016); [RF candidate ASAR / detailAnimalsHydrate.js:233](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L3016).

### R2-PIPE-05 | P2 | Ambiguous fleet ownership is still promoted from farm heuristics

**Area:** Data pipeline. **Evidence:** Candidate-source confirmation.

The transient-pool resolver scores farms using livestock, land, current fleet and ADS presence, then writes the selected farm into ownerFarmId/farmId when the fallback applies.

**End-user impact:** An ambiguous ownership guess can become authoritative-looking fleet and financial data on the wrong farm.

**Required change:** Prefer explicit stable-ID ownership. Preserve unknown/ambiguous ownership and provenance rather than manufacturing an owner from farm characteristics.

**Close only when:**

- Two plausible farms do not cause arbitrary reassignment.
- Any fallback is labelled and excluded from authoritative farm totals until confirmed.
- Stable-ID and saved ownership cases continue to resolve without relying on scoring.

**Locations:** [RF candidate ASAR / dataMerger.js:2126](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L3016); [RF candidate ASAR / dataMerger.js:2183](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L3016).

### R2-PIPE-06 | P2 | One XML vehicle can still be consumed through two matching indices

**Area:** Data pipeline. **Evidence:** Reproduced using the candidate matching branches.

A configuration-key match removes a row from one list but leaves its UID index available. The fixture matched the same XML object first by configuration and then again by UID.

**End-user impact:** Distinct live vehicles can inherit the same saved identity, ownership or values, producing duplicate or misleading fleet information.

**Required change:** Use one consumed-record set and one removal operation across UID, farm/config and generic-config indices. Reserve authoritative UID matches before ambiguous fallback matching.

**Close only when:**

- A configuration match followed by a UID match cannot consume the same XML record twice.
- Repeated models on multiple farms retain their distinct identities.
- Order permutations produce stable one-to-one matches.

**Locations:** [RF candidate ASAR / dataMerger.js:2254](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L3016); [RF candidate ASAR / dataMerger.js:2272](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L3016); [RF candidate ASAR / dataMerger.js:2291](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L3016); [RF candidate ASAR / dataMerger.js:2316](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L3016).

### R2-PIPE-07 | P2 | Field IDs and farmland IDs still share a collision-prone seen set

**Area:** Data pipeline. **Evidence:** Candidate-source confirmation of one remaining branch.

The Lua-only append branch checks seenKeys against both field.id and farmlandId even though XML keys use farmlandId-or-id. A valid field can be suppressed because its field ID happens to equal a different record's farmland ID. The separate prior ownership-precedence branch was not fully re-executed here.

**End-user impact:** Valid fields may disappear from merged output when identifier domains collide.

**Required change:** Keep field identity and farmland ownership identity in separate indices and deduplicate only with an explicit matching contract.

**Close only when:**

- A field ID equal to another parcel's farmland ID does not remove either valid record.
- One farmland containing multiple fields is handled intentionally.
- Repeat the earlier owner-transfer/owner-zero fixtures before closing the broader prior finding.

**Locations:** [RF candidate ASAR / dataMerger.js:1725](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L3016).

### R2-PIPE-08 | P2 | XML change detection still misses changes below the maximum mtime

**Area:** Data pipeline. **Evidence:** Reproduced with a synthetic per-file stat fixture.

The fingerprint remains maximum mtime plus total size. Changing one file's mtime from 1000 to 2000 while another remained 9999 produced the same fingerprint, 9999:200.

**End-user impact:** A valid XML update can be skipped and old field/vehicle/economy data retained until another fingerprint component changes.

**Required change:** Fingerprint a stable per-file tuple of identity, size and modification time, with content/generation checks where metadata collisions are possible.

**Close only when:**

- A same-size change to any individual file invalidates the collection.
- Deletion, addition and replacement are detected independently of the newest other file.
- Retain parse avoidance for truly unchanged input.

**Locations:** [RF candidate ASAR / xmlCollector.js:1154](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L3016).

### R2-REL-01 | P2 | The Lua syntax gate still cannot start

**Area:** Validation. **Evidence:** Reproduced by the requested validation command.

`node tools/check-lua-syntax.mjs` exits with MODULE_NOT_FOUND for luaparse. No Lua files were parsed by this attempted gate.

**End-user impact:** The packaged mod has no successful current syntax-gate evidence from the declared command. JavaScript tests do not replace this.

**Required change:** Make the parser a reproducible declared development dependency or select an explicitly supported installed runtime. Keep syntax failure nonzero and include the check in release validation.

**Close only when:**

- A clean dependency installation can execute the checker without global packages.
- All intended Lua files are enumerated and parsed; the report states the actual count.
- A deliberately invalid temporary fixture makes the gate fail.

**Locations:** [tools/check-lua-syntax.mjs:15](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/tools/check-lua-syntax.mjs:15) (location reported by the command).

### R2-REL-02 | P2 | Integration cases still pass without exercising their assertions

**Area:** Validation. **Evidence:** Observed in the current Jest output.

The transient-pool integration case returned early when the expected remapped vehicle was absent. The live Giants HTTP-feed case returned early unless its opt-in environment was set. Jest counted both as passes.

**End-user impact:** Green totals overstate integration coverage, including a path whose missing result should be a regression rather than a pass.

**Required change:** Separate deterministic fixture tests from opt-in live tests. Make missing required fixture records fail, and report unavailable live cases as actual skips with reasons.

**Close only when:**

- Removing the expected ownership output fails a deterministic test.
- Disabled live integration is listed as skipped, not passed.
- Release evidence distinguishes unit, synthetic integration and real dedicated-server coverage.

**Locations:** [FS25_FarmDashboard_App/tests/mergeTransientPool.integration.test.js:157](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/tests/mergeTransientPool.integration.test.js:157) (location reported by the command); [FS25_FarmDashboard_App/tests/httpFeedXml.test.js:61](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/tests/httpFeedXml.test.js:61) (location reported by the command).

### R2-SEC-04 | P2 | Transport-only settings changes still do not refresh the live poller

**Area:** Security. **Evidence:** Reproduced in configuration fixtures; retained poller object confirmed in candidate source.

The server signature includes connection identity and secret revisions but omits ftpSecure and httpFeedSecure. Changing only either flag returns no reboot. The FTP coordinator retains its original server objects.

**End-user impact:** The settings screen can show a secure configuration while an already-running live poller still uses the previous transport until restart.

**Required change:** Include every supported transport/certificate field in lifecycle decisions, or resolve and apply current connection policy atomically on every operation.

**Close only when:**

- An FTPS-only change affects the next live, XML and detail operation.
- HTTPS-only and certificate-policy-only changes are applied consistently.
- Invalid certificates fail without downgrade; validate with an isolated real TLS server.

**Locations:** [Classic candidate ASAR / setupConfigMerge.cjs:52](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L773); [RF candidate ASAR / main.js:3078](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L1554).

### R3-DATA-05 | P2 | The new hydration hook still keeps stale detail and can skip a new save

**Area:** UI data. **Evidence:** Reproduced with the actual hook and a simulated hook lifecycle.

With the same save/farm/pen key, replacing the source generation did not re-fetch detail: health stayed 60 instead of 90. Switching A to B with the same pen ID cleared state in one effect, but the next effect read the old hydratedRef and skipped B's request. The fixture ended with an unhydrated B row and no B fetch.

**End-user impact:** Summaries can stop following current animal detail, or lose detail after a save/farm switch despite the initial snapshot now looking correct. The hook simulation is not an end-to-end Preact/browser race test.

**Required change:** Key hydration by save, farm, pen and source generation; reset the cache/ref atomically and keep request identity explicit. Do not let a prior-context cache suppress a new-context fetch.

**Close only when:**

- Same-save generation changes refresh already-hydrated pens.
- A-to-B switching with equal pen IDs fetches B and never displays or uses A detail as B.
- A-to-B-to-A, empty pens, failures/retry and unmounts pass under real Preact scheduling and deferred network responses.

**Locations:** [NEW APP/src/lib/use-hydrated-livestock.ts:30](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/use-hydrated-livestock.ts:30); [NEW APP/src/lib/use-hydrated-livestock.ts:51](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/use-hydrated-livestock.ts:51); [NEW APP/src/lib/use-hydrated-livestock.ts:69](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/use-hydrated-livestock.ts:69); [NEW APP/src/lib/use-hydrated-livestock.ts:88](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/use-hydrated-livestock.ts:88).

### R3-REL-03 | P2 | The new pasture summary tests exercise a copy of production logic

**Area:** Validation. **Evidence:** Direct review of the new test file.

`pastureStockSummary.test.js` defines its own summarizePastureAnimals function and asserts that copy. It does not import the production TypeScript function.

**End-user impact:** The tests can remain green when the real parser regresses or is changed independently, leaving the visible remediation unprotected.

**Required change:** Test the actual exported production helper through the TypeScript test toolchain, and add a rendered summary/detail regression using the same fixture.

**Close only when:**

- Changing the production summary arithmetic causes the test to fail.
- Measured zero, unknown health, unknown sex, weighted cluster counts and empty pens are exercised through production code.
- A frozen BigSky-style snapshot agrees across overview, pasture summary and animal table.

**Locations:** [FS25_FarmDashboard_App/tests/pastureStockSummary.test.js:3](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/tests/pastureStockSummary.test.js:3); [FS25_FarmDashboard_App/tests/pastureStockSummary.test.js:8](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/tests/pastureStockSummary.test.js:8).

### R3-SEC-05 | P2 | Classic-to-RF import drops secure transport policy

**Area:** Security. **Evidence:** Reproduced against the new edition-policy helper.

The import allowlist correctly removes passwords and feed codes, but also omits ftpSecure, FTP TLS policy and httpFeedSecure. The fixture imported a secure server with neither secure flag. The packaged FTP helper defaults an unspecified transport to plaintext.

**End-user impact:** After the user re-enters credentials, an imported connection can downgrade when the server accepts plaintext, or fail unexpectedly when it requires TLS.

**Required change:** Preserve validated non-secret transport settings during import, or import the connection disabled with an explicit transport confirmation. Continue excluding all secrets and LAN exposure settings.

**Close only when:**

- Import explicit FTPS and HTTPS feed configurations without copying credentials.
- Re-entering credentials retains the original secure transport and certificate policy.
- Unknown or obsolete transport values require a visible decision, never silent plaintext fallback.

**Locations:** [FS25_FarmDashboard_App/editionPolicy.cjs:141](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/editionPolicy.cjs:141); [RF candidate ASAR / ftpAccess.cjs:3](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L3016).

### R3-SEC-06 | P2 | IPC hardening covers launch, not the privileged bridge as a whole

**Area:** Security. **Evidence:** Source and URL-helper fixtures; exploit reachability remains conditional.

The new URL helper accepts arbitrary file:///.../index.html and setup.html paths. Sender checking uses webContents.getURL rather than senderFrame identity. The candidate still exposes configuration and LAN handlers without per-handler sender validation, while navigation accepts arbitrary file URLs.

**End-user impact:** An untrusted document or frame reaching the preload bridge would have more authority than intended. No such hostile-document entry path was established in this audit.

**Required change:** Centralize privileged IPC authorization using the known window/webContents, trusted main frame, exact packaged paths and exact loopback scheme/effective port. Apply it to reads containing secrets as well as writes.

**Close only when:**

- Reject outside files named index.html or setup.html, unexpected windows and child frames.
- Reject default-port localhost URLs when the application uses 8766/8768.
- Prove every privileged bridge handler invokes the shared guard; test permitted setup/dashboard flows too.

**Locations:** [FS25_FarmDashboard_App/editionPolicy.cjs:194](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/editionPolicy.cjs:194); [RF candidate ASAR / main.js:3173](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L1554); [RF candidate ASAR / main.js:3681](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L1554); [RF candidate ASAR / main.js:3701](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L1554); [RF candidate ASAR / main.js:3774](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L1554); [RF candidate ASAR / preload.js:12](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L3016); [Classic candidate ASAR / main.js:3638](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L773).

### R2-BACK-01 | P3 | Early image-export failures still ignore dialog suppression

**Area:** UI recovery. **Evidence:** Candidate-source confirmation.

The unsupported-platform and missing-script exits call native dialogs directly despite suppressNative being available. Later errors use the shared presentation path.

**End-user impact:** A browser/UI-triggered failure can unexpectedly open a native desktop dialog instead of remaining in its requesting surface.

**Required change:** Send all early and late export errors through the same presentation policy and return a structured result.

**Close only when:**

- Every early failure with suppressNative:true opens no native dialog.
- The desktop invocation still presents an intentional dialog when suppression is false.

**Locations:** [RF candidate ASAR / main.js:372](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L1554); [RF candidate ASAR / main.js:377](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L1554); [RF candidate ASAR / main.js:388](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt#L1554).

## 2. What improved, with evidence boundaries

- **Cow-stall summary:** the existing development UI now showed 209 animals, 98% health, 3 males and 206 females for BigSky Cow Stall. Its animal table also reported 209 animals and 98% average health, with individual rows such as a 50% health bull. This corrects the earlier zero-summary display on the loaded snapshot.
- **Warnings:** the development overview now displayed 13 pasture warnings instead of the previous zero. A frozen warning-ID/severity comparison across both editions is still needed.
- **Settings presentation:** the inspected Settings modal had an opaque, readable surface and a dimmed background. Loading eventually changed to Save. No settings were changed or saved during the walkthrough; failed hydration and auth focus were not newly certified.
- **Setup activation implementation:** packaged Classic setup explicitly invokes the new launch IPC after saving. The main process contains a dashboard navigation path independent of an unchanged-config reboot. Actual newly installed acceptance remains pending.
- **Edition identity implementation:** candidate code sets distinct profile/session paths before Store and the single-instance lock, and selects separate production ports. This is source evidence, not proof that the new installed pair coexists successfully.
- **Installer policy implementation:** new edition allowlists are disjoint and installer contract tests pass. No real uninstall was performed.
- **Automated health:** the ordinary JavaScript/TypeScript checks pass, production advisories are zero and the selected artifact hashes match their manifest. These successes do not override the negative boundary fixtures.

![Development snapshot showing pasture summary and animal table](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-pasture-snapshot.jpg)

The screenshot is from the existing development Electron app on port 8767, showing Snap XML. It is not a new packaged installation or a live game measurement. A transient tab overlap seen during an earlier capture settled on the retained capture and is not counted as a confirmed layout defect.

## 3. Validation run ledger

### Jest application suite: Pass with integration caveats

**Result:** 53 suites; 531 tests.

**Command/method:** `npm test --prefix FS25_FarmDashboard_App -- --runInBand`.

Two internal early returns were counted as passes; no live Giants feed or required transient-pool fixture assertion was exercised by those cases.

### Node ESM suite: Pass

**Result:** 82 tests.

**Command/method:** `npm run test:mjs --prefix FS25_FarmDashboard_App`.

Mixed CommonJS/ESM interpretation warnings remain, but no test failure.

### NEW APP TypeScript: Pass

**Result:** Exit 0.

**Command/method:** `.\NEW APP\node_modules\.bin\tsc.cmd --noEmit --project .\NEW APP\tsconfig.json`.

Type safety only; not UI lifecycle or response-order proof.

### Packaging manifest guard: Pass

**Result:** Exit 0.

**Command/method:** `npm run verify:electron-pack --prefix FS25_FarmDashboard_App`.

Does not replace installation, Authenticode or actual packed-runtime acceptance.

### Translation key/placeholder verification: Pass

**Result:** 2231/2231 across 26 reported locales.

**Command/method:** `npm run i18n:verify --prefix FS25_FarmDashboard_App`.

No missing keys or placeholder drift. This is not a translation-quality, truncation or accessibility certification.

### Production dependency advisories: Pass

**Result:** 0 reported vulnerabilities.

**Command/method:** `npm audit --omit=dev --json --prefix FS25_FarmDashboard_App`.

Current registry result; excludes application logic vulnerabilities and does not certify runtime support.

### Lua syntax gate: Blocked

**Result:** MODULE_NOT_FOUND: luaparse.

**Command/method:** `node tools/check-lua-syntax.mjs`.

No Lua files parsed by this attempted gate; no dependencies installed to repair it.

### Focused boundary/hydration diagnostics: Counterexamples found

**Result:** Origin, traversal, persistence, import, IPC and hydration.

**Command/method:** `Retained-source isolated fixtures`.

No live exploit, credentials, network transfers or filesystem mutations. The hook scheduler is simulated. One ftpRejectUnauthorized probe is non-contract and excluded from findings; the actual optional TLS field is ftpAllowInsecureTls.

### Focused pipeline diagnostics: Counterexamples found

**Result:** Zero pens, generation loss, duplicate match, XML identity and HTTP deadline.

**Command/method:** `Retained candidate snippets with fake I/O/clocks`.

Diagnostic programs exit 0 after printing results; they are not assertion-based green test suites.

### Selected candidate identity: Pass

**Result:** Four SHA-256 hashes match MANIFEST.txt.

**Command/method:** `Get-FileHash -Algorithm SHA256`.

Both app installers and both named mod ZIPs matched the coexist manifest. Feed target/version fields were inspected; SHA-512 feed hashes were not recomputed.

### Windows Authenticode: Unsigned

**Result:** Both installers: NotSigned.

**Command/method:** `Get-AuthenticodeSignature`.

No SmartScreen bypass, signing change or installer execution performed.

### Desktop computer-use walkthrough: Partial

**Result:** Development snapshot, not installed live game.

**Command/method:** `Existing development Electron window through Computer Use`.

Overview/pasture/table and Settings were inspected. The game was no longer listed after resuming. No desktop configuration was saved.

### Diagnostic evidence, not a green test suite

The two retained fixtures reproduce the inspected source in isolated VMs. They do not call the real game, send real FTP requests, use real credentials or change real cache files. The hydration fixture uses a minimal simulated hook scheduler; it needs a follow-on test with actual Preact scheduling. The XML matching fixture executes the relevant candidate matching branches with synthetic indices. HTTP timing uses a fake clock and stream events, not a measured live transfer.

[Boundary and hydration diagnostic](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-boundary-harness.cjs)

[Pipeline diagnostic](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-pipeline-harness.cjs)

These diagnostics embed the inspected source snapshots. Re-running them later replays that snapshot, not a subsequently changed workspace. To verify future fixes, transfer the cases into tests that import the actual production implementation.

Both diagnostics print evidence and may exit 0 with failed expectations. They must not be substituted for assertion-based release tests. One exploratory ftpRejectUnauthorized case uses a non-contract field and is excluded from the findings. The valid confirmed signature omissions are ftpSecure and httpFeedSecure; the actual optional TLS field is ftpAllowInsecureTls.

## 4. Exact candidate and installed identity

### Selected private bundle

`C:/Users/Graham/Documents/FarmDash Release Candidates/2026-09-05-remediation-coexist`

The separate remediation-b folder also exists. This audit selected remediation-coexist to avoid mixing same-version builds. Its four named artifacts matched the recorded SHA-256 values:

- [FS25-Farm-Dashboard-Setup-4.2.2.exe](C:/Users/Graham/Documents/FarmDash%20Release%20Candidates/2026-09-05-remediation-coexist/FS25-Farm-Dashboard-Setup-4.2.2.exe): version `4.2.2`, 974,336,223 bytes, Authenticode `NotSigned`. SHA-256: `6E066E72CFA34D7BC72CC78B2FA9C612249C86E8CB1B6556B61BD688D27BEB77`.
- [RF-edition/FS25-Farm-Dashboard-RF-Setup-5.0.1.exe](C:/Users/Graham/Documents/FarmDash%20Release%20Candidates/2026-09-05-remediation-coexist/RF-edition/FS25-Farm-Dashboard-RF-Setup-5.0.1.exe): version `5.0.1`, 974,337,829 bytes, Authenticode `NotSigned`. SHA-256: `D6C08A41BD6C77A1D48B7835DE4B8ABD3A305FD9EE1FF5941270BBBB0BE104B0`.
- [FS25_FarmDashboard-classic-3.4.0.8.zip](C:/Users/Graham/Documents/FarmDash%20Release%20Candidates/2026-09-05-remediation-coexist/FS25_FarmDashboard-classic-3.4.0.8.zip): version `3.4.0.8`. SHA-256: `474D4C3A9E9EAEC0C21F1381ABD47292629617585CCF0314E35F6AF69D1C0C57`.
- [RF-edition/FS25_FarmDashboard-rf-5.0.0.1.zip](C:/Users/Graham/Documents/FarmDash%20Release%20Candidates/2026-09-05-remediation-coexist/RF-edition/FS25_FarmDashboard-rf-5.0.0.1.zip): version `5.0.0.1`. SHA-256: `751CDBF75C66F5531DC0E62215D86DBFB22ED601A24E139F3527B4DF81F834EF`.

Both installer signatures were directly checked and returned **NotSigned**. This is not inferred from build output. Do not bypass SmartScreen or describe these as signed releases.

The selected Classic feed names the Classic 4.2.2 executable; the RF feed is latest-rf.yml and names RF 5.0.1. Their target/version fields were inspected. The feed SHA-512 values were not independently recomputed in this pass. The ZIP modDesc versions were read as Classic 3.4.0.8 and RF 5.0.0.1. No running game pairing was certified.

### Installed copies are not acceptance evidence for this bundle

The installed package metadata still reports Classic 4.2.2 and RF 5.0.1, but those version labels also occur on the earlier candidates. The installed Classic main.js has 3996 lines and the earlier shared production-port resolver; the new candidate main.js has 4167 lines and invokes editionPolicy before Store. Installed archive modification times were 11:53 and 11:56, earlier than the remediation builds.

This establishes an installed Classic/candidate mismatch and leaves the RF installed pairing uncertified. Do not use the visible version alone to decide which fixes have actually shipped. Use unique private build identity plus artifact hashes.

No installers were executed in this re-audit. Action-time approval for the new unsigned pair is still needed before continuing installation. No public release or update feed was published, replaced or uploaded.

## 5. Original installed-failure acceptance crosswalk

### CUA-01: Classic/RF coexistence

**Status: Implemented mechanism; installed acceptance pending.** The candidate applies edition-specific userData/sessionData before Store and the single-instance lock; ports resolve to Classic 8766 and RF 8768. The installed Classic still contains the earlier shared-port main.js. No newly installed side-by-side run was performed.

### CUA-02: Classic unchanged-setup launch

**Status: Source fix present; installed acceptance pending.** Packaged setup now invokes launchDashboard after saving, and the main process explicitly navigates to the dashboard even without a server reboot. The actual installer journey, double-submit and navigation-failure cases are not closed.

### CUA-03: Pasture summary/detail agreement

**Status: Observed snapshot improvement; lifecycle defects remain.** Development UI shows 209 animals, 98% health, 3 males and 206 females for BigSky Cow Stall. The animal table reports 209 and 98%. The new hook still fails generation/same-ID save-switch fixtures.

### CUA-04: Selected save survives setup

**Status: Not reverified.** The visible development session remained on Montana; no unchanged-settings setup round-trip or fresh RF install restart was executed. The new hydration same-ID switch defect is separate from selection persistence.

### SRC-05: Edition-scoped uninstall ownership

**Status: Policy/test progress; destructive acceptance pending.** Edition allowlists are disjoint and installer source-contract tests pass. No uninstall was run; Keep/Full/upgrade ownership and preservation of browser preferences still need disposable-profile tests.

## 6. All 35 previous findings: closure crosswalk

This section prevents an untested item disappearing between audit rounds. "Still present" means the inspected candidate contains a remaining mechanism, not that every old subcase was repeated. "Remaining branch confirmed" explicitly limits the current conclusion to the branch described. "Not reverified" is neither a fix nor a new failure claim. Historical details remain in [the prior full re-audit](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-application-and-mod-reaudit.md).

### R2-DATA-01 | P1 | A late bootstrap response can still display one save under another save's name

**Status: Not reverified.** Previous evidence retained; no sufficient current closure test in this pass.

Do not interpret the green generic suites as closure. Repeat the specific prior regression against the intended current build.

**Required closure evidence:** Delay initial A beyond splash dismissal, switch to B and complete B then A. B must remain selected with B's payload. Cover bootstrap, manual refresh, fallback polling and WS overlap.

**Execution-plan mapping:** WP-04.

### R2-MOD-01 | P1 | Nonthrowing I/O failures can still be reported as successful export replacement

**Status: Still present.** Confirmed in the newly packaged RF mod source; no game fault injection.

The copy wrapper discards copyFile's result and accepts a nonthrowing call plus an existing destination. Move recovery can then delete the source. Atomic/direct/mirror write paths do not consistently check write and close outcomes; saveFile fallback equates pcall success with persisted success.

**Required closure evidence:** Fault-inject false-return copy/write/close/save operations, including an existing destination. Previous bytes remain usable, no success notification is emitted and a later valid retry recovers.

**Execution-plan mapping:** WP-10.

### R2-SEC-01 | P1 | Opaque browser origins still receive loopback trust

**Status: Still present.** Reproduced in isolated candidate-code fixtures.

`getRequestOrigin` turns explicit Origin: null and malformed origins into an empty string. Both the write guard and WebSocket origin guard then take the no-origin local-client branch. The fixture accepted both, while rejecting an ordinary hostile HTTPS origin.

**Required closure evidence:** Hostile, malformed and explicit null origins fail for WS, livestock requests and export. Authorized native/desktop clients continue to work.

**Execution-plan mapping:** WP-09.

### R2-SEC-02 | P1 | FTP detail listing filenames can escape the Windows cache root

**Status: Still present.** Reproduced in an isolated Windows-path fixture.

`syncFtpDetailsCache` only checks that a remote entry starts with animals_ and ends with .json. Backslashes and traversal components survive into path.join. A mocked listing directed the download to C:\audit\outside.json instead of the userData subtree.

**Required closure evidence:** Malicious MLSD/Unix listing entries never initiate outside-root writes. Legitimate integer and composite animal filenames continue to sync.

**Execution-plan mapping:** WP-09.

### R2-UI-01 | P1 | The new focus trap moves password typing back into the username field

**Status: Not reverified.** Previous evidence retained; no sufficient current closure test in this pass.

Do not interpret the green generic suites as closure. Repeat the specific prior regression against the intended current build.

**Required closure evidence:** Type an entire username/password normally without focus moving unexpectedly; changing input state or delivering a live payload must not reset focus. Escape and focus restoration must still work.

**Execution-plan mapping:** WP-08.

### R2-DATA-02 | P2 | Concurrent requests for the same save can overwrite newer data with older data

**Status: Not reverified.** Previous evidence retained; no sufficient current closure test in this pass.

Do not interpret the green generic suites as closure. Repeat the specific prior regression against the intended current build.

**Required closure evidence:** Reverse same-save HTTP completion and interleave HTTP with newer WS revisions. The displayed source revision never decreases.

**Execution-plan mapping:** WP-04.

### R2-DATA-03 | P2 | An authoritative zero herd size still preserves nonzero cluster rows

**Status: Not reverified.** Previous evidence retained; no sufficient current closure test in this pass.

Do not interpret the green generic suites as closure. Repeat the specific prior regression against the intended current build.

**Required closure evidence:** For targets0,1,5 and larger values, emitted counts sum to the authoritative target before any explicit display cap. Missing totals must follow a different documented fallback.

**Execution-plan mapping:** WP-05 / WP-10.

### R2-DATA-04 | P2 | The display formatter still turns a zero-health synthetic animal into100%

**Status: Not reverified.** Previous evidence retained; no sufficient current closure test in this pass.

Do not interpret the green generic suites as closure. Repeat the specific prior regression against the intended current build.

**Required closure evidence:** A synthetic zero-health row renders0% with the appropriate warning; a genuinely unknown reading is identified as unknown or explicitly estimated, never silently healthy.

**Execution-plan mapping:** WP-05.

### R2-MOD-02 | P2 | Population correction changes counts without reconciling the statistics they divide

**Status: Still present.** Packaged-mod source confirmation.

Sampled buckets scale count and weighted sums together, then correct count alone to meet the reported population. Later averages divide unchanged sums by corrected counts. The inspected average helper also drops nonpositive sums, so measured all-zero health does not become an explicit aggregate zero.

**Required closure evidence:** Uniform-population samples preserve their averages after up/down correction. Every category total is between0 and the corresponding population, and all buckets reconcile to the authoritative total.

**Execution-plan mapping:** WP-05 / WP-10.

### R2-MOD-03 | P2 | The cached finance path still falls back to purchase price instead of resale value

**Status: Still present.** Packaged-mod source confirmation.

The incremental-fleet finance branch reads row.sellValue, row.sellPrice or row.price. The inspected vehicle serializer writes purchase price into row.price and the shown sell-value path stores it under ads.sellValue.

**Required closure evidence:** The same depreciated fleet and farm scope produces equivalent asset valuation with Courseplay enabled or disabled, including owned, leased and unknown-owner rows.

**Execution-plan mapping:** WP-10.

### R2-MOD-04 | P2 | The remaining Courseplay shield still traverses the full fleet twice per update

**Status: Still present.** Packaged-mod source confirmation; no FPS benchmark.

FarmDashboard:update calls the compatibility tick. When Courseplay is loaded, shieldFleetIfNeeded performs two complete fleet passes on each tick, without the no-Courseplay pending-work gate.

**Required closure evidence:** Instrument examined vehicles across an unchanged fleet and newly loaded vehicles. Idle updates perform no recurring full scans while newly eligible vehicles still receive protection.

**Execution-plan mapping:** WP-10.

### R2-MOD-05 | P2 | Runtime cadence changes do not update the adaptive scheduler's requested-value cache

**Status: Still present.** Packaged-mod source confirmation.

_userCollectionCycleMs is captured during config load and preferred by adaptive cadence. The inspected synced-settings and setInt paths update config.collectionCycleMs but not that requested-value field.

**Required closure evidence:** Increase and decrease cadence through local and synchronized settings, trigger adaptive probes and save/reload. The requested preference is never overwritten by an obsolete cached value.

**Execution-plan mapping:** WP-10.

### R2-MOD-06 | P2 | Coroutine and legacy collector failures still look like successful fresh collection

**Status: Remaining branch confirmed.** Packaged-mod source confirmation; full scheduler fault injection outstanding.

`safeCollect` returns an empty table both for missing/failed collection and for empty results, without an error status. Legacy collection consumes that result, and other completion paths still update cached data/finish slices without a uniform failure envelope.

**Required closure evidence:** Inject a failure into each supported collector mode. Failed sections are marked failed/stale; successful emptiness still clears old data and does not trigger failure fallback.

**Execution-plan mapping:** WP-10.

### R2-MOD-07 | P2 | Station-name guesses still generate unverified selling offers

**Status: Still present.** Packaged-mod source confirmation.

Although synthetic whole stations were removed, Method 8 still inserts products and fixed multipliers into existing named stations, including Grain Mill and Biogas Plant. Those prices feed the crop min/max/best-location calculation.

**Required closure evidence:** A wheat-only mill never receives a soybean offer through name matching. Every actionable destination/product/price pair corresponds to an actual station offer.

**Execution-plan mapping:** WP-10.

### R2-MOD-08 | P2 | Bale scanning charges accepted entries rather than all traversal work

**Status: Still present.** Packaged-mod source confirmation.

The iterator restarts pairs over a source table, skips previously seen entries, and increments its cap primarily for newly accepted entries. A large table of non-bale or already-seen objects can therefore require a broad scan in one slice.

**Required closure evidence:** Instrument examined entries on large eligible/ineligible tables. Every slice stays within its work budget and final output is complete and deduplicated.

**Execution-plan mapping:** WP-10.

### R2-PERF-01 | P2 | Pollers still overlap and stale work can overwrite replacement server state

**Status: Remaining branch confirmed.** Candidate-source confirmation of the overlapping FTP branch.

The interval starts another batch without awaiting the previous batch. Poll generation checks occur before safeDownload and after it, but safeDownload replaces the final file internally before the post-download generation check. Generation-specific temporary names do not prevent an older operation from committing the shared final file.

**Required closure evidence:** Slow cycles never overlap. Old completions cannot mutate replacement state. Repeated watcher failures leave exactly one live scheduler and no orphan debounce.

**Execution-plan mapping:** WP-09.

### R2-PERF-02 | P2 | An active HTTP response can outlive the advertised total deadline

**Status: Still present.** Reproduced with candidate code and a simulated trickle response.

The 45-second deadline is checked when entering a request/redirect, but there is no independent wall-clock cancellation timer for an active body. A mocked stream was still pending at 60 seconds and then returned HTTP 200. Response aborted/error settlement also remains incomplete in the inspected function.

**Required closure evidence:** Trickle, stalled, aborted and truncated fixtures terminate within the total deadline. Valid bounded redirects and normal responses still succeed.

**Execution-plan mapping:** WP-09.

### R2-PIPE-01 | P2 | Detail caches can still remain stale when indexes or clocks are unreliable

**Status: Still present.** Candidate-source confirmation.

Bulk detail sync compares remote mtime with the downloaded file's local mtime. Per-pen detail re-fetches only when dirtyAt is positive and newer than the local timestamp; a cached file with a missing index can therefore be reused indefinitely.

**Required closure evidence:** Equal-length changes are visible; missing-index data refreshes within a documented interval; source/client clock offsets do not prevent updates.

**Execution-plan mapping:** WP-09.

### R2-PIPE-02 | P2 | Unstamped exports regain freshness on restart and omit some generation changes

**Status: Still present.** Candidate-source confirmation of the accepted unstamped-export path.

The content hash excludes weather and is not included in the persisted cache identity. On new in-memory state, the same unstamped export receives a new receipt-based lastLuaReceivedAt.

**Required closure evidence:** Restart/retrieval preserves the age of identical unstamped exports. A genuinely new source generation restores freshness even when ordinary farm values do not change.

**Execution-plan mapping:** WP-10.

### R2-PIPE-03 | P2 | Hold and last-good helpers can resurrect cleared animals, stock and RF data

**Status: Still present.** Candidate-source confirmation.

Backup updates remember nonempty animals without clearing the prior backup on an authoritative empty result. Snapshot forwarding restores previous animals/stock when the next section is empty; stock and RF hold branches still conflate empty with unavailable.

**Required closure evidence:** Exercise populated-to-empty animals and stock, RF disable, persistence and restart end-to-end. Successful emptiness remains empty; a genuine collection failure retains only clearly stale fallback data.

**Execution-plan mapping:** WP-05 / WP-10.

### R2-PIPE-04 | P2 | Detail generation is dropped before comparison and stale animals attach to zero-count pens

**Status: Still present.** Reproduced in isolated candidate-helper fixtures.

`makeCacheEntry` still drops generatedAt. A husbandry reporting zero animals accepted two retained detail rows and was marked hydrated. The newer code prefers some smaller unique-ID lists, but does not establish generation correctness or a zero-population tombstone.

**Required closure evidence:** Both enumeration orders select the newest compatible generation. A zero pen has no stale individuals, and genuine empty detail is a valid result rather than a reason to resurrect older rows.

**Execution-plan mapping:** WP-05 / WP-10.

### R2-PIPE-05 | P2 | Unresolved vehicle ownership is still inferred from unrelated farm characteristics

**Status: Still present.** Candidate-source confirmation.

The transient-pool resolver scores farms using livestock, land, current fleet and ADS presence, then writes the selected farm into ownerFarmId/farmId when the fallback applies.

**Required closure evidence:** For ambiguous records, changing livestock, field or fleet counts does not change ownership. Only authoritative matching evidence assigns an owner.

**Execution-plan mapping:** WP-07 / WP-10.

### R2-PIPE-06 | P2 | Configuration and UID indexes can reuse the same saved vehicle for two live records

**Status: Still present.** Reproduced using the candidate matching branches.

A configuration-key match removes a row from one list but leaves its UID index available. The fixture matched the same XML object first by configuration and then again by UID.

**Required closure evidence:** Mixed configuration/UID matches in either order remain one-to-one. A consumed saved record can never enrich a second live vehicle.

**Execution-plan mapping:** WP-10.

### R2-PIPE-07 | P2 | Saved ownership still wins and field/farmland ID collisions drop live-only fields

**Status: Remaining branch confirmed.** Candidate-source confirmation of one remaining branch.

The Lua-only append branch checks seenKeys against both field.id and farmlandId even though XML keys use farmlandId-or-id. A valid field can be suppressed because its field ID happens to equal a different record's farmland ID. The separate prior ownership-precedence branch was not fully re-executed here.

**Required closure evidence:** Test transfer, relinquishment, added fields and overlapping field/farmland numbers. Live ownership and all distinct valid fields survive merging.

**Execution-plan mapping:** WP-10.

### R2-PIPE-08 | P2 | Aggregate XML fingerprints still collide for masked optional-file changes

**Status: Still present.** Reproduced with a synthetic per-file stat fixture.

The fingerprint remains maximum mtime plus total size. Changing one file's mtime from 1000 to 2000 while another remained 9999 produced the same fingerprint, 9999:200.

**Required closure evidence:** Same-size optional rewrites with preserved/masked timestamps and optional-file creation/deletion produce a changed fingerprint; unchanged inputs remain stable.

**Execution-plan mapping:** WP-10.

### R2-REL-01 | P2 | The Lua syntax check cannot start after the dependency refresh

**Status: Still present.** Reproduced by the requested validation command.

`node tools/check-lua-syntax.mjs` exits with MODULE_NOT_FOUND for luaparse. No Lua files were parsed by this attempted gate.

**Required closure evidence:** A clean dependency install can run the checker over all shipped Lua files and reports real parse results; the gate fails CI on a deliberate syntax fixture.

**Execution-plan mapping:** WP-11.

### R2-REL-02 | P2 | The ownership integration test returns successfully when its expected result is absent

**Status: Still present.** Observed in the current Jest output.

The transient-pool integration case returned early when the expected remapped vehicle was absent. The live Giants HTTP-feed case returned early unless its opt-in environment was set. Jest counted both as passes.

**Required closure evidence:** Deliberately break remapping or expected ownership and this test fails. Missing optional live prerequisites are reported as skipped, while the hermetic equivalent always executes.

**Execution-plan mapping:** WP-11.

### R2-SEC-03 | P2 | Raw map identifiers still select overview images outside the source root

**Status: Not reverified.** Previous evidence retained; no sufficient current closure test in this pass.

Do not interpret the green generic suites as closure. Repeat the specific prior regression against the intended current build.

**Required closure evidence:** Outside overview fixtures cannot be selected or returned; legitimate custom map exports still resolve.

**Execution-plan mapping:** WP-09.

### R2-SEC-04 | P2 | Transport-only saves can leave the live poller on plaintext FTP

**Status: Still present.** Reproduced in configuration fixtures; retained poller object confirmed in candidate source.

The server signature includes connection identity and secret revisions but omits ftpSecure and httpFeedSecure. Changing only either flag returns no reboot. The FTP coordinator retains its original server objects.

**Required closure evidence:** A transport-only save changes the next operation on every FTP path. Invalid certificates fail closed. UI status reflects the active transport and any explicit legacy choice.

**Execution-plan mapping:** WP-09.

### R2-UX-01 | P2 | HTTP discovery errors are treated as a successful empty server list

**Status: Not reverified.** Previous evidence retained; no sufficient current closure test in this pass.

Do not interpret the green generic suites as closure. Repeat the specific prior regression against the intended current build.

**Required closure evidence:** First discovery returns503, then200 with saves. The UI recovers the save selector without reloading;401 triggers authentication rather than an empty configuration.

**Execution-plan mapping:** WP-04.

### R2-UX-02 | P2 | Failed settings hydration still enables saving unloaded defaults

**Status: Not reverified.** Previous evidence retained; no sufficient current closure test in this pass.

Do not interpret the green generic suites as closure. Repeat the specific prior regression against the intended current build.

**Required closure evidence:** Fail each load stage and ensure unloaded sections cannot be persisted. Fail each save stage and display exact committed/failed sections without a generic saved/synced claim.

**Execution-plan mapping:** WP-08.

### R2-UX-03 | P2 | Authentication still proceeds on timeout and clears valid credentials on network failure

**Status: Not reverified.** Previous evidence retained; no sufficient current closure test in this pass.

Do not interpret the green generic suites as closure. Repeat the specific prior regression against the intended current build.

**Required closure evidence:** Cover early completion, >30s login, hung network,401, temporary outage and double-submit. No protected bootstrap occurs before authorization and saved credentials survive transport errors.

**Execution-plan mapping:** WP-08.

### R2-UX-04 | P2 | SimHub waits for authentication before mounting the component that performs it

**Status: Not reverified.** Previous evidence retained; no sufficient current closure test in this pass.

Do not interpret the green generic suites as closure. Repeat the specific prior regression against the intended current build.

**Required closure evidence:** A direct unauthenticated SimHub URL shows login immediately; cached authorization verifies without the artificial30s delay;401/403/503/non-JSON responses have clear recoverable states.

**Execution-plan mapping:** WP-08.

### R2-UX-05 | P2 | A missing Windows save path is still described as rejected credentials

**Status: Not reverified.** Previous evidence retained; no sufficient current closure test in this pass.

Do not interpret the green generic suites as closure. Repeat the specific prior regression against the intended current build.

**Required closure evidence:** ENOENT/ENOTDIR paths under C:\Users map to path errors;EACCES maps to permissions;real401/403/auth rejection remains authentication-specific.

**Execution-plan mapping:** WP-08.

### R2-BACK-01 | P3 | Early image-export failures ignore native-dialog suppression

**Status: Still present.** Candidate-source confirmation.

The unsupported-platform and missing-script exits call native dialogs directly despite suppressNative being available. Later errors use the shared presentation path.

**Required closure evidence:** All early failures honor suppressNative:true and return the expected structured error without native dialogs.

**Execution-plan mapping:** WP-08 / WP-11.

## 7. Execution-plan work-package disposition

No package is marked complete solely because an implementation file exists or a version was bumped.

### WP-00: Freeze the baseline and turn observations into reproducible evidence

**Partial.** Two private folders and checksum manifests exist. The selected coexist bundle hashes match. Installed version labels still match older binaries, so record hashes/build IDs rather than versions alone.

### WP-01: Decouple saving configuration from launching the dashboard

**Partial.** The new launch IPC/navigation path is packaged. Its installed unchanged-config and failure-recovery acceptance remains outstanding.

### WP-02: Give each edition a deliberate runtime identity and coexistence policy

**Partial.** Separate profile/session directories and ports are implemented. Actual coexistence, peer write coordination, migration failures and cleanup need disposable-profile validation.

### WP-03: Make installer, locale and uninstall ownership edition-safe

**Partial.** Edition allowlists and English-default source tests pass; real clean/upgrade/Keep/Full cases have not been completed here.

### WP-04: Persist RF save context and reject obsolete data

**Partial.** New hydration cancellation exists but context reset and generation refresh fail focused fixtures. The previous bootstrap/same-save HTTP races have not been freshly closed.

### WP-05: Build one truthful livestock summary/detail model

**Partial.** The loaded cow summary is fixed. Detail zero tombstones, generations, sample averages and production-linked test coverage still fail.

### WP-06: Unify pasture warnings and resource confidence

**Partial.** The overview now shows 13 warnings. Frozen cross-surface warning sets, warning severity, unknown resources and alert transitions are not fully verified.

### WP-07: Reconcile fleet and weather discrepancies without guessing

**Open acceptance.** The development UI shows 41 vehicles and 6 pallets, but no frozen stable-ID Classic/RF comparison was performed. Weather captures from different generations are not parity evidence.

### WP-08: Refine setup, modal accessibility and failure recovery

**Partial.** Settings is now visibly opaque/readable and loading resolves to Save. The former auth focus, credential retry, SimHub gate and failed-settings hydration cases remain unverified.

### WP-09: Close the carried-forward security and transport release gates

**Blocked.** Opaque origins, FTP listing traversal and transport-only refresh defects remain; new import policy and IPC limitations also require attention.

### WP-10: Repair exporter, merge and freshness contracts behind the UI

**Blocked.** Write integrity, freshness, one-to-one matching, valid clears and several mod budget/valuation paths remain unresolved.

### WP-11: Make regression and packaging gates reproducible

**Partial.** 531 Jest, 82 Node, typecheck, packaging and i18n pass; dependency advisories are zero. Lua cannot start, two cases pass vacuously, and one new test uses copied logic.

### WP-12: Run the installed, live-save and dedicated acceptance campaign

**Not completed.** Installed Classic is old; no new dual-install smoke, live Classic mod run, dedicated reconnect or fault/soak acceptance was executed. The game was no longer open after resuming.

### WP-13: Prepare a controlled tester handoff without changing the public story

**Hold.** Both selected candidate installers are unsigned. Preserve public 4.2.1, do not upload candidate feeds, and do not send this as a cleared tester build.

## 8. Recommended repair and retest sequence

This is the next execution order, not a claim that these changes were performed. Keep one owner for shared main-process changes, and keep fixes small enough to attach a precise regression result to each one. Do not rebuild another same-version candidate before the first security and persistence gates are closed.

### Stage A: Close trust and persistence blockers

**Priority:** P1. **Owner:** Electron/backend + mod owner. **Depends on:** No earlier stage.

**Issues:** R2-SEC-01, R2-SEC-02, R2-MOD-01, R3-PIPE-09, R3-SEC-06.

1. Centralize request-origin and IPC authorization and cover the entire route/bridge surface, not only the new launch handler.

2. Validate FTP filenames and contained destinations before any filesystem action; use one shared safe path contract.

3. Implement last-good-preserving replacement with explicit copy/write/close success for desktop and mod paths.

4. Turn the isolated counterexamples into production-linked failing regression tests, then close them before rebuilding.

**Exit gate:** No opaque-origin or cache-escape acceptance; failed replacement preserves original bytes; privileged sender tests pass.

### Stage B: Make data identity and clears authoritative

**Priority:** P2 release-critical data. **Owner:** Frontend + pipeline owner. **Depends on:** A.

**Issues:** R3-DATA-05, R2-PIPE-01, R2-PIPE-02, R2-PIPE-03, R2-PIPE-04, R2-PIPE-06, R2-PIPE-07, R2-PIPE-08.

1. Define save/farm/source-generation identity and propagate it from collection through disk, merge, HTTP/WS and hydration.

2. Fix zero/empty/omitted/failed semantics and persist generation-scoped clears.

3. Make detail hydration refreshable and context-safe; use one-to-one entity matching and separate field/farmland indices.

4. Replace aggregate metadata fingerprints with per-file identities and bound missing-index revalidation.

5. Run real Preact deferred-response cases as well as backend fixtures.

**Exit gate:** No stale generation or old animal can reappear after clear, switch, refresh or restart; no XML entity is consumed twice.

### Stage C: Finish transport and efficiency lifecycle

**Priority:** P2. **Owner:** Backend + mod owner. **Depends on:** A, B.

**Issues:** R2-SEC-04, R3-SEC-05, R2-PERF-01, R2-PERF-02, R2-MOD-04, R2-MOD-05, R2-MOD-08.

1. Preserve secure non-secret connection policy in import and apply policy changes to every active transfer path.

2. Serialize per-server polls and recheck cancellation immediately before commit.

3. Use an absolute HTTP deadline with complete abort/error cleanup.

4. Gate Courseplay repair work on pending transitions and budget every inspected inventory entry.

5. Profile iteration counts and slice durations with realistic large herds/fleets instead of relying on nominal caps.

**Exit gate:** No silent transport downgrade, overlapping per-context commits or unbounded trickle requests; large-save slice budgets are measured.

### Stage D: Finish domain truth and end-user recovery

**Priority:** P2/P3. **Owner:** Frontend/domain + mod owner. **Depends on:** B.

**Issues:** R2-MOD-02, R2-MOD-03, R2-MOD-06, R2-MOD-07, R2-BACK-01.

1. Separate sample means from population estimates and preserve known zero values.

2. Use canonical vehicle valuation and real sell-station offers.

3. Propagate collection failure explicitly rather than empty success.

4. Repeat the outstanding auth, SimHub, failed-settings hydration, startup race and error-classification regressions.

5. Polish contrast, source-age language, long labels and below-fold livestock navigation without reintroducing generic redesign churn.

**Exit gate:** Frozen snapshot parity plus failure-mode usability passes across dashboard, detail, setup, settings and read-only viewers.

### Stage E: Make validation enforce the real implementation

**Priority:** Release gate. **Owner:** Test/release owner. **Depends on:** A, B, C, D.

**Issues:** R2-REL-01, R2-REL-02, R3-REL-03.

1. Make the Lua parser reproducibly available and run the declared syntax gate against all intended files.

2. Replace copied summary tests with production imports and use deterministic ownership fixtures.

3. Report genuine skips separately; make missing required fixture records fail.

4. Add unique private build identity, rebuild only to a fresh private directory and capture hashes/versions/feed mapping.

5. Run the automated suite from a clean dependency installation.

**Exit gate:** Reproducible production-linked tests; no vacuous integration passes; Lua gate succeeds; intended artifacts are uniquely identifiable.

### Stage F: Run safe installed acceptance, then approve a private handoff

**Priority:** Mandatory acceptance. **Owner:** Desktop QA + game/dedicated tester. **Depends on:** E.

**Issues:** CUA-01, CUA-02, CUA-03, CUA-04, SRC-05.

1. Obtain action-time approval for installer execution; use disposable profiles for destructive migration/uninstall cases.

2. Install the approved Classic/RF pair and verify both windows, ports and independent profiles concurrently.

3. Walk unchanged setup, selected-save return, dashboard/pasture/detail agreement and failure recovery.

4. During an agreed safe game window, verify Classic mod 3.4.0.8 and RF mod 5.0.0.1 pairings without overwriting the active save.

5. Exercise a real dedicated connection, reconnect, stale-detail recovery and bounded soak; a mirror snapshot is not a live dedicated pass.

6. Only after gates pass, prepare an approved private tester packet. Keep public 4.2.1 and its update story untouched.

**Exit gate:** Signed-off installed and live evidence is attached to exact hashes; public channel files are unchanged.

## 9. End-user experience refinement, separate from correctness blockers

### Make the user understand the source and its age

The Snap XML badge is appropriate for the observed closed-game state, and its accessible description explains that a last snapshot plus save XML is being shown. Build on that with a visible last-success age and clear live/held/unknown distinctions in detail panels. A stale number should not look freshly measured simply because the desktop app restarted.

### Improve the livestock journey without another broad redesign

The health/sex summary is much better on the loaded snapshot. Make the Livestock action visibly reveal or scroll to the animal table; in this viewport the table was below the fold, so clicking the already-active action offered little immediate visual feedback. Keep summary, filters and rows tied to the same generation and expose partial/unknown detail instead of plausible defaults. Use production-linked frozen fixtures rather than independently calculated totals.

### Preserve the Settings readability improvement

The opaque modal is an improvement over the previous busy transparent surface. Apply deliberate contrast to text displayed directly over pasture photography, especially tab labels and optional-mod chips. This audit did not measure WCAG contrast ratios and does not claim accessibility conformance.

### Finish recovery and accessibility acceptance

Still required: password typing without focus reset, initial modal focus and return focus, keyboard trapping/background inertness, validation announcements, retry after 401/403/503/offline, direct SimHub login, and 320/390px plus long-label/localized layouts. Do not infer these passes from typechecking or translation-key coverage. Avoid editing real LAN credentials merely to perform failure injection; use isolated test profiles/origins.

### Reconcile fleet/weather semantics, not just the displayed totals

The development overview showed 41 vehicles and 6 pallets, while the earlier Classic capture showed 47 vehicles. That arithmetic alone does not prove classification parity. Compare stable IDs, ownership and intentional storage/dealer exclusions using the same frozen generation. Likewise, weather from sequential live captures is not a parity fixture. DairyCore's displayed health values were not validated against that mod's own live state; no fabricated conclusion is made from those values.

### Address footprint after correctness

Each installer is roughly 974 MB. That is a meaningful download/install cost, but the dominant assets were not inventoried in this pass. Measure the packaged footprint, update payload and startup hot path before deciding which optional assets can move to on-demand delivery. Do not remove required images or mapping data speculatively.

## 10. Conditional risks retained

### C1: Proxy and Host trust still require an explicit deployment policy

No public proxy deployment or DNS-rebinding exploit was established.

**Required work:** Define trusted-proxy behavior and require appropriate authentication beyond network locality. Exercise preserved and rewritten Host cases before exposing the service.

### C2: Navigation allowlists and privileged IPC are not yet tied to exact trusted documents

No hostile-document navigation path or renderer exploit was established.

**Required work:** Match exact schemes, effective ports and packaged file paths; validate sender/frame identity for privileged IPC.

### C3: Field fallback collection modes still contain unbounded synchronous scans

Practical reachability of these fallback modes in the current supported game configuration was not established. No universal frame-stall claim is made.

**Required work:** Bound every supported mode or explicitly reject unsupported incremental modes. Document mode selection and instrument per-invocation work.

### C4: Freshness-gated cycle tails may delay request polling during persistent collector failure

Alternative servicing paths were not fully excluded, so end-to-end request starvation is not established and is not included in confirmed finding counts.

**Required work:** Trace every request-servicing path and inject sustained section failure. Servicing should have an independent bounded cadence if this is the only path.

C2 has additional current evidence in R3-SEC-06, but hostile-document reachability remains conditional. The other conditional risks were not newly closed.

## 11. Release gate checklist

1. **Security and last-good data:** close all four current P1 findings, then repeat complete route/IPC and filesystem negative tests.
2. **Previous P1 carryovers:** re-run R2-DATA-01 and R2-UI-01 specifically; they are not closed by this audit.
3. **Reproducible validation:** a clean install runs the Lua gate and production-linked regression tests; unavailable integration paths are honest skips.
4. **Candidate identity:** new private build identity and hashes are recorded; the tested installed binaries match exactly.
5. **Installed lifecycle:** coexistence, unchanged setup, save persistence, import, recovery and disposable-profile uninstall/upgrade tests pass.
6. **Live mod/dedicated acceptance:** test the intended Classic and RF mod pairings during a safe game window, plus a real dedicated reconnect/stale/recovery path and measured soak.
7. **Private handoff only:** disclose signing status and known limitations, attach rollback instructions, and obtain approval for recipients. Public Classic 4.2.1 and its update narrative stay untouched.

## 12. Scope, exclusions and method caveats

- This is a broad remediation re-audit across application lifecycle, UI, security, data pipeline, packaging and selected mod hot/failure paths. It is not an exhaustive every-line review or a security certification of the entire project.
- Ordinary suites ran against the current workspace. Residual packaged-source findings refer to the specific inspected private bundle, which can differ from later workspace edits. New edition/hydration helpers and new tests were inspected directly once.
- The packaged mod review sampled ten named source files and the relevant prior failure paths. It did not run a game API simulation, parse all Lua successfully or test all optional RF integrations.
- The existing development window was used for desktop observations. No new candidate installation, uninstall, live game mutation, mod replacement, real credential change or public deployment was performed.
- Computer Use was paused by the user's Escape key and resumed only after the user asked to carry on. After resuming, the game was not listed as open; the observed dashboard was a snapshot.
- Some immediate accessibility captures lagged the screenshot. Stable later observations were used for UI conclusions. A temporary visual overlap was not promoted to a defect.
- An archive-membership diagnostic had a Windows separator assumption and was inconclusive; its false flags were not treated as missing modules. Direct archive-entry inspection supplied the meaningful identity evidence.
- The first ZIP source extraction stopped on an audit-script range error after the animal excerpt; the remaining intended excerpts were successfully recovered. This is distinct from the independently failing Lua parser gate.
- No product fixes were made. The new files from this work are the report, evidence, retained diagnostics, structured audit data, screenshot and canvas. Automated tools may create their normal temporary/cache output.

## 13. Bottom line

The loaded UI is improved, but the implementation is not yet complete end to end. Fix the verified trust and persistence defects first, make generation/clear semantics reliable, repair the validation gate, and then test the exact installed pair with the game and a real dedicated connection. **Do not repeat a public or tester release based only on the 613 green JavaScript tests.**

