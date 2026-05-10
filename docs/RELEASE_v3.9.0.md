# FS25 Farm Dashboard — Release **v3.9.0** (pre-final hardening line)

**Desktop app:** `3.9.0` (`FS25_FarmDashboard_App/FS25_FarmDashboard_App/package.json`)  
**FS25 mod:** `2.3.0.0` (`modDesc.xml` + `FarmDashboard.VERSION` in Lua — aligned in this release)

**Plan + audit context:** this release implements the **v3.9 Prefinal Release Plan** (see repo planning docs / team checklist) and closes the findings in **[AUDIT_v3.9_PREFINAL.md](./AUDIT_v3.9_PREFINAL.md)**. The **only** remaining manual gate before promoting **v4.0.0** as “stable” is **updater QA** — install **3.9.0**, publish **4.0.0**, verify download + install-on-quit per **[UPDATER_QA.md](./UPDATER_QA.md)**.

---

## Executive summary

v3.9.0 is a **pre-final** quality and security line: **no new gameplay features** on the mod side beyond version alignment. The focus is **release engineering** — tests that exercise **shipping code paths**, **LAN credential policy**, **DOM XSS hardening**, **pasture warning semantics** (telemetry vs critical), **first-run setup validation**, **i18n completeness** on high-traffic UI strings, and **documentation/version alignment** across `package.json`, `modDesc.xml`, and the `docs/` tree.

---

## Security (blockers from the audit)

| Area | What shipped |
|------|----------------|
| **Default LAN credentials** | `lanCredentialPolicy.js` rejects the historic **`admin` / `farmhub`** pair when **LAN access is enabled**, plus passwords **&lt; 10 chars** and a **known-weak** list. IPC returns structured error codes (`default_credentials_rejected`, `password_too_short`, `weak_password`, `username_required`); **`dashboard-settings.js`** maps them to **`settings.lanErr*`** i18n strings. |
| **DOM XSS (game strings)** | Shared **`web/assests/js/utils/escape.js`** (`farmDashEscape.escapeHtml`). **`pastures.js`** routes pasture names, animal names/types, warning messages, dairy pair names, and drilldown tables through `_safe()` (delegates to the shared helper). **`tests/xss.smoke.test.js`** locks the escape function and greps `pastures.js` / `notifications.js` for regressions. |
| **CORS** | Documented in **[SECURITY.md](./SECURITY.md)** v3.9+: allow **localhost/127.0.0.1** origins and **any host on port 8766** (LAN tablets). |
| **Optional LAN auth** | Persistent **warning banner** when **“optional LAN login”** is checked (`settings.lanAuthOptionalBanner`); confirm dialog unchanged. |

Transport (**cleartext HTTP Basic**) is unchanged — still **home-LAN only** unless you add TLS via a reverse proxy; see **SECURITY.md**.

---

## Reliability / tests (production parity)

| Module | File | Role |
|--------|------|------|
| LOD fan-out | `web/assests/js/realtime-fanout.js` | One row per head, per-pen cap **4096**, global cap — **`realtime-connector.js`** delegates here; **`tests/realtime-connector.fanOut.test.js`** imports the same UMD build as Jest. |
| Payload dedupe | `web/assests/js/realtime-dedupe.js` | Fingerprint = JSON (minus volatile fields) **+ farm + server** so farm/server switches invalidate cache — **`tests/contextSwitch.test.js`**. |
| Pasture warnings | `web/assests/js/pastures-warnings.js` | `buildFoodWaterDecisions` + `countLivestockHeads` — **`tests/pastures.warnings.test.js`**. |
| Setup validation | `web/assests/js/setup-validation.js` | `mapSaveError` regex classes — **`tests/setup.validation.test.js`** + structural grep of **`setup.html`**. |
| LAN policy | `lanCredentialPolicy.js` | **`tests/lanCredentialPolicy.test.js`**. |

---

## UX / i18n

- **Pastures:** card labels, status badges, warning headings, drilldown copy → **`pastures.*`** keys + **`tests/i18n.coverage.test.js`** banned-literal guard.
- **Notifications:** empty state + relative time → **`notifications.*`**.
- **Setup:** per-field **`invalid-feedback`**, success card before redirect (browser **`/api/setup-config`** path), actionable **network/auth/path/token** messages.

---

## Version & docs alignment

- **`modDesc.xml`:** `2.3.0.0` (matches Lua).
- **`package.json` / `package-lock.json`:** `3.9.0`.
- **INSTALL.md:** fixed malformed `` `**data.json` `` markdown; release URL → **`WizardlyPayload/FarmHub`**.
- **USER_MANUAL / DEVELOPER_HANDOVER:** `lanUsername` (not `lanUser`), installer name **`Setup 3.9.0`**.

---

## Upgrade / next step (v4)

1. Follow **[RELEASE_READINESS_v3.9.md](./RELEASE_READINESS_v3.9.md)** — build and publish **`3.9.0`** with **`latest.yml`** + installer on GitHub Releases.  
2. Follow **[UPDATER_QA.md](./UPDATER_QA.md)** — publish **4.0.0** on the GitHub repo configured in **`FS25_FarmDashboard_App/FS25_FarmDashboard_App/package.json`** → **`build.publish`** (**`owner`: `WizardlyPayload`**, **`repo`: `FarmHub`**, **`releaseType`: `release`**).  
3. **`app-updater.js`** is only active when **`app.isPackaged`** is true — dev (`npm start`) skips the updater (`initAppUpdater` returns immediately in development).  
4. When QA passes, promote **v4** as the advertised stable line. Full-project findings: **[PROJECT_DEEP_AUDIT_FARMHUB.md](./PROJECT_DEEP_AUDIT_FARMHUB.md)**.

---

**Authors:** [AUTHORS.md](./AUTHORS.md) · **Security:** [SECURITY.md](./SECURITY.md) · **Changelog:** [CHANGELOG.md](./CHANGELOG.md) §**3.9.0**
