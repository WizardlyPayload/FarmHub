const {
    isCorsOriginAllowed,
    isLocalServerHost,
    normalizeHost,
} = require('../corsPolicy');

const PORT = 8766;
const MARKETING = new Set(['farmdashboard.co.uk', 'www.farmdashboard.co.uk', 'demo.farmdashboard.co.uk']);
const LOCAL_IPS = new Set(['192.168.1.50', '10.0.0.5']);

const opts = { port: PORT, marketingHosts: MARKETING, localIps: LOCAL_IPS };

describe('corsPolicy.isCorsOriginAllowed', () => {
    test('allows empty origin (same-origin / native fetch)', () => {
        expect(isCorsOriginAllowed('', opts)).toBe(true);
        expect(isCorsOriginAllowed(undefined, opts)).toBe(true);
    });

    test('allows loopback on the dashboard port', () => {
        expect(isCorsOriginAllowed(`http://localhost:${PORT}`, opts)).toBe(true);
        expect(isCorsOriginAllowed(`http://127.0.0.1:${PORT}`, opts)).toBe(true);
    });

    test('allows this machine LAN IP on the dashboard port', () => {
        expect(isCorsOriginAllowed(`http://192.168.1.50:${PORT}`, opts)).toBe(true);
    });

    test('allows authorized marketing domains', () => {
        expect(isCorsOriginAllowed('https://farmdashboard.co.uk', opts)).toBe(true);
        expect(isCorsOriginAllowed('https://www.farmdashboard.co.uk', opts)).toBe(true);
        expect(isCorsOriginAllowed('https://demo.farmdashboard.co.uk', opts)).toBe(true);
    });

    test('REJECTS arbitrary attacker host even on the dashboard port (the C1 exploit)', () => {
        expect(isCorsOriginAllowed(`http://attacker.example:${PORT}`, opts)).toBe(false);
        expect(isCorsOriginAllowed(`https://evil.farmdashboard.co.uk.attacker.com:${PORT}`, opts)).toBe(false);
        expect(isCorsOriginAllowed(`http://farmdashboard.co.uk.evil.com:${PORT}`, opts)).toBe(false);
    });

    test('rejects a non-local host on a non-dashboard port', () => {
        expect(isCorsOriginAllowed('http://attacker.example:9999', opts)).toBe(false);
    });

    test('rejects a local IP on the wrong port', () => {
        expect(isCorsOriginAllowed('http://192.168.1.50:9999', opts)).toBe(false);
    });

    test('rejects malformed origins', () => {
        expect(isCorsOriginAllowed('not a url', opts)).toBe(false);
        expect(isCorsOriginAllowed('javascript:alert(1)', opts)).toBe(false);
    });
});

describe('corsPolicy.isLocalServerHost', () => {
    test('loopback names are always local', () => {
        expect(isLocalServerHost('localhost', LOCAL_IPS)).toBe(true);
        expect(isLocalServerHost('127.0.0.1', LOCAL_IPS)).toBe(true);
        expect(isLocalServerHost('::1', LOCAL_IPS)).toBe(true);
    });

    test('own NIC IPs are local; others are not', () => {
        expect(isLocalServerHost('10.0.0.5', LOCAL_IPS)).toBe(true);
        expect(isLocalServerHost('8.8.8.8', LOCAL_IPS)).toBe(false);
    });

    test('normalizes IPv4-mapped IPv6 and case', () => {
        expect(normalizeHost('::ffff:192.168.1.50')).toBe('192.168.1.50');
        expect(normalizeHost('LOCALHOST')).toBe('localhost');
    });
});
