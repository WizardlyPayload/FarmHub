'use strict';

const fs = require('fs');
const path = require('path');

const nsh = fs.readFileSync(path.join(__dirname, '..', 'build', 'installer.nsh'), 'utf8');
const ps1 = fs.readFileSync(path.join(__dirname, '..', 'build', 'uninstall-user-data.ps1'), 'utf8');

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
});
