# FS25 Farm Dashboard — Release **v4.1.0**

**Desktop app:** `4.1.0` (`FS25_FarmDashboard_App/package.json`)  
**FS25 mod:** `3.1.0.0` (`modDesc.xml` + `FarmDashboard.VERSION` in Lua — app requires **3.1.0.0+**)

**Prior line:** [RELEASE_v4.0.0.md](./RELEASE_v4.0.0.md) (stable auto-update + mod version badge).

---

## Executive summary

v4.1.0 is the **feature release** after the 4.0 stable line. It ships **fleet map**, **farm-scoped bale & storage inventory**, **Economy storage tab**, optional **Red Tape compliance**, **Advanced Damage System** vehicle panels, **Moisture System** field badges, and hardening fixes from dedicated-server testing (Witcombe / multi-farm). Installers on **4.0.0** can update via **Settings → Check for updates** when a published release includes **`latest.yml`**.

---

## What's new in 4.1.0

| Area | Change |
|------|--------|
| **Fleet map** | Live vehicle pins on the save's PDA overview; terrain inset clipping for desk-border overview textures; pan/zoom; multi-farm legend. |
| **Bale inventory** | Separate **on-field** vs **storage** counts; AUTO BALE STORAGE / object-storage sheds; deduplicated world scan (fixes double-count on dedicated). |
| **Storage tab** | Silo & bunker stock table (in-game-style columns), bale stock cards, pallets & big bags — under Economy → **Storage**. |
| **Fill types** | Shared resolver (`fillTypeResolve`) across merge + browser; Triticale and sparse DS labels fixed. |
| **Red Tape** | Compliance tab when Red Tape mod exports data (policies, schemes, tax, events). |
| **ADS integration** | Vehicle workshop / inspection / breakdown panels when Advanced Damage System is installed. |
| **Moisture System** | Field moisture badge when compatible mod exports parcel moisture. |
| **Rules engine** | Roll-before-weed ordering on early growth stages. |
| **Mod collectors** | Separate `baleInventory` toggle from `stock`; `redTape` module in `config.xml`. |
| **Tests & CI** | **279** Jest + **17** Node `.mjs` tests; parity tests for farm scope, fleet geo, fill types. |
| **Docs** | [USER_MANUAL.md](./USER_MANUAL.md) refreshed with new screenshots; app **4.1.0** / mod **3.1.0.0** alignment. |

---

## Operator checklist (publish)

1. Tag **`v4.1.0`** with app **4.1.0** in `package.json`.
2. From `FS25_FarmDashboard_App/`: `npm run test:all` then `npm run dist`.
3. Rebuild mod: `tools/Zip-FarmDashboardMod.ps1` → attach **`FS25_FarmDashboard.zip` (3.1.0.0)**.
4. Published GitHub Release: **`FS25 Farm Dashboard Setup 4.1.0.exe`** + **`latest.yml`** + mod zip.
5. Dedicated / FTP hosts: deploy **new mod zip** and restart app (clear `map_overviews` cache if fleet map looks wrong).

Copy-paste release body: **[GITHUB_RELEASE_v4.1.0.md](./GITHUB_RELEASE_v4.1.0.md)**.

---

## Version alignment

| Artifact | Value |
| -------- | ----- |
| `package.json` / `package-lock.json` | **4.1.0** |
| `modDesc.xml` / `FarmDashboard.VERSION` | **3.1.0.0** |
| `modVersionPolicy.js` → `MIN_MOD_VERSION` | **3.1.0.0** |
| Installer filename | `FS25 Farm Dashboard Setup 4.1.0.exe` |

---

**Authors:** [AUTHORS.md](./AUTHORS.md) · **Changelog:** [CHANGELOG.md](./CHANGELOG.md) §**4.1.0**
