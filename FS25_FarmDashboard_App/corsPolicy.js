// FS25 FarmDashboard | corsPolicy.js
// Pure (no electron / os) origin-allow logic so it can be unit-tested.
// Rule: only allow loopback, THIS machine's own NIC IPs (on the dashboard port),
// and the marketing site hosts. Never "any host on the dashboard port" — that let an
// attacker page served on :PORT read loopback data cross-origin.

const LOOPBACK_HOST_NAMES = new Set(['localhost', '127.0.0.1', '::1']);

/** Lowercase + strip IPv4-mapped IPv6 prefix so host comparisons are stable. */
function normalizeHost(host) {
    let s = String(host || '').trim().toLowerCase();
    if (s.startsWith('::ffff:')) s = s.slice(7);
    return s;
}

function toSet(val) {
    const src = val instanceof Set ? val : (val || []);
    const out = new Set();
    for (const x of src) out.add(normalizeHost(x));
    return out;
}

/** True when `hostname` is loopback or one of this machine's own IPs. */
function isLocalServerHost(hostname, localIps) {
    const host = normalizeHost(hostname);
    if (!host) return false;
    if (LOOPBACK_HOST_NAMES.has(host)) return true;
    return toSet(localIps).has(host);
}

/**
 * @param {string} origin       Origin header value (may be empty for same-origin / curl).
 * @param {object} opts
 * @param {string|number} opts.port           dashboard port
 * @param {Set|string[]} opts.marketingHosts  authorized public domains
 * @param {Set|string[]} opts.localIps        this machine's NIC IPs
 * @returns {boolean}
 */
function isCorsOriginAllowed(origin, opts = {}) {
    if (!origin) return true; // same-origin / native fetch with no Origin header
    const marketingHosts = toSet(opts.marketingHosts);
    try {
        const u = new URL(origin);
        const host = normalizeHost(u.hostname);
        if (marketingHosts.has(host)) return true;
        const p = u.port || (u.protocol === 'https:' ? '443' : '80');
        if (isLocalServerHost(host, opts.localIps) && String(p) === String(opts.port)) {
            return true;
        }
    } catch (_) {
        /* malformed origin → reject */
    }
    return false;
}

module.exports = {
    LOOPBACK_HOST_NAMES,
    normalizeHost,
    isLocalServerHost,
    isCorsOriginAllowed,
};
