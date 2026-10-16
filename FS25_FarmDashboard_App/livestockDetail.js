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
const crypto = require('crypto');
const { Transform, pipeline } = require('stream');
const os = require('os');
const fileCommit = require('./fileCommit.cjs');
const detailValidation = new Map();
const fs = require('fs');
const ftp = require('basic-ftp');
const { ftpAccessOptions } = require('./ftpAccess.cjs');
const { sanitizeIdScheme, joinContained } = require('./safeFsIdentity.cjs');
const exportIngress = require('./exportIngress');
const { decodeEnvelope, MAX_ENCODED } = require('./exportEnvelope');

function explicitLegacy(srv) {
    return !!(srv && srv.legacyJson === true);
}

function resourceIdForPen(penKey) {
    const bytes = Buffer.from(String(penKey ?? ''), 'utf8');
    let out = '';
    for (const byte of bytes) {
        const c = String.fromCharCode(byte);
        if (/^[A-Za-z0-9]$/.test(c)) out += c;
        else out += `_${byte.toString(16).toUpperCase().padStart(2, '0')}`;
    }
    if (!out || out.length > 64) return null;
    return out;
}

function acceptResourcePayload(kind, payload, penKey) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
    if (payload.schemaVersion !== 1) return false;
    if (payload.idScheme !== 'integer-v1' && payload.idScheme !== 'composite-v1') return false;
    if (kind === 'dirtyPens') {
        if (!Array.isArray(payload.pens)) return false;
        const ids = new Set();
        for (const pen of payload.pens) {
            if (!pen || typeof pen !== 'object' || pen.id == null) return false;
            const id = String(pen.id);
            if (ids.has(id)) return false;
            ids.add(id);
        }
        return true;
    }
    if (kind === 'penDetail') {
        if (!Array.isArray(payload.animals)) return false;
        if (penKey != null && String(payload.penId) !== String(penKey)) return false;
        if (payload.idScheme === 'integer-v1' && Number(payload.placeableId) !== Number(penKey)) return false;
        return true;
    }
    return false;
}

function liveSourceSlot(srv, state, identity) {
    if (srv && srv.mode === 'ftp') {
        return String((state && state.lastSaveSlot) || (srv && srv.localSubFolder) || (identity && identity.sourceSlot) || '');
    }
    return String((identity && identity.sourceSlot) || (srv && srv.localSubFolder) || '');
}

function endpointFingerprint(srv, sourceSlot) {
    const fields = srv && srv.mode === 'ftp'
        ? ['ftp', String(srv.ftpHost || ''), String(srv.ftpPort || 21), srv.ftpSecure === true ? '1' : '0', String(srv.ftpBasePath || ''), sourceSlot]
        : ['local', path.resolve(String((srv && srv.localPath) || '')), sourceSlot];
    return crypto.createHash('sha256').update(fields.join('\n')).digest('hex').slice(0, 16);
}

function resourceBinding(srv, serverStates) {
    const state = serverStates && srv && serverStates[srv.id];
    const identity = state && state.exportIdentity;
    if (!identity || !identity.careerId || !identity.sessionId) return null;
    const sourceSlot = liveSourceSlot(srv, state, identity);
    const replica = !!(srv.replicaRemoteSlot || (state && state.ingressKind === 'replica') || identity.replica === true);
    return {
        sourceId: String(srv.id),
        careerId: String(identity.careerId),
        sessionId: String(identity.sessionId),
        sourceSlot,
        protocol: explicitLegacy(srv) ? 'legacy' : 'modern',
        kind: replica ? 'replica' : 'authoritative',
        unsupported: replica,
        fingerprint: endpointFingerprint(srv, sourceSlot),
        ownerGeneration: Number(state && state.ingressGeneration) || 0,
        stateObject: state,
    };
}

function bindingStill(srv, serverStates, binding) {
    const live = serverStates && srv && serverStates[srv.id];
    if (!live || !binding || live !== binding.stateObject || live.active === false) return false;
    const current = resourceBinding(srv, serverStates);
    if (!current || current.unsupported || binding.unsupported) return false;
    return current.careerId === binding.careerId
        && current.sessionId === binding.sessionId
        && current.sourceSlot === binding.sourceSlot
        && current.fingerprint === binding.fingerprint
        && current.protocol === binding.protocol
        && current.kind === binding.kind
        && current.ownerGeneration === binding.ownerGeneration;
}

function resourceCacheFile(userDataPath, srv, kind, slotName, binding) {
    return path.join(userDataPath, `livestock_${kind}_${srv.id}_${binding.fingerprint}_${binding.careerId}_${binding.sessionId}_${slotName}`);
}

function dirtyIndexWatchPath(slotDir, srv, state) {
    if (!slotDir) return null;
    if (explicitLegacy(srv)) return path.join(slotDir, 'dirtyPens.json');
    const identity = state && state.exportIdentity;
    let careerId = identity && identity.careerId ? String(identity.careerId) : '';
    let sessionId = identity && identity.sessionId ? String(identity.sessionId) : '';
    let route = null;
    try {
        route = exportIngress.parseRoute(fs.readFileSync(path.join(slotDir, 'active.xml'), 'utf8'));
    } catch (_) {
        route = null;
    }
    if (careerId) {
        if (!route || route.careerId !== careerId || (sessionId && route.sessionId !== sessionId)) return null;
    } else if (route && route.careerId && route.sessionId) {
        careerId = String(route.careerId);
    } else {
        return null;
    }
    return path.join(slotDir, careerId, 'resources', 'dirtyPens');
}

const RESOURCE_XML_LIMIT = MAX_ENCODED + 1024;

function readBoundedFile(file, limit) {
    let fd = null;
    try {
        fd = fs.openSync(file, 'r');
        const chunks = [];
        let total = 0;
        const buf = Buffer.alloc(65536);
        while (total <= limit) {
            const read = fs.readSync(fd, buf, 0, buf.length, total);
            if (read <= 0) break;
            total += read;
            if (total > limit) return null;
            chunks.push(Buffer.from(buf.subarray(0, read)));
        }
        if (total <= 0) return null;
        return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, total));
    } catch (_) {
        return null;
    } finally {
        if (fd != null) {
            try { fs.closeSync(fd); } catch (_) { /* owned handle */ }
        }
    }
}

function readBoundedXml(file) {
    return readBoundedFile(file, RESOURCE_XML_LIMIT);
}

function readSlotDocuments(folder) {
    return ['slot-a.xml', 'slot-b.xml'].map((name) => readBoundedXml(path.join(folder, name)));
}

function readXmlResource(slotDir, kind, penKey, binding) {
    if (!slotDir || !binding || binding.unsupported || binding.protocol === 'legacy') return null;
    if (!binding.careerId || !binding.sessionId) return null;
    let route = null;
    try {
        route = exportIngress.parseRoute(fs.readFileSync(path.join(slotDir, 'active.xml'), 'utf8'));
    } catch (_) {
        return null;
    }
    if (!route || route.careerId !== binding.careerId || route.sessionId !== binding.sessionId) return null;
    if (binding.sourceSlot && route.sourceSlot && route.sourceSlot !== binding.sourceSlot) return null;
    const resourceId = kind === 'penDetail' ? resourceIdForPen(penKey) : null;
    if (kind === 'penDetail' && !resourceId) return null;
    const folder = kind === 'penDetail'
        ? path.join(slotDir, binding.careerId, 'resources', 'penDetail', resourceId)
        : path.join(slotDir, binding.careerId, 'resources', 'dirtyPens');
    const selected = exportIngress.selectResourceSelection(readSlotDocuments(folder), {
        careerId: binding.careerId,
        sessionId: binding.sessionId,
        accept: (payload) => acceptResourcePayload(kind, payload, penKey),
    });
    if (!selected || selected.status !== 'valid') return null;
    if (!acceptResourcePayload(kind, selected.payload, penKey)) return null;
    return selected;
}

function dirtyViewFromPayload(payload, mtimeMs, record) {
    if (!acceptResourcePayload('dirtyPens', payload)) return null;
    const pensMap = new Map();
    for (const e of payload.pens) {
        pensMap.set(String(e.id), Number(e.ts) || 0);
    }
    return {
        mtimeMs,
        ts: Number(payload.updatedAt) || 0,
        idScheme: payload.idScheme,
        pens: pensMap,
        animalMode: typeof payload.animalMode === 'string' ? payload.animalMode : 'unknown',
        resourceSequence: record ? Number(record.publicationSequence) || 0 : 0,
        bindingKey: '',
    };
}

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
const modernDetailCache = new Map();
const MODERN_DETAIL_FRESH_MS = 60000;
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
    if (serverId == null || serverId === '') return;
    const id = String(serverId);
    for (const key of Array.from(dirtyIndexCache.keys())) {
        if (key === id || String(key).startsWith(id + '|')) dirtyIndexCache.delete(key);
    }
    for (const key of Array.from(modernDetailCache.keys())) {
        if (String(key).startsWith(id + '|')) modernDetailCache.delete(key);
    }
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

/** Map UI placeable id (518) → mod pen key (e.g. foo.xml:518) using dirtyPens index. */
function resolvePenKeyForRead(canonicalKey, dirtyIndex) {
    if (!dirtyIndex || !dirtyIndex.pens) return String(canonicalKey);
    const k = String(canonicalKey);
    if (dirtyIndex.pens.has(k)) return k;
    const n = validatePenId(canonicalKey);
    if (n != null) {
        const matches = [];
        for (const idKey of dirtyIndex.pens.keys()) {
            if (idKey === String(n) || idKey.endsWith(`:${n}`)) matches.push(idKey);
        }
        if (matches.length > 1) return null;
        if (matches.length === 1) return matches[0];
    }
    return k;
}

function getFtpDetailsCacheDir(userDataPath, srv, serverStates) {
    if (!srv || !userDataPath) return null;
    const st = serverStates && serverStates[srv.id];
    const folderName =
        (st && st.lastSaveSlot) ||
        (srv && srv.localSubFolder) ||
        String((srv && srv.name) || '').replace(/[<>:"/\\|?*]/g, '').trim() ||
        'savegame1';
    return path.join(userDataPath, 'ftpDetailsCache', String(srv.id), folderName, 'details');
}

/**
 * Locate `details/animals_*.json` on disk. Handles composite-v1 filenames when the UI only
 * knows the placeable integer id (518 → animals_foo.xml_518.json).
 */
function findDetailInDirectory(detailsDir, canonicalKey, resolvedPenKey) {
    if (!detailsDir || !fs.existsSync(detailsDir)) return null;
    const fileSegment = penKeyToFilenameSegment(resolvedPenKey);
    const direct = path.join(detailsDir, `animals_${fileSegment}.json`);
    if (fs.existsSync(direct)) {
        return { path: direct, penKey: resolvedPenKey, fileSegment };
    }
    const asInt = validatePenId(canonicalKey);
    if (asInt == null) return null;
    try {
        let best = null;
        let bestN = -1;
        let bestUnique = false;
        for (const name of fs.readdirSync(detailsDir)) {
            if (!name.startsWith('animals_') || !name.endsWith('.json')) continue;
            const fp = path.join(detailsDir, name);
            const doc = readJsonSafe(fp);
            if (!doc || typeof doc !== 'object') continue;
            const placeableId = Number(doc.placeableId);
            const penIdStr = doc.penId != null ? String(doc.penId) : '';
            if (placeableId !== asInt && penIdStr !== String(canonicalKey) && !penIdStr.endsWith(`:${asInt}`)) {
                continue;
            }
            const animals = Array.isArray(doc.animals)
                ? doc.animals
                : doc.animals && typeof doc.animals === 'object'
                  ? Object.values(doc.animals)
                  : [];
            const n = animals.length;
            let unique = false;
            for (const a of animals) {
                if (a && a.uniqueId != null && String(a.uniqueId).trim() !== '') {
                    unique = true;
                    break;
                }
            }
            const better = (unique && !bestUnique) || (unique === bestUnique && n > bestN);
            if (better) {
                best = {
                    path: fp,
                    penKey: penIdStr || resolvedPenKey,
                    fileSegment: name.slice(8, -5),
                };
                bestN = n;
                bestUnique = unique;
            }
        }
        return best;
    } catch (e) {
        console.warn('[livestockDetail] findDetailInDirectory', detailsDir, e.message);
    }
    return null;
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
            const rawAnimals = Array.isArray(detail.animals)
                ? detail.animals
                : detail.animals && typeof detail.animals === 'object'
                  ? Object.values(detail.animals)
                  : [];
            const arr = rawAnimals.slice(0, DETAIL_ANIMALS_CAP);
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
    if (!folderName || folderName.includes('..') || /[\\/]/.test(folderName)) return null;
    try {
        return joinContained(basePath, folderName);
    } catch (_) {
        return null;
    }
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
    const scheme = sanitizeIdScheme(idScheme);
    const safeSeg = String(fileSegment).replace(/[^A-Za-z0-9._-]/g, '_').slice(-120);
    const root = path.resolve(String(userDataPath || ''));
    return joinContained(root, `livestock_detail_${srv.id}_${scheme}_${safeSeg}.json`);
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
 * across the same volume on NTFS. Retry x3 on EBUSY/EEXIST/EPERM with short backoff. Failure preserves the last-good target and staged bytes; no spin or destructive fallback.
 */
function writeJsonAtomic(p, obj) {
    return fileCommit.writeJsonAtomicSync(p, obj);
}

async function ftpDownloadOne(srv, remotePath, localPath) {
    const client = new ftp.Client(60000);
    client.ftp.verbose = false;
    try {
        await client.access(ftpAccessOptions(srv));
        return await fileCommit.downloadAndCommit(client, remotePath, localPath + '.tmp', localPath);
    } catch (error) {
        console.warn('[livestockDetail] FTP detail download failed: ' + error.message);
        return false;
    } finally { client.close(); }
}

async function ftpUploadOne(srv, localPath, remotePath) {
    const client = new ftp.Client(60000);
    client.ftp.verbose = false;
    try {
        await client.access(ftpAccessOptions(srv));
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
function indexCacheKey(srv, binding) {
    if (!binding) return String(srv.id);
    return `${srv.id}|${stateToken(binding.stateObject)}|${binding.fingerprint}|${binding.careerId}|${binding.sessionId}|${binding.ownerGeneration}`;
}

async function readDirtyIndex(srv, opts = {}) {
    if (!srv) return null;
    const userDataPath = opts.userDataPath || (require('electron').app.getPath('userData'));
    if (!explicitLegacy(srv)) {
        const binding = resourceBinding(srv, opts.serverStates);
        if (!binding || binding.unsupported) return null;
        const cacheKey = indexCacheKey(srv, binding);
        if (srv.mode === 'local') {
            const loaded = readXmlResource(getLocalSlotPath(srv, opts.getFs25DocumentsRoot), 'dirtyPens', null, binding);
            const view = loaded && dirtyViewFromPayload(loaded.payload, 0, loaded.record);
            if (!view) return null;
            view.bindingKey = cacheKey;
            dirtyIndexCache.set(cacheKey, view);
            return view;
        }
        const saved = readSelection(selectionFile(userDataPath, srv, 'dirtyPens', binding), {
            binding, kind: 'dirtyPens', resourceId: null,
        });
        if (!saved || !acceptResourcePayload('dirtyPens', saved.payload)) return null;
        const view = dirtyViewFromPayload(saved.payload, 0, saved.record);
        if (!view) return null;
        view.bindingKey = cacheKey;
        dirtyIndexCache.set(cacheKey, view);
        return view;
    }
    const indexPath = (srv.mode === 'local')
        ? getDirtyIndexPathLocal(srv, opts.getFs25DocumentsRoot)
        : getFtpDirtyIndexCachePath(userDataPath, srv);
    if (!indexPath || !fs.existsSync(indexPath)) return null;

    let mtimeMs = 0;
    try { mtimeMs = fs.statSync(indexPath).mtimeMs || 0; } catch (_) { /* ignore */ }
    const cached = dirtyIndexCache.get(srv.id);
    // Key the hit on the resolved file path too: the same server id can point at a
    // different save slot (or a different tmp dir in tests). Matching mtimeMs alone
    // then returns the previous slot's pens and integer UI ids stay unresolved.
    if (cached && cached.mtimeMs === mtimeMs && cached.indexPath === indexPath) return cached;

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
        indexPath,
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
const resourceDownloads = new Map();

function boundedFtpClient(client) {
    if (!client || typeof client.downloadTo !== 'function') return client;
    return {
        downloadTo(localPath, remotePath) {
            return boundedDownloadTo(client, localPath, remotePath, RESOURCE_XML_LIMIT);
        },
    };
}

function boundedDownloadTo(client, localPath, remotePath, maxBytes) {
    return new Promise((resolve, reject) => {
        let settled = false;
        let received = 0;
        let transferDone = false;
        let pipeDone = false;
        let transferError = null;
        const counter = new Transform({
            transform(chunk, _enc, callback) {
                const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
                received += buf.length;
                if (received > maxBytes) {
                    callback(new Error('resource-too-large'));
                    return;
                }
                callback(null, buf);
            },
        });
        const file = fs.createWriteStream(localPath);
        const fail = (error) => {
            if (settled) return;
            settled = true;
            const err = error instanceof Error ? error : new Error('resource-transfer-failed');
            const closed = file.closed
                ? Promise.resolve()
                : new Promise((done) => file.once('close', done));
            counter.destroy();
            file.destroy();
            closed.then(() => fs.unlink(localPath, () => reject(err)));
        };
        const consider = () => {
            if (settled || !transferDone || !pipeDone) return;
            if (transferError || received <= 0) {
                fail(transferError || new Error('resource-transfer-failed'));
                return;
            }
            settled = true;
            resolve();
        };
        pipeline(counter, file, (error) => {
            pipeDone = true;
            if (error) fail(error);
            else consider();
        });
        const transfer = Promise.resolve()
            .then(() => client.downloadTo(counter, remotePath))
            .then(() => {
                transferDone = true;
                if (!settled && counter.writable && !counter.writableEnded) counter.end();
                consider();
            }, (error) => {
                transferError = error instanceof Error ? error : new Error('resource-transfer-failed');
                transferDone = true;
                counter.destroy(transferError);
                fail(transferError);
            });
        transfer.catch(() => {});
    });
}

function validateStagedResource(tmp, binding, kind, penKey) {
    const xml = readBoundedFile(tmp, RESOURCE_XML_LIMIT);
    if (!xml) throw new Error('resource-bounds');
    const decoded = decodeEnvelope(xml, { careerId: binding.careerId });
    if (!decoded || decoded.status !== 'valid' || !decoded.record || !decoded.json) throw new Error('resource-invalid');
    if (decoded.record.sessionId !== binding.sessionId || decoded.record.careerId !== binding.careerId) {
        throw new Error('resource-binding');
    }
    if (!acceptResourcePayload(kind, decoded.json, penKey)) throw new Error('resource-shape');
    return decoded;
}

async function downloadResource(srv, remotePath, localPath, sharedClient, canCommit, validate) {
    const bindingKey = `${srv && srv.id}|${remotePath}|${localPath}`;
    const existing = resourceDownloads.get(bindingKey);
    if (existing) return existing;
    const work = (async () => {
        const commit = typeof canCommit === 'function' ? canCommit : () => true;
        const options = { maxAttempts: 1, canCommit: commit };
        if (typeof validate === 'function') options.validate = validate;
        if (sharedClient && typeof sharedClient.downloadTo === 'function') {
            return fileCommit.downloadAndCommit(boundedFtpClient(sharedClient), remotePath, localPath + '.tmp', localPath, options);
        }
        const client = new ftp.Client(60000);
        client.ftp.verbose = false;
        try {
            await client.access(ftpAccessOptions(srv));
            return await fileCommit.downloadAndCommit(boundedFtpClient(client), remotePath, localPath + '.tmp', localPath, options);
        } catch (error) {
            console.warn('[livestockDetail] FTP detail download failed: ' + error.message);
            return false;
        } finally {
            client.close();
        }
    })();
    resourceDownloads.set(bindingKey, work);
    try {
        return await work;
    } finally {
        if (resourceDownloads.get(bindingKey) === work) resourceDownloads.delete(bindingKey);
    }
}

const pairJobs = new Map();
const stateTokens = new WeakMap();
let stateTokenSeq = 1;

function stateToken(state) {
    if (!state || typeof state !== 'object') return '0';
    let token = stateTokens.get(state);
    if (!token) {
        token = String(++stateTokenSeq);
        stateTokens.set(state, token);
    }
    return token;
}

function selectionFile(userDataPath, srv, kind, binding, resourceId) {
    const tail = resourceId ? `_${resourceId}` : '_index';
    return path.join(userDataPath, `livestock_sel_${srv.id}_${binding.fingerprint}_${binding.careerId}_${binding.sessionId}_${kind}${tail}.json`);
}

const SELECTION_JSON_LIMIT = RESOURCE_XML_LIMIT + 65536;
const RECORD_FIELDS = ['schema', 'careerId', 'sessionId', 'publicationSequence', 'exportGeneration', 'simulationTimeMs', 'encoding', 'bytes', 'crc'];

function readSelection(file, expected) {
    const binding = expected && expected.binding;
    if (!binding || (expected.kind !== 'dirtyPens' && expected.kind !== 'penDetail')) return null;
    const text = readBoundedFile(file, SELECTION_JSON_LIMIT);
    if (!text) return null;
    let parsed;
    try { parsed = JSON.parse(text); } catch (_) { return null; }
    if (!parsed || parsed.version !== 1 || typeof parsed.xml !== 'string') return null;
    if (parsed.kind !== expected.kind) return null;
    if ((parsed.resourceId || null) !== (expected.resourceId || null)) return null;
    if (parsed.careerId !== binding.careerId || parsed.sessionId !== binding.sessionId) return null;
    if (parsed.fingerprint !== binding.fingerprint) return null;
    if (binding.sourceSlot && parsed.sourceSlot && parsed.sourceSlot !== binding.sourceSlot) return null;
    if (!Number.isFinite(Number(parsed.validatedAt))) return null;
    const decoded = decodeEnvelope(parsed.xml, { careerId: binding.careerId });
    if (!decoded || decoded.status !== 'valid' || !decoded.json || !decoded.record) return null;
    if (decoded.record.careerId !== binding.careerId || decoded.record.sessionId !== binding.sessionId) return null;
    if (!acceptResourcePayload(expected.kind, decoded.json, expected.penKey)) return null;
    return {
        payload: decoded.json,
        record: decoded.record,
        xml: parsed.xml,
        validatedAt: Number(parsed.validatedAt),
    };
}

function sameCommittedContent(saved, selected) {
    if (!saved || !selected || !saved.record || !selected.record || typeof selected.xml !== 'string') return false;
    for (const field of RECORD_FIELDS) {
        if (String(saved.record[field]) !== String(selected.record[field])) return false;
    }
    return saved.xml === selected.xml;
}

function committedDecision(saved, selected) {
    if (!saved || !saved.record) return 'newer';
    if (!selected || !selected.record) return 'older';
    const savedSeq = Number(saved.record.publicationSequence);
    const nextSeq = Number(selected.record.publicationSequence);
    if (!Number.isInteger(savedSeq) || !Number.isInteger(nextSeq)) return 'conflict';
    if (nextSeq < savedSeq) return 'older';
    if (nextSeq > savedSeq) return 'newer';
    return sameCommittedContent(saved, selected) ? 'unchanged' : 'conflict';
}

async function publishSelection(file, selected, binding, kind, resourceId, canCommit) {
    if (!canCommit() || !selected || typeof selected.xml !== 'string') return false;
    const validatedAt = Date.now();
    const incoming = `${file}.${crypto.randomBytes(4).toString('hex')}.incoming`;
    const body = JSON.stringify({
        version: 1,
        xml: selected.xml,
        kind,
        resourceId: resourceId || null,
        fingerprint: binding.fingerprint,
        careerId: binding.careerId,
        sessionId: binding.sessionId,
        sourceSlot: binding.sourceSlot,
        validatedAt,
    });
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    await fs.promises.writeFile(incoming, body, { flag: 'wx' });
    if (!canCommit()) {
        await fs.promises.unlink(incoming).catch(() => {});
        return false;
    }
    await fs.promises.rename(incoming, file);
    return canCommit() ? validatedAt : false;
}

async function stageResourcePair(srv, client, remotes, binding, kind, penKey, canCommit) {
    const stage = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'fd-resource-'));
    const documents = [];
    try {
        for (const remote of remotes) {
            if (!canCommit()) return { status: 'superseded', documents };
            const local = path.join(stage, `slot-${documents.length}.xml`);
            const ok = await downloadResource(srv, remote, local, client, canCommit, (tmp) => {
                validateStagedResource(tmp, binding, kind, penKey);
            });
            if (!canCommit()) return { status: 'superseded', documents };
            documents.push(ok ? readBoundedXml(local) : null);
        }
        return { status: 'staged', documents };
    } finally {
        fs.rm(stage, { recursive: true, force: true }, () => {});
    }
}

const RESOURCE_GLOBAL_LIMIT = 4;
const RESOURCE_SOURCE_LIMIT = 2;
const RESOURCE_QUEUE_LIMIT = 32;
let resourceGlobalActive = 0;
const resourceSourceActive = new Map();
const resourceWaiters = [];

function resourceAdmissionSnapshot() {
    return {
        globalActive: resourceGlobalActive,
        queued: resourceWaiters.length,
        globalLimit: RESOURCE_GLOBAL_LIMIT,
        sourceLimit: RESOURCE_SOURCE_LIMIT,
    };
}

function admitCountsAllow(sourceId) {
    return resourceGlobalActive < RESOURCE_GLOBAL_LIMIT
        && (resourceSourceActive.get(sourceId) || 0) < RESOURCE_SOURCE_LIMIT;
}

function takeAdmit(sourceId) {
    resourceGlobalActive += 1;
    resourceSourceActive.set(sourceId, (resourceSourceActive.get(sourceId) || 0) + 1);
}

function pumpAdmission() {
    for (let index = 0; index < resourceWaiters.length;) {
        const waiter = resourceWaiters[index];
        if (!admitCountsAllow(waiter.sourceId)) {
            index += 1;
            continue;
        }
        resourceWaiters.splice(index, 1);
        takeAdmit(waiter.sourceId);
        waiter.resolve(() => releaseAdmit(waiter.sourceId));
    }
}

function releaseAdmit(sourceId) {
    resourceGlobalActive -= 1;
    const next = (resourceSourceActive.get(sourceId) || 1) - 1;
    if (next <= 0) resourceSourceActive.delete(sourceId);
    else resourceSourceActive.set(sourceId, next);
    pumpAdmission();
}

function admit(sourceId) {
    if (admitCountsAllow(sourceId)) {
        takeAdmit(sourceId);
        return Promise.resolve(() => releaseAdmit(sourceId));
    }
    if (resourceWaiters.length >= RESOURCE_QUEUE_LIMIT) return Promise.resolve(null);
    return new Promise((resolve) => {
        resourceWaiters.push({ sourceId, resolve });
    });
}

function runPairJob(sourceId, key, work) {
    const existing = pairJobs.get(key);
    if (existing) return existing;
    const job = (async () => {
        const release = await admit(sourceId);
        if (!release) return { status: 'overloaded' };
        try {
            return await work();
        } finally {
            release();
        }
    })();
    const settled = job.finally(() => {
        if (pairJobs.get(key) === settled) pairJobs.delete(key);
    });
    pairJobs.set(key, settled);
    return settled;
}

async function ftpRefreshDirtyIndex(srv, opts) {
    if (!srv || srv.mode !== 'ftp') return false;
    const userDataPath = (opts && opts.userDataPath) || (require('electron').app.getPath('userData'));
    const slotRemote = (opts && opts.slotRemote) || ftpRemoteSlotPath(srv, opts && opts.serverStates);
    if (explicitLegacy(srv)) {
        const remote = `${slotRemote}/dirtyPens.json`;
        const local = getFtpDirtyIndexCachePath(userDataPath, srv);
        const ok = await ftpDownloadOne(srv, remote, local);
        if (ok) dirtyIndexCache.delete(String(srv.id));
        return ok;
    }
    const binding = resourceBinding(srv, opts && opts.serverStates);
    if (!binding || binding.unsupported || !bindingStill(srv, opts && opts.serverStates, binding)) return false;
    const key = `${srv.id}|${stateToken(binding.stateObject)}|${binding.fingerprint}|${binding.careerId}|${binding.sessionId}|dirtyPens`;
    const result = await runPairJob(String(srv.id), key, () => refreshDirtyPair(srv, opts, binding, userDataPath, slotRemote));
    return result === true;
}

async function refreshDirtyPair(srv, opts, binding, userDataPath, slotRemote) {
    const canCommit = () => {
        if (opts && typeof opts.canCommit === 'function' && !opts.canCommit()) return false;
        return bindingStill(srv, opts && opts.serverStates, binding);
    };
    const owned = opts && opts.client ? null : new ftp.Client(60000);
    if (owned) {
        owned.ftp.verbose = false;
        try { await owned.access(ftpAccessOptions(srv)); } catch (error) {
            owned.close();
            return false;
        }
    }
    const client = owned || opts.client;
    try {
        if (!canCommit()) return false;
        const remotes = ['slot-a.xml', 'slot-b.xml'].map((name) => `${slotRemote}/${binding.careerId}/resources/dirtyPens/${name}`);
        const staged = await stageResourcePair(srv, client, remotes, binding, 'dirtyPens', null, canCommit);
        if (staged.status !== 'staged' || !canCommit()) return false;
        const selected = exportIngress.selectResourceSelection(staged.documents, {
            careerId: binding.careerId,
            sessionId: binding.sessionId,
            accept: (payload) => acceptResourcePayload('dirtyPens', payload),
        });
        const saved = readSelection(selectionFile(userDataPath, srv, 'dirtyPens', binding), {
            binding, kind: 'dirtyPens', resourceId: null,
        });
        if (!selected || selected.status !== 'valid') return false;
        const decision = committedDecision(saved, selected);
        if (decision === 'older' || decision === 'conflict') return false;
        if (decision === 'unchanged') return true;
        const published = await publishSelection(selectionFile(userDataPath, srv, 'dirtyPens', binding), selected, binding, 'dirtyPens', null, canCommit);
        if (!published) return false;
        for (const cacheKey of Array.from(modernDetailCache.keys())) {
            if (String(cacheKey).startsWith(`${srv.id}|${binding.fingerprint}|`)) modernDetailCache.delete(cacheKey);
        }
        return true;
    } finally {
        if (owned) owned.close();
    }
}

async function fetchModernDetailPair(srv, serverStates, userDataPath, binding, resolvedPenKey, resourceId) {
    const file = selectionFile(userDataPath, srv, 'penDetail', binding, resourceId);
    const expected = { binding, kind: 'penDetail', resourceId, penKey: resolvedPenKey };
    const canCommit = () => bindingStill(srv, serverStates, binding);
    const saved = readSelection(file, expected);
    const retained = () => (saved && canCommit()
        ? { detail: saved.payload, record: saved.record, fromCache: true, cachedAtMs: saved.validatedAt }
        : null);
    const owned = new ftp.Client(60000);
    owned.ftp.verbose = false;
    try {
        try {
            await owned.access(ftpAccessOptions(srv));
        } catch (_) {
            return retained();
        }
        if (!canCommit()) return null;
        const slotRemote = ftpRemoteSlotPath(srv, serverStates);
        const remotes = ['slot-a.xml', 'slot-b.xml'].map((name) => `${slotRemote}/${binding.careerId}/resources/penDetail/${resourceId}/${name}`);
        const staged = await stageResourcePair(srv, owned, remotes, binding, 'penDetail', resolvedPenKey, canCommit);
        if (staged.status !== 'staged' || !canCommit()) return null;
        const selected = exportIngress.selectResourceSelection(staged.documents, {
            careerId: binding.careerId,
            sessionId: binding.sessionId,
            accept: (payload) => acceptResourcePayload('penDetail', payload, resolvedPenKey),
        });
        if (!canCommit()) return null;
        if (!selected || selected.status !== 'valid') return retained();
        const decision = committedDecision(saved, selected);
        if (decision === 'older' || decision === 'conflict' || decision === 'unchanged') return retained();
        const published = await publishSelection(file, selected, binding, 'penDetail', resourceId, canCommit);
        if (!published || !canCommit()) return retained();
        return { detail: selected.payload, record: selected.record, fromCache: false, cachedAtMs: published };
    } finally {
        owned.close();
    }
}

async function loadModernFtpDetail(srv, serverStates, userDataPath, binding, resolvedPenKey, resourceId, dirtyIndex) {
    const cacheKey = `${srv.id}|${stateToken(binding.stateObject)}|${binding.fingerprint}|${binding.careerId}|${binding.sessionId}|${resourceId}|${dirtyIndex && dirtyIndex.resourceSequence}`;
    const cachedDetail = modernDetailCache.get(cacheKey);
    const fresh = cachedDetail
        && cachedDetail.stateObject === binding.stateObject
        && bindingStill(srv, serverStates, binding)
        && (Date.now() - cachedDetail.checkedAt) < MODERN_DETAIL_FRESH_MS;
    if (fresh) {
        return { detail: cachedDetail.payload, fromCache: true, cachedAtMs: cachedDetail.cachedAtMs };
    }
    const jobKey = `${srv.id}|${stateToken(binding.stateObject)}|${binding.fingerprint}|${binding.careerId}|${binding.sessionId}|penDetail|${resourceId}`;
    const loaded = await runPairJob(String(srv.id), jobKey, () => fetchModernDetailPair(
        srv, serverStates, userDataPath, binding, resolvedPenKey, resourceId,
    ));
    if (!loaded || loaded.status === 'overloaded' || !loaded.detail || !bindingStill(srv, serverStates, binding)) return null;
    if (modernDetailCache.size > 512) modernDetailCache.delete(modernDetailCache.keys().next().value);
    modernDetailCache.set(cacheKey, {
        payload: loaded.detail,
        record: loaded.record,
        stateObject: binding.stateObject,
        checkedAt: Date.now(),
        cachedAtMs: loaded.cachedAtMs,
    });
    return loaded;
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
    const { canonicalKey } = parsed;

    const serverId = (typeof resolveServerIdForRequest === 'function') ? resolveServerIdForRequest(req) : null;
    const srv = getServerById(servers, serverId);
    if (!srv) return null;

    const userDataPath = (serverStates && serverStates[srv.id] && serverStates[srv.id].userDataPath) ||
        require('electron').app.getPath('userData');

    const dirtyIndex = await readDirtyIndex(srv, { userDataPath, getFs25DocumentsRoot, serverStates });
    const resolvedPenKey = resolvePenKeyForRead(canonicalKey, dirtyIndex);
    if (!resolvedPenKey) return null;
    const fileSegment = penKeyToFilenameSegment(resolvedPenKey);
    const dirtyAt = resolveDirtyTs(dirtyIndex, resolvedPenKey);
    const idScheme = (dirtyIndex && dirtyIndex.idScheme) || 'integer-v1';
    const animalMode = (dirtyIndex && dirtyIndex.animalMode) || 'unknown';

    let detail = null;
    let cachedAtMs = 0;
    let fromCache = false;
    let locatedPenKey = null;

    if (srv.mode === 'local') {
        const slotDir = getLocalSlotPath(srv, getFs25DocumentsRoot);
        if (!explicitLegacy(srv)) {
            const binding = resourceBinding(srv, serverStates);
            if (!binding || binding.unsupported || !bindingStill(srv, serverStates, binding)) return null;
            const loaded = readXmlResource(slotDir, 'penDetail', resolvedPenKey, binding);
            if (!loaded || !bindingStill(srv, serverStates, binding)) return null;
            detail = loaded.payload;
        } else {
            const detailsDir = slotDir ? path.join(slotDir, 'details') : null;
            const located = findDetailInDirectory(detailsDir, canonicalKey, resolvedPenKey);
            const p = located ? located.path : getDetailPathLocal(srv, fileSegment, getFs25DocumentsRoot);
            if (!p || !fs.existsSync(p)) return null;
            try { cachedAtMs = fs.statSync(p).mtimeMs || 0; } catch (_) { /* ignore */ }
            detail = readJsonSafe(p);
        }
        fromCache = false;
    } else if (srv.mode === 'ftp' && !explicitLegacy(srv)) {
        const binding = resourceBinding(srv, serverStates);
        const resourceId = resourceIdForPen(resolvedPenKey);
        if (!binding || binding.unsupported || !resourceId || !bindingStill(srv, serverStates, binding)) return null;
        const loaded = await loadModernFtpDetail(srv, serverStates, userDataPath, binding, resolvedPenKey, resourceId, dirtyIndex);
        if (!loaded) return null;
        detail = loaded.detail;
        cachedAtMs = loaded.cachedAtMs;
        fromCache = loaded.fromCache;
    } else if (srv.mode === 'ftp') {
        const localCache = getFtpDetailCachePath(userDataPath, srv, idScheme, fileSegment);
        const slotRemote = ftpRemoteSlotPath(srv, serverStates);
        const remote = `${slotRemote}/details/animals_${fileSegment}.json`;
        const bulkDetailsDir = getFtpDetailsCacheDir(userDataPath, srv, serverStates);

        const validationKey = localCache + '|' + JSON.stringify([srv.ftpHost, srv.ftpPort, slotRemote]);
        const previousValidation = detailValidation.get(validationKey);
        const needsFetch = !fs.existsSync(localCache) || !previousValidation
            || previousValidation.dirtyAt !== dirtyAt
            || Date.now() - previousValidation.checkedAt >= 60000;

        if (needsFetch) {
            const ok = await ftpDownloadOne(srv, remote, localCache);
            if (ok) {
                detailValidation.set(validationKey, { dirtyAt, checkedAt: Date.now() });
                if (detailValidation.size > 512) detailValidation.delete(detailValidation.keys().next().value);
            }
            if (!ok && !fs.existsSync(localCache)) {
                const located = findDetailInDirectory(bulkDetailsDir, canonicalKey, resolvedPenKey);
                if (!located) return null;
                if (located.penKey) locatedPenKey = located.penKey;
                try { cachedAtMs = fs.statSync(located.path).mtimeMs || 0; } catch (_) { /* ignore */ }
                detail = readJsonSafe(located.path);
                fromCache = true;
            } else {
                fromCache = !ok;
            }
        } else {
            fromCache = true;
        }

        if (!detail) {
            const located = fs.existsSync(localCache)
                ? null
                : findDetailInDirectory(bulkDetailsDir, canonicalKey, resolvedPenKey);
            if (located && located.penKey) locatedPenKey = located.penKey;
            const readPath = fs.existsSync(localCache)
                ? localCache
                : (located && located.path);
            if (!readPath || !fs.existsSync(readPath)) return null;
            try { cachedAtMs = fs.statSync(readPath).mtimeMs || 0; } catch (_) { /* ignore */ }
            detail = readJsonSafe(readPath);
        }
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
        penKey: locatedPenKey || resolvedPenKey,
        detail: sanitizeDetailDoc(detail),
    };
}

/**
 * Plan v5 A4: write a hardened, bounded, schema-versioned requests.json that the mod polls.
 * - Validates :id is a positive 31-bit integer.
 * - Drops entries older than REQUESTS_MAX_AGE_SEC and caps to REQUESTS_MAX_ENTRIES.
 * - Writes locally first; FTP upload is best-effort and never blocks the HTTP response.
 */
function selectedRequestSlot(identity) {
    if (!identity || typeof identity !== 'object') return '';
    const source = identity.sourceSlot ? String(identity.sourceSlot) : '';
    const configured = identity.configuredSlot ? String(identity.configuredSlot) : '';
    if (source && configured && source !== configured) return '';
    return source || configured;
}

function requestDestination(srv, state) {
    if (srv && srv.mode === 'ftp') {
        return String((state && state.lastSaveSlot) || (srv && srv.localSubFolder) || '');
    }
    return String((srv && srv.localSubFolder) || '');
}

function captureRequestContext(srv, serverStates) {
    const state = serverStates && srv && serverStates[srv.id];
    if (!state || state.active === false) return null;
    if (srv.replicaRemoteSlot || state.ingressKind === 'replica') return null;
    const identity = state.exportIdentity;
    if (identity && identity.replica === true) return null;
    const destination = requestDestination(srv, state);
    if (!destination) return null;
    if (explicitLegacy(srv)) return { state, legacy: true, destination };
    if (!identity || typeof identity !== 'object' || Array.isArray(identity)) return null;
    if (!identity.careerId || !identity.sessionId) return null;
    const selected = selectedRequestSlot(identity);
    if (!selected || selected !== destination) return null;
    const binding = resourceBinding(srv, serverStates);
    if (!binding || binding.unsupported || !bindingStill(srv, serverStates, binding)) return null;
    return { state, binding, destination, selected };
}

function requestContextStill(srv, serverStates, captured) {
    if (!captured || !srv) return false;
    const live = serverStates && serverStates[srv.id];
    if (!live || live !== captured.state || live.active === false) return false;
    if (requestDestination(srv, live) !== captured.destination) return false;
    if (captured.legacy) return explicitLegacy(srv);
    return bindingStill(srv, serverStates, captured.binding) && captured.selected === captured.destination;
}

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
    const captured = srv && captureRequestContext(srv, serverStates);
    if (!captured) return false;

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
        if (!p || path.basename(path.dirname(p)) !== captured.destination || !requestContextStill(srv, serverStates, captured)) return false;
        const doc = buildRequestsDoc(readJsonSafe(p));
        if (!requestContextStill(srv, serverStates, captured)) return false;
        return writeJsonAtomic(p, doc);
    }

    if (srv.mode === 'ftp') {
        if (!requestContextStill(srv, serverStates, captured)) return false;
        const userDataPath = (serverStates && serverStates[srv.id] && serverStates[srv.id].userDataPath) ||
            require('electron').app.getPath('userData');
        const localCache = getFtpRequestsCachePath(userDataPath, srv);
        const slotRemote = ftpRemoteSlotPath(srv, serverStates);
        const remote = `${slotRemote}/requests.json`;
        const doc = buildRequestsDoc(readJsonSafe(localCache));
        if (!requestContextStill(srv, serverStates, captured)) return false;
        const wrote = writeJsonAtomic(localCache, doc);
        if (!wrote || !requestContextStill(srv, serverStates, captured)) return false;
        queueFtpUpload(srv, localCache, remote);
        return true;
    }

    return false;
}

const reconcileSlots = new WeakMap();

function reconcileDirtyWatch(options) {
    const state = options && options.state;
    const ownedNow = options && options.ownedNow;
    if (!state || typeof ownedNow !== 'function' || !ownedNow()) return;
    let slot = reconcileSlots.get(state);
    if (!slot) {
        slot = { generation: 0, pending: null, desired: undefined };
        reconcileSlots.set(state, slot);
    }
    const desired = options.desired || null;
    if (slot.pending && slot.desired === desired) return slot.pending;
    const generation = ++slot.generation;
    slot.desired = desired;
    const current = () => slot.generation === generation && ownedNow();
    const job = reconcileDirtyBody(options, state, desired, ownedNow, current).finally(() => {
        if (slot.pending === job) slot.pending = null;
    });
    slot.pending = job;
    return job;
}

async function reconcileDirtyBody(options, state, desired, ownedNow, current) {
    const closeHandle = (handle) => {
        if (!handle) return;
        try { handle.close(); } catch (_) { /* owned release */ }
    };
    if (!current()) return;
    if (!desired) {
        closeHandle(state.dirtyPensWatcher);
        state.dirtyPensWatcher = null;
        state.dirtyArmedTarget = null;
        state.dirtyWatchTarget = null;
        return;
    }
    if (state.dirtyPensWatcher && state.dirtyArmedTarget === desired) return;
    closeHandle(state.dirtyPensWatcher);
    state.dirtyPensWatcher = null;
    state.dirtyArmedTarget = null;
    if (!current()) return;
    const exists = await options.pathExists(desired);
    if (!current()) return;
    if (!exists) return;
    if (state.dirtyPensWatcher && state.dirtyArmedTarget === desired) return;
    let handle = null;
    try {
        handle = options.fsImpl.watch(desired, { persistent: false }, () => {
            if (!ownedNow()) return;
            if (typeof options.onEvent === 'function') options.onEvent();
        });
    } catch (_) {
        if (current()) {
            state.dirtyPensWatcher = null;
            state.dirtyArmedTarget = null;
        }
        return;
    }
    if (!current() || (state.dirtyPensWatcher && state.dirtyArmedTarget === desired)) {
        closeHandle(handle);
        return;
    }
    handle.on('error', () => {
        closeHandle(handle);
        if (state.dirtyPensWatcher === handle) {
            state.dirtyPensWatcher = null;
            state.dirtyArmedTarget = null;
        }
    });
    if (!current()) {
        closeHandle(handle);
        return;
    }
    state.dirtyPensWatcher = handle;
    state.dirtyArmedTarget = desired;
    state.dirtyWatchTarget = desired;
}

module.exports = {
    read,
    request,
    readDirtyIndex,
    ftpRefreshDirtyIndex,
    dirtyIndexWatchPath,
    reconcileDirtyWatch,
    validatePenId,
    parsePenKeyForRead,
    penKeyToFilenameSegment,
    resolvePenKeyForRead,
    findDetailInDirectory,
    bustDirtyIndexCache,
    resourceIdForPen,
    boundedDownloadTo,
    resourceAdmissionSnapshot,
    // exported for tests / parity tooling
    REQUESTS_SCHEMA_VERSION,
    DIRTY_SCHEMA_VERSION,
    DETAIL_SCHEMA_VERSION,
    REQUESTS_MAX_ENTRIES,
    REQUESTS_MAX_AGE_SEC,
    ID_SCHEME_TS_TOLERANCE_SEC,
};
