# Local DLC map overview reader

`farmdash-map-overview-extract.exe` was built from this repository's
`tools/map-overview-extract/` source. It uses Paint-a-Farm's MIT-licensed
[`gar-lib`](https://github.com/Paint-a-Farm/gar-lib) at commit
`7575d5f890aeb2198077646241f88cd73f013ab6`. The required upstream
license is alongside this file as `GAR-LIB-LICENSE.txt`.

The default mode reads only an `overview.dds` or `overview.png` entry from a
locally installed `.dlc` archive. `--hud` reads only `menu/hud/fillTypes`
textures from a locally installed `.gar` or `.dlc` archive. It uses the archive
file table and writes textures to the player's Farm Dashboard cache; it does
not load the multi-gigabyte archive into memory. The installer does **not**
contain any GIANTS artwork.

Build used Rust 1.98.1's `x86_64-pc-windows-gnu` target and llvm-mingw
20260908 (MSVCRT). SHA-256 of this x64 helper:
`2575753CD23FEE5AA3E587B703A58AFD54687D4A99A6E3C767A6CD3AAC44FEEE`.

The `--hud` mode reads the encrypted file table and only the selected HUD
entries from the archive. The previous bundled helper used `GarArchive::open`
for this mode, which read the entire multi-gigabyte archive before selecting
entries. The default overview mode was already seek-based and is unchanged.

When replacing the helper, rebuild from the pinned source, verify a local DLC
overview against a known extract, and update the hash here and in the V5
packaging guard.
