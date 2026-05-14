# FarmHub — deep project audit

**Repository:** `FarmHub` (root: `…/MAIN CODEBASE/FarmHub`)  
**Audit date:** 2026-05-09  
**Scope:** Entire tree under the FarmHub directory — **FS25 Farm Dashboard** desktop app (Electron), **web UI**, **Lua mod**, **`docs/`**, and the co-located **FS25_RealisticLivestockRM** mod (separate product; included for repo hygiene and risk boundaries).

**Method:** Static review of architecture docs, security notes, key runtime paths (`main.js`, merge layer, mod collectors), Jest suite inventory, `npm audit`, and cross-reference with existing audits ([AUDIT_v3.9_PREFINAL.md](./AUDIT_v3.9_PREFINAL.md), [AUDIT_v3.0.md](./AUDIT_v3.0.md)).

---

## 1. Executive summary

FarmHub is a **mature, modular** baseline: clear separation between **Lua export** (aggregates, staggered collectors), **Node merge** (`dataMerger.js`), and **Express + static SPA** on port **8766**. Security investment in **v3.9** (LAN credential policy, XSS hardening on high-risk UI paths, CORS tightening) is real and partially covered by tests.

**Strengths**

- Documented trust boundaries ([SECURITY.md](./SECURITY.md), [DEVELOPER_HANDOVER.md](./DEVELOPER_HANDOVER.md)).
- Automated tests (**218** tests across **12** Jest files; run **`npm test`** after pull) covering wire formats, LAN policy, XSS smoke, i18n guards, setup validation, realtime fan-out/dedupe, pastures warnings, and more.
- Update pipeline wired (`electron-updater` + GitHub Releases in `package.json`).

**Top risks / gaps**

1. **DevDependency / Electron advisory noise** — `npm audit` without `--omit=dev` still reports builder/Electron chains; **`npm audit --omit=dev`** is the production gate (CI uses it).
2. **DOM XSS surface** not uniformly escaped across every module — pastures path hardened; other modules may still need the same discipline ([AUDIT_v3.9_PREFINAL.md](./AUDIT_v3.9_PREFINAL.md) follow-up).
3. **No automated end-to-end** (Electron + browser) tests — regression risk for full startup and LAN flows.
4. **Lua single-thread** — any heavy or frequent disk fallback (e.g. move/copy paths) can hitch the sim; mitigations are architectural (aggregate-first, stagger, `pcall`), not “async I/O”.
5. **Repo contains two major products** — Farm Dashboard vs Realistic Livestock; separate release cadence and issue scope should stay explicit.

---

## 2. Repository inventory

| Path | Role | Notes |
| ---- | ---- | ----- |
| `FS25_FarmDashboard_App/FS25_FarmDashboard_App/` | Electron **main** (`main.js`), **preload**, **Express**, **merge**, **FTP**, **tests** | Primary engineering surface |
| `FS25_FarmDashboard_Mod/FS25_FarmDashboard_Mod/` | FS25 **Lua** mod, collectors | Writes `data.json`; authority-only export |
| `docs/` | Manuals, security, release notes | Canonical user + maintainer docs |
| `FS25_RealisticLivestockRM/` | Large **separate** FS25 mod | Not required for Farm Dashboard operation; increases clone size and cognitive load |

---

## 3. Version alignment (current baseline)

| Component | Version | File / symbol |
| --------- | ------- | --------------- |
| Desktop app | **3.9.0** | `FS25_FarmDashboard_App/…/package.json` |
| FS25 Farm Dashboard mod | **2.3.0.0** | `modDesc.xml`, `FarmDashboard.VERSION` in `FarmDashboard.lua` |

**Recommendation for every release:** bump **app** version in `package.json` for the Windows installer line; bump **mod** version when the Lua wire format or shipped behaviour changes — keep [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md) and [USER_MANUAL.md](./USER_MANUAL.md) in sync.

---

## 4. Security assessment

### 4.1 Network and authentication

- **Default bind:** loopback when LAN access is off — good default.
- **LAN mode:** HTTP **Basic** over **cleartext** — documented; acceptable only on **trusted LAN**; reverse proxy + TLS documented for stricter deployments.
- **Credential policy:** `lanCredentialPolicy.js` rejects default **admin/farmhub**, short passwords, weak list — **tested** (`tests/lanCredentialPolicy.test.js`).
- **Sensitive routes:** `isLanSensitiveHttpPath` and loopback bypass are deliberate; review when adding new `/api/*` handlers.

### 4.2 Electron surface

- Prefer **`contextIsolation`** and **`nodeIntegration: false`** (see handover) — verify on any **BrowserWindow** changes.
- **IPC:** handlers in `main.js` expose config, file reads, updater checks — acceptable for a local-first app; threat model is **malicious renderer code** (treat renderer data as untrusted for filesystem operations — most paths are main-derived, not raw user paths).

### 4.3 Web / DOM XSS

- Shared escaping (`web/assests/js/utils/escape.js`) and **`tests/xss.smoke.test.js`** reduce regression risk on covered paths.
- **Gap:** extend systematic review to **livestock**, **vehicles**, **navigation** string interpolation (called out in prefinal audit).

### 4.4 HTTP / CSRF / tokens

- Setup and LAN flows use tokens/secrets — see [SECURITY.md](./SECURITY.md) and handover; rate limits / POST guards exist on sensitive routes.

---

## 5. Reliability and performance

### 5.1 Electron main process

- **`consumeInstallLocaleFile`** uses async **`fs.promises`** (good startup hygiene).
- **`main.js`** still contains **`readFileSync`** in several paths (e.g. HTML load, hot paths) — acceptable for small assets but a **pattern risk** under slow disks; prioritize **`fs.promises`** for larger reads and non-blocking startup (aligned with prior performance discussion).

### 5.2 Lua mod (FS25)

- **Single-threaded** game Lua — long JSON serialization, deep traversal, or large file moves **block the sim**.
- Collectors already use **staggering** and **aggregate-first** export — keep new metrics **summary-only** (see workspace Cursor rules / handover).
- **`toJSON`** is custom — avoid cyclic or userdata-bearing tables in exports.

### 5.3 Merge and caches

- **`dataMerger.js`** is the choke point for schema drift — new top-level keys need **deterministic** merge rules.
- **FTP / staggered polling** — failure modes should remain soft-degrading (cached data, warnings).

---

## 6. Dependencies and supply chain

### 6.1 Direct runtime deps (summary)

`express`, `ws`, `cors`, `basic-ftp`, `electron-store`, `electron-updater` — mainstream; keep pinned via lockfile.

### 6.2 Dev / Electron

`electron`, `electron-builder`, `jest` — track Electron security releases for the embedded Chromium.

### 6.3 npm audit (production)

Command: `npm audit --omit=dev` from **`FS25_FarmDashboard_App/FS25_FarmDashboard_App/`**.

**Baseline:** **`fast-xml-parser@^5.7.3`** addresses the moderate XML-builder advisory; re-run after dependency bumps. Full-tree `npm audit` (including devDependencies) may still list **electron-builder** / **Electron** chains — track separately when upgrading **electron** / **electron-builder**.

---

## 7. Testing and quality gates

### 7.1 What exists today

| Area | Tests |
| ---- | ----- |
| LAN credentials | `lanCredentialPolicy.test.js` |
| XSS escape + greps | `xss.smoke.test.js` |
| i18n literals | `i18n.coverage.test.js` |
| Setup HTML validation | `setup.validation.test.js` |
| Realtime / dedupe / context | `realtime-connector.*`, `contextSwitch.test.js` |
| Pastures warnings | `pastures.warnings.test.js` |
| Wire formats | `wireFormats.test.js` |
| Livestock detail hydrate | `livestockDetail.test.js`, `detailAnimalsHydrate.test.js` |

**Result at audit time:** `npm test` — **12** suites, **218** tests, **all passed**; `npm audit --omit=dev` — **0** production vulnerabilities (re-verify locally). **Current tree:** expect **223** tests; CI also runs **`npm run verify:electron-pack`** and **`npm run i18n:verify`** (see [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)).

### 7.2 Gaps

- **No Playwright/Spectron-style E2E** for packaged app or LAN browser.
- **CI:** [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) on **`main` / `master` / `develop`** (Windows, Node 20): **`npm ci`**, **`npm test`**, **`npm run verify:electron-pack`**, **`npm run i18n:verify`**, **`npm audit --omit=dev`**.
- **Lua mod:** no automated Lua test harness in-repo — rely on SP/MP host manual QA.

---

## 8. Documentation

- **Strong:** [DEVELOPER_HANDOVER.md](./DEVELOPER_HANDOVER.md), [SECURITY.md](./SECURITY.md), [USER_MANUAL.md](./USER_MANUAL.md).
- **Typos / debt:** web folder **`assests`** — pervasive; renaming is **high churn**; optional for v4 unless you batch-update paths and tooling.
- **AUDIT_v3.9_PREFINAL.md:** contained outdated “not release-ready” boilerplate after fixes — **trimmed** in favour of the executive verdict (see file).

---

## 9. Release engineering (3.9 → updater → 4.0)

Use **[RELEASE_READINESS_v3.9.md](./RELEASE_READINESS_v3.9.md)** as the operator checklist and **[UPDATER_QA.md](./UPDATER_QA.md)** for behaviour validation.

**Updater code:** `app-updater.js` — packaged only; **10s** delayed initial check; auto-download + restart dialog.

---

## 10. Prioritized recommendations

| Priority | Item | Rationale | How to approach |
| -------- | ---- | --------- | --------------- |
| **P0** | Confirm **GitHub Release** assets (**`latest.yml` + `.exe`**) for **3.9.0** | Updater breaks silently without YAML | Follow release readiness doc |
| **P0** | Run **updater rehearsal** (3.9 → 4.0 beta) | Final gate before marketing **v4** stable | Draft release + installed 3.9 client |
| **P1** | Keep **`npm audit --omit=dev`** clean when touching deps | Supply-chain hygiene | CI fails on prod vulns; bump majors deliberately |
| **P1** | XSS audit **remaining** SPA modules | Defense in depth | **economy / changes / fields** hardened in 3.9.0; keep mirroring **`_safe` / `escapeFieldHtml`** for new `innerHTML` + extend **`tests/xss.smoke.test.js`** |
| **P2** | Reduce **`readFileSync`** in **`main.js`** hot paths | Startup / responsiveness | Incremental `fs.promises` migration |
| **P2** | ~~Optional **minimal CI**~~ | Done | See `.github/workflows/ci.yml` |
| **P3** | Frame-budget **Lua** work if profiling shows hitches | SP sim smoothness | Smaller chunks / rarer fallback paths |
| **P3** | Clarify **Realistic Livestock** vs Farm Dashboard in root **README** | Contributor confusion | Short section “Other mods in this repo” |

---

## 11. Conclusion

The project is **ready for a disciplined 3.9.0 ship** from a **code + docs + tests** perspective, with **manual updater QA** as the explicit last gate before declaring **4.0.0** production-stable. The highest-value engineering follow-ups are **supply-chain cleanup**, **broader XSS consistency**, and **lightweight CI/E2E** to protect the merge-heavy Electron stack.

---

## 12. References

- [RELEASE_READINESS_v3.9.md](./RELEASE_READINESS_v3.9.md)
- [RELEASE_v3.9.0.md](./RELEASE_v3.9.0.md)
- [AUDIT_v3.9_PREFINAL.md](./AUDIT_v3.9_PREFINAL.md)
- [SECURITY.md](./SECURITY.md)
- [DEVELOPER_HANDOVER.md](./DEVELOPER_HANDOVER.md)
