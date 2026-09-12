// FS25 FarmDashboard | mergedSnapshotHold.js
// Hold last good merged dashboard when FS25 writes minimal/shutdown data.json.

/** Per-server generation so overlapping rebuildMerged awaits cannot publish an older merge. */
function createMergeRebuildGate() {
    const gens = new Map();
    return {
        begin(serverId) {
            const key = String(serverId);
            const next = (gens.get(key) || 0) + 1;
            gens.set(key, next);
            return next;
        },
        isCurrent(serverId, gen) {
            return gens.get(String(serverId)) === gen;
        },
    };
}

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

function fieldHasSoil(field) {
    const s = field && field.soilFertilizer;
    return !!(s && typeof s === 'object' && s.enabled !== false && (s.organicMatter != null || s.pH != null || s.ppm));
}

function fieldHasOutline(field) {
    return Array.isArray(field?.outline) && field.outline.length >= 3;
}

function fieldHasCropStress(field) {
    const s = field && field.cropStress;
    return !!(s && typeof s === 'object' && s.enabled !== false);
}

/** Keep per-field soil / outlines / moisture when a shutdown export or XML-only merge drops them. */
function mergeFieldsMoistureForward(prevFields, nextFields) {
    const prevArr = toArr(prevFields);
    const nextArr = toArr(nextFields);
    if (prevArr.length === 0 || nextArr.length === 0) return nextArr;
    const prevById = new Map();
    for (const f of prevArr) {
        const id = Number(f.farmlandId ?? f.id);
        if (id > 0) prevById.set(id, f);
    }
    if (prevById.size === 0) return nextArr;
    let changed = false;
    const out = nextArr.map((f) => {
        const id = Number(f.farmlandId ?? f.id);
        const prev = id > 0 ? prevById.get(id) : null;
        if (!prev) return f;
        let next = f;
        const take = (patch) => {
            next = next === f ? { ...f, ...patch } : { ...next, ...patch };
            changed = true;
        };
        if (fieldHasMoisture(prev) && !fieldHasMoisture(next)) {
            take({ moisture: { ...prev.moisture, enabled: prev.moisture.enabled !== false } });
        }
        if (fieldHasSoil(prev) && !fieldHasSoil(next)) {
            take({ soilFertilizer: cloneMerged(prev.soilFertilizer) });
        }
        if (fieldHasCropStress(prev) && !fieldHasCropStress(next)) {
            take({ cropStress: cloneMerged(prev.cropStress) });
        }
        if (fieldHasOutline(prev) && !fieldHasOutline(next)) {
            take({ outline: cloneMerged(prev.outline) });
            if (prev.fruitMapColor && !next.fruitMapColor) {
                next = { ...next, fruitMapColor: prev.fruitMapColor };
            }
        }
        if (!(Number(next.hectares) > 0) && Number(prev.hectares) > 0) {
            take({ hectares: prev.hectares });
        }
        if (!(Number(next.posX) || Number(next.posZ)) && (Number(prev.posX) || Number(prev.posZ))) {
            take({ posX: prev.posX, posZ: prev.posZ });
        }
        return next;
    });
    return changed ? out : nextArr;
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

/** Lua soft-detect: `enabled: false` means Red Tape is not active — never hold stale data over it. */
function redTapeExplicitlyDisabled(redTape) {
    return !!(redTape && typeof redTape === 'object' && redTape.enabled === false);
}

function rfBlockActive(block) {
    return !!(block && typeof block === 'object' && block.enabled === true);
}

function realisticFarmingHasData(rf) {
    if (!rf || typeof rf !== 'object') return false;
    if (rf.presence && rf.presence.enabled === true) return true;
    return Object.keys(rf).some((key) => rfBlockActive(rf[key]));
}

/** Keep Soil Fertilizer / Crop Stress (and other RF blocks) when a shutdown stub sets enabled:false. */
function mergeRealisticFarmingForward(prevRf, nextRf) {
    const prev = prevRf && typeof prevRf === 'object' ? prevRf : null;
    if (!prev) return nextRf;
    const next = nextRf && typeof nextRf === 'object' ? { ...nextRf } : {};
    let changed = false;
    for (const key of Object.keys(prev)) {
        if (rfBlockActive(prev[key]) && !rfBlockActive(next[key])) {
            next[key] = cloneMerged(prev[key]);
            changed = true;
        }
    }
    return changed ? next : nextRf;
}

function mapBoundsHalf(bounds) {
    const h = Number(bounds?.halfSize);
    if (Number.isFinite(h) && h > 0) return h;
    const ts = Number(bounds?.terrainSize);
    if (Number.isFinite(ts) && ts > 0) return ts * 0.5;
    return 0;
}

function mapIdentityKey(snap) {
    const si = snap?.serverInfo && typeof snap.serverInfo === 'object' ? snap.serverInfo : {};
    const slot = String(si.saveSlot || snap?.saveSlot || '').trim().toLowerCase();
    const mapId = String(si.mapId || snap?.mapId || '').trim().toLowerCase();
    return `${slot}|${mapId}`;
}

function sameMapIdentity(prev, next) {
    const a = mapIdentityKey(prev);
    const b = mapIdentityKey(next);
    if (a === '|' || b === '|') return true;
    return a === b;
}

function mergeMapBoundsForward(prev, next) {
    if (!prev || !next) return next;
    if (!sameMapIdentity(prev, next)) return next;
    const prevHalf = Math.max(mapBoundsHalf(prev.mapBounds), mapBoundsHalf(prev.serverInfo?.mapBounds));
    const nextHalf = Math.max(mapBoundsHalf(next.mapBounds), mapBoundsHalf(next.serverInfo?.mapBounds));
    if (!(prevHalf > nextHalf)) return next;
    const bounds = cloneMerged(prev.mapBounds || prev.serverInfo?.mapBounds);
    if (!bounds) return next;
    const si =
        next.serverInfo && typeof next.serverInfo === 'object'
            ? { ...next.serverInfo, mapBounds: bounds }
            : { ...(prev.serverInfo || {}), mapBounds: bounds };
    return { ...next, mapBounds: bounds, serverInfo: si };
}

function realisticFarmingSectionEmpty(rf) {
    return !realisticFarmingHasData(rf);
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

function pickRealisticFarmingHoldSource(state, snap) {
    const backup = state?.liveSectionBackup?.realisticFarming;
    if (realisticFarmingHasData(backup)) return backup;
    if (snap && realisticFarmingHasData(snap.realisticFarming)) return snap.realisticFarming;
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
    // Shutdown stubs still have many empty keys (gameTime, collectorModules, leftover money, …).
    // Count fleet / field / livestock rows, not key cardinality or finance.
    if (toArr(lua.vehicles).length > 0) return true;
    if (toArr(lua.animals).length > 0) return true;
    const fields = toArr(lua.fields);
    if (fields.some((f) => f && (Number(f.hectares) > 0 || Number(f.farmlandId || f.id) > 0))) {
        return true;
    }
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

/** Lua omitted this cycle (`null` / missing / `{}`). A JSON array (even `[]`) is a successful collect. */
function luaSectionOmitted(section) {
    if (section == null) return true;
    if (Array.isArray(section)) return false;
    if (typeof section === 'object' && Object.keys(section).length === 0) return true;
    return false;
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
        if (redTapeExplicitlyDisabled(src.redTape)) {
            if (state.liveSectionBackup) state.liveSectionBackup.redTape = undefined;
            break;
        }
        if (redTapeHasData(src.redTape)) {
            state.liveSectionBackup.redTape = cloneMerged(src.redTape);
            break;
        }
    }
    for (const src of sources) {
        if (realisticFarmingHasData(src.realisticFarming)) {
            state.liveSectionBackup.realisticFarming = cloneMerged(src.realisticFarming);
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
    if (!snap || !isRenderableMerged(snap)) return merged;

    // XML still has field/vehicle rows after quit, so a content-score compare used to
    // keep the shutdown rebuild (2 km mapBounds, no soil). Always prefer the last in-game snapshot.
    const held = stampHeldSnapshot(snap, state);
    if (Array.isArray(merged.farmInfo) && merged.farmInfo.length > 0) {
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

    const luaAnimOmitted = !rawLuaData || luaSectionOmitted(rawLuaData.animals);
    const holdAnimals = pickAnimalsHoldSource(state, snap);
    if (animalsSectionEmpty(out.animals) && holdAnimals && luaAnimOmitted) {
        out = { ...out, animals: cloneMerged(holdAnimals) };
        held = true;
    }

    const luaProdOmitted = !rawLuaData || luaSectionOmitted(rawLuaData.production);
    const holdProduction = pickProductionHoldSource(state, snap);
    if (productionLooksEmpty(out.production) && holdProduction && luaProdOmitted) {
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

    const luaRedTapeDisabled =
        redTapeExplicitlyDisabled(rawLuaData && rawLuaData.redTape) ||
        redTapeExplicitlyDisabled(hydratedLuaData && hydratedLuaData.redTape);
    if (luaRedTapeDisabled) {
        // Soft-detect off: drop stale hold so nav/section cannot false-positive.
        if (state.liveSectionBackup) state.liveSectionBackup.redTape = undefined;
    } else {
        const luaRedTapeEmpty =
            redTapeSectionEmpty(rawLuaData && rawLuaData.redTape) &&
            redTapeSectionEmpty(hydratedLuaData && hydratedLuaData.redTape);
        const holdRedTape = pickRedTapeHoldSource(state, snap);
        if (redTapeSectionEmpty(out.redTape) && holdRedTape && luaRedTapeEmpty) {
            out = { ...out, redTape: cloneMerged(holdRedTape) };
            held = true;
        }
    }

    const luaRfEmpty =
        realisticFarmingSectionEmpty(rawLuaData && rawLuaData.realisticFarming) &&
        realisticFarmingSectionEmpty(hydratedLuaData && hydratedLuaData.realisticFarming);
    const holdRf = pickRealisticFarmingHoldSource(state, snap);
    if (realisticFarmingSectionEmpty(out.realisticFarming) && holdRf && luaRfEmpty) {
        out = { ...out, realisticFarming: cloneMerged(holdRf) };
        held = true;
    } else if (holdRf) {
        const mergedRf = mergeRealisticFarmingForward(holdRf, out.realisticFarming);
        if (mergedRf !== out.realisticFarming) {
            out = { ...out, realisticFarming: mergedRf };
            held = true;
        }
    }

    if (Array.isArray(out.fields) && holdFields) {
        const mergedMoist = mergeFieldsMoistureForward(holdFields, out.fields);
        if (mergedMoist !== out.fields) {
            out = { ...out, fields: mergedMoist };
            held = true;
        }
    }

    const boundSrc = snap || (state.liveSectionBackup && state.liveSectionBackup.mapBounds ? state.liveSectionBackup : null);
    if (boundSrc) {
        const withBounds = mergeMapBoundsForward(boundSrc, out);
        if (withBounds !== out) {
            out = withBounds;
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
    if (
        !redTapeExplicitlyDisabled(out.redTape) &&
        redTapeSectionEmpty(out.redTape) &&
        redTapeHasData(prev.redTape)
    ) {
        out = { ...out, redTape: cloneMerged(prev.redTape) };
    }
    if (realisticFarmingSectionEmpty(out.realisticFarming) && realisticFarmingHasData(prev.realisticFarming)) {
        out = { ...out, realisticFarming: cloneMerged(prev.realisticFarming) };
    } else if (prev.realisticFarming) {
        const mergedRf = mergeRealisticFarmingForward(prev.realisticFarming, out.realisticFarming);
        if (mergedRf !== out.realisticFarming) out = { ...out, realisticFarming: mergedRf };
    }
    out = mergeMapBoundsForward(prev, out);
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
    if (!redTapeExplicitlyDisabled(out.redTape) && redTapeSectionEmpty(out.redTape)) {
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
    redTapeExplicitlyDisabled,
    updateLiveSectionBackup,
    updateLastGoodMergedSnapshot,
    buildHeldPayloadFromState,
    createMergeRebuildGate,
};
