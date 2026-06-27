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

function fieldHasMoisture(field) {
    return !!(field && field.moisture && field.moisture.percent != null);
}

/** Keep per-field soil moisture when a new export still has hectares but MoistureSystem stopped. */
function mergeFieldsMoistureForward(prevFields, nextFields) {
    const prevArr = toArr(prevFields);
    const nextArr = toArr(nextFields);
    if (prevArr.length === 0 || nextArr.length === 0) return nextArr;
    const prevById = new Map();
    for (const f of prevArr) {
        if (!fieldHasMoisture(f)) continue;
        const id = Number(f.farmlandId ?? f.id);
        if (id > 0) prevById.set(id, f.moisture);
    }
    if (prevById.size === 0) return nextArr;
    return nextArr.map((f) => {
        const id = Number(f.farmlandId ?? f.id);
        const prevMoist = id > 0 ? prevById.get(id) : null;
        if (prevMoist && !fieldHasMoisture(f)) {
            return {
                ...f,
                moisture: { ...prevMoist, enabled: prevMoist.enabled !== false },
            };
        }
        return f;
    });
}

function weatherMoisturePresent(weather) {
    const m = weather && weather.moisture;
    return !!(m && m.enabled !== false && m.currentPercent != null);
}

function baleMoistureHasData(baleInventory) {
    const m = baleInventory && baleInventory.moisture;
    if (!m || m.enabled === false) return false;
    const byFarm = m.byFarm;
    if (!byFarm || typeof byFarm !== 'object') return false;
    return Object.values(byFarm).some((row) => {
        if (!row || row.enabled === false) return false;
        const grades = row.gradeCounts;
        if (grades && typeof grades === 'object' && Object.values(grades).some((n) => Number(n) > 0)) {
            return true;
        }
        return Array.isArray(row.worst) && row.worst.length > 0;
    });
}

function mergeWeatherMoistureForward(prev, next) {
    if (!next || !prev) return next;
    if (weatherMoisturePresent(next.weather)) return next;
    if (!weatherMoisturePresent(prev.weather)) return next;
    return {
        ...next,
        weather: {
            ...(next.weather || {}),
            moisture: { ...(prev.weather.moisture || {}) },
        },
    };
}

function mergeBaleMoistureForward(prev, next) {
    if (!next || !prev) return next;
    if (baleMoistureHasData(next.baleInventory)) return next;
    if (!baleMoistureHasData(prev.baleInventory)) return next;
    return {
        ...next,
        baleInventory: {
            ...(next.baleInventory || {}),
            moisture: JSON.parse(JSON.stringify(prev.baleInventory.moisture)),
        },
    };
}

function stockHasData(stock) {
    if (!stock || stock.enabled === false) return false;
    if (!stock.byFarm || typeof stock.byFarm !== 'object') return false;
    return Object.values(stock.byFarm).some((farm) => {
        const items = toArr(farm?.items);
        return items.some((item) => Number(item?.totalLiters) > 0);
    });
}

function stockSectionEmpty(stock) {
    return !stockHasData(stock);
}

function redTapeFarmHasData(farm) {
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

function redTapeHasData(redTape) {
    if (!redTape || redTape.enabled !== true) return false;
    if (!redTape.byFarm || typeof redTape.byFarm !== 'object') return false;
    return Object.values(redTape.byFarm).some(redTapeFarmHasData);
}

function redTapeSectionEmpty(redTape) {
    return !redTapeHasData(redTape);
}

function pickStockHoldSource(state, snap) {
    const backup = state?.liveSectionBackup?.stock;
    if (stockHasData(backup)) return backup;
    if (snap && stockHasData(snap.stock)) return snap.stock;
    return null;
}

function pickRedTapeHoldSource(state, snap) {
    const backup = state?.liveSectionBackup?.redTape;
    if (redTapeHasData(backup)) return backup;
    if (snap && redTapeHasData(snap.redTape)) return snap.redTape;
    return null;
}

function stockLocationHasMoisture(stock) {
    if (!stock?.byFarm || typeof stock.byFarm !== 'object') return false;
    for (const farm of Object.values(stock.byFarm)) {
        for (const item of toArr(farm?.items)) {
            for (const loc of item?.locations || []) {
                if (loc && (loc.moisturePct != null || loc.qualityPct != null || loc.grade)) {
                    return true;
                }
            }
        }
    }
    return false;
}

/** Keep silo moisture/quality on stock rows when a shutdown export drops location detail. */
function mergeStockMoistureForward(prev, next) {
    if (!next || !prev) return next;
    if (stockLocationHasMoisture(next.stock)) return next;
    if (!stockLocationHasMoisture(prev.stock)) return next;
    const prevStock = prev.stock;
    const nextStock = next.stock ? { ...next.stock, byFarm: { ...next.stock.byFarm } } : { byFarm: {} };
    for (const [fid, farm] of Object.entries(nextStock.byFarm || {})) {
        const prevFarm = prevStock.byFarm?.[fid];
        if (!prevFarm?.items) continue;
        const prevByIdx = new Map();
        for (const item of prevFarm.items) {
            const idx = Number(item?.fillTypeIndex);
            if (!Number.isFinite(idx)) continue;
            prevByIdx.set(idx, item);
        }
        nextStock.byFarm[fid] = {
            ...farm,
            items: (farm.items || []).map((item) => {
                const prevItem = prevByIdx.get(Number(item.fillTypeIndex));
                if (!prevItem?.locations?.length) return item;
                const prevLocByName = new Map(
                    prevItem.locations.map((loc) => [String(loc?.name || ''), loc])
                );
                const locations = (item.locations || []).map((loc) => {
                    const key = String(loc?.name || '');
                    const old = prevLocByName.get(key);
                    if (!old) return loc;
                    if (loc.moisturePct != null || loc.qualityPct != null || loc.grade) return loc;
                    return {
                        ...loc,
                        ...(old.moisturePct != null ? { moisturePct: old.moisturePct } : {}),
                        ...(old.qualityPct != null ? { qualityPct: old.qualityPct } : {}),
                        ...(old.grade ? { grade: old.grade } : {}),
                    };
                });
                return { ...item, locations };
            }),
        };
    }
    return { ...next, stock: nextStock };
}

function mergeMoistureSectionsForward(prev, next) {
    if (!prev || !next) return next;
    let out = next;
    if (Array.isArray(out.fields)) {
        const mergedFields = mergeFieldsMoistureForward(prev.fields, out.fields);
        if (mergedFields !== out.fields) out = { ...out, fields: mergedFields };
    }
    out = mergeWeatherMoistureForward(prev, out);
    out = mergeBaleMoistureForward(prev, out);
    out = mergeStockMoistureForward(prev, out);
    return out;
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
            const nextFields = cloneMerged(toArr(src.fields));
            const prevFields = state.liveSectionBackup.fields;
            state.liveSectionBackup.fields = prevFields
                ? mergeFieldsMoistureForward(prevFields, nextFields)
                : nextFields;
            break;
        }
    }
    for (const src of sources) {
        if (weatherMoisturePresent(src.weather)) {
            state.liveSectionBackup.weather = cloneMerged(src.weather);
            break;
        }
    }
    for (const src of sources) {
        if (baleMoistureHasData(src.baleInventory)) {
            state.liveSectionBackup.baleInventory = cloneMerged(src.baleInventory);
            break;
        }
    }
    for (const src of sources) {
        if (stockHasData(src.stock)) {
            state.liveSectionBackup.stock = cloneMerged(src.stock);
            break;
        }
    }
    for (const src of sources) {
        if (redTapeHasData(src.redTape)) {
            state.liveSectionBackup.redTape = cloneMerged(src.redTape);
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

    const held = stampHeldSnapshot(snap, state);
    if (Array.isArray(merged.farmInfo)) {
        return { ...held, farmInfo: merged.farmInfo };
    }
    return held;
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

    const backupWeather = state.liveSectionBackup && state.liveSectionBackup.weather;
    const holdWeather =
        (backupWeather && weatherMoisturePresent(backupWeather) && backupWeather) ||
        (snap && weatherMoisturePresent(snap.weather) && snap.weather) ||
        null;
    if (!weatherMoisturePresent(out.weather) && holdWeather) {
        out = {
            ...out,
            weather: { ...(out.weather || {}), moisture: cloneMerged(holdWeather.moisture) },
        };
        held = true;
    }

    const backupBale = state.liveSectionBackup && state.liveSectionBackup.baleInventory;
    const holdBale =
        (backupBale && baleMoistureHasData(backupBale) && backupBale) ||
        (snap && baleMoistureHasData(snap.baleInventory) && snap.baleInventory) ||
        null;
    if (!baleMoistureHasData(out.baleInventory) && holdBale) {
        out = {
            ...out,
            baleInventory: {
                ...(out.baleInventory || {}),
                moisture: cloneMerged(holdBale.moisture),
            },
        };
        held = true;
    }

    const luaStockEmpty =
        stockSectionEmpty(rawLuaData && rawLuaData.stock) &&
        stockSectionEmpty(hydratedLuaData && hydratedLuaData.stock);
    const holdStock = pickStockHoldSource(state, snap);
    if (stockSectionEmpty(out.stock) && holdStock && luaStockEmpty) {
        out = {
            ...out,
            stock: cloneMerged(holdStock),
            fillTypeCatalog: out.fillTypeCatalog || holdStock.fillTypeCatalog || snap?.fillTypeCatalog,
        };
        held = true;
    }

    const luaRedTapeEmpty =
        redTapeSectionEmpty(rawLuaData && rawLuaData.redTape) &&
        redTapeSectionEmpty(hydratedLuaData && hydratedLuaData.redTape);
    const holdRedTape = pickRedTapeHoldSource(state, snap);
    if (redTapeSectionEmpty(out.redTape) && holdRedTape && luaRedTapeEmpty) {
        out = { ...out, redTape: cloneMerged(holdRedTape) };
        held = true;
    }

    if (Array.isArray(out.fields) && holdFields) {
        const mergedMoist = mergeFieldsMoistureForward(holdFields, out.fields);
        if (mergedMoist !== out.fields) {
            out = { ...out, fields: mergedMoist };
            held = true;
        }
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
    } else if (Array.isArray(out.fields) && Array.isArray(prev.fields)) {
        const mergedFields = mergeFieldsMoistureForward(prev.fields, out.fields);
        if (mergedFields !== out.fields) out = { ...out, fields: mergedFields };
    }
    out = mergeWeatherMoistureForward(prev, out);
    out = mergeBaleMoistureForward(prev, out);
    out = mergeStockMoistureForward(prev, out);
    if (stockSectionEmpty(out.stock) && stockHasData(prev.stock)) {
        out = { ...out, stock: cloneMerged(prev.stock) };
    }
    if (redTapeSectionEmpty(out.redTape) && redTapeHasData(prev.redTape)) {
        out = { ...out, redTape: cloneMerged(prev.redTape) };
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
    if (stockSectionEmpty(out.stock)) {
        const holdStock = pickStockHoldSource(state, snap);
        if (holdStock) out = { ...out, stock: cloneMerged(holdStock) };
    }
    if (redTapeSectionEmpty(out.redTape)) {
        const holdRedTape = pickRedTapeHoldSource(state, snap);
        if (holdRedTape) out = { ...out, redTape: cloneMerged(holdRedTape) };
    }
    return out;
}

module.exports = {
    productionLooksEmpty,
    fieldsSectionDegraded,
    fieldHasMoisture,
    mergeFieldsMoistureForward,
    weatherMoisturePresent,
    baleMoistureHasData,
    mergeMoistureSectionsForward,
    mergeStockMoistureForward,
    stockLocationHasMoisture,
    isRichLuaExport,
    isRenderableMerged,
    mergedContentScore,
    shouldIgnoreMinimalLuaExport,
    applyMergedSnapshotIfStaleExport,
    applyLiveSectionHold,
    animalsSectionEmpty,
    stockSectionEmpty,
    stockHasData,
    redTapeSectionEmpty,
    redTapeHasData,
    updateLiveSectionBackup,
    updateLastGoodMergedSnapshot,
    buildHeldPayloadFromState,
};
