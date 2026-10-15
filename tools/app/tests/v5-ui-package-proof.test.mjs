import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { copyUiDirectory } from '../copy-ui-v2.mjs';
import {
  assertDistinctV5Installer, buildFreshV5Ui, fingerprintUiSource,
  verifyV5UiAsar, verifyV5UiDirectory,
} from '../v5-ui-package-proof.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, '../../../FS25_FarmDashboard_App');
const appRequire = createRequire(path.join(appDir, 'package.json'));
const { createPackage } = appRequire('@electron/asar');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'farmdash-v5-proof-test-'));
  t.after(() => {
    const resolved = path.resolve(root);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.match(path.basename(resolved), /^farmdash-v5-proof-test-/);
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  const uiDir = path.join(root, 'NEW APP');
  const destination = path.join(root, 'app', 'ui-v2');
  fs.mkdirSync(path.join(uiDir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(uiDir, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(uiDir, 'public', 'locales'), { recursive: true });
  const catalog = path.join(root, 'FS25_FarmDashboard_App', 'web', 'locales', 'translations.json');
  fs.mkdirSync(path.dirname(catalog), { recursive: true });
  const sourceLocales = path.join(appDir, 'web', 'locales');
  fs.copyFileSync(path.join(sourceLocales, 'build-translations.mjs'), path.join(path.dirname(catalog), 'build-translations.mjs'));
  fs.copyFileSync(path.join(sourceLocales, 'verify-i18n.mjs'), path.join(path.dirname(catalog), 'verify-i18n.mjs'));
  const messages = path.join(path.dirname(catalog), 'messages');
  fs.mkdirSync(messages);
  const langs = [
    'en', 'de', 'fr', 'es', 'it', 'pl', 'nl', 'pt', 'sv', 'da', 'fi', 'cs',
    'el', 'hu', 'ro', 'bg', 'hr', 'sk', 'sl', 'et', 'lv', 'lt', 'ga', 'mt', 'is', 'nb', 'uk',
  ];
  for (const lang of langs) {
    fs.writeFileSync(path.join(messages, `${lang}.json`), JSON.stringify({
      'nav.dataSource': lang === 'en' ? 'Data source' : `${lang} source label`,
    }));
  }
  const generated = spawnSync(process.execPath, [path.join(path.dirname(catalog), 'build-translations.mjs')], { encoding: 'utf8' });
  assert.equal(generated.status, 0, generated.stderr);
  fs.copyFileSync(catalog, path.join(uiDir, 'public', 'locales', 'translations.json'));
  fs.writeFileSync(path.join(uiDir, 'public', 'brand.svg'), '<svg/>\n');
  fs.writeFileSync(path.join(uiDir, 'scripts', 'copy-locales.mjs'), 'export const copy = true;\n');
  fs.writeFileSync(path.join(uiDir, 'src', 'main.tsx'), 'export const selected = "saved-id";\n');
  for (const entry of ['index.html', 'setup.html', 'simhub.html']) {
    fs.writeFileSync(path.join(uiDir, entry), '<script type="module" src="/src/main.tsx"></script>\n');
  }
  fs.writeFileSync(path.join(uiDir, 'vite.config.ts'), 'export default {};\n');
  fs.writeFileSync(path.join(uiDir, 'package.json'), '{"scripts":{"build":"vite build"}}\n');
  return { root, uiDir, destination, catalog };
}

function fakeBuild(stage, { script = 'export const selected="saved-id";', extra = {}, uiDir, wrongLocale = false } = {}) {
  fs.mkdirSync(path.join(stage, 'assets'), { recursive: true });
  for (const entry of ['index.html', 'setup.html', 'simhub.html']) {
    fs.writeFileSync(path.join(stage, entry), '<script type="module" crossorigin src="/assets/main-123.js"></script>\n');
  }
  fs.writeFileSync(path.join(stage, 'assets', 'main-123.js'), script);
  fs.mkdirSync(path.join(stage, 'locales'), { recursive: true });
  if (wrongLocale) fs.writeFileSync(path.join(stage, 'locales', 'translations.json'), '{"stale":true}');
  else if (uiDir) fs.copyFileSync(path.resolve(uiDir, '..', 'FS25_FarmDashboard_App', 'web', 'locales', 'translations.json'),
    path.join(stage, 'locales', 'translations.json'));
  else fs.writeFileSync(path.join(stage, 'locales', 'translations.json'), '{}');
  for (const [rel, text] of Object.entries(extra)) fs.writeFileSync(path.join(stage, rel), text);
  return 0;
}

test('fresh source -> compiled entry/assets -> copied manifest -> same app.asar hashes', async (t) => {
  const { root, uiDir, destination } = fixture(t);
  const sourceDigest = fingerprintUiSource(uiDir);
  const proof = buildFreshV5Ui({ uiDir, destination, runBuild: (stage) => fakeBuild(stage, { uiDir }) });
  assert.equal(proof.sourceDigest, sourceDigest);
  assert.deepEqual(proof.entryScripts['index.html'], ['assets/main-123.js']);
  assert.equal(verifyV5UiDirectory(destination, proof), true);
  assert.ok(proof.fileHashes['index.html']);
  assert.ok(proof.fileHashes['assets/main-123.js']);
  assert.doesNotMatch(JSON.stringify(proof), /private\/save|password|token/i);

  const archive = path.join(root, 'fresh.asar');
  await createPackage(path.join(root, 'app'), archive);
  assert.equal(verifyV5UiAsar(archive, proof, appDir), true);

  fs.writeFileSync(path.join(destination, 'assets', 'main-123.js'), 'export const selected="first-row";');
  const staleArchive = path.join(root, 'stale.asar');
  await createPackage(path.join(root, 'app'), staleArchive);
  assert.throws(() => verifyV5UiAsar(staleArchive, proof, appDir), /asset differs/);
});

test('build failure, empty success, source drift, and private output fail before copying stale UI', (t) => {
  const { uiDir, destination } = fixture(t);
  fs.mkdirSync(destination, { recursive: true });
  fs.writeFileSync(path.join(destination, 'sentinel.txt'), 'prior output');
  assert.throws(() => buildFreshV5Ui({ uiDir, destination, runBuild: () => 1 }), /build failed/);
  assert.throws(() => buildFreshV5Ui({ uiDir, destination, runBuild: () => 0 }), /Staged dist locale differs/);
  assert.throws(() => buildFreshV5Ui({ uiDir, destination, runBuild: (stage) => {
    fakeBuild(stage, { uiDir });
    fs.writeFileSync(path.join(uiDir, 'src', 'main.tsx'), 'changed during build');
    return 0;
  } }), /source changed during build/);
  assert.throws(() => buildFreshV5Ui({ uiDir, destination, runBuild: (stage) =>
    fakeBuild(stage, { uiDir, extra: { '.env': 'SECRET=do-not-copy' } }) }), /Private-looking output/);
  assert.equal(fs.readFileSync(path.join(destination, 'sentinel.txt'), 'utf8'), 'prior output');
});

test('entry must reference the built JS, not merely coexist with an asset', (t) => {
  const { uiDir, destination } = fixture(t);
  assert.throws(() => buildFreshV5Ui({ uiDir, destination, runBuild: (stage) => {
    fakeBuild(stage, { uiDir });
    fs.writeFileSync(path.join(stage, 'index.html'), '<script type="module" src="/assets/stale.js"></script>');
    return 0;
  } }), /points outside compiled output/);
});

test('catalog, public asset, and prebuild script change the source digest; missing or stale locales fail closed', (t) => {
  const { uiDir, destination, catalog } = fixture(t);
  const first = fingerprintUiSource(uiDir);
  fs.writeFileSync(path.join(uiDir, 'public', 'brand.svg'), '<svg><title>changed</title></svg>');
  const publicChanged = fingerprintUiSource(uiDir);
  assert.notEqual(publicChanged, first);
  fs.writeFileSync(path.join(uiDir, 'scripts', 'copy-locales.mjs'), 'export const copy = false;\n');
  assert.notEqual(fingerprintUiSource(uiDir), publicChanged);
  fs.writeFileSync(catalog, '{"en":{"nav.dataSource":"Changed"}}\n');
  assert.throws(() => buildFreshV5Ui({ uiDir, destination, runBuild: (stage) => fakeBuild(stage, { uiDir }) }),
    /Committed translations catalog differs from human-authored messages/);
  fs.rmSync(catalog);
  assert.throws(() => fingerprintUiSource(uiDir), /Required catalog translations input is missing/);
  assert.equal(fs.existsSync(destination), false);
});

test('changed human-authored message with unchanged catalog, stale public copy, and wrong staged locale fail closed', (t) => {
  const { uiDir, destination, catalog } = fixture(t);
  const messages = path.join(path.dirname(catalog), 'messages');
  fs.writeFileSync(path.join(messages, 'fr.json'), JSON.stringify({ 'nav.dataSource': 'changed French label' }));
  assert.throws(() => fingerprintUiSource(uiDir), /Committed translations catalog differs from human-authored messages/);

  const rebuilt = spawnSync(process.execPath, [path.join(path.dirname(catalog), 'build-translations.mjs')], { encoding: 'utf8' });
  assert.equal(rebuilt.status, 0, rebuilt.stderr);
  assert.throws(() => buildFreshV5Ui({ uiDir, destination, runBuild: (stage) => fakeBuild(stage, { uiDir }) }),
    /Generated public locale is missing or differs/);
  fs.copyFileSync(catalog, path.join(uiDir, 'public', 'locales', 'translations.json'));
  assert.throws(() => buildFreshV5Ui({ uiDir, destination,
    runBuild: (stage) => fakeBuild(stage, { uiDir, wrongLocale: true }) }),
  /Staged dist locale differs from validated source catalog/);
  assert.equal(fs.existsSync(destination), false);
});

test('private machine-translation cache is never read, copied, or included in the source proof', (t) => {
  const { uiDir, destination, catalog } = fixture(t);
  const cache = path.join(path.dirname(catalog), 'messages', '.mt-cache.json');
  fs.writeFileSync(cache, '{"fixtureOnly":"private cache canary"}');
  const read = fs.readFileSync;
  const copy = fs.copyFileSync;
  fs.readFileSync = function (file, ...args) {
    if (path.resolve(String(file)) === cache) throw new Error('private cache was read');
    return read.call(fs, file, ...args);
  };
  fs.copyFileSync = function (from, to, ...args) {
    if (path.resolve(String(from)) === cache) throw new Error('private cache was copied');
    return copy.call(fs, from, to, ...args);
  };
  try {
    const sourceDigest = fingerprintUiSource(uiDir);
    const proof = buildFreshV5Ui({ uiDir, destination, runBuild: (stage) => fakeBuild(stage, { uiDir }) });
    assert.equal(proof.sourceDigest, sourceDigest);
    assert.doesNotMatch(JSON.stringify(proof), /mt-cache|private cache canary/i);
  } finally {
    fs.readFileSync = read;
    fs.copyFileSync = copy;
  }
});

test('runner dry-run constructs the exact V5 npm build command without touching outputs', (t) => {
  const { root } = fixture(t);
  const npmCli = path.join(root, 'fake-npm-cli.js');
  const stage = path.join(root, 'isolated staged dist');
  const release = path.join(root, 'untouched release');
  fs.writeFileSync(npmCli, '// command construction fixture\n');
  const runner = path.resolve(here, '../run-electron-builder.mjs');
  const result = spawnSync(process.execPath,
    [runner, 'dist', '--v5', '--inspect-v5-ui-build-command', '--stage', stage], {
      encoding: 'utf8', env: { ...process.env, npm_execpath: npmCli, FARMDASH_BUILD_OUTPUT: release },
    });
  assert.equal(result.status, 0, result.stderr);
  const invocation = JSON.parse(result.stdout.trim());
  assert.equal(invocation.command, process.execPath);
  assert.deepEqual(invocation.args, [npmCli, 'run', 'build', '--prefix', path.resolve(here, '../../../NEW APP'),
    '--', '--outDir', stage, '--emptyOutDir']);
  assert.equal(invocation.cwd, path.resolve(here, '../../..'));
  assert.equal(fs.existsSync(stage), false);
  assert.equal(fs.existsSync(release), false);
});

test('an interrupted sibling copy leaves the previous ui-v2 intact', (t) => {
  const { root } = fixture(t);
  const source = path.join(root, 'compiled');
  const destination = path.join(root, 'ui-v2');
  fakeBuild(source);
  fs.mkdirSync(destination);
  fs.writeFileSync(path.join(destination, 'prior.txt'), 'last verified UI');
  assert.throws(() => copyUiDirectory(source, destination, { copy: (_from, candidate) => {
    fs.mkdirSync(candidate);
    fs.writeFileSync(path.join(candidate, 'partial.txt'), 'incomplete');
    throw new Error('simulated copy failure');
  } }), /simulated copy failure/);
  assert.equal(fs.readFileSync(path.join(destination, 'prior.txt'), 'utf8'), 'last verified UI');
  assert.equal(fs.existsSync(path.join(destination, 'partial.txt')), false);
});

test('failed candidate move and failed restore preserve the recoverable previous UI backup', (t) => {
  const { root } = fixture(t);
  const source = path.join(root, 'compiled');
  const destination = path.join(root, 'ui-v2');
  fakeBuild(source);
  fs.mkdirSync(destination);
  fs.writeFileSync(path.join(destination, 'prior.txt'), 'last verified UI');
  let calls = 0;
  let backupPath;
  let failure;
  try {
    copyUiDirectory(source, destination, { move: (from, to) => {
      calls += 1;
      if (calls === 1) {
        backupPath = to;
        fs.renameSync(from, to);
        return;
      }
      if (calls === 2) throw new Error('simulated candidate move failure');
      throw new Error('simulated previous UI restore failure');
    } });
  } catch (error) {
    failure = error;
  }
  assert.equal(calls, 3);
  assert.ok(failure, 'copy must not report success');
  assert.match(failure.message, /backup preserved at/);
  assert.ok(failure.message.includes(backupPath));
  assert.equal(fs.readFileSync(path.join(backupPath, 'prior.txt'), 'utf8'), 'last verified UI');
  assert.equal(fs.existsSync(destination), false);
});

test('classic direct copy remains available for complete dist fixtures', (t) => {
  const { root } = fixture(t);
  const source = path.join(root, 'classic-dist');
  const destination = path.join(root, 'classic-ui-v2');
  fakeBuild(source);
  copyUiDirectory(source, destination);
  assert.equal(fs.readFileSync(path.join(destination, 'index.html'), 'utf8'),
    fs.readFileSync(path.join(source, 'index.html'), 'utf8'));
});

test('an existing same-version V5 installer is not overwritten', (t) => {
  const { root } = fixture(t);
  const config = path.join(root, 'rf.yml');
  const output = path.join(root, 'release');
  fs.mkdirSync(output);
  fs.writeFileSync(config, 'extraMetadata:\n  version: 5.0.25\n');
  assert.equal(assertDistinctV5Installer(config, output), '5.0.25');
  fs.writeFileSync(path.join(output, 'FS25-Farm-Dashboard-V5-Setup-5.0.25.exe'), 'existing');
  assert.throws(() => assertDistinctV5Installer(config, output), /already exists/);
});
