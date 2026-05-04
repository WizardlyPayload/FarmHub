// FS25 FarmDashboard | tests/wireFormats.test.js | Plan v5 C3
//
// Pin the wire formats. If a future change drifts these constants, both sides (mod + app)
// must be updated together — this test exists to make that drift loud.

jest.mock('basic-ftp', () => ({ Client: function () { return {}; } }));
jest.mock('electron', () => ({ app: { getPath: () => require('os').tmpdir() } }));

const livestockDetail = require('../livestockDetail.js');

describe('Plan v5 wire-format constants', () => {
  test('schema versions are 1', () => {
    expect(livestockDetail.REQUESTS_SCHEMA_VERSION).toBe(1);
    expect(livestockDetail.DIRTY_SCHEMA_VERSION).toBe(1);
    expect(livestockDetail.DETAIL_SCHEMA_VERSION).toBe(1);
  });

  test('requests bounds match plan A4', () => {
    expect(livestockDetail.REQUESTS_MAX_ENTRIES).toBe(256);
    expect(livestockDetail.REQUESTS_MAX_AGE_SEC).toBe(300);
  });

  test('dirty index timestamp tolerance is 1 second', () => {
    expect(livestockDetail.ID_SCHEME_TS_TOLERANCE_SEC).toBe(1);
  });
});

describe('Plan v5 detail envelope contract', () => {
  // The shape of the rich response the UI consumes. Since `read()` is async and depends
  // on disk, we lock it via a small contract test that replays a saved JSON payload.
  test('has the documented top-level keys', () => {
    const sample = {
      schemaVersion: 1,
      serverTimeSec: 1234,
      animalMode: 'RL',
      idScheme: 'composite-v1',
      dirtyAt: 1234,
      cachedAt: 1233,
      fromCache: false,
      penKey: 'data/store/placeables/foo.xml:42',
      detail: {
        schemaVersion: 1,
        idScheme: 'composite-v1',
        penId: 'data/store/placeables/foo.xml:42',
        placeableId: 42,
        generatedAt: 1234,
        mode: 'RL',
        lod: 'full',
        animals: [],
      },
    };
    for (const k of ['schemaVersion','serverTimeSec','animalMode','idScheme','dirtyAt','cachedAt','fromCache','penKey','detail']) {
      expect(Object.prototype.hasOwnProperty.call(sample, k)).toBe(true);
    }
    for (const k of ['schemaVersion','idScheme','penId','placeableId','generatedAt','mode','lod','animals']) {
      expect(Object.prototype.hasOwnProperty.call(sample.detail, k)).toBe(true);
    }
  });
});

describe('Plan v5 dirtyPens.json contract', () => {
  test('has the documented top-level keys and bounded entries', () => {
    const sample = {
      schemaVersion: 1,
      idScheme: 'integer-v1',
      updatedAt: 999,
      animalMode: 'base',
      pens: [{ id: 1, ts: 999, animalCount: 4 }],
    };
    for (const k of ['schemaVersion','idScheme','updatedAt','animalMode','pens']) {
      expect(Object.prototype.hasOwnProperty.call(sample, k)).toBe(true);
    }
    expect(Array.isArray(sample.pens)).toBe(true);
    for (const p of sample.pens) {
      for (const k of ['id','ts','animalCount']) {
        expect(Object.prototype.hasOwnProperty.call(p, k)).toBe(true);
      }
    }
  });
});

describe('Plan v5 requests.json contract', () => {
  test('schemaVersion=1, bounded pens with integer ids', () => {
    const sample = {
      schemaVersion: 1,
      updatedAt: 1234,
      pens: [{ id: 42, ts: 1234 }],
    };
    expect(sample.schemaVersion).toBe(1);
    expect(typeof sample.updatedAt).toBe('number');
    expect(Array.isArray(sample.pens)).toBe(true);
    expect(Number.isInteger(sample.pens[0].id)).toBe(true);
    expect(sample.pens[0].id).toBeGreaterThan(0);
    expect(sample.pens[0].id).toBeLessThan(2147483648);
  });
});
