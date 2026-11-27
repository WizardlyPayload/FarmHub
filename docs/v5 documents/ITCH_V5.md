# itch.io — Farm Dashboard V5 release channel

Project: https://wizardlypayload.itch.io/farm-dashobaord-fs25  
Game id: `4754779` · Edit: https://itch.io/game/edit/4754779

Butler lives at `%USERPROFILE%\tools\butler\butler.exe` (login saved locally). The corrected public pair is app **5.3.0** with the canonical mod **5.2.0.0**. It supersedes the briefly published 5.2.155/5.1.0.140 numbering. Before the correction is declared complete, push both corrected channels and download their bytes back. The feature scope remains the bounded scope documented in [the GitHub release notes](GITHUB_RELEASE_v5.3.0.md).

## Prepared private channel inputs

The private corrected artifacts are staged at `Z:\Graham\agent-comms\farmhub-companion-acceptance\release-candidate-5.3.0-5.2.0.0`; the prepared itch channel directories are under `%LOCALAPPDATA%\Temp\FarmDashItchRelease-5.3.0-Correction1`. The previous 5.2.155/5.1.0.140 inputs are superseded and must not be pushed again.

- `windows-v5\FS25-Farm-Dashboard-V5-Setup-5.3.0.exe` — SHA-256 `2AD9B99588DC49407CF489394F96E6BA88B59AE8E8E8733ACAF64FDF9B6AED54`.
- `mod-v5\FS25_FarmDashboard.zip` — SHA-256 `338E276C118E3A7A0B55108120CF43511ADCC89028AF3ABF9804B4DC896C2439`.
- `mod-v5\INSTALL.txt` — SHA-256 `DFA05DFD952A62A1DC855BDBDA34493DB4BA2146BE0537439FD1887E78DAA07D`. It explains extracting the **inner ZIP** into FS25's `mods` folder. Keep the text file beside the ZIP so itch preserves the canonical mod file in its download wrapper.

After all gates pass, push exactly these two directories with `--userversion 5.3.0` on `windows-v5` and `--userversion 5.2.0.0` on `mod-v5`. Rehash the directories immediately before the push. Preserve the separate Classic V4 download and updater; keep `windows-v5` the default Windows download. Download both public channel builds through Butler and verify their inner file names, sizes and SHA-256 before updating page copy.

The page description and installation instructions are separate reviewed content. itch may strip off-site `<img>` tags; use existing `img.itch.zone` gallery images. Do not publish candidate labels or links until the matching downloads and GitHub tag work.
