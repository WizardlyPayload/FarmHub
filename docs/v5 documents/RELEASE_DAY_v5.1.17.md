# Farm Dashboard V5 5.1.17 — release handoff

**Status on 26 October 2026:** the local app, mod and website candidates are prepared and tested to the limits below. The public release has **not** been published. Graham's final release decision and Sarah's website deployment coordination still apply.

## Use only these three product files

All release files are in `C:\Users\Graham\Documents\FarmDash Release\`.

| File | Purpose | SHA-256 |
| --- | --- | --- |
| `FS25-Farm-Dashboard-V5-Setup-5.1.17.exe` | Windows V5 app | `150F39E4901BC73B87921CD8DAEDB582B05DA4280EC35F101A1C8BF4B1C79992` |
| `FS25_FarmDashboard.zip` | Canonical in-game mod 5.1.0.9 | `5934EFFB19FC0A72466573589DE4E76DADCC1AAA7E1FCA685B94A94D73527378` |
| `farmdashboard-website-5.1.17-upload.zip` | Public website candidate for Sarah | `8F890D068E80FAC03608B909134999AE58103830A6915FD1CF4FC61573D040E1` |

`latest-rf.yml` in that same folder is now the **5.1.17** V5 updater feed. It names the exact Setup file, size **383,891,464 bytes**, and SHA-512 (base64) `lu3lPuEPmZ89DHb6LFujmVE5FAnxtRLbRSyCmcmqSoytSmoVACGdInLhOIKpbbyfXU5yizechVx7m4OT2QbXQg==`. Its earlier local 5.1.0 contents were preserved in `C:\Users\Graham\Documents\FarmDash Release Checks\current-5117\latest-rf-before-5117.yml`. Do not use the older 5.1.0 website ZIP or release-day guide for this release. Do not touch V4's `latest.yml`.

## What passed

- **Source and package:** V5 5.1.17 and mod 5.1.0.9 are on `main`. The package restored section backgrounds by matching the exact filenames in the installed app. The prior full Jest and MJS suites, typecheck, targeted background test and package checks passed before the documentation-only follow-up commits.
- **PC:** 5.1.17 appears as one native Windows Installed apps entry with a real uninstaller. The installer and canonical mod ZIP still matched their hashes after the PC restart. The installed app served its section images and showed the Fields background; the unchanged 5.1.0.9 mod was tested in game and on a heavy save before the app-only image update.
- **Ally:** Tina verified the exact 5.1.17 installer hash, upgrade from 5.1.15, installed-app launch, visible section photographs, image routes, Windows row, Keep uninstall and reinstall. After the cycle, saves **1,740/1,740**, mod ZIPs **483/483**, and mod settings **517/517** had no added, changed or missing file; `inputBinding.xml` matched. The canonical mod ZIP stayed on 5.1.0.9. Evidence: `Z:\Graham\agent-comms\ally-farmhub-v517-evidence\` and `RESULT FARMHUB-ALLY-20261026-V517-RELEASE-01` in `to-wizard-pc.md`.
- **Fresh/Full lifecycle:** the earlier 5.1.15 PC and Ally runs exercised Full removal and a genuinely clean first launch with the Dashboard-owned modSettings folder moved aside and later restored. This was not repeated on the app-only 5.1.17 image build; do not label it an exact 5.1.17 Full test.
- **Multiplayer/performance:** the unchanged mod 5.1.0.9 matched PC, Ally and dedicated server and passed two-client generation/freshness checks. The heavy savegame11 collector pass measured median **1.35 ms** and p95 **9.5 ms**, versus the earlier median **21.65 ms** and p95 **31.65 ms**. These are observations for that save, not guarantees for every mod combination.
- **Documentation:** 53 current core/companion screenshots and 12 redacted genuine Electron Settings screenshots are linked. All 68 local Markdown image links resolved.
- **Website candidate:** 126 public files only, with no tester `/t/` files or installers. The previously corrupted local `install.html` and `fields.html` were replaced from the valid public pages, versioned for 5.1.17, and paired with current app screenshots. Local Home, Install, Fields and Economy browser previews loaded all images without page errors. The live public site was not changed.

## Known behaviour and scope

- After **Keep** uninstall and reinstall on the Ally, a retained source appeared in the Saves list but was not automatically selected. Choosing it restored the held snapshot. Tina observed the same behaviour on 5.1.15, so this is a known usability issue, not a new 5.1.17 regression. A held snapshot is not proof of a currently exporting game.
- App 5.1.17 changed packaged images and documentation after the accepted 5.1.0.9 multiplayer test. The exact 5.1.17 app was not used in another live two-client game run; the mod and stream code did not change in the image build.
- The PC restarted during a household power cut. A Windows bugcheck and NVIDIA driver events were recorded, but the dump was not accessible and the root cause was not established. No driver or Windows setting was changed as part of this release.

## Publication order — only after Graham's release go-ahead

1. Recheck the three SHA-256 values above, `latest-rf.yml` version/size/SHA-512, and that `origin/main` includes this handoff. Freeze that revision; do not rebuild the installer or mod without repeating the affected acceptance.
2. Create GitHub release **`v5.1.17`** from the frozen V5 main revision. Attach the exact Setup EXE, `FS25_FarmDashboard.zip` and 5.1.17 `latest-rf.yml`. Use [`GITHUB_RELEASE_v5.1.17.md`](GITHUB_RELEASE_v5.1.17.md) as the body. Verify all three downloaded assets against the local files. Keep classic V4 release assets and `latest.yml` untouched.
3. Update the public itch V5 Windows and mod downloads with these same app/mod versions and canonical mod name. Confirm the displayed filenames, versions and download hashes before changing the website. Do not leave an older V5 ZIP beside the canonical mod for players to install together.
4. Coordinate the website upload through **Sarah**: request `SARAH-20261026-004` in `Z:\OpenClaw\Sarah Office\INBOX.txt`. Wait for her acknowledgement and approved deployment window. She should preserve `/t/fs25-beta/` and its Cloudflare Access protection, back up the live site, deploy only the verified public ZIP, and check Home, Install, Fields, Economy, linked assets, TLS, and rollback readiness. The inbox entry alone is not approval or completion.
5. Check public GitHub, itch and website links/versions as a visitor, then use [`RELEASE_POSTS_v5.1.17.md`](RELEASE_POSTS_v5.1.17.md) for community posts. Keep the posts as drafts until the downloads and install instructions genuinely match.

The currently public itch and website listings still show **5.0.3**, and the `v5.1.17` GitHub Release does not yet exist. Do not publish the staged website first: it links to that release tag and tells players to download the 5.1.17 files.
