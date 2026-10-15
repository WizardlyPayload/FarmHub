# Farm Dashboard V5: complete compatibility recovery and delivery build order

**Owner:** Ash for implementation and technical evidence; Graham for the later in-game showcase preparation and final product acceptance.

**Date:** 23 September 2026. **Status:** Implementation brief only. No implementation, build, test, save edit or release is performed by this document.

**Authoritative purpose:** one ordered handoff that consolidates the compatibility recovery audit, the mod-vault/demo assessment and the two additional regression-test gaps. This document does not claim a fresh complete source audit or a successful installed test.

## 1. Start here: the instruction to Ash

Implement the ordered phases B00-B16 below. Resolve the actual failing producer, parser, merge, scope or UI contract rather than masking missing values. Preserve working W01/W02 changes already made, all documented working features, the V5-only release boundary, canonical mod identity and the existing installer output location. Build one coherent candidate only after the relevant source gates pass. Demonstrate it works as an installed application before asking Graham to spend time populating demo saves. Then use his populated saves to complete honest showcase acceptance.

Do not reply that everything is finished when only startup, source edits or isolated tests are complete. Each phase ends with a specific deliverable and pass criteria. Keep an evidence ledger, carry an unresolved failure to its owning phase, and resume from that point rather than repeating uninstalls or wiping data. Do not add dependencies between unrelated optional mods or mutate a companion to make our reader work.

This is the complete intended scope, not permission to silently ship a smaller implementation. Higher-value adapters are intentionally ordered first. A later recommendation can be deferred only as an explicit scope decision by Graham, and it must disappear from any unsupported live-feature claim. Genuine upstream limitations remain documented limits, not fabricated support.

### Two different finish lines

1. **Demo-preparation ready (G7):** the exact installed V5 app/mod candidate passes fresh setup, uninstall/reinstall, upgrade, core data, settings and relevant live acceptance. Graham can now prepare the four saves using the separate guide.
2. **Release ready (G9):** required implementation and combination evidence, meaningful demo captures, sanitized website behavior, accurate compatibility claims and final artifact identity are all accepted. This is not established by this plan and is not implied by G7.
### Current handoff reconciliation

- Ash reports W00/W01 work on mission-start subscription, single update ownership, visible diagnostics-off errors/first update, hasLoaded teardown reset and readiness clock handling. Treat these as existing changes to inspect and preserve where correct, not instructions to redo them indiscriminately.
- Ash reports the W02 exact settings-parser collision fixed in source and tests passing, plus display-only save changes. He explicitly says those app changes are not present in the running V5 application until it is rebuilt.
- Ash explicitly says W03-W10 remain unfinished. His statement is a partial progress report, not release sign-off.
- This follow-up inspected parser/field test files. The collision fixture exists; malformed-existing XML still has a template-fallback expectation; field extraction tests copy helpers rather than importing the production collector.
- The changed Lua implementation, reported passing test run and repaired installed behavior were not independently verified in that follow-up. The earlier empty export and source findings remain historical evidence, not fresh assertions about every edited line.
- Startup logs and a growing data.json are not sufficient evidence. Require correctly scoped completed generations and successful lifecycle transitions.
### Reference documents and navigation

- [Graham's save-by-save preparation and acceptance guide](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/V5-DEMO-SAVE-PREPARATION-AND-ACCEPTANCE-2026-09-23.md)
- [Original F01-F12 audit and W00-W10 engineering detail](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/COMPATIBILITY-RECOVERY-PLAN-2026-09-23.md)
- [Original vault, conflicts and demo findings](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/MOD-VAULT-COMPATIBILITY-AND-DEMO-STRATEGY-2026-09-23.md)
- [Captured vault inventory and source metadata](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/MOD-VAULT-INVENTORY-2026-09-23.json)
- Sections 2-4: scope, architecture, ownership and build order. Sections 5-7: adapters, catalog corrections and conflicts. Sections 8-11: validation, packaging, demos and security. Sections 12-15: gates, rollback, finding closure and final handoff.

## 2. Non-negotiable boundaries and working behavior

- V5 is the release lane. Do not build/publish V4, overwrite the public classic update story, or use the classic build command as a shortcut.
- Keep one canonical FS25_FarmDashboard.zip name and the existing agreed installer output location. Put candidate identity inside manifests/version metadata, not new mod basenames or a growing collection of installer folders.
- Do not wipe saves, modSettings, desktop settings, offline snapshots or unrelated mods to conceal the failure. Preserve evidence and use disposable copies for destructive transitions.
- Keep the existing mission-clock grace correction, spawn protection, field/weather prioritisation, real-time ingestion-generation/server guards, and explicit RF-versus-PF rendering separation unless a focused regression proves they are wrong.
- Keep working fleet/vehicle, animal, production, stock/bale, map-image conversion, mileage, save selection and offline functionality. Unknown is not zero, disabled is not stale-active, and historical is not live.
- Do not force all core/RF collectors on to compensate for a parser bug. Explicit user settings, active-mod state and successfully empty sections are meaningful.
- Read third-party mod sources but do not change companion mods, the NAS vault or the Realistic-Farming upstream project for this repair.
- Diagnostic logs must be bounded and redact server passwords, tokens, private addresses where unnecessary, and configuration secrets. Do not weaken IPC, local path validation, authentication or transport security to make data appear.
- Base dashboard plus no companions must work. Native fields, animals, storage, fleet and production must not require Livestock Monitor, Production Watcher, RF, PF, a particular map or another dashboard.
- Each optional adapter has one canonical mod ID, supported version/capability, genuine dependency list, deployment modes, scope and verified read surface. Vault download filenames with numeric prefixes are not canonical runtime mod IDs.
- Activity is mission-loaded state, not installed ZIP inventory. Cache discovery per mission; do not scan 665 archives from the frame update.
- Absence, inactive, starting, unsupported version, missing prerequisite, failed, complete empty and stale are distinct states. None may silently become healthy zero/allowed.
- Use an independent error boundary per adapter. Failure of one optional integration cannot disable all companion output or the base exporter.
- Use the companion's owning Lua namespace or documented mission API, not guessed globals. Avoid invoking gameplay actions, money changes or setters to collect data.
- Never use current-player UI helpers as universal dedicated-server APIs. Scope data explicitly by farm and use server-authoritative state where required.
- Normalise each metric once with source, units, farm/entity identity and timestamp. Core totals must not double-count mod aggregates or double-apply price, quantity or production multipliers.
- Two mods contributing different capabilities can coexist. Two providers claiming the same authoritative value need an explicit ownership/composition policy grounded in their actual game behaviour.
- True upstream dependencies and conflicts remain visible, versioned edges. Do not create a global Pack A/Pack B or RF/PF gate for unrelated mods.
- Do not make use of a companion mod a condition for purchasing or running the dashboard. Optional integrations enrich native views and fail gracefully.
- Keep reading gameplay state separate from public demo publication. Publish an allowlisted, sanitised projection, never the raw mod folder or game configuration.
- Preserve coherent V5 builds, the canonical FS25_FarmDashboard.zip name and the public V4 boundary. No new installer folders or renamed mod identities are needed for this work.

### Scope of the evidence

The vault review inventoried 665 ZIPs, read 651 descriptors and inspected selected Lua in 70 packages plus six installed RF packages. Twelve packages were editor/prefab-style without a modDesc; two archives could not be read by the selected ZIP reader. This is broad source-based screening, not a claim to have executed every mod, read every line, or proved every combination. Preserve this distinction in the support matrix.

The four saved-career observations were captured earlier from slots 4, 3, 19 and 18. Existing demo content can change. Treat counts and versions below as preparation leads and verify the chosen working copy when implementing/testing. Public V4 history and older installed evidence are not authority for a new V5 candidate.

No unrelated Electron upgrade, signing purchase, infrastructure migration, NAS restructuring or redesign of working image conversion is a prerequisite for this repair brief. Preserve existing decisions and test actual behavior. Do not promise that signing warnings are eliminated by an unsigned rebuild.

## 3. Architecture, ownership and shared contracts

### The path to repair

`FS25 mission lifecycle -> active registry -> independent native/companion collectors -> completed export -> desktop ingestion/XML fallback -> merge/retention/provenance -> normalized store/selectors -> field/core/companion UI -> sanitized recorded-demo projection`

Repair the earliest contract that loses or invents a value, then test downstream delivery. Do not hard-code observed totals, force collectors on, default unavailable readings to healthy values, or keep old data indefinitely to hide a failure. Keep business logic in existing pure helpers/selectors and the UI thin.

### Ownership rules

- Follow the current [NEW APP agent ownership rules](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/AGENTS.md) and [parity checklist](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/PARITY.md). Historical development port/default-UI notes there must be reconciled with the actual current instance.
- The foundation owner coordinates shared types/store/services and localization. Field, fleet, livestock, production, economy and setup owners work through their established boundaries.
- Ash may implement the authorized repair, but must not overwrite simultaneous work in shared files. One owner prepares shared contracts before dependent feature branches or edits proceed.
- Prefer existing helpers and modules. If a new adapter registry, schema fixture, sanitizer or demo loader file is needed, name it explicitly in the phase handoff before editing. Do not manufacture a second framework when an existing abstraction fits.
- The file lists in each phase identify known entry points. Directory references mean select the smallest actual owning file after tracing the defect, not rewrite every file in that directory.
- Source line references in the finding appendix are from the audit snapshot. Locate the named function in the current changed file before editing; line numbers can move.

### Identity is a tuple, not a slot

All live cache keys and asynchronous writes are scoped to configured source + stable save/map identity + session/generation as applicable. Stable save identity must be derived from verified existing metadata or explicitly persisted within the dashboard-owned area; do not mutate the game save format to invent a GUID. A replaced save using the same slot is a different career. Historical same-save snapshots may remain available separately but cannot silently count as current-session results.

### Detection is not a successful read

Keep active membership, supported capability, read outcome and freshness separate. Suggested read outcomes are pending, complete, partial, failed and disabled. A successful read can contain an empty array or zero; a failed read can carry optional explicitly historical lastSuccess. Unavailable is a reasoned capability/read state, never a made-up measurement.

### Completeness has a scope

An adapter must declare which farms/entities it actually enumerated. Full farm coverage with no rows can support a zero result; absent coverage cannot. A truncated scan is partial with a reason/count, not a smaller complete farm. Client-local knowledge must not imply server-global completeness.

### Unknown is not zero

Normalize missing and nonfinite source values before formatting. Preserve legitimate zero and false. Do not use numeric truthiness to choose a farm fallback. A field can have target data without current data; scan availability and telemetry failure are distinct. Do not relabel unavailable values as not required unless the provider explicitly establishes that conclusion.

### A successful empty replaces data

Live apply, backup merge, persistence and restore use one transition policy. Complete empty and disabled invalidate current-section retained content. Pending/partial/failed can retain only identity-compatible previous samples with explicit last-known labels. No later helper may revive rows removed by a successful empty read.

### Freshness belongs to the sampled section

Store attempted time, successful sample time and export commit time separately where needed. A heartbeat or newly serialized generation does not make held data current. Server transport connectivity is displayed independently of game-data freshness. Maintain the original sample timestamp across app restart and public recorded-demo display.

### One owner per effective metric

Identify the actual active owner of a final measurement or explain documented composition. Keep base prices, effective prices, predicted revenue and realized revenue distinct. Do not sum silo compartments again with their existing native aggregate; do not apply seasonal/quality/speed multipliers twice. Read-only overlays may coexist even if two writers of the same game value require configuration constraints.

### Canonical arithmetic; shared presentation

Keep existing canonical quantity units in data, totals and persistence. One shared formatter converts for display using verified fill-type/provider metadata. Rounding is presentation only. Game matching is assessed using the same source time and appropriate provider/display precision, not arbitrary exact equality between differently rounded asynchronous views.

### Compatibility is feature-level

Each adapter specifies runtime identity, version/capability probe, dependencies, optional bridges, mode, authority, scope and reader. A true upstream dependency constrains only that adapter. Presence of PF must not hide unrelated RF/finance/livestock capabilities; actual provider disablement governs the affected soil metric.

### Security is not a front-end toggle

Private desktop/LAN/server paths retain authorization and path restrictions. Public recorded demos consume a separate allowlisted projection and read-only data source. Host settings and source selection remain unreachable from public visitors even if a hidden UI control or crafted request is attempted.

### Illustrative additive payload contract

The following is a design example, not an existing API or a literal version to paste into production. Adapt names to the existing contract, agree them with the foundation owner, and supply real supported identifiers/timestamps. It demonstrates complete-empty fields alongside a failed adapter with explicitly older last-success data.

```json
{
  "schemaVersion": "next-supported-schema-version (proposal, not a literal release value)",
  "identity": {
    "sourceId": "configured-source-id",
    "saveId": "stable-save-identity",
    "mapId": "stable-map-identity",
    "sessionId": "new-token-per-mission"
  },
  "generation": 42,
  "committedAt": "original-commit-time",
  "sections": {
    "fields": {
      "outcome": "complete",
      "coverage": {
        "kind": "full",
        "farmIds": [
          1
        ]
      },
      "sampledAt": "original-sample-time",
      "provider": "verified-provider-id",
      "items": []
    }
  },
  "companions": {
    "canonical-runtime-mod-name": {
      "active": true,
      "capability": "supported",
      "readState": "failed",
      "reasonCode": "reader_failed",
      "attemptedAt": "attempt-time",
      "lastSuccess": {
        "generation": 41,
        "sampledAt": "older-sample-time",
        "scope": {
          "kind": "farm",
          "farmId": 1
        },
        "data": {
          "example": "retained only as labelled last-known"
        }
      }
    }
  }
}
```

For soil, define current and target as separate optional measurements with units/provider/availability. Serialize absence consistently with the existing Lua JSON writer. Do not rely on JavaScript truthiness, Lua nil handling or a formatter to invent whether a measurement exists.

### Required transition rules

1. Same identity + complete section: replace prior current data even when zero/empty. Persist that fact.
2. Same identity + partial/pending/failed section: retain only permitted last-known data with original age, coverage and reason; never call it a successful fresh read.
3. Explicit disabled/inactive provider: remove it from active output and invalidate current provider enrichment. Historical records may remain separately labelled.
4. New session, same stable save: no old-session commit is accepted. A prior snapshot can be shown only as explicit last-known until current authoritative data arrives.
5. Different/replaced save or map/source identity: no automatic carry-forward into the current view; reset scoped discovery, entities and unit ownership.
6. Fresh generation containing held sections: update export/transport status but preserve held-section timestamps and state.
7. App restart/offline restore: replay the same policy, not a second nonempty heuristic that resurrects removed content.

## 4. Exact execution order

B00-B16 is the controlling order. Original W identifiers are retained below only for traceability; their older dependency order is not a second competing build queue. B01 and B02 are separate repairs after baseline; shared contracts are agreed before dependent adapters/UI. Do not parallel-edit shared types, store or merger without the owner's coordination.

1. B00 - Reconcile the baseline and preserve working changes; entry: start.
2. B01 - Close the exporter and mission lifecycle incident; entry: B00.
3. B02 - Complete safe configuration parsing and domain-aware saves; entry: B00.
4. B03 - Agree additive end-to-end data contracts; entry: B01, B02.
5. B04 - Resolve active mods, namespaces and independent readers; entry: B03.
6. B05 - Repair fertiliser, lime and the full soil path; entry: B03, B04.
7. B06 - Make live, held and offline snapshots honest; entry: B03, B04, B05.
8. B07 - Normalize units and effective values exactly once; entry: B03, B04, B06.
9. B08 - Make companion and core UI truthful, scoped and usable; entry: B03, B04, B05, B06, B07.
10. B09 - Finish current integrations and correct all catalog claims; entry: B04, B08.
11. B10 - Implement useful additional integrations in controlled waves; entry: B09.
12. B11 - Prove combinations, transition safety, performance and security; entry: B09, B10.
13. B12 - Build isolated, read-only website demos; entry: B06, B08, B09.
14. B13 - Build one coherent V5 candidate; entry: B11, B12.
15. B14 - Pass fresh-install, upgrade and installed acceptance; entry: B13.
16. B15 - Prepare and validate the four demo saves; entry: B14.
17. B16 - Close every finding and deliver the release decision; entry: B15.

### B00. Reconcile the baseline and preserve working changes

**Entry condition:** User-authorized planning handoff; reconcile baseline first. **Original plan mapping:** Additional consolidated work.

**Outcome:** Begin from Ash's actual partial implementation, not from a speculative rewrite.

**Known owning files/areas:**

- [NEW APP/AGENTS.md](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/AGENTS.md)
- [NEW APP/PARITY.md](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/PARITY.md)
- [docs/COMPATIBILITY.md](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/COMPATIBILITY.md)
- [docs/DEMO_COMPANION_MOD_LISTS.md](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/DEMO_COMPANION_MOD_LISTS.md)
- [package.json](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/package.json)
- [FS25_FarmDashboard_App/package.json](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/package.json)

**Implementation steps:**

1. Read the latest handoff, current agent ownership rules and parity checklist before editing. Coordinate shared contracts through the current foundation owner. Do not touch unrelated Realistic-Farming pipeline, mail, watcher or NAS work.
2. Create an evidence ledger for F01-F14 and B00-B16. Keep separate fields for source change, automated test, packaged artifact, installed behavior and in-game lifecycle. Start unproved fields as NOT TESTED, not PASS.
3. Reconcile Ash's reported W01 changes: CURRENT_MISSION_START subscription, one update owner, always-visible first update/errors, reset of hasLoaded and corrected readiness clock. Preserve them if correct. Do not reintroduce the unwired onStartMission path.
4. Reconcile W02 source changes and the reported passing tests. The installed V5 app was explicitly not rebuilt for those changes; record its actual build separately. F13/F14 are additional closure requirements.
5. Preserve the failing export/config/log and a coherent backup of app configuration, relevant modSettings, demo saves, and the current install/artifact manifest. Record source and destination; backups stay outside watched/export/mod directories.
6. Choose one controlled test profile and separate userData/port without changing the installed public demo. Verify the current instance identity rather than blindly using historical 8766/8767/8768 assumptions.
7. Determine the full currently advertised companion set from the catalog, not only the 31 vault recommendations. Every advertised live capability must get an owning adapter and acceptance row; existing supported capabilities cannot silently disappear.
8. Record current candidate versions without choosing a new marketing version on Graham's behalf. Do not reuse an already published version for different public bytes.
9. Record filesystem ownership for optional conversion software and installed-app registration as later lifecycle evidence. Do not clean the machine or uninstall shared tools as a planning shortcut.

**Required acceptance:**

- No user save, vault ZIP, public V4 feed, live server selection or unrelated code is changed during baseline collection.
- The changed-source identity and installed-build identity are recorded separately.
- Every original finding and newly identified test gap has an owner and required evidence.

**Handoff artifact:** Baseline manifest, protected-behavior checklist, scoped backup/restore instructions and phase ledger.

**Failure rule:** Record the specific failed criterion, preserve useful evidence and fix the owning path. Do not mark this phase complete or substitute an unrelated reinstall/reset. Re-run the affected gate on the resulting candidate when implementation/testing is authorized.

### B01. Close the exporter and mission lifecycle incident

**Entry condition:** B00. **Original plan mapping:** W00, W01.

**Outcome:** Prove the actual first-export failure is repaired and remains repaired across save changes.

**Known owning files/areas:**

- [FS25_FarmDashboard_Mod/src/FarmDashboard.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboard.lua)
- [FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua)
- [FS25_FarmDashboard_Mod/src/FarmDashLog.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashLog.lua)

**Implementation steps:**

1. Inspect the already changed implementation rather than blindly reapplying W01. Confirm a one-shot subscription is re-armed for every new mission; one-shot on the first save must not mean never subscribed on the second.
2. Use one engine-supported update path. Test registration counts and dispatch behavior directly rather than suppressing updates with dt heuristics.
3. Use distinct session tokens for collector work, export jobs and adapter handles. Teardown invalidates every in-flight job before it can commit into the next save.
4. Clear busy/processing state in protected completion/failure paths. Attribute an exception to its collector without losing independent successful sections.
5. Record mission start, readiness/defer reason, cycle start, each collector outcome, serialization result and atomic export commit. Errors remain visible with diagnostics off, are deduplicated and redact private data.
6. Replace the handoff phrase growing data.json with advancing completed generations. Output byte length, nonempty file presence and a first-update log are not completion proof.
7. Define the first-export deadline from actual grace, configured collection cadence and bounded margin, recording game pause/time-scale and wall-clock observations separately. On failure identify the first missing transition instead of reinstalling the desktop.
8. Prove cold start, reload, menu-to-another-save, late initialization, interrupted export and the applicable host/client modes. Do not mark the original empty-bootstrap incident closed until a real completed export is captured.

**Required acceptance:**

- L01: Cold load initializes once and advances at least two completed generations.
- L02: Same-process save change has a new session identity and no old job commit.
- L03: Diagnostics-off collector exception is visible, bounded and does not permanently stall export.
- L04: Teardown before completion cannot overwrite a newer session.
- L05: Each expected engine update dispatch invokes one coordinator update.

**Handoff artifact:** Exact root cause, lifecycle sequence, source regressions and a captured before/after export/log record.

**Failure rule:** Record the specific failed criterion, preserve useful evidence and fix the owning path. Do not mark this phase complete or substitute an unrelated reinstall/reset. Re-run the affected gate on the resulting candidate when implementation/testing is authorized.

### B02. Complete safe configuration parsing and domain-aware saves

**Entry condition:** B00. **Original plan mapping:** W02.

**Outcome:** Prevent UI preferences from mutating gameplay collection and prevent damaged files being silently replaced.

**Known owning files/areas:**

- [FS25_FarmDashboard_App/tests/modConfigXml.test.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/tests/modConfigXml.test.js)
- [FS25_FarmDashboard_App/modConfigXml.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/modConfigXml.js)
- [NEW APP/src/settings/SettingsModal.tsx](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/settings/SettingsModal.tsx)
- [FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua)

**Implementation steps:**

1. Keep the exact useStateMachine_fields/economy/production=false versus modules=true fixture. Read the actual intended element and exact attribute name, preserving explicit false.
2. Replace F13's garbage-to-template expectation. A missing file may be initialized; an existing malformed, unreadable or structurally invalid file must fail without a write. Do not treat an I/O error as missing.
3. Preserve supported unknown attributes/elements and detect duplicate/ambiguous managed structure instead of guessing which modules block wins. Keep reset-to-defaults a separate explicit user action.
4. Implement per-domain dirty state for appearance/UI, connection/server, mod configuration and access/LAN settings where applicable. Create a no-write assertion on a display-only Save through the real save entry point.
5. Make the read-modify-write path concurrency-aware using existing file/atomic helpers. Preserve or reject external changes instead of overwriting a newer game-written config with an old UI draft.
6. Return and display per-domain outcomes. If UI saved but mod write failed, retain mod dirty state, report partial success and permit a scoped retry; do not show a blanket Saved/Synced.
7. Retain appropriate input validation and bounds without coercing invalid booleans to true. Test denied write, interrupted write and conflict handling.
8. Remove forced per-load re-enablement only after the parser and migration tests demonstrate safety. Any necessary migration must be versioned, idempotent and preserve deliberate opt-outs.

**Required acceptance:**

- C01: Exact collision fixture passes through production parser.
- C02: Display-only save invokes no mod-config writer.
- C03: Explicit false, unknown attributes and unrelated XML survive a real save.
- C04: Malformed-present file is byte-preserved; missing file initializes.
- C05: Partial failure remains visible and only failed domains remain dirty.
- C06: Concurrent game edit is preserved or produces a recoverable conflict.

**Handoff artifact:** Safe parser/writer contract, save-domain regression suite and a documented migration decision.

**Failure rule:** Record the specific failed criterion, preserve useful evidence and fix the owning path. Do not mark this phase complete or substitute an unrelated reinstall/reset. Re-run the affected gate on the resulting candidate when implementation/testing is authorized.

### B03. Agree additive end-to-end data contracts

**Entry condition:** B01, B02. **Original plan mapping:** Additional consolidated work.

**Outcome:** Make absence, zero, scope and freshness unambiguous before implementing more integrations.

**Known owning files/areas:**

- [FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua)
- [FS25_FarmDashboard_App/dataMerger.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/dataMerger.js)
- [NEW APP/src/types/dashboard.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/types/dashboard.ts)
- [NEW APP/src/store/dashboard-store.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/store/dashboard-store.ts)

**Implementation steps:**

1. Add an additive schema/version envelope and section outcome/provenance contract at the existing producer, merger, types and selectors. Do not create a parallel exporter or replace the whole store architecture.
2. Separate mod detection, adapter support/readiness, read result and freshness. A failed current read may retain last-known data, so one overloaded boolean cannot express the model.
3. Specify configured source, stable save identity, map identity, session identity, generation, farm and entity keys. Save-slot number alone is insufficient when a career is replaced.
4. Define full and partial coverage explicitly. A complete known farm with no loans can be zero; a missing unobserved farm cannot borrow an aggregate or silently become zero.
5. Treat complete empty arrays and explicit disabled modules as authoritative transitions. A read failure is not empty, and a missing current soil measurement is not measured zero.
6. Standardize canonical units, metric source and calculation basis. Carry real original timestamps; transport arrival time and generation commit time do not update older held measurements.
7. Define compatibility behavior for older payloads conservatively: unknown completion/freshness stays unknown or labelled last-known. Preserve supported existing views without inventing full completion.
8. Agree the schema fixture with the shared foundation owner before downstream changes. Implement serializers for nil/null/absent semantics using the existing JSON writer, not invented Lua syntax.

**Required acceptance:**

- D01: Serialize/parse every section state through real producer-compatible fixtures.
- D02: Old supported payload remains readable without converting unknown to healthy.
- D03: One snapshot can display fresh fleet data and explicitly older held soil data.
- D04: Missing farm and valid zero farm cannot produce the same factual result.

**Handoff artifact:** Versioned contract note, representative JSON fixtures and shared normalized types.

**Failure rule:** Record the specific failed criterion, preserve useful evidence and fix the owning path. Do not mark this phase complete or substitute an unrelated reinstall/reset. Re-run the affected gate on the resulting candidate when implementation/testing is authorized.

### B04. Resolve active mods, namespaces and independent readers

**Entry condition:** B03. **Original plan mapping:** W03.

**Outcome:** Read only the mods active in this mission through their actual owning APIs.

**Known owning files/areas:**

- [FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua)
- [FS25_FarmDashboard_Mod/src/FillTypeUtils.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FillTypeUtils.lua)
- [FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua)

**Implementation steps:**

1. Create a mission-scoped registry using the verified game active-mod surface. Use inventory only for metadata after active membership is proven; stale settings files never activate a mod.
2. Resolve real runtime mod names and supported aliases from the actual package. A ModHub numeric ID or a prefixed vault filename is not a runtime namespace.
3. Resolve ELS, restrictions, RCC and Imperial symbols from the owning mod environment or verified mission object. Remove unsupported getActiveModByName assumptions; do not flatten globals.
4. Give each adapter independent capability probing, readiness timeout/retry, error handling and collection cadence. Missing one manager must not hide all companion data.
5. Cache discovery per mission. Bound retries and entity work; no directory, XML-settings or vault scans per frame.
6. Make deployment-mode availability explicit. Current-player UI helpers are not a reliable unattended dedicated-server source.
7. Read game state without buying samples, changing money, setting a recipe, invoking gameplay actions or modifying third-party mods.
8. Make the registry serve both unit-mode and companion detection so those systems cannot disagree. Invalidate it on teardown and new save identity.

**Required acceptance:**

- A01: All ZIPs installed but unchecked yields base-only dashboard.
- A02: Each adapter works with only its genuine prerequisites.
- A03: Namespace-faithful fixtures expose correct companion managers.
- A04: One adapter throws or initializes late; others and native collectors continue.
- A05: Switching from modded save to base save removes previous active presence and units.

**Handoff artifact:** Source-backed registry, adapter interface, version/dependency/mode manifest and isolated reader tests.

**Failure rule:** Record the specific failed criterion, preserve useful evidence and fix the owning path. Do not mark this phase complete or substitute an unrelated reinstall/reset. Re-run the affected gate on the resulting candidate when implementation/testing is authorized.

### B05. Repair fertiliser, lime and the full soil path

**Entry condition:** B03, B04. **Original plan mapping:** W05.

**Outcome:** Render the correct provider's real field values without guessing from targets, stale snapshots or ownership IDs.

**Known owning files/areas:**

- [FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/FieldDataCollector.lua)
- `C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors` (choose the actual owning files)
- [FS25_FarmDashboard_App/xmlCollector.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/xmlCollector.js)
- [FS25_FarmDashboard_App/dataMerger.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/dataMerger.js)
- [NEW APP/src/types/dashboard.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/types/dashboard.ts)
- [NEW APP/src/sections/fields/field-helpers.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/sections/fields/field-helpers.ts)
- [NEW APP/src/sections/fields/FieldCard.tsx](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/sections/fields/FieldCard.tsx)
- [NEW APP/src/sections/fields/FieldsSection.tsx](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/sections/fields/FieldsSection.tsx)

**Implementation steps:**

1. Trace vanilla fertiliser/lime, PF nitrogen/pH/scan coverage and RF soil measures from the authoritative getter through JSON, XML fallback, merger, normalized selector and all field displays.
2. Use each provider's documented scale and meaning. Do not reinterpret vanilla application levels as PF physical quantities or a required lime flag as a measured pH value.
3. Keep current, target, scan availability and freshness independent. A target alone draws no measured-current bar; zero is a valid measured value only when the read succeeded.
4. Repair F14 by making field fixtures call production xmlCollector and the real merge/selectors. Keep copied toy algorithms out of release evidence.
5. Use source/save/provider-qualified field identity. Multiple fields on one farmland and map changes must not cross-attach soil readings.
6. Define metric-level provider selection from actual enabled systems. PF presence alone does not mean every RF capability is unavailable, and a disabled RF soil system cannot override PF.
7. Preserve existing correct field card text, detail behavior and RF/PF separation. Remove only proven placeholder/coercion bugs.
8. Show useful unknown reasons such as not sampled, collector starting, unsupported provider or last known. Do not instruct the player to buy another scan when the true issue is failed telemetry.

**Required acceptance:**

- S01: Base fertiliser and lime states match in-game field information.
- S02: PF unknown current/known target, measured zero, unknown target and unscanned states differ.
- S03: RF authoritative values match their actual scales and source.
- S04: Card, detail, overview and relevant map overlay agree.
- S05: Multi-field farmland and provider-switch fixtures do not mix values.
- S06: Production-path XML fixture proves nested field extraction and downstream rendering.

**Handoff artifact:** Shared soil selectors, source-backed provider mapping, repaired production-path tests and three-provider comparison evidence.

**Failure rule:** Record the specific failed criterion, preserve useful evidence and fix the owning path. Do not mark this phase complete or substitute an unrelated reinstall/reset. Re-run the affected gate on the resulting candidate when implementation/testing is authorized.

### B06. Make live, held and offline snapshots honest

**Entry condition:** B03, B04, B05. **Original plan mapping:** W06.

**Outcome:** Preserve useful offline history without resurrecting removed data or mixing saves.

**Known owning files/areas:**

- [FS25_FarmDashboard_App/mergedSnapshotHold.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/mergedSnapshotHold.js)
- [FS25_FarmDashboard_App/main.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js)
- [FS25_FarmDashboard_App/dataMerger.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/dataMerger.js)
- [NEW APP/src/types/dashboard.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/types/dashboard.ts)
- [NEW APP/src/store/dashboard-store.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/store/dashboard-store.ts)
- [NEW APP/src/services/ws-client.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/services/ws-client.ts)

**Implementation steps:**

1. Apply identity validation before bootstrap/minimal-export early exits and before any retained-field enrichment.
2. Implement one section transition policy used by live hold, last-good update, persistence restore and freshness stamping. Do not fix only the first helper in a chain that later restores old rows.
3. Complete empty animals/production, zero stock and disabled companions/RF invalidate older current-section backups. Partial or failed reads may retain compatible last-known data with its original provenance.
4. On a new session of the same persistent save, show old data only as explicit last-known until a new authoritative read. On a different save identity, quarantine it from the selected live view entirely.
5. Use entity/provider identity, not farmland ID alone, when carrying detail forward. An explicit provider disable invalidates provider-specific enrichment.
6. Retain existing WebSocket request/generation/server guards; abort or ignore stale responses after rapid selection changes.
7. Persist section outcomes and timestamps. Migrate old caches as unknown-age last-known rather than deleting all useful history.
8. Make failure and offline views preserve user context, show last successful sample age and stop claiming Live merely because the socket is connected.

**Required acceptance:**

- R01: Nonempty -> complete empty -> disconnect -> app restart remains empty.
- R02: RF/companion enabled -> disabled stays disabled through all backups.
- R03: New export with held soil preserves original soil age.
- R04: Reused save slot/new career never inherits prior fields, loans or units.
- R05: Delayed response from server A cannot populate selected server B.
- R06: App restart with game closed displays honest offline data without fresh timestamps.

**Handoff artifact:** Unified transition policy, real ingestion-chain tests and persisted snapshot migration notes.

**Failure rule:** Record the specific failed criterion, preserve useful evidence and fix the owning path. Do not mark this phase complete or substitute an unrelated reinstall/reset. Re-run the affected gate on the resulting candidate when implementation/testing is authorized.

### B07. Normalize units and effective values exactly once

**Entry condition:** B03, B04, B06. **Original plan mapping:** W07.

**Outcome:** Match supported in-game presentation without altering canonical quantities or double-applying modifiers.

**Known owning files/areas:**

- [FS25_FarmDashboard_Mod/src/FillTypeUtils.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FillTypeUtils.lua)
- [NEW APP/src/lib/fill-unit-mode.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/fill-unit-mode.ts)
- [NEW APP/src/lib/fill-units.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/fill-units.ts)
- [NEW APP/src/store/dashboard-store.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/store/dashboard-store.ts)

**Implementation steps:**

1. Read active Imperial/British/Save Unit Profiles settings from source-backed handles and define effective formatter ownership for combinations.
2. Keep litres, currency, time and other established canonical quantities internally. Convert once at the presentation boundary using shared helpers.
3. Specify any per-fill-type mass/bushel relationship from the actual provider. Unknown density cannot yield a falsely precise mass conversion.
4. Distinguish game-current effective prices/rates from base price, estimates and historical realised revenue. Never multiply an already modified price/rate a second time.
5. Document host versus viewer settings for remote clients. Do not promise client-specific game preferences that are not exported.
6. Preserve manual UI behavior when no active mod owns presentation. Unit preference saves stay within their settings domain.

**Required acceptance:**

- U01: Inactive Imperial plus leftover config cannot change units.
- U02: British-only, Imperial-only, profiles-only and supported combinations match source behavior.
- U03: Stock, fleet, recipe and finance views reconcile canonical values.
- U04: Liquids, dry crops, mass, zero, unknown and rounding cases are covered.
- U05: Provider/save changes clear old unit mode without changing underlying stored data.

**Handoff artifact:** Shared formatters, effective-value ownership policy and same-save numeric comparisons.

**Failure rule:** Record the specific failed criterion, preserve useful evidence and fix the owning path. Do not mark this phase complete or substitute an unrelated reinstall/reset. Re-run the affected gate on the resulting candidate when implementation/testing is authorized.

### B08. Make companion and core UI truthful, scoped and usable

**Entry condition:** B03, B04, B05, B06, B07. **Original plan mapping:** W04.

**Outcome:** Present meaningful data rather than detection badges or reassuring defaults.

**Known owning files/areas:**

- [FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua)
- [NEW APP/src/types/dashboard.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/types/dashboard.ts)
- [NEW APP/src/lib/companionMods/catalog.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/companionMods/catalog.ts)
- [NEW APP/src/lib/companionMods/index.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/companionMods/index.ts)
- [NEW APP/src/sections/companions/CompanionModsSection.tsx](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/sections/companions/CompanionModsSection.tsx)
- [NEW APP/src/lib/farm-scope.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/farm-scope.ts)

**Implementation steps:**

1. Use normalized selectors for card/detail/overview values. Keep the existing component library, navigation and visual system; do not redesign working pages.
2. Show Spreading allowed only after a successful current per-category restriction read. Unknown or stale restriction data cannot be operational advice.
3. Keep ELS farm rows separate from aggregate totals. A debt-free farm stays zero; an unavailable farm stays unknown. Preserve a valid selected farm even if it owns no fields or vehicles.
4. Show RCC vanilla region only after an actual successful manager read reports vanilla. Show supported-map crop fallbacks explicitly.
5. Separate Active / live data, Active / detection only, Starting, Unsupported, Failed and Last known states. Inactive optional mods should not create alarming empty cards.
6. Provide concise reasons, source/version and last-success age with accessible details. Avoid unbounded Lua stacks or private paths in the normal UI.
7. Reuse native animal, production, storage and fleet sections. Livestock Monitor, Production Watcher and another dashboard must remain optional enrichments, not prerequisites.
8. Test keyboard operation, focus after save/errors, accessible state text, narrow windows, long translations, legitimate empty farms and rapid source changes. Use localization keys for every new string.
9. Preserve known low-fuel filters, bale/storage accounting, per-1000-litre pricing, mileage and existing setup/server workflows as explicit positive regressions.

**Required acceptance:**

- V01: Farm A zero debt does not show farm B totals; explicit aggregate view is labelled.
- V02: Valid asset-empty farm selection remains stable.
- V03: Missing restrictions/calendar/loans API never renders allowed/vanilla/no loans.
- V04: Native views remain useful with every companion disabled.
- V05: Keyboard, narrow-window, long-label and error states remain usable.

**Handoff artifact:** Complete UI state coverage and revised support claims backed by actual data capabilities.

**Failure rule:** Record the specific failed criterion, preserve useful evidence and fix the owning path. Do not mark this phase complete or substitute an unrelated reinstall/reset. Re-run the affected gate on the resulting candidate when implementation/testing is authorized.

### B09. Finish current integrations and correct all catalog claims

**Entry condition:** B04, B08. **Original plan mapping:** Additional consolidated work.

**Outcome:** Complete already advertised integrations before adding more surface area.


**Implementation steps:**

1. Use the adapter backlog in this brief, plus every existing advertised catalog entry, as the scope ledger. Classify live, limited, detection-only and unsupported honestly.
2. First close ELS, restrictions, RCC, RealSilo, pallet condition, Advanced Maintenance, seasonal milk, unit settings/profiles and the existing livestock/production integrations.
3. Replace enabled=true-only placeholders with real source-backed data where live support is promised. Dynamic Market, Soil Work Yield Bonus and all other placeholder entries need explicit implementation scope or truthful detection-only wording.
4. Correct all ten catalog errors listed in the catalog appendix, including Stall Rental, Animal Food Overview, Production Control, Out Of Fuel and Bushel Plus.
5. For each adapter pin source version, true runtime ID, supported deployment modes, required dependencies, optional bridges, farm/entity scope, output contract and UI destination.
6. Use each mod's effective runtime state, not default XML or a description guessed from its name. Verify the RealSilo vault/save version mismatch before choosing reader fields.
7. Reconcile companion totals with native inventory, finance, production and animals. A companion breakdown enriches a total; it is not a second inventory item.
8. Complete minimum-set positive, valid-empty, unavailable, error, removal, persistence and two-farm tests before calling an adapter done.

**Required acceptance:**

- I01: Every advertised live card has meaningful positive data evidence.
- I02: No enabled-only placeholder is counted as completed live integration.
- I03: Every catalog description matches the source-backed meaning.
- I04: Core totals do not double-count companion breakdowns.
- I05: Current integration coverage includes all advertised entries, not only the sampled vault list.

**Handoff artifact:** Checked-in support manifest, finished priority adapters, corrected catalog and per-adapter evidence bundles.

**Failure rule:** Record the specific failed criterion, preserve useful evidence and fix the owning path. Do not mark this phase complete or substitute an unrelated reinstall/reset. Re-run the affected gate on the resulting candidate when implementation/testing is authorized.

### B10. Implement useful additional integrations in controlled waves

**Entry condition:** B09. **Original plan mapping:** Additional consolidated work.

**Outcome:** Deliver the worthwhile vault additions without making one optional mod depend on another unnecessarily.


**Implementation steps:**

1. Wave 1: Seasonal Wool Production, Task List, Production Schedule and Economic History. Keep writes and gameplay control out of scope.
2. Wave 2: Animal Food Calculator, Animal Planner, Field Profitability Ledger and VIP Order Manager, subject to their actual SP/MP capabilities. Add Factory Profit Calculator coverage from effective recipes where advertised.
3. Wave 3: Farm Reputation, Yield Tracker, Moisture System, Field Leasing, Rent Your Field, Farmland Marketplace and Distribution Redux after their source/combination gates.
4. Alternative maintenance systems get separate adapters after the first maintenance contract is stable. Do not require them together or silently replace a working system.
5. For Silage Compaction Monitor and Farm Operations Dashboard, implement useful native functionality first. Add only unique verified companion data rather than creating a dependency on another UI.
6. Apply the same per-adapter acceptance contract to every addition. A source-feasible recommendation is not an implemented feature and an upstream multiplayer flag is not live validation.
7. Do not let a late optional adapter block recovery of native functionality; deliver a candidate with accurate scope when requested. Do not mark the full brief complete until every item is implemented, proven upstream-blocked, or explicitly deferred by Graham.
8. Do not publish, market or populate a demo card for a future feature merely because a backlog entry exists.

**Required acceptance:**

- N01: Every completed addition passes its minimum supported configuration.
- N02: Removing one addition leaves every unrelated adapter and native collector working.
- N03: Actual upstream prerequisites are required only for that specific integration.
- N04: SP-only and MP-only capabilities cannot be advertised in incompatible deployments.

**Handoff artifact:** Incremental adapter implementations with a complete disposition ledger for all 31 recommendations.

**Failure rule:** Record the specific failed criterion, preserve useful evidence and fix the owning path. Do not mark this phase complete or substitute an unrelated reinstall/reset. Re-run the affected gate on the resulting candidate when implementation/testing is authorized.

### B11. Prove combinations, transition safety, performance and security

**Entry condition:** B09, B10. **Original plan mapping:** W08.

**Outcome:** Replace pack-level assumptions with evidence over supported configurations and real code paths.

**Known owning files/areas:**

- `C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_App/tests` (choose the actual owning files)
- `C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/NEW APP/tests` (choose the actual owning files)
- `C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub/FS25_FarmDashboard_Mod` (choose the actual owning files)
- [NEW APP/src/services/ws-client.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/services/ws-client.ts)

**Implementation steps:**

1. Generate a versioned minimum-set and constrained-pairwise configuration list from actual dependencies/conflicts. Pairwise coverage is a practical baseline, not mathematical proof of every possible multi-mod combination.
2. Explicitly exercise high-risk multi-provider stacks: soil/PF, fuel price writers, market/seasonal price models, units/profiles, animal output/consumption, maintenance/fault systems and production distribution/rates.
3. Test base-only, each supported adapter alone with genuine prerequisites, installed-but-disabled, late/failed readers, removed mod, new save/map and multiple farms.
4. Test the full production ingestion chain, not duplicate test logic. Include malformed/partial JSON, field-source fixtures, settings no-write, all retention layers and out-of-order responses.
5. Measure collector duration, full-cycle time, serialization size, repeat error volume, queue depth and renderer update cost. Define a measured budget before declaring an improvement; retain existing frame budget until evidence supports a change.
6. Use bounded pagination/incremental work where actual entity counts require it. Export coverage/truncation honestly; partial results cannot look like a complete empty farm.
7. Exercise existing security boundaries with safe fixtures: authorization, read/write separation, path allowlists, untrusted labels, bounded payload sizes and secret redaction. These are acceptance requirements, not claims that every boundary is currently vulnerable.
8. Run applicable SP, MP host/client and dedicated cases. Respect actual source authority; do not expose another farm's private integration data merely because a global aggregate is accessible.
9. Run the documented source suites, renderer typecheck, localization checks and focused negative tests; record commands and failures. Do not call skipped or blocked cases passing.
10. If a previously working behavior fails, stop candidate packaging, record the regression and repair its owning contract before continuing.

**Required acceptance:**

- T01: All F01-F14 regressions exercise real production paths.
- T02: Every advertised adapter has minimum-set and absence evidence.
- T03: Every permitted pair is covered or listed NOT TESTED; high-risk stacks are explicit.
- T04: Before/after measurements and acceptable configured budgets are recorded.
- T05: No unsafe data/write surface is introduced by diagnostics or integrations.

**Handoff artifact:** Automated test record, measured performance baseline, supported-combination evidence and precise residual risks.

**Failure rule:** Record the specific failed criterion, preserve useful evidence and fix the owning path. Do not mark this phase complete or substitute an unrelated reinstall/reset. Re-run the affected gate on the resulting candidate when implementation/testing is authorized.

### B12. Build isolated, read-only website demos

**Entry condition:** B06, B08, B09. **Original plan mapping:** Additional consolidated work.

**Outcome:** Make four reliable interactive examples without exposing the live dashboard's control plane.

**Known owning files/areas:**

- [Website/demo.html](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/Website/demo.html)
- [Website/js/site-config.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/Website/js/site-config.js)
- [NEW APP/src/platform/DemoBanner.tsx](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/platform/DemoBanner.tsx)
- [NEW APP/src/services/api-client.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/services/api-client.ts)
- [NEW APP/src/services/realtime-connector.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/services/realtime-connector.ts)
- [NEW APP/src/store/dashboard-store.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/store/dashboard-store.ts)

**Implementation steps:**

1. Implement a snapshot data-source mode through the real V5 renderer and existing store/service abstraction. Do not build a separate fake dashboard or duplicate business logic.
2. Use stable allowlisted demo IDs base, precision-farming, realistic-farming and precision-companions. Each request/context/cache is scoped to demo ID and immutable generation.
3. Create a sanitized public projection containing only required fields/assets. Remove private player/network identifiers, paths, credentials, arbitrary connection settings and unrelated farms/servers.
4. Serve static captured demos independently of the live game. Label Recorded demo, capture time, game date/map, provider, enabled capabilities and limitations; an optional live route remains separately labelled.
5. Enforce read-only at the route/data-source boundary, not only by hiding buttons. Public visitors cannot save settings, change the host's server, install mods, browse arbitrary files, upload or control the game.
6. Two visitors may select different demos without changing each other or the host. Test rapid switches with delayed requests and unavailable assets.
7. Publish a validated completed snapshot/assets/manifest set as an immutable generation, then atomically switch its pointer. Keep the previous good generation if validation fails.
8. Provide feature deep links that select a meaningful populated section. Do not link a advertised loan/compartment/soil feature to an empty detection card.
9. Maintain current public V4 marketing and release feed boundaries. Separate the new V5 demo work from the existing live tunnel; do not silently reconfigure its passwords or runtime.
10. Use only permitted assets and link to mod authors rather than redistributing their ZIPs. Downloadable saves need a separate permission/privacy review.

**Required acceptance:**

- WEB01: Two independent visitors remain on distinct demo sources.
- WEB02: Mutating/public-path-escape requests are denied; server identity stays unchanged.
- WEB03: Snapshot publication rejects bootstrap, missing assets and private data.
- WEB04: Recorded timestamps remain recorded after reload and offline use.
- WEB05: Feature links work on desktop/mobile and expose actual populated data.

**Handoff artifact:** Four-demo gallery, snapshot manifest/export projection, read-only route tests and a reversible publication process.

**Failure rule:** Record the specific failed criterion, preserve useful evidence and fix the owning path. Do not mark this phase complete or substitute an unrelated reinstall/reset. Re-run the affected gate on the resulting candidate when implementation/testing is authorized.

### B13. Build one coherent V5 candidate

**Entry condition:** B11, B12. **Original plan mapping:** W09.

**Outcome:** Ensure the installed application, renderer and game ZIP come from the same tested source.

**Known owning files/areas:**

- [package.json](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/package.json)
- [FS25_FarmDashboard_Mod/modDesc.xml](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/modDesc.xml)
- [FS25_FarmDashboard_Mod/src/FarmDashboard.lua](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboard.lua)
- [FS25_FarmDashboard_App/electron-builder.rf.yml](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/electron-builder.rf.yml)
- [docs/DEMO_COMPANION_MOD_LISTS.md](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/DEMO_COMPANION_MOD_LISTS.md)

**Implementation steps:**

1. Use the existing agreed output location and V5 packaging scripts. Build mod, UI and app in the established order; never use classic build:all for this candidate.
2. Keep the mod filename exactly FS25_FarmDashboard.zip. Put versions/build identifiers in metadata and manifests, not a new basename that creates a second game mod.
3. Create a content/build manifest covering source identity, mod descriptor/runtime version, UI assets, Electron bundle, installer, packaged mod and dependency/converter decisions.
4. Check actual packaged contents and final hashes. A successful compile or file timestamp does not prove the installed resources include W02 or the corrected adapters.
5. Close the game before deploying the mod. Preserve any loose developer copy outside the mods search path so release acceptance loads the canonical ZIP once.
6. Install the exact candidate and identify its launched executable/resources. Do not assume an old install path or a development browser instance is the shipped app.
7. Do not publish, upload to a server, change an update feed or overwrite public V4 assets as a side effect of building.
8. Any post-package source fix produces a new identifiable candidate and invalidates affected downstream acceptance evidence; do not silently replace bytes under a passed manifest.

**Required acceptance:**

- PKG01: Source, packaged mod, UI, desktop and installer identities reconcile.
- PKG02: Runtime diagnostics show the exact installed candidate and canonical mod.
- PKG03: Setup, dashboard and companion routes/assets exist in the packaged app.
- PKG04: No release test loads an ambiguous loose+ZIP duplicate.

**Handoff artifact:** One candidate manifest and one clearly identified installer in the existing output location.

**Failure rule:** Record the specific failed criterion, preserve useful evidence and fix the owning path. Do not mark this phase complete or substitute an unrelated reinstall/reset. Re-run the affected gate on the resulting candidate when implementation/testing is authorized.

### B14. Pass fresh-install, upgrade and installed acceptance

**Entry condition:** B13. **Original plan mapping:** Additional consolidated work.

**Outcome:** Deliver a working application before asking Graham to populate demonstration saves.


**Implementation steps:**

1. Use a reversible isolated fresh profile or approved backups of all relevant prior app/mod settings. A fresh desktop install that still uses old modSettings is not a fresh setup test.
2. Keep user save data and unrelated mods intact. Reset only explicitly scoped test state after backup; capture the exact clean boundaries in the evidence record.
3. Exercise installer, Installed Apps registration, valid uninstaller path, first launch, setup, save selection, dashboard and conversion of a representative map/picture.
4. If a dependency or ImageMagick remains installed by this candidate, record ownership and intended uninstall behavior. Remove only app-owned installations with safe provenance, never a shared pre-existing copy; test the actual approved design instead of reopening it speculatively.
5. Exercise per-user installation and any advertised all-user flow, including UAC/error outcomes. Optional conversion failure must not produce a blank dashboard or falsely successful conversion; preserve a working existing fallback.
6. Uninstall through Windows Installed Apps, confirm expected app-owned cleanup and preservation choices, then reinstall. Separately test an upgrade with existing preferences/offline history and an intentional disabled collector.
7. Use the exact packaged ZIP/app to compare real data, Settings display-only save, farm/server switches, app restart, game shutdown/offline state and same-process save reload.
8. Perform the advertised LAN/dedicated route and security checks on the same candidate. If unavailable, keep them NOT TESTED and narrow the release claim rather than treating local SP as equivalent.
9. Check core protected features: fields, fuel/fleet, animals, production, storage/bales, map images, pricing, mileage and offline history.
10. Only hand Graham a demo-preparation candidate after this gate passes; include precise launch/save instructions and a visible build ID.

**Required acceptance:**

- INSTALL01: First launch reaches setup and a rendered dashboard, not a blank blue window.
- INSTALL02: App appears in Installed Apps and its registered uninstaller works.
- INSTALL03: Clean reinstall and existing-user upgrade both work.
- INSTALL04: Required image conversion works with accurate optional-dependency outcomes.
- INSTALL05: Installed config fix and correct live export are independently evidenced.
- INSTALL06: Protected core workflows pass on packaged bytes.

**Handoff artifact:** A demo-preparation-ready candidate, installed acceptance evidence and rollback instructions. This is not yet public release approval.

**Failure rule:** Record the specific failed criterion, preserve useful evidence and fix the owning path. Do not mark this phase complete or substitute an unrelated reinstall/reset. Re-run the affected gate on the resulting candidate when implementation/testing is authorized.

### B15. Prepare and validate the four demo saves

**Entry condition:** B14. **Original plan mapping:** Additional consolidated work.

**Outcome:** Let Graham build meaningful examples only after the app's data path is stable.


**Implementation steps:**

1. Give Graham the companion save playbook. Use preserved working copies and verify slot/map/provider before every session; historical slot numbers are not automatic authorization to overwrite a save.
2. Work in the suggested order: base slot 4, isolated PF slot 3, RF/companions slot 19 and PF/companions slot 18.
3. For each feature prepare real game state, capture the in-game comparison and wait for a completed identity-matched export. Never populate fake values in JSON to make the showcase look successful.
4. Do not delete a working mixed pack because two mods sound related. Apply the documented version/configuration-specific ownership rules and use separate minimal profiles for independence testing.
5. Record acceptance for positive, legitimate empty, unavailable and stale states where appropriate. A visually busy 55-mod save is not proof all adapters work independently.
6. Publish only sanitized completed generations through the demo publisher, with capture manifest and feature checklist. Keep personal raw exports/screenshots private if they contain identifying data.
7. When Graham reports a discrepancy, tie it to candidate, source, save, farm, entity and generation before fixing. Retest affected automated and installed cases; refresh only the affected demo capture.

**Required acceptance:**

- DEMO01: All four snapshots have actual featured values, provider labels and correct farm scope.
- DEMO02: Game, export and dashboard agree on representative fields/loans/storage/livestock/production.
- DEMO03: No original user save is destroyed by preparation.
- DEMO04: Public demos are sanitized, immutable, read-only and independent.

**Handoff artifact:** Four approved showcase captures and user-facing feature checklists. Gameplay preparation is Graham's later step, not a prerequisite for source repair.

**Failure rule:** Record the specific failed criterion, preserve useful evidence and fix the owning path. Do not mark this phase complete or substitute an unrelated reinstall/reset. Re-run the affected gate on the resulting candidate when implementation/testing is authorized.

### B16. Close every finding and deliver the release decision

**Entry condition:** B15. **Original plan mapping:** W10.

**Outcome:** Make the support claims and release decision match exact tested artifacts.

**Known owning files/areas:**

- [docs/COMPATIBILITY-RECOVERY-PLAN-2026-09-23.md](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/COMPATIBILITY-RECOVERY-PLAN-2026-09-23.md)
- [docs/COMPATIBILITY.md](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/COMPATIBILITY.md)
- [docs/DASH-MEMORY.md](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/DASH-MEMORY.md)

**Implementation steps:**

1. Close F01-F14 individually with owning code changes, a real regression, package identity and installed/live proof where applicable.
2. Finalize the entire compatibility ledger, all catalog corrections, true dependency/mode edges, minimum-set/combination evidence and all 31 recommendation dispositions.
3. List any optional work explicitly deferred by Graham and remove premature live-support claims. An upstream limitation must be precise, source-backed and restricted to the affected feature.
4. Complete the existing protected-functionality/parity checklist and attach the four demo manifests. Re-capture any demo invalidated by final data-contract changes.
5. Provide one release candidate identity, artifact paths/hashes, exact passed scenarios, honest remaining risks, rollback and support instructions.
6. Keep signing as an explicitly documented distribution caveat unless Graham chooses a separate solution; do not imply an unsigned installer is signed or universally trusted, and do not instruct users to disable security protections.
7. Do not publish automatically. Ask for the release decision only after the required gates pass and provide a concise factual summary rather than another unresolved implementation plan.

**Required acceptance:**

- DONE01: No finding is closed solely because a code change exists.
- DONE02: No skipped/blocked/live-unverified item is recorded as PASS.
- DONE03: Public feature descriptions match tested capabilities and deployment modes.
- DONE04: Final candidate has no undocumented byte changes since acceptance.

**Handoff artifact:** Completed build brief ledger, release recommendation and a single reproducible delivery package.

**Failure rule:** Record the specific failed criterion, preserve useful evidence and fix the owning path. Do not mark this phase complete or substitute an unrelated reinstall/reset. Re-run the affected gate on the resulting candidate when implementation/testing is authorized.

## 5. Complete adapter implementation backlog

The numbered records below cover all 31 recommendations from the vault review. They are implementation briefs, not a claim that each adapter exists today. Their ModHub IDs are catalog references, not runtime Lua environment names. Exact runtime IDs and APIs must come from the pinned source. Existing advertised integrations outside this sampled list are additionally in scope through B09.

### Mandatory per-adapter build recipe

1. Pin the exact supported package/version and canonical runtime mod ID. Compare installed/save versions with vault source before assuming a reader signature; keep provenance and narrow documented aliases.
2. Document the real source owner, ready condition, authority/mode and API/data path. Use namespace-faithful fixtures; do not infer manager names from the title or flatten foreign globals.
3. Define a bounded read-only snapshot with farm/entity coverage, canonical units, source/provenance and separate unavailable/failed/complete-empty outcomes. Record only values the source actually exposes.
4. Map useful output to existing native sections and one concise companion summary. Avoid a second finance/inventory ledger when the same goods or debt already feed core totals.
5. Prove the minimum supported set, meaningful positive data, legitimate empty/zero, missing/late API, exception, inactive/removed package, save reload and contrasting farms. Run applicable host/client/dedicated cases separately.
6. Prove combination behavior for all shared writers/optional bridges relevant to this adapter. A tested pack is not proof of standalone independence; a descriptor flag is not multiplayer acceptance.
7. Attach the exact source references, fixture path, candidate identity, same-game comparison and remaining limits. Advertise live support only for completed, evidenced fields.
8. If the verified package cannot expose a proposed field safely, keep that field unavailable and record the capability limitation. Never fabricate a value to satisfy the mockup or add an unrelated required mod.

### Per-adapter record to complete

- Canonical runtime ID and narrowly supported aliases; ModHub/catalog reference separately.
- Pinned upstream version/hash, source functions/lines and readiness/capability probes.
- True required dependencies, optional bridges and specific upstream conflict/configuration edges.
- SP, host, client and dedicated support individually; source authority and farm/entity coverage.
- Exported fields with units, effective/base/estimated semantics and missing/zero rules.
- Collection cadence, work budget, truncation/coverage behavior and error/retry policy.
- Native UI destination, companion summary, localization keys and accessibility/error/empty states.
- Minimum-set, inactive, failure, reload, multi-farm and relevant combination results.
- Packaged/installed candidate identity and matching in-game comparison.
- Final classification: implemented/live-evidenced, implemented/source-only, limited, detection-only, upstream-blocked or explicitly deferred. Do not collapse these into a green supported badge.

### A01. Enhanced Loan System

**Catalog reference:** 314906. **Reviewed version:** 1.0.0.0. **Build priority:** Finish first. **Work type:** Existing adapter repair.

**User value / proposed output:** Per-farm outstanding principal, monthly payment, interest, remaining term and collateral headroom where the verified loan manager exposes it.

**Source starting point:** src/ELS_loanManager.lua and src/ELS_loan.lua; the mod owns an annuity-loan model separate from vanilla debt.

**Limits and design constraints:** Do not require another finance mod or substitute vanilla/all-farm debt for an unavailable ELS record.

**Descriptor evidence:** multiplayer flag true; declared prerequisites none in the reviewed descriptor; runtime independence still needs proof. A true flag does not certify dedicated/client behavior.

**Suggested demonstration:** Give the demo one real outstanding ELS loan and a contrasting debt-free farm; the captured save has settings but no loan records..

**Reviewed archive reference:** `FS25_314906_Enhanced_Loan_System.zip`. Treat this as the captured vault reference; confirm the installed version before implementation.

**Build and closure:** Apply the mandatory recipe above. Implement only fields supported by the verified source, route them through the common status/scope/provenance contract and attach positive/empty/failure/removal evidence. Distinguish an upstream limitation from a reader bug. Never satisfy this item with only an enabled flag.

### A02. Restricted Periods

**Catalog reference:** 352961. **Reviewed version:** 1.0.0.0. **Build priority:** Finish first. **Work type:** Existing adapter repair.

**User value / proposed output:** An actionable spreading calendar: slurry/digestate/manure permitted or blocked now, with reason and the next applicable window.

**Source starting point:** scr/RestrictedPeriods.lua:34 SlurryBan.isBanActive(category), with separate liquid/solid rules and temperature handling.

**Limits and design constraints:** Calendar period numbers must follow the source; an unread API is unknown, not spreading allowed. No dependency on RF or RCC is declared.

**Descriptor evidence:** multiplayer flag true; declared prerequisites none in the reviewed descriptor; runtime independence still needs proof. A true flag does not certify dedicated/client behavior.

**Suggested demonstration:** Capture an allowed example and an actual blocked/frost example on disposable saves, not just a mod-present badge..

**Reviewed archive reference:** `FS25_352961_Restricted_Periods.zip`. Treat this as the captured vault reference; confirm the installed version before implementation.

**Build and closure:** Apply the mandatory recipe above. Implement only fields supported by the verified source, route them through the common status/scope/provenance contract and attach positive/empty/failure/removal evidence. Distinguish an upstream limitation from a reader bug. Never satisfy this item with only an enabled flag.

### A03. Regional Crop Calendar

**Catalog reference:** 368342. **Reviewed version:** 1.1.0.2. **Build priority:** Finish first. **Work type:** Existing adapter repair.

**User value / proposed output:** Selected region, planting and harvesting windows by actual crop, and optional weather/yield modifiers with source labels.

**Source starting point:** src/RegionManager.lua, CalendarService.lua, WeatherService.lua and YieldService.lua; selectedRegion and optional toggles are distinct.

**Limits and design constraints:** Custom-map crops may retain map calendars. RCC weather/yield features can overlap other providers; calendar-only use is not the same as enabling all toggles.

**Descriptor evidence:** multiplayer flag true; declared prerequisites none in the reviewed descriptor; runtime independence still needs proof. A true flag does not certify dedicated/client behavior.

**Suggested demonstration:** Select a meaningful non-vanilla region. The captured RF save currently selects vanilla with weather/yield off..

**Reviewed archive reference:** `FS25_368342_Regional_Crop_Calendar.zip`. Treat this as the captured vault reference; confirm the installed version before implementation.

**Build and closure:** Apply the mandatory recipe above. Implement only fields supported by the verified source, route them through the common status/scope/provenance contract and attach positive/empty/failure/removal evidence. Distinguish an upstream limitation from a reader bug. Never satisfy this item with only an enabled flag.

### A04. RealSilo - Realistic Silo Compartments

**Catalog reference:** 369067. **Reviewed version:** 1.0.0.0. **Build priority:** Finish first. **Work type:** Presence-only payload to real data.

**User value / proposed output:** Silo compartments, crop, litres/capacity, free space, active compartment and transfer progress.

**Source starting point:** scripts/realSiloManager.lua getSilo/getTransfer; realSiloCompartmentStorage.lua getSlots/getActiveSlot; RealSiloUtil.getFarmIdForUid.

**Limits and design constraints:** Read all compartments without double-counting aggregated base storage. Vault version 1.0.0.0 differs from save manifest 1.1.0.2; pin the implementation target.

**Descriptor evidence:** multiplayer flag true; declared prerequisites none in the reviewed descriptor; runtime independence still needs proof. A true flag does not certify dedicated/client behavior.

**Suggested demonstration:** Configure and fill several compartments with different crops. All nine captured entries are unconfigured and empty..

**Reviewed archive reference:** `FS25_369067_RealSilo_Realistic_Silo_Compartments.zip`. Treat this as the captured vault reference; confirm the installed version before implementation.

**Build and closure:** Apply the mandatory recipe above. Implement only fields supported by the verified source, route them through the common status/scope/provenance contract and attach positive/empty/failure/removal evidence. Distinguish an upstream limitation from a reader bug. Never satisfy this item with only an enabled flag.

### A05. Storage Overhaul: Pallet Degradation System

**Catalog reference:** 360720. **Reviewed version:** 1.2.0.0. **Build priority:** Finish first. **Work type:** Presence-only payload to real data.

**User value / proposed output:** Pallet condition, sheltered/exposed state, temporary/permanent damage, value adjustment and at-risk goods.

**Source starting point:** src/PalletMetadata.lua, PalletDegradationManager.lua and PalletPriceModifier.lua contain the owning condition/value logic.

**Limits and design constraints:** Read bounded cached metadata rather than raycasting every pallet again. Show stock only once; quality-adjusted valuation must not multiply the penalty twice.

**Descriptor evidence:** multiplayer flag true; declared prerequisites none in the reviewed descriptor; runtime independence still needs proof. A true flag does not certify dedicated/client behavior.

**Suggested demonstration:** Stage matching sheltered and exposed pallets after genuine time progression. A default enabled flag does not demonstrate this feature..

**Reviewed archive reference:** `FS25_360720_Storage_Overhaul_Pallet_Degradation_System.zip`. Treat this as the captured vault reference; confirm the installed version before implementation.

**Build and closure:** Apply the mandatory recipe above. Implement only fields supported by the verified source, route them through the common status/scope/provenance contract and attach positive/empty/failure/removal evidence. Distinguish an upstream limitation from a reader bug. Never satisfy this item with only an enabled flag.

### A06. Advanced Maintenance

**Catalog reference:** 307003. **Reviewed version:** 1.0.2.0. **Build priority:** Finish first. **Work type:** Fleet adapter.

**User value / proposed output:** Maintenance condition, start/breakdown restriction and service urgency on each relevant vehicle/tool.

**Source starting point:** src/advancedmaintenance.lua and registration script define a distinct maintenance specialisation.

**Limits and design constraints:** Keep this adapter independent of EVM, Realistic Vehicle Service and ADS. Basic damage/fuel remains available without any maintenance mod.

**Descriptor evidence:** multiplayer flag true; declared prerequisites none in the reviewed descriptor; runtime independence still needs proof. A true flag does not certify dedicated/client behavior.

**Suggested demonstration:** One healthy machine, one due machine, and one serviced example using a single maintenance owner..

**Reviewed archive reference:** `FS25_307003_Advanced_Maintenance.zip`. Treat this as the captured vault reference; confirm the installed version before implementation.

**Build and closure:** Apply the mandatory recipe above. Implement only fields supported by the verified source, route them through the common status/scope/provenance contract and attach positive/empty/failure/removal evidence. Distinguish an upstream limitation from a reader bug. Never satisfy this item with only an enabled flag.

### A07. Extended Vehicle Maintenance

**Catalog reference:** 363077. **Reviewed version:** 1.0.0.0. **Build priority:** Later alternative. **Work type:** Fleet adapter.

**User value / proposed output:** Service overdue status, fault type, chosen service route, unavailable-machine state and remaining service time where exposed.

**Source starting point:** scripts/ExtendedVehicleMaintenance.lua and EVMServiceDialog.lua include maintenance, service, collision and fault logic.

**Limits and design constraints:** It already includes collision damage and puncture-style faults. Combining separate mods for the same behaviour is a risk requiring evidence, not an automatic supported preset.

**Descriptor evidence:** multiplayer flag true; declared prerequisites none in the reviewed descriptor; runtime independence still needs proof. A true flag does not certify dedicated/client behavior.

**Suggested demonstration:** Use an alternative fleet scenario rather than installing every maintenance system into one showcase..

**Reviewed archive reference:** `FS25_363077_Extended_Vehicle_Maintenance.zip`. Treat this as the captured vault reference; confirm the installed version before implementation.

**Build and closure:** Apply the mandatory recipe above. Implement only fields supported by the verified source, route them through the common status/scope/provenance contract and attach positive/empty/failure/removal evidence. Distinguish an upstream limitation from a reader bug. Never satisfy this item with only an enabled flag.

### A08. Realistic Vehicle Service

**Catalog reference:** 359741. **Reviewed version:** 1.0.0.0. **Build priority:** Later alternative. **Work type:** Fleet adapter.

**User value / proposed output:** Faults, warm-up/availability and recovery/workshop status as read-only fleet details.

**Source starting point:** scripts/core/FaultSystem.lua and scripts/specs/BreakdownSpec.lua/ImmobilizerSpec.lua.

**Limits and design constraints:** Never invoke towing, repair or key actions just to read status. Coexistence with other start/fault systems needs targeted tests.

**Descriptor evidence:** multiplayer flag true; declared prerequisites none in the reviewed descriptor; runtime independence still needs proof. A true flag does not certify dedicated/client behavior.

**Suggested demonstration:** A separate maintenance variant only after the first fleet adapter is reliable..

**Reviewed archive reference:** `FS25_359741_Realistic_Vehicle_Service.zip`. Treat this as the captured vault reference; confirm the installed version before implementation.

**Build and closure:** Apply the mandatory recipe above. Implement only fields supported by the verified source, route them through the common status/scope/provenance contract and attach positive/empty/failure/removal evidence. Distinguish an upstream limitation from a reader bug. Never satisfy this item with only an enabled flag.

### A09. Seasonal Milk Production

**Catalog reference:** 365513. **Reviewed version:** 1.0.0.1. **Build priority:** Finish first. **Work type:** Presence-only payload to real data.

**User value / proposed output:** Current seasonal milk modifier, phase/next peak and any available health factor beside actual output.

**Source starting point:** scripts/SeasonalMilkProduction.lua:getSeasonalModifier and getHealthModifier.

**Limits and design constraints:** A modifier is not realised milk output or guaranteed forecast. Preserve distinctions between this mod, DairyCore and Ritter data.

**Descriptor evidence:** multiplayer flag true; declared prerequisites none in the reviewed descriptor; runtime independence still needs proof. A true flag does not certify dedicated/client behavior.

**Suggested demonstration:** Use producing dairy animals and capture a genuine seasonal contrast; do not use beef cattle as the milk example..

**Reviewed archive reference:** `FS25_365513_Seasonal_Milk_Production.zip`. Treat this as the captured vault reference; confirm the installed version before implementation.

**Build and closure:** Apply the mandatory recipe above. Implement only fields supported by the verified source, route them through the common status/scope/provenance contract and attach positive/empty/failure/removal evidence. Distinguish an upstream limitation from a reader bug. Never satisfy this item with only an enabled flag.

### A10. Seasonal Wool Production

**Catalog reference:** 356143. **Reviewed version:** 1.0.0.2. **Build priority:** High-value addition. **Work type:** Seasonal livestock.

**User value / proposed output:** Next shearing, accumulation period, health effects and expected fee where source data supports it.

**Source starting point:** scripts/SeasonalWoolAdapter.lua includes distinct vanilla and Realistic Livestock reads; SeasonalWoolProduction.lua owns period state.

**Limits and design constraints:** This source explicitly accommodates Ritter rather than requiring it. Verify live ownership and accumulated values, not only settings.

**Descriptor evidence:** multiplayer flag true; declared prerequisites none in the reviewed descriptor; runtime independence still needs proof. A true flag does not certify dedicated/client behavior.

**Suggested demonstration:** Use sheep that have accumulated wool. The current catalog has seasonal milk but no matching seasonal-wool entry despite the RF save loading it..

**Reviewed archive reference:** `FS25_356143_Seasonal_Wool_Production.zip`. Treat this as the captured vault reference; confirm the installed version before implementation.

**Build and closure:** Apply the mandatory recipe above. Implement only fields supported by the verified source, route them through the common status/scope/provenance contract and attach positive/empty/failure/removal evidence. Distinguish an upstream limitation from a reader bug. Never satisfy this item with only an enabled flag.

### A11. Imperial System Conversion Settings

**Catalog reference:** 368117. **Reviewed version:** 1.1.0.0. **Build priority:** Finish first. **Work type:** Display compatibility.

**User value / proposed output:** Follow the active mod's chosen liquid/crop/mass/measurement settings across existing screens.

**Source starting point:** scripts/UnitConversionManager.lua, UnitConversionData.lua and UnitConversionOverrides.lua.

**Limits and design constraints:** Display-only; this is not an excuse to change prices or inventory arithmetic. Saved profile files cannot activate an inactive mod.

**Descriptor evidence:** multiplayer flag true; declared prerequisites none in the reviewed descriptor; runtime independence still needs proof. A true flag does not certify dedicated/client behavior.

**Suggested demonstration:** Include known grain, liquid, mass and piece-count examples. Test alone, not only with Save Unit Profiles..

**Reviewed archive reference:** `FS25_368117_Imperial_System_Conversion_Settings.zip`. Treat this as the captured vault reference; confirm the installed version before implementation.

**Build and closure:** Apply the mandatory recipe above. Implement only fields supported by the verified source, route them through the common status/scope/provenance contract and attach positive/empty/failure/removal evidence. Distinguish an upstream limitation from a reader bug. Never satisfy this item with only an enabled flag.

### A12. Save Unit Profiles

**Catalog reference:** 362921. **Reviewed version:** 1.2.0.2. **Build priority:** Finish first. **Work type:** Display compatibility.

**User value / proposed output:** Show the selected save's currency and supported unit profile consistently.

**Source starting point:** scripts/SU_Core.lua; regional profile selection is separate from the Imperial fill conversion mod.

**Limits and design constraints:** Per-save/profile/client context must be explicit. Do not require Imperial or British Fill Units.

**Descriptor evidence:** multiplayer flag true; declared prerequisites none in the reviewed descriptor; runtime independence still needs proof. A true flag does not certify dedicated/client behavior.

**Suggested demonstration:** Switch between controlled UK/US/metric demonstrations without cross-save settings leaking..

**Reviewed archive reference:** `FS25_362921_Save_Unit_Profiles.zip`. Treat this as the captured vault reference; confirm the installed version before implementation.

**Build and closure:** Apply the mandatory recipe above. Implement only fields supported by the verified source, route them through the common status/scope/provenance contract and attach positive/empty/failure/removal evidence. Distinguish an upstream limitation from a reader bug. Never satisfy this item with only an enabled flag.

### A13. Livestock Monitor

**Catalog reference:** 367447. **Reviewed version:** 1.0.0.0. **Build priority:** Finish first. **Work type:** Useful enrichment plus native coverage.

**User value / proposed output:** Barn warnings, alert state and supported settings alongside the dashboard's own food/water/health data.

**Source starting point:** scripts/LivestockMonitor.lua, LivestockMonitorAlerts.lua and settings code.

**Limits and design constraints:** The current dashboard reader covers alert/settings fields, not the full detailed barn data described by the catalog. Native livestock monitoring must not require this mod.

**Descriptor evidence:** multiplayer flag true; declared prerequisites none in the reviewed descriptor; runtime independence still needs proof. A true flag does not certify dedicated/client behavior.

**Suggested demonstration:** Show a healthy occupied barn and a genuinely low-resource barn, with the same animal data still visible when this mod is removed..

**Reviewed archive reference:** `FS25_367447_Livestock_Monitor.zip`. Treat this as the captured vault reference; confirm the installed version before implementation.

**Build and closure:** Apply the mandatory recipe above. Implement only fields supported by the verified source, route them through the common status/scope/provenance contract and attach positive/empty/failure/removal evidence. Distinguish an upstream limitation from a reader bug. Never satisfy this item with only an enabled flag.

### A14. Production Watcher

**Catalog reference:** 319635. **Reviewed version:** 1.0.0.0. **Build priority:** Finish first. **Work type:** Useful enrichment plus native coverage.

**User value / proposed output:** Input shortage and output blockage warnings with production context.

**Source starting point:** scripts/ProductionWatcher.lua; the mod has low-input/high-output alert rules.

**Limits and design constraints:** Native production levels and useful warnings must work without Production Watcher. Do not call a summary of alert objects complete production integration.

**Descriptor evidence:** multiplayer flag true; declared prerequisites none in the reviewed descriptor; runtime independence still needs proof. A true flag does not certify dedicated/client behavior.

**Suggested demonstration:** One running production, one starved input and one blocked output. An enabled production with no stored materials is not the full demonstration..

**Reviewed archive reference:** `FS25_319635_Production_Watcher.zip`. Treat this as the captured vault reference; confirm the installed version before implementation.

**Build and closure:** Apply the mandatory recipe above. Implement only fields supported by the verified source, route them through the common status/scope/provenance contract and attach positive/empty/failure/removal evidence. Distinguish an upstream limitation from a reader bug. Never satisfy this item with only an enabled flag.

### A15. Production Schedule

**Catalog reference:** 352788. **Reviewed version:** 1.1.0.0. **Build priority:** High-value addition. **Work type:** Production planning.

**User value / proposed output:** Per-recipe active-month calendar and the reason a production is intentionally paused.

**Source starting point:** Scripts/ProductionSchedule.lua stores self.data by point/recipe, with months/status and owned-production helpers.

**Limits and design constraints:** Do not describe planned seasonal shutdown as a breakdown. Other scheduling controllers may compete for the same recipe state.

**Descriptor evidence:** multiplayer flag true; declared prerequisites none in the reviewed descriptor; runtime independence still needs proof. A true flag does not certify dedicated/client behavior.

**Suggested demonstration:** Schedule one recipe off this month and another on, then show the next activation month..

**Reviewed archive reference:** `FS25_352788_Production_Schedule.zip`. Treat this as the captured vault reference; confirm the installed version before implementation.

**Build and closure:** Apply the mandatory recipe above. Implement only fields supported by the verified source, route them through the common status/scope/provenance contract and attach positive/empty/failure/removal evidence. Distinguish an upstream limitation from a reader bug. Never satisfy this item with only an enabled flag.

### A16. Economic History

**Catalog reference:** 367175. **Reviewed version:** 1.0.0.1. **Build priority:** High-value addition. **Work type:** Finance history.

**User value / proposed output:** Farm-scoped historical income/cost categories, trends and loan/balance history, clearly dating the recorded coverage.

**Source starting point:** src/EconomicHistoryDataCollect.lua FinancialLogger history/current-finance functions and persistent month/farm records.

**Limits and design constraints:** Do not invent history before installation or expose another farm's restricted ledger. Prefer a bounded adapter over arbitrary-path CSV scraping.

**Descriptor evidence:** multiplayer flag true; declared prerequisites none in the reviewed descriptor; runtime independence still needs proof. A true flag does not certify dedicated/client behavior.

**Suggested demonstration:** A save with genuine multi-period activity, not an empty new career..

**Reviewed archive reference:** `FS25_367175_Economic_History.zip`. Treat this as the captured vault reference; confirm the installed version before implementation.

**Build and closure:** Apply the mandatory recipe above. Implement only fields supported by the verified source, route them through the common status/scope/provenance contract and attach positive/empty/failure/removal evidence. Distinguish an upstream limitation from a reader bug. Never satisfy this item with only an enabled flag.

### A17. Task List

**Catalog reference:** 312938. **Reviewed version:** 1.2.0.1. **Build priority:** High-value addition. **Work type:** Read-only work planner.

**User value / proposed output:** Due and upcoming tasks, priorities, recurrence, effort and field/group links.

**Source starting point:** main.lua contains activeTasks/taskGroups and getActiveTasksForCurrentFarm/getTasksForNextYear.

**Limits and design constraints:** The current-farm helper depends on playerUserId; a dedicated exporter needs explicit farm scoping, not a fake player. Do not add remote task mutation in this first scope.

**Descriptor evidence:** multiplayer flag true; declared prerequisites none in the reviewed descriptor; runtime independence still needs proof. A true flag does not certify dedicated/client behavior.

**Suggested demonstration:** One overdue task, one upcoming recurring task and one completed task; basic dashboard operations must still work without Task List..

**Reviewed archive reference:** `FS25_312938_Task_List.zip`. Treat this as the captured vault reference; confirm the installed version before implementation.

**Build and closure:** Apply the mandatory recipe above. Implement only fields supported by the verified source, route them through the common status/scope/provenance contract and attach positive/empty/failure/removal evidence. Distinguish an upstream limitation from a reader bug. Never satisfy this item with only an enabled flag.

### A18. Animal Food Calculator

**Catalog reference:** 338159. **Reviewed version:** 1.1.0.2. **Build priority:** High-value enrichment. **Work type:** Feeding and production rates.

**User value / proposed output:** Active reference/scaling mode and correctly adjusted feed, water, straw and supported production rates.

**Source starting point:** AFCConsumptionScaling.lua:getScaleFactor plus reference manager and actual animal data.

**Limits and design constraints:** AFC can change simulation rates, not just display them. Do not multiply already-scaled live consumption again or assume universal animal-system compatibility.

**Descriptor evidence:** multiplayer flag true; declared prerequisites none in the reviewed descriptor; runtime independence still needs proof. A true flag does not certify dedicated/client behavior.

**Suggested demonstration:** Demonstrate vanilla rate, active scaling and a changing days-per-period setting in controlled variants..

**Reviewed archive reference:** `FS25_338159_Animal_Food_Calculator.zip`. Treat this as the captured vault reference; confirm the installed version before implementation.

**Build and closure:** Apply the mandatory recipe above. Implement only fields supported by the verified source, route them through the common status/scope/provenance contract and attach positive/empty/failure/removal evidence. Distinguish an upstream limitation from a reader bug. Never satisfy this item with only an enabled flag.

### A19. Animal Planner

**Catalog reference:** 368672. **Reviewed version:** 1.0.0.0. **Build priority:** High-value addition. **Work type:** Livestock planning.

**User value / proposed output:** Current and full-capacity consumption/output, feed-cost estimates, herd value growth and supported logistics mode.

**Source starting point:** scripts/AnimalPlannerData.lua:getHusbandryData; admin/logistics modules expose separate capabilities.

**Limits and design constraints:** First release should be read-only. Its logistics/admin features can change behaviour/capacity, so do not silently combine competing distribution controllers.

**Descriptor evidence:** multiplayer flag true; declared prerequisites none in the reviewed descriptor; runtime independence still needs proof. A true flag does not certify dedicated/client behavior.

**Suggested demonstration:** A populated barn with sensible feed stocks and a visible current-versus-full-capacity comparison..

**Reviewed archive reference:** `FS25_368672_Animal_Planner.zip`. Treat this as the captured vault reference; confirm the installed version before implementation.

**Build and closure:** Apply the mandatory recipe above. Implement only fields supported by the verified source, route them through the common status/scope/provenance contract and attach positive/empty/failure/removal evidence. Distinguish an upstream limitation from a reader bug. Never satisfy this item with only an enabled flag.

### A20. Field Profitability Ledger

**Catalog reference:** 369866. **Reviewed version:** 1.0.0.0. **Build priority:** High-value addition. **Work type:** Field economics, SP-limited.

**User value / proposed output:** Per-field/crop-cycle costs, crop value, margin, yield and data-quality confidence.

**Source starting point:** src/services/ReportService.lua and the ledger/export/runtime modules separate reported totals, quality and live/canonical data.

**Limits and design constraints:** The vault descriptor declares multiplayer unsupported. Do not advertise dedicated-server coverage or equate projected crop value with actual sale revenue.

**Descriptor evidence:** multiplayer flag false; declared prerequisites none in the reviewed descriptor; runtime independence still needs proof. A true flag does not certify dedicated/client behavior.

**Suggested demonstration:** A single-player harvest cycle with real input/work/harvest records, plus an incomplete record to demonstrate honest confidence..

**Reviewed archive reference:** `FS25_369866_Field_Profitability_Ledger.zip`. Treat this as the captured vault reference; confirm the installed version before implementation.

**Build and closure:** Apply the mandatory recipe above. Implement only fields supported by the verified source, route them through the common status/scope/provenance contract and attach positive/empty/failure/removal evidence. Distinguish an upstream limitation from a reader bug. Never satisfy this item with only an enabled flag.

### A21. VIP Order Manager

**Catalog reference:** 310861. **Reviewed version:** 1.2.1.0. **Build priority:** High-value addition. **Work type:** Orders, SP-limited.

**User value / proposed output:** Current VIP order, deliveries remaining, destination, reward and upcoming orders.

**Source starting point:** VIPOrderManager.lua and gui/OrderFrame.lua expose order quantities, delivered fill levels, payout and destination.

**Limits and design constraints:** The reviewed version and official listing do not support multiplayer. Read-only progress, not automatic delivery/cancellation.

**Descriptor evidence:** multiplayer flag false; declared prerequisites none in the reviewed descriptor; runtime independence still needs proof. A true flag does not certify dedicated/client behavior.

**Suggested demonstration:** Partially fulfil a real order; show what remains and the next order without implying it can already be delivered..

**Reviewed archive reference:** `FS25_310861_VIP_Order_Manager.zip`. Treat this as the captured vault reference; confirm the installed version before implementation.

**Build and closure:** Apply the mandatory recipe above. Implement only fields supported by the verified source, route them through the common status/scope/provenance contract and attach positive/empty/failure/removal evidence. Distinguish an upstream limitation from a reader bug. Never satisfy this item with only an enabled flag.

### A22. Farm Reputation

**Catalog reference:** 367320. **Reviewed version:** 1.1.0.0. **Build priority:** Useful later. **Work type:** Contracts with genuine dependency.

**User value / proposed output:** Farm/contractor reputation, rank progress, limits, evaluation and unlocked opportunities.

**Source starting point:** scripts/ReputationManager.lua stores reputationByFarm/contractorDataByFarm; AKF evaluation readers provide the breakdown.

**Limits and design constraints:** Requires Better Contracts by descriptor and official listing. That is a real upstream dependency; our other adapters must not inherit it.

**Descriptor evidence:** multiplayer flag true; declared prerequisites FS25_BetterContracts. A true flag does not certify dedicated/client behavior.

**Suggested demonstration:** Better Contracts plus Farm Reputation alone, followed by a compatible mixed pack. Show recorded progress, not a zero-rank placeholder..

**Reviewed archive reference:** `FS25_367320_Farm_Reputation.zip`. Treat this as the captured vault reference; confirm the installed version before implementation.

**Build and closure:** Apply the mandatory recipe above. Implement only fields supported by the verified source, route them through the common status/scope/provenance contract and attach positive/empty/failure/removal evidence. Distinguish an upstream limitation from a reader bug. Never satisfy this item with only an enabled flag.

### A23. Yield Tracker

**Catalog reference:** 326441. **Reviewed version:** 1.0.0.2. **Build priority:** Useful later. **Work type:** Harvest history, SP-limited.

**User value / proposed output:** Field/year/crop yield trends where the mod has actual captured harvest history.

**Source starting point:** scripts/yieldTracker.lua and trackedCropTypes.lua.

**Limits and design constraints:** The reviewed package is single-player-only and enumerates supported fill types; do not promise every Montana multifruit crop.

**Descriptor evidence:** multiplayer flag false; declared prerequisites none in the reviewed descriptor; runtime independence still needs proof. A true flag does not certify dedicated/client behavior.

**Suggested demonstration:** A supported crop with completed harvest records; explicitly distinguish unsupported crops..

**Reviewed archive reference:** `FS25_326441_Yield_Tracker.zip`. Treat this as the captured vault reference; confirm the installed version before implementation.

**Build and closure:** Apply the mandatory recipe above. Implement only fields supported by the verified source, route them through the common status/scope/provenance contract and attach positive/empty/failure/removal evidence. Distinguish an upstream limitation from a reader bug. Never satisfy this item with only an enabled flag.

### A24. Moisture System

**Catalog reference:** 354130. **Reviewed version:** 2.0.0.3. **Build priority:** Useful later. **Work type:** Moisture and quality provider.

**User value / proposed output:** Available crop/material moisture, quality and storage/harvest warnings.

**Source starting point:** The package has dedicated moisture/quality runtime code rather than only a visual HUD.

**Limits and design constraints:** Feasible candidate, not a certified adapter. Review exact ownership and compatibility against RF crop stress, Realistic Weather and other drying mods before adopting a combined preset.

**Descriptor evidence:** multiplayer flag true; declared prerequisites none in the reviewed descriptor; runtime independence still needs proof. A true flag does not certify dedicated/client behavior.

**Suggested demonstration:** A separate moisture-focused variant with real wet/dry and storage states..

**Reviewed archive reference:** `FS25_354130_Moisture_System.zip`. Treat this as the captured vault reference; confirm the installed version before implementation.

**Build and closure:** Apply the mandatory recipe above. Implement only fields supported by the verified source, route them through the common status/scope/provenance contract and attach positive/empty/failure/removal evidence. Distinguish an upstream limitation from a reader bug. Never satisfy this item with only an enabled flag.

### A25. Silage Compaction Monitor

**Catalog reference:** 349039. **Reviewed version:** 1.1.0.0. **Build priority:** Prefer native first. **Work type:** Silage planning.

**User value / proposed output:** Bunker fill and compaction, plus a clearly labelled equipment-dependent time estimate where available.

**Source starting point:** Compaction_Monitor.lua reads bunker and vehicle/implement mass context.

**Limits and design constraints:** Core bunker progress should not require this HUD mod. Its current-vehicle estimate is not necessarily available on an unattended dedicated server.

**Descriptor evidence:** multiplayer flag true; declared prerequisites none in the reviewed descriptor; runtime independence still needs proof. A true flag does not certify dedicated/client behavior.

**Suggested demonstration:** One partly compacted bunker; preserve useful native information when no player is driving..

**Reviewed archive reference:** `FS25_349039_Silage_Compaction_Monitor.zip`. Treat this as the captured vault reference; confirm the installed version before implementation.

**Build and closure:** Apply the mandatory recipe above. Implement only fields supported by the verified source, route them through the common status/scope/provenance contract and attach positive/empty/failure/removal evidence. Distinguish an upstream limitation from a reader bug. Never satisfy this item with only an enabled flag.

### A26. Field Leasing

**Catalog reference:** 338381. **Reviewed version:** 1.0.0.1. **Build priority:** Useful later. **Work type:** Land tenure.

**User value / proposed output:** Leased fields, monthly payments, minimum term and termination eligibility.

**Source starting point:** Field Leasing's agreement/manager source records rental contracts separately from simple land ownership.

**Limits and design constraints:** Distinct from renting your own land out and multiplayer marketplace deals. Never label leased land as permanently owned.

**Descriptor evidence:** multiplayer flag true; declared prerequisites none in the reviewed descriptor; runtime independence still needs proof. A true flag does not certify dedicated/client behavior.

**Suggested demonstration:** One leased field plus an owned field for comparison..

**Reviewed archive reference:** `FS25_338381_Field_Leasing.zip`. Treat this as the captured vault reference; confirm the installed version before implementation.

**Build and closure:** Apply the mandatory recipe above. Implement only fields supported by the verified source, route them through the common status/scope/provenance contract and attach positive/empty/failure/removal evidence. Distinguish an upstream limitation from a reader bug. Never satisfy this item with only an enabled flag.

### A27. Rent Your Field

**Catalog reference:** 356641. **Reviewed version:** 1.0.0.1. **Build priority:** Useful later. **Work type:** Land income.

**User value / proposed output:** Fields rented out, rent income, minimum duration and early-termination liability.

**Source starting point:** src/RentAgreement.lua and RentYourFieldManager.lua.

**Limits and design constraints:** Owner and operator can differ. A generic farm-ownership filter must not pretend rented-out land is currently worked by the player.

**Descriptor evidence:** multiplayer flag true; declared prerequisites none in the reviewed descriptor; runtime independence still needs proof. A true flag does not certify dedicated/client behavior.

**Suggested demonstration:** One active outward rental with a visible next-payment/termination story..

**Reviewed archive reference:** `FS25_356641_Rent_Your_Field.zip`. Treat this as the captured vault reference; confirm the installed version before implementation.

**Build and closure:** Apply the mandatory recipe above. Implement only fields supported by the verified source, route them through the common status/scope/provenance contract and attach positive/empty/failure/removal evidence. Distinguish an upstream limitation from a reader bug. Never satisfy this item with only an enabled flag.

### A28. Farmland Marketplace

**Catalog reference:** 369241. **Reviewed version:** 1.0.4.0. **Build priority:** Useful later. **Work type:** Multiplayer land business.

**User value / proposed output:** Pending offers, accepted sale/lease agreements, owner/operator and farm-specific obligations.

**Source starting point:** Package is explicitly multiplayer-only; offer/acceptance changes land use and money.

**Limits and design constraints:** Needs a real multi-farm multiplayer demonstration, not either single-player Montana save.

**Descriptor evidence:** multiplayer flag true; declared prerequisites none in the reviewed descriptor; runtime independence still needs proof. A true flag does not certify dedicated/client behavior.

**Suggested demonstration:** A separate MP snapshot after a verified two-farm agreement; publish only permitted public/demo data..

**Reviewed archive reference:** `FS25_369241_Farmland_Marketplace.zip`. Treat this as the captured vault reference; confirm the installed version before implementation.

**Build and closure:** Apply the mandatory recipe above. Implement only fields supported by the verified source, route them through the common status/scope/provenance contract and attach positive/empty/failure/removal evidence. Distinguish an upstream limitation from a reader bug. Never satisfy this item with only an enabled flag.

### A29. Distribution Redux

**Catalog reference:** 365583. **Reviewed version:** 1.0.0.1. **Build priority:** Later complex integration. **Work type:** Production logistics.

**User value / proposed output:** Distribution modes, sources/destinations, effective demand and available transfer statistics.

**Source starting point:** SmartDistribution.lua getAssetMode/getAssetSellTiming and distribution stats/events.

**Limits and design constraints:** Only export available observed state, not invented routes. Test with RealSilo, Animal Planner and other distribution modifiers; start read-only.

**Descriptor evidence:** multiplayer flag true; declared prerequisites none in the reviewed descriptor; runtime independence still needs proof. A true flag does not certify dedicated/client behavior.

**Suggested demonstration:** A small two-production supply chain before attempting a fully mixed logistics pack..

**Reviewed archive reference:** `FS25_365583_Distribution_Redux.zip`. Treat this as the captured vault reference; confirm the installed version before implementation.

**Build and closure:** Apply the mandatory recipe above. Implement only fields supported by the verified source, route them through the common status/scope/provenance contract and attach positive/empty/failure/removal evidence. Distinguish an upstream limitation from a reader bug. Never satisfy this item with only an enabled flag.

### A30. Factory Profit Calculator

**Catalog reference:** 368477. **Reviewed version:** 1.0.0.1. **Build priority:** Finish catalog coverage. **Work type:** Production economics.

**User value / proposed output:** Effective recipes/cycles/capacities and clearly labelled expected margin at current prices.

**Source starting point:** Factory Profit Calculator includes a calculator and an administrator recipe/capacity editor.

**Limits and design constraints:** Read modified live recipes, not original XML, and distinguish expected from realised profit. Do not export admin write controls publicly.

**Descriptor evidence:** multiplayer flag true; declared prerequisites none in the reviewed descriptor; runtime independence still needs proof. A true flag does not certify dedicated/client behavior.

**Suggested demonstration:** One genuinely modified recipe and one standard recipe, both independently matched to in-game values..

**Reviewed archive reference:** `FS25_368477_Factory_Profit_Calculator.zip`. Treat this as the captured vault reference; confirm the installed version before implementation.

**Build and closure:** Apply the mandatory recipe above. Implement only fields supported by the verified source, route them through the common status/scope/provenance contract and attach positive/empty/failure/removal evidence. Distinguish an upstream limitation from a reader bug. Never satisfy this item with only an enabled flag.

### A31. Farm Operations Dashboard

**Catalog reference:** 364188. **Reviewed version:** 1.1.0.0. **Build priority:** Prefer native first. **Work type:** Operations overview.

**User value / proposed output:** A unified what-needs-attention board across existing fields, animals, production, fleet and markets.

**Source starting point:** FarmOperationsDashboard.lua is another view over much of the same native game state.

**Limits and design constraints:** Do not make our basic dashboard depend on another dashboard. Learn the useful product requirements without copying implementation or creating two competing totals.

**Descriptor evidence:** multiplayer flag true; declared prerequisites none in the reviewed descriptor; runtime independence still needs proof. A true flag does not certify dedicated/client behavior.

**Suggested demonstration:** Demonstrate our own native overview with this mod absent; optional recognition can remain informational..

**Reviewed archive reference:** `FS25_364188_Farm_Operations_Dashboard.zip`. Treat this as the captured vault reference; confirm the installed version before implementation.

**Build and closure:** Apply the mandatory recipe above. Implement only fields supported by the verified source, route them through the common status/scope/provenance contract and attach positive/empty/failure/removal evidence. Distinguish an upstream limitation from a reader bug. Never satisfy this item with only an enabled flag.

### Additional advertised capabilities that must not fall through the list

#### Dynamic Market

Audit the actual effective selling-price/history/state surfaces for the pinned version. Presence-only output is not a market curve. Distinguish observed current price from base/forecast and coordinate with RF Market Dynamics or seasonal pricing using documented ownership. Use real current-price and history fixtures; do not multiply an effective price again.

#### Soil Work Yield Bonus

Read the actual saved/runtime worked-field coverage or bonus state from the pinned mod; a header-only settings file contains no demonstrated work. Preserve provider/field identity, unavailable versus zero coverage and the actual algorithm's meaning. Add real worked and unworked test cases and compare the demo after normal implement operation.

#### Existing RF collectors

Use the active registry and shared status/scope/provenance contract for the existing RF collector set. Audit only the owning collector for a demonstrated mismatch; do not wholesale rewrite the upstream RF suite. Verify enabled provider state, effective values and farm scope per advertised capability, retaining documented optional Ritter/weather bridges.

#### Additional existing catalog entries

Compare the checked-in catalog with the runtime producer and UI. Every advertised liveKey must resolve to useful typed data or an explicit limited/detection-only state. Expand the ledger beyond the 31 recommendations where current product claims require it; the vault sample does not define an artificial maximum scope.

#### Native bunker and operations information

Use native bunker fill/fermentation/compaction and existing field/fleet/production/animal state before depending on Silage Compaction Monitor or Farm Operations Dashboard. A vehicle-specific compaction estimate is optional and must not be promised on a dedicated server without its required context.

## 6. Catalog corrections: all ten must be accounted for

These corrections concern observed source meaning and support claims. Updating wording alone does not implement a missing reader. Preserve author attribution and do not imply ownership of another mod.

### CC01. Stall Rental

**Replace the incorrect claim:** Described as renting stall capacity rather than owning a building.

**Correct meaning:** It pays boarding income for qualifying healthy horses in your stalls. Useful output is eligible horses and income, not a rent-expense/capacity contract.

**Source basis:** StallRental.lua:2-3, 74 onward.

**Original catalog location:** [catalog.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/companionMods/catalog.ts:267).

**Acceptance:** Catalog category, description, support tier, exported capability and UI text agree. Existing fake/placeholder data is either implemented or explicitly labelled detection-only.

### CC02. Animal Food Overview

**Replace the incorrect claim:** Described as viewing food/water stock across barns.

**Correct meaning:** The package explains animal feed groups and their accepted food types. Treat it as a feed-reference enhancement; barn stock monitoring is a separate capability.

**Source basis:** modDesc.xml and the feed-group dialog implementation.

**Original catalog location:** [catalog.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/companionMods/catalog.ts:218).

**Acceptance:** Catalog category, description, support tier, exported capability and UI text agree. Existing fake/placeholder data is either implemented or explicitly labelled detection-only.

### CC03. Smart Crop Control

**Replace the incorrect claim:** Described vaguely as planning what the player should plant.

**Correct meaning:** It controls selected NPC crop allocation by field size and category. Surface the active rules if useful, not a fictional player-crop planner.

**Source basis:** modDesc.xml and its NPC-field control script.

**Original catalog location:** [catalog.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/companionMods/catalog.ts:160).

**Acceptance:** Catalog category, description, support tier, exported capability and UI text agree. Existing fake/placeholder data is either implemented or explicitly labelled detection-only.

### CC04. Production Control

**Replace the incorrect claim:** Described as prioritising production chains.

**Correct meaning:** Its main feature is adjustable production speed from 50% to 300%, with operating-cost consequences. Show effective speed/cost and live recipe values.

**Source basis:** modDesc.xml and production-control Lua.

**Original catalog location:** [catalog.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/companionMods/catalog.ts:284).

**Acceptance:** Catalog category, description, support tier, exported capability and UI text agree. Existing fake/placeholder data is either implemented or explicitly labelled detection-only.

### CC05. Out Of Fuel

**Replace the incorrect claim:** Described mainly as extra fuel warnings or harsher engine stopping.

**Correct meaning:** It removes the automatic safety fuel top-up on save load. Basic dashboard fuel warnings are native functionality, not dependent on this mod.

**Source basis:** modDesc.xml and on-load fuel hook.

**Original catalog location:** [catalog.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/companionMods/catalog.ts:358).

**Acceptance:** Catalog category, description, support tier, exported capability and UI text agree. Existing fake/placeholder data is either implemented or explicitly labelled detection-only.

### CC06. Bushel Plus

**Replace the incorrect claim:** Classified in the units category despite a partly corrected description.

**Correct meaning:** It is a combine calibration/harvest-loss system, not a global volume-unit converter. Reclassify to fleet/harvest and read actual specialised values before promising metrics.

**Source basis:** modDesc.xml and combine specialisation.

**Original catalog location:** [catalog.ts](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/companionMods/catalog.ts:432).

**Acceptance:** Catalog category, description, support tier, exported capability and UI text agree. Existing fake/placeholder data is either implemented or explicitly labelled detection-only.

### CC07. Ingame Time Operating Hours

**Replace the incorrect claim:** Catalog mentions scaled operating hours without the fuel-consumption consequence.

**Correct meaning:** The mod scales operating hours and fuel consumption with game time. Do not double-scale exported readings or imply it only changes a label.

**Source basis:** modDesc.xml and time-scaled runtime hooks.

**Acceptance:** Catalog category, description, support tier, exported capability and UI text agree. Existing fake/placeholder data is either implemented or explicitly labelled detection-only.

### CC08. Enhanced Seasonal Prices

**Replace the incorrect claim:** Catalog frames it mainly as deeper selling-price seasonality.

**Correct meaning:** The package also changes buying prices and requires its Seasonal Prices base package. Read effective buy/sell prices and record the declared dependency.

**Source basis:** modDesc.xml dependencies and SeasonalPrices.lua.

**Acceptance:** Catalog category, description, support tier, exported capability and UI text agree. Existing fake/placeholder data is either implemented or explicitly labelled detection-only.

### CC09. Animal Trader

**Replace the incorrect claim:** Catalog suggests a generic alternative animal trading flow.

**Correct meaning:** This particular vault mod is a placeable business with specific buying/selling and rent mechanics. Most useful dashboard data belongs in existing placeable/finance views.

**Source basis:** modDesc.xml placeable description.

**Acceptance:** Catalog category, description, support tier, exported capability and UI text agree. Existing fake/placeholder data is either implemented or explicitly labelled detection-only.

### CC10. RealSilo, Dynamic Market, pallet degradation, soil work bonus and seasonal milk

**Replace the incorrect claim:** A liveKey/catalog card can be mistaken for a live data integration.

**Correct meaning:** The current companion producer emits enabled=true placeholders for these blocks. Detection is useful but must not be advertised as reading compartments, condition, market curves, field coverage or milk factors.

**Source basis:** FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua:919-935.

**Acceptance:** Catalog category, description, support tier, exported capability and UI text agree. Existing fake/placeholder data is either implemented or explicitly labelled detection-only.

## 7. Independence and shared-provider combination rules

The goal is no artificial dashboard dependencies. It is not a promise that arbitrary upstream mods can never conflict. Represent actual prerequisites and version/configuration-specific conflicts, then constrain tests and claims accordingly. Two mods with similar names/topics do not automatically conflict; two writers of the same value need source-backed ownership or composition.

### COM01. PF and RF Soil Fertilizer

**Classification:** Explicit source exclusion.

**Captured source evidence:** Installed SoilFertilityManager.lua:593-607 disables RF Soil when PF is detected.

**Build/configuration rule:** Keep the separate PF and RF showcase presets. Show a disabled/conflict reason rather than falsely active RF soil.

**Limit of the evidence:** This is evidence about the reviewed Soil Fertilizer version, not a blanket assertion that every RF-family mod conflicts with PF.

### COM02. Diesel price writers

**Classification:** Confirmed competing write targets.

**Captured source evidence:** RDP RealisticDieselPrice.lua:106, FDP.lua:29-33 and RF FuelPriceEngine.lua:110 all write DIESEL.pricePerLiter. Savegame19 includes both RF Fuel Costs and Realistic Diesel Price.

**Build/configuration rule:** Choose or verify one effective price owner per preset. Audit configuration/timing before declaring the current stack safe; the old conflict list omitted RF Fuel Costs.

**Limit of the evidence:** The exact observed overwrite/order is not live-tested here. A loaded package might have an inactive price feature.

### COM03. ELS versus vanilla-credit automation

**Classification:** Different debt models / policy conflict.

**Captured source evidence:** ELS replaces vanilla credit with its own loans. NoCredit sets Farm.MIN_LOAN/MAX_LOAN to zero. I Need A Loan and Automatic Loan Repay target vanilla credit behaviour.

**Build/configuration rule:** Keep ELS distinct from incompatible vanilla-credit policies unless an explicit bridge is proven. I Need A Loan plus Automatic Loan Repay is a sensible candidate combination, not a mandatory pair.

**Limit of the evidence:** NoCredit is not a required dependency, and an opposite loan policy is not necessarily a game crash.

### COM04. Units

**Classification:** Potential shared-formatting override.

**Captured source evidence:** Imperial and British-style formatters may own the same surfaces; Save Unit Profiles chooses per-save settings and can be complementary.

**Build/configuration rule:** Use one clear fill-format owner in marketing presets. Test Save Unit Profiles alone and with each supported formatter.

**Limit of the evidence:** Do not reject every pair just because they are all in a units category.

### COM05. Maintenance, collision and tyre faults

**Classification:** Overlapping behaviour; pair-specific proof required.

**Captured source evidence:** EVM includes collision/fault/puncture behaviour itself; other maintenance and fault mods can affect the same vehicle state.

**Build/configuration rule:** Use one main maintenance system per simple demo. Test specific additive combinations and preserve previously verified setups.

**Limit of the evidence:** Shared subject matter is a risk signal, not proof every combination is impossible.

### COM06. Market Dynamics + Dynamic Market + seasonal pricing

**Classification:** Price-model overlap needs configured-state audit.

**Captured source evidence:** Savegame19 lists RF Market Dynamics and Dynamic Market. Their price hooks operate in related selling-price paths.

**Build/configuration rule:** Expose effective current prices and contributing provider/settings; use one primary model for the first clear showcase.

**Limit of the evidence:** No claim of a proven crash or unconditional incompatibility. Do not multiply already-modified prices again.

### COM07. RCC weather/yield + RF crop stress + Realistic Weather

**Classification:** Settings-dependent overlap and intentional integration.

**Captured source evidence:** RCC weather/yield are optional and currently off. SCS contains a WeatherIntegration path for Realistic Weather.

**Build/configuration rule:** Calendar-only RCC can be assessed separately from RCC weather/yield. Respect existing optional bridges and test stacking when extra modifiers are enabled.

**Limit of the evidence:** Do not categorically ban Realistic Weather with RF simply because both concern weather.

### COM08. DairyCore / Ritter / seasonal milk and wool / AFC

**Classification:** Mixed intentional bridges and rate overlap.

**Captured source evidence:** DairyCore has an optional Ritter bridge with Standard mode; Seasonal Wool has separate vanilla/Ritter adapters; AFC can change consumption/output rates.

**Build/configuration rule:** Resolve the owning source per metric and do not double-apply factors. Preserve optional integration instead of making Ritter a prerequisite.

**Limit of the evidence:** The complete combined animal pack still needs live comparison. Saved Ritter records must be scoped through its own identity, not only vanilla clusters.

### COM09. Additional Contracts + Better Contracts / animal variants

**Classification:** No declared Better Contracts dependency; feature-specific caveat.

**Captured source evidence:** Additional Contracts has no Better Contracts descriptor dependency. Better Contracts changelog explicitly acknowledges it. Animal-dealer contracts warn about unsupported Realistic Livestock variants.

**Build/configuration rule:** Test Additional Contracts alone and together with Better Contracts. Restrict the specific animal-contract capability if unsupported, not all unrelated contract data.

**Limit of the evidence:** Descriptor absence alone is not universal proof of independence; retain runtime/API checks.

### COM10. Production scheduling/distribution/capacity modifiers

**Classification:** Shared-state overlap.

**Captured source evidence:** Production Schedule, Productions Manager, Production Control, Factory Profit Calculator, Distribution Redux and Animal Planner can affect different but intersecting recipe/logistics/capacity state.

**Build/configuration rule:** Read final effective values and identify the owning setting; exercise combinations intentionally instead of adding all controllers to a showcase.

**Limit of the evidence:** Do not assume all production mods conflict; pure readers can coexist.

### COM11. True declared dependencies

**Classification:** Verified metadata requirements.

**Captured source evidence:** Farm Reputation -> Better Contracts; Demand-oriented Application Rate -> PF; Enhanced Seasonal Prices -> Seasonal Prices base; FilterYears/Through The Years/Disable GPS By Year -> Vehicle Years; several tool packs -> their base packages.

**Build/configuration rule:** Represent these edges explicitly and allow each dashboard adapter with only its actual prerequisites. The full inventory records the descriptor dependencies.

**Limit of the evidence:** Do not fabricate standalone operation for a genuine upstream add-on.

### COM12. Deployment mode

**Classification:** Explicit upstream limits.

**Captured source evidence:** VIP Order Manager, Yield Tracker and Field Profitability Ledger descriptors are single-player-only; Farmland Marketplace is explicitly multiplayer-only.

**Build/configuration rule:** Add SP/MP/dedicated capability labels and use a correct-mode demo for each feature.

**Limit of the evidence:** Our dashboard cannot confer multiplayer support on an upstream mod by successfully parsing its JSON.

### How to build the combination campaign

1. Create one row per capability with canonical runtime ID, exact version, dependencies, optional bridges, SP/MP modes and shared-value writers. Save the rule set used to generate configurations.
2. Run base-only first with unrelated ZIPs installed but inactive. This proves inventory does not activate adapters or unit modes.
3. Run Farm Dashboard + X + only genuine prerequisites for every claimed adapter X. Include a meaningful populated state and legitimate empty state. These are the independence proofs.
4. Generate constrained pairwise combinations for the selected release support set, respecting real upstream constraints. Record every excluded pair and reason; unknown pairs are NOT TESTED, not known conflicts.
5. Add explicit multi-mod tests where pairwise is insufficient: animal/seasonal/rate stacks, market/fuel writers, units/profile ownership, production/distribution and maintenance faults.
6. Run the applicable SP, MP host, joining client and dedicated modes. A missing MP setup blocks only that claim; do not manufacture MP proof from a Lua fixture.
7. Record transitions: deactivate X, leave/reload save, change farm/source, restart app, restore offline. Check for stale presence, old units, resurrected rows and cross-farm totals.
8. Record exact versions and configured features. If a provider/version changes, re-run affected minimum-set, dependency, high-risk combination and demo cases.
9. Describe pairwise coverage accurately. Exhaustive testing of every subset of a large mod set is not feasible; isolated adapters, explicit ownership and targeted high-risk stacks reduce risk but do not prove all possible combinations.

## 8. Test implementation, commands and evidence

### Tests must execute production behavior

The existing field test at [xmlCollector.fields.test.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/tests/xmlCollector.fields.test.js:7) constructs its own parser/helpers. Refactor test entry points to call production code without changing runtime behavior solely to make tests easy. The malformed fallback test at [modConfigXml.test.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/tests/modConfigXml.test.js:87) must instead protect existing data. The exact collision fixture at [modConfigXml.test.js](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/tests/modConfigXml.test.js:24) is valuable and must remain.

Cover the real chain: parser/collector -> dataMerger -> live hold -> last-good persistence -> freshness stamping -> normalized selectors -> displayed semantics. A helper-only green result does not certify later layers. Use real-shaped game-source fixtures and separate mod environments, not synthetic globals that hide namespace bugs.

### Additional named regression cases

#### X01. Malformed config full save

**Setup:** Provide an existing malformed config file and change a mod-domain setting through the real save entry point.

**Expected:** The attempted domain fails clearly; original content is unchanged; any separately successful UI domain is reported accurately.

#### X02. Display-only UI save

**Setup:** Use the exact state-machine/module-name collision fixture and change only a theme/navigation/unit display preference.

**Expected:** Zero mod-config writes; no forced collector enable/disable; display preference persists.

#### X03. Production field parser

**Setup:** Use nested fieldStates fixture via the production xmlCollector entry point, then merge and normalized selectors.

**Expected:** Actual field rows are extracted; removing/breaking the production extraction causes the regression to fail. No local copied algorithm is used as the assertion target.

#### X04. Second mission one-shot

**Setup:** Load save A, return to menu, load save B in the same process with the corrected one-shot mission notification.

**Expected:** B re-arms correctly, starts once and rejects every late A result.

#### X05. Companion error with cached data

**Setup:** Successfully read two adapters, then make only one reader throw with diagnostics off.

**Expected:** Healthy adapter continues; failing adapter has a bounded visible error and explicitly older last-known data, never a healthy-zero placeholder.

#### X06. Farm zero versus missing

**Setup:** Farm A confirmed zero ELS loans, farm B nonzero; repeat with A not covered by the read.

**Expected:** A is zero in the first case and unknown in the second, never B's aggregate. Explicit aggregate mode reconciles separately.

#### X07. All-zero stock survives restart

**Setup:** Collect positive stock, empty it through the game, complete collection, close app and restore offline.

**Expected:** Zero remains authoritative through every hold/backup/persistence layer.

#### X08. Disabled provider versus stale detail

**Setup:** Collect RF soil, disable the RF provider on a safe test profile and load a PF/base career.

**Expected:** Old RF enrichment/units/presence cannot appear active or override the selected provider.

#### X09. Full vault inactive

**Setup:** Leave many packages installed but activate only Farm Dashboard on the baseline save.

**Expected:** No companion or unit detection comes from inventory or stale settings files; normal update performs no vault scan.

#### X10. Public demo cross-visitor isolation

**Setup:** Two browser contexts choose distinct recorded demos and rapidly switch with delayed responses.

**Expected:** Each remains scoped to its chosen demo/generation; neither changes the live host server or another visitor.

#### X11. Public demo negative requests

**Setup:** Attempt safe unauthorized write requests, unsupported demo IDs, traversal-shaped asset IDs and oversized/untrusted fixture fields against test routes.

**Expected:** Requests are rejected or safely bounded; no arbitrary read/write, secret disclosure or script execution. This is a proposed acceptance test, not a claim those vulnerabilities exist.

#### X12. Clean install versus upgraded install

**Setup:** Use the same exact candidate on isolated fresh state and preserved prior supported settings with an intentional disabled collector.

**Expected:** Both paths render setup/dashboard and correct live data; upgrade retains preferences and canonical identity; uninstall registration works.

#### X13. Rate/price/seasonal modifier ownership

**Setup:** Use documented high-risk pairs/stacks with known game-current values and a controlled change.

**Expected:** Dashboard reads the final effective value once, labels any estimate and avoids duplicate inventory/rate/price adjustments.

#### X14. Measured freshness with equal-sized output

**Setup:** Produce two complete generations with equal byte length and retain one intentionally older section.

**Expected:** Generation/commit proves progress while the held section retains its older sample age. File size growth is not required.

### Original audit scenarios retained in scope

These are required scenario definitions carried forward, not completed results. Their setup references come from the captured audit and must be reconciled with current working-copy identity.

#### T01. Base game with vault mods installed but inactive

**Setup:** Use the documented Riverbend base/demo slot 4 only if present; otherwise a disposable approved base-game copy. Keep extra ZIPs installed but inactive.

**Expected:** No false companion or Imperial activation. Vanilla field/fertiliser/lime meanings remain correct. Full export replaces bootstrap.

**Coverage:** F01, F02, F04, F10.

#### T02. Precision Farming field measurements

**Setup:** Documented PF Riverbend slot 3, if available. Compare unscanned, scanned and target-only/current-zero conditions on disposable test data.

**Expected:** Current nitrogen/pH agree with the game. Unknown is not zero. Lime/fertiliser information is not suppressed by stale RF state.

**Coverage:** F08-F10.

#### T03. Montana RF with the actual companion pack

**Setup:** Current savegame19 configuration, with BritishFillUnits and actually loaded RF/companion mods recorded from the game.

**Expected:** Fields and expected companion payloads populate; per-mod API status explains any unsupported reader; useful values match the same farm/save.

**Coverage:** F01, F04-F07, F11.

#### T04. Montana PF / alternate unit pack

**Setup:** Documented slot 18 scenario only if present and confirmed; record the actual Imperial/companion activation rather than assuming it.

**Expected:** PF provider and the actual active unit mod own their values. No inherited RF/British state from savegame19.

**Coverage:** F04, F05, F08, F10.

#### T05. Settings without mod edits

**Setup:** Open Settings, change one display-only preference, save, then reload. Also exercise the exact XML suffix-collision fixture.

**Expected:** Collector module settings are untouched. An actual mod save failure remains visible and unsaved.

**Coverage:** F03.

#### T06. Two farms with contrasting loans

**Setup:** Farm A has zero loans; farm B has loans. Include an asset-empty or production-only valid selected farm.

**Expected:** Farm A stays zero or unknown according to read completeness, never inherits B's totals, and selection is respected.

**Coverage:** F06, F07.

#### T07. Missing or late companion API

**Setup:** Active mod with delayed initialisation, unsupported API and one deliberately throwing adapter in a controlled fixture.

**Expected:** Unavailable/failed is explicit. No spreading-allowed/no-loans/vanilla-calendar invention. Other companions remain populated.

**Coverage:** F05, F06, F11.

#### T08. Complete empty and disabled transitions

**Setup:** Fixtures or disposable save: sell the final animal/stock, remove a production entry, then disable a provider for a new session.

**Expected:** Empty/disabled replaces old state through live merge, last-good persistence and app restart.

**Coverage:** F08.

#### T09. Fresh export with stale held section

**Setup:** A new export commits while one section legitimately retains its prior same-session sample.

**Expected:** Transport can be live while that section is labelled held/stale with its original sample age.

**Coverage:** F09.

#### T10. Save reload and rapid server switch

**Setup:** Return to menu/load another save in the same game process; switch dashboard servers while a previous request is delayed.

**Expected:** Exactly one new lifecycle initialises. Old callbacks/fields/units/mods cannot contaminate the new selection.

**Coverage:** F02, F04, F08.

#### T11. Malformed or incomplete export

**Setup:** Use input fixtures and disposable outputs, not the live save. Include truncated JSON, read failure and a collector exception.

**Expected:** Last valid history survives but is not labelled a new successful live collection. Errors are bounded and visible.

**Coverage:** F01, F08, F11.

#### T12. Offline continuity and recovery

**Setup:** After a valid live sample, close the game/connection and reopen the dashboard, then restore live collection.

**Expected:** Last-known data remains usable with honest age. Recovery replaces it only with valid identity-matched sections.

**Coverage:** F08, F09.

#### T13. Units and quantity integrity

**Setup:** No unit mod, British-only and Imperial-only; compare known liquid, crop and mass quantities, zero and missing metadata.

**Expected:** Displayed conversions match the active source; underlying canonical quantities and economic totals do not change.

**Coverage:** F04, F05.

#### T14. Packaged multiplayer/dedicated acceptance

**Setup:** The final canonical ZIP, no loose deployment; host/client/dedicated arrangements actually advertised by the product.

**Expected:** Supported scope is explicit; authority and farm permissions are correct; no loose-mod restriction; actual session proof recorded.

**Coverage:** F02, F05, F07, F12.

#### T15. Protected end-user journeys

**Setup:** Final installed V5 candidate: setup, dashboard, fields, companions, fleet, animals, production, stock/bales, map images and offline recovery.

**Expected:** Previously working paths still work; empty/error states are understandable; keyboard and narrow-window layouts remain usable.

**Coverage:** All findings and regression protection.

#### T16. Candidate identity and deployment lifecycle

**Setup:** Exact final installer/ZIP; clean-profile and upgrade paths using preserved/disposable data. Installer lifecycle if affected by packaging changes.

**Expected:** Actual launched desktop/mod identities match manifest, app opens normally, uninstall/reinstall and conversion claims have separate proof, and V4 is untouched.

**Coverage:** F12.

### Existing command entry points for Ash

These commands are documented from the package scripts read for this brief. They were not run. Reconcile the current scripts and candidate scope when execution begins, then run only the appropriate phase. Run from the repository root shown below. Do not paste the entire block as an unreviewed batch or publish as part of testing.

```powershell
Set-Location -LiteralPath "C:/Users/Graham/Documents/JoshWalki Farmdash server edit/MAIN CODEBASE/FarmHub"

# Focused parser/field tests after the relevant repairs
npm test --prefix FS25_FarmDashboard_App -- --runInBand tests/modConfigXml.test.js tests/xmlCollector.fields.test.js tests/xmlCollector.economy.test.js

# Full existing desktop/source suites
npm run test:all --prefix FS25_FarmDashboard_App

# Renderer typing and localization validation
npm run typecheck --prefix "NEW APP"
npm run i18n:verify

# Build only after the source gates pass: canonical mod, UI, then V5 app
npm run build:all:v5

# Existing package-content check; still not installed/game acceptance
npm run verify:electron-pack
```

The renderer package has a typecheck script but no test script in the inspected package definition. Do not invent npm run test for NEW APP. Put renderer regression coverage into the existing approved harness or add an explicitly documented test entry point as part of implementation. Likewise, use an existing Lua/game harness where available; do not claim a Lua test command that the project does not provide.

Avoid `npm run build:all`: the inspected root definition packages the classic override and classic app. Avoid alternate/fresh output scripts, blanket clean tasks, unlock-delete tasks and uploads as routine debugging steps. Keep the agreed installer location and preserve backups. Do not run translation machine-fill or dependency upgrades unnecessarily as part of these fixes.

### Measurement and comparison rules

- Record before/after on comparable game state/hardware/settings. Measure update/collector time, cycle latency, entity count, discovery frequency, serialization/output size, error count and renderer update cost. Do not claim a measured FPS improvement without measurement.
- Retain the existing per-update budget unless evidence supports a documented change. Split expensive readers into bounded work, cache invariant metadata and expose partial/truncated coverage honestly.
- Compare exact identities and unrounded canonical values when possible. Counts/IDs/boolean states should match; displayed numeric values may differ only by documented provider precision, rounding and recorded collection delay.
- Use wall-clock and simulation-clock observations appropriately. Pause/time acceleration must not turn a grace/deadline issue into fabricated failure or success.
- Logs prove stages, not visual correctness; fixtures prove logic, not native game behavior; package checks prove contents, not first launch; installed local SP does not prove dedicated multiplayer.
- Test reports use PASS, FAIL, NOT TESTED and BLOCKED. A blocked test names the missing setup and affected support claim; it is not counted as passed.

### Evidence record template

```text
Case ID / finding / phase:
Candidate source identity:
App UI/bundle/installer identity and hashes:
Loaded mod canonical name/version/hash:
Game version and deployment mode:
Original save / working copy / map / farm / entity:
Active mod versions and relevant feature settings:
Preconditions and exact actions:
Expected outcome:
Observed outcome:
Export session/generation/sample time:
Private evidence paths and sanitized public evidence paths:
Command and exit result, if applicable:
Result: PASS | FAIL | NOT TESTED | BLOCKED
Remaining limitation / owning fix / required re-test:
```

## 9. Packaging, installation and rollback-ready delivery

### Candidate manifest requirements

- Source identity using the project's chosen source revision or content manifest; do not falsely imply committed/reviewed state if there are uncommitted changes.
- App marketing version and an unambiguous internal build ID; mod descriptor/runtime version; UI bundle build identity; schema compatibility version.
- Canonical FS25_FarmDashboard.zip hash, installer hash and relevant packaged resource manifest, including UI routes/assets and converter dependency choices.
- Exact output path and actual launched installed executable/resources. One candidate should not be confused with development, classic or an older public build.
- All test evidence tied to these bytes. If changed, issue an updated identifiable candidate and re-run affected gates before a new sign-off.
- No arbitrary new installer folders, renamed game ZIPs, classic release feed changes or automatic publication.

### Fresh setup is a test boundary, not a data wipe

A fresh test must account for app userData, relevant dashboard modSettings/per-save exports, caches/offline snapshots and active mod form. Use an isolated test profile where practical. If the real profile must be used, first back up exactly scoped data and record restoration. Never remove all modSettings, all mods or all saved careers to simulate freshness. Keep app-owned settings separate from unrelated companion settings.

Test Windows Installed Apps registration and the actual referenced uninstaller executable. Verify first launch renders setup/dashboard, then conversion and live data. Test upgrade separately from fresh install, preserving an intentional collector false and offline history. Include uninstall/reinstall of the candidate. Do not repair the test result by manually deleting registration and then pretend the uninstaller worked.

Image conversion and optional dependencies must follow the actual agreed product design. If the dashboard installs an external converter, track whether it owned that installation. Test cleanup for an app-owned install and preservation of a pre-existing shared install. Do not delete somebody else's ImageMagick to satisfy cleanup. If a bundled converter is the approved design, prove the packaged conversion path works and reports failures honestly. UAC outcomes and optional-dependency failures are separate from overall application installation success.

## 10. Demo website delivery and Graham's later gameplay work

The separate [save-preparation guide](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/docs/V5-DEMO-SAVE-PREPARATION-AND-ACCEPTANCE-2026-09-23.md) is the user-facing sequence. Ash supplies a stable candidate first, then Graham prepares content through real gameplay. The four saved themes are not four simultaneous live game sessions. Their public default should be immutable recorded snapshots rendered with the real dashboard.

### Snapshot manifest (proposed fields)

- Allowlisted demoId, immutable generation ID, schema version, app/mod/build identities and completed capture time.
- Sanitized stable save/map identity, selected demo farm, game date/season and intended provider.
- Actual active mod/version list, supported feature/capability list, known limitations and whether each figure is measured/effective/estimated.
- Snapshot checksum and required asset manifest with safe public asset identifiers, not raw local/NAS paths.
- Display mode explicitly recorded; original timestamps retained. Optional replay is separately labelled and uses a coherent sequence from one save.
- Feature deep-link targets and minimum populated-content checks for each advertised demo section.

### Publication process

1. Collect a completed export from the correct prepared save and retain the matching private game comparison.
2. Project only allowlisted demo fields into a sanitized bundle. Exclude credentials, player/network identifiers and non-demo host metadata.
3. Gather only allowed/licensed assets required by the real renderer. Do not copy whole mods/maps or the full image archive without need or permission.
4. Validate completeness, identity, featured data, timestamps, schema and asset references. Reject bootstrap, partial identity and missing critical assets.
5. Write an immutable generation directory under the selected demo publication area, then atomically update its public pointer through the approved deployment process.
6. Keep the prior known-good generation for rollback. A failed capture/publish does not replace the working demo.
7. Test each demo and two independent visitor contexts against deployed routes after deployment is authorized. Ensure no public action changes the live app source.
8. Do not change the existing live tunnel, hosted credentials or public V4 story merely to make four local snapshots reachable.

### The four showcase goals

#### Riverbend Base (captured slot 4)

Prove the dashboard is useful without PF, RF or any companion. Establish the reference for every optional integration.

**Provider:** Base game, Farm Dashboard only.

**Public demo ID:** `base`. Routes in the earlier strategy are proposals, not proof of deployed URLs.

**Content to demonstrate:**

- Fields and soil native view with two distinct real states.
- Fleet low-fuel/service example and a normal vehicle.
- Healthy livestock plus one meaningful production and stock view.
- An explicit recorded-demo/base-only identity and the completed capture timestamp.

**Important restriction:** Do not add PF or a companion merely to make a native page populate. If native data is missing, return that defect to Ash.

#### Riverbend Precision Farming (captured slot 3)

Show exactly what PF adds and prove unknown soil readings are not displayed as measured zero.

**Provider:** Farm Dashboard plus Precision Farming only.

**Public demo ID:** `precision-farming`. Routes in the earlier strategy are proposals, not proof of deployed URLs.

**Content to demonstrate:**

- A scanned field with meaningful current/target readings.
- An unscanned or otherwise honestly unavailable field.
- A nitrogen/liming example compared to PF's own display.
- PF identity plus native feature views and completed capture metadata.

**Important restriction:** Do not buy another scan to hide a collector failure. First distinguish genuine unsampled ground from a read/merge/UI defect.

#### Montana RF and companions (captured slot 19)

Demonstrate useful RF and companion information, not simply a large list of detected mods.

**Provider:** RF-led rich showcase; exact active capabilities must be recorded.

**Public demo ID:** `realistic-farming`. Routes in the earlier strategy are proposals, not proof of deployed URLs.

**Content to demonstrate:**

- RF field/soil example.
- A populated ELS loan and clearly scoped farm.
- Filled silo compartments and actual region/calendar/restriction information.
- Producing livestock/production and one fleet/condition example.
- Exact mod/version/configuration manifest and explicit limitations.

**Important restriction:** This rich save does not prove any adapter is independent. Ash must retain separate minimum-set and combination tests.

#### Montana PF and companions (captured slot 18)

Show PF alongside useful independent companions, with real examples of the features that were previously empty.

**Provider:** PF-led rich showcase with the intended unit and companion configuration.

**Public demo ID:** `precision-companions`. Routes in the earlier strategy are proposals, not proof of deployed URLs.

**Content to demonstrate:**

- PF soil plus the intended units.
- An actual debt/repayment example, not only a policy label.
- Worked-field bonus coverage and real production stock.
- Populated livestock and a service-needed machine.
- Completed snapshot identity, feature list and source versions.

**Important restriction:** Zero debt, empty barns and enabled-but-unsupplied factories are valid game states, but they cannot serve as evidence of populated live integration features.

## 11. Security, privacy and user-experience acceptance

These are implementation and regression requirements for the changed paths, not a claim that each item below is an independently discovered current vulnerability. Preserve working authorization/IPC/path validation rather than weakening it to simplify integration.

1. Read game data without gameplay side effects. No automatic loans, field purchases, sampling, recipe changes, animal changes or mod activation to make a reader appear successful.
2. Keep companion-provided names/strings as text in the renderer. Never inject untrusted HTML, execute arbitrary expressions or turn source paths into public file reads.
3. Bound export size, entity traversal, retry queues and diagnostics. Malformed or oversized input yields a controlled unavailable/error state, not an unbounded loop or UI crash.
4. Retain authentication and scope for private LAN/dedicated data. Mod presence does not authorize cross-farm disclosure; honor the application's intended authorized views.
5. Keep API/IPC write operations validated and separate from read-only demo access. Hiding a button is not authorization.
6. Allowlist demo IDs and asset paths, reject traversal/absolute-path requests and ensure resolution stays within the intended publication root.
7. Redact secrets and unnecessary private identifiers from logs, support bundles and public captures. Full Windows/NAS config files are not public demo data.
8. Show missing/stale/failed states honestly with useful next steps. Never reassure the player that spreading is allowed or debt is zero when the read failed.
9. Keep keyboard access, focus/error handling, localized text and responsive layouts consistent with the existing design system. Status must be understandable without color alone.
10. Verify blank/setup/dashboard and first-launch error recovery on the packaged app. Development-only browser success does not prove installed navigation/assets.
11. Retain already working map conversion and all protected core features. A compatibility expansion cannot silently regress basic farm operation views.
12. Document unsigned distribution limitations without claiming free bypasses or asking users to disable Windows security. Signing remains a separate product decision.

## 12. Acceptance gates and completion ledger

### G0. Baseline reconciled

**Phase:** B00. **Initial status:** NOT TESTED / pending implementation evidence.

**Pass requires:** Exact changed-source versus installed identity, backups, ownership and evidence ledger are established.

### G1. Exporter recovered

**Phase:** B01. **Initial status:** NOT TESTED / pending implementation evidence.

**Pass requires:** Root cause identified; completed generations observed; same-process reload, teardown and diagnostics-off failures behave correctly.

### G2. Data/config contracts safe

**Phase:** B02-B07. **Initial status:** NOT TESTED / pending implementation evidence.

**Pass requires:** Settings preservation/no-write, active-only detection, namespace isolation, provider semantics, retention and units pass production-path regressions.

### G3. Advertised integrations truthful

**Phase:** B08-B10. **Initial status:** NOT TESTED / pending implementation evidence.

**Pass requires:** Every advertised live capability has meaningful source-backed data; all recommendations have an honest disposition and no hidden dependencies.

### G4. Cross-layer proof complete

**Phase:** B11. **Initial status:** NOT TESTED / pending implementation evidence.

**Pass requires:** Required source suites, transitions, minimum sets, constrained combinations, performance and security acceptance pass for the chosen scope.

### G5. Public demo boundary safe

**Phase:** B12. **Initial status:** NOT TESTED / pending implementation evidence.

**Pass requires:** Recorded demos use the real renderer, sanitized immutable data and enforced read-only independent source contexts.

### G6. Candidate identifiable

**Phase:** B13. **Initial status:** NOT TESTED / pending implementation evidence.

**Pass requires:** One V5 candidate, canonical ZIP and coherent final manifest; packaged and launched contents agree.

### G7. Ready for Graham to prepare saves

**Phase:** B14. **Initial status:** NOT TESTED / pending implementation evidence.

**Pass requires:** Fresh install, uninstall/reinstall, upgrade, setup, image conversion, native workflows and relevant installed/live routes pass.

### G8. Showcases approved

**Phase:** B15. **Initial status:** NOT TESTED / pending implementation evidence.

**Pass requires:** Four meaningful, correctly scoped, same-save comparisons are captured and sanitized; public demos remain independently usable.

### G9. Release decision supported

**Phase:** B16. **Initial status:** NOT TESTED / pending implementation evidence.

**Pass requires:** F01-F14 closure, compatibility claims, final artifact identity, rollback and all required evidence align. Publication still requires a release decision.

No gate is green in this planning artifact. Ash may attach earlier valid evidence only if it matches the unchanged relevant code/artifacts/scenario and its scope is explicit. A passing parser fixture cannot be reused as installed Settings acceptance. A working old public install cannot certify the new bundle.

### Per-phase completion response format

```text
Phase and resolved finding IDs:
What changed and why this fixes the owning cause:
Existing behavior intentionally preserved:
Files changed / contract changes / migration:
Tests run with exact result and evidence:
Tests NOT TESTED or BLOCKED and affected claims:
Package/install/live evidence, if this phase requires it:
Remaining work and next phase:
Candidate/version identity:
```

Do not stop at a list of changed files. For F01 state the actual blocking transition that was observed and the evidence that it now completes. For every live adapter show at least one real positive read. For every claimed dependency/conflict identify the owning upstream behavior rather than a pack label.

## 13. Failure handling and rollback

1. Before state-changing testing, record scoped backup paths outside game/mod/watch directories and preserve a known-good installer/ZIP manifest. Do not produce many unnamed rollback folders.
2. If a source regression appears, preserve unrelated changes and repair the smallest owning contract. Do not wholesale revert another contributor's work.
3. If a candidate fails, retain its error/evidence record and the previous known-good candidate. A failure does not justify dropping old snapshots or settings globally.
4. Close only the relevant app/game when replacing its active files. Never change the mod ZIP while the game is using it.
5. Restore only the backed-up app-owned/test state when rollback is needed. Resolve and confirm full target paths stay within the intended directories before any recursive move/delete.
6. An installer failure gets installer/uninstaller diagnostics; an empty export gets lifecycle/collector diagnostics; a correct export but wrong screen gets merge/selector diagnostics. Do not substitute one layer's reinstall for another's defect.
7. If one optional adapter fails, leave unrelated native/companion functionality operating with honest status. Do not disable the entire companion hub as the routine fallback.
8. After repair, re-run the regression plus affected cross-layer/package/installed tests. Re-capture any demo whose contract or source data changed.
9. Do not hide an upstream limitation with synthetic data. Escalate a precise capability/version/mode constraint and narrow only that feature's support claim.
10. Do not publish until the explicit final candidate and required gates are approved.

## 14. Finding-by-finding closure map


### F01 / P1. The current save export is still an empty bootstrap, not a working live feed

**Evidence status:** Ash reports partial implementation; independent source/installed/lifecycle acceptance outstanding.

**Owning phases:** B01, B03, B14.

**Impact:** Missing fields and companions share an upstream failure. Styling, reinstalling the desktop app or retaining XML cannot manufacture the missing live measurements.

**Required repair:** Instrument one bounded diagnostic run at the actual update/collector/write boundaries, identify the first stage not progressing, and repair that stage. Keep errors visible independently of verbose tracing. Do not declare the grace-clock change the sole fix without observing a completed live export.

**Required proof:**

- First update observed; selected collector begins and finishes; serialization commits; export generation advances.
- Repeat with diagnostics off: healthy output still advances and real exceptions remain visible.
- A collector exception must expose the module and failure reason while preserving unrelated completed data.

**Source references from the audit/test inspection:**

- [FS25_FarmDashboard_Mod/src/FarmDashboard.lua:226](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboard.lua:226)
- [FS25_FarmDashboard_Mod/src/FarmDashLog.lua:21](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashLog.lua:21)
- [FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua:3399](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua:3399)

### F02 / P1. Mission lifecycle initialization is unwired and updates are registered twice

**Evidence status:** Ash reports partial implementation; independent source/installed/lifecycle acceptance outstanding.

**Owning phases:** B01.

**Impact:** The reset/grace logic Ash repaired is placed in a callback that is not wired by the reviewed mod. The same updater is registered through two engine paths, invalidating one-work-unit-per-frame assumptions.

**Required repair:** Use one supported mission-start subscription and one updater registration, both idempotent. Reset session-owned state on teardown. Verify callback arguments and load order against the current game source before implementation.

**Required proof:**

- Cold SP load calls initialization exactly once.
- Each engine tick causes at most one coordinator update.
- Main menu -> another save, reload, MP host, dedicated host and joined-client teardown do not reuse jobs or duplicate subscriptions.

**Source references from the audit/test inspection:**

- [FS25_FarmDashboard_Mod/src/FarmDashboard.lua:82](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboard.lua:82)
- [FS25_FarmDashboard_Mod/src/FarmDashboard.lua:112](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboard.lua:112)
- [FS25_FarmDashboard_Mod/src/FarmDashboard.lua:153](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboard.lua:153)
- [FS25_FarmDashboard_Mod/src/FarmDashboard.lua:181](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboard.lua:181)
- [FS25_FarmDashboard_Mod/src/FarmDashboard.lua:266](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboard.lua:266)
- [C:/Users/Graham/Documents/FS25 Game Files/extract/decompiled/scripts/mission00.lua:501](C:/Users/Graham/Documents/FS25%20Game%20Files/extract/decompiled/scripts/mission00.lua:501)
- [C:/Users/Graham/Documents/FS25 Game Files/extract/decompiled/scripts/BaseMission.lua:814](C:/Users/Graham/Documents/FS25%20Game%20Files/extract/decompiled/scripts/BaseMission.lua:814)

### F03 / P1. The original XML parsing bug still turns unrelated Settings saves into module changes

**Evidence status:** Ash reports partial implementation; independent source/installed/lifecycle acceptance outstanding.

**Owning phases:** B02, B14.

**Impact:** Fields, economy and production can be read as disabled even though their module attributes are true. Unconditional mod-config saving can write those false values back; forcing them on at game load hides rather than repairs the cause.

**Required repair:** Parse exact attributes of exact elements with the existing XML dependency. Separate dirty states for UI, server, mod and LAN domains. Preserve unknown XML attributes and use a preserving read-modify-write transaction. Migrations must not override intentional current settings on every load.

**Required proof:**

- Exact captured conflict fixture reads fields/economy/production=true.
- Changing only appearance writes no mod configuration.
- Unknown keys survive; explicit false survives load/save; malformed-present XML fails safely rather than overwriting it.
- A failed mod write produces a partial-save/failure result, never an unqualified saved/synced result.

**Source references from the audit/test inspection:**

- [FS25_FarmDashboard_App/modConfigXml.js:41](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/modConfigXml.js:41)
- [NEW APP/src/settings/SettingsModal.tsx:329](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/settings/SettingsModal.tsx:329)
- [NEW APP/src/settings/SettingsModal.tsx:391](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/settings/SettingsModal.tsx:391)
- [FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua:1549](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua:1549)

### F04 / P1. Installed mods are being mistaken for active mods

**Evidence status:** Original audit finding; not independently reassessed after the reported repairs.

**Owning phases:** B04, B07, B11.

**Impact:** Vanilla or PF-only saves can inherit units or companion cards from unrelated ZIPs in the mods folder. This directly violates the requested mod-active-only behavior.

**Required repair:** Establish active mission membership first. Use the inventory only to resolve metadata for that active name. Gate settings-file fallbacks behind active membership. Support aliases explicitly; do not use an unrestricted installed-name scan to create active detections.

**Required proof:**

- All compatible ZIPs installed, only Farm Dashboard active: no companion hub and litres remain unchanged.
- British-only and Imperial-only careers do not contaminate one another.
- Old Imperial settings remain on disk while its mod is disabled: no Imperial activation.
- Active renamed/known-alias packages resolve their own metadata without matching unrelated names.

**Source references from the audit/test inspection:**

- [FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua:441](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua:441)
- [FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua:470](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua:470)
- [FS25_FarmDashboard_Mod/src/FillTypeUtils.lua:663](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FillTypeUtils.lua:663)
- [FS25_FarmDashboard_Mod/src/FillTypeUtils.lua:727](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FillTypeUtils.lua:727)
- [C:/Users/Graham/Documents/FS25 Game Files/extract/decompiled/scripts/misc/ModManager.lua:89](C:/Users/Graham/Documents/FS25%20Game%20Files/extract/decompiled/scripts/misc/ModManager.lua:89)
- [C:/Users/Graham/Documents/FS25 Game Files/extract/decompiled/scripts/misc/ModManager.lua:112](C:/Users/Graham/Documents/FS25%20Game%20Files/extract/decompiled/scripts/misc/ModManager.lua:112)

### F05 / P1. Several companion readers look in the wrong Lua environment

**Evidence status:** Original audit finding; not independently reassessed after the reported repairs.

**Owning phases:** B04, B09.

**Impact:** A mod may be detected but its useful data remains missing. Presence alone does not prove access to loan, crop-calendar, restriction or unit settings.

**Required repair:** Create a source-backed adapter registry with active name, environment/mission handle, supported version, capability probe, reader and scope for each supported integration. Resolve companion-owned symbols through the owning environment or documented mission handle, never by flattening all mods into one global namespace.

**Required proof:**

- Namespace-faithful fixtures keep each companion in a separate environment.
- ELS balances, Restricted Periods state, crop region and Imperial live settings match their owning mod.
- Missing manager, late initialization, unsupported version and reader failure produce distinct unavailable states.

**Source references from the audit/test inspection:**

- [FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua:397](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua:397)
- [FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua:511](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua:511)
- [FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua:638](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua:638)
- [FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua:674](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua:674)
- [FS25_FarmDashboard_Mod/src/FillTypeUtils.lua:717](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FillTypeUtils.lua:717)
- [C:/Users/Graham/Documents/FS25 Game Files/extract/decompiled/scripts/mods.lua:300](C:/Users/Graham/Documents/FS25%20Game%20Files/extract/decompiled/scripts/mods.lua:300)

### F06 / P1. Unavailable companion data is displayed as reassuring factual data

**Evidence status:** Original audit finding; not independently reassessed after the reported repairs.

**Owning phases:** B03, B08, B09.

**Impact:** The dashboard can say spreading is allowed, no enhanced loans exist or the calendar is vanilla when it simply failed to read the relevant mod.

**Required repair:** Represent detected, ready, unavailable, failed and stale separately. Only show allowed/zero/default values after a successful complete read with those actual values. Make unavailable reasons and source timestamps visible without alarming normal absent-mod users.

**Required proof:**

- Missing SlurryBan API never produces Spreading allowed.
- ELS manager missing never produces a zero-loan claim.
- Valid zero loans is displayed as zero; valid no-ban is displayed as allowed.
- Stored stale values carry a last-known label and cannot be presented as current advice.

**Source references from the audit/test inspection:**

- [FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua:638](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua:638)
- [FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua:674](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua:674)
- [FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua:883](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua:883)
- [NEW APP/src/sections/companions/CompanionModsSection.tsx:118](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/sections/companions/CompanionModsSection.tsx:118)
- [NEW APP/src/sections/companions/CompanionModsSection.tsx:146](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/sections/companions/CompanionModsSection.tsx:146)
- [NEW APP/src/sections/companions/CompanionModsSection.tsx:175](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/sections/companions/CompanionModsSection.tsx:175)

### F07 / P1. The selected farm can be shown another farm's enhanced-loan totals

**Evidence status:** Original audit finding; not independently reassessed after the reported repairs.

**Owning phases:** B03, B08, B11.

**Impact:** In a multi-farm save a debt-free or unavailable farm can receive the all-farms debt total while its detailed loan list remains empty.

**Required repair:** Keep selected-farm and all-farms views separate. Preserve zero with explicit availability/completeness, not truthiness. Preserve a valid user-selected farm even when it owns no equipment or fields; infer only when selection is absent or invalid.

**Required proof:**

- Farm A debt=0, farm B debt>0: A never shows B's debt.
- Missing A data is unavailable, not B's total.
- Explicit all-farms mode is clearly labelled and reconciles to its rows.
- A production-only or newly created farm remains selectable across refreshes.

**Source references from the audit/test inspection:**

- [NEW APP/src/sections/companions/CompanionModsSection.tsx:50](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/sections/companions/CompanionModsSection.tsx:50)
- [NEW APP/src/lib/companionMods/index.ts:122](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/companionMods/index.ts:122)
- [NEW APP/src/lib/farm-scope.ts:176](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/lib/farm-scope.ts:176)

### F08 / P1. Snapshot retention resurrects empty/disabled sections and is not session-safe

**Evidence status:** Original audit finding; not independently reassessed after the reported repairs.

**Owning phases:** B03, B06.

**Impact:** Sold stock, emptied pens or removed RF mods can reappear. Reusing a server/save slot can mix old field detail into a new session.

**Required repair:** Replace non-empty heuristics with section outcome and provenance. Carry forward only omitted/pending/failed data from the same save identity. Successful empty and explicit disabled must invalidate backup and persisted snapshot state. Keep offline last-good data, but label it and scope it correctly.

**Required proof:**

- Non-empty -> complete empty -> disconnect -> restart stays empty.
- Enabled RF -> explicit disabled -> offline never resurrects a tab or soil block.
- Sold all stock remains zero.
- A new save/map under the same configured server id cannot inherit any previous section, geometry, history or fill-type catalog.

**Source references from the audit/test inspection:**

- [FS25_FarmDashboard_App/mergedSnapshotHold.js:157](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/mergedSnapshotHold.js:157)
- [FS25_FarmDashboard_App/mergedSnapshotHold.js:209](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/mergedSnapshotHold.js:209)
- [FS25_FarmDashboard_App/mergedSnapshotHold.js:558](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/mergedSnapshotHold.js:558)
- [FS25_FarmDashboard_App/mergedSnapshotHold.js:694](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/mergedSnapshotHold.js:694)
- [FS25_FarmDashboard_App/mergedSnapshotHold.js:732](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/mergedSnapshotHold.js:732)
- [FS25_FarmDashboard_App/main.js:2587](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:2587)
- [FS25_FarmDashboard_App/main.js:2637](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:2637)

### F09 / P2. The merge immediately removes the freshness markers it just added

**Evidence status:** Original audit finding; not independently reassessed after the reported repairs.

**Owning phases:** B03, B06.

**Impact:** Old retained values can look live merely because a different collector produced recent data.

**Required repair:** Separate transport freshness, export generation and per-section freshness. A successful vehicle update may clear a vehicle error, not retained soil/stock/companion provenance. Retain source timestamps through persistence and rendering.

**Required proof:**

- Fresh vehicles plus failed fields show live fleet and stale fields simultaneously.
- App restart or repeated reading of the same export cannot reset the displayed measurement age.
- The UI can distinguish connected transport, exporter alive and section current.

**Source references from the audit/test inspection:**

- [FS25_FarmDashboard_App/main.js:2361](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:2361)
- [FS25_FarmDashboard_App/main.js:2482](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/main.js:2482)

### F10 / P2. Soil bars still conflate missing current measurements with measured zero

**Evidence status:** Original audit finding; not independently reassessed after the reported repairs.

**Owning phases:** B05, B07.

**Impact:** The recent Awaiting live soil map change fixes one fallback but not all. A target without a current reading can produce a false deficiency.

**Required repair:** Resolve soil provider and measurement availability explicitly: vanilla application levels, PF N/pH or RF nutrients/pH. Targets, current values and scan status must be independent. Do not turn an unknown current value into zero or request another soil scan solely because telemetry failed.

**Required proof:**

- PF scanned/current missing/target known shows unavailable, not 0 kg/ha or pH 0.
- A genuinely measured N=0 remains zero.
- PF current and target values match the in-game display, allowing only documented rounding.
- RF soil stays RF; no inferred conversion between PF kg/ha and RF ppm/percent.

**Source references from the audit/test inspection:**

- [NEW APP/src/sections/fields/field-helpers.ts:498](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/sections/fields/field-helpers.ts:498)
- [NEW APP/src/sections/fields/field-helpers.ts:559](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/sections/fields/field-helpers.ts:559)
- [FS25_FarmDashboard_App/xmlCollector.js:458](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/xmlCollector.js:458)
- [NEW APP/src/sections/fields/FieldCard.tsx:176](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/NEW%20APP/src/sections/fields/FieldCard.tsx:176)

### F11 / P2. One companion reader failure can erase the entire companion payload

**Evidence status:** Original audit finding; not independently reassessed after the reported repairs.

**Owning phases:** B01, B04, B11.

**Impact:** A failing optional reader can hide unrelated supported companions. The coordinator also repeats capability detection on the update path instead of using a mission-scoped registry.

**Required repair:** Isolate each adapter and preserve independent results. Cache mission activation, retry readiness at a bounded cadence, and budget expensive scans. Record duration, row truncation and failure reason per adapter.

**Required proof:**

- One broken loan adapter leaves restrictions, diesel and other companions visible.
- Capability failures cannot abort the core field exporter.
- Measure first export latency and collector p50/p95/max with and without companions; preserve existing spawn safety.

**Source references from the audit/test inspection:**

- [FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua:847](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua:847)
- [FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua:944](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua:944)
- [FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua:2367](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua:2367)
- [FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua:3428](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboardDataCollector.lua:3428)

### F12 / P2. Build identity and the test configuration are too ambiguous to prove a repair

**Evidence status:** Original audit finding; not independently reassessed after the reported repairs.

**Owning phases:** B00, B13, B14, B16.

**Impact:** Repeatedly distributing the same version and keeping two mod deployment forms makes it difficult to know what was exercised. Presence cards and compilation are being used as substitutes for end-to-end acceptance.

**Required repair:** Use one deliberate candidate with coherent version/build identifiers and canonical ZIP naming. Separate source, package, installed and live-save evidence. Retire the loose release-test copy by reversible backup only after consent and when the game is closed. Do not recreate or wipe demo saves as a debugging substitute.

**Required proof:**

- Source manifest matches packaged files and the actual loaded artifact.
- One canonical mod ZIP is loaded for SP and MP acceptance.
- V5 uses latest-rf.yml; public V4 and unrelated mods are unchanged.
- Each advertised live adapter has an actual same-save comparison, not just a detected card.

**Source references from the audit/test inspection:**

- [FS25_FarmDashboard_Mod/modDesc.xml:5](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/modDesc.xml:5)
- [FS25_FarmDashboard_Mod/src/FarmDashboard.lua:7](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_Mod/src/FarmDashboard.lua:7)
- [FS25_FarmDashboard_App/electron-builder.rf.yml:16](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/electron-builder.rf.yml:16)
- [C:/Users/Graham/Documents/cursor_game_mod_configuration_issue.md:1557](C:/Users/Graham/Documents/cursor_game_mod_configuration_issue.md:1557)
- [C:/Users/Graham/Documents/cursor_game_mod_configuration_issue.md:2283](C:/Users/Graham/Documents/cursor_game_mod_configuration_issue.md:2283)

### F13 / P2. Malformed-existing configuration recovery is approved by the current regression test

**Evidence status:** Confirmed in inspected test; caller write protection not independently verified.

**Owning phases:** B02, B11.

**Impact:** A default-template fallback can silently discard existing settings if it reaches the write path.

**Required repair:** Reject malformed-present configuration and prove the existing file is unchanged; reserve default creation for a truly missing file.

**Required proof:**

- Malformed XML save returns a domain-specific failure.
- Original bytes remain unchanged.
- Missing file still supports first-run defaults.

**Source references from the audit/test inspection:**

- [FS25_FarmDashboard_App/tests/modConfigXml.test.js:87](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/tests/modConfigXml.test.js:87)

### F14 / P2. Field extraction test duplicates helpers rather than calling production code

**Evidence status:** Confirmed in inspected test; a proof gap rather than a newly demonstrated runtime failure.

**Owning phases:** B05, B11.

**Impact:** The fixture can pass while real ingestion loses fields.

**Required repair:** Exercise the real collector/parser and the real merge-to-selector path; do not certify copied fixture logic.

**Required proof:**

- Nested field fixture uses production entry point.
- Target-only, zero and null soil fixtures traverse real normalisation.

**Source references from the audit/test inspection:**

- [FS25_FarmDashboard_App/tests/xmlCollector.fields.test.js:7](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/tests/xmlCollector.fields.test.js:7)
- [FS25_FarmDashboard_App/tests/xmlCollector.fields.test.js:47](C:/Users/Graham/Documents/JoshWalki%20Farmdash%20server%20edit/MAIN%20CODEBASE/FarmHub/FS25_FarmDashboard_App/tests/xmlCollector.fields.test.js:47)

## 15. Final delivery checklist

- F01-F14 have explicit resolution/evidence or an honestly unresolved blocker.
- All original W00-W10 requirements are mapped into B00-B16; none disappeared because the lifecycle patch landed.
- All ten catalog corrections and twelve conflict/dependency families are reflected in code/docs/tests.
- All 31 recommendations and every additional advertised live capability have a disposition with no unapproved silent deferral.
- The canonical mod and exact installed V5 app contain the source fixes. No duplicate mod identity or unnecessary new installer folder exists.
- Fresh install, uninstall/reinstall, upgrade, setup, image conversion and protected native workflows are evidenced.
- Applicable standalone/minimum-set, combination, farm scope, same-process reload and advertised multiplayer/dedicated cases have honest results.
- Four prepared saves have meaningful game-to-dashboard comparisons and sanitized recorded demo manifests.
- Public demo source selection is independent and enforced read-only. No private paths, passwords or unsupported live claims are published.
- Rollback instructions and one candidate manifest identify exactly what Graham is accepting.
- Graham receives a concise completion summary and a clear release recommendation; no claim of PASS is based only on source edits or a successful build.

### Ready-to-use instruction for the implementation task

Implement this complete brief in B00-B16 dependency order. Preserve verified working behavior and Ash's correct existing W01/W02 changes. Close the exact root causes and F13/F14 test gaps, finish advertised companion data honestly, implement the ordered useful additions and prove independent operation with only real upstream prerequisites. Keep V5-only output, canonical FS25_FarmDashboard.zip naming and the agreed installer location. Do not wipe user data, change upstream mods, publish automatically or claim source tests are installed acceptance. Deliver the G7 candidate before Graham follows the separate four-save guide, then close G8/G9 with exact evidence. Record every phase's result and escalate only a specific blocker requiring a product decision or unavailable external setup.

**Planning boundary:** Only this brief, the save guide and a navigable canvas are created by this task. No proposed command above has been executed as part of writing the plan.
