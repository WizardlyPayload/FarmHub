// FS25 FarmDashboard | detailAnimalsHydrate.js
// Merges per-pen `details/animals_*.json` (full RL individuals) into the `animals` array
// from data.json so the dashboard / realtime-connector can render one row per animal
// (same as when the mod inlined animals in the main file).

const fs = require('fs');
const path = require('path');

const fileCache = new Map(); // absPath -> { mtimeMs, size, animals, ownerFarmId, placeableId, penId }

function toArr(val) {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    if (typeof val === 'object') return Object.values(val);
    return [];
}

function getLocalDetailsDirForServer(srv, getLocalLuaJsonPath) {
    if (typeof getLocalLuaJsonPath !== 'function' || !srv) return null;
    const jsonPath = getLocalLuaJsonPath(srv);
    if (!jsonPath) return null;
    return path.join(path.dirname(jsonPath), 'details');
}

/** FTP: cached copies of host `details/animals_*.json` under userData (synced by pollFtp). */
function getFtpCachedDetailsDir(srv, userDataPath, serverState) {
    if (!srv || !userDataPath) return null;
    const folderName =
        (serverState && serverState.lastSaveSlot) ||
        srv.localSubFolder ||
        'savegame1';
    return path.join(userDataPath, 'ftpDetailsCache', String(srv.id), folderName, 'details');
}

function getDetailsDirForHydration(srv, getLocalLuaJsonPath, options = {}) {
    const mode = String(srv.mode || '').toLowerCase();
    if (mode === 'local') {
        return getLocalDetailsDirForServer(srv, getLocalLuaJsonPath);
    }
    if (mode === 'ftp') {
        return getFtpCachedDetailsDir(srv, options.userDataPath, options.serverState);
    }
    return null;
}

/**
 * Read and cache one detail file. Returns { animals, placeableId, ownerFarmId, penId } or null.
 */
function readDetailFileCached(absPath) {
    let st;
    try {
        st = fs.statSync(absPath);
    } catch (_) {
        return null;
    }
    const prev = fileCache.get(absPath);
    if (prev && prev.mtimeMs === st.mtimeMs && prev.size === st.size) {
        return prev;
    }
    let raw;
    try {
        raw = fs.readFileSync(absPath, 'utf8');
    } catch (_) {
        return null;
    }
    let doc;
    try {
        doc = JSON.parse(raw);
    } catch (_) {
        return null;
    }
    const animals = Array.isArray(doc.animals) ? doc.animals : null;
    if (!animals || animals.length === 0) {
        return null;
    }
    const entry = {
        mtimeMs: st.mtimeMs,
        size: st.size,
        animals,
        placeableId: doc.placeableId != null ? Number(doc.placeableId) : null,
        ownerFarmId: doc.ownerFarmId != null ? Number(doc.ownerFarmId) : 0,
        penId: doc.penId,
    };
    fileCache.set(absPath, entry);
    return entry;
}

/**
 * For each husbandry row in lua `animals`, if a detail file exists for the same placeable `id`,
 * replace `husbandry.animals` with the full individual list from disk.
 */
function hydrateLuaDataAnimalsFromDetails(luaData, srv, getLocalLuaJsonPath, options = {}) {
    if (!luaData || typeof luaData !== 'object' || !srv) return luaData;
    const mode = String(srv.mode || '').toLowerCase();
    if (mode !== 'local' && mode !== 'ftp') return luaData;

    const detailsDir = getDetailsDirForHydration(srv, getLocalLuaJsonPath, options);
    if (!detailsDir || !fs.existsSync(detailsDir)) return luaData;

    let names;
    try {
        names = fs.readdirSync(detailsDir);
    } catch (_) {
        return luaData;
    }

    const byPlaceable = new Map();
    for (const fname of names) {
        if (!fname.startsWith('animals_') || !fname.endsWith('.json')) continue;
        const full = path.join(detailsDir, fname);
        const entry = readDetailFileCached(full);
        if (!entry || !entry.animals) continue;
        const pid = entry.placeableId;
        if (pid == null || !Number.isFinite(pid)) continue;
        byPlaceable.set(pid, entry);
    }

    if (byPlaceable.size === 0) return luaData;

    const arr = toArr(luaData.animals);
    let hydratedPens = 0;
    let totalHeads = 0;

    const out = arr.map((h) => {
        if (!h || typeof h !== 'object') return h;
        const hid = Number(h.id);
        if (!Number.isFinite(hid)) return h;
        const block = byPlaceable.get(hid);
        if (!block) return h;

        const hf = Number(h.ownerFarmId ?? h.farmId ?? 0);
        if (block.ownerFarmId && hf && block.ownerFarmId !== hf) return h;

        hydratedPens += 1;
        totalHeads += block.animals.length;

        return {
            ...h,
            animals: block.animals,
            lod: 'full',
            animalCount: block.animals.length,
            numOfAnimalsReported: block.animals.length,
            __detailHydrated: true,
        };
    });

    if (hydratedPens > 0) {
        console.log(
            `[DetailHydrate] +${totalHeads} animals across ${hydratedPens} pens from ${detailsDir}`
        );
    }

    return { ...luaData, animals: out };
}

module.exports = {
    hydrateLuaDataAnimalsFromDetails,
    getLocalDetailsDirForServer,
    getFtpCachedDetailsDir,
    getDetailsDirForHydration,
};
