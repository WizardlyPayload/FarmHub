# Releases & Upgrades

## Current release (3.9.0)

| Asset | Version |
|-------|---------|
| `FS25 Farm Dashboard Setup 3.9.0.exe` | App **3.9.0** |
| `FS25_FarmDashboard.zip` | Mod **2.3.0.0** |

**Download:** [GitHub Releases](https://github.com/WizardlyPayload/FarmHub/releases)

**Install order:** mod → load save → app. See [Installation Guide](Installation-Guide).

---

## Upgrading from public FS25-Farm-Dashboard (2.0.0)

The old repo **[WizardlyPayload/FS25-Farm-Dashboard](https://github.com/WizardlyPayload/FS25-Farm-Dashboard)** shipped app **2.0.0** / mod **2.0.0.0**. **FarmHub** is the canonical project now.

1. Replace mod with **`FS25_FarmDashboard.zip` (2.3.0.0)**; load each save once.
2. Install app **3.9.0** (or use in-app updater when **4.0** is published).
3. Re-check **Settings → Servers & saves** (FTP paths, LAN password rules changed in 3.9).

Full delta: [UPGRADE_FROM_FS25-Farm-Dashboard.md](https://github.com/WizardlyPayload/FarmHub/blob/main/docs/UPGRADE_FROM_FS25-Farm-Dashboard.md)

---

## Highlights since public 2.0.0

### 3.0 product line
- Offline **rules engine** + field suggestions
- **Windrow** export and UI badges
- Unified **Settings** (servers, FTP, mod config)
- **LAN** HTTP Basic + allowlist
- NSIS installer, build output outside repo

### 3.9 (this release)
- **LAN security:** reject default `admin`/`farmhub`, short/weak passwords
- **DOM XSS** hardening across sections
- **Offline cache** for local saves on app restart (FTP excluded)
- **Forage workflow:** 2000 L floor; bale/windrow badges aligned with rules
- **Mulch → cultivate** before seeding
- **Lime** suggestions show pH gap
- **Realtime** scoped to active `serverId`
- **Section background** crossfade art
- CI: tests, i18n verify, electron pack verify

Full release text: [GITHUB_RELEASE_v3.9.0.md](https://github.com/WizardlyPayload/FarmHub/blob/main/docs/GITHUB_RELEASE_v3.9.0.md)

---

## Auto-updates

Packaged installs use **electron-updater** (GitHub Releases on **FarmHub**).

- **Settings → Dashboard → Check for updates**
- Download runs in background; install on quit when ready
- Maintainer QA: [UPDATER_QA.md](https://github.com/WizardlyPayload/FarmHub/blob/main/docs/UPDATER_QA.md)

---

## Version history

| Version | Focus |
|---------|--------|
| **3.9.0** | Security hardening, cache, forage/rules fixes |
| **3.0.0** | Rules-first fields, windrows, unified settings, LAN |
| **2.0.0** | Field merge accuracy, multi-farm, FTP, authority |
| **1.1.2** | Mod shop image export, vehicle thumbnails |
| **1.0.0** | First public release |

Detail: [CHANGELOG.md](https://github.com/WizardlyPayload/FarmHub/blob/main/docs/CHANGELOG.md)

---

## Reporting issues

Include:

- FS25 version, SP vs dedicated
- App **3.9.0**, mod **2.3.0.0**
- Local vs FTP
- Expected vs actual

[Open an issue](https://github.com/WizardlyPayload/FarmHub/issues)
