// FS25 FarmDashboard | modVersionPolicy.js | v4.0.0
//
// Compares the in-game mod version (from data.json serverInfo.modVersion) against
// the minimum version this desktop app release supports.

/** Minimum FS25 Farm Dashboard mod version for full compatibility with this app line. */
const MIN_MOD_VERSION = '2.3.0.0';

/**
 * @param {string|null|undefined} version
 * @returns {number[]}
 */
function parseModVersionParts(version) {
    return String(version || '')
        .trim()
        .split('.')
        .map((p) => {
            const n = parseInt(p, 10);
            return Number.isFinite(n) ? n : 0;
        });
}

/**
 * Giants-style dotted version compare (e.g. 2.3.0.0).
 * @returns {number} negative if a < b, positive if a > b, 0 if equal
 */
function compareModVersions(a, b) {
    const pa = parseModVersionParts(a);
    const pb = parseModVersionParts(b);
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
        const diff = (pa[i] || 0) - (pb[i] || 0);
        if (diff !== 0) return diff;
    }
    return 0;
}

/**
 * @param {string|null|undefined} actualVersion — from live data.json
 * @returns {{ status: 'ok'|'outdated'|'unknown', actual: string|null, expectedMin: string }}
 */
function assessModVersion(actualVersion) {
    const expectedMin = MIN_MOD_VERSION;
    const actual =
        actualVersion != null && String(actualVersion).trim() !== ''
            ? String(actualVersion).trim()
            : null;

    if (!actual) {
        return { status: 'unknown', actual: null, expectedMin };
    }
    if (compareModVersions(actual, expectedMin) < 0) {
        return { status: 'outdated', actual, expectedMin };
    }
    return { status: 'ok', actual, expectedMin };
}

module.exports = {
    MIN_MOD_VERSION,
    parseModVersionParts,
    compareModVersions,
    assessModVersion,
};
