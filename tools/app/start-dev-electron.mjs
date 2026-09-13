#!/usr/bin/env node
/**
 * Second Farm Dashboard instance (new UI + repo code) while the installed
 * release keeps serving the website/demo on :8766.
 *
 * - Port:           8767 (override FARMDASH_PORT)
 * - userData:       %LOCALAPPDATA%\fs25-farm-dashboard-dev  (does not touch installed prefs)
 * - UI:             NEW APP / ui-v2 via FARMDASH_UI_V2=1 (unless --legacy-ui)
 * - Data:           same modSettings/FTP paths as the installed app when --sync-config
 *
 * Usage (from repo root or FS25_FarmDashboard_App):
 *   npm run start:dev
 *   npm run start:dev -- --sync-config
 *   npm run dev:new-ui          (root alias: sync-config + UI v2)
 *
 * Optional: FARMDASH_PORT=8768 npm run start:dev
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { unionServersById } = require(path.join(__dirname, '..', '..', 'FS25_FarmDashboard_App', 'setupConfigMerge.cjs'));
const projectDir = path.join(__dirname, '..', '..', 'FS25_FarmDashboard_App');
const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
const roamingAppData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const userDataDir = path.join(localAppData, 'fs25-farm-dashboard-dev');
const installedConfigPath = path.join(roamingAppData, 'fs25-farm-dashboard', 'config.json');
const devConfigPath = path.join(userDataDir, 'config.json');
const port = String(process.env.FARMDASH_PORT || '8767').trim();

const argv = process.argv.slice(2);
const syncConfig = argv.includes('--sync-config') || argv.includes('--sync');
const legacyUi = argv.includes('--legacy-ui');
const forceUiV2 =
    !legacyUi &&
    (process.env.FARMDASH_UI_V2 == null || String(process.env.FARMDASH_UI_V2).trim() === '');

fs.mkdirSync(userDataDir, { recursive: true });

/**
 * Copy servers/saves (and related store `config`) from the installed Electron
 * preferences so this instance watches the same data.json / FTP slots.
 * Does not overwrite LAN secrets unless missing; never changes installed userData.
 */
function syncInstalledConfig() {
    if (!fs.existsSync(installedConfigPath)) {
        console.warn('[FarmDash] No installed config at', installedConfigPath);
        console.warn('           Configure servers in the installed app first, then re-run with --sync-config.');
        return false;
    }
    let installed;
    try {
        installed = JSON.parse(fs.readFileSync(installedConfigPath, 'utf8'));
    } catch (e) {
        console.warn('[FarmDash] Could not read installed config:', e && e.message ? e.message : e);
        return false;
    }
    if (!installed || typeof installed !== 'object' || !installed.config) {
        console.warn('[FarmDash] Installed config has no servers block to sync.');
        return false;
    }

    let dev = {};
    if (fs.existsSync(devConfigPath)) {
        try {
            dev = JSON.parse(fs.readFileSync(devConfigPath, 'utf8'));
        } catch (_) {
            dev = {};
        }
    }

    const installedCfg = installed.config && typeof installed.config === 'object' ? installed.config : {};
    const devCfg = dev.config && typeof dev.config === 'object' ? dev.config : {};
    const next = {
        ...dev,
        // Union by save id so NEW APP / dev saves are not wiped by --sync-config.
        config: {
            ...installedCfg,
            ...devCfg,
            servers: unionServersById(installedCfg.servers, devCfg.servers),
            isConfigured: Boolean(devCfg.isConfigured || installedCfg.isConfigured),
        },
        locale: installed.locale != null ? installed.locale : dev.locale,
    };
    // Leave uiPreferences mostly alone indev except force useNewUi false in store —
    // UI v2 is driven by env FARMDASH_UI_V2 so installed Appearance toggle stays untouched.
    if (!next.uiPreferences || typeof next.uiPreferences !== 'object') {
        next.uiPreferences = {};
    }
    // Do not set useNewUi:true in the store (would confuse future soft-cutover).
    if (next.uiPreferences.useNewUi === true) {
        next.uiPreferences = { ...next.uiPreferences, useNewUi: false };
    }

    fs.writeFileSync(devConfigPath, JSON.stringify(next, null, 2), 'utf8');
    const n = Array.isArray(next.config.servers) ? next.config.servers.length : 0;
    console.log(`[FarmDash] Merged ${n} server(s) (installed ∪ local) → ${devConfigPath}`);
    return true;
}

if (syncConfig) {
    syncInstalledConfig();
}

const electronCli = path.join(projectDir, 'node_modules', 'electron', 'cli.js');
if (!fs.existsSync(electronCli)) {
    console.error('[FarmDash] Missing electron. Run: cd FS25_FarmDashboard_App && npm install');
    process.exit(1);
}

const env = {
    ...process.env,
    FARMDASH_DEV: '1',
    FARMDASH_PORT: port,
};
if (forceUiV2) {
    env.FARMDASH_UI_V2 = '1';
}
if (legacyUi) {
    env.FARMDASH_UI_V2 = '0';
}

console.log('');
console.log('[FarmDash] Dev instance — installed release can stay on :8766 for the website demo');
console.log(`           Port:     ${port}`);
console.log(`           URL:      http://127.0.0.1:${port}/`);
console.log(`           userData: ${userDataDir}`);
console.log(
    `           UI:       ${env.FARMDASH_UI_V2 === '1' ? 'NEW APP (FARMDASH_UI_V2=1)' : 'classic web/ (FARMDASH_UI_V2=0)'}`
);
if (!syncConfig) {
    console.log('           Tip:      npm run dev:new-ui  (or start:dev -- --sync-config)');
    console.log('                     to copy servers/saves from the installed app so both read the same files.');
}
console.log('');

const child = spawn(
    process.execPath,
    [electronCli, '.', `--user-data-dir=${userDataDir}`],
    {
        cwd: projectDir,
        env,
        stdio: 'inherit',
    }
);

child.on('exit', (code, signal) => {
    if (signal) process.exit(1);
    process.exit(code ?? 0);
});
