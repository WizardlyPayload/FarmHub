# Farm Dashboard V5 5.1.18 — release handoff

**Status on 26 October 2026:** the 5.1.18 app, unchanged mod and local website candidate are prepared. Exact 5.1.18 Ally acceptance and a green final CI run are pending. The public release has **not** been published. Graham's final release decision and Sarah's website deployment coordination still apply.

## Use only these three product files

All release files are in `C:\Users\Graham\Documents\FarmDash Release\`.

| File | Purpose | SHA-256 |
| --- | --- | --- |
| `FS25-Farm-Dashboard-V5-Setup-5.1.18.exe` | Windows V5 app | `2E2B57E2A19B3BC4119FF753BD75A33DAC155E7179B08FAB45C83C86B35D9870` |
| `FS25_FarmDashboard.zip` | Canonical in-game mod 5.1.0.9 | `5934EFFB19FC0A72466573589DE4E76DADCC1AAA7E1FCA685B94A94D73527378` |
| `farmdashboard-website-5.1.18-upload.zip` | Public website candidate for Sarah | `F1B137512BE157D58B038C538854E1CF251A329CFCB6697B9FC92A8DE3DDE124` |

`latest-rf.yml` in that same folder is now the **5.1.18** V5 updater feed. It names the exact Setup file, size **383,894,315 bytes**, and SHA-512 (base64) `+58fNGMorlnrYDysR1WVLDOCg+3ojdZ2JK5slz0FXTuclNSCGSGSLPIqELrIXkfYaQShTLMV6oaAG4osx9zRcw==`. The previous local 5.1.17 feed was preserved in `C:\Users\Graham\Documents\FarmDash Release Checks\current-5117\latest-rf-before-5118.yml`. Do not use the older website ZIPs or release-day guides for this release. Do not touch V4's `latest.yml`.

## What passed

- **Source and package:** the unchanged mod is 5.1.0.9. The 5.1.18 installer was built with `body-parser` 1.20.9 and `fast-uri` 3.1.9; the installed `app.asar` reports those exact versions and app version 5.1.18. The production dependency audit found zero vulnerabilities. The local MJS suite passed 155/155, and package-selection and i18n checks passed. The local full Jest run had 256/262 suites pass; hardware-dependent map/HUD tests hit timeouts against this PC's game files, and the installer runtime fixture passed 22/22 when isolated. CI has not yet passed on the final revision.
- **PC:** 5.1.18 appears as one native Windows Installed apps entry with a real uninstaller. An initial upgrade attempt safely stopped during selected-source staging; after the helper completed, the retry installed 5.1.18. The private `config.json` SHA-256 matched its pre-upgrade copy, the stage cleared, and the app launched with `/api/status` reporting 5.1.18 and HTTP 200. The installed package contains the section images. The unchanged 5.1.0.9 mod was tested in game and on a heavy save before this app dependency refresh.
- **Ally:** Tina tested the **earlier 5.1.17** installer: upgrade from 5.1.15, installed-app launch, visible section photographs, image routes, Windows row, Keep uninstall and reinstall. Saves **1,740/1,740**, mod ZIPs **483/483**, and mod settings **517/517** had no added, changed or missing file; `inputBinding.xml` matched. Evidence: `Z:\Graham\agent-comms\ally-farmhub-v517-evidence\` and `RESULT FARMHUB-ALLY-20261026-V517-RELEASE-01` in `to-wizard-pc.md`. The new 5.1.18 installer has **not yet** been accepted on the Ally.
- **Fresh/Full lifecycle:** the earlier 5.1.15 PC and Ally runs exercised Full removal and a genuinely clean first launch with the Dashboard-owned modSettings folder moved aside and later restored. This was not repeated on 5.1.18; do not label it an exact 5.1.18 Full test.
- **Multiplayer/performance:** the unchanged mod 5.1.0.9 matched PC, Ally and dedicated server and passed two-client generation/freshness checks. The heavy savegame11 collector pass measured median **1.35 ms** and p95 **9.5 ms**, versus the earlier median **21.65 ms** and p95 **31.65 ms**. These are observations for that save, not guarantees for every mod combination.
- **Documentation:** 53 current core/companion screenshots and 12 redacted genuine Electron Settings screenshots are linked. All 68 local Markdown image links resolved.
- **Website candidate:** 126 public files only, with no tester `/t/` files or installers. The previously corrupted local `install.html` and `fields.html` were replaced from the valid public pages, versioned for 5.1.18, and paired with current app screenshots. Local Home, Install, Fields and Economy browser previews loaded all images without page errors on the 5.1.17 stage; the 5.1.18 update changed version text and links only. The live public site was not changed.

## Known behaviour and scope

- After **Keep** uninstall and reinstall on the Ally's 5.1.17 test, a retained source appeared in the Saves list but was not automatically selected. Choosing it restored the held snapshot. Tina observed the same behaviour on 5.1.15. A held snapshot is not proof of a currently exporting game.
- App 5.1.18 refreshed two production dependencies after the accepted 5.1.0.9 multiplayer test. The exact 5.1.18 app was not used in another live two-client game run; the mod and stream code did not change.
- The PC restarted during a household power cut. A Windows bugcheck and NVIDIA driver events were recorded, but the dump was not accessible and the root cause was not established. No driver or Windows setting was changed as part of this release.

## Publication order — only after Graham's release go-ahead

1. Recheck the three SHA-256 values above, `latest-rf.yml` version/size/SHA-512, and that `origin/main` includes this handoff. Freeze that revision; do not rebuild the installer or mod without repeating the affected acceptance.
2. Create GitHub release **`v5.1.18`** from the frozen V5 main revision. Attach the exact Setup EXE, `FS25_FarmDashboard.zip` and 5.1.18 `latest-rf.yml`. Use [`GITHUB_RELEASE_v5.1.18.md`](GITHUB_RELEASE_v5.1.18.md) as the body. Verify all three downloaded assets against the local files. Keep classic V4 release assets and `latest.yml` untouched.
3. Update the public itch V5 Windows and mod downloads with these same app/mod versions and canonical mod name. Confirm the displayed filenames, versions and download hashes before changing the website. Do not leave an older V5 ZIP beside the canonical mod for players to install together.
4. Coordinate the website upload through **Sarah**: request `SARAH-20261026-004` in `Z:\OpenClaw\Sarah Office\INBOX.txt`. Wait for her acknowledgement and approved deployment window. She should preserve `/t/fs25-beta/` and its Cloudflare Access protection, back up the live site, deploy only the verified public ZIP, and check Home, Install, Fields, Economy, linked assets, TLS, and rollback readiness. The inbox entry alone is not approval or completion.
5. Check public GitHub, itch and website links/versions as a visitor, then use [`RELEASE_POSTS_v5.1.18.md`](RELEASE_POSTS_v5.1.18.md) for community posts. Keep the posts as drafts until the downloads and install instructions genuinely match.

The currently public itch and website listings still show **5.0.3**, and the `v5.1.18` GitHub Release does not yet exist. Do not publish the staged website first: it links to that release tag and tells players to download the 5.1.18 files.
