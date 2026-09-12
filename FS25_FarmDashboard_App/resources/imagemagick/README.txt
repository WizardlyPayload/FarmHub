ImageMagick bundle (optional for maintainers)
=============================================

The NSIS installer runs install-imagemagick.ps1 with -NoPackageManagers (no winget/Chocolatey windows).
It checks existing installations FIRST. Existing external copies are not adopted.
If no copy exists, it uses the pinned bundle or the pinned official download.
Both paths verify SHA256 before execution. Downloads and child-process waits are bounded.

To avoid any network step during setup, place ONE official Windows x64 ImageMagick installer .exe here before "npm run dist"
(currently ImageMagick-7.1.2-24-Q16-HDRI-x64-dll.exe).
When updating the vendor binary, update ApprovedImageMagickName and
ApprovedImageMagickHash in build/install-imagemagick.ps1 from a verified vendor artifact.
The verified SHA256 for this bundle is:
5665E6B0C27591AB3103E757D509EEF85508133D0312390D6EAEBF78BDBB4C8A

No package-manager fallbacks are run.
Current-user setup still installs ImageMagick: it opens the normal Windows
permission prompt (UAC) for the vendor installer. Silent setup does not prompt.
Full uninstall removes only the exact owned copy, and retains it while another
Dashboard edition is installed. Keep mode retains it for reinstall.
Failed or permission-blocked Full cleanup stops Dashboard removal so it can be retried.
