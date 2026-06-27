# FS25 Farm Dashboard — Release **v4.2.0**

**Desktop app:** `4.2.0` (`FS25_FarmDashboard_App/package.json`)  
**FS25 mod:** `3.4.0.6` (`modDesc.xml` + `FarmDashboard.VERSION`; app requires **3.1.0.0+**)

---

## Summary

**4.2.0** is the first **public** release on the 4.2 / 3.4 line. Headlines: **storage naming & silo moisture** (incl. Pig Food / sparse fill types), **dealership clutter removed from player farms**, **bale categorization**, **base-game livestock**, **production chains on base maps**, **urgent notifications**, **weather temps**, **public demo refresh UX**, plus the **4.1.x** stability and fleet fixes.

---

## Publish checklist

1. Confirm `package.json` / `modDesc.xml` / `FarmDashboard.VERSION` are **4.2.0** / **3.4.0.6**.
2. `npm run build:all` from repo root.
3. Tag **`v4.2.0`** on the commit that matches the built artifacts.
4. GitHub Release assets: **`FS25-Farm-Dashboard-Setup-4.2.0.exe`**, **`latest.yml`**, **`FS25_FarmDashboard.zip`**.
5. Paste release body from **[GITHUB_RELEASE_v4.2.0.md](./GITHUB_RELEASE_v4.2.0.md)**.
6. Mark release **Latest** (replaces 4.0.0 on GitHub).
7. Upload **`Website/`** + builds to VPS when ready (testers page + public site).

---

## Version alignment

| Artifact | Version |
|----------|---------|
| Root + app `package.json` | **4.2.0** |
| `modDesc.xml` / `FarmDashboard.VERSION` | **3.4.0.6** |
| `modVersionPolicy.js` → `MIN_MOD_VERSION` | **3.1.0.0** (unchanged) |
| Installer filename | `FS25-Farm-Dashboard-Setup-4.2.0.exe` |

**Changelog:** [CHANGELOG.md](./CHANGELOG.md) §**4.2.0**
