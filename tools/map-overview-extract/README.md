# Farm Dashboard local DLC overview and HUD reader

The V5 dashboard uses this helper to read an overview image or fill-type HUD
textures from FS25 archives already installed on the player's computer. The
result stays in that player's dashboard cache. The app does not ship GIANTS
artwork.

The helper uses Paint-a-Farm's MIT-licensed `gar-lib`, pinned in `Cargo.toml`
and `Cargo.lock`. Its license ships with the built helper in
`FS25_FarmDashboard_App/resources/map-overview-extract/`.
It uses that library's cipher and key tables with bounded, seek-based archive
reading in both modes; the full archive is never copied into process memory.

## Rebuild on Windows

Build with Rust 1.98.1's `x86_64-pc-windows-gnu` target and llvm-mingw
20260908 (MSVCRT). Set `CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER` to the
verified `x86_64-w64-mingw32-gcc.exe` and add the task's `rust-shims` folder
to the native library search path through `RUSTFLAGS`, then run:

```
cargo build --release --target x86_64-pc-windows-gnu --locked
```

Copy the executable from `target/x86_64-pc-windows-gnu/release/` into the
app's `resources/map-overview-extract/` folder. Update `PROVENANCE.md` and
`tools/app/verify-v5-bundled-map-extractor.mjs` with the new SHA-256. Test the
overview and HUD output against trusted local extracts, and test a clean
dashboard profile before packaging.
