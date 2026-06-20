const {
    isRichLuaExport,
    isRenderableMerged,
    shouldIgnoreMinimalLuaExport,
    applyMergedSnapshotIfStaleExport,
    applyLiveSectionHold,
    animalsSectionEmpty,
    fieldsSectionDegraded,
    updateLiveSectionBackup,
    updateLastGoodMergedSnapshot,
    buildHeldPayloadFromState,
} = require('../mergedSnapshotHold');

describe('mergedSnapshotHold', () => {
    test('isRichLuaExport rejects shutdown stub', () => {
        expect(isRichLuaExport({})).toBe(false);
        expect(isRichLuaExport({ serverInfo: { saveSlot: 'savegame1' } })).toBe(false);
    });

    test('isRichLuaExport accepts normal export', () => {
        expect(isRichLuaExport({ fields: [{ id: 1 }], vehicles: [] })).toBe(true);
    });

    test('shouldIgnoreMinimalLuaExport when snapshot exists', () => {
        const state = {
            lastGoodMergedSnapshot: {
                fields: [{ id: 1 }, { id: 2 }],
                vehicles: [{ id: 'a' }],
                dataSource: 'merged',
            },
        };
        expect(shouldIgnoreMinimalLuaExport({}, state)).toBe(true);
        expect(shouldIgnoreMinimalLuaExport({ fields: [{ id: 1 }] }, state)).toBe(false);
    });

    test('applyMergedSnapshotIfStaleExport restores full snapshot', () => {
        const state = {
            lastGoodMergedSnapshot: {
                fields: [{ id: 1 }, { id: 2 }],
                vehicles: [{ id: 'v1' }],
                animals: [{ id: 1 }],
                production: { chains: [{ id: 'c1' }] },
                dataSource: 'merged',
            },
            lastLuaReceivedAt: '2026-01-01T00:00:00.000Z',
        };
        const sparse = {
            fields: [],
            vehicles: [],
            animals: [],
            production: {},
            dataSource: 'lua_only',
            luaAvailable: true,
        };
        const out = applyMergedSnapshotIfStaleExport(sparse, {}, state);
        expect(out.fields).toHaveLength(2);
        expect(out.vehicles).toHaveLength(1);
        expect(out.dataTimestamps.heldFromSnapshotAt).toBeTruthy();
        expect(out.dataTimestamps.liveExportStaleAt).toBeTruthy();
    });

    test('updateLastGoodMergedSnapshot skips minimal lua', () => {
        const state = {};
        updateLastGoodMergedSnapshot(
            state,
            { fields: [{ id: 1 }], vehicles: [] },
            {}
        );
        expect(state.lastGoodMergedSnapshot).toBeUndefined();
        updateLastGoodMergedSnapshot(
            state,
            { fields: [{ id: 1 }], vehicles: [] },
            { fields: [{ id: 1 }], vehicles: [{ id: 'x' }] }
        );
        expect(state.lastGoodMergedSnapshot.fields).toHaveLength(1);
    });

    test('applyLiveSectionHold restores animals on rich export with empty animals slot', () => {
        const state = {
            lastGoodMergedSnapshot: {
                fields: [{ id: 1 }],
                animals: [
                    {
                        id: 10,
                        ownerFarmId: 1,
                        clusters: [{ count: 5, subType: 'COW' }],
                        animals: [],
                    },
                ],
                dataSource: 'merged',
            },
        };
        const merged = {
            fields: [{ id: 1 }, { id: 2 }],
            animals: [],
            dataSource: 'merged',
        };
        const rawLua = { fields: [{ id: 1 }, { id: 2 }], animals: {} };
        const out = applyLiveSectionHold(merged, state, rawLua, null);
        expect(out.animals).toHaveLength(1);
        expect(out.dataTimestamps.liveSectionsHeldAt).toBeTruthy();
    });

    test('liveSectionBackup restores animals when snapshot is fields-only', () => {
        const state = {
            lastGoodMergedSnapshot: {
                fields: [{ id: 1 }, { id: 2 }],
                animals: [],
            },
            liveSectionBackup: {
                animals: [
                    {
                        id: 10,
                        ownerFarmId: 1,
                        clusters: [{ count: 4, subType: 'COW' }],
                    },
                ],
            },
        };
        const merged = { fields: [{ id: 1 }], animals: [] };
        const out = applyLiveSectionHold(
            merged,
            state,
            { fields: [{ id: 1 }], animals: {} },
            null
        );
        expect(out.animals).toHaveLength(1);
    });

    test('buildHeldPayloadFromState merges liveSectionBackup animals', () => {
        const state = {
            mergedData: { fields: [{ id: 1 }], animals: [] },
            liveSectionBackup: {
                animals: [{ id: 5, ownerFarmId: 1, animalCount: 2 }],
            },
        };
        const out = buildHeldPayloadFromState(state);
        expect(out.animals).toHaveLength(1);
        expect(out.dataTimestamps.heldFromSnapshotAt).toBeTruthy();
    });

    test('updateLiveSectionBackup retains animals across empty writes', () => {
        const state = { liveSectionBackup: null };
        updateLiveSectionBackup(
            state,
            {
                fields: [{ id: 1 }],
                animals: [{ id: 10, ownerFarmId: 1, clusters: [{ count: 3 }] }],
            },
            null
        );
        expect(state.liveSectionBackup.animals).toHaveLength(1);
        updateLiveSectionBackup(
            state,
            { fields: [{ id: 1 }], animals: [] },
            { fields: [{ id: 1 }], animals: {} }
        );
        expect(state.liveSectionBackup.animals).toHaveLength(1);
    });

    test('updateLastGoodMergedSnapshot does not wipe animals from prior snapshot', () => {
        const state = {
            lastGoodMergedSnapshot: {
                fields: [{ id: 1 }],
                animals: [{ id: 10, ownerFarmId: 1, animalCount: 3 }],
            },
        };
        updateLastGoodMergedSnapshot(
            state,
            { fields: [{ id: 1 }, { id: 2 }], animals: [] },
            { fields: [{ id: 1 }, { id: 2 }], vehicles: [] }
        );
        expect(state.lastGoodMergedSnapshot.fields).toHaveLength(2);
        expect(state.lastGoodMergedSnapshot.animals).toHaveLength(1);
    });

    test('animalsSectionEmpty detects cluster-only husbandry rows', () => {
        expect(animalsSectionEmpty([])).toBe(true);
        expect(
            animalsSectionEmpty([{ id: 1, animals: [], clusters: [{ count: 2 }] }])
        ).toBe(false);
    });

    test('fieldsSectionDegraded detects XML-only rows without hectares', () => {
        expect(fieldsSectionDegraded([])).toBe(true);
        expect(fieldsSectionDegraded([{ id: 1, fruitType: 'GRASS' }])).toBe(true);
        expect(fieldsSectionDegraded([{ id: 1, hectares: 2.4 }])).toBe(false);
    });

    test('applyLiveSectionHold restores fields when collector breaks mid-session', () => {
        const goodFields = [
            { id: 28, hectares: 3.1, isPrecisionFarming: true, targetNitrogen: 90 },
            { id: 30, hectares: 2.2, isPrecisionFarming: true, targetNitrogen: 85 },
        ];
        const state = { liveSectionBackup: { fields: goodFields } };
        // Lua still rich (vehicles etc.) but fields collector died → XML-only rows, no hectares
        const merged = {
            fields: [{ id: 28, fruitType: 'GRASS' }, { id: 30, fruitType: 'GRASS' }],
            vehicles: [{ id: 'v1' }],
            dataSource: 'merged',
        };
        const rawLua = { fields: [], vehicles: [{ id: 'v1' }] };
        const out = applyLiveSectionHold(merged, state, rawLua, null);
        expect(out.fields).toHaveLength(2);
        expect(out.fields[0].hectares).toBe(3.1);
        expect(out.dataTimestamps.liveSectionsHeldAt).toBeTruthy();
    });

    test('updateLastGoodMergedSnapshot keeps good fields when next write has degraded fields', () => {
        const state = {
            lastGoodMergedSnapshot: {
                fields: [{ id: 28, hectares: 3.1, moisture: { enabled: true, percent: 14.2 } }],
                vehicles: [{ id: 'v1' }],
            },
        };
        updateLastGoodMergedSnapshot(
            state,
            { fields: [{ id: 28, fruitType: 'GRASS', hectares: 3.1 }], vehicles: [{ id: 'v1' }] },
            { vehicles: [{ id: 'v1' }], finance: { money: 100 }, weather: {}, gameTime: { day: 1 }, economy: {}, fields: [], animals: [], production: {}, farmInfo: [], serverInfo: {}, timestamp: 1 }
        );
        expect(state.lastGoodMergedSnapshot.fields[0].hectares).toBe(3.1);
        expect(state.lastGoodMergedSnapshot.fields[0].moisture.percent).toBe(14.2);
    });
});
