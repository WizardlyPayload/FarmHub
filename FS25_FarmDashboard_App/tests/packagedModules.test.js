const fs = require('fs');
const path = require('path');

// Guard against the 4.1.x crash class: a new root module is require()d by main.js
// but never added to electron-builder's "files" allowlist, so the packaged app.asar
// is missing it and the app dies on launch ("Cannot find module './corsPolicy'").
//
// This walks the local require() graph from the entry points and asserts every
// reachable root-level module is listed in build.files.

const APP_DIR = path.resolve(__dirname, '..');
const pkg = require(path.join(APP_DIR, 'package.json'));
const filesAllowlist = (pkg.build && pkg.build.files) || [];

/** Entry points that get loaded outside the bundler at runtime. */
const ENTRY_POINTS = ['main.js', 'preload.js'];

/** Resolve a './name' require (no sub-directories) to the on-disk filename in APP_DIR. */
function resolveLocalModule(baseFile, relRequest) {
    const dir = path.dirname(path.join(APP_DIR, baseFile));
    for (const ext of ['', '.js', '.cjs', '.json']) {
        const candidate = path.normalize(path.join(dir, relRequest + ext));
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
            return path.relative(APP_DIR, candidate).split(path.sep).join('/');
        }
    }
    return null;
}

function localRequires(fileRel) {
    const full = path.join(APP_DIR, fileRel);
    const src = fs.readFileSync(full, 'utf8');
    const re = /require\(\s*['"](\.\/[^'"]+)['"]\s*\)/g;
    const out = [];
    let m;
    while ((m = re.exec(src)) !== null) out.push(m[1]);
    return out;
}

/** Is this relative file path covered by the allowlist (literal entry or a glob like web/**)? */
function isAllowlisted(relPath) {
    if (filesAllowlist.includes(relPath)) return true;
    // Cover directory globs (e.g. "web/**/*", "node_modules/**/*").
    return filesAllowlist.some((pattern) => {
        const idx = pattern.indexOf('**');
        if (idx === -1) return false;
        const prefix = pattern.slice(0, idx).replace(/\/$/, '');
        return prefix !== '' && (relPath === prefix || relPath.startsWith(prefix + '/'));
    });
}

describe('packaged module allowlist (build.files)', () => {
    test('every local module reachable from entry points is shipped', () => {
        const seen = new Set();
        const queue = [...ENTRY_POINTS];
        const missing = [];

        while (queue.length) {
            const fileRel = queue.shift();
            if (seen.has(fileRel)) continue;
            seen.add(fileRel);

            if (!isAllowlisted(fileRel)) {
                missing.push(fileRel);
                // Still try to walk it if it exists on disk, to surface the full set.
            }

            const onDisk = path.join(APP_DIR, fileRel);
            if (!fs.existsSync(onDisk)) continue;

            for (const rel of localRequires(fileRel)) {
                if (rel.slice(2).includes('/')) continue; // only root-level ./name modules
                const resolved = resolveLocalModule(fileRel, rel);
                if (resolved && !seen.has(resolved)) queue.push(resolved);
            }
        }

        expect(missing).toEqual([]);
    });

    test('every literal build.files entry that looks like a root module exists on disk', () => {
        const ghosts = filesAllowlist
            .filter((f) => /\.(js|cjs|json|html|ico)$/.test(f) && !f.includes('*'))
            .filter((f) => !fs.existsSync(path.join(APP_DIR, f)));
        expect(ghosts).toEqual([]);
    });
});
