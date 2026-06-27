// Integration: real Witcombe dedicated-server shape — pool farm 100 in lua AND xml.
const fs = require('fs');
const path = require('path');
const { mergeData } = require('../dataMerger');
const { pruneMergedDataToPlayerFarms } = require('../farmScope.cjs');

const CACHE_PATH = path.join(
    process.env.APPDATA || '',
    'fs25-farm-dashboard',
    'data_srv_1780959672019.json'
);
const SNAP_PATH = path.join(
    process.env.APPDATA || '',
    'fs25-farm-dashboard',
    'serverLiveCache',
    'srv_1780959672019.json'
);

function luaLikeFromCache(cache) {
    return {
        serverInfo: cache.serverInfo || {},
        finance: cache.finance || {},
        gameTime: cache.gameTime || {},
        weather: cache.weather || {},
        economy: cache.economy || {},
        production: cache.production || {},
        stock: cache.stock || {},
        animals: cache.animals || [],
        fields: cache.fields || [],
        farmInfo: cache.farmInfo || [],
        adsSummary: cache.adsSummary || null,
        vehicles: (cache.vehicles || []).map((v) => ({ ...v })),
    };
}

describe('mergeData transient pool (live cache integration)', () => {
    test('lua-only: dealership pool-100 ADS demos do not land on livestock farm 3', () => {
        if (!fs.existsSync(CACHE_PATH)) {
            console.warn('[skip] live cache not present at', CACHE_PATH);
            return;
        }
        const cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
        const luaLike = luaLikeFromCache(cache);
        const before100 = luaLike.vehicles.filter((v) => Number(v.ownerFarmId) === 100).length;
        expect(before100).toBeGreaterThan(0);

        const merged = mergeData(luaLike, null);
        const pruned = pruneMergedDataToPlayerFarms(merged);
        const farm3Ads = (pruned.vehicles || []).filter(
            (v) => Number(v.ownerFarmId) === 3 && v.ads && v.ads.enabled
        );
        const farm3Dealership = (pruned.vehicles || []).filter(
            (v) => Number(v.ownerFarmId) === 3 && /1000 Vario|700 Vario|541-70/i.test(String(v.name))
        );

        expect(farm3Ads).toHaveLength(0);
        expect(farm3Dealership).toHaveLength(0);
    });

    test('with savegame xml: pool-100 player fleet maps onto livestock farm 3', () => {
        if (!fs.existsSync(CACHE_PATH)) {
            console.warn('[skip] live cache not present at', CACHE_PATH);
            return;
        }
        const cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
        const luaLike = luaLikeFromCache(cache);
        const poolLua = luaLike.vehicles.filter((v) => Number(v.ownerFarmId) === 100);
        expect(poolLua.length).toBeGreaterThan(0);

        let snapVehicles = [];
        if (fs.existsSync(SNAP_PATH)) {
            const snap = JSON.parse(fs.readFileSync(SNAP_PATH, 'utf8'));
            snapVehicles = (snap.mergedSnapshot?.vehicles || []).map((v, i) => ({
                uniqueId: v.uniqueId || `snap${i}`,
                name: v.name,
                filename: v.filename || v.configFileName || '',
                farmId: Number(v.ownerFarmId ?? v.farmId),
                price: v.price || 0,
                propertyState: 'OWNED',
                position: v.position,
            }));
        }
        for (const v of poolLua) {
            const cfg = String(v.configFileName || v.filename || '').split('/').pop() || '';
            if (cfg.toLowerCase() !== 'vario1000.xml') continue;
            snapVehicles.push({
                uniqueId: `pool${v.id}`,
                name: v.name,
                filename: v.configFileName || '',
                farmId: 100,
                price: v.price || 0,
                propertyState: 'OWNED',
                position: v.position,
            });
        }

        const xml = {
            career: { mapTitle: 'Witcombe' },
            environment: {},
            economy: {},
            placeables: [],
            missions: [],
            fields: luaLike.fields,
            farms: (luaLike.farmInfo || []).map((f) => ({
                id: f.id,
                name: f.name,
                players: f.players || [],
            })),
            farmlandsArray: [{ farmlandId: 6, farmId: 3 }],
            allFields: luaLike.fields,
            vehicles: snapVehicles,
        };

        const merged = mergeData(luaLike, xml);
        const pruned = pruneMergedDataToPlayerFarms(merged);
        const farm3Ads = (pruned.vehicles || []).filter(
            (v) => Number(v.ownerFarmId) === 3 && v.ads && v.ads.enabled
        );
        const farm100Left = (pruned.vehicles || []).filter((v) => Number(v.ownerFarmId) === 100);
        const farm3Names = (pruned.vehicles || [])
            .filter((v) => Number(v.ownerFarmId) === 3)
            .map((v) => v.name);

        expect(farm100Left).toHaveLength(0);
        expect(farm3Ads.some((v) => v.name === '1000 Vario')).toBe(true);
        expect(farm3Names.some((n) => /700 Vario|541-70/i.test(String(n)))).toBe(false);
        expect(farm3Names.some((n) => /wagon|train/i.test(String(n)))).toBe(false);
    });
});
