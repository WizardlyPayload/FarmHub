# FarmDash release-closure execution plan

**Date:** 6 September 2026  
**Scope:** Remaining release closure for Classic and RF; signing deferred  
**Status:** Planning only, not a release approval  
**Additional services/tooling budget:** GBP 0

**Contents:** 14 work packages, 146 ordered execution steps, 119 acceptance scenarios and a seeded reference ledger.

[Structured plan and starting closure ledger](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-06-release-closure-execution-plan-signing-deferred.json) | [Searchable visual navigator](C:/Users/Graham/.cursor/projects/c-Users-Graham-Documents-JoshWalki-Farmdash-server-edit-MAIN-CODEBASE-FarmHub/canvases/farmdash-release-closure-2026-09-06.canvas.tsx)

## Executive decision

Do not spend this phase on signing or repeat every previous remediation blindly. Close the source-confirmed mod export write-integrity concern, reproduce and disposition the remaining historical correctness/recovery findings, then prove the exact private installers and mod ZIPs through installed, live and bounded reliability acceptance. Keep the candidate private until the applicable gates are satisfied and Graham approves the release scope.

## 1. Objective and release boundary

Finish the remaining non-signing release work for Classic 4.2.2 with mod 3.4.0.8 and RF 5.0.1 with mod 5.0.0.1. The outcome is an evidence-backed decision about exact installers and ZIPs, not another broad speculative audit or an assumption that all previous work must be redone.

This document is an execution plan, not a new implementation or test report. Its steps and expected outcomes have not been executed by creating the document. Existing passes below are recorded baseline evidence; every new case starts as not run.

The latest private candidate is still classified PRIVATE_QA_ONLY_NOT_RELEASE_APPROVED. The strongest remaining source concern is mod export persistence safety. Several other historical correctness and recovery findings require reproduction or explicit closure. Installed, real-game, dedicated-server and soak acceptance are still essential evidence gaps.

The plan supersedes the earlier execution sequence only for remaining release closure. Preserve historical audits, plans, candidate manifests and results. Do not rewrite their conclusions or make old evidence appear to describe newly changed bytes.

- Signing is explicitly deferred by Graham. No paid certificate, paid service, Store submission or signing research is required by this plan.
- Use existing local tooling and volunteer testing within a GBP 0 additional-services budget.
- Do not disable Defender, SmartScreen, authentication, IPC checks or other protections to obtain a test pass.
- Do not replace public Classic 4.2.1 assets or describe an Electron 43 build as the old 4.2.1 release.
- Do not mutate Save 1, replace a loaded mod, install/uninstall software or publish merely because the plan describes those actions.
- Do not remove functionality as a performance shortcut. Do not add new product features, rebrand or redesign the application during closure.
- A real environment block caused by local policy is recorded honestly. It is not silently bypassed and is not evidence that the application itself failed a different functional test.

## 2. How to use this plan

Start with RC-00. Import the authoritative historical register and assign current dispositions before applying fixes. The seeded JSON ledger contains known references, but it intentionally does not claim to reconstruct the entire old audit. Four of the historical 29 primary IDs are not reconstructed in that seed and must be imported verbatim; the earlier not-reverified and conditional references also need reconciliation.

For each source package, first reproduce the reported behavior against current production code. If the intended fix already exists and passes the relevant regression, record that result and skip unnecessary reimplementation. If the path is unreachable or unsupported, document evidence and obtain the scope decision; unavailable test access is not the same as not applicable.

Use the Markdown as the implementation/runbook reference, the JSON as a structured starting ledger, and the canvas to search and navigate packages. The canvas is a view of the authored plan, not a live test runner or an automatically synchronized progress tracker.

The plan contains 14 work packages, 146 ordered work steps and 119 acceptance scenarios. Scenarios are specifications, not claims that that many executable tests already exist. Existing automated tests should be reused or extended rather than duplicated.

Candidate code paths are planning touchpoints, not an instruction to edit every listed file. Inspect the current implementation and any local instructions before a future edit, identify the minimal actual file set, and preserve unrelated changes.

- Working states: not_started, reproducing, confirmed_open, implementing, ready_for_validation, passed, blocked_external, not_applicable_with_evidence, deferred_by_owner.
- Only passed with candidate-bound evidence closes a required test. A code comment, a plan step, a screenshot of source or a green unrelated test does not.
- For a targeted fix already present, record its regression result and any still-missing integration evidence separately.
- An unsupported mode can be excluded only by an explicit supported-scope decision. Do not relabel an advertised but untested dedicated path as unsupported merely to finish.
- Keep a single accountable owner per finding and one primary package mapping; cross-package dependencies do not justify duplicate contradictory statuses.

## Recorded baseline: what is already passed and what is not

The following is carried from the reviewed candidate manifest and recorded validation results. It is not a claim that these commands were rerun while writing this plan.

**Candidate:** `2026-09-06-release-validation-093509-f2cf8e8c`  
**Manifest timestamp:** `2026-09-06T17:25:12.227Z`  
**Runtime:** Electron 43.6.0; electron-builder 26.15.3  
**Classification:** `PRIVATE_QA_ONLY_NOT_RELEASE_APPROVED`

[Candidate artifact manifest](C:/Users/Graham/Documents/FarmDash%20Release%20Candidates/2026-09-06-release-validation-093509-f2cf8e8c/ARTIFACT-MANIFEST.json)

### Recorded passes

- 55 Jest suites: 571 tests passed; 1 optional live test skipped.
- 89 Node ESM tests passed. Combined reported asserted passes: 660.
- 42 source Lua files parsed as Lua 5.1; this is not runtime or game-engine validation.
- TypeScript and translation key/placeholder checks passed.
- Application and frontend dependency audits reported 0 vulnerabilities at the baseline run.
- 395 package checks passed, including selected production module identities, rebuilt UI, mod ZIPs and feed consistency.
- 10 selected main-process production modules and every rebuilt UI file were compared byte-for-byte against packaged copies.
- Each mod ZIP's 42 Lua files were parsed and its allowlist/source references checked.
- 35 protected public files remained unchanged in the recorded build.

### Limits of that evidence

- The recorded baseline checks are not rerun by this planning task.
- No installer was executed by that validation run.
- No installed/live game, dedicated path or destructive uninstall acceptance was completed by that run.
- Focused source fixes and package identity do not close every historical finding.
- NotSigned was recorded for both installers and is now owner-deferred.
- Historical audit counts are historical, not a confirmed current-open defect count.

### Exact baseline artifact identities

#### Classic installer: 4.2.2

[FS25-Farm-Dashboard-Setup-4.2.2.exe](C:/Users/Graham/Documents/FarmDash%20Release%20Candidates/2026-09-06-release-validation-093509-f2cf8e8c/FS25-Farm-Dashboard-Setup-4.2.2.exe)

- Size: 974,350,362 bytes.
- SHA-256: `a79b77fc24c5db4d927d27adcaf4b6745897fadee78ef6901661a4cd7cba68c3`.

#### Classic mod: 3.4.0.8

[FS25_FarmDashboard-classic-3.4.0.8.zip](C:/Users/Graham/Documents/FarmDash%20Release%20Candidates/2026-09-06-release-validation-093509-f2cf8e8c/FS25_FarmDashboard-classic-3.4.0.8.zip)

- Size: 246,270 bytes.
- SHA-256: `9b58c8047513de57a189358c925528bf4cf6b32cd2f43cec2d0fa041cb09f792`.

#### RF installer: 5.0.1

[FS25-Farm-Dashboard-RF-Setup-5.0.1.exe](C:/Users/Graham/Documents/FarmDash%20Release%20Candidates/2026-09-06-release-validation-093509-f2cf8e8c/RF-edition/FS25-Farm-Dashboard-RF-Setup-5.0.1.exe)

- Size: 974,350,565 bytes.
- SHA-256: `32e3f7d9b5512b1a17d2eb7cadd0986b3f8573dc14b0a7752f23df9191dd95fa`.

#### RF mod: 5.0.0.1

[FS25_FarmDashboard-rf-5.0.0.1.zip](C:/Users/Graham/Documents/FarmDash%20Release%20Candidates/2026-09-06-release-validation-093509-f2cf8e8c/RF-edition/FS25_FarmDashboard-rf-5.0.0.1.zip)

- Size: 246,260 bytes.
- SHA-256: `d9850f35e560fe4d96bbaf4c11698a1b5155f858ae590a893396485d9f100e8c`.

### Supporting baseline records

- [Recorded checksums](C:/Users/Graham/Documents/FarmDash%20Release%20Candidates/2026-09-06-release-validation-093509-f2cf8e8c/SHA256SUMS.txt)
- [Recorded release status](C:/Users/Graham/Documents/FarmDash%20Release%20Candidates/2026-09-06-release-validation-093509-f2cf8e8c/RELEASE-STATUS.txt)
- [Build results](C:/Users/Graham/Documents/FarmDash%20Release%20Candidates/2026-09-06-release-validation-093509-f2cf8e8c/validation/build-results.json)
- [Protected public inventory before build](C:/Users/Graham/Documents/FarmDash%20Release%20Candidates/2026-09-06-release-validation-093509-f2cf8e8c/validation/protected-public-before.json)
- [Protected public inventory after build](C:/Users/Graham/Documents/FarmDash%20Release%20Candidates/2026-09-06-release-validation-093509-f2cf8e8c/validation/protected-public-after.json)

- Application lockfile SHA-256: `94eca11e4cbb6197e70ac1c2c240fde991408b41ab6055513a25f2f19655958e`.
- Frontend lockfile SHA-256: `87587aad80175139dcc752d78d7eb9d8a8c1c745558179ab2f7c754291fc9de9`.

## 3. Preserve completed work as regression protection

The previous remediation established useful focused controls. This plan retains them and tests their real integration rather than reopening them as if they were never implemented. Their existence does not establish that every related end-to-end path is complete.

The baseline includes origin handling that distinguishes absent Origin from explicitly opaque or malformed browser origins; HTTP/WebSocket checks; exact trusted application-document and loopback handling; IPC checks for the expected webContents/mainFrame; FTP input validation; and protected file-commit behavior.

It also includes per-server FTP serialization/generation checks, a total HTTP deadline and same-origin redirect handling, transport-client restart on relevant configuration changes, XML fingerprints, zero-herd/detail safeguards, request context cancellation, four-worker detail fan-out, real Preact focus tests and targeted error classification.

Keep tests production-linked. Existing useful entry points include releaseSafety.regression.test.js, releaseUi.regression.test.js and pastureStockSummary.test.js under the application test directory. Do not replace production-linked tests with stand-alone algorithm copies that cannot detect a shipping-code regression.

- Retain last-good desktop file behavior on failed rename, unique staging, JSON validation and generation checks.
- Retain rejection of explicit opaque/malformed browser origins without incorrectly rejecting legitimate non-browser clients solely for an absent header.
- Retain transport flag preservation and the intended secret-stripping policy during cross-edition import.
- Retain zero counts and measured zero health; investigate broader unknown-value and aggregation semantics separately.
- Retain the fixed focus callback behavior. Installed keyboard/recovery acceptance is an additional layer, not proof that the old unit case is still failing.
- Retain narrow dependency changes. A zero-vulnerability audit is a snapshot of reported advisories, not proof that all application security risks are closed.

## 4. What blocks release and what does not

Release blockers are based on confirmed behavior and supported user impact, not on the size of a historical finding list. A source-confirmed integrity risk still needs closure even if the fault is uncommon. Conversely, a theoretical performance concern is not automatically a release blocker.

High-risk unknowns in an advertised core path are acceptance gaps. Graham can approve narrower release scope or private testing, but an unrun case must not be written as passed. Low-risk improvements may be deferred with a reason, owner and future acceptance criterion.

- Blocking: loss of last-good export or settings caused by an unsuccessful write, destructive uninstall outside owned roots, or unrecoverable supported migration.
- Blocking: unauthorized access, credential exposure, bypassed browser/IPC boundaries or data from the wrong save/server/farm being presented as the selected context.
- Blocking: fabricated or materially misleading core ownership, livestock, valuation or market recommendations with no honest qualification.
- Blocking: supported setup, authentication, installation, update-channel selection or dedicated connection cannot reach a usable state or recover from ordinary failure.
- Blocking: repeatable crashes, persistent request starvation, unbounded retry/resource growth or severe user-visible stalls attributable to the candidate.
- Acceptance gap: a required installed, live, dedicated, upgrade or destructive-uninstall scenario was not run against the final candidate.
- Not automatically blocking: minor visual polish, speculative micro-optimisations, unrelated game/mod errors or an explicitly excluded unsupported integration.
- Owner-deferred: code signing. Record actual unsigned installer experience and limitations without converting signing into an unapproved paid prerequisite.

## 5. Work order, dependencies and realistic effort

The critical path is RC-00 -> RC-01 -> RC-02 -> RC-03 -> RC-04 -> settled source closure -> RC-09 -> RC-10 -> RC-11 -> RC-12 -> RC-13. Ownership/animal/UI/performance work can proceed in coordinated lanes after its required contracts are stable. Do not edit shared data contracts independently in competing branches of work.

RC-05 and RC-06 depend on the data truth contract in RC-04. RC-07 can reproduce its failures early, but final integration depends on context handling. RC-08 can collect measurements early, but optimisations must preserve the agreed scheduler and freshness semantics.

The per-package effort ranges sum to 54-112 hands-on hours if the full described work is required. This is a planning allowance, not a quote, a promise or a claim that all old faults still exist. Existing implemented fixes may reduce it substantially after RC-00; unfamiliar engine behavior, unavailable environments or a confirmed new blocker can increase it.

Soak runtime and volunteer response time are additional elapsed time, although some can overlap safely. Use a small, agreed tester window, initially 48 hours after a complete private handoff if volunteers are available. Do not interpret lack of a response by the deadline as a pass.

- Wave 1: baseline reconciliation, safe environments and verified engine I/O contract.
- Wave 2: mod persistence and collector outcomes, then data ordering and confirmed source/UI correctness fixes.
- Wave 3: measured performance closure, full regression gates and one new private candidate if any release input changed.
- Wave 4: exact-installer acceptance, real game/dedicated acceptance, bounded soak and independent tester scenarios.
- Wave 5: final owner decision, accurate versioned release notes and rollback rehearsal. Publication is a separate action.
- If a historical issue is already fixed, close it through relevant evidence rather than allocating its full implementation allowance.
- Do not rebuild both installers after every small change. Settle source contracts and focused tests first, then package a coherent candidate.

## 6. Contract decisions to settle before coding

The following are required semantics, not mandated field names or invented GIANTS API signatures. Prefer compatible additions and small adapters over broad schema replacement. Document existing representations and the smallest safe change.

Persistence: a nonthrowing call is not synonymous with persisted output. Track the phase, operation result, primary committed state, mirror result and retained recovery material. Success bookkeeping follows a confirmed commit, not an attempted write.

Collector outcome: successful data, successful empty, partial and failed have distinct meanings. A successful empty may clear previous data; a failed collector may not. Section-level last-success provenance must survive a mixed-age outer export.

Ordering: the current context includes the source/server, save, edition/profile and relevant farm scope. An entity key also includes its namespace. Producer restart identity and ordering must be sufficient to distinguish a new session from a late old response without depending on globally synchronized wall clocks.

Freshness: source observation time, fetch time and screen refresh time are different. File mtime or a successful poll may be a useful fallback signal but cannot universally prove that the underlying game section was recollected.

Clears: an authoritative clear or successful empty survives persistent holds, detail caches, restart and reconnect. Missing/failed data does not become an implicit clear. Late earlier-generation data cannot reverse an acknowledged clear.

Animal values: measured zero is not unknown. Sample mean, sample size and estimated total population are different quantities. Unknown health is not assumed to be 100, and estimates must not be presented as complete measurements.

Ownership and finance: stable scoped identifiers and verified relationships outrank display-name heuristics. Purchase price is not resale value. A station name is not evidence that it accepts a product or offers a measured price.

Authentication and settings: timeout/denial is not successful authorization. Recovery UI must exist before startup waits for user input. Unloaded settings values cannot be overwritten by defaults during an unrelated save.

Shared target: separate desktop processes/profiles do not by themselves establish safe ownership of one game-side mod or export destination. Adopt and prove a single-writer or explicit coordination policy.


## 7. Safe execution and approval boundaries

Creating this plan authorizes none of the later mutating or destructive actions. Before future execution, confirm the exact action and target at the point of risk. Keep normal application data, real credentials and the user's active save outside fault fixtures.

Use one shell end to end for Windows file operations. Before recursive deletion or moving, resolve absolute paths, verify they remain inside the intended owned test root and handle reparse points explicitly. Prefer LiteralPath for native operations. Never construct a cross-shell deletion pipeline.

Backups must have recorded source path, destination, time and identity where applicable. A rollback backup is only useful if the restore target and compatibility limits are known. Never claim a rollback was tested unless it was exercised in the approved disposable environment.

- Planning/documentation: current scope. No application source edits, builds, tests, installs or publication are performed by authoring this plan.
- Future source fixes: require an implementation request; read relevant local guidance and preserve unrelated changes.
- Tests/builds: run only when instructed for the implementation/validation phase; use explicit private destinations and controlled fixtures.
- Installer execution and migration: obtain action-time confirmation of target environment and backup before launching.
- Uninstall Full/Keep tests: use approved disposable profiles and action-time approval; protect saves, sibling editions and unrelated dependencies.
- Mod replacement: confirm game stopped, exact ZIP pairing and backup; never swap the mod under a running game.
- Failure injection: use fake I/O, scratch roots or approved isolated targets. Do not fill a real system disk, revoke live-save permissions or kill unrelated processes.
- Remote tests: use authorized endpoints and test credentials. Do not conduct broad scanning or interfere with unrelated servers.
- Publication/update feeds: separate explicit approval after technical readiness; no upload or redirect is implied by this plan.
- Evidence sharing: redact passwords, tokens, FTP credentials, sensitive URLs and private save data. Keep full raw evidence local under appropriate access.

## 8. Test environments and fixture catalog

Use layers so fast deterministic tests establish contracts before slow installed and game tests. Record applicability by edition and mode. Reuse a fixture only when its semantics and expected result are the same; do not use one generic mock to claim all environments work.

Synthetic fixture names below are proposed identifiers. They are not claims that fixture files already exist. Keep deterministic expected values and stable identities, and avoid embedding real credentials or copied private exports in the repository.

- ENV-UNIT: production-linked Jest, Node ESM and real frontend component tests with deterministic deferred responses.
- ENV-LUA: compatible Lua execution or a verified game-side harness using the real production helper, plus the separate Lua 5.1 syntax gate.
- ENV-FS: temporary owned Windows directories for permissions, staging, replace failure, sentinels and recovery; game saves excluded.
- ENV-INSTALL: approved disposable Windows profile/environment with real installers, previous supported artifacts and safe backup/restore.
- ENV-GAME: copied representative save with exact loaded mod version and recorded game build; do not assume Save 1 is still open.
- ENV-REMOTE: authorized real dedicated source plus a controlled endpoint for slow/error/redirect/path cases.
- FX-IO-OLDGOOD: known old final bytes, known new staged bytes, stale destination and selectable per-operation failures.
- FX-COLLECTOR-OUTCOMES: populated, successful-empty, partial, missing and failed sections with distinguishable provenance.
- FX-CONTEXT-A-B: two saves/servers with identical numeric entity IDs but clearly different values and deferred response order.
- FX-EPOCH-RESTART: one producer session ends and a new session restarts ordering; old responses are delivered afterward.
- FX-CLEAR-RELOAD: populated generation, acknowledged empty generation, persisted hold and replayed older detail.
- FX-ANIMAL-SAMPLE: ten measured samples with known sum/mean, a larger estimated herd, measured zeros and unavailable values.
- FX-ENTITY-COLLISION: equal numeric field/farmland IDs, duplicate display names and conflicting weak ownership metadata.
- FX-VALUATION-MARKET: distinct purchase/resale values, zero and unknown resale, misleading station names and absent prices.
- FX-SETTINGS-PARTIAL: one settings domain fails to load, another is edited, then persistence fails and recovers.
- FX-INSTALL-SENTINELS: recognizable files in owned disposable roots, sibling-edition roots and unrelated protected locations.
- FX-LARGE-SCAN: large fleets/inventory with duplicate and rejected objects, ensuring the work budget counts examined items.
- FX-REMOTE-FAULTS: slow response, connection close, authentication denial, redirect and invalid file/save identifiers on a controlled endpoint.

## 9. Performance and soak decision framework

These are proposed starting thresholds, not measured current performance or established product requirements. Approve or replace them before collecting results. The aim is to find user-visible regressions with attributable evidence, not to force every machine to meet an invented benchmark.

Record hardware, OS, game build, enabled mods, scenario, export/poll cadence, app version, warm-up period and measurement method. Compare equivalent workloads. Use raw traces and repeated observations to distinguish application/mod cost from weather, world activity, unrelated mods and network variability.

Suggested soak scope: two hours of representative local use for Classic, two hours for RF, two hours of dedicated/reconnect activity, and one six-hour steady-state run on a representative worst-case supported configuration. Sessions may overlap only if the coexistence case passed and the overlap does not invalidate resource attribution.

- Hard failure: crash, export/settings integrity loss, wrong-context data, unauthorized access, permanent request starvation or unbounded queue/retry growth.
- UI investigation trigger: repeatable unacknowledged ordinary interactions over 250 ms at the 95th percentile, or normal local dialog opening over one second on the recorded target machine.
- Severe responsiveness trigger: repeatable unexplained app freezes over two seconds during ordinary use. Known bounded network waits need clear progress/error UI rather than a frozen interface.
- Freshness target: after a confirmed source commit, the healthy path should converge within two configured end-to-end refresh intervals plus ten seconds. Record the actual cadence; no successful poll may fake source freshness.
- Mod performance investigation trigger: a repeatable greater-than-ten-percent degradation in matched 95th-percentile frame time. Attribute the cause before labeling it a mod blocker.
- Existing concurrency contract: retain the four-worker detail hydration bound, including retries and context changes, unless deliberately changed with evidence.
- Scan budget contract: every examined object consumes budget, even when rejected or duplicated; all eligible data eventually completes.
- Memory investigation trigger: more than twenty-percent post-warm-up growth over a stable six-hour workload without a plateau or explained cache bound. This is a diagnostic trigger, not automatic proof of a leak.
- Logs and retries: bounded by a documented policy during permanent failure; no per-frame exception storm or endless accumulation.
- Soak completion: no unresolved hard failure, no unexplained severe regression and enough evidence to explain sustained resource trends. Restarting a failed run does not erase the incident.

## 10. Evidence, privacy and closure records

Keep evidence under a newly allocated private closure-run directory. Suggested subdirectories are baseline, contracts, fixtures, automated, package, installed, game, dedicated, soak, testers and decision. These are proposed directories to create during execution, not files created by this plan.

Each acceptance record needs the case ID, related finding, exact candidate/build ID, installer/mod hashes when relevant, edition, Windows/game versions, save/server aliases, fixture identity, start/end time, actual observed behavior, result, sanitized evidence paths, tester, reviewer and limitations.

Use passed, failed, blocked_external, not_run or not_applicable_with_evidence for cases. Never use 'expected to pass' as a pass. A not-applicable decision needs a supported-scope explanation or reachable-path evidence, not just missing access.

For each finding, retain the original statement and acceptance criterion, initial classification, reproduction evidence, minimal change or already-fixed explanation, focused regression, installed/live evidence where required, final disposition and reviewer. Do not overwrite an original finding with the implementation plan.

Screenshots prove visible state at a moment, not filesystem integrity, request ordering or absence of credential exposure. Pair them with appropriate logs, byte checks, sentinels or deterministic test traces. Keep unredacted material private and share only sanitized excerpts.

The JSON includes starting templates for case evidence and a final decision. Its initial statuses are intentionally incomplete. Editing the JSON later does not automatically update the static canvas snapshot; regenerate the presentation deliberately if progress tracking is wanted.


## 11. Gate definitions and change invalidation

G0, baseline: RC-00 reconciles all original references, candidate identities, safe targets and owner decisions. Missing or ambiguous authoritative register entries must be resolved before a claim of complete audit closure.

G1, persistence/collection: RC-01 through RC-03 establish verified engine contracts, preserve last-good exports and distinguish failure from empty success. Parser success alone does not satisfy this gate.

G2, data and recovery: RC-04 through RC-07 close confirmed wrong-context, freshness, animal, ownership, valuation, authentication and settings risks with production-linked evidence and queued installed/live checks.

G3, bounded work: RC-08 closes reachable user-impacting performance risks with measurements or records evidence-based backlog/not-applicable decisions.

G4, package integrity: RC-09 produces or retains one eligible immutable candidate, full mandatory automated passes and exact byte/feed/public-protection evidence.

G5, installed acceptance: RC-10 proves both installers, supported upgrade paths, coexistence and approved uninstall boundaries.

G6, real integration: RC-11 proves every advertised local/dedicated path with loaded-mod identity, live data and recovery evidence.

G7, reliability/pilot: RC-12 completes the agreed finite soak and independent scenario coverage without unresolved blockers.

G8, owner decision: RC-13 records exact scope, limitations, rollback and go/no-go. Signing remains deferred; publication still needs separate authorization.

- Any release-affecting source, dependency lock, generated UI, mod contents or packaging configuration change invalidates the affected artifact identity.
- Rebuild affected artifacts after source changes and rerun all mandatory package gates for the new candidate.
- Rerun source tests for changed modules and their integration boundaries; full automated suite before sealing the new candidate remains required.
- Rerun installed acceptance affected by installer, runtime, profile, startup, configuration or packaging changes.
- Rerun live acceptance affected by mod, transport, data schema, cache, context, scheduler or runtime changes.
- Rerun soak affected by lifetime, scheduling, resource, retry or concurrency changes.
- Evidence reuse is allowed only for explicitly unchanged components and unchanged relevant conditions, with a written rationale; do not silently transfer old-hash passes.
- A documentation-only change does not automatically require rebuilding binaries, but verify that it truly does not alter a packaged or release-significant input during the authorized validation phase.

## 12. Free-project release communications and rollback

The release can be evaluated technically with signing deferred. Do not promise that every Windows policy configuration will allow unsigned software or that all users will see the same warning. State only the actual tested behavior and supported scope, with a clear support route for installation problems.

Draft separate new-version release notes for Classic 4.2.2 and RF 5.0.1. Include the exact matching mod versions, relevant runtime change, important fixes, supported upgrade path, known limitations and checksum/manifest location. Preserve the old 4.2.1 notes and files.

Prepare a rollback runbook naming the previous supported installer/mod pair, backup locations, game-stopped requirement for ZIP replacement, profile compatibility and whether downgrade is supported. If a schema migration prevents safe downgrade, explain the restore-from-backup path instead of implying uninstall alone reverses it.

Before any later authorized publication, list precise destinations and order. New versioned files first, consistency checks next, then only explicitly approved feed/announcement changes. Do not overwrite an old installer filename with new bytes.

Stop rollout on a credible integrity/security blocker. Keep the affected candidate identifiable, notify only actual recipients through an approved channel and provide the tested rollback instructions. Do not silently substitute a different binary under the same release identity.


## 13. First implementation session

The next useful action is not another blind rebuild. Begin by making the old findings and the actual current source agree, then close the highest-risk verified mod persistence issue. This keeps the release effort finite and avoids spending time on work that was already implemented.

- Allocate the new closure run and import the original finding register into the seeded ledger.
- Record the actual installed versions, loaded game/mod state and available test copies without changing them.
- Confirm the protected public destinations, candidate identities and action-time approval boundaries.
- Reproduce R2-MOD-01 using the smallest production-linked non-destructive fixture.
- Look up the actual GIANTS/Lua I/O contracts before selecting a replacement strategy.
- Approve the result/commit/recovery contract, then implement RC-02 only when that implementation work is requested.
- In parallel by ownership, reproduce the remaining data/auth/settings findings and close already-fixed cases with relevant tests.
- Do not rebuild until confirmed source blockers and contracts are settled.
- Do not mark installed/live paths passed because the source suite is green.
- End the session with the next smallest named action and evidence link, not a new broad audit request.

## 14. Detailed execution work packages

Each package starts planned and unexecuted. The effort range is conditional on current reproduction, not an instruction to spend that time on already-fixed behavior. Candidate files are intended investigation/edit touchpoints; new harness files are explicitly proposed.

### RC-00. Freeze the baseline and reconcile every historical finding

**Objective:** Establish what is actually unresolved without assuming either that every old issue still fails or that passing a rebuild closed the entire audit.

**Priority:** Entry gate  
**Owner:** Release coordinator, with Graham approving scope  
**Dependencies:** None; entry package  
**Wave:** Baseline  
**Initial status:** Planned, not executed  
**Indicative hands-on allowance:** 1-2 hours if this work is required

**Finding references:** All historical findings: register reconciliation.

#### Candidate code/document touchpoints

- [docs/_internal/audits/2026-09-05-remediation-reaudit.json](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit.json)
- [docs/_internal/audits/2026-09-05-reaudit-remediation-execution-plan.json](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-reaudit-remediation-execution-plan.json)

#### Ordered execution steps

1. **RC-00-S01: Create a new closure run.** Choose a unique run ID and a new private evidence directory outside all public output directories. Record its resolved absolute path. Keep the 2026-09-06 candidate, its manifest and its existing validation records immutable; new results belong to the new run.

2. **RC-00-S02: Import the authoritative finding register.** Import the exact IDs and original acceptance criteria from the historical audit. Reconcile the historical 29 findings, 11 not-reverified references and four conditional risks without treating overlapping references as new defects. The seeded ledger in this plan is deliberately not a substitute for that reconciliation.

3. **RC-00-S03: Assign an evidence-based disposition.** For each imported finding record confirmed-open, targeted-fix-present, closed-with-current-evidence, not-reproduced-in-stated-scope, conditional, blocked-external or explicitly-deferred. Include a reason, owner, evidence link and affected edition. Do not convert not-reproduced or source-looking-correct into proven fixed.

4. **RC-00-S04: Record the actual supported release matrix.** Confirm Classic 4.2.2 with mod 3.4.0.8 and RF 5.0.1 with mod 5.0.0.1 as the current candidate targets. Record the actual older installed versions, game build, enabled mods, Windows version, server modes and update channels instead of guessing them.

5. **RC-00-S05: Protect public release assets.** Carry forward the existing protected-public inventory and hashes. Define all additional public pages, feeds and installer destinations that must not change during closure. Classic 4.2.1 remains an accurate historical release, not a container for new Electron 43 bytes.

6. **RC-00-S06: Define safe test resources.** Identify a disposable Windows profile or equivalent isolated test environment, copied game save, scratch export folder and authorized test server. Plan backups of relevant settings and mod ZIPs. Do not replace the mod in a running game or use Save 1 for destructive probes.

7. **RC-00-S07: Set risk-based release rules.** Make confirmed data-loss risks, wrong-save disclosure, unauthorized access, broken installation and unusable advertised core paths blocking. Keep cosmetic polish and unmeasured optimisation as backlog. Signing is owner-deferred and is not a technical closure prerequisite in this plan.

8. **RC-00-S08: Nominate an owner for every gap.** Assign one accountable person or role to each work package and external test prerequisite. Mark unavailable dedicated credentials, previous installers or representative saves as unavailable evidence, not an application failure and not a test pass.

9. **RC-00-S09: Approve the first implementation slice.** Start with RC-01 and RC-02 while the other owners reproduce their assigned historical findings. Approve contracts before competing fixes touch the same data structures. No general redesign, new features, branding or paid services are included.

10. **RC-00-S10: Publish the baseline checkpoint.** Record the current package/test passes, the exact scope those passes cover, the tests that were skipped, and the remaining installed/live unknowns. This checkpoint becomes the comparison point for all later decisions.

#### Acceptance scenarios

All cases initially have status **not run**. For each applicable case, record exact candidate/environment identity, observed result and sanitized evidence using the evidence template. Expected behavior below is not a recorded pass.

##### RC-00-T01: Historical register completeness

**Arrange:** The authoritative audit and earlier plan are available.

**Action:** Import and deduplicate references, then compare IDs and dispositions.

**Expected:** Every original reference is accounted for exactly once as a primary disposition; overlaps and unavailable details are explicit.

##### RC-00-T02: Immutable candidate identity

**Arrange:** The existing manifest and four candidate artifacts are available.

**Action:** Record their identities in a new run without modifying the old run.

**Expected:** The old candidate remains unchanged and new evidence has a distinct run ID.

##### RC-00-T03: Edition scope

**Arrange:** The candidate versions are recorded but installed versions may differ.

**Action:** Record the actual installation and game matrix.

**Expected:** No test result silently assumes a different edition, mod version, save or game build.

##### RC-00-T04: Protected public surface

**Arrange:** The protected-public baseline exists.

**Action:** Resolve destinations intended for later build and publication steps.

**Expected:** No closure output is directed into the public 4.2.1 artifacts or feed.

##### RC-00-T05: Signing exclusion

**Arrange:** The user has deferred signing and has a GBP 0 tooling budget.

**Action:** Review the release requirements.

**Expected:** No signing purchase, paid service or security-control bypass is a prerequisite.

##### RC-00-T06: Safe live-data boundary

**Arrange:** Save 1 and the user's normal profiles contain valuable state.

**Action:** Select test copies and define action-time approvals.

**Expected:** Destructive tests cannot target the live save or an unapproved real installation.

#### Required deliverables

- Baseline and scope record
- Reconciled historical finding ledger
- Environment and backup inventory
- Approved blocker versus backlog rules

**Exit gate:** A complete reconciled register, named owners, protected paths, safe environments and a truthful baseline are recorded. Missing register entries or ambiguous test targets block progression to implementation.

**Failure/rollback rule:** This package should not mutate the application. If any candidate identity or protected path is ambiguous, stop and resolve it before writes, installations or publication.

### RC-01. Prove the FS25 file-operation contract and build a failure harness

**Objective:** Establish what the actual game APIs guarantee before changing persistence code; test production behavior rather than a copied algorithm.

**Priority:** Blocking prerequisite for the mod persistence fix  
**Owner:** Mod implementer with FS25 engine-reference reviewer  
**Dependencies:** RC-00  
**Wave:** Source closure  
**Initial status:** Planned, not executed  
**Indicative hands-on allowance:** 3-6 hours if this work is required

**Finding references:** R2-MOD-01 supporting prerequisite.

#### Candidate code/document touchpoints

- [FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua)
- [FS25_FarmDashboard_Mod/src/FarmDashboardExportMirror.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardExportMirror.lua)
- [FS25_FarmDashboard_Mod/src/FarmDashboardSettingsApi.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardSettingsApi.lua)
- [tools/check-lua-syntax.mjs](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/tools/check-lua-syntax.mjs)
- **Proposed, not an existing-file claim:** A small production-linked Lua persistence failure harness; exact path and runtime selected after engine-contract discovery.
- **Proposed, not an existing-file claim:** A short engine-I/O evidence note with game-version-specific references.

#### Ordered execution steps

1. **RC-01-S01: Confirm the engine being tested.** Record the actual game version used for acceptance. The local wiki index refers to game extract 1.20.0.0; that is reference material, not proof of the user's running version. Note any mismatch before relying on extracted behavior.

2. **RC-01-S02: Trace the write paths once.** Identify primary export, detail export, settings, staging, backup and mirror callers in the current mod. Map which paths use ordinary Lua file handles and which call GIANTS functions. Include cleanup and exception paths, not only the successful write.

3. **RC-01-S03: Look up exact API contracts.** Consult the local wiki, decompiled scripts, Community LUADOC and lua-scripting references for each used file operation. Capture signatures, observed return meanings and examples. Do not infer successful persistence from pcall success or from a destination already existing.

4. **RC-01-S04: Resolve documentation gaps safely.** Where evidence is absent, design a controlled probe in a scratch directory or disposable game profile. Observe existing-destination, missing-parent and denied-write behavior. Keep game-save files outside the probe and report any still-unknown semantics explicitly.

5. **RC-01-S05: Define a small internal result vocabulary.** Propose a result with explicit stage, success/failure, whether the primary output committed, mirror outcome, recovery paths and a safe diagnostic. Names in this plan are design proposals, not assertions about existing APIs. Keep legacy callers compatible through a deliberate adapter.

6. **RC-01-S06: Make production logic injectable.** Provide the smallest seam needed to substitute filesystem operations and outcomes in tests. Run the same production helper that the mod uses; avoid tests that reimplement a better algorithm and never exercise the shipping code.

7. **RC-01-S07: Create deterministic fault fixtures.** Cover thrown errors, returned failure, short writes where the API exposes them, close failure, failed replacement, stale pre-existing destination and failed cleanup. Give every fixture known old bytes, intended new bytes and expected preserved recovery material.

8. **RC-01-S08: Separate syntax from execution evidence.** Keep the existing Lua 5.1 parser gate. Add actual runtime or in-game harness execution using a compatible free runtime or verified game mechanism. Parsing 42 files must never be described as having tested persistence semantics.

9. **RC-01-S09: Document uncertain guarantees.** State where filesystem visibility, replacement or durability is only best-effort. If a safe replacement primitive cannot be established, fail closed and preserve the existing export rather than claiming atomicity or adding an unlink-first fallback.

10. **RC-01-S10: Approve the persistence design.** Review the result contract, validation rule and recovery ownership with the mod and desktop data owners before RC-02. Confirm that readers tolerate the chosen staging and failure behavior and do not discover scratch files as live exports.

#### Acceptance scenarios

All cases initially have status **not run**. For each applicable case, record exact candidate/environment identity, observed result and sanitized evidence using the evidence template. Expected behavior below is not a recorded pass.

##### RC-01-T01: Returned copy failure

**Arrange:** A known-good destination already exists; the injected copy reports failure without throwing.

**Action:** Run the real production copy path.

**Expected:** The operation is classified as failure; old-file existence does not create a success result.

##### RC-01-T02: Thrown filesystem exception

**Arrange:** A staged write is configured to throw.

**Action:** Execute through the production error boundary.

**Expected:** Failure is structured and bounded; no success timestamp advances.

##### RC-01-T03: Write or close failure

**Arrange:** The harness exposes a write failure and a close failure separately.

**Action:** Run each through the shipping persistence helper.

**Expected:** Both failures prevent a committed-success outcome and preserve recoverable data.

##### RC-01-T04: Stale destination trap

**Arrange:** Destination bytes are from an earlier export and staging contains different intended bytes.

**Action:** Simulate a failed copy with destination still present.

**Expected:** The helper cannot claim that the new export persisted merely because the path exists.

##### RC-01-T05: Missing versus empty result

**Arrange:** One probe produces a valid empty export and another produces no output.

**Action:** Validate both using the proposed contract.

**Expected:** Valid empty data and persistence failure remain distinguishable.

##### RC-01-T06: Unverified replacement primitive

**Arrange:** The available engine reference does not establish safe replacement semantics.

**Action:** Exercise the fallback design in scratch space.

**Expected:** The design preserves last-good data and reports limited guarantees instead of deleting first.

##### RC-01-T07: Real helper linkage

**Arrange:** A test harness and production caller are available.

**Action:** Demonstrate that a controlled production behavior change changes the harness result.

**Expected:** Tests exercise the production implementation, not an independent duplicate.

##### RC-01-T08: Scratch isolation

**Arrange:** A copied profile and scratch export root are configured.

**Action:** Resolve every fault-injection target before the run.

**Expected:** No target is a live save, loaded mod, public artifact or unrelated user directory.

#### Required deliverables

- Engine I/O contract note
- Production-linked fault harness
- Failure fixture catalog
- Approved internal persistence result contract

**Exit gate:** Documented game-version-specific I/O evidence and a production-linked executable failure harness cover every persistence primitive. Unresolved unsafe semantics are handled by a fail-closed design, not assumptions.

**Failure/rollback rule:** Keep all probes inside disposable resources. Remove only owned scratch artifacts after recording evidence. Do not ship a replacement strategy whose safety relies on unverified engine behavior.

### RC-02. Make mod exports preserve last-good data under write failures

**Objective:** Prevent false success and loss of the last usable export across primary writes, moves, mirrors and settings persistence.

**Priority:** Release blocker until persistence safety is closed  
**Owner:** Mod implementer  
**Dependencies:** RC-01  
**Wave:** Source closure  
**Initial status:** Planned, not executed  
**Indicative hands-on allowance:** 8-16 hours if this work is required

**Finding references:** R2-MOD-01.

#### Candidate code/document touchpoints

- [FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua)
- [FS25_FarmDashboard_Mod/src/FarmDashboardExportMirror.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardExportMirror.lua)
- [FS25_FarmDashboard_Mod/src/FarmDashboardSettingsApi.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardSettingsApi.lua)

#### Ordered execution steps

1. **RC-02-S01: Reproduce the current failure first.** Run RC-01 fixtures against the current implementation and retain the failing traces. Confirm which specific callers still ignore returned errors or close results. If a path is already corrected, retain its passing regression instead of rewriting it.

2. **RC-02-S02: Prepare a complete candidate before replacement.** Write the next export into an owned staging path beside the intended target where appropriate. Complete serialization before publishing and validate its expected shape or content using mechanisms supported by the actual runtime.

3. **RC-02-S03: Require confirmed completion of every phase.** Check open, write, close and subsequent move/copy outcomes according to RC-01. Only classify primary persistence as successful when all required stages succeeded. Keep thrown errors and returned failures visible to the caller.

4. **RC-02-S04: Preserve the old destination during replacement.** Use the verified safe replacement strategy. Never delete the final file first merely to make a rename succeed. If replacement cannot finish, leave last-good data readable and preserve valid staged output for bounded recovery.

5. **RC-02-S05: Fix move recovery ownership.** Do not delete a source or recovery file based on nonthrowing copy plus destination existence. Establish success using the verified contract and validate the intended output as far as the runtime permits before removing owned recovery material.

6. **RC-02-S06: Separate primary and mirror outcomes.** A mirror failure must not disguise a primary failure, and a successful primary write must not cause endless full re-export because one optional mirror is unavailable. Track each destination independently with clear user-facing degradation and bounded retries.

7. **RC-02-S07: Repair success bookkeeping.** Advance export generation, committed timestamp, last-success markers and request completion only for the output that actually committed. On failure retain the previous successful identity and publish a failure/stale indication through existing supported channels.

8. **RC-02-S08: Bound retry and recovery storage.** Set bounded retries and a documented retention policy for owned temporary files. Never glob-delete arbitrary user files. Keep enough valid recovery evidence to diagnose failures and remove abandoned owned files only under the documented safety rule.

9. **RC-02-S09: Connect settings and detail exports.** Apply the contract consistently to settings persistence, requested detail files and all direct/staged export branches. A failed settings write must not be displayed as saved; failed detail export must not be acknowledged as completed data.

10. **RC-02-S10: Prove recovery after the fault clears.** Run failure then recovery sequences for each destination. Verify last-good output remains usable during the fault, the next successful generation becomes visible afterward, and one successful recovery does not replay stale staged generations.

11. **RC-02-S11: Document the exact guarantee.** Describe preserved last-good export behavior, any unavoidable interruption window and unsupported failure modes. Do not claim power-loss durability or save-game protection beyond the evidence. The identified concern is export integrity, not evidence that Save 1 was corrupted.

#### Acceptance scenarios

All cases initially have status **not run**. For each applicable case, record exact candidate/environment identity, observed result and sanitized evidence using the evidence template. Expected behavior below is not a recorded pass.

##### RC-02-T01: Healthy primary write

**Arrange:** A valid previous export exists and all operations succeed.

**Action:** Write a newer complete export.

**Expected:** Readers receive the new valid generation and success bookkeeping advances once.

##### RC-02-T02: Primary write denied

**Arrange:** The primary destination is unwritable in a disposable test environment.

**Action:** Attempt an export.

**Expected:** Last-good bytes remain usable; the new write is reported failed and freshness does not advance.

##### RC-02-T03: Write or close returns failure

**Arrange:** The production harness injects these failures independently.

**Action:** Export and inspect the returned result and retained artifacts.

**Expected:** No failed candidate is promoted and recovery material is retained according to policy.

##### RC-02-T04: Replacement is interrupted

**Arrange:** A valid staged file exists and replacement is forced to fail.

**Action:** Run the replacement path.

**Expected:** The old final file is not proactively removed; valid recovery data survives.

##### RC-02-T05: Copy fails with destination present

**Arrange:** The move fallback sees an old destination and a failed copy.

**Action:** Complete the fallback attempt.

**Expected:** The source is not deleted and the result is not treated as a successful move.

##### RC-02-T06: Mirror unavailable

**Arrange:** Primary succeeds while one mirror destination fails.

**Action:** Run several export intervals, then restore the mirror.

**Expected:** Primary success remains accurate; retry work is bounded and the mirror catches up without stale promotion.

##### RC-02-T07: Settings save fails

**Arrange:** A changed setting cannot be persisted.

**Action:** Save through the actual settings write path.

**Expected:** The caller receives failure and does not report durable success or silently overwrite the last-good settings file.

##### RC-02-T08: Recovery order

**Arrange:** Two attempted generations leave recovery material after a fault.

**Action:** Clear the fault and export a newer generation.

**Expected:** Only an eligible newest successful generation is published; stale recovery files cannot roll data backward.

##### RC-02-T09: Cleanup safety

**Arrange:** Owned stale staging files and unrelated sentinel files share a scratch parent.

**Action:** Run the documented cleanup path.

**Expected:** Only eligible owned files are removed; sentinels, final exports and needed recovery files survive.

#### Required deliverables

- Minimal mod persistence changes
- Failure and recovery test evidence
- Documented retry/retention policy
- Updated mod compatibility note if the output contract changes

**Exit gate:** All persistence failure cases pass against production helpers and a controlled in-game export/recovery run. No successful acknowledgment, generation advance or source deletion is based on an unconfirmed write.

**Failure/rollback rule:** Stop testing on any unexpected loss of last-good data. Restore the backed-up mod only with the game stopped and owner approval. Preserve failed outputs for diagnosis; do not erase evidence by repeatedly rebuilding or overwriting the same files.

### RC-03. Distinguish failed, empty and successful collectors

**Objective:** Make collector failure observable without fabricating empty success, and ensure slow or failing scheduled work does not starve unrelated requests.

**Priority:** Blocks release when failure can masquerade as fresh data or starve core requests  
**Owner:** Mod scheduler and collector implementer  
**Dependencies:** RC-01, RC-02  
**Wave:** Source closure  
**Initial status:** Planned, not executed  
**Indicative hands-on allowance:** 4-8 hours if this work is required

**Finding references:** R2-MOD-06; C4.

#### Candidate code/document touchpoints

- [FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua)
- [FS25_FarmDashboard_Mod/src/FarmDashboard.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboard.lua)
- [FS25_FarmDashboard_Mod/src/FarmDashboardSettingsApi.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardSettingsApi.lua)

#### Ordered execution steps

1. **RC-03-S01: Trace collector outcome conversion.** Find all places where missing, nil, thrown or invalid collector results become an empty object. Reproduce the historical case and list consumers that depend on the old convention before introducing a narrower contract.

2. **RC-03-S02: Define explicit outcomes.** Represent success-with-data, successful-empty, partial and failed outcomes distinctly. Use one envelope or internal discriminant with stable meaning. An empty herd after a sale is valid data; an unavailable animal collector is not evidence that the herd disappeared.

3. **RC-03-S03: Keep section-specific provenance.** Retain each section's last successful source identity and collected time. A successful weather or finance collection must not make an older animal section appear newly observed merely because they share an outer export file.

4. **RC-03-S04: Decide partial export behavior.** Choose a backward-compatible approach for carrying last-good sections with explicit stale/error metadata or omitting failed sections with a documented meaning. Do not silently convert a partial snapshot into an authoritative complete clear.

5. **RC-03-S05: Align dirty and completion markers.** Only clear dirty state or finish a queued data request after the required collection and persistence succeed. Define bounded retry/backoff for recurring failure so the system does not spin every frame or create unbounded logs.

6. **RC-03-S06: Decouple request servicing from full-cycle success.** Trace the freshness-gated scheduler tail described by C4. Confirm whether another path services detail requests. If starvation is reachable, service eligible requests under their own bounded budget rather than requiring all unrelated collectors to succeed.

7. **RC-03-S07: Preserve fairness across collectors.** Ensure one permanently failing or slow collector cannot permanently exclude later collectors. Track retry eligibility and progress separately; retain cancellation and context checks when the active save changes.

8. **RC-03-S08: Expose understandable degraded status.** Provide concise status identifying the affected data section and last successful observation. Avoid repeated modal alerts or raw stack traces. Recovery should update status automatically without making the user reload the entire dashboard.

9. **RC-03-S09: Test prolonged failure and restoration.** Run multiple scheduled cycles with one collector failing, then recovering. Include a successful empty result after recovery. Check that retries, request responses, section freshness and dirty markers each follow their own contract.

10. **RC-03-S10: Close the conditional finding honestly.** If the starvation path is unreachable in all supported modes, attach a call-path explanation and a regression that establishes the alternate service path. Do not label C4 fixed solely because an unrelated scheduler test passes.

#### Acceptance scenarios

All cases initially have status **not run**. For each applicable case, record exact candidate/environment identity, observed result and sanitized evidence using the evidence template. Expected behavior below is not a recorded pass.

##### RC-03-T01: Valid empty collector

**Arrange:** A previously populated section now has no entities.

**Action:** Collect successfully and persist the result.

**Expected:** The section clears intentionally and receives a new valid source identity.

##### RC-03-T02: Collector exception

**Arrange:** One collector throws while others succeed.

**Action:** Run several full cycles.

**Expected:** Its data is stale or unavailable, not fresh empty; unrelated sections continue to progress.

##### RC-03-T03: Missing optional collector

**Arrange:** An optional integration is not installed.

**Action:** Collect the applicable section.

**Expected:** Unsupported or unavailable status is explicit and does not generate false data or endless retry noise.

##### RC-03-T04: Persistence failure after collection

**Arrange:** Collection succeeds but primary export fails.

**Action:** Complete the cycle.

**Expected:** The request is not acknowledged as durably fulfilled and committed freshness does not advance.

##### RC-03-T05: Persistent failure with detail request

**Arrange:** One collector fails for many cycles and a supported detail request arrives.

**Action:** Continue scheduled work.

**Expected:** The detail request completes or returns a bounded explicit error; it does not wait forever on unrelated freshness.

##### RC-03-T06: Partial snapshot

**Arrange:** Only some sections are freshly collected.

**Action:** Read the exported snapshot in the app.

**Expected:** Each section retains honest freshness and missing sections are not interpreted as authoritative clears.

##### RC-03-T07: Recovery to empty

**Arrange:** A collector fails, then recovers with a valid empty result.

**Action:** Observe the next successful export.

**Expected:** The stale retained section is intentionally cleared and failure status resolves.

##### RC-03-T08: Retry fairness

**Arrange:** Several collectors include one permanently failing participant.

**Action:** Run a bounded multi-cycle harness.

**Expected:** Healthy collectors and request work receive service; retry and log volumes remain bounded.

#### Required deliverables

- Collector outcome contract
- Production-linked failure/fairness tests
- Section freshness evidence
- C4 confirmed, disproved-in-scope or explicitly unresolved disposition

**Exit gate:** Empty, partial and failed outcomes are distinct end to end; persistent collector failure cannot falsely refresh data or indefinitely starve supported requests.

**Failure/rollback rule:** Prefer the prior last-good section with an honest stale indicator to fabricated empty success. If a contract change breaks older readers, stop and add a compatibility adapter before packaging.

### RC-04. Close freshness, cache-clear and cross-context race conditions

**Objective:** Keep the selected save/server authoritative and prevent late, cached or partial data from overriding newer valid state.

**Priority:** Blocks release for wrong-save data, resurrected clears or false freshness  
**Owner:** Backend data owner and frontend store owner  
**Dependencies:** RC-00, RC-03  
**Wave:** Source closure  
**Initial status:** Planned, not executed  
**Indicative hands-on allowance:** 6-14 hours if this work is required

**Finding references:** R2-PIPE-01; R2-PIPE-02; R2-PIPE-03; R2-PIPE-04; R2-PIPE-08; R2-DATA-01; R2-DATA-02.

#### Candidate code/document touchpoints

- [FS25_FarmDashboard_App/liveExportFreshness.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/liveExportFreshness.js)
- [FS25_FarmDashboard_App/mergedSnapshotHold.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/mergedSnapshotHold.js)
- [FS25_FarmDashboard_App/serverDataCache.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/serverDataCache.js)
- [FS25_FarmDashboard_App/livestockDetail.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/livestockDetail.js)
- [FS25_FarmDashboard_App/detailAnimalsHydrate.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/detailAnimalsHydrate.js)
- [FS25_FarmDashboard_App/main.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js)
- [NEW APP/src/store/dashboard-store.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/store/dashboard-store.ts)
- [NEW APP/src/services/ws-client.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/services/ws-client.ts)
- [NEW APP/src/services/api-client.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/services/api-client.ts)
- [NEW APP/src/lib/use-hydrated-livestock.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/use-hydrated-livestock.ts)

#### Ordered execution steps

1. **RC-04-S01: Reproduce each ordering defect independently.** Create deterministic fixtures for source restart, failed fetch, successful clear, delayed bootstrap and delayed detail response. Keep the existing focused generation and zero-herd regressions; do not assume those already-fixed cases remain broken.

2. **RC-04-S02: Agree the context identity.** Define a context key covering edition/profile, configured server or local source, selected save and any relevant farm scope. Include entity namespace in detail keys. Decide which fields already exist and add only the minimum missing identifiers.

3. **RC-04-S03: Define source ordering across restart.** Specify how producer session/epoch and monotonic sequence or equivalent reliable revision distinguish a restart from an older response. Timestamps alone must not impose global ordering across unrelated contexts or unsynchronized clocks. Document legacy-source fallback limitations.

4. **RC-04-S04: Separate observed, fetched and displayed time.** Keep source-generated/collected time distinct from app fetch time and screen refresh time. A successful network fetch of unchanged old export bytes must not make old game data look current.

5. **RC-04-S05: Define authoritative clear semantics.** Use an explicit successful empty/clear outcome, not absence, as permission to remove existing entities. Ensure this outcome survives merges and persistent holds. Failed or partial collection must not erase valid retained data or resurrect an acknowledged clear.

6. **RC-04-S06: Scope every cache and pending request.** Apply context and producer identity to snapshots, XML fingerprints, detail hydration, persistent holds, dirty indexes and request caches. On source change invalidate the old scope and prevent in-flight work from writing into the new one.

7. **RC-04-S07: Make dirty-index revalidation explicit.** Ensure a newer index revision schedules the required detail refresh even when an in-memory value exists. Avoid retaining a stale detail result indefinitely because only top-level file metadata changed.

8. **RC-04-S08: Guard bootstrap, refresh and websocket application.** Introduce or complete a request generation/context check at every state-application point, not only the HTTP response handler. A late bootstrap or reconnect response must not roll back a newer snapshot or repopulate an old save.

9. **RC-04-S09: Handle cancellation and failure without blanking good data.** Cancel or ignore outdated work, bound pending requests and expose stale state. Preserve a useful last-good view for the current context while rejecting data from the wrong context.

10. **RC-04-S10: Maintain old-mod compatibility deliberately.** Document how the app handles exports without newer provenance fields. Preserve supported older versions if practical; otherwise use a clear compatibility message and an explicit supported-version decision rather than silent misinterpretation.

11. **RC-04-S11: Prove convergence after disruptions.** Run repeated switch, clear, restart and reconnect sequences and compare final visible state to the latest authoritative source. Close findings individually with both backend and real frontend application evidence.

#### Acceptance scenarios

All cases initially have status **not run**. For each applicable case, record exact candidate/environment identity, observed result and sanitized evidence using the evidence template. Expected behavior below is not a recorded pass.

##### RC-04-T01: Old file fetched now

**Arrange:** An export has an old source timestamp but is fetched successfully now.

**Action:** Apply it through the backend and UI.

**Expected:** Fetch success does not relabel the source data as freshly collected.

##### RC-04-T02: Authoritative clear beats retained data

**Arrange:** A populated generation is followed by a successful empty generation.

**Action:** Merge, persist and reload the app state.

**Expected:** The clear remains effective after reload; a hold or detail cache cannot resurrect removed entities.

##### RC-04-T03: Failure is not a clear

**Arrange:** The latest collector attempt fails after a valid populated snapshot.

**Action:** Refresh the dashboard.

**Expected:** The last-good current-context data is retained as stale or unavailable, not silently emptied.

##### RC-04-T04: Producer restart

**Arrange:** A source restarts and its local sequence resets under a new session identity.

**Action:** Apply old-session and new-session responses out of order.

**Expected:** Eligible new-session data is accepted and late old-session data cannot supersede it.

##### RC-04-T05: Late bootstrap

**Arrange:** A slow initial request returns after a newer websocket snapshot.

**Action:** Resolve the old request.

**Expected:** The newer current-context state remains visible.

##### RC-04-T06: Save switch with pending detail

**Arrange:** Save A detail is delayed; the user switches to Save B.

**Action:** Resolve A after B loads.

**Expected:** No A entity, error, count or selected detail leaks into B.

##### RC-04-T07: Server switch with reused numeric IDs

**Arrange:** Two servers use identical field or animal numeric IDs.

**Action:** Switch servers while hydration is pending.

**Expected:** Cache and selection identity remain server-scoped; values are not reused across contexts.

##### RC-04-T08: Index revision invalidates detail

**Arrange:** A detail index changes while cached detail exists.

**Action:** Refresh and request the affected section.

**Expected:** The changed entity is revalidated once through bounded work rather than remaining permanently stale.

##### RC-04-T09: Reconnect after an acknowledged clear

**Arrange:** The app disconnects after applying an empty generation; an old response is queued.

**Action:** Reconnect and deliver responses out of order.

**Expected:** The old populated snapshot is rejected and the legitimate clear survives.

##### RC-04-T10: Legacy provenance absent

**Arrange:** A supported older export omits the new ordering metadata.

**Action:** Read it and perform a refresh/restart sequence.

**Expected:** The documented fallback is safe and explicit; unsupported certainty is not fabricated.

#### Required deliverables

- Context/provenance/clear contract
- Backend and real frontend ordering regressions
- Legacy compatibility decision
- Per-finding closure records for the pipeline and data findings

**Exit gate:** Current-context state converges to the latest authoritative source through clear, restart and out-of-order sequences. No tested path replaces source freshness with fetch time or allows old-context responses to apply.

**Failure/rollback rule:** Revert only the owned contract change if interoperability fails, retaining existing focused fixes. If the legacy schema cannot safely express a required distinction, block that path or require an explicit compatible version rather than guessing.

### RC-05. Make livestock totals, samples, zero and unknown values truthful

**Objective:** Show measured values honestly and consistently without turning missing information into ideal health or recalculating sample averages against an estimated population.

**Priority:** Blocks release for materially misleading animal data  
**Owner:** Mod animal collector and livestock UI owners  
**Dependencies:** RC-03, RC-04  
**Wave:** Source closure  
**Initial status:** Planned, not executed  
**Indicative hands-on allowance:** 3-6 hours if this work is required

**Finding references:** R2-MOD-02.

#### Candidate code/document touchpoints

- [FS25_FarmDashboard_Mod/src/collectors/AnimalDataCollector.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/AnimalDataCollector.lua)
- [FS25_FarmDashboard_App/livestockDetail.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/livestockDetail.js)
- [FS25_FarmDashboard_App/detailAnimalsHydrate.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/detailAnimalsHydrate.js)
- [NEW APP/src/lib/livestock-normalize.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/livestock-normalize.ts)
- [NEW APP/src/lib/livestock-format.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/livestock-format.ts)
- [NEW APP/src/lib/livestock-types.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/livestock-types.ts)
- [NEW APP/src/lib/pastures-parsers.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/pastures-parsers.ts)
- [NEW APP/src/lib/pastures-warnings.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/pastures-warnings.ts)
- [NEW APP/src/sections/pastures/PasturesSection.tsx](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/sections/pastures/PasturesSection.tsx)
- [NEW APP/src/sections/livestock/LivestockPenPanel.tsx](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/sections/livestock/LivestockPenPanel.tsx)
- [NEW APP/src/sections/livestock/AnimalDetailsModal.tsx](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/sections/livestock/AnimalDetailsModal.tsx)
- [NEW APP/src/sections/overview/OverviewSection.tsx](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/sections/overview/OverviewSection.tsx)

#### Ordered execution steps

1. **RC-05-S01: Document each animal field's meaning.** Identify whether head count, health, productivity, age and related values are measured, estimated, sampled or unavailable. Record units and valid ranges from supported local game evidence rather than inventing default semantics.

2. **RC-05-S02: Reproduce sample reconciliation.** Use a herd with a known sample count, known sum and a larger total population. Trace the current mod aggregation and app normalization. Confirm whether changing estimated bucket counts alters an already measured mean.

3. **RC-05-S03: Separate sample statistics from population estimates.** Retain measured sum/count or measured mean alongside sample size and estimated total count as needed. Reconcile estimated distribution counts without changing measured averages simply to make counts add up.

4. **RC-05-S04: Preserve meaningful zero.** Replace truthiness fallbacks only where the domain permits a real zero. Keep zero head count and zero health distinct from missing or invalid data. Extend existing focused zero regressions rather than introducing a parallel normalization model.

5. **RC-05-S05: Represent unknown explicitly.** Find remaining fallbacks that show missing health as 100 or otherwise imply ideal conditions. Render an understandable unknown state and exclude unknown values from aggregates according to a documented rule.

6. **RC-05-S06: Align overview, pasture and detail views.** Have the same normalized value and provenance drive summary cards, pen rows, detail modals and warnings. Counts from one generation must not be paired with retained detail from another without a visible stale distinction.

7. **RC-05-S07: Clarify estimates without clutter.** Add concise sampled/estimated/unknown labels where needed, with accessible explanatory text. Do not introduce a broad UI redesign or make ordinary accurate data harder to read.

8. **RC-05-S08: Test transitions rather than only static rows.** Cover sold-last-animal, refill, failed refresh, partial detail and switching between pens with reused IDs. Verify selections and warnings update correctly and do not retain the previous pen's values.

9. **RC-05-S09: Capture a live parity sample.** On an approved copied save, compare a small set of identifiable pens and values between game and app at a matched export generation. Record collection time and scope so normal game changes are not mistaken for defects.

#### Acceptance scenarios

All cases initially have status **not run**. For each applicable case, record exact candidate/environment identity, observed result and sanitized evidence using the evidence template. Expected behavior below is not a recorded pass.

##### RC-05-T01: Sample mean survives count reconciliation

**Arrange:** Ten measured animals have a known mean and the estimated herd size is larger.

**Action:** Reconcile bucket counts and render all views.

**Expected:** The measured mean is unchanged; sample size and estimated total retain separate meanings.

##### RC-05-T02: Measured zero health

**Arrange:** A valid animal record contains numeric zero health.

**Action:** Normalize and render summary and detail.

**Expected:** Zero remains zero and is not converted to unknown or 100.

##### RC-05-T03: Unknown health

**Arrange:** A record has no measured health field.

**Action:** Render and aggregate it with measured records.

**Expected:** Unknown is visibly unknown and does not inflate the aggregate as an assumed 100.

##### RC-05-T04: Empty herd after sale

**Arrange:** The latest successful generation has zero head count and older details exist.

**Action:** Refresh every livestock view.

**Expected:** The herd is empty consistently; retained detail does not reintroduce animals.

##### RC-05-T05: Mixed sampled and unknown data

**Arrange:** Some buckets have measured values and others do not.

**Action:** Compute aggregate displays.

**Expected:** The documented denominator and estimate label are used; missing values do not silently become measurements.

##### RC-05-T06: Pen switch during hydration

**Arrange:** Two pens are selected in quick succession with delayed responses.

**Action:** Complete the old response after the new one.

**Expected:** The selected pen retains its own counts, values and warnings.

##### RC-05-T07: Warning consistency

**Arrange:** A fixture crosses a documented warning threshold and includes valid zero values.

**Action:** Open overview, pasture and animal detail.

**Expected:** Warnings agree for the same source data and unknown values do not trigger invented certainty.

##### RC-05-T08: Live parity

**Arrange:** A copied save exposes a small set of identifiable pens.

**Action:** Capture matching game and app observations.

**Expected:** Differences are explained by known sampling/collection scope or logged as reproducible defects, not dismissed without evidence.

#### Required deliverables

- Animal value semantics note
- Sampling and zero/unknown regressions
- Cross-view screenshots for matched fixtures
- Representative live parity record

**Exit gate:** Known zero, unknown, measured mean and estimated population remain distinct through all animal views, with matched-generation evidence for representative live pens.

**Failure/rollback rule:** Retain existing correct zero handling. If a new aggregation cannot preserve meaning, show a qualified or unknown value rather than a falsely precise number.

### RC-06. Correct entity identity, ownership, valuations and market offers

**Objective:** Ensure dashboard recommendations and totals come from identifiable authoritative records rather than name guesses, namespace collisions or purchase-price fallbacks.

**Priority:** Blocks release where users are directed by materially wrong ownership or financial data  
**Owner:** Mod economy/vehicle owner and backend merger owner  
**Dependencies:** RC-00, RC-04  
**Wave:** Source closure  
**Initial status:** Planned, not executed  
**Indicative hands-on allowance:** 4-10 hours if this work is required

**Finding references:** R2-PIPE-05; R2-PIPE-06; R2-PIPE-07; R2-MOD-03; R2-MOD-07.

#### Candidate code/document touchpoints

- [FS25_FarmDashboard_App/xmlCollector.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/xmlCollector.js)
- [FS25_FarmDashboard_App/dataMerger.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/dataMerger.js)
- [FS25_FarmDashboard_Mod/src/FarmDashboardCourseplayCompat.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardCourseplayCompat.lua)
- [FS25_FarmDashboard_Mod/src/collectors/VehicleDataCollector.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/VehicleDataCollector.lua)
- [FS25_FarmDashboard_Mod/src/collectors/FinanceDataCollector.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/FinanceDataCollector.lua)
- [FS25_FarmDashboard_Mod/src/collectors/EconomyDataCollector.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/EconomyDataCollector.lua)
- [NEW APP/src/lib/vehicles.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/vehicles.ts)
- [NEW APP/src/sections/overview/OverviewSection.tsx](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/sections/overview/OverviewSection.tsx)

#### Ordered execution steps

1. **RC-06-S01: Write the ownership precedence rule.** Identify the authoritative ownership source for each supported record type and mode. Explain how a known owner, explicit unowned state and unknown owner differ. Avoid using display names or incidental XML ordering as authority.

2. **RC-06-S02: Namespace identities.** Distinguish field IDs from farmland IDs and other entity kinds even when numeric values match. Keep farm, save and server scope where required. Decide joins from verified relationships, not equal numbers alone.

3. **RC-06-S03: Reproduce duplicate XML matching.** Use files with duplicate names, reordered elements and multiple farms. Demonstrate whether the current matching code selects the wrong record. Preserve existing correct XML metadata fingerprint behavior.

4. **RC-06-S04: Make merge conflicts deterministic and visible.** Define how newer authoritative values, older fallback values and missing information are combined. A weak heuristic must not overwrite stronger ownership or silently assign another farm's asset.

5. **RC-06-S05: Trace valuation to its canonical field.** Reproduce the Courseplay/incremental finance path with distinct purchase and resale values. Verify the actual export schema, including the historical ads.sellValue reference, before coding; use the canonical resale value where the displayed measure is resale.

6. **RC-06-S06: Handle unavailable and zero valuations.** Keep a genuine zero valuation separate from an unknown valuation. Do not quietly substitute purchase price into a resale total. Label incomplete totals or exclude unavailable values with a clear explanation.

7. **RC-06-S07: Remove fabricated market offers.** Reproduce the station-name heuristic. Build available product/price recommendations only from verified station capabilities and current supported price records. A familiar name is not evidence that a station accepts a product.

8. **RC-06-S08: Define legitimate market fallback.** If a price or product cannot be resolved, show unavailable/unknown and keep it out of best-price rankings. If estimated prices are intentionally supported, label them and do not mix them invisibly with verified offers.

9. **RC-06-S09: Prove UI consistency and source parity.** Check cards, vehicle detail, ownership filters and best-price lists against the same fixture. For live parity, compare stable IDs and contemporaneous values, not just similar names or totals collected at different times.

10. **RC-06-S10: Close each historical finding separately.** Attach reproduction and final evidence to all ownership, identity, valuation and market findings. A corrected vehicle path does not automatically close duplicate XML or fabricated selling-station issues.

#### Acceptance scenarios

All cases initially have status **not run**. For each applicable case, record exact candidate/environment identity, observed result and sanitized evidence using the evidence template. Expected behavior below is not a recorded pass.

##### RC-06-T01: Field/farmland numeric collision

**Arrange:** A field and a different farmland share the same numeric identifier.

**Action:** Merge and display their ownership.

**Expected:** They remain distinct and ownership follows the verified relationship, not numeric coincidence.

##### RC-06-T02: Duplicate display names

**Arrange:** Two farms own similarly named assets and XML contains duplicate names.

**Action:** Collect with reordered XML elements.

**Expected:** Stable scoped identity produces the same correct result regardless of order.

##### RC-06-T03: Unknown ownership

**Arrange:** A record has no authoritative owner.

**Action:** Merge it with weak fallback metadata.

**Expected:** It remains unknown unless the documented stronger evidence resolves it; no farm is guessed.

##### RC-06-T04: Resale differs from purchase

**Arrange:** An asset has a high purchase price and lower known resale value.

**Action:** Run normal and Courseplay/incremental collection.

**Expected:** Both resale displays and totals use the canonical resale value.

##### RC-06-T05: Zero versus missing valuation

**Arrange:** One asset has resale zero and another has no resale measurement.

**Action:** Render and total both.

**Expected:** Zero is preserved and missing value is qualified rather than replaced by purchase price.

##### RC-06-T06: Misleading station name

**Arrange:** A station name suggests a product it does not actually accept.

**Action:** Build best-price recommendations.

**Expected:** No invented offer is added from the name alone.

##### RC-06-T07: No verified market price

**Arrange:** A supported product has no valid price for a station.

**Action:** Render the station and ranking.

**Expected:** The price is unavailable or explicitly estimated and cannot win a verified-price ranking.

##### RC-06-T08: Stable live comparison

**Arrange:** A copied save has identifiable owned assets and stations.

**Action:** Capture game and app observations for the same export scope.

**Expected:** Ownership and recommendations are traceable to authoritative records; unexplained mismatches remain open.

#### Required deliverables

- Entity identity and ownership precedence note
- Financial and market provenance fixtures
- Production merger/collector regressions
- Matched-source UI evidence

**Exit gate:** Identity and ownership joins are deterministic and scoped; resale values and recommendations use verified data or clearly marked unknowns. Each mapped finding has its own evidence-based disposition.

**Failure/rollback rule:** When authoritative data is absent, prefer unknown to guessed ownership or fabricated prices. Revert only the affected owned merge/collector change if compatibility breaks; preserve truthful qualification.

### RC-07. Finish authentication, startup and settings recovery without losing user state

**Objective:** Make normal startup and recoverable failures understandable while preserving configuration, trust boundaries and keyboard usability.

**Priority:** Blocks release for unauthorized access, unusable supported startup or settings loss  
**Owner:** Frontend platform owner and backend configuration owner  
**Dependencies:** RC-00, RC-04  
**Wave:** Source closure  
**Initial status:** Planned, not executed  
**Indicative hands-on allowance:** 6-12 hours if this work is required

**Finding references:** R2-UX-01; R2-UX-02; R2-UX-03; R2-UX-04; R2-UX-05; R2-UI-01; R2-BACK-01; CUA04.

#### Candidate code/document touchpoints

- [NEW APP/src/services/lan-auth.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/services/lan-auth.ts)
- [NEW APP/src/services/api-client.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/services/api-client.ts)
- [NEW APP/src/platform/LanAuthOverlay.tsx](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/platform/LanAuthOverlay.tsx)
- [NEW APP/src/simhub/main.tsx](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/simhub/main.tsx)
- [NEW APP/src/main.tsx](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/main.tsx)
- [NEW APP/src/setup/main.tsx](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/setup/main.tsx)
- [NEW APP/src/settings/SettingsModal.tsx](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/settings/SettingsModal.tsx)
- [NEW APP/src/lib/use-focus-trap.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/use-focus-trap.ts)
- [NEW APP/src/lib/ux-classify.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/ux-classify.ts)
- [FS25_FarmDashboard_App/web/assests/js/ux-classify.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/web/assests/js/ux-classify.js)
- [FS25_FarmDashboard_App/main.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js)
- [FS25_FarmDashboard_App/setupConfigMerge.cjs](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/setupConfigMerge.cjs)

#### Ordered execution steps

1. **RC-07-S01: Retain the focused fixes as controls.** Keep the real Preact focus regression, selected generation tests and NEW APP Windows error classifier behavior. Reproduce remaining auth/settings findings directly before editing. Check Classic parity separately where its implementation differs.

2. **RC-07-S02: Make authentication state persistent and explicit.** Model idle, prompting, authenticating, authenticated, denied, timed-out and recoverable-error states as appropriate to the existing design. Ensure timeout and denial cannot resolve as successful authorization.

3. **RC-07-S03: Mount recovery UI before waiting on it.** Trace normal browser, LAN and SimHub startup. Ensure an authentication overlay or equivalent actionable shell can appear before any code awaits authentication. Avoid a circular dependency that leaves a blank page waiting for an invisible prompt.

4. **RC-07-S04: Bound waiting and provide a real retry.** Use bounded waits, cleanup of abandoned listeners and a retry that starts a new attempt. Preserve the intended destination and do not create duplicate sockets or requests on every retry.

5. **RC-07-S05: Separate transport, filesystem and auth errors.** Keep missing-path errors distinct from unauthorized responses. Use actionable messages that identify the failed operation without exposing secrets or raw stack traces. Extend consistent classification to the shipping Classic path if applicable.

6. **RC-07-S06: Protect partially loaded settings.** Track which settings domains loaded successfully and which fields the user actually changed. A failed load must not populate defaults that later overwrite real persisted values. Block or scope saving when required current values are unknown.

7. **RC-07-S07: Preserve context and draft intent.** Returning from setup, reopening settings, saving unchanged settings and restarting must retain the selected save/server. Keep unsaved user edits through a recoverable save failure with clear retry or cancel behavior.

8. **RC-07-S08: Retest configuration security boundaries.** Retain transport flags across Classic-to-RF import while stripping or deliberately re-authorizing secrets according to policy. A transport-only setting change must reboot affected clients and reject old-generation work.

9. **RC-07-S09: Exercise keyboard and small-window recovery.** Use the real shipped dialogs for Tab, Shift+Tab, Escape, initial focus and return focus. Check clipped error text and inaccessible retry controls at a narrow window and increased text scaling without redesigning the interface.

10. **RC-07-S10: Triage image-export early returns.** Reproduce R2-BACK-01 suppressNative early branches in the actual shipping context. Fix if it breaks an advertised core export path or produces unsafe behavior; otherwise document severity and a specific backlog decision rather than expanding scope automatically.

11. **RC-07-S11: Capture real startup evidence.** Record normal startup, auth failure/retry, settings partial failure and selected-save persistence in the installed build during RC-10/RC-11. Unit tests alone cannot close a bootstrap timing or overlay visibility issue.

#### Acceptance scenarios

All cases initially have status **not run**. For each applicable case, record exact candidate/environment identity, observed result and sanitized evidence using the evidence template. Expected behavior below is not a recorded pass.

##### RC-07-T01: Auth timeout is not success

**Arrange:** The auth endpoint never completes.

**Action:** Open the supported LAN or SimHub entry path and wait through the configured deadline.

**Expected:** An actionable timeout appears; protected content is not treated as authorized.

##### RC-07-T02: Auth denied then corrected

**Arrange:** The first credential or token attempt is rejected.

**Action:** Retry with an authorized test credential.

**Expected:** The user reaches the intended view once; listeners and connection attempts are not duplicated.

##### RC-07-T03: Overlay available before auth

**Arrange:** Startup code would otherwise await an auth gate.

**Action:** Launch the supported SimHub/LAN shell.

**Expected:** The prompt or recovery shell is visible and usable before the gate completes.

##### RC-07-T04: Partial settings load

**Arrange:** One settings domain fails while another loads successfully.

**Action:** Edit a loaded field and attempt to save.

**Expected:** Unloaded persisted values are not overwritten by defaults; the save is safely scoped or clearly blocked.

##### RC-07-T05: Settings write failure

**Arrange:** A valid user draft cannot be persisted.

**Action:** Save, then retry after the fault clears.

**Expected:** The draft survives, false success is not shown, and one successful retry persists the intended values.

##### RC-07-T06: Selected save survives setup return

**Arrange:** A non-default save is selected.

**Action:** Open setup, return, save unchanged settings and restart.

**Expected:** The same intended save/server remains selected without silently switching to Save 1.

##### RC-07-T07: Transport-only change

**Arrange:** Only a supported transport flag changes.

**Action:** Save and observe active clients and queued work.

**Expected:** Affected clients restart safely and old-generation responses cannot apply.

##### RC-07-T08: Import security flags and secrets

**Arrange:** A Classic test profile contains explicit transport flags and test secrets.

**Action:** Import into a disposable RF profile.

**Expected:** Flags follow policy; secrets are stripped or explicitly re-authorized and are not leaked into diagnostics.

##### RC-07-T09: Focus remains usable

**Arrange:** A dialog with asynchronous updates is open.

**Action:** Type, cycle focus, close and reopen at narrow size and higher text scaling.

**Expected:** Focus is stable, contained appropriately and restored; retry and cancel remain reachable.

##### RC-07-T10: Missing path classification and image export

**Arrange:** A missing Windows path and image-export early-return fixtures are available.

**Action:** Exercise the relevant shipping edition paths.

**Expected:** Filesystem errors are not called authentication failures; export behavior matches its documented contract.

#### Required deliverables

- Auth/bootstrap state contract
- Partial-settings safety regressions
- Classic/NEW classification parity disposition
- Installed recovery and accessibility evidence
- R2-BACK-01 severity and closure/backlog decision

**Exit gate:** Supported startup paths cannot deadlock on invisible authentication; denied/timeout states do not grant access; failed loads/saves preserve settings; selected context and keyboard recovery are proven in an installed candidate.

**Failure/rollback rule:** Do not weaken authentication, Origin checks or IPC trust rules to make startup pass. Preserve backed-up profiles and user drafts; reject an unsafe save rather than overwriting unknown values.

### RC-08. Measure and bound expensive work without removing functionality

**Objective:** Close reachable scheduler and scan inefficiencies with measured evidence, while leaving speculative optimisation out of the release path.

**Priority:** Blocks release only for demonstrated unacceptable stalls, leaks or ignored user settings  
**Owner:** Performance owner with mod and frontend implementers  
**Dependencies:** RC-00, RC-03, RC-04  
**Wave:** Source closure  
**Initial status:** Planned, not executed  
**Indicative hands-on allowance:** 4-8 hours if this work is required

**Finding references:** R2-MOD-04; R2-MOD-05; R2-MOD-08; C3.

#### Candidate code/document touchpoints

- [FS25_FarmDashboard_Mod/src/FarmDashboardCourseplayCompat.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardCourseplayCompat.lua)
- [FS25_FarmDashboard_Mod/src/FarmDashboardSettingsApi.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardSettingsApi.lua)
- [FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua)
- [FS25_FarmDashboard_Mod/src/InventoryScan.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/InventoryScan.lua)
- [FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua)
- [NEW APP/src/lib/livestock-fanout.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/livestock-fanout.ts)
- [NEW APP/src/lib/use-hydrated-livestock.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/use-hydrated-livestock.ts)

#### Ordered execution steps

1. **RC-08-S01: Agree a reproducible measurement fixture.** Record hardware, game version, save copy, enabled mods, active edition, export cadence and scenario. Use the same inputs for before/after comparisons. Separate startup warm-up, steady play and intentional network failure.

2. **RC-08-S02: Add bounded instrumentation where necessary.** Measure collector duration, objects examined, exports attempted/committed, detail concurrency, queue length, retry rate, log growth and process memory. Prefer low-overhead counters over per-object hot-path logging.

3. **RC-08-S03: Reproduce the fleet traversal concern.** Trace Courseplay compatibility collection and count full-fleet visits per update. If two traversals are real, reuse a scoped snapshot or combine work without dropping integration behavior, owner identity or vehicle updates.

4. **RC-08-S04: Make configured cadence authoritative.** Confirm the settings setter updates the requested cadence used by adaptive scheduling. Define requested versus effective cadence and show throttling honestly if adaptive protection is necessary; do not silently replace the user's choice.

5. **RC-08-S05: Budget examined objects, not accepted rows.** For inventory and bale scanning, increment work budgets for every examined entry, including duplicates, rejected or unsupported objects. Preserve an incremental cursor and eventual completion so bounded work does not become permanently missing data.

6. **RC-08-S06: Preserve fan-out limits and cancellation.** Retain the existing four-worker hydration bound unless a measured reason justifies change. Check total concurrency across retries and context changes, not only the happy-path helper in isolation.

7. **RC-08-S07: Establish conditional fallback reachability.** Trace C3 legacy/fallback field collection in each supported mode. If reachable, measure and bound it. If unreachable, document the guard and test it rather than spending release time optimising dead code.

8. **RC-08-S08: Compare equivalent before and after runs.** Run the same scenario with the candidate and the comparison build or instrumentation baseline. Capture medians, high-percentile stalls and worst observed incidents. Do not turn a noisy single FPS sample into proof.

9. **RC-08-S09: Apply the provisional budgets deliberately.** Use the plan's proposed thresholds as an initial decision framework, not discovered product requirements. Graham and the test owner should approve or replace them before measurement. Any failed budget needs a causal trace and user impact statement.

10. **RC-08-S10: Separate blockers from backlog.** Block for crashes, persistent starvation, unbounded resource growth or repeatable severe stalls caused by this application/mod. Defer low-impact micro-optimisations with evidence, keeping all supported functionality intact.

#### Acceptance scenarios

All cases initially have status **not run**. For each applicable case, record exact candidate/environment identity, observed result and sanitized evidence using the evidence template. Expected behavior below is not a recorded pass.

##### RC-08-T01: Duplicate-heavy inventory

**Arrange:** A large fixture contains many duplicate or rejected entries.

**Action:** Advance one scan slice and then complete the scan.

**Expected:** Per-slice examined work stays within the configured budget and valid inventory eventually completes.

##### RC-08-T02: Large fleet integration

**Arrange:** A representative large fleet has Courseplay integration enabled.

**Action:** Measure traversal count and resulting data.

**Expected:** Duplicate full traversal is removed where confirmed without missing or stale vehicle records.

##### RC-08-T03: User cadence change

**Arrange:** The export cadence changes during a running session.

**Action:** Observe scheduling through several adaptive cycles.

**Expected:** The requested cadence persists; any temporary effective throttling is documented and recovers.

##### RC-08-T04: Hydration across context switches

**Arrange:** Many detail requests are queued while the user changes saves.

**Action:** Measure active requests and settle all responses.

**Expected:** Global effective concurrency remains bounded and canceled-context work cannot apply.

##### RC-08-T05: Reachable fallback field path

**Arrange:** A supported fixture triggers the fallback collector, if one exists.

**Action:** Measure and exercise the fallback.

**Expected:** It is bounded or has evidence of acceptable impact; an unreachable path is closed only with a guard test.

##### RC-08-T06: Repeated failure logging

**Arrange:** A collector or transport fails throughout a bounded run.

**Action:** Measure retries, queue growth and log size.

**Expected:** Retries and logs are bounded and healthy work continues.

##### RC-08-T07: Matched performance comparison

**Arrange:** Identical fixtures and measurement conditions exist for baseline and proposed change.

**Action:** Run the agreed comparison protocol.

**Expected:** Reported improvement or regression is supported by comparable measurements and retained raw evidence.

##### RC-08-T08: Steady-state resource trend

**Arrange:** The candidate runs after warm-up through repeated refresh cycles.

**Action:** Track memory, queues, handles and responsiveness.

**Expected:** No unexplained monotonic growth or accumulating abandoned work remains.

#### Required deliverables

- Measurement protocol and raw results
- Cadence and scan-budget regressions
- C3 reachability disposition
- Blocker/backlog performance decisions

**Exit gate:** All confirmed reachable hot paths have bounded work and preserve functionality. Release-impacting performance claims have reproducible measurements; unmeasured theories are not treated as blockers or fixes.

**Failure/rollback rule:** Keep instrumentation reversible and remove excessive hot-path logging from release builds. Revert only a measured-regressing owned optimisation; never disable user-facing functionality merely to improve a benchmark.

### RC-09. Run source gates and produce a new private candidate when required

**Objective:** Package the settled source safely and make every later installed/live result traceable to exact immutable bytes.

**Priority:** Mandatory candidate integrity gate  
**Owner:** Build owner; release coordinator records provenance  
**Dependencies:** RC-02, RC-03, RC-04, RC-05, RC-06, RC-07, RC-08  
**Wave:** Private packaging  
**Initial status:** Planned, not executed  
**Indicative hands-on allowance:** 3-6 hours if this work is required

**Finding references:** Previously completed source/package gates: regression retention.

#### Candidate code/document touchpoints

- [FS25_FarmDashboard_App/package.json](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/package.json)
- [FS25_FarmDashboard_App/electron-builder.rf.yml](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/electron-builder.rf.yml)
- [tools/app/run-electron-builder.mjs](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/tools/app/run-electron-builder.mjs)
- [tools/app/copy-ui-v2.mjs](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/tools/app/copy-ui-v2.mjs)
- [tools/app/assert-rf-update-channel.mjs](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/tools/app/assert-rf-update-channel.mjs)
- [tools/app/verify-electron-pack-files.mjs](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/tools/app/verify-electron-pack-files.mjs)
- [tools/Zip-FarmDashboardMod.ps1](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/tools/Zip-FarmDashboardMod.ps1)
- [tools/check-lua-syntax.mjs](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/tools/check-lua-syntax.mjs)
- [FS25_FarmDashboard_App/tests/releaseSafety.regression.test.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/tests/releaseSafety.regression.test.js)
- [FS25_FarmDashboard_App/tests/releaseUi.regression.test.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/tests/releaseUi.regression.test.js)

#### Ordered execution steps

1. **RC-09-S01: Decide whether existing artifacts remain eligible.** If source, dependency locks, generated UI, mod contents or packaging inputs changed, the existing candidate is not the new release candidate. Allocate a new private build ID. If nothing changed, retain existing byte identity and record why reuse is valid.

2. **RC-09-S02: Close source-package findings before rebuilding.** Require a disposition and passing focused tests for every changed blocker. Do not rebuild repeatedly while data contracts are still changing. Retain completed security, transport, file-commit and focus regressions as controls.

3. **RC-09-S03: Run the complete agreed automated gates.** Execute the documented Jest, Node ESM, TypeScript, Lua parser, packaging-input, translation and dependency-audit commands. Record exit codes, totals, real skipped tests and full sanitized logs. Investigate new failures rather than weakening assertions.

4. **RC-09-S04: Handle dependency changes narrowly.** The baseline audits reported zero vulnerabilities. Do not perform a broad dependency upgrade as routine closure work. If a current audit reports an issue, assess reachability and remediation using primary evidence, update narrowly and rerun affected tests.

5. **RC-09-S05: Make the artifact verifier reproducible.** Record tool versions and private dependencies, including the prior adm-zip requirement, Windows path handling, PSModulePath and candidate environment variable. Use a new output run because the existing verifier creates its manifest exclusively; never delete an old manifest to make a rerun succeed.

6. **RC-09-S06: Rebuild the production UI into the package.** Build NEW APP with its established production build and run the copy-ui-v2 tool. Before its recursive generated-output cleanup, resolve and check the exact target stays inside the intended workspace and is not a reparse-point escape.

7. **RC-09-S07: Build both installers with publishing disabled.** Use the direct electron-builder invocation pattern in this plan with a new explicit private output directory. The normal wrapper does not forward --publish=never and defaults toward Final Output, so do not use it blindly for this release run.

8. **RC-09-S08: Package mod ZIPs in isolated staging.** Stage source and intentional edition/version stamping privately. Supply an explicit private ZIP destination. Do not invoke default mod packaging in a way that overwrites source-tree ZIPs, public Final Output, or the mod currently loaded by the game.

9. **RC-09-S09: Verify the actual package contents.** Compare changed main-process modules and all rebuilt UI assets to source outputs, verify both ZIP allowlists and version stamps, and parse every shipped Lua file. Derive expected inventories from the agreed source set; do not assume the old count of 42 forever.

10. **RC-09-S10: Verify feeds and public protection.** Check installer filenames, versions, sizes and SHA-512 feed entries; enforce the RF channel guard. Compare all protected public hashes. Produce a new manifest with SHA-256 identities and retain the previous candidate untouched.

11. **RC-09-S11: Record unsigned status without reopening signing.** Capture the actual signature status truthfully. NotSigned by itself is not a blocker under the owner's deferred-signing decision. Unexpected hash mismatches, altered bytes or unexplained security detections still require investigation.

12. **RC-09-S12: Seal the candidate for acceptance.** Mark it private QA only until RC-10 through RC-13 close. Installed and live tests must identify these exact installer and ZIP hashes. Any subsequent source or package change creates a new identity and invalidates affected acceptance evidence.

#### Acceptance scenarios

All cases initially have status **not run**. For each applicable case, record exact candidate/environment identity, observed result and sanitized evidence using the evidence template. Expected behavior below is not a recorded pass.

##### RC-09-T01: Full automated regression

**Arrange:** Settled source and required test dependencies are available.

**Action:** Run all agreed commands and capture results.

**Expected:** No mandatory test/type/parser/translation gate fails; skips are named and not counted as passes.

##### RC-09-T02: Production-linked security cases

**Arrange:** The existing origin, IPC, path and file-commit regression tests are retained.

**Action:** Run them against the production-linked modules.

**Expected:** Opaque/malformed browser origins and unauthorized IPC/path inputs remain rejected without breaking intended clients.

##### RC-09-T03: Build destination isolation

**Arrange:** A unique private output path is selected.

**Action:** Inspect the intended command arguments before the future build.

**Expected:** Publishing is disabled explicitly and neither edition writes into protected public output.

##### RC-09-T04: UI byte identity

**Arrange:** The production UI has just been rebuilt and copied.

**Action:** Compare packaged UI files with the build output.

**Expected:** Every intended rebuilt UI file matches the package and stale UI copies are not shipped.

##### RC-09-T05: Changed backend module identity

**Arrange:** The touched production-module list is known.

**Action:** Compare each changed module and required manifest input to the ASAR.

**Expected:** Every release-affecting changed module is covered; the old ten-module sample is not silently treated as exhaustive.

##### RC-09-T06: Mod ZIP identity and syntax

**Arrange:** Both private mod ZIPs have been staged with intended versions.

**Action:** Check allowlists, references, source identity and shipped Lua syntax.

**Expected:** Both editions contain the intended files and only documented version-stamp differences.

##### RC-09-T07: Feed and channel consistency

**Arrange:** Installers and private feed metadata are produced.

**Action:** Compare version, name, size and hashes and run the RF guard.

**Expected:** Each feed describes its own exact installer and cannot send RF users to the Classic channel.

##### RC-09-T08: Public files unchanged

**Arrange:** The pre-build protected inventory is available.

**Action:** Compare post-build identities.

**Expected:** Every protected public file remains unchanged, including the Classic 4.2.1 release surface.

##### RC-09-T09: Verifier rerun isolation

**Arrange:** A completed prior manifest already exists.

**Action:** Run a new verifier invocation using a new output record.

**Expected:** The old manifest is not overwritten or deleted; new evidence is reproducible and separately identified.

##### RC-09-T10: Candidate immutability

**Arrange:** Acceptance is ready to begin.

**Action:** Record the artifact manifest and distribute only that run.

**Expected:** Every later result names the exact sealed candidate; unsigned status is disclosed without claiming signing or trust guarantees.

#### Required deliverables

- New private installers and mod ZIPs if inputs changed
- Automated gate logs
- Reproducible verifier instructions
- Manifest, checksums and private feed evidence
- Protected-public comparison

**Exit gate:** All mandatory source and package gates pass for one immutable private candidate; publishing is disabled, public files are unchanged and every acceptance artifact has a recorded identity.

**Failure/rollback rule:** On build or identity failure, keep the run private and preserve its logs. Do not overwrite an earlier good candidate or any public release. Correct the cause and use a new evidence/build identity as appropriate.

### RC-10. Prove clean install, upgrade, coexistence and safe uninstall

**Objective:** Verify what users actually install, retain and remove, not only whether packaging succeeded.

**Priority:** Mandatory installed acceptance gate  
**Owner:** Windows acceptance tester, with Graham approving installer and destructive actions  
**Dependencies:** RC-09  
**Wave:** Installed and live acceptance  
**Initial status:** Planned, not executed  
**Indicative hands-on allowance:** 4-8 hours if this work is required

**Finding references:** CUA01; CUA02; CUA03; SRC05; Shared game-target writer coordination.

#### Candidate code/document touchpoints

- [FS25_FarmDashboard_App/build/installer.nsh](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/build/installer.nsh)
- [FS25_FarmDashboard_App/build/uninstall-user-data.ps1](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/build/uninstall-user-data.ps1)
- [FS25_FarmDashboard_App/build/uninstall-dependencies.ps1](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/build/uninstall-dependencies.ps1)
- [FS25_FarmDashboard_App/editionPolicy.cjs](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/editionPolicy.cjs)
- [FS25_FarmDashboard_App/setupConfigMerge.cjs](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/setupConfigMerge.cjs)
- [FS25_FarmDashboard_App/preload.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/preload.js)
- [FS25_FarmDashboard_App/main.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js)
- [FS25_FarmDashboard_App/setup.html](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/setup.html)

#### Ordered execution steps

1. **RC-10-S01: Obtain action-time approval and backups.** Before executing installers, migration or uninstall, confirm the exact test profile, existing installation and backup paths with Graham. Use disposable profiles where possible. Do not treat this plan as blanket approval for destructive actions.

2. **RC-10-S02: Record the unsigned Windows experience honestly.** Launch only the identified candidate from its private location. Capture any warning or block and its exact stage. Do not disable Defender, SmartScreen or policy protections; an actual policy block is an environment limitation to document and resolve separately.

3. **RC-10-S03: Test clean Classic and RF independently.** Install each edition in a clean test environment, run first launch, complete setup and reach a dashboard shell. Record installation paths, shortcuts, profile roots, runtime/version reporting and any unexpected elevation or dependency prompts.

4. **RC-10-S04: Test real upgrade paths.** Use the known public Classic 4.2.1 installer and the actual previously supported RF version where available. Seed representative settings and selected context, upgrade, and verify preservation. If a required old installer is unavailable, record the upgrade case as unrun.

5. **RC-10-S05: Check coexistence boundaries.** Install both editions in the approved sequence and launch each. Confirm separate profiles, ports, process identities, update channels and shortcuts. Close or restart one edition and verify the other is not inadvertently reconfigured or terminated.

6. **RC-10-S06: Define shared game-target ownership.** Identify whether both apps can configure, replace or command the same game-side export/mod target. Prove a single-writer or explicit coordination rule. Do not assume separate desktop ports alone prevent conflicting writes to the shared game destination.

7. **RC-10-S07: Test migration success and failure.** Exercise Classic-to-RF import with representative configuration, test secrets and transport flags. Inject a controlled migration failure in a disposable profile and verify the source profile remains intact and the target is recoverable.

8. **RC-10-S08: Exercise setup and restart persistence.** Return from setup, save unchanged settings, choose a non-default save, restart and test close/tray behavior. Confirm there are no orphaned listeners, unexplained port conflicts or forced resets to the default save.

9. **RC-10-S09: Test Keep-data uninstall in both directions.** Uninstall Classic while retaining RF, and RF while retaining Classic, using disposable profiles. Verify the retained edition still opens with its data and that Keep preserves exactly the documented user data.

10. **RC-10-S10: Test Full uninstall path ownership.** Use explicit approval and sentinels inside and outside allowed disposable roots. Test resolved path guards and link/reparse cases in the harness before actual deletion. Full removal must not touch saves, sibling editions, shared dependencies still in use or unrelated files.

11. **RC-10-S11: Test reinstall and recovery.** Reinstall after each supported uninstall mode and after an interrupted/failed setup where safely reproducible. Confirm the documented profile discovery and recovery behavior, then record exact installed file/version identities.

#### Acceptance scenarios

All cases initially have status **not run**. For each applicable case, record exact candidate/environment identity, observed result and sanitized evidence using the evidence template. Expected behavior below is not a recorded pass.

##### RC-10-T01: Clean Classic installation

**Arrange:** A clean disposable Windows profile and sealed Classic installer are available.

**Action:** Install and complete setup.

**Expected:** Classic launches as 4.2.2, uses its intended profile/channel and reaches a usable dashboard without unexplained errors.

##### RC-10-T02: Clean RF installation

**Arrange:** A clean disposable profile and sealed RF installer are available.

**Action:** Install and complete setup.

**Expected:** RF launches as 5.0.1 with its intended profile/channel and does not reuse Classic state unexpectedly.

##### RC-10-T03: Classic upgrade

**Arrange:** An approved disposable Classic 4.2.1 profile contains representative settings.

**Action:** Upgrade with the sealed Classic candidate.

**Expected:** Settings, selected context and intended data survive; the old public installer remains untouched.

##### RC-10-T04: RF upgrade

**Arrange:** The actual prior supported RF installer/profile is available.

**Action:** Upgrade with the sealed RF candidate.

**Expected:** Documented settings and context survive; unavailable historical prerequisites are reported as unrun.

##### RC-10-T05: Both editions running

**Arrange:** Classic and RF are installed with distinct test profiles.

**Action:** Launch, restart and close them in both orders.

**Expected:** Ports, processes, update channels and profile writes remain correctly separated.

##### RC-10-T06: Shared game target

**Arrange:** Both editions are pointed at the same copied game target.

**Action:** Attempt supported configuration/export actions in overlapping order.

**Expected:** The documented writer policy prevents silent conflicting replacement or ambiguous active mod ownership.

##### RC-10-T07: Migration fails halfway

**Arrange:** A disposable source profile contains flags and test secrets.

**Action:** Inject a safe controlled import failure, then recover.

**Expected:** Source data is unchanged; target recovery is clear; secrets and security flags follow policy.

##### RC-10-T08: Keep-data uninstall both directions

**Arrange:** Both disposable editions contain recognizable settings.

**Action:** Uninstall one with Keep, then repeat in a reset environment for the other.

**Expected:** Retained edition and promised user data survive; no sibling edition is broken.

##### RC-10-T09: Full uninstall with sentinels

**Arrange:** Only approved disposable roots may be removed; unrelated sentinels exist.

**Action:** Exercise path guards, then perform explicitly approved Full uninstall.

**Expected:** Only owned allowed data is removed; game saves, unrelated files and retained-edition resources survive.

##### RC-10-T10: Reinstall and background cleanup

**Arrange:** An approved uninstall/reinstall sequence and tray/close settings are defined.

**Action:** Reinstall, launch, close and inspect owned process/port behavior.

**Expected:** The documented profile behavior holds and no unintended orphaned service or listener remains.

#### Required deliverables

- Installed acceptance matrix with exact hashes
- Screenshots and sanitized setup logs
- Migration/uninstall sentinel evidence
- Actual Windows warning/block record
- Profile/port/channel ownership record

**Exit gate:** Both exact installers pass supported clean/upgrade/coexistence paths, shared-target ownership is proven, and approved Keep/Full uninstall cases preserve all non-owned data. Any required unrun case remains a release evidence gap.

**Failure/rollback rule:** Stop immediately on unexpected deletion, cross-edition profile writes or migration loss. Preserve logs and restore only the approved disposable backup. Never repair an uninstall failure by broad recursive deletion of user folders.

### RC-11. Run real game and dedicated-server end-to-end acceptance

**Objective:** Prove that the installed desktop editions and their exact mod ZIPs work together using real exports, selected saves and supported remote paths.

**Priority:** Mandatory for every advertised release path  
**Owner:** Game/dedicated acceptance tester with Graham supplying approved environment access  
**Dependencies:** RC-09, RC-10  
**Wave:** Installed and live acceptance  
**Initial status:** Planned, not executed  
**Indicative hands-on allowance:** 4-8 hours if this work is required

**Finding references:** Installed/live acceptance gaps; R2-MOD-01 live closure; R2-UX-01 installed context closure; Dedicated transport and recovery evidence.

#### Candidate code/document touchpoints

- [FS25_FarmDashboard_Mod/src/FarmDashboard.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboard.lua)
- [FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua)
- [FS25_FarmDashboard_App/main.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js)
- [FS25_FarmDashboard_App/ftpAccess.cjs](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/ftpAccess.cjs)
- [FS25_FarmDashboard_App/httpFeedXml.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/httpFeedXml.js)
- [FS25_FarmDashboard_App/liveExportFreshness.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/liveExportFreshness.js)
- [FS25_FarmDashboard_App/serverDataCache.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/serverDataCache.js)
- [NEW APP/src/services/ws-client.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/services/ws-client.ts)
- [NEW APP/src/sections/overview/OverviewSection.tsx](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/sections/overview/OverviewSection.tsx)

#### Ordered execution steps

1. **RC-11-S01: Confirm the game is safe to modify.** Check the current game state with Graham before replacing any mod. Stop the game before swapping ZIPs, back up the installed mod and record its identity. Use a copied save and approved test export roots; never fault-inject into Save 1.

2. **RC-11-S02: Install one matching mod/edition pair.** Deploy the exact Classic or RF mod ZIP associated with the sealed candidate. Record the actual loaded mod and game versions from reliable local evidence. Do not assume the ZIP filename proves which mod the game loaded.

3. **RC-11-S03: Walk the new-user local path.** Load the copied save, complete app setup, select the correct source/save and reach the dashboard. Exercise at least overview, livestock, vehicles, fields and market information that are advertised for that edition and mode.

4. **RC-11-S04: Match live source and displayed data.** Capture several export cycles and compare stable entities and collection generations with the game. Confirm freshness means real source progress, valid empty changes are reflected and stale sections are identified honestly.

5. **RC-11-S05: Exercise approved export failure and recovery.** Use only the controlled scratch/mirror mechanism proven in RC-01/RC-02, not disk-filling or game-save permission changes. Demonstrate failure visibility and recovery while preserving the last-good export.

6. **RC-11-S06: Configure one real dedicated path completely.** Use an authorized test server and the actual supported protocol, permissions and save selection. Record a full setup-to-dashboard walkthrough with secrets redacted. If multiple remote modes are advertised, test each distinct transport contract or explicitly narrow release claims.

7. **RC-11-S07: Test transient remote failure.** Disconnect or deny only the owned test connection in a controlled way. Exercise timeout, reconnect, changed credentials and server/save switch. Confirm retries are bounded and stale state is clear rather than disguised as live data.

8. **RC-11-S08: Test transport hardening end to end.** Retain the implemented FTP filename/save-slot validation, serialized polls, HTTP total deadline and same-origin redirect rules. Exercise relevant negative cases on the test endpoint; do not scan, attack or interfere with unrelated servers.

9. **RC-11-S09: Repeat the essential path for the other edition.** Use its matching mod ZIP and isolated profile. Cover independent startup, selected-save persistence, representative data and remote setup where supported. Do not transfer a Classic pass automatically to RF.

10. **RC-11-S10: Check for new log errors and leaks.** Inspect sanitized app and game logs from the run for new mod errors, repeated retries, credentials or user-path leakage in shared diagnostics. Separate unrelated pre-existing game/mod noise from reproduced candidate faults.

11. **RC-11-S11: Record the exact acceptance scope.** List which saves, game versions, integrations, transports and user roles were exercised. A local developer session is not proof of all dedicated modes, multiplayer roles or third-party mod combinations.

#### Acceptance scenarios

All cases initially have status **not run**. For each applicable case, record exact candidate/environment identity, observed result and sanitized evidence using the evidence template. Expected behavior below is not a recorded pass.

##### RC-11-T01: Classic local live path

**Arrange:** The sealed Classic pair is loaded on an approved copied save.

**Action:** Complete setup and observe several export cycles.

**Expected:** The installed app displays the correct save and real progressing data with no unexplained candidate errors.

##### RC-11-T02: RF local live path

**Arrange:** The sealed RF pair is loaded in its approved environment.

**Action:** Repeat the essential local walkthrough.

**Expected:** RF works independently with its own version/profile and correct live data.

##### RC-11-T03: Last-good export during controlled failure

**Arrange:** A valid export exists and only an approved scratch or mirror target is faulted.

**Action:** Observe failure, then remove the fault.

**Expected:** Last-good data remains usable and honest stale/error state returns to fresh after a confirmed successful export.

##### RC-11-T04: Legitimate live empty transition

**Arrange:** A copied save permits a safe representative empty-state change or an approved equivalent fixture.

**Action:** Observe the next authoritative export and app refresh.

**Expected:** The UI clears correctly without resurrecting old details after reconnect or restart.

##### RC-11-T05: Dedicated setup end to end

**Arrange:** An authorized real dedicated test source and credentials are available.

**Action:** Configure the supported path and open the dashboard.

**Expected:** Save selection, data retrieval, authentication and representative sections all work with real server data.

##### RC-11-T06: Dedicated disconnect and recovery

**Arrange:** The owned test connection is healthy.

**Action:** Interrupt it safely, wait through the deadline, then restore it.

**Expected:** The UI reports stale/disconnected state, retries are bounded and current-context data recovers without duplicate clients.

##### RC-11-T07: Remote context switch with pending requests

**Arrange:** Two authorized test contexts have distinguishable data.

**Action:** Switch while a response is delayed.

**Expected:** Late data, errors and cached details from the old source never appear in the new context.

##### RC-11-T08: HTTP/FTP negative cases

**Arrange:** A controlled endpoint can return slow responses, redirects or invalid file identifiers.

**Action:** Exercise the supported transport failure cases.

**Expected:** Timeout, origin and path rules are enforced without credential leakage or indefinite waiting.

##### RC-11-T09: Role and permission boundary

**Arrange:** A supported restricted test role or read-only credential is available.

**Action:** Attempt only the application's normal advertised operations.

**Expected:** Unauthorized operations fail clearly and do not gain access by changing context or retrying.

##### RC-11-T10: Game/app log hygiene

**Arrange:** Logs from both exact-edition live runs are available.

**Action:** Review the candidate-specific interval and prepare sanitized evidence.

**Expected:** New reproducible errors are tracked and shared logs contain no credentials or unredacted private save exports.

#### Required deliverables

- Local and dedicated walkthrough evidence
- Loaded-mod and installer identity record
- Matched-generation live parity samples
- Disconnect/recovery logs
- Explicit supported-mode coverage and exclusions

**Exit gate:** Each advertised edition and local/dedicated path has exact-candidate live evidence, including failure recovery and selected-context integrity. Unavailable advertised paths remain untested, not implicitly passed.

**Failure/rollback rule:** Stop on unexpected game-state changes, corrupted exports or cross-context data. With the game stopped and approval, restore the prior mod/profile backup. Do not mutate the live save to force a reproduction.

### RC-12. Run a bounded soak and a small controlled tester handoff

**Objective:** Catch accumulated runtime and first-use problems without turning the release into an indefinite open-ended beta.

**Priority:** Final practical reliability gate  
**Owner:** QA coordinator and named volunteer testers  
**Dependencies:** RC-10, RC-11  
**Wave:** Installed and live acceptance  
**Initial status:** Planned, not executed  
**Indicative hands-on allowance:** 3-6 hours if this work is required

**Finding references:** Soak and independent tester evidence gaps.

#### Candidate code/document touchpoints

- [docs/_internal/audits/2026-09-05-remediation-reaudit.md](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit.md)

#### Ordered execution steps

1. **RC-12-S01: Define a finite soak before starting.** Use the provisional two-hour local session per edition plus a two-hour dedicated/reconnect session as an initial minimum, followed by one six-hour steady-state session on a representative worst-case supported setup. Approve the exact schedule and fixtures before running.

2. **RC-12-S02: Record a stable warm baseline.** After a documented warm-up, capture owned process memory, queues, active connections, export cadence, log growth and basic UI responsiveness. Use the same sampling method throughout; compare equivalent workload periods.

3. **RC-12-S03: Exercise representative activity.** Include normal play, repeated refresh, opening and closing detail/settings dialogs, a context switch and controlled remote reconnect. Do not invent destructive gameplay or alter the user's normal save for the sake of a soak.

4. **RC-12-S04: Apply explicit stop conditions.** Stop on save/export integrity loss, wrong-context data, unauthorized access, repeated crashes, runaway retries or severe reproducible stalls. Preserve the failed run rather than restarting it until the averages look acceptable.

5. **RC-12-S05: Prepare a private tester pack.** Include the exact candidate manifest and checksums, edition/mod pairing, installation notes, unsigned-status disclosure, safe backup instructions, known limitations and a concise issue template. Do not publish publicly or put test credentials in the pack.

6. **RC-12-S06: Use a small purposeful tester cohort.** Seek at least one fresh-user/clean-install experience, one real upgrade/coexistence experience and one dedicated-server experience across named volunteers where available. Roles can overlap; a count of testers is not a substitute for coverage.

7. **RC-12-S07: Give testers scenario cards.** Ask for a setup-to-dashboard path, a selected-save restart check, one representative data section and a disconnect/recovery check where applicable. Collect actual observed outcomes and environment details, not a generic 'works for me'.

8. **RC-12-S08: Triage feedback by release impact.** Reproduce suspected data/security/install failures promptly. Merge duplicates, separate environment blocks and pre-existing unrelated mod issues, and defer cosmetic suggestions unless they make a core workflow unusable.

9. **RC-12-S09: Handle fixes without stale evidence.** If tester feedback causes source or package changes, create a new candidate and rerun affected source, package and installed/live gates. Explain the impact scope; never attach old-hash acceptance to new bytes without a justified retest.

10. **RC-12-S10: Close the time-boxed pilot.** At the agreed end, summarize scenarios covered, failures, unresolved prerequisites and accepted low-risk backlog items. No response is not a pass. Move to RC-13 once the gate is satisfied rather than restarting a full speculative audit.

#### Acceptance scenarios

All cases initially have status **not run**. For each applicable case, record exact candidate/environment identity, observed result and sanitized evidence using the evidence template. Expected behavior below is not a recorded pass.

##### RC-12-T01: Local soak Classic

**Arrange:** The exact installed Classic pair has passed the live smoke path.

**Action:** Run the agreed bounded local activity session.

**Expected:** No blocker-class failure, accumulated abandoned work or unexplained severe regression occurs.

##### RC-12-T02: Local soak RF

**Arrange:** The exact installed RF pair has passed the live smoke path.

**Action:** Run the corresponding bounded RF session.

**Expected:** RF retains stable correct behavior independently of the Classic result.

##### RC-12-T03: Dedicated reconnect soak

**Arrange:** A supported remote setup is available.

**Action:** Run repeated controlled reconnect and refresh cycles.

**Expected:** Connections, queues and retries settle; stale state and recovery remain accurate.

##### RC-12-T04: Long steady-state session

**Arrange:** A representative large supported setup has a recorded warm baseline.

**Action:** Run the agreed extended session and sample resources.

**Expected:** No unexplained monotonic resource growth or accumulating backlog remains.

##### RC-12-T05: Fresh user scenario

**Arrange:** A volunteer has the private tester pack and no existing test profile.

**Action:** Complete the scenario without developer-only shortcuts.

**Expected:** Instructions and core setup are understandable; every failure includes usable evidence.

##### RC-12-T06: Upgrade/coexistence scenario

**Arrange:** A volunteer has an approved supported previous installation and backup.

**Action:** Upgrade and exercise the intended coexistence path.

**Expected:** Settings and edition boundaries survive; unsupported prerequisites are called out.

##### RC-12-T07: Tester issue reproducibility

**Arrange:** A tester reports a potential release blocker.

**Action:** Reproduce using the submitted version, context and steps.

**Expected:** The issue is confirmed, disproved in scope or left explicitly unresolved with a next action, not dismissed by opinion.

##### RC-12-T08: Candidate change during pilot

**Arrange:** A confirmed fix produces different release bytes.

**Action:** Apply the evidence invalidation rules.

**Expected:** Affected scenarios are rerun against the replacement candidate and old results remain traceable to their original hashes.

#### Required deliverables

- Soak measurements and incident timeline
- Private tester pack
- Tester scenario results
- Deduplicated feedback dispositions
- Final candidate coverage summary

**Exit gate:** The agreed finite soak and independent scenario coverage are complete without unresolved blockers. Missing tester responses, unsupported environments and low-risk backlog items are explicitly recorded.

**Failure/rollback rule:** Pause distribution on a credible integrity/security blocker and tell existing testers which candidate is affected. Keep the previous private candidate available; do not silently replace a download under the same identity.

### RC-13. Make the release decision, protect the public history and rehearse rollback

**Objective:** Reach a finite, evidence-backed go/no-go decision without claiming that unsigned status, test counts or an unfinished audit prove readiness.

**Priority:** Final owner authorization  
**Owner:** Graham as release owner, with build and QA sign-off  
**Dependencies:** RC-09, RC-10, RC-11, RC-12  
**Wave:** Release decision  
**Initial status:** Planned, not executed  
**Indicative hands-on allowance:** 1-2 hours if this work is required

**Finding references:** Final release decision.

#### Candidate code/document touchpoints

- [docs/_internal/audits/2026-09-05-remediation-reaudit.json](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit.json)
- [FS25_FarmDashboard_App/electron-builder.rf.yml](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/electron-builder.rf.yml)
- [tools/app/assert-rf-update-channel.mjs](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/tools/app/assert-rf-update-channel.mjs)

#### Ordered execution steps

1. **RC-13-S01: Reconcile the final blocker register.** Require every imported historical reference to have a disposition and every confirmed release blocker to have evidence of closure on the final candidate. Unknown high-risk core behavior remains a gap; do not mark it passed to finish the checklist.

2. **RC-13-S02: Check evidence identity and coverage.** Confirm source, package, installed, live and soak results refer to the same final candidate or a documented unchanged component with justified reuse. Name all skipped tests and unsupported modes in the decision record.

3. **RC-13-S03: Prepare accurate versioned release notes.** Describe Classic 4.2.2 and RF 5.0.1 with their matching mod versions and actual runtime. Preserve the public Classic 4.2.1 story, files and hashes. Do not backfill new Electron 43 artifacts into the old release.

4. **RC-13-S04: State the unsigned decision plainly.** Record that code signing remains deferred by the owner under the free-project constraint. Describe actual tested installation behavior and known restrictions. Do not promise absence of Windows warnings or advise users to disable protection.

5. **RC-13-S05: Approve the supported release scope.** List supported versions, paths and tested combinations. A dedicated mode cannot be claimed release-tested if no real dedicated evidence exists. Any scope reduction or preview-only designation needs Graham's explicit approval and clear user-facing wording.

6. **RC-13-S06: Rehearse rollback privately.** In the approved disposable environment, document and exercise return to the prior supported app/mod combination where compatible. Preserve profiles and export data according to the tested migration policy. Do not promise automatic downgrade if schema changes prevent it.

7. **RC-13-S07: Prepare publication without performing it.** Write the exact files, feeds, checksums, release-note targets and order of operations into a publication checklist. Stage new versioned destinations privately. Publication and update-feed changes require a separate explicit instruction.

8. **RC-13-S08: Record one of three decisions.** Choose GO within stated scope, NO-GO with named blockers, or PRIVATE TESTING ONLY with missing evidence. Include candidate hashes, reviewer, date, signing deferral, known limitations and rollback reference.

9. **RC-13-S09: Require explicit owner release approval.** Graham approves the final scope and public rollout separately from technical test completion. A build agent or tester must not infer publication permission from a green automated suite.

10. **RC-13-S10: Finish closure rather than restart the audit.** Move accepted low-risk polish to a bounded backlog and retain this report as the release record. Reopen only a specific failure, changed input or new evidence, not another full speculative audit without cause.

#### Acceptance scenarios

All cases initially have status **not run**. For each applicable case, record exact candidate/environment identity, observed result and sanitized evidence using the evidence template. Expected behavior below is not a recorded pass.

##### RC-13-T01: No hidden blocker

**Arrange:** The final ledger and acceptance records are available.

**Action:** Review every unresolved and deferred item against release rules.

**Expected:** No confirmed security/integrity/core-workflow blocker is hidden inside a cosmetic backlog or an unrun test.

##### RC-13-T02: Exact candidate continuity

**Arrange:** Final artifacts and all evidence manifests exist.

**Action:** Compare the identities recorded across gate results.

**Expected:** The decision applies to exact final bytes and does not reuse invalidated results.

##### RC-13-T03: Accurate release history

**Arrange:** New versioned notes and publication targets are drafted.

**Action:** Compare them with the protected Classic 4.2.1 baseline.

**Expected:** The old release story and bytes remain intact; new runtime/version facts belong to the new release.

##### RC-13-T04: Signing remains deferred

**Arrange:** The decision record includes the owner constraint.

**Action:** Review wording and prerequisites.

**Expected:** No paid signing requirement is reintroduced and no trust guarantee or security bypass is implied.

##### RC-13-T05: Rollback is actionable

**Arrange:** A disposable profile and previous supported artifacts are available.

**Action:** Exercise the documented approved rollback path.

**Expected:** The path works in its stated scope or its limits are explicit before release.

##### RC-13-T06: Publication authorization

**Arrange:** All technical gates may be green but no publication instruction has been given.

**Action:** Review the pending publication checklist.

**Expected:** Nothing is uploaded or redirected until Graham explicitly authorizes publication.

#### Required deliverables

- Final go/no-go decision record
- Versioned release notes draft
- Rollback runbook and rehearsal result
- Publication checklist awaiting approval
- Bounded post-release backlog

**Exit gate:** A signed-off decision record names exact artifacts, scope, evidence, limitations and rollback. GO requires all mandatory gates in scope; publication remains a separate authorized action.

**Failure/rollback rule:** If a final gate fails, retain private-testing status and name the smallest remaining closure action. If a later approved rollout fails, follow the tested rollback runbook rather than overwriting historical artifacts.

## 15. Automated-gate execution reference

These commands are future execution instructions from the workspace root. They were not run to create this plan. Capture each command's exit code and log separately; do not continue past a failed mandatory gate merely because later commands pass. Confirm the intended environment and dependencies during the authorized implementation/validation phase.

```powershell
npm test --prefix FS25_FarmDashboard_App -- --runInBand
npm run test:mjs --prefix FS25_FarmDashboard_App
& ".\NEW APP\node_modules\.bin\tsc.cmd" --noEmit --project ".\NEW APP\tsconfig.json"
node tools/check-lua-syntax.mjs
npm run verify:electron-pack --prefix FS25_FarmDashboard_App
npm run i18n:verify --prefix FS25_FarmDashboard_App
npm audit --json --prefix FS25_FarmDashboard_App
npm audit --json --prefix "NEW APP"
```

The optional live test that was skipped in the baseline remains a genuine skip until its prerequisites are supplied and it passes. The Lua command is syntax validation, not a substitute for executable fault injection or a loaded-game test. Translation coverage does not prove visual layout or keyboard accessibility.

## 16. Safe private rebuild recipe and verifier pitfalls

The normal build wrapper does not forward --publish=never and defaults toward the public-ish Final Output location. Use an explicit new private destination with the direct builder invocation, after source closure. This recipe is intentionally guarded by a placeholder and is not a one-click authorization to build or publish.

```powershell
# EXECUTION RECIPE ONLY. Not run by this plan.
# Use only after source closure and explicit authorization to build.
$workspace = 'C:\Users\Graham\Documents\JoshWalki Farmdash server edit\MAIN CODEBASE\FarmHub'
$qaRoot = 'C:\Users\Graham\Documents\FarmDash Release Candidates'
$runId = '<NEW_PRIVATE_BUILD_ID>'

if ($runId -match '[<>\\/]' -or [string]::IsNullOrWhiteSpace($runId)) {
    throw 'Choose one new private build directory name before executing.'
}
$parent = [System.IO.Path]::GetFullPath($qaRoot).TrimEnd('\')
$output = [System.IO.Path]::GetFullPath((Join-Path $parent $runId))
if (-not $output.StartsWith($parent + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'Output must remain inside the private candidate root.'
}
if (Test-Path -LiteralPath $output) {
    throw 'Use a new candidate directory; do not overwrite an existing run.'
}

# Before running copy-ui-v2.mjs, inspect its resolved generated-output target
# and confirm it is owned, inside the workspace and not a reparse-point escape.
# Confirm local command paths against the current build configuration.
Set-Location -LiteralPath (Join-Path $workspace 'NEW APP')
& '.\node_modules\.bin\vite.cmd' build
if ($LASTEXITCODE -ne 0) { throw 'Production UI build failed.' }

Set-Location -LiteralPath $workspace
node tools/app/copy-ui-v2.mjs
if ($LASTEXITCODE -ne 0) { throw 'UI package copy failed.' }

Set-Location -LiteralPath (Join-Path $workspace 'FS25_FarmDashboard_App')
& '.\node_modules\.bin\electron-builder.cmd' --win --x64 --publish=never "--config.directories.output=$output"
if ($LASTEXITCODE -ne 0) { throw 'Classic private build failed.' }

$rfOutput = Join-Path $output 'RF-edition'
& '.\node_modules\.bin\electron-builder.cmd' --win --x64 --publish=never --config electron-builder.rf.yml "--config.directories.output=$rfOutput"
if ($LASTEXITCODE -ne 0) { throw 'RF private build failed.' }

# Mod staging, verifier execution, manifest generation and acceptance follow.
# Do not use default ZIP/output destinations or publish from this recipe.
```

### Mod packaging constraints

The existing ZIP tool normally creates ZIP output in the source tree and can copy into Final Output. During execution, inspect its actual supported parameters once, use isolated staging and an explicit private destination, and apply edition/version stamping only to that staging copy. Do not invent flags, overwrite source/public ZIPs or replace a loaded mod. Produce both matching mod ZIPs and record intentional differences.

### Verifier prerequisites and prior operational pitfalls

- Use a new validation run/output; the prior verifier creates ARTIFACT-MANIFEST.json with exclusive creation and cannot be blindly rerun in place.
- Resolve the current verifier's actual inputs before execution. Do not delete old manifests to make it run.
- Record @electron/asar, js-yaml and luaparse from the application dependencies.
- The previous private verifier used adm-zip@0.5.16 from private validation-tools/node_modules and NODE_PATH pointing there.
- Use OS-native path joining for nested ASAR entries.
- Set FARMDASH_QA_CANDIDATE to the exact new private candidate folder.
- The prior child WindowsPowerShell invocation needed the standard WindowsPowerShell PSModulePath; configure that child environment deliberately without changing system-wide policy.
- Derive expected Lua/source inventory rather than hardcoding the prior count of 42 as permanent coverage.
- Expand package identity coverage to all changed release-affecting modules; do not describe the prior ten selected modules as exhaustive.
- Record actual signature status; do not repeat a generic script-policy StatusMessage as proof an installer cannot run.

Existing verifier reference: [verify-artifacts.cjs](C:/Users/Graham/Documents/FarmDash%20Release%20Candidates/2026-09-06-release-validation-093509-f2cf8e8c/validation/verify-artifacts.cjs). Treat it as an implementation input to adapt deliberately for a new run, not permission to overwrite a completed manifest.

## 17. Seeded reference-to-package closure ledger

This seed maps 32 identifiable audit/acceptance references. It is **not a complete import of the historical register**. The 25 identifiable primary R2 IDs below are not a claim that the other four of the historical 29 have vanished. RC-00 must import all original criteria and reconcile all earlier not-reverified/conditional references. Family-level descriptions deliberately avoid inventing exact titles for IDs whose complete original text is not reconstructed here.

### R2-MOD-01 -> RC-02

Mod writes/copies can report success without confirmed persistence.

**Baseline classification:** `source_confirmed_open_not_game_fault_injected`.  
**Starting closure status:** Requires disposition; original acceptance criteria still to be imported.  
**Next action:** Reconcile exact original criteria in RC-00, then reproduce or retain a production-linked passing regression.

### R2-MOD-02 -> RC-05

Sample reconciliation can alter measured averages and discard zero sums.

**Baseline classification:** `historical_not_reverified`.  
**Starting closure status:** Requires disposition; original acceptance criteria still to be imported.  
**Next action:** Reconcile exact original criteria in RC-00, then reproduce or retain a production-linked passing regression.

### R2-MOD-03 -> RC-06

Incremental/Courseplay resale path may use purchase price.

**Baseline classification:** `historical_not_reverified`.  
**Starting closure status:** Requires disposition; original acceptance criteria still to be imported.  
**Next action:** Reconcile exact original criteria in RC-00, then reproduce or retain a production-linked passing regression.

### R2-MOD-04 -> RC-08

Courseplay compatibility may traverse the fleet twice.

**Baseline classification:** `historical_impact_unmeasured`.  
**Starting closure status:** Requires disposition; original acceptance criteria still to be imported.  
**Next action:** Reconcile exact original criteria in RC-00, then reproduce or retain a production-linked passing regression.

### R2-MOD-05 -> RC-08

Adaptive cadence may override a changed requested interval.

**Baseline classification:** `historical_not_reverified`.  
**Starting closure status:** Requires disposition; original acceptance criteria still to be imported.  
**Next action:** Reconcile exact original criteria in RC-00, then reproduce or retain a production-linked passing regression.

### R2-MOD-06 -> RC-03

Collector failure and legitimate empty results may be conflated.

**Baseline classification:** `historical_not_reverified`.  
**Starting closure status:** Requires disposition; original acceptance criteria still to be imported.  
**Next action:** Reconcile exact original criteria in RC-00, then reproduce or retain a production-linked passing regression.

### R2-MOD-07 -> RC-06

Station-name heuristics may fabricate market offers.

**Baseline classification:** `historical_not_reverified`.  
**Starting closure status:** Requires disposition; original acceptance criteria still to be imported.  
**Next action:** Reconcile exact original criteria in RC-00, then reproduce or retain a production-linked passing regression.

### R2-MOD-08 -> RC-08

Inventory work budget may count accepted rows rather than examined objects.

**Baseline classification:** `historical_impact_unmeasured`.  
**Starting closure status:** Requires disposition; original acceptance criteria still to be imported.  
**Next action:** Reconcile exact original criteria in RC-00, then reproduce or retain a production-linked passing regression.

### R2-PIPE-01 -> RC-04

Freshness/provenance family; import exact original acceptance criteria.

**Baseline classification:** `historical_not_reverified`.  
**Starting closure status:** Requires disposition; original acceptance criteria still to be imported.  
**Next action:** Reconcile exact original criteria in RC-00, then reproduce or retain a production-linked passing regression.

### R2-PIPE-02 -> RC-04

Freshness/provenance family; import exact original acceptance criteria.

**Baseline classification:** `historical_not_reverified`.  
**Starting closure status:** Requires disposition; original acceptance criteria still to be imported.  
**Next action:** Reconcile exact original criteria in RC-00, then reproduce or retain a production-linked passing regression.

### R2-PIPE-03 -> RC-04

Freshness/provenance family; import exact original acceptance criteria.

**Baseline classification:** `historical_not_reverified`.  
**Starting closure status:** Requires disposition; original acceptance criteria still to be imported.  
**Next action:** Reconcile exact original criteria in RC-00, then reproduce or retain a production-linked passing regression.

### R2-PIPE-04 -> RC-04

Freshness/provenance family; import exact original acceptance criteria.

**Baseline classification:** `historical_not_reverified`.  
**Starting closure status:** Requires disposition; original acceptance criteria still to be imported.  
**Next action:** Reconcile exact original criteria in RC-00, then reproduce or retain a production-linked passing regression.

### R2-PIPE-05 -> RC-06

Ownership/identity family; import exact original acceptance criteria.

**Baseline classification:** `historical_not_reverified`.  
**Starting closure status:** Requires disposition; original acceptance criteria still to be imported.  
**Next action:** Reconcile exact original criteria in RC-00, then reproduce or retain a production-linked passing regression.

### R2-PIPE-06 -> RC-06

Ownership/identity family; import exact original acceptance criteria.

**Baseline classification:** `historical_not_reverified`.  
**Starting closure status:** Requires disposition; original acceptance criteria still to be imported.  
**Next action:** Reconcile exact original criteria in RC-00, then reproduce or retain a production-linked passing regression.

### R2-PIPE-07 -> RC-06

Ownership/identity family; import exact original acceptance criteria.

**Baseline classification:** `historical_not_reverified`.  
**Starting closure status:** Requires disposition; original acceptance criteria still to be imported.  
**Next action:** Reconcile exact original criteria in RC-00, then reproduce or retain a production-linked passing regression.

### R2-PIPE-08 -> RC-04

Freshness/provenance family; import exact original acceptance criteria.

**Baseline classification:** `historical_not_reverified`.  
**Starting closure status:** Requires disposition; original acceptance criteria still to be imported.  
**Next action:** Reconcile exact original criteria in RC-00, then reproduce or retain a production-linked passing regression.

### R2-DATA-01 -> RC-04

Bootstrap/refresh ordering; preserve already-passing focused regressions.

**Baseline classification:** `broader_contract_not_reverified`.  
**Starting closure status:** Requires disposition; original acceptance criteria still to be imported.  
**Next action:** Reconcile exact original criteria in RC-00, then reproduce or retain a production-linked passing regression.

### R2-DATA-02 -> RC-04

Cross-context late responses; preserve already-passing focused regressions.

**Baseline classification:** `broader_contract_not_reverified`.  
**Starting closure status:** Requires disposition; original acceptance criteria still to be imported.  
**Next action:** Reconcile exact original criteria in RC-00, then reproduce or retain a production-linked passing regression.

### R2-UI-01 -> RC-07

Focus stealing during real UI updates.

**Baseline classification:** `targeted_fix_and_regression_passed_installed_evidence_pending`.  
**Starting closure status:** Requires disposition; original acceptance criteria still to be imported.  
**Next action:** Reconcile exact original criteria in RC-00, then reproduce or retain a production-linked passing regression.

### R2-UX-01 -> RC-07

Startup/setup return and selected context.

**Baseline classification:** `historical_installed_acceptance_pending`.  
**Starting closure status:** Requires disposition; original acceptance criteria still to be imported.  
**Next action:** Reconcile exact original criteria in RC-00, then reproduce or retain a production-linked passing regression.

### R2-UX-02 -> RC-07

Partial settings load and unintended default overwrite.

**Baseline classification:** `historical_not_reverified`.  
**Starting closure status:** Requires disposition; original acceptance criteria still to be imported.  
**Next action:** Reconcile exact original criteria in RC-00, then reproduce or retain a production-linked passing regression.

### R2-UX-03 -> RC-07

Authentication/bootstrap family; import exact original acceptance criteria.

**Baseline classification:** `historical_not_reverified`.  
**Starting closure status:** Requires disposition; original acceptance criteria still to be imported.  
**Next action:** Reconcile exact original criteria in RC-00, then reproduce or retain a production-linked passing regression.

### R2-UX-04 -> RC-07

Authentication/bootstrap family; import exact original acceptance criteria.

**Baseline classification:** `historical_not_reverified`.  
**Starting closure status:** Requires disposition; original acceptance criteria still to be imported.  
**Next action:** Reconcile exact original criteria in RC-00, then reproduce or retain a production-linked passing regression.

### R2-UX-05 -> RC-07

Authentication/bootstrap family; import exact original acceptance criteria.

**Baseline classification:** `historical_not_reverified`.  
**Starting closure status:** Requires disposition; original acceptance criteria still to be imported.  
**Next action:** Reconcile exact original criteria in RC-00, then reproduce or retain a production-linked passing regression.

### R2-BACK-01 -> RC-07

Image-export suppressNative early-return branches.

**Baseline classification:** `historical_severity_requires_triage`.  
**Starting closure status:** Requires disposition; original acceptance criteria still to be imported.  
**Next action:** Reconcile exact original criteria in RC-00, then reproduce or retain a production-linked passing regression.

### CUA01 -> RC-10

Installed acceptance reference; import exact original scope.

**Baseline classification:** `not_executed_on_current_candidate`.  
**Starting closure status:** Requires disposition; original acceptance criteria still to be imported.  
**Next action:** Reconcile exact original criteria in RC-00, then reproduce or retain a production-linked passing regression.

### CUA02 -> RC-10

Installed acceptance reference; import exact original scope.

**Baseline classification:** `not_executed_on_current_candidate`.  
**Starting closure status:** Requires disposition; original acceptance criteria still to be imported.  
**Next action:** Reconcile exact original criteria in RC-00, then reproduce or retain a production-linked passing regression.

### CUA03 -> RC-10

Installed acceptance reference; import exact original scope.

**Baseline classification:** `not_executed_on_current_candidate`.  
**Starting closure status:** Requires disposition; original acceptance criteria still to be imported.  
**Next action:** Reconcile exact original criteria in RC-00, then reproduce or retain a production-linked passing regression.

### CUA04 -> RC-07

Setup return and selected-save installed acceptance.

**Baseline classification:** `not_executed_on_current_candidate`.  
**Starting closure status:** Requires disposition; original acceptance criteria still to be imported.  
**Next action:** Reconcile exact original criteria in RC-00, then reproduce or retain a production-linked passing regression.

### SRC05 -> RC-10

Installed/lifecycle reference; import exact original scope.

**Baseline classification:** `historical_not_reverified`.  
**Starting closure status:** Requires disposition; original acceptance criteria still to be imported.  
**Next action:** Reconcile exact original criteria in RC-00, then reproduce or retain a production-linked passing regression.

### C3 -> RC-08

Legacy/fallback field collection may bypass yielding.

**Baseline classification:** `conditional_reachability_unproven`.  
**Starting closure status:** Requires disposition; original acceptance criteria still to be imported.  
**Next action:** Reconcile exact original criteria in RC-00, then reproduce or retain a production-linked passing regression.

### C4 -> RC-03

Freshness-gated scheduler may starve detail requests under persistent failure.

**Baseline classification:** `conditional_reachability_unproven`.  
**Starting closure status:** Requires disposition; original acceptance criteria still to be imported.  
**Next action:** Reconcile exact original criteria in RC-00, then reproduce or retain a production-linked passing regression.

## 18. Evidence and decision templates

### Per-case evidence record

```json
{
  "caseId": "RC-XX-TXX",
  "candidateId": "",
  "installerSha256": "",
  "modSha256": "",
  "edition": "",
  "gameVersion": "",
  "windowsVersion": "",
  "saveAlias": "",
  "serverAlias": "",
  "startedUtc": "",
  "endedUtc": "",
  "fixtureId": "",
  "observed": "",
  "result": "not_run",
  "sanitizedEvidencePaths": [],
  "relatedFindingIds": [],
  "tester": "",
  "reviewer": "",
  "limitations": ""
}
```

### Final release decision record

```json
{
  "decision": "PRIVATE_TESTING_ONLY",
  "candidateId": "",
  "scope": [],
  "mandatoryGateResults": [],
  "unresolvedBlockers": [],
  "untestedAdvertisedPaths": [],
  "acceptedLowRiskBacklog": [],
  "signing": "Owner-deferred; disclose actual tested unsigned behavior.",
  "rollbackEvidence": "",
  "publicationAuthorized": false,
  "releaseOwner": "Graham",
  "approvedAt": null
}
```

### Tester issue report

- Candidate/build ID and edition; installer/mod hashes when available.
- Windows and game version; supported mode and save/server alias.
- Starting state and exact steps to reproduce.
- Expected result and actual observed result.
- Whether repeatable; first/last observation time.
- Sanitized screenshot and relevant app/game log interval.
- Impact: blocked setup, wrong data, crash, integrity/security concern or minor usability issue.
- Recovery attempted and whether it worked; never request credentials or a private full-save dump by default.

## 19. Source references and limits

### Project records

- [Historical remediation re-audit](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit.md)
- [Authoritative historical finding JSON](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit.json)
- [Historical audit evidence](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt)
- [Earlier remediation execution plan](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-reaudit-remediation-execution-plan.md)
- [Earlier structured execution plan](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-reaudit-remediation-execution-plan.json)

### Local engine references

- [INDEX.md](C:/Users/Graham/Documents/FS25%20Game%20Files/docs/INDEX.md): Local wiki entry point; extract version is not proof of the running game version.
- [save-load.md](C:/Users/Graham/Documents/FS25%20Game%20Files/docs/architecture/save-load.md): Save/profile boundaries; does not establish the low-level copyFile/saveFile return contract.
- Future lookup directory: `C:/Users/Graham/Documents/FS25 Game Files/extract/decompiled/scripts/`.
- Future lookup directory: `C:/Users/Graham/Documents/Realistic-Farming/.local/ref/FS25-Community-LUADOC/`.
- Future lookup directory: `C:/Users/Graham/Documents/Realistic-Farming/.local/ref/FS25-lua-scripting/`.

No low-level GIANTS copyFile/saveFile success contract is asserted by this document. RC-01 must establish it from current-version evidence or safe probing before implementation. The local save/load notes establish useful save/profile boundaries but do not by themselves prove file replacement atomicity.

## 20. Definition of done

Release closure is complete when the authoritative register is fully reconciled; every in-scope blocker has candidate-bound evidence; mandatory automated and package gates pass; both editions pass supported installation and lifecycle paths; advertised real-game/dedicated paths pass with their exact mod ZIPs; the bounded soak and tester scenarios have no unresolved blockers; rollback is documented and exercised in its stated scope; and Graham records the final release decision.

Signing remains deferred. Public publication remains separately authorized. Minor accepted backlog items do not cause an automatic new full audit. A new confirmed failure, changed release input or materially new evidence reopens only the relevant work and dependent gates.

**Current status at document creation:** plan authored; no new application fixes, tests, builds, installations, live-save changes or publication were performed as part of this planning step.

