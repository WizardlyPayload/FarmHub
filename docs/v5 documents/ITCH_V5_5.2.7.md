# itch.io — V5 5.2.7

Project: https://wizardlypayload.itch.io/farm-dashobaord-fs25
Game id: `4754779` · Edit: https://itch.io/game/edit/4754779

Butler lives at `%USERPROFILE%\tools\butler\butler.exe` (login saved locally).

## Channels

5.2.7 is live on both V5 channels. The public page copy and install instructions were updated and read back on 29 October 2026. The classic V4 files remain separate.

| Channel | Version | Public download name (itch wraps butler builds) |
|---------|---------|--------------------------------------------------|
| `windows-v5` | 5.2.7 | `farm-dashobaord-fs25-windows-v5.zip` (contains the V5 Setup exe) |
| `mod-v5` | 5.1.0.12 | `farm-dashobaord-fs25-mod-v5.zip` (contains the canonical `FS25_FarmDashboard.zip`; extract that file into `mods`) |

Keep the existing **classic V4 Setup**. Do not make it the default.

For a future re-push, stage the exact installer in `windows-v5` and stage the canonical `FS25_FarmDashboard.zip` **alongside `INSTALL.txt`** in `mod-v5`. Butler treats a directory containing only one ZIP as a container and unpacks its contents; the second file makes Butler preserve the inner game ZIP. This was verified by fetching build `2243621` and hashing its inner ZIP.

Example (only after verifying the staged hashes):

```
butler push --userversion 5.2.7 --assume-yes "%TEMP%\farmdash-publish-527\windows-v5" wizardlypayload/farm-dashobaord-fs25:windows-v5
butler push --userversion 5.1.0.12 --assume-yes "%TEMP%\farmdash-publish-527\mod-v5" wizardlypayload/farm-dashobaord-fs25:mod-v5
```

The public screenshot gallery now contains four current full-screen 5.2.7 Catuaí captures from `doc-screenshots/current-527`: Save overview, Orchards, Productions, and Fleet map, in that order. The public page was read back after saving and showed four gallery image links. The old embedded V5 figures had malformed markup in itch's rich-text editor, so the description was replaced from the clean `docs/_internal/itch-io-page-description-5.2.7.html` source and saved while HTML mode remained open. It now describes the gallery and links to the current README and manual without embedding older images. The pre-repair public HTML is backed up in the flat release folder as `ITCH-DESCRIPTION-BEFORE-GALLERY-5.2.7.html`; the public proof screenshot is `ITCH-GALLERY-PUBLIC-5.2.7.png`.

## Published page copy

1. **Description:** prepared 5.2.7 HTML was saved in the itch editor and verified on the public page. Its current screenshot gallery and text match the 5.2.7 release; the earlier embedded image blocks were removed.
2. **Installation instructions:** prepared 5.2.7 HTML was saved and read back. The public text links to GitHub v5.2.7 and names the exact setup and mod versions.
3. **Short description:** `FS25 Farm Dashboard V5 5.2.7 — live fields, orchards, fleet, animals and supported DLC and companion mod data.`
4. **Uploads:** `windows-v5` build `2243560` is app 5.2.7 and `mod-v5` build `2243621` is mod 5.1.0.12. Butler readback hashes matched the local installer and canonical inner mod ZIP. The public page displays the V5 Windows download first. The older V4 files were not changed.
