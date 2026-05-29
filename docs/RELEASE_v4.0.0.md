# FS25 Farm Dashboard — Release **v4.0.0** (stable line)

**Desktop app:** `4.0.0` (`FS25_FarmDashboard_App/package.json`)  
**FS25 mod:** `3.0.0.0` (`modDesc.xml` + `FarmDashboard.VERSION` in Lua — app requires **3.0.0.0+**)

**Prior line:** [RELEASE_v3.9.0.md](./_internal/archive-releases/RELEASE_v3.9.0.md) (pre-final hardening + updater baseline).

---

## Executive summary

v4.0.0 is the **first stable promotion** after the 3.9 pre-final line. It validates the **in-app auto-update** path (`electron-updater` → GitHub Releases) and adds **mod version awareness** in the dashboard navbar. No breaking wire-format changes; existing **2.3.0.0** mod builds remain compatible. Installers on **3.9.0** can update to **4.0.0** from **Settings → Check for updates** or the automatic ~10s startup check — accept **Restart and install** when the download completes.

---

## What’s new in 4.0.0

| Area | Change |
|------|--------|
| **Auto-update** | Confirmed production path: packaged **3.9.0** → published **4.0.0** release with **`latest.yml`** + installer. See [_internal/UPDATER_QA.md](./_internal/UPDATER_QA.md). |
| **Mod version badge** | Lua exports `serverInfo.modVersion`; app compares against `MIN_MOD_VERSION` in `modVersionPolicy.js`; unobtrusive navbar badge when the in-game mod is older or version cannot be read. |
| **Tests** | `modVersionPolicy.test.js` (+7 tests); **230** total under `npm test`. |
| **Docs / versions** | App **`4.0.0`** across `package.json`, manuals, wiki, and release notes. |

---

## Operator checklist (publish so updater works)

1. **Merge / tag** `v4.0.0` on `main` with app version **4.0.0** in `package.json`.
2. From `FS25_FarmDashboard_App/`: `npm test` then `npm run dist`.
3. Create a **published** GitHub Release on **`WizardlyPayload/FarmHub`** (tag **`v4.0.0`**).  
   **Do not use Draft** — `electron-updater` will not see draft assets.
4. Attach **`latest.yml`** and **`FS25 Farm Dashboard Setup 4.0.0.exe`** from the build output folder.
5. Optional: attach **`FS25_FarmDashboard.zip`** if you rebuilt the mod (mod-version export in `data.json`).
6. On a PC with **3.9.0** installed: launch app → wait or **Settings → Check for updates** → **Restart and install**.

Copy-paste release body: **[GITHUB_RELEASE_v4.0.0.md](./GITHUB_RELEASE_v4.0.0.md)**.

---

## Version alignment

| Artifact | Value |
| -------- | ----- |
| `package.json` / `package-lock.json` | **4.0.0** |
| `modDesc.xml` / `FarmDashboard.VERSION` | **3.0.0.0** |
| `modVersionPolicy.js` → `MIN_MOD_VERSION` | **3.0.0.0** |
| Installer filename | `FS25 Farm Dashboard Setup 4.0.0.exe` |

---

**Authors:** [AUTHORS.md](./AUTHORS.md) · **Security:** [SECURITY.md](./SECURITY.md) · **Changelog:** [CHANGELOG.md](./CHANGELOG.md) §**4.0.0**
