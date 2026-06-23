// FS25 FarmDashboard | tests/detailAnimalsHydrate.test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    getFtpCachedDetailsDir,
    getDetailsDirForHydration,
    hydrateLuaDataAnimalsFromDetails,
} = require('../detailAnimalsHydrate');

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
});
