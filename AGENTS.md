# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

FarmHub is a real-time farm management dashboard companion for Farming Simulator 25 (FS25). It consists of:
- **FS25_FarmDashboard_Mod/** — Lua in-game mod (no build step)
- **FS25_FarmDashboard_App/FS25_FarmDashboard_App/** — Electron + Express + WebSocket app (Node.js 20)
- **FS25_RealisticLivestockRM/** — Separate independent Lua mod (not part of Farm Dashboard)

### Development commands

All commands run from `FS25_FarmDashboard_App/FS25_FarmDashboard_App/`:

| Action | Command |
|--------|---------|
| Install deps | `npm ci` |
| Run tests | `npm test` (Jest, 12 suites, 223 tests) |
| i18n verification | `npm run i18n:verify` |
| Electron pack check | `npm run verify:electron-pack` |
| Run app (dev) | `xvfb-run --auto-servernum npx electron .` |

### Running the Electron app on Linux (headless)

The app is designed for Windows, but runs on Linux with `xvfb-run`:
```
xvfb-run --auto-servernum --server-args="-screen 0 1280x1024x24" npx electron .
```

The Express HTTP + WebSocket server starts on **port 8766** (localhost).
Bus/GPU errors in the logs are cosmetic — the HTTP server works correctly.

Key API endpoints to verify the app is running:
- `GET /api/status` → `{"status":"online"}`
- `GET /api/data` → farm data (or `{"error":"Waiting for data..."}` with no game)
- `GET /` → web dashboard HTML

### Gotchas

- Node.js 20 is required (CI uses `node-version: "20"`). Use `nvm use 20` before running commands.
- No external databases, Docker containers, or cloud services needed — the app is entirely file-based.
- `npm test` runs without Electron (mocks `electron` and `basic-ftp` modules).
- The `data.json` API endpoint returns `"Waiting for data..."` without an active FS25 game — this is expected.
- CI workflow also runs `npm audit --omit=dev` — audit warnings about dev dependencies are non-blocking.
