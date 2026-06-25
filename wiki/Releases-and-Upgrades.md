# Releases & Upgrades

## Current release (4.2.0)

| Asset | Version |
|-------|---------|
| `FS25-Farm-Dashboard-Setup-4.2.0.exe` | App **4.2.0** |
| `FS25_FarmDashboard.zip` | Mod **3.4.0.6** |

**Download:** [GitHub Releases](https://github.com/WizardlyPayload/FarmHub/releases)

**Install order:** mod → load save → app. See [Installation Guide](Installation-Guide).

**Release notes:** [GITHUB_RELEASE_v4.2.0.md](https://github.com/WizardlyPayload/FarmHub/blob/main/docs/GITHUB_RELEASE_v4.2.0.md)

### Updating

Launch the app → **Settings → Check for updates** → **Restart and install** (needs **`latest.yml`** + **`Setup 4.2.0.exe`** on a **published** release). **Always update the mod zip** on every host / dedicated server.

---

## Prior releases

| Version | App | Mod | Notes |
|---------|-----|-----|--------|
| **4.1.x** | 4.1.0 – 4.1.5 | 3.3.21.x | Tester drops; not on GitHub Latest before 4.2.0 |
| **4.0.0** | 4.0.0 | 3.0.0.0 | First FarmHub auto-update line |
| **2.0.0** | 2.0.0 | 2.0.0.0 | [FS25-Farm-Dashboard](https://github.com/WizardlyPayload/FS25-Farm-Dashboard) (legacy) |

Detail: [CHANGELOG.md](https://github.com/WizardlyPayload/FarmHub/blob/main/docs/CHANGELOG.md)

---

## Upgrading from public FS25-Farm-Dashboard (2.0.0)

1. Replace mod with **`FS25_FarmDashboard.zip` (3.4.0.6)**; load each save once.
2. Install app **4.2.0** (or update via in-app updater from **4.0.x / 4.1.x**).
3. Re-check **Settings → Servers & saves**.

Full delta: [UPGRADE_FROM_FS25-Farm-Dashboard.md](https://github.com/WizardlyPayload/FarmHub/blob/main/docs/UPGRADE_FROM_FS25-Farm-Dashboard.md)

---

## Auto-updates

Packaged installs use **electron-updater** (GitHub Releases on **FarmHub**).

- **Settings → Check for updates**
- Publish releases as **Published** (not **Draft**) with **`latest.yml`**

---

## Reporting issues

Include FS25 version, SP vs dedicated, **app 4.2.0**, **mod 3.4.0.0**, local vs FTP.

[Open an issue](https://github.com/WizardlyPayload/FarmHub/issues)
