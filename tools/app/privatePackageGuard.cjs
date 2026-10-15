'use strict';
/**
 * Fail-closed guard against shipping private env / credential files in the Electron package.
 *
 * - isPrivatePackagePath(rel): name-only rule (never opens files).
 * - selectedPrivateFiles(appDir, patterns): walks appDir (not node_modules) and applies electron-builder's own
 *   FileMatcher to a `files` list, returning private paths the config would pack.
 * - scanBuiltApp(unpackedDir): lists app.asar entry names plus every unpacked resource name.
 *
 * CLI: node privatePackageGuard.cjs --built <win-unpacked>   (exit 1 on any hit or if the scan cannot run)
 */
const fs = require('fs');
const path = require('path');

const APP_DIR = path.join(__dirname, '..', '..', 'FS25_FarmDashboard_App');
const CODE_EXT = /\.(c|m)?js$|\.d\.ts$|\.ts$|\.map$/i;
const PRIVATE_BASENAME = [
    /^\.mt-env/i,
    /^\.mt-cache/i,
    /^\.env$/i,
    /^\.env\./i,
    /^\.envrc$/i,
    /\.env$/i,
    /^\.npmrc$/i,
    /^\.netrc$/i,
    /^id_(rsa|dsa|ecdsa|ed25519)$/i,
    /\.(pem|key|pfx|p12)$/i,
];
const PRIVATE_SEGMENT = /(^|\/)(\.cursor\/secrets|secrets)\//i;
const CREDENTIAL_WORD = /(secret|credential)/i;
const SKIP_TOP = /^(node_modules|electron-pack-out[^/]*|\.git)$/i;

function isPrivatePackagePath(rel) {
    const p = String(rel).replace(/\\/g, '/').replace(/^\/+/, '');
    const base = p.slice(p.lastIndexOf('/') + 1);
    if (PRIVATE_BASENAME.some((re) => re.test(base))) return true;
    if (PRIVATE_SEGMENT.test(p)) return true;
    return CREDENTIAL_WORD.test(base) && !CODE_EXT.test(base);
}

function loadFromApp(request) {
    return require(require.resolve(request, { paths: [APP_DIR] }));
}

function walkNames(root, rel = '', out = [], skipTop = null) {
    for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (!rel && skipTop && skipTop.test(e.name)) continue;
        if (e.isSymbolicLink()) throw new Error(`link inside scanned tree: ${r}`);
        if (e.isDirectory()) walkNames(root, r, out, skipTop);
        else out.push(r);
    }
    return out;
}

function selectedPrivateFiles(appDir, patterns) {
    const { FileMatcher } = loadFromApp('app-builder-lib/out/fileMatcher.js');
    const filter = new FileMatcher(appDir, '/out', (s) => s, patterns).createFilter();
    const fileStat = { isDirectory: () => false };
    return walkNames(appDir, '', [], SKIP_TOP)
        .filter(isPrivatePackagePath)
        .filter((rel) => filter(path.join(appDir, rel), fileStat));
}

function scanBuiltApp(unpackedDir) {
    const asarPath = path.join(unpackedDir, 'resources', 'app.asar');
    if (!fs.existsSync(asarPath)) throw new Error(`app.asar not found: ${asarPath}`);
    const asar = loadFromApp('@electron/asar');
    const asarEntries = asar.listPackage(asarPath).map((e) => e.replace(/\\/g, '/').replace(/^\/+/, ''));
    const unpackedEntries = walkNames(unpackedDir);
    return {
        asarEntries: asarEntries.length,
        unpackedEntries: unpackedEntries.length,
        hits: [
            ...asarEntries.filter(isPrivatePackagePath).map((p) => `app.asar:${p}`),
            ...unpackedEntries.filter(isPrivatePackagePath),
        ],
    };
}

module.exports = { isPrivatePackagePath, selectedPrivateFiles, scanBuiltApp };

if (require.main === module) {
    const i = process.argv.indexOf('--built');
    const dir = i >= 0 ? process.argv[i + 1] : null;
    if (!dir) {
        console.error('[private-package-guard] usage: --built <win-unpacked>');
        process.exit(1);
    }
    let result;
    try {
        result = scanBuiltApp(path.resolve(dir));
    } catch (err) {
        console.error(`[private-package-guard] scan failed (treated as unsafe): ${err.message}`);
        process.exit(1);
    }
    if (result.hits.length) {
        console.error('[private-package-guard] Private env / credential files are in the built package. Do NOT distribute this build:');
        for (const hit of result.hits) console.error('  -', hit);
        process.exit(1);
    }
    console.log(`[private-package-guard] OK — ${result.asarEntries} app.asar entries and ${result.unpackedEntries} unpacked files contain no private env / credential names`);
}
