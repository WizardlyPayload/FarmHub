/**
 * FS25 FarmDashboard — shrink merged farm JSON per consultant view before sending to BYOK LLMs.
 */
const crypto = require('crypto');

/** Field map rows (bridge may batch further in localConsultantLlm). */
const MAX_FIELD_MAP = 80;
const MAX_FIELDS_SLIM = 36;
const MAX_FIELDS_HOME = 10;
const MAX_VEH_HOME = 8;
const MAX_ANIMALS_HOME = 12;
const MAX_PASTURES_HOME = 8;
const MAX_VEHICLES_VIEW = 48;
const MAX_LIVESTOCK_VIEW = 48;
const MAX_PASTURES_ROWS = 16;
const MAX_PASTURE_ANIMALS = 20;

/** Keys removed recursively — geometry, bale dumps, windrow matrices (never needed for text consultant). */
const HEAVY_PAYLOAD_KEYS = new Set([
    'windrowSamples',
    'windrowMatrix',
    'windrows',
    'bales',
    'baleList',
    'worldBales',
    'baleWorldPositions',
    'balePositions',
    'vertices',
    'polygon',
    'polygons',
    'outline',
    'outlines',
    'splines',
    'spline',
    'coordinates',
    'coordinateGrid',
    'gpsPath',
    'routePoints',
    'telemetry',
    'samples3d',
    'heightMap',
    'soilMap',
    'terrainData',
    'textureData',
    'debugVertices',
    'placeables',
    'decoration',
    'collisionMask',
    'rawXmlBlob',
    'mapCoords',
    'worldPositions',
    'pathNodes',
]);

function stableStringify(obj) {
    if (obj === null || typeof obj !== 'object') {
        return JSON.stringify(obj);
    }
    if (Array.isArray(obj)) {
        return `[${obj.map(stableStringify).join(',')}]`;
    }
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

function hashPrunedSnapshot(obj) {
    return crypto.createHash('sha256').update(stableStringify(obj)).digest('hex');
}

function filterVehiclesByFarm(vehicles, farmId) {
    if (!Array.isArray(vehicles)) return [];
    return vehicles.filter((v) => {
        const o = v.ownerFarmId != null ? v.ownerFarmId : v.farmId;
        return o == null || Number(o) === farmId;
    });
}

/**
 * True when a field row is owned by the dashboard farm — same as Fields tab ``filterFieldsForFarmView``:
 * ``ownerFarmId`` if present, else ``farmId`` (no ``playerFarmId``, which can match the session farm
 * on parcels the UI does not list as yours).
 */
function fieldRowOwnedByFarm(f, farmId) {
    if (!f || typeof f !== 'object') return false;
    const fid = Number(farmId);
    if (!Number.isFinite(fid) || fid < 1) return false;
    const oid = Number(f.ownerFarmId ?? f.farmId ?? 0);
    return oid === fid && oid > 0;
}

function filterFieldsForFarm(fields, farmId) {
    if (!Array.isArray(fields)) return [];
    return fields.filter((f) => fieldRowOwnedByFarm(f, farmId));
}

function filterAnimalsForFarm(animals, farmId) {
    if (!Array.isArray(animals)) return [];
    return animals.filter((a) => {
        const fid = a.farmId ?? a.ownerFarmId ?? a.playerFarmId;
        return fid == null || Number(fid) === farmId;
    });
}

function normalizeFieldRefKey(s) {
    if (s == null) return '';
    return String(s).trim();
}

/**
 * Match field-consultant-bridge / map field_ref to a row (farmlandId, id, fieldId).
 * @param {object} row
 * @param {string} refRaw
 */
function fieldMatchesRef(row, refRaw) {
    const ref = normalizeFieldRefKey(refRaw);
    if (!ref || !row || typeof row !== 'object') return false;
    const candidates = [row.farmlandId, row.id, row.fieldId].filter((x) => x != null);
    for (const c of candidates) {
        if (String(c) === ref) return true;
        const rn = Number(ref);
        const cn = Number(c);
        if (Number.isFinite(rn) && Number.isFinite(cn) && rn === cn) return true;
    }
    return false;
}

function minimalFinanceFacts(full) {
    const fin = full.finance && typeof full.finance === 'object' ? full.finance : {};
    return {
        money: fin.money != null ? fin.money : full.money,
        loan: fin.loan,
        loanMax: fin.loanMax,
        netWorth: fin.netWorth,
    };
}

/**
 * Deep-delete heavy geometry / coordinate dumps so local LLMs never see multi‑KB arrays.
 * @param {unknown} obj
 * @param {number} [depth]
 * @returns {unknown}
 */
function stripHeavyConsultantPayload(obj, depth) {
    const d = depth != null ? depth : 0;
    if (d > 14) return null;
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) {
        const out = [];
        const lim = Math.min(obj.length, 400);
        for (let i = 0; i < lim; i++) {
            out.push(stripHeavyConsultantPayload(obj[i], d + 1));
        }
        if (obj.length > lim) {
            out.push(`…+${obj.length - lim} items omitted`);
        }
        return out;
    }
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
        if (HEAVY_PAYLOAD_KEYS.has(k)) continue;
        const lk = String(k).toLowerCase();
        if (
            (lk.includes('sample') && lk.includes('windrow')) ||
            (lk.endsWith('matrix') && Array.isArray(v))
        ) {
            continue;
        }
        if (Array.isArray(v) && v.length > 48) {
            const numeric = v.every((x) => typeof x === 'number' || (typeof x === 'object' && x !== null && !Array.isArray(x) && typeof x.x === 'number'));
            if (numeric && v.length > 24) {
                out[k] = `…${v.length} numeric/coordinate values omitted`;
                continue;
            }
        }
        if (typeof v === 'string' && v.length > 4000) {
            out[k] = `${v.slice(0, 2000)}…[truncated ${v.length} chars]`;
            continue;
        }
        out[k] = stripHeavyConsultantPayload(v, d + 1);
    }
    return out;
}

/**
 * Shrink a plain object until JSON.stringify fits maxChars (keeps valid JSON). Used for local Ollama 4k ctx.
 * @param {object} obj
 * @param {number} maxChars
 */
function fitJsonObjectToMaxChars(obj, maxChars) {
    const max = Math.max(512, Math.min(50000, maxChars || 5000));
    let o = JSON.parse(JSON.stringify(obj && typeof obj === 'object' ? obj : {}));
    const arrayKeys = [
        'fields',
        'vehicles',
        'animals',
        'pastures',
        'productionPoints',
        '_consultant_held_fill_types',
    ];

    function size() {
        try {
            return JSON.stringify(o).length;
        } catch (_) {
            return max + 1;
        }
    }

    let guard = 0;
    while (size() > max && guard < 140) {
        guard += 1;
        let cut = false;
        if (o.weather) {
            delete o.weather;
            cut = true;
        }
        if (cut) continue;
        if (typeof o._consultant_economy_inventory_scope === 'string' && o._consultant_economy_inventory_scope.length > 80) {
            o._consultant_economy_inventory_scope = '[scope omitted]';
            cut = true;
        }
        if (cut) continue;
        for (const key of arrayKeys) {
            if (Array.isArray(o[key]) && o[key].length > 1) {
                o[key] = o[key].slice(0, Math.max(1, Math.ceil(o[key].length * 0.6)));
                cut = true;
                break;
            }
        }
        if (cut) continue;
        if (o.production && typeof o.production === 'object' && o.production.chains && Array.isArray(o.production.chains)) {
            const ch = o.production.chains;
            if (ch.length > 1) {
                o.production = { ...o.production, chains: ch.slice(0, Math.max(1, Math.ceil(ch.length * 0.6))) };
                cut = true;
            }
        }
        if (cut) continue;
        if (o.economy && typeof o.economy === 'object') {
            delete o.economy;
            cut = true;
        }
        if (cut) continue;
        if (o.production) {
            delete o.production;
            cut = true;
        }
        if (cut) continue;
        o._consultant_json_trimmed = true;
        break;
    }
    return o;
}

/** Economy Smart suggestions: only field facts tied to harvest readiness, bales/swaths, and sellable crop state (not full field map). */
const ECONOMY_FIELD_KEYS = new Set([
    'farmlandId',
    'id',
    'name',
    'label',
    'hectares',
    'fruitTypeIndex',
    'fruitTypeName',
    'growthState',
    'harvestReady',
    'baleCountOnField',
    'baleCount',
    'needsBaling',
    'baleableLooseLiters',
    'hasWindrow',
    'windrowLiters',
    'needsWork',
    'xmlFruitTypeHint',
]);

function slimFieldRowForEconomy(row) {
    if (!row || typeof row !== 'object') return null;
    const o = {};
    for (const k of ECONOMY_FIELD_KEYS) {
        if (row[k] !== undefined) o[k] = row[k];
    }
    return Object.keys(o).length ? o : null;
}

const MAX_FIELDS_ECONOMY = 48;

/** Ignore float noise and empty tanks. */
const MIN_HELD_LITERS = 1;

/** Still counted as physical stock for production context, but omitted from filtered crop price maps (not sellable grain). */
const ECONOMY_MARKET_PRICE_SKIP = new Set([
    'AIR',
    'DIESEL',
    'DEF',
    'BALE_WRAP',
    'BALE_TWINE',
    'UNKNOWN',
]);

function normFillType(name) {
    if (name == null || name === '') return '';
    return String(name).trim().toUpperCase();
}

/**
 * Add liters from a fill-level map (flat numbers or { level } objects).
 * @param {Record<string, unknown>} levels
 * @param {Map<string, { liters: number, sources: Set<string> }>} held
 * @param {string} source
 */
function mergeFillLevelMap(levels, held, source) {
    if (!levels || typeof levels !== 'object') return;
    for (const [rawKey, v] of Object.entries(levels)) {
        const key = normFillType(rawKey);
        if (!key || key === 'UNKNOWN') continue;
        let liters = NaN;
        if (typeof v === 'number') liters = v;
        else if (v && typeof v === 'object' && typeof v.level === 'number') liters = v.level;
        if (!Number.isFinite(liters) || liters < MIN_HELD_LITERS) continue;
        const cur = held.get(key) || { liters: 0, sources: new Set() };
        cur.liters += liters;
        cur.sources.add(source);
        held.set(key, cur);
    }
}

function chainOwnedByFarm(chain, farmId) {
    const o = chain.ownerFarmId ?? chain.farmId ?? chain.playerFarmId;
    return o == null || Number(o) === farmId;
}

/**
 * Physical stock signals for the active farm: silos/production I/O, vehicles, animals, and
 * harvest-ready / bale / windrow fields. Used to strip the global price table down to what
 * the player can actually sell or move (stops LLMs from picking random "best price" crops).
 *
 * @returns {{ held: Map<string, { liters: number, sources: Set<string> }>, heldTypes: Set<string> }}
 */
function collectHeldFillTypesForEconomyView(full, farmId, fieldsForFarm) {
    const held = new Map();

    const prod = full.production;
    if (prod && typeof prod === 'object' && Array.isArray(prod.chains)) {
        for (const ch of prod.chains) {
            if (!ch || typeof ch !== 'object' || !chainOwnedByFarm(ch, farmId)) continue;
            mergeFillLevelMap(ch.inputFillLevels, held, 'production.input');
            mergeFillLevelMap(ch.outputFillLevels, held, 'production.output');
        }
    }

    const ppts = full.productionPoints;
    if (Array.isArray(ppts)) {
        for (const pt of ppts) {
            if (!pt || typeof pt !== 'object' || !chainOwnedByFarm(pt, farmId)) continue;
            mergeFillLevelMap(pt.inputFillLevels, held, 'productionPoint.input');
            mergeFillLevelMap(pt.outputFillLevels, held, 'productionPoint.output');
            mergeFillLevelMap(pt.storageFillLevels, held, 'productionPoint.storage');
        }
    }

    const vehicles = filterVehiclesByFarm(full.vehicles, farmId);
    for (const ve of vehicles) {
        if (!ve || typeof ve !== 'object') continue;
        mergeFillLevelMap(ve.fillLevels, held, 'vehicle');
    }

    const animals = filterAnimalsForFarm(full.animals || [], farmId);
    for (const an of animals) {
        if (!an || typeof an !== 'object') continue;
        mergeFillLevelMap(an.fillLevels, held, 'animal.fillLevels');
        mergeFillLevelMap(an.storageData, held, 'animal.storage');
    }

    for (const f of fieldsForFarm) {
        if (!f || typeof f !== 'object') continue;
        const hr = f.harvestReady === true;
        const bales = Number(f.baleCountOnField ?? f.baleCount ?? 0) > 0;
        const wind = Number(f.windrowLiters ?? 0) >= MIN_HELD_LITERS;
        const looseBale = Number(f.baleableLooseLiters ?? 0) >= MIN_HELD_LITERS;
        if (!hr && !bales && !wind && !looseBale) continue;
        const ft = normFillType(f.fruitTypeName || f.fruitType || f.xmlFruitTypeHint);
        if (!ft) continue;
        const cur = held.get(ft) || { liters: 0, sources: new Set() };
        if (cur.liters < MIN_HELD_LITERS) cur.liters = MIN_HELD_LITERS;
        cur.sources.add(hr ? 'field:harvest_ready' : 'field:bale_or_windrow');
        held.set(ft, cur);
    }

    const heldTypes = new Set(held.keys());
    return { held, heldTypes };
}

function heldFillTypesToList(held) {
    const rows = [];
    for (const [fillType, rec] of held.entries()) {
        const sources = Array.from(rec.sources).sort();
        rows.push({
            fillType,
            litersApprox: Math.round(rec.liters * 1000) / 1000,
            sources,
        });
    }
    rows.sort((a, b) => b.litersApprox - a.litersApprox);
    return rows;
}

/**
 * Remove economy blobs that list every commodity on the map; keep only price rows for `heldTypes`.
 * Drops `sellPoints` (per-point full matrices) — too easy for models to mine unrelated crops.
 */
function economySubsetForHeldInventory(econ, heldTypes) {
    if (!econ || typeof econ !== 'object') return econ;
    const out = { ...econ };
    delete out.sellPoints;

    const priceTypes = new Set();
    for (const t of heldTypes) {
        if (!ECONOMY_MARKET_PRICE_SKIP.has(t)) priceTypes.add(t);
    }

    const filterPriceMap = (obj) => {
        if (!obj || typeof obj !== 'object') return obj;
        const next = {};
        for (const k of Object.keys(obj)) {
            if (priceTypes.has(normFillType(k))) next[k] = obj[k];
        }
        return next;
    };

    if (econ.marketPrices && typeof econ.marketPrices === 'object') {
        const mp = { ...econ.marketPrices };
        if (mp.crops && typeof mp.crops === 'object') {
            mp.crops = filterPriceMap(mp.crops);
        }
        out.marketPrices = mp;
    }
    if (econ.fillTypePrices && typeof econ.fillTypePrices === 'object') {
        out.fillTypePrices = filterPriceMap(econ.fillTypePrices);
    }

    return out;
}

/**
 * Strip verbose field blobs before sending to local LLMs with tiny num_ctx (e.g. Ollama 4096).
 * Keeps keys the consultant prompts reference; drops huge geometry / debug payloads if present.
 */
const CONSULTANT_LLM_FIELD_KEYS = [
    'farmlandId',
    'id',
    'name',
    'label',
    'hectares',
    'fruitType',
    'fruitTypeIndex',
    'fruitTypeName',
    'xmlFruitTypeHint',
    'growthState',
    'growthStatePercentage',
    'growthLabel',
    'harvestReady',
    'isHarvested',
    'nitrogenLevel',
    'targetNitrogen',
    'nitrogenText',
    'needsWork',
    'phValue',
    'limeText',
    'needsLime',
    'phLimeBarMin',
    'phLimeBarMax',
];

function slimFieldForConsultantLlm(row) {
    if (!row || typeof row !== 'object') return null;
    const o = {};
    for (const k of CONSULTANT_LLM_FIELD_KEYS) {
        if (row[k] !== undefined) o[k] = row[k];
    }
    if (Object.keys(o).length === 0) {
        return { farmlandId: row.farmlandId, id: row.id };
    }
    return o;
}

/** Cap fill-level maps (vehicles / animals / production) so JSON stays small for Ollama num_ctx 4096. */
function slimFillLevelsMap(fl, maxEntries) {
    if (!fl || typeof fl !== 'object') return {};
    const lim = Math.max(1, Math.min(24, maxEntries || 10));
    const keys = Object.keys(fl).sort();
    const o = {};
    for (let i = 0; i < keys.length && i < lim; i++) {
        const k = keys[i];
        o[k] = fl[k];
    }
    return o;
}

const CONSULTANT_LLM_VEHICLE_KEYS = [
    'id',
    'uniqueId',
    'name',
    'ownerFarmId',
    'farmId',
    'operatingTime',
    'damage',
    'price',
    'age',
    'isMotorized',
    'engineOn',
    'speed',
    'source',
];

function slimVehicleForConsultantLlm(v) {
    if (!v || typeof v !== 'object') return null;
    const o = {};
    for (const k of CONSULTANT_LLM_VEHICLE_KEYS) {
        if (v[k] !== undefined) o[k] = v[k];
    }
    if (v.fillLevels && typeof v.fillLevels === 'object') {
        o.fillLevels = slimFillLevelsMap(v.fillLevels, 10);
    }
    if (v.xmlFillLevels && typeof v.xmlFillLevels === 'object') {
        o.xmlFillLevels = slimFillLevelsMap(v.xmlFillLevels, 10);
    }
    if (typeof v.filename === 'string' && v.filename.length > 0) {
        const fn = v.filename;
        o.filename = fn.length > 56 ? `…${fn.slice(-56)}` : fn;
    }
    if (v.position && typeof v.position === 'object') {
        const p = v.position;
        const x = Number(p.x);
        const z = Number(p.z);
        if (Number.isFinite(x) && Number.isFinite(z)) {
            o.position = { x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10 };
        }
    }
    if (Object.keys(o).length === 0) {
        return { id: v.id, uniqueId: v.uniqueId, name: v.name };
    }
    return o;
}

const CONSULTANT_LLM_ANIMAL_KEYS = [
    'id',
    'name',
    'farmId',
    'ownerFarmId',
    'subType',
    'type',
    'health',
    'age',
    'gender',
    'weight',
    'isPregnant',
    'isLactating',
    'isParent',
    'location',
    'locationType',
    'reproduction',
    'food',
    'water',
    'numAnimals',
    'monthsSinceLastBirth',
];

function slimAnimalForConsultantLlm(a) {
    if (!a || typeof a !== 'object') return null;
    const o = {};
    for (const k of CONSULTANT_LLM_ANIMAL_KEYS) {
        if (a[k] !== undefined) o[k] = a[k];
    }
    if (a.fillLevels && typeof a.fillLevels === 'object') {
        o.fillLevels = slimFillLevelsMap(a.fillLevels, 8);
    }
    if (Object.keys(o).length === 0) {
        return { id: a.id, subType: a.subType };
    }
    return o;
}

const CONSULTANT_LLM_PASTURE_KEYS = ['id', 'name', 'farmId', 'ownerFarmId', 'herdSize', 'grass', 'grassPct', 'manure'];

/**
 * Precompute barn/pasture food & water as % of capacity so the LLM does not treat liter counts (e.g. 4500 L)
 * as a 0–100 fullness score. Omitted when totals look inconsistent (ratio ≫ 100%).
 */
function pastureFeedWaterPctHintForConsultant(p) {
    const fr = p && p.foodReport;
    if (!fr || typeof fr !== 'object' || fr.hasRealData !== true) return undefined;
    const foodL = Math.max(
        Number(fr.availableFood) || 0,
        Number(fr.food) || 0,
        Number(fr.totalMixedRation) || 0,
    );
    const capL = Number(fr.totalCapacity) || 0;
    const hint = {};
    if (capL >= 400 && foodL >= 0 && capL > 0) {
        const ratio = foodL / capL;
        if (ratio <= 1.2) {
            hint.foodPctOfCapacity = Math.min(100, Math.round(ratio * 1000) / 10);
        }
    }
    const w = Number(fr.water) || 0;
    const wc = Number(fr.waterCapacity) || 0;
    if (wc >= 100 && w >= 0 && wc > 0) {
        const rw = w / wc;
        if (rw <= 1.2) {
            hint.waterPctOfCapacity = Math.min(100, Math.round(rw * 1000) / 10);
        }
    }
    return Object.keys(hint).length ? hint : undefined;
}

function slimPastureForConsultantLlm(p) {
    if (!p || typeof p !== 'object') return null;
    const o = {};
    for (const k of CONSULTANT_LLM_PASTURE_KEYS) {
        if (p[k] !== undefined) o[k] = p[k];
    }
    if (p.fillLevels && typeof p.fillLevels === 'object') {
        o.fillLevels = slimFillLevelsMap(p.fillLevels, 8);
    }
    const pctHint = pastureFeedWaterPctHintForConsultant(p);
    if (pctHint) {
        o._consultant_feed_water_pct = pctHint;
    }
    return Object.keys(o).length ? o : null;
}

function slimProductionSlotForConsultantLlm(p) {
    if (!p || typeof p !== 'object') return null;
    const ins = Array.isArray(p.inputs) ? p.inputs.slice(0, 4) : [];
    const outs = Array.isArray(p.outputs) ? p.outputs.slice(0, 4) : [];
    return {
        name: p.name,
        isActive: p.isActive,
        status: p.status,
        cyclesPerHour: p.cyclesPerHour,
        inputs: ins,
        outputs: outs,
    };
}

function slimProductionChainForConsultantLlm(ch) {
    if (!ch || typeof ch !== 'object') return null;
    const o = {
        id: ch.id,
        name: ch.name,
        ownerFarmId: ch.ownerFarmId,
        isActive: ch.isActive,
    };
    if (ch.inputFillLevels) o.inputFillLevels = slimFillLevelsMap(ch.inputFillLevels, 8);
    if (ch.outputFillLevels) o.outputFillLevels = slimFillLevelsMap(ch.outputFillLevels, 8);
    const prods = Array.isArray(ch.productions) ? ch.productions.slice(0, 4) : [];
    o.productions = prods.map(slimProductionSlotForConsultantLlm).filter(Boolean);
    return o;
}

/**
 * Trim production.chains for local LLMs — full chain objects can be megabytes of recipe rows.
 * @param {object} prod
 * @param {number} [maxChains]
 */
function slimProductionForConsultantLlm(prod, maxChains) {
    if (!prod || typeof prod !== 'object') return prod;
    const mc = Math.max(1, Math.min(16, maxChains != null ? maxChains : 8));
    const chains = Array.isArray(prod.chains) ? prod.chains : [];
    const slimChains = chains.slice(0, mc).map(slimProductionChainForConsultantLlm).filter(Boolean);
    const out = { ...prod, chains: slimChains };
    if (prod.husbandryTotals && typeof prod.husbandryTotals === 'object') {
        out.husbandryTotals = slimFillLevelsMap(prod.husbandryTotals, 12);
    }
    return out;
}

/** Tiny weather blob for home view — no forecast arrays. */
function slimWeatherForConsultant(w) {
    if (!w || typeof w !== 'object') return undefined;
    const o = {};
    for (const k of ['season', 'airTemperature', 'temperature', 'dayTime', 'isRaining']) {
        if (w[k] !== undefined) o[k] = w[k];
    }
    return Object.keys(o).length ? o : undefined;
}

/** Default cap for Gemini BYOK / non-Ollama local paths (chars of serialized JSON). */
const DEFAULT_PRUNED_JSON_MAX_CHARS =
    Number(process.env.FARMDASH_CONSULTANT_PRUNED_MAX_JSON_CHARS) || 5000;

/**
 * Ollama / OpenAI-compat: aim ~2000 prompt tokens for user JSON (system + rules eat the rest of num_ctx≈4096).
 * Override with FARMDASH_LOCAL_LLM_MAX_JSON_CHARS.
 */
const LOCAL_LLM_TARGET_JSON_CHARS =
    Number(process.env.FARMDASH_LOCAL_LLM_MAX_JSON_CHARS) || 7200;

/**
 * Second pass on an already view-pruned snapshot before building chat prompts (Electron BYOK runner).
 * Heavy geometry strip runs only when ``localCompatHeavyStrip`` (Ollama / openai_compat).
 *
 * @param {object} snapshot
 * @param {{ localCompatHeavyStrip?: boolean, maxJsonChars?: number } | undefined} [options]
 * @returns {object}
 */
function applyLocalConsultantPayloadDiet(snapshot, options) {
    const localHeavy = options && options.localCompatHeavyStrip === true;
    const maxJsonChars =
        options && options.maxJsonChars != null && Number.isFinite(Number(options.maxJsonChars))
            ? Number(options.maxJsonChars)
            : localHeavy
              ? LOCAL_LLM_TARGET_JSON_CHARS
              : DEFAULT_PRUNED_JSON_MAX_CHARS;
    let o = JSON.parse(JSON.stringify(snapshot && typeof snapshot === 'object' ? snapshot : {}));
    if (localHeavy) {
        const stripped = stripHeavyConsultantPayload(o);
        o = stripped && typeof stripped === 'object' ? stripped : {};
    }
    return fitJsonObjectToMaxChars(o, maxJsonChars);
}

/**
 * Strict view / field isolation + heavy-key strip + char budget for local LLMs.
 * @param {object} full — merged dashboard snapshot (vehicles already farm-scoped in main when applicable)
 * @param {string} view
 * @param {string} context
 * @param {number} farmId
 * @param {{
 *   fieldRef?: string,
 *   fieldId?: string,
 *   maxJsonChars?: number,
 *   localCompatHeavyStrip?: boolean,
 * } | undefined} [options]
 */
function pruneMergedDataForView(full, view, context, farmId, options) {
    const v0 = String(view || 'home').toLowerCase();
    const ctx = String(context || '').toLowerCase();
    const vehicles = filterVehiclesByFarm(full.vehicles, farmId);

    let rawSingle = '';
    if (options) {
        if (options.fieldRef != null && String(options.fieldRef).trim() !== '') {
            rawSingle = options.fieldRef;
        } else if (options.fieldId != null && String(options.fieldId).trim() !== '') {
            rawSingle = options.fieldId;
        }
    }
    const singleRef = normalizeFieldRefKey(rawSingle);

    const v = singleRef ? 'fields' : v0;

    const fieldsRaw = Array.isArray(full.fields) ? full.fields : [];
    let fieldsAll = filterFieldsForFarm(fieldsRaw, farmId);

    const localHeavy = options && options.localCompatHeavyStrip === true;
    const maxJsonChars =
        options && options.maxJsonChars != null && Number.isFinite(Number(options.maxJsonChars))
            ? Number(options.maxJsonChars)
            : localHeavy
              ? LOCAL_LLM_TARGET_JSON_CHARS
              : DEFAULT_PRUNED_JSON_MAX_CHARS;

    const baseMeta = {
        activeFarmId: farmId,
        _consultant_farm_scope: farmId,
        _prunedView: v,
        gameTime: full.gameTime,
        timestamp: full.timestamp,
    };

    const finBlock = () => ({ _consultant_finance_facts: minimalFinanceFacts(full) });

    /** @type {Record<string, unknown>} */
    let out;

    /** Field-consultant-bridge: one parcel only (main sets context=fields when fieldRef is present). */
    if (singleRef) {
        let row = fieldsAll.find((f) => fieldMatchesRef(f, singleRef));
        if (!row) {
            row = fieldsRaw.find((f) => fieldMatchesRef(f, singleRef));
        }
        if (row && !fieldRowOwnedByFarm(row, farmId)) {
            row = null;
        }
        const sf = row ? slimFieldForConsultantLlm(row) : null;
        out = {
            ...baseMeta,
            _single_field_mode: true,
            _field_target_ref: singleRef,
            fields: sf ? [sf] : [],
        };
        if (!sf) out._field_match_miss = true;
    } else if (ctx === 'fields' && v === 'fields') {
        const rawFields = fieldsAll
            .slice(0, MAX_FIELD_MAP)
            .map((f) => slimFieldForConsultantLlm(f))
            .filter(Boolean);
        out = {
            ...baseMeta,
            ...finBlock(),
            fields: rawFields,
            _field_map_mode: true,
        };
    } else if (v === 'fields') {
        out = {
            ...baseMeta,
            ...finBlock(),
            fields: fieldsAll
                .slice(0, MAX_FIELDS_SLIM)
                .map((f) => slimFieldForConsultantLlm(f))
                .filter(Boolean),
        };
    } else if (v === 'vehicles') {
        /** Strict isolation: fleet + cash facts only — no fields, animals, production, pastures, placeables, economy blobs. */
        out = {
            ...baseMeta,
            ...finBlock(),
            vehicles: vehicles
                .slice(0, MAX_VEHICLES_VIEW)
                .map((x) => slimVehicleForConsultantLlm(x))
                .filter(Boolean),
        };
    } else if (v === 'livestock') {
        out = {
            ...baseMeta,
            ...finBlock(),
            animals: filterAnimalsForFarm(full.animals || [], farmId)
                .slice(0, MAX_LIVESTOCK_VIEW)
                .map((a) => slimAnimalForConsultantLlm(a))
                .filter(Boolean),
        };
    } else if (v === 'pastures') {
        const past = Array.isArray(full.pastures) ? full.pastures : [];
        out = {
            ...baseMeta,
            ...finBlock(),
            pastures: past
                .slice(0, MAX_PASTURES_ROWS)
                .map((p) => slimPastureForConsultantLlm(p))
                .filter(Boolean),
            animals: filterAnimalsForFarm(full.animals || [], farmId)
                .slice(0, MAX_PASTURE_ANIMALS)
                .map((a) => slimAnimalForConsultantLlm(a))
                .filter(Boolean),
        };
    } else if (v === 'productions') {
        out = {
            ...baseMeta,
            ...finBlock(),
            production: slimProductionForConsultantLlm(full.production, 8),
            productionPoints: Array.isArray(full.productionPoints) ? full.productionPoints.slice(0, 12) : [],
        };
    } else if (v === 'economy') {
        const econFields = [];
        for (const f of fieldsAll.slice(0, MAX_FIELDS_ECONOMY)) {
            const s = slimFieldRowForEconomy(f);
            if (s) econFields.push(s);
        }
        const { held, heldTypes } = collectHeldFillTypesForEconomyView(full, farmId, fieldsAll);
        const heldList = heldFillTypesToList(held).slice(0, 32);
        const fin = full.finance && typeof full.finance === 'object' ? full.finance : {};
        const financeFactsObj = {
            money: fin.money != null ? fin.money : full.money,
            loan: fin.loan,
            loanMax: fin.loanMax,
            netWorth: fin.netWorth,
        };
        out = {
            ...baseMeta,
            _consultant_held_fill_types: heldList,
            _consultant_economy_inventory_scope:
                'Only fill types in _consultant_held_fill_types represent physical stock.',
            _consultant_finance_facts: financeFactsObj,
            economy: economySubsetForHeldInventory(full.economy, heldTypes),
            money: full.money,
            finance: minimalFinanceFacts(full),
            fields: econFields.slice(0, 24),
            production: slimProductionForConsultantLlm(full.production, 4),
            productionPoints: Array.isArray(full.productionPoints) ? full.productionPoints.slice(0, 8) : [],
        };
    } else {
        const weather = slimWeatherForConsultant(full.weather);
        out = {
            ...baseMeta,
            ...finBlock(),
            fields: fieldsAll
                .slice(0, MAX_FIELDS_HOME)
                .map((f) => slimFieldForConsultantLlm(f))
                .filter(Boolean),
            vehicles: vehicles
                .slice(0, MAX_VEH_HOME)
                .map((x) => slimVehicleForConsultantLlm(x))
                .filter(Boolean),
            animals: filterAnimalsForFarm(full.animals || [], farmId)
                .slice(0, MAX_ANIMALS_HOME)
                .map((a) => slimAnimalForConsultantLlm(a))
                .filter(Boolean),
            pastures: (Array.isArray(full.pastures) ? full.pastures : [])
                .slice(0, MAX_PASTURES_HOME)
                .map((p) => slimPastureForConsultantLlm(p))
                .filter(Boolean),
            production: slimProductionForConsultantLlm(full.production, 4),
            productionPoints: Array.isArray(full.productionPoints) ? full.productionPoints.slice(0, 6) : [],
            weather,
        };
    }

    let body = out;
    if (localHeavy) {
        const stripped = stripHeavyConsultantPayload(out);
        body = stripped && typeof stripped === 'object' ? stripped : {};
    }
    return fitJsonObjectToMaxChars(body, maxJsonChars);
}

module.exports = {
    pruneMergedDataForView,
    applyLocalConsultantPayloadDiet,
    LOCAL_LLM_TARGET_JSON_CHARS,
    hashPrunedSnapshot,
    stableStringify,
    slimFieldForConsultantLlm,
    slimVehicleForConsultantLlm,
    slimAnimalForConsultantLlm,
    slimPastureForConsultantLlm,
    slimProductionForConsultantLlm,
};
