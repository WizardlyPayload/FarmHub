// FS25 FarmDashboard | mergedSnapshotHold.js
// Hold last good merged dashboard when FS25 writes minimal/shutdown data.json.

function productionLooksEmpty(p) {
    if (!p || typeof p !== 'object') return true;
    const chains = p.chains;
    if (Array.isArray(chains) && chains.length > 0) return false;
    const ht = p.husbandryTotals;
    if (ht && typeof ht === 'object' && Object.keys(ht).length > 0) return false;
    return true;
}

function toArr(val) {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    if (typeof val === 'object') return Object.values(val);
    return [];
}

/** True when husbandry export has nothing the livestock UI can render. */
function animalsSectionEmpty(animals) {
    const arr = toArr(animals);
    if (arr.length === 0) return true;
    return !arr.some((h) => {
        if (!h || typeof h !== 'object') return false;
        if (Array.isArray(h.animals) && h.animals.length > 0) return true;
        if (Array.isArray(h.livestock) && h.livestock.length > 0) return true;
        if (Array.isArray(h.animalList) && h.animalList.length > 0) return true;
        const clusters = h.clusters;
        if (Array.isArray(clusters) && clusters.some((c) => c && Number(c.count) > 0)) return true;
        if (Number(h.animalCount) > 0 || Number(h.numAnimals) > 0) return true;
        return false;
    });
}

/**
 * True when the fields section carries no live Lua signal (XML-only rows have no hectares).
 * Happens when FieldDataCollector fails/missing while other collectors still export.
 */
function fieldsSectionDegraded(fields) {
    const arr = toArr(fields);
    if (arr.length === 0) return true;
    return !arr.some((f) => f && Number(f.hectares) > 0);
}

/** True when data.json looks like a full in-game export (vs {} / minimal writes on FS exit). */
function isRichLuaExport(lua) {
    if (!lua || typeof lua !== 'object') return false;
    if (Object.keys(lua).length >= 10) return true;
    if (Array.isArray(lua.fields) && lua.fields.length > 0) return true;
    if (Array.isArray(lua.vehicles) && lua.vehicles.length > 0) return true;
    if (lua.finance && typeof lua.finance === 'object' && Object.keys(lua.finance).length > 0) return true;
    if (lua.gameTime && typeof lua.gameTime === 'object' && Object.keys(lua.gameTime).length > 0) return true;
    if (lua.weather && typeof lua.weather === 'object') return true;
    return false;
}

function isRenderableMerged(merged) {
    if (!merged || typeof merged !== 'object') return false;
    if (Array.isArray(merged.fields) && merged.fields.length > 0) return true;
    if (Array.isArray(merged.vehicles) && merged.vehicles.length > 0) return true;
    if (Array.isArray(merged.animals) && merged.animals.length > 0) return true;
    if (!productionLooksEmpty(merged.production)) return true;
    if (Array.isArray(merged.pastures) && merged.pastures.length > 0) return true;
    if (merged.money != null && Number(merged.money) > 0) return true;
    if (merged.finance && typeof merged.finance === 'object' && Object.keys(merged.finance).length > 0) {
        return true;
    }
    return false;
}

function mergedContentScore(merged) {
    if (!merged || typeof merged !== 'object') return 0;
    let score = 0;
    if (Array.isArray(merged.fields)) score += merged.fields.length;
    if (Array.isArray(merged.vehicles)) score += merged.vehicles.length;
    if (Array.isArray(merged.animals)) score += merged.animals.length;
    if (Array.isArray(merged.pastures)) score += merged.pastures.length;
    if (!productionLooksEmpty(merged.production)) score += 12;
    if (merged.money != null && Number(merged.money) > 0) score += 3;
    return score;
}

function cloneMerged(merged) {
    return JSON.parse(JSON.stringify(merged));
}

function stampHeldSnapshot(merged, state, extra = {}) {
    const out = cloneMerged(merged);
    out.dataTimestamps = {
        ...(out.dataTimestamps || {}),
        heldFromSnapshotAt: new Date().toISOString(),
        liveExportStaleAt: new Date().toISOString(),
        ...(extra || {}),
    };
    if (state && state.lastLuaReceivedAt) {
        out.dataTimestamps.lastLuaReceivedAt = state.lastLuaReceivedAt;
    }
    return out;
}

/**
 * True when incoming Lua should be ignored because we already have a good offline snapshot.
 */
function shouldIgnoreMinimalLuaExport(luaPayload, state) {
    if (!state || isRichLuaExport(luaPayload)) return false;
    if (state.lastGoodMergedSnapshot && isRenderableMerged(state.lastGoodMergedSnapshot)) {
        return true;
    }
    return !!(state.mergedData && isRenderableMerged(state.mergedData));
}

function pickSnapshotSource(state) {
    if (state.lastGoodMergedSnapshot && isRenderableMerged(state.lastGoodMergedSnapshot)) {
        return state.lastGoodMergedSnapshot;
    }
    if (state.mergedData && isRenderableMerged(state.mergedData)) {
        return state.mergedData;
    }
    return null;
}

function pickAnimalsHoldSource(state, snap) {
    const backup = state && state.liveSectionBackup;
    if (backup && !animalsSectionEmpty(backup.animals)) {
        return toArr(backup.animals);
    }
    if (snap && !animalsSectionEmpty(snap.animals)) {
        return toArr(snap.animals);
    }
    return null;
}

function pickProductionHoldSource(state, snap) {
    const backup = state && state.liveSectionBackup;
    if (backup && !productionLooksEmpty(backup.production)) {
        return backup.production;
    }
    if (snap && !productionLooksEmpty(snap.production)) {
        return snap.production;
    }
    return null;
}

/** Remember last non-empty animals/production/fields so staggered writes cannot wipe sections. */
function updateLiveSectionBackup(state, merged, hydratedLua) {
    if (!state) return;
    state.liveSectionBackup = state.liveSectionBackup || {};
    const sources = [merged, hydratedLua].filter(Boolean);
    for (const src of sources) {
        if (!animalsSectionEmpty(src.animals)) {
            state.liveSectionBackup.animals = cloneMerged(toArr(src.animals));
            break;
        }
    }
    for (const src of sources) {
        if (!productionLooksEmpty(src.production)) {
            state.liveSectionBackup.production = cloneMerged(src.production);
            break;
        }
    }
    for (const src of sources) {
        if (!fieldsSectionDegraded(src.fields)) {
            state.liveSectionBackup.fields = cloneMerged(toArr(src.fields));
            break;
        }
    }
}

/**
 * After merge: if live Lua is minimal/shutdown, keep last full merged snapshot instead of empty UI.
 */
function applyMergedSnapshotIfStaleExport(merged, luaPayload, state) {
    if (!merged || !state) return merged;
    if (isRichLuaExport(luaPayload)) return merged;

    const snap = pickSnapshotSource(state);
    if (!snap) return merged;

    const mergedScore = mergedContentScore(merged);
    const snapScore = mergedContentScore(snap);
    const mergedEmpty = !isRenderableMerged(merged);
    const snapRich = snapScore > 0;
    const mergedMuchSmaller = snapScore > 0 && mergedScore < Math.max(5, Math.floor(snapScore * 0.35));

    if (!mergedEmpty && !mergedMuchSmaller) return merged;
    if (!snapRich) return merged;

    return stampHeldSnapshot(snap, state);
}

/**
 * When a rich/staggered data.json omits or clears animals/production, keep the last good sections.
 * (Mod LOD export uses empty husbandry.animals[] with clusters in separate detail files / clusters.)
 */
function applyLiveSectionHold(merged, state, rawLuaData, hydratedLuaData) {
    if (!merged || !state) return merged;
    const snap = pickSnapshotSource(state);

    let out = merged;
    let held = false;

    const luaAnimEmpty =
        animalsSectionEmpty(rawLuaData && rawLuaData.animals) &&
        animalsSectionEmpty(hydratedLuaData && hydratedLuaData.animals);
    const holdAnimals = pickAnimalsHoldSource(state, snap);
    if (animalsSectionEmpty(out.animals) && holdAnimals && luaAnimEmpty) {
        out = { ...out, animals: cloneMerged(holdAnimals) };
        held = true;
    }

    const luaProdEmpty =
        (!rawLuaData || productionLooksEmpty(rawLuaData.production)) &&
        (!hydratedLuaData || productionLooksEmpty(hydratedLuaData.production));
    const holdProduction = pickProductionHoldSource(state, snap);
    if (productionLooksEmpty(out.production) && holdProduction && luaProdEmpty) {
        out = { ...out, production: cloneMerged(holdProduction) };
        held = true;
    }

    // Fields: hold last full rows (with hectares/PF) when live Lua stopped exporting field data.
    const luaFieldsDegraded =
        (!rawLuaData || fieldsSectionDegraded(rawLuaData.fields)) &&
        (!hydratedLuaData || fieldsSectionDegraded(hydratedLuaData.fields));
    const backupFields = state.liveSectionBackup && state.liveSectionBackup.fields;
    const holdFields =
        (backupFields && !fieldsSectionDegraded(backupFields) && backupFields) ||
        (snap && !fieldsSectionDegraded(snap.fields) && snap.fields) ||
        null;
    if (fieldsSectionDegraded(out.fields) && holdFields && luaFieldsDegraded) {
        out = { ...out, fields: cloneMerged(toArr(holdFields)) };
        held = true;
    }

    if (!held) return merged;

    return {
        ...out,
        dataTimestamps: {
            ...(out.dataTimestamps || {}),
            liveSectionsHeldAt: new Date().toISOString(),
        },
    };
}

function mergeSnapshotSectionsForward(prev, next) {
    if (!prev || !next) return next;
    let out = next;
    if (animalsSectionEmpty(out.animals) && !animalsSectionEmpty(prev.animals)) {
        out = { ...out, animals: cloneMerged(prev.animals) };
    }
    if (productionLooksEmpty(out.production) && !productionLooksEmpty(prev.production)) {
        out = { ...out, production: cloneMerged(prev.production) };
    }
    if (fieldsSectionDegraded(out.fields) && !fieldsSectionDegraded(prev.fields)) {
        out = { ...out, fields: cloneMerged(toArr(prev.fields)) };
    }
    return out;
}

function updateLastGoodMergedSnapshot(state, merged, luaPayload) {
    if (!state || !merged || !isRenderableMerged(merged)) return;
    if (luaPayload && !isRichLuaExport(luaPayload)) return;
    let toSave = cloneMerged(merged);
    if (state.liveSectionBackup) {
        toSave = mergeSnapshotSectionsForward(state.liveSectionBackup, toSave);
    }
    if (state.lastGoodMergedSnapshot) {
        toSave = mergeSnapshotSectionsForward(state.lastGoodMergedSnapshot, toSave);
    }
    state.lastGoodMergedSnapshot = toSave;
}

function buildHeldPayloadFromState(state) {
    const snap = pickSnapshotSource(state);
    if (!snap) return null;
    let out = stampHeldSnapshot(snap, state);
    if (animalsSectionEmpty(out.animals)) {
        const holdAnimals = pickAnimalsHoldSource(state, snap);
        if (holdAnimals) out = { ...out, animals: cloneMerged(holdAnimals) };
    }
    if (productionLooksEmpty(out.production)) {
        const holdProduction = pickProductionHoldSource(state, snap);
        if (holdProduction) out = { ...out, production: cloneMerged(holdProduction) };
    }
    return out;
}

module.exports = {
    productionLooksEmpty,
    fieldsSectionDegraded,
    isRichLuaExport,
    isRenderableMerged,
    mergedContentScore,
    shouldIgnoreMinimalLuaExport,
    applyMergedSnapshotIfStaleExport,
    applyLiveSectionHold,
    animalsSectionEmpty,
    updateLiveSectionBackup,
    updateLastGoodMergedSnapshot,
    buildHeldPayloadFromState,
};
