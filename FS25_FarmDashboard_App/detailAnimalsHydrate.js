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
        const resolvedFarm =
            hf > 0 ? hf : (block.ownerFarmId > 0 ? block.ownerFarmId : hf);
        if (block.ownerFarmId && hf && block.ownerFarmId !== hf) return h;

        const ownerFarmId = resolvedFarm > 0 ? resolvedFarm : block.ownerFarmId || hf;
        const animals = block.animals.map((a) => {
            const row = {
                ...a,
                ownerFarmId: a.ownerFarmId ?? a.farmId ?? ownerFarmId,
                farmId: a.farmId ?? a.ownerFarmId ?? ownerFarmId,
            };
            // Base-game detail rows describe a whole cluster via `count`; tag them so the
            // renderer's head-counting (which keys off __lodClusterAggregate/clusterCount)
            // counts every head, not one per group row.
            const grp = Number(a.count);
            if (Number.isFinite(grp) && grp > 1) {
                row.__lodClusterAggregate = true;
                row.clusterCount = grp;
            }
            return row;
        });

        // Heads actually captured in the detail file (cluster rows count their members).
        const capturedHeads = animals.reduce((sum, a) => {
            const c = Number(a.clusterCount);
            return sum + (a.__lodClusterAggregate && Number.isFinite(c) && c > 0 ? c : 1);
        }, 0);

        // What the aggregate (lod=agg) export already knows the pen holds: the engine's
        // getNumOfAnimals() (numOfAnimalsReported), the aggregate animalCount, and the
        // cluster bucket sum.
        const reported = Number(h.numOfAnimalsReported);
        const prevCount = Number(h.animalCount);
        let clusterSum = 0;
        if (Array.isArray(h.clusters)) {
            for (const c of h.clusters) {
                const cc = Number(c && c.count);
                if (Number.isFinite(cc) && cc > 0) clusterSum += cc;
            }
        }
        const aggregate = Math.max(
            Number.isFinite(reported) && reported > 0 ? reported : 0,
            Number.isFinite(prevCount) && prevCount > 0 ? prevCount : 0,
            clusterSum
        );

        // Guard: if the detail file holds FEWER heads than the aggregate already reports,
        // it is incomplete or cross-matched (RL multi-component barns can share a husbandry
        // id with a different component's detail file). Replacing the aggregate with it would
        // hide the rest of the herd, leaving the summary total > the rows shown. Keep the
        // aggregate so the connector fans the clusters out to the full pen instead.
        if (aggregate > 0 && capturedHeads < aggregate) {
            return h;
        }

        hydratedPens += 1;
        totalHeads += capturedHeads;

        return {
            ...h,
            ownerFarmId,
            farmId: ownerFarmId,
            animals,
            lod: 'full',
            animalCount: Math.max(
                capturedHeads,
                Number.isFinite(prevCount) && prevCount > 0 ? prevCount : 0
            ),
            numOfAnimalsReported:
                Number.isFinite(reported) && reported > 0 ? reported : capturedHeads,
            __detailHydrated: true,
            __detailCapturedHeads: capturedHeads,
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
