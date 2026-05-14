# FS25 Farm Dashboard — Release v3.0.0 (FarmHub)

**Product:** FS25 Farm Dashboard (Electron + web + Lua mod)  
**Desktop app:** `3.0.0` (`package.json`)  
**In-game mod:** `2.0.0.0` (`modDesc.xml`) — bump only when you ship a new mod build  
**Documentation cut-off:** April 2026  

**Historical document:** This file describes the **v3.0.0** release line. For **current** app and mod versions, see **[RELEASE_NOTES.md](./RELEASE_NOTES.md)** and **[CHANGELOG.md](./CHANGELOG.md)** §**3.9.0**.

---

## Executive summary

**3.0.0** was the **shipping line** (April 2026) that presented the dashboard as a **self-contained Windows app**: live JSON from FS25, **XML + Lua merge**, full sections (livestock, vehicles, fields, economy, pastures, productions), **FTP** for dedicated hosts, **LAN** access with auth for tablets, and **offline field rules** (plus mod **`suggestions`**) — **without** documenting or depending on a separate cloud stack in this repository.

Earlier branches may contain experiments not described in the **3.0.0** manuals; use **git history** if you need to recover obsolete work.

---

## What shipped in 3.0.0 (customer-visible)

### Field intelligence (local)

- **`rules-engine.js`** drives **one primary line** per field card where the merged payload supports it (harvest, baling, lime, soil gaps, fleet vs shop tools, post-harvest workflow hints).
- **Windrow awareness** — Lua exports **`windrowLiters`** and **`windrowType`**; **`dataMerger.js`** normalizes types; **`fields.js`** shows a **comma-formatted volume badge** when present.

### Desktop UX

- **Settings (gear) → Servers & saves** — single place for local paths, FTP, polling (sync vs staggered, first delay, interval).
- **API error recovery** — paths back into unified settings instead of trapping users in legacy-only flows (see CHANGELOG for the exact build you cut from).
- **Notification history** — modal stacking fix where `.modal-backdrop` could block clicks (CSS).

### Windows build and installer

- **`tools/app/run-electron-builder.mjs`** — default **`npm run dist` / `pack`** targets **`%LOCALAPPDATA%\fs25-farm-dashboard-electron-out`** so IDEs and Windows Search are less likely to lock `app.asar` inside the clone.
- **NSIS** — aggressive shutdown of child processes during upgrade; **language-first** installer; optional **ImageMagick** helper for mod image pipeline.
- **Uninstall** — optional **wipe all user profile data** vs keep data (`FarmDashWipeUserData` in installer scripts).

### LAN security

- **`main.js`** — LAN toggle binds **127.0.0.1** vs **0.0.0.0**; **HTTP Basic** + optional **IP allowlist** for non-loopback clients; loopback bypass for the shell and local browser.

---

## Baseline from 2.0.0

Everything in [CHANGELOG §2.0.0](./CHANGELOG.md) remains the foundation: mod **authority**, **staggered collectors**, **field merge** rules, **multi-farm** UI, **FTP polling**, LAN documentation, packaging hygiene. **3.0.0** is a **product and documentation alignment** release on top of that codebase — not a replacement for 2.0 field accuracy work.

---

## Maintainer notes

- **Build:** `cd FS25_FarmDashboard_App/FS25_FarmDashboard_App && npm install && npm run dist`
- **Support bundle:** always ask for **app `package.json` version**, **`modDesc.xml` version**, and whether the issue is **local** vs **FTP**.
- **Git history:** Some commits may mention removed features; **3.0.0 docs** describe the supported surface only.

---

## Credits

**JoshWalki** & **WizardlyPayload** — [AUTHORS.md](./AUTHORS.md).
