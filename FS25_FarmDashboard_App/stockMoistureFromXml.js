// Enrich silo stock rows from savegame MoistureSystem.xml when live Lua export omits per-crop moisture.

const SILO_KINDS = new Set(['silo', 'siloExtension']);

function toArr(v) {
    if (v == null) return [];
    return Array.isArray(v) ? v : [v];
}

function roundMoisturePct(raw) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    return Math.round(n * 1000) / 10;
}

function roundQualityPct(raw) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    return Math.round(n);
}

/**
 * @param {string|null|undefined} xmlStr
 * @returns {{ byObjectUid: Record<string, Record<string, { moisturePct: number|null, qualityPct: number|null }>> }}
 */
function parseMoistureSystemXml(xmlStr) {
    const byObjectUid = {};
    if (!xmlStr || typeof xmlStr !== 'string') return { byObjectUid };

    const reObject = /<object\b([^>]*)>([\s\S]*?)<\/object>/gi;
    const reFill = /<fillType\b([^/]*)\/>/gi;
    let objMatch;
    while ((objMatch = reObject.exec(xmlStr)) !== null) {
        const objAttrs = objMatch[1] || '';
        const body = objMatch[2] || '';
        const uidMatch = /\buniqueId="([^"]+)"/i.exec(objAttrs);
        const uid = uidMatch ? String(uidMatch[1]) : '';
        if (!uid) continue;
        const bucket = {};
        let ftMatch;
        while ((ftMatch = reFill.exec(body)) !== null) {
            const attrs = ftMatch[1] || '';
            const nameMatch = /\bname="([^"]+)"/i.exec(attrs);
            const name = nameMatch ? String(nameMatch[1]).trim() : '';
            if (!name) continue;
            const moistureMatch = /\bmoisture="([^"]+)"/i.exec(attrs);
            const qualityMatch = /\bquality="([^"]+)"/i.exec(attrs);
            bucket[name] = {
                moisturePct: moistureMatch ? roundMoisturePct(moistureMatch[1]) : null,
                qualityPct: qualityMatch ? roundQualityPct(qualityMatch[1]) : null,
            };
        }
        if (Object.keys(bucket).length > 0) byObjectUid[uid] = bucket;
    }
    return { byObjectUid };
}

function buildUidCandidatesByFillType(placeables) {
    const out = new Map();
    for (const pl of placeables || []) {
        const uid = String(pl.uniqueId || '').trim();
        if (!uid) continue;
        for (const fillType of pl.siloFillTypes || []) {
            const key = String(fillType).trim();
            if (!key) continue;
            if (!out.has(key)) out.set(key, []);
            const list = out.get(key);
            if (!list.includes(uid)) list.push(uid);
        }
    }
    return out;
}

function pickMoistureUid(candidates, locName, placeables) {
    const list = Array.isArray(candidates) ? candidates.filter(Boolean) : [];
    if (list.length === 0) return null;
    if (list.length === 1) return list[0];

    const norm = String(locName || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    let bestUid = null;
    let bestScore = -1;
    for (const uid of list) {
        const pl = (placeables || []).find((p) => String(p.uniqueId) === String(uid));
        const filename = String(pl?.filename || '').toLowerCase();
        const customName = String(pl?.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
        let score = 0;
        if (norm && customName && (norm.includes(customName) || customName.includes(norm))) score += 4;
        if (norm && filename) {
            const slug = filename.replace(/[^a-z0-9]+/g, '');
            if (norm.includes(slug) || slug.includes(norm)) score += 3;
            if (norm.includes('nl16') && slug.includes('nl1622')) score += 5;
        }
        if (score > bestScore) {
            bestScore = score;
            bestUid = uid;
        }
    }
    return bestUid || list[0];
}

function resolveFillTypeName(item, catalog) {
    const raw = String(item?.fillType || '').trim();
    if (raw && !/^\d+$/.test(raw)) return raw.toUpperCase();
    const idx = Number(item?.fillTypeIndex);
    if (idx > 0 && catalog) {
        const fromCat = catalog[String(idx)] || catalog[idx];
        if (fromCat) return String(fromCat).trim().toUpperCase();
    }
    return raw ? raw.toUpperCase() : '';
}

function patchLocationFromXml(loc, fillTypeName, uid, byObjectUid) {
    if (!loc || !uid || !fillTypeName) return false;
    if (loc.moisturePct != null || loc.qualityPct != null || loc.grade) return false;
    const bucket = byObjectUid[uid];
    const row = bucket && bucket[fillTypeName];
    if (!row) return false;
    let patched = false;
    if (row.moisturePct != null) {
        loc.moisturePct = row.moisturePct;
        patched = true;
    }
    if (row.qualityPct != null) {
        loc.qualityPct = row.qualityPct;
        patched = true;
    }
    return patched;
}

/**
 * @param {object|null|undefined} stock
 * @param {{ byObjectUid?: Record<string, Record<string, { moisturePct?: number|null, qualityPct?: number|null }>> }|null|undefined} moistureData
 * @param {Array<{ uniqueId?: string, siloFillTypes?: string[], filename?: string, name?: string }>} placeables
 * @param {Record<string, string>} fillTypeCatalog
 */
function enrichStockMoistureFromXml(stock, moistureData, placeables, fillTypeCatalog) {
    if (!stock || typeof stock !== 'object') return stock;
    const byObjectUid = moistureData?.byObjectUid;
    if (!byObjectUid || typeof byObjectUid !== 'object' || Object.keys(byObjectUid).length === 0) {
        return stock;
    }

    const uidByFill = buildUidCandidatesByFillType(placeables);
    const out = { ...stock, byFarm: { ...(stock.byFarm || {}) } };
    let anyPatched = false;

    for (const [farmKey, farmRow] of Object.entries(stock.byFarm || {})) {
        if (!farmRow || !Array.isArray(farmRow.items)) continue;
        const items = farmRow.items.map((item) => {
            if (!item || !Array.isArray(item.locations)) return item;
            const fillTypeName = resolveFillTypeName(item, fillTypeCatalog);
            if (!fillTypeName) return item;
            const candidates = uidByFill.get(fillTypeName) || [];
            const locations = item.locations.map((loc) => {
                if (!loc || !SILO_KINDS.has(String(loc.kind || ''))) return loc;
                const uid = pickMoistureUid(candidates, loc.name, placeables);
                const nextLoc = { ...loc };
                if (patchLocationFromXml(nextLoc, fillTypeName, uid, byObjectUid)) {
                    anyPatched = true;
                    return nextLoc;
                }
                return loc;
            });
            return { ...item, locations };
        });
        out.byFarm[farmKey] = { ...farmRow, items };
    }

    return anyPatched ? out : stock;
}

module.exports = {
    parseMoistureSystemXml,
    enrichStockMoistureFromXml,
    buildUidCandidatesByFillType,
    pickMoistureUid,
};
