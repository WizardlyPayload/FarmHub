// FS25 FarmDashboard | livestockDetail.js | v2.3.0 (Plan v5)
//
// =====================================================================================
// WIRE FORMAT CONTRACTS (Phase 0 — must match mod-side header byte-for-byte)
// =====================================================================================
//
// 1. data.json (existing; bumped to schemaVersion 1, adds serverTimeSec)
//
// 2. dirtyPens.json:
//      { "schemaVersion": 1,
//        "idScheme": "composite-v1" | "integer-v1",
//        "updatedAt": <unix sec>,
//        "animalMode": "base" | "RL" | "unknown",
//        "pens": [ { "id": <id>, "ts": <unix sec>, "animalCount": <int> } ]   // bounded 4096
//      }
//
// 3. details/animals_<id>.json:
//      { "schemaVersion": 1,
//        "idScheme": "...",
//        "penId": <id>,
//        "placeableId": <int>,                  // raw runtime id for app correlation
//        "generatedAt": <unix sec>,
//        "mode": "base" | "RL",
//        "lod": "full" | "sample",
//        "animals": [ ... ]
//      }
//
// 4. requests.json:
//      { "schemaVersion": 1,
//        "updatedAt": <unix sec>,
//        "pens": [ { "id": <int>, "ts": <unix sec> } ]   // bounded 256, drop > 300s old
//      }
//
// =====================================================================================
// Operational notes (Plan v5):
//   - Local mode: read directly from disk.
//   - FTP mode: index `dirtyPens.json` is downloaded alongside `data.json` on the
//     existing pollFtp loop (see main.js); /api/livestock/:id only re-fetches a per-pen
//     detail when `index.ts > localCacheTs + 1` (1s float-jitter tolerance).
//   - Detail cache is keyed by (serverId, idScheme, penId) so a scheme change auto-busts.
//   - requests.json writes are atomic, bounded 256 entries, drop entries older than 300s.
//   - FTP upload of requests.json is best-effort and does not block the HTTP response.
// =====================================================================================

const path = require('path');
const fs = require('fs');
const ftp = require('basic-ftp');

// Plan v5 wire-format constants
const REQUESTS_SCHEMA_VERSION = 1;
const DIRTY_SCHEMA_VERSION = 1;
const DETAIL_SCHEMA_VERSION = 1;
const REQUESTS_MAX_ENTRIES = 256;
const REQUESTS_MAX_AGE_SEC = 300;
const ID_SCHEME_TS_TOLERANCE_SEC = 1;
const MIN_ID = 1;
const MAX_ID = 2147483647;
const MAX_PEN_KEY_LEN = 200;
const DETAIL_ANIMALS_CAP = 6000;

// In-process cache for the dirty index per server (avoids disk hits on every API call).
// Map<serverId, { mtimeMs: number, ts: number, idScheme: string, pens: Map<string, number>, animalMode: string }>
const dirtyIndexCache = new Map();
let dirtyIndexLogOnce = new Set();

/** Plan v5 B5: must match FarmDashboardDataCollector:_penKeyToFilename (Lua). */
function penKeyToFilenameSegment(penKey) {
    if (penKey == null) return '';
    let s = String(penKey);
    s = s.replace(/[^A-Za-z0-9._-]/g, '_');
    if (s.length > 96) s = s.slice(-96);
    return s;
}

/**
 * Parse `GET /api/livestock/:id` param: integer pen id or composite key (`config.xml:123`).
 * Returns { canonicalKey, fileSegment } or null if invalid.
 */
function parsePenKeyForRead(raw) {
    if (raw === undefined || raw === null) return null;
    let s = String(raw).trim();
    try {
        s = decodeURIComponent(s);
    } catch (_) { /* keep raw */ }
    if (!s || s.length > MAX_PEN_KEY_LEN) return null;
    if (s.includes('..') || s.includes('/') || s.includes('\\')) return null;

    const asInt = validatePenId(s);
    if (asInt != null) {
        const canonicalKey = String(asInt);
        return { canonicalKey, fileSegment: penKeyToFilenameSegment(canonicalKey) };
    }

    if (!/^[A-Za-z0-9._:\-]+$/.test(s)) return null;
    return { canonicalKey: s, fileSegment: penKeyToFilenameSegment(s) };
}

function bustDirtyIndexCache(serverId) {
    if (serverId != null && serverId !== '') dirtyIndexCache.delete(String(serverId));
}

/** FTP upload retry queue (bounded) — best-effort; drops when overloaded. */
const FTP_UPLOAD_QUEUE_CAP = 16;
let _ftpUploadQueue = [];
let _ftpUploadRunning = 0;

function queueFtpUpload(srv, localPath, remotePath) {
    if (_ftpUploadQueue.length >= FTP_UPLOAD_QUEUE_CAP) {
        console.warn('[livestockDetail] FTP upload queue full; drop one');
        _ftpUploadQueue.shift();
    }
    _ftpUploadQueue.push({ srv, localPath, remotePath });
    pumpFtpUploadQueue().catch((e) => {
        console.warn('[livestockDetail] FTP queue pump', e && e.message);
    });
}

async function pumpFtpUploadQueue() {
    if (_ftpUploadRunning >= 1) return;
    const job = _ftpUploadQueue.shift();
    if (!job) return;
    _ftpUploadRunning += 1;
    try {
        await ftpUploadOne(job.srv, job.localPath, job.remotePath);
    } finally {
        _ftpUploadRunning -= 1;
        if (_ftpUploadQueue.length) await pumpFtpUploadQueue();
    }
}

function resolveDirtyTs(dirtyIndex, canonicalKey) {
    if (!dirtyIndex || !dirtyIndex.pens) return 0;
    const m = dirtyIndex.pens;
    const k = String(canonicalKey);
    let t = m.get(k) || 0;
    if (t) return t;
    const n = validatePenId(canonicalKey);
    if (n != null) {
        for (const [idKey, ts] of m) {
            if (idKey === String(n) || (typeof idKey === 'string' && idKey.endsWith(`:${n}`))) {
                return ts || 0;
            }
        }
    }
    return 0;
}

const DETAIL_ROOT_KEYS = new Set([
    'schemaVersion', 'idScheme', 'penId', 'placeableId', 'generatedAt', 'serverTimeSec',
    'mode', 'lod', 'animalMode', 'animals',
]);

const SANITIZE_MAX_DEPTH = 8;
const SANITIZE_MAX_ARRAY = 6000;

/** Deep-copy JSON-like scalar/object/array data for API responses; drops functions and prototypes. */
function sanitizeJsonLike(value, depth) {
    if (depth > SANITIZE_MAX_DEPTH) return undefined;
    if (value === null) return null;
    const t = typeof value;
    if (t === 'number' || t === 'boolean' || t === 'string') return value;
    if (Array.isArray(value)) {
        const lim = Math.min(value.length, SANITIZE_MAX_ARRAY);
        const out = [];
        for (let i = 0; i < lim; i++) {
            const v = sanitizeJsonLike(value[i], depth + 1);
            if (v !== undefined) out.push(v);
        }
        return out;
    }
    if (t === 'object' && value.constructor === Object) {
        const out = {};
        for (const [k, v] of Object.entries(value)) {
            if (k === '__proto__' || k === 'constructor') continue;
            const sv = sanitizeJsonLike(v, depth + 1);
            if (sv !== undefined) out[k] = sv;
        }
        return out;
    }
    return undefined;
}

function sanitizeDetailDoc(detail) {
    if (!detail || typeof detail !== 'object') return {};
    const out = {};
    for (const key of DETAIL_ROOT_KEYS) {
        if (detail[key] === undefined) continue;
        if (key === 'animals') {
            const arr = Array.isArray(detail.animals) ? detail.animals.slice(0, DETAIL_ANIMALS_CAP) : [];
            out.animals = arr.map((a) => {
                const o = sanitizeJsonLike(a, 0);
                return o && typeof o === 'object' ? o : {};
            });
        } else {
            const v = sanitizeJsonLike(detail[key], 0);
            if (v !== undefined) out[key] = v;
        }
    }
    return out;
}

function getServerById(servers, id) {
    if (!Array.isArray(servers)) return null;
    return servers.find((s) => String(s.id) === String(id)) || null;
}

/**
 * Plan v5: reject anything other than a positive 31-bit integer for use as a pen id.
 * Returns the integer on success, null on failure.
 */
function validatePenId(raw) {
    const n = Number(raw);
    if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
    if (n < MIN_ID || n > MAX_ID) return null;
    return n;
}

function getLocalSlotPath(srv, getFs25DocumentsRoot) {
    let basePath = srv && srv.localPath;
    if (!basePath) {
        const root = typeof getFs25DocumentsRoot === 'function' ? getFs25DocumentsRoot() : null;
        if (!root) return null;
        basePath = path.join(root, 'modSettings', 'FS25_FarmDashboard');
    }
    const folderName = (srv && srv.localSubFolder) ||
        String((srv && srv.name) || '').replace(/[<>:"/\\|?*]/g, '').trim();
    if (!folderName) return null;
    return path.join(basePath, folderName);
}

function getDetailPathLocal(srv, fileSegment, getFs25DocumentsRoot) {
    const slotDir = getLocalSlotPath(srv, getFs25DocumentsRoot);
    if (!slotDir) return null;
    return path.join(slotDir, 'details', `animals_${fileSegment}.json`);
}

function getRequestsPathLocal(srv, getFs25DocumentsRoot) {
    const slotDir = getLocalSlotPath(srv, getFs25DocumentsRoot);
    if (!slotDir) return null;
    return path.join(slotDir, 'requests.json');
}

function getDirtyIndexPathLocal(srv, getFs25DocumentsRoot) {
    const slotDir = getLocalSlotPath(srv, getFs25DocumentsRoot);
    if (!slotDir) return null;
    return path.join(slotDir, 'dirtyPens.json');
}

/** Cache key includes idScheme so a scheme change automatically busts the cached file. */
function getFtpDetailCachePath(userDataPath, srv, idScheme, fileSegment) {
    const scheme = idScheme || 'integer-v1';
    const safeSeg = String(fileSegment).replace(/[^A-Za-z0-9._-]/g, '_').slice(-120);
    return path.join(userDataPath, `livestock_detail_${srv.id}_${scheme}_${safeSeg}.json`);
}

function getFtpRequestsCachePath(userDataPath, srv) {
    return path.join(userDataPath, `livestock_requests_${srv.id}.json`);
}

function getFtpDirtyIndexCachePath(userDataPath, srv) {
    return path.join(userDataPath, `livestock_dirtyPens_${srv.id}.json`);
}

function readJsonSafe(p) {
    try {
        if (!fs.existsSync(p)) return null;
        const raw = fs.readFileSync(p, 'utf8');
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (e) {
        console.warn('[livestockDetail] readJsonSafe', p, e.message);
        return null;
    }
}

/**
 * Atomic write on Windows: write tmp, then renameSync directly to target. Node renames are atomic
 * across the same volume on NTFS. Retry x3 on EBUSY/EEXIST/EPERM with short backoff. As a last
 * resort, delete the target then rename. Logs once per first failure.
 */
function writeJsonAtomic(p, obj) {
    const tmp = p + '.tmp';
    let lastErr = null;
    try {
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
    } catch (e) {
        console.warn('[livestockDetail] writeJsonAtomic prep', p, e.message);
        return false;
    }

    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            fs.renameSync(tmp, p);
            return true;
        } catch (e) {
            lastErr = e;
            if (e && (e.code === 'EBUSY' || e.code === 'EPERM' || e.code === 'EEXIST')) {
                // Brief backoff then retry; on the 3rd attempt fall through to delete+rename.
                const sleep = 25 * (attempt + 1);
                const t = Date.now() + sleep;
                while (Date.now() < t) { /* spin */ }
                continue;
            }
            break;
        }
    }
    try {
        if (fs.existsSync(p)) fs.unlinkSync(p);
        fs.renameSync(tmp, p);
        return true;
    } catch (e) {
        try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (_) { /* ignore */ }
        console.warn('[livestockDetail] writeJsonAtomic', p, (lastErr && lastErr.message) || e.message);
        return false;
    }
}

async function ftpDownloadOne(srv, remotePath, localPath) {
    const client = new ftp.Client(60000);
    client.ftp.verbose = false;
    try {
        await client.access({
            host: srv.ftpHost, port: parseInt(srv.ftpPort, 10) || 21,
            user: srv.ftpUser, password: srv.ftpPass, secure: false,
        });
        const tmp = localPath + '.tmp';
        try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (_) { /* ignore */ }
        await client.downloadTo(tmp, remotePath);
        if (fs.existsSync(tmp) && fs.statSync(tmp).size > 0) {
            if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
            fs.renameSync(tmp, localPath);
            return true;
        }
        return false;
    } catch (e) {
        console.warn(`[livestockDetail] FTP download ${remotePath}: ${e.message}`);
        return false;
    } finally {
        client.close();
    }
}

async function ftpUploadOne(srv, localPath, remotePath) {
    const client = new ftp.Client(60000);
    client.ftp.verbose = false;
    try {
        await client.access({
            host: srv.ftpHost, port: parseInt(srv.ftpPort, 10) || 21,
            user: srv.ftpUser, password: srv.ftpPass, secure: false,
        });
        const dir = remotePath.replace(/\\/g, '/').split('/').slice(0, -1).join('/');
        if (dir) {
            try { await client.ensureDir(dir); } catch (_) { /* ignore */ }
        }
        await client.uploadFrom(localPath, remotePath);
        return true;
    } catch (e) {
        console.warn(`[livestockDetail] FTP upload ${remotePath}: ${e.message}`);
        return false;
    } finally {
        client.close();
    }
}

function ftpRemoteSlotPath(srv, serverStates) {
    const basePath = (srv && srv.ftpBasePath) || 'profile';
    const st = serverStates && srv && serverStates[srv.id];
    const folderName = (st && st.lastSaveSlot) ||
        (srv && srv.localSubFolder) ||
        String((srv && srv.name) || '').replace(/[<>:"/\\|?*]/g, '').trim() ||
        'savegame1';
    return `${basePath.replace(/\\/g, '/').replace(/\/$/, '')}/modSettings/FS25_FarmDashboard/${folderName}`;
}

/**
 * Plan v5 A1: read the dirtyPens.json index for a server. Validates schema, builds an in-memory
 * Map of pen id -> ts, and caches by mtime so successive calls during the same poll cycle do
 * not re-parse the file. Returns null when no index is available or schema is unsupported.
 *
 * @returns {Promise<null | { ts: number, idScheme: string, pens: Map<string, number>, animalMode: string }>}
 */
async function readDirtyIndex(srv, opts = {}) {
    if (!srv) return null;
    const userDataPath = opts.userDataPath || (require('electron').app.getPath('userData'));
    const indexPath = (srv.mode === 'local')
        ? getDirtyIndexPathLocal(srv, opts.getFs25DocumentsRoot)
        : getFtpDirtyIndexCachePath(userDataPath, srv);
    if (!indexPath || !fs.existsSync(indexPath)) return null;

    let mtimeMs = 0;
    try { mtimeMs = fs.statSync(indexPath).mtimeMs || 0; } catch (_) { /* ignore */ }
    const cached = dirtyIndexCache.get(srv.id);
    if (cached && cached.mtimeMs === mtimeMs) return cached;

    const raw = readJsonSafe(indexPath);
    if (!raw || typeof raw !== 'object') return null;
    if (raw.schemaVersion !== undefined && raw.schemaVersion > DIRTY_SCHEMA_VERSION) {
        const k = `unsupported-${srv.id}-${raw.schemaVersion}`;
        if (!dirtyIndexLogOnce.has(k)) {
            dirtyIndexLogOnce.add(k);
            console.warn(`[livestockDetail] dirtyPens.json schemaVersion=${raw.schemaVersion} > supported=${DIRTY_SCHEMA_VERSION} for srv=${srv.id}; ignoring`);
        }
        return null;
    }
    const pensMap = new Map();
    if (Array.isArray(raw.pens)) {
        for (const e of raw.pens) {
            if (!e) continue;
            if (e.id == null) continue;
            const ts = Number(e.ts) || 0;
            pensMap.set(String(e.id), ts);
        }
    } else if (raw.pens && typeof raw.pens === 'object' && !Array.isArray(raw.pens)) {
        for (const [k, v] of Object.entries(raw.pens)) {
            const ts = typeof v === 'object' && v !== null ? Number(v.ts) || 0 : Number(v) || 0;
            pensMap.set(String(k), ts);
        }
    }
    const view = {
        mtimeMs,
        ts: Number(raw.updatedAt) || 0,
        idScheme: typeof raw.idScheme === 'string' ? raw.idScheme : 'integer-v1',
        pens: pensMap,
        animalMode: typeof raw.animalMode === 'string' ? raw.animalMode : 'unknown',
    };
    dirtyIndexCache.set(srv.id, view);
    return view;
}

/**
 * Plan v5 A1: piggy-back call from main.js pollFtp. Downloads `dirtyPens.json` into the userData
 * cache so /api/livestock/:id can consult it cheaply without an extra FTP connect per click.
 * Returns true if the local cache is now fresh (or unchanged), false on failure.
 */
async function ftpRefreshDirtyIndex(srv, opts) {
    if (!srv || srv.mode !== 'ftp') return false;
    const userDataPath = (opts && opts.userDataPath) || (require('electron').app.getPath('userData'));
    const slotRemote = ftpRemoteSlotPath(srv, opts && opts.serverStates);
    const remote = `${slotRemote}/dirtyPens.json`;
    const local = getFtpDirtyIndexCachePath(userDataPath, srv);
    const ok = await ftpDownloadOne(srv, remote, local);
    if (ok) {
        // Bust the in-process cache so the next read picks up the fresh file.
        dirtyIndexCache.delete(srv.id);
    }
    return ok;
}

/**
 * Plan v5 A1: rich response shape. Returns { detail, serverTimeSec, animalMode, idScheme,
 * dirtyAt, cachedAt, fromCache } so the UI can render "as of HH:MM:SS" and decide whether to
 * trigger a /request refresh.
 *
 * Refetch only when remoteTs > localTs + 1 (float jitter tolerance) OR the cache file is missing.
 */
async function read(opts) {
    const { req, resolveServerIdForRequest, servers, serverStates, getFs25DocumentsRoot } = opts;
    const parsed = parsePenKeyForRead(req.params.id);
    if (!parsed) {
        const err = new Error('invalid id');
        err.code = 'INVALID_ID';
        throw err;
    }
    const { canonicalKey, fileSegment } = parsed;

    const serverId = (typeof resolveServerIdForRequest === 'function') ? resolveServerIdForRequest(req) : null;
    const srv = getServerById(servers, serverId);
    if (!srv) return null;

    const userDataPath = (serverStates && serverStates[srv.id] && serverStates[srv.id].userDataPath) ||
        require('electron').app.getPath('userData');

    const dirtyIndex = await readDirtyIndex(srv, { userDataPath, getFs25DocumentsRoot });
    const dirtyAt = resolveDirtyTs(dirtyIndex, canonicalKey);
    const idScheme = (dirtyIndex && dirtyIndex.idScheme) || 'integer-v1';
    const animalMode = (dirtyIndex && dirtyIndex.animalMode) || 'unknown';

    let detail = null;
    let cachedAtMs = 0;
    let fromCache = false;

    if (srv.mode === 'local') {
        const p = getDetailPathLocal(srv, fileSegment, getFs25DocumentsRoot);
        if (!p || !fs.existsSync(p)) return null;
        try { cachedAtMs = fs.statSync(p).mtimeMs || 0; } catch (_) { /* ignore */ }
        detail = readJsonSafe(p);
        fromCache = false; // Local always reads disk.
    } else if (srv.mode === 'ftp') {
        const localCache = getFtpDetailCachePath(userDataPath, srv, idScheme, fileSegment);
        const slotRemote = ftpRemoteSlotPath(srv, serverStates);
        const remote = `${slotRemote}/details/animals_${fileSegment}.json`;

        let localTs = 0;
        if (fs.existsSync(localCache)) {
            try { localTs = (fs.statSync(localCache).mtimeMs || 0) / 1000; } catch (_) { /* ignore */ }
        }

        const needsFetch = !fs.existsSync(localCache)
            || (dirtyAt > 0 && dirtyAt > localTs + ID_SCHEME_TS_TOLERANCE_SEC);

        if (needsFetch) {
            const ok = await ftpDownloadOne(srv, remote, localCache);
            if (!ok && !fs.existsSync(localCache)) return null;
            fromCache = !ok;
        } else {
            fromCache = true;
        }
        try { cachedAtMs = fs.statSync(localCache).mtimeMs || 0; } catch (_) { /* ignore */ }
        detail = readJsonSafe(localCache);
    }

    if (!detail) return null;

    // Reject schemaVersion > supported. schemaVersion missing = treat as legacy and pass through.
    if (detail.schemaVersion !== undefined && detail.schemaVersion > DETAIL_SCHEMA_VERSION) {
        console.warn(`[livestockDetail] details/animals_${fileSegment}.json schemaVersion=${detail.schemaVersion} > ${DETAIL_SCHEMA_VERSION}; ignoring`);
        return null;
    }

    return {
        schemaVersion: DETAIL_SCHEMA_VERSION,
        serverTimeSec: Number(detail.serverTimeSec) || Number(detail.generatedAt) || 0,
        animalMode: typeof detail.animalMode === 'string' ? detail.animalMode : animalMode,
        idScheme: typeof detail.idScheme === 'string' ? detail.idScheme : idScheme,
        dirtyAt,
        cachedAt: Math.floor(cachedAtMs / 1000),
        fromCache,
        penKey: canonicalKey,
        detail: sanitizeDetailDoc(detail),
    };
}

/**
 * Plan v5 A4: write a hardened, bounded, schema-versioned requests.json that the mod polls.
 * - Validates :id is a positive 31-bit integer.
 * - Drops entries older than REQUESTS_MAX_AGE_SEC and caps to REQUESTS_MAX_ENTRIES.
 * - Writes locally first; FTP upload is best-effort and never blocks the HTTP response.
 */
async function request(opts) {
    const { req, resolveServerIdForRequest, servers, serverStates, getFs25DocumentsRoot } = opts;
    const penId = validatePenId(req.params.id);
    if (penId == null) {
        const err = new Error('invalid id');
        err.code = 'INVALID_ID';
        throw err;
    }

    const serverId = (typeof resolveServerIdForRequest === 'function') ? resolveServerIdForRequest(req) : null;
    const srv = getServerById(servers, serverId);
    if (!srv) return false;

    const nowSec = Date.now() / 1000;

    function buildRequestsDoc(existing) {
        const base = (existing && typeof existing === 'object') ? existing : {};
        let pens = Array.isArray(base.pens) ? base.pens.slice() : [];
        // Drop unknown fields and stale entries; keep last 256.
        pens = pens
            .map((e) => {
                if (!e || typeof e !== 'object') return null;
                const id = validatePenId(e.id);
                if (id == null) return null;
                const ts = Number(e.ts) || 0;
                return { id, ts };
            })
            .filter((e) => e && (nowSec - e.ts) <= REQUESTS_MAX_AGE_SEC);
        if (!pens.some((e) => e.id === penId)) {
            pens.push({ id: penId, ts: nowSec });
        }
        if (pens.length > REQUESTS_MAX_ENTRIES) {
            pens = pens.slice(pens.length - REQUESTS_MAX_ENTRIES);
        }
        return {
            schemaVersion: REQUESTS_SCHEMA_VERSION,
            updatedAt: nowSec,
            pens,
        };
    }

    if (srv.mode === 'local') {
        const p = getRequestsPathLocal(srv, getFs25DocumentsRoot);
        if (!p) return false;
        const doc = buildRequestsDoc(readJsonSafe(p));
        return writeJsonAtomic(p, doc);
    }

    if (srv.mode === 'ftp') {
        const userDataPath = (serverStates && serverStates[srv.id] && serverStates[srv.id].userDataPath) ||
            require('electron').app.getPath('userData');
        const localCache = getFtpRequestsCachePath(userDataPath, srv);
        const slotRemote = ftpRemoteSlotPath(srv, serverStates);
        const remote = `${slotRemote}/requests.json`;
        const doc = buildRequestsDoc(readJsonSafe(localCache));
        const wrote = writeJsonAtomic(localCache, doc);
        if (!wrote) return false;
        queueFtpUpload(srv, localCache, remote);
        return true;
    }

    return false;
}

module.exports = {
    read,
    request,
    readDirtyIndex,
    ftpRefreshDirtyIndex,
    validatePenId,
    parsePenKeyForRead,
    penKeyToFilenameSegment,
    bustDirtyIndexCache,
    // exported for tests / parity tooling
    REQUESTS_SCHEMA_VERSION,
    DIRTY_SCHEMA_VERSION,
    DETAIL_SCHEMA_VERSION,
    REQUESTS_MAX_ENTRIES,
    REQUESTS_MAX_AGE_SEC,
    ID_SCHEME_TS_TOLERANCE_SEC,
};
