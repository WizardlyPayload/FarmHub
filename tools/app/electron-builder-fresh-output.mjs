#!/usr/bin/env node
/**
 * Runs electron-builder with a unique folder under the system temp directory.
 * Use when ../electron-pack-out (or old release/) is locked and you still need a build.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.join(__dirname, '..', '..', 'FS25_FarmDashboard_App', 'FS25_FarmDashboard_App');

const mode = process.argv[2] === 'pack' ? 'pack' : 'dist';
const outDir = path.join(os.tmpdir(), `farmdash-electron-out-${Date.now()}`);
fs.mkdirSync(outDir, { recursive: true });

// stderr so it stays visible even when piping
console.error('');
console.error(`[FarmDash] Build output directory (unique each run):`);
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
if (code === 0 && mode === 'dist') {
    console.error('');
    console.error('[FarmDash] Look for the NSIS installer under the path above (Setup .exe).');
    console.error('');
}
process.exit(code);
