# FS25 Farm Dashboard — Release notes

Use this file for **short copy-paste text** on GitHub Releases. The **full history** is in [CHANGELOG.md](./CHANGELOG.md). **Security and LAN access:** [SECURITY.md](./SECURITY.md). **Authors:** [AUTHORS.md](./AUTHORS.md) — **JoshWalki** (Josh) & **WizardlyPayload**.

---

## Current shipping line: **4.0.0** (app) / **2.3.0.0** (mod — `modDesc.xml` matches Lua)

### GitHub release title (example)

`FS25 Farm Dashboard 4.0.0`

### Description (copy-paste)

**Full GitHub body:** **[GITHUB_RELEASE_v4.0.0.md](./GITHUB_RELEASE_v4.0.0.md)** — use that file for the release page. Short summary below.

---

**FS25 Farm Dashboard 4.0.0** — App **4.0.0** · Mod **2.3.0.0** · Canonical repo: **FarmHub**.

#### Updating from 3.9.0

Launch the installed app → **Settings → Check for updates** (or wait ~10s after startup) → **Restart and install** when the download completes. Requires a **published** GitHub Release with **`latest.yml`** + **`Setup 4.0.0.exe`** (not Draft).

#### Fresh install (mod → app)

1. **Mod** — Install `FS25_FarmDashboard.zip` into FS25 `mods`, enable on your save/server, **load the save once** so `data.json` exists.
2. **App** — Install `FS25 Farm Dashboard Setup 4.0.0.exe`, open **http://localhost:8766** (or your PC LAN IP on a tablet).
3. **Order:** mod → load save → desktop app. Guide: [INSTALL.md](./INSTALL.md).

#### What’s new in 4.0.0

| Area | Highlights |
|------|------------|
| **Auto-update** | Stable **3.9 → 4.0** in-app update via GitHub Releases + `latest.yml` |
| **Mod version badge** | Navbar hint when in-game mod is older than app expects |
| **Everything in 3.9** | LAN security, XSS sweep, offline cache, field/forage rules, CI — see [CHANGELOG.md](./CHANGELOG.md) §3.9.0 |

**Prior line:** [RELEASE_v3.9.0.md](./RELEASE_v3.9.0.md) · **Upgrade from public 2.0.0:** [UPGRADE_FROM_FS25-Farm-Dashboard.md](./UPGRADE_FROM_FS25-Farm-Dashboard.md)

### Where this release is documented

| Topic | Document |
| ----- | -------- |
| **4.0.0** narrative | [RELEASE_v4.0.0.md](./RELEASE_v4.0.0.md), [CHANGELOG.md](./CHANGELOG.md) §4.0.0 |
| **3.9.0** prior line | [RELEASE_v3.9.0.md](./RELEASE_v3.9.0.md), [CHANGELOG.md](./CHANGELOG.md) §3.9.0 |
| **Updater QA** | [UPDATER_QA.md](./UPDATER_QA.md) |
| **LAN** | [SECURITY.md](./SECURITY.md) |
| **Developers** | [DEVELOPER_HANDOVER.md](./DEVELOPER_HANDOVER.md) |

### Attach to this release (required for auto-update)

- `FS25 Farm Dashboard Setup 4.0.0.exe` — default build output: `%LOCALAPPDATA%\fs25-farm-dashboard-electron-out\`
- **`latest.yml`** — **required** for `electron-updater`
- `FS25_FarmDashboard.zip` — optional mod refresh (**2.3.0.0** unless mod version bumped separately)

---

## Prior release notes (3.9.0 and earlier)

See [GITHUB_RELEASE_v3.9.0.md](./GITHUB_RELEASE_v3.9.0.md) and [CHANGELOG.md](./CHANGELOG.md) for the **3.9.0** pre-final line and full version history.
