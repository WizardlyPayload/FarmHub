# itch.io — V5 5.0.3

Project: https://wizardlypayload.itch.io/farm-dashobaord-fs25  
Game id: `4754779` · Edit: https://itch.io/game/edit/4754779

Butler lives at `%USERPROFILE%\tools\butler\butler.exe` (login saved locally).

## Channels

Same bytes as GitHub `v5.0.3` / `Documents\FarmDash Release\`.

| Channel | Version | Public download name (itch wraps butler builds) |
|---------|---------|--------------------------------------------------|
| `windows-v5` | 5.0.3 | `farm-dashobaord-fs25-windows-v5.zip` (contains the V5 Setup exe) |
| `mod-v5` | 5.0.0.3 | `farm-dashobaord-fs25-mod-v5.zip` (`modDesc.xml` at zip root — drop in `mods`) |

Keep the existing **classic V4 Setup**. Do not make it the default.

Re-push:

```
butler push --userversion 5.0.3 --assume-yes "%TEMP%\farmdash-itch-v5\windows-v5" wizardlypayload/farm-dashobaord-fs25:windows-v5
butler push --userversion 5.0.0.3 --assume-yes "%TEMP%\farmdash-itch-v5\mod-v5" wizardlypayload/farm-dashobaord-fs25:mod-v5
```

itch.io **strips off-site `<img>`** on the public page. Description shots must use `img.itch.zone` URLs from **Add image**.

## Text still to paste in the itch editor

1. **Description** → `<>` HTML mode → paste `docs/_internal/itch-io-page-description.html` (from the first `<p>` through the footer).
2. **Installation instructions** → `<>` HTML mode → paste `docs/_internal/itch-io-install-instructions.html`.
3. Short description: `FS25 Farm Dashboard V5 — new screens. Classic V4 still available — you do not have to switch.`
4. Uploads: mark `windows-v5` the **default Windows** download.
