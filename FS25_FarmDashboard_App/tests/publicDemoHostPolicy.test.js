'use strict';

const policy = require('../publicDemoHostPolicy.cjs');

describe('public demo host policy', () => {
    test('only the exact demo name on no port, 80 or 443 is a demo host', () => {
        for (const host of ['demo.farmdashboard.co.uk', 'DEMO.FARMDASHBOARD.CO.UK', 'demo.farmdashboard.co.uk:443', 'demo.farmdashboard.co.uk:80']) {
            expect(policy.isPublicDemoHost(host)).toBe(true);
        }
        for (const host of [
            '', undefined, null, 'localhost:8768', '127.0.0.1:8768', 'demo.farmdashboard.co.uk:8768', 'demo.farmdashboard.co.uk:0',
            'demo.farmdashboard.co.uk.', 'xdemo.farmdashboard.co.uk', 'a.demo.farmdashboard.co.uk', 'demo.farmdashboard.co.uk.attacker.invalid',
            'farmdashboard.co.uk', 'www.farmdashboard.co.uk', 'demo.farmdashboard.co.uk@attacker.invalid', '*.farmdashboard.co.uk', 'demo.farmdashboard.co.uk:443:443',
        ]) {
            expect(policy.isPublicDemoHost(host)).toBe(false);
        }
    });

    test('a demo origin is the demo host over http or https with no path or credentials', () => {
        expect(policy.isPublicDemoOrigin('https://demo.farmdashboard.co.uk')).toBe(true);
        expect(policy.isPublicDemoOrigin('http://demo.farmdashboard.co.uk')).toBe(true);
        for (const origin of ['', 'null', 'https://demo.farmdashboard.co.uk:8768', 'https://farmdashboard.co.uk', 'ws://demo.farmdashboard.co.uk',
            'https://demo.farmdashboard.co.uk.attacker.invalid', 'https://user:pw@demo.farmdashboard.co.uk', 'not a url']) {
            expect(policy.isPublicDemoOrigin(origin)).toBe(false);
        }
    });

    test('demo requests may read dashboard data and the page shell, nothing else', () => {
        for (const p of ['/api/status', '/api/servers', '/api/data', '/API/DATA/', '/api/vehicles', '/api/map-overview-image', '/api/livestock/12']) {
            expect(policy.demoRequestAllowed('GET', p)).toBe(true);
            expect(policy.demoRequestAllowed('HEAD', p)).toBe(true);
        }
        for (const p of ['/', '/index.html', '/assets/index.js', '/simhub.html']) expect(policy.demoRequestAllowed('GET', p)).toBe(true);
        for (const p of ['/api/setup-config', '/api/setup-status', '/api/setup-handshake', '/api/lan-ws-token', '/api/simhub-session',
            '/api/simhub-view-config', '/api/export-mod-store-images', '/api/livestock/1/request', '/api', '/api/whatever', '/setup.html', '/SETUP.HTML']) {
            expect(policy.demoRequestAllowed('GET', p)).toBe(false);
        }
        for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
            expect(policy.demoRequestAllowed(method, '/api/data')).toBe(false);
            expect(policy.demoRequestAllowed(method, '/')).toBe(false);
        }
    });

    test('demo map results carry no local paths or raw exception text', () => {
        const out = policy.redactMapResultForDemo({
            ok: false,
            error: "ENOENT: no such file 'C:\\Users\\someone\\Documents'",
            sourcePath: 'C:\\x\\overview.dds',
            modsFoldersChecked: ['C:\\x\\mods'],
            mapSlug: 'fixture',
        });
        expect(out).toEqual({ ok: false, error: 'overview_failed', mapSlug: 'fixture' });
        expect(policy.redactMapResultForDemo({ ok: false, error: 'overview_not_found' }).error).toBe('overview_not_found');
        expect(policy.redactMapResultForDemo({ ok: true, url: '/map-overview-cache/a.png', sourcePath: 'C:\\a' })).toEqual({ ok: true, url: '/map-overview-cache/a.png' });
    });
});
