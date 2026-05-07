// FS25 FarmDashboard | dataMerger.js | v2.0.0

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
        };
    }
    return out;
}

function fieldAdvanceScore(f) {
    if (!f) return -1;
    if (f.harvestReady || f.isHarvested) return 10000 + Number(f.growthState || 0);
    const gl = String(f.growthLabel || '').toLowerCase();
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
            return { ...base, _fieldDataSource: 'savegame_xml', _fieldCropRotated: true };
        }
        const xc = fieldAdvanceScore(xmlField);
        const lc = fieldAdvanceScore(cache);
        if (lc > xc + 0.5 || (luaNewer && lc >= xc)) {
            return {
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
            };
        }
        return { ...base, _fieldDataSource: 'savegame_xml' };
    });
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
    return {
        ...obj,
        dataTimestamps: {
            lastLuaReceivedAt: lastLuaAt,
            lastXmlReceivedAt: lastXmlAt,
            mergeComputedAt,
            liveNewerThanXml,
        },
    };
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
        return attachDataTimestamps({ ...base, fields }, { lastLuaAt, lastXmlAt });
    }
    if (!xmlData) {
        const base = buildFromLuaOnly(luaData);
        return attachDataTimestamps(base, { lastLuaAt, lastXmlAt });
    }

    let allowedFarmIds = farmIdsOwningFarmland(toArr(xmlData.farmlandsArray));
    if (allowedFarmIds.size === 0) {
        allowedFarmIds = farmIdsFromLuaFields(luaData.fields);
    }

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
        mapId        : xmlData.career?.mapId        || '',
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
                             luaArr
                         );
                       })(),

        // Vehicles — merge XML (ownership/price) with Lua (live state)
        vehicles     : mergeVehicles(toArr(luaData.vehicles), toArr(xmlData.vehicles)),

        // Economy — XML history + Lua live sell points
        economy      : mergeEconomy(luaData.economy || {}, xmlData.economy || {}),

        // Production — Lua only
        production   : luaData.production || { chains: [], husbandryTotals: {} },

        // Physical bales by fill category — on cropland vs yards/sheds (Lua mod scan)
        baleInventory: luaData.baleInventory || { farmId: null, onField: {}, offField: {} },

        // Placeables — XML
        placeables   : toArr(xmlData.placeables),

        // Pass through raw data for frontend use
        xmlFarmlands : toArr(xmlData.farmlandsArray),
        xmlEconomy   : xmlData.economy        || {},
    };

    return attachDataTimestamps(mergedCore, { lastLuaAt, lastXmlAt });
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
function mergeFields(xmlFields, luaFields) {
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
            fertilizationLevel: luaField.fertilizationLevel ?? xmlField.fertilizationLevel,
            limeLevel: luaField.limeLevel ?? xmlField.limeLevel,
            sprayLevel: luaField.sprayLevel ?? xmlField.sprayLevel,
        };

        return {
            ...xmlField,    // XML base: soil state, ownership, crop, growthState
            ...spatialData, // Lua: map position and area
            ...pfOverlay,   // Lua: mapped nitrogen/pH when soil data is active
            ...windBale,    // Lua: windrow + bale counts for post-harvest rules
            ...luaAgronomy,
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

function mergeVehicles(luaVehicles, xmlVehicles) {
    // Build position-indexed lookup for XML vehicles
    const xmlByPos = xmlVehicles.filter(v => v.position);

    const merged = luaVehicles.map(luaV => {
        let xmlV = null;
        if (luaV.position) {
            let best = Infinity;
            for (const xv of xmlByPos) {
                const d = Math.hypot(luaV.position.x - xv.position.x,
                                     luaV.position.z - xv.position.z);
                if (d < 5 && d < best) { best = d; xmlV = xv; }
            }
        }
        return {
            ...luaV,
            ownerFarmId   : luaV.ownerFarmId || xmlV?.farmId || 0,
            farmId        : luaV.ownerFarmId || xmlV?.farmId || 0,
            price         : luaV.price  || xmlV?.price  || 0,
            age           : luaV.age    || xmlV?.age    || 0,
            uniqueId      : xmlV?.uniqueId || luaV.id,
            filename      : xmlV?.filename || '',
            xmlFillLevels : xmlV?.fillLevels || {},
            source        : xmlV ? 'merged' : 'lua_only',
        };
    });

    // Add XML-only vehicles (not in Lua — off-map / stored)
    const luaPos = luaVehicles.filter(v => v.position).map(v => v.position);
    for (const xv of xmlVehicles) {
        if (!xv.position) continue;
        const present = luaPos.some(lp =>
            Math.hypot(lp.x - xv.position.x, lp.z - xv.position.z) < 5);
        if (!present) {
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

    // Enrich Lua crop entries with XML price history
    if (luaEconomy.marketPrices?.crops && xmlEconomy) {
        for (const [crop, data] of Object.entries(luaEconomy.marketPrices.crops)) {
            const hist = xmlEconomy[crop] || xmlEconomy[crop.toUpperCase()];
            if (hist) {
                data.priceHistory     = hist.history;
                data.avgXmlPrice      = hist.avgPrice;
                data.totalHarvested   = hist.totalAmount;
            }
        }
    }
    return result;
}

// ─── single-source fallbacks ──────────────────────────────────────────────────

function buildFromLuaOnly(lua) {
    const allowed = farmIdsFromLuaFields(lua.fields);
    return {
        dataSource: 'lua_only', xmlAvailable: false, luaAvailable: true,
        lastUpdated: new Date().toISOString(),
        serverInfo: lua.serverInfo || {},
        mapTitle: lua.serverInfo?.mapName || 'Unknown Map',
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
        baleInventory: lua.baleInventory || { farmId: null, onField: {}, offField: {} },
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

module.exports = { mergeData, buildFieldLiveFingerprints };