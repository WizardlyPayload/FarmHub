# Upgrade notes — from `WizardlyPayload/FS25-Farm-Dashboard` (public 2.0.0)

This repository (**FarmHub**) is the **continuation** of the public release at
`WizardlyPayload/FS25-Farm-Dashboard` (app **2.0.0** / mod **2.0.0.0**).
Use this document to understand **what changed** and **what was added** since that release.

---

## 1) Repository + release channels

- **Repo name changed**: public repo → **FarmHub** (this repo).
- **Release line**: app **4.0.0** / mod **2.3.0.0** (current) vs public **2.0.0**.
- **Docs consolidated**: everything lives under `docs/` with a master index in `docs/README.md`.

---

## 2) Desktop app — key changes since 2.0.0

- **Security hardening** for LAN access (default creds rejected, min password length, weak password block).
- **XSS/DOM safety**: shared escape helper used in pasture, livestock, vehicles, economy, fields.
- **Offline cache**: last merged snapshot is cached locally and restored on restart (FTP servers skip cache).
- **Realtime improvements**: payload dedupe, fan‑out logic, pasture warning rework, farm‑switch handling.
- **Updater**: `electron-updater` pipeline in place for **3.9 → 4.0** test.
- **Setup UX**: per‑field validation, clearer error mapping, success state before redirect.
- **Packaging**: build output moved to `%LOCALAPPDATA%\fs25-farm-dashboard-electron-out` to avoid file locks;
  optional in‑repo output via `npm run dist:in-repo`.

---

## 3) Mod — key changes since 2.0.0.0

- **Version alignment**: `modDesc.xml` and Lua constants now match (**2.3.0.0**).
- **Field probes + rules**: refined growth/harvest logic, mulch handling, and post‑harvest states.
- **Forage thresholds**: small patch noise floors and workflow rules continue to be refined.

---

## 4) Install/packaging differences

- **Mod zip** is now **strictly**: `modDesc.xml`, `icon.png`, `src/` at the **zip root**.
- **Mod folder name** remains **`FS25_FarmDashboard`** in your FS25 `mods` directory.
- **App installer** is an NSIS `.exe` built from `FS25_FarmDashboard_App`.

---

## 5) FTP / multiplayer expectations

- FTP servers **require fresh downloads**; cached snapshots are **not** used.
- Local saves may show **last known data** when the game is closed.

---

## 6) Documentation changes

The public repo docs were expanded and split for maintainers:
- `docs/CHANGELOG.md` — full change history.
- `docs/GITHUB_RELEASE_v4.0.0.md` — GitHub release blurbs.
- `docs/USER_MANUAL.md` — end‑user walkthrough and screenshots.
- `docs/DEVELOPER_HANDOVER.md` — architecture and build notes.
- `docs/_internal/UPDATER_QA.md` — update verification checklist.

---

## 7) Recommended path for users on 2.0.0

1. Install the **new mod** (`FS25_FarmDashboard.zip`, version **2.3.0.0**).
2. Load each save once with the mod enabled.
3. Install the **new app** (**4.0.0**), open **http://localhost:8766**.
4. For FTP servers, re‑enter credentials and save slots in **Settings → Servers & saves**.

---

## 8) Where to read the full delta

- **Full version history**: `docs/CHANGELOG.md`
- **3.9 narrative**: `docs/RELEASE_v3.9.0.md`
- **Release copy**: `docs/GITHUB_RELEASE_v4.0.0.md`
