const {
    mergeData,
    buildFieldLiveFingerprints,
} = require('../dataMerger');
const {
    mergeFieldsMoistureForward,
    applyLiveSectionHold,
    updateLiveSectionBackup,
    weatherMoisturePresent,
    baleMoistureHasData,
} = require('../mergedSnapshotHold');

describe('field moisture offline persistence', () => {
    test('buildFieldLiveFingerprints caches moisture block', () => {
        const fps = buildFieldLiveFingerprints([
            {
                farmlandId: 28,
                hectares: 3.1,
                moisture: { enabled: true, percent: 18.5, grade: 'B' },
            },
        ]);
        expect(fps[28].moisture.percent).toBe(18.5);
        expect(fps[28].moisture.grade).toBe('B');
    });

    test('buildFieldLiveFingerprints caches soil, outline, and position', () => {
        const outline = [[-2038, 10], [2037, 10], [2037, 80]];
        const fps = buildFieldLiveFingerprints([
            {
                farmlandId: 28,
                hectares: 3.1,
                posX: -1236,
                posZ: 1797,
                soilFertilizer: { enabled: true, organicMatter: 4.1 },
                cropStress: { enabled: true, moisturePercent: 12 },
                outline,
                fruitMapColor: '#E8C547',
            },
        ]);
        expect(fps[28].soilFertilizer.organicMatter).toBe(4.1);
        expect(fps[28].cropStress.moisturePercent).toBe(12);
        expect(fps[28].outline).toEqual(outline);
        expect(fps[28].posX).toBe(-1236);
        expect(fps[28].fruitMapColor).toBe('#E8C547');
    });

    test('mergeFields falls back to fieldLiveCache when live moisture missing', () => {
        const cache = buildFieldLiveFingerprints([
            {
                farmlandId: 28,
                hectares: 3.1,
                moisture: { enabled: true, percent: 22.0, grade: 'A' },
            },
        ]);
        const merged = mergeData(
            {
                serverInfo: { saveSlot: 'savegame1' },
                fields: [{ farmlandId: 28, id: 28, hectares: 3.1, fruitType: 'WHEAT' }],
                finance: { money: 1 },
                gameTime: { day: 1 },
                weather: {},
                economy: {},
                animals: [],
                production: {},
                farmInfo: [],
            },
            {
                allFields: [{ farmlandId: 28, id: 28, fruitType: 'WHEAT', ownerFarmId: 1 }],
                farmlandsArray: [{ farmId: 1, id: 28 }],
                farms: [{ id: 1, name: 'Farm 1' }],
                career: { mapTitle: 'Test' },
                environment: { forecast: [] },
            },
            { fieldLiveCache: cache }
        );
        const field = merged.fields.find((f) => Number(f.farmlandId ?? f.id) === 28);
        expect(field.moisture.percent).toBe(22);
    });

    test('omitted live soilFertilizer and cropStress are treated as disabled, not cached', () => {
        const cache = buildFieldLiveFingerprints([
            {
                farmlandId: 28,
                hectares: 3.1,
                soilFertilizer: { enabled: true, organicMatter: 4.1 },
                cropStress: { enabled: true, moisturePercent: 12 },
            },
        ]);
        const merged = mergeData(
            {
                serverInfo: { saveSlot: 'savegame1' },
                fields: [{
                    farmlandId: 28,
                    id: 28,
                    ownerFarmId: 1,
                    hectares: 3.1,
                    fruitType: 'WHEAT',
                }],
                finance: { money: 1 },
                gameTime: { day: 1 },
                weather: {},
                economy: {},
                animals: [],
                production: {},
                farmInfo: [{ id: 1, name: 'Farm 1' }],
            },
            null,
            { fieldLiveCache: cache }
        );
        const field = merged.fields.find((f) => Number(f.farmlandId ?? f.id) === 28);
        expect(field.soilFertilizer).toBeUndefined();
        expect(field.cropStress).toBeUndefined();
    });

    test('live disabled soilFertilizer and cropStress are not restored from cache', () => {
        const cache = buildFieldLiveFingerprints([
            {
                farmlandId: 28,
                hectares: 3.1,
                soilFertilizer: { enabled: true, organicMatter: 4.1 },
                cropStress: { enabled: true, moisturePercent: 12 },
            },
        ]);
        const merged = mergeData(
            {
                serverInfo: { saveSlot: 'savegame1' },
                fields: [{
                    farmlandId: 28,
                    id: 28,
                    ownerFarmId: 1,
                    hectares: 3.1,
                    fruitType: 'WHEAT',
                    soilFertilizer: { enabled: false },
                    cropStress: { enabled: false },
                }],
                finance: { money: 1 },
                gameTime: { day: 1 },
                weather: {},
                economy: {},
                animals: [],
                production: {},
                farmInfo: [{ id: 1, name: 'Farm 1' }],
            },
            null,
            { fieldLiveCache: cache }
        );
        const field = merged.fields.find((f) => Number(f.farmlandId ?? f.id) === 28);
        expect(field.soilFertilizer).toEqual({ enabled: false });
        expect(field.cropStress).toEqual({ enabled: false });
    });

    test('mergeData upgrades 2 km mapBounds from cached field position and outline', () => {
        const outline = [
            [-2038, -100],
            [2037, -100],
            [2037, 200],
        ];
        const cache = buildFieldLiveFingerprints([
            {
                farmlandId: 28,
                hectares: 3.1,
                posX: -1236,
                posZ: 1797,
                fruitType: 'WHEAT',
                outline,
                soilFertilizer: { enabled: true, organicMatter: 2.2 },
            },
        ]);
        const merged = mergeData(
            {
                serverInfo: {
                    saveSlot: 'savegame1',
                    mapBounds: { halfSize: 1024, terrainSize: 2048, minX: -1024, maxX: 1024, minZ: -1024, maxZ: 1024 },
                },
                fields: {},
                finance: {},
                gameTime: { day: 1 },
                weather: {},
                economy: {},
                animals: [],
                production: {},
                farmInfo: [],
                realisticFarming: { soilFertilizer: { enabled: false } },
            },
            {
                allFields: [{ farmlandId: 28, id: 28, fruitType: 'WHEAT', ownerFarmId: 1 }],
                farmlandsArray: [{ farmId: 1, id: 28 }],
                farms: [{ id: 1, name: 'Farm 1' }],
                career: { mapTitle: 'Montana Map' },
                environment: { forecast: [] },
            },
            { fieldLiveCache: cache }
        );
        const field = merged.fields.find((f) => Number(f.farmlandId ?? f.id) === 28);
        expect(merged.mapBounds.halfSize).toBe(2048);
        expect(merged.mapBounds.terrainSize).toBe(4096);
        expect(field.posX).toBe(-1236);
        expect(field.outline).toEqual(outline);
        expect(field.soilFertilizer.organicMatter).toBe(2.2);
    });

    test('mergeWeather keeps MoistureSystem block when XML environment is present', () => {
        const merged = mergeData(
            {
                serverInfo: { saveSlot: 'savegame1' },
                fields: [],
                finance: { money: 1 },
                gameTime: { day: 1 },
                weather: {
                    currentTemperature: 12,
                    moisture: { enabled: true, currentPercent: 41.2, environment: 'HUMID' },
                },
                economy: {},
                animals: [],
                production: {},
                farmInfo: [],
            },
            {
                allFields: [],
                farmlandsArray: [],
                farms: [],
                career: { mapTitle: 'Test' },
                environment: { forecast: [{ period: 1 }], currentSeason: 'SUMMER' },
            },
            {}
        );
        expect(merged.weather.moisture.currentPercent).toBe(41.2);
        expect(weatherMoisturePresent(merged.weather)).toBe(true);
    });

    test('mergeFieldsMoistureForward keeps soil moisture on partial export', () => {
        const prev = [{ farmlandId: 5, hectares: 2, moisture: { enabled: true, percent: 16.1 } }];
        const next = [{ farmlandId: 5, hectares: 2, fruitType: 'BARLEY' }];
        const out = mergeFieldsMoistureForward(prev, next);
        expect(out[0].moisture.percent).toBe(16.1);
    });

    test('mergeFieldsMoistureForward keeps soilFertilizer and outline', () => {
        const outline = [[-2000, -100], [2000, -100], [2000, 100]];
        const prev = [
            {
                farmlandId: 5,
                hectares: 2,
                posX: -1236,
                posZ: 1797,
                soilFertilizer: { enabled: true, organicMatter: 3.1 },
                outline,
            },
        ];
        const next = [{ farmlandId: 5, hectares: 2, fruitType: 'BARLEY' }];
        const out = mergeFieldsMoistureForward(prev, next);
        expect(out[0].soilFertilizer.organicMatter).toBe(3.1);
        expect(out[0].outline).toEqual(outline);
        expect(out[0].posX).toBe(-1236);
    });

    test('applyLiveSectionHold restores weather and bale moisture when live export drops them', () => {
        const state = {
            liveSectionBackup: {
                weather: {
                    currentTemperature: 10,
                    moisture: { enabled: true, currentPercent: 55, environment: 'WET' },
                },
                baleInventory: {
                    moisture: {
                        enabled: true,
                        byFarm: {
                            1: {
                                gradeCounts: { B: 2 },
                                worst: [{ fillType: 'WHEAT', moisturePct: 19 }],
                            },
                        },
                    },
                },
                fields: [{ farmlandId: 1, hectares: 1.2, moisture: { enabled: true, percent: 20 } }],
            },
        };
        const merged = {
            fields: [{ farmlandId: 1, hectares: 1.2, fruitType: 'WHEAT' }],
            weather: { currentTemperature: 10 },
            baleInventory: { moisture: { enabled: false, byFarm: {} } },
        };
        const rawLua = {
            fields: [{ farmlandId: 1, hectares: 1.2 }],
            weather: { currentTemperature: 10 },
            baleInventory: { moisture: { enabled: false, byFarm: {} } },
        };
        const out = applyLiveSectionHold(merged, state, rawLua, null);
        expect(out.weather.moisture.currentPercent).toBe(55);
        expect(baleMoistureHasData(out.baleInventory)).toBe(true);
        expect(out.fields[0].moisture.percent).toBe(20);
        expect(out.dataTimestamps.liveSectionsHeldAt).toBeTruthy();
    });

    test('updateLiveSectionBackup does not wipe field moisture on empty moisture write', () => {
        const state = { liveSectionBackup: {} };
        updateLiveSectionBackup(
            state,
            {
                fields: [{ farmlandId: 3, hectares: 4, moisture: { enabled: true, percent: 11 } }],
            },
            null
        );
        updateLiveSectionBackup(
            state,
            {
                fields: [{ farmlandId: 3, hectares: 4, fruitType: 'GRASS' }],
            },
            null
        );
        expect(state.liveSectionBackup.fields[0].moisture.percent).toBe(11);
    });
});
