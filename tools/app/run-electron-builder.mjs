#!/usr/bin/env node
/**
 * Default pack/dist: writes to Documents/FarmDash Final Output
 * (outside the git/Cursor workspace). Override with FARMDASH_BUILD_OUTPUT.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getFarmDashBuildOutputDir } from './farmdash-build-output.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Electron app root (`FS25_FarmDashboard_App/`). Script lives in `tools/app/`. */
const projectDir = path.join(__dirname, '..', '..', 'FS25_FarmDashboard_App');

const mode = process.argv[2] === 'dist' ? 'dist' : 'pack';
const outDir = getFarmDashBuildOutputDir();
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
