# texconv.exe provenance

`texconv.exe` in this folder is Microsoft DirectXTex's texture conversion tool, shipped unmodified.
The V5 installer bundles it via `electron-builder.rf.yml` (`resources/texconv` to `texconv`).
The map overview resolver and the mod shop image export use it when ImageMagick is not available.

| Field | Value |
|---|---|
| Project | [microsoft/DirectXTex](https://github.com/microsoft/DirectXTex) |
| Release | [`may2026`](https://github.com/microsoft/DirectXTex/releases/tag/may2026) (May 7, 2026; published 2026-05-08T21:01:12Z) |
| Tag object | `cc0e4071273d84ce7160fd4759d5bd726077adb3` (`refs/tags/may2026`) |
| Asset | `texconv.exe` (x64; the release also carries a separate `texconv_arm64.exe`) |
| Download URL | https://github.com/microsoft/DirectXTex/releases/download/may2026/texconv.exe |
| Size | 966480 bytes |
| SHA-256 | `dcfdec10244e02cf5037fba089c55fb7e1326b1c8181742d77d15fa5cb5eef06` |
| GitHub release asset digest | `sha256:dcfdec10244e02cf5037fba089c55fb7e1326b1c8181742d77d15fa5cb5eef06` (matches) |
| File version | 2026.5.8.1, "Texture conversion command-line tool", Microsoft Corp |
| Authenticode | Valid; signer `CN=Microsoft 3rd Party Application Component`, issuer `CN=Microsoft Code Signing PCA 2024` |
| Machine | PE32+ x64 (0x8664) |
| Retrieved | 2026-09-30 |

## License

MIT, Copyright (c) Microsoft Corporation. The full text is in `LICENSE` next to this file, taken verbatim from
https://raw.githubusercontent.com/microsoft/DirectXTex/may2026/LICENSE. The MIT notice must ship with the binary.

## Updating

Replace `texconv.exe`, `LICENSE` and this file together. Then update `TEXCONV_RELEASE` in
`tools/app/verify-v5-bundled-texconv.mjs`. V5 packaging refuses any binary that does not match that pin.
