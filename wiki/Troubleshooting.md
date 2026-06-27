# Troubleshooting

Common problems and fixes for **FS25 Farm Dashboard**. Also see [INSTALL.md](https://github.com/WizardlyPayload/FarmHub/blob/main/docs/INSTALL.md).

---

## "Waiting for data" / blank dashboard

**Cause:** No fresh `data.json` for the configured server.

**Checklist:**

1. Mod in `Documents\My Games\FarmingSimulator2025\mods\` (zip or `FS25_FarmDashboard\` folder)
2. Mod **enabled** for that save
3. Save **loaded in the world** (not menu only) for ~1 minute
4. File exists with **recent** timestamp:

   ```
   %USERPROFILE%\Documents\My Games\FarmingSimulator2025\modSettings\FS25_FarmDashboard\<savegame>\data.json
   ```

5. **Settings → Servers & saves** path or FTP directory is correct

**Fix:** [Installation Guide](Installation-Guide) stages B–C, then restart the app.

---

## API error strip (retrying every 5 s)

- App auto-retries; no manual button
- Confirm FS25 running with mod on that save
- Local: verify folder path
- FTP: verify host, port, credentials, remote path contains `data.json`
- FTP interval must be **1–25 minutes**

---

## Port 8766 already in use

```bat
netstat -ano | findstr :8766
taskkill /PID <pid> /F
```

Close duplicate Farm Dashboard instances or conflicting apps, then restart.

---

## Mod not in game mod list

- Correct path: `mods\FS25_FarmDashboard.zip` or `mods\FS25_FarmDashboard\` with `modDesc.xml` at root
- Restart FS25 after copying
- Zip must not have an extra nested folder (use release zip from `tools\Zip-FarmDashboardMod.ps1`)

---

## `data.json` never updates

- Mod disabled for save
- Save not entered (menu only)
- MP **client** (mod only exports on authority — host/SP)
- Increase wait time; check `config.xml` module toggles

---

## Wrong farm or server shown

- Use **farm dropdown** in top bar
- Click correct **server tab**
- Realtime updates ignore payloads for other `serverId` (3.9+) — switch server tab if data looks stale

---

## Fields show old harvest / wrong growth

- Confirm `data.json` on disk matches expectation
- Refresh browser; check data-source badge
- Known fix in 3.9: realtime must match active server
- If XML and Lua disagree, Lua wins for `harvestReady` / suggestions when live is newer

---

## FTP not updating

| Check | Detail |
|-------|--------|
| Interval | 1–25 minutes in Settings |
| Path | Remote dir must contain `data.json` |
| Server | Game running with mod on dedicated host |
| Cache | FTP **never** uses offline desktop cache — wait for poll |

Test credentials with FileZilla first.

---

## LAN & tablet issues

### 401 Unauthorized

- Wrong LAN user/password
- LAN access not enabled
- Try `http://localhost:8766` on PC first

### 403 Forbidden

- Tablet IP not in **IP allowlist**
- Add IP or clear allowlist

### Cannot connect at all

- Same Wi‑Fi / LAN as PC
- Correct PC IPv4 (`ipconfig`)
- Windows Firewall allows **private** network on 8766
- LAN access **enabled** in Settings

### `?viewer=1` still shows Settings

- URL must end with `?viewer=1` exactly
- Hard refresh (Ctrl+F5)

---

## Settings not saving

- Click **Save** in modal
- Run app as normal user (not blocked profile)
- Config path: `%APPDATA%\fs25-farm-dashboard\`

---

## Mod settings (`config.xml`) no effect

- **Restart FS25** after changing collection cycle or modules
- Confirm `config.xml` timestamp updated after Save in app

---

## `debugBaleScan` not working

**Known gap:** UI may not write flag; edit manually:

```xml
<farmDashboard>
  <settings collectionCycleMs="60000" debugBaleScan="true" />
</farmDashboard>
```

Restart game.

---

## Theme / language

- **Language:** page reloads — wait for completion
- **Theme:** click **Save theme**, not only Save
- Partial English = missing translation keys — run `npm run i18n:verify` (dev)

---

## Installer / build issues

| Issue | Fix |
|-------|-----|
| `app.asar` locked | Close app; `npm run unlock-install` |
| Install failed | Run installer as Administrator; free disk space |
| Uninstall wipe prompt | **No** keeps settings; **Yes** wipes `%APPDATA%\fs25-farm-dashboard\` |

---

## Updates

- **Check for updates:** Settings → Dashboard (needs packaged build + GitHub Releases with **`latest.yml`**)
- **4.0.x / 4.1.x → 4.2.0:** in-app updater when release is **Published**; always replace **mod zip** on every host
- Manual: download **`FS25-Farm-Dashboard-Setup-4.2.0.exe`** + **`FS25_FarmDashboard.zip`** from [Releases](https://github.com/WizardlyPayload/FarmHub/releases)

---

## Performance

- Increase **collection cycle** in mod settings if field scan causes stutter
- Reduce FTP poll frequency
- **Field exclusions** for unused parcels
- Disable unused sections in Settings

---

## Reset everything

Delete app data (re-run Setup):

```
%APPDATA%\fs25-farm-dashboard\
```

Uninstall app separately if needed.

---

## Installer — progress bar then nothing (first try)

**What you see:** Windows shows a short **“preparing” / extracting** progress bar, then **no installer window**. Running the `.exe` again often works.

**What is happening:** The setup file is a **self-extracting NSIS package**. The small bar is it unpacking to `%TEMP%`. The **real** wizard (language page first) should open after that. If it does not on the first attempt, something blocked or hid the inner installer.

**Try this order:**

1. **Wait 30–60 seconds** after the bar closes (Defender may still be scanning the temp `.exe`).
2. **Check the taskbar** and **Alt+Tab** — the wizard may be behind FS25, a browser, or on another monitor.
3. **UAC** — look for a dimmed **“Do you want to allow this app…”** prompt (especially if you chose install for all users / Run as administrator).
4. **SmartScreen** — right-click the installer → **Properties** → if you see **Unblock**, tick it → OK. Or open **Windows Security → App & browser control → Protection history** for a blocked run.
5. **Close Farm Dashboard** completely (tray too), then run the installer again.
6. **Task Manager** — end any stuck `FS25 Farm Dashboard Setup` or `*_setup.exe` under Details, then run again.
7. **Unlock script** (from repo, if you build locally):
   ```powershell
   cd FS25_FarmDashboard_App
   npm run unlock-install
   ```
8. **Log the next run** (send log if you open an issue):
   ```bat
   "FS25 Farm Dashboard Setup 3.9.0.exe" /LOG="%USERPROFILE%\Desktop\farmdash-install.log"
   ```

**Why the second try often works:** The first run may have finished extracting to `%TEMP%` while the GUI was blocked; the second run reuses or replaces that cache and starts faster.

**After install:** If upgrade fails with “file in use”, close the app and run `npm run unlock-install` from the app folder, or reboot once.

---

## Mod shop images — "Cannot create app.asar"

**Symptom:** `Export did not produce a summary file` and PowerShell mentions `Cannot create "…\resources\app.asar"`.

**Cause:** The installed app tried to write PNGs inside the read-only **`app.asar`** file. Newer app builds write to:

```
%APPDATA%\fs25-farm-dashboard\items_mod_extract\
```

**Fix:** Update to a build that includes the `resolveModStoreImagesOutputDir()` fix, or run **`npm start`** from the repo for export.

---

## Fleet, storage & dedicated server

| Symptom | Fix |
|---------|-----|
| **Extra vehicles on fleet (dealership demos)** | Showroom floor stock on a player farm — especially after buying a **new farm** on dedicated. Update to app **4.2.0** + mod **3.4.0.6**, restart the app. |
| **Fill type shows as `Fill type #147` (or similar)** | Update to **4.2.0** / mod **3.4.0.6**. Enable **Economy collector** in ESC → Settings → Farm Dashboard. |
| **Productions / Storage empty** | Enable **Production** and **Economy** collectors in-game (defaults can be off on existing saves). Wait one export cycle (~60s). |
| **Duplicate vehicles on fleet** | Requires **4.1.5+** merge; confirm mod **3.4.0.6** on the server. |

---

## Still stuck?

Open a [GitHub Issue](https://github.com/WizardlyPayload/FarmHub/issues) with:

- FS25 version, SP vs dedicated
- App **4.2.0**, mod **3.4.0.6**
- Local vs FTP
- Steps + screenshots

**Security:** private message to maintainers — not a public issue.

---

**See also:** [User Manual](User-Manual) · [Installation Guide](Installation-Guide) · [Security](Security-and-Network)
