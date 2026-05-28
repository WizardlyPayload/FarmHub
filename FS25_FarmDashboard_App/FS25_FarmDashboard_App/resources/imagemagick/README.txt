ImageMagick bundle (optional for maintainers)
=============================================

The NSIS installer runs install-imagemagick.ps1 with -NoPackageManagers (no winget/Chocolatey windows).
It tries, in order: bundled .exe here (if present) → already on PATH → silent download from imagemagick.org.

To avoid any network step during setup, place ONE official Windows x64 ImageMagick installer .exe here before "npm run dist"
(e.g. ImageMagick-*-Q16*-HDRI-x64-dll.exe). It installs with /VERYSILENT and no console.

Maintainers can still run the script manually without -NoPackageManagers to allow winget/Chocolatey (hidden where possible).
