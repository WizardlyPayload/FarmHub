# FarmHub installed-candidate remediation execution plan

Date: 5 September 2026

**Status (execution):** P1 source fixes for WP-01 through WP-06 are in the working tree. Private installers were packed to `C:/Users/Graham/Documents/FarmDash Release Candidates/2026-09-05-remediation-b` (Classic 4.2.2 / RF 5.0.1). Public 4.2.1 was not overwritten. Playtest of Launch Dashboard, RF beside Classic, save stickiness, and pasture health/sex is still required before tester handoff.

**Decision: hold the private tester handoff until the acceptance gates below are satisfied. Public 4.2.1 remains unchanged.**

Status: planning complete. No product fixes, new test runs, installer changes, game actions or publishing were performed during this planning pass. Only this plan and its visual companion were created.

## 1. What this plan is for

This is an implementation handoff for the installed Classic 4.2.2 and RF 5.0.1 candidate problems, informed by the computer-use session and targeted source tracing. It is not another generic audit, a claim that fixes have landed, or a release sign-off.

The immediate work is to fix explicit dashboard activation, establish safe edition/runtime/installer ownership, preserve selected save context, and make livestock summary/detail data consistent. Warning, fleet and weather differences are then reconciled from identical source generations. Earlier security, exporter and pipeline findings remain closure obligations unless the exact candidate already has evidence that resolves them.

The plan contains **14 work packages, 142 implementation steps, 79 acceptance cases and a 35-finding prior-audit crosswalk**. Work-package estimates are planning allowances, not measured completion forecasts.

### Non-negotiable release boundaries

- Classic candidate: desktop 4.2.2, intended packaged mod 3.4.0.8.
- RF candidate: desktop 5.0.1, intended packaged mod 5.0.0.1.
- The running game reported mod 5.0.0.1. That does not certify the freshly packaged Classic mod.
- Preserve public 4.2.1 release notes, website claims, public downloads, public updater metadata and existing public announcements.
- Keep Electron 43 candidate outputs and generated feeds private. The earlier build reported Electron 43.6.0; record the exact runtime again in each future candidate manifest.
- Do not overwrite an already tested/shared candidate under the same path. Use a unique private build ID and checksum even when retaining the planned display version.
- Do not reset the user's configuration, delete profiles, overwrite Save 1, swap the active mod ZIP or join a dedicated server merely to complete a checklist without a controlled execution window.
- Do not weaken origin checks, TLS, LAN authentication, IPC trust or single-instance protection to make UI tests pass.

## 2. Evidence baseline and confidence

### What the installed session established

- Both per-user installers completed.
- Classic About 4.2.2 and RF About 5.0.1.
- Both load Montana Save 1, 1029 animals/15 fields/5 pastures; live game clock advanced.
- RF full setup opens, built-in check all four green, dashboard return works.
- Existing Witcombe mirror_savegame6 profile renders and later shows Snap XML.
- Classic normal restart recovers Save 1.

The current end state is Classic recovered on Montana Save 1, RF closed and FS25 left open. Both desktop About screens reported the expected desktop versions. The installed game feed reported mod 5.0.0.1. The live clock advanced during the session; exact numeric parity against the in-game UI was not established.

### What was not established

- Current game reports mod 5.0.0.1; freshly packaged Classic 3.4.0.8 not installed/reloaded.
- Dedicated path checked only existing demo/mirror snapshot; no live dedicated join session.
- No clean first-run, security suite, new tests, network/FTP credentials, source fixes or publishing.
- No tester artifacts sent.

Source-supported means the traced code explains or permits the observed behavior. It is not a substitute for a packaged-runtime regression test. In particular, the exact cause of RF's missing second window still needs lock/profile/bind diagnostics. The 35 earlier audit findings in Appendix A are carried forward from retained evidence, not newly retested here.

### Prior artifacts

- Earlier full re-audit: [docs/_internal/audits/2026-09-05-application-and-mod-reaudit.md](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-application-and-mod-reaudit.md).
- Private candidate root: `C:/Users/Graham/Documents/FarmDash Release Candidates/2026-09-05-classic-4.2.2-rf-5.0.1`.
- Visual plan: [C:/Users/Graham/.cursor/projects/c-Users-Graham-Documents-JoshWalki-Farmdash-server-edit-MAIN-CODEBASE-FarmHub/canvases/farmhub-candidate-remediation-plan-2026-09-05.canvas.tsx](C:/Users/Graham/.cursor/projects/c-Users-Graham-Documents-JoshWalki-Farmdash-server-edit-MAIN-CODEBASE-FarmHub/canvases/farmhub-candidate-remediation-plan-2026-09-05.canvas.tsx).

## 3. Current problem register

### CUA-01 | P1 | RF does not open while Classic is running

**Evidence level:** Observed installed behavior; exact lock/profile cause remains unproven.

**Observed or traced evidence:** RF installation completed, but its auto-launch and direct launch produced no targetable RF window while Classic was open. RF launched after Classic closed.

**Code explanation / boundary:** Both production modes default to port 8766. The main process also takes a single-instance lock and silently quits if acquisition fails. Those are separate hazards: removing a shared lock, if confirmed, would still expose the shared-port conflict. Do not describe the no-window event as a proven port failure.

**Execution owner path:** WP-02 / WP-03.

**Source anchors:** [FS25_FarmDashboard_App/main.js:26](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:26); [FS25_FarmDashboard_App/main.js:1903](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:1903); [FS25_FarmDashboard_App/main.js:3452](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:3452).

### CUA-02 | P1 | Classic setup succeeds at saving but never returns to the dashboard

**Evidence level:** Observed installed failure with a source-supported causal path.

**Observed or traced evidence:** Open full setup, leave the existing three profiles unchanged, choose Launch Dashboard. It reports Configuration saved. Opening and stays on Starting. A normal app restart recovers Save 1.

**Code explanation / boundary:** Classic saveAndLaunch's IPC success branch only calls showSuccessCard. applyFarmdashSetupConfig returns early when the settings signature does not require reboot, so bootServer's navigation is never triggered. RF explicitly assigns the root URL after saving. Saving and navigating must be separate, explicit operations.

**Execution owner path:** WP-01.

**Source anchors:** [FS25_FarmDashboard_App/setup.html:912](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/setup.html:912); [FS25_FarmDashboard_App/setup.html:930](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/setup.html:930); [FS25_FarmDashboard_App/main.js:3317](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:3317); [FS25_FarmDashboard_App/main.js:3287](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:3287); [NEW APP/src/setup/main.tsx:232](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/setup/main.tsx:232).

### CUA-03 | P1 | RF pasture health and sex totals contradict its animal details

**Evidence level:** Observed contradiction; split normalization/hydration paths identified.

**Observed or traced evidence:** Montana Save 1: 1,029 animals in five pastures. BigSky Cow Stall has 209 animals, but its summary shows 0% average health and zero males/females. Its detail list shows male/female animals and health values from 55% to 100%.

**Code explanation / boundary:** PasturesSection passes raw payload.animals into the pasture parser. Husbandry-only parsing creates animals:[], maleCount:0, femaleCount:0 and health from husbandry.health or zero. LivestockPenPanel separately normalizes and hydrates detail into private component state. The parent summary does not consume those hydrated rows. Unknown-health fallback and authoritative-empty issues from the earlier audit make a cosmetic fix unsafe.

**Execution owner path:** WP-05 / WP-06.

**Source anchors:** [NEW APP/src/sections/pastures/PasturesSection.tsx:663](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/sections/pastures/PasturesSection.tsx:663); [NEW APP/src/lib/pastures-parsers.ts:689](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/pastures-parsers.ts:689); [NEW APP/src/lib/pastures-parsers.ts:834](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/pastures-parsers.ts:834); [NEW APP/src/sections/livestock/LivestockPenPanel.tsx:194](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/sections/livestock/LivestockPenPanel.tsx:194); [NEW APP/src/lib/livestock-format.ts:59](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/livestock-format.ts:59).

### CUA-04 | P2 | RF loses the selected save across its setup round trip

**Evidence level:** Observed installed failure with a source-supported causal path.

**Observed or traced evidence:** Montana Save 1 was selected before setup. Launch Dashboard returned to Witcombe, the first configured profile. Reselecting Montana restored live data. Classic retained Save 1 across normal restarts.

**Code explanation / boundary:** The RF store initializes activeServerId to null, its setter does not persist the value, and bootstrap picks servers[0] whenever no active ID exists. Farm and section preferences are persisted separately; this is missing save-selection persistence, not a reason to reorder or duplicate the server list.

**Execution owner path:** WP-04.

**Source anchors:** [NEW APP/src/store/dashboard-store.ts:153](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/store/dashboard-store.ts:153); [NEW APP/src/store/dashboard-store.ts:172](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/store/dashboard-store.ts:172); [NEW APP/src/services/ws-client.ts:136](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/services/ws-client.ts:136); [NEW APP/src/services/ws-client.ts:224](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/services/ws-client.ts:224).

### SRC-05 | P1 | Uninstall cleanup is not edition-scoped

**Evidence level:** Source-confirmed unsafe target selection; uninstall was not executed.

**Observed or traced evidence:** The shared NSIS path invokes uninstall-user-data.ps1 with only Mode. That script enumerates fs25-farm-dashboard, FS25 Farm Dashboard and com.farmdashboard.app roots, including Classic updater caches, regardless of which edition called it. The NSIS fallback also contains explicit shared/Classic targets.

**Code explanation / boundary:** Installation identity, runtime profile identity and cleanup ownership are not represented by one edition contract. RF cleanup can target Classic-named data. Keep mode is also relevant: it prunes profile contents other than config.json and serverLiveCache, including browser preferences. There is no demonstrated data loss in this session.

**Execution owner path:** WP-03.

**Source anchors:** [FS25_FarmDashboard_App/build/installer.nsh:229](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/build/installer.nsh:229); [FS25_FarmDashboard_App/build/installer.nsh:253](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/build/installer.nsh:253); [FS25_FarmDashboard_App/build/installer.nsh:292](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/build/installer.nsh:292); [FS25_FarmDashboard_App/build/uninstall-user-data.ps1:22](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/build/uninstall-user-data.ps1:22); [FS25_FarmDashboard_App/build/uninstall-user-data.ps1:49](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/build/uninstall-user-data.ps1:49).

## 4. Differences that must be reconciled, not patched by guesswork

### REC-01 | 47 Classic vehicles versus 41 RF vehicles

Do not force the numbers to match before checking their meaning. RF getDisplayFleet deliberately removes storage items and dealership/pool stock. RF also showed six pallets; 41 plus six is a plausible reconciliation, not an entity-level proof.

**Execution:** Freeze one generation, compare stable vehicle IDs, classify the exact excluded six records and agree what the Fleet label means. Owner path: WP-07.

**Source anchors:** [NEW APP/src/lib/vehicles.ts:133](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/vehicles.ts:133); [NEW APP/src/lib/vehicles.ts:174](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/vehicles.ts:174).

### REC-02 | 13 Classic pasture warnings versus zero in RF Overview

RF Overview counts warning arrays in payload.pastures. The pasture screen independently derives warnings from husbandry/animal/resource data. These are different warning contracts; a missing warning array currently becomes zero.

**Execution:** Make Overview and pasture detail consume the same scoped warning model. Check whether each Classic warning is supported by measured data rather than copying a potentially false alarm. Owner path: WP-06.

**Source anchors:** [NEW APP/src/sections/overview/OverviewSection.tsx:131](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/sections/overview/OverviewSection.tsx:131); [NEW APP/src/sections/overview/OverviewSection.tsx:231](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/sections/overview/OverviewSection.tsx:231); [NEW APP/src/lib/pastures-parsers.ts:471](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/pastures-parsers.ts:471).

### REC-03 | Classic Snow versus RF cloudy at 16 C

Both inspected display helpers map explicit snow/cloudy strings normally. The snapshots were observed sequentially, not from one frozen generation. The difference is real as a screen observation, but its source, freshness and timing have not been isolated.

**Execution:** Compare raw export, merged payload and both displays for an identical world/generation. Do not guess a weather mapping or infer weather solely from temperature. Owner path: WP-07.

**Source anchors:** [FS25_FarmDashboard_App/web/assests/js/modules/environment.js:340](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/web/assests/js/modules/environment.js:340); [NEW APP/src/lib/weather.ts:60](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/weather.ts:60).

### REC-04 | Installer and setup presentation

Both installer language selectors appeared blank until English was chosen. Source prefill returns immediately for an empty saved language. RF setup also renders language as en and doubles the numbering in dedicated instructions; its Settings overlay is difficult to read against the underlying screen.

**Execution:** Fix first-run locale selection, localized language labels, duplicated instruction numbering, opaque modal surfaces and responsive navigation without changing the established visual identity. Owner path: WP-03 / WP-08.

**Source anchors:** [FS25_FarmDashboard_App/build/installer.nsh:29](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/build/installer.nsh:29); [FS25_FarmDashboard_App/build/installer.nsh:144](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/build/installer.nsh:144); [NEW APP/src/setup/main.tsx:1](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/setup/main.tsx:1); [NEW APP/src/settings/SettingsModal.tsx:103](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/settings/SettingsModal.tsx:103).

## 5. Architecture and product decisions before implementation

The recommendations below are defaults for execution planning. Any decision that moves profiles, changes supported concurrent behavior or changes compatibility promises must be approved before implementation. No further decision is needed merely to read or use this plan.

### Concurrent versus sequential editions

**Recommended:** Plan for independently runnable editions with separate profiles and stable ports, while preserving Classic. If only sequential use is intended, explicitly approve that narrower contract and replace silent launch failure with clear guidance.

**Consequence:** Independent profiles need safe migration and coordinated shared game-write paths. This decision is required before WP-02/03 implementation, not before the plan can be delivered.

### RF profile import

**Recommended:** Offer an opt-in one-time import of compatible Classic settings; never silently share mutable profiles or copy active secrets/LAN exposure.

**Consequence:** Users should see their saves without risking Classic settings. Existing RF profiles must not be overwritten.

### Warnings and missing telemetry

**Recommended:** Use one canonical warning model and explicit unknown/partial metrics; neither Classic's current counts nor a zero-filled RF screen is an unquestionable oracle.

**Consequence:** Some displayed counts may change after correction because they were previously computed from different inputs.

### Supported app/mod pairs

**Recommended:** Advertise and certify the two requested pairs first. Test cross-pair/coexistence claims separately before documenting them.

**Consequence:** Requires a controlled game-exit/mod-swap/reload window and a real dedicated session.

### Public release boundary

**Recommended:** Keep all Electron 43 rebuilds private under new build-specific folders. Public 4.2.1 remains untouched.

**Consequence:** Tester handoff and public promotion are two separate approvals; this plan authorizes neither distribution nor public publishing.

### Electron-specific basis

Electron documents configuration storage under userData, session storage under sessionData, and a boolean single-instance-lock result. Session path overrides must precede ready, and a directory passed to setPath must exist. The plan therefore sets edition identity before profile-dependent initialization and treats lock acquisition separately from port binding. This is an implementation recommendation, not proof of which event stopped RF in the observed launch. [Electron app lifecycle and storage documentation](https://www.electronjs.org/docs/latest/api/app#appsetpathname-path), [single-instance documentation](https://www.electronjs.org/docs/latest/api/app#apprequestsingleinstancelockadditionaldata).

### Proposed activation contract

Model the user's launch intent explicitly: `idle -> saving -> persisted -> activating -> navigating -> ready`, with a recoverable failure transition from each asynchronous stage. `save-settings` remains a configuration operation. A narrow desktop activation operation selects its own trusted dashboard destination; a remote browser uses its authenticated current-origin path. Never return a general-purpose 'navigate any URL' capability to the renderer.

### Proposed livestock contract

Each pen projection carries a context key, source generation, authoritative head count, measured-detail coverage, warning-evaluation coverage and metric provenance. The exact TypeScript names below are illustrative design fields, not assertions about the current payload:

```ts
type MetricState = 'measured' | 'partial' | 'unknown' | 'not-applicable';
type HealthSummary = {
  state: MetricState;
  percent: number | null;
  measuredHeads: number;
  authoritativeHeads: number;
  sourceGeneration: string | null;
};
type SexSummary = { male: number; female: number; unknown: number };
```

Rules: measured zero is zero; missing is not zero or 100; synthetic rows do not become measured telemetry; full detail and clusters cannot double count; an authoritative empty pen removes previous individuals; summary/list/export refer to the same accepted context and generation. A companion-specific Dairy Core score remains a distinct, labeled metric.

## 6. Execution order, ownership and effort

### Recommended sequence

1. WP-00: preserve the failing baseline, collect redacted identity/generation evidence and prepare fixtures.
2. WP-01: fix the deterministic Classic setup-navigation failure first. This yields a small, reviewable correction without forcing backend restarts.
3. WP-02 and WP-03: implement the approved runtime/profile strategy and safe install/uninstall ownership together. Do not ship one without the other.
4. WP-04: persist server context and close stale-bootstrap/same-save response ordering holes.
5. WP-05 and WP-06: unify livestock normalization/hydration, then compute warnings from that shared model.
6. WP-07: reconcile fleet and weather against frozen generations. Keep justified projection differences; fix only demonstrated defects.
7. WP-08: complete readable, accessible, load-safe setup/settings/auth recovery.
8. WP-09 and WP-10: resolve or evidence-close the carried-forward security, transport, exporter and pipeline gates.
9. WP-11: run assertion-based regression gates and build new immutable private installers.
10. WP-12: test the actual installers, each advertised mod pair, a real dedicated session and recovery/soak behavior.
11. WP-13: prepare a private tester handoff with approved recipients/content. Public promotion remains a separate later decision.

### Parallelism without conflicting ownership

- One developer owns changes to main.js across activation, edition policy and security/lifecycle work; sequence those patches rather than editing the file concurrently.
- Installer work can proceed alongside the livestock model after the runtime identity decision is stable.
- View-model implementation and upstream mod correction share the same schema/fixture contract; do not independently redefine zero/unknown/partial semantics.
- Test-fixture authoring can proceed with each work package. Final packaging waits for all required source and generated-UI changes.

### Estimate use

WP-00 through WP-08 form the direct candidate remediation track. WP-09 and WP-10 are closure allowances for earlier findings; remove already-proven work from those allowances rather than fixing it twice. WP-11 through WP-13 cover reproducibility, installed acceptance and handoff. Multiplayer scheduling and external access can extend elapsed time independently of coding effort.

Use the individual ranges below to plan capacity after WP-00. Do not promise a calendar release date until coexistence/migration scope, the frozen livestock fixture and the status of the earlier P1 findings are known. No estimated day count grants permission to skip a gate.

## 7. Detailed work packages

### WP-00 | Freeze the baseline and turn observations into reproducible evidence

**Owner:** Release engineer + desktop/backend developer.  **Priority:** Required first.  **Planning allowance:** 0.5-1 engineering day.

**Depends on:** None; start here.

**Required outcome:** A private, reproducible evidence set that identifies the exact executable, world, generation and configuration behind every failure.

#### Primary files / artifacts

- [docs/_internal/audits/2026-09-05-installed-candidate-remediation-plan.md](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-installed-candidate-remediation-plan.md)
- [docs/_internal/audits/2026-09-05-application-and-mod-reaudit.md](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/_internal/audits/2026-09-05-application-and-mod-reaudit.md)
- [FS25_FarmDashboard_App/main.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js)
- `C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/tests/ (new hermetic fixture/test files, names finalized before implementation)`

File lists are implementation targets, not files changed by this plan. New helper/test filenames must be finalized before the corresponding edit pass; preserve existing unrelated work.

#### Implementation sequence

1. Keep the existing 4.2.2 and 5.0.1 candidate artifacts as immutable failing baselines. Record SHA-256, file size, source/build identity, UI build identity and Electron runtime in a private manifest before rebuilding. Those checks are future execution work, not results obtained during this planning pass.
2. Back up the actual Classic and RF userData/sessionData/config roots before any profile migration, installer replacement or uninstall experiment. Resolve the real paths instead of assuming the installer folder is the profile.
3. Record redacted startup diagnostics for each edition: app name, packaged productLine, version, executable path, profile paths, resolved port, lock result, bind outcome and final document. Exclude credentials, setup tokens, WS secrets and raw private server addresses from a shareable bundle.
4. Reproduce launch order once each: Classic then RF, RF then Classic, same edition twice and each edition alone. Separate lock refusal, port bind failure, startup crash and missing-window errors. Never kill unrelated Electron processes to manufacture a pass.
5. Capture one immutable Save 1 generation, including raw data.json, merged API payload, required animal-detail envelopes, selected server/farm IDs and source timestamps. Use sanitized copies that retain identities, counts, nulls and generation relationships.
6. Create minimal fixtures for unchanged configured setup, first configured save, missing profile, non-flat husbandry payload, partial/full animal detail, authoritative zero and six storage items mixed with a fleet.
7. Record prior-suite evidence as historical, not rerun: 510 Jest and 82 Node tests passed in the earlier re-audit, while the Lua checker did not start. Do not promote those counts into current candidate acceptance.
8. Keep the current game and Save 1 untouched during diagnosis. A mod swap, reload, dedicated join, public update or destructive uninstall test requires its own controlled execution window.

#### Acceptance cases

1. **WP-00-AC01**: Evidence identifies both desktop versions and distinguishes packaged mod version from the mod version reported by the live game.
2. **WP-00-AC02**: Every reproduced failure has ordered steps, expected/actual state and a captured generation or lifecycle correlation ID.
3. **WP-00-AC03**: Sanitized fixtures load without live credentials, a commercial server or the user's mutable AppData.
4. **WP-00-AC04**: No diagnostic collection changes public 4.2.1 metadata or overwrites baseline candidate files.

#### Risks and boundaries

- Do not copy full user profiles or private credentials into the repository or tester archive.
- Unknown profile ownership must block migration/deletion, not trigger a best-guess cleanup.

#### Rollback

This stage is read-only except for private evidence copies. Stop collection and retain the existing installers/configuration unchanged.

### WP-01 | Decouple saving configuration from launching the dashboard

**Owner:** Desktop/backend developer.  **Priority:** P1.  **Planning allowance:** 0.5-1.5 engineering days.

**Depends on:** WP-00.

**Required outcome:** Launch Dashboard works for unchanged and changed configuration, with an honest recoverable state on failure.

#### Primary files / artifacts

- [FS25_FarmDashboard_App/setup.html](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/setup.html)
- [FS25_FarmDashboard_App/main.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js)
- [FS25_FarmDashboard_App/preload.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/preload.js)
- [FS25_FarmDashboard_App/setupConfigMerge.cjs](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/setupConfigMerge.cjs)
- [NEW APP/src/setup/main.tsx](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/setup/main.tsx)
- [NEW APP/src/services/electron-bridge.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/services/electron-bridge.ts)

File lists are implementation targets, not files changed by this plan. New helper/test filenames must be finalized before the corresponding edit pass; preserve existing unrelated work.

#### Implementation sequence

1. Preserve save-settings as a configuration operation. Do not fix the hang by making every Settings Save navigate away or rebuild every watcher.
2. Introduce a narrow main-process dashboard activation operation, exposed through a typed preload method such as launchDashboard. It accepts no arbitrary destination URL; the main process derives the exact trusted dashboard origin from the runtime configuration.
3. Make the Classic IPC path explicitly save, inspect the save result, activate the backend if necessary, and request dashboard navigation even when rebooted is false.
4. Route RF's desktop launch through the same operation. Keep a separate authenticated browser path that navigates to its own origin only after a successful save; do not use location.href='/' from an arbitrary file document.
5. Check backend readiness independently of configNeedsServerReboot. First-run, unchanged configuration, a stopped listener and a previously failed bind must each be handled.
6. Return distinct outcomes for persisted, backend-ready, navigating and failed. A save acknowledgment is not evidence that the dashboard loaded. Handle loadURL rejection/did-fail-load and surface a retryable navigation error.
7. Use a single in-flight launch promise and disable duplicate submissions. In finally, restore the control on failure; retain entered configuration and expose Retry/Open setup rather than a permanent spinner.
8. Keep setup activation safe when a configuration change starts deferred hydration. Navigation may show a loading state while data hydrates, but must not imply fresh farm data before an eligible generation is received.
9. Validate IPC sender/frame against the trusted packaged/setup documents and exact local origin. Do not expand file or origin trust to make the new method work.
10. Add bounded progress feedback: proposed targets are immediate busy state, an explanatory delay state after 3 seconds, and a recoverable activation timeout by 15 seconds. These are design targets to validate on the reference machine, not measured guarantees.

#### Acceptance cases

1. **WP-01-AC01**: Configured setup with unchanged servers/polling saves and reaches the dashboard without a restart.
2. **WP-01-AC02**: Changed settings apply once, restart only the required backend components and reach the dashboard.
3. **WP-01-AC03**: First-run setup works with HTTP initially stopped; the configuration-only isConfigured change cannot strand the UI.
4. **WP-01-AC04**: Save rejection, a stopped backend, a busy port, failed navigation and slow hydration each produce the correct message and a usable retry.
5. **WP-01-AC05**: Double-clicking Launch produces one save/activation sequence; ordinary in-dashboard Save does not close the modal or navigate.
6. **WP-01-AC06**: Both desktop editions and the authenticated browser setup path satisfy the same outcome contract.

#### Risks and boundaries

- Waiting synchronously for hydration inside a request that also needs an HTTP restart can reintroduce the earlier keep-alive deadlock.
- A broad IPC navigation method would create a new privileged attack surface.

#### Rollback

Revert the activation change as one bounded unit while preserving saved configuration. Never restore a forced-reboot-on-every-save workaround as the permanent solution.

### WP-02 | Give each edition a deliberate runtime identity and coexistence policy

**Owner:** Desktop/backend developer + release engineer.  **Priority:** P1, decision required before migration.  **Planning allowance:** 1-2.5 engineering days.

**Depends on:** WP-00.

**Required outcome:** Both installed editions can be identified, launched and stopped independently without shared mutable runtime state.

#### Primary files / artifacts

- [FS25_FarmDashboard_App/main.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js)
- [FS25_FarmDashboard_App/package.json](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/package.json)
- [FS25_FarmDashboard_App/electron-builder.rf.yml](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/electron-builder.rf.yml)
- [FS25_FarmDashboard_App/preload.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/preload.js)
- [NEW APP/src/services/api-client.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/services/api-client.ts)
- [NEW APP/src/services/electron-bridge.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/services/electron-bridge.ts)
- [NEW APP/src/settings/SettingsModal.tsx](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/settings/SettingsModal.tsx)
- [tools/app/run-electron-builder.mjs](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/tools/app/run-electron-builder.mjs)
- [tools/app/start-dev-electron.mjs](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/tools/app/start-dev-electron.mjs)
- [COMPATIBILITY.md](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/COMPATIBILITY.md)

File lists are implementation targets, not files changed by this plan. New helper/test filenames must be finalized before the corresponding edit pass; preserve existing unrelated work.

#### Implementation sequence

1. Confirm actual lock/profile behavior with WP-00 evidence. Distinct installer appIds do not, by themselves, prove distinct runtime state. The observed no-window event must be correlated with lock/bind diagnostics before its exact cause is closed.
2. Recommended design: keep Classic's existing identity, profile and port 8766 unchanged. Give RF its own runtime profile/session storage, updater cache, logs, secrets and stable listener. Reserve existing development port 8767; propose 8768 for RF unless a product decision selects another port.
3. Resolve the existing packaged productLine marker before profile-dependent helpers, electron-store construction, session initialization and requestSingleInstanceLock. Do not infer product identity from a title string or only from the major version.
4. Create the chosen profile/session directories safely before applying path overrides. Use one edition policy source to derive runtime names and installer definitions. Do not enumerate and rename all legacy profiles.
5. Retain one instance per edition. A second Classic launch focuses Classic; a second RF launch focuses RF. Never remove single-instance protection globally just to permit coexistence.
6. Use the resolved port/origin consistently for HTTP, WS, browser setup, SimHub links, image/detail requests, navigation guards, CORS/auth checks and diagnostics. Replace presentation-only 8766 assumptions only where they are tied to the active runtime.
7. Allow an explicit port override with strict whole-value validation and an actionable conflict message. Do not silently bind to a random port, attach to an unidentified existing listener or relax LAN authentication.
8. Add an edition/build identity to an existing health/status response so the renderer can detect that it reached the wrong backend. Keep sensitive diagnostics local/redacted.
9. For RF's first independent profile, offer an explicit one-time import of compatible Classic configuration. Import allowlisted settings and stable server IDs, preserve source files, record a migration marker and keep RF preferences independent afterward.
10. Do not copy active tokens, browser authentication sessions, updater state or LAN exposure wholesale. Generate RF secrets independently; default new RF LAN exposure to local-only and explain how to enable it later.
11. Decide how shared game-side writes are controlled. Both editions may read the same mod exports, but export requests, pen-detail request files and mod-config writes need coordination. Until a safe shared request owner/protocol is validated, explicitly disable conflicting write actions in the secondary concurrent session.
12. If concurrent operation is not a supported product goal, an alternative is a clear controlled 'other edition is running' flow plus documented sequential use. That is a scope decision, not a silent failure fix; obtain approval before choosing it.

#### Acceptance cases

1. **WP-02-AC01**: Classic then RF and RF then Classic each yield correctly branded independent windows and the expected backend identity.
2. **WP-02-AC02**: Same-edition duplicate launches focus the correct window and do not create an extra listener.
3. **WP-02-AC03**: Changing RF theme, selected save, LAN credentials or updater state does not modify Classic's settings.
4. **WP-02-AC04**: One edition can close/crash/restart without disconnecting the other; same-save read access remains correct.
5. **WP-02-AC05**: Port conflict with an unrelated process shows actionable recovery and never attaches the app to an arbitrary local service.
6. **WP-02-AC06**: Migration preserves Classic unchanged, handles empty/corrupt/partial source configuration, never overwrites an existing RF profile, and can be declined.
7. **WP-02-AC07**: Both editions' game-write operations are either demonstrably coordinated or clearly restricted; parallel readers alone do not count as write-path safety.

#### Risks and boundaries

- Moving a profile can appear to erase saves unless migration is explicit and reversible.
- Changing ports changes browser origins and can affect localStorage, bookmarks, SimHub URLs and LAN instructions.
- Two independent readers may still compete through shared game request files.

#### Rollback

Classic remains the anchor. Retain the old RF profile and migration journal; stop RF before restoring its own backup. Do not copy a partly migrated RF profile over Classic or downgrade shared configuration silently.

### WP-03 | Make installer, locale and uninstall ownership edition-safe

**Owner:** Windows packaging/release engineer.  **Priority:** P1 for cleanup; P2 for presentation.  **Planning allowance:** 1-2 engineering days.

**Depends on:** WP-02.

**Required outcome:** Installing, upgrading or removing RF cannot stop or erase Classic, and first-run language selection is usable.

#### Primary files / artifacts

- [FS25_FarmDashboard_App/build/installer.nsh](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/build/installer.nsh)
- [FS25_FarmDashboard_App/build/uninstall-user-data.ps1](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/build/uninstall-user-data.ps1)
- [FS25_FarmDashboard_App/package.json](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/package.json)
- [FS25_FarmDashboard_App/electron-builder.rf.yml](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/electron-builder.rf.yml)
- [FS25_FarmDashboard_App/main.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js)
- [tools/app/verify-electron-pack-files.mjs](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/tools/app/verify-electron-pack-files.mjs)

File lists are implementation targets, not files changed by this plan. New helper/test filenames must be finalized before the corresponding edit pass; preserve existing unrelated work.

#### Implementation sequence

1. Replace fixed shared cleanup names with an explicit validated edition identity passed by NSIS. Make the helper reject a missing/unknown edition; never fall back to a broad legacy-name list for RF.
2. Generate a finite allowlist of owned profile/cache/registry/locale paths from the edition policy. For each recursive operation, resolve its absolute target, enforce containment within the selected edition root, and reject empty/root/traversal/reparse-point escape targets.
3. Update both the PowerShell helper and NSIS legacy fallback. Fixing only one path leaves an unsafe uninstall path when a resource is missing.
4. Keep mode must preserve the chosen edition's documented settings, offline snapshots and navigation preferences. Decide where durable preferences live so pruning Chromium cache does not unexpectedly erase them.
5. Full mode may remove only the chosen edition's data after explicit confirmation. Its UI must name Classic or RF and state that the other edition and FS25 saves/mods are not removed.
6. Scope locale registry keys, temporary handoff files and install-locale.txt to the active edition and account. Preserve installer-language selection through elevation without writing another user's runtime profile.
7. Initialize a visible default language when no valid saved code exists. The current empty-language branch exits before selecting English. Validate saved codes and choose a real dropdown item; retain user selection on Back/Next.
8. Review customCheckAppRunning: it currently uses forceful taskkill by executable name. Prefer graceful closure with explicit upgrade messaging, and ensure fallback termination is limited to the selected installed edition, not generic Electron or FS25.
9. Inspect dependency-uninstall ownership before removing ImageMagick. Shared or pre-existing dependencies must remain while the other edition needs them; do not treat 'installed once by Farm Dashboard' as exclusive ownership.
10. Test cleanup against disposable profile fixtures and VMs, never the user's real AppData. Include missing-helper fallback, silent uninstall, Keep, Full, cancellation, per-user/all-users and locked-file failures.
11. Return meaningful cleanup status for failed removals rather than unconditional success. Retain a redacted uninstall log and offer recovery for the selected edition only.

#### Acceptance cases

1. **WP-03-AC01**: Uninstall RF with both Keep and Full leaves every Classic sentinel file and registry value unchanged; test the reverse as well.
2. **WP-03-AC02**: RF upgrade stops only RF and does not close Classic or the game.
3. **WP-03-AC03**: Missing/unrecognized edition input produces zero removals; outside-root and link/junction escape fixtures are rejected.
4. **WP-03-AC04**: Missing packaged helper exercises a safe edition-scoped fallback or aborts cleanup, not broad deletion.
5. **WP-03-AC05**: Blank, invalid, English and non-English saved locale cases all show a selected item and reach the intended runtime locale.
6. **WP-03-AC06**: Silent and elevated operations act on the correct account/edition; shared dependencies are not removed prematurely.

#### Risks and boundaries

- The current cleanup helper does not accept an edition parameter and names Classic roots explicitly; this is a source-established risk, not a tested uninstall outcome.
- All-users installs and per-user settings require careful account ownership handling.

#### Rollback

Keep previous installers and backups. Do not distribute a build with migrated profiles until its uninstaller understands those profiles. If cleanup ownership cannot be proven, preserve user data rather than attempt deletion.

### WP-04 | Persist RF save context and reject obsolete data

**Owner:** Frontend/state developer.  **Priority:** P1 data safety / P2 persistence.  **Planning allowance:** 0.75-1.5 engineering days.

**Depends on:** WP-00, WP-02.

**Required outcome:** The selected save/farm survives setup and restart, and old requests can never paint a different world under its name.

#### Primary files / artifacts

- [NEW APP/src/store/dashboard-store.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/store/dashboard-store.ts)
- [NEW APP/src/services/ws-client.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/services/ws-client.ts)
- [NEW APP/src/services/api-client.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/services/api-client.ts)
- [NEW APP/src/main.tsx](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/main.tsx)
- [NEW APP/src/app/AppTopBar.tsx](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/app/AppTopBar.tsx)
- [NEW APP/src/setup/main.tsx](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/setup/main.tsx)
- [NEW APP/src/platform/notifications.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/platform/notifications.ts)

File lists are implementation targets, not files changed by this plan. New helper/test filenames must be finalized before the corresponding edit pass; preserve existing unrelated work.

#### Implementation sequence

1. Add a versioned, edition-local stable server-ID preference with guarded read/write helpers. Persist IDs, not display names or array positions. Keep farm preferences scoped by server.
2. On startup, discover servers successfully before choosing a selection. Resolve an explicit supported deep-link server first, then a valid stored selection, then a documented fallback. A deleted/invalid saved ID must not retain another world's payload.
3. Persist the server as soon as the user's switch is accepted. An offline selected save should remain selected with an error/stale state instead of quietly opening a different farm.
4. Treat server/farm/payload/notification context changes as one transition. Clear stale entity deep links and selection-dependent UI when the selected world changes; do not carry a prior farm ID into an unrelated save by default.
5. Capture expected serverId, context generation and request sequence before every await, including bootstrap. The current bootstrap reads activeServerId again after awaiting and can mislabel a late response.
6. Reject out-of-context responses from bootstrap, refresh, HTTP fallback, WS and animal-detail requests. Within the same context, reject older source generations; do not compare client arrival time as if it were source freshness.
7. Serialize or sequence same-save refreshes and cancel obsolete work. Guard socket events with a connection epoch so an old socket's close event cannot resurrect polling after stopRealtime.
8. Make server-discovery HTTP errors typed failures, not successful empty lists. Handle 401/403 through authorization and 503 through retry; preserve known configuration while recovery runs.
9. Restore the selected server on the explicit dashboard activation path and verify selection across reload, setup round trip, restart, reordered/renamed profiles and per-edition migration.
10. Do not overwrite first-run configuration or silently delete an invalid preference's underlying server. Preserve compatibility with existing farm/section preference keys where safe.

#### Acceptance cases

1. **WP-04-AC01**: Select Montana Save 1, open setup and return, reload and restart: the same stable server ID remains selected.
2. **WP-04-AC02**: Rename/reorder servers and preserve selection; remove the selected profile and show the documented fallback without stale payload.
3. **WP-04-AC03**: Switch A to B while A's bootstrap response is delayed: B never displays A's data or alerts.
4. **WP-04-AC04**: Return newer then older responses for B, including HTTP/WS overlap: displayed generation never moves backward.
5. **WP-04-AC05**: Discovery returns 503 then 200: recover the save list without app restart. A 401 is not shown as 'no saves configured'.
6. **WP-04-AC06**: Storage denial/corrupt preference produces a usable fallback; Classic and RF do not overwrite each other's chosen save.
7. **WP-04-AC07**: Stopping realtime leaves no active retry/poll timer or late mutation after the component/session is gone.

#### Risks and boundaries

- Persistence without generation guards makes the wrong-save race look more convincing, not safer.
- The saved choice must not bypass successful server discovery or authentication.

#### Rollback

Use an additive versioned preference key and a documented migration. Remove only the new preference on rollback, not the configured server list or existing farm preferences.

### WP-05 | Build one truthful livestock summary/detail model

**Owner:** Frontend/domain developer + mod/pipeline developer.  **Priority:** P1.  **Planning allowance:** 1.5-3 engineering days.

**Depends on:** WP-00, WP-04.

**Required outcome:** Overview, pasture summary and individual details share identity, generation and metric semantics without fabricated zero or perfect health.

#### Primary files / artifacts

- [NEW APP/src/lib/pastures-parsers.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/pastures-parsers.ts)
- [NEW APP/src/lib/pastures-types.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/pastures-types.ts)
- [NEW APP/src/lib/livestock-normalize.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/livestock-normalize.ts)
- [NEW APP/src/lib/livestock-format.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/livestock-format.ts)
- [NEW APP/src/lib/livestock-hydrate.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/livestock-hydrate.ts)
- [NEW APP/src/lib/livestock-fanout.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/livestock-fanout.ts)
- [NEW APP/src/sections/pastures/PasturesSection.tsx](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/sections/pastures/PasturesSection.tsx)
- [NEW APP/src/sections/livestock/LivestockPenPanel.tsx](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/sections/livestock/LivestockPenPanel.tsx)
- [NEW APP/src/sections/livestock/AnimalDetailsModal.tsx](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/sections/livestock/AnimalDetailsModal.tsx)
- [FS25_FarmDashboard_App/detailAnimalsHydrate.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/detailAnimalsHydrate.js)
- [FS25_FarmDashboard_App/mergedSnapshotHold.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/mergedSnapshotHold.js)
- [FS25_FarmDashboard_Mod/src/collectors/AnimalDataCollector.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/AnimalDataCollector.lua)

File lists are implementation targets, not files changed by this plan. New helper/test filenames must be finalized before the corresponding edit pass; preserve existing unrelated work.

#### Implementation sequence

1. Write a canonical pen view-model contract before changing JSX: world/save identity, server ID, farm ID, pen ID, source generation, authoritative head count, detail completeness and per-metric provenance/coverage.
2. Represent unavailable values as unknown, not numeric zero. A measured 0% health remains zero; missing/synthetic health must not become 100%. Keep healthy/unknown/empty/partial states separate.
3. Normalize both supported payload shapes explicitly: husbandry rows with nested animals/clusters and already flattened individuals. Avoid classifying a mixed population solely from the first row or assigning unrelated rows to one pen.
4. Feed PasturesSection normalized animals and the same scoped pen model used by LivestockPenPanel. Remove the independent all-zero summary fallback when reliable nested or hydrated data is available.
5. Move detail hydration to a shared context-scoped cache/service consumed by the summary and detail components. Key entries by server/world/farm/pen/generation, not just pen ID. Preserve single-flight requests and bounded concurrency.
6. After detail arrives, update both summary and list from the same accepted generation. Reject stale detail after save switches, authoritative empty pens and generation rollback; an empty successful detail result is not a failed request.
7. For health, use valid per-head weights only. Calculate weighted mean over measured heads and carry coverage separately; never divide by an authoritative head total whose missing rows contributed no measured health.
8. For sex totals, expose male, female and unknown head counts. Their sum must equal the authoritative count when coverage is complete. Partial detail cannot claim zero missing males/females or complete coverage.
9. Treat duplicate individual IDs and cluster/individual overlap as data-contract failures to reconcile, not rows to count twice. When engine-reported totals conflict with detail, show coverage/conflict and retain valid identities.
10. Keep the game's Dairy Core herd-health metric separate from individual animal health. Label its source and units; do not force its score to equal the livestock mean or treat zero as necessarily absent.
11. Trace the earlier AnimalDataCollector population correction: if counts change, weighted sums and categorical counts must be reconciled or declared partial. Do not fix a producer inconsistency solely by presenting a nicer client average.
12. Update all formatter consumers together, including modal/inspector/export paths. Preserve legitimate zero values in filters and labels, and do not replace unknown values with plausible estimates.

#### Acceptance cases

1. **WP-05-AC01**: Husbandry-only, fully nested, flattened, clustered and hydrated forms of the same pen produce equivalent complete summaries.
2. **WP-05-AC02**: A fixture of one animal at 55% and 208 at 100% yields the correctly rounded weighted mean, not 0%; mixed-sex totals agree with all 209 records.
3. **WP-05-AC03**: Real 0%, null, omitted, non-finite and synthetic unknown health remain distinguishable in summary, row, modal, filter and export.
4. **WP-05-AC04**: Authoritative zero removes previous individuals and cluster totals from every surface and cache, including after restart.
5. **WP-05-AC05**: Partial detail reports measured coverage and unknown sex heads; a truncated list never masquerades as the entire herd.
6. **WP-05-AC06**: Delayed detail for Save A cannot update Save B even if both use the same pen ID.
7. **WP-05-AC07**: Switching between summary and list does not trigger unbounded duplicate fetches, fan-out or retained stale entries.

#### Risks and boundaries

- Flattening thousands of animals merely to calculate dashboard totals can reintroduce performance problems; use aggregate metadata and memoized projections where trustworthy.
- Do not assert that the observed displayed 100% aggregate was itself wrong; rounding may explain it. The proven contradiction is the separate 0%/zero-sex summary.

#### Rollback

Keep normalization changes behind a narrowly scoped compatibility adapter if needed. If telemetry is incomplete, fall back to an explicit unknown/partial presentation, not the old fabricated 0% or 100% defaults.

### WP-06 | Unify pasture warnings and resource confidence

**Owner:** Frontend/domain developer.  **Priority:** P2 correctness.  **Planning allowance:** 0.75-1.5 engineering days.

**Depends on:** WP-05.

**Required outcome:** Overview and pasture detail report the same supported warnings, with missing telemetry distinguished from an all-clear result.

#### Primary files / artifacts

- [NEW APP/src/sections/overview/OverviewSection.tsx](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/sections/overview/OverviewSection.tsx)
- [NEW APP/src/sections/pastures/PasturesSection.tsx](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/sections/pastures/PasturesSection.tsx)
- [NEW APP/src/lib/pastures-parsers.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/pastures-parsers.ts)
- [NEW APP/src/lib/pastures-warnings.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/pastures-warnings.ts)
- [NEW APP/src/lib/pastures-display.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/pastures-display.ts)
- [FS25_FarmDashboard_App/web/assests/js/modules/pastures.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/web/assests/js/modules/pastures.js)
- [FS25_FarmDashboard_App/web/assests/js/pastures-warnings.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/web/assests/js/pastures-warnings.js)

File lists are implementation targets, not files changed by this plan. New helper/test filenames must be finalized before the corresponding edit pass; preserve existing unrelated work.

#### Implementation sequence

1. Replace Overview's raw payload.pastures warning-array counter with the canonical warning selector over the accepted livestock/resource view model.
2. Define warning identity as world/server/farm/pen/type plus a stable condition key. Deduplicate backend and client-derived signals rather than summing duplicate arrays.
3. Document which sources establish food, water, straw, health, birth and productivity warnings, and which resource capacities apply to a given husbandry.
4. Preserve zero readings but distinguish not monitored, auto-supplied, not applicable and unavailable. Missing resource data must not become a critical zero automatically or a confident all-clear.
5. Separate 'no current warnings' from 'warnings unavailable/partially evaluated'. Use the same distinction in Overview counts, pasture badges, activities and notifications.
6. Retain the difference between Birth Warnings and all pasture warnings. Do not compare a birth-only counter with Classic's aggregate warning badge as if they were the same metric.
7. Keep estimated time-to-empty visibly estimated, with its inputs and confidence. Do not treat a guessed consumption rate as a measured depletion deadline.
8. Reconcile each of Classic's 13 observed warnings against the frozen fixture. Remove unsupported alarms and restore supported missing RF alarms; exact numerical parity is not the acceptance criterion without semantic parity.

#### Acceptance cases

1. **WP-06-AC01**: An identical frozen generation gives Overview and detail the same total of the same warning IDs.
2. **WP-06-AC02**: Warning drill-down opens the correct pen/condition and all-clear never hides unavailable telemetry.
3. **WP-06-AC03**: No animals means no phantom feed/birth warning from stale detail; one genuine low-health animal appears consistently.
4. **WP-06-AC04**: Auto-watered/unmonitored pens do not create false critical water warnings; measured empty resources do.
5. **WP-06-AC05**: Repeated equivalent generations do not duplicate notifications; resolving a condition clears the same stable warning.

#### Risks and boundaries

- Classic is a comparison source, not an unquestionable oracle.
- Resource estimates and live telemetry must not be merged into an unlabeled authoritative number.

#### Rollback

If one warning type lacks a reliable contract, label it unavailable and keep verified warning types active rather than restoring a blanket zero or blanket alarm.

### WP-07 | Reconcile fleet and weather discrepancies without guessing

**Owner:** Data/pipeline developer + frontend developer.  **Priority:** P2 investigation with bounded fixes.  **Planning allowance:** 0.5-1.5 engineering days.

**Depends on:** WP-00, WP-04.

**Required outcome:** Every displayed difference is either an intentional, clearly labeled projection or a corrected same-generation defect.

#### Primary files / artifacts

- [NEW APP/src/lib/vehicles.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/vehicles.ts)
- [NEW APP/src/sections/overview/OverviewSection.tsx](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/sections/overview/OverviewSection.tsx)
- [NEW APP/src/sections/vehicles/VehiclesSection.tsx](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/sections/vehicles/VehiclesSection.tsx)
- [NEW APP/src/lib/weather.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/weather.ts)
- [NEW APP/src/components/WeatherModal.tsx](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/components/WeatherModal.tsx)
- [FS25_FarmDashboard_App/web/assests/js/modules/environment.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/web/assests/js/modules/environment.js)
- [FS25_FarmDashboard_App/web/assests/js/modules/vehicles.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/web/assests/js/modules/vehicles.js)
- [FS25_FarmDashboard_App/dataMerger.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/dataMerger.js)

File lists are implementation targets, not files changed by this plan. New helper/test filenames must be finalized before the corresponding edit pass; preserve existing unrelated work.

#### Implementation sequence

1. For fleet parity, compare stable entity IDs from the frozen source and each UI projection. Produce explicit included/excluded sets for vehicles, implements, storage items, dealer/pool stock and unresolved ownership.
2. Check whether the exact six excluded RF records are the six pallet/storage entries. If yes, retain correct filtering and align labels, counts, fleet-map scope and navigation rather than reintroduce pallets into equipment totals.
3. If records are actually missing, trace their owner/type/name/identity through the merger and filters. Fix the offending boundary with a fixture; do not hard-code a six-record offset or infer ownership from unrelated farm totals.
4. Cover pallet forks, bale-and-pallet trailers, big bags and liquid containers so name matching does not hide legitimate equipment. Prefer explicit supported type signals over vague substring matching where available.
5. For weather, compare raw export.currentWeather, merged weather, source generation and each rendered label. Confirm the screen reads current weather rather than forecast or optional Weather Guard state.
6. Because both inspected helpers map explicit snow/cloudy strings sensibly, investigate stale bootstrap/cache/merge ordering before changing weather-name mappings.
7. Document precedence for base weather and optional companion telemetry. Missing current weather displays Unknown; do not synthesize forecasts or temperatures merely to fill space.
8. Add shared canonical weather labels with localized display text where practical, while keeping source/provenance available for troubleshooting.

#### Acceptance cases

1. **WP-07-AC01**: Frozen Save 1 classifies every entity exactly once; any 47-to-41 difference is explained by stable IDs and labels.
2. **WP-07-AC02**: Legitimate pallet-handling equipment remains in Fleet, consumable pallets in Storage, and owner-unresolved items are not guessed into a farm.
3. **WP-07-AC03**: Both editions render the same current-weather condition for the same canonical generation.
4. **WP-07-AC04**: Older weather responses cannot overwrite newer accepted weather; unknown is not silently rendered as sun, snow or a fabricated forecast.
5. **WP-07-AC05**: Changing selected farm does not accidentally change global weather while changing selected world does.

#### Risks and boundaries

- Sequential live screenshots are not sufficient to prove a same-generation weather bug.
- Do not broaden vehicle-owner heuristics to make the visible totals agree.

#### Rollback

Keep a discrepancy classified as unresolved until its entity/generation evidence exists. Avoid shipping speculative filtering or weather patches.

### WP-08 | Refine setup, modal accessibility and failure recovery

**Owner:** Frontend/accessibility developer.  **Priority:** P1 for auth focus / P2 for usability.  **Planning allowance:** 0.75-1.5 engineering days.

**Depends on:** WP-01, WP-04, WP-05.

**Required outcome:** Setup and settings remain readable, keyboard-usable and safe under slow or failed loading.

#### Primary files / artifacts

- [NEW APP/src/settings/SettingsModal.tsx](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/settings/SettingsModal.tsx)
- [NEW APP/src/lib/use-focus-trap.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/use-focus-trap.ts)
- [NEW APP/src/platform/LanAuthOverlay.tsx](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/platform/LanAuthOverlay.tsx)
- [NEW APP/src/services/lan-auth.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/services/lan-auth.ts)
- [NEW APP/src/simhub/main.tsx](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/simhub/main.tsx)
- [NEW APP/src/setup/main.tsx](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/setup/main.tsx)
- [NEW APP/src/styles/app-shell.css](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/styles/app-shell.css)
- [NEW APP/src/lib/ux-classify.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/ux-classify.ts)

File lists are implementation targets, not files changed by this plan. New helper/test filenames must be finalized before the corresponding edit pass; preserve existing unrelated work.

#### Implementation sequence

1. Give Settings an opaque or sufficiently solid surface and clear backdrop so farm text does not compete with form labels. Retain the established visual language instead of redesigning the whole app.
2. Use localized language display names rather than raw codes, remove duplicate dedicated instruction numbering, and ensure the same five-step client-mirror guidance is used in Classic and RF.
3. Make the multi-save selector fit common desktop widths and a narrow viewport without hiding the selected save. Preserve a clear distinction between scrolling the save list and scrolling page content.
4. Fix the earlier focus-trap lifecycle so callback identity changes do not refocus the first input on every render. Restore focus to the opener and handle nested dialogs/ Escape predictably.
5. Represent Settings hydration success per section. Failed load must not enable saving uninitialized defaults; allow retry and visibly separate partial success from complete save success.
6. Use persistent single-flight authentication state. A timeout/network failure must not authorize protected startup or erase valid stored credentials; double submit must not spawn competing verifications.
7. Mount SimHub's authentication boundary before its data-ready gate so the user can actually log in immediately. Check HTTP status before parsing response bodies.
8. Classify OS error codes before message substrings: ENOENT under C:/Users is a missing path, not a username problem. Show the affected safe path and a relevant recovery action without leaking secrets.
9. Ensure busy/error/success states are announced and not color-only. Test keyboard focus, small viewport, 200% text scale, long localized strings and disabled controls.
10. Keep desktop-only tools clearly unavailable for remote/read-only viewers. Do not make privileged controls visible-but-failing as the primary permission explanation.

#### Acceptance cases

1. **WP-08-AC01**: Typing continuously in the password field stays there through rerenders; Tab and Shift+Tab remain inside the active dialog and Escape restores focus.
2. **WP-08-AC02**: Failed Settings hydration cannot save replacement defaults; retry restores the original configuration.
3. **WP-08-AC03**: Direct remote SimHub visit shows login immediately, and 401/503/non-JSON errors produce distinct recoverable states.
4. **WP-08-AC04**: Slow/offline verification does not release protected loading, erase valid credentials or permit duplicate submit.
5. **WP-08-AC05**: Setup/dedicated instructions and primary controls remain readable at representative 1366x768 desktop, narrow 390px viewport and 200% text scale.

#### Risks and boundaries

- UI clarity changes must not weaken authorization or hide a failed save.
- Responsive review should distinguish desktop Electron use from tablet/browser support.

#### Rollback

Keep accessibility/state changes in isolated commits from styling. Revert presentation without reverting validated focus/auth/load protections.

### WP-09 | Close the carried-forward security and transport release gates

**Owner:** Security/backend developer.  **Priority:** Required before private external testers where exposed.  **Planning allowance:** 1.5-3 engineering days, subject to closure evidence.

**Depends on:** WP-00, WP-02.

**Required outcome:** Visible fixes do not ship on top of known trust-boundary or remote-cache defects.

#### Primary files / artifacts

- [FS25_FarmDashboard_App/main.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js)
- [FS25_FarmDashboard_App/safeFsIdentity.cjs](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/safeFsIdentity.cjs)
- [FS25_FarmDashboard_App/mapOverviewResolver.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/mapOverviewResolver.js)
- [FS25_FarmDashboard_App/ftpAccess.cjs](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/ftpAccess.cjs)
- [FS25_FarmDashboard_App/setupConfigMerge.cjs](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/setupConfigMerge.cjs)
- [FS25_FarmDashboard_App/livestockDetail.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/livestockDetail.js)
- [FS25_FarmDashboard_App/httpFeedXml.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/httpFeedXml.js)

File lists are implementation targets, not files changed by this plan. New helper/test filenames must be finalized before the corresponding edit pass; preserve existing unrelated work.

#### Implementation sequence

1. First match each earlier finding to the candidate's exact source/build. If a fix already landed, collect the corresponding negative/positive acceptance evidence instead of rewriting it. These findings are carried forward, not freshly re-exploited in this planning pass.
2. Distinguish absent Origin from explicit null, malformed and hostile origins. Reject the latter at WS and sensitive local-write boundaries; preserve authorized native/desktop flows through an explicit policy.
3. Validate FTP detail filenames against the complete allowed grammar, reject both slash types, drive/UNC/ADS/traversal forms, and enforce destination containment immediately before download and atomic replacement.
4. Enforce source-root containment for raw map IDs before looking up/copying overview images, independently of safe output slugs.
5. Include all FTP/TLS/HTTP transport policy fields in configuration lifecycle decisions. The next live/XML/detail operation must use the newly saved policy; do not silently downgrade to plaintext or bypass certificate checks.
6. Serialize per-server work and invalidate configuration generations on teardown. Abort or discard obsolete FTP/XML/detail completions before disk commit and before state mutation; dispose debounce/retry/periodic timers.
7. Enforce a true overall HTTP deadline in addition to idle timeout, including redirect/trickle/truncated-response cases. Settle exactly once and dispose request/response timers/listeners.
8. Carry remote revision and cache age independently from local download mtime. Add bounded missing-index refresh and documented bulk/per-pen precedence.
9. Tighten the new activation IPC alongside existing sensitive routes: exact trusted scheme/host/effective port/document/frame. Different loopback ports used by the two editions must not create cross-edition implicit trust.
10. Keep LAN opt-in, secrets edition-local and diagnostics redacted. Do not expose a candidate over a public proxy or public Wi-Fi to demonstrate connectivity.

#### Acceptance cases

1. **WP-09-AC01**: Explicit Origin:null, malformed, hostile and wrong-edition origins fail applicable protected requests; authorized native/desktop requests pass.
2. **WP-09-AC02**: Malicious FTP listing/metadata fixtures select no path outside an isolated cache root; valid filenames still synchronize.
3. **WP-09-AC03**: Traversal map IDs cannot select outside images; legitimate custom maps still work.
4. **WP-09-AC04**: A transport-only save updates the next operation across all transfer paths; invalid certificates fail closed.
5. **WP-09-AC05**: Slow overlapping polls never overlap per server, replaced configurations ignore old completions, and repeated watcher failures leave one scheduler.
6. **WP-09-AC06**: Trickle, aborted response and redirect-loop fixtures settle within the documented total deadline with no resource leak.

#### Risks and boundaries

- No internet-exposed exploit or real TLS handshake was performed during this plan.
- If a supported exposed path remains P1, do not waive it simply because local Save 1 works.

#### Rollback

Disable the affected optional exposure/path with an explicit user-facing limitation while preserving safe local reads. Never roll back to an insecure fallback silently.

### WP-10 | Repair exporter, merge and freshness contracts behind the UI

**Owner:** Mod/pipeline developer.  **Priority:** P1 export integrity / P2 correctness and efficiency.  **Planning allowance:** 2-4 engineering days, subject to prior fix evidence.

**Depends on:** WP-00, WP-05.

**Required outcome:** The new displays reflect honest, bounded, world-correct data rather than hiding upstream inconsistencies.

#### Primary files / artifacts

- [FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua)
- [FS25_FarmDashboard_Mod/src/FarmDashboardExportMirror.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardExportMirror.lua)
- [FS25_FarmDashboard_Mod/src/collectors/AnimalDataCollector.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/AnimalDataCollector.lua)
- [FS25_FarmDashboard_Mod/src/collectors/FinanceDataCollector.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/FinanceDataCollector.lua)
- [FS25_FarmDashboard_Mod/src/collectors/VehicleDataCollector.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/VehicleDataCollector.lua)
- [FS25_FarmDashboard_Mod/src/collectors/EconomyDataCollector.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/EconomyDataCollector.lua)
- [FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua)
- [FS25_FarmDashboard_Mod/src/collectors/ProductionDataCollector.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/ProductionDataCollector.lua)
- [FS25_FarmDashboard_Mod/src/FarmDashboardSettingsApi.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardSettingsApi.lua)
- [FS25_FarmDashboard_Mod/src/InventoryScan.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/InventoryScan.lua)
- [FS25_FarmDashboard_Mod/src/FarmDashboardCourseplayCompat.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardCourseplayCompat.lua)
- [FS25_FarmDashboard_App/dataMerger.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/dataMerger.js)
- [FS25_FarmDashboard_App/mergedSnapshotHold.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/mergedSnapshotHold.js)
- [FS25_FarmDashboard_App/detailAnimalsHydrate.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/detailAnimalsHydrate.js)
- [FS25_FarmDashboard_App/xmlCollector.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/xmlCollector.js)

File lists are implementation targets, not files changed by this plan. New helper/test filenames must be finalized before the corresponding edit pass; preserve existing unrelated work.

#### Implementation sequence

1. Confirm relevant GIANTS Lua/file/save APIs against the local wiki, extracted scripts and LUADOC before implementation. This plan specifies required behavior, not invented engine signatures.
2. Make export replacement check real write/close/copy/rename outcomes, including nonthrowing failures. Stage a complete generation, publish atomically where supported, and preserve the last known-good export when publication fails.
3. Use explicit collector outcomes: fresh, unchanged, unavailable and failed. A failed coroutine/legacy collector must not be promoted to a fresh empty success.
4. Preserve generatedAt/revision and world/pen identity through detail-cache construction and selection. Authoritative empty/disabled state must clear hold and persisted backups, not resurrect previous animals, stock or RF sections.
5. Preserve source freshness across backend restart. Distinguish collection time from receipt time, and do not mark an unchanged unstamped cache live just because it was reread.
6. Remove ambiguous exact ownership inference. Retain unresolved records until authoritative evidence exists; keep valid live owner zero distinct from missing owner.
7. Use a global consumed saved-vehicle identity set across every matching index. Keep fieldId and farmlandId in separate typed namespaces and preserve authoritative live ownership transfers.
8. Correct finance valuation to use the canonical resale field rather than a purchase-price fallback represented as net worth. Keep estimates explicit.
9. Repair requested export cadence updates through runtime and synchronization setters. A later adaptive probe must not restore an obsolete startup interval.
10. Bound traversal work by examined entries, not accepted bales or successful matches. Review Courseplay's repeated whole-fleet scans and conditionally reachable field fallback paths; do not claim FPS improvement without measurement.
11. Remove station-name guesses that fabricate accepted products or prices. Prefer real station offers; label unavailable market data rather than create plausible results.
12. Replace aggregate XML fingerprints with per-file identity/existence/revision evidence that cannot miss same-size masked optional-file changes.
13. Keep gameplay writes out of UI smoke fixtures. Run failure injection and destructive export scenarios on disposable fixture roots and dedicated test saves.

#### Acceptance cases

1. **WP-10-AC01**: Injected write/copy/close/rename failures leave the previous valid export readable and never advance a fresh generation falsely.
2. **WP-10-AC02**: Empty pens/stock and disabled RF sections stay empty/disabled through merge, hold, persistence and restart.
3. **WP-10-AC03**: Both detail enumeration orders choose the newest compatible generation; stale detail cannot attach to an authoritative-zero pen.
4. **WP-10-AC04**: Ownership transfer, owner zero, field/farmland numeric collisions and mixed UID/config vehicle matching all produce correct one-to-one identities.
5. **WP-10-AC05**: Same-size optional-file changes refresh XML; equal-size remote changes and clock skew cannot pin old detail indefinitely.
6. **WP-10-AC06**: Runtime cadence remains stable after adaptive probes; long scans obey the chosen per-invocation budget and maintain bounded request servicing.

#### Risks and boundaries

- Current in-game telemetry is mod 5.0.0.1; it does not validate the newly packaged Classic 3.4.0.8 artifact.
- Some engine fallback/performance risks remain conditional until reachability is established on supported game modes.

#### Rollback

Preserve the previous good ZIP/export and restore only in a controlled game-exit/reload window. Schema changes require a backward-compatible reader or explicit migration; never substitute stale data as fresh to make the dashboard look populated.

### WP-11 | Make regression and packaging gates reproducible

**Owner:** Test/release engineer.  **Priority:** Required before installed rerun.  **Planning allowance:** 1-2 engineering days plus suite runtime.

**Depends on:** WP-01, WP-03, WP-04, WP-05, WP-06, WP-07, WP-08, WP-09, WP-10.

**Required outcome:** A candidate can only be called fixed when the relevant negative fixtures and packaged-runtime checks pass.

#### Primary files / artifacts

- [FS25_FarmDashboard_App/package.json](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/package.json)
- [FS25_FarmDashboard_App/package-lock.json](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/package-lock.json)
- [FS25_FarmDashboard_App/tests/mergeTransientPool.integration.test.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/tests/mergeTransientPool.integration.test.js)
- [tools/check-lua-syntax.mjs](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/tools/check-lua-syntax.mjs)
- [tools/app/verify-electron-pack-files.mjs](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/tools/app/verify-electron-pack-files.mjs)
- [tools/app/assert-rf-update-channel.mjs](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/tools/app/assert-rf-update-channel.mjs)
- [tools/app/run-electron-builder.mjs](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/tools/app/run-electron-builder.mjs)
- [tools/Zip-FarmDashboardMod.ps1](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/tools/Zip-FarmDashboardMod.ps1)
- `C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/NEW APP/ (test/build configuration as needed)`

File lists are implementation targets, not files changed by this plan. New helper/test filenames must be finalized before the corresponding edit pass; preserve existing unrelated work.

#### Implementation sequence

1. Turn each WP acceptance case into assertion-based, hermetic regression coverage. Test the actual exported helpers or integration boundary rather than a copy of production logic that can drift.
2. Separate fast pure-domain tests, mocked lifecycle/security tests, browser behavior tests and installed Electron/FS25 acceptance. Report each layer independently.
3. Declare and pin the Lua checker dependency in its owning package and lockfile. Define BOM handling and make the checker produce actual per-file parse results on a clean dependency install.
4. Replace result-dependent early returns in the ownership integration test with committed fixtures and explicit assertions. Environment-only cases may be declared skipped before execution, never because the expected result was absent.
5. Add edition manifest checks for productLine, runtime identity, bundled activation/helpers, updater channel, installer cleanup resource and profile/port policy.
6. Use the existing test scripts after implementation approval: app Jest, app test:mjs, UI type/build checks, Lua syntax, packaging verification, localization checks and targeted new regressions. No command in this plan has been executed as a fix-validation run.
7. Build a fresh NEW APP distribution, stage ui-v2 once, and package both editions from the same identified source snapshot into new private build-specific output directories.
8. Use explicit --publish never when invoking the direct builder. Do not use build commands that accidentally target public Final Output or deployment/upload scripts.
9. Generate a candidate manifest with desktop version, productLine, Electron version, mod version, artifact name, SHA-256, size, source/build ID and compatible feed. Verify Authenticode status separately; a 'signing with signtool' log line is not certificate evidence.
10. Check that RF emits only latest-rf.yml for its feed and that no RF artifact is referenced by Classic latest.yml. Keep all generated feed files private until a distinct publication decision.

#### Acceptance cases

1. **WP-11-AC01**: Clean setup executes every intended tool gate; missing tooling fails distinctly rather than reporting an application/mod failure or a pass.
2. **WP-11-AC02**: Deliberately broken ownership, navigation, zero-health and origin/containment fixtures fail their tests.
3. **WP-11-AC03**: Fresh packaged files contain every required runtime helper and match the intended UI and productLine.
4. **WP-11-AC04**: RF feed guard passes, Classic/RF manifests point only to their own artifacts, and hashes uniquely identify each candidate build.
5. **WP-11-AC05**: Historical test totals are not reused as current pass evidence; all skips/failures have explicit reasons.

#### Risks and boundaries

- A generated UI copied from an old build can make source tests pass while installers still contain the defect.
- Using the same visible version for multiple private rebuilds requires an immutable build ID/hash; never overwrite a previously supplied binary unnoticed.

#### Rollback

Keep the failing and corrected private builds in separate folders. If a gate fails, do not replace the previous candidate, change public feeds or claim readiness.

### WP-12 | Run the installed, live-save and dedicated acceptance campaign

**Owner:** Release tester + developer on call.  **Priority:** Required before tester handoff.  **Planning allowance:** 1-2 engineering days plus a booked multiplayer window.

**Depends on:** WP-11.

**Required outcome:** The actual delivered executables and paired mod ZIPs pass their advertised workflows on real supported environments.

#### Primary files / artifacts

- `C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/docs/_internal/audits/ (new execution evidence and acceptance checklist)`
- [COMPATIBILITY.md](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/COMPATIBILITY.md)
- [Private candidate manifests and installer/mod artifacts outside public release output](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/Private%20candidate%20manifests%20and%20installer/mod%20artifacts%20outside%20public%20release%20output)

File lists are implementation targets, not files changed by this plan. New helper/test filenames must be finalized before the corresponding edit pass; preserve existing unrelated work.

#### Implementation sequence

1. Use a disposable Windows profile/VM for clean install, upgrade and uninstall tests. Use the real PC only for explicitly agreed non-destructive live checks, with profile/save/mod backups.
2. Run Classic-only, RF-only and both launch orders. Verify About versions, runtime identity, resolved origins, profile isolation, updater identity and same-edition duplicate-launch behavior.
3. Walk clean setup and existing-config setup: detect/select a local save, save unchanged settings, return to the dashboard, reopen setup, recover a bad path, cancel a change and restart. Do not reset the user's real setup to simulate first run.
4. On a copied Save 1, compare raw/current generation and each UI's field, livestock, pasture, vehicle/storage and weather outputs. Confirm time/source progression, not merely a green Live API badge.
5. Run the Classic 4.2.2 plus packaged 3.4.0.8 pair in a controlled session. Then run RF 5.0.1 plus packaged 5.0.0.1. Exit FS25 before replacing the same-named ZIP; keep only the intended dashboard mod active and reload the copied save.
6. Treat both-apps/same-mod coexistence as a separate compatibility claim. Test any cross-pair that documentation promises; do not infer it from the minimum-version label.
7. For the dedicated path, use an agreed real server and joined client with the matching mod. Observe a new mirror generation, check world identity, open dashboard/details, disconnect the client, verify stale labeling, reconnect and verify recovery.
8. The existing Witcombe demo mirror establishes a snapshot-rendering check only. It cannot satisfy the live dedicated requirement, empty-server behavior or true world-isolation acceptance.
9. Include save switching during delayed detail fetches, mod-export pauses, app restart with cached data, a recoverable missing local path and an explicit offline/reconnect cycle.
10. Perform keyboard and representative viewport checks on the installed RF build; exercise permitted tablet/SimHub read-only and auth flows separately without altering system security settings.
11. Measure cold launch, first accepted data, save-switch latency, detail hydration, steady-state CPU/RSS and watcher/request counts on a stated machine/dataset. Proposed soak: 30 minutes; measure, do not describe instantaneous impressions as efficiency proof.
12. Stop and document any reproducible blocker. No repeated blind clicks, generic process killing, dropping safeguards or changing the public release line to make acceptance appear green.

#### Acceptance cases

1. **WP-12-AC01**: All five current high-impact/source-risk items have installed or disposable-environment acceptance evidence at their stated boundary.
2. **WP-12-AC02**: Both advertised app/mod pairs load a copied save with fresh, correctly scoped data and no attributable new game-log errors.
3. **WP-12-AC03**: A real dedicated join/disconnect/reconnect produces correct live/stale/recovered states without local-save cross-contamination.
4. **WP-12-AC04**: RF/Classic uninstall isolation passes on disposable profiles in both directions.
5. **WP-12-AC05**: Each latency measurement includes machine, dataset, generation and cold/warm state; the soak shows no monotonic listener/timer/request accumulation.
6. **WP-12-AC06**: Any untested cross-pair, LAN path or conditional engine mode remains explicitly unverified rather than folded into a general pass.

#### Risks and boundaries

- Multiplayer access, credentials and safe save selection are external prerequisites; lack of them is a documented coverage gap.
- A version label inside an old running game session cannot certify a newly packaged ZIP.

#### Rollback

Restore only the test environment's backed-up mod/profile/save after closing the relevant applications. Leave the public 4.2.1 release and the user's primary Save 1 intact.

### WP-13 | Prepare a controlled tester handoff without changing the public story

**Owner:** Release owner.  **Priority:** Final approval gate.  **Planning allowance:** 0.5 engineering day after all gates.

**Depends on:** WP-12.

**Required outcome:** Testers receive identifiable private candidates, supported pairings, recovery instructions and honest limitations.

#### Primary files / artifacts

- [Private candidate release folder and manifest](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/Private%20candidate%20release%20folder%20and%20manifest)
- `C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/docs/_internal/audits/ (tester checklist/results)`
- `C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/COMPATIBILITY.md (only verified compatibility changes)`

File lists are implementation targets, not files changed by this plan. New helper/test filenames must be finalized before the corresponding edit pass; preserve existing unrelated work.

#### Implementation sequence

1. Keep the requested candidate versions: Classic 4.2.2 with mod 3.4.0.8, RF 5.0.1 with mod 5.0.0.1. If a distributed version must be superseded, obtain a versioning decision rather than silently replacing it.
2. Package each installer, intended mod ZIP, checksum manifest, installation instructions, supported pairing list, known limitations, rollback steps and a focused tester checklist.
3. Label the package a private Electron 43 candidate. Do not edit public 4.2.1 release notes, website claims, public latest.yml, stable downloads or existing public announcements.
4. Ensure the tester guide says there is one active FS25_FarmDashboard.zip at a time and explains controlled switching. Keep Classic and RF installer/UI identities clear.
5. Require evidence-backed disposition for every P1 and supported-path P2. A deferred nonblocking refinement needs an owner, rationale, workaround and explicit release-owner approval.
6. Select an initial small tester group and agreed private delivery destination. Confirm recipients and content before sending; no credentials, raw save data or private server configuration go in the package.
7. Ask testers to return build ID/hash, app/mod versions, source mode, save/world identity in a redacted form, steps and expected/actual behavior. Provide a safe diagnostic export route and redact secrets.
8. Keep public promotion as a separate future decision after tester results. A successful private test does not authorize replacing the 4.2.1 public story or broad auto-update publication.

#### Acceptance cases

1. **WP-13-AC01**: Tester archive contains exactly the intended edition/mod pairing and checksum manifest with no private configuration.
2. **WP-13-AC02**: Every handoff claim maps to an executed acceptance case; unsupported paths are listed as unverified.
3. **WP-13-AC03**: No RF artifact enters the Classic update channel and no public release asset or announcement changes.
4. **WP-13-AC04**: Rollback instructions have been exercised in the disposable environment and do not require deleting all Farm Dashboard data.

#### Risks and boundaries

- Sharing an unqualified 'all fixed' message would overstate the evidence.
- Publishing the rebuilt Classic candidate as the existing public 4.2.1 release violates the explicit release boundary.

#### Rollback

Withdraw the private candidate by build ID, preserve evidence and distribute corrected instructions. Do not rewrite already published historical claims to conceal a failing build.

## 8. Release milestones and exit evidence

### G0: evidence and decisions ready

- WP-00 evidence is complete; actual profile/port/lock behavior is classified.
- The coexistence and migration decisions have an owner and approval.
- Failing artifacts and relevant user data are backed up outside public release output.

### G1: direct candidate failures fixed

- CUA-01 has the approved, visible and safe launch behavior; same-edition and cross-edition cases pass.
- CUA-02 passes unchanged/changed/first-run launch and failure recovery without an app restart.
- CUA-03 uses one consistent livestock projection with truthful unknown/partial semantics.
- CUA-04 preserves stable save selection and rejects obsolete payload/detail responses.
- SRC-05 cleanup affects only the selected edition, proven with disposable sentinels and both helper/fallback paths.
- REC-01 through REC-04 are either corrected or evidence-reconciled; unresolved findings remain explicit.

### G2: data/security/reproducibility closed

- Every earlier P1 has current candidate evidence or a safe removal of the affected feature from the tested scope, explicitly approved and disclosed. Do not call a path fixed just because it was disabled.
- Supported-path P2 issues have acceptance evidence or a documented nonblocking deferral approved by the release owner.
- Lua syntax tooling starts cleanly; regression tests do not silently return when expected results are missing.
- Origin, filename/path containment, transport changes, cache clearing and export failure cases pass.

### G3: installed acceptance ready for handoff

- Each advertised desktop/mod pairing passes its own installed and game-load test.
- The dedicated check includes actual joined-client mirror production and disconnect/reconnect, not only a saved demo.
- Clean install, upgrade, Keep/Full uninstall isolation, offline/stale recovery and basic accessibility pass.
- Measured startup/refresh/soak evidence is attached with machine, dataset and source generation. No invented speedup or resource claim.

### G4: private tester handoff approved

- The archive has hashes, build IDs, intended pairings, limitations and tested rollback instructions.
- Recipients, destination and message are explicitly approved before sending.
- Public 4.2.1 remains unchanged; Classic and RF update feeds remain isolated.

## 9. Validation commands and execution boundaries

The following are planned commands using scripts observed earlier in this project. They are not results, and none was run during this planning pass. Run them after implementation approval, from the workspace root, with a clean/private build output policy:

```powershell
npm test --prefix FS25_FarmDashboard_App -- --runInBand
npm run test:mjs --prefix FS25_FarmDashboard_App
node tools/check-lua-syntax.mjs
npm run verify:electron-pack --prefix FS25_FarmDashboard_App
npm run i18n:verify --prefix FS25_FarmDashboard_App
npm run build:ui
```

Add the actual UI type-check command from its declared tooling rather than assuming a script name. Run new focused domain/lifecycle tests through the owning suite. Package with the explicit edition config, a new private output directory and `--publish never`; verify the emitted artifact/feed identities afterward as part of the approved release run.

Do not run upload:gportal-mod, delete-profile helpers, release publishing, updater promotion, forced process cleanup or game-mod replacement as incidental validation. These require the specific controlled procedure/approval described above.

## 10. Tester acceptance packet

- Identity: desktop edition/version, productLine, Electron runtime, intended mod version, source/build ID, installer/ZIP SHA-256 and file sizes.
- Environment: Windows build, screen scale, CPU/RAM, game build, map, mod set and source mode, recorded without publishing private credentials.
- Core checklist: install, launch, setup round trip, save persistence, herd summary/detail, warnings, fleet/storage, weather, offline recovery, dedicated mirror, shutdown and restart.
- Recovery checklist: edition-safe uninstall/Keep, tested rollback, how to preserve saves and how to restore only the candidate's own profile.
- Coverage: exact app/mod pairs tested, untested cross-pairs, untested network paths and conditional engine modes.
- Feedback format: build ID, steps, expected/actual result, selected server/world context, source generation and redacted evidence.
- Release statement: private Electron 43 candidate; not a replacement for the public 4.2.1 release story.

## Appendix A. Earlier 35-finding crosswalk

This section prevents the visible smoke-test fixes from displacing earlier release obligations. Entries retain their earlier evidence/fix/acceptance wording, mapped to the work packages above. They were not all re-read or retested in this planning pass. If current code already resolves an item, attach matching candidate evidence and mark it closed; do not blindly repeat a fix.

### R2-DATA-01 | P1 | A late bootstrap response can still display one save under another save's name

**Work package:** WP-04. **Earlier owner area:** Frontend / release.

**Earlier evidence boundary:** Reproduced against current TypeScript in the audit harness.

**Required correction:** Capture the request's server ID and context generation before awaiting, then validate both before ingestion, including startup. Apply one identity-aware ingestion contract to every source.

**Closure criterion:** Delay initial A beyond splash dismissal, switch to B and complete B then A. B must remain selected with B's payload. Cover bootstrap, manual refresh, fallback polling and WS overlap.

**Earlier source anchors:** [NEW APP/src/services/ws-client.ts:231](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/services/ws-client.ts:231); [NEW APP/src/services/ws-client.ts:232](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/services/ws-client.ts:232); [NEW APP/src/components/SplashScreen.tsx:55](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/components/SplashScreen.tsx:55).

### R2-MOD-01 | P1 | Nonthrowing I/O failures can still be reported as successful export replacement

**Work package:** WP-10. **Earlier owner area:** Mod / pipeline.

**Earlier evidence boundary:** Current source; Lua I/O fault injection not executed.

**Required correction:** Define one successful replacement contract across rename, copy, write, close, save and mirror paths. Preserve previous good bytes and the recoverable source on failure; advance success/generation bookkeeping only after confirmed replacement.

**Closure criterion:** Fault-inject false-return copy/write/close/save operations, including an existing destination. Previous bytes remain usable, no success notification is emitted and a later valid retry recovers.

**Earlier source anchors:** [FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua:438](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua:438); [FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua:600](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua:600); [FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua:3545](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua:3545); [FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua:4021](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua:4021); [FS25_FarmDashboard_Mod/src/FarmDashboardExportMirror.lua:138](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardExportMirror.lua:138).

### R2-SEC-01 | P1 | Opaque browser origins still receive loopback trust

**Work package:** WP-09. **Earlier owner area:** Security / backend.

**Earlier evidence boundary:** Current extracted guards exercised with synthetic requests.

**Required correction:** Distinguish an absent Origin from an invalid or opaque one; reject explicit null/malformed origins. Require scoped authorization for sensitive browser operations rather than granting it from locality alone.

**Closure criterion:** Hostile, malformed and explicit null origins fail for WS, livestock requests and export. Authorized native/desktop clients continue to work.

**Earlier source anchors:** [FS25_FarmDashboard_App/main.js:1497](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:1497); [FS25_FarmDashboard_App/main.js:1534](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:1534); [FS25_FarmDashboard_App/main.js:1863](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:1863).

### R2-SEC-02 | P1 | FTP detail listing filenames can escape the Windows cache root

**Work package:** WP-09. **Earlier owner area:** Security / backend.

**Earlier evidence boundary:** Installed MLSD parser plus extracted sync function; all filesystem writes mocked.

**Required correction:** Validate the complete allowed filename grammar, reject both separator types and enforce resolved containment against a fixed trusted root immediately before temporary download and final rename.

**Closure criterion:** Malicious MLSD/Unix listing entries never initiate outside-root writes. Legitimate integer and composite animal filenames continue to sync.

**Earlier source anchors:** [FS25_FarmDashboard_App/main.js:2937](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:2937); [FS25_FarmDashboard_App/main.js:2942](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:2942); [FS25_FarmDashboard_App/main.js:2871](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:2871); [FS25_FarmDashboard_App/main.js:3033](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:3033); [FS25_FarmDashboard_App/node_modules/basic-ftp/dist/parseListMLSD.js:165](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/node_modules/basic-ftp/dist/parseListMLSD.js:165).

### R2-UI-01 | P1 | The new focus trap moves password typing back into the username field

**Work package:** WP-08. **Earlier owner area:** Frontend / release.

**Earlier evidence boundary:** Browser reproduced and source-confirmed.

**Required correction:** Keep the Escape callback in a ref or stabilize it, and attach initial-focus/trap lifecycle only when the dialog actually opens. Add background inertness and proper stacked-dialog ownership.

**Closure criterion:** Type an entire username/password normally without focus moving unexpectedly; changing input state or delivering a live payload must not reset focus. Escape and focus restoration must still work.

**Earlier source anchors:** [NEW APP/src/lib/use-focus-trap.ts:46](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/use-focus-trap.ts:46); [NEW APP/src/platform/LanAuthOverlay.tsx:50](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/platform/LanAuthOverlay.tsx:50); [NEW APP/src/app/Shell.tsx:124](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/app/Shell.tsx:124).

### R2-DATA-02 | P2 | Concurrent requests for the same save can overwrite newer data with older data

**Work package:** WP-04. **Earlier owner area:** Frontend / release.

**Earlier evidence boundary:** Reproduced against current TypeScript in the audit harness.

**Required correction:** Reject older source revisions and sequence responses within a context, or serialize/coalesce duplicate requests. Identity checks alone do not establish freshness.

**Closure criterion:** Reverse same-save HTTP completion and interleave HTTP with newer WS revisions. The displayed source revision never decreases.

**Earlier source anchors:** [NEW APP/src/services/ws-client.ts:102](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/services/ws-client.ts:102); [NEW APP/src/services/ws-client.ts:118](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/services/ws-client.ts:118).

### R2-DATA-03 | P2 | An authoritative zero herd size still preserves nonzero cluster rows

**Work package:** WP-05 / WP-10. **Earlier owner area:** Frontend / release.

**Earlier evidence boundary:** Current-source harness.

**Required correction:** Distinguish missing/nonfinite totals from valid zero. A successful authoritative0 must produce an empty or zero-count result; coordinate with backend section-success semantics.

**Closure criterion:** For targets0,1,5 and larger values, emitted counts sum to the authoritative target before any explicit display cap. Missing totals must follow a different documented fallback.

**Earlier source anchors:** [NEW APP/src/lib/livestock-fanout.ts:90](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/livestock-fanout.ts:90); [NEW APP/src/lib/livestock-fanout.ts:140](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/livestock-fanout.ts:140).

### R2-DATA-04 | P2 | The display formatter still turns a zero-health synthetic animal into100%

**Work package:** WP-05. **Earlier owner area:** Frontend / release.

**Earlier evidence boundary:** Current-source fan-out-to-formatter harness and actual consumer references.

**Required correction:** Preserve finite zero in every presentation/alert helper and represent missing sample health separately from a measured zero. Test the rendered consumer, not only the producer.

**Closure criterion:** A synthetic zero-health row renders0% with the appropriate warning; a genuinely unknown reading is identified as unknown or explicitly estimated, never silently healthy.

**Earlier source anchors:** [NEW APP/src/lib/livestock-format.ts:59](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/livestock-format.ts:59); [NEW APP/src/sections/livestock/AnimalDetailsModal.tsx:150](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/sections/livestock/AnimalDetailsModal.tsx:150); [NEW APP/src/sections/livestock/LivestockPenPanel.tsx:432](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/sections/livestock/LivestockPenPanel.tsx:432).

### R2-MOD-02 | P2 | Population correction changes counts without reconciling the statistics they divide

**Work package:** WP-05 / WP-10. **Earlier owner area:** Mod / pipeline.

**Earlier evidence boundary:** Source and arithmetic counterexample; new regression in the count correction.

**Required correction:** Reconcile counts, weighted sums and categorical totals under one sampling/allocation contract, preserving sample means and disclosing estimates.

**Closure criterion:** Uniform-population samples preserve their averages after up/down correction. Every category total is between0 and the corresponding population, and all buckets reconcile to the authoritative total.

**Earlier source anchors:** [FS25_FarmDashboard_Mod/src/collectors/AnimalDataCollector.lua:96](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/AnimalDataCollector.lua:96); [FS25_FarmDashboard_Mod/src/collectors/AnimalDataCollector.lua:127](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/AnimalDataCollector.lua:127); [FS25_FarmDashboard_Mod/src/collectors/AnimalDataCollector.lua:693](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/AnimalDataCollector.lua:693).

### R2-MOD-03 | P2 | The cached finance path still falls back to purchase price instead of resale value

**Work package:** WP-10. **Earlier owner area:** Mod / pipeline.

**Earlier evidence boundary:** Producer/consumer field tracing.

**Required correction:** Export and consume a canonical resale-value field and one ownership scope across both finance paths; do not silently replace resale with purchase price.

**Closure criterion:** The same depreciated fleet and farm scope produces equivalent asset valuation with Courseplay enabled or disabled, including owned, leased and unknown-owner rows.

**Earlier source anchors:** [FS25_FarmDashboard_Mod/src/collectors/FinanceDataCollector.lua:59](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/FinanceDataCollector.lua:59); [FS25_FarmDashboard_Mod/src/collectors/VehicleDataCollector.lua:372](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/VehicleDataCollector.lua:372); [FS25_FarmDashboard_Mod/src/collectors/VehicleDataCollector.lua:749](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/VehicleDataCollector.lua:749).

### R2-MOD-04 | P2 | The remaining Courseplay shield still traverses the full fleet twice per update

**Work package:** WP-10. **Earlier owner area:** Mod / pipeline.

**Earlier evidence boundary:** Source-confirmed traversal complexity; no measured FPS result.

**Required correction:** Use a bounded change-driven queue or registration lifecycle and avoid rescanning unchanged vehicles on every update.

**Closure criterion:** Instrument examined vehicles across an unchanged fleet and newly loaded vehicles. Idle updates perform no recurring full scans while newly eligible vehicles still receive protection.

**Earlier source anchors:** [FS25_FarmDashboard_Mod/src/FarmDashboard.lua:183](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboard.lua:183); [FS25_FarmDashboard_Mod/src/FarmDashboardCourseplayCompat.lua:437](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardCourseplayCompat.lua:437); [FS25_FarmDashboard_Mod/src/FarmDashboardCourseplayCompat.lua:454](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardCourseplayCompat.lua:454); [FS25_FarmDashboard_Mod/src/FarmDashboardCourseplayCompat.lua:578](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardCourseplayCompat.lua:578).

### R2-MOD-05 | P2 | Runtime cadence changes do not update the adaptive scheduler's requested-value cache

**Work package:** WP-10. **Earlier owner area:** Mod / pipeline.

**Earlier evidence boundary:** Source-confirmed regression from the new shadow requested-value cache.

**Required correction:** Maintain one canonical requested cadence and update it through every local, synchronized, load and save entry point; keep effective/adaptive cadence separate.

**Closure criterion:** Increase and decrease cadence through local and synchronized settings, trigger adaptive probes and save/reload. The requested preference is never overwritten by an obsolete cached value.

**Earlier source anchors:** [FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua:993](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua:993); [FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua:1429](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua:1429); [FS25_FarmDashboard_Mod/src/FarmDashboardSettingsApi.lua:236](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardSettingsApi.lua:236); [FS25_FarmDashboard_Mod/src/FarmDashboardSettingsApi.lua:169](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardSettingsApi.lua:169).

### R2-MOD-06 | P2 | Coroutine and legacy collector failures still look like successful fresh collection

**Work package:** WP-10. **Earlier owner area:** Mod / pipeline.

**Earlier evidence boundary:** Scheduler-to-collector failure-path source tracing.

**Required correction:** Propagate explicit success, failure, generation and last-success time through every collection mode. Keep stale fallback data with an honest status instead of converting failure to empty success.

**Closure criterion:** Inject a failure into each supported collector mode. Failed sections are marked failed/stale; successful emptiness still clears old data and does not trigger failure fallback.

**Earlier source anchors:** [FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua:2730](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua:2730); [FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua:3043](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua:3043); [FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua:3596](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua:3596); [FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua:701](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua:701); [FS25_FarmDashboard_Mod/src/collectors/EconomyDataCollector.lua:77](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/EconomyDataCollector.lua:77); [FS25_FarmDashboard_Mod/src/collectors/ProductionDataCollector.lua:163](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/ProductionDataCollector.lua:163).

### R2-MOD-07 | P2 | Station-name guesses still generate unverified selling offers

**Work package:** WP-10. **Earlier owner area:** Mod / pipeline.

**Earlier evidence boundary:** Current source.

**Required correction:** Read product acceptance and prices from real station data. If estimates are retained, place them in a clearly separate non-actionable estimate model.

**Closure criterion:** A wheat-only mill never receives a soybean offer through name matching. Every actionable destination/product/price pair corresponds to an actual station offer.

**Earlier source anchors:** [FS25_FarmDashboard_Mod/src/collectors/EconomyDataCollector.lua:791](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/EconomyDataCollector.lua:791); [FS25_FarmDashboard_Mod/src/collectors/EconomyDataCollector.lua:838](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/EconomyDataCollector.lua:838); [FS25_FarmDashboard_Mod/src/collectors/EconomyDataCollector.lua:845](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/EconomyDataCollector.lua:845); [FS25_FarmDashboard_Mod/src/collectors/EconomyDataCollector.lua:889](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/EconomyDataCollector.lua:889).

### R2-MOD-08 | P2 | Bale scanning charges accepted entries rather than all traversal work

**Work package:** WP-10. **Earlier owner area:** Mod / pipeline.

**Earlier evidence boundary:** Source-confirmed algorithmic bottleneck; no frame benchmark.

**Required correction:** Retain mutation-safe enumeration state across slices and charge every examined entry, independently of whether it becomes an exported bale.

**Closure criterion:** Instrument examined entries on large eligible/ineligible tables. Every slice stays within its work budget and final output is complete and deduplicated.

**Earlier source anchors:** [FS25_FarmDashboard_Mod/src/InventoryScan.lua:1059](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/InventoryScan.lua:1059); [FS25_FarmDashboard_Mod/src/InventoryScan.lua:1072](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/InventoryScan.lua:1072); [FS25_FarmDashboard_Mod/src/InventoryScan.lua:1085](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/InventoryScan.lua:1085); [FS25_FarmDashboard_Mod/src/InventoryScan.lua:1102](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/InventoryScan.lua:1102).

### R2-PERF-01 | P2 | Pollers still overlap and stale work can overwrite replacement server state

**Work package:** WP-09. **Earlier owner area:** Security / backend.

**Earlier evidence boundary:** Synthetic concurrent coordinator and delayed XML completion fixtures.

**Required correction:** Serialize/coalesce per-server work; use configuration generations and cancellation; dispose every timer; validate identity after awaits and before filesystem commits or state mutation.

**Closure criterion:** Slow cycles never overlap. Old completions cannot mutate replacement state. Repeated watcher failures leave exactly one live scheduler and no orphan debounce.

**Earlier source anchors:** [FS25_FarmDashboard_App/main.js:3098](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:3098); [FS25_FarmDashboard_App/main.js:2688](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:2688); [FS25_FarmDashboard_App/main.js:3128](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:3128); [FS25_FarmDashboard_App/main.js:2762](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:2762); [FS25_FarmDashboard_App/main.js:2772](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:2772).

### R2-PERF-02 | P2 | An active HTTP response can outlive the advertised total deadline

**Work package:** WP-09. **Earlier owner area:** Security / backend.

**Earlier evidence boundary:** Synthetic clock/trickle and aborted-response fixtures.

**Required correction:** Use an independent total-deadline timer; destroy outstanding requests/responses on settlement; handle response failures and propagate cancellation across redirects.

**Closure criterion:** Trickle, stalled, aborted and truncated fixtures terminate within the total deadline. Valid bounded redirects and normal responses still succeed.

**Earlier source anchors:** [FS25_FarmDashboard_App/httpFeedXml.js:84](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/httpFeedXml.js:84); [FS25_FarmDashboard_App/httpFeedXml.js:102](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/httpFeedXml.js:102); [FS25_FarmDashboard_App/httpFeedXml.js:130](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/httpFeedXml.js:130); [FS25_FarmDashboard_App/main.js:2670](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:2670).

### R2-PIPE-01 | P2 | Detail caches can still remain stale when indexes or clocks are unreliable

**Work package:** WP-09. **Earlier owner area:** Security / backend.

**Earlier evidence boundary:** Synthetic metadata and repeated missing-index cache fixtures.

**Required correction:** Persist remote generation/mtime/hash independently of local file time, add bounded fallback refresh without an index and define per-pen versus bulk precedence.

**Closure criterion:** Equal-length changes are visible; missing-index data refreshes within a documented interval; source/client clock offsets do not prevent updates.

**Earlier source anchors:** [FS25_FarmDashboard_App/main.js:2949](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:2949); [FS25_FarmDashboard_App/livestockDetail.js:594](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/livestockDetail.js:594).

### R2-PIPE-02 | P2 | Unstamped exports regain freshness on restart and omit some generation changes

**Work package:** WP-10. **Earlier owner area:** Security / backend.

**Earlier evidence boundary:** Synthetic repeated-retrieval, reset-state and weather-only fixtures.

**Required correction:** Persist source-generation identity and age and distinguish collection time from receipt. Align exporter field/type and backend parsing, with an explicit fallback contract for older exports.

**Closure criterion:** Restart/retrieval preserves the age of identical unstamped exports. A genuinely new source generation restores freshness even when ordinary farm values do not change.

**Earlier source anchors:** [FS25_FarmDashboard_App/main.js:2460](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:2460); [FS25_FarmDashboard_App/main.js:2072](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:2072); [FS25_FarmDashboard_App/main.js:2198](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:2198).

### R2-PIPE-03 | P2 | Hold and last-good helpers can resurrect cleared animals, stock and RF data

**Work package:** WP-05 / WP-10. **Earlier owner area:** Mod / pipeline.

**Earlier evidence boundary:** Actual current hold/persistence helper fixtures; main persistence ordering not independently reverified.

**Required correction:** Carry explicit successful-empty/disabled versus failed/omitted section status and generation through merge, hold, backups and persistence. Clear every corresponding backup on an authoritative clear.

**Closure criterion:** Exercise populated-to-empty animals and stock, RF disable, persistence and restart end-to-end. Successful emptiness remains empty; a genuine collection failure retains only clearly stale fallback data.

**Earlier source anchors:** [FS25_FarmDashboard_App/mergedSnapshotHold.js:458](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/mergedSnapshotHold.js:458); [FS25_FarmDashboard_App/mergedSnapshotHold.js:466](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/mergedSnapshotHold.js:466); [FS25_FarmDashboard_App/mergedSnapshotHold.js:615](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/mergedSnapshotHold.js:615); [FS25_FarmDashboard_App/mergedSnapshotHold.js:645](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/mergedSnapshotHold.js:645); [FS25_FarmDashboard_App/mergedSnapshotHold.js:688](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/mergedSnapshotHold.js:688); [FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua:3889](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua:3889).

### R2-PIPE-04 | P2 | Detail generation is dropped before comparison and stale animals attach to zero-count pens

**Work package:** WP-05 / WP-10. **Earlier owner area:** Mod / pipeline.

**Earlier evidence boundary:** Actual current helper fixtures.

**Required correction:** Preserve and validate detail generation plus world/pen identity. Invalidate incompatible individuals on authoritative zero and handle successful empty detail explicitly.

**Closure criterion:** Both enumeration orders select the newest compatible generation. A zero pen has no stale individuals, and genuine empty detail is a valid result rather than a reason to resurrect older rows.

**Earlier source anchors:** [FS25_FarmDashboard_App/detailAnimalsHydrate.js:65](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/detailAnimalsHydrate.js:65); [FS25_FarmDashboard_App/detailAnimalsHydrate.js:106](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/detailAnimalsHydrate.js:106); [FS25_FarmDashboard_App/detailAnimalsHydrate.js:151](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/detailAnimalsHydrate.js:151); [FS25_FarmDashboard_App/detailAnimalsHydrate.js:233](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/detailAnimalsHydrate.js:233).

### R2-PIPE-05 | P2 | Unresolved vehicle ownership is still inferred from unrelated farm characteristics

**Work package:** WP-07 / WP-10. **Earlier owner area:** Mod / pipeline.

**Earlier evidence boundary:** Current source heuristic; no real-cache reproduction in this run.

**Required correction:** Require authoritative identity/ownership matches or retain an explicit unresolved pool. Do not convert a heuristic ranking into exact ownership.

**Closure criterion:** For ambiguous records, changing livestock, field or fleet counts does not change ownership. Only authoritative matching evidence assigns an owner.

**Earlier source anchors:** [FS25_FarmDashboard_App/dataMerger.js:2126](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/dataMerger.js:2126); [FS25_FarmDashboard_App/dataMerger.js:2140](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/dataMerger.js:2140); [FS25_FarmDashboard_App/dataMerger.js:2163](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/dataMerger.js:2163); [FS25_FarmDashboard_App/dataMerger.js:2206](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/dataMerger.js:2206).

### R2-PIPE-06 | P2 | Configuration and UID indexes can reuse the same saved vehicle for two live records

**Work package:** WP-10. **Earlier owner area:** Mod / pipeline.

**Earlier evidence boundary:** Actual current merger fixture.

**Required correction:** Use a global consumed-record set checked by every matching index, with one canonical identity for each saved record.

**Closure criterion:** Mixed configuration/UID matches in either order remain one-to-one. A consumed saved record can never enrich a second live vehicle.

**Earlier source anchors:** [FS25_FarmDashboard_App/dataMerger.js:2269](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/dataMerger.js:2269); [FS25_FarmDashboard_App/dataMerger.js:2272](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/dataMerger.js:2272); [FS25_FarmDashboard_App/dataMerger.js:2316](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/dataMerger.js:2316).

### R2-PIPE-07 | P2 | Saved ownership still wins and field/farmland ID collisions drop live-only fields

**Work package:** WP-10. **Earlier owner area:** Mod / pipeline.

**Earlier evidence boundary:** Actual merger fixtures for field cases; source trace for vehicle owner0.

**Required correction:** Preserve authoritative live ownership including valid zero and use typed canonical field/farmland identities. Distinguish absence from explicit unowned state.

**Closure criterion:** Test transfer, relinquishment, added fields and overlapping field/farmland numbers. Live ownership and all distinct valid fields survive merging.

**Earlier source anchors:** [FS25_FarmDashboard_App/dataMerger.js:1666](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/dataMerger.js:1666); [FS25_FarmDashboard_App/dataMerger.js:1725](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/dataMerger.js:1725); [FS25_FarmDashboard_App/dataMerger.js:1734](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/dataMerger.js:1734); [FS25_FarmDashboard_App/dataMerger.js:2031](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/dataMerger.js:2031).

### R2-PIPE-08 | P2 | Aggregate XML fingerprints still collide for masked optional-file changes

**Work package:** WP-10. **Earlier owner area:** Mod / pipeline.

**Earlier evidence boundary:** Source-established fingerprint collision; no filesystem harness or caller revalidation.

**Required correction:** Fingerprint each input's name, existence and metadata or content, rather than only aggregate maxima and sums.

**Closure criterion:** Same-size optional rewrites with preserved/masked timestamps and optional-file creation/deletion produce a changed fingerprint; unchanged inputs remain stable.

**Earlier source anchors:** [FS25_FarmDashboard_App/xmlCollector.js:1159](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/xmlCollector.js:1159); [FS25_FarmDashboard_App/xmlCollector.js:1163](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/xmlCollector.js:1163).

### R2-REL-01 | P2 | The Lua syntax check cannot start after the dependency refresh

**Work package:** WP-11. **Earlier owner area:** Frontend / release.

**Earlier evidence boundary:** Executed command failure.

**Required correction:** Declare/pin the checker dependency in the owning tooling package, handle the BOM policy explicitly and wire the mod syntax check into CI. Do not mistake tool startup failure for a game syntax failure.

**Closure criterion:** A clean dependency install can run the checker over all shipped Lua files and reports real parse results; the gate fails CI on a deliberate syntax fixture.

**Earlier source anchors:** [tools/check-lua-syntax.mjs:15](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/tools/check-lua-syntax.mjs:15); [FS25_FarmDashboard_App/package.json](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/package.json).

### R2-REL-02 | P2 | The ownership integration test returns successfully when its expected result is absent

**Work package:** WP-11. **Earlier owner area:** Mod / pipeline.

**Earlier evidence boundary:** Current test source plus observed Jest skip warning.

**Required correction:** Use hermetic committed fixtures, exact owner assertions and assertion-count enforcement. Make unavoidable environment-dependent skips explicit before execution, never contingent on the expected result being missing.

**Closure criterion:** Deliberately break remapping or expected ownership and this test fails. Missing optional live prerequisites are reported as skipped, while the hermetic equivalent always executes.

**Earlier source anchors:** [FS25_FarmDashboard_App/tests/mergeTransientPool.integration.test.js:157](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/tests/mergeTransientPool.integration.test.js:157); [FS25_FarmDashboard_App/tests/mergeTransientPool.integration.test.js:164](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/tests/mergeTransientPool.integration.test.js:164).

### R2-SEC-03 | P2 | Raw map identifiers still select overview images outside the source root

**Work package:** WP-09. **Earlier owner area:** Security / backend.

**Earlier evidence boundary:** Resolver fixture with a mocked outside-image copy.

**Required correction:** Validate the raw lookup key and enforce source-root containment before opening or copying files, independently of output filename normalization.

**Closure criterion:** Outside overview fixtures cannot be selected or returned; legitimate custom map exports still resolve.

**Earlier source anchors:** [FS25_FarmDashboard_App/mapOverviewResolver.js:249](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/mapOverviewResolver.js:249); [FS25_FarmDashboard_App/mapOverviewResolver.js:260](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/mapOverviewResolver.js:260); [FS25_FarmDashboard_App/mapOverviewResolver.js:609](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/mapOverviewResolver.js:609); [FS25_FarmDashboard_App/main.js:1066](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:1066).

### R2-SEC-04 | P2 | Transport-only saves can leave the live poller on plaintext FTP

**Work package:** WP-09. **Earlier owner area:** Security / backend.

**Earlier evidence boundary:** Configuration signature fixtures and actual transfer call paths; no TLS handshake test.

**Required correction:** Include every connection-policy field in lifecycle decisions or resolve current configuration each cycle. Make legacy plaintext an explicit informed choice, without silent downgrade.

**Closure criterion:** A transport-only save changes the next operation on every FTP path. Invalid certificates fail closed. UI status reflects the active transport and any explicit legacy choice.

**Earlier source anchors:** [FS25_FarmDashboard_App/ftpAccess.cjs:4](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/ftpAccess.cjs:4); [FS25_FarmDashboard_App/setupConfigMerge.cjs:52](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/setupConfigMerge.cjs:52); [FS25_FarmDashboard_App/main.js:3090](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:3090); [FS25_FarmDashboard_App/main.js:2516](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:2516); [FS25_FarmDashboard_App/livestockDetail.js:418](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/livestockDetail.js:418).

### R2-UX-01 | P2 | HTTP discovery errors are treated as a successful empty server list

**Work package:** WP-04. **Earlier owner area:** Frontend / release.

**Earlier evidence boundary:** Current-source harness and integrated call-path review.

**Required correction:** Throw a structured status-aware discovery error, distinguish genuine zero configurations from failed discovery and let the complete startup retry restore the server list.

**Closure criterion:** First discovery returns503, then200 with saves. The UI recovers the save selector without reloading;401 triggers authentication rather than an empty configuration.

**Earlier source anchors:** [NEW APP/src/services/api-client.ts:37](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/services/api-client.ts:37); [NEW APP/src/services/ws-client.ts:224](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/services/ws-client.ts:224); [NEW APP/src/main.tsx:33](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/main.tsx:33).

### R2-UX-02 | P2 | Failed settings hydration still enables saving unloaded defaults

**Work package:** WP-08. **Earlier owner area:** Frontend / release.

**Earlier evidence boundary:** Source-confirmed failure and save order.

**Required correction:** Track successful hydration per editable section, block writes to unknown values, validate before any commit and report explicit per-section partial outcomes. Keep drafts and a retry path.

**Closure criterion:** Fail each load stage and ensure unloaded sections cannot be persisted. Fail each save stage and display exact committed/failed sections without a generic saved/synced claim.

**Earlier source anchors:** [NEW APP/src/settings/SettingsModal.tsx:185](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/settings/SettingsModal.tsx:185); [NEW APP/src/settings/SettingsModal.tsx:293](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/settings/SettingsModal.tsx:293); [NEW APP/src/settings/SettingsModal.tsx:322](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/settings/SettingsModal.tsx:322); [NEW APP/src/settings/SettingsModal.tsx:342](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/settings/SettingsModal.tsx:342); [NEW APP/src/settings/SettingsModal.tsx:385](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/settings/SettingsModal.tsx:385).

### R2-UX-03 | P2 | Authentication still proceeds on timeout and clears valid credentials on network failure

**Work package:** WP-08. **Earlier owner area:** Frontend / release.

**Earlier evidence boundary:** Current source; isolated browser confirms protected work can start behind login after the timer.

**Required correction:** Use one persistent authentication state and in-flight verification promise, explicit deadlines and separate rejected/network states. Only successful authorization releases protected startup, and transport failure must not erase valid credentials.

**Closure criterion:** Cover early completion, >30s login, hung network,401, temporary outage and double-submit. No protected bootstrap occurs before authorization and saved credentials survive transport errors.

**Earlier source anchors:** [NEW APP/src/services/lan-auth.ts:110](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/services/lan-auth.ts:110); [NEW APP/src/services/lan-auth.ts:169](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/services/lan-auth.ts:169); [NEW APP/src/platform/LanAuthOverlay.tsx:76](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/platform/LanAuthOverlay.tsx:76); [NEW APP/src/platform/LanAuthOverlay.tsx:113](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/platform/LanAuthOverlay.tsx:113).

### R2-UX-04 | P2 | SimHub waits for authentication before mounting the component that performs it

**Work package:** WP-08. **Earlier owner area:** Frontend / release.

**Earlier evidence boundary:** Source-confirmed circular startup and browser-observed early/late states.

**Required correction:** Mount the auth/bootstrap boundary independently of readiness, release data loading on successful authentication and handle status before parsing response bodies.

**Closure criterion:** A direct unauthenticated SimHub URL shows login immediately; cached authorization verifies without the artificial30s delay;401/403/503/non-JSON responses have clear recoverable states.

**Earlier source anchors:** [NEW APP/src/simhub/main.tsx:65](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/simhub/main.tsx:65); [NEW APP/src/simhub/main.tsx:81](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/simhub/main.tsx:81); [NEW APP/src/simhub/main.tsx:150](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/simhub/main.tsx:150); [NEW APP/src/simhub/main.tsx:162](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/simhub/main.tsx:162).

### R2-UX-05 | P2 | A missing Windows save path is still described as rejected credentials

**Work package:** WP-08. **Earlier owner area:** Frontend / release.

**Earlier evidence boundary:** Reproduced in the current-source audit harness.

**Required correction:** Preserve explicit error codes and classify OS error identifiers before incidental message words or path text. Keep fallback text matching narrow.

**Closure criterion:** ENOENT/ENOTDIR paths under C:\Users map to path errors;EACCES maps to permissions;real401/403/auth rejection remains authentication-specific.

**Earlier source anchors:** [NEW APP/src/lib/ux-classify.ts:88](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/ux-classify.ts:88); [NEW APP/src/lib/ux-classify.ts:96](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/ux-classify.ts:96); [NEW APP/src/lib/ux-classify.ts:102](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/ux-classify.ts:102).

### R2-BACK-01 | P3 | Early image-export failures ignore native-dialog suppression

**Work package:** WP-08 / WP-11. **Earlier owner area:** Security / backend.

**Earlier evidence boundary:** Missing-script fixture with mocked native dialog.

**Required correction:** Route every early and late failure through one presentation policy and return structured errors to the requesting UI.

**Closure criterion:** All early failures honor suppressNative:true and return the expected structured error without native dialogs.

**Earlier source anchors:** [FS25_FarmDashboard_App/main.js:374](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:374); [FS25_FarmDashboard_App/main.js:377](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:377); [FS25_FarmDashboard_App/main.js:388](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:388).

## Appendix B. Conditional risks that must stay qualified

### C1 | Proxy and Host trust still require an explicit deployment policy

Setup rejects an unrecognized public Host, but general API authorization still trusts loopback independently of Host. A reverse proxy that rewrites Host to localhost can inherit local/setup trust.

**Not established:** No public proxy deployment or DNS-rebinding exploit was established.

**Planned resolution:** Define trusted-proxy behavior and require appropriate authentication beyond network locality. Exercise preserved and rewritten Host cases before exposing the service.

**Earlier anchors:** [FS25_FarmDashboard_App/main.js:915](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:915); [FS25_FarmDashboard_App/main.js:814](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:814).

### C2 | Navigation allowlists and privileged IPC are not yet tied to exact trusted documents

Navigation/window guards now exist, but allow arbitrary file: URLs and accept default-port localhost URLs through u.port || PORT. Privileged IPC handlers still omit sender/frame validation. A fixture accepted an outside file document and localhost:80 while rejecting external HTTPS.

**Not established:** No hostile-document navigation path or renderer exploit was established.

**Planned resolution:** Match exact schemes, effective ports and packaged file paths; validate sender/frame identity for privileged IPC.

**Earlier anchors:** [FS25_FarmDashboard_App/main.js:3477](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:3477); [FS25_FarmDashboard_App/main.js:3532](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:3532); [FS25_FarmDashboard_App/main.js:3605](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:3605).

### C3 | Field fallback collection modes still contain unbounded synchronous scans

MOD-14's default coroutine and bale prepass now yield. Fallback, _smState and legacy branches still disable or bypass yielding before scanning the world.

**Not established:** Practical reachability of these fallback modes in the current supported game configuration was not established. No universal frame-stall claim is made.

**Planned resolution:** Bound every supported mode or explicitly reject unsupported incremental modes. Document mode selection and instrument per-invocation work.

**Earlier anchors:** [FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua:651](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua:651); [FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua:724](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua:724); [FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua:749](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua:749).

### C4 | Freshness-gated cycle tails may delay request polling during persistent collector failure

The examined cycle tail is freshness-gated and contains request polling and detail rotation. A permanently failing collector could prevent that particular tail from running.

**Not established:** Alternative servicing paths were not fully excluded, so end-to-end request starvation is not established and is not included in confirmed finding counts.

**Planned resolution:** Trace every request-servicing path and inject sustained section failure. Servicing should have an independent bounded cadence if this is the only path.

**Earlier anchors:** [FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua:2754](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua:2754); [FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua:2786](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua:2786); [FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua:2789](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua:2789).

## Appendix C. Implementation handoff rules

- Start with the next dependency-ready work package, not a broad rewrite.
- Record exactly which files will change and preserve unrelated edits.
- Add the failure fixture alongside the correction so the test proves the former bug.
- Do not edit generated ui-v2 assets independently of NEW APP source; regenerate through the build.
- Keep source fix, schema/contract change, installer migration and public publication as separately reviewable decisions.
- A successful command is not a passing acceptance case unless the command asserted the relevant behavior.
- Never use the user's active game save or real profile for destructive negative tests.
- Update the evidence register as execution proceeds. Do not rewrite this plan's historical observations to imply they were always passing.

End of execution plan.

