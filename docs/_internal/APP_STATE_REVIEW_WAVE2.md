# FarmHub app state review — Wave 2 (Agent E)

**Date:** 2026-07-09  
**Scope:** Read-only analysis after Waves 1–2. No code changes, version bumps, or `build:all` in this pass.  
**Versions in tree / Final Output:** app **4.2.1**, mod **3.4.0.7**.

---

## Executive verdict

**4.2.1 is release-ready as a legacy-default ship** (mod export mirror + docs + packaging), with **NEW APP remaining opt-in / preview only**. Soft-cutover to **5.0.0** (default `useNewUi`) is **not** ready: section wiring and polish landed, but live SP/MP behavioral QA is still open, and the documented Settings toggle for enabling UI v2 is **missing from the legacy Appearance UI** (env `FARMDASH_UI_V2=1` is the practical on-ramp today). Dedicated **join-as-client** is architecturally complete and documented end-to-end, but still needs a real DS + joined-client smoke before calling it production-proven.

---

## What works now (4.2.1 + NEW APP opt-in)

### Release artifacts

Present under `%USERPROFILE%\Documents\FarmDash Final Output` (2026-07-09):

| Artifact | Status |
|----------|--------|
| `FS25-Farm-Dashboard-Setup-4.2.1.exe` | Present (~861 MB) |
| `FS25_FarmDashboard.zip` (mod 3.4.0.7) | Present |
| `latest.yml` | Points at 4.2.1 |

Not published to itch / VPS (correct for this gate).

### Track A / Electron packaging

- App `package.json` **4.2.1**; `build.files` includes `web/**/*` and `ui-v2/**/*`.
- Root `build:all` = `package:mod` → `build:ui` → `build:app`; `ui-v2` present next to `main.js`.
- `main.js` gating: `FARMDASH_UI_V2=1|true` **or** `uiPreferences.useNewUi === true`; resolves `App/ui-v2` then falls back to `NEW APP/dist`.
- When UI v2 is on: static serve from that dist; `/setup.html` injects `__FARMDASH_SETUP_TOKEN` from ui-v2 `setup.html`.
- Default remains **legacy `web/`** (`useNewUi: false` in `DEFAULT_UI_PREFS`).

### NEW APP (`NEW APP/`)

| Area | State |
|------|--------|
| Stack | Vite + Preact + TS; Zustand store; `/api/data` + WS primary / HTTP fallback |
| Shell | Server tabs, MP farm dropdown, settings, notifications, LAN/viewer guards |
| Sections | home, livestock, vehicles, fleet map, fields, economy, pastures, productions — all routed (not empty stubs) |
| Platform | Setup + SimHub multi-page entries; electron-bridge; i18n via shared catalog |
| Wave 2 polish | Splash, landing weather/import/game-time, genetics overview, MP farm inference (`resolveActiveFarmId`) |
| PARITY.md | Integration checks marked ✅; soft-cutover blockers still listed; live QA checklist open |

### Mod export mirror (3.4.0.7)

- `FarmDashboardExportEvent` + `FarmDashboardExportMirror` loaded from `modDesc.xml`.
- Authority-only stream after local `data.json` write; frame-budgeted chunks (~6 KB, 1/frame).
- Dual opt-in, both **default off**: server `allowExportMirror`, client `mirrorExport` (settings API + in-game menu + EN/DE l10n).
- Client reassembles and writes local `modSettings/FS25_FarmDashboard/<slot>/data.json` — no client collectors.
- App path unchanged: **Local** watch of that folder (same as SP).

### Docs / Setup UX (join-as-client)

- Setup copy in legacy `setup.html` / `web/index.html`, NEW APP setup + Settings servers tab.
- `docs/INSTALL.md`, `USER_MANUAL` §3.4a, wiki, itch install HTML describe Option A (join) vs Option B (FTP).
- Honest limits documented: empty DS = no mirror; lag on large exports; FTP remains for headless.

---

## Gaps vs legacy / PARITY blockers

### Soft-cutover blockers (from PARITY + this review)

1. **Live behavioral QA** not signed off (SP + MP) for every section — compile/route ≠ parity.
2. **`useNewUi` must stay default-off** until that sign-off.
3. **Do not delete `web/`** until default-on + QA.
4. Depth still below legacy in places (fields organic/exclusion/cluster edges; productions/pastures/ADS/economy/storage/redtape/fleet map; mod-image export progress UX lighter than legacy).

### Critical packaging / opt-in gap

**Legacy Appearance UI has no `useNewUi` control.**  
i18n keys (`theme.useNewUi*`) and IPC (`get/save-ui-preferences` with `useNewUi`) exist; NEW APP Settings Appearance has the checkbox; `dashboard-settings.js` save path **does not** read/write `useNewUi`, and `web/index.html` Appearance has no checkbox.

**Implication:** Documented “Settings → Appearance → Use new dashboard UI” is a **chicken-and-egg** for default installs. Practical tester path today is **`FARMDASH_UI_V2=1`** (or manually setting electron-store). Fix before marketing soft opt-in to non-dev users: add the toggle to **legacy** Appearance (or a one-shot first-run / About control).

### Doc drift (non-blocking but messy)

- `USER_MANUAL.md` header still says app **4.2.0** / mod **3.4.0.6**.
- `modDesc` multiplayer blurb still emphasizes “only host/dedicated write” without mentioning optional client mirror (l10n settings are clearer).
- USER_MANUAL §3.4a / §9 still hedge on exact in-game labels (“until UI copy is final”) even though EN/DE strings are shipped (`Allow export mirror` / `Mirror export locally`).

### NEW APP vs legacy — notable deltas

| Topic | Notes |
|-------|--------|
| Genetics overview | NEW APP ahead of legacy placeholder in places |
| Livestock statistics chart | Still unwired (legacy also); NEW APP omits honestly |
| Navbar weather strip | Landing chip only in NEW APP |
| Section polish | Wired but needs side-by-side save QA |
| Default UI | Legacy remains the product surface for 4.2.1 |

---

## DS join-as-client readiness + risks

### End-to-end path (designed)

```
DS authority (mod 3.4.0.7, allowExportMirror=on)
  → chunked FarmDashboardExportEvent
  → joined client (same mod, mirrorExport=on)
  → local modSettings/.../data.json
  → desktop app Local server (file watch)
  → dashboard (legacy default or ui-v2 if enabled)
```

App Setup/Settings and INSTALL/wiki/itch copy align with that path. FTP remains Advanced for empty/headless hosts. Giants `:8080` correctly documented as optional XML feed, not a `data.json` substitute.

### Readiness: **code + docs ready; live proof pending**

| Risk | Severity | Notes |
|------|----------|--------|
| Dual opt-in both default **off** | Ops | Easy to “install and wonder why nothing updates”; docs cover it — in-game discoverability matters |
| Empty dedicated (0 players) | Product | By design; FTP still required for headless-only |
| Bandwidth / hitch | Perf | Chunked + 1 chunk/frame; large JSON may lag seconds |
| Incomplete buffer / disconnect | Reliability | TTL + disconnect cleanup; needs soak on flaky joins |
| Server/client mod version skew | Support | Mirror requires **both** on 3.4.0.7+ |
| Authority-only collectors | Correct | Clients never collect — good; stale file if client drops |
| Live DS QA | **Gate** | Not evidenced in-repo as signed off |

**Verdict:** Safe to ship as **preferred DS path when someone can stay joined**, with FTP retained. Treat first public week as **soft launch** for mirror until a real rented-host test passes.

---

## Release recommendations

### Publish 4.2.1 publicly (itch / VPS / auto-update)?

**Yes — with a clear “legacy default + mod mirror” story**, after a short smoke checklist:

1. Fresh install → Setup → Local SP `data.json` updates.
2. DS join-as-client: both toggles on → client `data.json` mtime advances → Local server in app.
3. Empty DS still needs FTP (document in release notes).
4. Confirm installer ships `ui-v2/` but **does not** enable it by default.
5. Release notes: how to try NEW APP (`FARMDASH_UI_V2=1`; and/or fix legacy toggle first).

Do **not** block 4.2.1 on NEW APP soft-cutover. The value of this train is **mod 3.4.0.7 mirror + docs**, not default UI v2.

### Soft-cutover 5.0.0 (default `useNewUi`)?

**Not yet.** Prerequisites:

1. Legacy Appearance (or equivalent) can enable UI v2 without env vars.
2. Signed live QA matrix (PARITY “Still needs live SP/MP QA” + full section pass).
3. Explicit decision to flip default + keep `web/` as fallback for one release if needed.
4. Version/docs bump (USER_MANUAL header, modDesc MP blurb, itch copy).

Until then: keep **4.2.x** as product; NEW APP = preview for testers.

---

## Recommended next fixes (prioritized)

1. **P0 — Legacy `useNewUi` toggle** in Appearance + wire `saveUiPreferences({ useNewUi })` so opt-in matches PARITY/docs without env vars.
2. **P0 — Live DS join-as-client smoke** on a real dedicated host (both toggles, Local watch, disconnect/reconnect, empty-server FTP fallback note).
3. **P1 — Live SP/MP section QA** against legacy side-by-side; log gaps in PARITY (fields rules, pastures, productions, ADS, economy/storage/redtape, fleet map, weather, mod-image import).
4. **P1 — Doc sync** for 4.2.1 / 3.4.0.7 (USER_MANUAL header; tighten §3.4a / §9 to exact in-game setting names; optional modDesc MP sentence for mirror).
5. **P2 — Soft-cutover prep only after P0–P1:** default-on plan, fallback story, then 5.0.0.
6. **P2 — Polish leftovers** (richer mod-export progress; navbar weather if desired; livestock stats only if a real data source appears).

---

## Appendix — inspection notes

| Path | Finding |
|------|---------|
| `NEW APP/PARITY.md` | Soft-cutover blocked on live QA; Wave 2 polish ✅ |
| `NEW APP/AGENTS.md` | Ownership + enable instructions; env or Settings |
| `NEW APP/src/store`, `api-client`, `ws-client` | Bootstrap + farm sync + server switch solid |
| `FS25_FarmDashboard_App/main.js` | ui-v2 resolve + setup token injection correct |
| `FS25_FarmDashboard_App/web/.../dashboard-settings.js` | No `useNewUi` in save payload |
| `FS25_FarmDashboard_Mod` mirror Lua | Dual opt-in, chunked, client write-only |
| Final Output | 4.2.1 trio present; unpublished |

*End of Wave 2 Agent E review.*
