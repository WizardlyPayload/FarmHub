#!/usr/bin/env node
/**
 * Dev Farm Dashboard on port 8767 (default) with isolated userData.
 * Does not take the single-instance lock — installed demo can keep serving on 8766.
 *
 * Usage (from repo):
 *   cd FS25_FarmDashboard_App && npm run start:dev
 *
 * Optional: FARMDASH_PORT=8768 npm run start:dev
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.join(__dirname, '..', '..', 'FS25_FarmDashboard_App');
const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
const userDataDir = path.join(localAppData, 'fs25-farm-dashboard-dev');
const port = String(process.env.FARMDASH_PORT || '8767').trim();

fs.mkdirSync(userDataDir, { recursive: true });

const electronCli = path.join(projectDir, 'node_modules', 'electron', 'cli.js');
if (!fs.existsSync(electronCli)) {
    console.error('[FarmDash] Missing electron. Run: cd FS25_FarmDashboard_App && npm install');
    process.exit(1);
}

console.log('');
console.log('[FarmDash] Dev instance — does not replace installed app on port 8766');
console.log(`           Port:     ${port}`);
console.log(`           URL:      http://127.0.0.1:${port}/`);
console.log(`           userData: ${userDataDir}`);
console.log('');

const child = spawn(
    process.execPath,
    [electronCli, '.', `--user-data-dir=${userDataDir}`],
    {
        cwd: projectDir,
        env: {
            ...process.env,
            FARMDASH_DEV: '1',
            FARMDASH_PORT: port,
        },
        stdio: 'inherit',
    }
);

child.on('exit', (code, signal) => {
    if (signal) process.exit(1);
    process.exit(code ?? 0);
});
