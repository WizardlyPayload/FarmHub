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
 * V5 also refuses to build without the pinned resources/texconv/texconv.exe (verify-v5-bundled-texconv.mjs).
 * Every build fails if win-unpacked (app.asar names or resources) holds private env / credential files
 * (privatePackageGuard.cjs); verify-electron-pack-files.mjs checks the file selection before packing.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { farmDashReleaseDir, getFarmDashBuildOutputDir, getFarmDashV5BuildOutputDir } from './farmdash-build-output.mjs';
import { formatTexconvReport, inspectBundledTexconv } from './verify-v5-bundled-texconv.mjs';
import { buildFreshV5Ui, verifyV5UiAsar, assertDistinctV5Installer, assertUiSourceStillCurrent } from './v5-ui-package-proof.mjs';
import { createV5ReleaseStage, cleanupV5ReleaseStage, promoteV5Artifacts } from './v5-release-stage.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Electron app root (`FS25_FarmDashboard_App/`). Script lives in `tools/app/`. */
const projectDir = path.join(__dirname, '..', '..', 'FS25_FarmDashboard_App');
const repoRoot = path.join(__dirname, '..', '..');
const v5UiDir = path.join(repoRoot, 'NEW APP');

function v5UiBuildInvocation(npmCli, stageDir) {
    return {
        command: process.execPath,
        args: [npmCli, 'run', 'build', '--prefix', v5UiDir, '--', '--outDir', stageDir, '--emptyOutDir'],
        cwd: repoRoot,
    };
}

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

if (process.argv.includes('--inspect-v5-ui-build-command')) {
    const stageFlag = process.argv.indexOf('--stage');
    if (!isV5 || stageFlag < 0 || !process.argv[stageFlag + 1] || !process.env.npm_execpath) {
        console.error('[FarmDash V5] Inspection requires --v5, --stage <isolated path>, and npm_execpath');
        process.exit(1);
    }
    console.log(JSON.stringify(v5UiBuildInvocation(process.env.npm_execpath, process.argv[stageFlag + 1])));
    process.exit(0);
}

const outDir = isV5 ? getFarmDashV5BuildOutputDir() : getFarmDashBuildOutputDir();
if (isV5) {
    const expected = path.resolve(farmDashReleaseDir());
    const resolved = path.resolve(outDir);
    if (resolved.toLowerCase() !== expected.toLowerCase()) {
        console.error(`[FarmDash V5] Output ${resolved} is not the flat FarmDash Release directory ${expected}.`);
        process.exit(1);
    }
    if (fs.existsSync(resolved)) {
        const outStat = fs.lstatSync(resolved);
        if (outStat.isSymbolicLink()) {
            console.error(`[FarmDash V5] Refusing to build through a junction or symlink: ${resolved}`);
            process.exit(1);
        }
    }
    // Checked before anything touches the output folder or ui-v2.
    const texconv = inspectBundledTexconv(projectDir);
    if (!texconv.ok) {
        console.error(formatTexconvReport(texconv));
        console.error('[FarmDash V5] Stopped before electron-builder; no installer was built.');
        process.exit(1);
    }
    console.error(formatTexconvReport(texconv));
}
if (!isV5) fs.mkdirSync(outDir, { recursive: true });

let v5UiProof = null;
let v5Version = null;
if (isV5) {
    const rfConfig = path.join(projectDir, 'electron-builder.rf.yml');
    if (!fs.existsSync(rfConfig)) {
        console.error('[FarmDash V5] Missing electron-builder.rf.yml');
        process.exit(1);
    }
    try {
        v5Version = assertDistinctV5Installer(rfConfig, outDir);
        const npmCli = process.env.npm_execpath;
        if (!npmCli || !fs.existsSync(npmCli)) {
            throw new Error('[FarmDash V5] Run through npm run dist:v5 or npm run pack:v5; npm CLI unavailable');
        }
        v5UiProof = buildFreshV5Ui({
            uiDir: v5UiDir,
            destination: path.join(projectDir, 'ui-v2'),
            runBuild: (stageDir) => {
                const invocation = v5UiBuildInvocation(npmCli, stageDir);
                const build = spawnSync(invocation.command, invocation.args, {
                        cwd: invocation.cwd,
                        stdio: 'inherit',
                        env: { ...process.env, FARMDASH_V5_STAGING_UI_BUILD: '1' },
                    });
                return build.status === null ? 1 : build.status;
            },
        });
        console.error(`[FarmDash V5] Fresh NEW APP source digest: ${v5UiProof.sourceDigest}`);
    } catch (error) {
        console.error(error.message);
        console.error('[FarmDash V5] Stopped before electron-builder; stale ui-v2 was not packed.');
        process.exit(1);
    }
} else {
    const copyUi = spawnSync(process.execPath, [path.join(__dirname, 'copy-ui-v2.mjs')], {
        cwd: projectDir,
        stdio: 'inherit',
        env: process.env,
    });
    if (copyUi.status !== 0) {
        console.error('[FarmDash] ui-v2 copy failed — build NEW APP first: npm run build:ui');
        process.exit(copyUi.status === null ? 1 : copyUi.status);
    }
}
const packGuard = spawnSync(process.execPath, [path.join(__dirname, 'verify-electron-pack-files.mjs')], {
    cwd: projectDir,
    stdio: 'inherit',
    env: process.env,
});
if (packGuard.status !== 0) {
    console.error('[FarmDash] package file selection failed before electron-builder');
    process.exit(packGuard.status === null ? 1 : packGuard.status);
}

let v5OutputStage = null;
if (isV5) {
    try {
        assertUiSourceStillCurrent(v5UiDir, v5UiProof);
        v5OutputStage = createV5ReleaseStage(outDir);
        process.on('exit', () => {
            try { cleanupV5ReleaseStage(v5OutputStage, outDir); }
            catch (error) { console.error(`[FarmDash V5] Private stage cleanup failed: ${error.message}`); }
        });
    } catch (error) {
        console.error(`[FarmDash V5] Stopped before electron-builder: ${error.message}`);
        process.exit(1);
    }
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

const builderOutDir = isV5 ? v5OutputStage : outDir;
const args =
    mode === 'pack'
        ? [cli, '--dir', '--publish', 'never', `--config.directories.output=${builderOutDir}`]
        : [cli, '--win', '--publish', 'never', `--config.directories.output=${builderOutDir}`];

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

if (code === 0) {
    const privateGuard = spawnSync(
        process.execPath,
        [path.join(__dirname, 'privatePackageGuard.cjs'), '--built', path.join(builderOutDir, 'win-unpacked')],
        { cwd: projectDir, stdio: 'inherit', env: process.env },
    );
    if (privateGuard.status !== 0) {
        console.error('[FarmDash] Built package contains private env / credential files — treat every artifact from this run as unsafe.');
        process.exit(1);
    }
}

if (code === 0 && isV5) {
    try {
        const asarPath = path.join(builderOutDir, 'win-unpacked', 'resources', 'app.asar');
        verifyV5UiAsar(asarPath, v5UiProof, projectDir);
        assertUiSourceStillCurrent(v5UiDir, v5UiProof);
        console.error('[FarmDash V5] app.asar UI entry and assets match the fresh NEW APP source/build manifest.');
    } catch (error) {
        console.error(`[FarmDash V5] Packaged UI proof failed: ${error.message}`);
        console.error('[FarmDash V5] Treat every artifact from this run as unsafe; do not publish or install.');
        code = 1;
    }
}

if (code === 0 && isV5) {
    const guard = spawnSync(
        process.execPath,
        [path.join(__dirname, 'assert-rf-update-channel.mjs'), builderOutDir],
        { cwd: projectDir, stdio: 'inherit', env: process.env },
    );
    code = guard.status === null ? 1 : guard.status;
}

if (code === 0 && isV5) {
    try {
        const promotion = promoteV5Artifacts({ stageDir: v5OutputStage, releaseDir: outDir, mode, version: v5Version });
        console.error(`[FarmDash V5] Verified artifacts promoted flat: ${promotion.promoted.join(', ')}`);
        if (mode === 'dist' && !promotion.updateMetadataPromoted) {
            console.error('[FarmDash V5] Existing latest-rf.yml preserved; candidate packaging did not change the live update feed.');
        }
    } catch (error) {
        console.error(`[FarmDash V5] Promotion failed: ${error.message}`);
        console.error('[FarmDash V5] Private staged output will be discarded; existing release artifacts are preserved.');
        code = 1;
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
