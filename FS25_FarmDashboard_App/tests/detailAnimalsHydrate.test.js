// FS25 FarmDashboard | tests/detailAnimalsHydrate.test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    getFtpCachedDetailsDir,
    getDetailsDirForHydration,
    getLocalDetailsDirForServer,
    hydrateLuaDataAnimalsFromDetails,
    rememberDetailEntry,
} = require('../detailAnimalsHydrate');

describe('detailAnimalsHydrate local slot isolation', () => {
    test('getLocalDetailsDirForServer does not fall back to a sibling save slot', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fd-hydrate-slot-'));
        const primary = path.join(root, 'savegame2');
        const other = path.join(root, 'savegame1', 'details');
        fs.mkdirSync(other, { recursive: true });
        fs.writeFileSync(path.join(other, 'animals_1.json'), '{}');
        const srv = { mode: 'local', localSubFolder: 'savegame1' };
        const dir = getLocalDetailsDirForServer(srv, () => path.join(primary, 'data.json'), {
            serverState: { lastSaveSlot: 'savegame1' },
        });
        expect(dir).toBe(path.join(primary, 'details'));
        expect(dir).not.toBe(other);
        expect(fs.existsSync(dir)).toBe(false);
    });
});

describe('detailAnimalsHydrate FTP paths', () => {
    test('getFtpCachedDetailsDir uses serverState.lastSaveSlot', () => {
        const ud = '/appdata';
        const srv = { id: 'srv1', mode: 'ftp', localSubFolder: 'savegame1' };
        const st = { lastSaveSlot: 'savegame11' };
        expect(getFtpCachedDetailsDir(srv, ud, st)).toBe(
            path.join(ud, 'ftpDetailsCache', 'srv1', 'savegame11', 'details')
        );
    });

    test('getDetailsDirForHydration ftp falls back to localSubFolder', () => {
        const ud = '/appdata';
        const srv = { id: 'x', mode: 'ftp', localSubFolder: 'savegame3' };
        const dir = getDetailsDirForHydration(srv, () => '/noop', {
            userDataPath: ud,
            serverState: {},
        });
        expect(dir).toBe(path.join(ud, 'ftpDetailsCache', 'x', 'savegame3', 'details'));
    });
});

describe('detailAnimalsHydrate count reconciliation', () => {
    let tmpRoot;
    let saveDir;
    let detailsDir;
    const getLocalLuaJsonPath = () => path.join(saveDir, 'data.json');
    const hydrate = (luaData) =>
        hydrateLuaDataAnimalsFromDetails(luaData, { mode: 'local' }, getLocalLuaJsonPath, {});

    beforeEach(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fd-hydrate-'));
        saveDir = path.join(tmpRoot, 'savegame1');
        detailsDir = path.join(saveDir, 'details');
        fs.mkdirSync(detailsDir, { recursive: true });
    });

    afterEach(() => {
        try {
            fs.rmSync(tmpRoot, { recursive: true, force: true });
        } catch (_) {}
    });

    function writeDetail(placeableId, doc) {
        fs.writeFileSync(
            path.join(detailsDir, `animals_${placeableId}.json`),
            JSON.stringify({ placeableId, ownerFarmId: 1, ...doc })
        );
    }

    test('incomplete/cross-matched detail does NOT replace the aggregate (keeps clusters)', () => {
        // RL multi-component barn: husbandry 100 reports 71 with cluster buckets summing
        // to 80, but the detail file keyed to id 100 only holds 7 heads (a different
        // component). Hydrating it would hide 73 animals, so the pen is left untouched
        // and the connector fans the clusters out to the full pen.
        writeDetail(100, {
            animals: Array.from({ length: 7 }, (_, i) => ({
                id: 1000 + i,
                gender: 'female',
                health: i === 0 ? 40 : 95,
            })),
        });
        const original = {
            id: 100,
            ownerFarmId: 1,
            animalCount: 80,
            numOfAnimalsReported: 71,
            clusters: [{ count: 40 }, { count: 25 }, { count: 15 }],
        };
        const out = hydrate({ animals: [original] });
        const pen = out.animals[0];
        expect(pen.__detailHydrated).not.toBe(true); // skipped
        expect(pen.animals).toBeUndefined(); // aggregate left intact for cluster fan-out
        expect(pen.animalCount).toBe(80);
        expect(pen.numOfAnimalsReported).toBe(71);
        expect(pen.clusters).toHaveLength(3);
    });

    test('base-game cluster detail rows are tagged so heads are counted', () => {
        // 3 group rows totalling 71 heads, no reported total present.
        writeDetail(200, {
            animals: [
                { id: 1, gender: 'female', type: 'cluster', count: 40 },
                { id: 2, gender: 'female', type: 'cluster', count: 25 },
                { id: 3, gender: 'male', type: 'cluster', count: 6 },
            ],
        });
        const out = hydrate({ animals: [{ id: 200, ownerFarmId: 1 }] });
        const pen = out.animals[0];
        expect(pen.__detailCapturedHeads).toBe(71);
        expect(pen.animalCount).toBe(71);
        expect(pen.animals.every((a) => a.__lodClusterAggregate === true)).toBe(true);
        expect(pen.animals.map((a) => a.clusterCount)).toEqual([40, 25, 6]);
    });

    test('null numOfAnimalsReported does not wipe a stocked pen', () => {
        writeDetail(350, {
            animals: Array.from({ length: 5 }, (_, i) => ({ id: i, uniqueId: String(i), gender: 'female' })),
        });
        const out = hydrate({
            animals: [{ id: 350, ownerFarmId: 1, animalCount: 5, numOfAnimalsReported: null }],
        });
        const pen = out.animals[0];
        expect(pen.__detailHydrated).toBe(true);
        expect(pen.animals).toHaveLength(5);
        expect(pen.animalCount).toBe(5);
        expect(pen.numOfAnimalsReported).toBe(5);
    });

    test('full individual capture is unchanged', () => {
        writeDetail(300, {
            animals: Array.from({ length: 5 }, (_, i) => ({ id: i, gender: 'female' })),
        });
        const out = hydrate({
            animals: [{ id: 300, ownerFarmId: 1, animalCount: 5, numOfAnimalsReported: 5 }],
        });
        const pen = out.animals[0];
        expect(pen.animalCount).toBe(5);
        expect(pen.animals).toHaveLength(5);
    });

    test('RL unique-id file hydrates when capture is at least 80% of the aggregate', () => {
        writeDetail(400, {
            animals: Array.from({ length: 90 }, (_, i) => ({
                id: `400:${1000 + i}:0`,
                uniqueId: String(1000 + i),
                gender: 'female',
                weight: 200 + i,
                health: 80 + (i % 10),
            })),
        });
        const out = hydrate({
            animals: [
                {
                    id: 400,
                    ownerFarmId: 1,
                    animalCount: 100,
                    numOfAnimalsReported: 100,
                    clusters: [{ count: 100 }],
                },
            ],
        });
        const pen = out.animals[0];
        expect(pen.__detailHydrated).toBe(true);
        expect(pen.animals).toHaveLength(90);
        expect(pen.animalCount).toBe(100);
        expect(pen.numOfAnimalsReported).toBe(100);
        expect(pen.animals[0].uniqueId).toBe('1000');
        expect(pen.animals[1].weight).toBe(201);
    });

    test('80% unique-id hydrate keeps the prior aggregate when reported is missing', () => {
        writeDetail(410, {
            animals: Array.from({ length: 8 }, (_, i) => ({
                uniqueId: String(2000 + i),
                gender: 'female',
            })),
        });
        const out = hydrate({
            animals: [{ id: 410, ownerFarmId: 1, animalCount: 10, numOfAnimalsReported: null }],
        });
        const pen = out.animals[0];
        expect(pen.__detailHydrated).toBe(true);
        expect(pen.animals).toHaveLength(8);
        expect(pen.animalCount).toBe(10);
        expect(pen.numOfAnimalsReported).toBe(10);
    });

    test('tiny unique-id mismatch still skipped (wrong component file)', () => {
        writeDetail(500, {
            animals: Array.from({ length: 7 }, (_, i) => ({
                uniqueId: String(10 + i),
                gender: 'female',
            })),
        });
        const out = hydrate({
            animals: [
                {
                    id: 500,
                    ownerFarmId: 1,
                    animalCount: 71,
                    numOfAnimalsReported: 71,
                    clusters: [{ count: 71 }],
                },
            ],
        });
        expect(out.animals[0].__detailHydrated).not.toBe(true);
        expect(out.animals[0].animals).toBeUndefined();
    });

    test('same placeable id on two farms keeps each farm\'s richest file', () => {
        fs.writeFileSync(
            path.join(detailsDir, 'animals_farm1_568.json'),
            JSON.stringify({
                placeableId: 568,
                ownerFarmId: 1,
                animals: Array.from({ length: 4 }, (_, i) => ({
                    uniqueId: String(510000 + i),
                    weight: 200 + i,
                })),
            })
        );
        fs.writeFileSync(
            path.join(detailsDir, 'animals_farm15_568.json'),
            JSON.stringify({
                placeableId: 568,
                ownerFarmId: 15,
                animals: Array.from({ length: 2 }, (_, i) => ({
                    uniqueId: String(800000 + i),
                    weight: 300 + i,
                })),
            })
        );
        const out = hydrate({
            animals: [
                { id: 568, ownerFarmId: 1, animalCount: 4, numOfAnimalsReported: 4 },
                { id: 568, ownerFarmId: 15, animalCount: 2, numOfAnimalsReported: 2 },
            ],
        });
        expect(out.animals[0].animals.map((a) => a.uniqueId)).toEqual(['510000', '510001', '510002', '510003']);
        expect(out.animals[1].animals.map((a) => a.uniqueId)).toEqual(['800000', '800001']);
    });

    test('equal-timestamp unique-id files keep the longer capture', () => {
        fs.writeFileSync(
            path.join(detailsDir, 'animals_short_600.json'),
            JSON.stringify({
                placeableId: 600,
                ownerFarmId: 1,
                animals: [{ uniqueId: '1' }, { uniqueId: '2' }],
            })
        );
        fs.writeFileSync(
            path.join(detailsDir, 'animals_long_600.json'),
            JSON.stringify({
                placeableId: 600,
                ownerFarmId: 1,
                animals: [{ uniqueId: '1' }, { uniqueId: '2' }, { uniqueId: '3' }, { uniqueId: '4' }],
            })
        );
        const out = hydrate({
            animals: [{ id: 600, ownerFarmId: 1, animalCount: 4, numOfAnimalsReported: 4 }],
        });
        expect(out.animals[0].animals).toHaveLength(4);
        expect(out.animals[0].animals.map((a) => a.uniqueId)).toEqual(['1', '2', '3', '4']);
    });

    test('empty animals object does not hide a full unique-id file', () => {
        fs.writeFileSync(
            path.join(detailsDir, 'animals_empty_568.json'),
            JSON.stringify({ placeableId: 568, ownerFarmId: 1, animals: {} })
        );
        fs.writeFileSync(
            path.join(detailsDir, 'animals_full_568.json'),
            JSON.stringify({
                placeableId: 568,
                ownerFarmId: 1,
                animals: [{ uniqueId: '510016', weight: 234.6, health: 99 }],
            })
        );
        const out = hydrate({
            animals: [{ id: 568, ownerFarmId: 1, animalCount: 1, numOfAnimalsReported: 1 }],
        });
        expect(out.animals[0].__detailHydrated).toBe(true);
        expect(out.animals[0].animals).toHaveLength(1);
        expect(out.animals[0].animals[0].uniqueId).toBe('510016');
    });
});

describe('rememberDetailEntry unique-id capture', () => {
    test('keeps richer unique-id capture over a newer incomplete file', () => {
        const map = new Map();
        const rich = {
            placeableId: 7,
            ownerFarmId: 1,
            generatedAt: 1000,
            animals: [{ uniqueId: 'a' }, { uniqueId: 'b' }, { uniqueId: 'c' }],
        };
        const newerIncomplete = {
            placeableId: 7,
            ownerFarmId: 1,
            generatedAt: 2000,
            animals: [{ clusterCount: 12, __lodClusterAggregate: true }],
        };
        rememberDetailEntry(map, rich);
        rememberDetailEntry(map, newerIncomplete);
        expect(map.get('7|1').animals).toEqual(rich.animals);
        expect(map.get('7|1').generatedAt).toBe(1000);
    });
});
