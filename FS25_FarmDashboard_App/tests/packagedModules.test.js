const fs = require('fs');
const path = require('path');

// Guard against the 4.1.x crash class: a new module is require()d by main.js
// but never added to electron-builder's "files" allowlist, so the packaged app.asar
// is missing it and the app dies on launch ("Cannot find module './corsPolicy'").
//
// This walks static require('./…') edges from the entry points and asserts every
// resolved local file is selected by build.files (classic) AND electron-builder.rf.yml (V5).
//
// Limits, not checked here:
// - require(variable), import(), and fs reads of extraResources
// - a built app.asar (the package gate must open the archive)
// - V5's intentional exclusions of classic web/index.html and web/simhub.html are applied
//   as negations, so a required file that only matches an excluded path still fails

const APP_DIR = path.resolve(__dirname, '..');
const pkg = require(path.join(APP_DIR, 'package.json'));
const filesAllowlist = (pkg.build && pkg.build.files) || [];

function loadRfFilesAllowlist() {
    const rfPath = path.join(APP_DIR, 'electron-builder.rf.yml');
    if (!fs.existsSync(rfPath)) return null;
    // Minimal line parse — avoid adding a yaml dependency for this guard.
    const text = fs.readFileSync(rfPath, 'utf8');
    const files = [];
    let inFiles = false;
    for (const line of text.split(/\r?\n/)) {
        if (/^files:\s*$/.test(line)) {
            inFiles = true;
            continue;
        }
        if (inFiles) {
            if (/^[a-zA-Z]/.test(line)) break;
            const m = line.match(/^\s+-\s+(.+)$/);
            if (m) files.push(m[1].trim().replace(/^["']|["']$/g, ''));
        }
    }
    return files;
}

const rfFilesAllowlist = loadRfFilesAllowlist();

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

function patternMatches(relPath, pattern) {
    if (pattern === relPath) return true;
    const idx = pattern.indexOf('**');
    if (idx === -1) return false;
    const prefix = pattern.slice(0, idx).replace(/\/$/, '');
    return prefix !== '' && (relPath === prefix || relPath.startsWith(prefix + '/'));
}

/** Positive entries select the file. A later-style ! exclusion removes it. */
function isAllowlisted(relPath, allowlist) {
    const negated = allowlist.some((pattern) => pattern.startsWith('!') && patternMatches(relPath, pattern.slice(1)));
    if (negated) return false;
    return allowlist.some((pattern) => !pattern.startsWith('!') && patternMatches(relPath, pattern));
}

function collectReachableModules() {
    const seen = new Set();
    const unresolved = [];
    const queue = [...ENTRY_POINTS];
    while (queue.length) {
        const fileRel = queue.shift();
        if (seen.has(fileRel)) continue;
        seen.add(fileRel);
        const onDisk = path.join(APP_DIR, fileRel);
        if (!fs.existsSync(onDisk)) continue;
        for (const rel of localRequires(fileRel)) {
            const resolved = resolveLocalModule(fileRel, rel);
            if (!resolved) {
                unresolved.push(`${fileRel} -> ${rel}`);
                continue;
            }
            if (!seen.has(resolved)) queue.push(resolved);
        }
    }
    return { modules: [...seen], unresolved };
}

function literalGhosts(allowlist) {
    return allowlist
        .filter((f) => !f.startsWith('!') && /\.(js|cjs|json|html|ico)$/.test(f) && !f.includes('*'))
        .filter((f) => !fs.existsSync(path.join(APP_DIR, f)));
}

describe('packaged module allowlist (build.files)', () => {
    test('every static local require resolves to a file', () => {
        expect(collectReachableModules().unresolved).toEqual([]);
    });

    test('every local module reachable from entry points is shipped (classic package.json)', () => {
        const missing = collectReachableModules().modules.filter((f) => !isAllowlisted(f, filesAllowlist));
        expect(missing).toEqual([]);
    });

    test('every local module reachable from entry points is shipped (V5 electron-builder.rf.yml)', () => {
        expect(rfFilesAllowlist).not.toBeNull();
        const missing = collectReachableModules().modules.filter((f) => !isAllowlisted(f, rfFilesAllowlist));
        expect(missing).toEqual([]);
    });

    test('every literal build.files entry that looks like a root module exists on disk', () => {
        expect(literalGhosts(filesAllowlist)).toEqual([]);
    });

    test('every literal V5 files entry that looks like a root module exists on disk', () => {
        expect(rfFilesAllowlist).not.toBeNull();
        expect(literalGhosts(rfFilesAllowlist)).toEqual([]);
    });
});

const { spawnSync } = require('child_process');
const os = require('os');

const packGuard = path.resolve(__dirname, '../../tools/app/verify-electron-pack-files.mjs');

function writeFixture(dir, files) {
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, body] of Object.entries(files)) {
        const target = path.join(dir, name);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, body);
    }
}

function runGuard(dir) {
    return spawnSync(process.execPath, [packGuard, '--root', dir], { encoding: 'utf8' });
}

function lists(entries) {
    return {
        'package.json': JSON.stringify({ build: { files: entries } }),
        'electron-builder.rf.yml': `files:\n${entries.map((entry) => `  - ${entry}`).join('\n')}\n`,
    };
}

describe('production package guard fixtures', () => {
    test('a complete local selection passes', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'farmhub-pack-good-'));
        writeFixture(dir, Object.assign(lists(['*.js', 'sub/**/*', 'pkg/**/*']), {
            'main.js': "require('./kept.js');\nrequire('./mod');\nrequire('./pkg');\n",
            'preload.js': "require('./kept.js');\n",
            'kept.js': 'module.exports = {};\n',
            'mod.js': 'module.exports = {};\n',
            'pkg/index.js': 'module.exports = {};\n',
            'sub/unused.js': 'module.exports = {};\n',
        }));
        const result = runGuard(dir);
        expect(result.status).toBe(0);
    });

    test('a missing direct require fails', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'farmhub-pack-miss-'));
        writeFixture(dir, Object.assign(lists(['*.js']), {
            'main.js': "require('./missing.js');\n",
        }));
        expect(runGuard(dir).status).toBe(1);
    });

    test('an omitted nested dependency fails', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'farmhub-pack-nest-'));
        writeFixture(dir, Object.assign(lists(['main.js', 'sub/first.js']), {
            'main.js': "require('./sub/first.js');\n",
            'sub/first.js': "require('./second.js');\n",
            'sub/second.js': 'module.exports = {};\n',
        }));
        expect(runGuard(dir).status).toBe(1);
    });

    test('a preload-only dependency must be selected', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'farmhub-pack-preload-'));
        writeFixture(dir, Object.assign(lists(['main.js', 'preload.js', 'kept.js']), {
            'main.js': "require('./kept.js');\n",
            'kept.js': 'module.exports = {};\n',
            'preload.js': "require('./secret.js');\n",
            'secret.js': 'module.exports = {};\n',
        }));
        expect(runGuard(dir).status).toBe(1);
    });

    test('an explicit exclusion fails even when a broad pattern matches', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'farmhub-pack-exclude-'));
        writeFixture(dir, Object.assign(lists(['*.js', '!hidden.js']), {
            'main.js': "require('./hidden.js');\n",
            'hidden.js': 'module.exports = {};\n',
        }));
        expect(runGuard(dir).status).toBe(1);
    });

    test('a directory main omitted from the allowlist fails even if index.js is listed', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'farmhub-pack-dmain-'));
        writeFixture(dir, Object.assign(lists(['main.js', 'pkg/package.json', 'pkg/index.js']), {
            'main.js': "require('./pkg');\n",
            'pkg/package.json': JSON.stringify({ main: 'entry.js' }),
            'pkg/index.js': 'module.exports = {};\n',
            'pkg/entry.js': 'module.exports = {};\n',
        }));
        const result = runGuard(dir);
        expect(result.status).toBe(1);
        expect(`${result.stdout}\n${result.stderr}`).toContain('pkg/entry.js');
    });

    test('a selected directory main and its package.json pass', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'farmhub-pack-dmain-ok-'));
        writeFixture(dir, Object.assign(lists(['main.js', 'pkg/package.json', 'pkg/entry.js']), {
            'main.js': "require('./pkg');\n",
            'pkg/package.json': JSON.stringify({ main: 'entry.js' }),
            'pkg/index.js': 'module.exports = {};\n',
            'pkg/entry.js': 'module.exports = {};\n',
        }));
        expect(runGuard(dir).status).toBe(0);
    });

    test('omitted directory package.json fails when it selects the runtime file', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'farmhub-pack-dmeta-'));
        writeFixture(dir, Object.assign(lists(['main.js', 'pkg/entry.js']), {
            'main.js': "require('./pkg');\n",
            'pkg/package.json': JSON.stringify({ main: 'entry.js' }),
            'pkg/entry.js': 'module.exports = {};\n',
        }));
        const result = runGuard(dir);
        expect(result.status).toBe(1);
        expect(`${result.stdout}\n${result.stderr}`).toContain('pkg/package.json');
    });
});
