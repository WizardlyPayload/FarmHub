// FS25 FarmDashboard | detailAnimalsHydrate.js
// Merges per-pen `details/animals_*.json` (full RL individuals) into the `animals` array
// from data.json so the dashboard / realtime-connector can render one row per animal
// (same as when the mod inlined animals in the main file).

const fs = require('fs');
const path = require('path');

const fileCache = new Map(); // absPath -> { mtimeMs, size, animals, ownerFarmId, placeableId, penId }

/** RL unique-id files may be a bit short of the cluster sum (scaled buckets). Still hydrate. */
const UNIQUE_CAPTURE_RATIO = 0.8;

function toArr(val) {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    if (typeof val === 'object') return Object.values(val);
    return [];
}

function parseDetailAnimals(doc) {
    const list = toArr(doc && doc.animals).filter((a) => a && typeof a === 'object');
    return list.length ? list : null;
}

function countCapturedHeads(animals) {
    let sum = 0;
    for (const a of animals) {
        const c = Number(a && a.clusterCount);
        if (a && a.__lodClusterAggregate && Number.isFinite(c) && c > 0) {
            sum += Math.floor(c);
        } else {
            sum += 1;
        }
    }
    return sum;
}

function hasUniqueIndividuals(animals) {
    if (!Array.isArray(animals)) return false;
    for (const a of animals) {
        if (a && a.uniqueId != null && String(a.uniqueId).trim() !== '') return true;
    }
    return false;
}

function rememberDetailEntry(map, entry) {
    const pid = entry.placeableId;
    if (pid == null || !Number.isFinite(pid)) return;
    const farm = Number(entry.ownerFarmId) || 0;
    const key = `${pid}|${farm}`;
    const prev = map.get(key);
    if (!prev) {
        map.set(key, entry);
        return;
    }
    const prevN = countCapturedHeads(prev.animals);
    const nextN = countCapturedHeads(entry.animals);
    const prevU = hasUniqueIndividuals(prev.animals);
    const nextU = hasUniqueIndividuals(entry.animals);
    if (nextU && !prevU) {
        map.set(key, entry);
        return;
    }
    const prevAt = Number(prev.generatedAt) || 0;
    const nextAt = Number(entry.generatedAt) || 0;
    if (nextAt > 0 && prevAt > 0 && nextAt !== prevAt) {
        if (nextAt >= prevAt) {
            // A newer incomplete / non-unique file must not hide a richer unique-id capture.
            if (prevU && !nextU) return;
            if (prevU && nextU && nextN < prevN) return;
            map.set(key, entry);
        }
        return;
    }
    // Same (or missing) timestamps: keep the richer unique-id capture. A later
    // incomplete animals_*.json must not hide animals already written for this pen.
    if (nextU === prevU && nextN > prevN) map.set(key, entry);
}

function lookupDetailEntry(map, hid, hf) {
    const farm = Number(hf) || 0;
    const exact = map.get(`${hid}|${farm}`);
    if (exact) return exact;
    if (farm !== 0) {
        const unscoped = map.get(`${hid}|0`);
        if (unscoped) return unscoped;
    }
    return null;
}

function husbandryAggregateHeadCount(h) {
    const reported = Number(h.numOfAnimalsReported);
    const prevCount = Number(h.animalCount);
    let clusterSum = 0;
    if (Array.isArray(h.clusters)) {
        for (const c of h.clusters) {
            const cc = Number(c && c.count);
            if (Number.isFinite(cc) && cc > 0) clusterSum += cc;
        }
    }
    return Math.max(
        Number.isFinite(reported) && reported > 0 ? reported : 0,
        Number.isFinite(prevCount) && prevCount > 0 ? prevCount : 0,
        clusterSum
    );
}

function shouldSkipIncompleteDetail(capturedHeads, aggregate, animals) {
    if (!(aggregate > 0 && capturedHeads < aggregate)) return false;
    // Cloned cluster averages are worse than a slightly short unique-id list.
    if (hasUniqueIndividuals(animals) && capturedHeads / aggregate >= UNIQUE_CAPTURE_RATIO) {
        return false;
    }
    return true;
}

function applyDetailBlockToHusbandry(h, block) {
    const rawReported = h.numOfAnimalsReported != null && h.numOfAnimalsReported !== ''
        ? h.numOfAnimalsReported : h.animalCount;
    if (rawReported != null && rawReported !== '' && Number(rawReported) === 0) {
        return {
            husbandry: { ...h, animals: [], clusters: [], animalCount: 0, numOfAnimalsReported: 0,
                __detailHydrated: false, __detailCapturedHeads: 0 },
            hydrated: false, heads: 0,
        };
    }
    const hf = Number(h.ownerFarmId ?? h.farmId ?? 0);
    if (block.ownerFarmId && hf && block.ownerFarmId !== hf) {
        return { husbandry: h, hydrated: false, heads: 0 };
    }

    const resolvedFarm = hf > 0 ? hf : block.ownerFarmId > 0 ? block.ownerFarmId : hf;
    const ownerFarmId = resolvedFarm > 0 ? resolvedFarm : block.ownerFarmId || hf;
    const animals = block.animals.map((a) => {
        const row = {
            ...a,
            ownerFarmId: a.ownerFarmId ?? a.farmId ?? ownerFarmId,
            farmId: a.farmId ?? a.ownerFarmId ?? ownerFarmId,
        };
        const grp = Number(a.count);
        if (Number.isFinite(grp) && grp > 1) {
            row.__lodClusterAggregate = true;
            row.clusterCount = grp;
        }
        return row;
    });

    const capturedHeads = countCapturedHeads(animals);
    const reported = Number(h.numOfAnimalsReported);
    const prevCount = Number(h.animalCount);
    const aggregate = husbandryAggregateHeadCount(h);

    if (shouldSkipIncompleteDetail(capturedHeads, aggregate, animals)) {
        return { husbandry: h, hydrated: false, heads: 0 };
    }

    return {
        husbandry: {
            ...h,
            ownerFarmId,
            farmId: ownerFarmId,
            animals,
            lod: 'full',
            animalCount: Number.isFinite(reported) && reported > 0 ? reported : capturedHeads,
            numOfAnimalsReported: Number.isFinite(reported) && reported > 0 ? reported : capturedHeads,
            __detailHydrated: true,
            __detailCapturedHeads: capturedHeads,
        },
        hydrated: true,
        heads: capturedHeads,
    };
}

function hydrateHusbandryArray(arr, byKey, detailsDir) {
    let hydratedPens = 0;
    let totalHeads = 0;
    const out = arr.map((h) => {
        if (!h || typeof h !== 'object') return h;
        const hid = Number(h.id);
        if (!Number.isFinite(hid)) return h;
        const hf = Number(h.ownerFarmId ?? h.farmId ?? 0);
        const block = lookupDetailEntry(byKey, hid, hf);
        if (!block) return h;
        const applied = applyDetailBlockToHusbandry(h, block);
        if (applied.hydrated) {
            hydratedPens += 1;
            totalHeads += applied.heads;
        }
        return applied.husbandry;
    });
    if (hydratedPens > 0) {
        console.log(
            `[DetailHydrate] +${totalHeads} animals across ${hydratedPens} pens from ${detailsDir}`
        );
    }
    return out;
}

function getLocalDetailsDirForServer(srv, getLocalLuaJsonPath, options = {}) {
    if (typeof getLocalLuaJsonPath !== 'function' || !srv) return null;
    const jsonPath = getLocalLuaJsonPath(srv);
    if (!jsonPath) return null;
    const primary = path.join(path.dirname(jsonPath), 'details');
    try {
        if (fs.existsSync(primary)) return primary;
    } catch (_) {
        /* keep looking */
    }
    const slot = (options.serverState && options.serverState.lastSaveSlot) || srv.localSubFolder;
    if (!slot) return primary;
    const parent = path.dirname(path.dirname(jsonPath));
    const alt = path.join(parent, slot, 'details');
    if (alt !== primary) {
        try {
            if (fs.existsSync(alt)) return alt;
        } catch (_) {
            /* fall through */
        }
    }
    return primary;
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
        return getLocalDetailsDirForServer(srv, getLocalLuaJsonPath, options);
    }
    if (mode === 'ftp') {
        return getFtpCachedDetailsDir(srv, options.userDataPath, options.serverState);
    }
    return null;
}

function makeCacheEntry(st, doc, animals) {
    return {
        mtimeMs: st.mtimeMs,
        size: st.size,
        animals,
        placeableId: doc.placeableId != null ? Number(doc.placeableId) : null,
        ownerFarmId: doc.ownerFarmId != null ? Number(doc.ownerFarmId) : 0,
        penId: doc.penId,
        generatedAt: doc.generatedAt,
    };
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
    const animals = parseDetailAnimals(doc);
    if (!animals) return null;
    const entry = makeCacheEntry(st, doc, animals);
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

    const byKey = new Map();
    for (const fname of names) {
        if (!fname.startsWith('animals_') || !fname.endsWith('.json')) continue;
        const full = path.join(detailsDir, fname);
        const entry = readDetailFileCached(full);
        if (!entry || !entry.animals) continue;
        rememberDetailEntry(byKey, entry);
    }

    if (byKey.size === 0) return luaData;

    const out = hydrateHusbandryArray(toArr(luaData.animals), byKey, detailsDir);
    return { ...luaData, animals: out };
}

async function readDetailFileCachedAsync(absPath) {
    let st;
    try {
        st = await fs.promises.stat(absPath);
    } catch (_) {
        return null;
    }
    const prev = fileCache.get(absPath);
    if (prev && prev.mtimeMs === st.mtimeMs && prev.size === st.size) {
        return prev;
    }
    let raw;
    try {
        raw = await fs.promises.readFile(absPath, 'utf8');
    } catch (_) {
        return null;
    }
    let doc;
    try {
        doc = JSON.parse(raw);
    } catch (_) {
        return null;
    }
    const animals = parseDetailAnimals(doc);
    if (!animals) return null;
    const entry = makeCacheEntry(st, doc, animals);
    fileCache.set(absPath, entry);
    return entry;
}

/**
 * Async variant — non-blocking detail hydration for merge hot path.
 */
async function hydrateLuaDataAnimalsFromDetailsAsync(luaData, srv, getLocalLuaJsonPath, options = {}) {
    if (!luaData || typeof luaData !== 'object' || !srv) return luaData;
    const mode = String(srv.mode || '').toLowerCase();
    if (mode !== 'local' && mode !== 'ftp') return luaData;

    const detailsDir = getDetailsDirForHydration(srv, getLocalLuaJsonPath, options);
    if (!detailsDir) return luaData;
    try {
        await fs.promises.access(detailsDir);
    } catch (_) {
        return luaData;
    }

    let names;
    try {
        names = await fs.promises.readdir(detailsDir);
    } catch (_) {
        return luaData;
    }

    const byKey = new Map();
    for (const fname of names) {
        if (!fname.startsWith('animals_') || !fname.endsWith('.json')) continue;
        const full = path.join(detailsDir, fname);
        const entry = await readDetailFileCachedAsync(full);
        if (!entry || !entry.animals) continue;
        rememberDetailEntry(byKey, entry);
    }

    if (byKey.size === 0) return luaData;

    const out = hydrateHusbandryArray(toArr(luaData.animals), byKey, detailsDir);
    return { ...luaData, animals: out };
}

module.exports = {
    hydrateLuaDataAnimalsFromDetails,
    hydrateLuaDataAnimalsFromDetailsAsync,
    getLocalDetailsDirForServer,
    getFtpCachedDetailsDir,
    getDetailsDirForHydration,
    rememberDetailEntry,
    countCapturedHeads,
    hasUniqueIndividuals,
};
