# FarmHub application and mod implementation re-audit

**Date:** 5 September 2026  
**Baseline:** [Previous 57-finding audit](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-application-and-mod-audit.md)  
**Interactive index:** [Filterable findings, closure register and check results](C:/Users/Graham/.cursor/projects/c-Users-Graham-Documents-JoshWalki-Farmdash-server-edit-MAIN-CODEBASE-FarmHub/canvases/farmhub-reaudit-2026-09-05.canvas.tsx)  
**Scope:** Current implementation re-audit; source, synthetic-boundary and selected browser evidence. Not an exhaustive release certification.

## Findings first: five high-priority issues remain

1. **A late bootstrap response can still display one save under another save's name.** The original B/C switch race is fixed, but a remaining startup path can still mislabel an entire farm's data and notification context. [ws-client.ts:231](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/services/ws-client.ts#L231), [ws-client.ts:232](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/services/ws-client.ts#L232).

2. **Nonthrowing I/O failures can still be reported as successful export replacement.** On a disk/permission/nonthrowing I/O failure, the previous export can be corrupted or stale bytes retained while bookkeeping says a replacement succeeded. Checking only rename does not complete the persistence guarantee. [FarmDashboardDataCollector.lua:438](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua#L438), [FarmDashboardDataCollector.lua:600](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua#L600).

3. **Opaque browser origins still receive loopback trust.** Where browser local-network policy permits access, an opaque-origin context can obtain broadcasts or trigger eligible local writes. No real browser exploit was attempted; exposure depends on browser and deployment policy. [main.js:1497](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js#L1497), [main.js:1534](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js#L1534).

4. **FTP detail listing filenames can escape the Windows cache root.** A configured malicious or compromised FTP source can direct downloads outside its cache into other writable JSON paths, potentially corrupting or replacing application data. The test demonstrated destination selection, not a real file overwrite. [main.js:2937](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js#L2937), [main.js:2942](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js#L2942).

5. **The new focus trap moves password typing back into the username field.** Normal keyboard login is disrupted, and subsequent password characters can be typed into the visible username field. Other dialogs can jump focus during live updates. [use-focus-trap.ts:46](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/use-focus-trap.ts#L46), [LanAuthOverlay.tsx:50](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/platform/LanAuthOverlay.tsx#L50).

## Overall assessment

The implementation is materially improved, but it is **not ready for a clean audit sign-off**. Across all 57 previous IDs, **26 are addressed in the examined paths, 30 are partially addressed and 1 remains open**. Evidence strength differs: several fixes were reproduced in fixtures/browser checks, while many mod fixes are source-confirmed only.

This re-audit records **35 current actionable findings: 5 P1, 29 P2 and 1 P3**. Five are newly tracked issue mechanisms; additional regressions introduced by recent fixes are included under their related original IDs rather than duplicated. Conditional observations C1-C4 are separate from those 35 findings. The previous register includes two residuals recorded outside the formal finding list: PERF-01's translation-startup work and MOD-14's conditional fallback scheduling.

- **Frontend / release:** 11 current findings (2 P1, 9 P2, 0 P3).
- **Security / backend:** 9 current findings (2 P1, 6 P2, 1 P3).
- **Mod / pipeline:** 15 current findings (1 P1, 14 P2, 0 P3).

The global checks are much healthier: **50/50 Jest suites and 510/510 tests pass; 82/82 Node tests pass; TypeScript and packaging checks pass; the production dependency audit reports 0 vulnerabilities**. However, counted-as-pass integration early returns and targeted counterexamples mean that green suites are not equivalent to complete behavior coverage. The Lua syntax checker failed to start because luaparse was missing.

**Priority interpretation:** P1 requires correction before a confident release; P2 is a material correctness, resilience, security or user-experience gap; P3 is a lower-impact refinement. No live exploit, game corruption event or measured FPS regression is asserted without corresponding evidence.

## Detailed current findings

### P1 | R2-DATA-01 | A late bootstrap response can still display one save under another save's name

**Area:** Save identity. **Evidence level:** Reproduced against current TypeScript in the audit harness.
**Previous audit:** `DATA-01`.

**Finding:** The initial data request reads the selected server before awaiting, but ingestion passes the active server ID read after awaiting. During a slow startup, the splash safety timer can expose save controls. If the user changes A to B and B completes first, the late A response is checked as though it belonged to B. The harness ended with active B and payload A.

**Impact and trigger:** The original B/C switch race is fixed, but a remaining startup path can still mislabel an entire farm's data and notification context.

**Recommended correction:** Capture the request's server ID and context generation before awaiting, then validate both before ingestion, including startup. Apply one identity-aware ingestion contract to every source.

**Acceptance check:** Delay initial A beyond splash dismissal, switch to B and complete B then A. B must remain selected with B's payload. Cover bootstrap, manual refresh, fallback polling and WS overlap.

**Source:** [ws-client.ts:231](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/services/ws-client.ts#L231), [ws-client.ts:232](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/services/ws-client.ts#L232), [SplashScreen.tsx:55](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/components/SplashScreen.tsx#L55).

### P1 | R2-MOD-01 | Nonthrowing I/O failures can still be reported as successful export replacement

**Area:** Mod export integrity. **Evidence level:** Current source; Lua I/O fault injection not executed.
**Previous audit:** `MOD-02`.

**Finding:** Rename return values are checked now, but copy wrappers discard copyFile's result and accept a nonthrowing call plus an existing destination. The source may then be deleted even if copying did not succeed. Atomic/saveFile/mirror fallbacks also do not establish successful write and close before reporting success.

**Impact and trigger:** On a disk/permission/nonthrowing I/O failure, the previous export can be corrupted or stale bytes retained while bookkeeping says a replacement succeeded. Checking only rename does not complete the persistence guarantee.

**Recommended correction:** Define one successful replacement contract across rename, copy, write, close, save and mirror paths. Preserve previous good bytes and the recoverable source on failure; advance success/generation bookkeeping only after confirmed replacement.

**Acceptance check:** Fault-inject false-return copy/write/close/save operations, including an existing destination. Previous bytes remain usable, no success notification is emitted and a later valid retry recovers.

**Source:** [FarmDashboardDataCollector.lua:438](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua#L438), [FarmDashboardDataCollector.lua:600](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua#L600), [FarmDashboardDataCollector.lua:3545](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua#L3545), [FarmDashboardDataCollector.lua:4021](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua#L4021), [FarmDashboardExportMirror.lua:138](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardExportMirror.lua#L138).

### P1 | R2-SEC-01 | Opaque browser origins still receive loopback trust

**Area:** Browser trust boundary. **Evidence level:** Current extracted guards exercised with synthetic requests.
**Previous audit:** `SEC-04`.

**Finding:** getRequestOrigin maps an explicit null or malformed Origin to an empty string. Downstream WS/write gates treat this as a native request without Origin. The fixture rejected an ordinary hostile HTTPS origin but accepted Origin:null for loopback WS and writes.

**Impact and trigger:** Where browser local-network policy permits access, an opaque-origin context can obtain broadcasts or trigger eligible local writes. No real browser exploit was attempted; exposure depends on browser and deployment policy.

**Recommended correction:** Distinguish an absent Origin from an invalid or opaque one; reject explicit null/malformed origins. Require scoped authorization for sensitive browser operations rather than granting it from locality alone.

**Acceptance check:** Hostile, malformed and explicit null origins fail for WS, livestock requests and export. Authorized native/desktop clients continue to work.

**Source:** [main.js:1497](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js#L1497), [main.js:1534](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js#L1534), [main.js:1863](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js#L1863).

### P1 | R2-SEC-02 | FTP detail listing filenames can escape the Windows cache root

**Area:** FTP filesystem containment. **Evidence level:** Installed MLSD parser plus extracted sync function; all filesystem writes mocked.
**Newly tracked in this re-audit.**

**Finding:** The detail filter checks animals_ and .json but does not reject separators or enforce containment. The installed MLSD parser excludes forward slashes but preserves backslashes. A synthetic traversal-bearing listing selected a victim JSON path outside ftpDetailsCache.

**Impact and trigger:** A configured malicious or compromised FTP source can direct downloads outside its cache into other writable JSON paths, potentially corrupting or replacing application data. The test demonstrated destination selection, not a real file overwrite.

**Recommended correction:** Validate the complete allowed filename grammar, reject both separator types and enforce resolved containment against a fixed trusted root immediately before temporary download and final rename.

**Acceptance check:** Malicious MLSD/Unix listing entries never initiate outside-root writes. Legitimate integer and composite animal filenames continue to sync.

**Source:** [main.js:2937](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js#L2937), [main.js:2942](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js#L2942), [main.js:2871](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js#L2871), [main.js:3033](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js#L3033), [parseListMLSD.js:165](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/node_modules/basic-ftp/dist/parseListMLSD.js#L165).

### P1 | R2-UI-01 | The new focus trap moves password typing back into the username field

**Area:** LAN login / accessibility. **Evidence level:** Browser reproduced and source-confirmed.
**Previous audit:** `A11Y-01`.

**Finding:** The trap effect depends on onEscape. LanAuthOverlay supplies a new inline callback on every render; input state changes therefore tear down and reinstall the trap, which focuses the first input again. After pressing a character in the password field, the browser's active element was fd-lan-user. Settings also receives a new callback when Shell rerenders, so background data updates can reset dialog focus.

**Impact and trigger:** Normal keyboard login is disrupted, and subsequent password characters can be typed into the visible username field. Other dialogs can jump focus during live updates.

**Recommended correction:** Keep the Escape callback in a ref or stabilize it, and attach initial-focus/trap lifecycle only when the dialog actually opens. Add background inertness and proper stacked-dialog ownership.

**Acceptance check:** Type an entire username/password normally without focus moving unexpectedly; changing input state or delivering a live payload must not reset focus. Escape and focus restoration must still work.

**Source:** [use-focus-trap.ts:46](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/use-focus-trap.ts#L46), [LanAuthOverlay.tsx:50](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/platform/LanAuthOverlay.tsx#L50), [Shell.tsx:124](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/app/Shell.tsx#L124).

### P2 | R2-DATA-02 | Concurrent requests for the same save can overwrite newer data with older data

**Area:** Realtime ordering. **Evidence level:** Reproduced against current TypeScript in the audit harness.
**Previous audit:** `DATA-01`.

**Finding:** ingestGeneration changes on save switches, not per request or data revision. Two refresh/poll requests within the same save both pass the guard. Completing the newer result first and the older result second left the store showing the older payload.

**Impact and trigger:** The dashboard can roll back current values without any save switch. HTTP work completing after a more recent WebSocket message has the same missing freshness guard.

**Recommended correction:** Reject older source revisions and sequence responses within a context, or serialize/coalesce duplicate requests. Identity checks alone do not establish freshness.

**Acceptance check:** Reverse same-save HTTP completion and interleave HTTP with newer WS revisions. The displayed source revision never decreases.

**Source:** [ws-client.ts:102](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/services/ws-client.ts#L102), [ws-client.ts:118](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/services/ws-client.ts#L118).

### P2 | R2-DATA-03 | An authoritative zero herd size still preserves nonzero cluster rows

**Area:** Livestock counts. **Evidence level:** Current-source harness.
**Previous audit:** `DATA-02`.

**Finding:** The positive-target largest-remainder correction works, but both reconciliation and fan-out treat reportedHeads<=0 as missing. Ten one-head clusters with an authoritative target0 still total10.

**Impact and trigger:** A valid empty herd cannot override retained cluster data, preserving the appearance of animals after a clear or sale-to-zero transition.

**Recommended correction:** Distinguish missing/nonfinite totals from valid zero. A successful authoritative0 must produce an empty or zero-count result; coordinate with backend section-success semantics.

**Acceptance check:** For targets0,1,5 and larger values, emitted counts sum to the authoritative target before any explicit display cap. Missing totals must follow a different documented fallback.

**Source:** [livestock-fanout.ts:90](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/livestock-fanout.ts#L90), [livestock-fanout.ts:140](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/livestock-fanout.ts#L140).

### P2 | R2-DATA-04 | The display formatter still turns a zero-health synthetic animal into100%

**Area:** Livestock health. **Evidence level:** Current-source fan-out-to-formatter harness and actual consumer references.
**Previous audit:** `DATA-03`.

**Finding:** Fan-out now preserves0, but displayAnimalHealth accepts only positive values before returning100 for synthetic/aggregate flags. The composed harness observed raw health0 and displayed health100. Actual detail tables/panels call this helper.

**Impact and trigger:** The worst-health group still looks healthy to the player despite the lower-level fix. Related low-health suppression also needs an explicit unknown-versus-zero contract.

**Recommended correction:** Preserve finite zero in every presentation/alert helper and represent missing sample health separately from a measured zero. Test the rendered consumer, not only the producer.

**Acceptance check:** A synthetic zero-health row renders0% with the appropriate warning; a genuinely unknown reading is identified as unknown or explicitly estimated, never silently healthy.

**Source:** [livestock-format.ts:59](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/livestock-format.ts#L59), [AnimalDetailsModal.tsx:150](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/sections/livestock/AnimalDetailsModal.tsx#L150), [LivestockPenPanel.tsx:432](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/sections/livestock/LivestockPenPanel.tsx#L432).

### P2 | R2-MOD-02 | Population correction changes counts without reconciling the statistics they divide

**Area:** Mod animal statistics. **Evidence level:** Source and arithmetic counterexample; new regression in the count correction.
**Previous audit:** `MOD-04`.

**Finding:** Stride scaling multiplies population, weighted sums and category counts. The new population correction adjusts only bucket counts; finalization divides unchanged weighted sums by those corrected counts and retains unchanged categories. Six health100 samples weighted by10 then corrected from60 to51 imply an average of6000/51, approximately117.65.

**Impact and trigger:** Exported averages can be inflated and diseased/castrated category counts can exceed the corrected bucket population. Correcting the total alone makes the dataset internally inconsistent.

**Recommended correction:** Reconcile counts, weighted sums and categorical totals under one sampling/allocation contract, preserving sample means and disclosing estimates.

**Acceptance check:** Uniform-population samples preserve their averages after up/down correction. Every category total is between0 and the corresponding population, and all buckets reconcile to the authoritative total.

**Source:** [AnimalDataCollector.lua:96](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/AnimalDataCollector.lua#L96), [AnimalDataCollector.lua:127](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/AnimalDataCollector.lua#L127), [AnimalDataCollector.lua:693](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/AnimalDataCollector.lua#L693).

### P2 | R2-MOD-03 | The cached finance path still falls back to purchase price instead of resale value

**Area:** Courseplay asset valuation. **Evidence level:** Producer/consumer field tracing.
**Previous audit:** `MOD-05`.

**Finding:** The Courseplay path now filters farms but admits unknown ownership and selects row.sellValue, row.sellPrice or row.price. The vehicle producer places resale value under ads.sellValue; top-level price is purchase/store price.

**Impact and trigger:** A depreciated fleet can have an inflated asset valuation only when the compatibility path is used. Unknown ownership also needs an explicit policy rather than silent inclusion.

**Recommended correction:** Export and consume a canonical resale-value field and one ownership scope across both finance paths; do not silently replace resale with purchase price.

**Acceptance check:** The same depreciated fleet and farm scope produces equivalent asset valuation with Courseplay enabled or disabled, including owned, leased and unknown-owner rows.

**Source:** [FinanceDataCollector.lua:59](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/FinanceDataCollector.lua#L59), [VehicleDataCollector.lua:372](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/VehicleDataCollector.lua#L372), [VehicleDataCollector.lua:749](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/VehicleDataCollector.lua#L749).

### P2 | R2-MOD-04 | The remaining Courseplay shield still traverses the full fleet twice per update

**Area:** Courseplay recurring work. **Evidence level:** Source-confirmed traversal complexity; no measured FPS result.
**Previous audit:** `MOD-07`.

**Finding:** The duplicate tick was removed, but one tick still invokes a shield containing two full-fleet loops on applicable updates.

**Impact and trigger:** Large unchanged fleets keep paying recurring traversal cost despite the initial reduction from the previous duplicated path.

**Recommended correction:** Use a bounded change-driven queue or registration lifecycle and avoid rescanning unchanged vehicles on every update.

**Acceptance check:** Instrument examined vehicles across an unchanged fleet and newly loaded vehicles. Idle updates perform no recurring full scans while newly eligible vehicles still receive protection.

**Source:** [FarmDashboard.lua:183](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboard.lua#L183), [FarmDashboardCourseplayCompat.lua:437](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardCourseplayCompat.lua#L437), [FarmDashboardCourseplayCompat.lua:454](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardCourseplayCompat.lua#L454), [FarmDashboardCourseplayCompat.lua:578](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardCourseplayCompat.lua#L578).

### P2 | R2-MOD-05 | Runtime cadence changes do not update the adaptive scheduler's requested-value cache

**Area:** Mod settings lifecycle. **Evidence level:** Source-confirmed regression from the new shadow requested-value cache.
**Previous audit:** `MOD-08`.

**Finding:** Adaptive probing now respects _userCollectionCycleMs, but that value is populated during configuration load. Local setInt and synchronized updates modify config without updating the requested-value cache.

**Impact and trigger:** A player can change collection cadence during play and later have the adaptive probe restore the startup preference instead.

**Recommended correction:** Maintain one canonical requested cadence and update it through every local, synchronized, load and save entry point; keep effective/adaptive cadence separate.

**Acceptance check:** Increase and decrease cadence through local and synchronized settings, trigger adaptive probes and save/reload. The requested preference is never overwritten by an obsolete cached value.

**Source:** [FarmDashboardDataCollector.lua:993](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua#L993), [FarmDashboardDataCollector.lua:1429](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua#L1429), [FarmDashboardSettingsApi.lua:236](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardSettingsApi.lua#L236), [FarmDashboardSettingsApi.lua:169](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardSettingsApi.lua#L169).

### P2 | R2-MOD-06 | Coroutine and legacy collector failures still look like successful fresh collection

**Area:** Mod section freshness. **Evidence level:** Scheduler-to-collector failure-path source tracing.
**Previous audit:** `MOD-09`.

**Finding:** Explicit caught failures now avoid _cycleFresh, but field/economy coroutine failures return completion with empty data and production failures return completion with cached data. The scheduler accepts these as success; legacy safeCollect also converts failures into an empty table.

**Impact and trigger:** Consumers cannot distinguish a successful empty section from a failed or stale one, undermining both freshness indicators and authoritative-clear behavior.

**Recommended correction:** Propagate explicit success, failure, generation and last-success time through every collection mode. Keep stale fallback data with an honest status instead of converting failure to empty success.

**Acceptance check:** Inject a failure into each supported collector mode. Failed sections are marked failed/stale; successful emptiness still clears old data and does not trigger failure fallback.

**Source:** [FarmDashboardDataCollector.lua:2730](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua#L2730), [FarmDashboardDataCollector.lua:3043](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua#L3043), [FarmDashboardDataCollector.lua:3596](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua#L3596), [FieldDataCollector.lua:701](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua#L701), [EconomyDataCollector.lua:77](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/EconomyDataCollector.lua#L77), [ProductionDataCollector.lua:163](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/ProductionDataCollector.lua#L163).

### P2 | R2-MOD-07 | Station-name guesses still generate unverified selling offers

**Area:** Market-data accuracy. **Evidence level:** Current source.
**Previous audit:** `MOD-10`.

**Finding:** Fabricated Bakery/Dairy stations are removed, but the helper still adds products and guessed percentage prices to an existing station based on its name. Grain Mill and Biogas name matches enter normal market aggregation without checking actual acceptance.

**Impact and trigger:** Players can be directed to a real station that does not buy the suggested product, at a price that was never an actual offer.

**Recommended correction:** Read product acceptance and prices from real station data. If estimates are retained, place them in a clearly separate non-actionable estimate model.

**Acceptance check:** A wheat-only mill never receives a soybean offer through name matching. Every actionable destination/product/price pair corresponds to an actual station offer.

**Source:** [EconomyDataCollector.lua:791](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/EconomyDataCollector.lua#L791), [EconomyDataCollector.lua:838](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/EconomyDataCollector.lua#L838), [EconomyDataCollector.lua:845](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/EconomyDataCollector.lua#L845), [EconomyDataCollector.lua:889](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/EconomyDataCollector.lua#L889).

### P2 | R2-MOD-08 | Bale scanning charges accepted entries rather than all traversal work

**Area:** Bale scan budget. **Evidence level:** Source-confirmed algorithmic bottleneck; no frame benchmark.
**Newly tracked in this re-audit.**

**Finding:** Enumeration restarts pairs and charges newly accepted entries, not every examined object. A large nodeObjects table with few/no bales can be fully traversed in a nominally small slice. Revisited prefixes can produce potentially quadratic work across slices.

**Impact and trigger:** The repaired bale-processing phase does not establish a reliable per-frame budget for large worlds or mostly ineligible objects.

**Recommended correction:** Retain mutation-safe enumeration state across slices and charge every examined entry, independently of whether it becomes an exported bale.

**Acceptance check:** Instrument examined entries on large eligible/ineligible tables. Every slice stays within its work budget and final output is complete and deduplicated.

**Source:** [InventoryScan.lua:1059](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/InventoryScan.lua#L1059), [InventoryScan.lua:1072](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/InventoryScan.lua#L1072), [InventoryScan.lua:1085](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/InventoryScan.lua#L1085), [InventoryScan.lua:1102](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/InventoryScan.lua#L1102).

### P2 | R2-PERF-01 | Pollers still overlap and stale work can overwrite replacement server state

**Area:** Backend scheduling. **Evidence level:** Synthetic concurrent coordinator and delayed XML completion fixtures.
**Previous audit:** `PERF-02`.

**Finding:** Generation-specific Lua temp names and partial FTP checks do not serialize cycles. Teardown does not cancel/invalidate work; XML assigns through current serverStates after awaiting old work. Debounces remain untracked, watch-error restart can leave existing periodic timers, and XML/detail temp paths are still shared.

**Impact and trigger:** Slow transfers and configuration/watcher changes can duplicate CPU/network work, interfere with temporary files and inject data from an obsolete save/configuration into current state.

**Recommended correction:** Serialize/coalesce per-server work; use configuration generations and cancellation; dispose every timer; validate identity after awaits and before filesystem commits or state mutation.

**Acceptance check:** Slow cycles never overlap. Old completions cannot mutate replacement state. Repeated watcher failures leave exactly one live scheduler and no orphan debounce.

**Source:** [main.js:3098](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js#L3098), [main.js:2688](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js#L2688), [main.js:3128](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js#L3128), [main.js:2762](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js#L2762), [main.js:2772](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js#L2772).

### P2 | R2-PERF-02 | An active HTTP response can outlive the advertised total deadline

**Area:** HTTP-feed resilience. **Evidence level:** Synthetic clock/trickle and aborted-response fixtures.
**Previous audit:** `PERF-04`.

**Finding:** The new 8 MiB cap, five-redirect limit and relative redirects work at their intended boundaries. deadlineAt is checked only when beginning a request, while timeout is idle-based. Incoming responses lack aborted/error handling. A simulated 120-second trickle succeeded beyond a 45-second deadline; an aborted response remained pending.

**Impact and trigger:** A slow or truncated configured feed can retain work indefinitely or beyond the promised deadline; overlapping polling amplifies the resource cost.

**Recommended correction:** Use an independent total-deadline timer; destroy outstanding requests/responses on settlement; handle response failures and propagate cancellation across redirects.

**Acceptance check:** Trickle, stalled, aborted and truncated fixtures terminate within the total deadline. Valid bounded redirects and normal responses still succeed.

**Source:** [httpFeedXml.js:84](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/httpFeedXml.js#L84), [httpFeedXml.js:102](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/httpFeedXml.js#L102), [httpFeedXml.js:130](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/httpFeedXml.js#L130), [main.js:2670](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js#L2670).

### P2 | R2-PIPE-01 | Detail caches can still remain stale when indexes or clocks are unreliable

**Area:** Remote detail freshness. **Evidence level:** Synthetic metadata and repeated missing-index cache fixtures.
**Previous audit:** `PIPE-08`.

**Finding:** Bulk sync compares remote modification time with local download mtime rather than a retained remote revision. Equal-sized content can be suppressed under clock offset. Per-pen reads reuse existing files indefinitely without dirtyAt; an existing per-pen cache is not superseded by bulk updates in this path.

**Impact and trigger:** Livestock details can stop updating while the rest of the dashboard appears connected. The fixture downloaded nothing for an equal-sized changed listing and opened no FTP connection across repeated missing-index reads.

**Recommended correction:** Persist remote generation/mtime/hash independently of local file time, add bounded fallback refresh without an index and define per-pen versus bulk precedence.

**Acceptance check:** Equal-length changes are visible; missing-index data refreshes within a documented interval; source/client clock offsets do not prevent updates.

**Source:** [main.js:2949](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js#L2949), [livestockDetail.js:594](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/livestockDetail.js#L594).

### P2 | R2-PIPE-02 | Unstamped exports regain freshness on restart and omit some generation changes

**Area:** Source freshness. **Evidence level:** Synthetic repeated-retrieval, reset-state and weather-only fixtures.
**Previous audit:** `PIPE-09`.

**Finding:** Content hashing now prevents repeated identical retrieval from renewing freshness in one process. The hash is not persisted/restored, so boot hydration of an accepted unstamped export assigns new receipt age. Weather/server-only changes are not included in that hash.

**Impact and trigger:** Older or otherwise accepted unstamped exports can look newly live after restart, while a real weather-only update may not renew freshness. This residual does not automatically apply to every current timestamped Lua export.

**Recommended correction:** Persist source-generation identity and age and distinguish collection time from receipt. Align exporter field/type and backend parsing, with an explicit fallback contract for older exports.

**Acceptance check:** Restart/retrieval preserves the age of identical unstamped exports. A genuinely new source generation restores freshness even when ordinary farm values do not change.

**Source:** [main.js:2460](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js#L2460), [main.js:2072](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js#L2072), [main.js:2198](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js#L2198).

### P2 | R2-PIPE-03 | Hold and last-good helpers can resurrect cleared animals, stock and RF data

**Area:** Authoritative clears and persistence. **Evidence level:** Actual current hold/persistence helper fixtures; main persistence ordering not independently reverified.
**Previous audit:** `PIPE-01`.

**Finding:** Empty arrays are now distinct from omissions in the immediate animal hold, but Lua empty tables serialize as {} and still follow omission fallback. Backups do not comprehensively clear. Stock/RF holds restore populated/enabled data, and generated last-good persistence can restore a cleared animal pen.

**Impact and trigger:** A clear or disable can appear to succeed in one stage but reintroduce old data in downstream helpers or the persisted snapshot. The helper fixture reproduced immediate stock/RF resurrection and an old animal in the generated last-good state.

**Recommended correction:** Carry explicit successful-empty/disabled versus failed/omitted section status and generation through merge, hold, backups and persistence. Clear every corresponding backup on an authoritative clear.

**Acceptance check:** Exercise populated-to-empty animals and stock, RF disable, persistence and restart end-to-end. Successful emptiness remains empty; a genuine collection failure retains only clearly stale fallback data.

**Source:** [mergedSnapshotHold.js:458](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/mergedSnapshotHold.js#L458), [mergedSnapshotHold.js:466](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/mergedSnapshotHold.js#L466), [mergedSnapshotHold.js:615](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/mergedSnapshotHold.js#L615), [mergedSnapshotHold.js:645](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/mergedSnapshotHold.js#L645), [mergedSnapshotHold.js:688](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/mergedSnapshotHold.js#L688), [FarmDashboardDataCollector.lua:3889](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua#L3889).

### P2 | R2-PIPE-04 | Detail generation is dropped before comparison and stale animals attach to zero-count pens

**Area:** Livestock detail identity. **Evidence level:** Actual current helper fixtures.
**Previous audit:** `PIPE-02`.

**Finding:** Selection compares entry.generatedAt, but makeCacheEntry does not preserve that field. Selection therefore remains order/shape dependent. A newer one-animal detail followed by an older two-animal detail selected the older data. A reported-zero pen kept numeric zero but acquired two individual rows and lod:full.

**Impact and trigger:** Counts and visible individuals disagree, and older larger snapshots can override newer smaller populations despite the newly added freshness comparison.

**Recommended correction:** Preserve and validate detail generation plus world/pen identity. Invalidate incompatible individuals on authoritative zero and handle successful empty detail explicitly.

**Acceptance check:** Both enumeration orders select the newest compatible generation. A zero pen has no stale individuals, and genuine empty detail is a valid result rather than a reason to resurrect older rows.

**Source:** [detailAnimalsHydrate.js:65](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/detailAnimalsHydrate.js#L65), [detailAnimalsHydrate.js:106](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/detailAnimalsHydrate.js#L106), [detailAnimalsHydrate.js:151](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/detailAnimalsHydrate.js#L151), [detailAnimalsHydrate.js:233](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/detailAnimalsHydrate.js#L233).

### P2 | R2-PIPE-05 | Unresolved vehicle ownership is still inferred from unrelated farm characteristics

**Area:** Vehicle ownership inference. **Evidence level:** Current source heuristic; no real-cache reproduction in this run.
**Previous audit:** `PIPE-03`.

**Finding:** The headcount weighting was removed, but fleet size, livestock presence, missing ADS rows and owned-field counts still score candidate farms. The highest-scoring farm can receive unresolved pooled vehicle records.

**Impact and trigger:** In ambiguous multiplayer data, unrelated farm changes can assign vehicles and their financial effects to the wrong owner.

**Recommended correction:** Require authoritative identity/ownership matches or retain an explicit unresolved pool. Do not convert a heuristic ranking into exact ownership.

**Acceptance check:** For ambiguous records, changing livestock, field or fleet counts does not change ownership. Only authoritative matching evidence assigns an owner.

**Source:** [dataMerger.js:2126](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/dataMerger.js#L2126), [dataMerger.js:2140](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/dataMerger.js#L2140), [dataMerger.js:2163](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/dataMerger.js#L2163), [dataMerger.js:2206](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/dataMerger.js#L2206).

### P2 | R2-PIPE-06 | Configuration and UID indexes can reuse the same saved vehicle for two live records

**Area:** Vehicle one-to-one matching. **Evidence level:** Actual current merger fixture.
**Previous audit:** `PIPE-04`.

**Finding:** Suffix-only UID matching was removed. Configuration matching still consumes only a selected bucket; removal does not remove the UID index. A fixture matched one XML vehicle by configuration and then reused it for another live vehicle by UID.

**Impact and trigger:** Distinct live vehicles can acquire the same saved identity and associated metadata, corrupting enrichment and ownership attribution.

**Recommended correction:** Use a global consumed-record set checked by every matching index, with one canonical identity for each saved record.

**Acceptance check:** Mixed configuration/UID matches in either order remain one-to-one. A consumed saved record can never enrich a second live vehicle.

**Source:** [dataMerger.js:2269](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/dataMerger.js#L2269), [dataMerger.js:2272](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/dataMerger.js#L2272), [dataMerger.js:2316](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/dataMerger.js#L2316).

### P2 | R2-PIPE-07 | Saved ownership still wins and field/farmland ID collisions drop live-only fields

**Area:** Live field and owner precedence. **Evidence level:** Actual merger fixtures for field cases; source trace for vehicle owner0.
**Previous audit:** `PIPE-05`.

**Finding:** Positive live vehicle owners now win, but live owner0 falls back to saved ownership. Matched fields retain saved ownership: live owner2 plus saved owner1 produced owner1. The new union compares field IDs and farmland IDs in one namespace; XML farmland2/field100 plus live farmland99/field2 lost the live farmland99 row.

**Impact and trigger:** Ownership transfers or relinquishments can remain stale and valid live-only fields can disappear because unrelated numeric IDs collide.

**Recommended correction:** Preserve authoritative live ownership including valid zero and use typed canonical field/farmland identities. Distinguish absence from explicit unowned state.

**Acceptance check:** Test transfer, relinquishment, added fields and overlapping field/farmland numbers. Live ownership and all distinct valid fields survive merging.

**Source:** [dataMerger.js:1666](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/dataMerger.js#L1666), [dataMerger.js:1725](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/dataMerger.js#L1725), [dataMerger.js:1734](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/dataMerger.js#L1734), [dataMerger.js:2031](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/dataMerger.js#L2031).

### P2 | R2-PIPE-08 | Aggregate XML fingerprints still collide for masked optional-file changes

**Area:** XML invalidation fingerprint. **Evidence level:** Source-established fingerprint collision; no filesystem harness or caller revalidation.
**Previous audit:** `PIPE-11`.

**Finding:** Optional MoistureSystem and RedTape inputs are now included, but the fingerprint remains maximum mtime plus total byte size. Equal-size changes with preserved or lower-than-maximum timestamps can leave it unchanged, as can some zero-byte existence changes.

**Impact and trigger:** A caller using this fingerprint for invalidation cannot distinguish those changed input sets, risking stale optional integration data. This finding establishes the collision, not a newly measured end-to-end refresh delay.

**Recommended correction:** Fingerprint each input's name, existence and metadata or content, rather than only aggregate maxima and sums.

**Acceptance check:** Same-size optional rewrites with preserved/masked timestamps and optional-file creation/deletion produce a changed fingerprint; unchanged inputs remain stable.

**Source:** [xmlCollector.js:1159](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/xmlCollector.js#L1159), [xmlCollector.js:1163](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/xmlCollector.js#L1163).

### P2 | R2-REL-01 | The Lua syntax check cannot start after the dependency refresh

**Area:** Validation reproducibility. **Evidence level:** Executed command failure.
**Newly tracked in this re-audit.**

**Finding:** node tools/check-lua-syntax.mjs exits1 with MODULE_NOT_FOUND: luaparse. The checker resolves that module from the application package, but luaparse is not declared there. The previous locally present incidental dependency is gone.

**Impact and trigger:** No Lua file received a syntax result in this run. A green application suite can coexist with unvalidated Lua changes, and clean environments cannot reproduce the intended gate.

**Recommended correction:** Declare/pin the checker dependency in the owning tooling package, handle the BOM policy explicitly and wire the mod syntax check into CI. Do not mistake tool startup failure for a game syntax failure.

**Acceptance check:** A clean dependency install can run the checker over all shipped Lua files and reports real parse results; the gate fails CI on a deliberate syntax fixture.

**Source:** [check-lua-syntax.mjs:15](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/tools/check-lua-syntax.mjs#L15), [package.json](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/package.json).

### P2 | R2-REL-02 | The ownership integration test returns successfully when its expected result is absent

**Area:** Regression-test integrity. **Evidence level:** Current test source plus observed Jest skip warning.
**Newly tracked in this re-audit.**

**Finding:** If the expected remapped Vario result is absent, the test warns and returns before its assertions. The assertions run only after that expected result already exists. Additional prerequisite-based early returns also count as passed tests.

**Impact and trigger:** A remapping regression that removes the expected result can leave the suite green. The current 510/510 total therefore does not prove this ownership behavior.

**Recommended correction:** Use hermetic committed fixtures, exact owner assertions and assertion-count enforcement. Make unavoidable environment-dependent skips explicit before execution, never contingent on the expected result being missing.

**Acceptance check:** Deliberately break remapping or expected ownership and this test fails. Missing optional live prerequisites are reported as skipped, while the hermetic equivalent always executes.

**Source:** [mergeTransientPool.integration.test.js:157](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/tests/mergeTransientPool.integration.test.js#L157), [mergeTransientPool.integration.test.js:164](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/tests/mergeTransientPool.integration.test.js#L164).

### P2 | R2-SEC-03 | Raw map identifiers still select overview images outside the source root

**Area:** Map source containment. **Evidence level:** Resolver fixture with a mocked outside-image copy.
**Previous audit:** `SEC-06`.

**Finding:** Cache slug and outline containment fixes do not cover findOverviewInModSettingsExport, which joins the original mapId into its source path. A traversal map ID returned ok:true and a public cache URL after selecting an outside overview image.

**Impact and trigger:** An authorized caller, or applicable optional-auth deployment, can expose an existing outside overview.png/.dds via the served cache. This is constrained image disclosure, not demonstrated arbitrary-file disclosure.

**Recommended correction:** Validate the raw lookup key and enforce source-root containment before opening or copying files, independently of output filename normalization.

**Acceptance check:** Outside overview fixtures cannot be selected or returned; legitimate custom map exports still resolve.

**Source:** [mapOverviewResolver.js:249](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/mapOverviewResolver.js#L249), [mapOverviewResolver.js:260](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/mapOverviewResolver.js#L260), [mapOverviewResolver.js:609](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/mapOverviewResolver.js#L609), [main.js:1066](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js#L1066).

### P2 | R2-SEC-04 | Transport-only saves can leave the live poller on plaintext FTP

**Area:** FTP transport and configuration. **Evidence level:** Configuration signature fixtures and actual transfer call paths; no TLS handshake test.
**Previous audit:** `SEC-08`.

**Finding:** FTPS now reaches the shared transfer helpers and verifies certificates by default when enabled. Missing transport still selects plaintext. ftpSecure/httpFeedSecure do not participate in the reboot signature, and the live coordinator retains its old server object. Transport-only changes skipped reboot in the fixture.

**Impact and trigger:** A user can enable encryption and believe it is active while the live polling path continues using the prior plaintext configuration. XML/detail paths may behave differently because they read current settings.

**Recommended correction:** Include every connection-policy field in lifecycle decisions or resolve current configuration each cycle. Make legacy plaintext an explicit informed choice, without silent downgrade.

**Acceptance check:** A transport-only save changes the next operation on every FTP path. Invalid certificates fail closed. UI status reflects the active transport and any explicit legacy choice.

**Source:** [ftpAccess.cjs:4](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/ftpAccess.cjs#L4), [setupConfigMerge.cjs:52](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/setupConfigMerge.cjs#L52), [main.js:3090](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js#L3090), [main.js:2516](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js#L2516), [livestockDetail.js:418](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/livestockDetail.js#L418).

### P2 | R2-UX-01 | HTTP discovery errors are treated as a successful empty server list

**Area:** Startup recovery. **Evidence level:** Current-source harness and integrated call-path review.
**Previous audit:** `UX-01`.

**Finding:** fetchServers returns [] for any non-OK HTTP response. The new bootstrap retry handles rejected promises, so HTTP503/401 does not enter that recovery path. Later polling loads data but does not rediscover the configured server list.

**Impact and trigger:** A transient server/proxy error can leave the save selector empty even after connectivity returns, while startup is considered complete.

**Recommended correction:** Throw a structured status-aware discovery error, distinguish genuine zero configurations from failed discovery and let the complete startup retry restore the server list.

**Acceptance check:** First discovery returns503, then200 with saves. The UI recovers the save selector without reloading;401 triggers authentication rather than an empty configuration.

**Source:** [api-client.ts:37](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/services/api-client.ts#L37), [ws-client.ts:224](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/services/ws-client.ts#L224), [main.tsx:33](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/main.tsx#L33).

### P2 | R2-UX-02 | Failed settings hydration still enables saving unloaded defaults

**Area:** Settings safety. **Evidence level:** Source-confirmed failure and save order.
**Previous audit:** `UX-03`.

**Finding:** loadAll catches failures and the caller always sets settingsHydrated=true in finally. A failure partway through config/LAN/mod loading leaves some defaults editable and saveable. Save still commits preferences and other settings before later validation/failure. Mod failure now stops closing, but marks lifecycle saved after only partial completion.

**Impact and trigger:** Users can overwrite settings they never successfully loaded and cannot reliably identify which parts of a failed save took effect.

**Recommended correction:** Track successful hydration per editable section, block writes to unknown values, validate before any commit and report explicit per-section partial outcomes. Keep drafts and a retry path.

**Acceptance check:** Fail each load stage and ensure unloaded sections cannot be persisted. Fail each save stage and display exact committed/failed sections without a generic saved/synced claim.

**Source:** [SettingsModal.tsx:185](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/settings/SettingsModal.tsx#L185), [SettingsModal.tsx:293](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/settings/SettingsModal.tsx#L293), [SettingsModal.tsx:322](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/settings/SettingsModal.tsx#L322), [SettingsModal.tsx:342](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/settings/SettingsModal.tsx#L342), [SettingsModal.tsx:385](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/settings/SettingsModal.tsx#L385).

### P2 | R2-UX-03 | Authentication still proceeds on timeout and clears valid credentials on network failure

**Area:** LAN authentication lifecycle. **Evidence level:** Current source; isolated browser confirms protected work can start behind login after the timer.
**Previous audit:** `UX-05`.

**Finding:** The30-second gate resolves rather than failing/remaining unauthorized, completed authorization is not persistent for later waiters, verification has no deadline, network failures clear stored credentials and submit lacks a busy guard/disabled button.

**Impact and trigger:** Slow/offline users can enter inconsistent login/startup states, lose valid saved login details and launch overlapping checks. Fixing the server's authentication boundary does not make this client workflow reliable.

**Recommended correction:** Use one persistent authentication state and in-flight verification promise, explicit deadlines and separate rejected/network states. Only successful authorization releases protected startup, and transport failure must not erase valid credentials.

**Acceptance check:** Cover early completion, >30s login, hung network,401, temporary outage and double-submit. No protected bootstrap occurs before authorization and saved credentials survive transport errors.

**Source:** [lan-auth.ts:110](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/services/lan-auth.ts#L110), [lan-auth.ts:169](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/services/lan-auth.ts#L169), [LanAuthOverlay.tsx:76](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/platform/LanAuthOverlay.tsx#L76), [LanAuthOverlay.tsx:113](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/platform/LanAuthOverlay.tsx#L113).

### P2 | R2-UX-04 | SimHub waits for authentication before mounting the component that performs it

**Area:** SimHub. **Evidence level:** Source-confirmed circular startup and browser-observed early/late states.
**Previous audit:** `UX-06`.

**Finding:** ready waits for the LAN gate, while the !ready branch renders only a splash and omits LanAuthOverlay. The login component cannot resolve that gate until the30-second fallback expires. The first browser snapshot had no login form; a later snapshot showed login plus a raw JSON parsing error from the synthetic text401.

**Impact and trigger:** Every direct remote SimHub visit can spend30seconds with no usable login, even with cached credentials. Subsequent HTTP failures remain confusing instead of becoming a clear auth/retry state.

**Recommended correction:** Mount the auth/bootstrap boundary independently of readiness, release data loading on successful authentication and handle status before parsing response bodies.

**Acceptance check:** A direct unauthenticated SimHub URL shows login immediately; cached authorization verifies without the artificial30s delay;401/403/503/non-JSON responses have clear recoverable states.

**Source:** [main.tsx:65](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/simhub/main.tsx#L65), [main.tsx:81](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/simhub/main.tsx#L81), [main.tsx:150](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/simhub/main.tsx#L150), [main.tsx:162](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/simhub/main.tsx#L162).

### P2 | R2-UX-05 | A missing Windows save path is still described as rejected credentials

**Area:** Error guidance. **Evidence level:** Reproduced in the current-source audit harness.
**Newly tracked in this re-audit.**

**Finding:** Text classification tests user/denied/auth before missing-file/path errors. ENOENT beneath C:\Users\Audit\savegame1 therefore becomes E_AUTH_MISSING. The same approach can misclassify explicit path-related codes containing denied.

**Impact and trigger:** Users are sent to change usernames/passwords when the real problem is a missing save folder, prolonging setup and support incidents.

**Recommended correction:** Preserve explicit error codes and classify OS error identifiers before incidental message words or path text. Keep fallback text matching narrow.

**Acceptance check:** ENOENT/ENOTDIR paths under C:\Users map to path errors;EACCES maps to permissions;real401/403/auth rejection remains authentication-specific.

**Source:** [ux-classify.ts:88](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/ux-classify.ts#L88), [ux-classify.ts:96](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/ux-classify.ts#L96), [ux-classify.ts:102](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/ux-classify.ts#L102).

### P3 | R2-BACK-01 | Early image-export failures ignore native-dialog suppression

**Area:** Image-export error UX. **Evidence level:** Missing-script fixture with mocked native dialog.
**Previous audit:** `BACK-02`.

**Finding:** The original undefined variable is fixed, but unsupported-platform and missing-script branches bypass the shared suppression policy. With suppressNative:true, the missing-script fixture returned ok:false and also displayed one native dialog.

**Impact and trigger:** An HTTP/UI-managed export can unexpectedly raise a desktop dialog, giving duplicate or misplaced error feedback.

**Recommended correction:** Route every early and late failure through one presentation policy and return structured errors to the requesting UI.

**Acceptance check:** All early failures honor suppressNative:true and return the expected structured error without native dialogs.

**Source:** [main.js:374](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js#L374), [main.js:377](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js#L377), [main.js:388](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js#L388).


## What has materially improved

- Dependency and packaging hygiene: the missing runtime modules are listed, packaging checks pass, installed Electron is now 43.6.0 and the production advisory scan is clean. Installer execution is still untested.
- API/session boundaries: canonical API matching rejects the exercised mixed-case/trailing-slash variants, token rotation revokes existing WS clients, and original save-slot/detail-scheme filesystem vectors are sanitized.
- Configuration and realtime behavior: password-only connection changes trigger restart; delivery timestamps no longer defeat broadcast deduplication and slow consumers are closed before another snapshot is queued.
- Setup and basic accessibility: a failed setup load blocks editing/launch and offers Retry; tested setup controls have associated labels; Settings initial focus and Escape now work.
- Frontend corrections: the original cross-save switch fixture, rejected-network bootstrap retry, positive livestock allocation and raw zero-health preservation now behave as intended.
- Loading efficiency: optional dashboard sections are lazy-loaded, translation requests use normal caching and the former long fixed splash floor is reduced.

Electron 43.6.0 was listed on a supported stable line at the time of this review, according to [Electron releases](https://releases.electronjs.org/) and its [support timeline policy](https://www.electronjs.org/docs/latest/tutorial/electron-timelines). This confirms package support status, not the contents or behavior of an installed release executable.

- Mod source corrections include the lost bale-processing phase, moisture helper scope, frame-delta units, legitimate-name validation, repeated-table serialization, RedTape local scope, ground-state mapping, zero-nitrogen handling, disabled work requirements and invoice/hire-purchase summary caps. RF disablement is corrected at the producer, but the downstream hold issue remains.
- XML saved-time and operating-time units are corrected. The mirror-to-local resolver fallback is removed in the reviewed resolver; independent world identity and upstream caller arguments still need end-to-end acceptance.

## Original 57-finding closure register

Every original ID appears once below. **Addressed** means the examined original mechanism was corrected, with the specific confidence boundary stated. **Partial** means a meaningful change landed but a relevant mechanism remains. **Open** means the original problem remains. These are not blanket claims that whole modules are safe.

### Addressed (26)

- **SEC-03: Case-variant API paths bypass the LAN authentication guard.** Canonical API matching now protects case/trailing-slash variants before route handling. Twelve unauthenticated guard cases were rejected across optional-auth settings. **Evidence level:** Current source and isolated synthetic fixture. [main.js:834](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js#L834), [main.js:996](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js#L996).

- **SEC-05: Remote save-slot and detail metadata can escape cache roots.** Original save-slot and idScheme inputs are sanitized at state/filesystem boundaries. FTP listing filenames still have a separate new traversal mechanism. **Evidence level:** Current source and isolated synthetic fixture. [main.js:2486](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js#L2486), [livestockDetail.js:344](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/livestockDetail.js#L344).

- **REL-01: Both installer manifests omit seven runtime modules.** Both classic/RF lists now contain the seven missing modules and new runtime helpers. Existing packaging tests and verify:electron-pack pass. No actual installer was built or launched. **Evidence level:** Manifest review and passing packaging checks. [package.json](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/package.json), [electron-builder.rf.yml](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/electron-builder.rf.yml).

- **PIPE-10: A multiplayer mirror can be enriched with an unrelated same-slot local save.** Both resolver paths now reject mirror identifiers before local-save fallback, after allowing server-scoped remote caches. Original fallback is removed in the resolver; upstream caller arguments and independent world identity of every server cache were not separately certified. **Evidence level:** Resolver source only; full caller/world identity acceptance outstanding. [xmlCollector.js:181](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/xmlCollector.js#L181), [xmlCollector.js:226](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/xmlCollector.js#L226), [xmlCollector.js:255](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/xmlCollector.js#L255).

- **UX-02: Configuration-load failures are presented as a new empty configuration.** HTTP503 now shows a blocking error/Retry view and launch checks configLoaded. The original failed-read-to-empty-overwrite journey is blocked. Concurrent successful configuration edits still require separate revision policy. **Evidence level:** Current browser failure fixture and source. [main.tsx:93](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/setup/main.tsx#L93), [main.tsx:232](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/setup/main.tsx#L232), [main.tsx:273](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/setup/main.tsx#L273).

- **MOD-01: Loose-world bale enumeration advances past its processing phase.** Bale enumeration now reaches its processing phase, calls tryBale and advances only afterward. Separate traversal-budget inefficiency remains newly tracked. **Evidence level:** Current source; no in-game validation. [InventoryScan.lua:1098](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/InventoryScan.lua#L1098), [BaleInventoryCollector.lua:48](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/BaleInventoryCollector.lua#L48).

- **SEC-01: The packaged application is based on unsupported Electron 29.** Installed Electron is 43.6.0, a currently supported stable line according to the official releases/support policy checked during this audit. Packaged binaries and runtime migration behavior remain untested. **Evidence level:** Installed package version and official release data. [package.json](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/package.json).

- **A11Y-02: Setup inputs have visual labels without programmatic associations.** All six non-radio controls in the default setup view now have one associated label; FTP fields also have explicit for/id pairs. Complete validation-error/screen-reader conformance was not claimed. **Evidence level:** Browser label associations and source. [main.tsx:354](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/setup/main.tsx#L354), [main.tsx:523](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/setup/main.tsx#L523).

- **BACK-01: Changing only an FTP password does not update the live poller's credentials.** Password revision now participates in the configuration signature and password-only saves select a poller reboot. Transport-only changes are a separate remaining lifecycle gap. **Evidence level:** Current source and isolated synthetic fixture. [setupConfigMerge.cjs:65](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/setupConfigMerge.cjs#L65), [main.js:3332](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js#L3332).

- **MOD-03: Moisture grading helper is referenced before its local declaration.** _moistureGrade is locally defined before _patchLocationMoisture uses it. **Evidence level:** Current source; no in-game validation. [InventoryScan.lua:354](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/InventoryScan.lua#L354), [InventoryScan.lua:422](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/InventoryScan.lua#L422).

- **MOD-06: Frame delta is multiplied by 1,000 a second time.** Diagnostics stores frame dt directly in milliseconds, matching the threshold and local FS25 timing references. **Evidence level:** Source and local engine timing references. [FarmDashboardDataCollector.lua:3110](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua#L3110), [FarmDashboardDataCollector.lua:2971](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua#L2971).

- **MOD-11: Name validation rejects legitimate uppercase fill-type identifiers.** Name validation no longer rejects legitimate names solely because of the prior uppercase pattern. **Evidence level:** Current source; no in-game validation. [EconomyDataCollector.lua:1610](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/EconomyDataCollector.lua#L1610).

- **MOD-12: Shared noncyclic Lua tables are serialized as null after their first occurrence.** Serializer removes tables from the active recursion set on empty and normal returns, allowing repeated noncyclic references. **Evidence level:** Current source; no in-game validation. [FarmDashboardDataCollector.lua:3857](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua#L3857), [FarmDashboardDataCollector.lua:3897](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua#L3897), [FarmDashboardDataCollector.lua:3946](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua#L3946).

- **MOD-13: Available-contract collection calls a helper outside its local scope.** The RedTape serializer is forward-declared and assigned to the same local before runtime use. **Evidence level:** Current source; no in-game validation. [RedTapeDataCollector.lua:113](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/RedTapeDataCollector.lua#L113), [RedTapeDataCollector.lua:139](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/RedTapeDataCollector.lua#L139).

- **MOD-15: Ground-state mapping confuses enum values with encoded density values.** Ground-type mapping and prepared/clear rules agree with local FieldGroundType and FieldState conversion references. **Evidence level:** Source plus local FS25 wiki/extract/LUADOC. [FieldDataCollector.lua:38](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua#L38).

- **MOD-16: Valid zero-nitrogen readings are omitted from field averages and fertilizer decisions.** Nitrogen and target averages use independent valid counters; numeric zero is retained and each average uses its own denominator. Broader RF API behavior is not certified. **Evidence level:** Current source; no in-game validation. [FieldDataCollector.lua:1978](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua#L1978), [FieldDataCollector.lua:2022](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua#L2022).

- **MOD-17: Weed and lime action flags ignore disabled gameplay requirements.** Weeds honor their enabled setting and disabled lime clears limeRequired before needsWork is calculated. **Evidence level:** Current source; no in-game validation. [FieldDataCollector.lua:2045](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua#L2045), [FieldDataCollector.lua:2138](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua#L2138).

- **MOD-18: The 100-row detail limit also truncates financial summaries.** Hire-purchase summaries and qualifying count are accumulated before sorting and limiting presentation rows; total/truncation metadata is exported. **Evidence level:** Current source; no in-game validation. [HirePurchasingDataCollector.lua:180](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/HirePurchasingDataCollector.lua#L180), [HirePurchasingDataCollector.lua:212](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/HirePurchasingDataCollector.lua#L212).

- **MOD-19: Incoming invoices can exhaust the cap before newer outgoing invoices are considered.** Incoming/outgoing invoice records are gathered together before sorting and limiting; summary accumulation precedes truncation. **Evidence level:** Current source; no in-game validation. [InvoicesDataCollector.lua:238](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/InvoicesDataCollector.lua#L238), [InvoicesDataCollector.lua:252](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/InvoicesDataCollector.lua#L252).

- **MOD-20: Initialized but disabled soil data is exported as an enabled system.** RF producer enablement now includes the setting and disabled output omits stale field results. Downstream holding can still undo this correct producer result; see PIPE-01. **Evidence level:** Current source; no in-game validation. [RfSoilFertilizerDataCollector.lua:413](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/rf/RfSoilFertilizerDataCollector.lua#L413), [RfSoilFertilizerDataCollector.lua:445](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/rf/RfSoilFertilizerDataCollector.lua#L445).

- **PERF-03: Broadcast timestamps defeat deduplication and slow clients have no queue bound.** Hashing precedes the delivery timestamp; unchanged snapshots are not resent and a slow-consumer pre-send threshold closes overloaded clients. Not a strict maximum individual-message size. **Evidence level:** Current source and isolated synthetic fixture. [main.js:2046](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js#L2046).

- **PIPE-06: Saved environment time is treated as milliseconds instead of minutes.** Saved environment day time is interpreted as minutes and converted to milliseconds. **Evidence level:** Source plus local FS25 environment-save reference. [xmlCollector.js:543](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/xmlCollector.js#L543).

- **PIPE-07: Operating time differs by a factor of 1,000 between source paths.** Saved operating seconds are multiplied by1000 to match the canonical live millisecond unit. **Evidence level:** Source plus local FS25 vehicle-save reference. [xmlCollector.js:720](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/xmlCollector.js#L720).

- **SEC-02: The production dependency audit fails with seven affected packages.** npm audit --omit=dev --json exits0 with no reported vulnerabilities. This is advisory coverage, not proof of no application security flaws. **Evidence level:** Fresh npm audit. [package.json](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/package.json).

- **SEC-07: LAN password and allowlist changes do not revoke existing WebSocket access.** LAN saves and restore now rotate tokens and remove/close existing clients even without a port rebind. Synthetic fixture confirmed rotation and revocation. **Evidence level:** Current source and isolated synthetic fixture. [main.js:3628](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js#L3628), [main.js:3683](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js#L3683).

- **UX-04: The phone header clips controls and collapses save navigation.** The small-screen header now wraps and gives save navigation a separate full-width row. The browser viewport override did not produce a reliable390px observation in this run, so 320/390px and long-label acceptance remains outstanding. **Evidence level:** Source only; phone runtime result not obtained. [app-shell.css:470](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/styles/app-shell.css#L470).

### Partial (30)

- **SEC-04: Loopback WebSockets and local writes trust network locality without browser-origin validation.** Hostile ordinary origins are rejected, but explicit Origin:null and malformed origins are normalized to absent Origin and retain loopback trust. **Evidence level:** Current source and isolated synthetic fixture. [main.js:1497](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js#L1497), [main.js:1534](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js#L1534), [main.js:1863](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js#L1863).

- **DATA-01: Late HTTP responses can replace the currently selected save.** Original B/C response race now passes. Bootstrap still reads the active ID after its await and can ingest old A data under selected B; same-save overlapping HTTP requests can also roll back newer data. **Evidence level:** Current-source harness. [ws-client.ts:231](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/services/ws-client.ts#L231), [ws-client.ts:122](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/services/ws-client.ts#L122).

- **MOD-02: A failed rename can be reported as a successful export replacement.** Rename results are checked, but copy wrappers discard return values and accept an existing destination; fallback write/close/save operations can still be treated as successful on a nonthrowing failure. **Evidence level:** Current source; no in-game validation. [FarmDashboardDataCollector.lua:438](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua#L438), [FarmDashboardDataCollector.lua:600](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua#L600), [FarmDashboardExportMirror.lua:138](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardExportMirror.lua#L138).

- **UX-01: A failed initial server-list request disables automatic startup recovery.** Rejected network discovery now retries successfully. HTTP503 discovery returns a successful empty list, so the new bootstrap retry is bypassed and configured saves are not rediscovered. **Evidence level:** Current-source harness and startup call chain. [api-client.ts:37](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/services/api-client.ts#L37), [ws-client.ts:219](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/services/ws-client.ts#L219).

- **A11Y-01: Dialogs lack keyboard focus management and Escape handling.** Settings now initially focuses Close and closes on Escape. Shared focus hooks exist across primary dialogs, but unstable onEscape callbacks reset focus on rerenders; password typing was observed to move focus to the username field. Background inertness is still absent. **Evidence level:** Browser and source. [use-focus-trap.ts:46](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/use-focus-trap.ts#L46), [LanAuthOverlay.tsx:50](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/platform/LanAuthOverlay.tsx#L50), [Shell.tsx:124](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/app/Shell.tsx#L124).

- **BACK-02: Image-export completion references an undefined suppressNative flag.** The original undefined suppressNative/options failure is fixed. Missing-script and unsupported-platform early branches still show native dialogs despite suppression. **Evidence level:** Current source and isolated synthetic fixture. [main.js:374](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js#L374), [main.js:377](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js#L377), [main.js:388](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js#L388).

- **DATA-02: Cluster rounding can still exceed the authoritative animal total.** Positive-target largest-remainder allocation passes the original 10-to-5 fixture. Authoritative zero is still treated as absent and preserves ten heads instead of clearing them. **Evidence level:** Current-source arithmetic harness. [livestock-fanout.ts:90](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/livestock-fanout.ts#L90), [livestock-fanout.ts:140](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/livestock-fanout.ts#L140).

- **DATA-03: A zero-health cluster is displayed as fully healthy.** Fan-out now emits health0 correctly, but the display helper still changes synthetic zero-health rows to100 in actual livestock detail consumers. **Evidence level:** Collector-to-display helper harness and actual callers. [livestock-format.ts:59](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/livestock-format.ts#L59), [AnimalDetailsModal.tsx:150](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/sections/livestock/AnimalDetailsModal.tsx#L150).

- **MOD-04: Fixed-stride animal sampling exports inflated exact-looking bucket counts.** Population correction fixes counts but not corresponding weighted sums or categorical counts, creating a new inconsistency in final averages and category totals. **Evidence level:** Current source and arithmetic counterexample. [AnimalDataCollector.lua:96](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/AnimalDataCollector.lua#L96), [AnimalDataCollector.lua:127](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/AnimalDataCollector.lua#L127), [AnimalDataCollector.lua:693](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/AnimalDataCollector.lua#L693).

- **MOD-05: Courseplay mode changes asset scope and valuation basis.** Farm filtering was added, but the cached finance path reads top-level sellValue/sellPrice/price while resale value is produced under ads.sellValue. Purchase price can still inflate assets. **Evidence level:** Producer/consumer source tracing. [FinanceDataCollector.lua:59](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/FinanceDataCollector.lua#L59), [VehicleDataCollector.lua:372](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/VehicleDataCollector.lua#L372).

- **MOD-07: Courseplay compatibility performs four whole-fleet passes per frame.** Duplicate Courseplay tick was removed; the remaining shield still makes two whole-fleet traversals on each applicable update. **Evidence level:** Source work-complexity analysis; no FPS measurement. [FarmDashboard.lua:183](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboard.lua#L183), [FarmDashboardCourseplayCompat.lua:437](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardCourseplayCompat.lua#L437), [FarmDashboardCourseplayCompat.lua:578](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardCourseplayCompat.lua#L578).

- **MOD-08: Adaptive scheduling overwrites the user's collection interval.** Adaptive scheduling now respects a cached requested interval, but runtime and synchronized setters do not update that cache. A later probe can restore the startup value. **Evidence level:** Current source; no in-game validation. [FarmDashboardDataCollector.lua:993](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua#L993), [FarmDashboardDataCollector.lua:1429](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua#L1429), [FarmDashboardSettingsApi.lua:236](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardSettingsApi.lua#L236).

- **MOD-09: A collector exception can mark reused data as fresh.** Explicit scheduler-caught failures avoid fresh flags, but coroutine/legacy collectors still return successful empty/cached completion on failure and are accepted as fresh. **Evidence level:** Current source; no in-game validation. [FarmDashboardDataCollector.lua:2730](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua#L2730), [FarmDashboardDataCollector.lua:3043](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua#L3043), [FieldDataCollector.lua:701](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua#L701), [ProductionDataCollector.lua:163](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/ProductionDataCollector.lua#L163).

- **MOD-10: Synthetic Bakery and Dairy entries are presented as real selling opportunities.** Fabricated Bakery/Dairy station records were removed. Existing station names still generate unverified product acceptance and guessed percentage prices in normal market aggregation. **Evidence level:** Current source; no in-game validation. [EconomyDataCollector.lua:791](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/EconomyDataCollector.lua#L791), [EconomyDataCollector.lua:838](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/EconomyDataCollector.lua#L838), [EconomyDataCollector.lua:889](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/EconomyDataCollector.lua#L889).

- **MOD-14: Field collection scans world objects synchronously before reaching its yielding phase.** Default coroutine/bale-prepass work now yields. Synchronous fallback/state-machine/legacy branches remain, but their practical reachability in supported current game configurations was not established. Residual is recorded as conditional C3, not a confirmed current frame stall. **Evidence level:** Source branch analysis; fallback reachability not verified. [FieldDataCollector.lua:651](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua#L651), [FieldDataCollector.lua:724](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua#L724), [FieldDataCollector.lua:749](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua#L749).

- **PERF-01: Every startup downloads all translations and eagerly imports all dashboard sections.** SectionRouter now lazy-loads optional sections and i18n uses default caching. Startup still awaits the complete all-language catalog without an immediate bundled fallback or request deadline. The fixed5.2-second splash floor was also reduced. **Evidence level:** Current source and built entry HTML. [SectionRouter.tsx:6](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/sections/SectionRouter.tsx#L6), [i18n.ts:79](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/i18n/i18n.ts#L79), [SplashScreen.tsx:31](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/components/SplashScreen.tsx#L31).

- **PERF-02: Polling and watcher restarts permit concurrent work and obsolete completions.** FTP generation checks and generation-specific Lua temp names help. Cycles still overlap; teardown does not invalidate outstanding work and old XML completions can write into replacement state. **Evidence level:** Current source and isolated synthetic fixture. [main.js:2688](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js#L2688), [main.js:2762](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js#L2762), [main.js:3098](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js#L3098), [main.js:3128](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js#L3128).

- **PERF-04: HTTP feed downloads have no total deadline, response cap or redirect bound.** Response-byte and redirect limits are added. The total deadline is not enforced during an active response; aborted/errored responses can leave work unresolved. **Evidence level:** Current source and isolated synthetic fixture. [httpFeedXml.js:84](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/httpFeedXml.js#L84), [httpFeedXml.js:102](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/httpFeedXml.js#L102), [httpFeedXml.js:130](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/httpFeedXml.js#L130).

- **PIPE-01: Empty successful sections can retain previously populated data.** Authoritative [] can clear immediate animal output, but {} still means omitted; stock/RF holds and last-good persistence restore prior data. Backups are not comprehensively cleared. **Evidence level:** Actual helper harness; current main persistence order not independently confirmed. [mergedSnapshotHold.js:458](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/mergedSnapshotHold.js#L458), [mergedSnapshotHold.js:615](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/mergedSnapshotHold.js#L615), [mergedSnapshotHold.js:688](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/mergedSnapshotHold.js#L688), [FarmDashboardDataCollector.lua:3889](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua#L3889).

- **PIPE-02: Larger detail snapshots are favored over authoritative smaller populations.** New timestamp comparison reads generatedAt that cache-entry construction drops. Old larger detail can win and attach individual rows to a reported-zero pen with full-detail status. **Evidence level:** Actual current helper harness. [detailAnimalsHydrate.js:65](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/detailAnimalsHydrate.js#L65), [detailAnimalsHydrate.js:151](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/detailAnimalsHydrate.js#L151), [detailAnimalsHydrate.js:233](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/detailAnimalsHydrate.js#L233).

- **PIPE-03: Unresolved vehicle ownership is inferred from unrelated herd or fleet size.** Headcount weighting was removed, but fleet/livestock presence/ADS gaps/owned-field scores still assign ambiguous pooled vehicles without authoritative ownership. **Evidence level:** Current source; no real-cache reproduction in this run. [dataMerger.js:2126](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/dataMerger.js#L2126), [dataMerger.js:2140](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/dataMerger.js#L2140), [dataMerger.js:2206](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/dataMerger.js#L2206).

- **PIPE-04: Suffix matching and incomplete row consumption can cross-match vehicles.** Suffix-only UID matching was removed, but configuration matching does not consume the record globally or remove its UID index. One XML vehicle can enrich two live vehicles. **Evidence level:** Actual current merger harness. [dataMerger.js:2269](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/dataMerger.js#L2269), [dataMerger.js:2316](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/dataMerger.js#L2316).

- **PIPE-05: Saved XML can override live ownership and exclude live-only fields.** Positive live vehicle owners now win. Live field ownership still loses, live owner0 still falls back to saved ownership, and the new field union collides field IDs with farmland IDs. **Evidence level:** Actual merger fixtures for field ownership and mixed-ID union; vehicle-zero source trace. [dataMerger.js:1666](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/dataMerger.js#L1666), [dataMerger.js:1734](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/dataMerger.js#L1734), [dataMerger.js:2031](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/dataMerger.js#L2031).

- **PIPE-08: FTP detail caches rely on byte size and can remain stale indefinitely.** Bulk sync considers remote mtime, but compares it to local download mtime. Per-pen cache still has no bounded fallback refresh without a dirty index. **Evidence level:** Current source and isolated synthetic fixture. [main.js:2949](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js#L2949), [livestockDetail.js:594](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/livestockDetail.js#L594).

- **PIPE-09: Repeated retrieval of the same old export renews its freshness.** Identical retrieval no longer renews freshness in one process. For accepted unstamped exports, restart recreates receipt-based freshness and weather-only changes are absent from the content hash. **Evidence level:** Current source and isolated synthetic fixture. [main.js:2460](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js#L2460), [main.js:2072](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js#L2072), [main.js:2198](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js#L2198).

- **PIPE-11: Optional XML inputs are omitted from the collection fingerprint.** Optional MoistureSystem/RedTape inputs are now included, but aggregate max-mtime plus total-size fingerprint collides for masked/preserved-time equal-size changes or certain existence changes. **Evidence level:** Source-established fingerprint collision; no filesystem fixture. [xmlCollector.js:1159](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/xmlCollector.js#L1159), [xmlCollector.js:1163](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/xmlCollector.js#L1163).

- **SEC-06: Map identifiers can select or write files outside intended roots.** Outline-cache writes are contained and slugs sanitized. The overview source lookup still inserts raw mapId and can copy an outside overview image into the served cache. **Evidence level:** Current source and isolated synthetic fixture. [mapOverviewResolver.js:249](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/mapOverviewResolver.js#L249), [mapOverviewResolver.js:260](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/mapOverviewResolver.js#L260), [mapFieldOutlines.cjs:362](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/mapFieldOutlines.cjs#L362).

- **SEC-08: All FTP paths explicitly disable transport encryption.** Shared FTPS options now reach transfer paths with certificate verification enabled when selected. Unspecified transport is still plaintext; transport-only edits do not reboot a poller retaining old configuration. **Evidence level:** Current source and isolated synthetic fixture. [ftpAccess.cjs:4](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/ftpAccess.cjs#L4), [setupConfigMerge.cjs:52](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/setupConfigMerge.cjs#L52), [main.js:3090](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js#L3090).

- **UX-03: Settings can report success after a mod save fails and can partially apply on other failures.** A failed mod save now returns before synced/close, but is labelled saved after earlier commits. Hydration errors still mark the form hydrated and enable saving unknown defaults; validation remains after some writes. **Evidence level:** Source call-order review. [SettingsModal.tsx:185](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/settings/SettingsModal.tsx#L185), [SettingsModal.tsx:342](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/settings/SettingsModal.tsx#L342), [SettingsModal.tsx:385](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/settings/SettingsModal.tsx#L385).

- **UX-06: The standalone SimHub page omits the LAN authentication bootstrap.** SimHub now imports LAN authentication, but its login overlay is rendered only after ready, while ready waits for the gate that overlay resolves. Login is delayed until the30s timeout; protected responses still lack status handling and the synthetic401 produced a raw JSON parsing error. **Evidence level:** Browser and source. [main.tsx:65](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/simhub/main.tsx#L65), [main.tsx:150](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/simhub/main.tsx#L150), [main.tsx:162](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/simhub/main.tsx#L162).

### Open (1)

- **UX-05: Authentication timeout and retry handling can leave inconsistent login state.** The auth gate still resolves on timeout without authorization; early completion is not persistent, verification has no deadline, network failure clears credentials and duplicate submissions are not prevented. **Evidence level:** Current source. [lan-auth.ts:110](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/services/lan-auth.ts#L110), [lan-auth.ts:169](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/services/lan-auth.ts#L169), [LanAuthOverlay.tsx:76](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/platform/LanAuthOverlay.tsx#L76), [LanAuthOverlay.tsx:113](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/platform/LanAuthOverlay.tsx#L113).

## Checks and outcomes

Commands using the application package ran from `FS25_FarmDashboard_App`; TypeScript ran from `NEW APP`; the Lua checker and retained audit harness ran from the repository root. No dependencies were installed to make a check pass.

### Jest application suite

**Previous:** 494/497 tests;46/48 suites. **Current:** 510/510 tests;50/50 suites. **Result:** Pass with coverage caveats.

One live-cache case and the live HTTP-feed case returned early with [skip] warnings while counted as passed. The suite is green, but those paths were not exercised.

**Command/method:** `npm test -- --runInBand`.

### Node ESM suite

**Previous:** 82/82. **Current:** 82/82. **Result:** Pass.

Existing Node ESM tests pass; warnings concern mixed CommonJS/ESM package interpretation, not test failures.

**Command/method:** `npm run test:mjs`.

### NEW APP TypeScript

**Previous:** Pass. **Current:** Pass. **Result:** Pass.

Typechecking does not detect effect lifecycle, response ordering or UI-value semantics.

**Command/method:** `npm run typecheck`.

### Electron packaging guard

**Previous:** Missing runtime modules. **Current:** Pass. **Result:** Pass.

Current classic/RF manifests include the missing files. This command's implementation checks the classic manifest and source closure, not a launched installer.

**Command/method:** `npm run verify:electron-pack`.

### Production dependencies

**Previous:** 7 affected packages. **Current:** 0 reported vulnerabilities. **Result:** Pass.

Fresh npm registry advisory check exits0. Separate application logic and runtime policy review remain necessary.

**Command/method:** `npm audit --omit=dev --json`.

### Electron support

**Previous:** 29.4.6 unsupported. **Current:** 43.6.0 supported. **Result:** Addressed.

Installed package43.6.0 matches a supported line listed by official Electron releases during this audit. Installed/shipped executable contents were not inspected.

**Command/method:** `Installed package metadata plus official release/support pages`.

### Lua syntax gate

**Previous:** 41/42;BOM caveat. **Current:** Could not start. **Result:** Blocked.

MODULE_NOT_FOUND luaparse. Zero current files parsed by this attempted command; no dependency install performed.

**Command/method:** `node tools/check-lua-syntax.mjs`.

### Current-source diagnostic harness

**Previous:** Four focused failures reproduced. **Current:** 10 scenarios;4 expected outcomes and6 counterexamples. **Result:** Findings.

Original B/C race, network bootstrap retry, positive count rounding and rawzero health improve. Bootstrap overlap, same-save ordering, HTTP503 discovery,zerohead counts,displayedzero health and Windows-path classification still fail expected behavior. Harness is diagnostic and exits0, not an assertion-based green test suite.

**Command/method:** `node docs/_internal/audits/reaudit-2026-09-05-harness.cjs`.

### Browser source UI

**Previous:** Setup503 unsafe;Settings focus/Escape broken;unlabelled controls. **Current:** Setup503 blocked;Settings focus/Escape fixed;labels associated. **Result:** Mixed.

New password-focus regression and SimHub gate issue observed using loopback-only synthetic local/remote origins. Phone viewport override was unreliable, so no new390px layout pass is claimed.

**Command/method:** `Current Vite source with synthetic API; no real setup or credentials`.

### Security/backend boundary fixtures

**Previous:** Previous audit mechanisms. **Current:** Fixes and residual faults reproduced. **Result:** Mixed.

Synthetic guard, listing/path, token, config, poller, cache, freshness and download fixtures distinguish actual fixes from alternate-path failures. Mocked I/O and transports; no live exploit or TLS session.

**Command/method:** `Isolated retained-source VM fixtures`.

### Pipeline helper fixtures

**Previous:** Previous merge/hold/detail findings. **Current:** Remaining merge/hold/detail faults reproduced. **Result:** Findings.

Current helpers reproduced held/persisted data resurrection, stale details on zero pens, XML vehicle reuse, saved field-owner precedence and mixed field/farmland-ID loss.

**Command/method:** `Isolated current-source helper fixtures`.


## Conditional risks and unresolved observations

These are not counted as confirmed actionable defects in the 35-finding total. Their source-level conditions are real, but deployment/reachability or complete end-to-end consequences remain unverified.

### C1 | Proxy and Host trust still require an explicit deployment policy

**Status:** Partial.

Setup rejects an unrecognized public Host, but general API authorization still trusts loopback independently of Host. A reverse proxy that rewrites Host to localhost can inherit local/setup trust.

**Evidence boundary:** No public proxy deployment or DNS-rebinding exploit was established.

**Recommended follow-up:** Define trusted-proxy behavior and require appropriate authentication beyond network locality. Exercise preserved and rewritten Host cases before exposing the service.

**Source:** [main.js:915](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js#L915), [main.js:814](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js#L814).

### C2 | Navigation allowlists and privileged IPC are not yet tied to exact trusted documents

**Status:** Partial.

Navigation/window guards now exist, but allow arbitrary file: URLs and accept default-port localhost URLs through u.port || PORT. Privileged IPC handlers still omit sender/frame validation. A fixture accepted an outside file document and localhost:80 while rejecting external HTTPS.

**Evidence boundary:** No hostile-document navigation path or renderer exploit was established.

**Recommended follow-up:** Match exact schemes, effective ports and packaged file paths; validate sender/frame identity for privileged IPC.

**Source:** [main.js:3477](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js#L3477), [main.js:3532](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js#L3532), [main.js:3605](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js#L3605).

### C3 | Field fallback collection modes still contain unbounded synchronous scans

**Status:** Partial.

MOD-14's default coroutine and bale prepass now yield. Fallback, _smState and legacy branches still disable or bypass yielding before scanning the world.

**Evidence boundary:** Practical reachability of these fallback modes in the current supported game configuration was not established. No universal frame-stall claim is made.

**Recommended follow-up:** Bound every supported mode or explicitly reject unsupported incremental modes. Document mode selection and instrument per-invocation work.

**Source:** [FieldDataCollector.lua:651](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua#L651), [FieldDataCollector.lua:724](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua#L724), [FieldDataCollector.lua:749](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua#L749).

### C4 | Freshness-gated cycle tails may delay request polling during persistent collector failure

**Status:** Not verified.

The examined cycle tail is freshness-gated and contains request polling and detail rotation. A permanently failing collector could prevent that particular tail from running.

**Evidence boundary:** Alternative servicing paths were not fully excluded, so end-to-end request starvation is not established and is not included in confirmed finding counts.

**Recommended follow-up:** Trace every request-servicing path and inject sustained section failure. Servicing should have an independent bounded cadence if this is the only path.

**Source:** [FarmDashboardDataCollector.lua:2754](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua#L2754), [FarmDashboardDataCollector.lua:2786](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua#L2786), [FarmDashboardDataCollector.lua:2789](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua#L2789).


## Scope, methods and limits

This is a fresh re-audit of the current implementation against the previous 57-finding audit, with additional adversarial checks around the changed boundaries. The previous report is preserved. "Addressed" means the original mechanism is corrected at the stated evidence level; it does not mean the whole feature, installed application or game session has been certified.

The review covered principal dashboard/setup/settings/SimHub journeys, shared dialog and authentication code, snapshot ingestion and livestock presentation, Electron HTTP/WS/IPC boundaries, filesystem and FTP paths, configuration lifecycle, polling, source freshness, XML merging/hydration, release manifests/dependencies, and the Lua mod and optional integrations. Coverage details and exclusions below are part of the result.

Methods combined current-source review, existing application/Node suites, TypeScript, packaging/advisory checks, isolated VM/current-TypeScript fixtures, and browser interactions against current Vite source with synthetic loopback services. Extracted-function fixtures establish the behavior of the exercised code; they are not equivalent to a live deployment exploit or an end-to-end game session.

No application or mod source fixes were made. New files are audit artifacts only. No dependency installation, installer build/launch, real FTP/TLS transfer, live LAN security change, PowerShell image export or FS25 game session was performed. Temporary browser tabs and synthetic servers were closed/stopped. The mobile viewport override was unreliable, so this run does not establish a 320/390px visual pass. Accessibility observations cover selected keyboard/label journeys, not full WCAG or screen-reader conformance.

### Mod review depth and timestamp boundary

All 42 Lua source files were loaded once, but detailed control-flow review was not completed for every function. The deepest review covered scheduler/export/write/detail paths, inventory, animal, finance, economy and field collectors, Courseplay compatibility and the optional integrations tied to previous findings. Core initialization/hooks and other integrations received uneven targeted screening.

[FillTypeUtils.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FillTypeUtils.lua) and [WeatherDataCollector.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/WeatherDataCollector.lua) were loaded but not analytically reviewed. They are explicit coverage gaps, not clean results. This report must not be interpreted as an exhaustive 42-file control-flow certification.

Local FS25 wiki, extracted game source and targeted LUADOC supported ground-type and time/unit conclusions. There was no live-game, multiplayer, actual Lua I/O-failure or frame-performance validation.

The top-level assembly contains `timestamp` and `serverTime` at [FarmDashboardDataCollector.lua:2467](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua#L2467), but their exact emitted type/format was not established in retained evidence. Detail documents separately assign `generatedAt = nowSec` at [FarmDashboardDataCollector.lua:4147](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua#L4147). This does not establish the top-level freshness contract. R2-PIPE-02 remains limited to the backend's accepted unstamped-export path, not every current Lua export.

## Browser evidence and interpretation

The current UI was served only against synthetic loopback APIs. A second loopback hostname exercised the application's remote-client branch. Synthetic authentication used dummy credentials, never the user's real login. The fake WS service was intentionally not an authentication implementation; dashboard data appearing behind its overlay must not be interpreted as proof of a real backend data leak.

Setup HTTP503 displayed a blocking load error and Retry without the normal save/launch controls. All six non-radio controls in the default setup view had one associated label. Settings initially focused Close and closed on Escape.

The new shared focus effect was observed moving focus from the LAN password field back to the username field after typing. Browser DOM mirrors did not reliably expose input values, while screenshots showed populated fields. The finding is about observed focus movement plus the effect dependency, not about fields being cleared.

SimHub's early snapshot showed only loading and no login form; a later snapshot showed login and a raw parse error from the synthetic text401 response. The 30-second delay is established by source, not a precise browser timing measurement. The attempted phone viewport did not reliably apply and is excluded from visual conclusions.

**Retained screenshots:** [Login focus evidence](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/reaudit-2026-09-05-login-focus.png); [Blocked setup after HTTP503](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/reaudit-2026-09-05-setup-blocked.png). Neither is claimed as reliable phone-layout evidence.

## Recommended completion order and release gates

1. Close the high-priority trust and integrity gaps first. Reject explicit opaque/malformed origins, contain every FTP filename at the final sink, prevent bootstrap data from crossing save identity, and stop dialog rerenders from moving password focus. Add regression fixtures at the actual boundary, not only the new helper.
2. Complete snapshot and lifecycle contracts. Enforce context plus source revision on all asynchronous completions; serialize/coalesce backend work; cancel old configuration generations; preserve authoritative empty/zero sections without confusing failure with a successful clear.
3. Finish the mod and pipeline findings below. Validate game API contracts from the available local engine references, keep financial summaries independent of presentation caps, and distinguish exact values, estimates, unknowns and stale sections.
4. Make authentication and configuration recoverable. Show login before protected bootstrap, retain valid credentials during transport failures, enforce deadlines and single-flight submission, block writes to unloaded settings and report partial save outcomes explicitly.
5. Finish resilience and performance work. Enforce real total download deadlines, bounded remote-cache refresh and active transport-policy changes. Measure startup and sustained collection cost rather than relying only on lazy imports or nominal scheduler settings.
6. Establish a reproducible release gate. Declare the Lua parser dependency; use hermetic fixtures instead of counted-as-pass early returns; run the new counterexamples as assertions; typecheck/build the shipped UI; verify both installer variants; launch an installed Windows build; and complete FS25 and phone acceptance journeys.

A clean release sign-off requires the confirmed P1 findings to be closed with boundary-level tests and the relevant installed/game flows exercised. P2 issues should be fixed or consciously accepted with a documented limitation and owner. This report does not claim that every possible application defect has been found.

## Additional refinements and validation gaps

- Startup still awaits the complete all-language translation catalog without an immediate bundled fallback or bounded fetch. Keep a small usable fallback available, load the selected locale first and measure cold/offline startup.
- Setup now blocks failed reads, but simultaneous successfully loaded editors still have no expected-revision/CAS contract. The backend replaces membership from a nonempty submitted list. Decide whether concurrent editing is supported; if it is, add revision conflicts and preserve drafts.
- Modal background inertness and stacked-dialog ownership remain incomplete. After fixing focus reset, cover Tab/Shift+Tab, escape ownership, focus restoration, live updates and screen-reader announcements across every dialog.
- Phone header CSS was changed in the right direction, but 320/390px, long save names, translated labels and large text still need a reliable real viewport test. Do not close that acceptance check from the source change alone.
- Existing integration cases that return early under a warning are counted as passed. Convert prerequisites to explicit skips and add hermetic equivalents, so a green total cannot conceal missing coverage.
- CI still uses Node20 while this audit ran Node24.15.0. The inspected pipeline does not gate the new UI build/typecheck and Lua parser together. Pin a documented supported toolchain and exercise the artifact that will ship.
- Packaging source checks do not establish an installed artifact. The pack verifier primarily checks the classic manifest; the builder can reuse an existing dist directory. The observed current main/setup entry assets matched the copied UI assets, so this audit does not claim the present bundle is stale.
- No live FS25 save/load, multiplayer, game-log, sustained frame-time, real FTP/FTPS, large-feed memory or installed-Electron smoke measurements were obtained. Source/static fixture conclusions are labelled accordingly.

## Evidence inventory

The UI review followed current bootstrap/API/WS/auth code, setup and Settings, Shell/TopBar/Splash, shared focus management, livestock fan-out/formatters and their consumer references, section loading/i18n, CSS, retry/error classification, and release/tooling files. Optional section behavior beyond the traced shared boundaries was not exhaustively exercised in the browser.

Backend source review covered main/preload/updater, API path and filesystem identity helpers, setup/credential/CORS policies, configuration merging, HTTP feed collection, livestock detail transfer/hydration, map overview/outlines/HUD lookup, source freshness and cache/file retry utilities. Installed basic-ftp listing code was examined for the new filename-boundary finding.

The retained diagnostic harness is reproducible against this workspace's current dependencies and source. It prints observations rather than asserting success, so its exit0 is not a green test result. Security and mod reviewers also used isolated retained-source fixtures with mocked filesystems, transports and clocks; these are described per finding and are not presented as permanent repository tests.

The prior report remains the historical baseline. All source line links in this report refer to the current source snapshots examined during this re-audit. Package metadata references intentionally omit line numbers where the original read was unnumbered.

Additional pipeline helpers reviewed: [serverDataCache.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/serverDataCache.js), [liveExportFreshness.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/liveExportFreshness.js), [fileReadRetry.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/fileReadRetry.js), [modConfigXml.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/modConfigXml.js), [farmScope.cjs](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/farmScope.cjs).

**Retained diagnostic artifact:** [Current-source audit harness](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/reaudit-2026-09-05-harness.cjs). It reproduces original improvements and remaining startup/order/count/health/error-classification counterexamples without using real credentials or game saves.

## Bottom line

Keep the implemented improvements. The next pass should complete the end-to-end contracts rather than add another layer of isolated guards: trusted request identity, contained filesystem writes, ordered snapshots, authoritative empty/zero data, explicit collection success, truthful settings/auth states and reproducible release tests.

The highest-priority work is the five P1 issues above. The closure register and each finding's acceptance check provide a concrete basis for the next implementation and re-test cycle.

