# FS25 Farm Dashboard — Release **v4.2.1** (classic)

**Desktop app:** `4.2.1` (`FS25_FarmDashboard_App/package.json`)  
**Classic public mod zip:** `3.4.0.7` (stamped by `npm run package:mod:classic`; app requires **3.1.0.0+**)  
**RF working tree / GPortal:** keep `modDesc` **5.0.0.1** via plain `npm run package:mod` — do **not** publish RF onto classic `latest.yml`.

---

## Summary

**4.2.1** is a **classic patch** on the 4.2 / 3.4 line. Headline: **Farming Simulator 1.21 `copyFile` log-spam fix** (Bool-only + fail latch for map overview). Also includes **dedicated join-as-client** export mirror, **Track A** merge/test hardening, and **Setup** UX for mirror / join-as-client. Classic UI remains the default (`useNewUi` false). **FTP stays Advanced** for headless / empty dedicated servers.

---

## Publish checklist

1. Confirm root + app `package.json` are **4.2.1**. Working-tree RF `modDesc` may stay **5.0.0.1**.
2. `npm run build:all` from repo root (classic channel — uses `package:mod:classic` → zip **3.4.0.7**).
3. Verify Final Output: Setup **4.2.1**, zip mod version **3.4.0.7**, `latest.yml` points at 4.2.1. Confirm `RF-edition/latest-rf.yml` untouched.
4. Tag **`v4.2.1`** on the commit that matches the built artifacts.
5. GitHub Release assets: **`FS25-Farm-Dashboard-Setup-4.2.1.exe`**, blockmap, **`latest.yml`**, **`FS25_FarmDashboard.zip`**.
6. Paste release body from **[GITHUB_RELEASE_v4.2.1.md](./GITHUB_RELEASE_v4.2.1.md)** (plain-English update steps).
7. Mark release **Latest** (replaces tag `4.2` / 4.2 BETA on GitHub).
8. Update itch description HTML + upload builds (butler if configured).
9. After classic publish: `npm run package:mod` to restore a **5.0.0.1** zip for local / GPortal RF deploy.

---

## Version alignment

| Artifact | Version |
|----------|---------|
| Root + app `package.json` | **4.2.1** |
| Classic public zip (`package:mod:classic`) | **3.4.0.7** |
| RF working tree / `package:mod` | **5.0.0.1** |
| `modVersionPolicy.js` → `MIN_MOD_VERSION` | **3.1.0.0** (unchanged) |
| Installer filename | `FS25-Farm-Dashboard-Setup-4.2.1.exe` |
| Default UI | Classic web (`useNewUi` **false**; NEW APP opt-in only) |

**Changelog:** [CHANGELOG.md](./CHANGELOG.md) · **4.2.1**
