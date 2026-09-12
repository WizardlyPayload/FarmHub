# FarmHub application and mod remediation execution plan

**Date:** 5 September 2026

**Status:** Planning only. This document does not claim any remediation was implemented or tested by creating it.

**Recommendation:** Keep the private candidate on hold. Close the trust and persistence blockers first, reverify the outstanding bootstrap/focus blockers, then complete data, efficiency and UX work before a new private build and actual installed/live acceptance.

Close the re-audit's actionable defects, explicitly reverify the unresolved prior findings and prove the exact private Classic/RF app/mod pair through safe installed and real-source acceptance.

This plan contains **22 work packages, 237 ordered implementation steps and 168 concrete acceptance cases**. It maps all **29 actionable re-audit findings**, **11 prior findings still requiring specific re-verification**, **five installed-candidate checks** and **four conditional risks**.

Application code, dependencies, installers, mod ZIPs, game saves, credentials and public release assets were not changed or tested for this planning request.

Primary evidence: [latest remediation re-audit](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit.md) and [retained evidence ledger](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt). Structured companion: [execution-plan JSON](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-reaudit-remediation-execution-plan.json). Interactive companion: [execution-plan canvas](C:/Users/Graham/.cursor/projects/c-Users-Graham-Documents-JoshWalki-Farmdash-server-edit-MAIN-CODEBASE-FarmHub/canvases/farmhub-reaudit-execution-plan-2026-09-05.canvas.tsx).

## How to use this plan

1. Begin with RP-00, RP-01 and RP-02. Confirm the current production behavior before scheduling a rewrite.
2. Assign an owner and reviewer, then execute packages in dependency order. Independent frontend/mod work can proceed in parallel when its prerequisites are satisfied.
3. For each package, use its file targets, ordered steps, concrete acceptance cases, exit gate and rollback postconditions.
4. Update the closure ledger through separate workspace, packaged, installed and live states. A source change or green generic suite is not end-to-end closure.
5. Produce a fresh private candidate only after the source-level gates pass. Run approved installed/game/dedicated acceptance before private tester handoff.
6. Treat public publication/version changes as a separate explicit decision; this plan does not authorize them.

Paths listed as proposed are design targets, not files verified to exist. During implementation, integrate into an appropriate existing module/test when that avoids duplication, and record the final path. Packaged audit line references remain tied to the retained artifact, not automatically to the current workspace.

## 1. Baseline, certainty and release boundary

### 1.1 What the retained re-audit establishes

The 29 actionable findings include 24 carried-forward findings and five new findings. Eleven other prior findings remain not reverified. These are not 29 demonstrated exploits or 40 newly reproduced defects.

- Four current P1 blockers concern opaque-origin trust, FTP path traversal, mod write-success reporting and loss of the last-good desktop file during failed replacement.
- Two other previously reported P1 cases, late bootstrap context and password-field focus, still require their specific current-build re-verification. They are mandatory gates, not presumed fixed.
- The remaining current findings cover data provenance/clears, hydration lifecycle, entity matching, transport policy, bounded work, domain accuracy and validation gaps.
- The IPC helper/coverage weakness is actionable, but hostile-document reachability was not established. Conditional proxy, fallback-scan and scheduler risks retain their stated uncertainty.
- A development snapshot showed improved pasture agreement and a readable opaque Settings panel. Those observations are not installed, game or dedicated acceptance.
- The game was no longer open when the earlier audit resumed. Any future live session and Save 1 state must be reconfirmed at action time.

### 1.2 Selected retained private bundle

`C:/Users/Graham/Documents/FarmDash Release Candidates/2026-09-05-remediation-coexist`

**FS25-Farm-Dashboard-Setup-4.2.2.exe**

Version: `4.2.2`; bytes: `974336223`; Authenticode: **NotSigned**.
SHA-256: `6E066E72CFA34D7BC72CC78B2FA9C612249C86E8CB1B6556B61BD688D27BEB77`

**RF-edition/FS25-Farm-Dashboard-RF-Setup-5.0.1.exe**

Version: `5.0.1`; bytes: `974337829`; Authenticode: **NotSigned**.
SHA-256: `D6C08A41BD6C77A1D48B7835DE4B8ABD3A305FD9EE1FF5941270BBBB0BE104B0`

**FS25_FarmDashboard-classic-3.4.0.8.zip**

Version: `3.4.0.8`.
SHA-256: `474D4C3A9E9EAEC0C21F1381ABD47292629617585CCF0314E35F6AF69D1C0C57`

**RF-edition/FS25_FarmDashboard-rf-5.0.0.1.zip**

Version: `5.0.0.1`.
SHA-256: `751CDBF75C66F5531DC0E62215D86DBFB22ED601A24E139F3527B4DF81F834EF`

The retained SHA-256 values matched that bundle's manifest in the prior audit. Feed target/version fields were inspected then, but feed SHA-512 values were not recomputed. No new hash, signature, dependency or runtime checks were run to create this plan.

Do not mix the coexist bundle with another private folder containing the same visible versions and different bytes. Future corrections receive a fresh private directory and build identity.

### 1.3 Retained validation results, not newly executed

- **Jest application suite: Pass with integration caveats.** 53 suites; 531 tests. Two internal early returns were counted as passes; no live Giants feed or required transient-pool fixture assertion was exercised by those cases.
- **Node ESM suite: Pass.** 82 tests. Mixed CommonJS/ESM interpretation warnings remain, but no test failure.
- **NEW APP TypeScript: Pass.** Exit 0. Type safety only; not UI lifecycle or response-order proof.
- **Packaging manifest guard: Pass.** Exit 0. Does not replace installation, Authenticode or actual packed-runtime acceptance.
- **Translation key/placeholder verification: Pass.** 2231/2231 across 26 reported locales. No missing keys or placeholder drift. This is not a translation-quality, truncation or accessibility certification.
- **Production dependency advisories: Pass.** 0 reported vulnerabilities. Current registry result; excludes application logic vulnerabilities and does not certify runtime support.
- **Lua syntax gate: Blocked.** MODULE_NOT_FOUND: luaparse. No Lua files parsed by this attempted gate; no dependencies installed to repair it.
- **Focused boundary/hydration diagnostics: Counterexamples found.** Origin, traversal, persistence, import, IPC and hydration. No live exploit, credentials, network transfers or filesystem mutations. The hook scheduler is simulated. One ftpRejectUnauthorized probe is non-contract and excluded from findings; the actual optional TLS field is ftpAllowInsecureTls.
- **Focused pipeline diagnostics: Counterexamples found.** Zero pens, generation loss, duplicate match, XML identity and HTTP deadline. Diagnostic programs exit 0 after printing results; they are not assertion-based green test suites.
- **Selected candidate identity: Pass.** Four SHA-256 hashes match MANIFEST.txt. Both app installers and both named mod ZIPs matched the coexist manifest. Feed target/version fields were inspected; SHA-512 feed hashes were not recomputed.
- **Windows Authenticode: Unsigned.** Both installers: NotSigned. No SmartScreen bypass, signing change or installer execution performed.
- **Desktop computer-use walkthrough: Partial.** Development snapshot, not installed live game. Overview/pasture/table and Settings were inspected. The game was no longer listed after resuming. No desktop configuration was saved.

The frozen diagnostic scripts embed the source they examined and exit 0 after printing counterexamples. Re-running those scripts does not exercise future fixed production code. RP-01 replaces their role in validation with imported production logic and real assertions.

### 1.4 Non-negotiables

- Public Classic 4.2.1/mod 3.4.0.7 and its release/update story remain unchanged.
- Existing Classic 4.2.2/mod 3.4.0.8 and RF 5.0.1/mod 5.0.0.1 artifacts remain immutable private evidence; future version/build decisions require approval.
- Reproduce against current production code before editing. If already fixed in workspace, add closure proof and skip unnecessary rewrite.
- Use actual production imports and actual Preact lifecycle tests. Frozen exit-0 diagnostics and copied algorithms are not regression proof.
- No installer, uninstall, game/mod switch, real credential change, active-save mutation or public publication is authorized by creating this plan.
- Destructive/fault tests use disposable profiles and copied saves; the user's active Save 1 is not a scratch fixture.
- Do not claim a game API signature, return convention, global atomicity guarantee, exploit reachability or performance improvement without appropriate evidence.
- Keep changes scoped and reviewable; do not revert unrelated work or broadly redesign working UI.

## 2. Decision register

These are implementation-time decisions with recommended defaults, not a request to stop planning for ten rounds of questions. Resolve each by its deadline with the named decision owner.

### D-01. Private version and build identity

**Owner:** Product + release owner. **Deadline:** Before RP-19.
**Recommended:** Keep public Classic 4.2.1/mod 3.4.0.7 unchanged. Build into a fresh private directory with a unique external build ID and hashes; obtain explicit approval before any visible version change.
**Consequence/tradeoff:** Reusing a private visible version is possible only with unmistakable immutable identity; overwriting a previously distributed binary is not acceptable.
**Blocks:** `RP-19`, `RP-21`.

### D-02. Privileged native, LAN and proxy authorization

**Owner:** Backend/security owner. **Deadline:** During RP-02, before RP-03 policy implementation.
**Recommended:** Reject opaque/malformed browser origins and require explicit authorized capability for privileged operations. Support only documented direct/local/proxy paths; unconfigured proxy trust is disabled.
**Consequence/tradeoff:** Some legacy no-Origin native clients may need a deliberate migration path. Do not preserve compatibility by restoring unauthenticated loopback privilege.
**Blocks:** `RP-03`, `RP-14`, `RP-16`.

### D-03. Shared game-target writer ownership

**Owner:** Backend + mod + product owners. **Deadline:** During RP-02; enforce before RP-16 acceptance.
**Recommended:** Allow multiple readers but one authorized writer per actual target. Use tested local coordination; dedicated multi-host edits require server coordination or an explicit single-writer/read-only support policy.
**Consequence/tradeoff:** Read-only secondary instances are safer but need clear UX. A peer-port probe or local mutex cannot guarantee remote distributed exclusivity.
**Blocks:** `RP-15`, `RP-16`, `RP-20`.

### D-04. Source identity, generation and legacy compatibility

**Owner:** Backend/domain + mod owners. **Deadline:** RP-02.
**Recommended:** Use available durable context identity plus source epoch/revision, separate clock domains and explicit section outcomes. Legacy missing metadata remains lower-confidence with bounded refresh.
**Consequence/tradeoff:** Additive schema and cache migration work is larger than a local timestamp patch, but avoids incompatible fixes across mod, disk and frontend.
**Blocks:** `RP-06`, `RP-07`, `RP-08`, `RP-09`.

### D-05. Windows and FS25 safe-write capabilities

**Owner:** Persistence + mod owners. **Deadline:** Before RP-05/RP-06 implementation.
**Recommended:** Use only documented/tested platform operations; preserve last-good bytes and report failure whenever commit cannot be established.
**Consequence/tradeoff:** A recoverable multi-step protocol may require backup/journal handling. Do not claim all-files atomicity or assume return values from pcall alone.
**Blocks:** `RP-05`, `RP-06`.

### D-06. Frontend lifecycle test environment

**Owner:** Test + frontend owners. **Deadline:** RP-01.
**Recommended:** Reuse the existing compatible test stack with actual Preact DOM/effect execution and production TypeScript imports. Add a pinned compatible runner only if required.
**Consequence/tradeoff:** A new runner adds maintenance; copied functions and simulated hooks are cheaper but cannot close the actual production lifecycle defects.
**Blocks:** `RP-07`, `RP-09`, `RP-14`, `RP-15`.

### D-07. Performance and UX acceptance budgets

**Owner:** QA + product + mod owners. **Deadline:** Before RP-13/RP-17 measurements.
**Recommended:** Ratify hardware, save sizes, transfer limits, p95/p99 slice and interaction budgets before judging results; retain the existing 45-second total HTTP deadline if still the product requirement.
**Consequence/tradeoff:** Targets are proposed, not measured achievements. Avoid an unsupported universal FPS or accessibility certification claim.
**Blocks:** `RP-13`, `RP-17`, `RP-18`, `RP-20`.

### D-08. Signing and private distribution policy

**Owner:** Release/product owner. **Deadline:** Before RP-19 artifact approval.
**Recommended:** Record actual Authenticode status and resolve signing/trusted distribution through the normal policy. Never bypass Windows protection prompts.
**Consequence/tradeoff:** The retained installers are unsigned. Availability of a certificate and signing pipeline can affect the acceptance window.
**Blocks:** `RP-19`, `RP-20`, `RP-21`.

### D-09. Safe game and dedicated acceptance window

**Owner:** User + desktop QA + dedicated administrator. **Deadline:** Before RP-20.
**Recommended:** Approve exact installer/mod hashes and test targets at action time; use copied saves and disposable profiles for fault/uninstall cases, with one real authorized dedicated path.
**Consequence/tradeoff:** A unavailable game/server leaves a real acceptance gap. A development snapshot cannot substitute for that path.
**Blocks:** `RP-20`, `RP-21`.

### D-10. Residual issue policy

**Owner:** Product + security/data owners. **Deadline:** Before RP-21.
**Recommended:** No waiver for P1 or known trust/data-loss/auth bypass issues. Lower-impact residuals require explicit scope, owner, workaround, expiry and approval.
**Consequence/tradeoff:** A private tester release can document bounded low-impact limitations, but cannot be described as fully accepted when a mandatory environment test is blocked.
**Blocks:** `RP-21`.

## 3. Shared implementation contracts

The labels below describe the proposed contract. They are not assertions that these exact field names or API signatures already exist.

### I-01. Identity precedes asynchronous work

Capture the complete effective context before awaiting. Every completion validates context and epoch again before any store, cache, notification or file commit.

**Example:** A starts loading; B becomes selected; A finishes late. A is discarded rather than ingested under B's label.

### I-02. Newer has a defined ordering domain

Compare source revisions only within their source epoch/context. Local request sequences serialize legacy same-context work but do not pretend to be cross-source production timestamps.

**Example:** Epoch E2/revision 1 can supersede epoch E1/revision 500 through an explicit epoch transition.

### I-03. Production time is not receipt time

Persist source production metadata separately from local received/validated time and game elapsed time. Rereading unchanged bytes does not establish new production.

**Example:** An unstamped export reopened tomorrow is still source-age unknown, not produced today.

### I-04. Empty, omitted, failed and disabled differ

Authoritative successful empty clears data. Omitted/failed sections retain last-known-good only with truthful degradation. Disabled follows an explicit visibility/retention policy.

**Example:** A sold herd stays empty after restart; an exception does not falsely sell the herd.

### I-05. Clear survives persistence

A context/generation-scoped clear removes or invalidates matching derived detail and persists across restart. Older snapshots cannot resurrect it.

**Example:** Zero-head summary plus a retained two-animal detail file yields zero current animals.

### I-06. Measured zero is meaningful

Finite zero is preserved through sample aggregation, normalization, formatting and warnings. Missing/nonfinite values remain unknown or explicitly estimated.

**Example:** An all-zero health sample displays 0%, not 100% and not silently absent.

### I-07. Population estimates do not rewrite sample means

Keep observed sample size/mean distinct from reconciled population counts; adjust compatible sums only under a documented statistical rule.

**Example:** Scaling a bucket from 3 sampled animals to 30 estimated animals cannot divide the original sum by 30.

### I-08. Entity matching is one-to-one

All matching indices share canonical consumed identity; ownership requires an authoritative source and field/farmland namespaces remain distinct.

**Example:** A vehicle matched by configuration is unavailable for a second UID match.

### I-09. Success follows committed bytes

Validate staged content, preserve recoverable last-good data and advance freshness/dirty bookkeeping only after supported commit postconditions are met.

**Example:** EACCES during replacement leaves the old final available and the operation failed.

### I-10. Invalid origin is never native absence

Missing, opaque, malformed and valid Origin are separate states. Origin, authentication, proxy policy and IPC sender identity are independently enforced.

**Example:** Origin:null from a browser cannot inherit the native no-Origin loopback path.

### I-11. Target ownership governs writes

Multiple editions may read one save, but one authorized writer owns each actual game/remote target. Profile separation and a responding peer port are not sufficient.

**Example:** RF in read-only mode explains why Classic currently owns game-facing settings writes.

### I-12. Every expensive path is bounded

Budget examined entries, elapsed time, in-flight operations, total network duration and eventual progress. Cancellation must reach the commit boundary.

**Example:** A million rejected non-bales cannot be scanned in one slice simply because zero bales were accepted.

### I-13. Unknown settings cannot overwrite known state

Load state, draft, validation, revision and per-section commit outcomes are explicit. All requested validation precedes writes.

**Example:** A failed Settings load never saves default values over an existing configuration.

### I-14. Evidence names the layer and exact build

Implemented, verified in workspace, packaged, installed and live/dedicated accepted are separate states. Each promotion requires its own evidence.

**Example:** A correct development pasture screenshot cannot close installed Classic/RF coexistence.

### 3.1 Suggested conceptual payload envelope

Map these concepts to available supported fields during RP-02 rather than inserting this pseudocode as a new incompatible schema.

```text
context: configured source + save identity + farm scope
sourceEpoch: producer/session epoch with an explicit transition rule
sourceRevision: monotonic only within the same context and epoch
producedAt: optional source wall-clock time with documented units
receivedAt: local receipt time, never substituted for producedAt
sectionOutcome: data | authoritative-empty | omitted | failed | disabled
detailIdentity: context + pen ID + compatible summary/detail generation
quality: measured | estimated | unknown, with source provenance
```

Persist authoritative clears with their context/generation. Keep any old-schema adapter explicit and bounded; the absence of metadata is not proof that a payload is fresh or compatible.

### 3.2 Persistence postconditions

1. The target is authorized and contained before I/O.
2. Staged bytes are complete and validated before promotion.
3. Cancellation and current generation are checked immediately before commit.
4. Failure never discards the only valid last-good or recoverable copy.
5. Success metadata, source revision and dirty-state clearing advance only after committed-byte postconditions hold.
6. Recovery can interpret every documented interrupted state without guessing.
7. Multi-file partial results are reported honestly unless a real transaction has been implemented and tested.

### 3.3 FS25 source-of-truth prerequisite

Before changing GIANTS API usage, the mod owner consults the local knowledge index, relevant wiki entries, extracted scripts, LUADOC and examples. Verify signatures, return conventions, supported Lua dialect, timers and filesystem capabilities rather than inventing them.

- `C:/Users/Graham/Documents/FS25 Game Files/docs/INDEX.md`
- `C:/Users/Graham/Documents/FS25 Game Files/extract/`
- `C:/Users/Graham/Documents/Realistic-Farming/.local/ref/FS25-Community-LUADOC/`
- The configured local FS25 Lua scripting examples and relevant wiki pages.

## 4. Ownership, dependency waves and effort

### 4.1 Roles

- **Integration/release owner:** Own main.js integration, dependency order, source freeze, immutable manifests and public-channel protection.
- **Backend/security/persistence owner:** Own trust boundaries, containment, commit recovery, transport policy, cache provenance and shared-writer coordination.
- **Frontend/domain owner:** Own context ingestion, Preact lifecycle, canonical displayed values, auth/focus, Settings and UX.
- **Mod/FS25 owner:** Own local game API truth, persistence adapters, collector outcomes, domain collection and bounded scheduling.
- **QA/acceptance owner:** Own production-linked fixtures, negative cases, measured budgets, disposable installed tests and evidence completeness.
- **User/product and dedicated administrator:** Approve consequential version/auth/writer/signing decisions, live test windows and private distribution scope.

One person may hold multiple roles. Security/persistence closure should still receive an independent review. This plan does not create agents, tasks or unattended work.

### 4.2 Dependency waves

- **W0: Establish reproducible ground truth.** `RP-00`, `RP-01`, `RP-02`. Exit: Identity and coverage are frozen, production-linked tests work and cross-layer contracts are agreed.
- **W1: Contain high-risk boundaries and storage.** `RP-03`, `RP-04`, `RP-05`, `RP-06`. Exit: Four current P1 blockers have passing targeted proof; final packaged/live proof still follows.
- **W2: Restore data and lifecycle correctness.** `RP-07`, `RP-08`, `RP-09`, `RP-10`, `RP-11`, `RP-12`, `RP-13`, `RP-14`. Exit: Context, zero/clear, ownership, transport, scheduler and outstanding auth/focus regressions are closed. Start independent items as dependencies allow.
- **W3: Finish settings, coexistence and usable flows.** `RP-15`, `RP-16`, `RP-17`. Exit: Safe settings outcomes, writer ownership, uninstall policy and critical UX are proven in the source/test environment.
- **W4: Freeze tested source and package privately.** `RP-18`, `RP-19`. Exit: All required automated gates pass; uniquely identified private artifacts contain the fixes and leave public assets untouched.
- **W5: Prove installed reality and hand off.** `RP-20`, `RP-21`. Exit: Approved installed, real game and dedicated evidence is attached; private tester decision is signed.

### 4.3 Integration constraints

- `FS25_FarmDashboard_App/main.js` has multiple package owners contributing changes; one integration owner serializes edits to shared sections.
- `FarmDashboardDataCollector.lua` is shared by persistence, section outcomes and cadence work; the mod owner integrates those changes against the RP-02 contract.
- Frontend data, hydration, auth and settings packages may run concurrently only when their store/context interfaces are stable.
- RP-18 depends on all implementation packages. RP-19 must package its frozen verified identity, and RP-20 must install those exact bytes.
- The likely critical chain is contracts -> safe persistence -> provenance -> livestock truth -> UX/integration -> private packaging -> installed/dedicated acceptance. Actual dependencies, not package numbering alone, govern starts.

### 4.4 Planning allowances

The package allowances sum to **31.75-63.5 engineering person-days** if all described work remains necessary. This is an estimate, not a delivery promise.

Planning allowances if the described work remains necessary, not a quote or measured schedule. Includes package-level engineering/test effort, excludes external waiting, certificate procurement and unpredictable hosting/game availability.

Re-estimate after RP-00 reproduction. Already implemented fixes can reduce effort substantially; do not bill or schedule a full rewrite by default.

Backend/security, frontend and mod work can proceed in parallel after RP-02, but main.js and shared collectors need one integration owner. Dependency chains and booked installed/dedicated windows determine elapsed time.

Hold a separate risk allowance only after baseline reproduction. Do not hide arbitrary contingency inside a promised completion date.

Elapsed calendar time depends on staffing, serial integration, signing access and the booked game/dedicated window. Do not translate the sum directly into a multi-person completion date.

## 5. Detailed work packages

Common entry rule: reproduce the specific issue against current production code first. If already fixed, retain it, add its missing proof and skip the rewrite. Common exit rule: record expected/actual results, build identity and residual gaps; do not promote installed/live status from source tests.

### RP-00. Freeze identity, scope and the closure ledger

**Owner:** Release/integration owner. **Allowance:** 0.5-1 person-days.
**Dependencies:** None; starting package.
**Scope:** Cross-cutting execution/release gate.
**Status:** Planned; reproduce against current production code before editing.

**Outcome:** Establish which workspace, installed application and private artifact each claim applies to, without overwriting earlier evidence.

#### File and artifact targets

- Existing target: [docs/_internal/audits/2026-09-05-remediation-reaudit.md](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit.md)
- Existing target: [docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-remediation-reaudit-evidence.txt)
- Proposed new target: [docs/_internal/audits/remediation-execution/closure-ledger.json](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/remediation-execution/closure-ledger.json)
- Proposed new target: [docs/_internal/audits/remediation-execution/baseline-manifest.json](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/remediation-execution/baseline-manifest.json)

#### Ordered implementation steps

1. **RP-00-S01:** Name the integration, backend/security, frontend, mod and acceptance owners. One person may cover several roles; assign one decision-maker and one independent reviewer for each high-risk change.
2. **RP-00-S02:** Preserve the 2026-09-05 coexist bundle and existing audit unchanged. Create a new private execution directory with a unique build/run identifier; never reuse the remediation-b folder as an interchangeable baseline.
3. **RP-00-S03:** Record application version, mod version, private build identifier, source snapshot identifier, dependency lock hashes, runtime version, artifact hashes and evidence date as separate fields. A matching version label does not prove matching bytes.
4. **RP-00-S04:** Populate the closure ledger with the 29 actionable findings, 11 not-reverified findings, five candidate checks and four conditional risks. Retain their original certainty and severity rather than converting uncertainty into either a pass or a new confirmed defect.
5. **RP-00-S05:** At implementation time inspect the current affected production files once, compare behavior with the retained candidate evidence and classify each item as reproduced, already fixed in workspace, packaged-only discrepancy or unresolved.
6. **RP-00-S06:** Record the actual installed executable and loaded ASAR identity separately from development port 8767. Do not use the already observed development pasture snapshot as installed acceptance evidence.
7. **RP-00-S07:** Create synthetic fixtures with stable IDs and redacted connection metadata. Do not copy passwords, access codes, full personal profiles or active Save 1 contents into the repository.
8. **RP-00-S08:** Define a disposable Windows profile and test-save location for subsequent installation and destructive acceptance. Document which directories belong to the test before permitting any cleanup.
9. **RP-00-S09:** Record the protected public boundary: Classic 4.2.1 with mod 3.4.0.7 remains the public story. The existing Classic 4.2.2/mod 3.4.0.8 and RF 5.0.1/mod 5.0.0.1 bundle is private evidence, not a release approval.
10. **RP-00-S10:** Agree the scope and decisions in the decision register before schema, authentication or shared-writer changes. Re-estimate after reproduction, subtracting work already demonstrably implemented.

#### Concrete acceptance cases

##### RP-00-AC01. No version-label substitution

**Arrange:** Two private artifacts have the same visible version but different hashes.
**Action:** Register both in the ledger.
**Expected:** They remain distinct builds; evidence cannot close the other build's installed gate.

##### RP-00-AC02. Complete and honest baseline

**Arrange:** The retained 29 findings, 11 unresolved prior findings, five candidate checks and four conditional risks.
**Action:** Create the initial closure ledger.
**Expected:** Every item has an owner, primary package, acceptance reference and certainty; none is marked complete by planning.

##### RP-00-AC03. Workspace versus installed distinction

**Arrange:** A fixed workspace helper and an older installed executable.
**Action:** Record both identities.
**Expected:** The state is fixed in workspace / installed unverified, not globally fixed.

##### RP-00-AC04. Safety boundaries

**Arrange:** A disposable profile and the user's active profile coexist.
**Action:** Prepare the test inventory.
**Expected:** Only explicitly owned test paths are eligible for mutation or deletion; public release assets and active saves are excluded.

##### RP-00-AC05. Sensitive evidence

**Arrange:** Fixtures include example connection settings.
**Action:** Prepare the evidence packet.
**Expected:** Secrets are replaced with synthetic values; retained hashes and source identity remain sufficient for reproduction.

#### Deliverables

- Immutable baseline manifest
- Complete closure ledger
- Owner and environment register

#### Exit gate

All later work has an exact baseline, explicit owner and safe target; no implementation or release status is inferred from the plan.

#### Compatibility and implementation risks

- Existing changes may already close some cases; rewriting them would add unnecessary risk.
- Source line numbers in packaged audit evidence are not automatically workspace line numbers.

#### Safe rollback postconditions

- Keep all historical evidence. Correct a mistaken ledger entry through a dated amendment, not by replacing the original artifact.
- If target ownership is uncertain, pause the affected install/write test and preserve the user's environment.

### RP-01. Make the test gates exercise real production code

**Owner:** Test/release owner with frontend and mod support. **Allowance:** 1-2 person-days.
**Dependencies:** `RP-00`.
**Scope:** `R2-REL-01`, `R2-REL-02`, `R3-REL-03`.
**Status:** Planned; reproduce against current production code before editing.

**Outcome:** Replace vacuous passes and copied algorithms with reproducible, assertion-based tests tied to the shipped implementation.

#### File and artifact targets

- Existing target: [FS25_FarmDashboard_App/package.json](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/package.json)
- Existing target: [FS25_FarmDashboard_App/package-lock.json](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/package-lock.json)
- Existing target: [tools/check-lua-syntax.mjs](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/tools/check-lua-syntax.mjs)
- Existing target: [FS25_FarmDashboard_App/tests/mergeTransientPool.integration.test.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/tests/mergeTransientPool.integration.test.js)
- Existing target: [FS25_FarmDashboard_App/tests/httpFeedXml.test.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/tests/httpFeedXml.test.js)
- Existing target: [FS25_FarmDashboard_App/tests/pastureStockSummary.test.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/tests/pastureStockSummary.test.js)
- Existing target: [NEW APP/package.json](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/package.json)
- Proposed new target: [NEW APP/src/lib/__tests__/livestock-lifecycle.test.tsx](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/__tests__/livestock-lifecycle.test.tsx)
- Proposed new target: `C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/tests/audit-regressions/`

#### Ordered implementation steps

1. **RP-01-S01:** Check how the Lua checker resolves luaparse. Declare the parser in the application package whose dependency tree the checker actually uses, update its lockfile using the package manager and avoid relying on a globally installed or hoisted copy.
2. **RP-01-S02:** Confirm the supported Lua dialect, BOM handling and parser options against the local game reference. Enumerate the intended source set through the existing build rules and make a zero-file parse an error.
3. **RP-01-S03:** Make the Lua gate report parsed file count, exclusions with reasons and syntax failures. A checker that fails to load is blocked, never a successful zero-error run.
4. **RP-01-S04:** Replace the missing-vehicle early return in the transient-pool test with a deterministic owned fixture and a failing precondition assertion. Keep external integration dependence out of the ordinary hermetic test.
5. **RP-01-S05:** Split optional live HTTP integration from required local protocol coverage. Use an explicit reported skip for an unavailable external environment, and fail when a required CI integration environment is absent.
6. **RP-01-S06:** Replace the copied pasture summary algorithm with an import of production TypeScript or a production module consumed by both the UI and tests. Do not keep a second implementation as the test oracle.
7. **RP-01-S07:** Adopt the existing compatible TS-aware runner and actual Preact DOM/effect semantics for frontend lifecycle cases. If the current runner cannot provide this, select and lock a compatible addition during implementation rather than simulating hooks.
8. **RP-01-S08:** Port the retained diagnostic counterexamples into tests that import the current production modules and assert expected safe behavior. Keep the original frozen diagnostic scripts as historical evidence only.
9. **RP-01-S09:** Add reusable deferred promises, fake clocks, temporary filesystem roots, controllable HTTP streams and instrumented fake FS25 adapters. Give every fixture stable IDs and explicit setup/teardown ownership.
10. **RP-01-S10:** Run a clean dependency installation in a disposable checkout only when implementation/testing is authorized. Record runner versions, commands, pass/fail/skip counts and environment prerequisites.
11. **RP-01-S11:** Ensure the regression gate runs the intended new test files and fails on missing fixture files, zero selected tests or an unexpected required skip. Do not increase confidence solely by increasing the total test count.

#### Concrete acceptance cases

##### RP-01-AC01. Lua dependency reproducibility

**Arrange:** A clean application dependency installation with no global luaparse.
**Action:** Run the declared Lua syntax command.
**Expected:** The parser resolves locally and parses the nonzero intended file set.

##### RP-01-AC02. Lua gate fails meaningfully

**Arrange:** An isolated temporary Lua fixture contains a syntax error.
**Action:** Run the parser against the fixture.
**Expected:** The command fails with the fixture path and actionable diagnostic; no product Lua file is intentionally corrupted.

##### RP-01-AC03. Required transient fixture

**Arrange:** The fixture is present, then separately removed in an isolated test.
**Action:** Run the integration assertion.
**Expected:** The normal case checks the expected vehicle; missing required data fails instead of returning success.

##### RP-01-AC04. Optional integration reporting

**Arrange:** No live Giants HTTP feed is configured.
**Action:** Run hermetic and optional integration groups.
**Expected:** Hermetic protocol cases run; the external case is visibly skipped with a reason, not counted as exercised.

##### RP-01-AC05. Production summary import

**Arrange:** The real summary module receives a zero-health fixture.
**Action:** Run the summary test and an isolated mutation/sensitivity check.
**Expected:** The assertion depends on the production function and fails when the relevant behavior is deliberately changed in a disposable test environment.

##### RP-01-AC06. Real effect ordering

**Arrange:** Actual Preact mounts the production hydration hook with deferred network promises.
**Action:** Switch contexts and settle responses out of order.
**Expected:** The real lifecycle is exercised; no custom scheduler substitutes for Preact semantics.

##### RP-01-AC07. Diagnostic exit-code trap

**Arrange:** A retained diagnostic prints a counterexample and exits 0.
**Action:** Prepare release evidence.
**Expected:** It is labeled diagnostic evidence, never accepted as the regression suite for corrected code.

#### Deliverables

- Locked parser dependency and working Lua gate
- Production-linked regression harness
- Explicit integration skip policy

#### Exit gate

Required tests execute assertions against production code; clean-install Lua parsing and frontend lifecycle tests work.

#### Compatibility and implementation risks

- Adding a second frontend runner can create duplicate setup and slow CI; reuse the current stack where possible.
- Do not install a parser version or choose a Lua dialect without compatibility evidence.

#### Safe rollback postconditions

- Revert only the test infrastructure change being rolled back; preserve regression fixtures and document any temporarily blocked gate.
- A broken test runner blocks candidate sign-off; do not bypass it by removing the gate.

### RP-02. Specify context, freshness, errors and persistence contracts

**Owner:** Backend/domain integration owner. **Allowance:** 1-2 person-days.
**Dependencies:** `RP-00`, `RP-01`.
**Scope:** Cross-cutting execution/release gate.
**Status:** Planned; reproduce against current production code before editing.

**Outcome:** Give every layer the same definitions of identity, newer data, authoritative empty results, unknown values and successful writes.

#### File and artifact targets

- Proposed new target: [docs/_internal/audits/remediation-execution/data-and-trust-contracts.md](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/remediation-execution/data-and-trust-contracts.md)
- Existing target: [FS25_FarmDashboard_App/detailAnimalsHydrate.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/detailAnimalsHydrate.js)
- Existing target: [FS25_FarmDashboard_App/mergedSnapshotHold.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/mergedSnapshotHold.js)
- Existing target: [NEW APP/src/store/dashboard-store.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/store/dashboard-store.ts)
- Existing target: [NEW APP/src/services/ws-client.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/services/ws-client.ts)
- Existing target: [FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua)

#### Ordered implementation steps

1. **RP-02-S01:** Define a context identity from configured source/server, save identity, farm scope and source epoch using fields actually available in the application and game. Document any fallback whose uniqueness is weaker than a durable save ID.
2. **RP-02-S02:** Define a monotonic source revision within an epoch and a local request sequence within a selected context. Never sort opaque UUIDs or compare unrelated wall clocks to establish payload ordering.
3. **RP-02-S03:** Specify how legacy unstamped exports are handled. Persist original observation metadata and display unknown or limited-confidence age; a reread or restart must not silently create a new source production time.
4. **RP-02-S04:** Separate producedAt, receivedAt, lastValidatedAt and displayed age. Record units and clock domains explicitly; game elapsed seconds are not UTC timestamps.
5. **RP-02-S05:** Specify section outcomes as successful data, authoritative empty, omitted, failed or disabled. These names are proposed contract labels, not claims about fields already present in the product.
6. **RP-02-S06:** Specify generation-scoped clear/tombstone semantics. A successful empty section clears current and persisted detail; a failed or omitted section may retain last-known-good data only with visible stale/unknown status.
7. **RP-02-S07:** Define detail provenance: context, pen identity, summary generation, detail generation and authoritative count. Define compatibility and bounded refresh behavior when a legacy producer cannot supply each field.
8. **RP-02-S08:** Define a structured error taxonomy separating authentication rejection, authorization failure, path missing, permission denied, transport outage, timeout, cancellation, malformed data and partial persistence.
9. **RP-02-S09:** Define write success as validated committed bytes plus truthful completion metadata. Define cancellation and stale-generation behavior immediately before commit, crash recovery and whether multiple files can be committed transactionally.
10. **RP-02-S10:** Document additive schema rollout and old/new compatibility. Readers tolerate explicitly supported old schemas; writers avoid silently changing meaning under existing field names.
11. **RP-02-S11:** Agree proposed acceptance thresholds, writer ownership and auth policy before implementation. Record the rationale and the consuming modules so later fixes do not diverge into local heuristics.

#### Concrete acceptance cases

##### RP-02-AC01. Identity collision

**Arrange:** Two saves share a pen ID and farm number.
**Action:** Construct their proposed context keys.
**Expected:** They remain distinct; detail and selections cannot cross contexts.

##### RP-02-AC02. Epoch reset

**Arrange:** A new source epoch starts at revision 1 after an old epoch reached 500.
**Action:** Apply the ordering contract.
**Expected:** The new epoch is accepted deliberately; revision comparison does not permanently reject it or merge old detail.

##### RP-02-AC03. Clock-domain separation

**Arrange:** Game elapsed time and a UTC receipt timestamp coexist.
**Action:** Calculate freshness.
**Expected:** No game-time value is interpreted as a real-world production date.

##### RP-02-AC04. Empty versus failure

**Arrange:** One collector returns successful empty data and another throws.
**Action:** Apply section retention rules.
**Expected:** Only authoritative empty clears; failure retains last-known-good with degraded status.

##### RP-02-AC05. Unknown versus zero

**Arrange:** Health is 0, null, omitted and nonfinite in separate fixtures.
**Action:** Normalize and render each value.
**Expected:** Measured 0 remains 0; unknown values stay unknown rather than healthy defaults.

##### RP-02-AC06. Legacy compatibility

**Arrange:** A supported older export has no generation or producedAt.
**Action:** Read, persist and restart.
**Expected:** It remains readable under a documented low-confidence policy; age is not renewed as if the mod produced new data.

#### Deliverables

- Versioned cross-layer contract
- Compatibility and clock-domain examples
- Error and persistence postconditions

#### Exit gate

Backend, frontend and mod owners approve one contract and the corresponding fixture shapes before dependent patches diverge.

#### Compatibility and implementation risks

- A schema that invents unavailable FS25 identity or timestamps cannot be implemented reliably.
- Treating all empty objects as deletion can destroy useful last-known-good information.

#### Safe rollback postconditions

- Roll back only to a reader compatible with the persisted schema or use an explicitly reviewed migration.
- Never restore an old snapshot over newer authoritative clears without a deliberate recovery operation.

### RP-03. Close HTTP, WebSocket, navigation and IPC trust boundaries

**Owner:** Backend/security owner. **Allowance:** 1.5-3 person-days.
**Dependencies:** `RP-02`.
**Scope:** `R2-SEC-01`, `R3-SEC-06`, `C1`, `C2`.
**Status:** Planned; reproduce against current production code before editing.

**Outcome:** Make browser-origin rejection and privileged desktop sender validation consistent across every relevant entry point.

#### File and artifact targets

- Existing target: [FS25_FarmDashboard_App/main.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js)
- Existing target: [FS25_FarmDashboard_App/preload.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/preload.js)
- Existing target: [FS25_FarmDashboard_App/editionPolicy.cjs](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/editionPolicy.cjs)
- Proposed new target: [FS25_FarmDashboard_App/tests/audit-regressions/trust-boundaries.test.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/tests/audit-regressions/trust-boundaries.test.js)

#### Ordered implementation steps

1. **RP-03-S01:** Inventory sensitive HTTP routes, WebSocket upgrade paths and every privileged IPC handler exposed by preload. Record required capability, allowed caller and side effects for each; include reads that disclose configuration.
2. **RP-03-S02:** Represent a missing Origin, the literal opaque origin null, malformed values and a valid origin as distinct parse results. Never collapse an invalid browser origin into the no-Origin native-client path.
3. **RP-03-S03:** Enforce explicit accepted origin rules for browser HTTP and WebSocket traffic. Keep origin validation separate from authentication; CORS headers alone are not write authorization.
4. **RP-03-S04:** Define the no-Origin client policy per route. Privileged writes require the approved app-session/admin capability or an explicitly documented narrow exception, not merely a loopback network address.
5. **RP-03-S05:** Tie desktop IPC authorization to the expected BrowserWindow/webContents, main frame and exact trusted loaded document. Apply the guard before validation or side effects on every privileged handler.
6. **RP-03-S06:** Replace basename-only index.html/setup.html trust with canonical packaged paths. For development, allow only the explicitly configured scheme, host and effective port, never an omitted port treated as the application port.
7. **RP-03-S07:** Unify navigation, redirect and new-window policy with the IPC document policy. Route approved external URLs through the intended external opener without making them trusted privileged documents.
8. **RP-03-S08:** Define proxy behavior explicitly. Unless a deployment is configured and tested for proxy trust, do not treat rewritten localhost Host or forwarding headers as proof of a privileged local caller.
9. **RP-03-S09:** Add redacted denial diagnostics that identify the boundary and reason without logging tokens or credentials. Return structured errors that the UI can recover from.
10. **RP-03-S10:** Exercise all entry points with synthetic senders and a local test server, then test actual Electron navigation/frame boundaries in a disposable profile. Preserve the distinction between a permissive helper and proven hostile-document reachability.

#### Concrete acceptance cases

##### RP-03-AC01. Opaque and malformed origins

**Arrange:** Loopback write and WebSocket requests carry Origin:null, malformed Origin and a hostile HTTPS origin.
**Action:** Attempt each protected operation.
**Expected:** Every disallowed browser origin is rejected before state change or WebSocket upgrade.

##### RP-03-AC02. Explicit native-client policy

**Arrange:** A request has no Origin and has either a valid app capability or no authorization.
**Action:** Invoke a privileged write.
**Expected:** The approved native path works; absence of Origin alone grants no new privilege.

##### RP-03-AC03. Exact IPC sender

**Arrange:** An expected main frame, a child frame and a different webContents invoke each privileged channel.
**Action:** Run the handler matrix.
**Expected:** Only the authorized sender/document combination reaches the operation; denial has no filesystem or configuration side effect.

##### RP-03-AC04. Outside file documents

**Arrange:** C:\Temp\index.html and C:\Temp\setup.html are used as synthetic sender URLs.
**Action:** Apply document and navigation policy.
**Expected:** They are rejected despite matching basenames; actual packaged documents remain usable.

##### RP-03-AC05. Effective port handling

**Arrange:** Use localhost with no explicit port, port 80, configured edition port and development port.
**Action:** Apply the environment-specific allowlist.
**Expected:** Only explicitly authorized scheme/host/effective-port combinations pass.

##### RP-03-AC06. Proxy ambiguity

**Arrange:** A synthetic proxy preserves Host, rewrites Host to localhost, and supplies untrusted forwarding headers.
**Action:** Call protected endpoints under default and explicitly configured proxy policies.
**Expected:** No unconfigured proxy path acquires native privilege; any supported policy is authenticated and documented.

##### RP-03-AC07. Normal desktop journeys

**Arrange:** Open setup, dashboard, image export, configuration read/write and approved external links.
**Action:** Use authorized app windows.
**Expected:** Legitimate flows still work without broadening sender trust.

##### RP-03-AC08. Reachability accounting

**Arrange:** A helper rejects hostile URLs but no hostile document has been loaded.
**Action:** Close the security ledger entry.
**Expected:** Helper, route and actual Electron coverage are recorded separately; no exploit claim is invented.

#### Deliverables

- Complete boundary/capability inventory
- Centralized authorization policy
- Production-linked HTTP/WS/IPC regression matrix

#### Exit gate

Opaque origins cannot inherit native trust and every privileged bridge operation is bound to the exact authorized sender; supported proxy behavior is explicit.

#### Compatibility and implementation risks

- Tightening loopback assumptions can break third-party native clients; compatibility must use explicit authorization rather than restoring implicit privilege.
- Origin handling is not a substitute for authentication, and helper tests alone do not establish Electron reachability.

#### Safe rollback postconditions

- If a compatibility regression appears, disable the affected exposure or retain the prior safe private build while fixing it.
- Do not roll back by accepting malformed origins, arbitrary file documents or unauthenticated proxy writes.

### RP-04. Contain remote filenames and map-source lookups

**Owner:** Backend/security owner. **Allowance:** 0.75-1.5 person-days.
**Dependencies:** `RP-02`.
**Scope:** `R2-SEC-02`, `R2-SEC-03`.
**Status:** Planned; reproduce against current production code before editing.

**Outcome:** Prevent untrusted FTP entries or map identifiers from selecting, creating or copying files outside their intended roots.

#### File and artifact targets

- Existing target: [FS25_FarmDashboard_App/main.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js)
- Existing target: [FS25_FarmDashboard_App/livestockDetail.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/livestockDetail.js)
- Existing target: [FS25_FarmDashboard_App/safeFsIdentity.cjs](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/safeFsIdentity.cjs)
- Existing target: [FS25_FarmDashboard_App/mapOverviewResolver.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/mapOverviewResolver.js)
- Proposed new target: [FS25_FarmDashboard_App/tests/audit-regressions/path-containment.test.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/tests/audit-regressions/path-containment.test.js)

#### Ordered implementation steps

1. **RP-04-S01:** Document the legitimate FTP animal-detail filename grammar from actual exporters and supported legacy files. Validate the entire basename before any join, stat, temporary-file creation or transfer.
2. **RP-04-S02:** Reject both separator styles, dot segments, absolute/drive-relative paths, UNC forms, alternate data streams, control characters and invalid encoding forms. Decode at most once at the defined protocol boundary.
3. **RP-04-S03:** Use a shared contained-path resolver with Windows case and separator semantics. Verify the resolved path stays under the intended root rather than relying on prefix/suffix string checks.
4. **RP-04-S04:** Where untrusted child paths can encounter symlinks or reparse points, define and test real-path containment and race-resistant opening appropriate to the actual filesystem capabilities.
5. **RP-04-S05:** Apply equivalent containment to temporary and backup names. Generate those names locally rather than trusting a remote filename extension to determine a destination.
6. **RP-04-S06:** For overview lookup, validate the raw map identifier and every source candidate before opening or copying. Safe output renaming does not make an unsafe source lookup acceptable.
7. **RP-04-S07:** Preserve legitimate custom-map resolution and pen identifiers through an explicit compatibility grammar. Do not sanitize rejected inputs into another user's valid cache key.
8. **RP-04-S08:** Return a structured invalid-source error and redacted log entry. Continue safe entries only where the batch policy explicitly permits partial results.
9. **RP-04-S09:** Reproduce the earlier map lookup case first; if the current source already blocks it, retain the production regression and mark workspace closure without unnecessary code changes.

#### Concrete acceptance cases

##### RP-04-AC01. Windows traversal

**Arrange:** An FTP listing contains animals_..\..\outside.json and equivalent slash variants.
**Action:** Process the listing in a temporary root.
**Expected:** Every escaping name is rejected before I/O; an outside sentinel file is untouched.

##### RP-04-AC02. Path syntax matrix

**Arrange:** Drive, UNC, drive-relative, ADS, dot-segment and encoded-separator names are supplied.
**Action:** Resolve candidate destinations.
**Expected:** No invalid form becomes a valid contained filename through partial sanitization.

##### RP-04-AC03. Legitimate export names

**Arrange:** Current and supported legacy exporter filenames are supplied.
**Action:** Download through the production resolver.
**Expected:** Valid details retain their correct pen association and contained destination.

##### RP-04-AC04. Map source escape

**Arrange:** A raw map identifier points toward an outside overview fixture.
**Action:** Resolve an overview image.
**Expected:** The outside source is never selected or returned; legitimate custom-map fixtures still resolve.

##### RP-04-AC05. Reparse-point boundary

**Arrange:** A disposable child path resolves through a test reparse point where the environment supports it.
**Action:** Attempt source read and cache write.
**Expected:** The documented containment policy prevents outside access; unsupported test environments report a real skip, not a pass.

##### RP-04-AC06. Temporary-name containment

**Arrange:** A valid remote filename is accompanied by a malicious suggested temporary suffix.
**Action:** Stage a transfer.
**Expected:** Only a locally generated contained temporary path is used.

#### Deliverables

- Shared validation/containment rules
- FTP and overview regression fixtures
- Legacy filename compatibility list

#### Exit gate

No untrusted entry can select an outside source or destination, including temporary and recovery files.

#### Compatibility and implementation risks

- An overly narrow grammar can reject genuine custom maps or legacy pens; use real supported fixtures.
- Filesystem race resistance depends on the platform; do not claim a stronger guarantee than tested.

#### Safe rollback postconditions

- Keep invalid-source rejection enabled. If compatibility needs expansion, add a narrowly tested accepted case rather than a permissive fallback.
- Preserve rejected-entry diagnostics without storing sensitive remote directory listings.

### RP-05. Preserve last-good desktop data through failed replacement

**Owner:** Backend/persistence owner. **Allowance:** 1.5-3 person-days.
**Dependencies:** `RP-02`, `RP-04`.
**Scope:** `R3-PIPE-09`.
**Status:** Planned; reproduce against current production code before editing.

**Outcome:** Make desktop cache replacement recoverable on write, rename, cancellation and process-crash failures.

#### File and artifact targets

- Existing target: [FS25_FarmDashboard_App/main.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js)
- Existing target: [FS25_FarmDashboard_App/livestockDetail.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/livestockDetail.js)
- Proposed new target: [FS25_FarmDashboard_App/fileCommit.cjs](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/fileCommit.cjs)
- Proposed new target: [FS25_FarmDashboard_App/tests/audit-regressions/file-commit.test.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/tests/audit-regressions/file-commit.test.js)

#### Ordered implementation steps

1. **RP-05-S01:** Identify every desktop download-to-final path, including both FTP XML and animal detail. Route them through one production commit abstraction rather than fixing only the reproduced branch.
2. **RP-05-S02:** Define the supported Windows replacement operation and recovery protocol. Confirm overwrite/rename behavior with actual filesystem tests during implementation; do not assume POSIX atomic replacement semantics.
3. **RP-05-S03:** Stage into a unique same-directory temporary file with restrictive appropriate access. Check context cancellation and destination ownership before starting and immediately before the irreversible commit step.
4. **RP-05-S04:** Complete and validate the staged payload before replacing the final file. Apply the relevant size, parse/schema and expected-source checks; do not declare a truncated JSON/XML transfer fresh.
5. **RP-05-S05:** Never unlink the last-good destination merely to make rename succeed. Use a tested replacement/backup protocol that preserves a recoverable last-good copy until committed bytes are confirmed.
6. **RP-05-S06:** Bound retry/backoff for sharing violations and permission errors. Surface a degraded/stale state when replacement fails instead of looping forever or announcing fresh data.
7. **RP-05-S07:** If the chosen Windows protocol has multiple steps, record enough recovery state to distinguish staged, backed-up and committed states after a crash. Keep recovery files contained and associated with the exact context.
8. **RP-05-S08:** Advance cache generation and freshness metadata only after successful commit. A canceled old poll must not publish a file or metadata after a new source configuration is active.
9. **RP-05-S09:** Implement startup recovery for each interrupted state and a bounded cleanup policy for obsolete temporary files. Never delete ambiguous recovery data until a valid final or recoverable last-good file is identified.
10. **RP-05-S10:** Keep the prior retained diagnostic as a historical counterexample; add real temporary-filesystem and injected-failure tests against the production commit abstraction.

#### Concrete acceptance cases

##### RP-05-AC01. Original EACCES regression

**Arrange:** A valid final file exists and replacement rename returns EACCES.
**Action:** Attempt a new FTP commit.
**Expected:** The original bytes remain available; the operation reports failure and does not advance freshness.

##### RP-05-AC02. Partial write or invalid body

**Arrange:** A staged transfer is truncated or cannot be parsed.
**Action:** Finish the download.
**Expected:** The staged file is not promoted; the valid final remains intact.

##### RP-05-AC03. Cancellation before commit

**Arrange:** An old context finishes its transfer after a new configuration becomes active.
**Action:** Reach the commit boundary.
**Expected:** The old generation cannot replace the current final or publish completion metadata.

##### RP-05-AC04. Crash-state recovery

**Arrange:** Construct each documented intermediate filesystem/journal state in a disposable root.
**Action:** Restart the recovery routine.
**Expected:** At least one valid known generation is preserved and chosen according to the recovery contract; no ambiguous last-good copy is discarded.

##### RP-05-AC05. Concurrent attempt isolation

**Arrange:** Two attempted transfers target one context while the scheduler is deliberately stressed.
**Action:** Stage and complete them in reverse order.
**Expected:** Temporary names cannot collide; the commit contract admits only the valid current generation.

##### RP-05-AC06. Bounded sharing violation

**Arrange:** A test handle temporarily prevents replacement, then remains locked in a second case.
**Action:** Apply retry policy.
**Expected:** Transient failure can recover; permanent failure settles within the declared bound and retains last-good bytes.

##### RP-05-AC07. Successful replacement

**Arrange:** A valid newer payload is fully staged.
**Action:** Commit and restart.
**Expected:** New bytes and their metadata agree; obsolete recovery files are cleaned only after success is established.

#### Deliverables

- Shared safe commit abstraction
- Crash recovery protocol and tests
- Truthful cache failure state

#### Exit gate

Every supported failed replacement leaves a valid last-good or explicitly recoverable copy; no success bookkeeping precedes committed bytes.

#### Compatibility and implementation risks

- Windows rename behavior, antivirus locks and crash ordering need real filesystem evidence.
- Cross-file transactions may not be available; represent partial outcomes rather than claiming atomicity.

#### Safe rollback postconditions

- Stop new transfers before rollback. Preserve final, staged, backup and journal files until their generations are reconciled.
- Restore a known-good application only with a compatible recovery reader; do not delete the new protocol's files blindly.

### RP-06. Make mod persistence and collector outcomes truthful

**Owner:** Mod owner. **Allowance:** 2-4 person-days.
**Dependencies:** `RP-01`, `RP-02`.
**Scope:** `R2-MOD-01`, `R2-MOD-06`, `C4`.
**Status:** Planned; reproduce against current production code before editing.

**Outcome:** Stop reporting successful exports or empty successful collections when the underlying game operation failed.

#### File and artifact targets

- Existing target: [FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua)
- Existing target: [FS25_FarmDashboard_Mod/src/FarmDashboardExportMirror.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardExportMirror.lua)
- Existing target: [FS25_FarmDashboard_Mod/src/FarmDashboardSettingsApi.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardSettingsApi.lua)
- Proposed new target: [docs/_internal/audits/remediation-execution/mod-io-contract.md](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/remediation-execution/mod-io-contract.md)
- Proposed new target: `C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/tests/fixtures/mod-io/`

#### Ordered implementation steps

1. **RP-06-S01:** Consult the local FS25 wiki, extracted scripts, LUADOC and examples for every copy, move, write, close and saveFile operation used by the exporter. Record exact signatures and return conventions before changing checks.
2. **RP-06-S02:** Create a persistence result adapter that distinguishes thrown errors, documented failure returns and successful completion. A nonthrowing pcall alone is not proof of a successful write.
3. **RP-06-S03:** Propagate copy/move results instead of discarding them. Never delete the source temporary file merely because a destination already exists from an older generation.
4. **RP-06-S04:** Check write and close outcomes according to the actual API contract. Where an API has no reliable success return, use a supported verification or explicitly report uncertainty/failure rather than inventing a boolean convention.
5. **RP-06-S05:** Unify normal, fallback, direct, atomic and mirror export paths under the same postconditions. Remove unsafe in-place fallback behavior that can damage the last-good export while reporting success.
6. **RP-06-S06:** Advance exported-generation markers, dirty-state clearing and success timestamps only after the correct payload is committed. Preserve retryable dirty work on failure.
7. **RP-06-S07:** Represent collector failure, successful empty data, omitted sections and disabled collectors distinctly. Catch failures at a boundary that preserves useful diagnostics without relabeling them as empty success.
8. **RP-06-S08:** Allow healthy sections to progress only under the agreed section-level contract; display stale retained sections honestly. Avoid an all-or-nothing policy that silently starves otherwise valid updates.
9. **RP-06-S09:** Trace all request polling and detail-rotation paths. Inject sustained collector failure to determine whether freshness-gated cycle tails are the only servicing path; if so, move servicing to an independent bounded cadence.
10. **RP-06-S10:** Add deterministic adapter-level fault cases, then schedule real game validation against a copied test save. Do not fault-inject disk operations against the user's active Save 1.
11. **RP-06-S11:** Validate both Classic and RF mod packaging against the corrected shared source and edition-specific configuration. A correction in one ZIP does not prove the other ZIP contains it.

#### Concrete acceptance cases

##### RP-06-AC01. Nonthrowing copy failure

**Arrange:** The documented copy adapter reports failure while an old destination already exists.
**Action:** Run export replacement.
**Expected:** Failure propagates; old bytes and retryable source bytes survive; generation does not advance.

##### RP-06-AC02. Write and close failure

**Arrange:** Inject supported write failure and close failure independently.
**Action:** Run each export path.
**Expected:** No path reports success or clears dirty work; last-good data is preserved under the contract.

##### RP-06-AC03. Move fallback failure

**Arrange:** Primary replacement fails and fallback copy also fails.
**Action:** Run recovery.
**Expected:** The source is not deleted and an explicit failure is surfaced.

##### RP-06-AC04. Successful empty collection

**Arrange:** A valid collector returns zero entities.
**Action:** Export and ingest the section.
**Expected:** The result is authoritative empty and clears previous entities rather than being treated as a failure.

##### RP-06-AC05. Thrown collector failure

**Arrange:** A collector throws after a previous valid generation.
**Action:** Continue the scheduler.
**Expected:** Last-known-good data remains marked stale; no empty-success payload falsely clears it.

##### RP-06-AC06. Persistent failure servicing

**Arrange:** One collector fails across many cycles while detail requests are queued.
**Action:** Advance the real scheduler fixture and later a test game.
**Expected:** Request handling meets the agreed independent bound or the risk remains open with traced evidence.

##### RP-06-AC07. Mirror parity

**Arrange:** Primary and mirror paths encounter the same controlled I/O failures.
**Action:** Run both paths.
**Expected:** Both use the same truthful completion contract; mirror existence alone is not accepted as current success.

##### RP-06-AC08. Actual FS25 contract

**Arrange:** The adapter is exercised in the approved game/reference environment.
**Action:** Compare observed outcomes with the documented API contract.
**Expected:** No invented return convention or unsupported filesystem operation is relied upon.

##### RP-06-AC09. Both mod artifacts

**Arrange:** Corrected Classic and RF ZIPs are built privately later.
**Action:** Inspect their packaged source identities.
**Expected:** Both carry the intended persistence/outcome fix and their own correct edition metadata.

#### Deliverables

- Documented FS25 I/O adapter contract
- Unified mod persistence result propagation
- Explicit collector outcome model and scheduler evidence

#### Exit gate

No mod path advances success on an unsuccessful write, and collector failures cannot masquerade as authoritative empty data.

#### Compatibility and implementation risks

- Changing exporter semantics affects backend retention and must follow RP-02 compatibility rules.
- Real engine filesystem behavior cannot be certified by mocked Lua adapters alone.

#### Safe rollback postconditions

- Keep a known-good compatible private mod ZIP and its hash. Switch mods only after an approved game shutdown and backup of the test environment.
- If safe commit semantics cannot be achieved with a supported engine API, fail visibly and preserve existing exports instead of restoring unsafe success fallback.

### RP-07. Make bootstrap, refresh and save selection context-safe

**Owner:** Frontend data owner. **Allowance:** 1.5-3 person-days.
**Dependencies:** `RP-02`.
**Scope:** `R2-DATA-01`, `R2-DATA-02`, `R2-UX-01`, `CUA-04`.
**Status:** Planned; reproduce against current production code before editing.

**Outcome:** Keep the selected save and displayed data aligned across startup, late responses, setup round-trips and restarts.

#### File and artifact targets

- Existing target: [NEW APP/src/services/ws-client.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/services/ws-client.ts)
- Existing target: [NEW APP/src/services/api-client.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/services/api-client.ts)
- Existing target: [NEW APP/src/store/dashboard-store.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/store/dashboard-store.ts)
- Existing target: [NEW APP/src/main.tsx](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/main.tsx)
- Existing target: [NEW APP/src/app/AppTopBar.tsx](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/app/AppTopBar.tsx)
- Existing target: [NEW APP/src/setup/main.tsx](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/setup/main.tsx)
- Existing target: [NEW APP/src/platform/notifications.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/platform/notifications.ts)
- Proposed new target: [NEW APP/src/services/__tests__/context-ingestion.test.tsx](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/services/__tests__/context-ingestion.test.tsx)

#### Ordered implementation steps

1. **RP-07-S01:** Reproduce the two prior response-order races and discovery failure before modifying current code. If a current fix already works, add production-linked proof and retain it.
2. **RP-07-S02:** Capture configured source identity, save/farm context, context epoch and request sequence before every asynchronous request. Apply this to initial bootstrap as well as manual refresh and fallback polling.
3. **RP-07-S03:** Centralize ingestion so HTTP, WebSocket, cache hydration and reconnect cannot bypass the same context/revision checks. Reject obsolete completions before they update the store, notifications or derived caches.
4. **RP-07-S04:** Cancel obsolete requests on context change but retain post-await guards because cancellation is not guaranteed to prevent a late completion.
5. **RP-07-S05:** Order same-context payloads by the agreed source revision; where supported legacy data lacks a revision, use documented serialization/coalescing rules rather than treating completion order as freshness.
6. **RP-07-S06:** Persist the selected stable source/save identifier only when selection is valid. Do not use a visible label or array position as durable identity.
7. **RP-07-S07:** On startup or return from setup, restore the last selected available context, otherwise explain the fallback and select a valid configured context. Handle a removed save without showing another save's data beneath its label.
8. **RP-07-S08:** Distinguish successful discovery of zero configured servers from failed discovery. Handle status before body parsing and give 401/403, 503, malformed JSON and transport failure different recovery states.
9. **RP-07-S09:** Retry the full discovery/bootstrap sequence when appropriate so a 503 followed by 200 rebuilds the selector without a page reload. Bound retry with backoff and user-visible retry controls.
10. **RP-07-S10:** Keep old data visible only if clearly labeled as the previous or stale context during a transition; do not render it as fresh data for the newly selected save.
11. **RP-07-S11:** Add actual Preact/store integration cases covering splash dismissal, setup return, restart restoration and interleaved WS/HTTP delivery.

#### Concrete acceptance cases

##### RP-07-AC01. Late bootstrap A after B

**Arrange:** Delay initial save A beyond splash dismissal; configure save B.
**Action:** Switch to B, complete B, then complete A.
**Expected:** B remains selected with B's payload, derived state and notifications.

##### RP-07-AC02. Same-save reversed HTTP

**Arrange:** Two refreshes for one context have older and newer revisions.
**Action:** Complete the newer request first.
**Expected:** The later completion of the older request cannot decrease the displayed revision.

##### RP-07-AC03. WS overtakes HTTP

**Arrange:** An HTTP request is pending when a newer WS payload arrives.
**Action:** Ingest WS, then complete HTTP.
**Expected:** The newer WS generation remains authoritative.

##### RP-07-AC04. Discovery 503 recovery

**Arrange:** Discovery returns 503 and then 200 containing configured saves.
**Action:** Retry without reloading the window.
**Expected:** The save selector and dashboard recover; the first failure was not stored as a successful empty configuration.

##### RP-07-AC05. Discovery auth and malformed body

**Arrange:** Return 401, 403, 503 HTML and malformed successful JSON separately.
**Action:** Run bootstrap.
**Expected:** Each produces the appropriate recoverable state without an uncaught parse error or false empty list.

##### RP-07-AC06. Setup and restart persistence

**Arrange:** Select a non-default save and save unchanged setup.
**Action:** Return to the dashboard and restart the disposable profile.
**Expected:** The same valid save is restored; setup navigation does not overwrite the selection.

##### RP-07-AC07. Removed selection

**Arrange:** The saved context is removed from configuration.
**Action:** Restart discovery.
**Expected:** A documented valid fallback is chosen with clear explanation; no old payload is mislabeled.

##### RP-07-AC08. Cancellation race

**Arrange:** An aborted request still invokes its completion callback.
**Action:** Change context before it settles.
**Expected:** The identity/revision guard rejects it independently of abort success.

#### Deliverables

- Single identity-aware ingestion contract
- Durable selected-context behavior
- Discovery recovery states and real lifecycle tests

#### Exit gate

The two unverified P1/P2 data races are specifically closed and setup/restart never relabels stale data as the selected save.

#### Compatibility and implementation risks

- Abort alone is insufficient; every completion path must enforce identity.
- Request counters are not a substitute for source revisions when HTTP and WS overlap.

#### Safe rollback postconditions

- Preserve configured sources and the user's selected ID. A rollback may clear only incompatible derived caches with an explicit explanation.
- Do not roll back by disabling ordering guards or silently forcing every user to the first save.

### RP-08. Repair backend freshness, detail provenance and authoritative clears

**Owner:** Backend data owner. **Allowance:** 2-4 person-days.
**Dependencies:** `RP-02`, `RP-05`, `RP-06`.
**Scope:** `R2-PIPE-01`, `R2-PIPE-02`, `R2-PIPE-03`, `R2-PIPE-04`, `R2-PIPE-08`.
**Status:** Planned; reproduce against current production code before editing.

**Outcome:** Keep generation and source age intact from export to disk cache, merge, restart and detail response.

#### File and artifact targets

- Existing target: [FS25_FarmDashboard_App/main.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js)
- Existing target: [FS25_FarmDashboard_App/livestockDetail.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/livestockDetail.js)
- Existing target: [FS25_FarmDashboard_App/detailAnimalsHydrate.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/detailAnimalsHydrate.js)
- Existing target: [FS25_FarmDashboard_App/mergedSnapshotHold.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/mergedSnapshotHold.js)
- Existing target: [FS25_FarmDashboard_App/xmlCollector.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/xmlCollector.js)
- Proposed new target: [FS25_FarmDashboard_App/tests/audit-regressions/freshness-and-clears.test.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/tests/audit-regressions/freshness-and-clears.test.js)

#### Ordered implementation steps

1. **RP-08-S01:** Carry the RP-02 context, source epoch and generation metadata through cache envelopes and detail hydration instead of dropping generatedAt or its documented successor.
2. **RP-08-S02:** Separate remote/source freshness from local file receipt mtime. Persist original source and first-observed metadata so downloading or restarting cannot make unchanged stale data appear newly produced.
3. **RP-08-S03:** Define a bounded detail revalidation policy when a dirty index is missing or incomplete. Do not treat absence of the index as proof that every retained detail file is current forever.
4. **RP-08-S04:** Reject or refresh detail whose context/summary generation is incompatible. A successful authoritative zero pen must invalidate its old animal detail even when a disk cache still contains rows.
5. **RP-08-S05:** Replace generic empty-object hold logic with section outcome rules. Persist generation-scoped clears/tombstones so a legitimate clear survives process restart and snapshot restoration.
6. **RP-08-S06:** Preserve last-known-good data on failed or omitted collection only with an explicit degraded state. Avoid both silent resurrection and destructive clearing on transient failure.
7. **RP-08-S07:** Replace max-mtime plus total-size XML identity with a deterministic per-file identity covering the relevant paths. Decide whether content hashes are required for equal-size/equal-mtime changes and document the cost/guarantee.
8. **RP-08-S08:** Include every relevant section, including weather, in content-change detection or use a complete producer revision. Do not let an unchanged unrelated section suppress weather-only updates.
9. **RP-08-S09:** Migrate old persisted cache records conservatively. Missing provenance yields unknown/legacy confidence and bounded refresh, not manufactured current timestamps.
10. **RP-08-S10:** Use the RP-05 commit result as the only trigger to publish updated cache metadata. Prevent stale poller completions from writing new freshness records.
11. **RP-08-S11:** Test source restart, application restart, pen removal/recreation, network interruption and generation rollover together, not only a single read in memory.

#### Concrete acceptance cases

##### RP-08-AC01. Generation round-trip

**Arrange:** A detail payload contains context and generation metadata.
**Action:** Cache, hydrate, serialize and reload it.
**Expected:** The metadata survives every layer and remains associated with the correct pen.

##### RP-08-AC02. Zero pen versus retained detail

**Arrange:** An authoritative zero-head summary follows a cached two-animal detail.
**Action:** Hydrate and restart.
**Expected:** No old animals are emitted before or after restart; the clear remains authoritative.

##### RP-08-AC03. Missing dirty index

**Arrange:** An old cached detail exists and the index is absent.
**Action:** Advance the configured revalidation interval.
**Expected:** A bounded refresh occurs; local receipt mtime does not indefinitely suppress it.

##### RP-08-AC04. Legacy restart age

**Arrange:** A supported unstamped export is first observed, persisted and later reread after restart.
**Action:** Compute displayed freshness.
**Expected:** Original observation/unknown source-age semantics survive; restart does not claim a fresh mod export.

##### RP-08-AC05. Clear versus failed section

**Arrange:** One generation explicitly clears a section; another fails collection.
**Action:** Merge, persist and restore each fixture.
**Expected:** Clear removes old data permanently for that generation; failure retains labeled last-known-good data.

##### RP-08-AC06. Non-max XML change

**Arrange:** One XML file mtime changes 1000 to 2000 while another remains 9999 and total size remains 200.
**Action:** Compute the production fingerprint.
**Expected:** The relevant change is detected despite unchanged aggregate max/size.

##### RP-08-AC07. Equal metadata content change

**Arrange:** A relevant file changes bytes while size and timestamp are preserved.
**Action:** Apply the documented fingerprint strategy.
**Expected:** The advertised guarantee is met through hashing or an explicitly bounded revalidation policy; no stronger guarantee is claimed.

##### RP-08-AC08. Weather-only update

**Arrange:** Only weather changes in a frozen export generation.
**Action:** Run ingestion/change detection.
**Expected:** Weather updates are not suppressed by a hash that ignores weather.

##### RP-08-AC09. Epoch rollover and pen reuse

**Arrange:** A new save/source epoch reuses the same pen ID.
**Action:** Load old persisted caches and the new summary.
**Expected:** Old detail is not reused as current; refresh and confidence state follow the contract.

#### Deliverables

- Provenance-preserving cache schema
- Generation-scoped clear persistence
- Per-file XML change detection and bounded legacy refresh

#### Exit gate

No stale detail or legitimately cleared section can reappear through cache reuse, restart or an omitted dirty index.

#### Compatibility and implementation risks

- More complete fingerprints can increase I/O; measure representative save sizes and cache hash results safely.
- An old reader may not understand new tombstones; rollout and rollback must account for schema compatibility.

#### Safe rollback postconditions

- Retain pre-migration caches separately for diagnosis, but do not automatically restore them into a newer context.
- If migration fails, mark data unavailable/stale and rebuild derived cache from source rather than reviving known-cleared entities.

### RP-09. Unify truthful livestock counts, samples and hydration lifecycle

**Owner:** Frontend/domain owner with mod support. **Allowance:** 2-4 person-days.
**Dependencies:** `RP-06`, `RP-07`, `RP-08`.
**Scope:** `R3-DATA-05`, `R2-MOD-02`, `R2-DATA-03`, `R2-DATA-04`, `CUA-03`.
**Status:** Planned; reproduce against current production code before editing.

**Outcome:** Use one generation-aware livestock model that preserves measured zero, separates samples from population and refreshes correctly.

#### File and artifact targets

- Existing target: [NEW APP/src/lib/use-hydrated-livestock.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/use-hydrated-livestock.ts)
- Existing target: [NEW APP/src/lib/livestock-normalize.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/livestock-normalize.ts)
- Existing target: [NEW APP/src/lib/livestock-format.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/livestock-format.ts)
- Existing target: [NEW APP/src/lib/livestock-hydrate.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/livestock-hydrate.ts)
- Existing target: [NEW APP/src/lib/livestock-fanout.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/livestock-fanout.ts)
- Existing target: [NEW APP/src/lib/pastures-parsers.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/pastures-parsers.ts)
- Existing target: [NEW APP/src/lib/pastures-types.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/pastures-types.ts)
- Existing target: [NEW APP/src/sections/pastures/PasturesSection.tsx](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/sections/pastures/PasturesSection.tsx)
- Existing target: [NEW APP/src/sections/livestock/LivestockPenPanel.tsx](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/sections/livestock/LivestockPenPanel.tsx)
- Existing target: [NEW APP/src/sections/livestock/AnimalDetailsModal.tsx](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/sections/livestock/AnimalDetailsModal.tsx)
- Existing target: [FS25_FarmDashboard_Mod/src/collectors/AnimalDataCollector.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/AnimalDataCollector.lua)
- Proposed new target: [NEW APP/src/lib/__tests__/livestock-truth.test.tsx](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/__tests__/livestock-truth.test.tsx)

#### Ordered implementation steps

1. **RP-09-S01:** Reproduce the new hook's same-context new-generation case and A-to-B same-pen-ID case using actual Preact effects. Do not rely on the retained simulated hook scheduler as the final proof.
2. **RP-09-S02:** Key detail cache/in-flight work by complete context and relevant generation, not only pen ID. Reset or partition refs synchronously with the effective context used by the hydration effect.
3. **RP-09-S03:** Ensure an unchanged pen ID with a new summary generation can refresh its detail. Separate request deduplication from permanent already-hydrated suppression.
4. **RP-09-S04:** Guard every asynchronous completion with the captured context and generation. Abort obsolete work and prevent old responses from updating new-context state even when cancellation races.
5. **RP-09-S05:** Treat finite authoritative zero count as a valid target, distinct from missing/nonfinite totals. Reconcile cluster counts to targets 0, 1, 5 and larger without retaining hidden nonzero rows.
6. **RP-09-S06:** Keep sample count, population estimate, sums and means conceptually separate. If counts are scaled/reconciled, recompute sums consistently or preserve independently calculated means instead of changing the denominator alone.
7. **RP-09-S07:** Preserve finite zero measurements in producer, normalization, formatter, warning helper and rendered consumer. Represent unknown health explicitly; do not turn zero or unknown into 100% through truthy fallback.
8. **RP-09-S08:** Define how incomplete/estimated detail is labeled and how displayed caps differ from authoritative total count. Do not claim individual-level precision from aggregate-only data.
9. **RP-09-S09:** Make pasture cards, livestock table, pen panel and animal modal consume the same production summary model. Remove competing fallback arithmetic only after parity fixtures demonstrate the replacement.
10. **RP-09-S10:** Retain the observed 209 / 98% / 3 male / 206 female snapshot as a frozen regression fixture, including the individual bull's 50% health. It is a snapshot expectation, not a universal live-save constant.
11. **RP-09-S11:** Exercise refresh, rapid save switching, pen removal, reconnect and unmount cleanup so an apparently correct first render cannot hide lifecycle defects.

#### Concrete acceptance cases

##### RP-09-AC01. Same pen, new generation

**Arrange:** A pen is hydrated at health 60, then its newer compatible generation reports health 90.
**Action:** Deliver the newer summary/detail through the real hook.
**Expected:** Rendered health becomes 90; the pen is not permanently marked already hydrated.

##### RP-09-AC02. A-to-B same pen ID

**Arrange:** Save A and save B both contain pen 7 with different animals.
**Action:** Switch to B in actual Preact effect order.
**Expected:** A B-context detail request occurs and no A animals remain under B.

##### RP-09-AC03. Late detail completion

**Arrange:** A detail request is pending when context changes or the component unmounts.
**Action:** Settle the old response afterward.
**Expected:** It cannot mutate new-context state or leave leaked in-flight work.

##### RP-09-AC04. Authoritative count targets

**Arrange:** Clusters exceed, undershoot or lack totals for targets 0, 1, 5 and a large herd.
**Action:** Normalize and fan out.
**Expected:** Counts sum to the authoritative target before a separately labeled display cap; missing totals use the documented fallback.

##### RP-09-AC05. Measured zero and unknown

**Arrange:** Health values are 0, null, undefined and nonfinite in synthetic and real detail rows.
**Action:** Render card, table, warning and modal.
**Expected:** Zero displays 0% with the correct warning; unknown is not silently healthy.

##### RP-09-AC06. Sample mean invariance

**Arrange:** Population reconciliation changes bucket counts without new health observations.
**Action:** Run the collector's aggregate calculation.
**Expected:** Estimated population changes do not corrupt the measured sample mean or produce impossible sums.

##### RP-09-AC07. All-zero sample

**Arrange:** Every measured animal in a valid sample has health 0.
**Action:** Aggregate and render.
**Expected:** A known average of 0 is emitted, not omitted by a nonpositive-sum check.

##### RP-09-AC08. Frozen pasture parity

**Arrange:** Use the retained 209-animal fixture with 98% aggregate health, 3 males and 206 females.
**Action:** Render all livestock consumers.
**Expected:** Summary/table totals agree; the 50% individual remains 50% rather than being overwritten by the aggregate.

##### RP-09-AC09. Pen removal and recreation

**Arrange:** A pen is cleared then recreated in a newer epoch with the same ID.
**Action:** Refresh and reload persisted detail.
**Expected:** Old individuals do not reappear; the recreated pen hydrates from its own generation.

#### Deliverables

- Shared production livestock model
- Real lifecycle and rendered-consumer tests
- Documented sample/estimate/unknown semantics

#### Exit gate

Summary, detail and warnings agree for the same generation, including zero, unknown, scaled samples and rapid context changes.

#### Compatibility and implementation risks

- Fixing a visible card alone can leave stale caches or contradictory detail views.
- Sampled aggregate health is not necessarily the unweighted average of displayed representative rows; expose the actual semantics.

#### Safe rollback postconditions

- Preserve raw source fixtures and invalidate only derived caches whose schema is incompatible.
- Do not roll back to a formatter that fabricates healthy values or to a hook that reuses cross-save detail.

### RP-10. Make entity matching, ownership and valuation deterministic

**Owner:** Backend/domain owner with mod support. **Allowance:** 1.5-3 person-days.
**Dependencies:** `RP-02`, `RP-08`.
**Scope:** `R2-PIPE-05`, `R2-PIPE-06`, `R2-PIPE-07`, `R2-MOD-03`.
**Status:** Planned; reproduce against current production code before editing.

**Outcome:** Join each entity once, keep uncertain ownership uncertain and use the canonical supported valuation.

#### File and artifact targets

- Existing target: [FS25_FarmDashboard_App/dataMerger.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/dataMerger.js)
- Existing target: [FS25_FarmDashboard_Mod/src/collectors/VehicleDataCollector.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/VehicleDataCollector.lua)
- Existing target: [FS25_FarmDashboard_Mod/src/collectors/FinanceDataCollector.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/FinanceDataCollector.lua)
- Existing target: [NEW APP/src/lib/vehicles.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/vehicles.ts)
- Proposed new target: [FS25_FarmDashboard_App/tests/audit-regressions/entity-identity.test.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/tests/audit-regressions/entity-identity.test.js)

#### Ordered implementation steps

1. **RP-10-S01:** Define canonical record identity and a single consumed-record set shared by every XML matching index. A match through configuration/path must remove or mark the same record for subsequent UID matches.
2. **RP-10-S02:** Document matching precedence and ambiguity handling. Prefer authoritative stable identity over heuristic similarity; preserve unmatched records with provenance instead of forcing a misleading match.
3. **RP-10-S03:** Separate farm ownership from the existence of livestock, land, ADS data or nearby fleet. An absent owner remains unknown unless an explicitly authoritative source resolves it.
4. **RP-10-S04:** Define ownership precedence for mod, XML and fallback data and add the earlier un-reconfirmed owner-precedence branch as an explicit test rather than assuming the collision fix covers it.
5. **RP-10-S05:** Use separate namespaces/sets for field IDs and farmland IDs. Preserve both entities when their numeric identifiers coincide.
6. **RP-10-S06:** Define canonical vehicle resale valuation from the actual supported production record, including the nested ads.sellValue path. Preserve valid zero sell value and distinguish unknown value from purchase price.
7. **RP-10-S07:** Make FinanceDataCollector consume the same valuation semantics as VehicleDataCollector so dashboard totals and fleet detail do not use incompatible bases.
8. **RP-10-S08:** Separate owned vehicles, leased vehicles, pallets and other entity classes in the parity fixture. Record exact IDs behind each count rather than reconciling totals by subtraction.
9. **RP-10-S09:** Test duplicate UIDs, repeated configurations, ownerless entities and overlapping field/farmland identifiers using deterministic fixtures that cannot silently omit the target entity.
10. **RP-10-S10:** Emit diagnostic ambiguity counts without leaking full save contents. Unknown is an acceptable truthful result; fabricated ownership is not.

#### Concrete acceptance cases

##### RP-10-AC01. Double-consumed XML record

**Arrange:** One XML vehicle is reachable through configuration and UID indices.
**Action:** Match two candidate entities in sequence.
**Expected:** The XML record is consumed at most once across all indices.

##### RP-10-AC02. Ambiguous ownership

**Arrange:** Livestock, land or ADS hints suggest a farm but the vehicle has no authoritative owner.
**Action:** Merge the fleet.
**Expected:** The record remains unknown/unassigned according to the contract, not promoted by unrelated farm activity.

##### RP-10-AC03. Ownership precedence

**Arrange:** Mod and XML owner fields conflict or one is missing.
**Action:** Apply the explicit precedence rules.
**Expected:** The documented authoritative source wins; the earlier owner-precedence branch is specifically exercised.

##### RP-10-AC04. Field/farmland collision

**Arrange:** A field and farmland share the same numeric ID.
**Action:** Merge both collections.
**Expected:** Neither is dropped because the other occupied a shared seen set.

##### RP-10-AC05. Canonical sell value

**Arrange:** A Courseplay vehicle has purchase price 100000 and nested ads.sellValue 60000.
**Action:** Collect fleet and finance totals.
**Expected:** Both use the supported resale value 60000, not purchase price.

##### RP-10-AC06. Zero and unknown valuation

**Arrange:** One vehicle has a valid zero resale value and another has none.
**Action:** Calculate totals and display confidence.
**Expected:** Zero remains zero; unknown is explicitly excluded/labeled under the policy, not silently replaced by purchase price.

##### RP-10-AC07. Frozen identity parity

**Arrange:** Classic and RF consume the identical fleet fixture with vehicles and pallets.
**Action:** Compare sorted canonical ID sets by category.
**Expected:** Every difference is attributable to an explicit classification rule; 47 versus 41 plus 6 is not accepted without matching IDs.

#### Deliverables

- One-to-one matching and ownership contract
- Canonical valuation helper/adapter
- Deterministic fleet/field parity fixtures

#### Exit gate

No source record is matched twice, ambiguous ownership is not invented and finance agrees with canonical fleet valuation.

#### Compatibility and implementation risks

- A stricter ownership model may lower displayed owned totals; explain that accuracy change instead of hiding it.
- Different source schemas may lack a reliable resale value; do not invent a GIANTS API to fill the gap.

#### Safe rollback postconditions

- Retain source provenance so changed classifications can be investigated without modifying the game save.
- If a new matcher is rolled back, keep the one-to-one consumption safety invariant and disclose unresolved ambiguous records.

### RP-11. Align warnings, market offers and cross-view parity

**Owner:** Frontend/domain owner with mod support. **Allowance:** 1-2 person-days.
**Dependencies:** `RP-09`, `RP-10`.
**Scope:** `R2-MOD-07`.
**Status:** Planned; reproduce against current production code before editing.

**Outcome:** Give users consistent warnings and explain source confidence without fabricating market opportunities or parity claims.

#### File and artifact targets

- Existing target: [FS25_FarmDashboard_Mod/src/collectors/EconomyDataCollector.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/EconomyDataCollector.lua)
- Existing target: [NEW APP/src/lib/pastures-warnings.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/pastures-warnings.ts)
- Existing target: [NEW APP/src/lib/pastures-display.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/pastures-display.ts)
- Existing target: [NEW APP/src/sections/overview/OverviewSection.tsx](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/sections/overview/OverviewSection.tsx)
- Existing target: [NEW APP/src/sections/pastures/PasturesSection.tsx](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/sections/pastures/PasturesSection.tsx)
- Existing target: [NEW APP/src/lib/weather.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/weather.ts)
- Existing target: [NEW APP/src/components/WeatherModal.tsx](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/components/WeatherModal.tsx)
- Existing target: [FS25_FarmDashboard_App/web/assests/js/pastures-warnings.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/web/assests/js/pastures-warnings.js)
- Existing target: [FS25_FarmDashboard_App/web/assests/js/modules/pastures.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/web/assests/js/modules/pastures.js)
- Existing target: [FS25_FarmDashboard_App/web/assests/js/modules/environment.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/web/assests/js/modules/environment.js)
- Existing target: [FS25_FarmDashboard_App/web/assests/js/modules/vehicles.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/web/assests/js/modules/vehicles.js)

#### Ordered implementation steps

1. **RP-11-S01:** Verify the real FS25 selling-station/price source using local game references. Remove station-name inference that synthesizes unsupported sell offers or prices.
2. **RP-11-S02:** Represent unavailable offers and unknown prices explicitly. A station name resembling a product does not establish that the station currently buys it.
3. **RP-11-S03:** Define a canonical warning key, severity and source for pasture resources and animal health. Make overview totals and detailed sections aggregate the same warning objects or shared rule outputs.
4. **RP-11-S04:** Distinguish empty resource, unknown capacity, unsupported resource and stale data. Do not turn missing capacities into confident red/green percentages.
5. **RP-11-S05:** Freeze one source generation for Classic/RF comparison, including canonical vehicle IDs and weather fields. Do not compare separate live collection moments as if they were identical input.
6. **RP-11-S06:** Resolve any actual weather discrepancy from the same frozen payload through parsing, unit conversion, icon selection and displayed labels. Keep the earlier snow/cloudy observation unconfirmed unless reproduced.
7. **RP-11-S07:** Add a source-age/confidence explanation where held or estimated data is shown, using the RP-02 vocabulary rather than developer-only metadata.
8. **RP-11-S08:** Preserve the improved overview and pasture presentation, including the observed warning snapshot as fixture-specific evidence. Do not hard-code the observed count of 13 warnings as a permanent expectation.
9. **RP-11-S09:** Ensure direct navigation from a summary warning opens the corresponding filtered detail or explains why the source is unavailable.

#### Concrete acceptance cases

##### RP-11-AC01. Station-name false offer

**Arrange:** A station name contains a product term but the authoritative offer list does not.
**Action:** Collect economy data.
**Expected:** No offer or price is fabricated from the name.

##### RP-11-AC02. Real offer and unavailable price

**Arrange:** The game adapter supplies a supported offer, and a second offer lacks a usable price.
**Action:** Collect and render.
**Expected:** The real offer is retained; unavailable price is labeled rather than guessed.

##### RP-11-AC03. Warning parity

**Arrange:** One frozen pasture fixture has known health/resource warnings.
**Action:** Render overview and detail.
**Expected:** Counts and severities reconcile to the same warning IDs.

##### RP-11-AC04. Resource confidence

**Arrange:** Capacity is zero, unknown, unsupported or stale in separate fixtures.
**Action:** Render resource states.
**Expected:** The UI distinguishes these cases and does not manufacture a confident percentage.

##### RP-11-AC05. Frozen weather parity

**Arrange:** Classic and RF receive the same weather generation.
**Action:** Compare labels, units and icons.
**Expected:** Any difference is explained by a documented design rule or fixed; different-generation observations are excluded.

##### RP-11-AC06. Warning navigation

**Arrange:** A user selects an overview warning for a specific pen/resource.
**Action:** Open the related section.
**Expected:** The relevant detail is visible or clearly identified without making the user search unrelated rows.

#### Deliverables

- Authoritative market-offer collection
- Canonical warnings and confidence presentation
- Frozen fleet/weather comparison evidence

#### Exit gate

User-facing warnings and offers reflect the same source generation and never claim precision or availability unsupported by data.

#### Compatibility and implementation risks

- Classic and RF need not have identical visual layouts, but data semantics must be explainable.
- Unknown price/health/resource information should not be disguised as a healthy or profitable default.

#### Safe rollback postconditions

- Keep the authoritative-data-only rule even if presentation changes are reverted.
- Retain frozen parity fixtures to prevent later heuristic reintroduction.

### RP-12. Apply transport policy consistently and bound network work

**Owner:** Backend/network owner. **Allowance:** 2-4 person-days.
**Dependencies:** `RP-02`, `RP-03`, `RP-05`.
**Scope:** `R3-SEC-05`, `R2-SEC-04`, `R2-PERF-01`, `R2-PERF-02`.
**Status:** Planned; reproduce against current production code before editing.

**Outcome:** Preserve secure connection intent, update active clients on policy changes and prevent overlapping or unbounded transfers.

#### File and artifact targets

- Existing target: [FS25_FarmDashboard_App/editionPolicy.cjs](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/editionPolicy.cjs)
- Existing target: [FS25_FarmDashboard_App/ftpAccess.cjs](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/ftpAccess.cjs)
- Existing target: [FS25_FarmDashboard_App/setupConfigMerge.cjs](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/setupConfigMerge.cjs)
- Existing target: [FS25_FarmDashboard_App/main.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js)
- Existing target: [FS25_FarmDashboard_App/livestockDetail.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/livestockDetail.js)
- Existing target: [FS25_FarmDashboard_App/httpFeedXml.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/httpFeedXml.js)
- Proposed new target: [FS25_FarmDashboard_App/tests/audit-regressions/transport-lifecycle.test.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/tests/audit-regressions/transport-lifecycle.test.js)

#### Ordered implementation steps

1. **RP-12-S01:** Enumerate supported transport fields from the current production contract, including ftpSecure, ftpFtps where supported, httpFeedSecure and ftpAllowInsecureTls. Exclude the prior non-contract diagnostic field ftpRejectUnauthorized.
2. **RP-12-S02:** Preserve validated non-secret secure transport policy during Classic-to-RF import while continuing to exclude passwords, access codes and session secrets. Imported credentials must be entered through the normal secure flow.
3. **RP-12-S03:** Keep certificate validation enabled by default. An explicit insecure-TLS exception must be scoped, visible and never inferred from a failed connection.
4. **RP-12-S04:** Include every effective transport policy field in change detection and client/poller identity. A TLS-only change must retire captured clients and apply to subsequent main XML, detail and auxiliary transfers.
5. **RP-12-S05:** Implement one active poll per configured source/context with coalesced pending work or completion-based scheduling. Stop intervals/watchers and cancel obsolete operations on configuration changes and shutdown.
6. **RP-12-S06:** Recheck generation/cancellation at the RP-05 commit boundary, not merely after publishing a newly downloaded file. A stale transfer may finish receiving bytes but cannot commit them.
7. **RP-12-S07:** Give HTTP feed work an absolute total deadline, retaining 45 seconds if that remains the approved product contract. A separate idle timeout may coexist but cannot reset the total deadline.
8. **RP-12-S08:** Settle each HTTP request exactly once on success, abort, error, premature close, malformed body or deadline. Clear timers/listeners and destroy the relevant stream/request safely.
9. **RP-12-S09:** Bound response size and redirect count using implementation-time limits based on supported saves. Never silently downgrade HTTPS to HTTP; reject or strip credentials on cross-origin redirects according to the explicit policy.
10. **RP-12-S10:** Add local HTTP, HTTPS and FTP/FTPS fixtures as supported by the test environment. Confirm certificate rejection, cancellation and stale-commit behavior rather than testing only option objects.
11. **RP-12-S11:** Measure active operations, transfer duration and cleanup counters under slow servers and rapid setting changes; logs must redact credentials and authorization headers.

#### Concrete acceptance cases

##### RP-12-AC01. Secure import policy

**Arrange:** Classic settings contain supported TLS flags plus passwords and access codes.
**Action:** Import into RF.
**Expected:** Validated non-secret transport policy survives; secrets do not migrate.

##### RP-12-AC02. TLS-only live change

**Arrange:** An active poller uses the old secure transport setting.
**Action:** Change only ftpSecure or httpFeedSecure through the production settings path.
**Expected:** The old client is retired and all subsequent relevant transfers use the new effective policy.

##### RP-12-AC03. Certificate default

**Arrange:** A local TLS fixture has an untrusted certificate.
**Action:** Connect with defaults, then with a specifically approved scoped exception.
**Expected:** Defaults reject it; only the explicit exception changes behavior and remains visibly configured.

##### RP-12-AC04. No overlapping polls

**Arrange:** A transfer lasts longer than the normal polling interval.
**Action:** Advance multiple scheduled ticks.
**Expected:** At most one operation per context is active and pending refreshes are bounded/coalesced.

##### RP-12-AC05. Stale download cannot commit

**Arrange:** An old poll completes after source credentials or context change.
**Action:** Reach file commit.
**Expected:** No old bytes or metadata replace the active context's cache.

##### RP-12-AC06. Absolute deadline under trickle

**Arrange:** A fake/local stream sends data continuously past 45 seconds without going idle.
**Action:** Run the production HTTP request.
**Expected:** It terminates at the approved total deadline rather than succeeding at 60 seconds.

##### RP-12-AC07. Abort and premature close

**Arrange:** Abort during body reception and separately close before a complete body.
**Action:** Observe the promise and resource counters.
**Expected:** Each settles once with a structured error; timers/listeners/handles are released.

##### RP-12-AC08. Redirect and size limits

**Arrange:** A fixture redirects to another origin or insecure scheme, loops redirects, or exceeds the approved body cap.
**Action:** Fetch the feed.
**Expected:** Policy blocks downgrade/credential leakage and bounds work with an actionable error.

##### RP-12-AC09. Lifecycle cleanup

**Arrange:** Repeatedly start, change and stop a source configuration.
**Action:** Inspect instrumented active polls and listeners.
**Expected:** Counts return to the expected baseline; the earlier FTP branch and other reachable watcher paths are explicitly covered.

#### Deliverables

- Secure import and effective-policy identity
- Serialized cancellable polling
- Absolute deadline and complete stream cleanup

#### Exit gate

No silent policy downgrade, old-context commit, overlapping per-context transfer or indefinitely trickling request remains.

#### Compatibility and implementation risks

- A transport-policy change may require reconnecting, but should not force unrelated whole-app restarts.
- TLS test behavior must use the actual supported client library rather than assuming option names.

#### Safe rollback postconditions

- Rollback preserves secure flags and certificate validation. Do not restore plaintext fallback merely to make a connection succeed.
- Stop current pollers before changing implementation; retain last-good files and explicit stale status during recovery.

### RP-13. Bound mod work and make requested cadence authoritative

**Owner:** Mod/performance owner. **Allowance:** 2-4 person-days.
**Dependencies:** `RP-06`.
**Scope:** `R2-MOD-04`, `R2-MOD-05`, `R2-MOD-08`, `C3`, `C4`.
**Status:** Planned; reproduce against current production code before editing.

**Outcome:** Bound examined work per update, avoid redundant fleet passes and apply the user's requested collection interval consistently.

#### File and artifact targets

- Existing target: [FS25_FarmDashboard_Mod/src/FarmDashboard.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboard.lua)
- Existing target: [FS25_FarmDashboard_Mod/src/FarmDashboardCourseplayCompat.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardCourseplayCompat.lua)
- Existing target: [FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua)
- Existing target: [FS25_FarmDashboard_Mod/src/FarmDashboardSettingsApi.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardSettingsApi.lua)
- Existing target: [FS25_FarmDashboard_Mod/src/InventoryScan.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/InventoryScan.lua)
- Existing target: [FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua)

#### Ordered implementation steps

1. **RP-13-S01:** Instrument Courseplay compatibility passes with examined-vehicle counts and elapsed time. Separate code-derived iteration counts from actual frame-time measurements.
2. **RP-13-S02:** Identify the repair states and ordering requirements that currently trigger two full fleet scans. Replace unconditional repeated scans with pending-work/transition-driven scheduling while preserving join, spawn and compatibility repair behavior.
3. **RP-13-S03:** Use a bounded cursor or explicit queue for fleet repair where appropriate. Do not collapse phases blindly if the game or Courseplay lifecycle requires one phase to complete before another.
4. **RP-13-S04:** Charge inventory scan budgets for every examined entry, including non-bales, invalid objects and rejected rows. Add an elapsed-time bound in addition to entry count where supported.
5. **RP-13-S05:** Persist scan progress across yields without restarting pairs enumeration from the beginning. Define safe cursor behavior when world objects are inserted, removed or invalidated during a scan.
6. **RP-13-S06:** Update the authoritative user-requested collection interval from every supported setter/load path. Derive adaptive effective cadence from that value instead of a stale cached _userCollectionCycleMs.
7. **RP-13-S07:** Document clamps, minimums and adaptive behavior in the UI/API. A user-requested interval should not silently revert after an unrelated settings update or game reload.
8. **RP-13-S08:** Trace field collector mode selection through default coroutine, _smState, legacy and fallback paths. For each reachable supported mode, bound work; explicitly reject/document unsupported modes rather than leaving an unbounded escape route.
9. **RP-13-S09:** Complete C4 scheduler tracing from RP-06 and ensure required request servicing remains bounded during persistent section failures. Avoid duplicating request consumers that could process one command twice.
10. **RP-13-S10:** Measure large synthetic fleets, mostly-rejected inventory pools, large herds and a representative copied test save. Ratify p95/p99 slice budgets against recorded hardware before claiming a performance pass.
11. **RP-13-S11:** Expose low-overhead diagnostic counters behind an appropriate diagnostic setting and keep them off the hot path when disabled. Avoid per-object logging during gameplay.

#### Concrete acceptance cases

##### RP-13-AC01. Courseplay idle fleet

**Arrange:** A stable fixture contains 400 vehicles with no pending repair transitions.
**Action:** Run repeated update ticks.
**Expected:** The implementation avoids two unconditional full-fleet passes per tick; exact examined counts are recorded.

##### RP-13-AC02. Courseplay transition safety

**Arrange:** Vehicles spawn, join, leave and require both compatibility phases.
**Action:** Advance updates under a bounded budget.
**Expected:** Repairs complete correctly without dropped entities or phase-order regressions.

##### RP-13-AC03. Rejected-entry budget

**Arrange:** A very large inventory contains mostly non-bale or invalid entries.
**Action:** Run one scan slice.
**Expected:** Work is bounded by examined entries/time, not only accepted results.

##### RP-13-AC04. Cursor progress and mutation

**Arrange:** Inventory changes between slices and includes invalidated objects.
**Action:** Continue scanning.
**Expected:** Progress does not restart from the beginning indefinitely, crash on removed objects or duplicate accepted records.

##### RP-13-AC05. Requested cadence setters

**Arrange:** Set the interval through each supported settings/API/load path.
**Action:** Trigger adaptive changes and reload configuration.
**Expected:** The requested baseline updates consistently and effective cadence follows documented clamps.

##### RP-13-AC06. Field mode reachability

**Arrange:** Enable each supported field collector mode in a fixture/reference environment.
**Action:** Trace and measure one invocation.
**Expected:** Every reachable mode is bounded; unsupported modes fail explicitly and are documented.

##### RP-13-AC07. Failure does not starve requests

**Arrange:** A collector persistently fails while requests continue to arrive.
**Action:** Run the complete scheduler.
**Expected:** Requests meet the approved servicing bound without duplicate processing.

##### RP-13-AC08. Performance evidence

**Arrange:** Use agreed fleet/herd sizes and record hardware/build identity.
**Action:** Measure slice distributions and a copied-save session.
**Expected:** Results include examined counts, p50/p95/p99 time and limitations; no unsupported FPS improvement claim is made.

#### Deliverables

- Bounded scan/cursor implementation
- Single authoritative requested cadence
- Mode reachability and measured performance report

#### Exit gate

Every supported high-volume path has bounded work and measured behavior; conditional fallback/starvation risks are resolved or explicitly gated.

#### Compatibility and implementation risks

- Cursor semantics and collection mutation depend on real game structures and must be checked against local references.
- A hard budget that never permits a large item to finish can create starvation; include eventual-progress assertions.

#### Safe rollback postconditions

- Retain a safe bounded mode if an optimization regresses compatibility; disable the affected optional optimization rather than restoring unlimited work.
- Preserve the user's requested interval across rollback and report any temporary limitation.

### RP-14. Repair authentication, modal focus and recovery messages

**Owner:** Frontend/security owner. **Allowance:** 1.5-3 person-days.
**Dependencies:** `RP-03`, `RP-07`.
**Scope:** `R2-UI-01`, `R2-UX-03`, `R2-UX-04`, `R2-UX-05`.
**Status:** Planned; reproduce against current production code before editing.

**Outcome:** Make authentication fail closed without trapping the user, stealing typing focus or misdiagnosing network/path errors.

#### File and artifact targets

- Existing target: [NEW APP/src/lib/use-focus-trap.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/use-focus-trap.ts)
- Existing target: [NEW APP/src/platform/LanAuthOverlay.tsx](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/platform/LanAuthOverlay.tsx)
- Existing target: [NEW APP/src/services/lan-auth.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/services/lan-auth.ts)
- Existing target: [NEW APP/src/simhub/main.tsx](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/simhub/main.tsx)
- Existing target: [NEW APP/src/lib/ux-classify.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/ux-classify.ts)
- Proposed new target: [NEW APP/src/platform/__tests__/authentication-boundary.test.tsx](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/platform/__tests__/authentication-boundary.test.tsx)

#### Ordered implementation steps

1. **RP-14-S01:** Reproduce each of the four not-reverified findings against current production code before rewriting. Treat the previous password-focus P1 as a mandatory closure gate even if the ordinary UI appears usable.
2. **RP-14-S02:** Model authentication as explicit checking, required, verifying, authorized, rejected and transport-failed states or equivalent existing states. Only successful authorization releases protected bootstrap.
3. **RP-14-S03:** Use one in-flight verification operation per auth context and deduplicate submit/Enter/click races. Give network verification a bounded deadline without turning elapsed time into authorization.
4. **RP-14-S04:** Preserve valid stored credentials on transport outages and timeouts. Invalidate authorization on actual rejection as appropriate, distinguish permission denial from bad credentials and provide a retry/edit path.
5. **RP-14-S05:** Mount the authentication boundary independently of readiness in SimHub and other direct-entry views. Handle HTTP status before JSON parsing so HTML error bodies cannot deadlock startup.
6. **RP-14-S06:** Attach focus trapping and initial focus when the dialog actually opens, not whenever an unstable callback changes. Keep the Escape callback current through a stable reference or equivalent lifecycle-safe pattern.
7. **RP-14-S07:** Give the topmost modal sole trap ownership, make the background noninteractive through the approved inertness approach and restore focus to the trigger or a safe fallback when the dialog closes.
8. **RP-14-S08:** Keep typing focus stable across controlled input updates, live data renders, validation messages and network progress. Avoid moving focus on every state transition that does not represent a new dialog.
9. **RP-14-S09:** Classify explicit OS and protocol error codes before incidental message text. ENOENT/ENOTDIR under C:\Users are path problems; EACCES is permission-related; 401/403 retain their proper security meaning.
10. **RP-14-S10:** Use consistent actionable messages with retry, edit credentials or choose path as appropriate. Preserve technical detail behind an expandable diagnostic view without exposing secrets.
11. **RP-14-S11:** Run real keyboard and screen-reader checks for auth and stacked dialogs after DOM regressions pass; a hook-only test is not the final user-experience proof.

#### Concrete acceptance cases

##### RP-14-AC01. Normal password typing

**Arrange:** Open login with controlled username/password fields.
**Action:** Type full credentials while live data and validation states rerender.
**Expected:** Focus remains in the intended field; no password characters are redirected into username.

##### RP-14-AC02. Slow login and timeout

**Arrange:** Verification succeeds after more than 30 seconds in one fixture and hangs in another.
**Action:** Wait without interacting.
**Expected:** The valid slow result can authorize within the approved deadline; a timeout never releases protected bootstrap.

##### RP-14-AC03. Early completion and double submit

**Arrange:** Verification completes quickly while Enter and click occur together.
**Action:** Submit credentials.
**Expected:** Only one verification/side-effect sequence runs and startup proceeds once.

##### RP-14-AC04. Network outage versus rejection

**Arrange:** Use valid stored credentials, then return transport failure, 401 and 403 separately.
**Action:** Retry authentication.
**Expected:** Transport failure does not erase valid credentials; rejected/forbidden states remain explicit and recoverable.

##### RP-14-AC05. Direct SimHub entry

**Arrange:** Open an unauthenticated SimHub URL and later a cached-authorized URL.
**Action:** Load each entry point.
**Expected:** Login mounts immediately when needed; authorized startup has no artificial 30-second wait or readiness deadlock.

##### RP-14-AC06. Non-JSON auth errors

**Arrange:** Return 503 HTML or a malformed successful body.
**Action:** Run auth/bootstrap.
**Expected:** Status-aware error handling provides retry instead of an unhandled parser failure.

##### RP-14-AC07. Stacked modal focus

**Arrange:** Open a child modal, cycle Tab/Shift+Tab, press Escape and close the parent.
**Action:** Use keyboard only.
**Expected:** Only the top modal owns focus; background controls cannot activate and focus restores predictably.

##### RP-14-AC08. Windows error taxonomy

**Arrange:** Provide ENOENT and ENOTDIR paths under C:\Users, EACCES and explicit HTTP auth failures.
**Action:** Render the recovery message.
**Expected:** Path words do not cause false credential-rejection messages; each error offers the appropriate action.

#### Deliverables

- Persistent auth state and deduplicated verification
- Stable accessible modal lifecycle
- Structured error classification

#### Exit gate

The unverified focus P1 and auth/SimHub recovery cases are specifically closed with production DOM and actual interaction evidence.

#### Compatibility and implementation risks

- Broad changes to auth timing can create bypasses or indefinite spinners if terminal states are incomplete.
- Do not log typed passwords while investigating the focus defect.

#### Safe rollback postconditions

- Keep protected bootstrap gated. A rollback must not reintroduce timeout-as-success or erase credentials on network failure.
- If focus behavior regresses, retain a simple stable modal flow while correcting it rather than disabling the auth boundary.

### RP-15. Make Settings and setup save outcomes explicit and safe

**Owner:** Frontend/backend integration owner. **Allowance:** 1.5-3 person-days.
**Dependencies:** `RP-03`, `RP-07`, `RP-12`, `RP-14`.
**Scope:** `R2-UX-02`, `CUA-02`.
**Status:** Planned; reproduce against current production code before editing.

**Outcome:** Prevent unloaded defaults and stale clients from overwriting configuration, and make Save / Open Dashboard behavior predictable.

#### File and artifact targets

- Existing target: [NEW APP/src/settings/SettingsModal.tsx](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/settings/SettingsModal.tsx)
- Existing target: [NEW APP/src/setup/main.tsx](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/setup/main.tsx)
- Existing target: [NEW APP/src/services/electron-bridge.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/services/electron-bridge.ts)
- Existing target: [FS25_FarmDashboard_App/setup.html](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/setup.html)
- Existing target: [FS25_FarmDashboard_App/setupConfigMerge.cjs](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/setupConfigMerge.cjs)
- Existing target: [FS25_FarmDashboard_App/main.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js)
- Existing target: [FS25_FarmDashboard_App/preload.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/preload.js)
- Proposed new target: [NEW APP/src/settings/__tests__/settings-save.test.tsx](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/settings/__tests__/settings-save.test.tsx)

#### Ordered implementation steps

1. **RP-15-S01:** Reproduce failed hydration for every independently loaded settings section. Track unknown/loading/loaded/failed state per editable section rather than using one optimistic modal-ready flag.
2. **RP-15-S02:** Keep unloaded fields nonpersistable. Where other sections are safely editable, explain the blocked section and permit only explicitly independent saves; never serialize unknown defaults.
3. **RP-15-S03:** Maintain separate loaded baseline, editable draft and validation state. Preserve drafts through retryable errors and warn before discarding unsaved changes.
4. **RP-15-S04:** Validate all requested sections before the first write. Return field-level errors without partially applying an otherwise invalid multi-section request.
5. **RP-15-S05:** Use the current configuration revision or introduce a reviewed expected-revision contract for concurrent saves. Reject stale edits with a conflict/reload/merge flow instead of last-writer-wins overwrite.
6. **RP-15-S06:** Define the real transaction boundary. If desktop, game config and remote settings cannot commit atomically, return explicit committed/failed/not-attempted outcomes and keep retryable drafts.
7. **RP-15-S07:** Deduplicate save submissions and separate persistence completion from dashboard navigation. An unchanged valid configuration should still support Open Dashboard without requiring a server reboot.
8. **RP-15-S08:** Return the save response before any server restart that would interrupt that response. Activate the new configuration through an explicit lifecycle that also refreshes transport policy.
9. **RP-15-S09:** On navigation failure, retain the saved-state result and provide Retry Open Dashboard; do not imply the save failed or ask the user to rewrite the same configuration unnecessarily.
10. **RP-15-S10:** Preserve selected save context through setup and integrate the RP-16 writer-ownership decision before any game-facing write is enabled in a coexisting pair.
11. **RP-15-S11:** Retain the improved opaque Settings surface and visible loading-to-save transition. Add truthful status text rather than redesigning the modal around an unproven issue.

#### Concrete acceptance cases

##### RP-15-AC01. Each hydration stage fails

**Arrange:** Fail each settings load independently.
**Action:** Try to save without a successful load.
**Expected:** Unknown sections cannot be persisted as defaults; a specific retry is available.

##### RP-15-AC02. Validate before first commit

**Arrange:** One section is valid and a later requested section is invalid.
**Action:** Submit the combined save.
**Expected:** No section is committed before complete requested validation succeeds.

##### RP-15-AC03. Partial persistence

**Arrange:** The first external section commits and a later independent write fails.
**Action:** Complete the save flow.
**Expected:** The UI names exactly what committed, failed and was not attempted; drafts remain and no generic synced claim appears.

##### RP-15-AC04. Concurrent stale editor

**Arrange:** Two windows load revision N; one saves N+1.
**Action:** Save the other window's stale draft.
**Expected:** A conflict is returned without overwriting N+1; the user can reload/reconcile.

##### RP-15-AC05. Unchanged setup launch

**Arrange:** A valid existing configuration is saved without changes.
**Action:** Choose Open Dashboard.
**Expected:** The dashboard opens explicitly without an unnecessary reboot, with the selected save preserved.

##### RP-15-AC06. Double submit

**Arrange:** Click Save/Open repeatedly and press Enter during persistence.
**Action:** Observe backend and navigation effects.
**Expected:** One logical save/activation occurs; controls show in-flight state.

##### RP-15-AC07. Navigation failure after save

**Arrange:** Persistence succeeds but dashboard navigation fails.
**Action:** Retry navigation.
**Expected:** The UI preserves the true saved result and retries opening without pretending configuration is unsaved.

##### RP-15-AC08. Restart response ordering

**Arrange:** A settings change requires server activation/restart.
**Action:** Submit and observe HTTP/IPC completion.
**Expected:** The caller receives a truthful result before its connection is intentionally retired; no restart-induced hung save.

##### RP-15-AC09. Draft recovery

**Arrange:** A user edits settings then experiences a temporary transport failure.
**Action:** Retry after recovery.
**Expected:** Their draft remains intact and only authorized loaded fields are submitted.

#### Deliverables

- Per-section load/draft/save state
- Revision-aware persistence and partial outcomes
- Explicit save-versus-launch contract

#### Exit gate

No unloaded or stale configuration is silently written, and unchanged setup can open the dashboard with a truthful outcome.

#### Compatibility and implementation risks

- Cross-file or remote saves may not support all-or-nothing transactions; do not advertise one without implementing it.
- Concurrency control must also protect backend writes, not just disable one window's button.

#### Safe rollback postconditions

- Preserve the latest valid configuration and unsaved drafts where safely possible.
- If a new transaction protocol is rolled back, block conflicting edits rather than falling back to blind overwrite.

### RP-16. Finish edition coexistence, writer ownership and uninstall safety

**Owner:** Desktop/release owner with backend support. **Allowance:** 2-4 person-days.
**Dependencies:** `RP-03`, `RP-05`, `RP-12`, `RP-15`.
**Scope:** `CUA-01`, `SRC-05`.
**Status:** Planned; reproduce against current production code before editing.

**Outcome:** Allow deliberate Classic/RF coexistence without cross-profile state, competing game writes or unsafe uninstall cleanup.

#### File and artifact targets

- Existing target: [FS25_FarmDashboard_App/main.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js)
- Existing target: [FS25_FarmDashboard_App/editionPolicy.cjs](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/editionPolicy.cjs)
- Existing target: [FS25_FarmDashboard_App/package.json](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/package.json)
- Existing target: [FS25_FarmDashboard_App/electron-builder.rf.yml](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/electron-builder.rf.yml)
- Existing target: [FS25_FarmDashboard_App/build/installer.nsh](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/build/installer.nsh)
- Existing target: [FS25_FarmDashboard_App/build/uninstall-user-data.ps1](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/build/uninstall-user-data.ps1)
- Existing target: [tools/app/run-electron-builder.mjs](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/tools/app/run-electron-builder.mjs)
- Existing target: [tools/app/start-dev-electron.mjs](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/tools/app/start-dev-electron.mjs)
- Existing target: [tools/app/verify-electron-pack-files.mjs](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/tools/app/verify-electron-pack-files.mjs)
- Existing target: [COMPATIBILITY.md](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/COMPATIBILITY.md)

#### Ordered implementation steps

1. **RP-16-S01:** Retain the implemented early edition identity mechanism and verify its ordering before Store creation, session setup and the single-instance lock. Do not rewrite it merely because installed acceptance remains pending.
2. **RP-16-S02:** Keep Classic 8766, RF 8768 and development 8767 distinct under the current policy. Handle an occupied port explicitly; do not connect a window to the other edition merely because a service answered.
3. **RP-16-S03:** Verify application/profile/session identifiers, shortcuts, installer identities, update channels and launch arguments together. A different port alone does not establish edition isolation.
4. **RP-16-S04:** Keep Classic-to-RF migration opt-in/reversible with a clear source and destination. Preserve validated non-secret transport policy from RP-12 while excluding credentials and unrelated browser state.
5. **RP-16-S05:** Identify every game-facing write target, including shared requests.json/config.xml paths where applicable. Normalize target identity separately from edition profile identity.
6. **RP-16-S06:** Choose a single authorized writer per actual target using a tested interprocess mechanism or broker on one machine. A 250 ms peer-port probe is not a reliable lock or ownership proof.
7. **RP-16-S07:** For a remote dedicated target, require server-side coordination or one explicitly authorized writer with other clients/readers unable to edit through the supported flow. Do not claim a local mutex solves distributed FTP concurrency.
8. **RP-16-S08:** Define writer transfer, process crash, stale ownership and unknown ownership behavior. Default uncertain ownership to read-only with a clear explanation rather than racing a write.
9. **RP-16-S09:** Keep uninstall cleanup edition-scoped and allowlisted. Unknown ownership preserves files; Keep retains user data, and Full removes only the chosen edition's explicitly owned data after path containment checks.
10. **RP-16-S10:** Exercise upgrade and uninstall using disposable profiles with sentinel files for the other edition, browser preferences, shared game data and unrelated directories. Resolve and record absolute cleanup targets before any destructive action.
11. **RP-16-S11:** Verify installer locale, install path with spaces/non-ASCII names, shortcuts, repair/upgrade behavior and simultaneous launches. Update compatibility documentation only with observed supported behavior.
12. **RP-16-S12:** Publish a small coexistence/writer-state UI explanation so a read-only second instance is understandable rather than appearing broken.

#### Concrete acceptance cases

##### RP-16-AC01. Early edition identity

**Arrange:** Launch Classic and RF with isolated disposable profiles.
**Action:** Observe initialization ordering and active endpoints.
**Expected:** Store/session/lock use the correct edition before initialization; each window connects to its own service.

##### RP-16-AC02. Occupied port

**Arrange:** Bind one intended edition port with an unrelated test service.
**Action:** Start that edition.
**Expected:** It fails or chooses the documented safe recovery path; it never silently trusts the unrelated or other-edition endpoint.

##### RP-16-AC03. Opt-in migration

**Arrange:** Import Classic non-secret settings into a new RF profile.
**Action:** Cancel and then complete the explicit migration flow.
**Expected:** The Classic profile remains intact; RF gets only allowed settings and secure policy, not secrets.

##### RP-16-AC04. Competing local writers

**Arrange:** Both editions target the same game request/config files.
**Action:** Attempt simultaneous writes.
**Expected:** Exactly one authorized writer commits; the other receives a clear read-only/ownership result.

##### RP-16-AC05. Writer crash and transfer

**Arrange:** The active writer exits unexpectedly, then another instance requests ownership.
**Action:** Run the documented recovery/transfer flow.
**Expected:** Ownership is recovered safely without PID-reuse or stale-lock assumptions causing two writers.

##### RP-16-AC06. Remote writer limitation

**Arrange:** Two clients target the same dedicated FTP location.
**Action:** Exercise the supported ownership arrangement.
**Expected:** Server-side coordination or enforced supported single-writer behavior prevents competing edits; limitations are documented honestly.

##### RP-16-AC07. Keep uninstall

**Arrange:** Both editions and shared game sentinels exist in a disposable Windows profile.
**Action:** Uninstall one edition with Keep.
**Expected:** The other edition, shared game files, selected retained profile data and browser preferences remain intact.

##### RP-16-AC08. Full uninstall and upgrade

**Arrange:** Use edition-owned and unrelated sentinel files.
**Action:** Run Full cleanup and an upgrade in the disposable profile.
**Expected:** Only allowlisted owned targets are removed; unknown paths and the other edition survive.

##### RP-16-AC09. Locale and path variants

**Arrange:** Install into supported paths containing spaces and non-ASCII user names.
**Action:** Launch, update and uninstall in the test environment.
**Expected:** Paths, locale text, shortcuts and ownership resolution remain correct.

#### Deliverables

- Verified edition identity and migration policy
- Single-writer contract and visible read-only state
- Disposable uninstall/upgrade evidence

#### Exit gate

Both editions coexist with independent state and safe shared-target writes; destructive ownership tests pass only in disposable environments.

#### Compatibility and implementation risks

- Two independent desktop profiles can still write the same game files; profile isolation does not solve target ownership.
- A remote service without coordination may require a documented read-only limitation, not an invented distributed lock.

#### Safe rollback postconditions

- Close both test applications before restoring a compatible profile backup. Preserve the Classic source profile and shared game files.
- Never repair an uninstall defect by broadening recursive cleanup. Unknown ownership always preserves data.

### RP-17. Refine navigation, accessibility and perceived performance

**Owner:** Frontend UX owner. **Allowance:** 1.5-3 person-days.
**Dependencies:** `RP-09`, `RP-11`, `RP-14`, `RP-15`.
**Scope:** `R2-BACK-01`.
**Status:** Planned; reproduce against current production code before editing.

**Outcome:** Polish the existing interface around clear feedback, accessible recovery and honest loading states without unnecessary redesign.

#### File and artifact targets

- Existing target: [NEW APP/src/styles/app-shell.css](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/styles/app-shell.css)
- Existing target: [NEW APP/src/settings/SettingsModal.tsx](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/settings/SettingsModal.tsx)
- Existing target: [NEW APP/src/sections/pastures/PasturesSection.tsx](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/sections/pastures/PasturesSection.tsx)
- Existing target: [NEW APP/src/sections/livestock/LivestockPenPanel.tsx](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/sections/livestock/LivestockPenPanel.tsx)
- Existing target: [NEW APP/src/sections/livestock/AnimalDetailsModal.tsx](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/sections/livestock/AnimalDetailsModal.tsx)
- Existing target: [NEW APP/src/sections/overview/OverviewSection.tsx](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/sections/overview/OverviewSection.tsx)
- Existing target: [FS25_FarmDashboard_App/main.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js)
- Proposed new target: [docs/_internal/audits/remediation-execution/ux-acceptance.md](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/remediation-execution/ux-acceptance.md)

#### Ordered implementation steps

1. **RP-17-S01:** Preserve the established Classic/RF visual language and the improved opaque Settings panel. Work from specific observed usability gaps rather than changing the entire design system.
2. **RP-17-S02:** Make the livestock-table action reveal or focus the requested content, including when it is below the fold. Show an immediate visible response and a loading/error state if detail is still being fetched.
3. **RP-17-S03:** Keep summary, table and individual detail source-age/estimate labels understandable. A stale retained value must not look indistinguishable from a current measurement.
4. **RP-17-S04:** Audit heading hierarchy, accessible names, focus order, keyboard activation, Escape behavior and focus visibility through setup, dashboard, settings, authentication and animal detail.
5. **RP-17-S05:** Measure text/control contrast over the actual busy backgrounds against the chosen accessibility target. Do not claim accessibility certification from screenshots or translation-key checks.
6. **RP-17-S06:** Exercise 320 px and 390 px widths, ordinary desktop sizes and zoom/text enlargement. Fix clipped primary actions, inaccessible horizontal content and dialogs whose close/save controls fall outside the reachable viewport.
7. **RP-17-S07:** Test long supported locale strings and representative non-English content, not just key existence. Preserve placeholders and meaningful status text while avoiding fixed widths that truncate actions.
8. **RP-17-S08:** Respect reduced-motion preferences and avoid animations that move focus or delay essential controls. Treat the previously transient tab overlap as a reproduction target, not a confirmed bug.
9. **RP-17-S09:** Apply suppressNative consistently to all image-export failure branches, including early validation failures. Return one structured result so custom UI feedback does not coexist with an unwanted native dialog.
10. **RP-17-S10:** Measure startup phases, time to first useful data, section-switch responsiveness and memory growth with the same fixture/build/hardware. Optimize demonstrated bottlenecks before adding more caching or loading placeholders.
11. **RP-17-S11:** Investigate installer footprint as a measurement task: the retained installers are approximately 974 MB each. Attribute size to actual packaged assets and duplicates before proposing exclusions; never remove runtime resources by guesswork.
12. **RP-17-S12:** Document accepted residual UX limitations with a specific user impact and follow-up owner instead of calling a visually inspected snapshot a full accessibility pass.

#### Concrete acceptance cases

##### RP-17-AC01. Below-fold table reveal

**Arrange:** The livestock table starts below the current viewport.
**Action:** Activate the table/view-details action.
**Expected:** The target becomes visible or clearly focused with immediate feedback; the user does not need to guess that scrolling is required.

##### RP-17-AC02. Small viewport and zoom

**Arrange:** Use 320/390 px widths and enlarged text on key dialogs/pages.
**Action:** Complete setup, authentication and settings tasks.
**Expected:** Primary actions and recovery controls remain reachable without clipped content blocking the task.

##### RP-17-AC03. Keyboard and screen reader

**Arrange:** Use keyboard only and the agreed Windows screen reader.
**Action:** Navigate all critical user journeys.
**Expected:** Labels, focus order, modal boundaries and result announcements are understandable and usable.

##### RP-17-AC04. Long locale strings

**Arrange:** Load representative longest supported labels and validation messages.
**Action:** Open settings, setup, overview and animal detail.
**Expected:** Actions are not truncated beyond recognition and layout remains usable.

##### RP-17-AC05. Busy-background contrast

**Arrange:** Use actual dashboard backgrounds and all status severities.
**Action:** Measure contrast and focus visibility against the agreed target.
**Expected:** Results are recorded with exact elements/build identity; failures are fixed or explicitly remain open.

##### RP-17-AC06. Suppressed image error

**Arrange:** Set suppressNative and trigger each early and late export failure.
**Action:** Observe dialogs and returned error.
**Expected:** No native dialog appears; the caller receives one structured failure suitable for its own UI.

##### RP-17-AC07. Normal image error

**Arrange:** Use the normal non-suppressed export flow.
**Action:** Trigger a valid failure.
**Expected:** Exactly the intended user feedback appears, with no duplicate notification.

##### RP-17-AC08. Performance and footprint baseline

**Arrange:** Use one frozen fixture and recorded hardware for before/after builds.
**Action:** Measure startup, section interaction, memory and package contents.
**Expected:** Only measured changes are reported; no unsupported responsiveness or size-reduction claim is made.

#### Deliverables

- Focused UX refinements and recovery copy
- Accessibility/responsive evidence
- Measured startup/memory/footprint baseline

#### Exit gate

Critical tasks are usable at supported sizes and with keyboard access; loading/stale/error states are honest and image-export suppression works consistently.

#### Compatibility and implementation risks

- Do not convert a short-lived visual observation into a confirmed defect without reproduction.
- Overaggressive virtualization or caching can reintroduce focus and stale-data defects.

#### Safe rollback postconditions

- Prefer small component/style rollbacks that preserve data/auth fixes.
- If an optimization harms accessibility or correctness, disable it and retain the measured baseline rather than masking the regression.

### RP-18. Run the integrated negative, regression and performance campaign

**Owner:** QA/test owner with all implementers. **Allowance:** 1.5-3 person-days.
**Dependencies:** `RP-03`, `RP-04`, `RP-05`, `RP-06`, `RP-07`, `RP-08`, `RP-09`, `RP-10`, `RP-11`, `RP-12`, `RP-13`, `RP-14`, `RP-15`, `RP-16`, `RP-17`.
**Scope:** Cross-cutting execution/release gate.
**Status:** Planned; reproduce against current production code before editing.

**Outcome:** Prove the fixes interact correctly before producing another candidate, with skips, failures and coverage gaps visible.

#### File and artifact targets

- Existing target: `C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/tests/`
- Existing target: `C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/NEW APP/src/`
- Existing target: [tools/check-lua-syntax.mjs](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/tools/check-lua-syntax.mjs)
- Existing target: [tools/app/verify-electron-pack-files.mjs](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/tools/app/verify-electron-pack-files.mjs)
- Proposed new target: [docs/_internal/audits/remediation-execution/automated-gate-results.json](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/remediation-execution/automated-gate-results.json)
- Proposed new target: [docs/_internal/audits/remediation-execution/negative-test-matrix.md](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/remediation-execution/negative-test-matrix.md)

#### Ordered implementation steps

1. **RP-18-S01:** Execute the production-linked cases for every reproduced finding and every previously unverified finding. Close already-fixed items through evidence rather than changing code merely to create a diff.
2. **RP-18-S02:** Run the existing Jest, Node ESM, TypeScript, packaging-manifest, translation and production dependency-advisory commands from the approved clean environment. Record current results rather than copying the earlier 531/82 counts.
3. **RP-18-S03:** Run the repaired Lua parser over all intended sources and record a nonzero file count. Keep game API/runtime acceptance separate from syntax acceptance.
4. **RP-18-S04:** Add actual Preact lifecycle and rendered-consumer results to the release gate, ensuring they are discovered by the configured runner and not merely present as files.
5. **RP-18-S05:** Run local route/WS/IPC policy tests, temporary-filesystem fault injection and local TLS/stream timeout fixtures. Use synthetic data and credentials; no live account or user's active save is needed.
6. **RP-18-S06:** Combine context switch, slow transfer, failed commit and application restart into cross-layer tests. A unit-safe helper can still be bypassed by an unguarded call site.
7. **RP-18-S07:** Run bounded scheduling and memory/handle cleanup tests with representative large fixtures. Ratify numerical budgets before judging results and record p95/p99 plus eventual-progress behavior.
8. **RP-18-S08:** Classify every optional environment skip and required blocked test. Required acceptance does not become optional because a dedicated server or game session was unavailable.
9. **RP-18-S09:** Use targeted isolated sensitivity/mutation checks for the critical origin, commit, ordering and zero-value regressions to demonstrate that the test fails if the relevant production protection is removed.
10. **RP-18-S10:** Review changed trust/persistence and game API code with the appropriate owner and an independent reviewer. Freeze the intended source snapshot for packaging only after critical cases pass.
11. **RP-18-S11:** Update the ledger to verified-in-workspace where justified. Do not advance packaged, installed or live statuses until those separate gates run.

#### Concrete acceptance cases

##### RP-18-AC01. Full traceability execution

**Arrange:** All 40 finding entries have mapped acceptance cases.
**Action:** Run their required current-code regressions.
**Expected:** Each receives pass/fail/blocked with evidence; none disappears because a broader suite passed.

##### RP-18-AC02. Required skip enforcement

**Arrange:** A required fixture or environment is missing.
**Action:** Run the gated campaign.
**Expected:** The release gate is blocked or fails with a reason; it is not reported as fully green.

##### RP-18-AC03. Cross-layer stale commit

**Arrange:** Slow A transfer, switch to B, fail a replacement, then restart.
**Action:** Exercise production scheduler/cache/store integration.
**Expected:** B remains correctly labeled and last-good bytes survive; no A resurrection occurs.

##### RP-18-AC04. Clear survives recovery

**Arrange:** A successful zero/clear follows nonzero cached data, then a later collection fails.
**Action:** Restart and render summary/detail.
**Expected:** The legitimate clear survives while failure status remains honest.

##### RP-18-AC05. Critical regression sensitivity

**Arrange:** Use isolated test-environment mutations of the relevant guard/ordering/commit behavior.
**Action:** Run the targeted tests.
**Expected:** Each targeted unsafe behavior produces a failure; product source is restored within the disposable test process/environment.

##### RP-18-AC06. Clean dependency gates

**Arrange:** Use the intended lockfiles without global dependency assistance.
**Action:** Run all declared required commands.
**Expected:** Dependencies resolve reproducibly, intended tests execute and Lua parsing reports the real file set.

##### RP-18-AC07. Resource-bound campaign

**Arrange:** Repeat source switches, failed requests and large-data updates.
**Action:** Measure operations, handles, memory and slice timing.
**Expected:** No unbounded growth or scheduling overlap is observed within the agreed duration; limitations are reported.

##### RP-18-AC08. Evidence state discipline

**Arrange:** Workspace tests pass but no installer has run.
**Action:** Update the ledger.
**Expected:** Items remain installed/live unverified despite workspace success.

#### Deliverables

- Current reproducible gate results
- Cross-layer negative-test evidence
- Reviewed source freeze and updated ledger

#### Exit gate

All mandatory source-level blockers pass against the intended source; gaps are explicit and packaging is authorized only from that identity.

#### Compatibility and implementation risks

- A passing dependency audit is not an application-security certificate.
- No finite soak proves absence of every leak; report duration, workload and measured bounds.

#### Safe rollback postconditions

- Do not suppress a failing test to reach packaging. Reopen the owning package with the exact reproduction.
- Preserve failed-run evidence alongside the corrected run so closure remains auditable.

### RP-19. Build uniquely identified private artifacts and protect release channels

**Owner:** Release owner. **Allowance:** 1-2 person-days.
**Dependencies:** `RP-18`.
**Scope:** Cross-cutting execution/release gate.
**Status:** Planned; reproduce against current production code before editing.

**Outcome:** Produce an auditable private candidate whose packaged bytes, edition mapping and update metadata match the verified source.

#### File and artifact targets

- Existing target: [FS25_FarmDashboard_App/package.json](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/package.json)
- Existing target: [FS25_FarmDashboard_App/electron-builder.rf.yml](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/electron-builder.rf.yml)
- Existing target: [tools/app/run-electron-builder.mjs](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/tools/app/run-electron-builder.mjs)
- Existing target: [tools/app/assert-rf-update-channel.mjs](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/tools/app/assert-rf-update-channel.mjs)
- Existing target: [tools/app/verify-electron-pack-files.mjs](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/tools/app/verify-electron-pack-files.mjs)
- Existing target: [tools/Zip-FarmDashboardMod.ps1](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/tools/Zip-FarmDashboardMod.ps1)
- Proposed new target: `private candidate directory, exact path approved before build`

#### Ordered implementation steps

1. **RP-19-S01:** Obtain the version/build-identity decision before rebuilding. Keep existing public 4.2.1/mod 3.4.0.7 untouched; do not invent a new public version or overwrite a same-version artifact already distributed.
2. **RP-19-S02:** Allocate a fresh private candidate directory and immutable external manifest with a unique build ID. If visible candidate versions are reused privately, hashes and build IDs must still distinguish every bundle.
3. **RP-19-S03:** Verify the build wrapper's output paths and publishing behavior before running it. Use the supported builder path with publishing disabled; do not blindly invoke an all-build script that may overwrite public ZIPs or feeds.
4. **RP-19-S04:** Build Classic and RF applications and their intended mod ZIPs from the frozen source/lock identity. Record the exact Electron/runtime and toolchain versions actually used.
5. **RP-19-S05:** Compare packaged source identities and relevant helpers with the intended corrected source. A workspace pass does not prove the ASAR or mod ZIP includes the patch.
6. **RP-19-S06:** Record file sizes, SHA-256 hashes and update-feed SHA-512 values using the appropriate formats. Confirm feed asset names, paths, sizes and version fields resolve only to the intended edition/build.
7. **RP-19-S07:** Check Authenticode status on both installers. The retained pair was NotSigned; decide the signing/distribution policy explicitly and never bypass or instruct testers to bypass Windows protections.
8. **RP-19-S08:** Verify installer IDs, shortcuts, profiles, ports, update channels and modDesc metadata together. Use an external manifest for private build identity rather than unsupported modDesc version syntax.
9. **RP-19-S09:** Capture the actual resolved output list and assert that public release directories, Classic public latest.yml and unrelated RF/public channel files are unchanged by this private build process.
10. **RP-19-S10:** Create a sealed acceptance packet containing installers, paired mods, hashes, source identity, compatibility notes and test results. Do not include secrets or active user profiles.
11. **RP-19-S11:** Do not distribute yet. Mark the bundle awaiting approved installed/live acceptance and retain previous candidates separately for rollback evidence.

#### Concrete acceptance cases

##### RP-19-AC01. Unique private identity

**Arrange:** Two builds share a visible version label.
**Action:** Create their manifests in separate private directories.
**Expected:** Each has unique build identity and hashes; neither overwrites the other.

##### RP-19-AC02. Packaged fix presence

**Arrange:** The source gate passed for identified modules.
**Action:** Inspect both ASARs and both mod ZIPs during packaging QA.
**Expected:** The intended corrected production code and edition metadata are actually present.

##### RP-19-AC03. Feed integrity

**Arrange:** Classic and RF private feed metadata references candidate artifacts.
**Action:** Recompute supported feed hashes and compare metadata.
**Expected:** Names, versions, sizes and SHA-512 values match the correct edition's bytes.

##### RP-19-AC04. Public boundary

**Arrange:** Record protected public asset identities before the private build.
**Action:** Run the approved no-publish build and compare afterward.
**Expected:** The public 4.2.1 story and protected public bytes/feeds are unchanged.

##### RP-19-AC05. Signature status

**Arrange:** Both generated installers are available.
**Action:** Inspect Authenticode.
**Expected:** Actual status is recorded; missing signing remains a decision/gate, not concealed.

##### RP-19-AC06. Dependency/build provenance

**Arrange:** The candidate manifest names source and lock hashes.
**Action:** Reproduce the documented build in the supported environment where feasible.
**Expected:** Inputs and outputs are attributable; any nondeterminism is documented rather than claiming byte reproducibility without evidence.

##### RP-19-AC07. Edition mapping

**Arrange:** Both apps and both mod ZIPs are in one packet.
**Action:** Check the pairing/launch metadata.
**Expected:** Classic and RF cannot be accidentally swapped by filename ambiguity or a shared update feed.

#### Deliverables

- Immutable private candidate bundle
- Hash/signature/feed manifest
- Packaged-code identity evidence

#### Exit gate

Only exact verified-source private artifacts proceed; public channels remain unchanged and signing status is explicit.

#### Compatibility and implementation risks

- The current approximately 974 MB installers make rebuild/distribution costly; measure footprint separately rather than risky late exclusions.
- Electron runtime support and signing policy must be verified at build time, not assumed from the old audit.

#### Safe rollback postconditions

- Withdraw the new private packet if identity or feed mapping is wrong; retain it for diagnosis under its original hash.
- Never replace previously distributed bytes in place. Issue a distinct approved candidate and manifest.

### RP-20. Perform approved installed, game and dedicated acceptance

**Owner:** Desktop QA + mod owner + dedicated-server tester. **Allowance:** 2-4 person-days.
**Dependencies:** `RP-19`.
**Scope:** `CUA-01`, `CUA-02`, `CUA-03`, `CUA-04`, `SRC-05`.
**Status:** Planned; reproduce against current production code before editing.

**Outcome:** Prove the exact installed pair and real game/dedicated paths work, without treating a development snapshot as acceptance.

#### File and artifact targets

- Proposed new target: [docs/_internal/audits/remediation-execution/installed-acceptance.md](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/remediation-execution/installed-acceptance.md)
- Proposed new target: [docs/_internal/audits/remediation-execution/live-dedicated-acceptance.md](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/remediation-execution/live-dedicated-acceptance.md)
- Existing target: [COMPATIBILITY.md](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/COMPATIBILITY.md)

#### Ordered implementation steps

1. **RP-20-S01:** At execution time obtain explicit approval for the exact installer hashes, target profile and game/mod switching window. The plan itself does not install, uninstall, replace a mod or authorize a live save change.
2. **RP-20-S02:** Prepare disposable Windows profiles for Keep/Full/upgrade cases and a copied test save for fault/performance cases. Confirm backups and restore ownership before touching any test target.
3. **RP-20-S03:** Close relevant test applications safely, install the approved Classic/RF pair and verify the actual launched executable/ASAR identity. A development window on 8767 is not a substitute.
4. **RP-20-S04:** Launch both editions together, confirm independent profiles/ports and exercise the shared-target writer policy. Check that a second instance explains read-only ownership instead of silently writing.
5. **RP-20-S05:** Walk first-run setup, unchanged Save/Open Dashboard, changed transport policy, dashboard return, selected-save restart and failed navigation recovery in each installed edition.
6. **RP-20-S06:** Use an agreed game session and the exact paired mod ZIP, one active variant at a time unless coexistence is explicitly supported and verified. Never hot-replace a loaded mod or overwrite the active Save 1 for a test.
7. **RP-20-S07:** Record game version, map, mod set, save/farm identity, source generation and log timestamps. Compare installed dashboard summaries and detail against the same live or frozen generation.
8. **RP-20-S08:** Exercise animal zero/unknown cases, detail refresh, legitimate clears, reconnect and stale indicators through controlled test fixtures or copied-save scenarios, not destructive edits to the user's farm.
9. **RP-20-S09:** Run one real supported dedicated connection end to end: authenticated setup, initial XML/detail read, source update, detail change, disconnect/reconnect and transport-policy behavior. Record whether the path is FTP/FTPS or HTTP/HTTPS; do not claim untested protocols passed.
10. **RP-20-S10:** Run the agreed large-save and dedicated soak with measured poll overlap, request service delay, slice timing, memory and recovery. Use provisional durations from the plan only after confirming server availability and safe load.
11. **RP-20-S11:** Run Keep/Full uninstall and upgrade/migration sentinel tests only in disposable profiles. Confirm the other edition and shared game data survive before accepting uninstall ownership.
12. **RP-20-S12:** Collect screenshots, redacted logs, timestamps, exact artifact hashes and step outcomes. Restore only test-owned state after closing applications and record what was restored.

#### Concrete acceptance cases

##### RP-20-AC01. Installed pair identity

**Arrange:** Approved installer hashes are installed in the disposable/approved environment.
**Action:** Launch both apps and inspect their runtime identity.
**Expected:** Evidence identifies the installed executables and packaged build, not merely package.json or a development port.

##### RP-20-AC02. Installed unchanged setup

**Arrange:** Both editions have valid existing settings.
**Action:** Save unchanged, open dashboard, select a non-default save and restart.
**Expected:** Navigation and selected context remain correct in the actual installed pair.

##### RP-20-AC03. Installed coexistence

**Arrange:** Both editions are open and point at independent then shared test targets.
**Action:** Read data and attempt authorized writes.
**Expected:** Profiles/ports remain separate and shared-target writer rules hold.

##### RP-20-AC04. Real game pairing

**Arrange:** The agreed game loads the copied/approved save with the intended mod variant.
**Action:** Collect and display a known generation.
**Expected:** App/mod versions and logs match the manifest; summaries and details use the same save/farm/generation.

##### RP-20-AC05. Dedicated end-to-end

**Arrange:** A real authorized dedicated endpoint supplies XML and livestock detail.
**Action:** Connect, update source data, disconnect and reconnect.
**Expected:** Current data refreshes, stale state is honest, reconnect recovers and no old generation overwrites new data.

##### RP-20-AC06. Failure recovery in installed runtime

**Arrange:** A controlled test endpoint times out or denies a transfer while last-good data exists.
**Action:** Observe UI and reconnect.
**Expected:** The app stays usable, preserves last-good data and gives the correct actionable error without secret leakage.

##### RP-20-AC07. Soak and load

**Arrange:** Use the ratified copied-save/server workload and duration.
**Action:** Run the measured session.
**Expected:** Counters stay within agreed bounds, requests continue to be serviced and no unexplained monotonic resource growth is accepted.

##### RP-20-AC08. Disposable destructive acceptance

**Arrange:** Owned and unrelated sentinel files exist across two edition profiles.
**Action:** Run Keep, Full and upgrade/migration cases.
**Expected:** Only intended test-owned data is changed; other-edition and shared game sentinels survive.

##### RP-20-AC09. Restoration record

**Arrange:** All acceptance steps are complete.
**Action:** Close test apps/game and restore only approved test state.
**Expected:** The user's active environment and public release remain untouched; any approved user-visible change is explicitly recorded.

#### Deliverables

- Exact-installed acceptance evidence
- Real game and dedicated-path results
- Disposable uninstall/upgrade evidence and restoration record

#### Exit gate

Every required installed/live/dedicated gate is passed against exact hashes, or the candidate remains on hold with a specific blocked step.

#### Compatibility and implementation risks

- The game was closed at the end of the prior audit; availability and Save 1 state must be reconfirmed at action time.
- A mirror snapshot, mocked protocol test or successful installer launch does not prove live dedicated behavior.

#### Safe rollback postconditions

- On any save-integrity, writer-ownership, auth or persistence failure, stop writes and halt acceptance immediately; preserve logs and test files.
- Close the game before mod rollback and restore only the pre-agreed compatible test environment, never a guessed active-save backup.

### RP-21. Approve a controlled tester handoff and operate rollback

**Owner:** Release/product owner. **Allowance:** 0.5-1 person-days.
**Dependencies:** `RP-20`.
**Scope:** Cross-cutting execution/release gate.
**Status:** Planned; reproduce against current production code before editing.

**Outcome:** Hand testers a clearly identified private build only after evidence-backed gates, with reproducible reporting and safe withdrawal.

#### File and artifact targets

- Proposed new target: [docs/_internal/audits/remediation-execution/tester-readme.md](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/remediation-execution/tester-readme.md)
- Proposed new target: [docs/_internal/audits/remediation-execution/release-decision.md](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/remediation-execution/release-decision.md)
- Proposed new target: `private candidate tester packet and issue template`

#### Ordered implementation steps

1. **RP-21-S01:** Review the closure ledger with owners. Every P1, including the two previously unverified P1 cases, must have explicit closure evidence; known trust/data-loss defects are not waived into a tester build.
2. **RP-21-S02:** Require closure of release-critical P2 data, auth, transport, migration and packaging cases. Any lower-impact residual issue needs a named owner, bounded user impact, workaround, expiry and explicit product approval.
3. **RP-21-S03:** Verify all required installed/live/dedicated gates are passed. If an environment is unavailable, label the build unaccepted for that path and do not represent the whole plan as complete.
4. **RP-21-S04:** Prepare a concise tester README naming Classic/RF/mod pairings, unique private build ID, hashes, signature status, supported environment and installation prerequisites.
5. **RP-21-S05:** Give testers a numbered journey: install approved pair, load an agreed save, walk setup, select/restart a save, inspect overview/pasture/detail, exercise the approved dedicated path and report recovery behavior.
6. **RP-21-S06:** Provide an issue template requiring build ID/hash, edition, game/mod versions, context, source generation/time, reproduction steps, expected/actual result and redacted logs/screenshots. Explicitly exclude passwords and access codes.
7. **RP-21-S07:** Define stop-test triggers for save corruption, unexpected file deletion, cross-save data, unauthorized writes, credential exposure and repeated exporter failure. Tell testers to stop writes and preserve evidence, not retry destructively.
8. **RP-21-S08:** Keep distribution private and approved. Do not upload, publish, update public feeds or replace the Classic 4.2.1 public narrative as part of this handoff.
9. **RP-21-S09:** Set a human-owned triage process with severity, owner, reproduction and next candidate identity. This plan does not create an automation or promise unattended monitoring.
10. **RP-21-S10:** Document withdrawal and rollback instructions for the exact paired build. A corrected candidate receives a new immutable identity and targeted rerun of affected acceptance gates.
11. **RP-21-S11:** Obtain final sign-off on the private tester packet, not a blanket public release approval. Public release/versioning is a separate later decision.

#### Concrete acceptance cases

##### RP-21-AC01. P1 closure gate

**Arrange:** A P1 or prior unverified P1 lacks required evidence.
**Action:** Attempt tester approval.
**Expected:** Approval remains blocked; broad green suites cannot substitute for the specific case.

##### RP-21-AC02. Residual issue waiver

**Arrange:** A lower-impact item is proposed for deferral.
**Action:** Review the waiver.
**Expected:** It includes owner, impact, workaround, expiry and explicit approval; security/data-integrity blockers are excluded.

##### RP-21-AC03. Tester reproducibility

**Arrange:** A tester follows the README on the approved environment.
**Action:** Submit one sample issue.
**Expected:** The exact build and context can be identified without requesting secrets.

##### RP-21-AC04. Stop-test response

**Arrange:** A simulated report describes cross-save data or unexpected file deletion.
**Action:** Apply the triage/runbook.
**Expected:** Testing/writes halt, evidence is preserved and the candidate is withdrawn pending diagnosis.

##### RP-21-AC05. Public release separation

**Arrange:** The private packet is approved.
**Action:** Perform the approved handoff.
**Expected:** No public feed, public 4.2.1 documentation or previously distributed binary is overwritten.

##### RP-21-AC06. Corrected candidate identity

**Arrange:** A tester defect is fixed later.
**Action:** Prepare the next candidate.
**Expected:** It has distinct immutable identity and reruns affected source, packaged and installed gates.

#### Deliverables

- Approved private tester packet
- Signed release/hold decision
- Triage, withdrawal and rollback instructions

#### Exit gate

Private testers receive only a traceable accepted candidate with clear limits; public release remains a separate explicit decision.

#### Compatibility and implementation risks

- A private tester handoff is not evidence that all future game/mod combinations are supported.
- Waivers must not conceal unavailable dedicated acceptance or known data-integrity defects.

#### Safe rollback postconditions

- Withdraw the specific bad build by its immutable identity and notify only the approved tester group through the agreed channel.
- Retain reports and hashes; do not overwrite the bad artifact with a corrected same-name binary.

## 6. Complete finding-to-execution crosswalk

Every finding retains its original ID. Current actionable findings and previous not-reverified findings are separated so the plan does not imply that all 40 were newly reproduced.

### 6.1 Current actionable re-audit findings

#### R2-MOD-01 / P1: Mod export success still does not prove bytes were written

**Evidence state:** Confirmed in the newly packaged RF mod source; no game fault injection.
**Primary package:** `RP-06`. **Acceptance:** `RP-06-AC01`, `RP-06-AC02`, `RP-06-AC03`, `RP-06-AC07`, `RP-06-AC08`.
**Why this work exists:** The copy wrapper discards copyFile's result and accepts a nonthrowing call plus an existing destination. Move recovery can then delete the source. Atomic/direct/mirror write paths do not consistently check write and close outcomes; saveFile fallback equates pcall success with persisted success.
**User/risk impact:** Disk, permission or nonthrowing I/O failures can leave stale or damaged exports while success bookkeeping advances. This finding concerns the packaged code; it does not claim the current save has been damaged.
**Retained evidence locations:** RF mod ZIP: `src/FarmDashboardDataCollector.lua:438`; RF mod ZIP: `src/FarmDashboardDataCollector.lua:596`; RF mod ZIP: `src/FarmDashboardDataCollector.lua:3545`; RF mod ZIP: `src/FarmDashboardDataCollector.lua:4011`; RF mod ZIP: `src/FarmDashboardExportMirror.lua:138`.

#### R2-SEC-01 / P1: Opaque browser origins still inherit native loopback trust

**Evidence state:** Reproduced in isolated candidate-code fixtures.
**Primary package:** `RP-03`. **Acceptance:** `RP-03-AC01`, `RP-03-AC02`.
**Why this work exists:** `getRequestOrigin` turns explicit Origin: null and malformed origins into an empty string. Both the write guard and WebSocket origin guard then take the no-origin local-client branch. The fixture accepted both, while rejecting an ordinary hostile HTTPS origin.
**User/risk impact:** A browser-origin boundary can be bypassed on locally reachable privileged HTTP/WS paths. This is a boundary reproduction, not a live browser exploit against your machine.
**Retained evidence locations:** RF candidate ASAR: `main.js:1485`; RF candidate ASAR: `main.js:1507`; RF candidate ASAR: `main.js:1838`.

#### R2-SEC-02 / P1: FTP detail filenames can escape the intended cache

**Evidence state:** Reproduced in an isolated Windows-path fixture.
**Primary package:** `RP-04`. **Acceptance:** `RP-04-AC01`, `RP-04-AC02`, `RP-04-AC06`.
**Why this work exists:** `syncFtpDetailsCache` only checks that a remote entry starts with animals_ and ends with .json. Backslashes and traversal components survive into path.join. A mocked listing directed the download to C:\audit\outside.json instead of the userData subtree.
**User/risk impact:** A malicious or compromised configured FTP source can influence a local write destination outside the cache. No real files were created or overwritten by the fixture.
**Retained evidence locations:** RF candidate ASAR: `main.js:2925`; RF candidate ASAR: `main.js:2930`.

#### R3-PIPE-09 / P1: Failed FTP replacement deletes the last good cache first

**Evidence state:** Reproduced in an isolated filesystem fixture.
**Primary package:** `RP-05`. **Acceptance:** `RP-05-AC01`, `RP-05-AC02`, `RP-05-AC04`.
**Why this work exists:** `safeDownload` unlinks localFinal before attempting rename. With a simulated EACCES at rename, it returned false with the final file absent and only the temporary file remaining. Per-pen FTP replacement contains the same unlink-before-rename sequence.
**User/risk impact:** A transient replacement failure removes the last usable local snapshot and degrades offline/recovery behavior. This is local cache loss, not demonstrated game-save corruption.
**Retained evidence locations:** RF candidate ASAR: `main.js:2846`; RF candidate ASAR: `main.js:2871`; RF candidate ASAR: `livestockDetail.js:414`.

#### R2-MOD-02 / P2: Sampled animal count correction still changes averages

**Evidence state:** Packaged-mod source confirmation.
**Primary package:** `RP-09`. **Acceptance:** `RP-09-AC06`, `RP-09-AC07`.
**Why this work exists:** Sampled buckets scale count and weighted sums together, then correct count alone to meet the reported population. Later averages divide unchanged sums by corrected counts. The inspected average helper also drops nonpositive sums, so measured all-zero health does not become an explicit aggregate zero.
**User/risk impact:** Herd average health, weight, age and genetics can change solely because head counts were reconciled; unknown and measured zero remain conflated at the aggregate boundary.
**Retained evidence locations:** RF mod ZIP: `src/collectors/AnimalDataCollector.lua:90`; RF mod ZIP: `src/collectors/AnimalDataCollector.lua:96`; RF mod ZIP: `src/collectors/AnimalDataCollector.lua:127`; RF mod ZIP: `src/collectors/AnimalDataCollector.lua:695`.

#### R2-MOD-03 / P2: Courseplay finance still falls back to purchase price

**Evidence state:** Packaged-mod source confirmation.
**Primary package:** `RP-10`. **Acceptance:** `RP-10-AC05`, `RP-10-AC06`.
**Why this work exists:** The incremental-fleet finance branch reads row.sellValue, row.sellPrice or row.price. The inspected vehicle serializer writes purchase price into row.price and the shown sell-value path stores it under ads.sellValue.
**User/risk impact:** Vehicle asset value and net worth can be inflated on this collection path.
**Retained evidence locations:** RF mod ZIP: `src/collectors/FinanceDataCollector.lua:59`; RF mod ZIP: `src/collectors/VehicleDataCollector.lua:372`; RF mod ZIP: `src/collectors/VehicleDataCollector.lua:749`.

#### R2-MOD-04 / P2: Courseplay compatibility still traverses the fleet twice per update

**Evidence state:** Packaged-mod source confirmation; no FPS benchmark.
**Primary package:** `RP-13`. **Acceptance:** `RP-13-AC01`, `RP-13-AC02`, `RP-13-AC08`.
**Why this work exists:** FarmDashboard:update calls the compatibility tick. When Courseplay is loaded, shieldFleetIfNeeded performs two complete fleet passes on each tick, without the no-Courseplay pending-work gate.
**User/risk impact:** Steady-state frame work grows with fleet size even when no shop/vehicle transition needs repair. The audit did not measure an FPS loss.
**Retained evidence locations:** RF mod ZIP: `src/FarmDashboard.lua:183`; RF mod ZIP: `src/FarmDashboardCourseplayCompat.lua:437`; RF mod ZIP: `src/FarmDashboardCourseplayCompat.lua:575`.

#### R2-MOD-05 / P2: Adaptive cadence still uses a requested interval that setters do not update

**Evidence state:** Packaged-mod source confirmation.
**Primary package:** `RP-13`. **Acceptance:** `RP-13-AC05`.
**Why this work exists:** _userCollectionCycleMs is captured during config load and preferred by adaptive cadence. The inspected synced-settings and setInt paths update config.collectionCycleMs but not that requested-value field.
**User/risk impact:** The user's interval choice can be overwritten or ignored by the next adaptive adjustment.
**Retained evidence locations:** RF mod ZIP: `src/FarmDashboardDataCollector.lua:993`; RF mod ZIP: `src/FarmDashboardDataCollector.lua:1429`; RF mod ZIP: `src/FarmDashboardSettingsApi.lua:169`; RF mod ZIP: `src/FarmDashboardSettingsApi.lua:236`.

#### R2-MOD-06 / P2: Collector failure still collapses into an empty payload

**Evidence state:** Packaged-mod source confirmation; full scheduler fault injection outstanding.
**Primary package:** `RP-06`. **Acceptance:** `RP-06-AC04`, `RP-06-AC05`, `RP-06-AC06`.
**Why this work exists:** `safeCollect` returns an empty table both for missing/failed collection and for empty results, without an error status. Legacy collection consumes that result, and other completion paths still update cached data/finish slices without a uniform failure envelope.
**User/risk impact:** Downstream code cannot reliably distinguish a successful empty section from a failed collection; stale/clear/freshness decisions remain fragile.
**Retained evidence locations:** RF mod ZIP: `src/FarmDashboardDataCollector.lua:2730`; RF mod ZIP: `src/FarmDashboardDataCollector.lua:3030`; RF mod ZIP: `src/FarmDashboardDataCollector.lua:3055`; RF mod ZIP: `src/FarmDashboardDataCollector.lua:3596`.

#### R2-MOD-07 / P2: Station-name rules still fabricate sell offers

**Evidence state:** Packaged-mod source confirmation.
**Primary package:** `RP-11`. **Acceptance:** `RP-11-AC01`, `RP-11-AC02`.
**Why this work exists:** Although synthetic whole stations were removed, Method 8 still inserts products and fixed multipliers into existing named stations, including Grain Mill and Biogas Plant. Those prices feed the crop min/max/best-location calculation.
**User/risk impact:** The dashboard can recommend an offer that was inferred from a station name rather than observed from the game.
**Retained evidence locations:** RF mod ZIP: `src/collectors/EconomyDataCollector.lua:791`; RF mod ZIP: `src/collectors/EconomyDataCollector.lua:838`; RF mod ZIP: `src/collectors/EconomyDataCollector.lua:889`.

#### R2-MOD-08 / P2: Bale enumeration still budgets accepted rows rather than examined entries

**Evidence state:** Packaged-mod source confirmation.
**Primary package:** `RP-13`. **Acceptance:** `RP-13-AC03`, `RP-13-AC04`, `RP-13-AC08`.
**Why this work exists:** The iterator restarts pairs over a source table, skips previously seen entries, and increments its cap primarily for newly accepted entries. A large table of non-bale or already-seen objects can therefore require a broad scan in one slice.
**User/risk impact:** The nominal row budget does not bound actual work and can still cause long game-thread slices.
**Retained evidence locations:** RF mod ZIP: `src/InventoryScan.lua:1059`; RF mod ZIP: `src/InventoryScan.lua:1072`; RF mod ZIP: `src/InventoryScan.lua:1102`.

#### R2-PERF-01 / P2: FTP intervals can overlap and stale downloads can still commit files

**Evidence state:** Candidate-source confirmation of the overlapping FTP branch.
**Primary package:** `RP-12`. **Acceptance:** `RP-12-AC04`, `RP-12-AC05`, `RP-12-AC09`.
**Why this work exists:** The interval starts another batch without awaiting the previous batch. Poll generation checks occur before safeDownload and after it, but safeDownload replaces the final file internally before the post-download generation check. Generation-specific temporary names do not prevent an older operation from committing the shared final file.
**User/risk impact:** Slow connections or configuration changes can create duplicate work and replace current disk data with an obsolete operation, even if renderer ingestion is later skipped.
**Retained evidence locations:** RF candidate ASAR: `main.js:2976`; RF candidate ASAR: `main.js:2981`; RF candidate ASAR: `main.js:3085`.

#### R2-PERF-02 / P2: The HTTP total deadline still behaves as an idle timeout

**Evidence state:** Reproduced with candidate code and a simulated trickle response.
**Primary package:** `RP-12`. **Acceptance:** `RP-12-AC06`, `RP-12-AC07`, `RP-12-AC08`.
**Why this work exists:** The 45-second deadline is checked when entering a request/redirect, but there is no independent wall-clock cancellation timer for an active body. A mocked stream was still pending at 60 seconds and then returned HTTP 200. Response aborted/error settlement also remains incomplete in the inspected function.
**User/risk impact:** A slowly streaming or prematurely aborted feed can keep collection work pending beyond the advertised deadline and amplify polling overlap.
**Retained evidence locations:** Classic candidate ASAR: `httpFeedXml.js:84`; Classic candidate ASAR: `httpFeedXml.js:102`; Classic candidate ASAR: `httpFeedXml.js:130`.

#### R2-PIPE-01 / P2: FTP pen freshness still trusts client mtime and a missing dirty index

**Evidence state:** Candidate-source confirmation.
**Primary package:** `RP-08`. **Acceptance:** `RP-08-AC03`, `RP-08-AC09`.
**Why this work exists:** Bulk detail sync compares remote mtime with the downloaded file's local mtime. Per-pen detail re-fetches only when dirtyAt is positive and newer than the local timestamp; a cached file with a missing index can therefore be reused indefinitely.
**User/risk impact:** Clock skew and missing/stale indexes can leave animal detail old even while the overview continues updating.
**Retained evidence locations:** RF candidate ASAR: `main.js:2933`; RF candidate ASAR: `livestockDetail.js:589`.

#### R2-PIPE-02 / P2: Unstamped export freshness is still renewed after restart

**Evidence state:** Candidate-source confirmation of the accepted unstamped-export path.
**Primary package:** `RP-08`. **Acceptance:** `RP-08-AC04`, `RP-08-AC08`.
**Why this work exists:** The content hash excludes weather and is not included in the persisted cache identity. On new in-memory state, the same unstamped export receives a new receipt-based lastLuaReceivedAt.
**User/risk impact:** Old cached data can appear fresh after a restart; an unstamped weather-only update can also be missed by freshness detection. This is a legacy/unstamped-input path, not a claim that every current export lacks a timestamp.
**Retained evidence locations:** RF candidate ASAR: `main.js:2053`; RF candidate ASAR: `main.js:2097`; RF candidate ASAR: `main.js:2447`.

#### R2-PIPE-03 / P2: Hold and snapshot logic still retains legitimately cleared sections

**Evidence state:** Candidate-source confirmation.
**Primary package:** `RP-08`. **Acceptance:** `RP-08-AC05`, `RP-08-AC02`.
**Why this work exists:** Backup updates remember nonempty animals without clearing the prior backup on an authoritative empty result. Snapshot forwarding restores previous animals/stock when the next section is empty; stock and RF hold branches still conflate empty with unavailable.
**User/risk impact:** Removed animals, exhausted stock or disabled optional data can reappear during fallback/restart, undermining confidence in the dashboard.
**Retained evidence locations:** RF candidate ASAR: `mergedSnapshotHold.js:466`; RF candidate ASAR: `mergedSnapshotHold.js:615`; RF candidate ASAR: `mergedSnapshotHold.js:645`; RF candidate ASAR: `mergedSnapshotHold.js:688`.

#### R2-PIPE-04 / P2: Detail generations are still dropped and zero pens can receive old animals

**Evidence state:** Reproduced in isolated candidate-helper fixtures.
**Primary package:** `RP-08`. **Acceptance:** `RP-08-AC01`, `RP-08-AC02`, `RP-08-AC09`.
**Why this work exists:** `makeCacheEntry` still drops generatedAt. A husbandry reporting zero animals accepted two retained detail rows and was marked hydrated. The newer code prefers some smaller unique-ID lists, but does not establish generation correctness or a zero-population tombstone.
**User/risk impact:** Sold or removed animals can reappear as detail rows, and choosing the newest complete pen snapshot remains unreliable.
**Retained evidence locations:** RF candidate ASAR: `detailAnimalsHydrate.js:65`; RF candidate ASAR: `detailAnimalsHydrate.js:115`; RF candidate ASAR: `detailAnimalsHydrate.js:233`.

#### R2-PIPE-05 / P2: Ambiguous fleet ownership is still promoted from farm heuristics

**Evidence state:** Candidate-source confirmation.
**Primary package:** `RP-10`. **Acceptance:** `RP-10-AC02`, `RP-10-AC03`.
**Why this work exists:** The transient-pool resolver scores farms using livestock, land, current fleet and ADS presence, then writes the selected farm into ownerFarmId/farmId when the fallback applies.
**User/risk impact:** An ambiguous ownership guess can become authoritative-looking fleet and financial data on the wrong farm.
**Retained evidence locations:** RF candidate ASAR: `dataMerger.js:2126`; RF candidate ASAR: `dataMerger.js:2183`.

#### R2-PIPE-06 / P2: One XML vehicle can still be consumed through two matching indices

**Evidence state:** Reproduced using the candidate matching branches.
**Primary package:** `RP-10`. **Acceptance:** `RP-10-AC01`.
**Why this work exists:** A configuration-key match removes a row from one list but leaves its UID index available. The fixture matched the same XML object first by configuration and then again by UID.
**User/risk impact:** Distinct live vehicles can inherit the same saved identity, ownership or values, producing duplicate or misleading fleet information.
**Retained evidence locations:** RF candidate ASAR: `dataMerger.js:2254`; RF candidate ASAR: `dataMerger.js:2272`; RF candidate ASAR: `dataMerger.js:2291`; RF candidate ASAR: `dataMerger.js:2316`.

#### R2-PIPE-07 / P2: Field IDs and farmland IDs still share a collision-prone seen set

**Evidence state:** Candidate-source confirmation of one remaining branch.
**Primary package:** `RP-10`. **Acceptance:** `RP-10-AC04`, `RP-10-AC03`.
**Why this work exists:** The Lua-only append branch checks seenKeys against both field.id and farmlandId even though XML keys use farmlandId-or-id. A valid field can be suppressed because its field ID happens to equal a different record's farmland ID. The separate prior ownership-precedence branch was not fully re-executed here.
**User/risk impact:** Valid fields may disappear from merged output when identifier domains collide.
**Retained evidence locations:** RF candidate ASAR: `dataMerger.js:1725`.

#### R2-PIPE-08 / P2: XML change detection still misses changes below the maximum mtime

**Evidence state:** Reproduced with a synthetic per-file stat fixture.
**Primary package:** `RP-08`. **Acceptance:** `RP-08-AC06`, `RP-08-AC07`.
**Why this work exists:** The fingerprint remains maximum mtime plus total size. Changing one file's mtime from 1000 to 2000 while another remained 9999 produced the same fingerprint, 9999:200.
**User/risk impact:** A valid XML update can be skipped and old field/vehicle/economy data retained until another fingerprint component changes.
**Retained evidence locations:** RF candidate ASAR: `xmlCollector.js:1154`.

#### R2-REL-01 / P2: The Lua syntax gate still cannot start

**Evidence state:** Reproduced by the requested validation command.
**Primary package:** `RP-01`. **Acceptance:** `RP-01-AC01`, `RP-01-AC02`.
**Why this work exists:** `node tools/check-lua-syntax.mjs` exits with MODULE_NOT_FOUND for luaparse. No Lua files were parsed by this attempted gate.
**User/risk impact:** The packaged mod has no successful current syntax-gate evidence from the declared command. JavaScript tests do not replace this.
**Retained evidence locations:** Current command failure: `tools/check-lua-syntax.mjs:15`.

#### R2-REL-02 / P2: Integration cases still pass without exercising their assertions

**Evidence state:** Observed in the current Jest output.
**Primary package:** `RP-01`. **Acceptance:** `RP-01-AC03`, `RP-01-AC04`, `RP-01-AC07`.
**Why this work exists:** The transient-pool integration case returned early when the expected remapped vehicle was absent. The live Giants HTTP-feed case returned early unless its opt-in environment was set. Jest counted both as passes.
**User/risk impact:** Green totals overstate integration coverage, including a path whose missing result should be a regression rather than a pass.
**Retained evidence locations:** Current test output: `FS25_FarmDashboard_App/tests/mergeTransientPool.integration.test.js:157`; Current test output: `FS25_FarmDashboard_App/tests/httpFeedXml.test.js:61`.

#### R2-SEC-04 / P2: Transport-only settings changes still do not refresh the live poller

**Evidence state:** Reproduced in configuration fixtures; retained poller object confirmed in candidate source.
**Primary package:** `RP-12`. **Acceptance:** `RP-12-AC02`, `RP-12-AC09`.
**Why this work exists:** The server signature includes connection identity and secret revisions but omits ftpSecure and httpFeedSecure. Changing only either flag returns no reboot. The FTP coordinator retains its original server objects.
**User/risk impact:** The settings screen can show a secure configuration while an already-running live poller still uses the previous transport until restart.
**Retained evidence locations:** Classic candidate ASAR: `setupConfigMerge.cjs:52`; RF candidate ASAR: `main.js:3078`.

#### R3-DATA-05 / P2: The new hydration hook still keeps stale detail and can skip a new save

**Evidence state:** Reproduced with the actual hook and a simulated hook lifecycle.
**Primary package:** `RP-09`. **Acceptance:** `RP-09-AC01`, `RP-09-AC02`, `RP-09-AC03`.
**Why this work exists:** With the same save/farm/pen key, replacing the source generation did not re-fetch detail: health stayed 60 instead of 90. Switching A to B with the same pen ID cleared state in one effect, but the next effect read the old hydratedRef and skipped B's request. The fixture ended with an unhydrated B row and no B fetch.
**User/risk impact:** Summaries can stop following current animal detail, or lose detail after a save/farm switch despite the initial snapshot now looking correct. The hook simulation is not an end-to-end Preact/browser race test.
**Retained evidence locations:** Workspace helper: `NEW APP/src/lib/use-hydrated-livestock.ts:30`; Workspace helper: `NEW APP/src/lib/use-hydrated-livestock.ts:51`; Workspace helper: `NEW APP/src/lib/use-hydrated-livestock.ts:69`; Workspace helper: `NEW APP/src/lib/use-hydrated-livestock.ts:88`.

#### R3-REL-03 / P2: The new pasture summary tests exercise a copy of production logic

**Evidence state:** Direct review of the new test file.
**Primary package:** `RP-01`. **Acceptance:** `RP-01-AC05`.
**Why this work exists:** `pastureStockSummary.test.js` defines its own summarizePastureAnimals function and asserts that copy. It does not import the production TypeScript function.
**User/risk impact:** The tests can remain green when the real parser regresses or is changed independently, leaving the visible remediation unprotected.
**Retained evidence locations:** Workspace test: `FS25_FarmDashboard_App/tests/pastureStockSummary.test.js:3`; Workspace test: `FS25_FarmDashboard_App/tests/pastureStockSummary.test.js:8`.

#### R3-SEC-05 / P2: Classic-to-RF import drops secure transport policy

**Evidence state:** Reproduced against the new edition-policy helper.
**Primary package:** `RP-12`. **Acceptance:** `RP-12-AC01`, `RP-12-AC03`.
**Why this work exists:** The import allowlist correctly removes passwords and feed codes, but also omits ftpSecure, FTP TLS policy and httpFeedSecure. The fixture imported a secure server with neither secure flag. The packaged FTP helper defaults an unspecified transport to plaintext.
**User/risk impact:** After the user re-enters credentials, an imported connection can downgrade when the server accepts plaintext, or fail unexpectedly when it requires TLS.
**Retained evidence locations:** Workspace helper: `FS25_FarmDashboard_App/editionPolicy.cjs:141`; RF candidate ASAR: `ftpAccess.cjs:3`.

#### R3-SEC-06 / P2: IPC hardening covers launch, not the privileged bridge as a whole

**Evidence state:** Source and URL-helper fixtures; exploit reachability remains conditional.
**Primary package:** `RP-03`. **Acceptance:** `RP-03-AC03`, `RP-03-AC04`, `RP-03-AC05`, `RP-03-AC07`.
**Why this work exists:** The new URL helper accepts arbitrary file:///.../index.html and setup.html paths. Sender checking uses webContents.getURL rather than senderFrame identity. The candidate still exposes configuration and LAN handlers without per-handler sender validation, while navigation accepts arbitrary file URLs.
**User/risk impact:** An untrusted document or frame reaching the preload bridge would have more authority than intended. No such hostile-document entry path was established in this audit.
**Retained evidence locations:** Workspace helper: `FS25_FarmDashboard_App/editionPolicy.cjs:194`; RF candidate ASAR: `main.js:3173`; RF candidate ASAR: `main.js:3681`; RF candidate ASAR: `main.js:3701`; RF candidate ASAR: `main.js:3774`; RF candidate ASAR: `preload.js:12`; Classic candidate ASAR: `main.js:3638`.

#### R2-BACK-01 / P3: Early image-export failures still ignore dialog suppression

**Evidence state:** Candidate-source confirmation.
**Primary package:** `RP-17`. **Acceptance:** `RP-17-AC06`, `RP-17-AC07`.
**Why this work exists:** The unsupported-platform and missing-script exits call native dialogs directly despite suppressNative being available. Later errors use the shared presentation path.
**User/risk impact:** A browser/UI-triggered failure can unexpectedly open a native desktop dialog instead of remaining in its requesting surface.
**Retained evidence locations:** RF candidate ASAR: `main.js:372`; RF candidate ASAR: `main.js:377`; RF candidate ASAR: `main.js:388`.

### 6.2 Prior findings still requiring specific re-verification

#### R2-DATA-01 / P1: A late bootstrap response can still display one save under another save's name

**State:** Not reverified; reproduce first, not assumed fixed or still broken.
**Primary package:** `RP-07`. **Acceptance:** `RP-07-AC01`, `RP-07-AC08`.
**Required closure reproduction:** Delay initial A beyond splash dismissal, switch to B and complete B then A. B must remain selected with B's payload. Cover bootstrap, manual refresh, fallback polling and WS overlap.

If current production already passes, record a specific production-linked regression and closure evidence rather than rewriting working code. If it fails, implement the owning package's correction before advancing the release gate.

#### R2-UI-01 / P1: The new focus trap moves password typing back into the username field

**State:** Not reverified; reproduce first, not assumed fixed or still broken.
**Primary package:** `RP-14`. **Acceptance:** `RP-14-AC01`, `RP-14-AC07`.
**Required closure reproduction:** Type an entire username/password normally without focus moving unexpectedly; changing input state or delivering a live payload must not reset focus. Escape and focus restoration must still work.

If current production already passes, record a specific production-linked regression and closure evidence rather than rewriting working code. If it fails, implement the owning package's correction before advancing the release gate.

#### R2-DATA-02 / P2: Concurrent requests for the same save can overwrite newer data with older data

**State:** Not reverified; reproduce first, not assumed fixed or still broken.
**Primary package:** `RP-07`. **Acceptance:** `RP-07-AC02`, `RP-07-AC03`.
**Required closure reproduction:** Reverse same-save HTTP completion and interleave HTTP with newer WS revisions. The displayed source revision never decreases.

If current production already passes, record a specific production-linked regression and closure evidence rather than rewriting working code. If it fails, implement the owning package's correction before advancing the release gate.

#### R2-DATA-03 / P2: An authoritative zero herd size still preserves nonzero cluster rows

**State:** Not reverified; reproduce first, not assumed fixed or still broken.
**Primary package:** `RP-09`. **Acceptance:** `RP-09-AC04`.
**Required closure reproduction:** For targets0,1,5 and larger values, emitted counts sum to the authoritative target before any explicit display cap. Missing totals must follow a different documented fallback.

If current production already passes, record a specific production-linked regression and closure evidence rather than rewriting working code. If it fails, implement the owning package's correction before advancing the release gate.

#### R2-DATA-04 / P2: The display formatter still turns a zero-health synthetic animal into100%

**State:** Not reverified; reproduce first, not assumed fixed or still broken.
**Primary package:** `RP-09`. **Acceptance:** `RP-09-AC05`, `RP-09-AC07`.
**Required closure reproduction:** A synthetic zero-health row renders0% with the appropriate warning; a genuinely unknown reading is identified as unknown or explicitly estimated, never silently healthy.

If current production already passes, record a specific production-linked regression and closure evidence rather than rewriting working code. If it fails, implement the owning package's correction before advancing the release gate.

#### R2-SEC-03 / P2: Raw map identifiers still select overview images outside the source root

**State:** Not reverified; reproduce first, not assumed fixed or still broken.
**Primary package:** `RP-04`. **Acceptance:** `RP-04-AC04`, `RP-04-AC05`.
**Required closure reproduction:** Outside overview fixtures cannot be selected or returned; legitimate custom map exports still resolve.

If current production already passes, record a specific production-linked regression and closure evidence rather than rewriting working code. If it fails, implement the owning package's correction before advancing the release gate.

#### R2-UX-01 / P2: HTTP discovery errors are treated as a successful empty server list

**State:** Not reverified; reproduce first, not assumed fixed or still broken.
**Primary package:** `RP-07`. **Acceptance:** `RP-07-AC04`, `RP-07-AC05`.
**Required closure reproduction:** First discovery returns503, then200 with saves. The UI recovers the save selector without reloading;401 triggers authentication rather than an empty configuration.

If current production already passes, record a specific production-linked regression and closure evidence rather than rewriting working code. If it fails, implement the owning package's correction before advancing the release gate.

#### R2-UX-02 / P2: Failed settings hydration still enables saving unloaded defaults

**State:** Not reverified; reproduce first, not assumed fixed or still broken.
**Primary package:** `RP-15`. **Acceptance:** `RP-15-AC01`, `RP-15-AC02`, `RP-15-AC03`, `RP-15-AC04`.
**Required closure reproduction:** Fail each load stage and ensure unloaded sections cannot be persisted. Fail each save stage and display exact committed/failed sections without a generic saved/synced claim.

If current production already passes, record a specific production-linked regression and closure evidence rather than rewriting working code. If it fails, implement the owning package's correction before advancing the release gate.

#### R2-UX-03 / P2: Authentication still proceeds on timeout and clears valid credentials on network failure

**State:** Not reverified; reproduce first, not assumed fixed or still broken.
**Primary package:** `RP-14`. **Acceptance:** `RP-14-AC02`, `RP-14-AC03`, `RP-14-AC04`.
**Required closure reproduction:** Cover early completion, >30s login, hung network,401, temporary outage and double-submit. No protected bootstrap occurs before authorization and saved credentials survive transport errors.

If current production already passes, record a specific production-linked regression and closure evidence rather than rewriting working code. If it fails, implement the owning package's correction before advancing the release gate.

#### R2-UX-04 / P2: SimHub waits for authentication before mounting the component that performs it

**State:** Not reverified; reproduce first, not assumed fixed or still broken.
**Primary package:** `RP-14`. **Acceptance:** `RP-14-AC05`, `RP-14-AC06`.
**Required closure reproduction:** A direct unauthenticated SimHub URL shows login immediately; cached authorization verifies without the artificial30s delay;401/403/503/non-JSON responses have clear recoverable states.

If current production already passes, record a specific production-linked regression and closure evidence rather than rewriting working code. If it fails, implement the owning package's correction before advancing the release gate.

#### R2-UX-05 / P2: A missing Windows save path is still described as rejected credentials

**State:** Not reverified; reproduce first, not assumed fixed or still broken.
**Primary package:** `RP-14`. **Acceptance:** `RP-14-AC08`.
**Required closure reproduction:** ENOENT/ENOTDIR paths under C:\Users map to path errors;EACCES maps to permissions;real401/403/auth rejection remains authentication-specific.

If current production already passes, record a specific production-linked regression and closure evidence rather than rewriting working code. If it fails, implement the owning package's correction before advancing the release gate.

### 6.3 Installed-candidate checks

#### CUA-01: Classic/RF coexistence

**Retained state:** Implemented mechanism; installed acceptance pending.
The candidate applies edition-specific userData/sessionData before Store and the single-instance lock; ports resolve to Classic 8766 and RF 8768. The installed Classic still contains the earlier shared-port main.js. No newly installed side-by-side run was performed.
**Primary package:** `RP-16`. **Acceptance:** `RP-16-AC01`, `RP-16-AC04`, `RP-20-AC01`, `RP-20-AC03`.

#### CUA-02: Classic unchanged-setup launch

**Retained state:** Source fix present; installed acceptance pending.
Packaged setup now invokes launchDashboard after saving, and the main process explicitly navigates to the dashboard even without a server reboot. The actual installer journey, double-submit and navigation-failure cases are not closed.
**Primary package:** `RP-15`. **Acceptance:** `RP-15-AC05`, `RP-15-AC06`, `RP-15-AC07`, `RP-20-AC02`.

#### CUA-03: Pasture summary/detail agreement

**Retained state:** Observed snapshot improvement; lifecycle defects remain.
Development UI shows 209 animals, 98% health, 3 males and 206 females for BigSky Cow Stall. The animal table reports 209 and 98%. The new hook still fails generation/same-ID save-switch fixtures.
**Primary package:** `RP-09`. **Acceptance:** `RP-09-AC08`, `RP-09-AC01`, `RP-09-AC02`, `RP-20-AC04`.

#### CUA-04: Selected save survives setup

**Retained state:** Not reverified.
The visible development session remained on Montana; no unchanged-settings setup round-trip or fresh RF install restart was executed. The new hydration same-ID switch defect is separate from selection persistence.
**Primary package:** `RP-07`. **Acceptance:** `RP-07-AC06`, `RP-07-AC07`, `RP-20-AC02`.

#### SRC-05: Edition-scoped uninstall ownership

**Retained state:** Policy/test progress; destructive acceptance pending.
Edition allowlists are disjoint and installer source-contract tests pass. No uninstall was run; Keep/Full/upgrade ownership and preservation of browser preferences still need disposable-profile tests.
**Primary package:** `RP-16`. **Acceptance:** `RP-16-AC07`, `RP-16-AC08`, `RP-20-AC08`.

### 6.4 Conditional risks, not additional confirmed exploit counts

#### C1: Proxy and Host trust still require an explicit deployment policy

**Retained state:** Partial.
Setup rejects an unrecognized public Host, but general API authorization still trusts loopback independently of Host. A reverse proxy that rewrites Host to localhost can inherit local/setup trust.
**Evidence boundary:** No public proxy deployment or DNS-rebinding exploit was established.
**Primary package:** `RP-03`. **Acceptance:** `RP-03-AC06`.

Closure requires a supported-path trace plus a passing case, or explicit evidence that the path is unreachable/unsupported and safely excluded. Absence of a reproduced exploit or stall is not proof that the permissive code is harmless.

#### C2: Navigation allowlists and privileged IPC are not yet tied to exact trusted documents

**Retained state:** Partial.
Navigation/window guards now exist, but allow arbitrary file: URLs and accept default-port localhost URLs through u.port || PORT. Privileged IPC handlers still omit sender/frame validation. A fixture accepted an outside file document and localhost:80 while rejecting external HTTPS.
**Evidence boundary:** No hostile-document navigation path or renderer exploit was established.
**Primary package:** `RP-03`. **Acceptance:** `RP-03-AC03`, `RP-03-AC04`, `RP-03-AC05`, `RP-03-AC08`.

Closure requires a supported-path trace plus a passing case, or explicit evidence that the path is unreachable/unsupported and safely excluded. Absence of a reproduced exploit or stall is not proof that the permissive code is harmless.

#### C3: Field fallback collection modes still contain unbounded synchronous scans

**Retained state:** Partial.
MOD-14's default coroutine and bale prepass now yield. Fallback, _smState and legacy branches still disable or bypass yielding before scanning the world.
**Evidence boundary:** Practical reachability of these fallback modes in the current supported game configuration was not established. No universal frame-stall claim is made.
**Primary package:** `RP-13`. **Acceptance:** `RP-13-AC06`, `RP-13-AC08`.

Closure requires a supported-path trace plus a passing case, or explicit evidence that the path is unreachable/unsupported and safely excluded. Absence of a reproduced exploit or stall is not proof that the permissive code is harmless.

#### C4: Freshness-gated cycle tails may delay request polling during persistent collector failure

**Retained state:** Not verified.
The examined cycle tail is freshness-gated and contains request polling and detail rotation. A permanently failing collector could prevent that particular tail from running.
**Evidence boundary:** Alternative servicing paths were not fully excluded, so end-to-end request starvation is not established and is not included in confirmed finding counts.
**Primary package:** `RP-13`. **Acceptance:** `RP-06-AC06`, `RP-13-AC07`.

Closure requires a supported-path trace plus a passing case, or explicit evidence that the path is unreachable/unsupported and safely excluded. Absence of a reproduced exploit or stall is not proof that the permissive code is harmless.

## 7. Fixture catalogue and safe environments

### 7.1 Reusable fixtures

#### FX-01: Origin/route/WS matrix

**Consumers:** `RP-03`.
Synthetic missing/null/malformed/allowed/hostile origins, native capability states, Host rewrites and untrusted forwarding headers.
**Safety boundary:** Bind only a local test service; use synthetic auth values.

#### FX-02: Electron document/frame matrix

**Consumers:** `RP-03`, `RP-14`.
Packaged exact paths, outside index/setup files, main/child/different webContents, default-port localhost and approved dev origin.
**Safety boundary:** Use a disposable Electron profile; do not open arbitrary real downloaded documents.

#### FX-03: Contained paths and sentinels

**Consumers:** `RP-04`, `RP-16`.
Windows traversal/UNC/ADS/encoding variants, legitimate custom maps and pens, outside sentinel files, controlled reparse point where supported.
**Safety boundary:** All created links/files stay in a named disposable test tree; outside sentinels are also test-owned.

#### FX-04: Desktop commit fault states

**Consumers:** `RP-05`, `RP-08`, `RP-12`.
Known final bytes, staged valid/invalid payloads, EACCES/sharing violations, canceled generations and every journal/backup crash state.
**Safety boundary:** No fault injection against userData or active game exports.

#### FX-05: FS25 I/O adapter outcomes

**Consumers:** `RP-06`.
Documented game API outcomes for copy/write/close/save/mirror, thrown and nonthrowing failures, dirty/generation bookkeeping.
**Safety boundary:** Mock adapters first; actual engine checks only in the approved copied-save environment.

#### FX-06: Deferred context and auth lifecycle

**Consumers:** `RP-07`, `RP-09`, `RP-14`, `RP-15`.
Deferred HTTP/WS promises, same-save reversed revisions, A/B same pen IDs, slow login, retries, double submit and stale Settings revisions.
**Safety boundary:** Actual Preact DOM with fake/local endpoints and synthetic credentials.

#### FX-07: Livestock truth set

**Consumers:** `RP-08`, `RP-09`, `RP-11`.
Targets 0/1/5/large, zero/unknown health, scaled sample buckets, cleared/recreated pens and the retained 209/98%/3/206 snapshot.
**Safety boundary:** Redacted frozen data; snapshot values are fixture expectations, not a live-save assertion.

#### FX-08: Freshness and restart set

**Consumers:** `RP-08`.
Legacy unstamped data, source epoch rollover, missing dirty index, non-max XML mtime change, equal metadata changed bytes and weather-only change.
**Safety boundary:** Temporary cache roots and controllable clocks; no clock changes on the user's machine.

#### FX-09: Ownership and canonical fleet

**Consumers:** `RP-10`, `RP-11`.
Duplicate config/UID matches, unknown/conflicting owners, field/farmland ID collision, nested sell values and explicit vehicle/pallet ID sets.
**Safety boundary:** Hermetic records with required fixture preconditions.

#### FX-10: HTTP/TLS/FTP lifecycle

**Consumers:** `RP-12`.
Trickle streams, premature close, redirects, body caps, untrusted test certificate, slow FTP and transport-only configuration changes.
**Safety boundary:** Local protocol fixtures; authorized real dedicated credentials only in RP-20.

#### FX-11: Large mod scheduler workload

**Consumers:** `RP-13`.
400 stable vehicles, transitions, mostly rejected inventory, mutating collection, field modes and persistent collector failure.
**Safety boundary:** Synthetic adapters followed by a copied test save; no universal FPS claim.

#### FX-12: Installer ownership and migration

**Consumers:** `RP-16`, `RP-19`, `RP-20`.
Separate Classic/RF profiles, shared target, Keep/Full sentinels, spaces/non-ASCII paths, older compatible profile and immutable artifacts.
**Safety boundary:** Destructive cases use a disposable Windows profile or VM and explicit target containment.

#### FX-13: Critical user journeys

**Consumers:** `RP-14`, `RP-15`, `RP-17`, `RP-20`.
Setup, login, SimHub, settings, dashboard, pasture/table/modal, 320/390 px, long locale, zoom, keyboard and screen reader.
**Safety boundary:** Use synthetic snapshots until live interaction is specifically approved.

### 7.2 Environment matrix

#### ENV-01: Hermetic source tests

**Purpose:** Production imports, fake clocks/streams and temporary files; most deterministic regressions.
**Prerequisites:** Locked dependencies and required fixtures; no game or external server.
**Does not prove:** Actual Electron frame reachability, real FS25 filesystem behavior or installer ownership.

#### ENV-02: Actual Preact DOM

**Purpose:** Effects, store ingestion, controlled inputs, modal focus and rendered zero/unknown states.
**Prerequisites:** Compatible TS-aware runner with the real production components/hooks.
**Does not prove:** Screen-reader usability, real Windows focus behavior or installed packaged assets by itself.

#### ENV-03: Local protocol and filesystem integration

**Purpose:** Real local HTTP/HTTPS/FTP where supported, stream termination, TLS policy and Windows commit behavior.
**Prerequisites:** Disposable roots and local test endpoints; synthetic credentials.
**Does not prove:** A third-party dedicated server's permissions, latency or deployment proxy policy.

#### ENV-04: Disposable installed Windows environment

**Purpose:** Both installers, profile/port isolation, navigation/IPC, upgrade/migration and Keep/Full uninstall.
**Prerequisites:** Action-time approval, exact hashes, safe profile/VM and sentinel inventory.
**Does not prove:** Live game/mod collection or real dedicated data freshness without those sources.

#### ENV-05: Approved game/copied-save session

**Purpose:** Actual mod I/O, collection scheduling, data parity and large-save responsiveness.
**Prerequisites:** Safe game window, exact mod pairing and local FS25 reference verification.
**Does not prove:** Other maps/mod sets or dedicated protocols not exercised.

#### ENV-06: Authorized real dedicated path

**Purpose:** End-to-end authenticated setup, source updates, detail, reconnect, ownership and soak.
**Prerequisites:** Server administrator coordination and explicitly scoped test actions.
**Does not prove:** All hosting providers, protocols, proxies or multiplayer configurations.

## 8. Measurement budgets and performance evidence

These are proposed measurement contracts, not claims that a target has already been achieved. Ratify the numeric thresholds and workload before measuring. Correctness, authorization and accessibility take precedence over an optimization.

### B-01: HTTP total duration

**Proposal:** Retain 45 seconds as the absolute total deadline if confirmed as the intended existing product requirement; specify idle timeout separately.
**Measure:** Start-to-settlement under continuous trickle, no-body, abort and redirects.
**Gate:** At deadline, settle once and release resources; do not reset the total timer on each chunk.

### B-02: Per-context polling

**Proposal:** Maximum one active poll/commit pipeline per effective source context; at most one coalesced pending refresh unless a documented queue is required.
**Measure:** Instrument active/pending counts under a transfer slower than the poll interval.
**Gate:** No overlapping old-context commit and no unbounded pending queue.

### B-03: Mod slice work

**Proposal:** Ratify entry/time budgets on recorded hardware. Evaluate any existing approximately 4 ms slice setting as a candidate budget, not an already achieved universal guarantee.
**Measure:** Examined entries and p50/p95/p99 elapsed time for stable 400-vehicle and mostly-rejected inventory fixtures.
**Gate:** Every supported mode is bounded and makes eventual progress; report exact measured workload and hardware.

### B-04: Request servicing during failure

**Proposal:** Choose an explicit maximum servicing delay based on the intended request cadence after tracing all scheduler paths.
**Measure:** Queue requests while one collector fails continuously.
**Gate:** Requests continue within the ratified bound and are not duplicated.

### B-05: Frontend responsiveness

**Proposal:** Establish before/after startup and section-action budgets on one reference machine and frozen dataset; approve a numeric threshold before optimizing.
**Measure:** Process start, first usable UI, first current data, table reveal and long-task distribution.
**Gate:** No correctness/accessibility regression; any improvement claim names the measured phase.

### B-06: Soak/resource stability

**Proposal:** Planning allowance: a 30-minute local stability run and a 2-hour dedicated/large-save run, subject to safe workload and administrator agreement; longer duration if growth is inconclusive.
**Measure:** Memory, handles/listeners, poll counts, request delay, reconnect events and mod slices at regular samples.
**Gate:** No unexplained sustained growth or loss of progress; report duration and limitations rather than claiming leak-free forever.

### B-07: Installer footprint

**Proposal:** Attribute the approximately 974 MB retained installer sizes before setting a reduction target.
**Measure:** Packaged asset contribution, duplicates, required runtimes and install/launch behavior after any exclusion.
**Gate:** No resource is removed solely to meet an arbitrary size target; complete packaged/runtime acceptance follows changes.

## 9. Command catalogue for later authorized execution

No command below was run to create this plan. Execute from the workspace root in the approved implementation/test environment. Existing commands were observed in the retained audit; proposed new gates are intentionally not presented as existing scripts.

### Existing dependency preparation; run only in the approved implementation/test environment

Reproduce the application dependency tree after approved package/lock changes.

```powershell
npm ci --prefix FS25_FarmDashboard_App
```

### Existing dependency preparation; not run for this plan

Reproduce frontend dependencies; do not rely on globally available test tools.

```powershell
npm ci --prefix "NEW APP"
```

### Existing gate

Application Jest gate; required fixtures must assert, with real skip reporting.

```powershell
npm test --prefix FS25_FarmDashboard_App -- --runInBand
```

### Existing gate

Node ESM tests; record current warning/pass/skip output.

```powershell
npm run test:mjs --prefix FS25_FarmDashboard_App
```

### Existing gate

Frontend type checking, not a replacement for DOM/runtime testing.

```powershell
& ".\NEW APP\node_modules\.bin\tsc.cmd" --noEmit --project ".\NEW APP\tsconfig.json"
```

### Existing gate currently blocked in retained audit

After RP-01 repair, parse the intended nonzero Lua file set.

```powershell
node tools/check-lua-syntax.mjs
```

### Existing gate

Packaging manifest checks, not installer execution or packed-code identity by itself.

```powershell
npm run verify:electron-pack --prefix FS25_FarmDashboard_App
```

### Existing gate

Translation keys/placeholders, not language quality or layout certification.

```powershell
npm run i18n:verify --prefix FS25_FarmDashboard_App
```

### Existing advisory check

Current dependency advisory report; application security is evaluated separately.

```powershell
npm audit --omit=dev --json --prefix FS25_FarmDashboard_App
```

### Proposed gate; not an existing command

Run actual hook/component lifecycle, auth, settings and rendered zero/unknown cases.

Define a production-linked Preact DOM regression command during RP-01.

### Proposed gate; not an existing command

Run the mapped negative cases against imported production modules and controlled I/O.

Define a hermetic trust/persistence/network regression group during RP-01.

### Build recipe intentionally deferred

Do not run an uninspected build-all command or assume its outputs cannot overwrite public artifacts.

Use the verified existing packaging wrapper with publishing disabled and a fresh approved private output directory.

Do not use the archived diagnostic exit code as a release gate. Do not run an unverified all-build command that could publish or replace public artifacts. Any future clean checkout/dependency preparation must preserve unrelated user work.

## 10. Go/no-go gates

Promotion is explicit and evidence-backed. A blocked required environment remains blocked; it is not a pass or an implicit waiver.

### G0: Baseline and design ready

**Packages:** `RP-00`, `RP-01`, `RP-02`.
**Required:** Exact identity, complete ledger, working required harness and approved trust/data/write contracts.
**Stop condition:** Unknown target ownership, missing required parser/runner or unresolved contract prevents safe dependent work.

### G1: Critical source safety

**Packages:** `RP-03`, `RP-04`, `RP-05`, `RP-06`, `RP-07`, `RP-14`.
**Required:** Four current P1 cases plus specific prior bootstrap/focus P1 regressions pass against production code; no known unsafe write/auth boundary remains.
**Stop condition:** Any origin bypass, outside path, loss of last-good data, false mod write success, cross-save bootstrap or password-focus defect remains.

### G2: Data, lifecycle and UX source acceptance

**Packages:** `RP-07`, `RP-08`, `RP-09`, `RP-10`, `RP-11`, `RP-12`, `RP-13`, `RP-14`, `RP-15`, `RP-16`, `RP-17`.
**Required:** All mapped mandatory cases pass, conditional reachability is resolved or exposure is safely excluded, and performance/accessibility limits are recorded.
**Stop condition:** Unexplained stale resurrection, fabricated values, unbounded work, auth deadlock, unsafe settings or shared-writer ambiguity.

### G3: Reproducible automated gate

**Packages:** `RP-18`.
**Required:** Current clean-environment results include real assertions, nonzero Lua file count, actual Preact lifecycle cases and explicit skips.
**Stop condition:** Vacuous pass, copied production algorithm as test target, undiscovered tests or required environment missing.

### G4: Private artifact integrity

**Packages:** `RP-19`.
**Required:** Exact packaged source, app/mod mapping, hashes/feed values, signature status and protected-public boundary evidence.
**Stop condition:** Unknown build identity, mismatched ASAR/ZIP, wrong feed, overwritten artifact or unresolved distribution protection policy.

### G5: Installed and real-source acceptance

**Packages:** `RP-20`.
**Required:** Approved installed pair, unchanged setup, selected-save persistence, live game, one real dedicated path, bounded soak and disposable uninstall results.
**Stop condition:** Development snapshot substitution, unavailable required live path, unsafe writer behavior or destructive ownership failure.

### G6: Approved private tester handoff

**Packages:** `RP-21`.
**Required:** Closure ledger, exact packet, limited residual waivers, rollback instructions and explicit private distribution approval.
**Stop condition:** Any unclosed P1/security/data-integrity blocker or attempt to treat private acceptance as public release authority.

## 11. Rollback and adverse-event runbooks

Rollback restores a known compatible state and preserves evidence. It does not mean deleting uncertain files, erasing newer clears, silently downgrading transport security or replacing loaded mods.

### RB-01: Unsafe write, cache escape or last-good loss

**Trigger:** Unexpected outside write, deleted valid final, exporter false success or repeated commit failure.

1. Stop the affected writer/poller; keep the UI read-only or explicitly stale.
2. Preserve final/tmp/backup/journal files and redacted logs in the test environment.
3. Record exact build, context and operation phase; do not repeatedly retry against potentially damaged state.
4. Recover through the documented last-good protocol and a compatible known-good private build.
5. Reopen RP-03/04/05/06 as appropriate and rerun its cross-layer and installed acceptance before re-enabling writes.

### RB-02: Cross-save or resurrected data

**Trigger:** A payload appears under the wrong context, a legitimate clear reverses or an older revision replaces a newer one.

1. Stop automatic ingestion for the affected context and display unavailable/stale rather than mislabeling it.
2. Capture context/epoch/revision/request sequence and frozen source payloads with secrets removed.
3. Preserve persisted evidence; invalidate only derived caches after capturing the reproduction.
4. Fix the owning ingestion/provenance path and rerun switch, restart and clear cases together.
5. Do not close the issue from a later correct screenshot; demonstrate the original ordering sequence now passes.

### RB-03: Auth, IPC or proxy boundary regression

**Trigger:** Protected bootstrap without authorization, an untrusted sender accepted or credentials exposed in logs/UI.

1. Disable the affected exposure or withdraw the candidate; do not widen trust for compatibility.
2. Preserve redacted denial/operation evidence without copying secrets into the audit repository.
3. Determine exact reachable route/frame/document and revoke affected test credentials if required through the approved owner.
4. Repair policy and exercise the full route/bridge matrix, not only the observed handler.
5. Resume only after security owner review and exact packaged/installed proof.

### RB-04: Installer, migration or uninstall defect

**Trigger:** Other-edition data, browser preferences, shared game files or unknown paths are changed unexpectedly.

1. Stop destructive testing immediately and preserve the disposable profile/VM state.
2. Record resolved target paths, ownership decisions and installer/hash identity.
3. Restore only the pre-recorded test snapshot after diagnosis; never guess the user's active-profile restore target.
4. Narrow cleanup/migration behavior and add the exact sentinel regression.
5. Repeat Keep, Full, upgrade and coexistence cases on a fresh disposable profile.

### RB-05: Mod rollback during game acceptance

**Trigger:** Game errors, broken collection, abnormal slice time or exporter failures appear with the candidate mod.

1. Pause testing and close the game safely before changing a loaded mod.
2. Preserve the game log and exact candidate ZIP hash; record save/map/mod set and generation.
3. Restore the agreed compatible test mod/profile/save combination, not an arbitrary older ZIP.
4. Reproduce with supported local API references and isolated fixtures before another live attempt.
5. Repeat actual engine and dedicated acceptance for the corrected uniquely identified candidate.

### RB-06: Private artifact withdrawal

**Trigger:** A wrong hash/feed/pairing is distributed or a critical tester issue appears.

1. Identify the affected immutable build and stop further approved distribution.
2. Tell the approved tester group which exact build to stop using and provide safe rollback instructions.
3. Preserve the bad packet and reports for diagnosis; do not replace bytes in place.
4. Build a distinct corrected private candidate and rerun affected source, packaging and installed gates.
5. Keep public 4.2.1 assets and story unchanged throughout the incident.

## 12. Evidence packet and closure ledger

### 12.1 Required evidence fields

- `findingOrCheckId`
- `acceptanceCaseId`
- `status`
- `owner`
- `reviewer`
- `sourceSnapshotId`
- `applicationEditionAndVersion`
- `privateBuildId`
- `installerSha256`
- `modVersionAndSha256`
- `runtimeAndGameVersions`
- `environmentId`
- `fixtureIdOrRedactedSaveContext`
- `sourceEpochAndRevision`
- `commandOrInteractionSteps`
- `expectedResult`
- `actualResult`
- `timestampAndDuration`
- `logsScreenshotsOrOutputPaths`
- `skipOrBlockReason`
- `compatibilityAndRollbackNotes`
- `closureDecisionAndDate`

### 12.2 Status model

1. Planned
2. Reproduced against current production
3. Already fixed in workspace with specific proof
4. Implemented but not yet verified
5. Verified in workspace
6. Packaged fix identity confirmed
7. Installed acceptance passed
8. Live/dedicated acceptance passed where required
9. Closed with reviewed evidence
10. Blocked with explicit prerequisite
11. Explicitly approved limited deferral; not fixed

These are recorded states, not a demand that every finding needs every live test. The mapped acceptance case determines the required environment. Cross-layer/game/installer findings cannot stop at helper or source-only proof.

### 12.3 Closure record template

```text
Finding/check ID:
Acceptance case ID(s):
Owner and independent reviewer:
Current status and evidence certainty:
Exact source/build/app/mod identity:
Environment and fixture/context:
Reproduction before fix or specific already-fixed proof:
Implementation change, or reason no rewrite was necessary:
Expected result:
Actual result and timestamp:
Production-linked test output:
Packaged/installed/live evidence where required:
Compatibility, rollback and residual limitations:
Decision: closed / blocked / explicitly approved limited deferral
```

Do not include credentials, access codes, authorization headers or full personal profiles. Retain failed and corrected runs separately. A limited deferral remains a known issue rather than being relabeled fixed.

## 13. First implementation day

1. Assign owners and read the latest audit/manifest once in the implementation session. Name the exact private bundle and protected public assets.
2. Create the new execution ledger and safe fixture directories, without altering application configuration or active saves.
3. Resolve dependency/parser and production-import test infrastructure before trusting a new green run.
4. Agree context/section/write/trust contracts and the single-writer default with the responsible owners.
5. Reproduce the four current P1 cases first, plus the previously unverified bootstrap and password-focus cases.
6. Classify workspace-ahead-of-candidate items explicitly; retain existing fixes that pass their specific regression.
7. Start containment/origin work and desktop/mod last-good persistence in separate owned files where dependencies allow.
8. Review the first reproducible failing cases and implementation scope; re-estimate the remaining packages and book the later safe installed/dedicated window.

## 14. Definition of complete

- Each finding has current-production reproduction or a specific already-fixed proof, with exact source/build identity.
- The relevant production-linked acceptance case passes and fails on the corresponding unsafe behavior in an isolated sensitivity check where practical.
- Trust, persistence and FS25 API changes have the appropriate independent review and documented compatibility/rollback behavior.
- Corrected code is present in the exact packaged ASAR/mod ZIP and its hash is recorded.
- Required actual installed/UI/game/dedicated cases pass for that build; unavailable environments remain blocked, not waived by implication.
- No public asset, unrelated user change, active save or credential has been changed outside explicit approved scope.
- The private tester packet and any limited residual waivers are explicitly approved; public release is a separate decision.

## 15. Final handoff shape

The eventual handoff should contain the immutable private installers/mods and manifest, the closure ledger, automated and actual installed/live results, a tester README, a redacted issue template and exact rollback instructions.

At present this deliverable is the execution plan only. No package is marked complete by this document, and no public release, installation or live-game sign-off is implied.

