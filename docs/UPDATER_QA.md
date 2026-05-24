# Farm Dashboard — auto-update QA

The Windows packaged app uses `electron-updater` ([`app-updater.js`](../FS25_FarmDashboard_App/FS25_FarmDashboard_App/app-updater.js)) against GitHub Releases configured in `package.json` (`build.publish`).

## What to verify

1. **Unpackaged / dev build** — On `npm start` or a non-packaged run, the log should show that the updater is skipped (`app.isPackaged` is false). No update prompts should appear.
2. **Packaged build** — After install from the NSIS installer, wait ~10 seconds after launch: a background check runs. With no new release, the renderer may receive `uptodate`. With a newer published release, expect `available` then `downloading` then a dialog when `update-downloaded` fires (“Restart and install” / “Later”).
3. **Manual check** — From Settings, “Check for updates” invokes `check-desktop-app-updates` IPC, which calls `checkForUpdatesNow()` in the main process.

## Failure signals

- Console: `[updater] electron-updater load failed` — dependency or signing issue.
- `update-error` / GitHub API errors — network, wrong `publish` URL, or private repo without token (not used in this project by default).
- **`404` on download** — the **`.exe` filename on the GitHub Release must exactly match** the `path:` (and `files[].url`) in **`latest.yml`**. Do not rename the installer when uploading (no spaces → dots, no manual renames). After `npm run dist`, upload **`FS25-Farm-Dashboard-Setup-4.0.0.exe`** and **`latest.yml`** from the **same** build output folder without editing either file.

## Publish checklist (avoid 404)

From `%LOCALAPPDATA%\fs25-farm-dashboard-electron-out\` after `npm run dist`:

1. Open **`latest.yml`** — note the `path:` value (e.g. `FS25-Farm-Dashboard-Setup-4.0.0.exe`).
2. Upload that **exact** `.exe` file (same name, same folder build) plus **`latest.yml`** to the GitHub Release.
3. Do **not** upload `FS25 Farm Dashboard Setup 4.0.0.exe` (spaces) or `FS25.Farm.Dashboard.Setup.4.0.0.exe` (dots) unless you regenerate `latest.yml` to match.

## Notes

- `autoDownload` and `autoInstallOnAppQuit` are enabled in code; user still confirms immediate restart from the dialog when a download completes.

---

## Rehearsing the path to **v4.0.0**

Use this once **3.9.0** is published with **`latest.yml`** + installer attached.

1. Install **3.9.0** from the GitHub Release (packaged build — not `npm start`).
2. Launch, wait ~10s, confirm updater logs look sane ([What to verify](#what-to-verify)).
3. Build **4.0.0** locally (`package.json` **4.0.0** → `npm run dist`), create a **published** GitHub Release (tag **`v4.0.0`**) with the new **`latest.yml`** and **`Setup 4.0.0.exe`**.  
   **Draft releases are not visible to `electron-updater`** — use **Publish release** (pre-release is OK only if you enable `allowPrerelease` in code; this project does not).
4. Restart the **3.9.0** install — expect **update available** → **downloading** → dialog when ready → **Restart** installs **4.0.0**.

Operator checklist: [RELEASE_v4.0.0.md](./RELEASE_v4.0.0.md) · [RELEASE_READINESS_v3.9.md](./RELEASE_READINESS_v3.9.md).
