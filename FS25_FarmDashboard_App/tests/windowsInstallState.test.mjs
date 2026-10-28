import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { existsSync } from 'node:fs';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixture = path.join(root, 'tests/helpers/windows-install-state-runtime.ps1');
const powershell = process.env.FARMDASH_QA_POWERSHELL || 'powershell.exe';
function run(name) {
  const result = spawnSync(powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', fixture, '-SourceRoot', root, '-Case', name], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
  assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout);
  return JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
}
const options = { skip: process.platform !== 'win32' };
test('V5 registry transport sees and removes a Windows-visible per-user key', options, () => {
  const nativeFixture = path.join(root, 'tests/helpers/windows-install-state-native.ps1');
  const shells = [powershell, path.join(process.env.WINDIR || 'C:\\Windows',
    'SysWOW64', 'WindowsPowerShell', 'v1.0', 'powershell.exe')];
  // Exercise the same alias/canonical-path split as the hosted Windows runner.
  const env = { ...process.env, TEMP: path.join(process.env.TEMP || process.env.TMP || root, '.') };
  for (const shell of shells.filter((item, index) => index === 0 || existsSync(item))) {
    const result = spawnSync(shell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'RemoteSigned',
      '-File', nativeFixture, '-SourceRoot', root], { encoding: 'utf8', windowsHide: true, timeout: 30000, env });
    assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout);
    const state = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
    assert.equal(state.error, null, `${shell}: ${JSON.stringify(state)}`);
    assert.equal(state.readNativeValue, 'native-created');
    assert.equal(state.removedNativeKey, true);
    assert.equal(state.nativeSawHelperWrite, 'helper-created');
    assert.equal(state.removedHelperKey, true);
    assert.equal(state.localUninstallShadowRemoved, true);
    assert.equal(state.localInstallShadowRemoved, true);
    assert.equal(state.mismatchedShadowPreserved, true);
  }
});
for (const scope of ['user', 'machine']) {
  test(`V5 publishes a native ${scope} uninstall entry with the correct command`, options, () => {
    const state = run(scope);
    assert.equal(state.error, null);
    const key = Object.keys(state.records).find(key => key.includes('\\Uninstall\\'));
    assert.ok(key.startsWith(scope === 'machine' ? '2147483650:' : '2147483651:S-1-'));
    const entry = state.records[key];
    assert.equal(entry.DisplayName, 'FS25 Farm Dashboard V5 5.0.1');
    assert.match(entry.UninstallString, scope === 'machine' ? /" \/allusers$/ : /" \/currentuser$/);
    assert.equal(entry.SystemComponent, undefined);
    assert.equal(entry.NoRemove, undefined);
    assert.equal(entry.InstallDate, undefined);
    assert.equal(entry.InstallLocation, undefined);
    assert.equal(entry.EstimatedSize, 1234);
    assert.equal(state.uninstallWrites, 0, 'a native NSIS entry must be left untouched');
    assert.ok(Object.keys(state.records).every(key => key.endsWith('11de34ca-2bb0-58cf-bf02-9951a95a886c')));
  });
}
test('a missing Windows-visible NSIS entry is published through the native provider', options, () => {
  const state = run('native-missing');
  assert.equal(state.error, null);
  const key = Object.keys(state.records).find(key => key.includes('\\Uninstall\\'));
  assert.equal(state.records[key].DisplayName, 'FS25 Farm Dashboard V5 5.0.1');
  assert.ok(state.uninstallWrites > 0);
});
test('a partial Windows uninstall entry is refused rather than overwritten', options, () => {
  const state = run('native-partial');
  assert.match(state.error, /incomplete/);
  assert.equal(state.uninstallWrites, 0);
});
test('a prior V5 version at the same uninstall path upgrades its visible labels', options, () => {
  const state = run('native-previous-version');
  assert.equal(state.error, null);
  const key = Object.keys(state.records).find(key => key.includes('\\Uninstall\\'));
  assert.equal(state.records[key].DisplayName, 'FS25 Farm Dashboard V5 5.0.1');
  assert.equal(state.records[key].DisplayVersion, '5.0.1');
  assert.equal(state.uninstallWrites, 2);
});
test('a mismatched version label is repaired on the same verified installation', options, () => {
  const state = run('native-wrong-version');
  assert.equal(state.error, null);
  const key = Object.keys(state.records).find(key => key.includes('\\Uninstall\\'));
  assert.equal(state.records[key].DisplayVersion, '5.0.1');
  assert.equal(state.uninstallWrites, 2);
});
test('a successful write invisible to Windows fails setup', options, () => {
  assert.match(run('invisible-write').error, /cannot read back/);
});
test('a denied registration write fails setup instead of claiming success', options, () => {
  assert.match(run('denied-write').error, /exit 5/);
});
test('registration refuses another application identity before creating a private record', options, () => {
  const state = run('register-other-name');
  assert.match(state.error, /different application/);
  assert.ok(!state.calls.includes('CreateKey'));
});
test('registration refuses a different uninstall path before creating a private record', options, () => {
  const state = run('register-other-command');
  assert.match(state.error, /different installation/);
  assert.ok(!state.calls.includes('CreateKey'));
});
test('Windows return 1 is accepted only when enumeration proves a value is absent', options, () => {
  const state = run('missing-optional-value');
  assert.equal(state.error, null);
  assert.equal(state.optionalValue, null);
  assert.ok(state.calls.includes('EnumValues'));
});
test('a failed read of an existing value is not disguised as an absent value', options, () => {
  assert.match(run('existing-value-read-error').error, /DisplayName, exit 1/);
});
test('an access-denied read remains an error', options, () => {
  assert.match(run('read-access-denied').error, /DisplayName, exit 5/);
});
test('failed enumeration cannot prove that an optional value is absent', options, () => {
  assert.match(run('enumeration-access-denied').error, /AbsentOptionalValue, exit 1/);
});
test('a registry value with the wrong type is not treated as missing', options, () => {
  assert.match(run('wrong-value-type').error, /NoModify, exit 1/);
});
test('uninstall registration is retained while the application still exists', options, () => {
  const state = run('remove-live');
  assert.match(state.error, /files remain/);
  assert.equal(Object.keys(state.records).length, 2);
  assert.ok(!state.calls.includes('DeleteKey'));
});
test('only the matching V5 records are removed after application removal', options, () => {
  const state = run('remove');
  assert.equal(state.error, null);
  assert.equal(Object.keys(state.records).length, 0);
});
test('registration belonging to a different installation is never removed', options, () => {
  const state = run('remove-other');
  assert.match(state.error, /different installation/);
  assert.ok(!state.calls.includes('DeleteKey'));
});
test('V5 dependency ownership is read from the Windows-visible record', options, () => {
  const state = run('ownership');
  assert.equal(state.error, null);
  assert.equal(state.ownership.flag, '1');
  assert.equal(state.ownership.executable, 'C:\\ImageMagick-fixture\\magick.exe');
  assert.equal(state.ownership.recovery, false);
});
test('retired ownership cannot be resurrected from an old private record', options, () => {
  const state = run('retired-ownership');
  assert.equal(state.error, null);
  assert.equal(state.ownership.flag, '0');
  assert.equal(state.ownership.executable, null);
  assert.equal(state.ownership.recovery, false);
});
test('the Full-uninstall preflight cannot launch removal or clear ownership', options, () => {
  const state = run('preflight-only');
  assert.equal(state.error, null);
  assert.equal(state.preflightExitCode, 0);
});
