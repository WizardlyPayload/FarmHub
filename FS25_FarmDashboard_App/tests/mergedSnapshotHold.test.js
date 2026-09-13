const {
    isRichLuaExport,
    isRenderableMerged,
    shouldIgnoreMinimalLuaExport,
    applyMergedSnapshotIfStaleExport,
    applyLiveSectionHold,
    animalsSectionEmpty,
    fieldsSectionDegraded,
    stockSectionEmpty,
    redTapeSectionEmpty,
    updateLiveSectionBackup,
    updateLastGoodMergedSnapshot,
    buildHeldPayloadFromState,
    mergeMoistureSectionsForward,
    createMergeRebuildGate,
} = require('../mergedSnapshotHold');

describe('createMergeRebuildGate', () => {
    test('a newer begin invalidates the previous generation on the same server', () => {
        const gate = createMergeRebuildGate();
        const first = gate.begin('srv');
        const second = gate.begin('srv');
        expect(gate.isCurrent('srv', first)).toBe(false);
        expect(gate.isCurrent('srv', second)).toBe(true);
    });

    test('generations are independent per server id', () => {
        const gate = createMergeRebuildGate();
        const a = gate.begin('a');
        gate.begin('b');
        expect(gate.isCurrent('a', a)).toBe(true);
    });
});

describe('mergedSnapshotHold', () => {
    test('isRichLuaExport rejects shutdown stub', () => {
        expect(isRichLuaExport({})).toBe(false);
        expect(isRichLuaExport({ serverInfo: { saveSlot: 'savegame1' } })).toBe(false);
        expect(
            isRichLuaExport({
                gameTime: { hour: 7, minute: 51 },
                weather: {},
                finance: { money: 850000 },
                economy: {},
                animals: {},
                vehicles: {},
                fields: {},
                production: {},
                farmInfo: {},
                collectorModules: { fields: true, vehicles: true },
                serverInfo: { mapBounds: { halfSize: 1024, terrainSize: 2048 } },
                realisticFarming: { soilFertilizer: { enabled: false }, presence: { enabled: false } },
            })
        ).toBe(false);
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

    test('applyMergedSnapshotIfStaleExport keeps last live snapshot over XML-heavy shutdown merge', () => {
        const state = {
            lastGoodMergedSnapshot: {
                fields: [
                    {
                        id: 28,
                        farmlandId: 28,
                        hectares: 12,
                        posX: -1236,
                        posZ: 1797,
                        soilFertilizer: { enabled: true, organicMatter: 3.4 },
                    },
                ],
                vehicles: [{ id: 'v1', position: { x: -1200, z: 1700 } }],
                mapBounds: { halfSize: 2048, terrainSize: 4096, minX: -2048, maxX: 2048, minZ: -2048, maxZ: 2048 },
                realisticFarming: { soilFertilizer: { enabled: true, fieldCount: 12 } },
                dataSource: 'merged',
            },
        };
        const xmlHeavy = {
            fields: Array.from({ length: 20 }, (_, i) => ({ id: i + 1, fruitType: 'WHEAT' })),
            vehicles: Array.from({ length: 30 }, (_, i) => ({ id: `xml-${i}` })),
            mapBounds: { halfSize: 1024, terrainSize: 2048, minX: -1024, maxX: 1024, minZ: -1024, maxZ: 1024 },
            realisticFarming: { soilFertilizer: { enabled: false }, presence: { enabled: false } },
            dataSource: 'merged',
        };
        const out = applyMergedSnapshotIfStaleExport(xmlHeavy, { fields: {}, vehicles: {}, finance: { money: 1 } }, state);
        expect(out.mapBounds.halfSize).toBe(2048);
        expect(out.fields[0].soilFertilizer.organicMatter).toBe(3.4);
        expect(out.vehicles[0].position.x).toBe(-1200);
        expect(out.dataTimestamps.heldFromSnapshotAt).toBeTruthy();
    });

    test('applyLiveSectionHold keeps Soil Fertilizer when shutdown stub disables the block', () => {
        const state = {
            lastGoodMergedSnapshot: {
                fields: [
                    {
                        farmlandId: 28,
                        hectares: 4,
                        soilFertilizer: { enabled: true, organicMatter: 2.8, pH: 6.2 },
                    },
                ],
                mapBounds: { halfSize: 2048, terrainSize: 4096 },
                realisticFarming: {
                    presence: { enabled: true, mods: [{ id: 'FS25_SoilFertilizer' }] },
                    soilFertilizer: { enabled: true, fieldCount: 12 },
                },
            },
        };
        const merged = {
            fields: [{ farmlandId: 28, hectares: 4, fruitType: 'WHEAT' }],
            mapBounds: { halfSize: 1024, terrainSize: 2048 },
            realisticFarming: {
                presence: { enabled: true, mods: [{ id: 'FS25_SoilFertilizer' }] },
                soilFertilizer: { enabled: false },
            },
        };
        const rawLua = {
            fields: {},
            realisticFarming: {
                presence: { enabled: true },
                soilFertilizer: { enabled: false },
            },
        };
        const out = applyLiveSectionHold(merged, state, rawLua, null);
        expect(out.fields[0].soilFertilizer.organicMatter).toBe(2.8);
        expect(out.realisticFarming.soilFertilizer.enabled).toBe(true);
        expect(out.mapBounds.halfSize).toBe(2048);
    });

    test('applyLiveSectionHold does not keep a 4 km map when the save/map changed', () => {
        const state = {
            lastGoodMergedSnapshot: {
                serverInfo: { saveSlot: 'savegame1', mapId: 'FS25_Montana_MF.MapMontana' },
                mapBounds: { halfSize: 2048, terrainSize: 4096 },
            },
        };
        const merged = {
            serverInfo: { saveSlot: 'savegame2', mapId: 'MapUS' },
            fields: [{ farmlandId: 1, hectares: 2.4, fruitType: 'WHEAT' }],
            mapBounds: { halfSize: 1024, terrainSize: 2048 },
        };
        const out = applyLiveSectionHold(merged, state, { fields: [{ id: 1 }] }, null);
        expect(out.mapBounds.halfSize).toBe(1024);
        expect(out.mapBounds.terrainSize).toBe(2048);
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

    test('applyLiveSectionHold does not restore animals when Lua exported a successful empty list', () => {
        const state = {
            lastGoodMergedSnapshot: {
                fields: [{ id: 1 }],
                animals: [{ id: 10, ownerFarmId: 1, clusters: [{ count: 5, subType: 'COW' }] }],
            },
        };
        const merged = { fields: [{ id: 1 }], animals: [] };
        const rawLua = { fields: [{ id: 1 }], animals: [] };
        const out = applyLiveSectionHold(merged, state, rawLua, null);
        expect(out.animals).toHaveLength(0);
        expect(out.dataTimestamps?.liveSectionsHeldAt).toBeFalsy();
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
        // Lua still rich (vehicles etc.) but fields collector died â†’ XML-only rows, no hectares
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

    test('mergeMoistureSectionsForward keeps stock silo moisture when next export drops it', () => {
        const prev = {
            stock: {
                byFarm: {
                    '1': {
                        items: [{
                            fillTypeIndex: 2,
                            locations: [{
                                name: 'NL16-22 - 2000',
                                liters: 88000,
                                moisturePct: 11.2,
                                qualityPct: 98,
                            }],
                        }],
                    },
                },
            },
        };
        const next = {
            stock: {
                byFarm: {
                    '1': {
                        items: [{
                            fillTypeIndex: 2,
                            locations: [{ name: 'NL16-22 - 2000', liters: 88000 }],
                        }],
                    },
                },
            },
        };
        const out = mergeMoistureSectionsForward(prev, next);
        const loc = out.stock.byFarm['1'].items[0].locations[0];
        expect(loc.moisturePct).toBe(11.2);
        expect(loc.qualityPct).toBe(98);
    });

    test('applyLiveSectionHold restores stock when lua clears it, but not redTape when enabled:false', () => {
        const goodStock = {
            enabled: true,
            byFarm: {
                '1': {
                    items: [{ fillType: 'WHEAT', fillTypeIndex: 2, totalLiters: 120000, locations: [] }],
                },
            },
        };
        const goodRedTape = {
            enabled: true,
            byFarm: {
                '1': {
                    tier: 'B',
                    policies: [{ nameKey: 'rt_policy_noise', warnings: 0 }],
                    availableSchemes: [{ nameKey: 'rt_scheme_green', tier: 'B' }],
                },
            },
        };
        const state = { liveSectionBackup: { stock: goodStock, redTape: goodRedTape } };
        const merged = {
            fields: [{ id: 1, hectares: 2 }],
            stock: { enabled: false, byFarm: {} },
            redTape: { enabled: false, byFarm: {} },
        };
        const rawLua = {
            fields: [{ id: 1, hectares: 2 }],
            stock: { enabled: false, byFarm: {} },
            redTape: { enabled: false, byFarm: {} },
        };
        const out = applyLiveSectionHold(merged, state, rawLua, null);
        expect(stockSectionEmpty(out.stock)).toBe(false);
        expect(out.stock.byFarm['1'].items[0].totalLiters).toBe(120000);
        expect(out.redTape.enabled).toBe(false);
        expect(redTapeSectionEmpty(out.redTape)).toBe(true);
        expect(state.liveSectionBackup.redTape).toBeUndefined();
        expect(out.dataTimestamps.liveSectionsHeldAt).toBeTruthy();
    });

    test('applyLiveSectionHold restores redTape when lua omits the section mid-cycle', () => {
        const goodRedTape = {
            enabled: true,
            byFarm: {
                '1': {
                    tier: 'B',
                    policies: [{ nameKey: 'rt_policy_noise', warnings: 0 }],
                },
            },
        };
        const state = { liveSectionBackup: { redTape: goodRedTape } };
        const merged = {
            fields: [{ id: 1, hectares: 2 }],
            redTape: { enabled: false, byFarm: {} },
        };
        // No redTape key on raw lua = mid-cycle omission (not soft-detect off).
        const rawLua = { fields: [{ id: 1, hectares: 2 }] };
        const out = applyLiveSectionHold(merged, state, rawLua, null);
        expect(redTapeSectionEmpty(out.redTape)).toBe(false);
        expect(out.redTape.byFarm['1'].tier).toBe('B');
    });

    test('updateLiveSectionBackup clears redTape when lua soft-detects disabled', () => {
        const state = { liveSectionBackup: null };
        updateLiveSectionBackup(
            state,
            {
                stock: {
                    enabled: true,
                    byFarm: { '1': { items: [{ fillTypeIndex: 2, totalLiters: 5000 }] } },
                },
                redTape: {
                    enabled: true,
                    byFarm: { '1': { tier: 'A', policies: [{ nameKey: 'rt_policy_x' }] } },
                },
            },
            null
        );
        expect(stockSectionEmpty(state.liveSectionBackup.stock)).toBe(false);
        expect(redTapeSectionEmpty(state.liveSectionBackup.redTape)).toBe(false);
        updateLiveSectionBackup(
            state,
            { stock: { enabled: false, byFarm: {} }, redTape: { enabled: false, byFarm: {} } },
            { stock: {}, redTape: { enabled: false, byFarm: {} } }
        );
        expect(state.liveSectionBackup.stock.byFarm['1'].items[0].totalLiters).toBe(5000);
        expect(state.liveSectionBackup.redTape).toBeUndefined();
    });

    test('buildHeldPayloadFromState does not reinject redTape when payload explicitly disabled', () => {
        const state = {
            mergedData: {
                fields: [{ id: 1, hectares: 1 }],
                stock: { enabled: false, byFarm: {} },
                redTape: { enabled: false, byFarm: {} },
            },
            liveSectionBackup: {
                stock: {
                    enabled: true,
                    byFarm: { '1': { items: [{ fillTypeIndex: 190, totalLiters: 8000 }] } },
                },
                redTape: {
                    enabled: true,
                    byFarm: { '1': { tier: 'C', availableSchemes: [{ nameKey: 'rt_scheme_y' }] } },
                },
            },
        };
        const out = buildHeldPayloadFromState(state);
        expect(out.stock.byFarm['1'].items[0].fillTypeIndex).toBe(190);
        expect(out.redTape.enabled).toBe(false);
        expect(redTapeSectionEmpty(out.redTape)).toBe(true);
    });
});
