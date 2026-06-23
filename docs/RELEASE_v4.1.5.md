# FS25 Farm Dashboard — Release **v4.1.5**

**Desktop app:** `4.1.5` (`FS25_FarmDashboard_App/package.json`)  
**FS25 mod:** `3.3.21.2` (`modDesc.xml` + `FarmDashboard.VERSION` in Lua — app requires **3.1.0.0+**)

---

## Summary

v4.1.5 is a **fix release** on the 4.1 line. Headline changes: **authoritative store images** for vehicles/equipment (mod exports `storeImage`; app exact-match + extractor migration), **duplicate fleet entries fixed** on dedicated servers, plus the **4.1.4** Courseplay crash, livestock, and grass-field fixes, **4.1.3** RealisticLivestock counts, **4.1.2** mod-config merge, and **4.1.1** security/offline moisture hardening.

Installers on **4.1.x** can update via **Settings → Check for updates** when the GitHub release ships **`latest.yml`** + matching **`.exe`**. Always update the **mod zip** on every host / dedicated server.

---

## Publish checklist

1. Confirm `package.json` / `modDesc.xml` / `FarmDashboard.VERSION` are **4.1.5** / **3.3.21.2**.
2. `npm run build:all` from repo root.
3. Tag **`v4.1.5`** on the commit that matches the built artifacts.
4. GitHub Release assets: **`FS25-Farm-Dashboard-Setup-4.1.5.exe`**, **`latest.yml`**, **`FS25_FarmDashboard.zip`**.
5. Paste release body from **[GITHUB_RELEASE_v4.1.5.md](./GITHUB_RELEASE_v4.1.5.md)**.

---

## Version alignment

| Artifact | Version |
|----------|---------|
| Root + app `package.json` | **4.1.5** |
| `modDesc.xml` / `FarmDashboard.VERSION` | **3.3.21.2** |
| `modVersionPolicy.js` → `MIN_MOD_VERSION` | **3.1.0.0** (unchanged) |
| Installer filename | `FS25-Farm-Dashboard-Setup-4.1.5.exe` |

**Changelog:** [CHANGELOG.md](./CHANGELOG.md) §**4.1.5** · **Authors:** [AUTHORS.md](./AUTHORS.md)
