// FS25 FarmDashboard | mergedSnapshotHold.js
// Hold last good merged dashboard when FS25 writes minimal/shutdown data.json.

const { rfBlockTerminal, terminalRfBlocks, stripFieldSoil, admitRfState, retentionIdentity, sameRetentionScope } = require('./rfProviderState.cjs');

function createMergeRebuildGate() {
    const generations = new Map();
    return {
        begin(serverId) {
            const key = String(serverId);
            const next = (generations.get(key) || 0) + 1;
            generations.set(key, next);
            return next;
        },
        isCurrent(serverId, generation) {
            return generations.get(String(serverId)) === generation;
        },
    };
}

function resetIncompatibleRetention(state, current) {
    if (!state || !current) return;
    const previous = state.lastGoodMergedSnapshot || state.mergedData || state.liveSectionBackup;
    if (previous && !sameRetentionScope(previous, current)) {
        state.lastGoodMergedSnapshot = null;
        state.liveSectionBackup = {};
        state.fieldLiveCache = {};
        state.mergedData = null;
        return true;
    }
    return false;
}

/** A merge may already have consumed the previous field cache before hold runs. */
function dropCrossScopeRfDetails(merged, current) {
    const currentFields = toArr(current && current.fields);
    return {
        ...merged,
        realisticFarming: cloneMerged(current && current.realisticFarming || {}),
        fields: toArr(merged.fields).map(field => {
            const fresh = currentFields.find(row => row && field && row.id != null && String(row.id) === String(field.id));
            const out = { ...field };
            for (const key of ['soilFertilizer', 'cropStress']) {
                if (fresh && fresh[key]) out[key] = cloneMerged(fresh[key]);
                else delete out[key];
            }
            return out;
        }),
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

function fieldIdentityParts(field) {
    const idNum = Number(field && field.id);
    const farmNum = Number(field && field.farmlandId);
    const career = field && (field.careerId || field.sourceId) ? String(field.careerId || field.sourceId) : '';
    const map = field && (field.mapId || field.mapName) ? String(field.mapId || field.mapName) : '';
    return {
        hasId: Number.isFinite(idNum) && idNum > 0,
        idNum,
        hasFarm: Number.isFinite(farmNum) && farmNum > 0,
        farmNum,
        career,
        map,
    };
}

/** Field id is the entity. Farmland is ownership, used only when that parcel has one legacy row. */
function indexFieldsForRetention(prevArr) {
    const byEntity = new Map();
    const byFarmland = new Map();
    for (const field of prevArr) {
        const parts = fieldIdentityParts(field);
        if (parts.hasId) byEntity.set(`${parts.career}|${parts.map}|id:${parts.idNum}`, field);
        if (parts.hasFarm) {
            const key = `${parts.career}|${parts.map}|farm:${parts.farmNum}`;
            const list = byFarmland.get(key) || [];
            list.push(field);
            byFarmland.set(key, list);
        }
    }
    return { byEntity, byFarmland };
}

function previousFieldFor(index, field) {
    const parts = fieldIdentityParts(field);
    if (parts.hasId) {
        return index.byEntity.get(`${parts.career}|${parts.map}|id:${parts.idNum}`) || null;
    }
    if (!parts.hasFarm) return null;
    const list = index.byFarmland.get(`${parts.career}|${parts.map}|farm:${parts.farmNum}`) || [];
    return list.length === 1 ? list[0] : null;
}

/** Keep per-field soil / outlines / moisture when a shutdown export or XML-only merge drops them. */
function mergeFieldsMoistureForward(prevFields, nextFields, opts = {}) {
    const prevArr = toArr(prevFields);
    const nextArr = toArr(nextFields);
    if (prevArr.length === 0 || nextArr.length === 0) return nextArr;
    const index = indexFieldsForRetention(prevArr);
    if (index.byEntity.size === 0 && index.byFarmland.size === 0) return nextArr;
    let changed = false;
    const out = nextArr.map((f) => {
        const prev = previousFieldFor(index, f);
        if (!prev) return f;
        let next = f;
        const take = (patch) => {
            next = next === f ? { ...f, ...patch } : { ...next, ...patch };
            changed = true;
        };
        if (fieldHasMoisture(prev) && !fieldHasMoisture(next)) {
            take({ moisture: { ...prev.moisture, enabled: prev.moisture.enabled !== false } });
        }
        if (!opts.dropSoil && !rfBlockTerminal(next.soilFertilizer) && fieldHasSoil(prev) && !fieldHasSoil(next)) {
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
        if ((next.nitrogenReadState === 'held' || next.nitrogenReadState === 'failed') && prev.nitrogenSampledAt != null) {
            take({
                nitrogenSampledAt: prev.nitrogenSampledAt,
                nitrogenLevel: next.nitrogenLevel == null ? prev.nitrogenLevel : next.nitrogenLevel,
            });
        }
        if ((next.phReadState === 'held' || next.phReadState === 'failed') && prev.phSampledAt != null) {
            take({
                phSampledAt: prev.phSampledAt,
                phValue: next.phValue == null ? prev.phValue : next.phValue,
            });
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

function payloadSessionId(...sources) {
    for (const src of sources) {
        const bag = src && src.sectionOutcomes;
        if (!bag || typeof bag !== 'object' || Array.isArray(bag)) continue;
        if (typeof bag.sessionId === 'string' && bag.sessionId) return bag.sessionId;
        for (const rec of Object.values(bag)) {
            if (rec && typeof rec === 'object' && typeof rec.sessionId === 'string' && rec.sessionId) {
                return rec.sessionId;
            }
        }
    }
    return null;
}

function realisticFarmingHasData(rf) {
    if (!rf || typeof rf !== 'object') return false;
    if (rf.presence && rf.presence.enabled === true) return true;
    return Object.keys(rf).some((key) => rfBlockActive(rf[key]));
}

/** Only observed current blocks may supersede a retained RF reading. */
function currentRfBlocks(payload) {
    const rf = payload && payload.realisticFarming;
    if (!rf || typeof rf !== 'object') return {};
    const record = outcomeRecord(payload, 'realisticFarming');
    const staleStates = ['failed', 'pending', 'unavailable', 'held'];
    const sectionFailed = record && (staleStates.includes(record.readState) || record.outcome === 'failed');
    return Object.fromEntries(Object.entries(rf).filter(([, block]) =>
        rfBlockTerminal(block) || (!sectionFailed && rfBlockActive(block) && !staleStates.includes(block.readState))
    ));
}

/** Final RF provenance for every retained-return path; never invent a sample time. */
function stampRetainedRf(payload, previous, current) {
    if (current && !sameRetentionScope(previous, current)) {
        return admitRfState(dropCrossScopeRfDetails(payload, current), current);
    }
    const authoritative = currentRfBlocks(current);
    const hasCurrent = Object.keys(authoritative).length > 0;
    const out = admitRfState(hasCurrent ? {
        ...payload,
        realisticFarming: { ...(payload.realisticFarming || {}), ...cloneMerged(authoritative) },
    } : payload, current);
    const heldKeys = Object.keys(out.realisticFarming || {}).filter(key =>
        rfBlockActive(out.realisticFarming[key]) && !Object.prototype.hasOwnProperty.call(authoritative, key)
    );
    if (heldKeys.length === 0 && !hasCurrent) return out;
    const outcomes = { ...(out.sectionOutcomes || {}) };
    if (heldKeys.length > 0) {
        const original = outcomeRecord(previous, 'realisticFarming') || {};
        outcomes.realisticFarming = {
            ...original,
            readState: 'held',
            outcome: 'partial',
            sampledAt: original.sampledAt ?? null,
            sessionId: payloadSessionId(current, previous, payload),
            reason: 'last-good',
        };
    } else {
        const observed = outcomeRecord(current, 'realisticFarming');
        if (observed) outcomes.realisticFarming = cloneMerged(observed);
        else delete outcomes.realisticFarming; // Old provenance cannot describe a new reading.
    }
    return { ...out, sectionOutcomes: outcomes };
}

/** Keep Soil Fertilizer / Crop Stress (and other RF blocks) when a shutdown stub sets enabled:false. */
function mergeRealisticFarmingForward(prevRf, nextRf) {
    const prev = prevRf && typeof prevRf === 'object' ? prevRf : null;
    if (!prev) return nextRf;
    const next = nextRf && typeof nextRf === 'object' ? { ...nextRf } : {};
    let changed = false;
    for (const key of Object.keys(prev)) {
        if (rfBlockTerminal(next[key])) continue;
        if (rfBlockTerminal(prev[key]) && (!next[key] || next[key].enabled !== true || ["failed", "pending", "unavailable"].includes(next[key].readState))) {
            next[key] = cloneMerged(prev[key]);
            changed = true;
            continue;
        }
        if (rfBlockActive(prev[key]) && (!rfBlockActive(next[key]) || ["failed", "pending", "unavailable"].includes(next[key].readState))) {
            next[key] = cloneMerged(prev[key]);
            changed = true;
        }
    }
    return changed ? next : nextRf;
}

function withTerminalRfBlocks(rf, terminal) {
    const keys = Object.keys(terminal);
    if (keys.length === 0) return rf;
    const out = rf && typeof rf === 'object' ? { ...rf } : {};
    for (const key of keys) out[key] = cloneMerged(terminal[key]);
    return out;
}

/** Remove terminal RF blocks, and their per-field soil, from every retained copy. */
function clearTerminalRfFromState(state, terminal) {
    const keys = Object.keys(terminal);
    if (!state || keys.length === 0) return;
    const soil = terminal.soilFertilizer;
    if (soil && state.fieldLiveCache) {
        for (const [id, row] of Object.entries(state.fieldLiveCache)) {
            state.fieldLiveCache[id] = stripFieldSoil([row], soil)[0];
        }
    }
    const backup = state.liveSectionBackup;
    if (backup && backup.realisticFarming && typeof backup.realisticFarming === 'object') {
        backup.realisticFarming = withTerminalRfBlocks(backup.realisticFarming, terminal);
    }
    if (backup && soil && Array.isArray(backup.fields)) {
        backup.fields = stripFieldSoil(backup.fields, soil);
    }
    for (const snap of [state.lastGoodMergedSnapshot, state.mergedData]) {
        if (!snap || typeof snap !== 'object') continue;
        if (snap.realisticFarming && typeof snap.realisticFarming === 'object') {
            snap.realisticFarming = withTerminalRfBlocks(snap.realisticFarming, terminal);
        }
        if (soil && Array.isArray(snap.fields)) snap.fields = stripFieldSoil(snap.fields, soil);
    }
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
    if (!sameRetentionScope(prev, next)) return admitRfState(next);
    let out = next;
    if (Array.isArray(out.fields)) {
        const mergedFields = mergeFieldsMoistureForward(prev.fields, out.fields);
        if (mergedFields !== out.fields) out = { ...out, fields: mergedFields };
    }
    out = mergeWeatherMoistureForward(prev, out);
    out = mergeBaleMoistureForward(prev, out);
    out = mergeStockMoistureForward(prev, out);
    return admitRfState(out, next, prev);
}

/** True when data.json looks like a full in-game export (vs {} / minimal writes on FS exit). */
function isRichLuaExport(lua) {
    if (!lua || typeof lua !== 'object') return false;
    // Shutdown stubs still have many empty keys (gameTime, collectorModules, leftover money, …).
    // Count fleet / field / livestock rows, not key cardinality or finance.
    // Field rows with only farmlandId (no hectares) are NOT rich — that is a staggered/shutdown
    // stub that used to overwrite the last-good snapshot and blank the Fields screen offline.
    if (toArr(lua.vehicles).length > 0) return true;
    if (toArr(lua.animals).length > 0) return true;
    const fields = toArr(lua.fields);
    if (fields.some((f) => f && Number(f.hectares) > 0)) {
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

function stampHeldSnapshot(merged, state, extra = {}, current = null) {
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
    return stampRetainedRf(out, merged, current);
}

/** Ignore sparse startup/shutdown writes unless they declare a terminal result. */
function exportDeclaresTerminal(payload) {
    if (Object.keys(terminalRfBlocks(payload)).length > 0) return true;
    const bag = payload && payload.sectionOutcomes;
    if (!bag || typeof bag !== 'object' || Array.isArray(bag)) return false;
    return ['animals', 'fields', 'production', 'stock'].some((name) => {
        const rec = bag[name];
        return !!(rec && (rec.outcome === 'empty' || rec.outcome === 'zero' || rec.outcome === 'disabled'));
    });
}

function shouldIgnoreMinimalLuaExport(luaPayload, state, transport) {
    if (!state || isRichLuaExport(luaPayload)) return false;
    const previous = state.lastGoodMergedSnapshot || state.mergedData || state.liveSectionBackup;
    if (previous && !sameRetentionScope(previous, luaPayload)) return false;
    // A minimal export is not merged, but its explicit provider disable still retires held copies.
    clearTerminalRfFromState(state, terminalRfBlocks(luaPayload));
    if (exportDeclaresTerminal(luaPayload)) return false;
    if (Object.values(currentRfBlocks(luaPayload)).some(rfBlockActive)) return false;
    if (!previous) {
        const committed = transport && transport.legacy === false && transport.ingressStatus === 'valid'
            && Number.isSafeInteger(transport.exportGeneration) && transport.exportGeneration > 0;
        const gameplay = luaPayload && luaPayload.exportClass === 'gameplay'
            && Number(luaPayload.exportGeneration) === transport?.exportGeneration;
        const legacyEmpty = luaPayload && luaPayload.exportClass == null
            && typeof luaPayload.serverInfo?.mapName === 'string' && luaPayload.serverInfo.mapName.trim() !== ''
            && typeof luaPayload.mapTitle === 'string' && luaPayload.mapTitle.trim() !== ''
            && Array.isArray(luaPayload.fields) && Array.isArray(luaPayload.vehicles);
        return !(committed && (gameplay || legacyEmpty));
    }
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

function finiteSampleTime(value) {
    if (value == null || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function outcomeRecord(payload, name) {
    const bag = payload && payload.sectionOutcomes;
    const rec = bag && bag[name];
    if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return null;
    return rec;
}

/** Copy section read state onto a plain object so JSON.stringify keeps it. Array properties do not survive. */
function liftSectionOutcomes(payload) {
    if (!payload || typeof payload !== 'object') return payload;
    if (!payload.sectionOutcomes || typeof payload.sectionOutcomes !== 'object' || Array.isArray(payload.sectionOutcomes)) {
        payload.sectionOutcomes = {};
    }
    const specs = [
        ['animals', animalsSectionEmpty],
        ['production', productionLooksEmpty],
        ['stock', stockSectionEmpty],
        ['fields', fieldsSectionDegraded],
    ];
    for (const [name, emptyFn] of specs) {
        const existing = payload.sectionOutcomes[name];
        if (existing && existing.outcome && existing.outcome !== 'unknown') continue;
        const section = payload[name];
        const readState = section && section.readState != null ? String(section.readState) : null;
        const coverage = section && section.coverage != null ? String(section.coverage) : null;
        const enabled = section && section.enabled;
        let outcome = 'unknown';
        if (section == null) continue;
        if (enabled === false && (readState === 'ok' || coverage === 'complete')) outcome = 'disabled';
        else if (enabled === false) continue;
        else if (readState === 'failed') outcome = 'failed';
        else if (readState === 'pending' || readState === 'partial' || coverage === 'partial') outcome = 'partial';
        else if (readState === 'ok' && coverage === 'complete') {
            if (name === 'stock' && stockMeasuredZero(section)) outcome = 'zero';
            else if (emptyFn(section)) outcome = 'empty';
            else outcome = 'ok';
        }
        if (outcome === 'unknown') continue;
        payload.sectionOutcomes[name] = {
            outcome,
            readState,
            coverage,
            provider: (section && section.provider) || (existing && existing.provider) || null,
            sampledAt: finiteSampleTime(section && section.sampledAt),
            sessionId: (section && (section.sessionId || section.sourceSessionId)) || null,
        };
    }
    return payload;
}

function terminalKind(payload, name) {
    const rec = outcomeRecord(payload, name);
    if (!rec) return null;
    if (rec.outcome === 'empty' || rec.outcome === 'zero' || rec.outcome === 'disabled') return rec.outcome;
    return null;
}

function copyTerminal(from, to, name) {
    if (!from || !to) return;
    liftSectionOutcomes(from);
    liftSectionOutcomes(to);
    if (terminalKind(from, name) && !terminalKind(to, name)) {
        to.sectionOutcomes[name] = { ...from.sectionOutcomes[name] };
        to[name] = cloneMerged(from[name]);
    }
}

/** A current empty, zero, or disabled section removes that section from backup and last-good. */
function applyTerminalSection(state, payload, name, replacement) {
    liftSectionOutcomes(payload);
    if (!terminalKind(payload, name)) return false;
    if (state && state.liveSectionBackup) state.liveSectionBackup[name] = null;
    const rec = outcomeRecord(payload, name);
    payload[name] = replacement;
    for (const snap of [state && state.lastGoodMergedSnapshot, state && state.mergedData]) {
        if (!snap || snap === payload) continue;
        snap[name] = replacement;
        if (!snap.sectionOutcomes || typeof snap.sectionOutcomes !== 'object' || Array.isArray(snap.sectionOutcomes)) {
            snap.sectionOutcomes = {};
        }
        snap.sectionOutcomes[name] = { ...rec };
    }
    return true;
}

/** Remember last non-empty animals/production/fields so staggered writes cannot wipe sections. */
function updateLiveSectionBackup(state, merged, hydratedLua) {
    if (!state) return;
    resetIncompatibleRetention(state, hydratedLua || merged);
    state.liveSectionBackup = state.liveSectionBackup || {};
    state.liveSectionBackup.retentionIdentity = retentionIdentity(hydratedLua || merged);
    const sources = [merged, hydratedLua].filter(Boolean);
    for (const src of sources) liftSectionOutcomes(src);
    const anyTerminal = (name) => sources.some((src) => terminalKind(src, name));
    const rfTerminal = terminalRfBlocks(hydratedLua, merged, state.liveSectionBackup);
    clearTerminalRfFromState(state, rfTerminal);
    if (anyTerminal('animals')) state.liveSectionBackup.animals = null;
    if (anyTerminal('production')) state.liveSectionBackup.production = null;
    if (anyTerminal('stock')) state.liveSectionBackup.stock = null;
    if (anyTerminal('fields')) state.liveSectionBackup.fields = null;
    for (const src of sources) {
        if (anyTerminal('animals')) break;
        if (!animalsSectionEmpty(src.animals)) {
            state.liveSectionBackup.animals = cloneMerged(toArr(src.animals));
            break;
        }
    }
    for (const src of sources) {
        if (anyTerminal('production')) break;
        if (!productionLooksEmpty(src.production)) {
            state.liveSectionBackup.production = cloneMerged(src.production);
            break;
        }
    }
    for (const src of sources) {
        if (anyTerminal('fields')) break;
        if (!fieldsSectionDegraded(src.fields)) {
            const nextFields = cloneMerged(toArr(src.fields));
            const prevFields = state.liveSectionBackup.fields;
            const merged = prevFields
                ? mergeFieldsMoistureForward(prevFields, nextFields, { dropSoil: !!rfTerminal.soilFertilizer })
                : nextFields;
            state.liveSectionBackup.fields = rfTerminal.soilFertilizer
                ? stripFieldSoil(merged, rfTerminal.soilFertilizer)
                : merged;
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
        if (anyTerminal('stock')) break;
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
            state.liveSectionBackup.realisticFarming = withTerminalRfBlocks(
                cloneMerged(src.realisticFarming),
                rfTerminal
            );
            state.liveSectionBackup.realisticFarmingSessionId = payloadSessionId(...sources);
            break;
        }
    }
}

/**
 * After merge: if live Lua is minimal/shutdown, keep last full merged snapshot instead of empty UI.
 * Also hold when the merge still looks "rich" (vehicles) but fields lost hectares — that is the
 * offline / mid-stagger case where Fields went blank until the player loaded the save again.
 */
function applyMergedSnapshotIfStaleExport(merged, luaPayload, state) {
    if (!merged || !state) return merged;

    if (resetIncompatibleRetention(state, luaPayload || merged)) {
        merged = dropCrossScopeRfDetails(merged, luaPayload || merged);
    }
    const snap = pickSnapshotSource(state);
    if (!snap || !isRenderableMerged(snap)) return admitRfState(merged, luaPayload);

    const fieldsNeedHold =
        fieldsSectionDegraded(merged.fields) && !fieldsSectionDegraded(snap.fields);
    if (isRichLuaExport(luaPayload) && !fieldsNeedHold) return merged;

    // XML still has field/vehicle rows after quit, so a content-score compare used to
    // keep the shutdown rebuild (2 km mapBounds, no soil). Always prefer the last in-game snapshot.
    const held = admitRfState(stampHeldSnapshot(snap, state, {}, luaPayload), luaPayload, merged);
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
    if (resetIncompatibleRetention(state, rawLuaData || hydratedLuaData || merged)) {
        merged = dropCrossScopeRfDetails(merged, rawLuaData || hydratedLuaData || merged);
    }
    copyTerminal(rawLuaData, merged, 'animals');
    copyTerminal(hydratedLuaData, merged, 'animals');
    copyTerminal(rawLuaData, merged, 'production');
    copyTerminal(hydratedLuaData, merged, 'production');
    copyTerminal(rawLuaData, merged, 'stock');
    copyTerminal(hydratedLuaData, merged, 'stock');
    copyTerminal(rawLuaData, merged, 'fields');
    copyTerminal(hydratedLuaData, merged, 'fields');
    const animalsTerminal = applyTerminalSection(state, merged, 'animals', []);
    const productionTerminal = applyTerminalSection(state, merged, 'production', { chains: [], husbandryTotals: {} });
    const stockTerminal = terminalKind(merged, 'stock');
    if (stockTerminal) {
        applyTerminalSection(state, merged, 'stock', cloneMerged(merged.stock));
    }
    const fieldsTerminal = applyTerminalSection(state, merged, 'fields', []);
    const rfTerminal = terminalRfBlocks(rawLuaData, hydratedLuaData, merged, state.liveSectionBackup, state.lastGoodMergedSnapshot);
    clearTerminalRfFromState(state, rfTerminal);
    const soilTerminal = rfTerminal.soilFertilizer || null;
    const currentSession = payloadSessionId(rawLuaData, hydratedLuaData, merged);
    const rfHoldSession = state.liveSectionBackup && state.liveSectionBackup.realisticFarmingSessionId;
    const rfCrossSession = !!(currentSession && rfHoldSession && currentSession !== rfHoldSession);
    const snap = pickSnapshotSource(state);

    let out = merged;
    let held = false;
    let rfHeld = false;

    const luaAnimOmitted = !rawLuaData || luaSectionOmitted(rawLuaData.animals);
    const holdAnimals = pickAnimalsHoldSource(state, snap);
    if (!animalsTerminal && animalsSectionEmpty(out.animals) && holdAnimals && luaAnimOmitted) {
        out = { ...out, animals: cloneMerged(holdAnimals) };
        held = true;
    }

    const luaProdOmitted = !rawLuaData || luaSectionOmitted(rawLuaData.production);
    const holdProduction = pickProductionHoldSource(state, snap);
    if (!productionTerminal && productionLooksEmpty(out.production) && holdProduction && luaProdOmitted) {
        out = { ...out, production: cloneMerged(holdProduction) };
        held = true;
    }

    // Fields: hold last full rows (with hectares/PF) when live Lua stopped exporting field data.
    // Prefer hold whenever the merged payload lost hectares — do not require luaFieldsDegraded.
    // (A "rich" vehicle-only export used to skip this and wipe Fields until the next in-game cycle.)
    const backupFields = state.liveSectionBackup && state.liveSectionBackup.fields;
    const holdFields =
        (backupFields && !fieldsSectionDegraded(backupFields) && backupFields) ||
        (snap && !fieldsSectionDegraded(snap.fields) && snap.fields) ||
        null;
    if (!fieldsTerminal && fieldsSectionDegraded(out.fields) && holdFields) {
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
    if (!stockTerminal && stockSectionEmpty(out.stock) && holdStock && luaStockEmpty) {
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
    const holdRf = rfCrossSession ? null : pickRealisticFarmingHoldSource(state, snap);
    if (realisticFarmingSectionEmpty(out.realisticFarming) && holdRf && luaRfEmpty) {
        out = { ...out, realisticFarming: cloneMerged(holdRf) };
        held = true;
        rfHeld = true;
    } else if (holdRf) {
        const mergedRf = mergeRealisticFarmingForward(holdRf, out.realisticFarming);
        if (mergedRf !== out.realisticFarming) {
            out = { ...out, realisticFarming: mergedRf };
            held = true;
            rfHeld = true;
        }
    }
    if (Object.keys(rfTerminal).length > 0) {
        out = { ...out, realisticFarming: withTerminalRfBlocks(out.realisticFarming, rfTerminal) };
    }

    if (Array.isArray(out.fields) && holdFields) {
        const mergedMoist = mergeFieldsMoistureForward(holdFields, out.fields, {
            dropSoil: !!soilTerminal || rfCrossSession,
        });
        if (mergedMoist !== out.fields) {
            out = { ...out, fields: mergedMoist };
            held = true;
        }
    }
    if (soilTerminal && Array.isArray(out.fields)) {
        out = { ...out, fields: stripFieldSoil(out.fields, soilTerminal) };
    }

    const boundSrc = snap || (state.liveSectionBackup && state.liveSectionBackup.mapBounds ? state.liveSectionBackup : null);
    if (boundSrc) {
        const withBounds = mergeMapBoundsForward(boundSrc, out);
        if (withBounds !== out) {
            out = withBounds;
            held = true;
        }
    }

    const stamped = {
        ...out,
        sectionOutcomes: out.sectionOutcomes,
        dataTimestamps: {
            ...(out.dataTimestamps || {}),
            ...(held ? { liveSectionsHeldAt: new Date().toISOString() } : {}),
            sectionAge: state.sectionAge || (out.dataTimestamps && out.dataTimestamps.sectionAge) || 'unknown',
        },
    };
    if (!held) {
        out.dataTimestamps = stamped.dataTimestamps;
        return out;
    }
    return rfHeld ? stampRetainedRf(stamped, snap, rawLuaData || hydratedLuaData) : stamped;
}

function providerDisabled(section) {
    return !!(section && typeof section === 'object' && section.enabled === false);
}

function authoritativeEmpty(section, isEmpty) {
    if (!section || typeof section !== 'object') return false;
    if (section.enabled === false) return false;
    if (section.readState !== 'ok' || section.coverage !== 'complete') return false;
    return isEmpty(section);
}

function stockMeasuredZero(stock) {
    if (!stock || stock.enabled === false || stock.readState !== 'ok' || stock.coverage !== 'complete') return false;
    if (!stock.byFarm || typeof stock.byFarm !== 'object') return false;
    const farms = Object.values(stock.byFarm);
    if (farms.length === 0) return false;
    return farms.every((farm) => {
        const items = toArr(farm && farm.items);
        return items.length > 0 && items.every((item) => Number(item && item.totalLiters) === 0);
    });
}

function mergeSnapshotSectionsForward(prev, next) {
    if (!prev || !next) return next;
    if (!sameRetentionScope(prev, next)) return admitRfState(next);
    liftSectionOutcomes(next);
    const rfTerminal = terminalRfBlocks(next, prev);
    const dropSoil = !!rfTerminal.soilFertilizer;
    let out = next;
    if (!terminalKind(out, 'animals')
        && animalsSectionEmpty(out.animals) && !animalsSectionEmpty(prev.animals)) {
        out = { ...out, animals: cloneMerged(prev.animals) };
    }
    if (!terminalKind(out, 'production')
        && productionLooksEmpty(out.production) && !productionLooksEmpty(prev.production)) {
        out = { ...out, production: cloneMerged(prev.production) };
    }
    if (!terminalKind(out, 'fields') && fieldsSectionDegraded(out.fields) && !fieldsSectionDegraded(prev.fields)) {
        out = { ...out, fields: cloneMerged(toArr(prev.fields)) };
    } else if (!terminalKind(out, 'fields') && Array.isArray(out.fields) && Array.isArray(prev.fields)) {
        const mergedFields = mergeFieldsMoistureForward(prev.fields, out.fields, { dropSoil });
        if (mergedFields !== out.fields) out = { ...out, fields: mergedFields };
    }
    out = mergeWeatherMoistureForward(prev, out);
    out = mergeBaleMoistureForward(prev, out);
    out = mergeStockMoistureForward(prev, out);
    if (!terminalKind(out, 'stock')
        && stockSectionEmpty(out.stock) && stockHasData(prev.stock)) {
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
    if (Object.keys(rfTerminal).length > 0) {
        out = { ...out, realisticFarming: withTerminalRfBlocks(out.realisticFarming, rfTerminal) };
        if (dropSoil && Array.isArray(out.fields)) {
            out = { ...out, fields: stripFieldSoil(out.fields, rfTerminal.soilFertilizer) };
        }
    }
    out = mergeMapBoundsForward(prev, out);
    return out;
}

function updateLastGoodMergedSnapshot(state, merged, luaPayload) {
    if (!state || !merged || !isRenderableMerged(merged)) return;
    resetIncompatibleRetention(state, luaPayload || merged);
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
    liftSectionOutcomes(out);
    if (!terminalKind(out, 'animals') && animalsSectionEmpty(out.animals)) {
        const holdAnimals = pickAnimalsHoldSource(state, snap);
        if (holdAnimals) out = { ...out, animals: cloneMerged(holdAnimals) };
    }
    if (!terminalKind(out, 'production') && productionLooksEmpty(out.production)) {
        const holdProduction = pickProductionHoldSource(state, snap);
        if (holdProduction) out = { ...out, production: cloneMerged(holdProduction) };
    }
    if (!terminalKind(out, 'fields') && fieldsSectionDegraded(out.fields)) {
        const backupFields = state.liveSectionBackup && state.liveSectionBackup.fields;
        const holdFields =
            (backupFields && !fieldsSectionDegraded(backupFields) && backupFields) ||
            (snap && !fieldsSectionDegraded(snap.fields) && snap.fields) ||
            null;
        if (holdFields) out = { ...out, fields: cloneMerged(toArr(holdFields)) };
    }
    if (!terminalKind(out, 'stock') && stockSectionEmpty(out.stock)) {
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
    createMergeRebuildGate,
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
    liftSectionOutcomes,
    terminalKind,
};
