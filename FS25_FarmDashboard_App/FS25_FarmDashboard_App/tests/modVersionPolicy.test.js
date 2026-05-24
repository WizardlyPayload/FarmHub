// FS25 FarmDashboard | tests/modVersionPolicy.test.js | v4.0.0

const {
    MIN_MOD_VERSION,
    compareModVersions,
    assessModVersion,
} = require('../modVersionPolicy.js');

describe('compareModVersions', () => {
    test('equal versions compare as 0', () => {
        expect(compareModVersions('2.3.0.0', '2.3.0.0')).toBe(0);
    });

    test('patch segment ordering', () => {
        expect(compareModVersions('2.3.0.1', '2.3.0.0')).toBeGreaterThan(0);
        expect(compareModVersions('2.2.9.9', '2.3.0.0')).toBeLessThan(0);
    });

    test('shorter strings pad with zero', () => {
        expect(compareModVersions('2.3', '2.3.0.0')).toBe(0);
    });
});

describe('assessModVersion', () => {
    test('current line version is ok', () => {
        expect(assessModVersion(MIN_MOD_VERSION)).toEqual({
            status: 'ok',
            actual: MIN_MOD_VERSION,
            expectedMin: MIN_MOD_VERSION,
        });
    });

    test('newer mod is ok', () => {
        const res = assessModVersion('2.4.0.0');
        expect(res.status).toBe('ok');
        expect(res.actual).toBe('2.4.0.0');
    });

    test('older mod is outdated', () => {
        const res = assessModVersion('2.2.0.0');
        expect(res.status).toBe('outdated');
        expect(res.actual).toBe('2.2.0.0');
        expect(res.expectedMin).toBe(MIN_MOD_VERSION);
    });

    test('missing version is unknown (legacy mod without export)', () => {
        expect(assessModVersion(null)).toEqual({
            status: 'unknown',
            actual: null,
            expectedMin: MIN_MOD_VERSION,
        });
        expect(assessModVersion('')).toEqual({
            status: 'unknown',
            actual: null,
            expectedMin: MIN_MOD_VERSION,
        });
    });
});
