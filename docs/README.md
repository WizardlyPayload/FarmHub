# Farm Dashboard — Documentation

All project documentation lives under **`docs/`** (repository root: **FarmHub** on GitHub).

| Document | Description |
| -------- | ----------- |
| [README.md](../README.md) | Repository landing — install summary, build, layout |
| [**USER_MANUAL.md**](./USER_MANUAL.md) | **Illustrated how-to:** installation, UI map, field rules, windrows, screenshot checklist |
| [INSTALL.md](./INSTALL.md) | **Quick install:** mod first, then Windows app (every save) |
| [CHANGELOG.md](./CHANGELOG.md) | Full version history |
| [RELEASE_NOTES.md](./RELEASE_NOTES.md) | Short copy for **GitHub Releases** |
| [RELEASE_v3.9.0.md](./RELEASE_v3.9.0.md) | Long-form **3.9.0** pre-final narrative |
| [RELEASE_v3.0.0.md](./RELEASE_v3.0.0.md) | Long-form **3.0.0** narrative |
| [RELEASE_v2.0.0.md](./RELEASE_v2.0.0.md) | **2.0.0** installer / i18n / maintainer notes |
| [USER_GUIDE.md](./USER_GUIDE.md) | Short reference (fields, rules, windrows) |
| [SECURITY.md](./SECURITY.md) | LAN access, Basic Auth, IP allowlist, Electron hardening |
| [DESCRIPTION_AND_SCREENSHOTS.md](./DESCRIPTION_AND_SCREENSHOTS.md) | Product copy + screenshot checklist |
| [**DEVELOPER_HANDOVER.md**](./DEVELOPER_HANDOVER.md) | **v3.9 dev reference:** architecture, mod, Electron host, merge, rules, i18n, build, debugging |
| [**AUDIT_v3.9_PREFINAL.md**](./AUDIT_v3.9_PREFINAL.md) | **v3.9 pre-final audit:** release gate, security/i18n posture (current) |
| [**AUDIT_v3.0.md**](./AUDIT_v3.0.md) | **v3.0 gap analysis** (frozen April 2026; i18n “segment” pipeline noted there was removed — see **I18N.md**) |
| [**SCREENSHOT_MANIFEST.md**](./SCREENSHOT_MANIFEST.md) | Screenshot filenames, captions, [auto]/[manual] capture recipes |
| [**I18N.md**](./I18N.md) | **Internationalisation:** 27 locales, `messages/*.json` pipeline, Google Translate refill |
| [**PROJECT_CONTEXT.md**](./PROJECT_CONTEXT.md) | Full project overview for planning and audits |
| [**RELEASE_READINESS_v3.9.md**](./RELEASE_READINESS_v3.9.md) | **Operator checklist:** build 3.9.0, GitHub assets, updater rehearsal before v4 |
| [**PROJECT_DEEP_AUDIT_FARMHUB.md**](./PROJECT_DEEP_AUDIT_FARMHUB.md) | **Full-repo audit:** findings, risks, prioritized fixes |
| [**UPDATER_QA.md**](./UPDATER_QA.md) | Auto-update (`electron-updater`) verification matrix |
| [**VALIDATION-RUNBOOK.md**](./VALIDATION-RUNBOOK.md) | Plan v5 diagnostics soak profiles (`[FarmDash][diag]` thresholds) |
| [**CURSOR_SESSION_MEMORY.md**](./CURSOR_SESSION_MEMORY.md) | Cursor chat companion (session summaries) |
| [SALES_HANDOVER.md](./SALES_HANDOVER.md) | Sales & partnerships positioning |
| [AUTHORS.md](./AUTHORS.md) | **JoshWalki** & **WizardlyPayload** |

**Authoritative versions:** `FS25_FarmDashboard_App/FS25_FarmDashboard_App/package.json` (app), `FS25_FarmDashboard_Mod/FS25_FarmDashboard_Mod/modDesc.xml` (mod).

**Scripts (build / CI):** [**`tools/README.md`**](../tools/README.md) at repo root — Electron helpers live in **`tools/app/`**.

**Screenshots:** [`SCREENSHOT_MANIFEST.md`](./SCREENSHOT_MANIFEST.md) lists optional **`fd-*`** PNGs for [`USER_MANUAL.md`](./USER_MANUAL.md). The manual is complete without images; add PNGs under **`screenshots/`** when you want illustrations.

**Internal engine notes (maintainers):** `FS25 Engine Interaction Modules.txt`, `Dynamic Ground Material Moisture & Transfor.txt`, `FS25 Chat System & Server Integration.txt` in this folder — referenced from Lua comments where applicable.
