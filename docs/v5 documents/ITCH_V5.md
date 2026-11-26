# itch.io — Farm Dashboard V5 release channel

Project: https://wizardlypayload.itch.io/farm-dashobaord-fs25  
Game id: `4754779` · Edit: https://itch.io/game/edit/4754779

Butler lives at `%USERPROFILE%\tools\butler\butler.exe` (login saved locally). The next candidate is app **5.2.155** with the canonical mod **5.1.0.140**. The current public pair remains 5.2.7/5.1.0.12 until both channels are pushed and downloaded back. Publication requires the exact-head CI, normal-set Ally smoke, final manifest and release decision in [the handoff](RELEASE_DAY_v5.2.155.md).

## Prepared private channel inputs

The local staging root is `%LOCALAPPDATA%\Temp\FarmDashItchRelease-5.2.155`:

- `windows-v5\FS25-Farm-Dashboard-V5-Setup-5.2.155.exe` — SHA-256 `795732D6C4F98A070AC0FF0CF271D58E66C459BB00D89A93CDDA428C2E9964B6`.
- `mod-v5\FS25_FarmDashboard.zip` — SHA-256 `2402E851019C699429D42635DAE814DD2FFA16E1D1CD6958A9AB84B567D2ECC8`.
- `mod-v5\INSTALL.txt` — SHA-256 `AF07A5B1003F4371027537425E9404A99A85963082CAFA14F0D1F4C79A9AEE90`. It explains extracting the **inner ZIP** into FS25's `mods` folder. Keep the text file beside the ZIP so itch preserves the canonical mod file in its download wrapper.

After all gates pass, push exactly these two directories with `--userversion 5.2.155` on `windows-v5` and `--userversion 5.1.0.140` on `mod-v5`. Rehash the directories immediately before the push. Preserve the separate Classic V4 download and updater; keep `windows-v5` the default Windows download. Download both public channel builds through Butler and verify their inner file names, sizes and SHA-256 before updating page copy.

The page description and installation instructions are separate reviewed content. itch may strip off-site `<img>` tags; use existing `img.itch.zone` gallery images. Do not publish candidate labels or links until the matching downloads and GitHub tag work.
