const { mergeData } = require('../dataMerger');

describe('mergeData lua_only without XML (join-as-client)', () => {
    const luaBase = {
        serverInfo: { mapName: 'Witcombe Park Farm', saveSlot: 'savegame6', mapId: 'witcombe' },
        gameSettings: {
            weedsEnabled: false,
            plowingRequired: true,
            limeRequired: true,
            stonesEnabled: false,
        },
        finance: { money: 250000 },
        farmInfo: [
            { id: 1, name: 'Spectator', money: 0, players: [] },
            { id: 3, name: 'Main Farm', money: 250000, players: [{ name: 'Host' }] },
        ],
        animals: [{ ownerFarmId: 3, animalCount: 12, clusters: [{ count: 12 }] }],
        fields: [{ id: 1, ownerFarmId: 3, fruitType: 'WHEAT', fruitTypeName: 'WHEAT' }],
        vehicles: [
            {
                id: 10,
                name: '1000 Vario',
                ownerFarmId: 100,
                ownerFarmIdPool: true,
                needsSaving: true,
                propertyState: 'OWNED',
                ads: { enabled: true },
                isMotorized: true,
                uniqueId: 'uid-vario',
                configFileName: 'vehicles/fendt/vario1000/vario1000.xml',
                position: { x: 100, y: 0, z: 200 },
            },
            {
                id: 11,
                name: 'Shop Demo',
                ownerFarmId: 100,
                needsSaving: false,
                propertyState: 'SHOP_CONFIG',
                ads: { enabled: true },
                configFileName: 'vehicles/fendt/700Vario/700Vario.xml',
            },
        ],
        economy: {
            marketPrices: {
                crops: {
                    WHEAT: {
                        fillTypeIndex: 1,
                        bestPrice: 1.2,
                        avgPrice: 1.0,
                        priceHistory: {
                            EARLY_SPRING: 0.9,
                            MID_SPRING: 1.0,
                            LATE_SPRING: 1.1,
                            EARLY_SUMMER: 1.2,
                            MID_SUMMER: 1.1,
                            LATE_SUMMER: 1.0,
                            EARLY_AUTUMN: 0.95,
                            MID_AUTUMN: 0.9,
                            LATE_AUTUMN: 0.85,
                            EARLY_WINTER: 0.8,
                            MID_WINTER: 0.85,
                            LATE_WINTER: 0.88,
                        },
                    },
                },
            },
        },
        stock: { enabled: true, storages: [] },
        production: {},
        redTape: { enabled: false, byFarm: {} },
    };

    test('passes through gameSettings and save slot', () => {
        const merged = mergeData(luaBase, null);
        expect(merged.dataSource).toBe('lua_only');
        expect(merged.xmlAvailable).toBe(false);
        expect(merged.gameSettings.weedsEnabled).toBe(false);
        expect(merged.settings.plowingRequired).toBe(true);
        expect(merged.savegameName).toBe('savegame6');
    });

    test('keeps lua crop priceHistory without economy.xml', () => {
        const merged = mergeData(luaBase, null);
        const wheat = merged.economy.marketPrices.crops.WHEAT;
        expect(wheat.priceHistory.MID_SUMMER).toBe(1.1);
        expect(wheat.avgPrice).toBe(1.0);
    });

    test('remaps save-backed pool-100 fleet onto livestock farm without vehicles.xml', () => {
        const merged = mergeData(luaBase, null);
        const farm3 = (merged.vehicles || []).filter((v) => Number(v.ownerFarmId) === 3);
        const farm100 = (merged.vehicles || []).filter((v) => Number(v.ownerFarmId) === 100);
        expect(farm100).toHaveLength(0);
        expect(farm3.some((v) => v.name === '1000 Vario')).toBe(true);
        expect(farm3.some((v) => v.name === 'Shop Demo')).toBe(false);
    });
});
