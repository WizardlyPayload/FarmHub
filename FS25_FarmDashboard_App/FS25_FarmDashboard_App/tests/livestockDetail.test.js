// FS25 FarmDashboard | tests/livestockDetail.test.js | Plan v5 C3
//
// Validates the public surface of livestockDetail.js without an actual Electron environment.
// Uses tmp dirs for local-mode flows and stubs the FTP path. We only exercise functions
// that don't require electron.app.

jest.mock('basic-ftp', () => ({
  Client: jest.fn().mockImplementation(() => ({
    ftp: { verbose: false },
    access: jest.fn().mockResolvedValue(undefined),
    downloadTo: jest.fn().mockResolvedValue(undefined),
    uploadFrom: jest.fn().mockResolvedValue(undefined),
    ensureDir: jest.fn().mockResolvedValue(undefined),
    close: jest.fn(),
  })),
}));

jest.mock('electron', () => ({
  app: { getPath: () => require('os').tmpdir() },
}));

const fs = require('fs');
const os = require('os');
const path = require('path');

const livestockDetail = require('../livestockDetail.js');

function mktmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fdtest-'));
}

describe('parsePenKeyForRead + penKeyToFilenameSegment (Plan v5 B5)', () => {
  test('integer id maps to filename segment', () => {
    expect(livestockDetail.penKeyToFilenameSegment('42')).toBe('42');
    const pk = livestockDetail.parsePenKeyForRead('42');
    expect(pk && pk.canonicalKey).toBe('42');
    expect(pk && pk.fileSegment).toBe('42');
  });
  test('composite key matches Lua _penKeyToFilename', () => {
    const pk = livestockDetail.parsePenKeyForRead('foo.xml:12');
    expect(pk && pk.canonicalKey).toBe('foo.xml:12');
    expect(pk && pk.fileSegment).toBe('foo.xml_12');
  });
});

describe('validatePenId', () => {
  test('accepts positive 31-bit integers', () => {
    expect(livestockDetail.validatePenId(1)).toBe(1);
    expect(livestockDetail.validatePenId('42')).toBe(42);
    expect(livestockDetail.validatePenId(2147483646)).toBe(2147483646);
  });
  test('rejects non-positive, fractional, or out-of-range values', () => {
    expect(livestockDetail.validatePenId(0)).toBeNull();
    expect(livestockDetail.validatePenId(-1)).toBeNull();
    expect(livestockDetail.validatePenId(1.5)).toBeNull();
    expect(livestockDetail.validatePenId('abc')).toBeNull();
    expect(livestockDetail.validatePenId(2147483648)).toBeNull();
    expect(livestockDetail.validatePenId(NaN)).toBeNull();
    expect(livestockDetail.validatePenId(null)).toBeNull();
  });
});

describe('schema constants exposed for parity tests', () => {
  test('versions are pinned to 1', () => {
    expect(livestockDetail.REQUESTS_SCHEMA_VERSION).toBe(1);
    expect(livestockDetail.DIRTY_SCHEMA_VERSION).toBe(1);
    expect(livestockDetail.DETAIL_SCHEMA_VERSION).toBe(1);
  });
  test('bounds match plan v5', () => {
    expect(livestockDetail.REQUESTS_MAX_ENTRIES).toBe(256);
    expect(livestockDetail.REQUESTS_MAX_AGE_SEC).toBe(300);
    expect(livestockDetail.ID_SCHEME_TS_TOLERANCE_SEC).toBe(1);
  });
});

describe('local-mode read returns rich envelope', () => {
  test('rejects schemaVersion > supported', async () => {
    const slot = mktmp();
    fs.mkdirSync(path.join(slot, 'details'), { recursive: true });
    fs.writeFileSync(path.join(slot, 'details', 'animals_42.json'),
      JSON.stringify({ schemaVersion: 99, animals: [] }));
    const srv = { id: 'srv', mode: 'local', localPath: path.dirname(slot), localSubFolder: path.basename(slot) };
    const req = { params: { id: '42' } };
    const result = await livestockDetail.read({
      req,
      resolveServerIdForRequest: () => 'srv',
      servers: [srv],
      serverStates: { srv: {} },
      getFs25DocumentsRoot: () => slot,
    });
    expect(result).toBeNull();
  });

  test('returns rich envelope with animal mode + cachedAt', async () => {
    const slot = mktmp();
    fs.mkdirSync(path.join(slot, 'details'), { recursive: true });
    fs.writeFileSync(path.join(slot, 'details', 'animals_5.json'), JSON.stringify({
      schemaVersion: 1,
      idScheme: 'integer-v1',
      penId: '5',
      placeableId: 5,
      generatedAt: 1000,
      mode: 'RL',
      animalMode: 'RL',
      lod: 'full',
      animals: [{ uniqueId: 'A', subType: 'COW' }],
    }));
    fs.writeFileSync(path.join(slot, 'dirtyPens.json'), JSON.stringify({
      schemaVersion: 1,
      idScheme: 'integer-v1',
      updatedAt: 1234,
      animalMode: 'RL',
      pens: [{ id: 5, ts: 1234, animalCount: 1 }],
    }));
    const srv = { id: 'srv', mode: 'local', localPath: path.dirname(slot), localSubFolder: path.basename(slot) };
    const req = { params: { id: '5' }, query: {} };
    const result = await livestockDetail.read({
      req,
      resolveServerIdForRequest: () => 'srv',
      servers: [srv],
      serverStates: { srv: {} },
      getFs25DocumentsRoot: () => slot,
    });
    expect(result).not.toBeNull();
    expect(result.animalMode).toBe('RL');
    expect(result.idScheme).toBe('integer-v1');
    expect(result.dirtyAt).toBe(1234);
    expect(result.detail).toBeTruthy();
    expect(Array.isArray(result.detail.animals)).toBe(true);
  });

  test('composite pen key reads animals_<sanitized>.json', async () => {
    const slot = mktmp();
    fs.mkdirSync(path.join(slot, 'details'), { recursive: true });
    const fname = livestockDetail.penKeyToFilenameSegment('foo.xml:12');
    fs.writeFileSync(path.join(slot, 'details', `animals_${fname}.json`), JSON.stringify({
      schemaVersion: 1,
      idScheme: 'composite-v1',
      penId: 'foo.xml:12',
      placeableId: 12,
      generatedAt: 2000,
      mode: 'RL',
      lod: 'full',
      animals: [{ uniqueId: 'Z', subType: 'PIG' }],
    }));
    fs.writeFileSync(path.join(slot, 'dirtyPens.json'), JSON.stringify({
      schemaVersion: 1,
      idScheme: 'composite-v1',
      updatedAt: 2000,
      animalMode: 'RL',
      pens: [{ id: 'foo.xml:12', ts: 2000, animalCount: 1 }],
    }));
    const srv = { id: 'srv', mode: 'local', localPath: path.dirname(slot), localSubFolder: path.basename(slot) };
    const req = { params: { id: 'foo.xml:12' }, query: {} };
    const result = await livestockDetail.read({
      req,
      resolveServerIdForRequest: () => 'srv',
      servers: [srv],
      serverStates: { srv: {} },
      getFs25DocumentsRoot: () => slot,
    });
    expect(result).not.toBeNull();
    expect(result.penKey).toBe('foo.xml:12');
    expect(result.detail.animals[0].subType).toBe('PIG');
  });
});

describe('request() bounds requests.json', () => {
  test('caps to REQUESTS_MAX_ENTRIES and drops stale entries', async () => {
    const slot = mktmp();
    const reqsPath = path.join(slot, 'requests.json');
    // Pre-seed with old entries that should all be dropped.
    const oldTs = (Date.now() / 1000) - 1000; // > 300s old
    const old = { schemaVersion: 1, updatedAt: oldTs, pens: [] };
    for (let i = 1; i <= 300; i++) old.pens.push({ id: i, ts: oldTs });
    fs.writeFileSync(reqsPath, JSON.stringify(old));

    const srv = { id: 'srv', mode: 'local', localPath: path.dirname(slot), localSubFolder: path.basename(slot) };
    const req = { params: { id: '42' } };
    const ok = await livestockDetail.request({
      req,
      resolveServerIdForRequest: () => 'srv',
      servers: [srv],
      serverStates: { srv: {} },
      getFs25DocumentsRoot: () => slot,
    });
    expect(ok).toBe(true);

    const written = JSON.parse(fs.readFileSync(reqsPath, 'utf8'));
    expect(written.schemaVersion).toBe(1);
    expect(Array.isArray(written.pens)).toBe(true);
    expect(written.pens.length).toBeLessThanOrEqual(256);
    // Old entries should be gone; only the newly-added pen should remain.
    expect(written.pens.find((p) => p.id === 42)).toBeTruthy();
    expect(written.pens.find((p) => p.id === 1)).toBeFalsy();
  });

  test('rejects invalid id', async () => {
    const slot = mktmp();
    const srv = { id: 'srv', mode: 'local', localPath: path.dirname(slot), localSubFolder: path.basename(slot) };
    const req = { params: { id: 'abc' } };
    await expect(livestockDetail.request({
      req,
      resolveServerIdForRequest: () => 'srv',
      servers: [srv],
      serverStates: { srv: {} },
      getFs25DocumentsRoot: () => slot,
    })).rejects.toMatchObject({ code: 'INVALID_ID' });
  });
});
