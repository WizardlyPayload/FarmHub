import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { copyUiDirectory } from './copy-ui-v2.mjs';

const require = createRequire(import.meta.url);
const { isPrivatePackagePath } = require('./privatePackageGuard.cjs');
const PROOF_NAME = 'farmdash-v5-ui-proof.json';
const ENTRIES = ['index.html', 'setup.html', 'simhub.html'];
const SOURCE_ROOT_FILES = [...ENTRIES, 'vite.config.ts', 'package.json', 'scripts/copy-locales.mjs'];
const GENERATED_CATALOG = 'locales/translations.json';
const HUMAN_LOCALES = [
  'en', 'de', 'fr', 'es', 'it', 'pl', 'nl', 'pt', 'sv', 'da', 'fi', 'cs',
  'el', 'hu', 'ro', 'bg', 'hr', 'sk', 'sl', 'et', 'lv', 'lt', 'ga', 'mt',
  'is', 'nb', 'uk',
];

function localePaths(uiDir) {
  const root = path.resolve(uiDir, '..', 'FS25_FarmDashboard_App', 'web', 'locales');
  return {
    root,
    catalog: path.join(root, 'translations.json'),
    builder: path.join(root, 'build-translations.mjs'),
    verifier: path.join(root, 'verify-i18n.mjs'),
    messages: path.join(root, 'messages'),
  };
}

function validateSourceCatalog(uiDir) {
  const paths = localePaths(uiDir);
  for (const [name, full] of Object.entries({
    catalog: paths.catalog, builder: paths.builder, verifier: paths.verifier,
  })) {
    if (!fs.existsSync(full) || fs.lstatSync(full).isSymbolicLink() || !fs.lstatSync(full).isFile()) {
      throw new Error(`[V5 UI proof] Required ${name} translations input is missing or linked`);
    }
  }
  const messageFiles = HUMAN_LOCALES.map((code) => `${code}.json`);
  for (const rel of messageFiles) {
    const full = path.join(paths.messages, rel);
    if (!fs.existsSync(full) || fs.lstatSync(full).isSymbolicLink() || !fs.lstatSync(full).isFile()) {
      throw new Error(`[V5 UI proof] Required human-authored locale message is missing or linked: ${rel}`);
    }
  }
  const mirror = fs.mkdtempSync(path.join(os.tmpdir(), 'farmdash-v5-i18n-'));
  try {
    fs.mkdirSync(path.join(mirror, 'messages'));
    fs.copyFileSync(paths.builder, path.join(mirror, 'build-translations.mjs'));
    fs.copyFileSync(paths.verifier, path.join(mirror, 'verify-i18n.mjs'));
    for (const rel of messageFiles) {
      if (isPrivatePackagePath(rel)) throw new Error(`[V5 UI proof] Private-looking locale input refused: ${rel}`);
      fs.copyFileSync(path.join(paths.messages, rel), path.join(mirror, 'messages', rel));
    }
    const build = spawnSync(process.execPath, [path.join(mirror, 'build-translations.mjs')], {
      cwd: mirror, encoding: 'utf8',
    });
    if (build.status !== 0) throw new Error('[V5 UI proof] i18n:build failed on human-authored message inputs');
    const verify = spawnSync(process.execPath, [path.join(mirror, 'verify-i18n.mjs')], {
      cwd: mirror, encoding: 'utf8',
    });
    if (verify.status !== 0) throw new Error('[V5 UI proof] i18n:verify failed on human-authored message inputs');
    if (!fs.readFileSync(path.join(mirror, 'translations.json')).equals(fs.readFileSync(paths.catalog))) {
      throw new Error('[V5 UI proof] Committed translations catalog differs from human-authored messages');
    }
  } finally {
    const resolved = path.resolve(mirror);
    if (path.dirname(resolved) !== path.resolve(os.tmpdir())
        || !path.basename(resolved).startsWith('farmdash-v5-i18n-')
        || fs.lstatSync(resolved).isSymbolicLink()) {
      throw new Error(`[V5 UI proof] Refusing unsafe locale mirror cleanup: ${resolved}`);
    }
    fs.rmSync(resolved, { recursive: true, force: true });
  }
  return { ...paths, messageFiles };
}

function digest(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function filesBelow(root, relative = '') {
  const folder = path.join(root, relative);
  if (!fs.existsSync(folder)) throw new Error(`[V5 UI proof] Missing directory: ${folder}`);
  if (fs.lstatSync(folder).isSymbolicLink()) throw new Error(`[V5 UI proof] Linked directory refused: ${folder}`);
  const files = [];
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const rel = path.posix.join(relative.split(path.sep).join('/'), entry.name);
    const full = path.join(root, rel);
    const stat = fs.lstatSync(full);
    if (stat.isSymbolicLink()) throw new Error(`[V5 UI proof] Linked file refused: ${rel}`);
    if (stat.isDirectory()) files.push(...filesBelow(root, rel));
    else if (stat.isFile()) files.push(rel);
    else throw new Error(`[V5 UI proof] Unsupported output entry: ${rel}`);
  }
  return files.sort();
}

export function fingerprintUiSource(uiDir) {
  const srcDir = path.join(uiDir, 'src');
  const publicDir = path.join(uiDir, 'public');
  const locale = validateSourceCatalog(uiDir);
  const catalogBytes = fs.readFileSync(locale.catalog);
  const files = [
    ...SOURCE_ROOT_FILES,
    ...filesBelow(srcDir).map((rel) => `src/${rel}`),
    ...filesBelow(publicDir).filter((rel) => rel !== GENERATED_CATALOG).map((rel) => `public/${rel}`),
  ].sort();
  const hash = crypto.createHash('sha256');
  for (const rel of files) {
    if (isPrivatePackagePath(rel)) throw new Error(`[V5 UI proof] Private-looking source path refused: ${rel}`);
    const full = path.join(uiDir, rel);
    if (!fs.existsSync(full) || fs.lstatSync(full).isSymbolicLink() || !fs.lstatSync(full).isFile()) {
      throw new Error(`[V5 UI proof] Missing regular source file: ${rel}`);
    }
    hash.update(rel).update('\0').update(fs.readFileSync(full)).update('\0');
  }
  hash.update('catalog/translations.json').update('\0').update(catalogBytes).update('\0');
  for (const [label, full] of [
    ['catalog/build-translations.mjs', locale.builder],
    ['catalog/verify-i18n.mjs', locale.verifier],
    ...locale.messageFiles.map((rel) => [`catalog/messages/${rel}`, path.join(locale.messages, rel)]),
  ]) {
    hash.update(label).update('\0').update(fs.readFileSync(full)).update('\0');
  }
  return hash.digest('hex');
}

function assertGeneratedLocale(uiDir) {
  const source = localePaths(uiDir).catalog;
  const generated = path.join(uiDir, 'public', GENERATED_CATALOG);
  if (!fs.existsSync(generated) || fs.lstatSync(generated).isSymbolicLink()
      || !fs.readFileSync(source).equals(fs.readFileSync(generated))) {
    throw new Error('[V5 UI proof] Generated public locale is missing or differs from source catalog');
  }
}

function assertStagedLocale(uiDir, stageDist) {
  const source = localePaths(uiDir).catalog;
  const staged = path.join(stageDist, GENERATED_CATALOG);
  if (!fs.existsSync(staged) || fs.lstatSync(staged).isSymbolicLink()
      || !fs.readFileSync(source).equals(fs.readFileSync(staged))) {
    throw new Error('[V5 UI proof] Staged dist locale differs from validated source catalog');
  }
}

export function assertUiSourceStillCurrent(uiDir, proof) {
  if (fingerprintUiSource(uiDir) !== proof.sourceDigest) {
    throw new Error('[V5 UI proof] NEW APP source changed after fresh build');
  }
  assertGeneratedLocale(uiDir);
  return true;
}

function entryScripts(html) {
  const scripts = new Set();
  const tags = html.match(/<script\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const match = tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
    if (!match) continue;
    const raw = match[1].split(/[?#]/, 1)[0];
    if (!raw.endsWith('.js') || /^[a-z]+:|^\/\//i.test(raw) || raw.includes('\\')) {
      throw new Error(`[V5 UI proof] Non-local compiled script refused: ${raw}`);
    }
    const rel = path.posix.normalize(raw.replace(/^\/+/, ''));
    if (rel === '.' || rel === '..' || rel.startsWith('../') || !rel.startsWith('assets/')) {
      throw new Error(`[V5 UI proof] Unexpected compiled script path: ${raw}`);
    }
    scripts.add(rel);
  }
  if (!scripts.size) throw new Error('[V5 UI proof] Built entry has no local JS script');
  return [...scripts].sort();
}

function describeCompiledUi(dir, sourceDigest) {
  if (!/^[a-f0-9]{64}$/.test(sourceDigest)) throw new Error('[V5 UI proof] Invalid source digest');
  const files = filesBelow(dir).filter((rel) => rel !== PROOF_NAME);
  const fileHashes = {};
  for (const rel of files) {
    if (isPrivatePackagePath(rel)) throw new Error(`[V5 UI proof] Private-looking output refused: ${rel}`);
    fileHashes[rel] = digest(fs.readFileSync(path.join(dir, rel)));
  }
  const scripts = {};
  for (const entry of ENTRIES) {
    if (!fileHashes[entry]) throw new Error(`[V5 UI proof] Missing compiled entry: ${entry}`);
    scripts[entry] = entryScripts(fs.readFileSync(path.join(dir, entry), 'utf8'));
    for (const rel of scripts[entry]) {
      if (!fileHashes[rel]) throw new Error(`[V5 UI proof] ${entry} points outside compiled output: ${rel}`);
    }
  }
  return { schemaVersion: 1, sourceDigest, entryScripts: scripts, fileHashes };
}

function proofText(proof) {
  return `${JSON.stringify(proof, null, 2)}\n`;
}

export function verifyV5UiDirectory(dir, expected) {
  const proofPath = path.join(dir, PROOF_NAME);
  const onDisk = JSON.parse(fs.readFileSync(proofPath, 'utf8'));
  const actual = describeCompiledUi(dir, expected.sourceDigest);
  if (proofText(onDisk) !== proofText(expected) || proofText(actual) !== proofText(expected)) {
    throw new Error('[V5 UI proof] Copied entry or asset hash differs from fresh build manifest');
  }
  return true;
}

function removeOwnedStage(stageRoot) {
  const resolved = path.resolve(stageRoot);
  const tempRoot = path.resolve(os.tmpdir());
  if (path.dirname(resolved) !== tempRoot || !path.basename(resolved).startsWith('farmdash-v5-ui-')
      || fs.lstatSync(resolved).isSymbolicLink()) {
    throw new Error(`[V5 UI proof] Refusing to remove unexpected staging path: ${resolved}`);
  }
  fs.rmSync(resolved, { recursive: true, force: true });
}

export function buildFreshV5Ui({ uiDir, destination, runBuild }) {
  if (typeof runBuild !== 'function') throw new TypeError('runBuild is required');
  const sourceDigest = fingerprintUiSource(uiDir);
  const stageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'farmdash-v5-ui-'));
  const stageDist = path.join(stageRoot, 'dist');
  try {
    const code = runBuild(stageDist);
    if (code !== 0) throw new Error(`[V5 UI proof] NEW APP build failed (${code}); stale dist was not copied`);
    assertGeneratedLocale(uiDir);
    if (fingerprintUiSource(uiDir) !== sourceDigest) {
      throw new Error('[V5 UI proof] NEW APP source changed during build; refusing mixed snapshot');
    }
    assertStagedLocale(uiDir, stageDist);
    const proof = describeCompiledUi(stageDist, sourceDigest);
    fs.writeFileSync(path.join(stageDist, PROOF_NAME), proofText(proof));
    copyUiDirectory(stageDist, destination, { verify: (candidate) => verifyV5UiDirectory(candidate, proof) });
    verifyV5UiDirectory(destination, proof);
    return proof;
  } finally {
    removeOwnedStage(stageRoot);
  }
}

export function verifyV5UiAsar(asarPath, expected, appDir) {
  const appRequire = createRequire(path.join(appDir, 'package.json'));
  const { extractFile } = appRequire('@electron/asar');
  const archivePath = (rel) => path.join('ui-v2', ...rel.split('/'));
  const archivedProof = extractFile(asarPath, archivePath(PROOF_NAME));
  if (archivedProof.toString('utf8') !== proofText(expected)) {
    throw new Error('[V5 UI proof] app.asar manifest differs from the fresh build');
  }
  for (const [rel, expectedHash] of Object.entries(expected.fileHashes)) {
    const bytes = extractFile(asarPath, archivePath(rel));
    if (digest(bytes) !== expectedHash) {
      throw new Error(`[V5 UI proof] app.asar asset differs from the fresh build: ${rel}`);
    }
  }
  for (const entry of ENTRIES) {
    const html = extractFile(asarPath, archivePath(entry)).toString('utf8');
    if (JSON.stringify(entryScripts(html)) !== JSON.stringify(expected.entryScripts[entry])) {
      throw new Error(`[V5 UI proof] app.asar ${entry} points at a different JS entry`);
    }
  }
  return true;
}

export function assertDistinctV5Installer(rfConfigPath, outDir) {
  const config = fs.readFileSync(rfConfigPath, 'utf8');
  const version = config.match(/^\s{2}version:\s*([0-9]+\.[0-9]+\.[0-9]+)\s*$/m)?.[1];
  if (!version) throw new Error('[FarmDash V5] Cannot determine V5 version; refusing possible installer overwrite');
  if (!fs.existsSync(outDir)) return version;
  const prefix = `FS25-Farm-Dashboard-V5-Setup-${version}`.toLowerCase();
  const conflict = fs.readdirSync(outDir).find((name) => name.toLowerCase().startsWith(prefix));
  if (conflict) throw new Error(`[FarmDash V5] Installer ${version} already exists; bump candidate version before dist`);
  return version;
}
