# FS25 Farm Dashboard — Release notes

Use this file for **short copy-paste text** on GitHub Releases. The **full history** is in [CHANGELOG.md](./CHANGELOG.md). **Security and LAN access:** [SECURITY.md](./SECURITY.md). **Authors:** [AUTHORS.md](./AUTHORS.md) — **JoshWalki** (Josh) & **WizardlyPayload**.

---

## Current shipping line: **3.0.0** (app) / **2.0.0.0** (mod — bump `modDesc.xml` when you ship a mod change)

### GitHub release title (example)

`FS25 Farm Dashboard 3.0.0`

### Description (copy-paste)

**FS25 Farm Dashboard 3.0.0** is the **rules-first** dashboard line for **Farming Simulator 25**:

- **Offline field rules** — concise **suggested next steps** on **field cards** from merged Lua + XML (bales, windrows, growth, Precision Farming hints where the save exports them).
- **Windrows** — Mod exports **`windrowLiters`** / **`windrowType`**; merger + UI show a **volume badge** on field cards when data exists.
- **Unified Settings** — **Servers & saves**, LAN, theme, notifications from the **gear** menu (see [USER_MANUAL.md](./USER_MANUAL.md)).
- **Windows reliability** — Default **`npm run dist`** writes outside the repo (`%LOCALAPPDATA%\fs25-farm-dashboard-electron-out`); NSIS upgrade path uses **`taskkill`** for stuck child processes; optional **full user-data wipe** on uninstall.
- **LAN tablets** — Optional bind on your network with **HTTP Basic Auth** + **IP allowlist**; localhost stays convenient — [SECURITY.md](./SECURITY.md).

1. **FS25 mod** (**2.0.0.0** in `modDesc.xml` unless you release a new mod build) — install into FS25 `mods`, enable on your save or server, and **run the game at least once** before relying on the desktop app.
2. **Windows desktop app** (**3.0.0**) — NSIS installer; dashboard at **http://localhost:8766**.

**Install order:** mod → enable & load save → then install/run the desktop app. See [README.md](../README.md) and [INSTALL.md](./INSTALL.md).

### Where this release is documented

| Topic | Document |
| ----- | -------- |
| **3.0.0** narrative | [RELEASE_v3.0.0.md](./RELEASE_v3.0.0.md), [CHANGELOG.md](./CHANGELOG.md) §3.0.0 |
| **2.0.0** mod/app foundations | [CHANGELOG.md](./CHANGELOG.md) §2.0.0 |
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
