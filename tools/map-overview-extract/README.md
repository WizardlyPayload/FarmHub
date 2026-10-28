# Farm Dashboard local DLC overview reader

The V5 dashboard uses this helper to read **one overview image** from an FS25
DLC archive already installed on the player's computer. The resulting image
stays in that player's dashboard cache. The app does not ship GIANTS artwork.

The helper uses Paint-a-Farm's MIT-licensed `gar-lib`, pinned in `Cargo.toml`
and `Cargo.lock`. Its license ships with the built helper in
`FS25_FarmDashboard_App/resources/map-overview-extract/`.
It uses that library's cipher and key tables with bounded, seek-based archive
reading; the full DLC is never copied into process memory.

## Rebuild on Windows

Build with Rust 1.98.1's `x86_64-pc-windows-gnu` target and Zig 0.14.1.
`zig-linker.cjs` is the Cargo linker wrapper: it removes only duplicate MinGW
CRT flags that Zig supplies itself. Set `FARMDASH_ZIG_EXE` to the verified Zig
executable and `CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER` to a `.cmd` file
that runs `node zig-linker.cjs %*`, then run:

```
cargo build --release --target x86_64-pc-windows-gnu --locked
```

Copy the executable from `target/x86_64-pc-windows-gnu/release/` into the
app's `resources/map-overview-extract/` folder. Update `PROVENANCE.md` and
`tools/app/verify-v5-bundled-map-extractor.mjs` with the new SHA-256. Test the
extracted Catuaí image against a trusted local extract, and test a clean
dashboard profile before packaging.
