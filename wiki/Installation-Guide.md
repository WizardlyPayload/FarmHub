# Installation Guide

Step-by-step setup for **FS25 Farm Dashboard**. Follow **stages A–E in order**. Skipping the mod stages is the #1 cause of a blank dashboard.

## Why mod first?

The Windows app **cannot read FS25 directly**. It only reads **`data.json`**, which the **mod creates while you play**.

Until you load a save with the mod enabled:

- No `modSettings\FS25_FarmDashboard\<savegame>\` output (or it is stale)
- The dashboard shows **“waiting for data”**

**Order:** mod → enable & load save → install/run app.

---

## Stage A — Install the mod

1. Download **`FS25_FarmDashboard.zip` (3.4.0.6)** from [Releases](https://github.com/WizardlyPayload/FarmHub/releases).
2. Copy into FS25 mods folder:

   ```
   Documents\My Games\FarmingSimulator2025\mods\
   ```

   **Recommended:** leave as `.zip` (FS25 loads zip mods).

   **Or extract** so you have:

   ```
   mods\FS25_FarmDashboard\
   ├── modDesc.xml
   ├── icon.png
   └── src\
   ```

3. Start **Farming Simulator 25** once so the game registers the mod.

> **Developers:** sources live under `FS25_FarmDashboard_Mod/` in the repo; players install **`FS25_FarmDashboard`** (zip root layout from `tools\Zip-FarmDashboardMod.ps1`).

---

## Stage B — Enable per save

Repeat for **every** savegame you want on the dashboard:

1. In FS25 **Mods**, enable **Farm Dashboard** for that save.
2. **Load the save and enter the world** (main menu alone is not enough).
3. Play ~1 minute so collectors run.

Dedicated / rented server: enable the mod **on the server** and load the save there too. Then either **join as a client** on the dashboard PC (Local mode — no FTP) or use **FTP** (Advanced). See [Dedicated servers](#dedicated-servers-join-as-client-or-ftp).

---

## Stage C — Confirm `data.json`

After ~1 minute in-game, check:

```
%USERPROFILE%\Documents\My Games\FarmingSimulator2025\modSettings\FS25_FarmDashboard\<savegame>\data.json
```

| Result | Action |
|--------|--------|
| File exists, **recent** modified time | Continue to Stage D |
| Missing or old timestamp | Repeat Stage B; confirm mod enabled |

Optional config (same folder parent):

```
modSettings\FS25_FarmDashboard\config.xml
```

---

## Stage D — Install the Windows app

1. Download **`FS25-Farm-Dashboard-Setup-4.2.0.exe`** from [Releases](https://github.com/WizardlyPayload/FarmHub/releases).
2. Run the installer (pick language on welcome page).
3. Launch **Farm Dashboard** from the Start menu.

---

## Stage E — First launch & dashboard

1. **Setup** opens if no servers are configured.
2. **Auto-detect saves** (recommended) or **Add server** manually:
   - **Local:** path to the folder containing `data.json` (single-player **or** dedicated **join-as-client** mirror on this PC)
   - **FTP (Advanced):** host, port, user, password, remote directory with `data.json` (headless-only)
3. Click **Launch**.
4. Open a browser: **[http://localhost:8766](http://localhost:8766)**

Later changes: **Settings (gear) → Servers & saves**.

---

## Dedicated servers (join as client or FTP)

Dedicated hosts write `data.json` on the **authority** (dedicated process). The desktop app needs that file on the PC where Farm Dashboard runs.

| Path | When | App mode |
|------|------|----------|
| **Join as client** (recommended) | Someone can join with the same mod | **Local** — **no FTP** |
| **FTP** (Advanced) | Empty / headless server, or prefer remote poll | **FTP** |

Same flow for legacy app **4.2.1** and **v5**: Local watches the client’s folder. Giants **:8080** HTTP is an optional XML feed only — **not** a substitute for `data.json`. FTP remains supported.

### Join as client (no FTP)

Requires the **updated mod** with **export mirror** (ships with the **4.2.1** / **v5** line) on **server and client**.

1. Install the mod on the **dedicated server**; enable it on that save.
2. On the dashboard PC, install the same mod and **join as a multiplayer client** (spare/alt account or admin playing).
3. **Opt in** to mirror the export to this client (labels may say *Mirror export to this client*, *Receive server export*, or similar).
4. Client writes:

   ```
   %USERPROFILE%\Documents\My Games\FarmingSimulator2025\modSettings\FS25_FarmDashboard\<slot>\data.json
   ```

5. In the app, add a **Local** server (or Auto-detect) pointing at that folder.

**Limits:** needs at least one connected opted-in client; empty server = no mirror; large exports may lag a few seconds; FTP still covers headless-only admins.

### FTP (Advanced)

1. Mod active on the **server**; save loaded so `data.json` exists on the host profile.
2. In the app, add an **FTP** server pointing at that path.
3. Set **FTP polling** (1–25 minutes; sync or staggered) under Settings.

Full detail: [docs/INSTALL.md](https://github.com/WizardlyPayload/FarmHub/blob/main/docs/INSTALL.md#dedicated-server-join-as-client-or-ftp) · [USER_MANUAL §3.4a](https://github.com/WizardlyPayload/FarmHub/blob/main/docs/USER_MANUAL.md#34a-dedicated-server--join-as-client-no-ftp).

---

## Quick troubleshooting

| Problem | Fix |
|---------|-----|
| **Waiting for data** | Stage B + C — mod enabled, world loaded, `data.json` fresh |
| **Wrong path** | Settings → Servers & saves → correct local folder (or FTP dir) |
| **Join-as-client empty** | Client connected + mirror opt-in? Updated mod on both sides? |
| **Port 8766 in use** | Close other Farm Dashboard instances; see [Troubleshooting](Troubleshooting#port-8766-already-in-use) |
| **Tablet cannot connect** | Enable LAN + strong password — [Security & Network](Security-and-Network) |

---

## Checklist

- [ ] `FS25_FarmDashboard.zip` in `mods\`
- [ ] Mod enabled per save
- [ ] Save loaded into world (not menu only)
- [ ] `data.json` recent
- [ ] App installed and Setup complete
- [ ] Browser opens `http://localhost:8766`

---

**Next:** [User Manual](User-Manual) · **Stuck?** [Troubleshooting](Troubleshooting)
