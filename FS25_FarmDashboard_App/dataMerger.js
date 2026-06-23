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
const { pruneMergedDataToPlayerFarms } = require('./farmScope.cjs');
const { enrichStockFillTypes } = require('./fillTypeResolve.cjs');

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
        for (const item of farm.items || []) {
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

function enrichBaleInventoryFromStock(luaData, catalog) {
    let current = luaData?.baleInventory || { farmId: null, onField: {}, offField: {}, byFarm: {} };
    current = supplementOnFieldFromFields(current, luaData?.fields);
    if (!luaData?.stock?.byFarm) return current;
    if (baleInventoryHasStorage(current)) return current;
    const derived = deriveBaleInventoryFromStock(luaData.stock, catalog);
    return mergeBaleInventory(current, derived);
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

/** Witcombe-style gap: engine exports 181=RYE and 183=SPELT but omits 182=TRITICALE on dedicated servers. */
function assignNeighborCropGaps(catalog, stock) {
    const out = { ...(catalog || {}) };
    const rye = String(out['181'] || '').trim().toUpperCase();
    const spelt = String(out['183'] || '').trim().toUpperCase();
    if (out['182'] || rye !== 'RYE' || spelt !== 'SPELT') return out;

    let needs182 = false;
    for (const farm of Object.values(stock?.byFarm || {})) {
        for (const item of farm?.items || []) {
            if (Number(item?.fillTypeIndex) === 182) needs182 = true;
        }
    }
    if (needs182) out['182'] = 'TRITICALE';
    return out;
}

/** Pair unresolved silo indices with map crop names (e.g. index 182 ↔ TRITICALE on Witcombe). */
function inferCatalogFromStockAndFields(stock, fields, catalog, xmlEconomy) {
    let out = assignNeighborCropGaps(catalog, stock);
    const catalogValues = new Set(
        Object.values(out).map((v) => String(v || '').trim().toUpperCase()).filter(Boolean)
    );

    for (const [fid, farm] of Object.entries(stock?.byFarm || {})) {
        const farmId = String(Number(farm?.farmId ?? fid) || fid);
        const missingIdx = [];
        for (const item of farm?.items || []) {
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
        for (const item of farm?.items || []) {
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

function buildFillTypeCatalog(luaData, xmlEconomy) {
    const lua = luaData || {};
    const base = {
        ...(lua.fillTypeCatalog || {}),
        ...(lua.stock?.fillTypeCatalog || {}),
        ...(lua.economy?.fillTypeCatalog || {}),
        ...(lua.economy?.marketPrices?.fillTypesByIndex || {}),
        ...catalogFromMapCrops(lua, xmlEconomy),
        ...Object.fromEntries(
            Object.entries(KNOWN_FILL_INDEX_NAMES).map(([idx, name]) => [String(idx), name])
        ),
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
    };
    const catalog = inferCatalogFromStockAndFields(
        lua.stock,
        lua.fields,
        base,
        xmlEconomy
    );
    return enrichStockFillTypes(lua.stock, catalog).catalog;
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

    let allowedFarmIds = farmIdsOwningFarmland(toArr(xmlData.farmlandsArray));
    if (allowedFarmIds.size === 0) {
        allowedFarmIds = farmIdsFromLuaFields(luaData.fields);
    }

    const fillTypeCatalog = buildFillTypeCatalog(luaData, xmlData.economy);
    const stockEnriched = enrichStockFillTypes(luaData.stock, fillTypeCatalog);

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

        // Farms — XML has players/stats, Lua has live money; drop savegame-only farm slots with no owned land
        farmInfo     : filterFarmsByFarmlandOwnership(
            mergeFarms(toArr(xmlData.farms), toArr(luaData.farmInfo)),
            allowedFarmIds
        ),

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
        vehicles     : mergeVehicles(toArr(luaData.vehicles), toArr(xmlData.vehicles)),

        // Economy — XML history + Lua live sell points
        economy      : mergeEconomy(luaData.economy || {}, xmlData.economy || {}),

        // Production — Lua only
        production   : luaData.production || { chains: [], husbandryTotals: {} },

        // Physical bales — Lua scan + stock objectStorage fallback when mod export is empty
        baleInventory: enrichBaleInventoryFromStock(luaData, stockEnriched.catalog),

        fillTypeCatalog: stockEnriched.catalog,
        cropFillTypeIndex: luaData.cropFillTypeIndex || {},
        stock: {
            ...stockEnriched.stock,
            enabled: luaData.stock?.enabled !== false,
            fillTypeCatalog: { ...stockEnriched.catalog },
        },
        redTape: luaData.redTape || { enabled: false, byFarm: {} },

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

/** Fallback when XML farmlands missing: farm IDs that appear on fields in live Lua data. */
function farmIdsFromLuaFields(luaFields) {
    const s = new Set();
    for (const f of toArr(luaFields)) {
        const id = Number(f.ownerFarmId);
        if (id > 0) s.add(id);
    }
    return s;
}

function filterFarmsByFarmlandOwnership(farms, allowedFarmIds) {
    const arr = toArr(farms);
    if (!allowedFarmIds || allowedFarmIds.size === 0) return arr;
    return arr.filter((f) => allowedFarmIds.has(Number(f.id)));
}

function mergeFarms(xmlFarms, luaFarms) {
    const luaMap = new Map(luaFarms.map(f => [f.id, f]));
    const xmlMap = new Map(xmlFarms.map(f => [f.id, f]));
    const allIds = new Set([...xmlMap.keys(), ...luaMap.keys()]);
    return Array.from(allIds).sort().map(id => {
        const xml = xmlMap.get(id) || {};
        const lua = luaMap.get(id) || {};
        return {
            id,
            name       : xml.name       || lua.name       || `Farm ${id}`,
            color      : xml.color      || 1,
            money      : lua.money      ?? xml.money       ?? 0,
            loan       : lua.loan       ?? xml.loan        ?? 0,
            players    : xml.players    || [],
            statistics : xml.statistics || {},
        };
    });
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

function mergeWeather(luaWeather, xmlEnv) {
    const base = luaWeather || {};
    if (!xmlEnv) return base;

    return {
        // Lua provides live temperature; XML provides accurate forecast
        currentTemperature : base.currentTemperature,
        currentWeather     : base.currentWeather     || xmlEnv.currentWeather || 'SUN',
        currentSeason      : xmlEnv.currentSeason    || 'SPRING',
        windSpeed          : base.windSpeed,
        cloudCoverage      : base.cloudCoverage,
        rainLevel          : base.rainLevel,
        snowLevel          : base.snowLevel,
        timeSinceLastRain  : base.timeSinceLastRain,
        // XML forecast is authoritative (exact game engine values)
        forecast           : xmlEnv.forecast?.length > 0 ? xmlEnv.forecast : (base.forecast || []),
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

/** Stable per-vehicle match key: config-file basename + owner farm (lowercased), or '' if unknown. */
function vehicleConfigKey(v) {
    const raw = String(v.configFileName || v.filename || '');
    const base = raw.replace(/\\/g, '/').split('/').pop() || '';
    const cfg = base.replace(/\.xml$/i, '').toLowerCase();
    if (!cfg) return '';
    const farm = Number(v.ownerFarmId ?? v.farmId ?? 0);
    return `${farm}::${cfg}`;
}

function mergeVehicles(luaVehicles, xmlVehicles) {
    // Match Lua<->XML by a STABLE config-file + farm key, NOT by position.
    // Position can't be the primary key: on a live/dedicated server the Lua entry carries the
    // vehicle's *live* world position while the XML entry carries its *last-saved* position, so
    // a position-only match (old 5m test) missed for any vehicle that had moved and the SAME
    // vehicle was emitted twice — once from Lua with its real name, once as an "xml_only" card
    // named after the config file (e.g. "series9S" alongside "MF 9S"). We bucket XML records by
    // key and consume each at most once; position is only a tiebreaker among same-model vehicles.
    const xmlByKey = new Map();
    for (const xv of xmlVehicles) {
        const k = vehicleConfigKey(xv);
        if (!k) continue;
        if (!xmlByKey.has(k)) xmlByKey.set(k, []);
        xmlByKey.get(k).push(xv);
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

    const merged = luaVehicles.map(luaV => {
        const k = vehicleConfigKey(luaV);
        const xmlV = k ? takeClosest(xmlByKey.get(k), luaV) : null;
        return {
            ...luaV,
            ownerFarmId   : luaV.ownerFarmId || xmlV?.farmId || 0,
            farmId        : luaV.ownerFarmId || xmlV?.farmId || 0,
            price         : luaV.price  || xmlV?.price  || 0,
            age           : luaV.age    || xmlV?.age    || 0,
            uniqueId      : xmlV?.uniqueId || luaV.id,
            filename      : xmlV?.filename || luaV.configFileName || '',
            xmlFillLevels : xmlV?.fillLevels || {},
            source        : xmlV ? 'merged' : 'lua_only',
        };
    });

    // Anything left in the XML buckets has no Lua counterpart → genuinely off-map / stored.
    for (const list of xmlByKey.values()) {
        for (const xv of list) {
            merged.push({
                id: xv.uniqueId, uniqueId: xv.uniqueId,
                name: xv.name, filename: xv.filename,
                farmId: xv.farmId, ownerFarmId: xv.farmId,
                price: xv.price, age: xv.age,
                operatingTime: xv.operatingTime,
                damage: xv.damage, fillLevels: xv.fillLevels,
                xmlFillLevels: xv.fillLevels,
                position: xv.position,
                isMotorized: false, engineOn: false, speed: 0,
                source: 'xml_only',
            });
        }
    }

    return merged;
}

// ─── economy ──────────────────────────────────────────────────────────────────

function mergeEconomy(luaEconomy, xmlEconomy) {
    const result = { ...luaEconomy, xmlPriceHistory: xmlEconomy };
    const catalog = {
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
        for (const [crop, data] of Object.entries(luaEconomy.marketPrices.crops)) {
            const hist = xmlEconomy[crop] || xmlEconomy[crop.toUpperCase()];
            if (hist) {
                data.priceHistory     = hist.history;
                data.avgXmlPrice      = hist.avgPrice;
                data.totalHarvested   = hist.totalAmount;
                if (!data.maxPriceMonth) {
                    data.maxPriceMonth = maxMonthFromHistory(hist.history);
                }
            }
        }
    }
    return result;
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

function buildFromLuaOnly(lua) {
    const allowed = farmIdsFromLuaFields(lua.fields);
    const fillTypeCatalog = buildFillTypeCatalog(lua);
    const stockEnriched = enrichStockFillTypes(lua.stock, fillTypeCatalog);
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
        farmInfo: filterFarmsByFarmlandOwnership(toArr(lua.farmInfo), allowed),
        money: lua.finance?.money ?? lua.money ?? 0,
        finance: lua.finance || {},
        weather: lua.weather || {},
        missions: [],
        animals: lua.animals || [],
        fields: toArr(lua.fields).map(normalizeFieldMulch),
        vehicles: lua.vehicles || [],
        economy: lua.economy   || {},
        production: lua.production || {},
        baleInventory: enrichBaleInventoryFromStock(lua, stockEnriched.catalog),
        fillTypeCatalog: stockEnriched.catalog,
        cropFillTypeIndex: lua.cropFillTypeIndex || {},
        stock: {
            ...stockEnriched.stock,
            enabled: lua.stock?.enabled !== false,
            fillTypeCatalog: { ...stockEnriched.catalog },
        },
        redTape: lua.redTape || { enabled: false, byFarm: {} },
        placeables: [],
    };
}

function buildFromXmlOnly(xml) {
    const allowed = farmIdsOwningFarmland(toArr(xml.farmlandsArray));
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
        farmInfo: filterFarmsByFarmlandOwnership(toArr(xml.farms), allowed),
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
        vehicles: xml.vehicles || [],
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
    buildFieldLiveFingerprints,
    buildFillTypeCatalog,
    deriveBaleInventoryFromStock,
    enrichBaleInventoryFromStock,
    supplementOnFieldFromFields,
    mergeBaleInventory,
};