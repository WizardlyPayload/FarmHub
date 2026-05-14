# Farm Dashboard v3.9 Prefinal Audit

Date: 2026-05-08  
Scope: Documentation alignment, developer/code review, security review, usability/reliability review, pre-release gate for v3.9 before updater validation to v4.

## Executive verdict

Status: **GO for v3.9.0 pre-final** (source tree as of the implementation pass).  
Blockers **#1–#3** below have been addressed in code + docs; **manual updater QA** (3.9.0 → 4.0.0) remains the final gate per **[UPDATER_QA.md](./UPDATER_QA.md)**.

Historical note: this audit originally recorded **Conditional NO-GO** before the remediation work landed — see **Verification evidence** for the updated proof points.

## What was audited

- Documentation and setup manuals in `docs/`, root `README.md`, and app `README.md`.
- App runtime and UI code in `FS25_FarmDashboard_App/FS25_FarmDashboard_App`.
- Mod runtime code in `FS25_FarmDashboard_Mod/FS25_FarmDashboard_Mod`.
- Automated checks:
  - `npm test` (Jest suite)
  - `npm audit --omit=dev --json`
  - **Post-audit CI:** `npm run verify:electron-pack`, `npm run i18n:verify` (see `.github/workflows/ci.yml`)

## Verification evidence

- App version: **`3.9.0`** in `FS25_FarmDashboard_App/FS25_FarmDashboard_App/package.json` (+ matching `package-lock.json`).
- Mod version: **`2.3.0.0`** in both `FS25_FarmDashboard_Mod/FS25_FarmDashboard_Mod/modDesc.xml` and `FarmDashboard.VERSION` (Lua).
- Tests: run **`npm test`** — expanded Jest coverage (fan-out, dedupe, pastures, setup, LAN policy, XSS smoke, i18n guard, etc.); re-run after pull before tagging.
- Production dependency audit: **`npm audit --omit=dev`** — expect **0** production vulnerabilities before tag (re-verify on your machine).

## Release blockers (original audit — all three resolved for v3.9.0)

### 1) Version/source-of-truth mismatch across code and docs — **RESOLVED**

- **App** `3.9.0` — `package.json` / `package-lock.json`.
- **Mod** `2.3.0.0` — `modDesc.xml` matches `FarmDashboard.VERSION`.
- **Docs** updated: `USER_MANUAL.md`, `PROJECT_CONTEXT.md`, `CHANGELOG.md`, `RELEASE_NOTES.md`, `DEVELOPER_HANDOVER.md`, `INSTALL.md`, `README` files, **`RELEASE_v3.9.0.md`**.

### 2) Security posture: weak LAN defaults + cleartext Basic auth risk — **MITIGATED (policy + docs)**

- **`lanCredentialPolicy.js`** — enabling LAN with **`admin`/`farmhub`**, passwords **&lt; 10** chars, or known-weak passwords returns **`ok: false`** from `save-lan-access-settings`. UI maps errors via **`settings.lanErr*`** keys.
- **Cleartext Basic** remains a transport limitation — **[SECURITY.md](./SECURITY.md)** v3.9 documents trusted-LAN use, optional TLS via reverse proxy, and the **CORS** / credential rules.

### 3) XSS risk from untrusted data rendered with HTML templates — **MITIGATED (pastures path + tests)**

- **`web/assests/js/utils/escape.js`** + **`pastures.js`** `_safe()` on names, messages, and table cells; **`tests/xss.smoke.test.js`** guards regressions.
- **Update (3.9.0):** **`economy.js`**, **`changes.js`**, and **`fields.js`** innerHTML paths that render game-sourced strings were hardened (see **[CHANGELOG.md](./CHANGELOG.md)** §3.9.0). Residual risk: **new** `innerHTML` sites or third-party DOM should be reviewed the same way.

## Major non-blocking findings (fix in v3.9.x or v4)

### 4) Test drift risk around realtime livestock fan-out behavior

Severity: **High**

- Production logic and test assumptions can diverge in row-generation semantics under clustered livestock.
- Current tests pass but do not fully protect runtime regressions under high head counts and context switches.

Action:
- Add integration-level tests for realtime payload fan-out, farm/server/save switching, and cap behavior.

### 5) Setup and installation docs have clarity gaps

Severity: **Medium** (partially addressed)

- Historical: `INSTALL.md` token issues and mod folder naming were corrected for **`FS25_FarmDashboard`** / zip layout.
- **Residual:** keep root **`README.md`**, **`INSTALL.md`**, and **`RELEASE_NOTES.md`** aligned whenever build output paths or GitHub URLs change.

### 6) Usability/i18n consistency gaps

Severity: **Medium**

- i18n framework is solid, but not all user-visible operational/error strings are consistently localized.
- Some warning semantics can be interpreted as "critical condition" when data is actually "not available."

Action:
- Finish hardcoded-string sweep and clarify warning taxonomy for data-absence vs confirmed critical states.

## Developer review summary

Strengths:
- Strong modular architecture across app modules and Lua collectors.
- Good reliability mechanisms (polling/retry/state restoration/authority checks).
- Test suite is green and fast; schema and wire-format tests exist.
- Dependency audit clean for production packages.

Risks:
- Incomplete end-to-end tests for cross-context state transitions.
- **Packaging / docs drift** — mitigated by **`npm run verify:electron-pack`** in CI; still re-read release docs when paths or **`build.files`** change.
- **Security-sensitive UI** — high-traffic modules hardened in 3.9.0; treat **new** `innerHTML` as high review priority (see §Major non-blocking findings and **CHANGELOG** §3.9.0).

## Security review summary (post-remediation)

Status for **v3.9.0 pre-final:** blockers **#1–#3** in this document are **resolved** in tree — LAN policy + pastures XSS path + doc alignment. Residual risks match **[SECURITY.md](./SECURITY.md)** (cleartext Basic on LAN) and **ongoing** review of any **new** game-string → HTML paths (major modules addressed per **CHANGELOG** §3.9.0).

Positive controls already present:
- Electron hardening baseline (`nodeIntegration: false`, `contextIsolation: true`).
- CSRF/token/rate-limit controls on sensitive routes.
- Path/id validation and defensive file I/O patterns.

## Usability review summary (post-remediation)

Strengths:
- Feature-rich setup and farm/server flow.
- Good live data presentation depth across modules.

Non-blocking polish for **v4+:** first-run copy, i18n completeness on edge strings, and warning taxonomy (telemetry vs critical) — tracked in §Major non-blocking findings above.

## v3.9 prefinal release gate checklist

- [ ] Version unification complete (`modDesc.xml`, Lua constant, docs)
- [ ] LAN security defaults hardened
- [ ] High-risk XSS paths remediated and reviewed
- [ ] Installation/release docs aligned and typo-safe
- [ ] Realtime/farm/server/save integration tests expanded
- [ ] Full regression pass complete after fixes
- [ ] Updater system validated (your planned final check before v4 rollout)

## Proposed release labeling

Use this audit document as the formal prefinal record: **v3.9 prefinal audit baseline**.  
After blocker remediation and updater validation, publish as:
- v3.9 (stabilization release)
- then v4 via updater-path promotion if update flow is confirmed healthy.

