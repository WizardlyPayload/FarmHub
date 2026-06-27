// FS25 FarmDashboard | dataMerger.js | v4.0.0

/**
 * dataMerger.js  —  Merge Lua live data + XML savegame data
 *
 * Priority:
 *  Lua wins  → live animals, live weather/temperature, live vehicle engine state,
 *               field `needsWork` / soil-map overlay when a Lua row exists (XML heuristics are coarse)
 *  XML wins  → base field row from fields.xml (crop, growthState, soil flags),
 *               weather forecast, missions, farm statistics, game settings
 *  Merged    → vehicles (XML farmId/price + Lua engine/speed),
 *               economy (XML history + Lua sell points),
 *               farms (XML players/stats + Lua live money)
 *
 *  Field “Suggested Next Step” → when Lua has a row for that farmlandId, suggestions
 *  come from Lua only (live game). XML suggestions are used only when there is no Lua
 *  match (savegame-only / HTTP path). Never merge two suggestion lists.
 */

const { assessModVersion } = require('./modVersionPolicy.js');
const { pruneMergedDataToPlayerFarms, getPlayerFarmIdSet } = require('./farmScope.cjs');
const { enrichStockFillTypes, applyFillTypeTitles, enrichStockFillTypesFromPlaceables } = require('./fillTypeResolve.cjs');
const { enrichStockMoistureFromXml } = require('./stockMoistureFromXml');

const BALE_LITER_ESTIMATE = 4000;
const BALE_INDEX_CATEGORY = {
    25: 'silage',
    26: 'grass',
    30: 'hay',
    31: 'straw',
};
const KNOWN_FILL_INDEX_NAMES = {
    28: 'GRASS_WINDROW',
    30: 'DRYGRASS_WINDROW',
};

function emptyBaleBucket() {
    return { straw: 0, grass: 0, hay: 0, silage: 0, other: 0, byFillType: {} };
}

function baleCategoryFromName(name) {
    const n = String(name || '').toUpperCase();
    if (!n) return 'other';
    if (n.includes('STRAW')) return 'straw';
    if (n.includes('SILAGE') || n.includes('FERMENT')) return 'silage';
    if (n.includes('DRYGRASS') || n.includes('HAY')) return 'hay';
    if (n.includes('GRASS_WINDROW') || (n.includes('GRASS') && !n.includes('FERT'))) return 'grass';
    return 'other';
}

function tallyBaleBucket(bucket, fillTypeIndex, count, catalog) {
    const idx = Number(fillTypeIndex);
    const n = Number(count) || 0;
    if (!Number.isFinite(idx) || idx <= 0 || n <= 0) return;
    const out = bucket || emptyBaleBucket();
    out.byFillType = out.byFillType || {};
    const label =
        catalog?.[String(idx)] ||
        catalog?.[idx] ||
        KNOWN_FILL_INDEX_NAMES[idx] ||
        '';
    let cat = baleCategoryFromName(label);
    if (cat === 'other' && BALE_INDEX_CATEGORY[idx]) cat = BALE_INDEX_CATEGORY[idx];
    out[cat] = (Number(out[cat]) || 0) + n;
    if (label && !/^\d+$/.test(String(label))) {
        out.byFillType[label] = (Number(out.byFillType[label]) || 0) + n;
    }
    return out;
}

function sumBaleBucket(bucket) {
    if (!bucket || typeof bucket !== 'object') return 0;
    let total = 0;
    for (const cat of ['straw', 'grass', 'hay', 'silage', 'other']) {
        total += Number(bucket[cat]) || 0;
    }
    return total;
}

function baleInventoryIsEmpty(inv) {
    if (!inv || typeof inv !== 'object') return true;
    if (inv.byFarm && typeof inv.byFarm === 'object') {
        for (const row of Object.values(inv.byFarm)) {
            if (sumBaleBucket(row?.inStorage) > 0 || sumBaleBucket(row?.onField) > 0) return false;
        }
        return true;
    }
    return sumBaleBucket(inv.inStorage) + sumBaleBucket(inv.onField) <= 0;
}

function deriveBaleInventoryFromStock(stock, catalog) {
    const byFarm = {};
    if (!stock?.byFarm || typeof stock.byFarm !== 'object') {
        return { byFarm, farmId: null, onField: {}, inStorage: {}, offField: {} };
    }
    for (const [fid, farm] of Object.entries(stock.byFarm)) {
        const farmId = Number(farm?.farmId ?? fid);
        if (!Number.isFinite(farmId) || farmId <= 0) continue;
        const inStorage = emptyBaleBucket();
        for (const item of toArr(farm?.items)) {
            const idx = Number(item?.fillTypeIndex);
            if (!Number.isFinite(idx) || idx <= 0) continue;
            const objectLocs = (item.locations || []).filter(
                (loc) => loc && (loc.kind === 'objectStorage' || loc.kind === 'objectStorageMod')
            );
            if (objectLocs.length === 0) continue;
            const locLiters = objectLocs.reduce(
                (sum, loc) => sum + (Number(loc.liters) || 0),
                0
            );
            const totalLiters = Number(item.totalLiters) || 0;
            const liters = Math.max(locLiters, totalLiters);
            if (liters <= 0) continue;
            const baleSize =
                objectLocs.length > 0 && locLiters > 0
                    ? locLiters / objectLocs.length
                    : BALE_LITER_ESTIMATE;
            const count = Math.max(1, Math.round(liters / baleSize));
            tallyBaleBucket(inStorage, idx, count, catalog);
        }
        if (sumBaleBucket(inStorage) > 0) {
            byFarm[String(farmId)] = {
                onField: emptyBaleBucket(),
                inStorage,
                offField: inStorage,
            };
        }
    }
    const legacyFarm = Object.keys(byFarm)[0] || '1';
    const legacy = byFarm[legacyFarm] || { onField: {}, inStorage: {}, offField: {} };
    return {
        byFarm,
        farmId: Number(legacyFarm) || null,
        onField: legacy.onField || {},
        inStorage: legacy.inStorage || {},
        offField: legacy.offField || legacy.inStorage || {},
    };
}

function mergeBaleInventory(primary, secondary) {
    const out = {
        ...(primary && typeof primary === 'object' ? primary : {}),
        byFarm: { ...(primary?.byFarm || {}) },
    };
    for (const [fid, row] of Object.entries(secondary?.byFarm || {})) {
        const cur = out.byFarm[fid] || { onField: emptyBaleBucket(), inStorage: emptyBaleBucket() };
        const addOn = row?.onField || {};
        const addStorage = row?.inStorage || row?.offField || {};
        const onField = emptyBaleBucket();
        for (const cat of ['straw', 'grass', 'hay', 'silage', 'other']) {
            onField[cat] = (Number(cur.onField?.[cat]) || 0) + (Number(addOn[cat]) || 0);
        }
        onField.byFillType = { ...(cur.onField?.byFillType || {}) };
        for (const [label, count] of Object.entries(addOn.byFillType || {})) {
            onField.byFillType[label] = (Number(onField.byFillType[label]) || 0) + (Number(count) || 0);
        }
        const inStorage = emptyBaleBucket();
        for (const cat of ['straw', 'grass', 'hay', 'silage', 'other']) {
            inStorage[cat] = (Number(cur.inStorage?.[cat]) || 0) + (Number(addStorage[cat]) || 0);
        }
        inStorage.byFillType = { ...(cur.inStorage?.byFillType || {}) };
        for (const [label, count] of Object.entries(addStorage.byFillType || {})) {
            inStorage.byFillType[label] = (Number(inStorage.byFillType[label]) || 0) + (Number(count) || 0);
        }
        out.byFarm[fid] = { onField, inStorage, offField: inStorage };
    }
    return out;
}

function mergeBaleBuckets(primary, secondary) {
    const out = emptyBaleBucket();
    for (const src of [primary, secondary]) {
        if (!src || typeof src !== 'object') continue;
        for (const cat of ['straw', 'grass', 'hay', 'silage', 'other']) {
            out[cat] = (Number(out[cat]) || 0) + (Number(src[cat]) || 0);
        }
        for (const [label, count] of Object.entries(src.byFillType || {})) {
            out.byFillType[label] = (Number(out.byFillType[label]) || 0) + (Number(count) || 0);
        }
    }
    return out;
}

/** Per-farm totals from field collector (`baleCountOnField` / `baleOnFieldByCategory`). */
function aggregateOnFieldBucketsFromFields(fields) {
    const byFarm = {};
    for (const f of toArr(fields)) {
        const n = Number(f?.baleCountOnField) || 0;
        const fid = String(Number(f.ownerFarmId || f.farmId) || 1);
        if (!byFarm[fid]) {
            byFarm[fid] = { total: 0, bucket: emptyBaleBucket() };
        }
        byFarm[fid].total += n;
        const cat = f?.baleOnFieldByCategory;
        if (cat && typeof cat === 'object' && sumBaleBucket(cat) > 0) {
            byFarm[fid].bucket = mergeBaleBuckets(byFarm[fid].bucket, cat);
        }
    }
    for (const entry of Object.values(byFarm)) {
        const bucketSum = sumBaleBucket(entry.bucket);
        if (entry.total > bucketSum) {
            entry.bucket = mergeBaleBuckets(entry.bucket, {
                ...emptyBaleBucket(),
                other: (Number(entry.bucket.other) || 0) + (entry.total - bucketSum),
            });
        } else if (bucketSum === 0 && entry.total > 0) {
            entry.bucket = mergeBaleBuckets(entry.bucket, { ...emptyBaleBucket(), other: entry.total });
        }
    }
    return byFarm;
}

function supplementOnFieldFromFields(baleInventory, fields) {
    const inv = baleInventory && typeof baleInventory === 'object'
        ? { ...baleInventory, byFarm: { ...(baleInventory.byFarm || {}) } }
        : { byFarm: {} };
    const fieldAgg = aggregateOnFieldBucketsFromFields(fields);
    for (const [fid, agg] of Object.entries(fieldAgg)) {
        const row = inv.byFarm[fid] || { onField: emptyBaleBucket(), inStorage: emptyBaleBucket() };
        const haveOnField = sumBaleBucket(row.onField);
        // Field scan is authoritative when the world-entity bale scan is empty or partial (budget cap).
        if (agg.total > haveOnField) {
            row.onField = { ...agg.bucket, byFillType: { ...(agg.bucket.byFillType || {}) } };
        }
        row.offField = row.inStorage || emptyBaleBucket();
        inv.byFarm[fid] = row;
    }
    for (const [fid, row] of Object.entries(inv.byFarm)) {
        if (!fieldAgg[fid]) {
            row.offField = row.inStorage || emptyBaleBucket();
        }
    }
    return inv;
}

function baleInventoryHasStorage(inv) {
    if (!inv || typeof inv !== 'object') return false;
    if (inv.byFarm && typeof inv.byFarm === 'object') {
        for (const row of Object.values(inv.byFarm)) {
            if (sumBaleBucket(row?.inStorage) > 0) return true;
        }
        return false;
    }
    return sumBaleBucket(inv.inStorage) > 0;
}

function baleBucketIsAllOther(bucket) {
    if (!bucket || typeof bucket !== 'object') return false;
    const other = Number(bucket.other) || 0;
    if (other <= 0) return false;
    const typed =
        (Number(bucket.straw) || 0) +
        (Number(bucket.grass) || 0) +
        (Number(bucket.hay) || 0) +
        (Number(bucket.silage) || 0);
    const named = Object.keys(bucket.byFillType || {}).filter(
        (k) => !/^\d+$/.test(String(k))
    ).length;
    return typed === 0 && named === 0;
}

function baleBucketHasTypedCategories(bucket) {
    if (!bucket) return false;
    return (
        (Number(bucket.straw) || 0) +
        (Number(bucket.grass) || 0) +
        (Number(bucket.hay) || 0) +
        (Number(bucket.silage) || 0)
    ) > 0;
}

function enrichBaleInventoryFromStock(luaData, catalog) {
    let current = luaData?.baleInventory || { farmId: null, onField: {}, offField: {}, byFarm: {} };
    current = supplementOnFieldFromFields(current, luaData?.fields);
    if (!luaData?.stock?.byFarm) return current;
    const derived = deriveBaleInventoryFromStock(luaData.stock, catalog);

    if (current.byFarm && typeof current.byFarm === 'object') {
        for (const [fid, row] of Object.entries(current.byFarm)) {
            const derivedRow = derived.byFarm?.[fid];
            if (!derivedRow) continue;
            for (const slot of ['inStorage', 'onField']) {
                const bucket = row?.[slot];
                if (!baleBucketIsAllOther(bucket)) continue;
                const replacement = derivedRow[slot];
                if (baleBucketHasTypedCategories(replacement)) {
                    row[slot] = replacement;
                    if (slot === 'inStorage') {
                        row.offField = derivedRow.offField || replacement;
                    }
                }
            }
        }
    }

    if (!baleInventoryHasStorage(current)) {
        return mergeBaleInventory(current, derived);
    }
    return current;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Lua serialises empty tables as {} — normalise to JS array */
function toArr(val) {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    if (typeof val === 'object') return Object.values(val);
    return [];
}

/**
 * Lua / JSON: "Straw" | "Grass" | "Hay", or null when empty.
 * Internal Lua→JSON sentinel (if ever re-stringified) is stripped here.
 */
function normalizeWindrowTypeFromLua(luaField) {
    if (!luaField || typeof luaField !== 'object') return null;
    const t = luaField.windrowType;
    if (t == null || t === '') return null;
    const s = String(t).trim();
    if (s === '' || s === '__FD_JSON_NULL__') return null;
    return s;
}

/** Normalise stubble/mulch levels from XML or Lua for consistent UI (`isMulched` when level >= 1). */
function normalizeFieldMulch(f) {
    if (!f || typeof f !== 'object') return f;
    const s = Number(f.stubbleShredLevel ?? f.mulchLevel ?? 0);
    const out = {
        ...f,
        mulchLevel: s,
        stubbleShredLevel: s,
        isMulched: s >= 1,
        windrowLiters: Number(f.windrowLiters ?? 0),
        windrowType: normalizeWindrowTypeFromLua(f),
    };
    if (String(f.fruitType || '').toUpperCase() === 'GRASS') {
        out.isWithered = false;
    }
    return out;
}

function xmlFieldIndicatesHarvested(xmlField) {
    if (!xmlField) return false;
    if (xmlField.isHarvested === true) return true;
    const gt = String(xmlField.groundType || '').toUpperCase();
    return gt.includes('HARVESTED');
}

/**
 * After harvest, Lua often loses fruitTypeIndex (empty / mulched_stubble) while fields.xml still has BEETROOT etc.
 */
function mergeFieldFruitType(luaField, xmlField) {
    const lua = (luaField.fruitType || '').toUpperCase();
    const xml = (xmlField.fruitType || '').toUpperCase();
    const luaWeak = !luaField.fruitType || lua === 'UNKNOWN' || lua === 'EMPTY' || lua === 'MULCHED_STUBBLE';
    const xmlKnown = xml && xml !== 'UNKNOWN';
    if (luaWeak && xmlKnown) return xmlField.fruitType;
    return luaField.fruitType ?? xmlField.fruitType;
}

function mergeFieldGrowthLabel(luaField, xmlField) {
    if (xmlFieldIndicatesHarvested(xmlField) && luaField.growthLabel === 'mulched_fallow') {
        return 'harvested';
    }
    return luaField.growthLabel ?? xmlField.growthLabel;
}

/** XML collector may provide `allFields` (every farmland incl. unowned) or only player `fields` */
function xmlFieldsBaseForMerge(xmlData) {
    if (!xmlData) return [];
    const all = xmlData.allFields;
    if (Array.isArray(all) && all.length > 0) return all;
    const player = xmlData.fields;
    if (Array.isArray(player) && player.length > 0) return player;
    return [];
}


/**
 * Build compact per-field snapshots from live Lua rows (for cache + anti-regression when Lua stops).
 */
function buildFieldLiveFingerprints(luaFields, receivedAt) {
    const iso = receivedAt || new Date().toISOString();
    const out = {};
    for (const f of toArr(luaFields)) {
        const id = Number(f.farmlandId || f.id);
        if (!id || Number.isNaN(id)) continue;
        out[id] = {
            at: iso,
            growthState: Number(f.growthState),
            maxGrowthState: Number(f.maxGrowthState),
            growthLabel: String(f.growthLabel || ''),
            fruitType: String(f.fruitType || ''),
            harvestReady: !!f.harvestReady,
            isHarvested: !!f.isHarvested,
            needsWork: !!f.needsWork,
            // Live-only signals XML never carries — held so UI keeps area/PF when Lua stops.
            hectares: Number(f.hectares ?? f.areaHa) || 0,
            posX: Number(f.posX ?? f.position?.x) || 0,
            posZ: Number(f.posZ ?? f.position?.z) || 0,
            isPrecisionFarming: !!f.isPrecisionFarming,
            isScanned: !!f.isScanned,
            nitrogenLevel: Number(f.nitrogenLevel) || 0,
            targetNitrogen: Number(f.targetNitrogen) || 0,
            nitrogenTargetDisplay: Number(f.nitrogenTargetDisplay) || 0,
            phValue: Number(f.phValue) || 0,
            targetPh: Number(f.targetPh) || 0,
            phLimeBarMin: Number(f.phLimeBarMin) || 0,
            phLimeBarMax: Number(f.phLimeBarMax) || 0,
            rollerLevel: Number(f.rollerLevel) || 0,
            weedLevel: Number(f.weedLevel) || 0,
            moisture:
                f.moisture && typeof f.moisture === 'object' && f.moisture.percent != null
                    ? { ...f.moisture }
                    : undefined,
        };
    }
    return out;
}

/**
 * Overlay cached live-only values (area, position, PF soil data) onto an XML row that lacks them.
 * Geometry never regresses; PF values are better stale than blank when the live export drops out.
 */
function enrichFieldFromLiveCache(base, cache) {
    if (!cache) return base;
    const out = { ...base };
    let enriched = false;
    if (!(Number(out.hectares) > 0) && Number(cache.hectares) > 0) {
        out.hectares = cache.hectares;
        enriched = true;
    }
    if (!(Number(out.posX) || Number(out.posZ)) && (Number(cache.posX) || Number(cache.posZ))) {
        out.posX = cache.posX;
        out.posZ = cache.posZ;
        enriched = true;
    }
    if (cache.isPrecisionFarming && !out.isPrecisionFarming) {
        out.isPrecisionFarming = true;
        enriched = true;
    }
    const hasPfValues = Number(out.targetNitrogen) > 0 || Number(out.phValue) > 0;
    const cacheHasPf = Number(cache.targetNitrogen) > 0 || Number(cache.phValue) > 0;
    if (!hasPfValues && cacheHasPf) {
        out.isScanned = out.isScanned || cache.isScanned;
        out.nitrogenLevel = cache.nitrogenLevel;
        out.targetNitrogen = cache.targetNitrogen;
        if (Number(cache.nitrogenTargetDisplay) > 0) {
            out.nitrogenTargetDisplay = cache.nitrogenTargetDisplay;
        }
        out.phValue = cache.phValue;
        out.targetPh = cache.targetPh;
        out.phLimeBarMin = cache.phLimeBarMin;
        out.phLimeBarMax = cache.phLimeBarMax;
        enriched = true;
    }
    const cacheMoist = cache.moisture;
    const baseMoist = out.moisture;
    if (
        cacheMoist &&
        typeof cacheMoist === 'object' &&
        cacheMoist.percent != null &&
        (!baseMoist || baseMoist.percent == null)
    ) {
        out.moisture = {
            ...cacheMoist,
            enabled: cacheMoist.enabled !== false,
        };
        enriched = true;
    }
    if (enriched) out._fieldLiveEnrichedFromCache = true;
    return out;
}

function fieldAdvanceScore(f) {
    if (!f) return -1;
    const gl = String(f.growthLabel || '').toLowerCase();
    const gt = String(f.groundType || '').toLowerCase();
    const postHarvest =
        f.isHarvested ||
        gl.includes('harvested') ||
        gl.includes('mulched') ||
        gl.includes('mown') ||
        gl.includes('regrowth') ||
        gt.includes('harvested') ||
        gt.includes('grass_cut') ||
        gt.includes('cut');
    if (postHarvest) return 11000 + Number(f.growthState || 0);
    if (f.harvestReady) return 10000 + Number(f.growthState || 0);
    if (gl.includes('harvest')) return 9000 + Number(f.growthState || 0);
    return Number(f.growthState || 0);
}

/**
 * When there is no live Lua (empty server / paused), XML can lag behind the last live session.
 * If cached live fingerprints show a more advanced state for the same crop, prefer those growth fields.
 */
function applyFieldLiveCacheAntiRegress(xmlFields, fieldLiveCache, lastLuaAt, lastXmlAt) {
    const hasCache = fieldLiveCache && Object.keys(fieldLiveCache).length > 0;
    const luaNewer =
        lastLuaAt &&
        lastXmlAt &&
        !Number.isNaN(Date.parse(lastLuaAt)) &&
        !Number.isNaN(Date.parse(lastXmlAt)) &&
        Date.parse(lastLuaAt) > Date.parse(lastXmlAt);

    return xmlFields.map((xmlField) => {
        const base = normalizeFieldMulch(xmlField);
        if (!hasCache) {
            return { ...base, _fieldDataSource: 'savegame_xml' };
        }
        const id = Number(xmlField.farmlandId ?? xmlField.id);
        const cache = fieldLiveCache[id];
        if (!cache) {
            return { ...base, _fieldDataSource: 'savegame_xml' };
        }
        const xmlCrop = String(xmlField.fruitType || '').toUpperCase();
        const cacheCrop = String(cache.fruitType || '').toUpperCase();
        if (xmlCrop && cacheCrop && xmlCrop !== 'UNKNOWN' && cacheCrop !== 'UNKNOWN' && xmlCrop !== cacheCrop) {
            // Crop rotated since last live tick: keep XML crop, but area/position/PF soil are still valid.
            return enrichFieldFromLiveCache(
                { ...base, _fieldDataSource: 'savegame_xml', _fieldCropRotated: true },
                cache
            );
        }
        const xc = fieldAdvanceScore(xmlField);
        const lc = fieldAdvanceScore(cache);
        if (lc > xc + 0.5 || (luaNewer && lc >= xc)) {
            return enrichFieldFromLiveCache(
                {
                    ...base,
                    growthLabel: cache.growthLabel || xmlField.growthLabel,
                    growthState: Number.isFinite(Number(cache.growthState)) ? cache.growthState : xmlField.growthState,
                    maxGrowthState: Number.isFinite(Number(cache.maxGrowthState)) ? cache.maxGrowthState : xmlField.maxGrowthState,
                    fruitType: cache.fruitType || xmlField.fruitType,
                    harvestReady:
                        typeof cache.harvestReady === 'boolean' ? cache.harvestReady : xmlField.harvestReady,
                    isHarvested: cache.isHarvested ?? xmlField.isHarvested,
                    needsWork: cache.needsWork ?? xmlField.needsWork,
                    _fieldDataSource: 'last_live_cache',
                    _fieldDataNote:
                        'Showing last live field state; savegame XML looks older (empty/paused server). Resume play or reconnect to refresh.',
                },
                cache
            );
        }
        return enrichFieldFromLiveCache({ ...base, _fieldDataSource: 'savegame_xml' }, cache);
    });
}

function attachModVersionCheck(obj) {
    if (!obj || obj.luaAvailable !== true) {
        return obj;
    }
    const actual = obj.serverInfo && obj.serverInfo.modVersion != null
        ? obj.serverInfo.modVersion
        : null;
    return { ...obj, modVersionCheck: assessModVersion(actual) };
}

function attachDataTimestamps(obj, options) {
    const lastLuaAt = options.lastLuaAt || null;
    const lastXmlAt = options.lastXmlAt || null;
    const mergeComputedAt = new Date().toISOString();
    let liveNewerThanXml = null;
    if (lastLuaAt && lastXmlAt) {
        const a = Date.parse(lastLuaAt);
        const b = Date.parse(lastXmlAt);
        if (!Number.isNaN(a) && !Number.isNaN(b)) liveNewerThanXml = a > b;
    }
    const withTimestamps = {
        ...obj,
        dataTimestamps: {
            lastLuaReceivedAt: lastLuaAt,
            lastXmlReceivedAt: lastXmlAt,
            mergeComputedAt,
            liveNewerThanXml,
        },
    };
    return attachModVersionCheck(withTimestamps);
}

const MAP_CROP_SKIP = new Set(['UNKNOWN', 'EMPTY', 'GRASS', 'MULCHED_STUBBLE']);

function catalogFromMapCrops(luaData, xmlEconomy) {
    const out = {};
    const lua = luaData || {};
    const nameToIndex = lua.economy?.marketPrices?.nameToIndex || {};
    const cropMap = lua.cropFillTypeIndex || {};

    for (const [crop, idx] of Object.entries(cropMap)) {
        const n = Number(idx);
        const label = String(crop || '').trim().toUpperCase();
        if (n > 0 && label) out[String(n)] = label;
    }
    for (const f of toArr(lua.fields)) {
        const label = String(f?.fruitType || '').trim().toUpperCase();
        if (!label || MAP_CROP_SKIP.has(label)) continue;
        const idx = Number(nameToIndex[label] ?? nameToIndex[f.fruitType] ?? cropMap[label]);
        if (idx > 0) out[String(idx)] = label;
    }
    for (const name of Object.keys(xmlEconomy || {})) {
        const label = String(name || '').trim().toUpperCase();
        if (!label || MAP_CROP_SKIP.has(label)) continue;
        const idx = Number(nameToIndex[label] ?? cropMap[label]);
        if (idx > 0 && !out[String(idx)]) out[String(idx)] = label;
    }
    return out;
}

/** Pair unresolved silo indices with field crops, economy xml, and mod-exported catalog data. */
function inferCatalogFromStockAndFields(stock, fields, catalog, xmlEconomy) {
    let out = { ...(catalog || {}) };
    const catalogValues = new Set(
        Object.values(out).map((v) => String(v || '').trim().toUpperCase()).filter(Boolean)
    );

    for (const [fid, farm] of Object.entries(stock?.byFarm || {})) {
        const farmId = String(Number(farm?.farmId ?? fid) || fid);
        const missingIdx = [];
        for (const item of toArr(farm?.items)) {
            const idx = Number(item?.fillTypeIndex);
            if (!Number.isFinite(idx) || idx <= 0) continue;
            const key = String(idx);
            if (!out[key] && !/^\d+$/.test(String(item?.fillType || '').trim())) {
                missingIdx.push(idx);
            } else if (!out[key] && item?.fillType && !/^\d+$/.test(String(item.fillType))) {
                out[key] = String(item.fillType).trim().toUpperCase();
                catalogValues.add(out[key]);
            }
        }
        if (missingIdx.length === 0) continue;

        const farmCrops = new Set();
        for (const f of toArr(fields)) {
            if (String(Number(f?.ownerFarmId ?? f?.farmId) || 1) !== farmId) continue;
            const label = String(f?.fruitType || '').trim().toUpperCase();
            if (label && !MAP_CROP_SKIP.has(label)) farmCrops.add(label);
        }
        const unmapped = [...farmCrops].filter((c) => !catalogValues.has(c));
        if (unmapped.length === 1 && missingIdx.length === 1) {
            const crop = unmapped[0];
            out[String(missingIdx[0])] = crop;
            catalogValues.add(crop);
        }
    }

    const xmlCrops = Object.keys(xmlEconomy || {})
        .map((n) => String(n).trim().toUpperCase())
        .filter((n) => n && !MAP_CROP_SKIP.has(n));
    const stillMissing = [];
    for (const [fid, farm] of Object.entries(stock?.byFarm || {})) {
        for (const item of toArr(farm?.items)) {
            const idx = Number(item?.fillTypeIndex);
            if (idx > 0 && !out[String(idx)]) stillMissing.push(idx);
        }
    }
    const xmlUnmapped = xmlCrops.filter((c) => !catalogValues.has(c));
    if (stillMissing.length === 1 && xmlUnmapped.length === 1) {
        out[String(stillMissing[0])] = xmlUnmapped[0];
    }

    return out;
}

function catalogFromSellPoints(luaData) {
    const out = {};
    const sellPoints = luaData?.economy?.marketPrices?.sellPoints;
    if (!sellPoints || typeof sellPoints !== 'object') return out;
    for (const station of Object.values(sellPoints)) {
        if (!station?.prices || typeof station.prices !== 'object') continue;
        for (const [productName, priceInfo] of Object.entries(station.prices)) {
            const idx = priceInfo?.fillTypeIndex;
            if (idx != null) out[String(idx)] = productName;
        }
    }
    return out;
}

function collectFillTypeTitles(lua) {
    const src = lua || {};
    return {
        ...(src.fillTypeTitles || {}),
        ...(src.stock?.fillTypeTitles || {}),
        ...(src.economy?.fillTypeTitles || {}),
        ...(src.economy?.marketPrices?.fillTypeTitles || {}),
    };
}

function buildFillTypeCatalog(luaData, xmlEconomy) {
    const lua = luaData || {};
    const titles = collectFillTypeTitles(lua);
    const gameCatalog = applyFillTypeTitles({
        ...(lua.fillTypeCatalog || {}),
        ...(lua.economy?.fillTypeCatalog || {}),
        ...(lua.economy?.marketPrices?.fillTypesByIndex || {}),
        ...catalogFromMapCrops(lua, xmlEconomy),
        ...catalogFromSellPoints(lua),
        ...Object.fromEntries(
            Object.entries(lua.economy?.marketPrices?.nameToIndex || {}).map(
                ([name, idx]) => [String(idx), name]
            )
        ),
        ...Object.fromEntries(
            Object.entries(lua.economy?.marketPrices?.crops || {})
                .filter(([, crop]) => crop?.fillTypeIndex != null)
                .map(([name, crop]) => [String(crop.fillTypeIndex), name])
        ),
        ...(lua.stock?.fillTypeCatalog || {}),
    }, titles);
    const withFallbacks = {
        ...gameCatalog,
        ...Object.fromEntries(
            Object.entries(KNOWN_FILL_INDEX_NAMES).map(([idx, name]) => [String(idx), name])
        ),
    };
    const catalog = inferCatalogFromStockAndFields(
        lua.stock,
        lua.fields,
        withFallbacks,
        xmlEconomy
    );
    return enrichStockFillTypes(lua.stock, applyFillTypeTitles(catalog, titles), titles).catalog;
}

function mergeData(luaData, xmlData, options = {}) {
    const fieldLiveCache = options.fieldLiveCache || {};
    const lastLuaAt = options.lastLuaAt || null;
    const lastXmlAt = options.lastXmlAt || null;

    if (!luaData && !xmlData) return null;
    if (!luaData) {
        const base = buildFromXmlOnly(xmlData);
        const fields = applyFieldLiveCacheAntiRegress(
            toArr((xmlData.allFields && xmlData.allFields.length > 0) ? xmlData.allFields : (xmlData.fields || [])),
            fieldLiveCache,
            lastLuaAt,
            lastXmlAt
        );
        return pruneMergedDataToPlayerFarms(
            attachDataTimestamps({ ...base, fields }, { lastLuaAt, lastXmlAt })
        );
    }
    if (!xmlData) {
        const base = buildFromLuaOnly(luaData);
        if (fieldLiveCache && Object.keys(fieldLiveCache).length > 0) {
            base.fields = toArr(base.fields).map((f) => {
                const id = Number(f.farmlandId ?? f.id);
                const cache = fieldLiveCache[id];
                return cache ? enrichFieldFromLiveCache(f, cache) : f;
            });
        }
        return pruneMergedDataToPlayerFarms(
            attachDataTimestamps(base, { lastLuaAt, lastXmlAt })
        );
    }

    const fillTypeCatalog = buildFillTypeCatalog(luaData, xmlData.economy);
    const fillTypeTitles = collectFillTypeTitles(luaData);
    const fromPlaceables = enrichStockFillTypesFromPlaceables(
        luaData.stock,
        xmlData.placeables,
        fillTypeCatalog
    );
    const stockEnriched = enrichStockFillTypes(
        fromPlaceables.stock,
        fromPlaceables.catalog,
        fillTypeTitles
    );
    const stockWithMoisture = enrichStockMoistureFromXml(
        stockEnriched.stock,
        xmlData.moistureSystem,
        xmlData.placeables,
        stockEnriched.catalog
    );

    const mergedCore = {
        dataSource   : 'merged',
        xmlAvailable : true,
        luaAvailable : true,
        lastUpdated  : new Date().toISOString(),

        /** From live Lua (save slot name e.g. savegame3) — used for FTP polling + cache restore */
        serverInfo   : luaData.serverInfo || {},

        // Identity
        mapTitle     : xmlData.career?.mapTitle     || luaData.serverInfo?.mapName || 'Unknown Map',
        savegameName : xmlData.career?.savegameName || '',
        saveDate     : xmlData.career?.saveDate     || '',
        mapId        : luaData.serverInfo?.mapId || xmlData.career?.mapId || '',
        mapBounds    : luaData.serverInfo?.mapBounds || luaData.mapBounds || null,
        settings     : xmlData.career?.settings     || {},
        /** Alias for dashboard client (`apiStorage` / realtime); same object as `settings`. */
        gameSettings : xmlData.career?.settings     || {},
        mods         : xmlData.career?.mods         || [],

        // Farms — XML has players/stats, Lua has live money; synthesize rows from asset ownership when farms.xml lags
        farmInfo     : buildMergedFarmInfo(luaData, xmlData),

        // Money — Lua is live
        money        : luaData.finance?.money ?? luaData.money ?? xmlData.career?.money ?? 0,
        finance      : luaData.finance || {},

        // Game time — prefer Lua (truly live), fall back to XML environment
        gameTime     : mergeGameTime(luaData.gameTime, xmlData.environment),

        // Weather — merge: XML has accurate forecast, Lua has live temperature
        weather      : mergeWeather(luaData.weather, xmlData.environment),

        // Missions — XML only (Lua doesn't collect these)
        missions     : toArr(xmlData.missions),

        // Animals — Lua only
        animals      : toArr(luaData.animals),

        // Fields — XML provides base (ownership via farmland.xml); prefer allFields so NPC/unowned stay in API
        // Lua provides variable-rate soil overlay (N/pH from live density maps when present)
        fields       : (() => {
                         const xmlBase = xmlFieldsBaseForMerge(xmlData);
                         const luaArr = toArr(luaData.fields);
                         if (luaArr.length === 0) {
                             const xf =
                                 xmlBase.length > 0
                                     ? xmlBase
                                     : fixFieldOwnership(luaArr, xmlData.farmlandOwnership);
                             return applyFieldLiveCacheAntiRegress(xf, fieldLiveCache, lastLuaAt, lastXmlAt);
                         }
                         return mergeFields(
                             xmlBase.length > 0
                                 ? xmlBase
                                 : fixFieldOwnership(luaArr, xmlData.farmlandOwnership),
                             luaArr,
                             fieldLiveCache
                         );
                       })(),

        // Vehicles — merge XML (ownership/price) with Lua (live state)
        vehicles     : finalizeMergedVehicles(
            luaData,
            xmlData,
            mergeVehicles(toArr(luaData.vehicles), toArr(xmlData.vehicles))
        ),

        // Economy — XML history + Lua live sell points
        economy      : mergeEconomy(luaData.economy || {}, xmlData.economy || {}, fillTypeCatalog),

        // Production — Lua only
        production   : luaData.production || { chains: [], husbandryTotals: {} },

        // Physical bales — Lua scan + stock objectStorage fallback when mod export is empty
        baleInventory: enrichBaleInventoryFromStock(luaData, stockEnriched.catalog),

        fillTypeCatalog: stockEnriched.catalog,
        fillTypeTitles,
        cropFillTypeIndex: luaData.cropFillTypeIndex || {},
        stock: {
            ...stockWithMoisture,
            enabled: luaData.stock?.enabled !== false,
            fillTypeCatalog: { ...stockEnriched.catalog },
            fillTypeTitles: { ...fillTypeTitles },
        },
        redTape: luaData.redTape || { enabled: false, byFarm: {} },

        adsSummary         : luaData.adsSummary || null,
        vehicleYearsSummary: luaData.vehicleYearsSummary || null,

        // Placeables — XML
        placeables   : toArr(xmlData.placeables),

        // Pass through raw data for frontend use
        xmlFarmlands : toArr(xmlData.farmlandsArray),
        xmlEconomy   : xmlData.economy        || {},
    };

    return pruneMergedDataToPlayerFarms(
        attachDataTimestamps(mergedCore, { lastLuaAt, lastXmlAt })
    );
}

// ─── farms ────────────────────────────────────────────────────────────────────

/** farmId values that actually own at least one farmland plot (excludes NPC/mission slots listed only in farms.xml). */
function farmIdsOwningFarmland(farmlandsArray) {
    const s = new Set();
    for (const row of farmlandsArray || []) {
        const id = Number(row.farmId);
        if (id > 0) s.add(id);
    }
    return s;
}

/** Normalize one farm row; Lua/JSON may use farmId, omit id, or key farms as an object. */
function normalizeFarmRecord(f, fallbackId) {
    if (!f || typeof f !== 'object') return null;
    const id = Number(f.id ?? f.farmId ?? fallbackId);
    if (!Number.isFinite(id) || id <= 0) return null;
    return { ...f, id, farmId: id };
}

/** farmInfo / farms.xml list — array or Lua `{}` keyed by farm id. */
function farmRecordsFromExport(raw) {
    if (!raw) return [];
    const out = [];
    const seen = new Set();
    const add = (f, fallbackId) => {
        const n = normalizeFarmRecord(f, fallbackId);
        if (!n || seen.has(n.id)) return;
        seen.add(n.id);
        out.push(n);
    };
    if (Array.isArray(raw)) {
        for (const f of raw) add(f);
    } else if (typeof raw === 'object') {
        for (const [key, f] of Object.entries(raw)) {
            add(f, Number(key));
        }
    }
    return out;
}

function farmIdsFromKeyedByFarm(obj) {
    const s = new Set();
    if (!obj || typeof obj !== 'object') return s;
    for (const key of Object.keys(obj)) {
        const id = Number(key);
        if (Number.isFinite(id) && id > 0) s.add(id);
    }
    return s;
}

function farmIdHasOwnedFields(luaData, farmId) {
    const id = Number(farmId);
    if (!Number.isFinite(id) || id <= 0) return false;
    return toArr(luaData?.fields).some((f) => Number(f.ownerFarmId) === id);
}

function farmIdHasVehicles(luaData, farmId) {
    const id = Number(farmId);
    if (!Number.isFinite(id) || id <= 0) return false;
    return toArr(luaData?.vehicles).some(
        (v) => Number(v.ownerFarmId ?? v.farmId) === id
    );
}

function farmIdHasLivestock(luaData, farmId) {
    const id = Number(farmId);
    if (!Number.isFinite(id) || id <= 0) return false;
    return toArr(luaData?.animals).some((a) => {
        if (Number(a.ownerFarmId ?? a.farmId) !== id) return false;
        const count = Number(a.animalCount ?? a.numOfAnimalsReported ?? 0);
        if (count > 0) return true;
        const clusters = a.clusters;
        if (Array.isArray(clusters)) {
            return clusters.some((c) => c && Number(c.count) > 0);
        }
        return false;
    });
}

function farmIdHasStock(luaData, farmId) {
    const id = Number(farmId);
    if (!Number.isFinite(id) || id <= 0) return false;
    const farm = luaData?.stock?.byFarm?.[String(id)] ?? luaData?.stock?.byFarm?.[id];
    if (!farm) return false;
    return toArr(farm.items).some((item) => Number(item?.totalLiters) > 0);
}

function farmIdHasBaleInventory(luaData, farmId) {
    const id = Number(farmId);
    if (!Number.isFinite(id) || id <= 0) return false;
    const inv = luaData?.baleInventory?.byFarm?.[String(id)] ?? luaData?.baleInventory?.byFarm?.[id];
    if (!inv || typeof inv !== 'object') return false;
    for (const bucket of ['onField', 'offField', 'inStorage']) {
        const part = inv[bucket];
        if (!part || typeof part !== 'object') continue;
        if (Number(part.grass) > 0 || Number(part.hay) > 0 || Number(part.straw) > 0
            || Number(part.silage) > 0 || Number(part.other) > 0) {
            return true;
        }
    }
    return false;
}

function luaFarmRecordIsPlayer(farm) {
    if (!farm || typeof farm !== 'object') return false;
    if (farm.isPlayer === true) return true;
    const players = farm.players;
    return Array.isArray(players) && players.length > 0;
}

/**
 * Player-scope farm ids from live Lua — excludes contractor pools (vehicles-only),
 * empty pens, and empty keyed byFarm stubs.
 */
function farmIdsFromLuaPlayerScope(luaData) {
    const s = new Set();
    if (!luaData || typeof luaData !== 'object') return s;

    for (const f of farmRecordsFromExport(luaData.farmInfo)) {
        if (luaFarmRecordIsPlayer(f)) s.add(f.id);
    }

    const fieldOwners = new Set();
    for (const f of toArr(luaData.fields)) {
        const id = Number(f.ownerFarmId);
        if (id > 0) {
            fieldOwners.add(id);
            s.add(id);
        }
    }

    for (const id of fieldOwners) {
        if (farmIdHasVehicles(luaData, id) || farmIdHasLivestock(luaData, id)
            || farmIdHasStock(luaData, id) || farmIdHasBaleInventory(luaData, id)) {
            s.add(id);
        }
    }

    for (const a of toArr(luaData.animals)) {
        const id = Number(a.ownerFarmId ?? a.farmId);
        if (id <= 0) continue;
        if (farmIdHasLivestock(luaData, id) && fieldOwners.has(id)) s.add(id);
    }

    for (const c of toArr(luaData.production?.chains)) {
        const id = Number(c.ownerFarmId ?? c.farmId);
        if (id > 0 && fieldOwners.has(id)) s.add(id);
    }

    return s;
}

/** @deprecated use farmIdsFromLuaPlayerScope */
function farmIdsFromLuaExport(luaData) {
    return farmIdsFromLuaPlayerScope(luaData);
}

/** @deprecated use farmIdsFromLuaExport */
function farmIdsFromLuaFields(luaFields) {
    const s = new Set();
    for (const f of toArr(luaFields)) {
        const id = Number(f.ownerFarmId);
        if (id > 0) s.add(id);
    }
    return s;
}

/** Farmland owners — prefer live Lua field ownership; XML lags after farm delete on FTP. */
function collectOwnedFarmlandFarmIds(luaData, xmlData) {
    const fromLua = new Set();
    for (const f of toArr(luaData?.fields)) {
        const id = Number(f.ownerFarmId);
        if (id > 0) fromLua.add(id);
    }
    if (fromLua.size > 0) return fromLua;
    return farmIdsOwningFarmland(toArr(xmlData?.farmlandsArray));
}

function luaHasFarmRoster(luaData) {
    return farmRecordsFromExport(luaData?.farmInfo).some((f) => Number(f.id) > 0);
}

/**
 * Farms allowed in the farm picker. Live Lua roster wins; stale FTP XML cannot resurrect deleted farms.
 */
function collectAllowedFarmIds(luaData, xmlData) {
    const allowed = collectOwnedFarmlandFarmIds(luaData, xmlData);
    for (const id of farmIdsFromLuaPlayerScope(luaData || {})) {
        allowed.add(id);
    }
    const luaFarmIds = new Set(
        farmRecordsFromExport(luaData?.farmInfo).map((f) => Number(f.id)).filter((id) => id > 0)
    );
    const hasLuaRoster = luaHasFarmRoster(luaData);
    for (const f of farmRecordsFromExport(xmlData?.farms)) {
        if (!farmHasAssignedPlayers(f)) continue;
        if (!hasLuaRoster || luaFarmIds.has(f.id)) allowed.add(f.id);
    }
    if (allowed.size === 0) {
        for (const f of farmRecordsFromExport(xmlData?.farms)) {
            if (farmHasAssignedPlayers(f)) allowed.add(f.id);
        }
    }
    return allowed;
}

function shouldSynthesizeFarmId(farmId, luaData, xmlData) {
    const id = Number(farmId);
    if (!Number.isFinite(id) || id <= 0) return false;
    const luaFarm = farmRecordsFromExport(luaData?.farmInfo).find((f) => f.id === id);
    const inLuaRoster = luaHasFarmRoster(luaData);
    const inLua = Boolean(luaFarm);

    if (inLuaRoster && !inLua) {
        if (!farmIdHasOwnedFields(luaData, id)) return false;
        return farmIdHasVehicles(luaData, id) || farmIdHasLivestock(luaData, id)
            || farmIdHasStock(luaData, id) || farmIdHasBaleInventory(luaData, id);
    }

    if (collectOwnedFarmlandFarmIds(luaData, xmlData).has(id)) return true;
    const xmlFarm = farmRecordsFromExport(xmlData?.farms).find((f) => f.id === id);
    if (farmHasAssignedPlayers(xmlFarm) && (!inLuaRoster || inLua)) return true;
    if (luaFarmRecordIsPlayer(luaFarm)) return true;
    if (!farmIdHasOwnedFields(luaData, id)) return false;
    return farmIdHasVehicles(luaData, id) || farmIdHasLivestock(luaData, id)
        || farmIdHasStock(luaData, id) || farmIdHasBaleInventory(luaData, id);
}

function resolveSynthesizedIsPlayer(farmId, luaFarm, xmlFarm, xmlData, luaData) {
    if (luaFarmRecordIsPlayer(luaFarm)) return true;
    if (farmHasAssignedPlayers(xmlFarm)) return true;
    if (collectOwnedFarmlandFarmIds(luaData, xmlData).has(Number(farmId))) return true;
    return false;
}

function farmHasAssignedPlayers(farm) {
    if (!farm || typeof farm !== 'object') return false;
    if (farm.isPlayer === true) return true;
    const players = farm.players;
    return Array.isArray(players) && players.length > 0;
}

function filterFarmsByFarmlandOwnership(farms, allowedFarmIds) {
    const arr = toArr(farms);
    if (!allowedFarmIds || allowedFarmIds.size === 0) return arr;
    return arr.filter((f) => {
        const id = Number(f.id);
        if (allowedFarmIds.has(id)) return true;
        return farmHasAssignedPlayers(f);
    });
}

function mergeFarms(xmlFarms, luaFarms, restrictToLuaRoster = false) {
    const luaMap = new Map();
    for (const f of luaFarms) {
        const n = normalizeFarmRecord(f);
        if (n) luaMap.set(n.id, n);
    }
    const xmlMap = new Map();
    for (const f of xmlFarms) {
        const n = normalizeFarmRecord(f);
        if (n) xmlMap.set(n.id, n);
    }
    const luaPlayerIds = [...luaMap.keys()].filter((id) => luaFarmRecordIsPlayer(luaMap.get(id) || {}));
    const allIds = restrictToLuaRoster && luaPlayerIds.length > 0
        ? new Set(luaPlayerIds)
        : new Set([...xmlMap.keys(), ...luaMap.keys()]);
    return Array.from(allIds).sort((a, b) => a - b).map((id) => {
        const xml = xmlMap.get(id) || {};
        const lua = luaMap.get(id) || {};
        return {
            id,
            name       : xml.name       || lua.name       || `Farm ${id}`,
            color      : xml.color      || lua.color      || 1,
            money      : lua.money      ?? xml.money       ?? 0,
            loan       : lua.loan       ?? xml.loan        ?? 0,
            players    : xml.players?.length ? xml.players : (lua.players || []),
            statistics : xml.statistics || {},
            isPlayer   : lua.isPlayer === true
                || (Array.isArray(lua.players) && lua.players.length > 0)
                || (Array.isArray(xml.players) && xml.players.length > 0)
                || Boolean(String(lua.name || xml.name || '').trim()),
        };
    });
}

/**
 * Dedicated / multi-farm: farmland.xml or live assets may reference a farmId before farms.xml
 * lists that farm — synthesize a picker row so the dashboard can scope to it.
 */
function synthesizeMissingFarms(farms, neededIds, luaData, xmlData) {
    const have = new Set(farms.map((f) => Number(f.id)));
    const luaById = new Map(farmRecordsFromExport(luaData?.farmInfo).map((f) => [f.id, f]));
    const xmlById = new Map(farmRecordsFromExport(xmlData?.farms).map((f) => [f.id, f]));
    const out = [...farms];
    for (const rawId of neededIds) {
        const id = Number(rawId);
        if (!Number.isFinite(id) || id <= 0 || have.has(id)) continue;
        if (!shouldSynthesizeFarmId(id, luaData, xmlData)) continue;
        const lua = luaById.get(id) || {};
        const xml = xmlById.get(id) || {};
        const isPlayer = resolveSynthesizedIsPlayer(id, lua, xml, xmlData, luaData);
        if (!isPlayer) continue;
        out.push({
            id,
            farmId: id,
            name: String(lua.name || xml.name || `Farm ${id}`),
            color: lua.color ?? xml.color ?? 1,
            money: lua.money ?? xml.money ?? 0,
            loan: lua.loan ?? xml.loan ?? 0,
            players: xml.players?.length ? xml.players : (lua.players || []),
            statistics: xml.statistics || {},
            isPlayer: true,
        });
        have.add(id);
    }
    return out.sort((a, b) => a.id - b.id);
}

function buildMergedFarmInfo(luaData, xmlData) {
    const allowedFarmIds = collectAllowedFarmIds(luaData, xmlData);
    const luaRoster = luaHasFarmRoster(luaData);
    let farms = mergeFarms(
        farmRecordsFromExport(xmlData?.farms),
        farmRecordsFromExport(luaData?.farmInfo),
        luaRoster
    );
    farms = synthesizeMissingFarms(farms, allowedFarmIds, luaData, xmlData);
    return filterFarmsByFarmlandOwnership(farms, allowedFarmIds);
}

// ─── game time ────────────────────────────────────────────────────────────────

function mergeGameTime(luaTime, xmlEnv) {
    if (luaTime && (luaTime.hour !== undefined || luaTime.dayTime)) return luaTime;
    if (!xmlEnv) return {};
    return {
        hour    : xmlEnv.hour,
        minute  : xmlEnv.minute,
        day     : xmlEnv.currentDay,
        dayTime : xmlEnv.dayTime,
    };
}

// ─── weather ──────────────────────────────────────────────────────────────────

function isFiniteWeatherTemp(v) {
    if (v == null || v === "") return false;
    const n = Number(v);
    return Number.isFinite(n);
}

function forecastDayHasTemps(day) {
    if (!day || typeof day !== 'object') return false;
    return isFiniteWeatherTemp(day.minTemperature) || isFiniteWeatherTemp(day.maxTemperature);
}

function normalizeWeatherSlug(typeName) {
    if (typeName == null || typeName === '') return 'unknown';
    const s = String(typeName).trim().toLowerCase().replace(/^weathertype\./i, '');
    const map = {
        sun: 'sun',
        sunny: 'sun',
        clear: 'sun',
        partially_cloudy: 'cloudy',
        partiallycloudy: 'cloudy',
        cloudy: 'cloudy',
        overcast: 'cloudy',
        rain: 'rain',
        rainy: 'rain',
        thunder: 'rain',
        snow: 'snow',
        snowy: 'snow',
        fog: 'fog',
        foggy: 'fog',
        hail: 'hail',
    };
    return map[s] || s;
}

function synthesizeForecastTemps(currentTemp, dayIndex) {
    const base = isFiniteWeatherTemp(currentTemp) ? Math.round(currentTemp) : 20;
    const variation = ((dayIndex * 13 + 7) % 5) - 2;
    return {
        minTemperature: base - 5 + variation,
        maxTemperature: base + 5 + variation,
    };
}

/**
 * XML environment forecast has accurate day/type slots but no temperatures.
 * Lua collector provides temps — merge instead of replacing wholesale.
 */
function mergeForecastDays(luaForecast, xmlForecast, currentTemp) {
    const lua = Array.isArray(luaForecast) ? luaForecast : [];
    const xml = Array.isArray(xmlForecast) ? xmlForecast : [];

    if (xml.length === 0) return lua.slice(0, 7);
    if (!xml.some(forecastDayHasTemps) && lua.some(forecastDayHasTemps)) {
        return lua.slice(0, 7).map((day, i) => {
            const x = xml[i];
            if (!x) return day;
            return {
                ...day,
                day: x.day ?? day.day ?? i + 1,
                weatherType: normalizeWeatherSlug(x.weatherType || day.weatherType),
                precipitationChance:
                    day.precipitationChance ?? x.precipitationChance ?? 0,
            };
        });
    }

    const merged = xml.slice(0, 7).map((xDay, i) => {
        const lDay = lua[i] || {};
        let minT = isFiniteWeatherTemp(xDay.minTemperature)
            ? xDay.minTemperature
            : lDay.minTemperature;
        let maxT = isFiniteWeatherTemp(xDay.maxTemperature)
            ? xDay.maxTemperature
            : lDay.maxTemperature;
        if (!isFiniteWeatherTemp(minT) && !isFiniteWeatherTemp(maxT)) {
            const synth = synthesizeForecastTemps(currentTemp, i + 1);
            minT = synth.minTemperature;
            maxT = synth.maxTemperature;
        } else if (!isFiniteWeatherTemp(minT) && isFiniteWeatherTemp(maxT)) {
            minT = maxT - 8;
        } else if (isFiniteWeatherTemp(minT) && !isFiniteWeatherTemp(maxT)) {
            maxT = minT + 8;
        }
        return {
            day: xDay.day ?? lDay.day ?? i + 1,
            weatherType: normalizeWeatherSlug(xDay.weatherType || lDay.weatherType),
            minTemperature: minT,
            maxTemperature: maxT,
            precipitationChance:
                xDay.precipitationChance ?? lDay.precipitationChance ?? 0,
            allTypes: xDay.allTypes,
        };
    });

    if (merged.some(forecastDayHasTemps)) return merged;
    return lua.length > 0 ? lua.slice(0, 7) : merged;
}

function mergeWeather(luaWeather, xmlEnv) {
    const base = luaWeather || {};
    if (!xmlEnv) return base;

    const currentTemp = base.currentTemperature;
    const forecast = mergeForecastDays(
        base.forecast,
        xmlEnv.forecast,
        currentTemp
    );

    return {
        // Lua provides live temperature; XML provides accurate forecast slots
        currentTemperature : currentTemp,
        currentWeather     : normalizeWeatherSlug(
            base.currentWeather || xmlEnv.currentWeather
        ),
        currentSeason      : xmlEnv.currentSeason    || 'SPRING',
        windSpeed          : base.windSpeed,
        cloudCoverage      : base.cloudCoverage,
        rainLevel          : base.rainLevel,
        snowLevel          : base.snowLevel,
        timeSinceLastRain  : base.timeSinceLastRain,
        forecast,
        rawForecast        : xmlEnv.rawForecast || [],
        // MoistureSystem block is live-only; never drop when merging with XML environment.
        moisture           : base.moisture,
    };
}

// ─── field ownership fallback (when XML fields not available) ─────────────────

function fixFieldOwnership(luaFields, farmlandOwnership) {
    if (!farmlandOwnership?.size) return luaFields;
    return luaFields.map(f => {
        if (f.ownerFarmId > 0) return f;
        const resolved = farmlandOwnership.get(f.farmlandId) ||
                         farmlandOwnership.get(parseInt(f.farmlandId));
        return resolved > 0 ? { ...f, ownerFarmId: resolved } : f;
    });
}

// ─── fields ───────────────────────────────────────────────────────────────────

/**
 * Merge XML fields (base data) with Lua fields (variable-rate N/pH overlay when exported).
 *
 * XML fields.xml:        fruitType, growthState, groundType, weedState,
 *                        limeLevel, sprayLevel, plowLevel, ownerFarmId
 * Lua FieldDataCollector: isPrecisionFarming (soil maps active), nitrogenLevel, targetNitrogen,
 *                          phValue, targetPh, phLimeBarMin, phLimeBarMax, isScanned, nitrogenText, limeText,
 *                          posX, posZ, hectares
 *
 * Stubble mulch: Lua `mulchLevel` merged with XML `stubbleShredLevel` when both exist.
 * Lua wins for mapped N/pH values (only available from runtime density map reads).
 *
 * Harvest / growth stage: Lua FieldDataCollector uses fruitType + engine growthState;
 * fields.xml is coarse. When both exist, Lua must override `harvestReady`, `stateName`,
 * and stage counts — otherwise the UI keeps XML heuristics and mod fixes appear to do nothing.
 *
 * Suggestions: computed in-game in FieldDataCollector.lua from live state. When both
 * XML and Lua exist for a field, only Lua’s suggestions are exposed (single source).
 */
function mergeFields(xmlFields, luaFields, fieldLiveCache = {}) {
    // Normalise both to arrays — Lua serialises empty tables as {} not []
    const xmlArr = Array.isArray(xmlFields) ? xmlFields
        : (xmlFields && typeof xmlFields === 'object' ? Object.values(xmlFields) : []);
    const luaArr = Array.isArray(luaFields) ? luaFields
        : (luaFields && typeof luaFields === 'object' ? Object.values(luaFields) : []);

    if (luaArr.length === 0) return xmlArr.map(normalizeFieldMulch);
    if (xmlArr.length === 0) return luaArr.map(normalizeFieldMulch);

    // Lua uses internal FieldManager id in `id`; XML fields.xml id is the farmland parcel id.
    // Index by both `farmlandId` and `id` so XML rows still match when those differ per map/engine
    // (otherwise live-only keys like windrow/bales never merge and the dashboard looks empty vs data.json).
    const luaByFarmlandId = new Map();
    const luaByInternalId = new Map();
    for (const f of luaArr) {
        const fa = Number(f.farmlandId);
        const fi = Number(f.id);
        if (!Number.isNaN(fa) && fa > 0) luaByFarmlandId.set(fa, f);
        if (!Number.isNaN(fi) && fi > 0) luaByInternalId.set(fi, f);
    }

    const merged = xmlArr.map(xmlField => {
        const xKey = Number(xmlField.farmlandId ?? xmlField.id);
        const luaField =
            (!Number.isNaN(xKey) && luaByFarmlandId.get(xKey))
            || (!Number.isNaN(xKey) && luaByInternalId.get(xKey))
            || null;
        if (!luaField) return normalizeFieldMulch(xmlField);

        // PF: Lua has live N/pH maps. XML has savegame precisionFarming.xml (scan + stats). Stale data.json
        // often has isPrecisionFarming false — do not wipe XML PF flags or pfStats.
        const xmlPf =
            !!xmlField.isScanned ||
            !!xmlField.isPrecisionFarming ||
            !!(xmlField.pfStats &&
                typeof xmlField.pfStats === 'object' &&
                (xmlField.pfStats.numSoilSamples > 0 || Object.keys(xmlField.pfStats).length > 0));
        const luaPf = !!luaField.isPrecisionFarming;

        const pfOverlay = {
            isPrecisionFarming : luaPf || xmlPf,
            nitrogenLevel      : luaField.nitrogenLevel      ?? xmlField.nitrogenLevel      ?? 0,
            targetNitrogen     : luaField.targetNitrogen     ?? xmlField.targetNitrogen     ?? 0,
            phValue            : luaField.phValue            ?? xmlField.phValue            ?? 0,
            targetPh           : luaField.targetPh           ?? xmlField.targetPh           ?? 0,
            phLimeBarMin       : luaField.phLimeBarMin       ?? xmlField.phLimeBarMin       ?? 0,
            phLimeBarMax       : luaField.phLimeBarMax       ?? xmlField.phLimeBarMax       ?? 0,
            isScanned          : !!(luaField.isScanned || xmlField.isScanned),
            nitrogenText       : luaField.nitrogenText       || xmlField.nitrogenText || '',
            limeText           : luaField.limeText           || xmlField.limeText     || '',
            pfStats:
                luaField.pfStats != null && typeof luaField.pfStats === 'object'
                    ? luaField.pfStats
                    : xmlField.pfStats,
        };
        if (luaField.nitrogenTargetDisplay != null && Number.isFinite(Number(luaField.nitrogenTargetDisplay))
            && Number(luaField.nitrogenTargetDisplay) > 0) {
            pfOverlay.nitrogenTargetDisplay = Number(luaField.nitrogenTargetDisplay);
        }

        // Spatial data from Lua (g_fieldManager has actual map coords & hectares)
        const spatialData = {
            posX     : luaField.posX     || luaField.position?.x || xmlField.posX     || 0,
            posZ     : luaField.posZ     || luaField.position?.z || xmlField.posZ     || 0,
            hectares : luaField.hectares || luaField.areaHa      || xmlField.hectares || 0,
        };

        // Single source for suggestions: live Lua (game) when this row is matched.
        // Do not merge XML + Lua lists — different priority scales and stale XML harvest flags.
        const mergedSuggestions = toArr(luaField.suggestions)
            .filter((s) => s && s.action)
            .sort((a, b) => (a.priority || 9) - (b.priority || 9));

        const stubbleMerged = Number(
            luaField.mulchLevel ?? luaField.stubbleShredLevel
            ?? xmlField.stubbleShredLevel ?? xmlField.mulchLevel ?? 0
        );

        const luaMaxGs = Number(luaField.maxGrowthState);
        const luaGs    = Number(luaField.growthState);
        const luaPct   = luaField.growthStatePercentage;
        const mergedFruitType = mergeFieldFruitType(luaField, xmlField);

        const windBale = {
            windrowLiters: Number(luaField.windrowLiters ?? 0),
            windrowType: normalizeWindrowTypeFromLua(luaField),
            windrowArea: Number(luaField.windrowArea ?? 0),
            hasWindrow: !!(luaField.hasWindrow || (Number(luaField.windrowLiters) > 0)),
            windrowSamples: Array.isArray(luaField.windrowSamples) ? luaField.windrowSamples : [],
            windrowByFillName:
                luaField.windrowByFillName && typeof luaField.windrowByFillName === 'object'
                    ? { ...luaField.windrowByFillName }
                    : {},
            baleCountOnField: Number(luaField.baleCountOnField ?? 0),
            /** Straw / grass / hay loose (Lua: TEDDER + STRAW probes); not cereal swaths alone. */
            needsBaling: luaField.needsBaling === true,
            baleableLooseLiters: Number(luaField.baleableLooseLiters ?? 0),
            looseStrawLiters: Number(luaField.looseStrawLiters ?? 0),
            looseGrassWindrowLiters: Number(luaField.looseGrassWindrowLiters ?? 0),
            looseDryGrassWindrowLiters: Number(luaField.looseDryGrassWindrowLiters ?? 0),
            hasLooseStraw: luaField.hasLooseStraw === true,
            hasLooseGrassWindrow: luaField.hasLooseGrassWindrow === true,
            hasLooseHayWindrow: luaField.hasLooseHayWindrow === true,
            hasLooseForage: luaField.hasLooseForage === true,
            /** Lua: DensityMapHeightUtil reachable; fill types probed; STRAW-only centre probe (diagnostics). */
            windrowUtilAvailable: luaField.windrowUtilAvailable === true,
            windrowFillTypesRegistered: Number(luaField.windrowFillTypesRegistered ?? 0),
            windrowCenterProbeTotalL: Number(luaField.windrowCenterProbeTotalL ?? 0),
        };

        // Live FieldDataCollector flags + levels (XML savegame can be stale while the game runs).
        const luaAgronomy = {
            needsPlowing: luaField.needsPlowing ?? xmlField.needsPlowing,
            needsLime: luaField.needsLime ?? xmlField.needsLime,
            needsWeeding: luaField.needsWeeding ?? xmlField.needsWeeding,
            needsFertilizer: luaField.needsFertilizer ?? xmlField.needsFertilizer,
            plowLevel: luaField.plowLevel ?? xmlField.plowLevel,
            weedLevel: luaField.weedLevel ?? xmlField.weedLevel,
            weedPercent: luaField.weedPercent ?? xmlField.weedPercent,
            weedAlertThresholdPct: luaField.weedAlertThresholdPct ?? xmlField.weedAlertThresholdPct ?? 15,
            fertilizationLevel: luaField.fertilizationLevel ?? xmlField.fertilizationLevel,
            limeLevel: luaField.limeLevel ?? xmlField.limeLevel,
            sprayLevel: luaField.sprayLevel ?? xmlField.sprayLevel,
        };

        const cacheKey = Number(luaField.farmlandId ?? luaField.id ?? xmlField.farmlandId ?? xmlField.id);
        const cacheMoist = fieldLiveCache[cacheKey]?.moisture;
        const moistureBlock =
            luaField.moisture && typeof luaField.moisture === 'object'
                ? luaField.moisture
                : cacheMoist && typeof cacheMoist === 'object' && cacheMoist.percent != null
                    ? { ...cacheMoist, enabled: cacheMoist.enabled !== false }
                    : null;

        return {
            ...xmlField,    // XML base: soil state, ownership, crop, growthState
            ...spatialData, // Lua: map position and area
            ...pfOverlay,   // Lua: mapped nitrogen/pH when soil data is active
            ...windBale,    // Lua: windrow + bale counts for post-harvest rules
            ...luaAgronomy,
            moisture: moistureBlock,
            /** Savegame/XML crop id (stable hint when Lua fruit is empty after harvest). */
            xmlFruitTypeHint: xmlField.fruitType || '',
            // Lua is authoritative: XML uses coarse heuristics (e.g. plowLevel < 1 on growing crops).
            needsWork   : luaField.needsWork ?? xmlField.needsWork ?? false,
            needsRolling: luaField.needsRolling === true,
            rollerLevel : luaField.rollerLevel ?? xmlField.rollerLevel ?? 0,
            suggestions : mergedSuggestions,
            mulchLevel       : stubbleMerged,
            stubbleShredLevel: stubbleMerged,
            isMulched        : stubbleMerged >= 1,
            isHarvested      : !!(luaField.isHarvested || xmlField.isHarvested),
            growthLabel      : mergeFieldGrowthLabel(luaField, xmlField),
            // Grass is perennial — never keep arable "withered" from XML when merged with Lua
            isWithered       : String(mergedFruitType || '').toUpperCase() === 'GRASS'
                ? false
                : !!(luaField.isWithered ?? xmlField.isWithered),
            // Lua live crop + stage counts (XML uses flat maxGrowthState=8 for all crops)
            fruitType             : mergedFruitType,
            fruitTypeIndex        : (Number(luaField.fruitTypeIndex) > 0)
                ? luaField.fruitTypeIndex
                : xmlField.fruitTypeIndex,
            growthState           : Number.isFinite(luaGs) ? luaGs : xmlField.growthState,
            maxGrowthState        : (Number.isFinite(luaMaxGs) && luaMaxGs > 0) ? luaMaxGs : xmlField.maxGrowthState,
            growthStatePercentage : (luaPct != null && luaPct !== '') ? luaPct : xmlField.growthStatePercentage,
            // Critical: do not leave harvestReady/stateName from XML — merged mode was showing savegame heuristics only.
            harvestReady          : (typeof luaField.harvestReady === 'boolean')
                ? luaField.harvestReady
                : (xmlField.harvestReady ?? false),
            stateName             : luaField.stateName || xmlField.stateName || '',
            engineNumGrowthStates : Number.isFinite(Number(luaField.engineNumGrowthStates))
                ? Number(luaField.engineNumGrowthStates)
                : xmlField.engineNumGrowthStates,
            grassRingStage:
                luaField.grassRingStage != null && luaField.grassRingStage !== ''
                    ? Number(luaField.grassRingStage)
                    : null,
            stoneLevel: Number(
                luaField.stoneLevel != null && luaField.stoneLevel !== ''
                    ? luaField.stoneLevel
                    : (xmlField.stoneLevel ?? 0)
            ),
        };
    });

    return merged;
}

// ─── vehicles ─────────────────────────────────────────────────────────────────

/** Config-file basename only (lowercased), or '' if unknown. */
function vehicleConfigBasename(v) {
    const raw = String(v.configFileName || v.filename || '');
    const base = raw.replace(/\\/g, '/').split('/').pop() || '';
    return base.replace(/\.xml$/i, '').toLowerCase();
}

function vehicleUniqueId(v) {
    const uid = v?.uniqueId;
    if (uid == null || uid === '') return '';
    return String(uid);
}

/** Stable per-vehicle match key: config-file basename + owner farm (lowercased), or '' if unknown. */
function vehicleConfigKey(v) {
    const cfg = vehicleConfigBasename(v);
    if (!cfg) return '';
    const farm = Number(v.ownerFarmId ?? v.farmId ?? 0);
    return `${farm}::${cfg}`;
}

function isTransientVehicleFarmId(farmId) {
    const id = Number(farmId);
    return id === 0 || id === 100;
}

/** Dedicated-server contractor pool id — NOT farm 0 (map traffic / rail). */
function isVehiclePoolFarmId(farmId) {
    return Number(farmId) === 100;
}

/** Live dealership / showroom floor stock (mod sets needsSaving=false; savegame may still tag pool 100). */
function isDealershipFloorStock(v) {
    if (v?.isUsedEquipmentYardStock === true) return false;
    if (String(v?.propertyState || '').toUpperCase() === 'SHOP_CONFIG') return true;
    if (v?.needsSaving === false) return true;
    return false;
}

/** Pool-100 live row that may belong to a player farm (not dealership demos). */
function isPlayerOwnedPoolLiveVehicle(v, xmlIndex) {
    const owner = Number(v?.ownerFarmId ?? v?.farmId ?? 0);
    if (!isVehiclePoolFarmId(owner)) return false;
    if (isDealershipFloorStock(v)) return false;
    if (isMapTrafficVehicle(v)) return false;
    if (!xmlIndex) return true;
    const uid = vehicleUniqueId(v);
    const cfg = vehicleConfigBasename(v);
    if (uid && xmlIndex.playerFarmByUniqueId?.has(uid)) return true;
    if (uid && xmlIndex.poolUniqueIds?.has(uid)) return true;
    if (cfg && xmlIndex.poolByConfig.has(cfg)) return true;
    return false;
}

function vehicleConfigPath(v) {
    return String(v?.configFileName || v?.filename || '').replace(/\\/g, '/').toLowerCase();
}

function isMapTrafficVehicle(v) {
    const cfg = vehicleConfigPath(v);
    return cfg.includes('/trafficvehicles/') || cfg.includes('/traffic/') || cfg.includes('trafficvehicle');
}

/** Index vehicles.xml for savegame-backed pool reassignment and uniqueId pairing. */
function buildPoolVehicleXmlIndex(xmlVehicles) {
    const poolByConfig = new Set();
    const playerFarmByConfig = new Map();
    const byUniqueId = new Map();
    const poolUniqueIds = new Set();
    const playerFarmByUniqueId = new Map();

    for (const xv of toArr(xmlVehicles)) {
        const uid = vehicleUniqueId(xv);
        if (uid) byUniqueId.set(uid, xv);

        const cfg = vehicleConfigBasename(xv);
        const farm = Number(xv.farmId ?? xv.ownerFarmId ?? 0);
        const prop = String(xv.propertyState || 'OWNED').toUpperCase();
        if (prop === 'SOLD' || prop === 'SHOP_CONFIG') continue;

        if (uid) {
            if (isVehiclePoolFarmId(farm)) poolUniqueIds.add(uid);
            else if (farm > 0 && !isTransientVehicleFarmId(farm)) playerFarmByUniqueId.set(uid, farm);
        }

        if (!cfg) continue;
        if (isVehiclePoolFarmId(farm)) {
            poolByConfig.add(cfg);
            continue;
        }
        if (farm > 0 && !isTransientVehicleFarmId(farm)) {
            if (!playerFarmByConfig.has(cfg)) playerFarmByConfig.set(cfg, new Set());
            playerFarmByConfig.get(cfg).add(farm);
        }
    }
    return { poolByConfig, playerFarmByConfig, byUniqueId, poolUniqueIds, playerFarmByUniqueId };
}

/** Human-readable title from vehicles.xml config basename (e.g. vario700Gen6 → Vario 700 Gen6). */
function formatConfigDisplayName(rawName) {
    const s = String(rawName || '').replace(/\.xml$/i, '').trim();
    if (!s) return 'Vehicle';
    return s
        .replace(/([a-z])([A-Z0-9])/g, '$1 $2')
        .replace(/([0-9])([A-Za-z])/g, '$1 $2')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Infer vehicleType / typeName / isMotorized from GIANTS store-item path in vehicles.xml. */
function inferVehicleMetaFromFilename(filename) {
    const p = String(filename || '').replace(/\\/g, '/').toLowerCase();
    const base = p.split('/').pop()?.replace(/\.xml$/i, '') || '';
    const motorizedHint = /vario|tractor|magnum|series|forza|axion|puma|t7|t8|wheelloader|telehandler|excavator|skidder/i.test(base);
    if (p.includes('/tractors/') || p.includes('/data/vehicles/tractor') || (p.includes('/i3d/') && motorizedHint)) {
        return { vehicleType: 'tractor', typeName: 'tractor', isMotorized: true };
    }
    if (p.includes('/wheelloader/') || p.includes('/loaders/') || p.includes('/telehandlers/')) {
        return { vehicleType: 'motorized', typeName: 'wheelLoader', isMotorized: true };
    }
    if (p.includes('/cars/') || p.includes('/pickups/')) {
        return { vehicleType: 'motorized', typeName: 'car', isMotorized: true };
    }
    if (p.includes('/trailers/')) {
        return { vehicleType: 'trailer', typeName: 'trailer', isMotorized: false };
    }
    if (
        p.includes('/tools/') || p.includes('/cultivators/') || p.includes('/mowers/')
        || p.includes('/plows/') || p.includes('/harvesters/') || p.includes('/forage/')
        || p.includes('/weights/') || p.includes('/bale') || p.includes('/windrow/')
        || p.includes('/sprayers/') || p.includes('/planters/')
    ) {
        return { vehicleType: 'implement', typeName: 'implement', isMotorized: false };
    }
    return { vehicleType: 'implement', typeName: 'implement', isMotorized: false };
}

function buildXmlOnlyVehicleRow(xv) {
    const owner = Number(xv.farmId ?? xv.ownerFarmId ?? 0);
    const meta = inferVehicleMetaFromFilename(xv.filename);
    const rawName = String(xv.name || '').trim();
    const displayName = formatConfigDisplayName(rawName || vehicleConfigBasename(xv));
    return {
        id            : xv.uniqueId || rawName || vehicleConfigBasename(xv) || 'xml',
        uniqueId      : xv.uniqueId || '',
        name          : displayName,
        filename      : xv.filename || '',
        configFileName: xv.filename || '',
        farmId        : owner,
        ownerFarmId   : owner,
        price         : xv.price || 0,
        age           : xv.age || 0,
        operatingTime : xv.operatingTime || 0,
        damage        : xv.damage ?? 0,
        fillLevels    : xv.fillLevels || {},
        propertyState : xv.propertyState || 'OWNED',
        xmlFillLevels : xv.fillLevels || {},
        position      : xv.position || { x: 0, y: 0, z: 0 },
        vehicleType   : xv.vehicleType || meta.vehicleType,
        typeName      : xv.typeName || meta.typeName,
        isMotorized   : xv.isMotorized ?? meta.isMotorized,
        engineOn      : false,
        speed         : 0,
        brand         : xv.brand || 'Unknown',
        source        : 'xml_only',
    };
}

function vehiclePositionDistance(a, b) {
    if (!a?.position || !b?.position) return Infinity;
    return Math.hypot(
        (a.position.x ?? 0) - (b.position.x ?? 0),
        (a.position.z ?? 0) - (b.position.z ?? 0)
    );
}

/** Pair savegame-only rows with nearby live Lua rows (same config) so ADS/live state attach. */
function pairXmlOnlyWithNearbyLua(merged) {
    const xmlOnly = [];
    const luaCandidates = [];
    for (const v of merged) {
        if (v?.source === 'xml_only') xmlOnly.push(v);
        else if (v?.source === 'lua_only' || v?.source === 'merged'
            || Number(v.ownerFarmId ?? v.farmId) === 100) {
            luaCandidates.push(v);
        }
    }
    if (xmlOnly.length === 0 || luaCandidates.length === 0) return merged;

    const usedLua = new Set();
    const out = merged.map((v) => {
        if (v?.source !== 'xml_only') return v;
        const cfg = vehicleConfigBasename(v);
        if (!cfg) return v;

        let best = null;
        let bestDist = 40;
        for (const lv of luaCandidates) {
            if (usedLua.has(lv)) continue;
            if (vehicleConfigBasename(lv) !== cfg) continue;
            const d = vehiclePositionDistance(v, lv);
            if (d < bestDist) {
                bestDist = d;
                best = lv;
            }
        }
        if (!best) return v;

        usedLua.add(best);
        const owner = Number(v.ownerFarmId ?? v.farmId ?? 0);
        return {
            ...best,
            ...v,
            ownerFarmId   : owner,
            farmId        : owner,
            uniqueId      : v.uniqueId || best.uniqueId || best.id,
            name          : best.name && best.name !== 'Unknown' ? best.name : v.name,
            vehicleType   : best.vehicleType || v.vehicleType,
            typeName      : best.typeName || v.typeName,
            isMotorized   : best.isMotorized ?? v.isMotorized,
            operatingTime : best.operatingTime ?? v.operatingTime,
            ads           : best.ads,
            source        : 'merged',
        };
    });

    return out.filter((v) => !(usedLua.has(v) && v?.source === 'lua_only'));
}

function isSavegameBackedPoolVehicle(v, xmlIndex, poolTargetFarmId) {
    if (!xmlIndex) return false;
    if (isDealershipFloorStock(v)) return false;
    const uid = vehicleUniqueId(v);
    if (uid && xmlIndex.playerFarmByUniqueId?.has(uid)) return true;
    if (uid && poolTargetFarmId > 0 && xmlIndex.playerFarmByUniqueId?.get(uid) === Number(poolTargetFarmId)) {
        return true;
    }
    const cfg = vehicleConfigBasename(v);
    if (!cfg) return false;
    const playerFarms = xmlIndex.playerFarmByConfig?.get(cfg);
    if (playerFarms?.size === 1) {
        const farm = [...playerFarms][0];
        if (uid && xmlIndex.playerFarmByUniqueId?.get(uid) === farm) return true;
        if (poolTargetFarmId > 0 && farm === Number(poolTargetFarmId)) {
            if (uid && xmlIndex.poolUniqueIds?.has(uid)) return true;
            if (xmlIndex.poolByConfig.has(cfg)) return true;
        }
    }
    if (uid && playerFarms?.size > 1) {
        const farm = xmlIndex.playerFarmByUniqueId?.get(uid);
        if (farm && playerFarms.has(farm)) return true;
    }
    // Dedicated-server new farm: fleet row persisted under pool 100 in savegame.
    if (poolTargetFarmId > 0) {
        if (uid && xmlIndex.poolUniqueIds?.has(uid)) return true;
        // Config-only pool rows are ambiguous when the model also exists on dealership floor.
        if (cfg && xmlIndex.poolByConfig.has(cfg) && !xmlIndex.playerFarmByConfig?.has(cfg)) {
            return true;
        }
    }
    return false;
}

function buildLuaConfigClaimsByFarm(luaVehicles) {
    const claims = new Set();
    for (const lv of toArr(luaVehicles)) {
        const farm = Number(lv.ownerFarmId ?? lv.farmId ?? 0);
        if (isTransientVehicleFarmId(farm)) continue;
        const k = vehicleConfigKey(lv);
        if (k) claims.add(k);
    }
    return claims;
}

function resolveMergedOwnerFarmId(luaV, xmlV) {
    if (luaV?.isUsedEquipmentYardStock === true) {
        return Number(luaV.ownerFarmId ?? luaV.farmId ?? 0);
    }
    const uid = vehicleUniqueId(luaV) || vehicleUniqueId(xmlV);
    if (uid && xmlV) {
        const xmlFarm = Number(xmlV.farmId ?? xmlV.ownerFarmId ?? 0);
        if (xmlFarm > 0 && !isTransientVehicleFarmId(xmlFarm)) return xmlFarm;
    }
    const luaFarm = Number(luaV?.ownerFarmId ?? luaV?.farmId ?? 0);
    const xmlFarm = Number(xmlV?.farmId ?? xmlV?.ownerFarmId ?? 0);
    if (luaFarm > 0 && !isTransientVehicleFarmId(luaFarm)) return luaFarm;
    if (xmlFarm > 0 && !isTransientVehicleFarmId(xmlFarm)) return xmlFarm;
    return luaFarm || xmlFarm || 0;
}

function playerFarmIdsFromInfo(farmInfo) {
    return getPlayerFarmIdSet(farmRecordsFromExport(farmInfo));
}

function livestockHeadCountOnFarm(luaData, farmId) {
    const id = Number(farmId);
    let total = 0;
    for (const a of toArr(luaData?.animals)) {
        if (Number(a.ownerFarmId ?? a.farmId) !== id) continue;
        total += Number(a.animalCount ?? a.numOfAnimalsReported ?? 0);
        if (Array.isArray(a.clusters)) {
            for (const c of a.clusters) total += Number(c?.count ?? 0);
        }
    }
    return total;
}

function countAssignedFleetOnFarm(vehicles, farmId) {
    const id = Number(farmId);
    return toArr(vehicles).filter((v) => {
        if (v?.isUsedEquipmentYardStock === true) return false;
        const owner = Number(v.ownerFarmId ?? v.farmId ?? 0);
        return owner === id && !isVehiclePoolFarmId(owner);
    }).length;
}

function vehicleHasLiveFleetSignal(v) {
    if (v?.source === 'merged' || v?.source === 'lua_only') return true;
    if (v?.ads?.enabled === true) return true;
    if (v?.isMotorized === true) return true;
    if (Number(v?.speed) > 0) return true;
    return false;
}

function countLiveFleetOnFarm(vehicles, farmId) {
    const id = Number(farmId);
    return toArr(vehicles).filter((v) => {
        if (v?.isUsedEquipmentYardStock === true) return false;
        if (v.source === 'xml_only') return false;
        if (!vehicleHasLiveFleetSignal(v)) return false;
        const owner = Number(v.ownerFarmId ?? v.farmId ?? 0);
        return owner === id && !isTransientVehicleFarmId(owner);
    }).length;
}

function farmIdHasOwnedFieldsFromSources(luaData, xmlData, farmId) {
    if (farmIdHasOwnedFields(luaData, farmId)) return true;
    const id = Number(farmId);
    for (const f of toArr(xmlData?.fields || xmlData?.allFields)) {
        if (Number(f?.ownerFarmId ?? f?.farmId) === id) return true;
    }
    for (const row of toArr(xmlData?.farmlandsArray)) {
        if (Number(row?.farmId) === id) return true;
    }
    return false;
}

function farmHasAssignableAssetsFromSources(luaData, xmlData, farmId) {
    return farmIdHasOwnedFieldsFromSources(luaData, xmlData, farmId)
        || farmIdHasLivestock(luaData, farmId)
        || farmIdHasStock(luaData, farmId)
        || farmIdHasBaleInventory(luaData, farmId);
}

function countAdsEnabledOnFarm(vehicles, farmId) {
    const id = Number(farmId);
    return toArr(vehicles).filter((v) => {
        const owner = Number(v.ownerFarmId ?? v.farmId ?? 0);
        return owner === id && v?.ads?.enabled === true;
    }).length;
}

/**
 * When vehicles.xml tags a new DS farm fleet as pool 100, pick the player farm that owns
 * land/livestock but has the thinnest live fleet — per savegame row, not bulk reassignment.
 */
function inferTransientVehiclePoolFarmId(vehicles, luaData, farmInfo, xmlData = null, xmlIndex = null) {
    const playerIds = playerFarmIdsFromInfo(farmInfo);
    if (playerIds.size === 0) return null;

    const index = xmlIndex || buildPoolVehicleXmlIndex(toArr(xmlData?.vehicles));
    const poolVehicles = toArr(vehicles).filter((v) => isPlayerOwnedPoolLiveVehicle(v, index));
    if (poolVehicles.length === 0) return null;

    let bestId = null;
    let bestScore = -Infinity;
    for (const id of playerIds) {
        if (!farmHasAssignableAssetsFromSources(luaData, xmlData, id)) continue;
        const liveFleet = countLiveFleetOnFarm(vehicles, id);
        if (liveFleet > Math.max(3, poolVehicles.length)) continue;

        const heads = livestockHeadCountOnFarm(luaData, id);
        const assignedFleet = countAssignedFleetOnFarm(vehicles, id);
        let score = heads * 1000 + (liveFleet === 0 ? 500 : 100) + assignedFleet * 150;
        if (farmIdHasLivestock(luaData, id)) score += 250;
        // ADS bonus only when savegame has pool-100 rows not yet on a player farm (not dealership demos).
        const unassignedPoolAds = poolVehicles.filter(
            (v) => v?.ads?.enabled === true
                && isSavegameBackedPoolVehicle(v, index, id)
                && !index.playerFarmByUniqueId?.has(vehicleUniqueId(v))
        ).length;
        if (unassignedPoolAds > 0 && countAdsEnabledOnFarm(vehicles, id) === 0) score += 2000;
        if (score > bestScore) {
            bestScore = score;
            bestId = id;
        }
    }
    if (bestId == null || bestScore <= 0) return null;
    return bestId;
}

/** Drop live pool-100 rows with no player-farm savegame backing (dealership floor stock). */
function dropUnbackedPoolVehicles(vehicles, xmlIndex, poolTargetFarmId = null) {
    return toArr(vehicles).filter((v) => {
        if (v?.isUsedEquipmentYardStock === true) return true;
        if (isMapTrafficVehicle(v)) return false;
        const owner = Number(v.ownerFarmId ?? v.farmId ?? 0);
        if (!isVehiclePoolFarmId(owner)) return true;
        return isSavegameBackedPoolVehicle(v, xmlIndex, poolTargetFarmId);
    });
}

/** Per-vehicle pool-100 → player farm when savegame confirms ownership. */
function resolvePool100Ownership(vehicles, luaData, farmInfo, xmlData, xmlIndex) {
    const index = xmlIndex || buildPoolVehicleXmlIndex(toArr(xmlData?.vehicles));
    const transientTarget = inferTransientVehiclePoolFarmId(vehicles, luaData, farmInfo, xmlData, index);
    return toArr(vehicles).map((v) => {
        const owner = Number(v.ownerFarmId ?? v.farmId ?? 0);
        if (!isVehiclePoolFarmId(owner)) return v;

        const uid = vehicleUniqueId(v);
        if (uid && index.playerFarmByUniqueId?.has(uid)) {
            const farm = index.playerFarmByUniqueId.get(uid);
            return { ...v, ownerFarmId: farm, farmId: farm };
        }

        const cfg = vehicleConfigBasename(v);
        const playerFarms = cfg ? index.playerFarmByConfig?.get(cfg) : null;
        if (playerFarms?.size === 1) {
            const farm = [...playerFarms][0];
            if (isSavegameBackedPoolVehicle(v, index, farm)) {
                return { ...v, ownerFarmId: farm, farmId: farm };
            }
        }

        if (transientTarget != null && isSavegameBackedPoolVehicle(v, index, transientTarget)) {
            return { ...v, ownerFarmId: transientTarget, farmId: transientTarget };
        }

        return v;
    });
}

function finalizeMergedVehicles(luaData, xmlData, mergedVehicles) {
    const farmInfo = buildMergedFarmInfo(luaData, xmlData ?? null);
    const xmlIndex = buildPoolVehicleXmlIndex(toArr(xmlData?.vehicles));
    const transientTarget = inferTransientVehiclePoolFarmId(
        mergedVehicles, luaData, farmInfo, xmlData ?? null, xmlIndex
    );
    let out = pairXmlOnlyWithNearbyLua(mergedVehicles);
    out = dropUnbackedPoolVehicles(out, xmlIndex, transientTarget);
    out = resolvePool100Ownership(out, luaData, farmInfo, xmlData ?? null, xmlIndex);
    return out.filter((v) => {
        if (v?.isUsedEquipmentYardStock === true) return true;
        if (isMapTrafficVehicle(v)) return false;
        const owner = Number(v.ownerFarmId ?? v.farmId ?? 0);
        return owner > 0 && !isVehiclePoolFarmId(owner);
    });
}

function mergeVehicles(luaVehicles, xmlVehicles) {
    const luaConfigClaims = buildLuaConfigClaimsByFarm(luaVehicles);
    const xmlByUid = new Map();
    const xmlByKey = new Map();
    const xmlByCfg = new Map();
    for (const xv of xmlVehicles) {
        const uid = vehicleUniqueId(xv);
        if (uid && !xmlByUid.has(uid)) xmlByUid.set(uid, xv);
        const k = vehicleConfigKey(xv);
        if (k) {
            if (!xmlByKey.has(k)) xmlByKey.set(k, []);
            xmlByKey.get(k).push(xv);
        }
        const cfg = vehicleConfigBasename(xv);
        if (cfg) {
            if (!xmlByCfg.has(cfg)) xmlByCfg.set(cfg, []);
            xmlByCfg.get(cfg).push(xv);
        }
    }

    const takeClosest = (list, luaV) => {
        if (!list || list.length === 0) return null;
        let bestIdx = 0;
        if (luaV.position) {
            let best = Infinity;
            for (let i = 0; i < list.length; i++) {
                const xp = list[i].position;
                if (!xp) continue;
                const d = Math.hypot(
                    (luaV.position.x ?? 0) - (xp.x ?? 0),
                    (luaV.position.z ?? 0) - (xp.z ?? 0)
                );
                if (d < best) { best = d; bestIdx = i; }
            }
        }
        return list.splice(bestIdx, 1)[0];
    };

    const removeFromBuckets = (xmlV) => {
        const k = vehicleConfigKey(xmlV);
        if (k) {
            const farmBucket = xmlByKey.get(k);
            if (farmBucket) {
                const idx = farmBucket.indexOf(xmlV);
                if (idx >= 0) farmBucket.splice(idx, 1);
            }
        }
        const cfg = vehicleConfigBasename(xmlV);
        if (cfg) {
            const cfgBucket = xmlByCfg.get(cfg);
            if (cfgBucket) {
                const idx = cfgBucket.indexOf(xmlV);
                if (idx >= 0) cfgBucket.splice(idx, 1);
            }
        }
    };

    const takeXmlMatch = (luaV) => {
        const uid = vehicleUniqueId(luaV);
        if (uid && xmlByUid.has(uid)) {
            const xmlV = xmlByUid.get(uid);
            xmlByUid.delete(uid);
            removeFromBuckets(xmlV);
            return xmlV;
        }
        if (luaV?.id != null) {
            const idStr = String(luaV.id);
            if (xmlByUid.has(idStr)) {
                const xmlV = xmlByUid.get(idStr);
                xmlByUid.delete(idStr);
                removeFromBuckets(xmlV);
                return xmlV;
            }
            for (const [xuid, xmlV] of xmlByUid.entries()) {
                if (xuid === idStr || xuid.endsWith(idStr) || idStr.endsWith(xuid)) {
                    xmlByUid.delete(xuid);
                    removeFromBuckets(xmlV);
                    return xmlV;
                }
            }
        }

        const k = vehicleConfigKey(luaV);
        const keyed = k ? xmlByKey.get(k) : null;
        if (keyed && keyed.length > 0) {
            return takeClosest(keyed, luaV);
        }
        if (luaV?.isUsedEquipmentYardStock === true) return null;
        const luaFarm = Number(luaV.ownerFarmId ?? luaV.farmId ?? 0);
        if (!isTransientVehicleFarmId(luaFarm)) return null;
        const cfg = vehicleConfigBasename(luaV);
        const cfgList = cfg ? xmlByCfg.get(cfg) : null;
        if (!cfgList || cfgList.length === 0) return null;
        const eligible = cfgList.filter((xv) => {
            const xk = vehicleConfigKey(xv);
            return !(xk && luaConfigClaims.has(xk));
        });
        if (eligible.length === 0) return null;
        const poolXml = eligible.filter((xv) =>
            isVehiclePoolFarmId(Number(xv.farmId ?? xv.ownerFarmId ?? 0))
        );
        if (poolXml.length > 0) {
            const xmlV = takeClosest(poolXml, luaV);
            if (xmlV) {
                removeFromBuckets(xmlV);
                return xmlV;
            }
        }
        return null;
    };

    const merged = luaVehicles.map(luaV => {
        const xmlV = takeXmlMatch(luaV);
        const ownerFarmId = resolveMergedOwnerFarmId(luaV, xmlV);
        return {
            ...luaV,
            ownerFarmId,
            farmId        : ownerFarmId,
            price         : luaV.price  || xmlV?.price  || 0,
            age           : luaV.age    || xmlV?.age    || 0,
            uniqueId      : vehicleUniqueId(xmlV) || vehicleUniqueId(luaV) || luaV.id,
            filename      : xmlV?.filename || luaV.configFileName || '',
            propertyState : luaV.propertyState || xmlV?.propertyState || '',
            xmlFillLevels : xmlV?.fillLevels || {},
            source        : xmlV ? 'merged' : 'lua_only',
        };
    });

    for (const list of xmlByKey.values()) {
        for (const xv of list) {
            const owner = Number(xv.farmId ?? xv.ownerFarmId ?? 0);
            if (isVehiclePoolFarmId(owner)) continue;
            merged.push(buildXmlOnlyVehicleRow(xv));
        }
    }

    return merged;
}

/** @deprecated use resolvePool100Ownership */
function resolveTransientVehicleOwnership(vehicles, luaData, farmInfo, xmlData = null, xmlIndex = null) {
    const index = xmlIndex || buildPoolVehicleXmlIndex(toArr(xmlData?.vehicles));
    const transientTarget = inferTransientVehiclePoolFarmId(vehicles, luaData, farmInfo, xmlData, index);
    let out = dropUnbackedPoolVehicles(vehicles, index, transientTarget);
    return resolvePool100Ownership(out, luaData, farmInfo, xmlData ?? null, index);
}

/** @deprecated retained for tests — savegame-backed pool rows only */
function isLikelyPlayerOwnedPoolVehicle(v, xmlIndex = null, poolTargetFarmId = null) {
    if (v?.isUsedEquipmentYardStock === true) return false;
    if (isMapTrafficVehicle(v)) return false;
    if (isDealershipFloorStock(v)) return false;
    return Boolean(xmlIndex && isSavegameBackedPoolVehicle(v, xmlIndex, poolTargetFarmId));
}

// ─── economy ──────────────────────────────────────────────────────────────────

function mergeEconomy(luaEconomy, xmlEconomy, mergedCatalog = {}) {
    const result = { ...luaEconomy, xmlPriceHistory: xmlEconomy };
    const catalog = {
        ...(mergedCatalog || {}),
        ...(luaEconomy.fillTypeCatalog || {}),
        ...(luaEconomy.marketPrices?.fillTypesByIndex || {}),
        ...Object.fromEntries(
            Object.entries(luaEconomy.marketPrices?.nameToIndex || {}).map(
                ([name, idx]) => [String(idx), name]
            )
        ),
        ...Object.fromEntries(
            Object.entries(luaEconomy.marketPrices?.crops || {})
                .filter(([, crop]) => crop?.fillTypeIndex != null)
                .map(([name, crop]) => [String(crop.fillTypeIndex), name])
        ),
    };
    if (Object.keys(catalog).length > 0) {
        result.fillTypeCatalog = catalog;
        if (result.marketPrices && typeof result.marketPrices === 'object') {
            result.marketPrices = { ...result.marketPrices, fillTypesByIndex: catalog };
        }
    }

    // Enrich Lua crop entries with XML price history
    if (luaEconomy.marketPrices?.crops && xmlEconomy) {
        const SEASON_PERIODS = [
            'EARLY_SPRING', 'MID_SPRING', 'LATE_SPRING',
            'EARLY_SUMMER', 'MID_SUMMER', 'LATE_SUMMER',
            'EARLY_AUTUMN', 'MID_AUTUMN', 'LATE_AUTUMN',
            'EARLY_WINTER', 'MID_WINTER', 'LATE_WINTER',
        ];
        const SEASON_MONTHS = {
            EARLY_SPRING: 'Mar', MID_SPRING: 'Apr', LATE_SPRING: 'May',
            EARLY_SUMMER: 'Jun', MID_SUMMER: 'Jul', LATE_SUMMER: 'Aug',
            EARLY_AUTUMN: 'Sep', MID_AUTUMN: 'Oct', LATE_AUTUMN: 'Nov',
            EARLY_WINTER: 'Dec', MID_WINTER: 'Jan', LATE_WINTER: 'Feb',
        };
        const maxMonthFromHistory = (history) => {
            if (!history || typeof history !== 'object') return null;
            let bestPeriod = null;
            let bestPrice = -1;
            for (const period of SEASON_PERIODS) {
                const price = Number(history[period]);
                if (!Number.isFinite(price) || price <= 0) continue;
                if (price > bestPrice) { bestPrice = price; bestPeriod = period; }
            }
            if (!bestPeriod) {
                for (const [period, raw] of Object.entries(history)) {
                    const price = Number(raw);
                    if (!Number.isFinite(price) || price <= 0) continue;
                    if (price > bestPrice) { bestPrice = price; bestPeriod = period; }
                }
            }
            if (!bestPeriod) return null;
            if (SEASON_MONTHS[bestPeriod]) return SEASON_MONTHS[bestPeriod];
            const idx = Number(bestPeriod);
            if (Number.isFinite(idx) && idx >= 1 && idx <= 12) {
                return SEASON_MONTHS[SEASON_PERIODS[idx - 1]] || null;
            }
            return null;
        };
        const applyXmlHistory = (data, hist) => {
            data.priceHistory = hist.history;
            data.avgXmlPrice = hist.avgPrice;
            data.totalHarvested = hist.totalAmount;
            if (!data.maxPrice) data.maxPrice = hist.maxPrice;
            if (!data.minPrice) data.minPrice = hist.minPrice;
            if (!data.avgPrice) data.avgPrice = hist.avgPrice;
            if (!data.maxPriceMonth) {
                data.maxPriceMonth = maxMonthFromHistory(hist.history);
            }
            const basePrice = Number(hist.avgPrice) || Number(hist.maxPrice) || 0;
            if (basePrice > 0 && (!Array.isArray(data.locations) || data.locations.length === 0)) {
                data.locations = [{ name: 'Market Base Prices', price: basePrice }];
                if (!data.bestLocation) data.bestLocation = 'Market Base Prices';
            }
        };

        for (const [crop, data] of Object.entries(luaEconomy.marketPrices.crops)) {
            const hist = xmlEconomy[crop] || xmlEconomy[crop.toUpperCase()];
            if (hist) applyXmlHistory(data, hist);
        }

        const catalogNames = new Set(
            Object.values(catalog).map((name) => String(name).toUpperCase()).filter(Boolean)
        );
        if (!result.marketPrices) {
            result.marketPrices = { ...(luaEconomy.marketPrices || {}) };
        }
        if (!result.marketPrices.crops) {
            result.marketPrices.crops = { ...(luaEconomy.marketPrices?.crops || {}) };
        }
        for (const [cropName, hist] of Object.entries(xmlEconomy || {})) {
            if (!hist?.history || Object.keys(hist.history).length === 0) continue;
            const upper = String(cropName).toUpperCase();
            const inLua = Boolean(
                result.marketPrices.crops[cropName] || result.marketPrices.crops[upper]
            );
            if (!catalogNames.has(upper) && !inLua) continue;

            let data = result.marketPrices.crops[cropName] || result.marketPrices.crops[upper];
            if (!data) {
                data = { name: cropName };
                result.marketPrices.crops[cropName] = data;
            }
            applyXmlHistory(data, hist);
            const idx = Object.entries(catalog).find(
                ([, name]) => String(name).toUpperCase() === upper
            )?.[0];
            if (idx != null && data.fillTypeIndex == null) {
                data.fillTypeIndex = Number(idx);
            }
        }
    }
    return result;
}

/** Inject cropRotation from RedTape.xml onto farms that already have live Red Tape data. */
function redTapeFarmHasLiveSections(farm) {
    if (!farm || typeof farm !== 'object') return false;
    if (farm.tier != null && String(farm.tier).trim() !== '') return true;
    const lists = [
        farm.policies,
        farm.activeSchemes,
        farm.availableSchemes,
        farm.grants,
        farm.events,
        farm.tax?.statements,
    ];
    return lists.some((list) => Array.isArray(list) && list.length > 0);
}

function mergeRedTapeCropRotation(luaRedTape, xmlHarvest) {
    const base =
        luaRedTape && typeof luaRedTape === 'object'
            ? { ...luaRedTape, byFarm: { ...(luaRedTape.byFarm || {}) } }
            : { enabled: false, byFarm: {} };
    const xmlByFarm = xmlHarvest?.byFarm;
    const allRows = Array.isArray(xmlHarvest?.allRows) ? xmlHarvest.allRows : [];
    const hasAssigned = xmlByFarm && Object.values(xmlByFarm).some((rows) => Array.isArray(rows) && rows.length > 0);

    const applyRows = (farmKey, existing, rows) => {
        if (!Array.isArray(rows) || rows.length === 0) return;
        if (!redTapeFarmHasLiveSections(existing)) return;
        const luaRows = existing.cropRotation;
        if (Array.isArray(luaRows) && luaRows.length > 0) return;
        base.byFarm[farmKey] = { ...existing, cropRotation: rows };
    };

    if (xmlByFarm && typeof xmlByFarm === 'object') {
        for (const [farmKey, rows] of Object.entries(xmlByFarm)) {
            applyRows(farmKey, base.byFarm[farmKey] || {}, rows);
        }
    }

    if (!hasAssigned && allRows.length > 0) {
        for (const farmKey of Object.keys(base.byFarm)) {
            applyRows(farmKey, base.byFarm[farmKey] || {}, allRows);
        }
    }

    return base;
}

function supplementRedTapeCropRotation(merged, xmlHarvest) {
    if (!merged || typeof merged !== 'object') return merged;
    const redTape = mergeRedTapeCropRotation(merged.redTape, xmlHarvest);
    return { ...merged, redTape };
}

function buildRedTapeFromXmlHarvest(xmlHarvest) {
    return { enabled: false, byFarm: {} };
}

// ─── single-source fallbacks ──────────────────────────────────────────────────

function mapMetaFromLua(lua) {
    const si = lua?.serverInfo || {};
    return {
        mapId: si.mapId || '',
        mapTitle: si.mapName || 'Unknown Map',
        mapBounds: si.mapBounds || lua?.mapBounds || null,
    };
}

function normalizeXmlVehiclesForMerge(vehicles) {
    return toArr(vehicles).map((v) => {
        const owner = Number(v.ownerFarmId ?? v.farmId ?? 0);
        return { ...v, ownerFarmId: owner, farmId: owner };
    });
}

function buildFromLuaOnly(lua) {
    const fillTypeCatalog = buildFillTypeCatalog(lua);
    const fillTypeTitles = collectFillTypeTitles(lua);
    const stockEnriched = enrichStockFillTypes(lua.stock, fillTypeCatalog, fillTypeTitles);
    const mapMeta = mapMetaFromLua(lua);
    return {
        dataSource: 'lua_only', xmlAvailable: false, luaAvailable: true,
        lastUpdated: new Date().toISOString(),
        serverInfo: lua.serverInfo || {},
        mapTitle: mapMeta.mapTitle,
        mapId: mapMeta.mapId,
        mapBounds: mapMeta.mapBounds,
        savegameName: '', settings: {}, gameSettings: {}, mods: [],
        gameTime: lua.gameTime || {},
        // Lua may serialise an empty table as {} — must be an array for the UI
        farmInfo: buildMergedFarmInfo(lua, null),
        money: lua.finance?.money ?? lua.money ?? 0,
        finance: lua.finance || {},
        weather: lua.weather || {},
        missions: [],
        animals: lua.animals || [],
        fields: toArr(lua.fields).map(normalizeFieldMulch),
        vehicles: finalizeMergedVehicles(lua, null, toArr(lua.vehicles)),
        economy: lua.economy   || {},
        production: lua.production || {},
        baleInventory: enrichBaleInventoryFromStock(lua, stockEnriched.catalog),
        fillTypeCatalog: stockEnriched.catalog,
        fillTypeTitles,
        cropFillTypeIndex: lua.cropFillTypeIndex || {},
        stock: {
            ...stockEnriched.stock,
            enabled: lua.stock?.enabled !== false,
            fillTypeCatalog: { ...stockEnriched.catalog },
            fillTypeTitles: { ...fillTypeTitles },
        },
        redTape: lua.redTape || { enabled: false, byFarm: {} },
        placeables: [],
    };
}

function buildFromXmlOnly(xml) {
    return {
        dataSource: 'xml_only', xmlAvailable: true, luaAvailable: false,
        lastUpdated: new Date().toISOString(),
        serverInfo: {},
        mapTitle: xml.career?.mapTitle || 'Unknown Map',
        savegameName: xml.career?.savegameName || '',
        saveDate: xml.career?.saveDate || '',
        settings: xml.career?.settings || {},
        gameSettings: xml.career?.settings || {},
        mods: xml.career?.mods || [],
        gameTime: xml.environment ? {
            hour: xml.environment.hour, minute: xml.environment.minute,
            day: xml.environment.currentDay, dayTime: xml.environment.dayTime,
        } : {},
        farmInfo: buildMergedFarmInfo(null, xml),
        money: xml.career?.money || 0,
        finance: { money: xml.career?.money || 0 },
        weather: xml.environment ? {
            currentWeather: xml.environment.currentWeather,
            currentSeason: xml.environment.currentSeason,
            forecast: xml.environment.forecast || [],
        } : {},
        missions: xml.missions || [],
        animals: [],
        fields: toArr((xml.allFields && xml.allFields.length > 0) ? xml.allFields : (xml.fields || [])).map(normalizeFieldMulch),
        vehicles: finalizeMergedVehicles(null, xml, normalizeXmlVehiclesForMerge(xml.vehicles)),
        economy: { xmlPriceHistory: xml.economy || {} },
        production: {},
        placeables: xml.placeables || [],
        xmlFarmlands: xml.farmlandsArray || [],
        xmlEconomy: xml.economy || {},
    };
}

module.exports = {
    mergeData,
    mergeVehicles,
    inferTransientVehiclePoolFarmId,
    resolveTransientVehicleOwnership,
    isVehiclePoolFarmId,
    isLikelyPlayerOwnedPoolVehicle,
    buildPoolVehicleXmlIndex,
    isSavegameBackedPoolVehicle,
    mergeRedTapeCropRotation,
    supplementRedTapeCropRotation,
    buildFieldLiveFingerprints,
    buildFillTypeCatalog,
    deriveBaleInventoryFromStock,
    enrichBaleInventoryFromStock,
    supplementOnFieldFromFields,
    mergeBaleInventory,
    mergeWeather,
    mergeForecastDays,
};