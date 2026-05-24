# GitHub Release — FS25 Farm Dashboard 4.0.0 (copy/paste)

Use this as the **Release description** on GitHub for tag **`v4.0.0`**.  
**Canonical repo:** [WizardlyPayload/FarmHub](https://github.com/WizardlyPayload/FarmHub/releases).

---

## FS25 Farm Dashboard 4.0.0

**App 4.0.0** · **Mod 2.3.0.0** · Successor to [3.9.0](https://github.com/WizardlyPayload/FarmHub/releases)

### Updating from 3.9.0 (recommended)

If you already have **Farm Dashboard 3.9.0** installed:

1. Launch the app (packaged install — not `npm start`).
2. Wait ~10 seconds **or** open **Settings → Check for updates**.
3. When prompted, choose **Restart and install** after the download finishes.

No manual download required unless auto-update is blocked by firewall or the release is still a **Draft** (drafts are invisible to the updater — publish the release first).

### Fresh install (mod → app)

| Step | Action |
|------|--------|
| **1 — Mod** | Install **`FS25_FarmDashboard.zip`** into `Documents\My Games\FarmingSimulator2025\mods\`. Enable on each save, then **load that save once**. |
| **2 — App** | Install **`FS25 Farm Dashboard Setup 4.0.0.exe`**, complete **Settings → Servers & saves**. |
| **3 — Open** | **http://localhost:8766** on this PC; LAN IP on tablets (see [SECURITY.md](SECURITY.md)). |

Full guide: [INSTALL.md](INSTALL.md).

---

### Attach to this release (required for auto-update)

| Asset | Purpose |
|-------|---------|
| **`FS25 Farm Dashboard Setup 4.0.0.exe`** | Windows installer (app **4.0.0**) |
| **`latest.yml`** | **Required** — `electron-updater` discovery file (same folder as `npm run dist` output) |
| **`FS25_FarmDashboard.zip`** | Optional — mod **2.3.0.0** refresh (exports `modVersion` in `data.json`) |

Build output (default): `%LOCALAPPDATA%\fs25-farm-dashboard-electron-out\`

---

### What’s new in 4.0.0

- **In-app auto-update** — stable promotion of the 3.9 → 4.0 updater channel ([UPDATER_QA.md](UPDATER_QA.md)).
- **Mod version badge** — navbar hint when the in-game mod is older than the app expects; tooltip links users to update **`FS25_FarmDashboard.zip`** from Releases.
- **Release engineering** — docs, wiki, and version strings aligned to **4.0.0**; **230** automated tests.

Everything from **3.9.0** (LAN credential policy, XSS hardening, offline cache, field/forage rules, CI) remains included. See [CHANGELOG.md](CHANGELOG.md) §4.0.0 and §3.9.0.

---

### Support

Include: FS25 version, SP vs dedicated, **app 4.0.0**, **mod 2.3.0.0**, local vs FTP, steps to reproduce.

**Docs:** [USER_MANUAL.md](USER_MANUAL.md) · **Upgrade from public 2.0.0:** [UPGRADE_FROM_FS25-Farm-Dashboard.md](UPGRADE_FROM_FS25-Farm-Dashboard.md)
