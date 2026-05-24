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

- **Check for updates:** Settings → Dashboard (needs packaged build + GitHub Releases)
- **3.9 → 4.0:** see [UPDATER_QA.md](https://github.com/WizardlyPayload/FarmHub/blob/main/docs/UPDATER_QA.md)
- Manual: download latest `.exe` from Releases

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

## Still stuck?

Open a [GitHub Issue](https://github.com/WizardlyPayload/FarmHub/issues) with:

- FS25 version, SP vs dedicated
- App **4.0.0**, mod **2.3.0.0**
- Local vs FTP
- Steps + screenshots

**Security:** private message to maintainers — not a public issue.

---

**See also:** [User Manual](User-Manual) · [Installation Guide](Installation-Guide) · [Security](Security-and-Network)
