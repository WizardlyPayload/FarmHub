'use strict';

/**
 * Setup wizard access policy (local-first).
 * Remote LAN clients may view the dashboard; they must not load or write setup
 * unless FARMDASH_ALLOW_REMOTE_SETUP=1 (lab / advanced only).
 */

const ERROR_SETUP_LOCAL_ONLY = 'E_SETUP_LOCAL_ONLY';
const ERROR_INVALID_TOKEN = 'E_INVALID_TOKEN';

const LOCAL_ONLY_MESSAGE = 'Setup is only available on the PC running Farm Dashboard.';

function isRemoteSetupAllowed(env) {
    const src = env || (typeof process !== 'undefined' ? process.env : {});
    return String(src.FARMDASH_ALLOW_REMOTE_SETUP || '') === '1';
}

/**
 * @param {object} [_req]
 * @param {{ isLocalClient?: boolean, tokenMatches?: boolean, remoteAllowed?: boolean, requireToken?: boolean }} [opts]
 */
function canAccessSetupPayload(_req, opts) {
    const o = opts || {};
    const local = !!o.isLocalClient;
    const remoteAllowed = o.remoteAllowed === true;
    const requireToken = o.requireToken === true;
    const tokenMatches = !!o.tokenMatches;

    if (!local && !remoteAllowed) {
        return {
            ok: false,
            status: 403,
            errorCode: ERROR_SETUP_LOCAL_ONLY,
            error: LOCAL_ONLY_MESSAGE,
        };
    }
    if (requireToken && !tokenMatches) {
        return {
            ok: false,
            status: 403,
            errorCode: ERROR_INVALID_TOKEN,
            error: 'Forbidden',
        };
    }
    return { ok: true };
}

function wantsJsonSetupDenial(req) {
    const accept = String((req && req.headers && req.headers.accept) || '');
    const pathOnly = String((req && (req.path || req.url)) || '').split('?')[0];
    if (pathOnly.startsWith('/api/')) return true;
    return /application\/json/i.test(accept);
}

function setupDeniedLocation() {
    return '/?setup=local-only';
}

module.exports = {
    ERROR_SETUP_LOCAL_ONLY,
    ERROR_INVALID_TOKEN,
    LOCAL_ONLY_MESSAGE,
    isRemoteSetupAllowed,
    canAccessSetupPayload,
    wantsJsonSetupDenial,
    setupDeniedLocation,
};
