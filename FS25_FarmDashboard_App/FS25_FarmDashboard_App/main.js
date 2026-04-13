// FS25 FarmDashboard | main.js | v2.0.0
// Authors: JoshWalki, WizardlyPayload
// Electron main: Express + WS on 8766, chokidar/FTP → mergeData → renderer.

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const url  = require('url');
const crypto = require('crypto');
const { spawn } = require('child_process');

const express   = require('express');
const http      = require('http');
const WebSocket = require('ws');
const cors      = require('cors');
const chokidar  = require('chokidar');
const ftp       = require('basic-ftp');
const Store     = require('electron-store');

const LAN_ACCESS_DEFAULTS = {
    lanAccessEnabled: false,
    lanUsername:      'admin',
    lanPassword:      'farmhub',
    lanAllowedIPs:    '',
};

const {
    collectXmlData,
    SAVEGAME_XML_FILES,
    FTP_SAVEGAME_XML_DOWNLOAD_ORDER,
} = require('./xmlCollector');
const { mergeData, buildFieldLiveFingerprints } = require('./dataMerger');
const { loadServerCache, saveServerCache, appendFieldHistory } = require('./serverDataCache');
const { initAppUpdater, checkForUpdatesNow } = require('./app-updater');

const store = new Store({ defaults: { ...LAN_ACCESS_DEFAULTS } });

/** Random secret for POST /api/setup-config (browser cannot save config without this header). */
/** Opaque token for WebSocket `?t=` — browsers cannot send Basic auth on WS handshakes. */
function ensureLanWsSecret() {
    let s = store.get('lanWsSecret');
    if (typeof s === 'string' && s.length >= 16) return s;
    s = crypto.randomBytes(24).toString('hex');
    store.set('lanWsSecret', s);
    return s;
}

function ensureSetupWriteToken() {
    let t = store.get('farmdashSetupWriteToken');
    if (typeof t === 'string' && t.length >= 16) return t;
    t = crypto.randomBytes(32).toString('hex');
    store.set('farmdashSetupWriteToken', t);
    return t;
}

/** Optional release branding — copy branding.example.json → branding.json (do not commit secrets). */
let _brandingLoaded = false;
let _brandingCache = {};

function loadBrandingFromDisk() {
    if (_brandingLoaded) return _brandingCache;
    _brandingLoaded = true;
    const candidates = [];
    if (process.resourcesPath) {
        candidates.push(path.join(process.resourcesPath, 'branding.json'));
    }
    candidates.push(path.join(__dirname, 'branding.json'));
    for (const p of candidates) {
        try {
            if (fs.existsSync(p)) {
                const raw = JSON.parse(stripUtf8Bom(fs.readFileSync(p, 'utf8')));
                if (raw && typeof raw === 'object') {
                    _brandingCache = raw;
                    console.log('[branding] loaded', p);
                    return _brandingCache;
                }
            }
        } catch (e) {
            console.warn('[branding]', p, e.message);
        }
    }
    return _brandingCache;
}

function mergeBrandingIntoAiManagerConnection() {
    const b = loadBrandingFromDisk();
    const cur = store.get('aiManagerConnection') || {};
    const next = { ...cur };
    let changed = false;
    const defUrl = String(b.defaultAiBackendUrl || '').trim().replace(/\/$/, '');
    const embKey = String(b.embeddedFarmdashIntegrationKey || '').trim();
    if (defUrl && !next.baseUrl) {
        next.baseUrl = defUrl;
        changed = true;
    }
    if (embKey && !next.integrationKey) {
        next.integrationKey = embKey;
        changed = true;
    }
    if (b.pushSnapshotsDefault === true && next.pushSnapshots === undefined) {
        next.pushSnapshots = true;
        changed = true;
    }
    if (changed) {
        store.set('aiManagerConnection', {
            baseUrl: next.baseUrl || '',
            integrationKey: next.integrationKey || '',
            pushSnapshots: !!next.pushSnapshots,
        });
    }
}

const VALID_LOCALE_RE = /^[a-z]{2}$/;

/** Written by the NSIS installer (first page); consumed on first app launch. */
function consumeInstallLocaleFile() {
    try {
        const p = path.join(app.getPath('userData'), 'install-locale.txt');
        if (!fs.existsSync(p)) return;
        const raw = stripUtf8Bom(fs.readFileSync(p, 'utf8')).trim();
        const code = (raw.split(/\r?\n/)[0] || '').substring(0, 2).toLowerCase();
        if (VALID_LOCALE_RE.test(code)) store.set('locale', code);
        fs.unlinkSync(p);
    } catch (e) {
        console.warn('[install-locale]', e.message);
    }
}

function getSetupLoadOptions() {
    const l = store.get('locale');
    if (l && typeof l === 'string' && VALID_LOCALE_RE.test(l)) return { query: { lang: l } };
    return {};
}

function loadSetupWindow() {
    if (!mainWindow) return;
    const opts = getSetupLoadOptions();
    const q = opts && opts.query && opts.query.lang
        ? ('?lang=' + encodeURIComponent(opts.query.lang))
        : '';
    if (server.listening) {
        mainWindow.loadURL(`http://127.0.0.1:${PORT}/setup.html${q}`);
    } else {
        mainWindow.loadFile(path.join(__dirname, 'setup.html'), opts);
    }
}

/** PowerShell 5.1 `Set-Content -Encoding utf8` writes UTF-8 BOM; JSON.parse rejects it. */
function stripUtf8Bom(s) {
    if (typeof s !== 'string' || s.length === 0) return s;
    return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}
let mainWindow;
let serverStates = {};   // id → { luaData, xmlData, mergedData, watcher, intervals[] }
/** Timeouts/intervals for coordinated multi-FTP polling (cleared in stopAllWatchers). */
let ftpPollingTimers = [];
/** Throttle AI snapshot push per server (outbound POST to VPS — no open ports on this PC). */
const AI_SNAPSHOT_PUSH_MIN_MS = 30000;
let lastAiSnapshotPushAt = {};
let aiSnapshotPushInterval = null;
/** Debounce writing serverLiveCache JSON to disk after merge. */
const serverCacheSaveTimers = {};

/** Avoid flooding the console when the AI Farm Manager host is down (many UI polls hit the proxy). */
let lastAiBackendUnreachableLogAt = 0;
const AI_BACKEND_ERROR_LOG_THROTTLE_MS = 60000;

function logAiBackendUnreachableOnce(context, err, baseUrlHint) {
    const now = Date.now();
    if (now - lastAiBackendUnreachableLogAt < AI_BACKEND_ERROR_LOG_THROTTLE_MS) return;
    lastAiBackendUnreachableLogAt = now;
    const c = err && err.cause;
    const code = c && c.code ? c.code : '';
    let detail = err && err.message ? String(err.message) : String(err);
    if (code === 'ECONNREFUSED') {
        detail =
            'connection refused (nothing is listening on that host:port - start the AI Farm Manager service on the VPS or open the firewall for that port)';
    } else if (code === 'ENOTFOUND') {
        detail = 'host not found (check AI server URL / DNS)';
    } else if (code === 'ETIMEDOUT') {
        detail = 'connection timed out (firewall or wrong host)';
    }
    console.warn(
        `[AI backend] ${context}: ${detail}` + (baseUrlHint ? ` | ${baseUrlHint}` : '')
    );
}

/** PowerShell script: repo tools/ or packaged resources/tools/ */
function getModExportScriptPath() {
    if (app.isPackaged) {
        const p = path.join(process.resourcesPath, 'tools', 'Export-ModStoreImages.ps1');
        if (fs.existsSync(p)) return p;
    }
    return path.join(__dirname, '..', '..', 'tools', 'Export-ModStoreImages.ps1');
}

/** Optional bundled DirectXTex texconv (place at resources/texconv/texconv.exe). */
function getBundledTexconvPath() {
    const candidates = [
        path.join(__dirname, 'resources', 'texconv', 'texconv.exe'),
        path.join(process.resourcesPath || '', 'texconv', 'texconv.exe')
    ];
    for (const p of candidates) {
        if (p && fs.existsSync(p)) return p;
    }
    return null;
}

function sendModExportProgress(sender, payload) {
    if (!sender || sender.isDestroyed()) return;
    try {
        sender.send('export-mod-store-images-progress', payload);
    } catch (e) {
        /* ignore */
    }
}

function createPowerShellLineSplitter(onLine) {
    let buf = '';
    return {
        push(chunk) {
            buf += chunk.toString('utf8');
            const parts = buf.split(/\r?\n/);
            buf = parts.pop() || '';
            for (const line of parts) onLine(line);
        },
        flush() {
            if (buf) {
                onLine(buf);
                buf = '';
            }
        }
    };
}

/** Shared by ipcMain.handle and POST /api/export-mod-store-images (fallback when IPC is unavailable). */
async function runExportModStoreImages(progressSender) {
    if (process.platform !== 'win32') {
        const msg = 'Mod image export runs only on Windows (PowerShell + FS mods folder layout).';
        if (mainWindow) {
            await dialog.showMessageBox(mainWindow, { type: 'info', title: 'Mod shop images', message: msg, buttons: ['OK'] });
        }
        return { ok: false, error: msg };
    }

    const scriptPath = getModExportScriptPath();
    if (!fs.existsSync(scriptPath)) {
        const err = `Export script not found:\n${scriptPath}`;
        if (mainWindow) {
            await dialog.showMessageBox(mainWindow, { type: 'error', title: 'Mod shop images', message: err, buttons: ['OK'] });
        }
        return { ok: false, error: err };
    }

    const modsRoot = path.join(os.homedir(), 'Documents', 'My Games', 'FarmingSimulator2025', 'mods');
    const outputDir = path.join(__dirname, 'web', 'assests', 'img', 'items_mod_extract');
    const summaryJson = path.join(app.getPath('temp'), 'farmdash-mod-export-summary.json');
    try {
        if (fs.existsSync(summaryJson)) fs.unlinkSync(summaryJson);
    } catch (e) { /* ignore */ }

    const texconv = getBundledTexconvPath();
    const args = [
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath,
        '-ModsRoot', modsRoot,
        '-OutputDir', outputDir,
        '-SummaryJsonPath', summaryJson
    ];
    if (texconv) args.push('-TexconvPath', texconv);

    console.log('[export-mod-store-images] Starting PowerShell:', scriptPath);
    console.log('[export-mod-store-images] ModsRoot:', modsRoot);

    let stderr = '';
    let exitCode = -1;
    /** Avoid hung invoke() if PowerShell never exits (huge mod trees). */
    const MOD_EXPORT_POWERSHELL_MAX_MS = 90 * 60 * 1000;
    const emitStdoutLine = (line) => {
        const t = line.replace(/\r$/, '');
        process.stdout.write(t + '\n');
        const trimmed = t.trim();
        if (!trimmed) return;
        if (trimmed.startsWith('FD_JSON ')) {
            try {
                const obj = JSON.parse(trimmed.slice(8));
                sendModExportProgress(progressSender, obj);
            } catch (parseErr) {
                sendModExportProgress(progressSender, { type: 'log', line: trimmed });
            }
        } else {
            sendModExportProgress(progressSender, { type: 'log', line: trimmed });
        }
    };
    try {
        exitCode = await new Promise((resolve, reject) => {
            const stdoutSplitter = createPowerShellLineSplitter(emitStdoutLine);
            const child = spawn('powershell.exe', args, {
                windowsHide: true,
                cwd: path.dirname(scriptPath)
            });
            child.stdout.on('data', (d) => {
                stdoutSplitter.push(d);
            });
            child.stderr.on('data', (d) => {
                const s = d.toString('utf8');
                stderr += s;
                process.stderr.write(d);
                for (const line of s.split(/\r?\n/)) {
                    const x = line.trim();
                    if (x) sendModExportProgress(progressSender, { type: 'log', line: `[stderr] ${x}` });
                }
            });
            let settled = false;
            const timeoutId = setTimeout(() => {
                if (settled) return;
                settled = true;
                try { child.kill(); } catch (killErr) { /* ignore */ }
                reject(new Error('PowerShell export timed out (90 min). Try a smaller mods folder or run the script manually.'));
            }, MOD_EXPORT_POWERSHELL_MAX_MS);
            child.on('error', (err) => {
                clearTimeout(timeoutId);
                if (settled) return;
                settled = true;
                reject(err);
            });
            child.on('close', (code) => {
                stdoutSplitter.flush();
                clearTimeout(timeoutId);
                if (settled) return;
                settled = true;
                sendModExportProgress(progressSender, { type: 'done', exitCode: code });
                resolve(code);
            });
        });
    } catch (e) {
        const err = e && e.message ? e.message : String(e);
        const timedOut = /timed out/i.test(err);
        if (mainWindow) {
            await dialog.showMessageBox(mainWindow, {
                type: 'error',
                title: 'Mod shop images',
                message: timedOut ? 'Mod image export timed out or was stopped.' : 'Could not start PowerShell.',
                detail: err,
                buttons: ['OK']
            });
        }
        return { ok: false, error: err };
    }

    console.log('[export-mod-store-images] PowerShell exit code:', exitCode);

    let summary = null;
    try {
        if (fs.existsSync(summaryJson)) {
            const raw = stripUtf8Bom(fs.readFileSync(summaryJson, 'utf8'));
            summary = JSON.parse(raw);
        }
    } catch (e) {
        console.warn('[export-mod-store-images] summary parse:', e.message);
    }

    if (!summary) {
        const detail = [
            stderr || '(no stderr)',
            '',
            `PowerShell exit code: ${exitCode}`,
            `Script: ${scriptPath}`
        ].join('\n');
        if (mainWindow) {
            await dialog.showMessageBox(mainWindow, {
                type: 'error',
                title: 'Mod shop images',
                message: 'Export did not produce a summary file.',
                detail,
                buttons: ['OK']
            });
        }
        return { ok: false, error: 'No summary JSON', exitCode, stderr };
    }

    if (summary.ok === false) {
        if (mainWindow) {
            await dialog.showMessageBox(mainWindow, {
                type: 'error',
                title: 'Mod shop images',
                message: summary.error || 'Export failed',
                detail: `Mods folder:\n${summary.modsRoot || modsRoot}`,
                buttons: ['OK']
            });
        }
        return summary;
    }

    const n = summary.textureMatches || 0;
    const png = summary.pngCopied || 0;
    const dds = summary.ddsConverted || 0;
    const skippedExisting = summary.outputsSkippedExisting || 0;
    const skipped = summary.ddsSkippedNoConverter || 0;
    const failed = summary.ddsConvertFailed || 0;

    const detailLines = [
        `New exports this run: ${n}`,
        skippedExisting > 0 ? `Already exported (skipped; run PowerShell with -Force to overwrite): ${skippedExisting}` : null,
        `PNG copied (source was already PNG): ${png}`,
        `DDS converted to PNG: ${dds}`,
        skipped > 0 ? `DDS skipped (install ImageMagick or add texconv.exe to resources/texconv): ${skipped}` : null,
        failed > 0 ? `DDS conversion failed: ${failed}` : null,
        `Top-level mod folders: ${summary.topLevelModFolders ?? '—'}`,
        `Zip archives scanned: ${summary.zipArchivesScanned ?? '—'}`,
        summary.ddsConverter ? `DDS converter used: ${summary.ddsConverter}` : 'DDS converter: none (PNG-only or no DDS matches)',
        '',
        `Output:`,
        summary.outputDir || outputDir
    ].filter((line) => line !== null);

    let msg;
    let boxType = 'info';
    if (n === 0 && skippedExisting === 0) {
        boxType = 'warning';
        msg = 'No matching shop/icon textures were found under your FS25 mods folder.';
    } else if (n === 0 && skippedExisting > 0) {
        msg = `Nothing new to export. ${skippedExisting} texture(s) were already in the output folder (skipped).`;
    } else {
        msg = `Exported ${n} texture(s): ${png} PNG copied, ${dds} DDS converted to PNG.${
            skippedExisting ? ` (${skippedExisting} already up to date.)` : ''
        }`;
    }

    if (mainWindow) {
        await dialog.showMessageBox(mainWindow, {
            type: boxType,
            title: 'Mod shop images',
            message: msg,
            detail: detailLines.join('\n'),
            buttons: ['OK']
        });
    }

    return { ...summary, ok: true };
}

ipcMain.handle('export-mod-store-images', (event) => runExportModStoreImages(event.sender));

// ── Express / WebSocket ───────────────────────────────────────────────────────
const expressApp = express();
const PORT       = 8766;
const clients    = new Set();
/** @type {import('http').Server | null} */
let server = null;
/** @type {import('ws').WebSocketServer | null} */
let wss = null;

function getLanSecurityFromStore() {
    return {
        lanAccessEnabled: store.get('lanAccessEnabled', LAN_ACCESS_DEFAULTS.lanAccessEnabled),
        lanUsername:      store.get('lanUsername', LAN_ACCESS_DEFAULTS.lanUsername),
        lanPassword:      store.get('lanPassword', LAN_ACCESS_DEFAULTS.lanPassword),
        lanAllowedIPs:    store.get('lanAllowedIPs', LAN_ACCESS_DEFAULTS.lanAllowedIPs),
    };
}

/** `0.0.0.0` when LAN access is enabled; else localhost only. */
function getLanBindAddress() {
    return getLanSecurityFromStore().lanAccessEnabled ? '0.0.0.0' : '127.0.0.1';
}

function requestRemoteAddress(req) {
    const a = req.socket?.remoteAddress || req.connection?.remoteAddress || '';
    return String(a || '');
}

function isLoopbackIp(ip) {
    const s = String(ip || '').trim();
    if (s === '127.0.0.1' || s === '::1') return true;
    if (s === '::ffff:127.0.0.1') return true;
    return false;
}

function normalizeIpForAllowlist(ip) {
    let s = String(ip || '').trim();
    if (s.startsWith('::ffff:')) s = s.slice(7);
    return s;
}

/**
 * LAN security for non-loopback clients: optional IP allowlist + HTTP Basic (same creds as Settings).
 * Loopback always allowed. Used by Express middleware and WebSocket `verifyClient`.
 */
function checkLanAccessForRequest(req) {
    const rawIp = requestRemoteAddress(req);
    const expressIp = req.ip ? String(req.ip) : '';
    if (isLoopbackIp(expressIp) || isLoopbackIp(rawIp)) {
        return { ok: true };
    }

    const cfg = getLanSecurityFromStore();
    const allowRaw = (cfg.lanAllowedIPs || '').trim();
    if (allowRaw) {
        const allowed = allowRaw.split(',').map((x) => normalizeIpForAllowlist(x)).filter(Boolean);
        const nip = normalizeIpForAllowlist(expressIp || rawIp);
        if (!allowed.some((a) => a === nip)) {
            return { ok: false, code: 403, message: 'Forbidden: IP not allowed' };
        }
    }

    const auth = req.headers?.authorization || '';
    const m = /^Basic\s+(\S+)/i.exec(auth);
    if (!m) {
        return { ok: false, code: 401, message: 'Unauthorized', wwwAuthenticate: true };
    }
    let decoded = '';
    try {
        decoded = Buffer.from(m[1], 'base64').toString('utf8');
    } catch (_) {
        return { ok: false, code: 401, message: 'Unauthorized', wwwAuthenticate: true };
    }
    const colon = decoded.indexOf(':');
    const u = colon >= 0 ? decoded.slice(0, colon) : decoded;
    const p = colon >= 0 ? decoded.slice(colon + 1) : '';
    if (u !== cfg.lanUsername || p !== cfg.lanPassword) {
        return { ok: false, code: 401, message: 'Unauthorized', wwwAuthenticate: true };
    }
    return { ok: true };
}

function lanAccessHttpMiddleware(req, res, next) {
    if (req.method === 'OPTIONS') return next();
    const r = checkLanAccessForRequest(req);
    if (r.ok) return next();
    if (r.wwwAuthenticate) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Farm Dashboard"');
    }
    return res.status(r.code || 403).send(r.message || 'Forbidden');
}

/** TCP client is loopback — used to block LAN from triggering heavy/sensitive HTTP actions. */
function isLocalhostSocket(req) {
    return isLoopbackIp(requestRemoteAddress(req));
}

/** Allow POST /api/export-mod-store-images from LAN (default: localhost only). Power users: set env FARMDASH_ALLOW_LAN_EXPORT=1 */
function allowLanModExportHttp() {
    return process.env.FARMDASH_ALLOW_LAN_EXPORT === '1';
}

expressApp.use(cors());
expressApp.use(express.json());
expressApp.use(lanAccessHttpMiddleware);
expressApp.use(express.static(path.join(__dirname, 'web')));
/** setup.html uses src="web/assests/..." — same paths work over http://host:8766/… and file:// */
expressApp.use('/web', express.static(path.join(__dirname, 'web')));
/** Same icon as the Windows desktop app (electron-builder `icon.ico`) — splash screen in web/index.html */
expressApp.get('/app-brand-icon.ico', (req, res) => {
    const icoPath = path.join(__dirname, 'icon.ico');
    if (fs.existsSync(icoPath)) {
        res.type('image/x-icon');
        return res.sendFile(icoPath);
    }
    const pngFallback = path.join(__dirname, 'web', 'assests', 'img', 'app-icon.png');
    if (fs.existsSync(pngFallback)) {
        res.type('image/png');
        return res.sendFile(pngFallback);
    }
    res.status(404).end();
});
expressApp.get('/', (req, res) => res.sendFile(path.join(__dirname, 'web', 'index.html')));
expressApp.get('/setup.html', (req, res) => {
    try {
        ensureSetupWriteToken();
        const token = String(store.get('farmdashSetupWriteToken') || '');
        const p = path.join(__dirname, 'setup.html');
        let html = fs.readFileSync(p, 'utf8');
        const inj = `<script>window.__FARMDASH_SETUP_TOKEN=${JSON.stringify(token)};</script>`;
        const i = html.indexOf('</head>');
        if (i === -1) {
            html = inj + html;
        } else {
            html = html.slice(0, i) + inj + html.slice(i);
        }
        res.type('html').send(html);
    } catch (e) {
        console.error('[setup.html]', e);
        res.status(500).end();
    }
});

/** Full config for setup.html when opened in a normal browser (tablet on LAN — no Electron require). */
expressApp.get('/api/setup-config', (req, res) => {
    try {
        res.json(store.get('config') || {});
    } catch (e) {
        console.error('[api/setup-config GET]', e);
        res.status(500).json({ error: String(e.message || e) });
    }
});

/**
 * Save first-run / Server Manager config from a browser (same effect as ipcRenderer `save-settings`).
 * Requires ``X-Setup-Token`` (see ``ensureSetupWriteToken`` / setup page injection).
 */
expressApp.post('/api/setup-config', (req, res) => {
    try {
        ensureSetupWriteToken();
        const expected = String(store.get('farmdashSetupWriteToken') || '');
        const got = String(req.headers['x-setup-token'] || '').trim();
        if (!expected || got !== expected) {
            return res.status(403).json({ ok: false, error: 'Forbidden' });
        }
        const body = req.body;
        if (!body || typeof body !== 'object') {
            return res.status(400).json({ ok: false, error: 'Expected JSON body' });
        }
        if (!Array.isArray(body.servers)) {
            return res.status(400).json({ ok: false, error: 'servers array required' });
        }
        applyFarmdashSetupConfig(body);
        res.json({ ok: true });
    } catch (e) {
        console.error('[api/setup-config POST]', e);
        res.status(500).json({ ok: false, error: String(e.message || e) });
    }
});

expressApp.get('/api/servers', (req, res) => {
    const config = store.get('config');
    if (!config?.servers) return res.json([]);
    res.json(config.servers.map(s => ({
        id: s.id,
        name: s.name,
        mode: s.mode || 'local',
        localSubFolder: s.localSubFolder || null,
    })));
});

function getDataForServer(req) {
    const serverId = req.query.serverId;
    const state = serverId
        ? serverStates[serverId]
        : serverStates[Object.keys(serverStates)[0]];
    return state?.mergedData || null;
}

/** Resolve config server id for field-exclusion prefs (query or first active server). */
function resolveServerIdForRequest(req) {
    const q = req.query?.serverId;
    if (q !== undefined && q !== '' && serverStates[q] != null) return q;
    return Object.keys(serverStates)[0];
}

function normalizeExcludedFarmlandIdsMap(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    for (const [k, v] of Object.entries(raw)) {
        if (!Array.isArray(v)) continue;
        const ids = v.map((x) => parseInt(String(x).trim(), 10)).filter((n) => !Number.isNaN(n));
        out[String(k)] = ids; // include [] so “clear all” for a server persists
    }
    return out;
}

function getExcludedFarmlandIdSet(serverId) {
    const prefs = store.get('uiPreferences') || {};
    const by = normalizeExcludedFarmlandIdsMap(prefs.excludedFarmlandIdsByServer);
    const sid = serverId != null && serverId !== '' ? String(serverId) : '';
    const ids = sid ? (by[sid] || []) : [];
    return new Set(ids);
}

function filterFieldsByExclusions(fields, serverId) {
    if (!Array.isArray(fields)) return fields || [];
    const ex = getExcludedFarmlandIdSet(serverId);
    if (ex.size === 0) return fields;
    return fields.filter((f) => f != null && !ex.has(Number(f.farmlandId ?? f.id)));
}

function cloneMergedDataWithFieldExclusions(mergedData, serverId) {
    if (!mergedData) return null;
    const fields = filterFieldsByExclusions(mergedData.fields, serverId);
    return { ...mergedData, fields };
}

expressApp.get('/api/data',       (req, res) => {
    try {
        const d = getDataForServer(req);
        const sid = resolveServerIdForRequest(req);
        const payload = d ? cloneMergedDataWithFieldExclusions(d, sid) : null;
        res.json(payload ? { ...payload, timestamp: new Date().toISOString() } : { error: 'Waiting for data...' });
    } catch (e) {
        console.error('[api/data]', e && e.stack ? e.stack : e);
        res.json({ error: 'Waiting for data...', timestamp: new Date().toISOString() });
    }
});
expressApp.get('/api/animals',    (req, res) => res.json(getDataForServer(req)?.animals    || []));
expressApp.get('/api/vehicles',   (req, res) => res.json(getDataForServer(req)?.vehicles   || []));
expressApp.get('/api/fields',     (req, res) => {
    const d = getDataForServer(req);
    const sid = resolveServerIdForRequest(req);
    const fields = d?.fields || [];
    res.json(filterFieldsByExclusions(fields, sid));
});
expressApp.get('/api/production', (req, res) => res.json(getDataForServer(req)?.production || {}));
expressApp.get('/api/finance',    (req, res) => res.json(getDataForServer(req)?.finance    || {}));
expressApp.get('/api/weather',    (req, res) => res.json(getDataForServer(req)?.weather    || {}));
expressApp.get('/api/economy',    (req, res) => res.json(getDataForServer(req)?.economy    || {}));
expressApp.get('/api/farmlands',  (req, res) => res.json(getDataForServer(req)?.xmlFarmlands || []));
expressApp.get('/api/status',     (req, res) => res.json({ status: 'online' }));

/** For WebSocket clients that cannot send Basic auth on the upgrade request (browsers). */
expressApp.get('/api/lan-ws-token', (req, res) => {
    res.json({ token: ensureLanWsSecret() });
});

/**
 * LAN / tablet browsers: forward consultant insights through the host PC so clients use the same
 * AI URL + integration key + BYOK as Electron (no duplicate LLM config on the tablet, no 127.0.0.1:8080 on wrong device).
 */
function getAiManagerConnectionForProxy() {
    const b = loadBrandingFromDisk();
    const c = store.get('aiManagerConnection') || {};
    const embKey = String(b.embeddedFarmdashIntegrationKey || '').trim();
    const defUrl = String(b.defaultAiBackendUrl || '').trim().replace(/\/$/, '');
    return {
        baseUrl: (c.baseUrl || defUrl || '').replace(/\/$/, ''),
        integrationKey: (c.integrationKey || embKey || '').trim(),
    };
}

function getConsultantByokHeadersForProxy() {
    const raw = store.get('consultantByok');
    const r = raw && typeof raw === 'object' ? raw : {};
    const apiKey = r.apiKey && String(r.apiKey).trim() ? String(r.apiKey).trim() : '';
    if (!apiKey) return {};
    let provider = r.provider === 'gemini' ? 'gemini' : 'openai';
    if (apiKey.startsWith('AIza')) provider = 'gemini';
    else if (apiKey.startsWith('sk-')) provider = 'openai';
    return {
        'X-AI-API-Key': apiKey,
        'X-AI-Provider': provider,
    };
}

/** Only the Farm Dashboard on this PC (localhost) may forward to the AI backend — LAN/tablet reads this cache only. */
const consultantInsightsProxyCache = new Map();
const CONSULTANT_PROXY_CACHE_TTL_MS = 8 * 60 * 1000;

function consultantInsightsCacheKey(query) {
    const q = query && typeof query === 'object' ? query : {};
    const keys = Object.keys(q).sort();
    return keys
        .map((k) => {
            const raw = q[k];
            const v = raw === undefined ? '' : Array.isArray(raw) ? raw[0] : raw;
            return `${k}=${String(v)}`;
        })
        .join('&');
}

expressApp.get('/api/farmdash-ai/consultant/insights', async (req, res) => {
    try {
        const conn = getAiManagerConnectionForProxy();
        const cacheKey = consultantInsightsCacheKey(req.query || {});
        const fromLocalhost = isLocalhostSocket(req);

        if (!conn.baseUrl || !conn.integrationKey) {
            return res.status(503).json({
                detail:
                    'AI Farm Manager is not configured on this PC. On this machine: open Farm Dashboard → robot (AI Farm Manager) or Settings → AI Farm Manager → set server URL and link key → Save.',
                insights: [],
                llm_used: false,
                farmdash_ai_error: 'not_configured',
            });
        }

        if (!fromLocalhost) {
            const ent = consultantInsightsProxyCache.get(cacheKey);
            if (ent && Date.now() - ent.ts < CONSULTANT_PROXY_CACHE_TTL_MS) {
                res.status(ent.status);
                if (ent.contentType) res.setHeader('Content-Type', ent.contentType);
                else res.type('application/json');
                return res.send(ent.text);
            }
            return res.status(503).json({
                detail:
                    'AI insights are fetched once on the PC running Farm Dashboard (open it via localhost on the host). This device shows cached results only — it does not call the LLM separately.',
                insights: [],
                llm_used: false,
                farmdash_ai_error: 'lan_cache_miss',
                cache_miss: true,
            });
        }

        const target = new URL('/api/v1/consultant/insights', `${conn.baseUrl}/`);
        const q = req.query || {};
        for (const key of Object.keys(q)) {
            const val = q[key];
            if (val === undefined) continue;
            const v = Array.isArray(val) ? val[0] : val;
            target.searchParams.append(key, String(v));
        }
        const hdrs = {
            Accept: 'application/json',
            'X-FarmDash-Key': encodeURIComponent(conn.integrationKey),
            ...getConsultantByokHeadersForProxy(),
        };
        const fr = await fetch(target.toString(), { method: 'GET', headers: hdrs, cache: 'no-store' });
        const text = await fr.text();
        const ct = fr.headers.get('content-type') || 'application/json';
        consultantInsightsProxyCache.set(cacheKey, {
            status: fr.status,
            text,
            contentType: ct,
            ts: Date.now(),
        });
        res.status(fr.status);
        res.setHeader('Content-Type', ct);
        return res.send(text);
    } catch (e) {
        const conn = getAiManagerConnectionForProxy();
        logAiBackendUnreachableOnce('GET /api/farmdash-ai/consultant/insights (proxy)', e, conn.baseUrl);
        return res.status(503).json({
            detail:
                'Cannot reach AI Farm Manager. Start the service on your VPS, confirm the URL/port in Farm Dashboard AI settings, and ensure outbound access from this PC (or disable AI until it is back).',
            insights: [],
            llm_used: false,
            farmdash_ai_error: 'unreachable',
        });
    }
});

/** Curated PNGs under items/ + exported mod shop PNGs under items_mod_extract/ (for vehicle image matching). */
expressApp.get('/api/item-image-filenames', (req, res) => {
    const itemsDir = path.join(__dirname, 'web', 'assests', 'img', 'items');
    const modDir = path.join(__dirname, 'web', 'assests', 'img', 'items_mod_extract');
    const listPng = (dir) => {
        try {
            return fs.readdirSync(dir).filter((f) => /\.png$/i.test(f));
        } catch (e) {
            return [];
        }
    };
    res.json({ items: listPng(itemsDir), modExtract: listPng(modDir) });
});

/**
 * Fallback when renderer cannot reach ipcMain (e.g. old build).
 * By default only localhost may POST — prevents LAN clients from triggering PowerShell/mod scan (DoS/abuse).
 * Desktop app uses ipcMain.invoke('export-mod-store-images'), unaffected.
 * To allow LAN POST: set environment variable FARMDASH_ALLOW_LAN_EXPORT=1 before starting the app.
 */
expressApp.post('/api/export-mod-store-images', async (req, res) => {
    if (!allowLanModExportHttp() && !isLocalhostSocket(req)) {
        return res.status(403).json({
            ok: false,
            error: 'Mod image export is only allowed from this PC (localhost). Use the Farm Dashboard app, or set FARMDASH_ALLOW_LAN_EXPORT=1 to allow this endpoint from your LAN.'
        });
    }
    try {
        const result = await runExportModStoreImages();
        res.json(result);
    } catch (e) {
        console.error('[export-mod-store-images] HTTP:', e);
        res.status(500).json({ ok: false, error: e && e.message ? e.message : String(e) });
    }
});

function checkWebSocketLanAccess(info) {
    const req = info.req;
    const rawIp = requestRemoteAddress(req);
    const expressIp = req.ip ? String(req.ip) : '';
    if (isLoopbackIp(expressIp) || isLoopbackIp(rawIp)) return true;

    const cfg = getLanSecurityFromStore();
    const allowRaw = (cfg.lanAllowedIPs || '').trim();
    const nip = normalizeIpForAllowlist(expressIp || rawIp);
    if (allowRaw) {
        const allowed = allowRaw.split(',').map((x) => normalizeIpForAllowlist(x)).filter(Boolean);
        if (!allowed.some((a) => a === nip)) return false;
    }

    try {
        const parsed = url.parse(req.url || '', true);
        const t = parsed.query && (parsed.query.t || parsed.query.token);
        if (t && String(t) === ensureLanWsSecret()) return true;
    } catch (_) {
        /* ignore */
    }

    return checkLanAccessForRequest(req).ok;
}

function attachWebSocketServer(httpSrv) {
    wss = new WebSocket.Server({
        server: httpSrv,
        verifyClient: (info) => checkWebSocketLanAccess(info),
    });
    wss.on('connection', (ws) => {
        clients.add(ws);
        ws.on('close', () => clients.delete(ws));
    });
}

/**
 * Starts HTTP + WebSocket on ``bindHost`` (``127.0.0.1`` or ``0.0.0.0``).
 * Call after ``closeHttpServer`` when rebinding (e.g. LAN toggle).
 */
function listenFarmdashHttp(bindHost, onListening) {
    clients.clear();
    server = http.createServer(expressApp);
    attachWebSocketServer(server);
    server.listen(PORT, bindHost, () => {
        console.log(`[HTTP/WS] listening on http://${bindHost === '0.0.0.0' ? '0.0.0.0 (all interfaces)' : bindHost}:${PORT}`);
        if (typeof onListening === 'function') onListening();
    });
}

function closeHttpServer(done) {
    if (!wss && (!server || !server.listening)) {
        server = null;
        if (typeof done === 'function') done();
        return;
    }
    const w = wss;
    wss = null;
    if (w) {
        try {
            w.close(() => {
                server = null;
                if (typeof done === 'function') done();
            });
        } catch (_) {
            server = null;
            if (typeof done === 'function') done();
        }
    } else if (server) {
        server.close(() => {
            server = null;
            if (typeof done === 'function') done();
        });
    } else if (typeof done === 'function') done();
}

function restartHttpServer(done) {
    const bind = getLanBindAddress();
    closeHttpServer(() => {
        listenFarmdashHttp(bind, () => {
            if (typeof done === 'function') done();
        });
    });
}

function broadcast(serverId, data) {
    const payload = cloneMergedDataWithFieldExclusions(data, serverId) || data;
    const msg = JSON.stringify({ type: 'data', serverId, data: payload, timestamp: new Date().toISOString() });
    clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(msg); });
}

// ── Data processing ───────────────────────────────────────────────────────────

function buildServersPayloadForAiPush() {
    const config = store.get('config');
    if (!config?.servers) return [];
    return config.servers.map(s => ({
        id: s.id,
        name: s.name,
        mode: s.mode || 'local',
        localSubFolder: s.localSubFolder || null,
    }));
}

function buildDataPayloadForAiPush(serverId) {
    const state = serverStates[serverId];
    const d = state?.mergedData;
    const sid = serverId || Object.keys(serverStates)[0];
    const clone = d ? cloneMergedDataWithFieldExclusions(d, sid) : null;
    const ts = new Date().toISOString();
    return clone ? { ...clone, timestamp: ts } : { error: 'Waiting for data...', timestamp: ts };
}

async function maybePushSnapshotToAiManager(serverId) {
    const conn = store.get('aiManagerConnection') || {};
    if (!conn.pushSnapshots) return;
    const base = String(conn.baseUrl || '').trim().replace(/\/$/, '');
    const key = String(conn.integrationKey || '').trim();
    if (!base || !key) return;
    const now = Date.now();
    if ((lastAiSnapshotPushAt[serverId] || 0) + AI_SNAPSHOT_PUSH_MIN_MS > now) return;
    lastAiSnapshotPushAt[serverId] = now;
    const snapshot = buildDataPayloadForAiPush(serverId);
    const servers = buildServersPayloadForAiPush();
    const url = `${base}/api/integration/push-snapshot?serverId=${encodeURIComponent(serverId)}`;
    const body = JSON.stringify({ snapshot, servers });
    try {
        const r = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-FarmDash-Key': encodeURIComponent(key),
            },
            body,
        });
        if (r.ok) {
            console.info('[Pipeline] push_out: POST /api/integration/push-snapshot OK -> AI server', {
                serverId,
                bytesUtf8: Buffer.byteLength(body, 'utf8'),
                url: url.split('?')[0],
            });
        } else {
            const t = await r.text();
            console.warn('[Pipeline] push_out: POST push-snapshot failed', r.status, t.slice(0, 300));
        }
    } catch (e) {
        logAiBackendUnreachableOnce('POST push-snapshot', e, base);
    }
}

function pushAllSnapshotsToAiManager() {
    const conn = store.get('aiManagerConnection') || {};
    if (!conn.pushSnapshots) return;
    Object.keys(serverStates).forEach(sid => { maybePushSnapshotToAiManager(sid); });
}

function ensureAiSnapshotPushInterval() {
    if (aiSnapshotPushInterval) return;
    aiSnapshotPushInterval = setInterval(() => pushAllSnapshotsToAiManager(), 60000);
}

function stopAiSnapshotPushInterval() {
    if (aiSnapshotPushInterval) {
        clearInterval(aiSnapshotPushInterval);
        aiSnapshotPushInterval = null;
    }
}

function schedulePersistServerCache(serverId) {
    clearTimeout(serverCacheSaveTimers[serverId]);
    serverCacheSaveTimers[serverId] = setTimeout(() => {
        const state = serverStates[serverId];
        if (!state || !state.mergedData) return;
        try {
            const userData = app.getPath('userData');
            saveServerCache(userData, serverId, {
                mergedSnapshot: state.mergedData,
                lastKnownSaveSlot: state.lastSaveSlot || null,
                fieldLiveByFarmlandId: state.fieldLiveCache || {},
                fieldHistory: state.fieldHistory || {},
                lastLuaAt: state.lastLuaReceivedAt || null,
                lastXmlAt: state.lastXmlReceivedAt || null,
                savedAt: new Date().toISOString(),
            });
        } catch (e) {
            console.warn('[Cache] persist failed', serverId, e.message);
        }
    }, 600);
}

function hydrateServerCacheFromDisk(serverId) {
    let disk;
    try {
        disk = loadServerCache(app.getPath('userData'), serverId);
    } catch (_) {
        disk = null;
    }
    if (!disk || !disk.mergedSnapshot) return;
    const state = serverStates[serverId];
    if (!state) return;
    state.fieldLiveCache = disk.fieldLiveByFarmlandId || {};
    state.fieldHistory = disk.fieldHistory || {};
    state.lastLuaReceivedAt = disk.lastLuaAt || null;
    state.lastXmlReceivedAt = disk.lastXmlAt || null;
    state.mergedData = JSON.parse(JSON.stringify(disk.mergedSnapshot));
    state.mergedData.dataTimestamps = {
        ...(state.mergedData.dataTimestamps || {}),
        loadedFromDiskCacheAt: new Date().toISOString(),
    };
    if (disk.lastKnownSaveSlot && typeof disk.lastKnownSaveSlot === 'string') {
        state.lastSaveSlot = disk.lastKnownSaveSlot;
    } else {
        const slot = state.mergedData.serverInfo && state.mergedData.serverInfo.saveSlot;
        if (typeof slot === 'string' && slot.length > 0) {
            state.lastSaveSlot = slot;
        }
    }
    if (state.fieldHistory && Object.keys(state.fieldHistory).length > 0) {
        state.mergedData.fieldStatusHistory = state.fieldHistory;
    }
    broadcast(serverId, state.mergedData);
    console.log(`[Cache] [${serverId}] Restored last merged snapshot from disk (use until live Lua/XML return)`);
}

function rebuildMerged(serverId) {
    const state = serverStates[serverId];
    if (!state) return;
    state.mergedData = mergeData(state.luaData, state.xmlData, {
        fieldLiveCache: state.fieldLiveCache || {},
        lastLuaAt: state.lastLuaReceivedAt || null,
        lastXmlAt: state.lastXmlReceivedAt || null,
    });
    if (state.mergedData && state.fieldHistory && Object.keys(state.fieldHistory).length > 0) {
        state.mergedData.fieldStatusHistory = state.fieldHistory;
    }
    broadcast(serverId, state.mergedData);
    maybePushSnapshotToAiManager(serverId);
    schedulePersistServerCache(serverId);
}

function processLuaData(serverId, raw) {
    try {
        const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const state = serverStates[serverId];
        if (!state) return;

        state.luaData = data;

        const nowIso = new Date().toISOString();
        state.lastLuaReceivedAt = nowIso;
        try {
            const fps = buildFieldLiveFingerprints(data.fields || [], nowIso);
            state.fieldLiveCache = { ...(state.fieldLiveCache || {}), ...fps };
            state.fieldHistory = appendFieldHistory(state.fieldHistory || {}, fps);
        } catch (e) {
            console.warn('[Cache] fingerprint', serverId, e.message);
        }

        // If we don't have XML yet (or saveSlot changed), trigger XML poll now
        const saveSlot = data.serverInfo?.saveSlot;
        if (saveSlot && saveSlot !== state.lastSaveSlot) {
            state.lastSaveSlot = saveSlot;
            triggerXmlPoll(serverId);
        }

        rebuildMerged(serverId);

        console.log(`[${new Date().toISOString()}] [${serverId}] Lua data updated`);
    } catch (e) {
        console.error(`[processLuaData] ${serverId}:`, e.message);
    }
}

/** Pull savegame XML from FTP (e.g. GPortal: profile/savegameN/…) into userData/ftpXmlCache. */
async function downloadFtpSavegameXml(srv, saveSlot) {
    const slot = saveSlot || srv.localSubFolder || 'savegame1';
    const localDir = path.join(app.getPath('userData'), 'ftpXmlCache', srv.id, slot);
    fs.mkdirSync(localDir, { recursive: true });

    const remoteDir = srv.ftpSavegameRemoteDir
        ? String(srv.ftpSavegameRemoteDir).replace(/\\/g, '/').replace(/\/$/, '')
        : `${String(srv.ftpBasePath || 'profile').replace(/\\/g, '/').replace(/\/$/, '')}/${slot}`;

    const client = new ftp.Client(120000);
    client.ftp.verbose = false;
    try {
        await client.access({
            host: srv.ftpHost, port: parseInt(srv.ftpPort) || 21,
            user: srv.ftpUser, password: srv.ftpPass, secure: false
        });

        const retryOpts = { maxAttempts: 5, retryDelayMs: 400 };
        const retryOptsCooldown = { maxAttempts: 6, retryDelayMs: 600 };

        async function pullOne(name) {
            const remotePath = `${remoteDir}/${name}`;
            const tmpPath = path.join(localDir, `${name}.tmp`);
            const finalPath = path.join(localDir, name);
            return safeDownload(client, remotePath, tmpPath, finalPath, retryOpts);
        }

        let ok = 0;
        const missing = [];
        for (const name of FTP_SAVEGAME_XML_DOWNLOAD_ORDER) {
            if (await pullOne(name)) {
                ok++;
            } else {
                missing.push(name);
            }
        }

        // Second pass: careerSavegame / farmland often stay busy until other files finish flushing on host FTP.
        if (missing.length > 0) {
            await new Promise((r) => setTimeout(r, 3500));
            const still = [];
            for (const name of missing) {
                if (await pullOne(name)) {
                    ok++;
                } else {
                    still.push(name);
                }
            }
            missing.length = 0;
            missing.push(...still);
        }

        // Third try: only files still missing, longer per-file retries (host may have been mid-save).
        if (missing.length > 0) {
            const still = [];
            for (const name of missing) {
                const remotePath = `${remoteDir}/${name}`;
                const tmpPath = path.join(localDir, `${name}.tmp`);
                const finalPath = path.join(localDir, name);
                if (await safeDownload(client, remotePath, tmpPath, finalPath, retryOptsCooldown)) {
                    ok++;
                } else {
                    still.push(name);
                }
            }
            missing.length = 0;
            missing.push(...still);
        }

        // Fourth pass: FTP listing may use different casing than Giants' default names.
        if (missing.length > 0) {
            let lowerToExact = null;
            try {
                const entries = await client.list(remoteDir);
                lowerToExact = new Map();
                for (const ent of entries) {
                    if (ent.name) lowerToExact.set(ent.name.toLowerCase(), ent.name);
                }
            } catch (_) {
                lowerToExact = null;
            }
            if (lowerToExact && lowerToExact.size > 0) {
                const still = [];
                for (const name of missing) {
                    const exact = lowerToExact.get(name.toLowerCase());
                    if (exact && exact !== name) {
                        const remotePath = `${remoteDir}/${exact}`;
                        const tmpPath = path.join(localDir, `${name}.tmp`);
                        const finalPath = path.join(localDir, name);
                        console.log(`[FTP] [${srv.id}] Retrying with server name: ${exact}`);
                        if (await safeDownload(client, remotePath, tmpPath, finalPath, retryOptsCooldown)) {
                            ok++;
                        } else {
                            still.push(name);
                        }
                    } else {
                        still.push(name);
                    }
                }
                missing.length = 0;
                missing.push(...still);
            }
        }

        if (ok > 0) {
            console.log(`[FTP] [${srv.id}] Cached ${ok}/${SAVEGAME_XML_FILES.length} savegame XML -> ${localDir}`);
            if (missing.length) {
                const noPf = missing.filter((n) => n !== 'precisionFarming.xml');
                const pfOnly = missing.length > 0 && noPf.length === 0;
                let hint = '';
                if (noPf.length) {
                    hint =
                        ` Still missing (not optional): ${noPf.join(', ')}. ` +
                        'If this repeats every poll, check FTP path / permissions for those names on the host.';
                }
                if (missing.includes('precisionFarming.xml')) {
                    hint +=
                        (hint ? ' ' : '') +
                        'precisionFarming.xml is only present with Precision Farming on the save.';
                }
                if (pfOnly) {
                    hint = 'Only precisionFarming.xml missing (expected without Precision Farming DLC).';
                }
                console.log(`[FTP] [${srv.id}] ${hint || `Missing: ${missing.join(', ')}`}`);

                const criticalLeft = missing.filter((n) => n !== 'precisionFarming.xml');
                if (criticalLeft.length > 0) {
                    const parts = [];
                    for (const name of criticalLeft) {
                        const rp = `${remoteDir}/${name}`;
                        try {
                            const sz = await client.size(rp);
                            parts.push(`${name}=${sz}B`);
                        } catch (err) {
                            const em = err && err.message ? String(err.message) : String(err);
                            parts.push(`${name}=no SIZE (${em.slice(0, 60)})`);
                        }
                    }
                    console.log(`[FTP] [${srv.id}] Remote SIZE check: ${parts.join('; ')} (0B = empty file on host; ERR = wrong path or no access)`);
                }
            }
        } else {
            console.warn(`[FTP] [${srv.id}] No XML files found under ${remoteDir}/`);
        }
        return ok > 0;
    } catch (e) {
        console.warn(`[FTP] [${srv.id}] XML download failed: ${e.message}`);
        return false;
    } finally {
        client.close();
    }
}

async function triggerXmlPoll(serverId) {
    const config = store.get('config');
    const srv    = config?.servers?.find(s => String(s.id) === String(serverId));
    if (!srv) return;

    const state    = serverStates[serverId];
    const saveSlot = state?.lastSaveSlot;
    const effectiveSlot = saveSlot || srv.localSubFolder || 'savegame1';

    try {
        if (srv.mode === 'ftp') {
            await downloadFtpSavegameXml(srv, saveSlot);
        }
        const xmlData = await collectXmlData(srv, saveSlot);
        if (xmlData) {
            serverStates[serverId].xmlData = xmlData;
            serverStates[serverId].lastXmlReceivedAt = new Date().toISOString();
            rebuildMerged(serverId);
            console.log(`[XML] [${serverId}] XML data updated (slot=${effectiveSlot})`);
        } else if (srv.mode === 'ftp') {
            console.warn(
                `[XML] [${serverId}] Parsed XML is empty (no usable savegame in ftpXmlCache for slot=${effectiveSlot}). ` +
                'If Lua never loads, the slot may be wrong — set this server\'s save slot to match the host (e.g. savegame3).'
            );
        }
    } catch (e) {
        console.warn(`[XML] [${serverId}] XML poll failed:`, e.message);
    }
}

// ── Local file watcher ────────────────────────────────────────────────────────

function startLocalWatching(srv) {
    const state = serverStates[srv.id];

    let basePath = srv.localPath;
    if (!basePath) {
        basePath = path.join(
            os.homedir(),
            'Documents', 'My Games', 'FarmingSimulator2025',
            'modSettings', 'FS25_FarmDashboard'
        );
    }

    const folderName = srv.localSubFolder ||
                       srv.name.replace(/[<>:"/\\|?*]/g, '').trim();
    const luaJsonPath = path.join(basePath, folderName, 'data.json');

    if (!fs.existsSync(luaJsonPath)) {
        console.log(`[Local] Waiting for: ${luaJsonPath}`);
        const t = setTimeout(() => startLocalWatching(srv), 5000);
        state.intervals.push(t);
        return;
    }

    console.log(`[Local] Watching: ${luaJsonPath}`);

    const watcher = chokidar.watch(luaJsonPath, { usePolling: true, interval: 1000 });
    state.watcher = watcher;

    const readFile = () => {
        if (fs.existsSync(luaJsonPath)) processLuaData(srv.id, fs.readFileSync(luaJsonPath, 'utf8'));
    };

    watcher.on('add',    readFile);
    watcher.on('change', readFile);

    // XML poll immediately then every 60s (XML changes on save, not every 10s)
    triggerXmlPoll(srv.id);
    const xmlInterval = setInterval(() => triggerXmlPoll(srv.id), 60000);
    state.intervals.push(xmlInterval);
}

// ── FTP polling ───────────────────────────────────────────────────────────────

/**
 * Download a single remote file with optional retries. Dedicated servers often write savegame XML in a
 * burst; FTP during that window can see locked files, partial writes, or zero-byte reads — different
 * files fail on each poll. Retries with short backoff usually clear it.
 */
async function safeDownload(client, remotePath, localTmp, localFinal, options = {}) {
    const maxAttempts = Math.max(1, parseInt(options.maxAttempts, 10) || 1);
    const retryDelayMs = Math.max(0, parseInt(options.retryDelayMs, 10) || 300);
    let lastErr = '';
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            try {
                if (fs.existsSync(localTmp)) fs.unlinkSync(localTmp);
            } catch (_) {
                /* ignore */
            }
            await client.downloadTo(localTmp, remotePath);
            if (fs.existsSync(localTmp) && fs.statSync(localTmp).size > 0) {
                if (fs.existsSync(localFinal)) fs.unlinkSync(localFinal);
                fs.renameSync(localTmp, localFinal);
                return true;
            }
            lastErr = 'empty or zero-byte after download';
        } catch (e) {
            lastErr = e && e.message ? String(e.message) : String(e);
        }
        if (attempt < maxAttempts) {
            await new Promise((r) => setTimeout(r, retryDelayMs * attempt));
        }
    }
    if (maxAttempts > 1 && lastErr && options.logFailures) {
        console.warn(`[FTP] ${path.basename(localFinal)}: failed after ${maxAttempts} tries — ${lastErr.slice(0, 120)}`);
    }
    return false;
}

async function pollFtp(srv) {
    const client = new ftp.Client(120000);
    client.ftp.verbose = false;
    const userDataPath = app.getPath('userData');
    try {
        await client.access({
            host: srv.ftpHost, port: parseInt(srv.ftpPort) || 21,
            user: srv.ftpUser, password: srv.ftpPass, secure: false
        });

        const basePath = srv.ftpBasePath || 'profile';
        const st = serverStates[srv.id];
        const folderName =
            (st && st.lastSaveSlot) ||
            srv.localSubFolder ||
            'savegame1';
        const remotePath = `${basePath}/modSettings/FS25_FarmDashboard/${folderName}/data.json`;

        const tmpPath   = path.join(userDataPath, `data_${srv.id}.json.tmp`);
        const finalPath = path.join(userDataPath, `data_${srv.id}.json`);

        if (await safeDownload(client, remotePath, tmpPath, finalPath, { maxAttempts: 4, retryDelayMs: 350 })) {
            processLuaData(srv.id, fs.readFileSync(finalPath, 'utf8'));
        } else {
            console.warn(
                `[FTP] [${srv.id}] Could not download live Lua data.json from:\n  ${remotePath}\n` +
                '  Fix: game running on host, FS25_FarmDashboard mod enabled, and this server\'s ' +
                '"Local folder" in app settings matches modSettings/FS25_FarmDashboard/<that folder>/data.json on FTP.'
            );
        }
    } catch (err) {
        console.warn(`[FTP] [${srv.id}] ${srv.name}: ${err.message}`);
    } finally {
        client.close();
    }
}

function getFtpPollingOptions(config) {
    const fp = config.ftpPolling || {};
    const minutes = Math.min(25, Math.max(1, parseInt(fp.intervalMinutes, 10) || 5));
    const delaySec = Math.min(600, Math.max(0, parseInt(fp.initialDelaySeconds, 10) || 0));
    const scheduleMode = fp.scheduleMode === 'staggered' ? 'staggered' : 'sync';
    return {
        intervalMinutes: minutes,
        initialDelaySeconds: delaySec,
        scheduleMode,
        intervalMs: minutes * 60 * 1000
    };
}

function clearFtpPollingTimers() {
    for (const t of ftpPollingTimers) {
        clearTimeout(t);
        clearInterval(t);
    }
    ftpPollingTimers = [];
}

/**
 * FTP data.json + XML refresh schedule (global for all FTP servers).
 * sync: every interval, poll all servers in parallel.
 * staggered: one server per sub-interval, evenly spaced so each server repeats every full interval.
 */
function startFtpPollingCoordinator(config, ftpServers) {
    if (!ftpServers.length) return;

    clearFtpPollingTimers();

    const opts = getFtpPollingOptions(config);
    const { intervalMs, initialDelaySeconds, scheduleMode } = opts;
    const initialDelayMs = initialDelaySeconds * 1000;
    const N = ftpServers.length;

    console.log(
        `[FTP] Schedule: ${scheduleMode} | every ${opts.intervalMinutes} min | ` +
        `delay ${initialDelaySeconds}s | ${N} server(s)`
    );

    const runLuaThenXml = (srv) =>
        pollFtp(srv)
            .then(() => triggerXmlPoll(srv.id))
            .catch((e) => console.warn(`[FTP] ${srv.name}:`, e.message));

    const pushTimer = (id) => { ftpPollingTimers.push(id); };

    if (scheduleMode === 'sync') {
        const tick = () => {
            Promise.all(ftpServers.map((srv) => runLuaThenXml(srv))).catch((e) =>
                console.warn('[FTP] sync batch:', e.message)
            );
        };
        const startId = setTimeout(() => {
            tick();
            pushTimer(setInterval(tick, intervalMs));
        }, initialDelayMs);
        pushTimer(startId);
        return;
    }

    // staggered: equal slots across one full interval
    const slotMs = Math.max(1, Math.floor(intervalMs / N));
    let idx = 0;
    const staggerTick = () => {
        runLuaThenXml(ftpServers[idx % N]);
        idx++;
    };
    const startId = setTimeout(() => {
        staggerTick();
        pushTimer(setInterval(staggerTick, slotMs));
    }, initialDelayMs);
    pushTimer(startId);
}

// ── Boot / teardown ───────────────────────────────────────────────────────────

function stopAllWatchers() {
    clearFtpPollingTimers();
    Object.keys(serverCacheSaveTimers).forEach((k) => {
        clearTimeout(serverCacheSaveTimers[k]);
        delete serverCacheSaveTimers[k];
    });
    for (const state of Object.values(serverStates)) {
        if (state.watcher) state.watcher.close();
        for (const t of (state.intervals || [])) { clearTimeout(t); clearInterval(t); }
    }
    serverStates = {};
}

function bootServer(config) {
    stopAllWatchers();

    const servers = config.servers || (config.mode ? [{
        id: 'srv_legacy', name: 'My Server', ...config
    }] : []);

    const ftpServers = servers.filter(s => s.mode === 'ftp');

    servers.forEach(srv => {
        serverStates[srv.id] = {
            luaData: null,
            xmlData: null,
            mergedData: null,
            watcher: null,
            intervals: [],
            lastSaveSlot: null,
            lastLuaReceivedAt: null,
            lastXmlReceivedAt: null,
            fieldLiveCache: {},
            fieldHistory: {},
        };
        hydrateServerCacheFromDisk(srv.id);
        if (srv.mode === 'local') startLocalWatching(srv);
    });

    startFtpPollingCoordinator(config, ftpServers);

    if (!server || !server.listening) {
        listenFarmdashHttp(getLanBindAddress(), () => {
            if (mainWindow) mainWindow.loadURL(`http://127.0.0.1:${PORT}`);
        });
    } else if (mainWindow) {
        mainWindow.loadURL(`http://127.0.0.1:${PORT}`);
    }
}

/** Same persistence + boot as ipcMain save-settings — used by POST /api/setup-config (tablet / browser on LAN). */
function applyFarmdashSetupConfig(newConfig) {
    const prev = store.get('config') || {};
    const merged = {
        ...prev,
        ...newConfig,
        servers: newConfig.servers
    };
    if (newConfig.ftpPolling) {
        merged.ftpPolling = { ...(prev.ftpPolling || {}), ...newConfig.ftpPolling };
    }
    store.set('config', merged);
    bootServer(merged);
}

// ── Electron window ───────────────────────────────────────────────────────────

function createWindow() {
    ensureSetupWriteToken();
    mainWindow = new BrowserWindow({
        width: 1400, height: 900,
        title: 'FS25 Farm Dashboard',
        backgroundColor: '#0f172a',
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: false
        }
    });

    mainWindow.webContents.on('render-process-gone', (_event, details) => {
        console.error('[render-process-gone]', details.reason, details.exitCode);
    });
    mainWindow.webContents.on('unresponsive', () => {
        console.warn('[webContents unresponsive]');
    });

    const config = store.get('config');
    if (config?.isConfigured) {
        bootServer(config);
    } else {
        // First-run setup: still listen on LAN so phones/tablets can open http://<this-pc>:8766/setup.html
        if (!server || !server.listening) {
            listenFarmdashHttp(getLanBindAddress(), () => {
                console.log(`[HTTP/WS] ready (waiting for setup)`);
                loadSetupWindow();
            });
        } else {
            loadSetupWindow();
        }
    }
}

process.on('uncaughtException', (err) => {
    console.error('[uncaughtException]', err && err.stack ? err.stack : err);
});
process.on('unhandledRejection', (reason) => {
    console.error('[unhandledRejection]', reason);
});

app.whenReady().then(() => {
    consumeInstallLocaleFile();
    mergeBrandingIntoAiManagerConnection();
    createWindow();
    initAppUpdater(() => mainWindow);
    const amc = store.get('aiManagerConnection');
    if (amc && amc.pushSnapshots) ensureAiSnapshotPushInterval();
});
app.on('window-all-closed', () => { stopAllWatchers(); if (process.platform !== 'darwin') app.quit(); });

// ── IPC ───────────────────────────────────────────────────────────────────────

ipcMain.on('save-settings', (event, newConfig) => {
    applyFarmdashSetupConfig(newConfig);
});

ipcMain.handle('get-current-config', () => store.get('config'));

ipcMain.handle('get-lan-access-settings', () => getLanSecurityFromStore());

ipcMain.handle('save-lan-access-settings', (_e, payload) => {
    store.set('lanAccessEnabled', !!payload?.lanAccessEnabled);
    store.set('lanUsername', String(payload?.lanUsername ?? LAN_ACCESS_DEFAULTS.lanUsername));
    store.set('lanPassword', String(payload?.lanPassword ?? LAN_ACCESS_DEFAULTS.lanPassword));
    store.set('lanAllowedIPs', String(payload?.lanAllowedIPs ?? '').trim());
    return new Promise((resolve) => {
        restartHttpServer(() => {
            resolve({
                ok: true,
                bind: getLanBindAddress(),
            });
        });
    });
});

ipcMain.handle('get-desktop-app-version', () => app.getVersion());

ipcMain.handle('check-desktop-app-updates', () => checkForUpdatesNow());

/** Write AI Farm Manager mod config XML to local FS25 modSettings (Windows; same PC as game). */
ipcMain.handle('get-ai-client-branding', () => {
    const b = loadBrandingFromDisk();
    const emb = String(b.embeddedFarmdashIntegrationKey || '').trim();
    const defUrl = String(b.defaultAiBackendUrl || '').trim();
    return {
        serviceName: String(b.serviceName || 'AI Farm Manager').trim() || 'AI Farm Manager',
        hasEmbeddedIntegrationKey: emb.length > 0,
        hasDefaultBackendUrl: defUrl.length > 0,
        defaultAiBackendUrl: defUrl.replace(/\/$/, ''),
    };
});

ipcMain.handle('get-ai-manager-connection', () => {
    const b = loadBrandingFromDisk();
    const c = store.get('aiManagerConnection') || {};
    const embKey = String(b.embeddedFarmdashIntegrationKey || '').trim();
    const defUrl = String(b.defaultAiBackendUrl || '').trim().replace(/\/$/, '');
    let push = c.pushSnapshots;
    if (push === undefined && b.pushSnapshotsDefault === true) {
        push = true;
    }
    return {
        baseUrl: (c.baseUrl || defUrl || '').replace(/\/$/, ''),
        integrationKey: (c.integrationKey || embKey || '').trim(),
        pushSnapshots: !!push,
    };
});

ipcMain.handle('save-ai-manager-connection', (_e, payload) => {
    const b = loadBrandingFromDisk();
    const embKey = String(b.embeddedFarmdashIntegrationKey || '').trim();
    let baseUrl = String(payload?.baseUrl || '').trim().replace(/\/$/, '');
    let integrationKey = String(payload?.integrationKey || '').trim();
    if (!integrationKey && embKey) {
        integrationKey = embKey;
    }
    const pushSnapshots = !!payload?.pushSnapshots;
    store.set('aiManagerConnection', { baseUrl, integrationKey, pushSnapshots });
    if (pushSnapshots && baseUrl && integrationKey) {
        ensureAiSnapshotPushInterval();
        pushAllSnapshotsToAiManager();
    } else {
        stopAiSnapshotPushInterval();
    }
    return { ok: true };
});

ipcMain.handle('ai-farm-install-config-xml', async (_e, { baseUrl, integrationKey, instanceId }) => {
    const base = String(baseUrl || '').replace(/\/$/, '');
    const url = `${base}/api/integration/config-xml`;
    console.info('[Pipeline] main_out: POST /api/integration/config-xml -> AI server', {
        base,
        instanceId: String(instanceId || ''),
    });
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            // ASCII-only header value (encodeURIComponent) — Node fetch rejects non–ISO-8859-1 like the browser
            'X-FarmDash-Key': encodeURIComponent(String(integrationKey || '')),
        },
        body: JSON.stringify({ instance_id: String(instanceId || '') }),
    });
    const text = await res.text();
    if (!res.ok) {
        console.warn('[Pipeline] main_err: config-xml HTTP', res.status, String(text || '').slice(0, 400));
        throw new Error(text || `HTTP ${res.status}`);
    }
    console.info('[Pipeline] main_ok: config-xml received', { bytesUtf8: Buffer.byteLength(text, 'utf8') });
    const docs = app.getPath('documents');
    const target = path.join(docs, 'My Games', 'FarmingSimulator2025', 'modSettings', 'ai_farm_manager_config.xml');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text, 'utf8');
    return { ok: true, path: target };
});

ipcMain.handle('get-stored-locale', () => {
    const l = store.get('locale');
    return l && typeof l === 'string' ? l : 'en';
});

ipcMain.handle('get-translations-json', () => {
    const p = path.join(__dirname, 'web', 'locales', 'translations.json');
    try {
        if (!fs.existsSync(p)) {
            console.error('[get-translations-json] missing file:', p);
            return { strings: {} };
        }
        const raw = fs.readFileSync(p, 'utf8');
        return JSON.parse(stripUtf8Bom(raw));
    } catch (e) {
        console.error('[get-translations-json]', e.message);
        return { strings: {} };
    }
});

ipcMain.on('set-stored-locale', (_e, code) => {
    if (typeof code === 'string' && VALID_LOCALE_RE.test(code.substring(0, 2))) {
        store.set('locale', code.substring(0, 2).toLowerCase());
    }
});

ipcMain.on('reset-settings', () => {
    store.delete('config');
    app.relaunch();
    app.exit();
});

ipcMain.on('open-setup', () => {
    if (mainWindow) loadSetupWindow();
});

// ── Dashboard UI preferences (which main-menu sections are visible) ────────────
const DEFAULT_UI_PREFS = {
    sections: {
        livestock: true,
        vehicles: true,
        fields: true,
        economy: true,
        pastures: true,
        productions: true
    },
    excludedFarmlandIdsByServer: {}
};

ipcMain.handle('get-ui-preferences', () => {
    const u = store.get('uiPreferences') || {};
    return {
        sections: { ...DEFAULT_UI_PREFS.sections, ...(u.sections || {}) },
        excludedFarmlandIdsByServer: normalizeExcludedFarmlandIdsMap(u.excludedFarmlandIdsByServer)
    };
});

// ── AI Consultant BYOK (stored in electron-store; never committed) ─────────────
ipcMain.handle('get-consultant-byok-credentials', () => {
    const raw = store.get('consultantByok');
    const r = raw && typeof raw === 'object' ? raw : {};
    const apiKey = r.apiKey && String(r.apiKey).trim() ? String(r.apiKey).trim() : '';
    let provider = r.provider === 'gemini' ? 'gemini' : 'openai';
    if (apiKey) {
        if (apiKey.startsWith('AIza')) provider = 'gemini';
        else if (apiKey.startsWith('sk-')) provider = 'openai';
    }
    return { apiKey: apiKey || null, provider };
});

ipcMain.handle('get-consultant-byok-meta', () => {
    const raw = store.get('consultantByok');
    const r = raw && typeof raw === 'object' ? raw : {};
    const apiKey = r.apiKey && String(r.apiKey).trim() ? String(r.apiKey).trim() : '';
    let provider = r.provider === 'gemini' ? 'gemini' : 'openai';
    if (apiKey) {
        if (apiKey.startsWith('AIza')) provider = 'gemini';
        else if (apiKey.startsWith('sk-')) provider = 'openai';
    }
    return {
        hasKey: apiKey.length > 0,
        provider,
    };
});

ipcMain.handle('save-consultant-byok-credentials', (_e, payload) => {
    const clear = payload && payload.clear === true;
    if (clear) {
        store.delete('consultantByok');
        return { ok: true, cleared: true };
    }
    const rawPrev = store.get('consultantByok');
    const prev = rawPrev && typeof rawPrev === 'object' ? rawPrev : {};
    const prevKey = prev.apiKey && String(prev.apiKey).trim() ? String(prev.apiKey).trim() : '';
    const incoming = payload && payload.apiKey != null ? String(payload.apiKey).trim() : '';
    const apiKey = incoming || prevKey;
    let provider = payload && payload.provider === 'gemini' ? 'gemini' : 'openai';
    if (apiKey) {
        if (apiKey.startsWith('AIza')) provider = 'gemini';
        else if (apiKey.startsWith('sk-')) provider = 'openai';
    }
    if (!apiKey) {
        return { ok: false, error: 'empty_key' };
    }
    store.set('consultantByok', { apiKey, provider });
    return { ok: true };
});

ipcMain.handle('save-ui-preferences', (_e, prefs) => {
    const prev = store.get('uiPreferences') || {};
    const prevEx = normalizeExcludedFarmlandIdsMap(prev.excludedFarmlandIdsByServer);
    const formEx = normalizeExcludedFarmlandIdsMap(prefs?.excludedFarmlandIdsByServer);
    const mergedEx = { ...prevEx, ...formEx };
    const merged = {
        sections: { ...DEFAULT_UI_PREFS.sections, ...(prefs?.sections || {}) },
        excludedFarmlandIdsByServer: mergedEx
    };
    store.set('uiPreferences', merged);
    return { ok: true };
});

/** For Dashboard Settings: list owned fields only (same farm as the dashboard farm selector). */
ipcMain.handle('get-field-exclusion-options', (_e, payload) => {
    const activeFarmId = Number(payload?.activeFarmId ?? 1);
    const prefs = store.get('uiPreferences') || {};
    const excluded = normalizeExcludedFarmlandIdsMap(prefs.excludedFarmlandIdsByServer);
    const config = store.get('config') || {};
    const servers = config.servers || [];
    const nameById = {};
    for (const s of servers) {
        if (s && s.id != null) nameById[String(s.id)] = s.name || String(s.id);
    }
    const rows = [];
    for (const serverId of Object.keys(serverStates)) {
        const state = serverStates[serverId];
        const fields = state?.mergedData?.fields;
        if (!Array.isArray(fields)) continue;
        const exSet = new Set(excluded[serverId] || []);
        for (const f of fields) {
            const ownerFarmId = Number(f.ownerFarmId ?? f.farmId ?? 0);
            if (ownerFarmId <= 0 || ownerFarmId !== activeFarmId) continue;
            const farmlandId = Number(f.farmlandId ?? f.id);
            if (Number.isNaN(farmlandId)) continue;
            rows.push({
                serverId,
                serverName: nameById[serverId] || serverId,
                farmlandId,
                label: f.name || `Field ${farmlandId}`,
                hectares: f.hectares || 0,
                excluded: exSet.has(farmlandId)
            });
        }
    }
    rows.sort((a, b) => String(a.serverId).localeCompare(String(b.serverId)) || a.farmlandId - b.farmlandId);
    return { rows, activeFarmId };
});

// ── FS25 mod config.xml (same folder as documented modSettings path) ───────────
function getModConfigDir() {
    return path.join(os.homedir(), 'Documents', 'My Games', 'FarmingSimulator2025', 'modSettings', 'FS25_FarmDashboard');
}

function getModConfigPath() {
    return path.join(getModConfigDir(), 'config.xml');
}

function parseModConfigXml(text) {
    const base = {
        updateInterval: 10000,
        collectionCycleMs: 60000,
        modules: {
            animals: true,
            vehicles: true,
            weather: true,
            fields: true,
            finance: true,
            economy: true,
            production: true
        }
    };
    if (!text || typeof text !== 'string') return base;
    const ui = text.match(/updateInterval\s*=\s*"(\d+)"/i);
    const cc = text.match(/collectionCycleMs\s*=\s*"(\d+)"/i);
    if (ui) base.updateInterval = Math.max(1000, parseInt(ui[1], 10) || base.updateInterval);
    if (cc) base.collectionCycleMs = Math.max(5000, parseInt(cc[1], 10) || base.collectionCycleMs);
    const modNames = ['animals', 'vehicles', 'weather', 'fields', 'finance', 'economy', 'production'];
    for (const m of modNames) {
        const re = new RegExp(`${m}\\s*=\\s*"(true|false)"`, 'i');
        const mm = text.match(re);
        if (mm) base.modules[m] = mm[1].toLowerCase() === 'true';
    }
    return base;
}

function buildModConfigXml(cfg) {
    const u = Math.max(1000, Math.min(600000, Number(cfg.updateInterval) || 10000));
    const c = Math.max(5000, Math.min(1800000, Number(cfg.collectionCycleMs) || 60000));
    const M = cfg.modules || {};
    const b = (k) => (M[k] === false ? 'false' : 'true');
    return `<?xml version="1.0" encoding="utf-8"?>
<farmDashboard>
    <settings updateInterval="${u}" collectionCycleMs="${c}"/>
    <modules animals="${b('animals')}" vehicles="${b('vehicles')}" weather="${b('weather')}" fields="${b('fields')}" finance="${b('finance')}" economy="${b('economy')}" production="${b('production')}"/>
</farmDashboard>
`;
}

ipcMain.handle('get-mod-config', () => {
    const p = getModConfigPath();
    try {
        if (!fs.existsSync(p)) {
            return { path: p, exists: false, ...parseModConfigXml('') };
        }
        const text = fs.readFileSync(p, 'utf8');
        return { path: p, exists: true, ...parseModConfigXml(text) };
    } catch (e) {
        return { path: p, exists: false, error: e.message, ...parseModConfigXml('') };
    }
});

ipcMain.handle('save-mod-config', (_e, cfg) => {
    const p = getModConfigPath();
    try {
        fs.mkdirSync(getModConfigDir(), { recursive: true });
        fs.writeFileSync(p, buildModConfigXml(cfg || {}), 'utf8');
        return { ok: true, path: p };
    } catch (e) {
        return { ok: false, error: e.message };
    }
});

ipcMain.handle('scan-local-saves', async () => {
    const userHome = os.homedir();
    const basePath = path.join(
        userHome, 'Documents', 'My Games', 'FarmingSimulator2025',
        'modSettings', 'FS25_FarmDashboard'
    );
    if (!fs.existsSync(basePath)) return [];

    const foundSaves = [];
    const folders = fs.readdirSync(basePath, { withFileTypes: true });

    for (const dirent of folders) {
        if (!dirent.isDirectory()) continue;
        const jsonPath = path.join(basePath, dirent.name, 'data.json');
        if (!fs.existsSync(jsonPath)) continue;
        try {
            const parsed  = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
            const mapName = parsed.serverInfo?.mapName || 'Unknown Map';
            foundSaves.push({
                id: 'srv_' + Date.now() + Math.floor(Math.random() * 1000),
                name: `${mapName} (${dirent.name})`,
                mode: 'local',
                localPath: basePath,
                localSubFolder: dirent.name
            });
        } catch (e) {
            console.warn(`[scan-local-saves] Error parsing ${dirent.name}:`, e.message);
        }
    }
    return foundSaves;
});