/** Ensure optional mod sections (invoices / hirePurchasing / mileage) survive merge. */
const { mergeData, mergeVehicles } = require('../dataMerger');
const { pruneMergedDataToPlayerFarms } = require('../farmScope.cjs');

describe('mergeData optional mod sections', () => {
    const luaBase = {
        farmInfo: [{ id: 1, name: 'Farm', players: [{ name: 'P' }] }],
        finance: { money: 1000 },
        animals: [],
        vehicles: [
            {
                id: 1,
                name: 'Tractor',
                ownerFarmId: 1,
                configFileName: 'data/vehicles/x/x.xml',
                mileage: { enabled: true, odoKm: 12.5, tripKm: 1.2 },
            },
        ],
        fields: [],
        invoices: { enabled: true, settings: {}, byFarm: { '1': { summary: {}, items: [] } } },
        hirePurchasing: { enabled: true, byFarm: { '1': { deals: [] } } },
        mileageSummary: { enabled: true, vehicleCount: 1, totalOdoKm: 12.5, totalTripKm: 1.2 },
        collectorModules: { invoices: true, hirePurchasing: true, vehicles: true },
        adsSummary: null,
        vehicleYearsSummary: null,
        redTape: { enabled: false, byFarm: {} },
        stock: { enabled: false, byFarm: {} },
    };

    test('merged path keeps invoices, hirePurchasing, mileageSummary, collectorModules', () => {
        const xml = {
            career: { mapTitle: 'Test', settings: {}, mods: [{ modName: 'FS25_Invoices', title: 'Invoices' }] },
            environment: {},
            vehicles: [],
            fields: [],
            allFields: [],
            farmlandsArray: [],
            missions: [],
            placeables: [],
            economy: {},
        };
        const merged = mergeData(luaBase, xml);
        expect(merged.invoices).toEqual(expect.objectContaining({ enabled: true }));
        expect(merged.hirePurchasing).toEqual(expect.objectContaining({ enabled: true }));
        expect(merged.mileageSummary).toEqual(expect.objectContaining({ enabled: true }));
        expect(merged.collectorModules.invoices).toBe(true);
        expect(merged.collectorModules.hirePurchasing).toBe(true);
        expect(merged.vehicles[0].mileage).toEqual(
            expect.objectContaining({ enabled: true, odoKm: 12.5 })
        );
    });

    test('lua_only path keeps invoices / hirePurchasing / mileage', () => {
        const merged = mergeData(luaBase, null);
        expect(merged.dataSource).toBe('lua_only');
        expect(merged.invoices.enabled).toBe(true);
        expect(merged.hirePurchasing.enabled).toBe(true);
        expect(merged.mileageSummary.enabled).toBe(true);
        expect(merged.vehicles[0].mileage.odoKm).toBe(12.5);
    });

    test('farmScope prunes other farms from invoices / hirePurchasing', () => {
        const raw = {
            farmInfo: [
                { id: 1, name: 'A', players: [{ name: 'P' }] },
                { id: 2, name: 'B', players: [{ name: 'Q' }] },
            ],
            invoices: {
                enabled: true,
                byFarm: {
                    '1': { items: [{ id: 1 }] },
                    '15': { items: [{ id: 99 }] },
                },
            },
            hirePurchasing: {
                enabled: true,
                byFarm: {
                    '1': { deals: [{ id: 'd1' }] },
                    '15': { deals: [{ id: 'npc' }] },
                },
            },
        };
        const out = pruneMergedDataToPlayerFarms(raw);
        expect(out.invoices.byFarm['1']).toBeTruthy();
        expect(out.invoices.byFarm['15']).toBeUndefined();
        expect(out.hirePurchasing.byFarm['1']).toBeTruthy();
        expect(out.hirePurchasing.byFarm['15']).toBeUndefined();
    });
});

describe('mergeVehicles mileage nest', () => {
    test('keeps mileage through lua+xml merge', () => {
        const lua = [
            {
                id: 1,
                name: 'MF',
                ownerFarmId: 1,
                configFileName: 'data/vehicles/masseyFerguson/series9S/series9S.xml',
                mileage: { enabled: true, odoKm: 42, tripKm: 3 },
            },
        ];
        const xml = [
            {
                uniqueId: 'u1',
                filename: 'data/vehicles/masseyFerguson/series9S/series9S.xml',
                farmId: 1,
                ownerFarmId: 1,
                name: 'series9S',
            },
        ];
        const out = mergeVehicles(lua, xml);
        expect(out).toHaveLength(1);
        expect(out[0].mileage).toEqual({ enabled: true, odoKm: 42, tripKm: 3 });
    });
});

describe('mergeData RF soil on XML+Lua fields', () => {
    test('keeps soilFertilizer and cropStress when XML supplies the field row', () => {
        const lua = {
            farmInfo: [{ id: 1, name: 'Farm', players: [{ name: 'P' }] }],
            finance: { money: 1000 },
            animals: [],
            vehicles: [],
            fields: [
                {
                    id: 1,
                    farmlandId: 1,
                    ownerFarmId: 1,
                    fruitType: 'empty',
                    hectares: 21.96,
                    soilFertilizer: {
                        enabled: true,
                        pfConflict: false,
                        organicMatter: 3.2,
                        pH: 6.1,
                    },
                    cropStress: { enabled: true, moisturePercent: 10 },
                    waterLevel: 1,
                    pfSoilTypeIndex: 3,
                    isPrecisionFarming: false,
                },
            ],
            realisticFarming: {
                soilFertilizer: { enabled: true, pfConflict: false, fieldCount: 1 },
                presence: { enabled: true, mods: [{ id: 'FS25_SoilFertilizer', detected: true }] },
            },
            redTape: { enabled: false, byFarm: {} },
            stock: { enabled: false, byFarm: {} },
        };
        const xml = {
            career: { mapTitle: 'Montana Map', settings: {}, mods: [] },
            environment: {},
            vehicles: [],
            fields: [
                {
                    id: 1,
                    farmlandId: 1,
                    ownerFarmId: 1,
                    fruitType: 'empty',
                    fertilizationLevel: 0,
                    needsLime: true,
                },
            ],
            allFields: [
                {
                    id: 1,
                    farmlandId: 1,
                    ownerFarmId: 1,
                    fruitType: 'empty',
                    fertilizationLevel: 0,
                    needsLime: true,
                },
            ],
            farmlandsArray: [],
            missions: [],
            placeables: [],
            economy: {},
        };
        const merged = mergeData(lua, xml);
        expect(merged.fields).toHaveLength(1);
        expect(merged.fields[0].soilFertilizer).toEqual(
            expect.objectContaining({ enabled: true, organicMatter: 3.2, pH: 6.1 })
        );
        expect(merged.fields[0].cropStress).toEqual(
            expect.objectContaining({ enabled: true, moisturePercent: 10 })
        );
        expect(merged.fields[0].waterLevel).toBe(1);
        expect(merged.fields[0].pfSoilTypeIndex).toBe(3);
        expect(merged.realisticFarming.soilFertilizer.enabled).toBe(true);
    });

    test('keeps compact field outline and fruitMapColor from Lua', () => {
        const lua = {
            farmInfo: [{ id: 1, name: 'Farm', players: [{ name: 'P' }] }],
            finance: { money: 1000 },
            animals: [],
            vehicles: [],
            fields: [
                {
                    id: 1,
                    farmlandId: 1,
                    ownerFarmId: 1,
                    fruitType: 'WHEAT',
                    fruitMapColor: '#E8C547',
                    outline: [[10, 20], [40, 20], [40, 50], [10, 50]],
                    soilFertilizer: { enabled: true, organicMatter: 3.2 },
                },
            ],
            redTape: { enabled: false, byFarm: {} },
            stock: { enabled: false, byFarm: {} },
        };
        const xml = {
            career: { mapTitle: 'Montana Map', settings: {}, mods: [] },
            environment: {},
            vehicles: [],
            fields: [{ id: 1, farmlandId: 1, ownerFarmId: 1, fruitType: 'WHEAT' }],
            allFields: [{ id: 1, farmlandId: 1, ownerFarmId: 1, fruitType: 'WHEAT' }],
            farmlandsArray: [],
            missions: [],
            placeables: [],
            economy: {},
        };
        const merged = mergeData(lua, xml);
        expect(merged.fields[0].outline).toEqual([[10, 20], [40, 20], [40, 50], [10, 50]]);
        expect(merged.fields[0].fruitMapColor).toBe('#E8C547');
    });
});
