import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  TEXCONV_RELEASE,
  formatTexconvReport,
  inspectBundledTexconv,
  inspectPeHeader,
} from '../../tools/app/verify-v5-bundled-texconv.mjs';

const appDir = fileURLToPath(new URL('../', import.meta.url));
const toolsAppDir = fileURLToPath(new URL('../../tools/app/', import.meta.url));
const shippedDir = path.join(appDir, 'resources', 'texconv');
const guardCli = path.join(toolsAppDir, 'verify-v5-bundled-texconv.mjs');
const realExe = () => fs.readFileSync(path.join(shippedDir, 'texconv.exe'));
const license = () => fs.readFileSync(path.join(shippedDir, 'LICENSE'));
const codes = (result) => result.problems.map((p) => p.code).sort();

function tempRoot(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fd-texconv-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** `files` maps names in resources/texconv to contents; null makes a folder. Omit it for no texconv folder. */
function fakeApp(root, files) {
  const app = path.join(root, 'FS25_FarmDashboard_App');
  fs.mkdirSync(app, { recursive: true });
  if (files) {
    const dir = path.join(app, 'resources', 'texconv');
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, content] of Object.entries(files)) {
      if (content === null) fs.mkdirSync(path.join(dir, name));
      else fs.writeFileSync(path.join(dir, name), content);
    }
  }
  return app;
}

function patchedExe(offsetFromPe, value) {
  const buf = Buffer.from(realExe());
  buf.writeUInt16LE(value, buf.readUInt32LE(0x3c) + offsetFromPe);
  return buf;
}

test('the shipped resources/texconv is the pinned DirectXTex x64 texconv with its license', () => {
  const result = inspectBundledTexconv(appDir);
  assert.deepEqual(result.problems, []);
  assert.equal(result.ok, true);
  assert.equal(result.sha256, TEXCONV_RELEASE.sha256);
  assert.equal(result.bytes, TEXCONV_RELEASE.bytes);
  assert.deepEqual(inspectPeHeader(realExe()), { ok: true, machine: 'x64' });
});

test('a missing texconv folder is refused', (t) => {
  const result = inspectBundledTexconv(fakeApp(tempRoot(t)));
  assert.equal(result.ok, false);
  assert.deepEqual(codes(result), ['dir-missing']);
});

test('a .gitkeep-only placeholder folder is refused', (t) => {
  const result = inspectBundledTexconv(fakeApp(tempRoot(t), { '.gitkeep': '\r\n' }));
  assert.equal(result.ok, false);
  assert.deepEqual(codes(result), ['placeholder-only']);
});

test('an empty texconv folder is refused', (t) => {
  assert.deepEqual(codes(inspectBundledTexconv(fakeApp(tempRoot(t), {}))), ['placeholder-only']);
});

test('a zero-length texconv.exe is refused', (t) => {
  const result = inspectBundledTexconv(fakeApp(tempRoot(t), { 'texconv.exe': '', LICENSE: license() }));
  assert.equal(result.ok, false);
  assert.deepEqual(codes(result), ['exe-empty']);
});

test('a folder with a license but no texconv.exe is refused', (t) => {
  assert.deepEqual(codes(inspectBundledTexconv(fakeApp(tempRoot(t), { LICENSE: license() }))), ['exe-missing']);
});

test('a text file named texconv.exe is refused as not an executable', (t) => {
  const result = inspectBundledTexconv(fakeApp(tempRoot(t), { 'texconv.exe': 'not a program\n', LICENSE: license() }));
  assert.deepEqual(codes(result), ['hash-mismatch', 'not-pe']);
});

test('a folder named texconv.exe is refused', (t) => {
  assert.deepEqual(codes(inspectBundledTexconv(fakeApp(tempRoot(t), { 'texconv.exe': null, LICENSE: license() }))), ['exe-not-file']);
});

test('an MZ stub without a PE signature is refused', (t) => {
  const stub = Buffer.alloc(256);
  stub.write('MZ', 0, 'ascii');
  stub.writeUInt32LE(0x80, 0x3c);
  assert.deepEqual(codes(inspectBundledTexconv(fakeApp(tempRoot(t), { 'texconv.exe': stub, LICENSE: license() }))), ['hash-mismatch', 'not-pe']);
});

test('an x86 build of texconv is refused', (t) => {
  const result = inspectBundledTexconv(fakeApp(tempRoot(t), { 'texconv.exe': patchedExe(4, 0x014c), LICENSE: license() }));
  assert.deepEqual(codes(result), ['hash-mismatch', 'wrong-machine']);
  assert.match(result.problems.find((p) => p.code === 'wrong-machine').message, /0x14c is not x64/);
});

test('a DLL is refused as not a standalone executable', (t) => {
  const exe = realExe();
  const characteristics = exe.readUInt16LE(exe.readUInt32LE(0x3c) + 22);
  const result = inspectBundledTexconv(fakeApp(tempRoot(t), { 'texconv.exe': patchedExe(22, characteristics | 0x2000), LICENSE: license() }));
  assert.deepEqual(codes(result), ['hash-mismatch', 'not-executable']);
});

test('a valid x64 executable that is not the pinned build is refused by hash', (t) => {
  const result = inspectBundledTexconv(fakeApp(tempRoot(t), { 'texconv.exe': Buffer.concat([realExe(), Buffer.from([0])]), LICENSE: license() }));
  assert.deepEqual(codes(result), ['hash-mismatch']);
});

test('the pinned binary without its MIT license notice is refused', (t) => {
  assert.deepEqual(codes(inspectBundledTexconv(fakeApp(tempRoot(t), { 'texconv.exe': realExe() }))), ['notice-missing']);
  assert.deepEqual(codes(inspectBundledTexconv(fakeApp(tempRoot(t), { 'texconv.exe': realExe(), LICENSE: '' }))), ['notice-missing']);
});

test('the pinned binary with its license is admitted, placeholder alongside or not', (t) => {
  for (const extra of [{}, { '.gitkeep': '\r\n', 'PROVENANCE.md': 'x' }]) {
    const result = inspectBundledTexconv(fakeApp(tempRoot(t), { 'texconv.exe': realExe(), LICENSE: license(), ...extra }));
    assert.equal(result.ok, true, JSON.stringify(result.problems));
    assert.equal(result.sha256, TEXCONV_RELEASE.sha256);
  }
});

test('the failure report tells the builder exactly what to fetch and where to put it', (t) => {
  const result = inspectBundledTexconv(fakeApp(tempRoot(t), { '.gitkeep': '\r\n' }));
  const report = formatTexconvReport(result);
  assert.match(report, /V5 installer blocked/);
  assert.ok(report.includes(TEXCONV_RELEASE.url));
  assert.ok(report.includes(TEXCONV_RELEASE.sha256));
  assert.ok(report.includes(result.exePath));
  assert.ok(report.includes(TEXCONV_RELEASE.licenseUrl));
});

test('the guard CLI exits 1 on a placeholder and 0 on the pinned resource', (t) => {
  const root = tempRoot(t);
  const bad = spawnSync(process.execPath, [guardCli, '--root', fakeApp(path.join(root, 'bad'), { '.gitkeep': '\r\n' })], { encoding: 'utf8', windowsHide: true });
  assert.equal(bad.status, 1, bad.stderr);
  assert.match(bad.stderr, /\[placeholder-only\]/);
  const good = spawnSync(process.execPath, [guardCli, '--root', fakeApp(path.join(root, 'good'), { 'texconv.exe': realExe(), LICENSE: license() })], { encoding: 'utf8', windowsHide: true });
  assert.equal(good.status, 0, good.stderr);
  assert.match(good.stdout, /\[verify-v5-texconv\] OK/);
});

/**
 * Real wrapper, real output-folder logic and guard, copied into a throwaway tree. The V5 UI build and
 * classic UI copy are replaced by stubs that record entry and stop, so electron-builder never runs.
 */
function runWrapper(t, texconvFiles, args, productLine) {
  const root = tempRoot(t);
  const tools = path.join(root, 'tools', 'app');
  fs.mkdirSync(tools, { recursive: true });
  for (const name of ['run-electron-builder.mjs', 'farmdash-build-output.mjs', 'verify-v5-bundled-texconv.mjs',
    'v5-release-stage.mjs']) {
    fs.copyFileSync(path.join(toolsAppDir, name), path.join(tools, name));
  }
  // This suite isolates the texconv preflight. A valid binary must reach the next
  // V5 build stage, but the throwaway tree intentionally has no real UI sources.
  fs.writeFileSync(path.join(tools, 'v5-ui-package-proof.mjs'),
    "import fs from 'node:fs';\n"
    + "export function assertDistinctV5Installer() { return '5.0.33'; }\n"
    + "export function buildFreshV5Ui() { fs.writeFileSync(process.env.FD_TEXCONV_TEST_MARKER, 'reached'); process.exit(42); }\n"
    + "export function verifyV5UiAsar() {}\n"
    + "export function assertUiSourceStillCurrent() {}\n");
  fs.writeFileSync(path.join(tools, 'copy-ui-v2.mjs'),
    "import fs from 'node:fs';\nimport path from 'node:path';\nimport { fileURLToPath } from 'node:url';\n"
    + "export function copyUiDirectory() { fs.writeFileSync(process.env.FD_TEXCONV_TEST_MARKER, 'reached'); process.exit(42); }\n"
    + "if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) copyUiDirectory();\n");
  const fake = fakeApp(root, texconvFiles);
  fs.copyFileSync(path.join(appDir, 'electron-builder.rf.yml'), path.join(fake, 'electron-builder.rf.yml'));
  const profile = path.join(root, 'profile');
  fs.mkdirSync(profile);
  const marker = path.join(root, 'copy-ui-reached.txt');
  const npmCli = path.join(root, 'npm-qa.cjs');
  fs.writeFileSync(npmCli,
    "require('node:fs').writeFileSync(process.env.FD_TEXCONV_TEST_MARKER, 'reached'); process.exit(42);\n");
  const env = { ...process.env, USERPROFILE: profile, HOME: profile, FD_TEXCONV_TEST_MARKER: marker };
  env.npm_execpath = npmCli;
  delete env.FARMDASH_BUILD_OUTPUT;
  delete env.FARMDASH_PRODUCT_LINE;
  if (productLine) env.FARMDASH_PRODUCT_LINE = productLine;
  const result = spawnSync(process.execPath, [path.join(tools, 'run-electron-builder.mjs'), ...args], { cwd: root, env, encoding: 'utf8', windowsHide: true, timeout: 60000 });
  return {
    status: result.status,
    stderr: result.stderr,
    reachedNextStep: fs.existsSync(marker),
    releaseDirCreated: fs.existsSync(path.join(profile, 'Documents', 'FarmDash Release')),
    finalOutputCreated: fs.existsSync(path.join(profile, 'Documents', 'FarmDash Final Output')),
  };
}

const validFiles = () => ({ '.gitkeep': '\r\n', 'texconv.exe': realExe(), LICENSE: license() });

test('V5 dist stops before the output folder, ui copy and electron-builder when texconv is a placeholder', (t) => {
  const run = runWrapper(t, { '.gitkeep': '\r\n' }, ['dist', '--v5']);
  assert.equal(run.status, 1, run.stderr);
  assert.equal(run.reachedNextStep, false);
  assert.equal(run.releaseDirCreated, false);
  assert.match(run.stderr, /\[placeholder-only\]/);
  assert.match(run.stderr, /no installer was built/);
});

test('every V5 selector (--v5, --rf, --product=v5, FARMDASH_PRODUCT_LINE) runs the preflight in pack and dist', (t) => {
  const cases = [
    [undefined, ['pack', '--v5'], undefined, /\[dir-missing\]/],
    [{}, ['dist', '--v5'], undefined, /\[placeholder-only\]/],
    [{ 'texconv.exe': '', LICENSE: license() }, ['dist', '--rf'], undefined, /\[exe-empty\]/],
    [{ 'texconv.exe': 'MZ junk', LICENSE: license() }, ['pack', '--product=v5'], undefined, /\[not-pe\]/],
    [{ '.gitkeep': '\r\n' }, ['dist'], 'rf', /\[placeholder-only\]/],
    [{ '.gitkeep': '\r\n' }, ['pack'], 'realistic-farming', /\[placeholder-only\]/],
    [{ '.gitkeep': '\r\n' }, ['dist'], 'V5', /\[placeholder-only\]/],
  ];
  for (const [files, args, productLine, pattern] of cases) {
    const run = runWrapper(t, files, args, productLine);
    assert.equal(run.status, 1, `${args.join(' ')} ${productLine || ''}: ${run.stderr}`);
    assert.equal(run.reachedNextStep, false);
    assert.equal(run.releaseDirCreated, false);
    assert.match(run.stderr, pattern);
  }
});

test('V5 with the pinned texconv passes the preflight and continues to the next build step', (t) => {
  const run = runWrapper(t, validFiles(), ['dist', '--v5']);
  assert.notEqual(run.status, 0, run.stderr);
  assert.equal(run.reachedNextStep, true);
  assert.match(run.stderr, /\[verify-v5-texconv\] OK/);
});

test('classic V4 builds never run the texconv preflight', (t) => {
  for (const [files, args] of [[{ '.gitkeep': '\r\n' }, ['dist']], [undefined, ['pack']], [validFiles(), ['dist']]]) {
    const run = runWrapper(t, files, args);
    assert.equal(run.status, 42, run.stderr);
    assert.equal(run.reachedNextStep, true);
    assert.equal(run.finalOutputCreated, true);
    assert.equal(run.releaseDirCreated, false);
    assert.doesNotMatch(run.stderr, /verify-v5-texconv|texconv/i);
  }
});
