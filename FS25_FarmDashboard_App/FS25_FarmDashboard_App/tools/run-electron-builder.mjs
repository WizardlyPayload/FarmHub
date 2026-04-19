#!/usr/bin/env node
/**
 * Default pack/dist: writes to %LOCALAPPDATA%\fs25-farm-dashboard-electron-out
 * (outside the git/Cursor workspace). Building under FarmHub/... caused Cursor and
 * Windows Search to index app.asar immediately and lock the folder.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.join(__dirname, '..');

const mode = process.argv[2] === 'dist' ? 'dist' : 'pack';
const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
const outDir = path.join(localAppData, 'fs25-farm-dashboard-electron-out');
fs.mkdirSync(outDir, { recursive: true });

console.error('');
console.error('[FarmDash] Build output directory (outside project — avoids IDE locks on app.asar):');
console.error(`           ${outDir}`);
console.error('');

const cli = path.join(projectDir, 'node_modules', 'electron-builder', 'cli.js');
if (!fs.existsSync(cli)) {
    console.error('[FarmDash] Missing electron-builder. Run: npm install');
    process.exit(1);
}

const args =
    mode === 'pack'
        ? [cli, '--dir', `--config.directories.output=${outDir}`]
        : [cli, '--win', `--config.directories.output=${outDir}`];

const result = spawnSync(process.execPath, args, {
    cwd: projectDir,
    stdio: 'inherit',
    env: process.env,
});

const code = result.status === null ? 1 : result.status;
if (code === 0) {
    console.error('');
    if (mode === 'dist') {
        console.error('[FarmDash] Installer: look for "FS25 Farm Dashboard Setup *.exe" in the path above.');
    } else {
        console.error('[FarmDash] Unpacked app: win-unpacked under the path above.');
    }
    console.error('');
}
process.exit(code);
