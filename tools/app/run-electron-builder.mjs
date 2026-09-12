#!/usr/bin/env node
/**
 * Default pack/dist:
 *   V4 — Documents/FarmDash Final Output (public latest.yml)
 *   V5 — Documents/FarmDash Release (flat zip + V5 Setup.exe)
 * Override with FARMDASH_BUILD_OUTPUT.
 *
 * Product lines:
 *   classic / v4 (default) — latest.yml / FS25-Farm-Dashboard-Setup-*.exe
 *   v5 (FARMDASH_PRODUCT_LINE=v5 or --v5) — latest-rf.yml / FS25-Farm-Dashboard-V5-Setup-*.exe
 *   --rf remains an alias for V5 so older scripts keep working.
 *
 * HARD RULE: V5 builds must never publish as classic latest.yml.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getFarmDashBuildOutputDir, getFarmDashV5BuildOutputDir } from './farmdash-build-output.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Electron app root (`FS25_FarmDashboard_App/`). Script lives in `tools/app/`. */
const projectDir = path.join(__dirname, '..', '..', 'FS25_FarmDashboard_App');

const mode = process.argv[2] === 'dist' ? 'dist' : 'pack';
const argvHasV5 =
    process.argv.includes('--v5') ||
    process.argv.includes('--product=v5') ||
    process.argv.includes('--rf') ||
    process.argv.includes('--product=rf');
const productLine = String(process.env.FARMDASH_PRODUCT_LINE || (argvHasV5 ? 'v5' : 'classic')).toLowerCase();
const isV5 =
    argvHasV5 ||
    productLine === 'v5' ||
    productLine === 'rf' ||
    productLine === 'realistic-farming';

const outDir = isV5 ? getFarmDashV5BuildOutputDir() : getFarmDashBuildOutputDir();
fs.mkdirSync(outDir, { recursive: true });

if (isV5) {
    // Stale channel name from older configs. Never delete a sibling V4 latest.yml
    // outside this V5 drop folder.
    const staleRf = path.join(outDir, 'rf.yml');
    if (fs.existsSync(staleRf)) {
        fs.unlinkSync(staleRf);
        console.error('[FarmDash V5] Removed stale rf.yml from output before build.');
    }
    const staleClassic = path.join(outDir, 'latest.yml');
    if (fs.existsSync(staleClassic)) {
        fs.unlinkSync(staleClassic);
        console.error('[FarmDash V5] Removed leftover latest.yml from V5 output before build.');
    }
}
const copyUi = spawnSync(process.execPath, [path.join(__dirname, 'copy-ui-v2.mjs')], {
    cwd: projectDir,
    stdio: 'inherit',
    env: process.env,
});
if (copyUi.status !== 0) {
    console.error('[FarmDash] ui-v2 copy failed — build NEW APP first: npm run build:ui');
    process.exit(copyUi.status === null ? 1 : copyUi.status);
}

console.error('');
console.error(`[FarmDash] Product line: ${isV5 ? 'V5 (5.x rebuild)' : 'V4 (classic 4.x)'}`);
console.error('[FarmDash] Build output directory (outside project — avoids IDE locks on app.asar):');
console.error(`           ${outDir}`);
if (isV5) {
    console.error('[FarmDash] V5 channel: latest-rf.yml only — V4 latest.yml must not be written here.');
}
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

if (isV5) {
    const rfConfig = path.join(projectDir, 'electron-builder.rf.yml');
    if (!fs.existsSync(rfConfig)) {
        console.error('[FarmDash V5] Missing electron-builder.rf.yml');
        process.exit(1);
    }
    args.push('--config', rfConfig);
}

const result = spawnSync(process.execPath, args, {
    cwd: projectDir,
    stdio: 'inherit',
    env: process.env,
});

const signingConfigured =
    process.env.CSC_LINK ||
    process.env.WIN_CSC_LINK ||
    process.env.CSC_LINK_BASE64;
if (mode === 'dist') {
    console.error('');
    if (signingConfigured) {
        console.error('[FarmDash] Code signing: CSC_LINK / WIN_CSC_LINK detected — electron-builder will sign the installer.');
    } else {
        console.error('[FarmDash] Code signing: NOT configured (no CSC_LINK / WIN_CSC_LINK).');
        console.error('           Windows SmartScreen will show "Unknown publisher" until you sign with an Authenticode cert.');
        console.error('           See tools/app/WINDOWS_CODE_SIGNING.md');
    }
    console.error('');
}

let code = result.status === null ? 1 : result.status;

if (code === 0 && isV5) {
    const guard = spawnSync(
        process.execPath,
        [path.join(__dirname, 'assert-rf-update-channel.mjs'), outDir],
        { cwd: projectDir, stdio: 'inherit', env: process.env },
    );
    code = guard.status === null ? 1 : guard.status;
}

if (code === 0 && isV5 && mode === 'dist') {
    const unpacked = path.join(outDir, 'win-unpacked');
    if (fs.existsSync(unpacked)) {
        fs.rmSync(unpacked, { recursive: true, force: true });
        console.error('[FarmDash V5] Removed win-unpacked from the drop folder.');
    }
}

if (code === 0) {
    console.error('');
    if (mode === 'dist') {
        if (isV5) {
            console.error('[FarmDash] V5 installer: look for "FS25-Farm-Dashboard-V5-Setup-*.exe" and latest-rf.yml in the path above.');
            console.error('[FarmDash] Do NOT attach this build to a V4 latest.yml GitHub Release.');
        } else {
            console.error('[FarmDash] V4 installer: look for "FS25-Farm-Dashboard-Setup-*.exe" in the path above.');
        }
    } else {
        console.error('[FarmDash] Unpacked app: win-unpacked under the path above.');
    }
    console.error('');
}
process.exit(code);
