# Troubleshooting

Common issues and how to fix them.

## Installation Issues

### "Waiting for data" on Dashboard

**Most common cause:** Mod not enabled or save not loaded into the world.

**Checklist:**
1. ✅ Mod installed in `Documents\My Games\FarmingSimulator2025\mods\`
2. ✅ Mod enabled in save's mod list
3. ✅ Save **loaded into the world** (not just the main menu)
4. ✅ Waited ~1 minute after loading
5. ✅ `data.json` exists and has a recent timestamp:
   ```
   %USERPROFILE%\Documents\My Games\FarmingSimulator2025\modSettings\FS25_FarmDashboard\<savegame>\data.json
   ```

**Fix:**
1. Go back to the game
2. Enable the mod in the save's mod list
3. **Load the save and play for 1 minute**
4. Restart the dashboard app
5. Try again

---

### Mod installed but not appearing in game

**Checklist:**
1. ✅ Zip or folder is in the correct location:
   ```
   Documents\My Games\FarmingSimulator2025\mods\FS25_FarmDashboard\
   ```
2. ✅ Folder contains `modDesc.xml` at the root
3. ✅ You've restarted FS25 after copying

**Fix:**
- Try deleting the folder/zip and re-extracting/copying
- Restart FS25

---

### `data.json` not created

**Signs:**
- File doesn't exist in modSettings
- Or file exists but timestamp never changes

**Causes:**
- Mod not enabled for that save
- Save never loaded into world
- Mod lacks file write permission

**Fix:**
1. Confirm mod is enabled in save's mod list
2. **Load save into world** (play for 1+ minute)
3. Restart FS25
4. Check for `data.json` again

---

## Dashboard App Issues

### Port 8766 Already in Use

**Error:** Can't start the app, or "Address already in use"

**Fix:**
1. Find what's using the port:
   ```
   Command Prompt → netstat -ano | findstr :8766
   ```
2. Close that app or process
3. Restart dashboard

**Or use a different port** (advanced — edit `main.js` line: `const PORT = 8766`)

---

### App crashes or won't start

**Steps:**
1. Uninstall the app (Settings → Apps → Remove)
2. Restart your PC
3. Reinstall from GitHub Releases
4. If error persists, check:
   ```
   %APPDATA%\fs25-farm-dashboard\
   ```
   Delete this folder to clear cache, then restart app

---

### Settings / Configuration not saving

**Checklist:**
1. ✅ You clicked **Save** in the modal
2. ✅ No error message appeared
3. ✅ App is running with admin rights (try it)

**Fix:**
- Restart the app
- If still not saving, try:
  ```
  npm run unlock-install
  ```

---

## Server & Connection Issues

### Wrong farm showing

**Problem:** You have multiple farms in one save, but the wrong one is displayed.

**Fix:**
- Use the **farm dropdown** in the top bar to select the correct farm
- Or disable farms you don't want via **Settings → Dashboard → Field exclusions**

---

### FTP server not updating

**Signs:**
- "Last updated: X hours ago"
- Changes in-game don't show in dashboard

**Checklist:**
1. ✅ FTP credentials are correct (host, port, user, password)
2. ✅ Remote directory is correct (usually `modSettings/FS25_FarmDashboard/<savegame>/`)
3. ✅ `data.json` exists on the server
4. ✅ Polling interval is 1–25 minutes (Settings → Servers & saves → FTP polling)

**Fix:**
1. **Settings → Servers & saves**
2. Check FTP server details
3. Confirm `data.json` path on the server
4. Try increasing polling interval (e.g., to 10 minutes)
5. Restart app

---

### Multiple servers/saves shown

**Want to see fewer servers in the top bar?**

**Fix:**
- **Settings → Servers & saves**
- Click **Remove** on the servers you don't want

---

## Dashboard Display Issues

### Fields showing old data

**Problem:** Field growth, windrows, or bales not updating.

**Checklist:**
1. ✅ Mod is still enabled in-game
2. ✅ `data.json` has a recent timestamp
3. ✅ Dashboard data-source badge shows green (healthy)

**Fix:**
1. Restart the dashboard app
2. Or wait for the next automatic refresh (usually every few seconds)

---

### Colors / Theme not applying

**Problem:** Changed theme in Settings, but colors didn't change.

**Fix:**
1. Make sure to click **Save theme** (not just **Save**)
2. Try refreshing the browser (F5)
3. Check **Appearance tab → Reset** to go back to defaults, then customize again

---

### Language picker doesn't work

**Problem:** Selected a language, but everything still shows in English.

**Fix:**
- The page reloads when you change language. Wait a few seconds for the reload.
- If strings still show in English, that language is missing some keys. Check GitHub issues.

---

## LAN & Tablet Issues

### Tablet shows "401 Unauthorized"

**Causes:**
- Wrong LAN credentials entered
- Tablet IP not in the allowlist

**Fix:**
1. Double-check LAN user and password
2. (If using allowlist) Add tablet's IP to the list
3. Try again

---

### Tablet shows "403 Forbidden"

**Causes:**
- Tablet IP is outside the allowlist

**Fix:**
1. Find tablet's local IP (e.g., on the tablet, check WiFi settings)
2. Add it to **Settings → Servers & saves → IP allowlist**
3. Refresh browser on tablet

---

### Can't connect from tablet at all

**Checklist:**
1. ✅ LAN access is **enabled** (not off)
2. ✅ Tablet and PC are on the **same WiFi network**
3. ✅ Tablet can ping PC (`ping 192.168.1.50` or similar)
4. ✅ PC firewall is not blocking port 8766

**Fix:**
1. Check Windows Firewall: **Settings → Privacy & Security → Firewall → Inbound rules**
   - Look for "8766" rules
   - Make sure they allow traffic from your network
2. Try connecting from another PC first to test
3. Restart router and try again

---

### Viewer mode (read-only) not working

**URL:** `http://192.168.1.50:8766?viewer=1`

**Problem:** Settings gear still visible

**Fix:**
- The URL must include `?viewer=1` at the end
- Make sure there are no extra spaces or characters
- Refresh the page (F5)

---

## Settings & Mod Config Issues

### Fields excluded but I don't want them to be

**Problem:** Some fields are missing from the Fields section.

**Fix:**
- **Settings → Dashboard → Field exclusions**
- Tick the fields you **want to see** (you want them unchecked to show them... confusing, we know!)

---

### Mod settings changed but nothing happened

**Problem:** Changed collection cycle or module toggles in Settings, but in-game nothing changed.

**Checklist:**
1. ✅ You clicked **Save** in Settings
2. ✅ `config.xml` was updated (check timestamp:
   ```
   %USERPROFILE%\Documents\My Games\FarmingSimulator2025\modSettings\FS25_FarmDashboard\config.xml
   ```
3. ✅ You restarted FS25 **after** saving in dashboard

**Fix:**
- Changes to `config.xml` require a **game restart** to take effect
- Restart FS25

---

### `debugBaleScan` not working

**Problem:** Enabled the flag in Settings, but no debug logs appear.

**Note:** This is a **known gap** (Audit gap #2) — the Electron app ignores this flag.

**Workaround:**
- Hand-edit `config.xml`:
  ```xml
  <farmDashboard>
    <settings debugBaleScan="true" />
  </farmDashboard>
  ```
- Restart the game

---

## Update Issues

### "Check for updates" not finding new version

**Problem:** New version released, but app says you're up-to-date.

**Fix:**
1. Wait a few minutes (update check has a cache)
2. Try restarting the app
3. Manually download from [GitHub Releases](https://github.com/WizardlyPayload/FarmHub/releases)

---

### Auto-update seems slow

**Note:** Auto-updates happen when:
- You close and reopen the app
- A new version is available
- Update check completes successfully

Updates download in the background, so you might not see progress.

---

## Advanced Debugging

### Check app logs

**Browser DevTools:**
1. In the dashboard window, press **Ctrl+Shift+I**
2. Go to **Console** tab
3. Look for error messages (red text)

### Check `electron-store` config

```
%APPDATA%\fs25-farm-dashboard\config.json
```

Contains all servers, FTP settings, etc.

### Clear all dashboard data

```
%APPDATA%\fs25-farm-dashboard\
```

Delete this folder to reset everything. App will ask you to set up again on next launch.

### Check system event logs

**Windows Event Viewer:**
1. Search for "Event Viewer"
2. Navigate to **Windows Logs → Application**
3. Look for errors from "Farm Dashboard"

---

## Still Stuck?

1. **Check the [User Manual](User-Manual)** for feature explanations
2. **Read the [Installation Guide](Installation-Guide)** for setup steps
3. **Open a GitHub issue** with:
   - What you were trying to do
   - What happened
   - What you expected
   - Steps to reproduce
4. **Contact maintainers** if you think it's a security issue

---

**Last resort:** Uninstall, delete `%APPDATA%\fs25-farm-dashboard\`, and reinstall fresh.
