#!/usr/bin/env node
/**
 * V5 packaging preflight: `FS25_FarmDashboard_App/resources/texconv` must hold the pinned
 * DirectXTex texconv.exe (x64) and its MIT LICENSE before electron-builder runs.
 *
 * electron-builder.rf.yml copies that folder into the installer as `resources/texconv`.
 * A placeholder-only folder ships no DDS converter, and the packaged app then silently
 * depends on a machine-wide ImageMagick for map overviews and mod shop images.
 *
 * Usage: node verify-v5-bundled-texconv.mjs [--root <FS25_FarmDashboard_App dir>]
 * Exit 0 when admitted, 1 with an actionable report otherwise. Classic (V4) builds do not run this.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultAppDir = path.join(__dirname, '..', '..', 'FS25_FarmDashboard_App');

/** Updating texconv means replacing the binary, LICENSE and PROVENANCE.md, then this pin. */
export const TEXCONV_RELEASE = Object.freeze({
    tag: 'may2026',
    url: 'https://github.com/microsoft/DirectXTex/releases/download/may2026/texconv.exe',
    licenseUrl: 'https://raw.githubusercontent.com/microsoft/DirectXTex/may2026/LICENSE',
    bytes: 966480,
    sha256: 'dcfdec10244e02cf5037fba089c55fb7e1326b1c8181742d77d15fa5cb5eef06',
});

export const TEXCONV_RESOURCE_DIR = path.join('resources', 'texconv');
export const TEXCONV_EXE = 'texconv.exe';
export const TEXCONV_NOTICES = Object.freeze(['LICENSE']);
const PLACEHOLDERS = new Set(['.gitkeep', '.keep', '.placeholder']);

const IMAGE_FILE_MACHINE_AMD64 = 0x8664;
const IMAGE_FILE_EXECUTABLE_IMAGE = 0x0002;
const IMAGE_FILE_DLL = 0x2000;
const PE32_PLUS_MAGIC = 0x20b;

/** Minimal PE check: MZ stub, PE signature, x64 machine, PE32+ optional header, EXE not DLL. */
export function inspectPeHeader(buf) {
    if (buf.length < 64 || buf[0] !== 0x4d || buf[1] !== 0x5a) {
        return { ok: false, code: 'not-pe', detail: 'missing the MZ executable header' };
    }
    const peOffset = buf.readUInt32LE(0x3c);
    if (peOffset + 26 > buf.length || buf.readUInt32LE(peOffset) !== 0x00004550) {
        return { ok: false, code: 'not-pe', detail: 'missing the PE signature' };
    }
    const machine = buf.readUInt16LE(peOffset + 4);
    if (machine !== IMAGE_FILE_MACHINE_AMD64) {
        return { ok: false, code: 'wrong-machine', detail: `machine 0x${machine.toString(16)} is not x64 (0x8664)` };
    }
    const characteristics = buf.readUInt16LE(peOffset + 22);
    const magic = buf.readUInt16LE(peOffset + 24);
    if (magic !== PE32_PLUS_MAGIC) {
        return { ok: false, code: 'wrong-machine', detail: `optional header magic 0x${magic.toString(16)} is not PE32+` };
    }
    if (!(characteristics & IMAGE_FILE_EXECUTABLE_IMAGE) || (characteristics & IMAGE_FILE_DLL)) {
        return { ok: false, code: 'not-executable', detail: 'PE image is not a standalone executable' };
    }
    return { ok: true, machine: 'x64' };
}

function problem(code, message) {
    return { code, message };
}

/**
 * Inspect `<appDir>/resources/texconv`. Returns `{ ok, problems, exePath, bytes, sha256 }`;
 * `problems` lists every failed requirement so one run shows everything to fix.
 */
export function inspectBundledTexconv(appDir = defaultAppDir, { expected = TEXCONV_RELEASE } = {}) {
    const dir = path.join(appDir, TEXCONV_RESOURCE_DIR);
    const exePath = path.join(dir, TEXCONV_EXE);
    const result = { ok: false, dir, exePath, bytes: null, sha256: null, problems: [] };
    const fail = (code, message) => {
        result.problems.push(problem(code, message));
        return result;
    };

    let dirStat;
    try {
        dirStat = fs.lstatSync(dir);
    } catch {
        return fail('dir-missing', `${dir} does not exist`);
    }
    if (dirStat.isSymbolicLink() || !dirStat.isDirectory()) {
        return fail('dir-not-directory', `${dir} must be a real folder, not a file, junction or symlink`);
    }
    const entries = fs.readdirSync(dir);
    if (!entries.some((name) => !PLACEHOLDERS.has(name.toLowerCase()))) {
        return fail('placeholder-only', `${dir} holds only a placeholder (${entries.join(', ') || 'empty'})`);
    }

    let exeStat;
    try {
        exeStat = fs.lstatSync(exePath);
    } catch {
        fail('exe-missing', `${exePath} does not exist`);
        exeStat = null;
    }
    if (exeStat) {
        if (exeStat.isSymbolicLink() || !exeStat.isFile()) {
            fail('exe-not-file', `${exePath} must be a regular file, not a folder or link`);
        } else if (exeStat.size === 0) {
            fail('exe-empty', `${exePath} is zero bytes`);
        } else {
            const buf = fs.readFileSync(exePath);
            result.bytes = buf.length;
            result.sha256 = crypto.createHash('sha256').update(buf).digest('hex');
            const pe = inspectPeHeader(buf);
            if (!pe.ok) fail(pe.code, `${exePath} is not an x64 Windows executable: ${pe.detail}`);
            if (result.sha256 !== expected.sha256) {
                fail('hash-mismatch', `${exePath} sha256 ${result.sha256} (${buf.length} bytes) is not the pinned DirectXTex ${expected.tag} texconv.exe ${expected.sha256} (${expected.bytes} bytes)`);
            }
        }
    }

    for (const notice of TEXCONV_NOTICES) {
        const noticePath = path.join(dir, notice);
        let ok = false;
        try {
            const st = fs.lstatSync(noticePath);
            ok = st.isFile() && !st.isSymbolicLink() && st.size > 0;
        } catch {
            ok = false;
        }
        if (!ok) fail('notice-missing', `${noticePath} (DirectXTex MIT license notice) is missing or empty`);
    }

    result.ok = result.problems.length === 0;
    return result;
}

export function formatTexconvReport(result, expected = TEXCONV_RELEASE) {
    if (result.ok) {
        return `[verify-v5-texconv] OK — ${result.exePath} is DirectXTex ${expected.tag} texconv.exe x64 (sha256 ${result.sha256})`;
    }
    const lines = ['[verify-v5-texconv] V5 installer blocked: the bundled DDS converter is not ready.'];
    for (const p of result.problems) lines.push(`  - [${p.code}] ${p.message}`);
    lines.push('  Fix:');
    lines.push(`    1. Download ${expected.url}`);
    lines.push(`    2. Confirm sha256 ${expected.sha256} (${expected.bytes} bytes)`);
    lines.push(`    3. Save it as ${result.exePath}`);
    lines.push(`    4. Save ${expected.licenseUrl} as ${path.join(result.dir, 'LICENSE')}`);
    lines.push('  A newer texconv needs PROVENANCE.md and TEXCONV_RELEASE in tools/app/verify-v5-bundled-texconv.mjs updated together.');
    return lines.join('\n');
}

function main() {
    const rootFlag = process.argv.indexOf('--root');
    const appDir = rootFlag >= 0 ? path.resolve(process.argv[rootFlag + 1]) : defaultAppDir;
    const result = inspectBundledTexconv(appDir);
    const report = formatTexconvReport(result);
    if (result.ok) {
        console.log(report);
        return 0;
    }
    console.error(report);
    return 1;
}

function isCliEntry() {
    if (!process.argv[1]) return false;
    try {
        const self = fs.realpathSync.native(fileURLToPath(import.meta.url));
        return fs.realpathSync.native(path.resolve(process.argv[1])).toLowerCase() === self.toLowerCase();
    } catch {
        return false;
    }
}

if (isCliEntry()) {
    process.exitCode = main();
}
