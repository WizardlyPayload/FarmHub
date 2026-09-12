# Dash timeline (FarmHub)

Longer dated history for the Dash seat. Cold-start facts stay in [DASH-MEMORY.md](./DASH-MEMORY.md). No em dashes.

**Sources:** git log (~160 commits, 2026-04-06 → ~2026-07-08 on pushed `main`), release docs, CHANGELOG, ~29 parent agent transcripts (Apr–Jul 2026 in this project folder), `docs/rf-suite/MEMORY.md`.

**Honest span note:** This FarmHub remote’s agent transcripts start **2026-04-30**, not a full calendar “8 months.” Earlier JoshWalki / public 2.0 work predates this git root. Treat “~8 months of product work” as concept-to-now, with **dense Cursor history here from Apr–Jul 2026**.

---

## Remotes and publish surface

| Item | Fact |
|------|------|
| Git remote | `origin` → https://github.com/WizardlyPayload/FarmHub.git |
| Tags on remote | `3.9`, `4.0`, `4.2` |
| GitHub releases (sample) | 3.9.0, 4.0.0, **4.2 BETA** (Latest as of 2026-07-28 refresh) |
| Earlier public line | WizardlyPayload/FS25-Farm-Dashboard **2.0.0**; JoshWalki/FarmDashboard origin |
| Local Final Output | V4 Setup **4.2.1** + `latest.yml`; V5 Setup **5.0.x** + `latest-rf.yml` |
| Local mod zip | Often rebuilt; modDesc can be **5.0.0.1** while classic GitHub still ships older zip |
| itch / VPS | Site + testers downloads via farmdashboard.co.uk / VPS rules; not all local builds are published |

---

## Era 0 — Origin (pre-FarmHub git)

- **JoshWalki** ships original FS25 Farm Dashboard (Lua + browser live UI).
- Wizard continues as Electron desktop + deeper MP/FTP/fields; public **2.0.0** under FS25-Farm-Dashboard.
- FarmHub repo later seeded by **copy**, not git fork: **zero** JoshWalki commits in history. Retention study: ~**22%** of original lines survive near-verbatim; ~**3–4%** of current LOC. Strong survivors: styles, realtime-connector, economy collector. Monolithic original `app.js` essentially gone. Cite: [JoshWalki retention](68ae98fb-498f-4f77-89f9-868166307233).

---

## Era 1 — FarmHub born + Electron hardening (2026-04)

| Date / marker | What happened |
|---------------|---------------|
| 2026-04-06 | First commits: Initial commit, “originlal upload”, early VPS/Koyeb/FTP |
| Mid–late Apr | Rapid “Ai Update” cadence; collectors and app grow |
| 2026-04-30 | Transcripts begin: OneDrive/Xbox path discovery (`fs25Paths`, read retries) [OneDrive](31d9d7f6-3f68-4c0d-b0b3-8ddd0d63afed); security / Lua / JS audits [security audit](582564d9-bc06-4cb5-b68f-b53fc6433edd) |

Themes: make the Windows app find FS25 data under OneDrive, Store packages, `modsDirectoryOverride`; FTP for dedicated; local watch for SP.

---

## Era 2 — Security line and 3.9 → 4.0 (2026-05)

| Marker | What |
|--------|------|
| Early May | Deep audits (LAN creds, XSS, CORS) |
| Tag **3.9** (~2026-05-14 / release ~05-22) | Security hardening ship; offline rules + suggestions (AI removal narrative in 3.0 docs) |
| Tag **4.0** (2026-05-24) | Stable updater line; docs/lineage tables; in-app update 3.9 → 4.0 tested [v4 publish](6c66913b-05d0-49ac-a466-ef139ef28bf8) |
| May field bugs | e.g. field “ready” false positives [fields ready](47b910d6-0e7d-4f08-a350-83974f3f3367) |

Product intent locked: Lua aggregates + Node merge + Express SPA on **8766**; no remote AI subscription in baseline.

---

## Era 3 — 4.1 tester ladder → 4.2 public (2026-06)

| Marker | What |
|--------|------|
| Mid Jun | VPS / testers download page (passworded, no main-site links) [testers page](445bcb8f-76c0-40df-b3f3-11caf9e720fd) |
| 4.1.0–4.1.5 | Livestock counts, Courseplay `isa` stub, store images, fleet dedupe, grass mown status, CORS |
| Tag **4.2** (~2026-06-27 “Final 4.2 Update”) | Storage moisture, farm-scope dealership prune, Witcombe fill-type gaps, bales, productions, urgent notifications, demo refresh UX |
| Late Jun | Large “run through the application” sessions [app walkthrough](8ca240af-511a-438b-916f-cb64803b08d7) |

Witcombe / sparse fill types and silo moisture are recurring dedicated-server themes (keyword-heavy in transcripts).

---

## Era 4 — Join-as-client, critique, NEW APP (2026-07 early–mid)

| Marker | What |
|--------|------|
| ~2026-07-04 | Project critique → plan for NEW APP folder (keep classic, parallel rebuild) [critique / NEW APP plan](bbabccf4-68ae-4cf3-97d6-d4f1d1f695fe) |
| ~2026-07-08–10 | Multi-agent NEW APP implementation waves; stop/reconcile when another agent finished early [NEW APP coordinator](4c63a019-28e4-4e0e-b5bd-ba90b54baf45); parallel Track A classic fixes + NEW GUI [audit → dual track](8787db83-103a-4f43-8fde-ef992d059ee1) |
| ~2026-07-11 | `dev:ui` script confusion; debug pass [dev:ui](11d603ad-06ea-4a03-8950-0a7f6e1c2a6b) |
| ~2026-07-14 | Join-as-client works; bug: only current farm in export → fix all farms [join-as-client farms](45e2c916-0bd7-4452-8ebb-319477610d28) |
| Docs | App **4.2.1** / join-as-client mirror (`FarmDashboardExportEvent` / ExportMirror); FTP demoted to Advanced |

NEW APP stack: Vite + Preact + TS + Zustand; sections owned per `NEW APP/AGENTS.md`; cutover opt-in (`useNewUi` default off).

---

## Era 5 — RF-edition 5.x + engine hardening (2026-07-26 … 28)

| Marker | What |
|--------|------|
| 2026-07-26 | Plan: RF as **separate product line**, never classic `latest.yml` [RF suite plan](f5abf067-cf61-41ae-acb1-f18be2f5d77e) |
| Same day | Wave 0 contracts + parallel Land/Economy/Dairy/Life/Cores/Release; `docs/rf-suite/` kit; local RF build artifacts |
| Same day | Formal app **5.0.0** / modDesc **5.0.0.0** via extraMetadata + mod bump; soil `rawget` fix; Red Tape hold fix; GPortal uploads |
| 2026-07-26 | Mustard cover-crop parity for Witcombe (NEW APP rules) |
| 2026-07-28 | `copyFile` Bool-only + map-overview fail latch → mod **5.0.0.1**; Dash persona created; memory deep refresh |

RF soft-detect pattern mirrors Red Tape / Invoices: aggregates only, hide UI when absent, dual-ledger so FarmHub agents do not spam RF CLAUDE-LOG.

---

## Transcript sample method (2026-07-28)

- **Folder:** `agent-transcripts` under the FarmHub Cursor project (~32 UUID dirs, ~209 jsonl files).
- **Parents sampled:** 29 parent `uuid/uuid.jsonl` files; keyword hit counts across themes (NEW APP, Electron, FTP, i18n, moisture, Witcombe, Courseplay, Red Tape, hold, GPortal, copyFile, join-as-client, …).
- **Deep peaks read:** OneDrive, JoshWalki retention, NEW APP coordinator, join-as-client, v4 publish, testers VPS, critique/NEW APP, RF suite + copyFile, Dash persona.
- **Not done:** full line-by-line of mega sessions (e.g. 25MB testers thread) — themes extracted, not dumped.

---

## Version cheat sheet (refresh when shipping)

| Line | App | Mod (local may differ) | Feed |
|------|-----|------------------------|------|
| Classic | 4.2.1 in package.json | Classic cadence on GitHub; may lag local | `latest.yml` |
| RF edition | 5.0.0 packaged | 5.0.0.1 local after copyFile patch | `latest-rf.yml` |

Always re-read `package.json`, `modDesc.xml`, and Final Output timestamps before claiming “what’s published.”
