# Releases & Upgrades

## Current release (4.0.0)

| Asset | Version |
|-------|---------|
| `FS25 Farm Dashboard Setup 4.0.0.exe` | App **4.0.0** |
| `FS25_FarmDashboard.zip` | Mod **2.3.0.0** |

**Download:** [GitHub Releases](https://github.com/WizardlyPayload/FarmHub/releases)

**Install order:** mod → load save → app. See [Installation Guide](Installation-Guide).

### Updating from 3.9.0

Launch the installed app → **Settings → Check for updates** (or wait ~10s) → **Restart and install**. Requires a **published** release with **`latest.yml`** + **`Setup 4.0.0.exe`** (draft releases are invisible to the updater).

---

## Upgrading from public FS25-Farm-Dashboard (2.0.0)

The old repo **[WizardlyPayload/FS25-Farm-Dashboard](https://github.com/WizardlyPayload/FS25-Farm-Dashboard)** shipped app **2.0.0** / mod **2.0.0.0**. **FarmHub** is the canonical project now.

1. Replace mod with **`FS25_FarmDashboard.zip` (2.3.0.0)**; load each save once.
2. Install app **4.0.0** (or update from **3.9.0** via in-app updater).
3. Re-check **Settings → Servers & saves** (FTP paths, LAN password rules).

Full delta: [UPGRADE_FROM_FS25-Farm-Dashboard.md](https://github.com/WizardlyPayload/FarmHub/blob/main/docs/UPGRADE_FROM_FS25-Farm-Dashboard.md)

---

## What’s new in 4.0.0

- **In-app auto-update** — stable **3.9 → 4.0** path via GitHub Releases
- **Mod version badge** — navbar hint when in-game mod is outdated
- **Everything in 3.9** — see below

Full release text: [GITHUB_RELEASE_v4.0.0.md](https://github.com/WizardlyPayload/FarmHub/blob/main/docs/GITHUB_RELEASE_v4.0.0.md)

---

## Highlights since public 2.0.0

### 3.9 line (included in 4.0)
- **LAN security:** reject default `admin`/`farmhub`, short/weak passwords
- **DOM XSS** hardening across sections
- **Offline cache** for local saves on app restart (FTP excluded)
- **Forage workflow:** 2000 L floor; bale/windrow badges aligned with rules
- **Mulch → cultivate** before seeding
- CI: tests, i18n verify, electron pack verify

### 3.0 product line
- Offline **rules engine** + field suggestions
- **Windrow** export and UI badges
- Unified **Settings** (servers, FTP, mod config)
- **LAN** HTTP Basic + allowlist

---

## Auto-updates

Packaged installs use **electron-updater** (GitHub Releases on **FarmHub**).

- **Settings → Check for updates**
- Download runs in background; **Restart and install** dialog when ready
- Publish releases as **Published** (not **Draft**) with **`latest.yml`**
- Maintainer QA: [UPDATER_QA.md](https://github.com/WizardlyPayload/FarmHub/blob/main/docs/_internal/UPDATER_QA.md)

---

## Version history

| Version | Focus |
|---------|--------|
| **4.0.0** | Stable updater + mod version badge |
| **3.9.0** | Security hardening, cache, forage/rules fixes |
| **3.0.0** | Rules-first fields, windrows, unified settings, LAN |
| **2.0.0** | Field merge accuracy, multi-farm, FTP, authority |

Detail: [CHANGELOG.md](https://github.com/WizardlyPayload/FarmHub/blob/main/docs/CHANGELOG.md)

---

## Reporting issues

Include:

- FS25 version, SP vs dedicated
- App **4.0.0**, mod **2.3.0.0**
- Local vs FTP
- Expected vs actual

[Open an issue](https://github.com/WizardlyPayload/FarmHub/issues)
