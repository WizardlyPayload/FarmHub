# Farm Dashboard V5 5.2.0 — release record

**Release date:** 26 October 2026. The Windows app is **5.2.0**. Its matching game mod remains **5.1.0.9** because the mod code and ZIP did not change from the independently tested 5.1.18 candidate. Use the two files from the same V5 release and keep the mod filename `FS25_FarmDashboard.zip`.

## Frozen local files

The flat drop is `C:\Users\Graham\Documents\FarmDash Release\`.

| File | Size | SHA-256 |
| --- | ---: | --- |
| `FS25-Farm-Dashboard-V5-Setup-5.2.0.exe` | 383,894,315 bytes | `CAC1DD31169EBE385B2B79A8A55D8FFE0D63B82033DF146677170108594C82E2` |
| `FS25_FarmDashboard.zip` | 459,044 bytes | `5934EFFB19FC0A72466573589DE4E76DADCC1AAA7E1FCA685B94A94D73527378` |
| `farmdashboard-website-5.2.0-upload.zip` | 208,772,223 bytes | `A02C8AE2289D34701D84E016BB8A7FF22C6F4DEA2948873FB8F6B41206BB81BA` |

`latest-rf.yml` names the 5.2.0 Setup, its exact size and SHA-512 base64 `WQODczFXbQuCS549E+CA8IPyUV3DxvvONPrw68lrbacBromz6ko0P0ZPhy/I0o2Cos2FIKJjh3nBErDbIzb0CA==`. The prior 5.1.18 feed was preserved as `latest-rf-5.1.18.yml`. V4 uses a separate `latest.yml` and must not receive this V5 feed.

## Acceptance evidence and limits

- **Frozen precursor:** 5.1.18 passed CI and PC/Ally Windows install, native Installed apps row, Keep uninstall/reinstall, preserved profile and game manifests, working UI and packaged backgrounds. The unchanged mod 5.1.0.9 passed PC/Ally/dedicated multiplayer generation checks and a heavy-save collector timing run. The exact precursor evidence is in [the 5.1.18 handoff](RELEASE_DAY_v5.1.18.md).
- **5.2.0 change:** only the V5 packaging version and repository release version changed in executable source. The game mod was not repackaged. The packaging guard proved fresh V5 UI assets in `app.asar`, no private environment/credential files, and the V5-only update channel.
- **Exact PC 5.2.0 installer:** silent upgrade exited 0. Windows registered one native V5 5.2.0 row with a real uninstaller. The existing private `config.json` matched its verified pre-upgrade backup byte for byte (SHA-256 `E49300B3521DB456F12AAA4A4E7D8BA39BAF0F8A75CB62B4CB9EC5E2003889FC`). The installed `app.asar` reports 5.2.0. The app launched, retained the Witcombe Park Farm source and displayed Fields content. `/api/status` reported `appVersion: 5.2.0`; five packaged section photos returned HTTP 200 `image/png` with the same byte sizes as the accepted 5.1.18 build.
- **Exact 5.2.0 limits:** an Ally install, a Full uninstall, and a new two-client multiplayer game were not repeated after the version-only app rebuild. The 5.1.18 Ally/PC and unchanged mod evidence applies to the same functionality, but is not labelled as an exact 5.2.0 run. The 5.2.0 PC install used silent mode; the interactive installer path was exercised on 5.1.18.
- **Website:** the original 5.2.0 ZIP was the verified 126-entry 5.1.18 public package with 159 app-version/tag text replacements across 15 files. Sarah's `SARAH-20261026-006` deployment preserved private beta paths. A two-file Cloudflare cache fix was then applied to `index.html` and `js/site-shell.js`; the final flat ZIP above contains those exact live bytes. The original upload is retained under `rollback/farmdashboard-website-5.2.0-pre-cachefix-upload.zip` with SHA-256 `1C3E130AC33591FA7FAADD4C53E3847515A0B8C3A948832FB70E49A343B9D581`. All other entry contents are identical and the final ZIP passes CRC validation. No private `/t/` paths or installer files are in either package.

## Publication sequence and recorded results

1. Commit and push the 5.2.0 version, current help and this record to `main`; confirm GitHub CI on that revision.
2. Publish GitHub Release `v5.2.0` with the exact Setup, canonical mod ZIP and `latest-rf.yml`; verify the public assets and their hashes.
3. Update itch V5 Windows and mod downloads. Check the displayed version, canonical ZIP name and an independent download before sending visitors there.
4. Tell Sarah GitHub and itch are live against request `SARAH-20261026-006`. Sarah backs up, deploys and verifies only the public website files. An inbox entry alone is not her ACK or completion.
5. Check the public website, download links and V5 update feed as a visitor. Publish community posts only after those links work.

The app is unsigned. Windows may show an Unknown publisher or SmartScreen warning. Do not ask users to disable Windows security.

## Publication evidence — 26 October 2026

- `main` reached `debea62ccd8b80f0118f5a135bb5b58c3cff3025`; both release-day GitHub Actions runs completed successfully. Public GitHub Release [v5.2.0](https://github.com/WizardlyPayload/FarmHub/releases/tag/v5.2.0) is non-draft and marked latest. GitHub's asset digests match the Setup and mod SHA-256 values above, and `latest-rf.yml` is attached.
- The itch page [Farm Dashboard FS25](https://wizardlypayload.itch.io/farm-dashobaord-fs25) now shows App 5.2.0 and Mod 5.1.0.9, with `windows-v5` 5.2.0 and `mod-v5` 5.1.0.9 downloads. A Butler fetch of each live channel yielded the exact Setup and canonical inner `FS25_FarmDashboard.zip` SHA-256 hashes above. The itch mod channel includes a short `INSTALL-MOD.txt` alongside the unchanged inner ZIP; install the inner ZIP without unpacking it. Legacy V4 downloads remain separate.
- Sarah recorded `RESULT SARAH-20261026-006` at 21:53 UTC. She backed up 119 previous public files, deployed and hash-checked all 126 release files, then corrected the Home-page demo loader to use `?v=5.2.0` for `site-config.js` and `demo-live.js`, with `index.html` loading `site-shell.js?v=5.2.0.1`. My independent HTTPS readback matched both patched files byte for byte. Home, Install, Fields, Economy and Map served 5.2.0; sampled current PNGs returned HTTP 200. Sarah confirmed the protected `/t/fs25-beta/` path still redirects to Cloudflare Access and its private file manifest is unchanged. Her rollback archive/script are retained, although an actual rollback was not exercised. Older bare Cloudflare asset URLs may remain cached until expiry; live page references use versioned URLs.
- The itch gallery still contains older V5 screenshots. The current screenshots are in the website package and V5 documentation. The browser's extension denied the required file chooser upload permission during this release, so no gallery update was claimed.
