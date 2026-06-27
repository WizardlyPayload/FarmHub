// Regression: mergeVehicles must pair a Lua vehicle with its XML savegame record by a STABLE
// config-file + farm key, NOT by position. On a live/dedicated server the Lua entry has the
// vehicle's *live* position and the XML entry has its *last-saved* position, so a position-only
// match missed and the same vehicle was emitted twice — once from Lua with its real display name
// ("MF 9S"), once as an "xml_only" card named after the config file ("series9S"). These tests
// pin the dedupe so that bug can't return.
const { mergeVehicles } = require('../dataMerger');

function luaVeh(over = {}) {
    return {
        id: 539,
        name: 'MF 9S',
        ownerFarmId: 2,
        configFileName: 'data/vehicles/masseyFerguson/series9S/series9S.xml',
        position: { x: 100, y: 0, z: 200 },
        isMotorized: true,
        ...over,
    };
}

function xmlVeh(over = {}) {
    return {
        uniqueId: 'abc123',
        filename: 'data/vehicles/masseyFerguson/series9S/series9S.xml',
        name: 'series9S',
        farmId: 2,
        ownerFarmId: 2,
        age: 1,
        price: 300000,
        operatingTime: 6933750,
        damage: 0.02,
        fillLevels: {},
        position: { x: 100, y: 0, z: 200 },
        source: 'xml',
        ...over,
    };
}

describe('mergeVehicles dedupe by config+farm key', () => {
    test('moved vehicle (lua pos != xml pos) merges into ONE entry, not a duplicate', () => {
        const lua = [luaVeh({ position: { x: 17, y: 0, z: 629 } })]; // live position
        const xml = [xmlVeh({ position: { x: 100, y: 0, z: 200 } })]; // saved position (far away)
        const out = mergeVehicles(lua, xml);
        expect(out).toHaveLength(1);
        expect(out[0].source).toBe('merged');
        expect(out[0].name).toBe('MF 9S'); // real name kept, not "series9S"
        expect(out[0].uniqueId).toBe('abc123'); // enriched from XML
        expect(out.some(v => v.source === 'xml_only')).toBe(false);
    });

    test('two same-model vehicles on one farm pair 1:1 (no phantom third)', () => {
        const lua = [
            luaVeh({ id: 1, name: 'MF 9S', position: { x: 0, y: 0, z: 0 } }),
            luaVeh({ id: 2, name: 'MF 9S', position: { x: 500, y: 0, z: 500 } }),
        ];
        const xml = [
            xmlVeh({ uniqueId: 'x1', position: { x: 2, y: 0, z: 2 } }),
            xmlVeh({ uniqueId: 'x2', position: { x: 498, y: 0, z: 498 } }),
        ];
        const out = mergeVehicles(lua, xml);
        expect(out).toHaveLength(2);
        expect(out.filter(v => v.source === 'merged')).toHaveLength(2);
        // Closest-position tiebreak: lua id1 -> x1, lua id2 -> x2.
        expect(out.find(v => v.id === 1).uniqueId).toBe('x1');
        expect(out.find(v => v.id === 2).uniqueId).toBe('x2');
    });

    test('XML record with no Lua counterpart is kept as xml_only (off-map / stored)', () => {
        const lua = [];
        const xml = [xmlVeh({ uniqueId: 'stored1', name: 'edk650', filename: 'x/edk650.xml' })];
        const out = mergeVehicles(lua, xml);
        expect(out).toHaveLength(1);
        expect(out[0].source).toBe('xml_only');
        expect(out[0].uniqueId).toBe('stored1');
    });

    test('different farms with the same model do not cross-match', () => {
        const lua = [luaVeh({ id: 9, ownerFarmId: 1 })];
        const xml = [xmlVeh({ uniqueId: 'f2', farmId: 2, ownerFarmId: 2 })];
        const out = mergeVehicles(lua, xml);
        // farm-1 lua stays lua_only; farm-2 xml has no lua twin -> xml_only. No false merge.
        expect(out).toHaveLength(2);
        expect(out.find(v => v.id === 9).source).toBe('lua_only');
        expect(out.find(v => v.uniqueId === 'f2').source).toBe('xml_only');
    });

    test('lua vehicle with no config key stays single (cannot dedupe but no crash)', () => {
        const lua = [luaVeh({ configFileName: '' })];
        const out = mergeVehicles(lua, []);
        expect(out).toHaveLength(1);
        expect(out[0].source).toBe('lua_only');
    });

    test('lua ownerFarmId 0 is preserved (used equipment yard stock)', () => {
        const lua = [
            luaVeh({
                id: 77,
                ownerFarmId: 0,
                isUsedEquipmentYardStock: true,
            }),
        ];
        const xml = [
            xmlVeh({
                uniqueId: 'yard1',
                farmId: 1,
                ownerFarmId: 1,
                filename: 'data/vehicles/masseyFerguson/series9S/series9S.xml',
            }),
        ];
        const out = mergeVehicles(lua, xml);
        const yard = out.find((v) => v.id === 77);
        expect(yard).toBeTruthy();
        expect(yard.ownerFarmId).toBe(0);
        expect(yard.isUsedEquipmentYardStock).toBe(true);
        expect(out).toHaveLength(2);
    });

    test('lua farm 100 resolves to xml player farm and keeps ADS payload (livestock / DS pool quirk)', () => {
        const cfg = 'data/vehicles/fendt/vario1000/vario1000.xml';
        const lua = [
            luaVeh({
                id: 537,
                name: '1000 Vario',
                ownerFarmId: 100,
                configFileName: cfg,
                position: { x: -530, y: 71, z: 969 },
                ads: { enabled: true, condition: 0.95, breakdownCount: 0 },
            }),
        ];
        const xml = [
            xmlVeh({
                uniqueId: 'v537',
                name: '1000 Vario',
                farmId: 3,
                ownerFarmId: 3,
                filename: cfg,
                position: { x: -530, y: 71, z: 969 },
            }),
        ];
        const out = mergeVehicles(lua, xml);
        expect(out).toHaveLength(1);
        expect(out[0].source).toBe('merged');
        expect(out[0].ownerFarmId).toBe(3);
        expect(out[0].ads?.enabled).toBe(true);
    });
});
