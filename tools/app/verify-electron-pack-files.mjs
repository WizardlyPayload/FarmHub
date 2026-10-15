#!/usr/bin/env node
/**
 * Ensures every main-process static `require('./…')` module is covered by the classic
 * `package.json` build.files list and by the V5 `electron-builder.rf.yml` files list.
 * Prevents packaged installs from failing with "Cannot find module" when an allowlist omits a file.
 * Also fails when either files list would select a private env / credential file (privatePackageGuard.cjs).
 *
 * Limits: require(variable), import(), and extraResources are not parsed. Relative ./ and ../
 * specs resolve from the importing file. An unresolved spec is a hard error. This checks the
 * file selection, not a built app.asar.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.join(__dirname, '..', '..', 'FS25_FarmDashboard_App');
const { selectedPrivateFiles } = createRequire(import.meta.url)('./privatePackageGuard.cjs');

const REQ_RE = /require\s*\(\s*['"](\.\.?\/[^'"]+)['"]\s*\)/g;

function posixRel(p) {
    return p.split(path.sep).join('/');
}

/** Minimal glob match for electron-builder `files` entries we use. */
function matchesFilesEntry(relPosix, entry) {
    if (entry === relPosix) return true;
    if (entry === '*.js' && /^[^/]+\.js$/.test(relPosix)) return true;
    if (entry.endsWith('/**/*')) {
        const prefix = entry.slice(0, -'/**/*'.length);
        return prefix !== '' && (relPosix === prefix || relPosix.startsWith(prefix + '/'));
    }
    return false;
}

function isCovered(relPosix, filesPatterns) {
    const negated = filesPatterns.some((entry) => entry.startsWith('!') && matchesFilesEntry(relPosix, entry.slice(1)));
    if (negated) return false;
    return filesPatterns.some((entry) => !entry.startsWith('!') && matchesFilesEntry(relPosix, entry));
}

function loadRfFiles(appDir) {
    const rfPath = path.join(appDir, 'electron-builder.rf.yml');
    const text = fs.readFileSync(rfPath, 'utf8');
    const files = [];
    let inFiles = false;
    for (const line of text.split(/\r?\n/)) {
        if (/^files:\s*$/.test(line)) {
            inFiles = true;
            continue;
        }
        if (!inFiles) continue;
        if (/^[A-Za-z]/.test(line)) break;
        const match = line.match(/^\s+-\s+(.+)$/);
        if (match) files.push(match[1].trim().replace(/^["']|["']$/g, ''));
    }
    return files;
}

function resolveRequiredTarget(fromFile, spec) {
    try {
        return createRequire(fromFile).resolve(spec);
    } catch {
        return null;
    }
}

/** package.json that selects the file Node loads for a directory require. */
function directoryPackageMetadata(fromFile, spec) {
    if (path.extname(spec)) return null;
    const dir = path.resolve(path.dirname(fromFile), spec);
    const pkg = path.join(dir, 'package.json');
    if (!fs.existsSync(pkg) || !fs.statSync(pkg).isFile()) return null;
    return pkg;
}

function insideRoot(rootDir, target) {
    const rel = path.relative(rootDir, target);
    return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function collectRequireClosure(startFiles, rootDir) {
    const visited = new Set();
    const unresolved = [];
    const queue = startFiles.slice();
    while (queue.length) {
        const filePath = queue.shift();
        const canon = path.resolve(filePath);
        if (visited.has(canon)) continue;
        if (!fs.existsSync(canon)) {
            unresolved.push(posixRel(path.relative(rootDir, canon)));
            continue;
        }
        visited.add(canon);
        const src = fs.readFileSync(canon, 'utf8');
        let match;
        REQ_RE.lastIndex = 0;
        while ((match = REQ_RE.exec(src)) !== null) {
            const spec = match[1];
            const target = resolveRequiredTarget(canon, spec);
            if (!target || !insideRoot(rootDir, target)) {
                unresolved.push(`${spec} from ${posixRel(path.relative(rootDir, canon))}`);
                continue;
            }
            const metadata = directoryPackageMetadata(canon, spec);
            if (metadata && insideRoot(rootDir, metadata)) queue.push(metadata);
            queue.push(target);
        }
    }
    return { visited, unresolved };
}

function main() {
    const rootFlag = process.argv.indexOf('--root');
    const appDir = rootFlag >= 0 ? path.resolve(process.argv[rootFlag + 1]) : projectDir;
    const productCheck = appDir === path.resolve(projectDir);
    const pkgPath = path.join(appDir, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const files = pkg.build && Array.isArray(pkg.build.files) ? pkg.build.files : null;
    if (!files) {
        console.error('[verify-electron-pack] Missing build.files in package.json');
        process.exit(1);
    }

    const mainJs = path.join(appDir, 'main.js');
    if (!fs.existsSync(mainJs)) {
        console.error('[verify-electron-pack] main.js not found:', mainJs);
        process.exit(1);
    }
    const preloadJs = path.join(appDir, 'preload.js');
    if (productCheck && !fs.existsSync(preloadJs)) {
        console.error('[verify-electron-pack] preload.js not found:', preloadJs);
        process.exit(1);
    }
    const starts = [mainJs];
    if (fs.existsSync(preloadJs)) starts.push(preloadJs);

    const closureResult = collectRequireClosure(starts, appDir);
    if (closureResult.unresolved.length) {
        console.error('[verify-electron-pack] Unresolved relative require:');
        for (const item of closureResult.unresolved) console.error('  -', item);
        process.exit(1);
    }
    const closure = closureResult.visited;
    const missing = [];
    for (const abs of closure) {
        const rel = posixRel(path.relative(appDir, abs));
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
        } else if (productCheck && !isCovered(a, files)) {
            missing.push(a);
        }
    }

    if (productCheck && !isCovered('web/index.html', files)) {
        missing.push('web/**/* (must include web/index.html)');
    }

    if (productCheck && !isCovered('ui-v2/index.html', files)) {
        missing.push('ui-v2/**/* (must include ui-v2/index.html)');
    }

    const uiV2Dir = path.join(appDir, 'ui-v2');
    const uiV2Required = ['index.html', 'setup.html', 'simhub.html'];
    const uiV2Missing = uiV2Required.filter((f) => !fs.existsSync(path.join(uiV2Dir, f)));
    if (productCheck && uiV2Missing.length) {
        console.error('[verify-electron-pack] ui-v2 is required for packaging but incomplete:');
        for (const f of uiV2Missing) console.error('  -', path.join(uiV2Dir, f));
        console.error('Run: npm run build:ui  (from repo root) or  npm run build --prefix "NEW APP"');
        process.exit(1);
    }

    const rfFiles = loadRfFiles(appDir);
    if (!rfFiles.length) {
        console.error('[verify-electron-pack] electron-builder.rf.yml has no files list');
        process.exit(1);
    }
    const v5Missing = [];
    for (const abs of closure) {
        const rel = posixRel(path.relative(appDir, abs));
        if (!isCovered(rel, rfFiles)) v5Missing.push(rel);
    }
    if (productCheck) {
        for (const asset of ['preload.js', 'icon.ico', 'ui-v2/index.html', 'ui-v2/setup.html', 'ui-v2/simhub.html']) {
            if (!isCovered(asset, rfFiles)) v5Missing.push(asset);
        }
    }

    // Names only; node_modules is covered by the post-build app.asar scan in run-electron-builder.mjs.
    let classicPrivate;
    let v5Private;
    try {
        classicPrivate = selectedPrivateFiles(appDir, files);
        v5Private = selectedPrivateFiles(appDir, rfFiles);
    } catch (err) {
        console.error(`[verify-electron-pack] private-file check could not run (treated as unsafe): ${err.message}`);
        process.exit(1);
    }
    if (classicPrivate.length || v5Private.length) {
        if (classicPrivate.length) {
            console.error('[verify-electron-pack] build.files would package private env / credential files:');
            for (const x of classicPrivate) console.error('  -', x);
        }
        if (v5Private.length) {
            console.error('[verify-electron-pack] electron-builder.rf.yml files would package private env / credential files:');
            for (const x of v5Private) console.error('  -', x);
        }
        process.exit(1);
    }

    if (missing.length || v5Missing.length) {
        if (missing.length) {
            console.error('[verify-electron-pack] These paths are required at runtime but not matched by build.files:');
            for (const x of missing) console.error('  -', x);
        }
        if (v5Missing.length) {
            console.error('[verify-electron-pack] These paths are required at runtime but not matched by electron-builder.rf.yml files:');
            for (const x of v5Missing) console.error('  -', x);
        }
        process.exit(1);
    }

    console.log('[verify-electron-pack] OK — main-process modules match classic build.files and V5 electron-builder.rf.yml; no private env / credential files selected');
}

main();
