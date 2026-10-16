const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const asar = require('@electron/asar');

// Every credential fixture below is fake. Nothing reads the real web/locales/.mt-env.local.
const FAKE = 'FAKE_TRANSLATE_KEY=not-a-real-key\n';
const TOOLS = path.resolve(__dirname, '../../tools/app');
const packGuard = path.join(TOOLS, 'verify-electron-pack-files.mjs');
const guardCli = path.join(TOOLS, 'privatePackageGuard.cjs');
const { isPrivatePackagePath, selectedPrivateFiles } = require(guardCli);
const APP_DIR = path.resolve(__dirname, '..');

function tmp(prefix) {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeFixture(dir, files) {
    for (const [name, body] of Object.entries(files)) {
        const target = path.join(dir, name);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, body);
    }
}

function lists(entries) {
    return {
        'package.json': JSON.stringify({ build: { files: entries } }),
        'electron-builder.rf.yml': `files:\n${entries.map((entry) => `  - "${entry}"`).join('\n')}\n`,
    };
}

function runPackGuard(dir) {
    const r = spawnSync(process.execPath, [packGuard, '--root', dir], { encoding: 'utf8' });
    return { status: r.status, out: `${r.stdout}\n${r.stderr}` };
}

function runBuiltGuard(dir) {
    const r = spawnSync(process.execPath, [guardCli, '--built', dir], { encoding: 'utf8' });
    return { status: r.status, out: `${r.stdout}\n${r.stderr}` };
}

function realFilesLists() {
    const pkg = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'package.json'), 'utf8'));
    const rf = [];
    let inFiles = false;
    for (const line of fs.readFileSync(path.join(APP_DIR, 'electron-builder.rf.yml'), 'utf8').split(/\r?\n/)) {
        if (/^files:\s*$/.test(line)) { inFiles = true; continue; }
        if (!inFiles) continue;
        if (/^[A-Za-z]/.test(line)) break;
        const m = line.match(/^\s+-\s+(.+)$/);
        if (m) rf.push(m[1].trim().replace(/^["']|["']$/g, ''));
    }
    return { classic: pkg.build.files, v5: rf };
}

async function builtFixture(appFiles, resourceFiles = {}) {
    const src = tmp('farmhub-asar-src-');
    writeFixture(src, appFiles);
    const unpacked = tmp('farmhub-win-unpacked-');
    fs.mkdirSync(path.join(unpacked, 'resources'), { recursive: true });
    await asar.createPackage(src, path.join(unpacked, 'resources', 'app.asar'));
    writeFixture(path.join(unpacked, 'resources'), resourceFiles);
    return unpacked;
}

const PRIVATE_FIXTURES = {
    'web/locales/.mt-env.local': FAKE,
    'web/locales/.mt-env.local.example': FAKE,
    'web/locales/messages/.mt-cache.json': '{}\n',
    'web/deep/nested/.env': FAKE,
    'web/deep/.env.production': FAKE,
    'ui-v2/locales/.mt-env': FAKE,
    'ui-v2/.envrc': FAKE,
};

describe('private package name rule', () => {
    test.each([
        'web/locales/.mt-env.local', 'web/locales/.mt-env.local.example', 'ui-v2/.mt-env',
        '.env', 'a/b/c/.env', 'web/.env.local', 'node_modules/pkg/.env.production', '.envrc',
        'web/locales/messages/.mt-cache.json', 'gportal-ftp.env', '.cursor/secrets/anything.txt',
        'certs/server.pem', 'certs/server.key', 'sign.pfx', 'sign.p12', 'id_rsa', '.npmrc',
        'client_secret.json', 'aws-credentials.txt',
    ])('flags %s', (p) => {
        expect(isPrivatePackagePath(p)).toBe(true);
    });

    test.each([
        'lanCredentialPolicy.js', 'exportEnvelope.js', 'web/locales/translations.json',
        'web/locales/messages/en.json', 'node_modules/caniuse-lite/data/features/credential-management.js',
        'environment.js', 'ui-v2/index.html', 'resources/texconv/texconv.exe',
    ])('allows %s', (p) => {
        expect(isPrivatePackagePath(p)).toBe(false);
    });
});

describe('pack-file guard private-file selection (fake fixtures)', () => {
    const base = { 'main.js': 'module.exports = {};\n', 'preload.js': 'module.exports = {};\n', 'web/index.html': '<!doctype html>\n' };

    test('a broad web/** include that selects a hidden key file fails', () => {
        const dir = tmp('farmhub-priv-web-');
        writeFixture(dir, Object.assign(lists(['*.js', 'web/**/*']), base, { 'web/locales/.mt-env.local': FAKE }));
        const r = runPackGuard(dir);
        expect(r.status).toBe(1);
        expect(r.out).toContain('web/locales/.mt-env.local');
    });

    test('a nested .env.* file fails', () => {
        const dir = tmp('farmhub-priv-nested-');
        writeFixture(dir, Object.assign(lists(['*.js', 'web/**/*']), base, { 'web/a/b/.env.production': FAKE }));
        const r = runPackGuard(dir);
        expect(r.status).toBe(1);
        expect(r.out).toContain('web/a/b/.env.production');
    });

    test('an exclusion placed before a later include is re-included and fails', () => {
        const dir = tmp('farmhub-priv-order-');
        writeFixture(dir, Object.assign(lists(['*.js', '!**/.mt-env*', 'ui-v2/**/*']), base, { 'ui-v2/locales/.mt-env.local': FAKE }));
        const r = runPackGuard(dir);
        expect(r.status).toBe(1);
        expect(r.out).toContain('ui-v2/locales/.mt-env.local');
    });

    test('trailing any-depth exclusions pass while keeping ordinary files', () => {
        const dir = tmp('farmhub-priv-ok-');
        writeFixture(dir, Object.assign(
            lists(['*.js', 'web/**/*', 'ui-v2/**/*', '!**/.mt-env*', '!**/.mt-cache*', '!**/.env', '!**/.env.*', '!**/.envrc']),
            base,
            PRIVATE_FIXTURES,
            { 'web/locales/translations.json': '{}\n' },
        ));
        expect(runPackGuard(dir).status).toBe(0);
    });
});

describe('real V5 and classic files lists (fake fixtures in a temp tree)', () => {
    const controls = { 'main.js': 'x', 'web/locales/translations.json': '{}', 'web/locales/messages/en.json': '{}', 'ui-v2/index.html': 'x' };

    test.each(['classic', 'v5'])('%s config excludes private files at any depth and keeps controls', (line) => {
        const dir = tmp(`farmhub-real-${line}-`);
        writeFixture(dir, Object.assign({}, controls, PRIVATE_FIXTURES));
        const patterns = realFilesLists()[line];
        expect(selectedPrivateFiles(dir, patterns)).toEqual([]);
        const withoutExclusions = patterns.filter((p) => !(p.startsWith('!') && /mt-env|mt-cache|\.env/.test(p)));
        expect(withoutExclusions.length).toBeLessThan(patterns.length);
        expect(selectedPrivateFiles(dir, withoutExclusions).sort()).toEqual(Object.keys(PRIVATE_FIXTURES).sort());
    });

    test('private exclusions are the last entries of both lists', () => {
        for (const patterns of Object.values(realFilesLists())) {
            const lastInclude = patterns.reduce((n, p, i) => (p.startsWith('!') ? n : i), -1);
            const tail = patterns.slice(lastInclude + 1);
            for (const req of ['!**/.mt-env*', '!**/.mt-cache*', '!**/.env', '!**/.env.*']) expect(tail).toContain(req);
        }
    });
});

describe('built package scan (fake fixtures)', () => {
    test('a key file inside app.asar fails', async () => {
        const dir = await builtFixture({ 'main.js': 'x', 'web/locales/.mt-env.local': FAKE });
        const r = runBuiltGuard(dir);
        expect(r.status).toBe(1);
        expect(r.out).toContain('app.asar:web/locales/.mt-env.local');
    });

    test('a hidden .env in unpacked resources fails', async () => {
        const dir = await builtFixture({ 'main.js': 'x' }, { 'texconv/.env': FAKE });
        const r = runBuiltGuard(dir);
        expect(r.status).toBe(1);
        expect(r.out).toContain('resources/texconv/.env');
    });

    test('a missing app.asar fails closed', () => {
        const dir = tmp('farmhub-no-asar-');
        expect(runBuiltGuard(dir).status).toBe(1);
    });

    test('a clean package passes', async () => {
        const dir = await builtFixture({ 'main.js': 'x', 'lanCredentialPolicy.js': 'x', 'web/locales/translations.json': '{}' }, { 'texconv/texconv.exe': 'x' });
        const r = runBuiltGuard(dir);
        expect(r.status).toBe(0);
        expect(r.out).toContain('OK');
    });
});
