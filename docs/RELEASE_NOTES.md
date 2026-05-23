# FS25 Farm Dashboard — Release notes

Use this file for **short copy-paste text** on GitHub Releases. The **full history** is in [CHANGELOG.md](./CHANGELOG.md). **Security and LAN access:** [SECURITY.md](./SECURITY.md). **Authors:** [AUTHORS.md](./AUTHORS.md) — **JoshWalki** (Josh) & **WizardlyPayload**.

---

## Current shipping line: **3.9.0** (app) / **2.3.0.0** (mod — `modDesc.xml` matches Lua)

### GitHub release title (example)

`FS25 Farm Dashboard 3.9.0`

### Description (copy-paste)

**Full GitHub body (every feature since public 2.0.0):** **[GITHUB_RELEASE_v3.9.0.md](./GITHUB_RELEASE_v3.9.0.md)** — use that file for the release page. Short summary below.

---

**FS25 Farm Dashboard 3.9.0** — App **3.9.0** · Mod **2.3.0.0** · Canonical repo: **FarmHub** (replaces public [FS25-Farm-Dashboard](https://github.com/WizardlyPayload/FS25-Farm-Dashboard) **2.0.0**).

#### Install first (mod → app)

1. **Mod** — Install `FS25_FarmDashboard.zip` into FS25 `mods`, enable on your save/server, **load the save once** so `data.json` exists.
2. **App** — Install `FS25 Farm Dashboard Setup 3.9.0.exe`, open **http://localhost:8766** (or your PC LAN IP on a tablet).
3. **Order:** mod → load save → desktop app. Guide: [INSTALL.md](./INSTALL.md).

#### What’s new since public 2.0.0 (highlights)

| Area | Highlights |
|------|------------|
| **Look & feel** | Section **background pictures** (crossfade per tab), **Theme** settings, **27 languages** |
| **Fields** | **Rules engine** + cache; **field clusters** & exclusions; PF bars; **mulch → cultivate before seed**; **lime pH gap** |
| **Forage & bales** | Windrow liters/type, loose straw/grass/hay probes, **bale count on field**, card badges, **2000 L** noise floor, rules aligned with badges |
| **Livestock** | Detail API, LOD fan-out, escaped names |
| **Pastures** | Telemetry vs critical stock severities |
| **Vehicles** | Mod shop PNG export + **thumbnails** on cards |
| **Data** | Lua+XML merge, staggered collectors, FTP sync/stagger, multi-farm, **offline cache** (local only), **serverId-safe realtime** |
| **Settings** | Unified gear menu, SimHub page, section toggles |
| **Security (3.9)** | LAN weak/default password block, DOM XSS sweep |
| **Build** | NSIS, updater 3.9→4.0 ready, CI tests + i18n verify |

**3.9-specific:** LAN credential policy, offline snapshot on close (FTP excluded), harvest/mulch/realtime fixes above.

**Upgrade from 2.0.0:** [UPGRADE_FROM_FS25-Farm-Dashboard.md](./UPGRADE_FROM_FS25-Farm-Dashboard.md) · **Full list:** [GITHUB_RELEASE_v3.9.0.md](./GITHUB_RELEASE_v3.9.0.md) · **History:** [CHANGELOG.md](./CHANGELOG.md)

**Maintainers:** updater QA **3.9 → 4.0** — [UPDATER_QA.md](./UPDATER_QA.md) · Narrative: [RELEASE_v3.9.0.md](./RELEASE_v3.9.0.md)

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

- `FS25 Farm Dashboard Setup 3.9.0.exe` — default build output: `%LOCALAPPDATA%\fs25-farm-dashboard-electron-out\` (see [CHANGELOG.md](./CHANGELOG.md) §3.9.0); or your in-repo `electron-pack-out` if you build `npm run dist:in-repo`.
- **`FS25_FarmDashboard.zip`** — FS25 mod for `Documents\My Games\FarmingSimulator2025\mods\` (built with **`tools\Zip-FarmDashboardMod.ps1`**; archive root is **`modDesc.xml`**, **`icon.png`**, **`src/`** only)

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
