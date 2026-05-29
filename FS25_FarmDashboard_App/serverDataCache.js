// FS25 FarmDashboard | serverDataCache.js
// Persists last merged dashboard JSON + per-field live fingerprints when the game/server is paused
// or FTP/Lua stops updating, so the UI can show last-known-good state with timestamps.

const fs = require('fs');
const path = require('path');

const MAX_HISTORY_PER_FIELD = 15;

/** Bump when on-disk cache shape changes (apiStorage.js exports the same string for UI). */
const CACHE_SCHEMA_VERSION = '1.0';

function cacheDir(userData) {
    return path.join(userData, 'serverLiveCache');
}

function cachePath(userData, serverId) {
    return path.join(cacheDir(userData), `${String(serverId).replace(/[^a-zA-Z0-9._-]/g, '_')}.json`);
}

function loadServerCache(userData, serverId) {
    try {
        const p = cachePath(userData, serverId);
        if (!fs.existsSync(p)) return null;
        const raw = fs.readFileSync(p, 'utf8');
        const data = JSON.parse(raw);
        if (!data || typeof data !== 'object') {
            return null;
        }
        // Current format
        if (data._schemaVersion === CACHE_SCHEMA_VERSION) {
            return data;
        }
        // Pre-1.0 files: no _schemaVersion but same payload shape — hydrate then rewrite on next save
        if (data.mergedSnapshot != null && typeof data.mergedSnapshot === 'object') {
            return data;
        }
        return null;
    } catch (e) {
        console.warn('[serverDataCache] load failed', serverId, e.message);
        return null;
    }
}

function saveServerCache(userData, serverId, record) {
    try {
        const dir = cacheDir(userData);
        fs.mkdirSync(dir, { recursive: true });
        const p = cachePath(userData, serverId);
        const out = { ...record, _schemaVersion: CACHE_SCHEMA_VERSION };
        fs.writeFileSync(p, JSON.stringify(out), 'utf8');
    } catch (e) {
        console.warn('[serverDataCache] save failed', serverId, e.message);
    }
}

/**
 * Append one snapshot per field when values change; trim to MAX_HISTORY_PER_FIELD.
 * @param {Record<string, Array>} prevHistory
 * @param {Record<string, object>} fingerprints farmlandId -> snapshot
 */
function appendFieldHistory(prevHistory, fingerprints) {
    const hist =
        prevHistory && typeof prevHistory === 'object' ? JSON.parse(JSON.stringify(prevHistory)) : {};
    for (const [id, fp] of Object.entries(fingerprints || {})) {
        const key = String(id);
        const arr = Array.isArray(hist[key]) ? hist[key].slice() : [];
        const entry = {
            at: fp.at,
            growthLabel: fp.growthLabel,
            growthState: fp.growthState,
            fruitType: fp.fruitType,
        };
        const last = arr[arr.length - 1];
        if (
            last &&
            last.growthLabel === entry.growthLabel &&
            last.growthState === entry.growthState &&
            String(last.fruitType || '') === String(entry.fruitType || '')
        ) {
            continue;
        }
        arr.push(entry);
        while (arr.length > MAX_HISTORY_PER_FIELD) arr.shift();
        hist[key] = arr;
    }
    return hist;
}

module.exports = {
    loadServerCache,
    saveServerCache,
    appendFieldHistory,
    MAX_HISTORY_PER_FIELD,
    CACHE_SCHEMA_VERSION,
};
