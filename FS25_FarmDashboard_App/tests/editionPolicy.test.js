'use strict';

const path = require('path');
const {
    resolveProductLine,
    resolvePort,
    profileDirName,
    appUserModelId,
    otherEditionPort,
    uninstallProfileNames,
    sanitizeClassicConfigForRf,
    isTrustedDashboardIpcUrl,
    isV5ProductLine,
    windowTitle,
    productShortName,
    CLASSIC_PORT,
    RF_PORT,
    DEV_PORT,
} = require('../editionPolicy.cjs');

describe('editionPolicy', () => {
    test('packaged V5 extraMetadata is v5; legacy rf stamps also map to v5; source tree is classic (V4)', () => {
        expect(resolveProductLine({ pkg: { productLine: 'v5' }, envProductLine: '' })).toBe('v5');
        expect(resolveProductLine({ pkg: { productLine: 'rf' }, envProductLine: '' })).toBe('v5');
        expect(resolveProductLine({ pkg: {}, envProductLine: '' })).toBe('classic');
        expect(resolveProductLine({ pkg: {}, envProductLine: 'rf' })).toBe('v5');
        expect(resolveProductLine({ pkg: {}, envProductLine: 'v5' })).toBe('v5');
        expect(isV5ProductLine('rf')).toBe(true);
        expect(isV5ProductLine('v5')).toBe(true);
        expect(isV5ProductLine('classic')).toBe(false);
    });

    test('ports: V4 8766, V5 8768, dev 8767; FARMDASH_PORT wins', () => {
        expect(resolvePort({ isDev: false, productLine: 'classic', envPort: '' })).toBe(CLASSIC_PORT);
        expect(resolvePort({ isDev: false, productLine: 'v5', envPort: '' })).toBe(RF_PORT);
        expect(resolvePort({ isDev: false, productLine: 'rf', envPort: '' })).toBe(RF_PORT);
        expect(resolvePort({ isDev: true, productLine: 'v5', envPort: '' })).toBe(DEV_PORT);
        expect(resolvePort({ isDev: false, productLine: 'v5', envPort: '9001' })).toBe(9001);
        expect(resolvePort({ isDev: false, productLine: 'classic', envPort: 'nope' })).toBe(CLASSIC_PORT);
    });

    test('profile names do not overlap between V4 and V5', () => {
        expect(profileDirName('classic', false)).toBe('fs25-farm-dashboard');
        expect(profileDirName('v5', false)).toBe('fs25-farm-dashboard-rf');
        expect(profileDirName('rf', false)).toBe('fs25-farm-dashboard-rf');
        expect(profileDirName('classic', true)).toBe('fs25-farm-dashboard-dev');
        expect(profileDirName('v5', true)).toBe('fs25-farm-dashboard-rf-dev');
        expect(appUserModelId('classic')).toBe('com.farmdashboard.app');
        expect(appUserModelId('v5')).toBe('com.farmdashboard.rf');
        expect(otherEditionPort('v5')).toBe(CLASSIC_PORT);
        expect(otherEditionPort('classic')).toBe(RF_PORT);
    });

    test('V5 uninstall allowlist never includes V4 profile names', () => {
        const v5 = uninstallProfileNames('v5');
        const v5Alias = uninstallProfileNames('rf');
        const classic = uninstallProfileNames('classic');
        expect(v5).toEqual(v5Alias);
        for (const n of v5.roaming.concat(v5.local)) {
            expect(n.includes('farm-dashboard-rf') || n.includes('farmdashboard.rf')).toBe(true);
            expect(classic.roaming).not.toContain(n);
        }
        expect(classic.roaming).toContain('fs25-farm-dashboard');
        expect(classic.roaming).not.toContain('fs25-farm-dashboard-rf');
    });

    test('user-facing titles are V4 / V5, not RF edition', () => {
        expect(windowTitle({ productLine: 'v5' })).toBe('FS25 Farm Dashboard V5');
        expect(windowTitle({ productLine: 'rf' })).toBe('FS25 Farm Dashboard V5');
        expect(windowTitle({ productLine: 'classic' })).toBe('FS25 Farm Dashboard V4');
        expect(productShortName('v5')).toBe('Farm Dashboard V5');
        expect(productShortName('classic')).toBe('Farm Dashboard V4');
    });

    test('V4→V5 import copies saves and drops secrets / LAN / feed codes', () => {
        const sanitized = sanitizeClassicConfigForRf({
            isConfigured: true,
            servers: [
                {
                    id: 'srv_montana',
                    name: 'Montana Save 1',
                    mode: 'local',
                    localSubFolder: 'savegame1',
                    ftpPass: 'secret',
                    httpFeedCode: 'abc',
                },
            ],
            ftpPolling: { intervalMinutes: 5, scheduleMode: 'sync' },
            lanUsername: 'admin',
        });
        expect(sanitized.isConfigured).toBe(true);
        expect(sanitized.servers).toHaveLength(1);
        expect(sanitized.servers[0].id).toBe('srv_montana');
        expect(sanitized.servers[0].ftpPass).toBeUndefined();
        expect(sanitized.servers[0].httpFeedCode).toBeUndefined();
        expect(sanitized.lanUsername).toBeUndefined();
        expect(sanitized.ftpPolling.intervalMinutes).toBe(5);
        expect(sanitizeClassicConfigForRf({ servers: [] })).toBeNull();
    });

    test('IPC origin allowlist is loopback dashboard or local setup/index file', () => {
        const port = 8768;
        expect(isTrustedDashboardIpcUrl('http://127.0.0.1:8768/setup.html', { port })).toBe(true);
        expect(isTrustedDashboardIpcUrl('http://127.0.0.1:8768/', { port })).toBe(true);
        expect(isTrustedDashboardIpcUrl('http://127.0.0.1:8766/', { port })).toBe(false);
        expect(isTrustedDashboardIpcUrl('http://192.168.1.9:8768/', { port })).toBe(false);
        expect(isTrustedDashboardIpcUrl('https://evil.example/', { port })).toBe(false);
        const setupFileV5 = 'file:///' + path.win32.normalize('C:/Program Files/FS25 Farm Dashboard V5/resources/app.asar/setup.html').replace(/\\/g, '/');
        expect(isTrustedDashboardIpcUrl(setupFileV5.replace(/\\/g, '/'), { port, appDirectory: 'C:/Program Files/FS25 Farm Dashboard V5/resources/app.asar' })).toBe(true);
        const setupFileLegacyRf = 'file:///' + path.win32.normalize('C:/Program Files/FS25 Farm Dashboard RF/resources/app.asar/setup.html').replace(/\\/g, '/');
        expect(isTrustedDashboardIpcUrl(setupFileLegacyRf.replace(/\\/g, '/'), { port, appDirectory: 'C:/Program Files/FS25 Farm Dashboard RF/resources/app.asar' })).toBe(true);
        expect(isTrustedDashboardIpcUrl('file:///C:/tmp/notes.html', { port })).toBe(false);
    });
});
