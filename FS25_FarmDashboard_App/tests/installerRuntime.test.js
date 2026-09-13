'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const root = path.resolve(__dirname, '..');
const windows = process.platform === 'win32' ? describe : describe.skip;

windows('Windows installer runtime regressions', () => {
  let results;
  beforeAll(() => {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'farmdash-installer-runtime-'));
    const exe = process.env.FARMDASH_QA_POWERSHELL || 'powershell.exe';
    const run = cp.spawnSync(exe, ['-NoProfile', '-NonInteractive', '-File',
      path.join(__dirname, 'helpers/installer-runtime.ps1'), '-BuildRoot', path.join(root, 'build'),
      '-FixtureRoot', fixture], { windowsHide: true, encoding: 'utf8', timeout: 60000 });
    const output = String(run.stdout || '') + String(run.stderr || '');
    fs.writeFileSync(path.join(fixture, 'test-output.log'), output);
    if (run.error || run.status !== 0) throw new Error('Installer fixture failed: ' + (run.error?.message || output));
    const row = output.split(/\r?\n/).find(line => line.startsWith('RESULT_JSON='));
    if (!row) throw new Error('No installer fixture receipt: ' + output);
    results = JSON.parse(row.slice('RESULT_JSON='.length));
  }, 65000);
  test('Keep retains settings and snapshots but removes disposable caches', () => {
    expect(results.keepExit).toBe(0);
    expect(results.keepConfig).toBe(true);
    expect(results.keepSnapshots).toBe(true);
    expect(results.keepCacheRemoved).toBe(true);
    expect(results.keepLocalRemoved).toBe(true);
  });
  test('Full removes its profile and respects the Rf alias', () => {
    expect(results.fullExit).toBe(0);
    expect(results.fullRemoved).toBe(true);
    expect(results.aliasExit).toBe(0);
    expect(results.aliasRemoved).toBe(true);
  });
  test('every profile cleanup case preserves Classic and unrelated data', () => {
    expect(results.otherProfilesIntact).toBe(true);
  });
  test('locked Full cleanup fails honestly and remains retryable', () => {
    expect(results.lockedExit).not.toBe(0);
    expect(results.lockedRemains).toBe(true);
    expect(results.retryExit).toBe(0);
    expect(results.retryRemoved).toBe(true);
  });
  test('existing ImageMagick avoids reinstall and permission requests', () => {
    expect(results.existingInstall.code).toBe(0);
    expect(results.existingInstall.started).toBe(0);
    expect(results.existingInstall.administratorChecks).toBe(0);
    expect(results.existingInstall.ownershipWrites).toBe(0);
  });
  test('repair upgrades legacy Dashboard ownership without reinstalling ImageMagick', () => {
    expect(results.existingOwnedInstall.code).toBe(0);
    expect(results.existingOwnedInstall.started).toBe(0);
    expect(results.existingOwnedInstall.administratorChecks).toBe(0);
    expect(results.existingOwnedInstall.ownershipWrites).toBe(1);
  });
  test('cold 32-bit-style discovery finds native 64-bit ImageMagick without PATH', () => {
    expect(results.native64Discovered).toBe(true);
    expect(results.native64CandidateCount).toBe(1);
    expect(results.duplicateRootsCandidateCount).toBe(1);
  });
  test('unknown legacy installation location cannot be treated as confirmed absence', () => {
    expect(results.legacyMissingThrows).toBe(true);
  });
  test('missing elevation installs ImageMagick through a visible permission prompt', () => {
    expect(results.noAdminInstall.code).toBe(0);
    expect(results.noAdminInstall.started).toBe(1);
    expect(results.noAdminInstall.elevatedStarts).toBe(1);
    expect(results.noAdminInstall.ownershipWrites).toBe(1);
  });
  test.each(['externalRemoval', 'sharedRemoval'])('%s preserves the dependency and ownership', key => {
    expect(results[key].code).toBe(0);
    expect(results[key].started).toBe(0);
    expect(results[key].cleared).toBe(false);
  });
  test('owned dependency removal checks permissions before launching', () => {
    expect(results.noAdminRemoval.code).toBe(740);
    expect(results.noAdminRemoval.started).toBe(0);
    expect(results.noAdminRemoval.cleared).toBe(false);
  });
  test.each(['cancelledRemoval', 'timedOutRemoval'])('%s retains ownership', key => {
    expect(results[key].code).not.toBe(0);
    expect(results[key].cleared).toBe(false);
  });
  test('a false-success dependency uninstaller cannot clear ownership', () => {
    expect(results.remainingRemoval.threw).toBe(true);
    expect(results.remainingRemoval.cleared).toBe(false);
  });
  test('confirmed owned removal clears ownership only after the executable disappears', () => {
    expect(results.successfulRemoval.code).toBe(0);
    expect(results.successfulRemoval.started).toBe(1);
    expect(results.successfulRemoval.cleared).toBe(true);
  });
  test('uninstaller identity changes fail closed', () => {
    expect(results.changedUninstaller.threw).toBe(true);
    expect(results.changedUninstaller.started).toBe(0);
    expect(results.changedUninstaller.cleared).toBe(false);
  });
  test('dependency child processes have an actual bounded wait', () => {
    expect(results.timeoutExit).toBe(1460);
    expect(results.timeoutElapsedMs).toBeLessThan(10000);
  });
});

test('NSIS propagates cleanup failures before built-in file removal', () => {
  const nsis = fs.readFileSync(path.join(root, 'build/installer.nsh'), 'utf8');
  expect(nsis).toContain('SetErrorLevel 1');
  expect(nsis).toContain('!insertmacro FarmDashAssertCleanupSuccess "User profile cleanup"');
  expect(nsis).toContain('!insertmacro FarmDashAssertCleanupSuccess "ImageMagick removal"');
  expect(nsis).toContain('-Edition $R4 -CheckOnly');
  expect(nsis).toContain('ExecShell "runas"');
  expect(nsis).toContain('!define APP_PACKAGE_NAME "fs25-farm-dashboard-rf"');
  const languageLeave = nsis.split('Function FarmDashLangPageLeave')[1].split('FunctionEnd')[0];
  expect(languageLeave).not.toContain('CreateDirectory "$APPDATA');
});

test('both packaging definitions include the shared dependency helper', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  expect(pkg.build.extraResources).toContainEqual({
    from: 'build/imagemagick-common.ps1', to: 'imagemagick-common.ps1',
  });
  expect(pkg.build.extraResources).toContainEqual({
    from: 'build/windows-install-state.ps1', to: 'windows-install-state.ps1',
  });
  const rfYml = fs.readFileSync(path.join(root, 'electron-builder.rf.yml'), 'utf8');
  expect(rfYml).toContain('from: build/imagemagick-common.ps1');
  expect(rfYml).toContain('from: build/windows-install-state.ps1');
});

test('all-users customInstall writes install-locale.txt in the current-user profile', () => {
  const nsis = fs.readFileSync(path.join(root, 'build/installer.nsh'), 'utf8');
  const customInstall = nsis.split('!macro customInstall')[1].split('!macroend')[0];
  expect(customInstall).toContain('install-locale.txt');
  expect(customInstall).toMatch(/\$installMode == "all"/);
  expect(customInstall).toContain('SetShellVarContext current');
  expect(customInstall).toContain('SetShellVarContext all');
});
