#!/usr/bin/env node
/**
 * Ensures every main-process `require('./…')` module is covered by `package.json` → `build.files`.
 * Prevents packaged installs from failing with "Cannot find module" when the allowlist omits a file.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.join(__dirname, '..', '..', 'FS25_FarmDashboard_App', 'FS25_FarmDashboard_App');

const REQ_RE = /require\s*\(\s*['"]\.\/([^'"]+)['"]\s*\)/g;

function posixRel(p) {
    return p.split(path.sep).join('/');
}

/** Minimal glob match for electron-builder `files` entries we use. */
function matchesFilesEntry(relPosix, entry) {
    if (entry === relPosix) return true;
    if (entry === '*.js' && /^[^/]+\.js$/.test(relPosix)) return true;
    if (entry === 'web/**/*' && relPosix.startsWith('web/')) return true;
    if (entry === 'node_modules/**/*' && relPosix.startsWith('node_modules/')) return true;
    return false;
}

function isCovered(relPosix, filesPatterns) {
    return filesPatterns.some((p) => matchesFilesEntry(relPosix, p));
}

function resolveRequiredTarget(rootDir, spec) {
    const base = spec.replace(/\.js$/i, '');
    const withJs = path.join(rootDir, `${base}.js`);
    if (fs.existsSync(withJs)) return withJs;
    const exact = path.join(rootDir, spec);
    if (fs.existsSync(exact)) return exact;
    return null;
}

function collectRequireClosure(startFile) {
    const rootDir = path.dirname(startFile);
    const visited = new Set();
    const queue = [startFile];
    while (queue.length) {
        const filePath = queue.shift();
        const canon = path.resolve(filePath);
        if (visited.has(canon)) continue;
        visited.add(canon);
        const src = fs.readFileSync(filePath, 'utf8');
        let m;
        REQ_RE.lastIndex = 0;
        while ((m = REQ_RE.exec(src)) !== null) {
            const spec = m[1];
            const target = resolveRequiredTarget(rootDir, spec);
            if (target && target.startsWith(rootDir)) {
                queue.push(target);
            }
        }
    }
    return visited;
}

function main() {
    const pkgPath = path.join(projectDir, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const files = pkg.build && Array.isArray(pkg.build.files) ? pkg.build.files : null;
    if (!files) {
        console.error('[verify-electron-pack] Missing build.files in package.json');
        process.exit(1);
    }

    const mainJs = path.join(projectDir, 'main.js');
    if (!fs.existsSync(mainJs)) {
        console.error('[verify-electron-pack] main.js not found:', mainJs);
        process.exit(1);
    }

    const closure = collectRequireClosure(mainJs);
    const missing = [];
    for (const abs of closure) {
        const rel = posixRel(path.relative(projectDir, abs));
        if (!isCovered(rel, files)) {
            missing.push(rel);
        }
    }

    const staticAssets = [
        'setup.html',
        'preload.js',
        'icon.ico',
    ];
    for (const a of staticAssets) {
        if (!fs.existsSync(path.join(projectDir, a))) {
            console.warn(`[verify-electron-pack] Warning: ${a} not on disk (optional for dev-only?)`);
        } else if (!isCovered(a, files)) {
            missing.push(a);
        }
    }

    if (!isCovered('web/index.html', files)) {
        missing.push('web/**/* (must include web/index.html)');
    }

    if (missing.length) {
        console.error('[verify-electron-pack] These paths are required at runtime but not matched by build.files:');
        for (const x of missing) console.error('  -', x);
        console.error('\nUpdate package.json → build.files (see tools/app/verify-electron-pack-files.mjs).');
        process.exit(1);
    }

    console.log('[verify-electron-pack] OK — main-process modules and static assets match build.files');
}

main();
