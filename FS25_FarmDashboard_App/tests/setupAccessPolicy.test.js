const {
    isRemoteSetupAllowed,
    canAccessSetupPayload,
    wantsJsonSetupDenial,
    setupDeniedLocation,
    ERROR_SETUP_LOCAL_ONLY,
    ERROR_INVALID_TOKEN,
} = require('../setupAccessPolicy.cjs');

describe('setupAccessPolicy (local-first)', () => {
    test('localhost can read without a token', () => {
        expect(
            canAccessSetupPayload({}, { isLocalClient: true, requireToken: false })
        ).toEqual({ ok: true });
    });

    test('localhost write still needs a matching token', () => {
        const denied = canAccessSetupPayload(
            {},
            { isLocalClient: true, requireToken: true, tokenMatches: false }
        );
        expect(denied.ok).toBe(false);
        expect(denied.status).toBe(403);
        expect(denied.errorCode).toBe(ERROR_INVALID_TOKEN);
    });

    test('remote clients cannot read or write setup by default', () => {
        const read = canAccessSetupPayload(
            {},
            { isLocalClient: false, remoteAllowed: false, requireToken: false }
        );
        expect(read.ok).toBe(false);
        expect(read.errorCode).toBe(ERROR_SETUP_LOCAL_ONLY);
        expect(read.status).toBe(403);

        const write = canAccessSetupPayload(
            {},
            {
                isLocalClient: false,
                remoteAllowed: false,
                requireToken: true,
                tokenMatches: true,
            }
        );
        expect(write.ok).toBe(false);
        expect(write.errorCode).toBe(ERROR_SETUP_LOCAL_ONLY);
    });

    test('FARMDASH_ALLOW_REMOTE_SETUP=1 allows remote write only with token', () => {
        expect(isRemoteSetupAllowed({ FARMDASH_ALLOW_REMOTE_SETUP: '1' })).toBe(true);
        expect(isRemoteSetupAllowed({})).toBe(false);
        const ok = canAccessSetupPayload(
            {},
            {
                isLocalClient: false,
                remoteAllowed: true,
                requireToken: true,
                tokenMatches: true,
            }
        );
        expect(ok.ok).toBe(true);
        const noTok = canAccessSetupPayload(
            {},
            {
                isLocalClient: false,
                remoteAllowed: true,
                requireToken: true,
                tokenMatches: false,
            }
        );
        expect(noTok.errorCode).toBe(ERROR_INVALID_TOKEN);
    });

    test('HTML denials redirect; API denials are JSON', () => {
        expect(wantsJsonSetupDenial({ path: '/api/setup-config', headers: {} })).toBe(true);
        expect(wantsJsonSetupDenial({ path: '/setup.html', headers: { accept: 'text/html' } })).toBe(
            false
        );
        expect(
            wantsJsonSetupDenial({
                path: '/setup.html',
                headers: { accept: 'application/json' },
            })
        ).toBe(true);
        expect(setupDeniedLocation()).toBe('/?setup=local-only');
    });
});
