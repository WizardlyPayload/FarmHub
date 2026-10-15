'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const winTest = process.platform === 'win32' ? test : test.skip;
const helper = path.resolve(__dirname, '../build/upgrade-selected-source.ps1');
const installer = path.resolve(__dirname, '../build/installer.nsh');
const fixtureRoots = [];
let cachedSid;

afterEach(() => {
  for (const root of fixtureRoots.splice(0)) {
    if (path.dirname(root) !== os.tmpdir() || !path.basename(root).startsWith('farmhub-v5-upgrade-')) {
      throw new Error('Refusing to remove a non-fixture path');
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function fixture(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'farmhub-v5-upgrade-'));
  fixtureRoots.push(root);
  const localFixtureRoot = options.independentRoots
    ? fs.mkdtempSync(path.join(os.tmpdir(), 'farmhub-v5-upgrade-'))
    : root;
  if (localFixtureRoot !== root) fixtureRoots.push(localFixtureRoot);
  const roamingRoot = path.join(root, 'Roaming');
  const localRoot = path.join(localFixtureRoot, 'Local');
  const roamingProfile = path.join(roamingRoot, 'fs25-farm-dashboard-rf');
  const localProfile = path.join(localRoot, 'fs25-farm-dashboard-rf');
  const source = path.join(localProfile, 'Local Storage');
  const leveldb = path.join(source, 'leveldb');
  const stage = path.join(roamingProfile, 'serverLiveCache', '.upgrade-selection-local-storage');
  fs.mkdirSync(roamingRoot, { recursive: true });
  fs.mkdirSync(leveldb, { recursive: true });
  fs.writeFileSync(path.join(leveldb, 'LOCK'), '');
  fs.writeFileSync(path.join(leveldb, '000003.log'), 'selected=mp-6a677ec7f2bd');
  return { root, roamingRoot, localRoot, roamingProfile, localProfile, source, leveldb, stage };
}

function currentSid() {
  if (!cachedSid) {
    const result = spawnSync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      '[Security.Principal.WindowsIdentity]::GetCurrent().User.Value',
    ], { encoding: 'utf8', timeout: 15000 });
    assert.equal(result.status, 0, result.stderr);
    cachedSid = result.stdout.trim();
    assert.match(cachedSid, /^S-1-(?:\d+-)*\d+$/);
  }
  return cachedSid;
}

function run(action, fixturePaths, options = {}) {
  return spawnSync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', helper, '-Action', action,
    '-RoamingRoot', fixturePaths.roamingRoot,
    '-LocalRoot', fixturePaths.localRoot,
    '-ExpectedSid', options.sid || currentSid(),
    '-ExpectedRoamingRoot', options.roamingRoot || fixturePaths.roamingRoot,
    '-ExpectedLocalRoot', options.localRoot || fixturePaths.localRoot,
  ], { encoding: 'utf8', timeout: 15000 });
}

function expectSuccess(result) {
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
}

winTest('closed app stages and restores Local Storage without its runtime LOCK', () => {
  const f = fixture();
  expectSuccess(run('Save', f));
  assert.equal(fs.readFileSync(path.join(f.stage, 'state.txt'), 'utf8'), 'complete');
  assert.equal(fs.existsSync(path.join(f.roamingProfile, 'Local Storage')), false);
  assert.equal(fs.existsSync(path.join(f.stage, 'Local Storage', 'leveldb', 'LOCK')), false);
  fs.rmSync(f.localProfile, { recursive: true });
  expectSuccess(run('Restore', f));
  assert.equal(fs.existsSync(f.localProfile), true);
  assert.equal(fs.readFileSync(path.join(f.leveldb, '000003.log'), 'utf8'), 'selected=mp-6a677ec7f2bd');
  assert.equal(fs.existsSync(path.join(f.leveldb, 'LOCK')), false);
  assert.equal(fs.existsSync(f.stage), false);
});

winTest('an active LevelDB LOCK refuses staging without touching source', () => {
  const f = fixture();
  const lock = fs.openSync(path.join(f.leveldb, 'LOCK'), 'r+');
  try {
    const result = run('Save', f);
    assert.notEqual(result.status, 0);
    assert.equal(fs.readFileSync(path.join(f.leveldb, '000003.log'), 'utf8'), 'selected=mp-6a677ec7f2bd');
    assert.equal(fs.existsSync(f.stage), false);
  } finally {
    fs.closeSync(lock);
  }
});

winTest('in-progress stage retries from the still-present source', () => {
  const f = fixture();
  expectSuccess(run('Save', f));
  fs.writeFileSync(path.join(f.stage, 'state.txt'), 'in-progress');
  fs.writeFileSync(path.join(f.stage, 'Local Storage', 'leveldb', '000003.log'), 'stale');
  fs.writeFileSync(path.join(f.leveldb, '000003.log'), 'selected=retry');
  expectSuccess(run('Save', f));
  assert.equal(fs.readFileSync(path.join(f.stage, 'Local Storage', 'leveldb', '000003.log'), 'utf8'), 'selected=retry');
  assert.equal(fs.readFileSync(path.join(f.leveldb, '000003.log'), 'utf8'), 'selected=retry');
});

winTest('complete stage before old uninstall retries from the current source', () => {
  const f = fixture();
  expectSuccess(run('Save', f));
  fs.writeFileSync(path.join(f.leveldb, '000003.log'), 'selected=newer');
  expectSuccess(run('Save', f));
  assert.equal(fs.readFileSync(path.join(f.stage, 'Local Storage', 'leveldb', '000003.log'), 'utf8'), 'selected=newer');
  fs.rmSync(f.localProfile, { recursive: true });
  expectSuccess(run('Restore', f));
  assert.equal(fs.readFileSync(path.join(f.leveldb, '000003.log'), 'utf8'), 'selected=newer');
});

winTest('restore refuses an existing Local Storage destination', () => {
  const f = fixture();
  expectSuccess(run('Save', f));
  fs.rmSync(f.localProfile, { recursive: true });
  fs.mkdirSync(f.source, { recursive: true });
  fs.writeFileSync(path.join(f.source, 'sentinel.txt'), 'keep-me');
  const result = run('Restore', f);
  assert.notEqual(result.status, 0);
  assert.equal(fs.readFileSync(path.join(f.source, 'sentinel.txt'), 'utf8'), 'keep-me');
  assert.equal(fs.existsSync(path.join(f.stage, 'Local Storage', 'leveldb', '000003.log')), true);
  fs.rmSync(f.source, { recursive: true });
  expectSuccess(run('Restore', f));
  assert.equal(fs.readFileSync(path.join(f.leveldb, '000003.log'), 'utf8'), 'selected=mp-6a677ec7f2bd');
});

winTest('restore accepts unchanged Local Storage and clears only the redundant stage', () => {
  const f = fixture();
  expectSuccess(run('Save', f));
  assert.equal(fs.existsSync(path.join(f.leveldb, 'LOCK')), true);
  expectSuccess(run('Restore', f));
  assert.equal(fs.readFileSync(path.join(f.leveldb, '000003.log'), 'utf8'), 'selected=mp-6a677ec7f2bd');
  assert.equal(fs.existsSync(path.join(f.leveldb, 'LOCK')), true);
  assert.equal(fs.existsSync(f.stage), false);
});

winTest('a prior restored stage is cleared after Keep removes Local Storage', () => {
  const f = fixture();
  expectSuccess(run('Save', f));
  fs.rmSync(f.localProfile, { recursive: true });
  fs.mkdirSync(f.localProfile, { recursive: true });
  fs.renameSync(path.join(f.stage, 'Local Storage'), f.source);
  fs.writeFileSync(path.join(f.stage, 'state.txt'), 'restored');
  fs.rmSync(f.localProfile, { recursive: true });
  const result = run('Save', f);
  assert.equal(result.status, 10, result.stderr);
  assert.equal(fs.existsSync(f.stage), false);
  assert.equal(fs.existsSync(f.source), false);
});

winTest('a restored stage with user-added content is retained and refuses clean install', () => {
  const f = fixture();
  expectSuccess(run('Save', f));
  fs.rmSync(f.localProfile, { recursive: true });
  fs.rmSync(path.join(f.stage, 'Local Storage'), { recursive: true });
  fs.writeFileSync(path.join(f.stage, 'state.txt'), 'restored');
  fs.writeFileSync(path.join(f.stage, 'notes.txt'), 'do not erase');
  const result = run('Save', f);
  assert.notEqual(result.status, 0);
  assert.notEqual(result.status, 10);
  assert.equal(fs.readFileSync(path.join(f.stage, 'notes.txt'), 'utf8'), 'do not erase');
  assert.equal(fs.readFileSync(path.join(f.stage, 'state.txt'), 'utf8'), 'restored');
});

function psLiteral(value) {
  return "'" + String(value).replace(/'/g, "''") + "'";
}

async function waitForFile(file, child) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (fs.existsSync(file)) return;
    if (child.exitCode !== null) throw new Error('The staged-file lock holder exited early');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('The staged-file lock holder did not start');
}

winTest('independent AppData roots copy and verify before local rename; copy failure retains stage for retry', async () => {
  const f = fixture({ independentRoots: true });
  expectSuccess(run('Save', f));
  fs.rmSync(f.localProfile, { recursive: true });
  const lockedFile = path.join(f.stage, 'Local Storage', 'leveldb', '000003.log');
  const ready = path.join(f.root, 'staged-lock-ready');
  const command = "$stream = [IO.File]::Open(" + psLiteral(lockedFile) +
    ", [IO.FileMode]::Open, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None); " +
    "try { [IO.File]::WriteAllText(" + psLiteral(ready) +
    ", 'ready'); Start-Sleep -Seconds 30 } finally { $stream.Dispose() }";
  const holder = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command],
    { windowsHide: true, stdio: 'ignore' });
  const exited = new Promise((resolve) => holder.once('exit', resolve));
  try {
    await waitForFile(ready, holder);
    const failed = run('Restore', f);
    assert.notEqual(failed.status, 0);
    assert.equal(fs.readFileSync(path.join(f.stage, 'state.txt'), 'utf8'), 'complete');
    assert.equal(fs.existsSync(lockedFile), true);
    assert.equal(fs.existsSync(f.source), false);
    assert.equal(fs.readdirSync(f.localProfile).length, 0);
  } finally {
    holder.kill();
    await exited;
  }
  expectSuccess(run('Restore', f));
  assert.equal(fs.readFileSync(path.join(f.leveldb, '000003.log'), 'utf8'), 'selected=mp-6a677ec7f2bd');
  assert.equal(fs.existsSync(f.stage), false);
  fs.rmSync(f.localProfile, { recursive: true });
  assert.equal(run('Save', f).status, 10);
});

winTest('Save rejects a different user or either AppData root before staging', () => {
  const f = fixture();
  for (const options of [
    { sid: 'S-1-0-0' },
    { roamingRoot: path.join(f.root, 'different-roaming') },
    { localRoot: path.join(f.root, 'different-local') },
  ]) {
    const result = run('Save', f, options);
    assert.notEqual(result.status, 0);
    assert.equal(fs.readFileSync(path.join(f.leveldb, '000003.log'), 'utf8'), 'selected=mp-6a677ec7f2bd');
    assert.equal(fs.existsSync(f.stage), false);
  }
});

winTest('Restore rejects a different user or either AppData root and retains its stage', () => {
  const f = fixture();
  expectSuccess(run('Save', f));
  fs.rmSync(f.localProfile, { recursive: true });
  for (const options of [
    { sid: 'S-1-0-0' },
    { roamingRoot: path.join(f.root, 'different-roaming') },
    { localRoot: path.join(f.root, 'different-local') },
  ]) {
    const result = run('Restore', f, options);
    assert.notEqual(result.status, 0);
    assert.equal(fs.existsSync(f.source), false);
    assert.equal(fs.existsSync(f.localProfile), false);
    assert.equal(fs.existsSync(path.join(f.stage, 'Local Storage', 'leveldb', '000003.log')), true);
  }
});

test('V5 UAC inner identity gate runs before the exact-app check', () => {
  const source = fs.readFileSync(installer, 'utf8');
  const init = source.slice(source.indexOf('!macro customInit'), source.indexOf('!macroend', source.indexOf('!macro customInit')));
  assert.match(init, /UAC_AsUser_GetGlobalVar \$FarmDashInitiatingSid/);
  assert.match(init, /UAC_AsUser_GetGlobalVar \$FarmDashInitiatingRoamingRoot/);
  assert.match(init, /UAC_AsUser_GetGlobalVar \$FarmDashInitiatingLocalRoot/);
  assert.ok(init.indexOf('$FarmDashCurrentSid != $FarmDashInitiatingSid') < init.indexOf('FarmDashV5CheckAppRunning'));
  assert.ok(init.indexOf('$FarmDashCurrentRoamingRoot != $FarmDashInitiatingRoamingRoot') < init.indexOf('FarmDashV5CheckAppRunning'));
  assert.ok(init.indexOf('$FarmDashCurrentLocalRoot != $FarmDashInitiatingLocalRoot') < init.indexOf('FarmDashV5CheckAppRunning'));
  assert.doesNotMatch(source.slice(source.indexOf('!macro FarmDashV5StageUpgradeSelection'), source.indexOf('!macroend', source.indexOf('!macro FarmDashV5StageUpgradeSelection'))), /UAC_IsInnerInstance/);
});
