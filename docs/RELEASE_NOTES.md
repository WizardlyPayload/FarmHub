# FS25 Farm Dashboard — Release notes

Use this file for **short copy-paste text** on GitHub Releases. The **full history** is in [CHANGELOG.md](./CHANGELOG.md). **Security and LAN access:** [SECURITY.md](./SECURITY.md). **Authors:** [AUTHORS.md](./AUTHORS.md) — **JoshWalki** (Josh) & **WizardlyPayload**.

---

## Current shipping line: **3.9.0** (app) / **2.3.0.0** (mod — `modDesc.xml` matches Lua)

### GitHub release title (example)

`FS25 Farm Dashboard 3.9.0`

### Description (copy-paste)

**FS25 Farm Dashboard 3.9.0** is the **pre-final hardening** release for **Farming Simulator 25** — security, tests tied to production code, pasture telemetry semantics, setup validation, and docs/version alignment ahead of the **v4** updater promotion.

- **LAN security** — Rejects **default `admin` / `farmhub`**, **short passwords**, and **known-weak** passwords when **LAN access** is turned on. See [SECURITY.md](./SECURITY.md).
- **DOM safety** — Shared **`escapeHtml`** helper; pasture modals and tables escape game-sourced names.
- **Tests** — Realtime fan-out, dedupe keys, pasture warnings, setup `mapSaveError`, LAN policy, XSS smoke — all green under `npm test`.
- **Pastures** — **Telemetry missing** vs **critical low stock** are distinct severities; counts are **head-aware** for LOD clusters.
- **Setup** — Per-field validation, success state before redirect (browser setup path).

**Still the same great dashboard:** rules-first fields, windrows, unified Settings, FTP, LAN tablets (with strong creds). Full narrative: **[RELEASE_v3.9.0.md](./RELEASE_v3.9.0.md)** · History: **[CHANGELOG.md](./CHANGELOG.md)** §**3.9.0**.

1. **FS25 mod** (**2.3.0.0**) — copy into FS25 `mods`, enable on your save or server, **load the save once** with the mod active.
2. **Windows desktop app** (**3.9.0**) — NSIS installer; dashboard at **http://localhost:8766**.

**Install order:** mod → enable & load save → then install/run the desktop app. See [README.md](../README.md) and [INSTALL.md](./INSTALL.md).

**Next step for maintainers:** updater QA (**3.9.0 → 4.0.0**) per **[UPDATER_QA.md](./UPDATER_QA.md)**.

### Where this release is documented

| Topic | Document |
| ----- | -------- |
| **3.9.0** narrative | [RELEASE_v3.9.0.md](./RELEASE_v3.9.0.md), [CHANGELOG.md](./CHANGELOG.md) §3.9.0 |
| **3.0.0** prior line | [RELEASE_v3.0.0.md](./RELEASE_v3.0.0.md), [CHANGELOG.md](./CHANGELOG.md) §3.0.0 |
| **Audit bundle** | [AUDIT_v3.9_PREFINAL.md](./AUDIT_v3.9_PREFINAL.md) |
| **LAN** | [SECURITY.md](./SECURITY.md) |
| **Product copy + screenshots** | [DESCRIPTION_AND_SCREENSHOTS.md](./DESCRIPTION_AND_SCREENSHOTS.md) |
| **Developers** | [DEVELOPER_HANDOVER.md](./DEVELOPER_HANDOVER.md) |

### Attach to this release (recommended)

- `FS25 Farm Dashboard Setup 3.0.0.exe` — default build output: `%LOCALAPPDATA%\fs25-farm-dashboard-electron-out\` (see [CHANGELOG.md](./CHANGELOG.md) §3.0.0); or your in-repo `electron-pack-out` if you build that way.
- `FS25_FarmDashboard_Mod.zip` — zip the **`FS25_FarmDashboard_Mod`** folder for `Documents\My Games\FarmingSimulator2025\mods\`

### Reporting issues

Include: FS25 version, single-player vs dedicated, mod and app **versions**, local vs FTP, and what you expected vs what happened.

---

## Earlier releases (summary)

| Version | Notes |
| ------- | ----- |
| **2.0.0** | Field merge, authority, multi-farm, FTP polling, security docs — see [CHANGELOG.md](./CHANGELOG.md). |
| **1.1.2** | Mod shop image export, vehicle thumbnails. |
| **1.0.0** | First public release. |

Full detail: [CHANGELOG.md](./CHANGELOG.md).
