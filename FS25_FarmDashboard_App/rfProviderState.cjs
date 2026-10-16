'use strict';

// A deliberately disabled provider is different from a shutdown/failed sample.
const TERMINAL_REASONS = new Set(['pf-conflict', 'settings-disabled', 'mod-absent', 'provider-removed']);
function rfBlockTerminal(block) {
    if (!block || typeof block !== 'object') return false;
    return block.pfConflict === true || (block.enabled === false && (
        block.modLoaded === false || TERMINAL_REASONS.has(String(block.reason || '')) ||
        block.readState === 'disabled' || block.outcome === 'disabled'
    ));
}
function terminalRfBlocks(...sources) {
    const blocks = {};
    const seen = new Set();
    for (const src of sources) {
        const rf = src && src.realisticFarming;
        if (!rf || typeof rf !== 'object') continue;
        for (const [key, block] of Object.entries(rf)) {
            if (seen.has(key) || !block || typeof block !== 'object') continue;
            if (rfBlockTerminal(block)) {
                blocks[key] = { ...block, enabled: false };
                seen.add(key);
            } else if (block.enabled === true && !['failed', 'pending', 'unavailable'].includes(block.readState)) {
                seen.add(key); // A successful current re-enable supersedes an old tombstone.
            }
        }
    }
    return blocks;
}
function stripFieldSoil(fields, soil) {
    if (!Array.isArray(fields)) return fields;
    return fields.map(field => !field || !field.soilFertilizer ? field : {
        ...field,
        soilFertilizer: { enabled: false, pfConflict: soil.pfConflict === true, reason: soil.reason || null },
    });
}
function admitRfState(payload, ...sources) {
    if (!payload || typeof payload !== 'object') return payload;
    const terminal = terminalRfBlocks(...sources, payload);
    if (Object.keys(terminal).length === 0) return payload;
    return {
        ...payload,
        realisticFarming: { ...(payload.realisticFarming || {}), ...terminal },
        ...(terminal.soilFertilizer ? { fields: stripFieldSoil(payload.fields, terminal.soilFertilizer) } : {}),
    };
}
function retentionIdentity(payload) {
    const p = payload || {}, si = p.serverInfo || {}, bag = p.sectionOutcomes || {};
    const first = (...values) => values.find(v => v !== undefined && v !== null && v !== '') ?? null;
    const sectionSession = Object.values(bag).find(v => v && typeof v === 'object' && v.sessionId)?.sessionId;
    return {
        source: first(p.sourceId, si.sourceId, p.activeSourceId),
        career: first(bag.careerId, p.careerId, si.careerId),
        session: first(bag.sessionId, p.sessionId, si.sessionId, sectionSession),
        map: first(p.mapId, si.mapId),
        slot: first(p.saveSlot, si.saveSlot),
        farm: first(p.farmId, si.farmId, bag.farmId),
    };
}
function sameRetentionScope(previous, current) {
    const a = previous?.retentionIdentity || retentionIdentity(previous);
    const b = current?.retentionIdentity || retentionIdentity(current);
    return Object.keys(a).every(k => a[k] == null || b[k] == null || String(a[k]) === String(b[k]));
}
module.exports = { rfBlockTerminal, terminalRfBlocks, stripFieldSoil, admitRfState, retentionIdentity, sameRetentionScope };
