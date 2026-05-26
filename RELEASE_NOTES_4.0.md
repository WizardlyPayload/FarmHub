FS25 Farm Dashboard 4.0.0

App 4.0.0 · Mod 3.0.0.0 · Windows 10/11

Download on this page: FS25 Farm Dashboard Setup 4.0.0.exe + FS25_FarmDashboard.zip (+ latest.yml for auto-update)

---

## About this project (fork & lineage)
FarmHub is the current home for FS25 Farm Dashboard — continued development of Josh Walki’s original idea, packaged as a Windows app with a maintained FS25 mod.

| Project                                 | Role / Description                                                                            | Link                                                                                      |
|------------------------------------------|-----------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------|
| JoshWalki / FarmDashboard                | Original mod + web dashboard concept (Josh Walki)                                             | [github.com/JoshWalki/FarmDashboard](https://github.com/JoshWalki/FarmDashboard)          |
| WizardlyPayload / FS25-Farm-Dashboard    | Public 2.0.0 line — Electron desktop app fork of Josh’s work                                  | [github.com/WizardlyPayload/FS25-Farm-Dashboard](https://github.com/WizardlyPayload/FS25-Farm-Dashboard) |
| WizardlyPayload / FarmHub (this repo)    | 4.0.0 stable line — further development, security hardening, FTP/multi-server, rules engine, auto-update | [github.com/WizardlyPayload/FarmHub](https://github.com/WizardlyPayload/FarmHub)          |

If you used the public 2.0.0 release or Josh’s original repo, you do not need to uninstall first — install the mod and app from this release and follow the steps below. Full delta: [Upgrade from 2.0.0](https://github.com/WizardlyPayload/FarmHub/blob/main/docs/UPGRADE_FROM_FS25-Farm-Dashboard.md).

Authors: [JoshWalki](https://github.com/JoshWalki) (Josh) — original Farm Dashboard & FS25 mod · WizardlyPayload — Electron app, maintenance, releases, documentation. See [AUTHORS.md](https://github.com/WizardlyPayload/FarmHub/blob/main/docs/AUTHORS.md).

---

## How to install & use (read this first)
Install order matters. The Windows app cannot read your farm until the game mod has created data.json for each save.

**Step 1 — Install the mod (FS25)**
- Download FS25_FarmDashboard.zip from this release.
- Copy it into your FS25 mods folder: Documents\My Games\FarmingSimulator2025\mods\
- In FS25: Mod selection → enable Farm Dashboard on each save you want on the dashboard.
- Load that save once in the world (single-player, host, or dedicated).

**Step 2 — Install the Windows app**
- Download and run FS25 Farm Dashboard Setup 4.0.0.exe from this release.
- Launch Farm Dashboard from the Start menu.
- Open Settings (gear) → Servers & saves (local path or FTP).

**Step 3 — Open the dashboard**
| Where                 | URL                       |
|-----------------------|---------------------------|
| This PC               | http://localhost:8766/    |
| Phone / tablet (Wi‑Fi)| http://<your-PC-LAN-IP>:8766 |

Full guide: [USER_MANUAL.md](https://github.com/WizardlyPayload/FarmHub/blob/main/docs/USER_MANUAL.md) · [INSTALL.md](https://github.com/WizardlyPayload/FarmHub/blob/main/docs/INSTALL.md)

---

## Updating from Farm Dashboard 3.9.0
Launch the installed app → wait ~10s or Settings → Check for updates → Restart and install when ready. Requires latest.yml on this published release (not Draft).

---

## What’s new in 4.0.0
- **Stable auto-update** (3.9 → 4.0)
- **Mod version badge** when in-game mod is outdated
- **Mod 3.0.0.0** with live version export
- **230 automated tests**, CI, docs/wiki at 4.0

---

## What’s new since public 2.0.0
Compared to [FS25-Farm-Dashboard 2.0.0](https://github.com/WizardlyPayload/FS25-Farm-Dashboard/releases) and [JoshWalki/FarmDashboard](https://github.com/JoshWalki/FarmDashboard):
- Section backgrounds, themes, **27 languages**
- **Offline field rules engine**, windrows/bales/forage badges, field clusters
- Livestock detail API, pasture warnings, vehicle thumbnails
- Lua+XML merge, **FTP** multi-server, offline cache (local)
- Unified Settings, **LAN security**, NSIS installer, XSS hardening

Full history: [CHANGELOG.md](https://github.com/WizardlyPayload/FarmHub/blob/main/docs/CHANGELOG.md)

---

## Upgrade from 2.0.0
1. Install mod **3.0.0.0** → load each save once
2. Install app **4.0.0** → http://localhost:8766/
3. Re-check **Settings → Servers & saves** (especially FTP)

---

## Issues
app 4.0.0, mod 3.0.0.0, FS25 version, SP vs dedicated, local vs FTP — [Open an issue](https://github.com/WizardlyPayload/FarmHub/issues)
