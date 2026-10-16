# V5 5.1.0 — leftover execution plan

> Historical plan: do not follow its old merge-to-main or rebuild instructions for the frozen 5.1.0 candidate. The current release-day order is `C:\Users\Graham\Documents\FarmDash Release\RELEASE-DAY-5.1.0.md`. No public release has been performed by preparing that pack.

Wizard-facing checklist after the 2026-09-13 pre-release pass. Public GitHub/itch stay on **5.0.3** until this list is finished. The 2026-10-15 source candidate is **app 5.1.0 / mod 5.1.0.0**; this stamp alone does not prove that the installer, ZIP, or installed clients have been rebuilt and tested.

Do **not** touch V4 `latest.yml` or `Documents/FarmDash Final Output` 4.2.1.

---

## Already done (agent, this pass)

- Local marketing site: V5 Download / install primary buttons → itch.io; GitHub is secondary.
- **Live** farmdashboard.co.uk updated (HTML + JS via Ops-Centre jump). Header **Download** → itch. Install primary → itch. Header **Discord** → `community.html`. Join buttons → GitHub Issues until a never-expire invite is in `Website/js/site-config.js`.
- Dead Discord invites (`qsSTRwG2`, `D4sEHM59`) no longer send visitors to “Invite Invalid”.
- itch paste HTML rewritten (UTF-8) in `docs/_internal/itch-io-page-description.html` and `itch-io-install-instructions.html` for **current public 5.0.3**.
- Draft GitHub notes: `docs/v5 documents/GITHUB_RELEASE_v5.1.0.md`.
- V5 changelog has the 5.0.5 collector / Dairy Core notes.
- App tests: 661 passed. Two map-overview suites failed on this PC (missing `map_overviews` cache / 0-byte images) — environment, not this site pass. Cloudflare purge token was not in local secrets; cache-bust query `?v=5.0.3j` is live. Purge in the Cloudflare dashboard if an old GitHub-first header still appears.

---

## You must do (blocked on you)

### 1. Discord never-expire invite — done (2026-09-13)

https://discord.gg/ZCG9C7h7aT is live (`expires_at` null). Site, README, wiki, AUTHORS, demo banner, setup footer, classic about/viewer. Still change your **GitHub profile** social link if it still shows `qsSTRwG2`.

Optional: add Discord to the itch description on the next paste (`docs/_internal/itch-io-page-description.html` now includes it).

### 2. Paste itch description — done (Wizard 2026-09-13)

Re-paste after **5.1.0** files go up (version lines + Discord link).

### 3. Vanilla / PF screenshots — done (2026-09-13)

Riverbend savegame4 (dash only) and savegame3 (PF + dash) captured and on the home page. Suite Riverbend shots stay on the main galleries.

### 4. Eyes-on freeze (before `build:all:v5`)

Minimum:

- [ ] SP: mod loads, `data.json` moves, V5 Setup from a **fresh** 5.1.0 build shows fields / vehicles / pastures / storage / map / economy.
- [ ] Dedicated join-as-client (Local, no FTP) still works.
- [ ] V4 still launches beside V5; V4 Check for updates does **not** offer 5.1.0.
- [ ] SmartScreen unsigned warning is expected — do not sign unless you decided to buy a cert.

Tester sheet: `docs/TESTERS.md`. Maps if you have them: vanilla Giants, Witcombe extras, Montana extras, multi-farm.

### 5. Git freeze

1. Review assume-unchanged local files (`editionPolicy.cjs`, `fleet-classify.ts`, Hire Purchasing collector, livestock hydration, Fleet map). Either commit them on purpose or discard them so 5.1.0 is not a mystery tree.
2. Merge `codex/ux-streamline-fixes` to `main` (or the branch you actually tag).
3. Stamp `FS25_FarmDashboard_App/electron-builder.rf.yml` `extraMetadata.version` → **5.1.0** (DEV reset). Leave `package.json` at 4.2.2.
4. Keep `modDesc.xml` and `FarmDashboard.VERSION` aligned at **5.1.0.0** for this candidate.
5. Fill SHA256 into `GITHUB_RELEASE_v5.1.0.md` after the build.

Ask Dash to commit / push / tag only in that message.

---

## Build and publish (after freeze)

Run from repo root. Several minutes.

```text
npm run build:all:v5
```

Confirm **flat** in `Documents\FarmDash Release\` (not nested `V5\`):

| File | Required |
| --- | --- |
| `FS25_FarmDashboard.zip` | Yes (mod 5.1.0.0) |
| `FS25-Farm-Dashboard-V5-Setup-5.1.0.exe` | Yes |
| `latest-rf.yml` | Yes — version 5.1.0 |

Guard must pass (`tools/app/assert-rf-update-channel.mjs`). **No** V5 Setup on V4 `latest.yml`.

Then:

1. Copy zip into `Documents\My Games\FarmingSimulator2025\mods\` (and sync unpacked folder if present).
2. GitHub Release **v5.1.0** as Latest. Attach Setup + zip + `latest-rf.yml`. Body = `GITHUB_RELEASE_v5.1.0.md`. Do **not** replace V4 `latest.yml` assets on older tags.
3. itch: butler `windows-v5` (Setup) + `mod-v5` (zip). Re-paste description with 5.1.0 numbers.
4. Site: bump `Website/js/site-config.js` `appVersion` / `modVersion` / `v5SetupFilename` / `releasesUrl` to 5.1.0, cache-bust `?v=`, deploy via Ops-Centre jump, purge Cloudflare cache for `farmdashboard.co.uk` + `www`.
5. Optional GPortal: upload **the same** My Games zip bytes after dedicated is stopped.

---

## Do not do

- Do not publish 5.0.5 as a GitHub tag (DEV stamp; public is 5.1.0).
- Do not overwrite live V4 4.2.1.
- Do not call V5 “RF edition” on itch, GitHub, or the site.
- Do not commit `Website/` or `.cursor/secrets/`.
