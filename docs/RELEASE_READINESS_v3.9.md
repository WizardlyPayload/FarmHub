# Release readiness — **v3.9.0** (pre-final) → updater validation → **v4.0.0**

This checklist ties together **`package.json`**, **`modDesc.xml`**, GitHub Releases, and **`electron-updater`** so you can ship **3.9.0**, exercise the update pipeline before the **4.0** milestone, and avoid tag/asset mismatches.

---

## 1. Version sources of truth (must match before tag)

| Artifact | Location | Expected for this line |
| -------- | -------- | ---------------------- |
| Desktop app | `FS25_FarmDashboard_App/FS25_FarmDashboard_App/package.json` | **3.9.0** |
| Lockfile | same folder `package-lock.json` | same **`version`** field after `npm install` |
| FS25 mod | `FS25_FarmDashboard_Mod/FS25_FarmDashboard_Mod/modDesc.xml` | **2.3.0.0** |
| Lua constant | `src/FarmDashboard.lua` → `FarmDashboard.VERSION` | **2.3.0.0** |
| Publish target | `package.json` → `build.publish` | `WizardlyPayload` / `FarmHub`, **`releaseType`: `release`** |

Long-form narrative: [RELEASE_v3.9.0.md](./RELEASE_v3.9.0.md).

---

## 2. Automated gates (run locally before `dist`)

From `FS25_FarmDashboard_App/FS25_FarmDashboard_App/`:

```bash
npm test
npm audit --omit=dev
```

- **Tests:** all Jest suites must pass (see [PROJECT_DEEP_AUDIT_FARMHUB.md](./PROJECT_DEEP_AUDIT_FARMHUB.md) for known dependency audit notes).
- Treat **`npm audit`** results as **informational** until transitive deps (e.g. via `electron-store` → `ajv`) are upgraded — track in the deep audit doc.

---

## 3. Build the Windows installer

From the same app directory (see app `README.md` for full detail):

```bash
npm run dist
```

Confirm output under the configured directory (default sibling **`electron-pack-out/`** per `package.json`):

- **`FS25 Farm Dashboard Setup 3.9.0.exe`** (name follows version)
- **`latest.yml`** — required for **electron-updater** to discover builds

---

## 4. Publish **3.9.0** on GitHub Releases

1. Tag **`v3.9.0`** (or consistent tag naming your pipeline expects — **must** match what electron-builder / updater use).
2. Create a **GitHub Release** on **`WizardlyPayload/FarmHub`** (see `build.publish`).
3. Attach **`latest.yml`** and the **`.exe`** from the build output.

Without **`latest.yml`**, installed clients will not see updates correctly.

---

## 5. Updater QA (mandatory before treating **v4** as stable)

Follow **[UPDATER_QA.md](./UPDATER_QA.md)** end-to-end.

**Recommended rehearsal for the 4.0 launch:**

1. Install the packaged **3.9.0** app from the release assets (not `npm start`).
2. Launch and wait **~10 seconds** — confirm console shows updater activity (`checking-for-update` / `uptodate` / no unexpected errors).
3. Publish a **pre-release** or draft **4.0.0** build on GitHub with **`latest.yml`** + new `.exe` (version **4.0.0** in `package.json` when you build it).
4. Relaunch **3.9.0**: expect **update available** → **download** → **restart** dialog when the package is downloaded (per `app-updater.js`).
5. Confirm **`npm start`** / unpackaged runs **skip** the updater (`app.isPackaged === false`).

Manual check from the UI: **Settings → Check for updates** uses IPC → `checkForUpdatesNow()`.

---

## 6. After updater QA passes

- Promote **v4.0.0** narrative and user-facing notes ([CHANGELOG.md](./CHANGELOG.md), [RELEASE_NOTES.md](./RELEASE_NOTES.md)).
- Bump **`package.json`** / **`package-lock.json`** to **4.0.0** for the final stable installer line when ready (not before updater rehearsal unless you use pre-releases deliberately).

---

## 7. Related documents

| Doc | Purpose |
| --- | ------- |
| [UPDATER_QA.md](./UPDATER_QA.md) | Behaviour matrix for electron-updater |
| [RELEASE_v3.9.0.md](./RELEASE_v3.9.0.md) | What shipped in 3.9.0 |
| [AUDIT_v3.9_PREFINAL.md](./AUDIT_v3.9_PREFINAL.md) | Prefinal audit record |
| [PROJECT_DEEP_AUDIT_FARMHUB.md](./PROJECT_DEEP_AUDIT_FARMHUB.md) | Full-project findings and roadmap |
