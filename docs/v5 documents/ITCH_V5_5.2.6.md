# itch.io — V5 5.2.6

Project: https://wizardlypayload.itch.io/farm-dashobaord-fs25
Game id: `4754779` · Edit: https://itch.io/game/edit/4754779

Butler lives at `%USERPROFILE%\tools\butler\butler.exe` (login saved locally).

## Channels

This is the 5.2.6 publication recipe. Use the flat `Documents\FarmDash Release\` drop, then verify both public channel downloads and update the page copy.

| Channel | Version | Public download name (itch wraps butler builds) |
|---------|---------|--------------------------------------------------|
| `windows-v5` | 5.2.6 | `farm-dashobaord-fs25-windows-v5.zip` (contains the V5 Setup exe) |
| `mod-v5` | 5.1.0.12 | `farm-dashobaord-fs25-mod-v5.zip` (contains the canonical `FS25_FarmDashboard.zip`; extract that file into `mods`) |

Keep the existing **classic V4 Setup**. Do not make it the default.

Re-push:

```
butler push --userversion 5.2.6 --assume-yes "%TEMP%\farmdash-itch-v5-526\windows-v5" wizardlypayload/farm-dashobaord-fs25:windows-v5
butler push --userversion 5.1.0.12 --assume-yes "%TEMP%\farmdash-itch-v5-526\mod-v5" wizardlypayload/farm-dashobaord-fs25:mod-v5
```

itch.io **strips off-site `<img>`** on the public page. Upload fresh `doc-screenshots/current-526/base-overview.png`, `suite-fields.png` and `suite-map.png` with **Add image**, then replace the older fixed `img.itch.zone` image URLs in the candidate description before saving it. Check the public gallery in a logged-out browser; a local file or website-hosted URL is not proof that itch will render the new image.

## Text still to paste in the itch editor

1. **Description** → `<>` HTML mode → paste `docs/_internal/itch-io-page-description-5.2.6.html` (from the first `<p>` through the footer), after replacing its older image URLs with new hosted ones.
2. **Installation instructions** → `<>` HTML mode → paste `docs/_internal/itch-io-install-instructions-5.2.6.html`.
3. Short description: `FS25 Farm Dashboard V5 — new screens. Classic V4 still available — you do not have to switch.`
4. Uploads: mark `windows-v5` the **default Windows** download.
