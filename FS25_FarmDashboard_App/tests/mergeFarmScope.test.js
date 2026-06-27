// Dedicated-server regression: new player farm must appear when live Lua has assets
// but FTP/XML farmland still only lists older farms.
const {
    mergeData,
    resolveTransientVehicleOwnership,
    inferTransientVehiclePoolFarmId,
} = require('../dataMerger');

const baseLua = {
    serverInfo: { mapName: 'Test Map', saveSlot: 'savegame1' },
    finance: { money: 1000 },
    gameTime: { day: 1 },
    weather: {},
    economy: {},
    production: {},
    stock: { enabled: false, byFarm: {} },
    animals: [],
    vehicles: [],
    fields: [],
    farmInfo: [],
};

const baseXml = {
    career: { mapTitle: 'Test Map', savegameName: 'Test', settings: {} },
    environment: {},
    economy: {},
    placeables: [],
    missions: [],
    vehicles: [],
    fields: [],
    farms: [],
    farmlandsArray: [],
    allFields: [],
};

describe('mergeData farm picker (multi-farm dedicated)', () => {
    test('keeps new farm when Lua has fields but XML farmland only lists other farms', () => {
        const lua = {
            ...baseLua,
            farmInfo: [
                { id: 1, name: 'Farm One', isPlayer: true, players: [{ name: 'Host' }] },
                { id: 3, name: 'New Farm', isPlayer: true, players: [{ name: 'Graham' }] },
            ],
            fields: [
                { farmlandId: 10, ownerFarmId: 1, name: 'Field 10' },
                { farmlandId: 20, ownerFarmId: 3, name: 'Field 20' },
            ],
            vehicles: [{ id: 1, name: 'Tractor', ownerFarmId: 3 }],
            animals: [{ id: 50, name: 'Cow Barn', ownerFarmId: 3, animalCount: 12 }],
        };
        const xml = {
            ...baseXml,
            farms: [
                { id: 1, name: 'Farm One', players: [{ nickname: 'Host' }] },
            ],
            farmlandsArray: [
                { farmlandId: 10, farmId: 1 },
            ],
        };

        const merged = mergeData(lua, xml);
        const ids = (merged.farmInfo || []).map((f) => Number(f.id)).sort((a, b) => a - b);
        expect(ids).toEqual([1, 3]);
    });

    test('keeps player farm with assigned players even before any owned land appears in XML', () => {
        const lua = {
            ...baseLua,
            farmInfo: [
                { id: 2, name: 'Starter', isPlayer: true, players: [{ name: 'Player' }] },
            ],
            fields: [],
            vehicles: [],
            animals: [],
        };
        const xml = {
            ...baseXml,
            farms: [{ id: 2, name: 'Starter', players: [{ nickname: 'Player' }] }],
            farmlandsArray: [{ farmlandId: 5, farmId: 1 }],
        };

        const merged = mergeData(lua, xml);
        expect((merged.farmInfo || []).map((f) => f.id)).toContain(2);
    });

    test('synthesizes farm row when only farmland + vehicles reference new farmId', () => {
        const lua = {
            ...baseLua,
            farmInfo: [{ id: 1, name: 'Farm One', isPlayer: true, players: [{ name: 'Host' }] }],
            fields: [{ farmlandId: 20, ownerFarmId: 3, name: 'Field 20' }],
            vehicles: [{ id: 1, name: 'Tractor', ownerFarmId: 3 }],
            animals: [{ id: 50, name: 'Cow Barn', ownerFarmId: 3, animalCount: 12 }],
        };
        const xml = {
            ...baseXml,
            farms: [{ id: 1, name: 'Farm One', players: [{ nickname: 'Host' }] }],
            farmlandsArray: [
                { farmlandId: 10, farmId: 1 },
                { farmlandId: 20, farmId: 3 },
            ],
        };

        const merged = mergeData(lua, xml);
        const ids = (merged.farmInfo || []).map((f) => Number(f.id)).sort((a, b) => a - b);
        expect(ids).toEqual([1, 3]);
        expect(merged.farmInfo.find((f) => f.id === 3).name).toMatch(/Farm 3|New/i);
    });

    test('farmInfo keyed as object still resolves farm ids', () => {
        const lua = {
            ...baseLua,
            farmInfo: {
                '1': { name: 'Farm One', money: 100, isPlayer: true },
                '3': { name: 'New Farm', money: 50, isPlayer: true },
            },
            fields: [{ farmlandId: 20, ownerFarmId: 3 }],
        };
        const xml = { ...baseXml, farmlandsArray: [{ farmlandId: 20, farmId: 3 }] };

        const merged = mergeData(lua, xml);
        expect((merged.farmInfo || []).map((f) => f.id)).toContain(3);
    });

    test('merge survives stock.byFarm items as empty object (dedicated server export)', () => {
        const lua = {
            ...baseLua,
            farmInfo: [
                { id: 1, name: 'Farm One', isPlayer: true, players: [{ name: 'Host' }] },
                { id: 3, name: 'Livestock Farm', isPlayer: true, players: [{ name: 'Graham' }] },
            ],
            vehicles: [{ id: 1, name: 'Tractor', ownerFarmId: 3 }],
            stock: {
                enabled: true,
                byFarm: {
                    1: { farmId: 1, fillTypeCount: 1, items: [{ fillTypeIndex: 2, fillType: 'WHEAT', totalLiters: 100 }] },
                    3: { farmId: 3, fillTypeCount: 0, items: {} },
                },
            },
        };
        const xml = {
            ...baseXml,
            farms: [
                { id: 1, name: 'Farm One', players: [{ nickname: 'Host' }] },
                { id: 3, name: 'Livestock Farm', players: [{ nickname: 'Graham' }] },
            ],
            farmlandsArray: [{ farmlandId: 12, farmId: 3 }],
        };

        expect(() => mergeData(lua, xml)).not.toThrow();
        const merged = mergeData(lua, xml);
        expect((merged.farmInfo || []).map((f) => f.id)).toEqual(expect.arrayContaining([1, 3]));
    });

    test('does not add contractor vehicles-only farm or empty pen farmId', () => {
        const lua = {
            ...baseLua,
            farmInfo: [
                { id: 1, name: 'Main Arable Farm', isPlayer: true, players: [{ name: 'Host' }] },
                { id: 2, name: 'Main Dairy Farm', isPlayer: true, players: [{ name: 'Bee' }] },
                { id: 3, name: 'Livestock Farm', isPlayer: true, players: [{ name: 'Graham' }] },
            ],
            animals: [{ id: 479, name: 'Sheep Pasture', ownerFarmId: 15, animalCount: 0 }],
            vehicles: [
                { id: 537, name: '1000 Vario', ownerFarmId: 100 },
                { id: 538, name: '1000 Vario', ownerFarmId: 100 },
            ],
            production: { husbandryTotalsByFarm: { 15: {}, 2: {} } },
        };
        const xml = {
            ...baseXml,
            farms: [
                { id: 1, name: 'Main Arable Farm', players: [{ nickname: 'Host' }] },
                { id: 2, name: 'Main Dairy Farm', players: [{ nickname: 'Bee' }] },
                { id: 3, name: 'Livestock Farm', players: [{ nickname: 'Graham' }] },
            ],
            farmlandsArray: [
                { farmlandId: 1, farmId: 1 },
                { farmlandId: 6, farmId: 3 },
            ],
        };

        const merged = mergeData(lua, xml);
        const ids = (merged.farmInfo || []).map((f) => Number(f.id)).sort((a, b) => a - b);
        expect(ids).toEqual([1, 2, 3]);
    });

    test('drops deleted farm when live Lua removed it but FTP XML still lists it', () => {
        const lua = {
            ...baseLua,
            farmInfo: [
                { id: 1, name: 'Main Arable Farm', isPlayer: true, players: [{ name: 'Host' }] },
                { id: 2, name: 'Main Dairy Farm', isPlayer: true, players: [{ name: 'Bee' }] },
                { id: 3, name: 'Livestock Farm', isPlayer: true, players: [{ name: 'Graham' }] },
            ],
            fields: [
                { farmlandId: 1, ownerFarmId: 1, name: 'Field 1' },
                { farmlandId: 6, ownerFarmId: 3, name: 'Field 6' },
            ],
            vehicles: [{ id: 1, name: 'Tractor', ownerFarmId: 3 }],
        };
        const xml = {
            ...baseXml,
            farms: [
                { id: 1, name: 'Main Arable Farm', players: [{ nickname: 'Host' }] },
                { id: 2, name: 'Main Dairy Farm', players: [{ nickname: 'Bee' }] },
                { id: 3, name: 'Livestock Farm', players: [{ nickname: 'Graham' }] },
                { id: 4, name: 'Deleted Farm', players: [{ nickname: 'Graham' }] },
            ],
            farmlandsArray: [
                { farmlandId: 1, farmId: 1 },
                { farmlandId: 6, farmId: 3 },
                { farmlandId: 99, farmId: 4 },
            ],
        };

        const merged = mergeData(lua, xml);
        const ids = (merged.farmInfo || []).map((f) => Number(f.id)).sort((a, b) => a - b);
        expect(ids).toEqual([1, 2, 3]);
    });

    test('livestock farm keeps ADS vehicles when lua reports farm 100 but xml has farm 3', () => {
        const cfg = 'data/vehicles/fendt/vario1000/vario1000.xml';
        const lua = {
            ...baseLua,
            farmInfo: [
                { id: 1, name: 'Main Arable Farm', isPlayer: true, players: [{ name: 'Host' }] },
                { id: 3, name: 'Livestock Farm', isPlayer: true, players: [{ name: 'Graham' }] },
            ],
            fields: [{ farmlandId: 6, ownerFarmId: 3, name: 'Field 6' }],
            animals: [{ id: 932, name: 'Sheep Pasture', ownerFarmId: 3, animalCount: 12 }],
            vehicles: [{
                id: 537,
                name: '1000 Vario',
                ownerFarmId: 100,
                configFileName: cfg,
                isMotorized: true,
                ads: { enabled: true, condition: 0.9, breakdownCount: 0 },
            }],
        };
        const xml = {
            ...baseXml,
            farms: [
                { id: 1, name: 'Main Arable Farm', players: [{ nickname: 'Host' }] },
                { id: 3, name: 'Livestock Farm', players: [{ nickname: 'Graham' }] },
            ],
            farmlandsArray: [{ farmlandId: 6, farmId: 3 }],
            vehicles: [{
                uniqueId: 'v537',
                name: '1000 Vario',
                farmId: 3,
                filename: cfg,
            }],
        };

        const merged = mergeData(lua, xml);
        const farm3 = (merged.vehicles || []).filter((v) => Number(v.ownerFarmId) === 3);
        expect(farm3).toHaveLength(1);
        expect(farm3[0].ads?.enabled).toBe(true);
    });

    test('Witcombe DS: pool farm 100 maps to livestock farm when xml also uses 100', () => {
        const cfg = 'data/vehicles/fendt/vario1000/vario1000.xml';
        const lua = {
            ...baseLua,
            farmInfo: [
                { id: 1, name: 'Main Arable Farm', isPlayer: true, players: [{ name: 'Host' }] },
                { id: 2, name: 'Main Dairy Farm', isPlayer: true, players: [{ name: 'Bee' }] },
                { id: 3, name: 'Livestock Farm', isPlayer: true, players: [{ name: 'Graham' }] },
            ],
            fields: [
                { farmlandId: 1, ownerFarmId: 1, name: 'Field 1' },
                { farmlandId: 6, ownerFarmId: 3, name: 'Field 6' },
            ],
            animals: [
                { id: 932, name: 'Sheep Pasture', ownerFarmId: 3, animalCount: 12 },
                { id: 933, name: 'Pigsty', ownerFarmId: 3, animalCount: 40 },
            ],
            vehicles: [
                { id: 1, name: 'Arable Tractor', ownerFarmId: 1, configFileName: 'data/vehicles/johnDeere/6r/6r.xml' },
                { id: 2, name: 'Dairy Tractor', ownerFarmId: 2, configFileName: 'data/vehicles/caseIH/magnum/magnum.xml' },
                {
                    id: 537,
                    name: '1000 Vario',
                    ownerFarmId: 100,
                    configFileName: cfg,
                    isMotorized: true,
                    ads: { enabled: true, condition: 0.9, breakdownCount: 0 },
                },
                {
                    id: 538,
                    name: '700 Vario',
                    ownerFarmId: 100,
                    configFileName: 'data/vehicles/fendt/vario700/vario700.xml',
                    isMotorized: true,
                    ads: { enabled: true, condition: 0.85, breakdownCount: 1 },
                },
            ],
        };
        const xml = {
            ...baseXml,
            farms: [
                { id: 1, name: 'Main Arable Farm', players: [{ nickname: 'Host' }] },
                { id: 2, name: 'Main Dairy Farm', players: [{ nickname: 'Bee' }] },
                { id: 3, name: 'Livestock Farm', players: [{ nickname: 'Graham' }] },
            ],
            farmlandsArray: [
                { farmlandId: 1, farmId: 1 },
                { farmlandId: 6, farmId: 3 },
            ],
            vehicles: [
                { uniqueId: 'v537', name: '1000 Vario', farmId: 100, filename: cfg },
                {
                    uniqueId: 'v538',
                    name: '700 Vario',
                    farmId: 100,
                    filename: 'data/vehicles/fendt/vario700/vario700.xml',
                },
                {
                    uniqueId: 'vNew',
                    name: 'vario700Gen6',
                    farmId: 3,
                    filename: '$moddir$FS25_Fendt700VarioSeries/i3d/vario700Gen6.xml',
                },
            ],
        };

        const merged = mergeData(lua, xml);
        const farm3 = (merged.vehicles || []).filter((v) => Number(v.ownerFarmId) === 3);
        const farm100 = (merged.vehicles || []).filter((v) => Number(v.ownerFarmId) === 100);
        expect(farm100).toHaveLength(0);
        expect(farm3.filter((v) => v.ads?.enabled)).toHaveLength(2);
        expect(farm3.some((v) => v.name === '1000 Vario')).toBe(true);
    });

    test('Witcombe DS: xml farm-3 implements do not block pool-100 ADS reassignment', () => {
        const cfg = 'data/vehicles/fendt/vario1000/vario1000.xml';
        const lua = {
            ...baseLua,
            farmInfo: [
                { id: 1, name: 'Main Arable Farm', isPlayer: true, players: [{ name: 'Host' }] },
                { id: 2, name: 'Main Dairy Farm', isPlayer: true, players: [{ name: 'Bee' }] },
                { id: 3, name: 'Livestock Farm', isPlayer: true, players: [{ name: 'Graham' }] },
            ],
            fields: [
                { farmlandId: 1, ownerFarmId: 1, name: 'Field 1' },
                { farmlandId: 6, ownerFarmId: 3, name: 'Field 6' },
            ],
            animals: [{ id: 932, name: 'Sheep Pasture', ownerFarmId: 3, animalCount: 12 }],
            vehicles: [{
                id: 537,
                name: '1000 Vario',
                ownerFarmId: 100,
                price: 382000,
                configFileName: cfg,
                isMotorized: true,
                ads: { enabled: true, condition: 0.9, breakdownCount: 0 },
            }],
        };
        const xml = {
            ...baseXml,
            farms: [
                { id: 1, name: 'Main Arable Farm', players: [{ nickname: 'Host' }] },
                { id: 2, name: 'Main Dairy Farm', players: [{ nickname: 'Bee' }] },
                { id: 3, name: 'Livestock Farm', players: [{ nickname: 'Graham' }] },
            ],
            farmlandsArray: [
                { farmlandId: 1, farmId: 1 },
                { farmlandId: 6, farmId: 3 },
            ],
            vehicles: [
                { uniqueId: 'v537', name: '1000 Vario', farmId: 100, filename: cfg, price: 382000, propertyState: 'OWNED' },
                { uniqueId: 'vNew', name: 'vario700Gen6', farmId: 3, filename: '$moddir$FS25_Fendt700VarioSeries/i3d/vario700Gen6.xml', price: 276312, propertyState: 'OWNED' },
                { uniqueId: 'vMow', name: 'poettingerNovaCat352V', farmId: 3, filename: '$moddir$FS25_poettingerEurocatNovacatPack/xml/poettingerNovaCat352V.xml', price: 15650, propertyState: 'OWNED' },
                { uniqueId: 'vMow2', name: 'poettingerHIT690N', farmId: 3, filename: '$moddir$FS25_poettingerHIT690N/poettingerHIT690N.xml', price: 10000, propertyState: 'OWNED' },
                { uniqueId: 'vMow3', name: 'poettingerTop722', farmId: 3, filename: '$moddir$FS25_poettingerTop722/poettingerTop722.xml', price: 40560, propertyState: 'OWNED' },
                { uniqueId: 'vTrail', name: 'carat', farmId: 3, filename: '$moddir$FS25_claasFlieglTrailerPack/carat/carat.xml', price: 20500, propertyState: 'OWNED' },
                { uniqueId: 'vBale', name: 'varipackV190XC', farmId: 3, filename: 'data/vehicles/krone/varipackV190XC/varipackV190XC.xml', price: 70480, propertyState: 'OWNED' },
            ],
        };

        const merged = mergeData(lua, xml);
        const farm3 = (merged.vehicles || []).filter((v) => Number(v.ownerFarmId) === 3);
        const farm100 = (merged.vehicles || []).filter((v) => Number(v.ownerFarmId) === 100);
        const farm3Ads = farm3.filter((v) => v.ads?.enabled);

        expect(farm100).toHaveLength(0);
        expect(farm3Ads.length).toBeGreaterThan(0);
        expect(farm3Ads.some((v) => v.name === '1000 Vario')).toBe(true);
        expect(farm3.some((v) => /vario700Gen6|Vario 700 Gen/i.test(String(v.name || v.filename || '')))).toBe(true);
    });

    test('Witcombe DS: farm 0 map traffic stays off livestock farm 3', () => {
        const cfg = 'data/vehicles/fendt/vario1000/vario1000.xml';
        const trafficCfg = '$moddir$FS25_Witcombe/map/config/trafficVehicles/britishRailCoach/britishRailCoach.xml';
        const lua = {
            ...baseLua,
            farmInfo: [
                { id: 1, name: 'Main Arable Farm', isPlayer: true, players: [{ name: 'Host' }] },
                { id: 2, name: 'Main Dairy Farm', isPlayer: true, players: [{ name: 'Bee' }] },
                { id: 3, name: 'Livestock Farm', isPlayer: true, players: [{ name: 'Graham' }] },
            ],
            fields: [
                { farmlandId: 1, ownerFarmId: 1, name: 'Field 1' },
                { farmlandId: 6, ownerFarmId: 3, name: 'Field 6' },
            ],
            animals: [{ id: 932, name: 'Sheep Pasture', ownerFarmId: 3, animalCount: 12 }],
            vehicles: [
                { id: 518, name: 'Woodchips Wagon', ownerFarmId: 0, price: 1, configFileName: trafficCfg },
                { id: 519, name: 'Woodchips Wagon', ownerFarmId: 0, price: 1, configFileName: trafficCfg },
                { id: 536, name: 'Train', ownerFarmId: 0, price: 1, configFileName: '$moddir$FS25_Witcombe/map/config/trafficVehicles/class40/class40.xml', isMotorized: true },
                {
                    id: 537,
                    name: '1000 Vario',
                    ownerFarmId: 100,
                    price: 382000,
                    configFileName: cfg,
                    isMotorized: true,
                    ads: { enabled: true, condition: 0.9, breakdownCount: 0 },
                },
                {
                    id: 541,
                    name: 'TopDown 600',
                    ownerFarmId: 100,
                    price: 90000,
                    configFileName: 'data/vehicles/vaderstad/topDown600/topDown600.xml',
                },
            ],
        };

        const farmInfo = lua.farmInfo;
        const xml = {
            vehicles: [
                { uniqueId: 'v537', name: 'vario1000', farmId: 100, filename: cfg, price: 382000, propertyState: 'OWNED' },
                {
                    uniqueId: 'v541',
                    name: 'topDown600',
                    farmId: 100,
                    filename: 'data/vehicles/vaderstad/topDown600/topDown600.xml',
                    price: 90000,
                    propertyState: 'OWNED',
                },
            ],
        };
        const resolved = resolveTransientVehicleOwnership(lua.vehicles, lua, farmInfo, xml);
        const farm3 = resolved.filter((v) => Number(v.ownerFarmId) === 3);
        const farm0 = resolved.filter((v) => Number(v.ownerFarmId) === 0);
        const farm100 = resolved.filter((v) => Number(v.ownerFarmId) === 100);

        expect(inferTransientVehiclePoolFarmId(lua.vehicles, lua, farmInfo, xml)).toBe(3);
        expect(farm0).toHaveLength(0);
        expect(farm100).toHaveLength(0);
        expect(farm3).toHaveLength(2);
        expect(farm3.some((v) => v.name === '1000 Vario' && v.ads?.enabled)).toBe(true);
        expect(farm3.some((v) => v.name === 'Woodchips Wagon')).toBe(false);
        expect(farm3.some((v) => v.name === 'Train')).toBe(false);
    });

    test('Witcombe DS: dealership pool-100 demos with ADS stay off livestock farm 3', () => {
        const dealershipCfg = 'data/vehicles/fendt/vario1000/vario1000.xml';
        const playerCfg = '$moddir$FS25_Fendt700VarioSeries/i3d/vario700Gen6.xml';
        const lua = {
            ...baseLua,
            farmInfo: [
                { id: 1, name: 'Main Arable Farm', isPlayer: true, players: [{ name: 'Host' }] },
                { id: 2, name: 'Main Dairy Farm', isPlayer: true, players: [{ name: 'Bee' }] },
                { id: 3, name: 'Livestock Farm', isPlayer: true, players: [{ name: 'Graham' }] },
            ],
            fields: [{ farmlandId: 6, ownerFarmId: 3, name: 'Field 6' }],
            animals: [{ id: 932, name: 'Sheep Pasture', ownerFarmId: 3, animalCount: 12 }],
            vehicles: [
                {
                    id: 900,
                    name: '1000 Vario',
                    ownerFarmId: 100,
                    price: 382000,
                    configFileName: dealershipCfg,
                    isMotorized: true,
                    needsSaving: false,
                    ads: { enabled: true, condition: 0.95, breakdownCount: 0 },
                },
                {
                    id: 901,
                    name: 'MF 9S',
                    ownerFarmId: 100,
                    price: 259000,
                    configFileName: 'data/vehicles/masseyFerguson/series9S/series9S.xml',
                    isMotorized: true,
                    needsSaving: false,
                    ads: { enabled: true, condition: 0.9, breakdownCount: 0 },
                },
                {
                    id: 902,
                    name: 'MF 9S',
                    ownerFarmId: 2,
                    price: 307950,
                    configFileName: 'data/vehicles/masseyFerguson/series9S/series9S.xml',
                    isMotorized: true,
                    ads: { enabled: true, condition: 0.88, breakdownCount: 0 },
                },
            ],
        };
        const xml = {
            ...baseXml,
            farms: [
                { id: 1, name: 'Main Arable Farm', players: [{ nickname: 'Host' }] },
                { id: 2, name: 'Main Dairy Farm', players: [{ nickname: 'Bee' }] },
                { id: 3, name: 'Livestock Farm', players: [{ nickname: 'Graham' }] },
            ],
            farmlandsArray: [{ farmlandId: 6, farmId: 3 }],
            vehicles: [
                {
                    uniqueId: 'dairy9s',
                    name: 'series9S',
                    farmId: 2,
                    filename: 'data/vehicles/masseyFerguson/series9S/series9S.xml',
                    price: 307950,
                    propertyState: 'OWNED',
                },
                {
                    uniqueId: 'livestockTractor',
                    name: 'vario700Gen6',
                    farmId: 3,
                    filename: playerCfg,
                    price: 276312,
                    propertyState: 'OWNED',
                },
            ],
        };

        const merged = mergeData(lua, xml);
        const farm3 = (merged.vehicles || []).filter((v) => Number(v.ownerFarmId) === 3);
        const farm2 = (merged.vehicles || []).filter((v) => Number(v.ownerFarmId) === 2);

        expect(farm3.some((v) => v.name === '1000 Vario')).toBe(false);
        expect(farm3.some((v) => v.name === 'MF 9S' && v.ads?.enabled)).toBe(false);
        expect(farm2.filter((v) => v.name === 'MF 9S')).toHaveLength(1);
        expect(farm2.find((v) => v.name === 'MF 9S')?.ads?.enabled).toBe(true);
        expect(farm3.some((v) => /vario700Gen6|Vario 700 Gen/i.test(String(v.name || v.filename || '')))).toBe(true);
    });

    test('Witcombe DS: new farm 4 does not inherit dealership pool-100 demos from savegame xml', () => {
        const dealershipCfg = 'data/vehicles/fendt/vario1000/vario1000.xml';
        const lua = {
            ...baseLua,
            farmInfo: [
                { id: 1, name: 'Main Arable Farm', isPlayer: true, players: [{ name: 'Host' }] },
                { id: 2, name: 'Main Dairy Farm', isPlayer: true, players: [{ name: 'Bee' }] },
                { id: 3, name: 'Livestock Farm', isPlayer: true, players: [{ name: 'Graham' }] },
                { id: 4, name: 'New Farm', isPlayer: true, players: [{ name: 'Alex' }] },
            ],
            fields: [
                { farmlandId: 6, ownerFarmId: 3, name: 'Field 6' },
                { farmlandId: 30, ownerFarmId: 4, name: 'Field 30' },
            ],
            animals: [{ id: 932, name: 'Sheep Pasture', ownerFarmId: 3, animalCount: 12 }],
            vehicles: [
                {
                    id: 900,
                    name: '1000 Vario',
                    ownerFarmId: 100,
                    price: 382000,
                    configFileName: dealershipCfg,
                    isMotorized: true,
                    needsSaving: false,
                    ads: { enabled: true, condition: 0.95, breakdownCount: 0 },
                },
                {
                    id: 901,
                    name: 'MF 9S',
                    ownerFarmId: 100,
                    price: 259000,
                    configFileName: 'data/vehicles/masseyFerguson/series9S/series9S.xml',
                    isMotorized: true,
                    needsSaving: false,
                    ads: { enabled: true, condition: 0.9, breakdownCount: 0 },
                },
                {
                    id: 902,
                    name: 'MF 9S',
                    ownerFarmId: 2,
                    price: 307950,
                    configFileName: 'data/vehicles/masseyFerguson/series9S/series9S.xml',
                    isMotorized: true,
                    ads: { enabled: true, condition: 0.88, breakdownCount: 0 },
                },
            ],
        };
        const xml = {
            ...baseXml,
            farms: [
                { id: 1, name: 'Main Arable Farm', players: [{ nickname: 'Host' }] },
                { id: 2, name: 'Main Dairy Farm', players: [{ nickname: 'Bee' }] },
                { id: 3, name: 'Livestock Farm', players: [{ nickname: 'Graham' }] },
                { id: 4, name: 'New Farm', players: [{ nickname: 'Alex' }] },
            ],
            farmlandsArray: [
                { farmlandId: 6, farmId: 3 },
                { farmlandId: 30, farmId: 4 },
            ],
            vehicles: [
                {
                    uniqueId: 'dealerVario',
                    name: 'vario1000',
                    farmId: 100,
                    filename: dealershipCfg,
                    price: 382000,
                    propertyState: 'OWNED',
                },
                {
                    uniqueId: 'dealer9s',
                    name: 'series9S',
                    farmId: 100,
                    filename: 'data/vehicles/masseyFerguson/series9S/series9S.xml',
                    price: 259000,
                    propertyState: 'OWNED',
                },
                {
                    uniqueId: 'dairy9s',
                    name: 'series9S',
                    farmId: 2,
                    filename: 'data/vehicles/masseyFerguson/series9S/series9S.xml',
                    price: 307950,
                    propertyState: 'OWNED',
                },
            ],
        };

        const merged = mergeData(lua, xml);
        const farm4 = (merged.vehicles || []).filter((v) => Number(v.ownerFarmId) === 4);
        const farm3 = (merged.vehicles || []).filter((v) => Number(v.ownerFarmId) === 3);
        const poolLeft = (merged.vehicles || []).filter((v) => Number(v.ownerFarmId) === 100);

        expect(farm4).toHaveLength(0);
        expect(poolLeft).toHaveLength(0);
        expect(farm3.some((v) => v.name === '1000 Vario')).toBe(false);
        expect(farm3.some((v) => v.name === 'MF 9S' && v.ads?.enabled)).toBe(false);
    });

    test('Witcombe DS: savegame pool-100 ADS fleet still maps to livestock farm 3', () => {
        const cfg = 'data/vehicles/fendt/vario1000/vario1000.xml';
        const lua = {
            ...baseLua,
            farmInfo: [
                { id: 3, name: 'Livestock Farm', isPlayer: true, players: [{ name: 'Graham' }] },
            ],
            fields: [{ farmlandId: 6, ownerFarmId: 3, name: 'Field 6' }],
            animals: [{ id: 932, name: 'Sheep Pasture', ownerFarmId: 3, animalCount: 12 }],
            vehicles: [{
                id: 537,
                name: '1000 Vario',
                ownerFarmId: 100,
                price: 382000,
                configFileName: cfg,
                isMotorized: true,
                ads: { enabled: true, condition: 0.9, breakdownCount: 0 },
            }],
        };
        const xml = {
            ...baseXml,
            farms: [{ id: 3, name: 'Livestock Farm', players: [{ nickname: 'Graham' }] }],
            farmlandsArray: [{ farmlandId: 6, farmId: 3 }],
            vehicles: [{
                uniqueId: 'v537',
                name: 'vario1000',
                farmId: 100,
                filename: cfg,
                price: 382000,
                propertyState: 'OWNED',
            }],
        };

        const merged = mergeData(lua, xml);
        const farm3 = (merged.vehicles || []).filter((v) => Number(v.ownerFarmId) === 3);
        expect(farm3).toHaveLength(1);
        expect(farm3[0].ads?.enabled).toBe(true);
        expect(farm3[0].name).toBe('1000 Vario');
    });

    test('buildFromXmlOnly reassigns pool farm 100 tractors onto livestock farm 3', () => {
        const cfg = 'data/vehicles/fendt/vario1000/vario1000.xml';
        const xml = {
            ...baseXml,
            farms: [
                { id: 1, name: 'Main Arable Farm', players: [{ nickname: 'Host' }] },
                { id: 2, name: 'Main Dairy Farm', players: [{ nickname: 'Bee' }] },
                { id: 3, name: 'Livestock Farm', players: [{ nickname: 'Graham' }] },
            ],
            farmlandsArray: [
                { farmlandId: 1, farmId: 1 },
                { farmlandId: 6, farmId: 3 },
            ],
            fields: [{ farmlandId: 6, ownerFarmId: 3, name: 'Field 6' }],
            vehicles: [
                { uniqueId: 'v537', name: 'vario1000', farmId: 100, filename: cfg, price: 382000, propertyState: 'OWNED' },
                { uniqueId: 'vNew', name: 'vario700Gen6', farmId: 3, filename: '$moddir$/vario700Gen6.xml', price: 276312, propertyState: 'OWNED' },
            ],
        };

        const merged = mergeData(null, xml);
        const farm3 = (merged.vehicles || []).filter((v) => Number(v.ownerFarmId) === 3);
        const farm100 = (merged.vehicles || []).filter((v) => Number(v.ownerFarmId) === 100);
        expect(farm100).toHaveLength(0);
        expect(farm3.length).toBeGreaterThanOrEqual(2);
        expect(farm3.some((v) => /vario1000/i.test(String(v.name || v.filename || '')))).toBe(true);
        expect((merged.farmInfo || []).map((f) => f.id)).toEqual(expect.arrayContaining([1, 2, 3]));
    });
});
