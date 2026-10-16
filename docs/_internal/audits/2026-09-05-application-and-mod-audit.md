# FarmHub application and FS25 mod: full audit report

**Audit date:** 5 September 2026  
**Assessment:** Not ready for release sign-off on the evidence gathered.  
**Basis:** Current source, installed dependency metadata, existing automated checks, focused in-memory reproductions and a synthetic browser session.  
**Change policy:** Audit only. No application or mod source fixes were made.

This is a fresh, broad assessment of the current implementation after the reported remediation work. Earlier completion claims are not treated as evidence that a behavior is correct. Findings below distinguish a demonstrated failure, a source-established defect, an advisory and a conditional risk. This report does not certify every runtime, screen, optional-mod combination or deployed installer.

## 1. Decision and immediate priorities

The most urgent issues are the mismatch between LAN authorization and route matching, browser-origin trust on loopback connections, uncontained cache paths, missing packaged runtime modules, cross-save response races, and setup saving over a configuration that failed to load. The mod also has concrete inventory and export-commit defects. These affect security, correctness and trust in the product, rather than just polish.

**Recommended release decision:** hold a new public release until the P1 items below are resolved and the appropriate negative tests and packaged checks are evidenced. Review P2 items against supported features before release; P2 does not mean cosmetic or safe to ignore indefinitely.

**Interim containment:** do not treat the current LAN password as a sufficient boundary for untrusted networks. Avoid public forwarding or an unrestricted reverse proxy. Limit access to trusted devices while authorization is repaired. Loopback binding alone is not a complete answer to the browser-origin finding. Prefer trusted, encrypted remote sources; do not load arbitrary third-party feed metadata.

Severity used here:

- **P1:** urgent security, release or major correctness/recovery issue; address before release sign-off.
- **P2:** important defect or bounded-risk gap that needs a planned fix and regression coverage.
- **Refinement:** product-quality improvement, kept separate from established defects.
- **Conditional risk:** exposure depends on a path or deployment not demonstrated in this audit; not counted as a confirmed exploit.

No P0 incident or active compromise was established. No arbitrary-code-execution claim is made from the constrained path-traversal findings.

**Finding inventory:** 57 actionable findings: 11 P1 and 46 P2, plus two separately qualified security risks and twelve refinement themes. These are triage items across the whole product, not 57 security vulnerabilities or independent root causes.

[Open the interactive finding index](<C:/Users/Graham/.cursor/projects/c-Users-Graham-Documents-JoshWalki-Farmdash-server-edit-MAIN-CODEBASE-FarmHub/canvases/farmhub-full-audit-2026-09-05.canvas.tsx>) to filter by priority, area and text. It contains the same finding data and opens source references.

### P1 index

- **SEC-03:** Case-variant API paths bypass the LAN authentication guard.
- **SEC-04:** Loopback WebSockets and local writes trust network locality without browser-origin validation.
- **SEC-05:** Remote save-slot and detail metadata can escape cache roots.
- **REL-01:** Both installer manifests omit seven runtime modules.
- **DATA-01:** Late HTTP responses can replace the currently selected save.
- **PIPE-10:** A multiplayer mirror can be enriched with an unrelated same-slot local save.
- **UX-02:** Configuration-load failures are presented as a new empty configuration.
- **MOD-01:** Loose-world bale enumeration advances past its processing phase.
- **MOD-02:** A failed rename can be reported as a successful export replacement.
- **UX-01:** A failed initial server-list request disables automatic startup recovery.
- **SEC-01:** The packaged application is based on unsupported Electron 29.

## 2. What was actually examined

The product has several distinct execution surfaces: the Electron host, Express HTTP API and WebSocket stream, the legacy dashboard, the Preact NEW APP dashboard, separate setup and SimHub entries, and the FS25 mod's collection/export/mirror pipeline. Classic and RF releases have separate packaging configurations. Correct development behavior does not prove either installer is complete.

The main data path is:

1. FS25 collectors sample game state and write aggregate/detail exports; client mirroring supplies another live source.
2. The host discovers local files or downloads configured remote sources, and reads savegame XML.
3. The merger combines live, saved and hydrated detail data, applies last-good/section holds and persists a merged cache.
4. HTTP requests and WebSocket broadcasts feed the browser store and farm/save-scoped sections.

The important boundaries are remote input to filesystem paths, browser origin to local privileges, authenticated viewer to sensitive API, one save/session to another, and failed collection versus successful emptiness. Many current problems occur where those boundaries are represented by heuristics or receipt timestamps rather than explicit identity and status.

### Coverage by surface

### Desktop/backend and LAN API

**Depth:** Source/control-flow review.

Electron main/preload/updater, HTTP/WS authorization, setup policy and merge, credential handling, map/file resolvers, remote downloads, polling/watchers, cache persistence and image export. Specialized security review was combined with parent integration tracing.

### Data pipeline

**Depth:** Source/control-flow review plus existing suites.

Live/XML merge, ownership and identity matching, freshness and held snapshots, animal-detail hydration, file retries, server cache and mod settings XML. The normal main-process hold/backup/broadcast/persist sequence was traced.

### NEW APP UI

**Depth:** Main flows and all primary section modules reviewed; targeted browser checks.

Entry/bootstrap, API/WS/auth services, store, shell/navigation, setup, Settings, helper/error/freshness/notification surfaces, livestock expansion/detail, fields, vehicles, fleet map, pastures, productions, economy, storage and the standalone SimHub entry. Optional RF UI received narrower targeted screening, not complete visual validation.

### Legacy web UI

**Depth:** Targeted source review.

Bootstrap, realtime connector/fetch injection, dedupe/fanout, LAN HTTP authentication and selected shared contracts. Not every legacy screen was interactively exercised; the legacy serverId injection was traced and excluded as a false finding.

### FS25 mod core

**Depth:** Source/control-flow review and syntax-check attempt.

modDesc, load/update hooks, collector scheduler/writer, Courseplay compatibility, client mirror, settings, inventory, logging, shop guard and principal animal/vehicle/production/finance/weather/bale/stock collectors. Local engine evidence was consulted for FS25 unit contracts. The mod reviewer completed executable-code/control-flow review across all 42 shipped Lua files; this is source coverage, not 42 successful game-runtime executions.

### Optional mod integrations

**Depth:** Executable-code/control-flow source review.

Field, Economy, RedTape, Invoices, HirePurchasing, ExportEvent, Diagnostics and all 16 RF collector areas were included in the completed mod source review. External engine/wiki and sibling-mod references were targeted lookups, not full audits of those third-party projects.

### Release and dependencies

**Depth:** Manifest/CI/source review and automated checks.

Classic and RF package file lists, build wrappers, UI copy path, packaging test, CI, dependency lock/audit, TypeScript, Jest, Node ESM tests and Lua syntax script. No installer, update or packaged smoke test was executed.

### Runtime user experience

**Depth:** Synthetic browser only.

Current Vite source at desktop and 390x844, a two-save synthetic empty-farm API, setup HTTP503, programmatic label checks and Settings focus/Escape. No real credentials, live farm data or actual installation were modified.

### Outside this audit's demonstrated coverage

**Depth:** Not certified.

The adjacent Website, every optional RF UI screen, every translation, a live FS25 save or multiplayer session, exact installed binary contents, public proxy deployment, update delivery, full assistive-technology conformance and measured game/host performance.

## 3. Checks executed and evidence

### 3.1. Jest application suite: FAILED

**Command/method:** `npm test -- --runInBand`  
**Observed:** 494 / 497.

48 suites: 46 passed, 2 failed. 497 tests: 494 passed, 3 failed. Failures: packagedModules (1), mergeTransientPool.integration (2). Runtime Node 24.15.0; CI specifies Node 20.

### 3.2. Node ESM tests: PASSED

**Command/method:** `npm run test:mjs`  
**Observed:** 82 / 82.

82 tests passed. Includes new setup access and existing browser bootstrap/helper contract tests. Passing unit/helper checks do not prove current NEW APP entry-point behaviour.

### 3.3. NEW APP TypeScript: PASSED

**Command/method:** `npm run typecheck`  
**Observed:** Exit 0.

tsc -b --noEmit completed with exit 0. This checks types, not rendering, race conditions, startup recovery, accessibility or packaged code freshness.

### 3.4. Lua syntax tool: FAILED

**Command/method:** `node tools/check-lua-syntax.mjs`  
**Observed:** 41 / 42.

41 of 42 source files parsed in the tool's Lua 5.1 mode. FieldDataCollector.lua was rejected at 1:1 for a byte-order mark. This is a checker result, not proof of an FS25 runtime failure.

### 3.5. Production dependency audit: FAILED

**Command/method:** `npm audit --omit=dev --json`  
**Observed:** 7 packages.

Seven affected packages: four high and three moderate. These are package-level advisory findings, with shared transitive causes and differing reachability.

### 3.6. Cross-save response harness: REPRODUCED

**Command/method:** `In-memory transpilation of current ws-client.ts with deferred HTTP responses`  
**Observed:** C / B mismatch.

Switch B, then C; complete C then B. Result: selected server C, displayed payload B.

### 3.7. Startup recovery harness: REPRODUCED

**Command/method:** `In-memory transpilation of current ws-client.ts with failed server discovery`  
**Observed:** Retry skipped.

The first bootstrap rejects; the second invocation does no new discovery. One fetch attempt and zero onReady calls.

### 3.8. Livestock count harness: REPRODUCED

**Command/method:** `In-memory transpilation of current livestock-fanout.ts`  
**Observed:** 9 instead of 5.

Ten clusters of one head, authoritative target five. Reconciled output sums to nine.

### 3.9. Livestock health harness: REPRODUCED

**Command/method:** `In-memory transpilation of current livestock-fanout.ts`  
**Observed:** 100 instead of 0.

Explicit cluster average health zero emitted a synthetic animal with health 100.

### 3.10. Browser source UI review: FINDINGS

**Command/method:** `Current Vite source on 127.0.0.1:5187 with synthetic API on 127.0.0.1:8879`  
**Observed:** Desktop + phone.

Desktop overview rendered without captured console errors. Checked setup 503 failure, labels, Settings focus/Escape and 390 x 844 phone layout. Synthetic empty farm data, not a live FS25 session.

### Dependency context

- **builder-util-runtime / electron-updater:** High; inspected version electron-updater 6.8.3; affected nested builder-util-runtime. Cross-origin redirect credential forwarding. The inspected updater has no private token/custom headers, so that leak was not demonstrated here.
- **fast-uri:** High; inspected version 3.1.2. URI/host parsing and normalization advisories. Reachability depends on the caller and attacker-controlled URL inputs; no application-specific SSRF exploit was demonstrated.
- **js-yaml:** High; inspected version 4.2.0 override. Advisories concern resource use in affected YAML processing. Review actual configuration inputs and update the hard override with compatibility coverage.
- **body-parser / express / qs:** Moderate package classification; inspected version 1.20.5 / 4.22.2 / 6.15.2. Shared query/body parsing dependency causes are counted at package level. Validate request limits and affected options while updating the compatible chain.
- **Electron runtime:** Separate support risk; inspected version 29.4.6. Not part of the production-only npm result. Evaluate the shipped runtime against Electron's supported major lines and test IPC/update behavior during migration.

The production npm result has zero critical, four high and three moderate affected packages. No automatic dependency upgrades were performed.
### What the failing checks do and do not establish

**Packaging:** the existing packaging test identifies missing runtime modules in explicit release file lists. Several are unconditionally required at startup. Its additional `package.json` complaint must be handled separately because Electron Builder includes package metadata automatically. Do not "fix" the genuine runtime omissions by merely weakening the test.

**Merge integration:** two failing tests use mutable real AppData cache material rather than hermetic raw XML/live fixtures. Some paths silently return when the cache is missing, and assertions include assumptions about a particular vehicle population. Their failures are not independent proof of each ownership defect, and their passing elsewhere would not exonerate the source heuristics. Replace the fixtures and make externally dependent cases explicitly skip with a reason.

**Lua:** the checker parsed in its configured Lua 5.1 mode and rejected a byte-order mark at the first character of FieldDataCollector.lua. That is an encoding/tooling gate failure, not proof that FS25 cannot load the file. The installed luaparse dependency is not declared by the checker package, so a clean checkout may not reproduce the tool environment.

**Dependencies:** npm reports affected packages, not independent reachable exploits. Some results have shared transitive causes. The updater configuration inspected does not supply private authentication headers, which narrows the credential-forwarding advisory's relevance. Electron is a shipped runtime even though npm labels its package a development dependency; `--omit=dev` does not establish its security support.

**Environment:** tests ran with Node 24.15.0 while CI declares Node 20. No source build of a release installer, install/update execution, live HTTP-feed credential test or FS25 game session was run. The live-feed test's early-return gate is not live integration evidence.

### Browser evidence

The browser served current NEW APP source through an isolated Vite instance and a synthetic two-save API. It did not use the installed dashboard service or change the user's real setup. The desktop overview rendered without captured console errors. The focused checks demonstrated a misleading empty setup after HTTP 503, missing input associations, incorrect Settings focus/Escape behavior and clipped phone-header controls.

The phone screenshot uses a settled 390 x 844 viewport. A screenshot taken immediately during viewport transition was discarded and is not evidence. Synthetic empty-farm data is suitable for these shell/form checks, not for judging large-farm behavior, map accuracy or the quality of every section.

The temporary browser servers were stopped after this review, and the viewport override was reset.

### Reproduction notes

**Cross-save HTTP race:** the current ws-client.ts was transpiled in memory with controlled deferred responses. Select B, select C, complete C, then complete B. The observed store retained activeServerId C while displaying B's payload. This proves the tested current-source HTTP path; it does not claim every WebSocket ordering was exercised.

**Startup recovery:** reject the initial server discovery and invoke bootstrap again after the failure. The current module made one discovery attempt and no ready callbacks across both calls. No real server or saved configuration was needed.

**Livestock arithmetic:** reconcile ten one-head clusters against an authoritative total of five. The emitted total was nine. In a separate current-source case, explicit average health zero emitted health 100. These small fixtures isolate the calculation errors from uncertain live-game sampling.

**Setup failure:** the synthetic /api/setup-config endpoint returned HTTP503. The browser displayed the new/empty server manager and active launch controls without a persistent read-failure state. The subsequent nonempty replacement behavior was traced in the backend source; the audit did not submit a destructive replacement against real settings.

**Dialog interaction:** after opening Settings, document.activeElement remained on the background Settings button. Pressing Escape left the dialog present. This is a focused focus/Escape result, not a complete screen-reader conformance test.

**Phone layout:** at a settled 390px width, the Settings control extended to approximately x=477 and the save controls were obscured by the non-shrinking header groups. The browser exercised local-view mode; remote mode has different visible actions and still needs its own device acceptance pass.


### Retained screenshots

**Desktop overview:** current source, synthetic empty-farm data; no live data-accuracy conclusion should be inferred.

![Synthetic desktop overview](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/docs/_internal/audits/farmhub-audit-desktop-2026-09-05.png>)

**Phone header:** settled 390 x 844 local-view layout; clipped header/save controls.

![Phone header clipping evidence](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/docs/_internal/audits/farmhub-audit-phone-2026-09-05.png>)

**Failed setup read:** synthetic HTTP503 appears as an empty ready configuration.

![Setup read failure shown as empty setup](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/docs/_internal/audits/farmhub-audit-setup-2026-09-05.png>)

## 4. Detailed findings

Each item includes its priority, evidence strength, source locations, failure condition, user impact, recommended correction and a future acceptance check. Acceptance checks are proposals unless explicitly listed above as executed. Related findings are intentionally kept separate when they occur at different boundaries or need different regression tests.

### SEC-03 [P1] Case-variant API paths bypass the LAN authentication guard

**Area:** LAN authentication.  
**Evidence level:** Source-confirmed guard/router mismatch; no live credential bypass attempted.

**Source:** [FS25_FarmDashboard_App/main.js:838](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:838>).

**Condition and cause:** The global guard exempts GET/HEAD paths that do not start with lowercase /api/. Express uses case-insensitive routing by default, so /API/data, /API/servers and /API/lan-ws-token can miss the guard but still reach their handlers. When lanAuthOptional is enabled, trailing slashes can also evade exact sensitive-path checks.

**End-user impact:** A reachable client allowed by the optional IP allowlist can read farm data without credentials and obtain the token used for WebSocket streaming. This is a protection-boundary defect, not just inconsistent error handling.

**Recommended correction:** Apply authorization at the API router/handler boundary using the same route-matching semantics, with narrowly declared public exceptions. Do not rely on raw case-sensitive path prefixes or exact-string deny lists.

**Acceptance:** Unauthenticated uppercase/mixed-case and trailing-slash variants of every sensitive endpoint fail consistently; authorized requests, static assets and explicitly public status still work.

### SEC-04 [P1] Loopback WebSockets and local writes trust network locality without browser-origin validation

**Area:** Browser trust boundary.  
**Evidence level:** Source-confirmed policy gap; hostile-browser exploit not executed.

**Source:** [FS25_FarmDashboard_App/main.js:1506](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:1506>); [FS25_FarmDashboard_App/main.js:1808](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:1808>); [FS25_FarmDashboard_App/main.js:1827](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:1827>); [FS25_FarmDashboard_App/main.js:1852](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:1852>).

**Condition and cause:** Loopback WebSocket upgrades are immediately authorized and the verifier does not validate Origin. Sensitive local HTTP paths also bypass write gates based on socket locality; image export checks locality alone. HTTP CORS does not protect WebSocket upgrades or prevent cross-origin form side effects.

**End-user impact:** An untrusted page, where browser local-network policy permits the connection, can receive subsequent farm broadcasts over loopback and can trigger eligible local actions. Browser protections affect reachability but do not repair the application's trust decision.

**Recommended correction:** Validate browser Origin and authority, require scoped tokens for sensitive upgrades/writes including loopback, and distinguish legitimate Electron IPC from browser HTTP requests.

**Acceptance:** Hostile-origin WebSocket upgrades and form POSTs fail in an isolated browser harness; legitimate desktop, trusted LAN viewer and nonbrowser integrations retain explicitly authorized access.

### SEC-05 [P1] Remote save-slot and detail metadata can escape cache roots

**Area:** Filesystem containment.  
**Evidence level:** Source-confirmed untrusted-input path construction; outside writes not exercised.

**Source:** [FS25_FarmDashboard_App/main.js:2424](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:2424>); [FS25_FarmDashboard_App/main.js:2443](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:2443>); [FS25_FarmDashboard_App/main.js:2863](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:2863>); [FS25_FarmDashboard_App/livestockDetail.js:341](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/livestockDetail.js:341>); [FS25_FarmDashboard_App/livestockDetail.js:511](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/livestockDetail.js:511>).

**Condition and cause:** Remote serverInfo.saveSlot values enter filesystem paths without a strict identifier contract. Dirty-index idScheme also accepts arbitrary strings and becomes part of a cache path. Traversal components can therefore influence download destinations outside the intended per-server cache.

**End-user impact:** A configured or compromised remote source can create or overwrite constrained XML/detail files outside its cache. The evidence does not establish arbitrary code execution or unrestricted arbitrary filenames.

**Recommended correction:** Validate slots against the supported numeric/identifier domain, enumerate accepted idScheme values, and enforce resolved absolute-path containment immediately before every filesystem operation.

**Acceptance:** Traversal, separators, absolute paths and malformed identifiers are rejected before reads/writes; isolated malicious-feed fixtures cannot touch files outside their assigned cache root.

### REL-01 [P1] Both installer manifests omit seven runtime modules

**Area:** Release.  
**Evidence level:** Existing test failure and source.

**Source:** [FS25_FarmDashboard_App/package.json:52](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/package.json:52>); [FS25_FarmDashboard_App/electron-builder.rf.yml:22](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/electron-builder.rf.yml:22>); [FS25_FarmDashboard_App/tests/packagedModules.test.js:78](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/tests/packagedModules.test.js:78>); [FS25_FarmDashboard_App/main.js:42](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:42>); [FS25_FarmDashboard_App/main.js:72](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:72>).

**Condition and cause:** The classic and RF manifests omit mapFieldOutlines.cjs, httpFeedXml.js, setupAccessPolicy.cjs, setupConfigMerge.cjs, uxContract.cjs, fleetMapOverlays.cjs and fleetMapGeo.cjs. The existing packaging test fails on this closure. Its additional package.json warning needs separate treatment because Electron Builder automatically includes package metadata.

**End-user impact:** A development checkout can run while a newly packaged installer fails during startup or when loading a required feature. This is a release blocker for both editions.

**Recommended correction:** Generate or share the runtime file manifest, validate both effective product configurations, then install and launch each packaged artifact in a clean profile. Correct the package.json false positive independently.

**Acceptance:** Every required local module exists in each app.asar; classic and RF clean-install launches pass; packaging guards are a prerequisite to release.

### DATA-01 [P1] Late HTTP responses can replace the currently selected save

**Area:** Data correctness.  
**Evidence level:** Reproduced with actual TypeScript module.

**Source:** [NEW APP/src/services/ws-client.ts:98](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/NEW APP/src/services/ws-client.ts:98>); [NEW APP/src/services/ws-client.ts:122](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/NEW APP/src/services/ws-client.ts:122>); [NEW APP/src/store/dashboard-store.ts:172](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/NEW APP/src/store/dashboard-store.ts:172>).

**Condition and cause:** pollOnce, refreshDashboard and switchActiveServer capture a server ID before awaiting the request, then ingest the response without confirming that the active context still matches. Switching B then C and resolving C before B leaves activeServerId=C with payload from B. The existing payload also remains visible immediately after a switch.

**End-user impact:** Money, fields, vehicles, animals and alert baselines can be displayed under the wrong save name. A failed switch can leave the mismatch indefinitely.

**Recommended correction:** Use a context generation and request sequence, abort obsolete work, and associate each payload with its server/save identity. Clear or explicitly mark the previous save while the new selection loads.

**Acceptance:** Delayed B responses cannot alter C, including polling, manual refresh, failed switches and WS/HTTP overlap; notification history remains scoped correctly.

### PIPE-10 [P1] A multiplayer mirror can be enriched with an unrelated same-slot local save

**Area:** World identity.  
**Evidence level:** Source-confirmed resolver and main-process merge path.

**Source:** [FS25_FarmDashboard_App/xmlCollector.js:246](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/xmlCollector.js:246>); [FS25_FarmDashboard_App/xmlCollector.js:254](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/xmlCollector.js:254>); [FS25_FarmDashboard_App/xmlCollector.js:262](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/xmlCollector.js:262>); [FS25_FarmDashboard_App/main.js:2601](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:2601>); [FS25_FarmDashboard_App/main.js:2230](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:2230>).

**Condition and cause:** The XML resolver removes the mirror_ prefix and accepts a same-numbered local save when careerSavegame.xml exists. With no preferred server XML cache, mirror_savegame1 can resolve to an unrelated local savegame1. Neither this resolution nor the outer merge path verifies world identity.

**End-user impact:** A multiplayer server's live data can be combined with another world's farms, fields, ownership, vehicles and economy. Sharing a slot number, or even a map name, does not mean two saves are the same world.

**Recommended correction:** Keep mirrors live-Lua-only unless explicitly associated with server XML whose world/save identity has been verified. Never create that association merely by stripping the mirror_ prefix.

**Acceptance:** An unrelated same-slot local save cannot enrich a mirror; explicitly associated identity-matched server XML can. Include distinct worlds with the same map name.

### UX-02 [P1] Configuration-load failures are presented as a new empty configuration

**Area:** Setup.  
**Evidence level:** Browser reproduced using synthetic HTTP 503.

**Source:** [NEW APP/src/setup/main.tsx:91](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/NEW APP/src/setup/main.tsx:91>); [NEW APP/src/setup/main.tsx:100](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/NEW APP/src/setup/main.tsx:100>); [NEW APP/src/setup/main.tsx:221](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/NEW APP/src/setup/main.tsx:221>); [FS25_FarmDashboard_App/setupConfigMerge.cjs:4](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/setupConfigMerge.cjs:4>); [FS25_FarmDashboard_App/main.js:3254](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:3254>).

**Condition and cause:** The new setup page handles E_SETUP_LOCAL_ONLY specially but swallows other load errors, keeps servers=[], and marks the form ready. With /api/setup-config returning 503, the browser displayed 'No servers added yet' with Add Server and Launch Dashboard available. Backend confirmation: a nonempty incoming servers array is mapped as the replacement list; matching records retain secrets, but omitted server IDs are not retained. main.js assigns and persists that result. An existing A/B configuration can therefore be replaced by newly entered C after the failed read. Empty submissions use a different preserve-existing rule and must not be confused with this case.

**End-user impact:** Users can unintentionally remove existing server configurations after a transient read failure. The browser demonstrated the misleading ready/empty state; the destructive replacement path was established from source, not exercised against the user's configuration.

**Recommended correction:** Keep a separate configuration-load state; show a persistent failure with Retry and retain any known draft. Enable destructive configuration submission only after a successful load, and add revision-aware server-side saves.

**Acceptance:** 401, 403, 500, malformed JSON and network failures never become an empty successful load; adding a new save after a failed load cannot remove existing saves.

### MOD-01 [P1] Loose-world bale enumeration advances past its processing phase

**Area:** Mod inventory.  
**Evidence level:** Source-confirmed control-flow defect.

**Source:** [FS25_FarmDashboard_Mod/src/InventoryScan.lua:1094](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/InventoryScan.lua:1094>); [FS25_FarmDashboard_Mod/src/collectors/BaleInventoryCollector.lua:48](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/BaleInventoryCollector.lua:48>).

**Condition and cause:** When enumeration finishes, the source is marked built and sourceIdx is advanced immediately. The branch that calls rt.tryBale for that built source is therefore skipped. Storage-derived counts can conceal the absence of loose-world bales.

**End-user impact:** A player can have visible loose bales in the world while the dashboard reports none from these enumeration sources.

**Recommended correction:** Keep the current source selected after enumeration; process the completed list in bounded slices, then advance. Preserve cross-source deduplication.

**Acceptance:** One loose bale is counted once; a list larger than a slice is fully processed over subsequent ticks; duplicate references across sources do not double-count.

### MOD-02 [P1] A failed rename can be reported as a successful export replacement

**Area:** Mod persistence.  
**Evidence level:** Source-confirmed failure path; filesystem fault not injected.

**Source:** [FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua:594](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua:594>); [FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua:3547](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua:3547>); [FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua:3995](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua:3995>).

**Condition and cause:** _movePathBestEffort ignores the return value from os.rename and treats an existing destination as evidence of success. That destination may be the previous export. The copy fallback also does not robustly establish that the new content was committed. Export/detail progress and mirror notification can proceed on a false success.

**End-user impact:** On a replacement failure, local disk can retain old data while the mirror publishes a new generation and bookkeeping says the write succeeded. The frequency depends on filesystem and host behavior.

**Recommended correction:** Check rename, write and close outcomes; retain the previous known-good file on failure; advance export generation, detail ledger and mirror notification only after the new file is committed.

**Acceptance:** Inject rename failure with a pre-existing destination, copy/write failure and recovery. Each failure remains visible and does not advance committed generation; successful disk and mirror exports agree.

### UX-01 [P1] A failed initial server-list request disables automatic startup recovery

**Area:** Startup.  
**Evidence level:** Reproduced with actual TypeScript module.

**Source:** [NEW APP/src/services/ws-client.ts:200](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/NEW APP/src/services/ws-client.ts:200>); [NEW APP/src/services/api-client.ts:37](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/NEW APP/src/services/api-client.ts:37>); [NEW APP/src/main.tsx:26](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/NEW APP/src/main.tsx:26>); [NEW APP/src/components/SplashScreen.tsx:55](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/NEW APP/src/components/SplashScreen.tsx:55>).

**Condition and cause:** bootstrapRealtime sets started=true before awaiting fetchServers outside its try/catch. A network rejection exits before connecting the socket, scheduling polling, or calling onReady. A second bootstrap returns immediately because started remains true. A harness observed one fetch attempt and zero ready callbacks across two bootstrap calls.

**End-user impact:** A temporary network failure during first load leaves an empty or disconnected shell after the splash safety timer. Restoring the network does not resume this bootstrap path.

**Recommended correction:** Model starting/running/failed states, place the server discovery inside recovery handling, reset or share the startup promise correctly, and expose a retry that restarts the complete workflow.

**Acceptance:** Fail the first server-list fetch, restore it, retry and receive data without reloading the page; no duplicate pollers or sockets are created.

### SEC-01 [P1] The packaged application is based on unsupported Electron 29

**Area:** Security dependencies.  
**Evidence level:** Lockfile and official support policy.

**Source:** [FS25_FarmDashboard_App/package.json:149](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/package.json:149>).

**Condition and cause:** The lockfile resolves Electron 29.4.6 and the manifest restricts updates to major 29. Electron supports its latest three stable major release lines. This runtime is shipped inside the desktop product even though npm categorizes Electron as a development dependency.

**End-user impact:** A production-only npm audit does not establish that the embedded Chromium/Node runtime is supported or receiving current security fixes.

**Recommended correction:** Move to a currently supported Electron release, validate preload/IPC, updater, graphics, file access and installer compatibility, and add an explicit runtime support check to release CI.

**Acceptance:** Both product editions ship a supported Electron line and pass clean-install, update, navigation/IPC and representative rendering checks.

Support-policy reference: [Electron release timelines](https://www.electronjs.org/docs/latest/tutorial/electron-timelines).

### A11Y-01 [P2] Dialogs lack keyboard focus management and Escape handling

**Area:** Accessibility.  
**Evidence level:** Browser reproduced and source-confirmed.

**Source:** [NEW APP/src/settings/SettingsModal.tsx:491](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/NEW APP/src/settings/SettingsModal.tsx:491>); [NEW APP/src/components/WeatherModal.tsx:34](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/NEW APP/src/components/WeatherModal.tsx:34>); [NEW APP/src/platform/LanAuthOverlay.tsx:136](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/NEW APP/src/platform/LanAuthOverlay.tsx:136>); [NEW APP/src/platform/NotificationBell.tsx:46](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/NEW APP/src/platform/NotificationBell.tsx:46>).

**Condition and cause:** Opening Settings left document.activeElement on the Settings button behind the dialog. Pressing Escape left the dialog open. The shared-looking modal markup is repeated without a common focus manager; aria-modal by itself does not move focus, contain Tab navigation or restore focus.

**End-user impact:** Keyboard and assistive-technology users can navigate the obscured dashboard and struggle to enter or leave dialogs predictably.

**Recommended correction:** Introduce one tested modal primitive with initial focus, focus containment, background inertness, Escape handling, focus restoration and accessible names. Preserve unsaved-draft confirmation where relevant.

**Acceptance:** Keyboard-only tests cover Settings, login, weather, notifications and livestock dialogs; focus stays in the active dialog and returns to the invoking control.

### A11Y-02 [P2] Setup inputs have visual labels without programmatic associations

**Area:** Accessibility.  
**Evidence level:** Browser reproduced.

**Source:** [NEW APP/src/setup/main.tsx:312](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/NEW APP/src/setup/main.tsx:312>); [NEW APP/src/setup/main.tsx:423](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/NEW APP/src/setup/main.tsx:423>); [NEW APP/src/setup/main.tsx:475](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/NEW APP/src/setup/main.tsx:475>).

**Condition and cause:** Labels for language, polling values, display name, local paths and FTP fields are adjacent to controls without for/id links. The browser inspection found six non-radio controls on the default local setup view with zero associated labels and no aria-label.

**End-user impact:** Screen readers cannot reliably announce a field's purpose; clicking its label does not focus it. Error toasts do not identify the field needing correction.

**Recommended correction:** Use stable control IDs, label associations, helper/error IDs, aria-invalid and a form-level error summary that focuses the first invalid field.

**Acceptance:** Every setup control has the expected accessible name; all validation errors are programmatically linked and remain visible until corrected.

### BACK-01 [P2] Changing only an FTP password does not update the live poller's credentials

**Area:** Configuration lifecycle.  
**Evidence level:** Source-confirmed retained configuration.

**Source:** [FS25_FarmDashboard_App/setupConfigMerge.cjs:45](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/setupConfigMerge.cjs:45>); [FS25_FarmDashboard_App/main.js:3025](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:3025>); [FS25_FarmDashboard_App/main.js:3267](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:3267>).

**Condition and cause:** The reboot signature excludes ftpPass. A password-only save therefore returns without replacing the coordinator, whose live poller holds the old server object. XML polling resolves current configuration separately.

**End-user impact:** The UI can say the corrected password was saved while live Lua polling continues to fail until restart, and XML/live source behavior can disagree.

**Recommended correction:** Resolve current validated configuration for each cycle or restart only the affected poller when any connection credential changes; compare a secret revision rather than logging secret values.

**Acceptance:** A password-only save changes the next live poll's credential without a full application restart, and all source paths agree on the active configuration generation.

### BACK-02 [P2] Image-export completion references an undefined suppressNative flag

**Area:** Image export.  
**Evidence level:** Source-confirmed undefined identifier.

**Source:** [FS25_FarmDashboard_App/main.js:351](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:351>); [FS25_FarmDashboard_App/main.js:573](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:573>); [FS25_FarmDashboard_App/main.js:584](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:584>).

**Condition and cause:** The export function accepts progressSender but does not define suppressNative. Completion and several failure branches reference that name; the IPC caller supplies an options argument that the function ignores.

**End-user impact:** A successful Windows export can throw while reporting completion instead of returning success. Some failure paths also lose their intended error or native-dialog behavior.

**Recommended correction:** Accept and normalize the options parameter and define the dialog-suppression flag in function scope; keep IPC and HTTP result contracts aligned.

**Acceptance:** Successful, failed and timed-out exports return the intended structured result through both IPC and HTTP, without a ReferenceError or unintended native dialog.

### DATA-02 [P2] Cluster rounding can still exceed the authoritative animal total

**Area:** Livestock.  
**Evidence level:** Reproduced with actual TypeScript module.

**Source:** [NEW APP/src/lib/livestock-fanout.ts:98](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/NEW APP/src/lib/livestock-fanout.ts:98>); [NEW APP/src/lib/livestock-fanout.ts:118](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/NEW APP/src/lib/livestock-fanout.ts:118>).

**Condition and cause:** The reconciliation rounds every bucket, then applies the entire difference to one largest bucket and clamps it at zero. Ten one-head clusters reconciled to an authoritative total of five produce nine heads: the five-head reduction exceeds the single bucket's capacity.

**End-user impact:** Synthetic individual rows, livestock totals and downstream summaries can exceed the reported herd size, especially when many small groups need to be scaled down.

**Recommended correction:** Use a largest-remainder apportionment algorithm or distribute negative corrections across buckets while preserving nonnegative integers and the exact total.

**Acceptance:** For arbitrary nonnegative cluster sets, output counts are integers >=0 and sum exactly to the authoritative target; cover many small groups, zero and extreme downscaling.

### DATA-03 [P2] A zero-health cluster is displayed as fully healthy

**Area:** Livestock.  
**Evidence level:** Reproduced with actual TypeScript module.

**Source:** [NEW APP/src/lib/livestock-fanout.ts:29](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/NEW APP/src/lib/livestock-fanout.ts:29>); [NEW APP/src/lib/livestock-fanout.ts:229](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/NEW APP/src/lib/livestock-fanout.ts:229>).

**Condition and cause:** resolveClusterHealth accepts avgHealth and parent health only when greater than zero, then falls back to 100. An explicit avgHealth=0 produced an emitted animal row with health=100 in the harness.

**End-user impact:** The worst-health group can look healthy, misleading inspection and any summary or alert that consumes these generated rows.

**Recommended correction:** Distinguish missing or nonfinite values from the valid value zero, normalize the supported range, and keep estimated cluster data visibly labelled.

**Acceptance:** Health 0 stays 0, 100 stays 100, and missing/nonfinite health is shown as unknown or follows a documented estimate policy.

### MOD-03 [P2] Moisture grading helper is referenced before its local declaration

**Area:** Mod inventory.  
**Evidence level:** Source-confirmed Lua lexical-scope defect.

**Source:** [FS25_FarmDashboard_Mod/src/InventoryScan.lua:291](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/InventoryScan.lua:291>); [FS25_FarmDashboard_Mod/src/InventoryScan.lua:362](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/InventoryScan.lua:362>); [FS25_FarmDashboard_Mod/src/InventoryScan.lua:1395](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/InventoryScan.lua:1395>).

**Condition and cause:** _patchLocationMoisture refers to _moistureGrade before the later local function declaration is in scope. Lua binds the earlier reference as a global, rather than to the later local function.

**End-user impact:** When the moisture-enabled location path calls this helper and no matching global exists, stock finalization can fail instead of returning the silo's inventory.

**Recommended correction:** Declare the local helper before any closure that references it, or forward-declare the local and assign it later.

**Acceptance:** Finalize a moisture-enabled silo with no global _moistureGrade; stock collection completes and grades are correct.

### MOD-04 [P2] Fixed-stride animal sampling exports inflated exact-looking bucket counts

**Area:** Mod livestock.  
**Evidence level:** Source-confirmed sampling arithmetic.

**Source:** [FS25_FarmDashboard_Mod/src/collectors/AnimalDataCollector.lua:106](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/AnimalDataCollector.lua:106>); [FS25_FarmDashboard_Mod/src/collectors/AnimalDataCollector.lua:543](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/AnimalDataCollector.lua:543>); [FS25_FarmDashboard_Mod/src/collectors/AnimalDataCollector.lua:691](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/AnimalDataCollector.lua:691>).

**Condition and cause:** Sampling every tenth animal and scaling every sample by ten yields six samples for a 51-animal population and can export buckets totaling 60. The independently reported total does not correct those bucket counts. Frontend reconciliation offers partial mitigation but has its own defect documented in DATA-02.

**End-user impact:** Subtype, age or condition breakdowns can disagree with herd totals, and minority conditions may be missed while the UI presents estimated rows as exact.

**Recommended correction:** Count cheap categorical fields exactly where feasible. Otherwise use population-aware weights, reconcile the bucket total exactly and expose sampling/coverage metadata.

**Acceptance:** Populations of 50, 51, 59 and 60 with mixed subtypes and rare unhealthy animals have honest, reconciled totals and visibly identified estimates.

### MOD-05 [P2] Courseplay mode changes asset scope and valuation basis

**Area:** Mod finance.  
**Evidence level:** Source-confirmed branch inconsistency.

**Source:** [FS25_FarmDashboard_Mod/src/collectors/FinanceDataCollector.lua:59](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/FinanceDataCollector.lua:59>); [FS25_FarmDashboard_Mod/src/collectors/FinanceDataCollector.lua:119](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/FinanceDataCollector.lua:119>).

**Condition and cause:** The Courseplay cached branch totals purchase prices across farms, while the normal branch filters the target farm and uses sell values. Cash remains farm-specific, so the combined finance result mixes scopes and valuation methods.

**End-user impact:** Enabling Courseplay can change a farm's reported assets or net worth without any economic event, especially in multiplayer.

**Recommended correction:** Apply the same farm filter and documented valuation method in both branches; expose purchase and resale value as separate metrics if both are useful.

**Acceptance:** For unchanged vehicles and ownership, toggling Courseplay does not change farm-specific totals; multiplayer farms never inherit each other's assets.

### MOD-06 [P2] Frame delta is multiplied by 1,000 a second time

**Area:** Mod efficiency.  
**Evidence level:** Source-confirmed unit error.

**Source:** [FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua:2958](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua:2958>); [FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua:3100](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua:3100>).

**Condition and cause:** The game update delta is already milliseconds, but collector timing records dt*1000. A normal 16ms frame becomes 16,000ms against a 25ms stress threshold, systematically selecting stressed-workload behavior such as the reduced animal slice.

**End-user impact:** Adaptive collection can operate in permanent stress mode, distorting diagnostics and slowing completion even on a healthy frame budget.

**Recommended correction:** Keep dt in milliseconds consistently, name timing fields with units and separate actual frame duration from collector execution cost.

**Acceptance:** update(16) records 16ms and does not trigger a >25ms frame threshold; real slow frames still reduce work appropriately.

### MOD-07 [P2] Courseplay compatibility performs four whole-fleet passes per frame

**Area:** Mod efficiency.  
**Evidence level:** Source-confirmed repeated work; FPS impact not benchmarked.

**Source:** [FS25_FarmDashboard_Mod/src/FarmDashboard.lua:183](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboard.lua:183>); [FS25_FarmDashboard_Mod/src/FarmDashboard.lua:196](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboard.lua:196>); [FS25_FarmDashboard_Mod/src/FarmDashboardCourseplayCompat.lua:437](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardCourseplayCompat.lua:437>).

**Condition and cause:** The compatibility shield is called twice in one update path, and each call traverses the complete vehicle collection twice, regardless of whether a vehicle is pending initialization.

**End-user impact:** Large fleets pay repeated per-frame work for a condition that usually changes only on vehicle load or specialization updates. This is a workload finding, not a measured frame-rate regression.

**Recommended correction:** Use a bounded pending/changed-vehicle queue and one scheduled shield pass. Keep a low-frequency safety reconciliation only if engine behavior requires it.

**Acceptance:** An unchanged fleet performs no full repeated shield work each frame; newly loaded vehicles are protected; benchmark representative large fleets with and without Courseplay.

### MOD-08 [P2] Adaptive scheduling overwrites the user's collection interval

**Area:** Mod configuration.  
**Evidence level:** Source-confirmed configuration overwrite.

**Source:** [FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua:975](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua:975>); [FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua:2765](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua:2765>).

**Condition and cause:** A population/fleet-based adaptive rule chooses a 60-300 second collection cycle and is invoked unconditionally, overwriting config.collectionCycleMs. A deliberately longer user interval therefore does not remain in force.

**End-user impact:** Users cannot reliably trade data freshness for lower game workload, and settings can appear saved while behavior ignores them.

**Recommended correction:** Separate manual and adaptive scheduling modes, respect the configured minimum/maximum contract, and show the effective interval plus its reason.

**Acceptance:** A configured 30-minute manual interval survives subsequent cycles; adaptive mode stays within documented user bounds and reports its effective cadence.

### MOD-09 [P2] A collector exception can mark reused data as fresh

**Area:** Mod freshness.  
**Evidence level:** Source-confirmed exception path.

**Source:** [FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua:2726](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua:2726>); [FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua:2997](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua:2997>).

**Condition and cause:** A caught collectStep exception proceeds through finishModuleSlice, whose success bookkeeping sets _cycleFresh[name]=true. The assembled export may therefore contain retained payload marked as freshly collected.

**End-user impact:** The dashboard can suppress stale-data warnings precisely when a collector has failed, leaving the player with misleading confidence in old values.

**Recommended correction:** Represent success, successful-empty, skipped and failed outcomes separately. On failure retain the original data timestamp and attach a collection error without preventing other modules from completing.

**Acceptance:** A forced exception marks only that module stale/failed with its original timestamp; other sections finish; a later successful collection clears the error.

### MOD-10 [P2] Synthetic Bakery and Dairy entries are presented as real selling opportunities

**Area:** Mod economy.  
**Evidence level:** Source-confirmed station/price fabrication.

**Source:** [FS25_FarmDashboard_Mod/src/collectors/EconomyDataCollector.lua:825](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/EconomyDataCollector.lua:825>); [FS25_FarmDashboard_Mod/src/collectors/EconomyDataCollector.lua:857](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/EconomyDataCollector.lua:857>); [FS25_FarmDashboard_Mod/src/collectors/EconomyDataCollector.lua:907](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/EconomyDataCollector.lua:907>); [FS25_FarmDashboard_Mod/src/collectors/EconomyDataCollector.lua:1087](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/EconomyDataCollector.lua:1087>).

**Condition and cause:** The collector creates Bakery/Dairy station entries and applies 80%/85% price factors without establishing that the facilities, accepted products or quotes exist. These synthetic entries reach station aggregation and can replace actual quotes.

**End-user impact:** The dashboard can recommend a selling destination that does not exist on the map, or show a calculated price as though it were an available quote.

**Recommended correction:** Derive facilities, product acceptance and prices from actual selling stations. Keep estimates in a separate explicitly labelled channel and never overwrite a real quote with an estimate.

**Acceptance:** Maps without these facilities gain no fictitious destinations; real station quotes/acceptance remain unchanged; any retained estimate is clearly distinguished from a real offer.

### MOD-11 [P2] Name validation rejects legitimate uppercase fill-type identifiers

**Area:** Mod economy.  
**Evidence level:** Source-confirmed overbroad validation.

**Source:** [FS25_FarmDashboard_Mod/src/collectors/EconomyDataCollector.lua:1524](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/EconomyDataCollector.lua:1524>); [FS25_FarmDashboard_Mod/src/collectors/EconomyDataCollector.lua:1833](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/EconomyDataCollector.lua:1833>).

**Condition and cause:** The actual-station path validates product names with a rule rejecting a run of seven uppercase letters. Valid canonical identifiers such as SOYBEAN, SUNFLOWER and SUGARBEET match that rule when a localized display name is unavailable.

**End-user impact:** Valid station/product quotes can disappear. Forced/default entries may mask the omission without preserving the actual quote.

**Recommended correction:** Validate registry membership or explicit unresolved-token formats, not capitalization or length. Resolve display labels separately from canonical identity.

**Acceptance:** Registered uppercase products retain actual station quotes without localization; truly unresolved tokens receive a safe fallback without deleting valid products.

### MOD-12 [P2] Shared noncyclic Lua tables are serialized as null after their first occurrence

**Area:** Mod serialization.  
**Evidence level:** Source-confirmed serializer and reachable RF collector example.

**Source:** [FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua:3851](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua:3851>); [FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua:3931](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua:3931>); [FS25_FarmDashboard_Mod/src/collectors/rf/RfNpcFavorDataCollector.lua:200](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/rf/RfNpcFavorDataCollector.lua:200>).

**Condition and cause:** The JSON encoder uses a visited-table set but does not remove a table when recursion returns. It therefore treats a repeated reference as a cycle. RF NPC favor attaches the same relationships table to several farm results, providing a concrete reachable noncyclic case.

**End-user impact:** The first farm/property retains the data and later occurrences become null; which result survives can depend on traversal order.

**Recommended correction:** Track only the active recursion stack for cycle detection, removing the table on return. Define a separate deliberate policy for actual cycles.

**Acceptance:** Both a and b in {a=shared,b=shared} serialize completely; a real self-cycle does not hang; multiple farms sharing relationships retain equivalent complete data.

### MOD-13 [P2] Available-contract collection calls a helper outside its local scope

**Area:** RedTape integration.  
**Evidence level:** Source-confirmed Lua lexical-scope defect.

**Source:** [FS25_FarmDashboard_Mod/src/collectors/RedTapeDataCollector.lua:116](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/RedTapeDataCollector.lua:116>); [FS25_FarmDashboard_Mod/src/collectors/RedTapeDataCollector.lua:137](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/RedTapeDataCollector.lua:137>); [FS25_FarmDashboard_Mod/src/collectors/RedTapeDataCollector.lua:374](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/RedTapeDataCollector.lua:374>).

**Condition and cause:** The available-contract path references a helper before its later local declaration, with no earlier local binding. Lua resolves that reference as a global. A protected call catches the resulting failure and leaves the exported contract list empty.

**End-user impact:** Existing available RedTape contracts can disappear without an obvious top-level exception, looking like a legitimate empty list.

**Recommended correction:** Move or forward-declare the same local helper before its caller, and report failure separately from successful emptiness.

**Acceptance:** With the corresponding global unset, existing available contracts export correctly; a genuine empty source remains empty and an absent optional mod remains safely unavailable.

### MOD-14 [P2] Field collection scans world objects synchronously before reaching its yielding phase

**Area:** Mod efficiency.  
**Evidence level:** Source-confirmed unbounded initial work; frame cost not measured.

**Source:** [FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua:685](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua:685>); [FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua:730](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua:730>); [FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua:1229](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua:1229>).

**Condition and cause:** The stepped path disables _yieldEvery and the cooperative tick helper returns without yielding. The initial world-item, bale and nodeToObject scans occur before the later field batching, so the supposedly incremental collector has an unbounded pre-scan.

**End-user impact:** Starting a field cycle can perform work proportional to the world's objects on one game update, despite a configured slice budget.

**Recommended correction:** Make the pre-scan resumable with persisted iterators/state and the same time/work budget as field sampling. Instrument phases separately.

**Acceptance:** A large fixture spreads the pre-scan across updates while preserving results; neither pre-scan nor field sampling bypasses the configured budget. Measure actual game-frame cost separately.

### MOD-15 [P2] Ground-state mapping confuses enum values with encoded density values

**Area:** Field classification.  
**Evidence level:** Source-confirmed against the local FS25 enum path.

**Source:** [FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua:37](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua:37>); [FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua:55](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua:55>); [FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua:60](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua:60>).

**Condition and cause:** The collector labels numeric 1 as stubble, but the traced FieldGroundType enum path supplies NONE=1, stubble=2 and ridge=7. Its prepared-state range includes 1 through 6, so NONE is included and ridge excluded; later clearing depends on this classification.

**End-user impact:** Field labels and work-state clearing can use the wrong ground condition, including treating no ground state as prepared.

**Recommended correction:** Compare named FieldGroundType constants, explicitly enumerate prepared states and keep encoded density values separate from enum values.

**Acceptance:** Exercise every supported state, including NONE, stubble, ridge and cut grass. Assert labels and preparation rules; NONE must not trigger prepared-field clearing.

### MOD-16 [P2] Valid zero-nitrogen readings are omitted from field averages and fertilizer decisions

**Area:** Precision Farming.  
**Evidence level:** Source-confirmed denominator/zero-value defect.

**Source:** [FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua:1947](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua:1947>); [FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua:1981](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua:1981>); [FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua:2050](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua:2050>).

**Condition and cause:** Nitrogen samples count only when greater than zero, while target values are accumulated separately. Averaging uses the positive-nitrogen count, producing biased nitrogen values and inconsistent target denominators. An entirely depleted field can reach the fertilizer decision with a zero target.

**End-user impact:** Mixed fields look more nitrogen-rich than they are, and a fully depleted field with a positive target can incorrectly appear not to need fertilizer.

**Recommended correction:** Count numeric zero as a valid reading and track nitrogen/target validity independently. Distinguish missing measurements from measured zero.

**Acceptance:** Samples 0 and 100 average to 50; all-zero nitrogen with a positive target requires fertilizer; identical targets remain unchanged regardless of zero-nitrogen frequency.

### MOD-17 [P2] Weed and lime action flags ignore disabled gameplay requirements

**Area:** Field action rules.  
**Evidence level:** Source-confirmed exported-rule inconsistency.

**Source:** [FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua:448](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua:448>); [FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua:780](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua:780>); [FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua:2003](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua:2003>); [FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua:2055](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua:2055>); [FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua:2096](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua:2096>).

**Condition and cause:** The collector reads the relevant gameplay settings and gates plowing, but weed/lime requirements lack equivalent gating. Their derived flags contribute to needsWork even when those requirements are disabled.

**End-user impact:** The exported action list recommends work that the current game rules do not require. A frontend may hide a flag, but that does not repair the API/export contract.

**Recommended correction:** Gate actionable requirements by the selected gameplay rules while preserving raw measurements separately if useful.

**Acceptance:** With weed/lime requirements disabled and other work complete, residual weed/lime state does not set their action flags or needsWork; enabling each rule restores only its appropriate action.

### MOD-18 [P2] The 100-row detail limit also truncates financial summaries

**Area:** Hire-purchasing integration.  
**Evidence level:** Source-confirmed aggregation order.

**Source:** [FS25_FarmDashboard_Mod/src/collectors/HirePurchasingDataCollector.lua:180](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/HirePurchasingDataCollector.lua:180>); [FS25_FarmDashboard_Mod/src/collectors/HirePurchasingDataCollector.lua:190](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/HirePurchasingDataCollector.lua:190>).

**Condition and cause:** The record cap is applied before summary accumulation, so more than 100 qualifying hire-purchase obligations are not fully included in the aggregate.

**End-user impact:** Totals describe only the retained subset and can change when input order changes, even though actual obligations are unchanged.

**Recommended correction:** Accumulate counts and amounts across the complete source, then cap only exported detail rows. Include total available count and a truncation indicator.

**Acceptance:** 101 known records contribute all 101 obligations to summaries while at most 100 details are returned; reordering the source does not change totals.

### MOD-19 [P2] Incoming invoices can exhaust the cap before newer outgoing invoices are considered

**Area:** Invoice integration.  
**Evidence level:** Source-confirmed cap-before-sort behavior.

**Source:** [FS25_FarmDashboard_Mod/src/collectors/InvoicesDataCollector.lua:232](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/InvoicesDataCollector.lua:232>); [FS25_FarmDashboard_Mod/src/collectors/InvoicesDataCollector.lua:240](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/InvoicesDataCollector.lua:240>); [FS25_FarmDashboard_Mod/src/collectors/InvoicesDataCollector.lua:247](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/InvoicesDataCollector.lua:247>).

**Condition and cause:** Incoming records are processed first and capped before outgoing records are added. Sorting occurs only afterward, so sorting the retained subset cannot recover a newer omitted outgoing invoice.

**End-user impact:** The recent-invoice list can exclude the newest record and favor one direction solely because of traversal order.

**Recommended correction:** Combine both directions, deduplicate if needed, sort by the intended chronology and apply the detail cap last.

**Acceptance:** With 100 old incoming invoices and one newest outgoing invoice, the outgoing invoice appears first; reverse directions and input order without changing the correct recent list.

### MOD-20 [P2] Initialized but disabled soil data is exported as an enabled system

**Area:** RF soil integration.  
**Evidence level:** Source-confirmed state-contract mismatch.

**Source:** [FS25_FarmDashboard_Mod/src/collectors/rf/RfSoilFertilizerDataCollector.lua:413](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/rf/RfSoilFertilizerDataCollector.lua:413>); [FS25_FarmDashboard_Mod/src/collectors/rf/RfSoilFertilizerDataCollector.lua:416](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/rf/RfSoilFertilizerDataCollector.lua:416>); [FS25_FarmDashboard_Mod/src/collectors/rf/RfSoilFertilizerDataCollector.lua:419](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/rf/RfSoilFertilizerDataCollector.lua:419>).

**Condition and cause:** Readiness is determined from initialized state, then enabled is derived from that readiness rather than honoring the explicit disable setting. The RF manager can retain loaded values while its updates are disabled.

**End-user impact:** The export advertises active soil readings even when the feature is disabled and those values are no longer updated.

**Recommended correction:** Make explicit disablement override readiness. Represent installed/available, enabled and fresh as distinct states, and do not advertise retained disabled data as active.

**Acceptance:** An initialized but disabled manager exports enabled:false and no active readings; re-enabling restores active output; an absent manager remains unavailable.

### PERF-01 [P2] Every startup downloads all translations and eagerly imports all dashboard sections

**Area:** Frontend efficiency.  
**Evidence level:** Source and artifact-size evidence.

**Source:** [NEW APP/src/i18n/i18n.ts:79](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/NEW APP/src/i18n/i18n.ts:79>); [NEW APP/src/sections/SectionRouter.tsx:1](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/NEW APP/src/sections/SectionRouter.tsx:1>); [NEW APP/src/main.tsx:26](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/NEW APP/src/main.tsx:26>).

**Condition and cause:** initI18n fetches the complete translation catalog with cache:no-store before realtime bootstrap. Both inspected catalog copies are 3,375,466 bytes. SectionRouter statically imports every section. The existing built main JavaScript file is 497,565 bytes before compression, with additional shared chunks. These are file sizes, not measured transfer or runtime timings.

**End-user impact:** Repeat visits on Wi-Fi or tablets pay for unused locales and sections before seeing data; full snapshots also recreate section inputs, reducing memoization's value.

**Recommended correction:** Ship an immediate English fallback, load only the selected locale with versioned caching, lazy-load optional sections and preload likely next routes. Add performance budgets and measure before optimizing individual components.

**Acceptance:** Measure cold/warm startup, transfer bytes, parse time and time-to-data on a target tablet; a warm visit must not redownload unchanged catalogs or unrelated section code.

### PERF-02 [P2] Polling and watcher restarts permit concurrent work and obsolete completions

**Area:** Backend scheduling.  
**Evidence level:** Source-confirmed lifecycle paths; slow-I/O fault test not run.

**Source:** [FS25_FarmDashboard_App/main.js:2427](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:2427>); [FS25_FarmDashboard_App/main.js:2702](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:2702>); [FS25_FarmDashboard_App/main.js:2712](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:2712>); [FS25_FarmDashboard_App/main.js:2805](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:2805>); [FS25_FarmDashboard_App/main.js:3040](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:3040>); [FS25_FarmDashboard_App/main.js:3063](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:3063>).

**Condition and cause:** Fixed intervals do not await previous cycles. Slot discovery can independently initiate XML polling. Downloads reuse and unlink shared temporary paths. Teardown does not cancel in-flight work or pending debounce callbacks, and watcher error recovery can leave previous periodic timers active.

**End-user impact:** Slow servers or settings changes can cause duplicate downloads, temporary-file interference, stale callbacks updating replacement state and multiplied periodic work.

**Recommended correction:** Use a per-server serialized scheduler, cancellation and configuration generations. Dispose all timers/watchers on restart and reject results from superseded generations. Use operation-specific temporary files.

**Acceptance:** A poll slower than its interval never overlaps itself; settings replacement rejects old completions; repeated watcher failures leave exactly one active scheduler and no leaked timers.

### PERF-03 [P2] Broadcast timestamps defeat deduplication and slow clients have no queue bound

**Area:** Realtime efficiency.  
**Evidence level:** Source-confirmed send path; memory growth not benchmarked.

**Source:** [FS25_FarmDashboard_App/main.js:2007](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:2007>); [FS25_FarmDashboard_App/main.js:2011](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:2011>).

**Condition and cause:** The payload is given a current timestamp before hashing, so otherwise identical snapshots at different times do not deduplicate. Full snapshots are sent without checking each client's queued bytes.

**End-user impact:** Unchanged data generates unnecessary serialization and transfers; a connected client that stops consuming can accumulate snapshots in main-process memory.

**Recommended correction:** Hash meaningful section/state revisions rather than delivery timestamps. Bound per-client pending bytes and coalesce to the latest state or disconnect stalled clients with a recoverable reason.

**Acceptance:** Clock advancement alone does not retransmit unchanged state; a deliberately stalled client stays below a documented queue/memory budget while responsive clients continue receiving current data.

### PERF-04 [P2] HTTP feed downloads have no total deadline, response cap or redirect bound

**Area:** Remote feed resilience.  
**Evidence level:** Source-confirmed resource-control gaps.

**Source:** [FS25_FarmDashboard_App/httpFeedXml.js:98](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/httpFeedXml.js:98>); [FS25_FarmDashboard_App/httpFeedXml.js:103](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/httpFeedXml.js:103>).

**Condition and cause:** Redirects recurse without a maximum hop count, response chunks accumulate without a byte limit, and per-request idle timeouts do not impose an overall operation deadline. Relative redirect locations are not resolved against the previous URL.

**End-user impact:** A misbehaving configured feed can retain resources through redirect loops or continuous oversized responses, with overlapping polls amplifying the cost. Legitimate relative redirects can fail unnecessarily.

**Recommended correction:** Use one total deadline across redirects, maximum hops and payload size, cancellation and stream-abort handling. Resolve relative locations safely and revalidate destination policy at each hop.

**Acceptance:** Looping, oversized, stalled, continuously streaming and truncated fixtures fail within bounded time/memory; valid relative redirects succeed.

### PIPE-01 [P2] Empty successful sections can retain previously populated data

**Area:** Snapshot reliability.  
**Evidence level:** Source-confirmed, including normal main-process integration.

**Source:** [FS25_FarmDashboard_App/mergedSnapshotHold.js:458](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/mergedSnapshotHold.js:458>); [FS25_FarmDashboard_App/mergedSnapshotHold.js:554](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/mergedSnapshotHold.js:554>); [FS25_FarmDashboard_App/mergedSnapshotHold.js:615](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/mergedSnapshotHold.js:615>); [FS25_FarmDashboard_App/mergedSnapshotHold.js:684](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/mergedSnapshotHold.js:684>); [FS25_FarmDashboard_App/main.js:2284](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:2284>); [FS25_FarmDashboard_App/main.js:2311](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:2311>).

**Condition and cause:** Section backups are updated only for populated data. Restoration and forward merging do not consistently distinguish a successfully collected empty section from an unavailable section. This can preserve old animals, production or stock and can reintroduce optional integration data after it is disabled. The normal rebuild path applies holds before updating backups, broadcasting and scheduling disk persistence. Backups prefer already-held merged data, so the retained section can feed its own next backup; fresh-Lua processing can remove a held-section indicator before publication.

**End-user impact:** Sold, removed or emptied assets can continue appearing as current. A last-good safety feature becomes a source of stale information when emptiness is a legitimate update.

**Recommended correction:** Carry explicit per-section collection status, generation and timestamp. A successful empty result must clear its backup; only failed/unavailable reads should retain prior data, visibly marked stale.

**Acceptance:** Populated-to-empty, collection failure, restart and integration-disable scenarios behave differently and truthfully; successful emptiness survives disk caching.

### PIPE-02 [P2] Larger detail snapshots are favored over authoritative smaller populations

**Area:** Livestock hydration.  
**Evidence level:** Source-confirmed merge policy.

**Source:** [FS25_FarmDashboard_App/detailAnimalsHydrate.js:47](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/detailAnimalsHydrate.js:47>); [FS25_FarmDashboard_App/detailAnimalsHydrate.js:96](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/detailAnimalsHydrate.js:96>); [FS25_FarmDashboard_App/detailAnimalsHydrate.js:143](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/detailAnimalsHydrate.js:143>).

**Condition and cause:** Duplicate detail selection prefers larger populations, and hydration rejects some smaller inputs while accepting larger ones. Count reconciliation uses Math.max against captured counts, including a legitimate current zero. File existence is still checked; this is not a claim that a deleted cache file is replayed by directory enumeration.

**End-user impact:** Older detail can restore animals that have been sold or died, defeating a fresher lower aggregate count.

**Recommended correction:** Match detail to server/save/session and collection generation, prefer freshness rather than population size, and make an authoritative zero meaningful. Surface incompatible detail as stale instead of silently merging it.

**Acceptance:** After selling animals, stale larger detail cannot restore them; current zero clears the population; detail from another session or generation is rejected or explicitly labelled.

### PIPE-03 [P2] Unresolved vehicle ownership is inferred from unrelated herd or fleet size

**Area:** Ownership.  
**Evidence level:** Source-confirmed heuristic.

**Source:** [FS25_FarmDashboard_App/dataMerger.js:2113](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/dataMerger.js:2113>); [FS25_FarmDashboard_App/dataMerger.js:2194](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/dataMerger.js:2194>).

**Condition and cause:** For qualifying pool-100 vehicles without decisive XML ownership evidence, the merger assigns ownership to the farm with the largest relevant herd or fleet. Those counts do not establish the vehicle's owner.

**End-user impact:** Vehicles and asset summaries can move between farms when livestock counts change, without a corresponding ownership transaction.

**Recommended correction:** Use authoritative owner evidence and stable identity. Keep genuinely unresolved vehicles explicitly unassigned rather than inventing an owner.

**Acceptance:** Changing livestock or unrelated fleet counts does not change ownership; ambiguous pool vehicles remain unresolved until authoritative evidence arrives.

### PIPE-04 [P2] Suffix matching and incomplete row consumption can cross-match vehicles

**Area:** Vehicle identity.  
**Evidence level:** Source-confirmed matching paths.

**Source:** [FS25_FarmDashboard_App/dataMerger.js:2295](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/dataMerger.js:2295>); [FS25_FarmDashboard_App/dataMerger.js:2304](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/dataMerger.js:2304>); [FS25_FarmDashboard_App/dataMerger.js:2342](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/dataMerger.js:2342>).

**Condition and cause:** A UID ending in a live numeric ID can qualify without matching configuration or farm context. Rows consumed through one index remain available through other matching paths, allowing the same saved row to supply more than one live vehicle.

**End-user impact:** A vehicle can inherit another vehicle's saved identity or owner, and two live vehicles can be merged against one saved record.

**Recommended correction:** Remove suffix-only identity matches, define ranked stable identity criteria with ambiguity rejection, and mark each saved row consumed globally across all indexes.

**Acceptance:** Live ID 12 does not match an unrelated UID merely ending in 12; two identical vehicle configurations retain distinct identities and cannot consume the same saved row.

### PIPE-05 [P2] Saved XML can override live ownership and exclude live-only fields

**Area:** Ownership.  
**Evidence level:** Source-confirmed precedence and iteration.

**Source:** [FS25_FarmDashboard_App/dataMerger.js:1552](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/dataMerger.js:1552>); [FS25_FarmDashboard_App/dataMerger.js:1666](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/dataMerger.js:1666>); [FS25_FarmDashboard_App/dataMerger.js:2015](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/dataMerger.js:2015>).

**Condition and cause:** When both field lists are populated, the output is based on the XML list rather than a full identity union. Positive saved ownership can take precedence over current live ownership; related vehicle merging also favors saved ownership.

**End-user impact:** Recent purchases, sales and farm transfers can display the previous ownership until the next game save; live-only fields may be absent.

**Recommended correction:** Document and implement a freshness-aware source contract. Prefer valid authoritative live ownership, including zero when it means unowned, and union stable identities instead of dropping live-only entities.

**Acceptance:** Purchase, sale, ownership transfer and newly introduced field cases update correctly before the next disk save, without changing ownership from unrelated fallback evidence.

### PIPE-06 [P2] Saved environment time is treated as milliseconds instead of minutes

**Area:** Time normalization.  
**Evidence level:** Source-confirmed against local FS25 engine source.

**Source:** [FS25_FarmDashboard_App/xmlCollector.js:532](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/xmlCollector.js:532>).

**Condition and cause:** The XML dayTime value is interpreted using a millisecond convention, but the local FS25 Environment save implementation writes minutes. A saved value of 480 represents 08:00, not approximately midnight.

**End-user impact:** Savegame-only clock and time-dependent weather interpretation can be wrong when no live export overrides them.

**Recommended correction:** Normalize saved minutes to the canonical time unit at the XML boundary and keep source-unit metadata or explicit helper names.

**Acceptance:** Saved times 0, 480 and 1439 yield 00:00, 08:00 and 23:59; live and saved sources agree for the same game time.

Engine reference: [Environment.lua:172](<C:/Users/Graham/Documents/FS25 Game Files/extract/decompiled/scripts/environment/Environment.lua:172>).

### PIPE-07 [P2] Operating time differs by a factor of 1,000 between source paths

**Area:** Unit contracts.  
**Evidence level:** Source-confirmed contract mismatch; downstream display impact not fully traced.

**Source:** [FS25_FarmDashboard_App/xmlCollector.js:708](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/xmlCollector.js:708>); [FS25_FarmDashboard_App/dataMerger.js:1882](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/dataMerger.js:1882>); [FS25_FarmDashboard_Mod/src/collectors/VehicleDataCollector.lua:762](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/VehicleDataCollector.lua:762>).

**Condition and cause:** Saved vehicle operating time is in seconds while the live collector exports milliseconds. XML-only merging places its value into the same operatingTime field without a shared normalization contract.

**End-user impact:** Consumers of the merged API cannot safely apply one unit conversion across live and XML-only vehicles. Some frontend formatting may compensate, so this report does not claim every displayed operating-hour value is wrong.

**Recommended correction:** Normalize to one documented API unit at each collector boundary and remove magnitude-based guessing from consumers.

**Acceptance:** A one-hour vehicle has the same canonical operatingTime from live, XML-only and mixed sources, and all visible formatting produces one hour.

### PIPE-08 [P2] FTP detail caches rely on byte size and can remain stale indefinitely

**Area:** Remote detail freshness.  
**Evidence level:** Source-confirmed invalidation policy.

**Source:** [FS25_FarmDashboard_App/main.js:2889](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:2889>); [FS25_FarmDashboard_App/main.js:2960](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:2960>); [FS25_FarmDashboard_App/livestockDetail.js:588](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/livestockDetail.js:588>).

**Condition and cause:** Bulk synchronization treats equal byte length as unchanged. Per-pen fetching refreshes an existing file only when a positive remote dirty timestamp exceeds local file mtime. Equal-length content changes are missed; without a usable dirty index, the first cached result can be reused indefinitely despite a declared fallback.

**End-user impact:** Health, age, identifiers or other detail can stop updating even though the remote server is exporting changes. Comparing remote dirty time with local download time also makes clock differences significant.

**Recommended correction:** Track source revisions/content hashes independently from local write times and provide a bounded periodic refresh when index metadata is absent or unreliable.

**Acceptance:** Equal-length changes appear; missing-index mode refreshes within a documented interval; host/client clock offsets cannot indefinitely suppress updates.

### PIPE-09 [P2] Repeated retrieval of the same old export renews its freshness

**Area:** Source freshness.  
**Evidence level:** Source-confirmed timestamp semantics.

**Source:** [FS25_FarmDashboard_App/main.js:2411](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:2411>); [FS25_FarmDashboard_App/main.js:2929](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:2929>); [FS25_FarmDashboard_App/liveExportFreshness.js:14](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/liveExportFreshness.js:14>).

**Condition and cause:** Accepted reads assign the current receipt time, and freshness uses that timestamp. FTP can repeatedly deliver the final nonminimal JSON after the game stops producing exports, renewing this clock on every successful download.

**End-user impact:** A stopped collector can look live indefinitely. A healthy transport connection is being treated as proof of healthy collection.

**Recommended correction:** Track transport receipt, export generation and source collection time separately. Preserve source age on cache hydration and mark unchanged exports stale according to their production cadence.

**Acceptance:** Repeatedly fetch an unchanged final export beyond the stale threshold: connection remains reachable but data becomes stale; a new generation restores freshness.

### PIPE-11 [P2] Optional XML inputs are omitted from the collection fingerprint

**Area:** XML invalidation.  
**Evidence level:** Source-confirmed input list and reachable early return.

**Source:** [FS25_FarmDashboard_App/xmlCollector.js:130](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/xmlCollector.js:130>); [FS25_FarmDashboard_App/xmlCollector.js:1058](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/xmlCollector.js:1058>); [FS25_FarmDashboard_App/xmlCollector.js:1147](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/xmlCollector.js:1147>); [FS25_FarmDashboard_App/main.js:2620](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:2620>).

**Condition and cause:** MoistureSystem.xml and RedTape.xml are consumed by collection but omitted from the ten-core-file fingerprint. An unchanged fingerprint returns before collection. Optional-only creation, modification, emptying or deletion is therefore invisible while the fingerprinted inputs remain unchanged.

**End-user impact:** Moisture and RedTape state can remain stale until another tracked file changes. This is an invalidation finding, not a claim that every FTP transport omits downloading these files.

**Recommended correction:** Fingerprint all consumed inputs, including optional-file existence; keep the required-file list separate. Prefer per-file fingerprints to an aggregate maximum mtime and total size.

**Acceptance:** With core files fixed, independently create, change, empty and delete each optional input. Every transition triggers recollection and appropriate clearing; a genuinely unchanged poll does not.

### SEC-02 [P2] The production dependency audit fails with seven affected packages

**Area:** Security dependencies.  
**Evidence level:** npm advisory result, not an exploit demonstration.

**Source:** [FS25_FarmDashboard_App/package.json:139](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/package.json:139>); [FS25_FarmDashboard_App/package.json:154](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/package.json:154>); [.github/workflows/ci.yml:31](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/.github/workflows/ci.yml:31>).

**Condition and cause:** npm audit --omit=dev reported four high and three moderate affected packages: builder-util-runtime, electron-updater, fast-uri, js-yaml, body-parser, express and qs. The hard override pins js-yaml to 4.2.0. Several entries share transitive causes; seven packages does not mean seven independent exploitable vulnerabilities. The inspected updater supplies no private token or custom request headers, so the credential-forwarding advisory is not evidence of a demonstrated credential leak in this configuration.

**End-user impact:** The release audit gate currently fails. Exposure varies: updater credential forwarding requires relevant private headers and redirect conditions, while parser issues require affected inputs/options. Those conditions were not all demonstrated in this application.

**Recommended correction:** Triage each advisory against actual usage, update compatible dependency chains and the YAML override, and regression-test configuration parsing and updates. Do not run a blanket forced major upgrade.

**Acceptance:** The production audit is clean or each remaining item has an explicit documented rationale, expiry and owner; Electron and UI build-tool risk are assessed separately.

Relevant primary advisory: [Electron Builder cross-origin credential forwarding](https://github.com/electron-userland/electron-builder/security/advisories/GHSA-p2f4-r6v6-j797). The application-specific reachability caveat above is essential.

### SEC-06 [P2] Map identifiers can select or write files outside intended roots

**Area:** Map filesystem access.  
**Evidence level:** Source-confirmed constrained traversal paths.

**Source:** [FS25_FarmDashboard_App/main.js:1044](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:1044>); [FS25_FarmDashboard_App/mapOverviewResolver.js:258](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/mapOverviewResolver.js:258>); [FS25_FarmDashboard_App/mapFieldOutlines.cjs:364](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/mapFieldOutlines.cjs:364>).

**Condition and cause:** Request map IDs enter source resolution as raw keys, and field-outline cache paths interpolate unsanitized mapSlug. A traversal-bearing identifier can select an existing outside overview.png/overview.dds for copying into served cache; successful outline resolution can write its cache outside the intended directory.

**End-user impact:** This permits constrained image disclosure and cache-file writing. It is not evidence of an unrestricted arbitrary-file download endpoint.

**Recommended correction:** Validate allowed source roots after path resolution, reject traversal and use sanitized or hash-only cache filenames independent of user-controlled path syntax.

**Acceptance:** An outside overview fixture cannot be served, valid custom maps still resolve, and every generated cache path stays within the configured cache root.

### SEC-07 [P2] LAN password and allowlist changes do not revoke existing WebSocket access

**Area:** Session revocation.  
**Evidence level:** Source-confirmed token and connection lifecycle.

**Source:** [FS25_FarmDashboard_App/main.js:159](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:159>); [FS25_FarmDashboard_App/main.js:3542](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:3542>).

**Condition and cause:** The WebSocket secret persists across restarts. Changing LAN credentials does not rotate it or close established clients when the bind address remains unchanged. Existing connections also survive relevant allowlist removals.

**End-user impact:** Someone whose access should have been removed can keep receiving data, and an old token can authorize a new connection after password changes or restart.

**Recommended correction:** Version/rotate WebSocket credentials and close affected sessions when authentication or access policy changes. Scope token lifetime and document logout/revocation semantics.

**Acceptance:** Old tokens fail after password rotation, removed clients stop receiving data, and legitimate clients can reauthenticate without restarting the host.

### SEC-08 [P2] All FTP paths explicitly disable transport encryption

**Area:** Credential transport.  
**Evidence level:** Source-confirmed transport configuration.

**Source:** [FS25_FarmDashboard_App/main.js:2455](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:2455>); [FS25_FarmDashboard_App/main.js:2914](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:2914>); [FS25_FarmDashboard_App/livestockDetail.js:413](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/livestockDetail.js:413>); [FS25_FarmDashboard_App/livestockDetail.js:438](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/livestockDetail.js:438>).

**Condition and cause:** Live polling, XML downloads and livestock-detail transfers pass secure:false. No selected TLS-capable configuration reaches these calls.

**End-user impact:** Using these paths over an observable network exposes FTP credentials and content to interception. This does not claim the user's present network is compromised.

**Recommended correction:** Support certificate-validated FTPS across every transfer path, default new compatible configurations to encryption and require an explicit warning-backed choice for legacy plaintext FTP. Do not silently downgrade.

**Acceptance:** Every FTP operation honors the same transport policy; invalid certificates fail safely; supported hosts connect securely and legacy mode is clearly identified.

### UX-03 [P2] Settings can report success after a mod save fails and can partially apply on other failures

**Area:** Settings.  
**Evidence level:** Source-confirmed.

**Source:** [NEW APP/src/settings/SettingsModal.tsx:326](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/NEW APP/src/settings/SettingsModal.tsx:326>); [NEW APP/src/settings/SettingsModal.tsx:378](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/NEW APP/src/settings/SettingsModal.tsx:378>); [NEW APP/src/settings/SettingsModal.tsx:416](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/NEW APP/src/settings/SettingsModal.tsx:416>).

**Condition and cause:** saveMain persists UI preferences, server settings, mod configuration and LAN settings sequentially. A failed saveModConfig only emits a warning before the code sets synced, shows 'saved', and closes. LAN validation happens after earlier settings have been committed. loadAll failures also reach the finally callback that marks settingsHydrated=true.

**End-user impact:** Users cannot tell which changes were actually saved and may retry the whole operation, causing repeated backend restarts or overwriting values loaded only partially.

**Recommended correction:** Validate all draft sections before writes; track load and save success per section; use an aggregate transaction where feasible or explicit partial-success feedback. Do not close or show synced while any requested section failed.

**Acceptance:** Inject failure into each save stage and verify truthful status and retained drafts; failed initial hydration must not enable saving unloaded settings.

### UX-04 [P2] The phone header clips controls and collapses save navigation

**Area:** Mobile.  
**Evidence level:** Browser reproduced at 390 x 844.

**Source:** [NEW APP/src/styles/app-shell.css:11](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/NEW APP/src/styles/app-shell.css:11>); [NEW APP/src/styles/app-shell.css:25](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/NEW APP/src/styles/app-shell.css:25>); [NEW APP/src/styles/app-shell.css:38](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/NEW APP/src/styles/app-shell.css:38>); [NEW APP/src/styles/app-shell.css:467](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/NEW APP/src/styles/app-shell.css:467>).

**Condition and cause:** The left and right header groups cannot shrink while the centre save selector can collapse to zero width. The small-screen rules change the sidebar but do not restructure the header. At 390px, the Settings control extended to x=477 and save buttons lay behind the fixed header content. The screenshot shows clipped controls.

**End-user impact:** Phone and narrow tablet users can lose access to save switching and connection information. Remote mode hides Settings, but the same non-shrinking header still consumes the save selector's space.

**Recommended correction:** Create a compact mobile header with a full-width save selector or a second row, an overflow menu for secondary actions, and visible connection state. Account for longer translations and farm names.

**Acceptance:** At 320, 390, 768 and 1024px, all required controls remain visible and operable without overlap; verify multiple saves, farms and long localized text.

### UX-05 [P2] Authentication timeout and retry handling can leave inconsistent login state

**Area:** LAN access.  
**Evidence level:** Source-confirmed.

**Source:** [NEW APP/src/services/lan-auth.ts:110](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/NEW APP/src/services/lan-auth.ts:110>); [NEW APP/src/services/lan-auth.ts:169](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/NEW APP/src/services/lan-auth.ts:169>); [NEW APP/src/platform/LanAuthOverlay.tsx:65](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/NEW APP/src/platform/LanAuthOverlay.tsx:65>); [NEW APP/src/platform/LanAuthOverlay.tsx:111](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/NEW APP/src/platform/LanAuthOverlay.tsx:111>).

**Condition and cause:** The 30-second gate resolves regardless of authentication success. Credential checks have no request deadline. A network failure clears saved credentials just like a rejection. Submit sets busy but neither checks busy nor disables the button. The gate stores callbacks without a durable resolved state.

**End-user impact:** A slow or interrupted login can start unauthorized data loads, discard valid credentials, wait again after an earlier success, or submit overlapping checks. Renaming the timeout code did not repair these transitions.

**Recommended correction:** Use a persistent authentication state machine with one in-flight verification, request deadlines, retryable network state and a reusable authenticated promise. Retain credentials on transport failures and start protected work only after successful authorization.

**Acceptance:** Test cached login, early gate completion, a login lasting >30s, hung requests, double-click/Enter, 401 and temporary network failure; no protected bootstrap starts prematurely.

### UX-06 [P2] The standalone SimHub page omits the LAN authentication bootstrap

**Area:** SimHub.  
**Evidence level:** Source-confirmed.

**Source:** [NEW APP/src/simhub/main.tsx:1](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/NEW APP/src/simhub/main.tsx:1>); [NEW APP/src/simhub/main.tsx:22](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/NEW APP/src/simhub/main.tsx:22>); [NEW APP/src/simhub/main.tsx:67](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/NEW APP/src/simhub/main.tsx:67>).

**Condition and cause:** SimHub is a separate Vite entry. It calls protected session/config/data routes directly but imports neither the LAN fetch patch nor the login overlay/gate used by main.tsx. It parses error responses as JSON and displays raw exception messages.

**End-user impact:** Opening this advertised tablet page on an authenticated LAN cannot reuse credentials stored by the dashboard's JavaScript patch; a text 401 becomes a parsing error instead of a useful login or host-setup instruction.

**Recommended correction:** Share the authentication/bootstrap component across all browser entry points, or define a deliberately scoped read-only SimHub session. Handle HTTP status before JSON parsing and show viewer-specific recovery instructions.

**Acceptance:** Open SimHub directly from a new and previously authenticated LAN browser; supported authorization works and 401/403/network responses produce clear, distinct states.

## 5. Conditional security risks

These are not included in the confirmed finding count and are not claimed as demonstrated exploits.

### C1. Host/proxy trust can broaden setup access

Setup locality is based on socket/interface addresses, not the Host authority. A loopback reverse proxy without independent restrictions inherits local trust. DNS rebinding is also a conditional concern, but no actual public proxy deployment or working rebinding route was established. Validate authority and define an explicit proxy/setup policy; test unrecognized Hosts and proxy requests before external exposure.

**Source:** [FS25_FarmDashboard_App/main.js:895](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:895>); [FS25_FarmDashboard_App/setupAccessPolicy.cjs:23](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/setupAccessPolicy.cjs:23>).

### C2. Unexpected external navigation would retain privileged preload/IPC capabilities

The BrowserWindow installs a preload without navigation/window-opening guards, and privileged IPC handlers do not validate sender frame/origin. A reachable external-navigation path was not established, so this is conditional hardening rather than a demonstrated remote exploit. Restrict navigation and window creation, validate IPC senders and test an isolated external-document scenario.

**Source:** [FS25_FarmDashboard_App/main.js:3330](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:3330>); [FS25_FarmDashboard_App/main.js:3452](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:3452>); [FS25_FarmDashboard_App/main.js:3525](<C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:3525>).

## 6. End-user experience and refinement backlog

The largest experience improvement is not another visual redesign. It is making setup, identity, freshness, settings and recovery dependable. Preserve the established visual language while removing misleading states and interaction barriers.

### First launch and local save setup

**Current friction:** The setup page has the basic controls and source options, but load failure can become a misleading empty ready form. Labels are not fully accessible and the startup retry cannot recover from an initial discovery rejection.

**Better experience:** Detect or choose a source, confirm its identity, show an explicit connection/data state and launch only after configuration was safely loaded and saved. Retry must repeat the failed operation rather than only dismiss the message.

**Related findings:** UX-01, UX-02, A11Y-02.

### Change save, inspect the farm and trust the numbers

**Current friction:** The selected save can get another save's late response; held/detail data can preserve removed assets; zero values and unit mismatches can distort important summaries.

**Better experience:** Keep save/farm identity pinned to the payload, mark loading/stale/estimated states clearly and make authoritative emptiness visible. Show where a value came from when fallback data is used.

**Related findings:** DATA-01 through DATA-03, PIPE findings.

### Change settings or repair credentials

**Current friction:** Settings can partially save and still report synced, and password-only FTP edits do not update one live poller. Failed hydration can enable editing unknown values.

**Better experience:** Preserve a draft, validate before writing, report each affected scope honestly and apply credentials to the next operation. Do not close on partial failure or silently erase configuration loaded unsuccessfully.

**Related findings:** UX-02, UX-03, BACK-01.

### Join from a phone or SimHub tablet

**Current friction:** Phone header controls clip, main and SimHub authorization flows diverge, and auth timeouts/network failures are not cleanly separated from credential rejection.

**Better experience:** A direct URL should explain authorization, show a compact persistent save/farm selector, and provide viewer-appropriate recovery without desktop-only dead actions.

**Related findings:** UX-04, UX-05, UX-06.

### Inspect livestock and request fresh details

**Current friction:** Estimated clusters can miscount or show zero-health groups as healthy, cache freshness can stall, and fixed-size detail views do not make the full population easy to inspect.

**Better experience:** Distinguish sampled from individual records, preserve valid zero values, search/page the whole population and show pending/new-revision status during manual refresh.

**Related findings:** DATA-02, DATA-03, MOD-04, PIPE-02, PIPE-08.

### Use keyboard and assistive technology

**Current friction:** The Settings dialog leaves focus behind it and does not close on Escape; setup controls can lack accessible names. Visual polish does not compensate for those interaction barriers.

**Better experience:** Use consistent modal/form primitives with focus ownership, understandable names and linked errors, then exercise complete journeys with keyboard and a screen reader.

**Related findings:** A11Y-01, A11Y-02.

### Refinement themes

These are improvement themes, not additional confirmed defects. Where a theme mentions a source-level example, it is not a claim that every suggested optimization has been benchmarked.

1. **One setup and recovery journey.** Start with local save or joined-client mirroring, then reveal FTP and feed options under Advanced. Show detection, source identity, connection, freshness and next action for each save. Use real progress states and make Retry execute the complete failed step, including browser-safe actions.

2. **Faster repeat visits.** Avoid the fixed 5.2-second local splash after data is ready. Keep the recognizable branding while showing the dashboard shell immediately and loading section data progressively. Respect reduced-motion settings and add a reduced-blur appearance option for lower-powered tablets.

3. **Safer settings.** Give each save a stable identity, preserve server drafts on failure, warn before leaving unsaved edits, and offer Undo for removal. Do not make one Save button silently apply unrelated sections. Explain whether a setting affects this browser, the desktop host, or the FS25 mod.

4. **Consistent and honest error messages.** Preserve structured error codes before considering text matching. The current new-UI classifier matches 'user' before ENOENT/path, so a missing path beneath C:\Users can be described as rejected credentials. Display missing, loading, stale, disabled and genuinely empty as distinct states.

5. **Useful mobile navigation.** Keep save and farm identity visible at all widths. Put secondary header actions in an overflow menu. Ensure the bottom navigation, mod-group rows and device safe areas do not cover content; test long translated labels and landscape orientation.

6. **Transparent data quality.** Show the timestamp of the underlying source, not just the time of an HTTP fetch. Identify XML-only, live Lua, cached, held, estimated and truncated information. Where lists have hard caps, show the total and how users can inspect the rest.

7. **Livestock detail usability.** Use a single cache key including server, save, pen ID scheme and revision. A manual refresh should await the requested export and then display its new revision, with pending/forbidden/offline feedback. Offer real pagination or search for large pen lists rather than only showing the first fixed block.

8. **Translation and offline quality.** Initialize the login's translations before showing it; offer locale names instead of two-letter codes; make language changes update the active catalog immediately. Bundle essential fallback strings and fonts so first-run errors remain understandable without external resources.

9. **Reduce duplicated frontend logic.** Share generated or pure modules for auth, freshness, error codes, farm scoping, cluster arithmetic and request cancellation across the legacy and new UIs. Test the actual entry points as well as shared helpers; do not remove a bootstrap call merely because another file waits for it.

10. **Keep large-data work bounded.** Profile whole-payload parsing, field clustering, livestock expansion and repeated derived summaries. Cache by section revision, avoid overlapping requests, pause hidden-view polling and make optional sections lazy. Introduce virtualization only for lists where measured rendering costs justify it.

11. **Make diagnostics support-friendly.** Provide a redacted diagnostic bundle with versions, save identity, source ages, queue/poll durations and recent error codes. Keep paths, usernames, server addresses and tokens out of public status pages and routine exports unless the user deliberately includes them.

12. **Build from source reproducibly.** Make release commands rebuild or validate the UI source revision before copying dist. Validate both classic and RF manifests, product identity, update channels and required assets. Pin and declare the Lua checker dependency, and make its encoding policy explicit.

## 7. Prioritized execution work packages

Sequence fixes by risk and dependency rather than by which screen is easiest to polish. Keep changes small enough to review independently. Assign an owner and attach targeted evidence to each finding ID; effort estimates require the team's capacity and release constraints and are not invented here.

### 1. Restore the release and security boundary

**Outcome:** Make the advertised access boundary real and ensure both downloadable products contain their runtime dependencies.

**Finding coverage:** SEC-03, SEC-04, SEC-05, SEC-06, SEC-07, SEC-01, SEC-02, REL-01.

1. Move authorization into matching API routes and enumerate public exceptions; test method, case and slash variants.
2. Add explicit browser Origin/authority policy and scoped write/WS tokens; rotate tokens and revoke sessions on access changes.
3. Validate all remote identifiers and enforce resolved path containment before filesystem use.
4. Share or generate effective classic/RF runtime manifests and make missing-module failures block packaging.
5. Upgrade to a supported Electron release and resolve applicable dependency advisories without a forced blanket upgrade.

**Exit evidence:** Independent negative authorization/path tests pass, both effective manifests close over required modules, and clean-profile classic/RF installers launch on a supported runtime.

### 2. Make identity, freshness and empty-state semantics authoritative

**Outcome:** Ensure the displayed farm, asset owner, animal count and freshness actually describe the selected world and current collection.

**Finding coverage:** DATA-01, DATA-02, DATA-03, PIPE-01 through PIPE-11, MOD-04, MOD-05, MOD-09, MOD-10 through MOD-13, MOD-15 through MOD-20.

1. Define a versioned payload envelope containing server ID, world/save/session identity, collection generation and per-section status/time.
2. Reject obsolete HTTP/WS generations at ingestion and reset or clearly label old-save content during selection changes.
3. Replace population-size and suffix-identity heuristics with explicit freshness/identity rules and ambiguity handling.
4. Treat successful empty results and valid zero values as authoritative; keep failure retention visibly stale.
5. Normalize time/operating-hour contracts and reconcile estimated animal buckets exactly; use one finance scope/valuation contract.
6. Separate export production age from receipt age and make detail invalidation revision-based with a bounded fallback.
7. Keep mirror worlds isolated from same-numbered local saves; fingerprint every optional XML input including deletion.
8. Remove fictitious selling opportunities, accept registered product IDs, repair shared-table serialization, and align field/optional-mod flags and financial summaries with authoritative settings and full source populations.

**Exit evidence:** Deterministic out-of-order, sale-to-zero, ownership-transfer, unit-boundary and same-length-detail scenarios produce the correct save-scoped output without stale data resurrection.

### 3. Repair collection, persistence and configuration lifecycles

**Outcome:** Make background work bounded, recoverable and faithful to saved settings.

**Finding coverage:** MOD-01, MOD-02, MOD-03, MOD-06, MOD-08, BACK-01, BACK-02, PERF-02, PERF-04, SEC-08.

1. Separate bale enumeration from processing and fix the moisture helper's lexical scope.
2. Commit exports only after checked filesystem success; align disk, mirror and generation bookkeeping.
3. Serialize per-server polls, cancel/discard superseded work, dispose all timers and use operation-specific temporary paths.
4. Apply credential changes to the next live poll, use consistent validated FTPS configuration and bound feed transfers.
5. Correct timing units, distinguish manual/adaptive cadence and fix image-export option handling.

**Exit evidence:** Failure-injection and slow-I/O tests settle predictably, do not corrupt last-good output, do not leak schedulers, and honor changed credentials/cadence without a full restart.

### 4. Make startup, setup and settings truthful and recoverable

**Outcome:** Never turn a failed read into a fresh setup or a failed write into a success message.

**Finding coverage:** UX-01, UX-02, UX-03, UX-05, UX-06.

1. Implement explicit startup and authentication states with deadlines, one in-flight operation and full-step retry.
2. Require a successful configuration load and expected revision before replacement saves; preserve drafts across errors.
3. Validate all settings before writing and expose section-level partial success where a real transaction is unavailable.
4. Share authorization across main and SimHub entry points, distinguish rejected credentials from network failures, and provide browser-appropriate recovery actions.
5. Label whether preferences affect the browser, desktop host or FS25 mod and protect unsaved edits.

**Exit evidence:** 503/401/network/malformed-data and each save-stage failure leave truthful recoverable states; no existing server is lost after a failed load and no false saved/synced banner appears.

### 5. Complete mobile, keyboard and large-data usability

**Outcome:** Keep identity, navigation, forms and dialogs usable on supported screens and input methods.

**Finding coverage:** UX-04, A11Y-01, A11Y-02 and the refinement backlog.

1. Create a compact responsive header with persistent save/farm identity, visible connection status and accessible overflow actions.
2. Use one modal primitive with initial focus, containment, Escape policy, inert background and focus restoration.
3. Associate all form labels/errors and focus invalid fields; test language expansion and long names.
4. Add honest estimated/stale/empty indicators and real livestock-detail pagination/search with refresh revision feedback.
5. Reduce forced splash delay and provide immediate usable fallback language/error content.

**Exit evidence:** Keyboard-only and target mobile-width journeys complete without clipped controls, unnamed fields, inaccessible dialogs or ambiguous data-quality states.

### 6. Measure efficiency and prove the shipped product

**Outcome:** Replace speculative optimization with bounded workloads and reproducible release evidence.

**Finding coverage:** PERF-01, PERF-03, MOD-07 and release/test process gaps, MOD-14.

1. Cache/version selected-language catalogs, lazy-load optional sections and measure time-to-data on a target tablet.
2. Deduplicate semantic snapshots, coalesce slow-client updates and enforce queue-size bounds.
3. Replace repeated Courseplay whole-fleet scans with bounded change-driven work, then measure collector p95/p99 and frame impact.
4. Make CI build/typecheck the actual UI source, use hermetic merge fixtures, declare Lua checker dependencies and handle the BOM policy explicitly.
5. Run classic/RF packaged install/update smoke tests and a live single-player, dedicated-server, joined-client mirror and Courseplay compatibility matrix.
6. Make the field world-object pre-scan incremental, not just the subsequent field loop.

**Exit evidence:** Evidence is attached to a release candidate: supported runtime, reproducible assets, clean/explicitly triaged gates, bounded queues/work and measured live-game results. A passing source test suite alone is not release acceptance.

## 8. Security threat model and limits

The relevant actors are a trusted local desktop user, an authenticated LAN viewer, an unauthenticated reachable LAN client, an untrusted website opened in a browser, and a configured remote feed/FTP source that could become compromised. Do not assume that a localhost socket proves the caller is a trusted application, or that remote metadata is safe because the server was configured by an administrator.

Sensitive capabilities include farm data streaming, host paths/configuration, credentials, cache writes, local image-export actions, setup replacement and privileged Electron IPC. Protect these at their capability boundary, not only by hiding buttons in viewer mode.

A remote HTTP authentication transport also needs a documented deployment policy. Basic credentials or bearer tokens over unencrypted, untrusted networks should not be treated as private. Adding FTPS does not itself secure the browser's HTTP connection.

No internet-facing deployment, real credential theft, arbitrary execution, successful DNS rebinding or external-document Electron exploit was demonstrated. Conditional risks must be tested in isolated fixtures before being promoted to stronger claims.

## 9. Efficiency assessment and measurement plan

The audit found repeated work and missing bounds, but it did not measure actual game FPS, collector milliseconds, tablet startup percentiles or production memory growth. File sizes below are uncompressed artifact sizes, not measured network-transfer costs.

Current evidence:

- Both inspected translation catalogs are 3,375,466 bytes; startup fetches the full catalog with no-store.
- The inspected existing built main JavaScript is 497,565 bytes, with additional shared chunks; source imports all main sections eagerly.
- The local splash has a fixed 5.2-second minimum plus its fade, even when data may already be ready.
- Courseplay compatibility performs repeated whole-fleet passes on the update path, and field collection has an unbounded world-object pre-scan before its yielding phase.
- Backend polls can overlap, unchanged snapshots evade deduplication, and slow WebSocket clients have no explicit queue bound.
- Data expansion and repeated section derivations deserve measurement at large farm sizes; their cost was not benchmarked here.

Record a baseline before tuning: source production age, poll/merge/serialization duration, active timers and in-flight operations, WebSocket queued bytes, host CPU/heap, cold/warm time-to-first-data, transferred bytes, interaction latency, and mod collector p50/p95/p99 cost against frame budget.

Use representative small, typical and stress farms: many fields, large vehicle fleets, large and mixed livestock populations, loose bales, production/storage networks, several viewers and optional integrations. Compare Courseplay enabled/disabled with unchanged data. Set budgets from supported hardware and actual baselines, not invented universal targets.

Optimize in this order: remove correctness-causing overlap and duplicated work, bound resource use, cache unchanged data by revision, defer unused sections/locales, then optimize measured hot loops. Avoid introducing complex memoization or virtualization without evidence that it improves the supported workload.

## 10. Release acceptance matrix

These checks remain work to execute after remediation, not passes awarded by this report.

1. **Classic and RF installers:** build from current UI source; inspect required module closure; clean install/start; correct product identity/update channel; upgrade without losing configuration.
2. **Authorization:** authenticated and unauthenticated HTTP/WS; case/slash/method variants; origin/Host policy; password rotation; allowlist removal; direct SimHub entry.
3. **Filesystem and feed boundaries:** malformed/traversal metadata, outside map fixtures, response/redirect limits, aborted transfer, FTPS certificate failure and no silent downgrade.
4. **Save/session identity:** rapid A/B/C switching with out-of-order HTTP/WS; delayed old configuration work; mirror and unrelated local save sharing a slot number; save restart and session change.
5. **Data semantics:** sold-to-zero animals, emptied storage, removed production, disabled integration, ownership transfer before disk save, stale larger detail, equal-length remote detail and clock offsets.
6. **Mod execution:** loose bales across slices, moisture-enabled stock, sampling boundaries, failed collector, failed file replacement, manual cadence and corrected timing diagnostics.
7. **Live compatibility:** single player, dedicated server and joined-client mirror; Courseplay; supported Realistic Livestock, RedTape, invoices, hire-purchasing and RF combinations. Include save/load and disconnect/reconnect.
8. **UI recovery:** server discovery failure, setup read failure, every settings write failure, auth timeout/retry, expired credentials, offline-to-online recovery and browser-only actions.
9. **Accessibility/mobile:** keyboard-only dialogs and forms, screen-reader labels/errors, zoom, 320/390/768/1024px widths, long farm names/translations, portrait/landscape and reduced motion.
10. **Performance/soak:** target tablet cold/warm startup, large farm lists, slow feed, stalled WebSocket client, repeated watcher recovery, multiple viewers and sustained game collection.

A release should attach the actual commands/environment, artifact identity, fixtures, observed results and any accepted residual risk to each applicable row. Avoid checking a box solely because a helper unit test passes.

## 11. Improvements already present and claims deliberately excluded

There is a useful foundation to build on: substantial automated test coverage, explicit setup-access helpers, HTTP secret redaction, retry/freshness helper contracts, last-good persistence, separate viewer behavior, an incremental mod-collection architecture and a typechecked new UI. The recommendation is to tighten their contracts and connect them consistently, not to rewrite the entire product.

Several plausible claims were examined and excluded or narrowed:

- Normal lowercase setup requests still pass the global Basic-auth layer before the setup token/locality gate. A setup token alone is not a demonstrated Basic-auth bypass.
- The legacy realtime connector's bare API URL is supplemented by a global fetch patch that adds the selected server ID. Missing server ID there is not reported as a defect.
- The updater's redirect advisory is not a demonstrated private-token leak because the inspected updater supplies no private token/custom headers.
- A deleted detail cache file is not claimed to be replayed by enumeration. The supported issue is population/freshness precedence and independent hold behavior.
- The Lua BOM checker failure is not presented as a proven game-load failure.
- Repeated Courseplay scanning is supported; an exact FPS loss is not.
- The operatingTime contract mismatch is supported; every frontend display has not been proven wrong.
- Passing TypeScript and helper tests do not prove source-to-installer freshness, live gameplay correctness or complete accessibility.

## 12. Assumptions and remaining limitations

The audit is a current-source snapshot, not a formal penetration test, a certificate of security or a guarantee that every prior action-plan item was completed. It covers the application's main boundaries and primary user flows deeply, with narrower screening of some optional UI surfaces and targeted external compatibility references. The adjacent Website and third-party mods themselves are outside product audit scope.

There was no live game or multiplayer execution, no destructive filesystem test against real paths, no public-network probing, no modification of real credentials and no actual installed-release/update exercise. Existing integration tests may consult mutable local AppData fixtures; that is explicitly identified as a test-design limitation. Synthetic browser fixtures cannot establish large-farm correctness.

No application or mod fixes were applied. The deliverables are this report, its interactive finding index and retained browser evidence. Test tooling and Vite may have generated their ordinary local caches; those are not intentional product changes.

When a finding depends on a failure, remote source or unusual timing, that condition is stated. Resolve high-impact supported findings first, then run the proposed targeted checks. If a live result contradicts a source-based expectation, retain the evidence and update the finding rather than silently lowering the test bar.

## 13. External and engine references

Electron's official support policy covers its latest three stable major lines. The inspected lockfile resolves Electron 29.4.6; production-only npm dependency classification does not change the support status of the shipped runtime. [Electron release timelines](https://www.electronjs.org/docs/latest/tutorial/electron-timelines).

Navigation restriction, current runtime updates and validation of IPC senders align with Electron's security guidance. These references support the recommended controls, not proof that an exploit was executed here. [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security).

The updater's cross-origin credential-forwarding advisory is a relevant dependency record, with the application-specific reachability caveat stated above. [Electron Builder advisory GHSA-p2f4-r6v6-j797](https://github.com/electron-userland/electron-builder/security/advisories/GHSA-p2f4-r6v6-j797).

FS25 unit assertions were checked against local game documentation/extracts rather than invented API signatures. In particular, the local Environment save implementation writes dayTime in minutes. Local engine files are reference material and were not modified.

