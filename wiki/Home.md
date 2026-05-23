# FS25 Farm Dashboard — Wiki Home

Welcome to the **FS25 Farm Dashboard** project! This is a Windows desktop companion for **Farming Simulator 25** that provides a live farm data browser dashboard. The app works together with an in-game mod to export live farm data, which is then displayed in your browser.

## Quick Links

- **[Installation Guide](Installation-Guide)** — Step-by-step setup instructions
- **[User Manual](User-Manual)** — Complete feature walkthrough with screenshots
- **[Developer Guide](Developer-Guide)** — For contributors and maintainers
- **[Security & Network](Security-and-Network)** — LAN access, authentication, and security notes
- **[Troubleshooting](Troubleshooting)** — Common issues and solutions

## What is FarmHub?

**FarmHub** is a desktop app + in-game mod combo that lets you monitor your Farming Simulator 25 farm in real-time:

- **Live data** from the mod while the game is running
- **Desktop app** (Windows Electron app) that reads the live data
- **Browser dashboard** accessible at `http://localhost:8766`
- **Optional LAN access** for tablets, phones, or other PCs on your network
- **Multi-server support** for local saves and dedicated/rented servers (via FTP)

## Current Version

- **App:** 3.9.0
- **Mod:** 2.3.0.0

## Getting Started

### For Players

1. **[Install the mod](Installation-Guide#stage-a--install-the-mod)** into your FS25 `mods` folder
2. **[Enable and load](Installation-Guide#stage-b--enable-per-save)** the mod in your saves
3. **[Install the Windows app](Installation-Guide#stage-d--install-the-windows-app)** from Releases
4. **[Complete Setup](User-Manual#3-first-run-setup)** to configure servers
5. **[Open the dashboard](Installation-Guide#stage-e--first-launch)** at `http://localhost:8766`

### For Developers

- Start with the **[Developer Guide](Developer-Guide)** for architecture and codebase overview
- Review **[Known Gaps](Developer-Guide#known-gaps-from-the-audits)** for current audit findings
- Check **[Debugging Checklist](Developer-Guide#debugging-checklist)** for common issues

## Main Features

- **Livestock Management** — Animals, health, lactation, genetics
- **Vehicles & Equipment** — Fleet tracking, fuel, damage status
- **Fields** — Crop growth, work suggestions, windrows, soil (Precision Farming)
- **Economy** — Money, purchases, equipment tracking
- **Pastures** — Animal distribution, birth warnings
- **Production Chains** — Production slots, fill levels, recipes
- **Weather** — Forecast and current conditions
- **Rules Engine** — AI-powered field work suggestions

## Repository Structure

```
FarmHub/
├── docs/                      # User & developer documentation
├── FS25_FarmDashboard_App/    # Electron app + web UI
├── FS25_FarmDashboard_Mod/    # Lua mod source
├── tools/                     # Build scripts & helpers
└── wiki/                      # This wiki
```

## Key Concepts

### Mod First, App Second

The **order matters**:
1. Mod must be installed and **loaded in saves** first — this creates the `data.json` file
2. Then install the Windows app — it reads that `data.json`
3. If you skip step 1, the app shows "waiting for data" because there's nothing to read yet

### Local vs. Remote Servers

- **Local**: Runs on the same PC; app watches `data.json` directly
- **Remote (FTP)**: Runs on a dedicated/rented server; app polls via FTP

### LAN Access

By default, the dashboard only works on the same PC (`http://localhost:8766`). Enable **Settings → Servers & saves → LAN access** to allow tablets and other devices on your home network to connect.

## Support & Contributing

- **Bug reports**: Use GitHub Issues
- **Security concerns**: Contact maintainers privately
- **Contributing**: Review [Developer Guide](Developer-Guide) and open a PR
- **Authors**: [JoshWalki & WizardlyPayload](https://github.com/WizardlyPayload/FarmHub/blob/main/docs/AUTHORS.md)

---

**Last updated:** Aligned with app **3.9.0** and mod **2.3.0.0**
