'use strict';

const fs = require('fs');
const path = require('path');

const nsh = fs.readFileSync(path.join(__dirname, '..', 'build', 'installer.nsh'), 'utf8');
const ps1 = fs.readFileSync(path.join(__dirname, '..', 'build', 'uninstall-user-data.ps1'), 'utf8');
const deps = fs.readFileSync(path.join(__dirname, '..', 'build', 'uninstall-dependencies.ps1'), 'utf8');
const magickCommon = fs.readFileSync(path.join(__dirname, '..', 'build', 'imagemagick-common.ps1'), 'utf8');

describe('installer / uninstall edition ownership', () => {
    test('language combo defaults to English when nothing was saved', () => {
        expect(nsh).toMatch(/StrCmp \$FarmDashSavedLang "" FarmDashPrefillEnglish/);
        expect(nsh).toMatch(/FarmDashPrefillEnglish:/);
    });

    test('uninstall invokes PowerShell with a V4/V5 edition argument', () => {
        expect(nsh).toMatch(/-Mode Full -Edition \$R4/);
        expect(nsh).toMatch(/-Mode Keep -Edition \$R4/);
        expect(nsh).toMatch(/StrCpy \$R4 "V4"/);
        expect(nsh).toMatch(/StrCpy \$R4 "V5"/);
        expect(nsh).not.toMatch(/StrCpy \$R4 "Classic"/);
        expect(nsh).not.toMatch(/StrCpy \$R4 "Rf"/);
    });

    test('V5 uninstall script path never enumerates V4 profile names', () => {
        expect(ps1).toMatch(/ValidateSet\('Classic', 'Rf', 'V4', 'V5'\)/);
        const v5Block = ps1.split('if (Test-IsV5Edition $EditionName)')[1].split('} else {')[0];
        expect(v5Block).toMatch(/fs25-farm-dashboard-rf/);
        expect(v5Block).not.toMatch(/'fs25-farm-dashboard'/);
        expect(v5Block).not.toMatch(/com\.farmdashboard\.app/);
    });

    test('legacy V5 uninstall dirs do not delete V4 AppData', () => {
        const rfLegacy = nsh.split('FarmDash_UnFullLegacyRf:')[1].split('FarmDash_UnFullLegacyClassic:')[0];
        expect(rfLegacy).toMatch(/fs25-farm-dashboard-rf/);
        expect(rfLegacy).not.toMatch(/RMDir \/r "\$APPDATA\\fs25-farm-dashboard"/);
    });

    test('current-user setup still installs ImageMagick via a visible permission prompt', () => {
        expect(nsh).toMatch(/-AllowElevation -Edition \$R4/);
        expect(nsh).not.toMatch(/Skipping ImageMagick on current-user setup/);
        const magick = nsh.split('FarmDash_RunMagick:')[1].split('FarmDash_MagickDone:')[0];
        expect(magick).toMatch(/install-imagemagick\.ps1/);
        expect(magick).toMatch(/\$R0 == "1223"/);
    });

    test('V5 registration still runs when EstimatedSize is missing', () => {
        const block = nsh.split('!macro customInstall')[1].split('!macroend')[0];
        expect(block).toMatch(/ReadRegDWORD \$R5 SHELL_CONTEXT "\$\{UNINSTALL_REGISTRY_KEY\}" "EstimatedSize"/);
        expect(block).toMatch(/StrCpy \$R5 "0"/);
        expect(block).toMatch(/-EstimatedSizeKB \$R5/);
    });

    test('V4 Full uninstall gets the same 740 UAC relaunch as V5', () => {
        const unInit = nsh.split('!macro customUnInit')[1].split('!macroend')[0];
        expect(unInit).toMatch(/-Edition \$R4 -CheckOnly/);
        expect(unInit).toMatch(/\$R0 == "740"/);
        expect(unInit).toMatch(/ExecShell "runas"/);
        expect(unInit).toMatch(/--delete-app-data/);
        expect(unInit).not.toMatch(/!if "\$\{APP_ID\}" == "com\.farmdashboard\.rf"/);
        expect(unInit).not.toMatch(/-Edition V5 -CheckOnly/);
    });

    test('V4 other-edition detection uses native 64-bit registry views', () => {
        expect(deps).toMatch(/\. \(Join-Path \$PSScriptRoot 'windows-install-state\.ps1'\)/);
        expect(magickCommon).toMatch(/Get-FarmDashRegistryArguments/);
        expect(magickCommon).toMatch(/RegistryView\]::Registry64/);
        expect(magickCommon).toMatch(/OpenBaseKey/);
        const otherFn = magickCommon.split('function Test-OtherDashboardInstalled')[1].split('function Register-DependencyConsumer')[0];
        expect(otherFn).not.toMatch(/FarmDashNativeDependencyRegistry/);
        expect(otherFn).not.toMatch(/Get-ItemProperty -LiteralPath \$key/);
        expect(otherFn).toMatch(/ReturnValue -eq 1/);
        expect(otherFn).toMatch(/EnumValues/);
        expect(otherFn).not.toMatch(/-notin @\(0, 2\)/);
    });

    test('V4 extraResources ships windows-install-state.ps1 for Full uninstall', () => {
        const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
        expect(pkg.build.extraResources).toEqual(expect.arrayContaining([
            { from: 'build/windows-install-state.ps1', to: 'windows-install-state.ps1' },
        ]));
        const unInstall = nsh.split('!macro customUnInstall')[1].split('!macroend')[0];
        expect(unInstall).toMatch(/windows-install-state\.ps1/);
        expect(deps).toMatch(/windows-install-state\.ps1/);
    });
});
