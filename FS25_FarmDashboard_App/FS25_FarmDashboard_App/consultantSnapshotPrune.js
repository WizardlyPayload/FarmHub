/**
 * FS25 FarmDashboard — shrink merged farm JSON per consultant view before sending to BYOK LLMs.
 */
const crypto = require('crypto');

const MAX_FIELD_MAP = 80;
const MAX_FIELDS_SLIM = 50;
const MAX_FIELDS_HOME = 24;
const MAX_VEH_HOME = 20;
const MAX_VEH_FIELDS = 25;
const MAX_ANIMALS_HOME = 40;
const MAX_PASTURES_HOME = 20;

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

function filterFieldsForFarm(fields, farmId) {
    if (!Array.isArray(fields)) return [];
    return fields.filter((f) => {
        const fid = f.farmId ?? f.playerFarmId ?? f.ownerFarmId;
        return fid == null || Number(fid) === farmId;
    });
}

function filterAnimalsForFarm(animals, farmId) {
    if (!Array.isArray(animals)) return [];
    return animals.filter((a) => {
        const fid = a.farmId ?? a.ownerFarmId ?? a.playerFarmId;
        return fid == null || Number(fid) === farmId;
    });
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
 * @param {object} full — merged dashboard snapshot (already scoped vehicles in main for farm)
 * @param {string} view
 * @param {string} context
 * @param {number} farmId
 */
function pruneMergedDataForView(full, view, context, farmId) {
    const v = String(view || 'home').toLowerCase();
    const ctx = String(context || '').toLowerCase();
    const vehicles = filterVehiclesByFarm(full.vehicles, farmId);
    const fieldsAll = filterFieldsForFarm(full.fields || [], farmId);

    const baseMeta = {
        activeFarmId: farmId,
        _consultant_farm_scope: farmId,
        _prunedView: v,
        gameTime: full.gameTime,
        timestamp: full.timestamp,
    };

    if (ctx === 'fields' && v === 'fields') {
        return {
            ...baseMeta,
            fields: fieldsAll.slice(0, MAX_FIELD_MAP),
            vehicles: vehicles.slice(0, 40),
            _field_map_mode: true,
        };
    }
    if (v === 'fields') {
        return {
            ...baseMeta,
            fields: fieldsAll.slice(0, MAX_FIELDS_SLIM),
            vehicles: vehicles.slice(0, MAX_VEH_FIELDS),
        };
    }
    if (v === 'vehicles') {
        return { ...baseMeta, vehicles };
    }
    if (v === 'livestock') {
        return {
            ...baseMeta,
            animals: filterAnimalsForFarm(full.animals || [], farmId),
        };
    }
    if (v === 'pastures') {
        return {
            ...baseMeta,
            pastures: Array.isArray(full.pastures) ? full.pastures : [],
            animals: filterAnimalsForFarm(full.animals || [], farmId).slice(0, 80),
        };
    }
    if (v === 'productions') {
        return {
            ...baseMeta,
            production: full.production,
            productionPoints: full.productionPoints,
        };
    }
    if (v === 'economy') {
        const econFields = [];
        for (const f of fieldsAll.slice(0, MAX_FIELDS_ECONOMY)) {
            const s = slimFieldRowForEconomy(f);
            if (s) econFields.push(s);
        }
        const { held, heldTypes } = collectHeldFillTypesForEconomyView(full, farmId, fieldsAll);
        const heldList = heldFillTypesToList(held);
        const fin = full.finance && typeof full.finance === 'object' ? full.finance : {};
        const financeFacts = {
            money: fin.money != null ? fin.money : full.money,
            loan: fin.loan,
            loanMax: fin.loanMax,
            netWorth: fin.netWorth,
        };
        return {
            ...baseMeta,
            _consultant_held_fill_types: heldList,
            _consultant_economy_inventory_scope:
                'Only fill types in _consultant_held_fill_types represent physical stock (storage, vehicles, animals, or harvest-ready/bale/windrow fields). Do not advise selling or pricing any other commodity.',
            _consultant_finance_facts: financeFacts,
            economy: economySubsetForHeldInventory(full.economy, heldTypes),
            finance: full.finance,
            money: full.money,
            farms: full.farms || full.farmInfo,
            fields: econFields,
            production: full.production,
            productionPoints: full.productionPoints,
        };
    }
    /* home — compact cross-section only */
    return {
        ...baseMeta,
        fields: fieldsAll.slice(0, MAX_FIELDS_HOME),
        vehicles: vehicles.slice(0, MAX_VEH_HOME),
        animals: filterAnimalsForFarm(full.animals || [], farmId).slice(0, MAX_ANIMALS_HOME),
        pastures: Array.isArray(full.pastures) ? full.pastures.slice(0, MAX_PASTURES_HOME) : [],
        production: full.production,
        productionPoints: full.productionPoints,
        economy: full.economy,
        weather: full.weather,
    };
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

module.exports = {
    pruneMergedDataForView,
    hashPrunedSnapshot,
    stableStringify,
    slimFieldForConsultantLlm,
};
