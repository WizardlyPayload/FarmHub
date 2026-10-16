# Farm Dashboard V5 5.1.0: release-day handoff

Prepared 15 October 2026. This pack is local only. Graham decides when to publish.

## What is ready locally

- App: `FS25-Farm-Dashboard-V5-Setup-5.1.0.exe`, SHA256 `690887BEE5AE42AD57607B6031320420BBCB8078FCCC4D908450286F6A7C1256`.
- Game mod: `FS25_FarmDashboard.zip`, mod version 5.1.0.0, SHA256 `8CA1601AC8AD0385F54845D1A01E69CDE5C9B2671538343F12E1B04748D25C55`.
- V5 update feed: `latest-rf.yml`; points to the 5.1.0 installer, size 974488717 bytes, SHA512 `je85wJbRviloiqP7Vdvc/8wgV8Zi24CC4M/DMEvYkectwrs35bnsTRAB5mUBal6ixMsDx8zO5Kq7eHP1pzxMxg==`.
- Local site: `farmdashboard-website-5.1.0-upload.zip`; public site files only, no `/t/` private tester page or tester configuration.
- GitHub release text: `docs/v5 documents/GITHUB_RELEASE_v5.1.0.md`.
- itch page and installation paste text: `docs/_internal/itch-io-page-description.html` and `docs/_internal/itch-io-install-instructions.html`.
- Posts: `RELEASE-POSTS-5.1.0.md`, tailored to each audience. Images are in `Website/assets/screenshots/`.

The files above live in the flat `C:\Users\Graham\Documents\FarmDash Release\` directory where applicable. The site source remains in `Website/` and is intentionally Git-ignored.

## Release order when Graham is home

1. Confirm the exact V5 candidate commit to tag. Baseline is `70014e1f430ce0c3a9d2d06dc8e2aef5ac3ad8c4` on `codex/ux-streamline-fixes`; include only intentional release-document changes if a later commit is made. Do not stage unrelated deployment rules, caches, pipeline files or other owners' work. Do not merge V5 into classic `main` just to make the tag.
2. Publish GitHub tag/release `v5.1.0` from that V5 commit. Attach the installer, canonical mod ZIP and **V5-only** `latest-rf.yml`. Use the prepared GitHub release text. Never attach or replace classic V4 `latest.yml`.
3. Check the published asset names and checksums before directing players to them. The update feed must resolve to the same 5.1.0 installer.
4. Update itch `windows-v5` with the installer and `mod-v5` with the canonical mod ZIP. Leave classic files and channels alone. Once downloads are live, paste the prepared itch description and install instructions, and set the displayed version labels to app 5.1.0 / mod 5.1.0.0.
5. Upload the **contents** of `farmdashboard-website-5.1.0-upload.zip` to the actual `www.farmdashboard.co.uk` document root on the live VPS. Do not use the old Ops-Centre jump host as the web root, and do not upload `/t/` or local deployment scripts. The prepared site points to `v5.1.0`, so GitHub must already be live.
6. Refresh Cloudflare/site cache as needed. Check the public Home and Install pages, itch, V5 GitHub fallback, manual, Discord invite and classic V4 link. Public V4 4.2.1 on GitHub and its `latest.yml` remain untouched. The itch page currently lists an older 4.2.0 classic installer; do not claim that itch hosts V4 4.2.1 unless it is separately updated.
7. Post the matching drafts from `RELEASE-POSTS-5.1.0.md`. Check each community's self-promotion rules. Do not use `@everyone` or post to every Discord with identical wording by default.

## Honest boundaries

- The latest pass changed versions, documentation, links and release packaging, not intended dashboard/gameplay behavior. Do not restart broad PC/Ally/multiplayer testing solely because of the version stamp.
- The installed PC Riverbend smoke showed committed export generations and a live V5 fields view. It does not prove every mod combination, Ally lifecycle or every dedicated setup.
- The installer is unsigned. Windows may show an Unknown Publisher/SmartScreen warning. Never tell users to disable security protections.
- No tag, GitHub Release, itch upload, VPS upload, Cloudflare purge or public post is performed by preparing this pack.
