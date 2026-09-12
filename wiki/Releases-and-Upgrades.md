# Releases & Upgrades

## Current release (4.2.1)

| Asset | Version |
|-------|---------|
| `FS25-Farm-Dashboard-Setup-4.2.1.exe` | App **4.2.1** |
| `FS25_FarmDashboard.zip` | Mod **3.4.0.7** |

**Download:** [GitHub Releases](https://github.com/WizardlyPayload/FarmHub/releases)

**Install order:** mod → load save → app. See [Installation Guide](Installation-Guide).

**Release notes:** [GITHUB_RELEASE_v4.2.1.md](https://github.com/WizardlyPayload/FarmHub/blob/main/docs/GITHUB_RELEASE_v4.2.1.md)

### Updating

Launch the app → **Settings → Check for updates** → **Restart and install** (needs **`latest.yml`** + **`Setup 4.2.1.exe`** on a **published** release). **Always update the mod zip** on every host / dedicated server **and** on any join-as-client PC.

### Dedicated join-as-client (shipped in 4.2.1)

Notes: [docs/_internal/RELEASE_NOTE_JOIN_AS_CLIENT.md](https://github.com/WizardlyPayload/FarmHub/blob/main/docs/_internal/RELEASE_NOTE_JOIN_AS_CLIENT.md) — mirror export to a joined client, Local watch, no FTP; FTP remains Advanced.

---

## Prior releases

| Version | App | Mod | Notes |
|---------|-----|-----|--------|
| **4.2.0** | 4.2.0 | 3.4.0.6 | First public 4.2 / 3.4 line |
| **4.1.x** | 4.1.0 – 4.1.5 | 3.3.21.x | Tester drops; not on GitHub Latest before 4.2.0 |
| **4.0.0** | 4.0.0 | 3.0.0.0 | First FarmHub auto-update line |
| **2.0.0** | 2.0.0 | 2.0.0.0 | [FS25-Farm-Dashboard](https://github.com/WizardlyPayload/FS25-Farm-Dashboard) (legacy) |

Detail: [CHANGELOG.md](https://github.com/WizardlyPayload/FarmHub/blob/main/docs/CHANGELOG.md)

---

## Upgrading from public FS25-Farm-Dashboard (2.0.0)

1. Replace mod with **`FS25_FarmDashboard.zip` (3.4.0.7)**; load each save once.
2. Install App **4.2.1** (or update via in-app updater from **4.0.x / 4.1.x**).
3. Re-check **Settings → Servers & saves**.

Full delta: [UPGRADE_FROM_FS25-Farm-Dashboard.md](https://github.com/WizardlyPayload/FarmHub/blob/main/docs/UPGRADE_FROM_FS25-Farm-Dashboard.md)

---

## Auto-updates

Packaged installs use **electron-updater** (GitHub Releases on **FarmHub**).

- **Settings → Check for updates**
- Publish releases as **Published** (not **Draft**) with **`latest.yml`**

---

## Reporting issues

Include FS25 version, SP vs dedicated, **app 4.2.0**, **mod 3.4.0.6**, local / join-as-client / FTP.

[Open an issue](https://github.com/WizardlyPayload/FarmHub/issues)
