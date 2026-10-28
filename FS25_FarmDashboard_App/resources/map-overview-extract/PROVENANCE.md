# Local DLC map overview reader

`farmdash-map-overview-extract.exe` was built from this repository's
`tools/map-overview-extract/` source. It uses Paint-a-Farm's MIT-licensed
[`gar-lib`](https://github.com/Paint-a-Farm/gar-lib) at commit
`7575d5f890aeb2198077646241f88cd73f013ab6`. The required upstream
license is alongside this file as `GAR-LIB-LICENSE.txt`.

The helper seeks to the archive's file table and then reads only an
`overview.dds` or `overview.png` entry from a locally installed Farming
Simulator 25 `.dlc` archive. It does not load the multi-gigabyte archive into
memory. It writes that texture to the
player's own Farm Dashboard cache for display on that machine. The installer
does **not** contain any GIANTS DLC artwork.

Build used Rust 1.98.1's `x86_64-pc-windows-gnu` target and Zig 0.14.1 as
linker. SHA-256 of this x64 helper:
`843068EA664C76244A7DFE1A385FAF40E86527CF3B1C0BD3CB0ABDDF6FD33733`.

When replacing the helper, rebuild from the pinned source, verify a local DLC
overview against a known extract, and update the hash here and in the V5
packaging guard.
