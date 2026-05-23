# Installation Guide

This guide walks you through installing and setting up the **FS25 Farm Dashboard** step-by-step. Follow these instructions **in order** — the mod must come before the Windows app.

## Why Mod First?

The Windows app **cannot read your farm directly from FS25**. It only reads a file called `data.json` that the **mod creates and updates** while you play.

Until you have **loaded a save with the mod enabled** at least once:
- The game has not created the mod's output folders
- `data.json` does not exist (or is not being updated)
- The dashboard shows "**waiting for data**"

**Solution:** Mod first (creates the data) → App second (reads the data)

---

## Stage A — Install the Mod

1. Download `FS25_FarmDashboard.zip` from [GitHub Releases](https://github.com/WizardlyPayload/FarmHub/releases)

2. Copy the zip file into your FS25 `mods` folder:
   ```
   Documents\My Games\FarmingSimulator2025\mods\
   ```

   **OR** extract it so you have:
   ```
   mods\FS25_FarmDashboard\
      ├── modDesc.xml
      ├── icon.png
      └── src\
   ```

3. Start **Farming Simulator 25** (the game will detect the mod)

---

## Stage B — Enable the Mod Per Save

**You must do this for every savegame where you want the dashboard to work.**

1. Open the game and go to **Mods**
2. Find and **enable** the **Farm Dashboard** mod for each save
3. **Load the save and enter the world** (just the main menu is not enough)
4. Wait ~1 minute for the mod to initialize
5. Repeat for all other saves

⚠️ **Important:** Load the save **into the world**, not just the menu screen. The mod only starts collecting data once you're in-game.

---

## Stage C — Confirm Data Is Being Written

After loading a save with the mod enabled, check for the `data.json` file:

```
%USERPROFILE%\Documents\My Games\FarmingSimulator2025\modSettings\FS25_FarmDashboard\<savegame>\data.json
```

✓ **Good:** The file exists and has a **recent modified timestamp**

❌ **Problem:** File is missing or old → Go back to Stage B

---

## Stage D — Install the Windows App

1. Download the latest `FS25 Farm Dashboard Setup X.X.X.exe` from [GitHub Releases](https://github.com/WizardlyPayload/FarmHub/releases)

2. Run the installer:
   - Choose your language on the welcome page
   - Follow the setup wizard
   - Choose install location (default is fine)

3. Finish the installation

---

## Stage E — First Launch & Setup

1. **Launch** "Farm Dashboard" from the Start menu or desktop shortcut

2. The app opens and shows a **Setup page** if no servers are configured

3. **Auto-detect** your saves:
   - Click the **"Auto-detect saves"** button
   - Select the saves you want to monitor
   - Click **Accept**

4. The app now shows your servers in the list

5. Click **Launch** to proceed to the dashboard

6. **Open your browser** to:
   ```
   http://localhost:8766
   ```

✓ You should see the Farm Dashboard!

---

## Quick Troubleshooting

| Issue | Solution |
|-------|----------|
| **"Waiting for data"** | Did you complete Stage B? Mod must be enabled and save loaded **into the world**. Check that `data.json` exists (Stage C). |
| **Server not found** | Check Settings → Servers & saves. The path should point to the correct save folder containing `data.json`. |
| **Port 8766 in use** | Another app is using that port. Close the other app or restart the dashboard app. |
| **FTP connection fails** | Check FTP credentials, host, port. Verify the remote directory path contains `data.json`. |

---

## For Dedicated / Rented Servers

Same process, but:
1. Install the mod on the **server**
2. Enable it and load the save **on the server**
3. In the app Setup, choose **FTP** instead of Local
4. Enter your FTP credentials, host, port, and remote directory
5. The app polls the server for updates (every 5 minutes by default)

---

## Next Steps

- **[Read the User Manual](User-Manual)** for a complete feature walkthrough
- **[Enable LAN Access](Security-and-Network#network-browser-access-on-your-lan-important)** if you want to view the dashboard on a tablet or phone
- **[Configure Settings](User-Manual#5-settings-modal--every-tab-and-control)** to customize the dashboard

