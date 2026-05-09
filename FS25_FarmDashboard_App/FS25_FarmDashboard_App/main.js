// FS25 FarmDashboard | main.js | v2.0.0
// Authors: JoshWalki, WizardlyPayload
// Electron main: Express + WS on 8766, local fs.watch + FTP → mergeData → renderer.

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const url  = require('url');
const crypto = require('crypto');
const { spawn, exec } = require('child_process');

const express   = require('express');
const http      = require('http');
const WebSocket = require('ws');
const cors      = require('cors');
const ftp       = require('basic-ftp');
const Store     = require('electron-store');

const LAN_ACCESS_DEFAULTS = {
    lanAccessEnabled: false,
    lanUsername:      'admin',
    lanPassword:      'farmhub',
    lanAllowedIPs:    '',
    /** When true, GET/HEAD from non-loopback LAN clients skip HTTP Basic (closed networks only). */
    lanAuthOptional:  false,
};

const {
    collectXmlData,
    SAVEGAME_XML_FILES,
    FTP_SAVEGAME_XML_DOWNLOAD_ORDER,
} = require('./xmlCollector');
const { mergeData, buildFieldLiveFingerprints } = require('./dataMerger');
const { hydrateLuaDataAnimalsFromDetails } = require('./detailAnimalsHydrate');
const { loadServerCache, saveServerCache, appendFieldHistory } = require('./serverDataCache');
const { initAppUpdater, checkForUpdatesNow } = require('./app-updater');
const {
    collectFs25DocumentRoots,
    collectFarmDashboardModSettingsRoots,
    selectPreferredFs25UserDataRoot,
} = require('./fs25Paths');
const { readFileUtf8WithRetry } = require('./fileReadRetry');
const livestockDetailModule = require('./livestockDetail.js');
const { validateLanCredentials } = require('./lanCredentialPolicy.js');

const store = new Store({ defaults: { ...LAN_ACCESS_DEFAULTS } });

/** Same Documents folder as Explorer / FS25 (handles moved profiles); null if unavailable. */
function getElectronDocumentsPath() {
    try {
        return app.getPath('documents');
    } catch {
        return null;
    }
}

/**
 * FS25 user-data root (Documents / OneDrive / MS Store LocalCache / WpSystem / gameSettings override).
 * Prefers a folder that already contains mod output or saves over an empty tree.
 */
function getFs25DocumentsRoot() {
    const candidates = collectFs25DocumentRoots(getElectronDocumentsPath);
    const fallback = path.join(os.homedir(), 'Documents', 'My Games', 'FarmingSimulator2025');
    return selectPreferredFs25UserDataRoot(candidates, fallback) || fallback;
}

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



const VALID_LOCALE_RE = /^[a-z]{2}$/;

/** Written by the NSIS installer (first page); consumed on first app launch. */
async function consumeInstallLocaleFile() {
    const p = path.join(app.getPath('userData'), 'install-locale.txt');
    let raw;
    try {
        raw = await fs.promises.readFile(p, 'utf8');
    } catch (e) {
        if (e && e.code === 'ENOENT') return;
        console.warn('[install-locale]', e.message);
        return;
    }
    try {
        raw = stripUtf8Bom(raw).trim();
        const code = (raw.split(/\r?\n/)[0] || '').substring(0, 2).toLowerCase();
        if (VALID_LOCALE_RE.test(code)) store.set('locale', code);
        await fs.promises.unlink(p);
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
/** Debounce writing serverLiveCache JSON to disk after merge. */
const serverCacheSaveTimers = {};


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

    const modsRoot = path.join(getFs25DocumentsRoot(), 'mods');
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
expressApp.set('trust proxy', false);
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
        lanAuthOptional:  !!store.get('lanAuthOptional', LAN_ACCESS_DEFAULTS.lanAuthOptional),
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

let _localIfaceIpCache = null;
let _localIfaceIpCacheAt = 0;

/** Normalize IPv4-mapped IPv6 to dotted quad for comparison. */
function normalizeSocketIp(ip) {
    let s = String(ip || '').trim();
    if (s.startsWith('::ffff:')) s = s.slice(7);
    return s;
}

/** True if the HTTP client address is this machine (loopback or one of our NIC IPs). Fixes opening http://192.168.x.x:8766 on the same PC. */
function getCachedLocalInterfaceIps() {
    const now = Date.now();
    if (_localIfaceIpCache && now - _localIfaceIpCacheAt < 60000) return _localIfaceIpCache;
    const set = new Set();
    try {
        const ifs = os.networkInterfaces();
        for (const name of Object.keys(ifs)) {
            for (const a of ifs[name] || []) {
                if (a.internal) continue;
                if (a.family === 'IPv4' || a.family === 4) set.add(a.address);
                if (a.family === 'IPv6' || a.family === 6) set.add(a.address);
            }
        }
    } catch (_) {
        /* ignore */
    }
    _localIfaceIpCache = set;
    _localIfaceIpCacheAt = now;
    return set;
}

function isRequestFromThisMachine(req) {
    const raw = requestRemoteAddress(req);
    if (isLoopbackIp(raw)) return true;
    const nip = normalizeSocketIp(raw);
    if (!nip) return false;
    return getCachedLocalInterfaceIps().has(nip);
}

function normalizeIpForAllowlist(ip) {
    let s = String(ip || '').trim();
    if (s.startsWith('::ffff:')) s = s.slice(7);
    return s;
}

/**
 * When `lanAuthOptional` is true, GET/HEAD may skip Basic auth only for static/readme routes — never for live data,
 * tokens, or server manager JSON. Paths are Express `req.path` (no query).
 */
function isLanSensitiveHttpPath(reqPath) {
    const p = String(reqPath || '').split('?')[0] || '';
    if (!p.startsWith('/api/')) return false;
    const sensitive = new Set([
        '/api/lan-ws-token',
        '/api/setup-config',
        '/api/data',
        '/api/animals',
        '/api/vehicles',
        '/api/fields',
        '/api/production',
        '/api/finance',
        '/api/weather',
        '/api/economy',
        '/api/farmlands',
        '/api/simhub-view-config',
        '/api/simhub-session',
        '/api/servers',
        '/api/livestock',
    ]);
    if (sensitive.has(p)) return true;
    if (p.startsWith('/api/livestock/')) return true;
    return false;
}

/** Logs actionable LAN hints when HTTP starts (visible in the Electron main-process console / debug). */
function logLanStartupHints(bindHost) {
    const cfg = getLanSecurityFromStore();
    if (bindHost === '127.0.0.1') {
        console.log('');
        console.log('[LAN] Remote devices cannot open http://<this-PC-IP>:' + PORT + ' — HTTP is bound to localhost only.');
        console.log('[LAN] Enable: Farm Dashboard on this PC → Settings → Servers & saves → check "LAN access (listen on all interfaces)", then save.');
        console.log('[LAN] After enabling, if tablets still fail: allow inbound TCP ' + PORT + ' in Windows Firewall.');
        console.log('');
        return;
    }
    const ipv4 = [];
    try {
        const ifs = os.networkInterfaces();
        for (const k of Object.keys(ifs)) {
            for (const a of ifs[k] || []) {
                if (a.internal) continue;
                if (a.family === 'IPv4' || a.family === 4) ipv4.push(a.address);
            }
        }
    } catch (_) {
        /* ignore */
    }
    console.log('[LAN] Listening for other devices on port ' + PORT + '. Try:');
    if (ipv4.length === 0) {
        console.log('[LAN]   (no non-loopback IPv4 found — check Wi‑Fi/Ethernet on this PC)');
    } else {
        for (const ip of ipv4) {
            console.log('[LAN]   http://' + ip + ':' + PORT + '/');
        }
    }
    const allow = (cfg.lanAllowedIPs || '').trim();
    if (allow) {
        console.log('[LAN] IP allowlist is active; client IP must match: ' + allow);
    }
    console.log(
        '[LAN] If this PC can open its own LAN IP but other devices time out: use the same Wi‑Fi (not guest), disable router AP/client isolation, same subnet. Not usually this app.'
    );
    console.log('[LAN] If a device still cannot connect, add an inbound Windows Firewall rule for TCP ' + PORT + '.');
}

/** After listen, print Windows netstat lines for this port (confirms 0.0.0.0 vs 127.0.0.1). */
function logWindowsSocketsForFarmdashPort() {
    if (process.platform !== 'win32') return;
    exec(
        'cmd /c netstat -an | findstr ":8766"',
        { windowsHide: true, timeout: 8000 },
        (_err, stdout) => {
            const out = stdout && String(stdout).trim();
            if (out) {
                console.log('[LAN] netstat (expect LISTENING on 0.0.0.0:' + PORT + ' when LAN access is on):');
                for (const line of out.split(/\r?\n/)) {
                    const s = line.trim();
                    if (s) console.log('[LAN]   ' + s);
                }
            }
        }
    );
}

function redactConfigForHttpGet(config) {
    const c = config && typeof config === 'object' ? JSON.parse(JSON.stringify(config)) : {};
    if (!Array.isArray(c.servers)) return c;
    c.servers = c.servers.map((s) => {
        if (!s || typeof s !== 'object') return s;
        const copy = { ...s };
        const hadPass = copy.ftpPass != null && String(copy.ftpPass).length > 0;
        delete copy.ftpPass;
        copy.ftpPassSet = hadPass;
        if (copy.httpFeedCode != null && String(copy.httpFeedCode).length > 0) {
            delete copy.httpFeedCode;
            copy.httpFeedCodeSet = true;
        } else {
            copy.httpFeedCodeSet = false;
        }
        return copy;
    });
    return c;
}

/** Preserve FTP / feed secrets when LAN setup POST omits redacted fields (GET never returns cleartext). */
function mergeServersPreserveSecrets(prevServers, incomingServers) {
    if (!Array.isArray(incomingServers)) return [];
    const prevById = new Map((prevServers || []).map((s) => [String(s.id), s]));
    return incomingServers.map((inc) => {
        if (!inc || typeof inc !== 'object') return inc;
        const prev = prevById.get(String(inc.id));
        const out = { ...inc };
        delete out.ftpPassSet;
        delete out.httpFeedCodeSet;
        if (inc.mode === 'ftp' && prev) {
            const emptyPass = inc.ftpPass == null || String(inc.ftpPass).trim() === '';
            if (emptyPass && prev.ftpPass) out.ftpPass = prev.ftpPass;
        }
        const emptyCode = inc.httpFeedCode == null || String(inc.httpFeedCode).trim() === '';
        if (emptyCode && prev && prev.httpFeedCode) out.httpFeedCode = prev.httpFeedCode;
        return out;
    });
}

function corsOriginAllowed(origin, callback) {
    if (!origin) return callback(null, true);
    try {
        const u = new URL(origin);
        if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return callback(null, true);
        const p = u.port || (u.protocol === 'https:' ? '443' : '80');
        if (String(p) === '8766') return callback(null, true);
    } catch (_) {
        /* ignore */
    }
    return callback(null, false);
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
    // Same PC often opens http://THIS-PC-LAN-IP:8766 — trust like loopback without Basic churn.
    if (isRequestFromThisMachine(req)) {
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

    const method = String(req.method || 'GET').toUpperCase();
    const isWsUpgrade = String(req.headers?.upgrade || '').toLowerCase() === 'websocket';
    const pathOnly = req.path || (req.url && String(req.url).split('?')[0]) || '';
    /**
     * Remote tablets need the HTML/JS/CSS shell and a health check without the browser's HTTP Basic
     * dialog. Farm data stays on /api/* (sensitive list + other /api routes still require auth below).
     * WebSocket upgrades are never allowed here (token or Basic on the upgrade request).
     */
    if (
        (method === 'GET' || method === 'HEAD') &&
        !isWsUpgrade &&
        (!pathOnly.startsWith('/api/') || pathOnly === '/api/status')
    ) {
        return { ok: true };
    }
    if (
        cfg.lanAuthOptional &&
        (method === 'GET' || method === 'HEAD') &&
        !isWsUpgrade &&
        !isLanSensitiveHttpPath(pathOnly)
    ) {
        return { ok: true };
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
    const pathOnly = req.path || (req.url && String(req.url).split('?')[0]) || '';
    /**
     * Never send WWW-Authenticate on /api/* — browsers (especially Safari on iPhone) may show the
     * system HTTP Basic sheet on every 401 before our SPA can attach Authorization, causing a login loop.
     * In-app LAN gate (lan-http-auth.js) sends Basic explicitly on fetch.
     */
    if (r.wwwAuthenticate && !pathOnly.startsWith('/api/')) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Farm Dashboard"');
    }
    return res.status(r.code || 403).send(r.message || 'Forbidden');
}

/** TCP client is loopback — used to block LAN from triggering heavy/sensitive HTTP actions. */
function isLocalhostSocket(req) {
    return isLoopbackIp(requestRemoteAddress(req));
}

/** Local dashboard UI (this PC): loopback or same host opened via LAN IP. */
function isLocalDashboardClient(req) {
    return isRequestFromThisMachine(req);
}


/** Allow POST /api/export-mod-store-images from LAN (default: localhost only). Power users: set env FARMDASH_ALLOW_LAN_EXPORT=1 */
function allowLanModExportHttp() {
    return process.env.FARMDASH_ALLOW_LAN_EXPORT === '1';
}

expressApp.use(cors({ origin: corsOriginAllowed }));
expressApp.use(express.json());
expressApp.use(lanAccessHttpMiddleware);
expressApp.get('/simhub', (_req, res) => {
    res.redirect(302, '/simhub.html');
});
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

/** Setup wizard JSON — FTP / feed secrets never included (use ftpPassSet / httpFeedCodeSet). Electron uses IPC for full config. */
expressApp.get('/api/setup-config', (req, res) => {
    try {
        res.json(redactConfigForHttpGet(store.get('config') || {}));
    } catch (e) {
        console.error('[api/setup-config GET]', e);
        res.status(500).json({ error: String(e.message || e) });
    }
});

/**
 * Save first-run / Server Manager config from a browser (same effect as ipcRenderer `save-settings`).
 * Requires ``X-Setup-Token`` (see ``ensureSetupWriteToken`` / setup page injection).
 */
expressApp.post('/api/setup-config', async (req, res) => {
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
        await applyFarmdashSetupConfig(body);
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
        // Plan v5 A5: surface a configuration warning so the UI can render a dismissible banner.
        configWarning: (serverStates[s.id] && serverStates[s.id].configWarning) || null,
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

/** SimHub read-only clients: follow the server + farm last selected in the desktop dashboard. */
function normalizeSimHubLiveContext(raw) {
    const keys = Object.keys(serverStates);
    const firstSid = keys[0] || '';
    let serverId = '';
    let farmId = 1;
    let updatedAt = null;
    if (raw && typeof raw === 'object') {
        if (raw.serverId != null && String(raw.serverId).trim() !== '') {
            serverId = String(raw.serverId).trim();
        }
        const f = Number(raw.farmId);
        if (Number.isFinite(f) && f > 0) farmId = Math.floor(f);
        if (raw.updatedAt) updatedAt = raw.updatedAt;
    }
    if (serverId && serverStates[serverId] == null) {
        serverId = firstSid;
    }
    if (!serverId) serverId = firstSid;
    return { serverId, farmId, updatedAt };
}

function getSimHubLiveContext() {
    try {
        return normalizeSimHubLiveContext(store.get('simHubLiveContext'));
    } catch (e) {
        return normalizeSimHubLiveContext(null);
    }
}

function applySimHubLiveContextPatch(payload) {
    const cur = getSimHubLiveContext();
    let serverId = cur.serverId;
    let farmId = cur.farmId;
    if (payload && typeof payload === 'object') {
        if (payload.serverId != null && String(payload.serverId).trim() !== '') {
            serverId = String(payload.serverId).trim();
        }
        const f = Number(payload.farmId);
        if (Number.isFinite(f) && f > 0) farmId = Math.floor(f);
    }
    if (serverId && serverStates[serverId] == null) {
        serverId = Object.keys(serverStates)[0] || '';
    }
    const next = {
        serverId,
        farmId,
        updatedAt: new Date().toISOString(),
    };
    store.set('simHubLiveContext', next);
    return next;
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
    const raw =
        Array.isArray(mergedData.fields) && mergedData.fields.length > 0
            ? mergedData.fields
            : Array.isArray(mergedData.allFields) && mergedData.allFields.length > 0
              ? mergedData.allFields
              : mergedData.fields;
    const fields = filterFieldsByExclusions(Array.isArray(raw) ? raw : [], serverId);
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

// Plan v5 A6: CSRF + rate-limit + integer-id validation for new write endpoints.
// Loopback always passes. Non-loopback must:
//   - send Origin or Referer matching http(s)://<host>:8766 (or localhost/127.0.0.1)
//   - send X-FarmDash-Token / X-Setup-Token matching ensureSetupWriteToken() value
//   - rate limit: 10 POST requests per 30s window per remote IP (token bucket)
const lanWriteRateBuckets = new Map(); // ip -> { tokens, last }
function takeRateLimitToken(ip, capacity = 10, refillSec = 30) {
    const now = Date.now() / 1000;
    let b = lanWriteRateBuckets.get(ip);
    if (!b) { b = { tokens: capacity, last: now }; lanWriteRateBuckets.set(ip, b); }
    const elapsed = Math.max(0, now - b.last);
    b.tokens = Math.min(capacity, b.tokens + elapsed * (capacity / refillSec));
    b.last = now;
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
}
function getRequestOrigin(req) {
    const o = req.headers && (req.headers.origin || req.headers.referer || '');
    if (!o) return '';
    try {
        return new URL(String(o)).origin;
    } catch (_) { return ''; }
}
function isAllowedSameOrigin(originStr, req) {
    if (!originStr) return false;
    try {
        const u = new URL(originStr);
        if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return true;
        if (String(u.port || (u.protocol === 'https:' ? 443 : 80)) === '8766') return true;
        // Same hostname as the request itself (LAN tablet hitting <hostIp>:8766 with same origin).
        const hostHeader = String(req.headers && req.headers.host || '').split(':')[0];
        if (hostHeader && u.hostname === hostHeader) return true;
    } catch (_) { /* ignore */ }
    return false;
}
function enforceWriteOriginAndToken(req, res) {
    if (isLocalhostSocket(req)) return null; // loopback always passes
    // Origin/Referer same-origin required from non-loopback
    const origin = getRequestOrigin(req);
    if (!isAllowedSameOrigin(origin, req)) {
        return { code: 403, body: { ok: false, error: 'origin not allowed' } };
    }
    // When LAN access is enabled the API binds beyond localhost — require setup token for writes.
    // With LAN off, only local processes reach the port; same-origin check above still applies for browsers.
    const lanOn = !!store.get('lanAccessEnabled', false);
    if (!lanOn) return null;
    ensureSetupWriteToken();
    const expected = String(store.get('farmdashSetupWriteToken') || '');
    const got = String(
        (req.headers && (req.headers['x-farmdash-token'] || req.headers['x-setup-token'])) || ''
    ).trim();
    if (!expected || got !== expected) {
        return { code: 403, body: { ok: false, error: 'invalid token' } };
    }
    return null;
}

// Plan v5 A1+A6: per-pen LOD detail with id validation, rich response, and security gates.
// Reads `details/animals_<id>.json` from the mod's output directory; FTP mode consults the
// dirtyPens.json index (downloaded alongside data.json by pollFtp) to skip needless refetches.
expressApp.get('/api/livestock/:id', async (req, res) => {
    const pk = livestockDetailModule.parsePenKeyForRead(req.params.id);
    if (!pk) {
        return res.status(400).json({ error: 'invalid id' });
    }
    try {
        const result = await getLivestockDetail(req);
        if (!result || !result.detail) {
            return res.status(404).json({ error: 'detail not available', id: pk.canonicalKey });
        }
        res.json(result);
    } catch (e) {
        if (e && e.code === 'INVALID_ID') {
            return res.status(400).json({ error: 'invalid id' });
        }
        console.error('[api/livestock/:id]', e && e.stack ? e.stack : e);
        res.status(500).json({ error: String(e.message || e) });
    }
});

// Plan v5 A4+A6: write a hardened, bounded, schema-versioned requests.json with CSRF + rate limit.
expressApp.post('/api/livestock/:id/request', express.json({ limit: '8kb' }), async (req, res) => {
    const idCheck = livestockDetailModule.validatePenId(req.params.id);
    if (idCheck == null) {
        return res.status(400).json({ ok: false, error: 'invalid id' });
    }
    const gate = enforceWriteOriginAndToken(req, res);
    if (gate) return res.status(gate.code).json(gate.body);
    const ip = String(req.ip || requestRemoteAddress(req) || 'unknown');
    if (!takeRateLimitToken(ip)) {
        res.setHeader('Retry-After', '15');
        return res.status(429).json({ ok: false, error: 'rate limit' });
    }
    try {
        const ok = await requestLivestockDetail(req);
        res.json({ ok: !!ok });
    } catch (e) {
        if (e && e.code === 'INVALID_ID') {
            return res.status(400).json({ ok: false, error: 'invalid id' });
        }
        console.error('[api/livestock/:id/request]', e && e.stack ? e.stack : e);
        res.status(500).json({ ok: false, error: String(e.message || e) });
    }
});

function getServersFromStore() {
    const config = store.get('config');
    return Array.isArray(config?.servers) ? config.servers : [];
}
function getLivestockDetail(req) {
    return livestockDetailModule.read({
        req,
        resolveServerIdForRequest,
        servers: getServersFromStore(),
        serverStates,
        getFs25DocumentsRoot,
    });
}
function requestLivestockDetail(req) {
    return livestockDetailModule.request({
        req,
        resolveServerIdForRequest,
        servers: getServersFromStore(),
        serverStates,
        getFs25DocumentsRoot,
    });
}
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

expressApp.get('/api/simhub-view-config', (req, res) => {
    try {
        const u = store.get('uiPreferences') || {};
        const sid = req.query && req.query.serverId != null && req.query.serverId !== ''
            ? String(req.query.serverId)
            : '';
        const fcpAll = normalizeFieldClusterPrefs(u.fieldClusterPrefsByServer);
        const fieldClusterPrefs = sid ? (fcpAll[sid] || { autoMerge: true, manualGroups: [] }) : { autoMerge: true, manualGroups: [] };
        res.json({
            simHubView: normalizeSimHubView(u.simHubView),
            fieldClusterPrefs,
        });
    } catch (e) {
        console.error('[api/simhub-view-config]', e);
        res.status(500).json({ error: String(e.message || e) });
    }
});

expressApp.get('/api/simhub-session', (_req, res) => {
    try {
        const ctx = getSimHubLiveContext();
        res.json(ctx);
    } catch (e) {
        console.error('[api/simhub-session]', e);
        res.status(500).json({ serverId: '', farmId: 1, error: String(e.message || e) });
    }
});

/** For WebSocket clients that cannot send Basic auth on the upgrade request (browsers). */
expressApp.get('/api/lan-ws-token', (req, res) => {
    res.json({ token: ensureLanWsSecret() });
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
    if (isRequestFromThisMachine(req)) return true;

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

/** Serializes bind so concurrent ``bootServer`` / ``restartHttpServer`` cannot orphan a listener (EADDRINUSE). */
let httpListenChain = Promise.resolve();

/**
 * Starts HTTP + WebSocket on ``bindHost`` (``127.0.0.1`` or ``0.0.0.0``).
 * Always closes any existing ``server`` before creating a new one.
 */
function listenFarmdashHttp(bindHost, onListening) {
    httpListenChain = httpListenChain.then(
        () =>
            new Promise((resolve, reject) => {
                const doListen = () => {
                    try {
                        clients.clear();
                        server = http.createServer(expressApp);
                        attachWebSocketServer(server);
                        let settled = false;
                        const finish = () => {
                            if (settled) return;
                            settled = true;
                            resolve();
                        };
                        server.once('error', (err) => {
                            console.error('[HTTP/WS] server error:', err && err.code ? err.code : err.message || err);
                            finish();
                        });
                        server.listen(PORT, bindHost, () => {
                            console.log(`[HTTP/WS] listening on http://${bindHost === '0.0.0.0' ? '0.0.0.0 (all interfaces)' : bindHost}:${PORT}`);
                            logLanStartupHints(bindHost);
                            logWindowsSocketsForFarmdashPort();
                            if (typeof onListening === 'function') onListening();
                            finish();
                        });
                    } catch (e) {
                        console.error('[HTTP/WS] listen setup failed', e);
                        reject(e);
                    }
                };
                if (server) {
                    closeHttpServer(doListen);
                } else {
                    doListen();
                }
            })
    ).catch((e) => {
        console.error('[HTTP/WS] listen chain', e && e.message ? e.message : e);
    });
}

function closeHttpServer(done) {
    const httpSrv = server;
    const wsSrv = wss;
    if (!wsSrv && (!httpSrv || !httpSrv.listening)) {
        server = null;
        wss = null;
        if (typeof done === 'function') done();
        return;
    }
    wss = null;
    const finish = () => {
        server = null;
        if (typeof done === 'function') done();
    };
    if (wsSrv) {
        try {
            wsSrv.close(() => {
                if (httpSrv && httpSrv.listening) {
                    httpSrv.close(finish);
                } else {
                    finish();
                }
            });
        } catch (_) {
            if (httpSrv && httpSrv.listening) {
                httpSrv.close(finish);
            } else {
                finish();
            }
        }
    } else if (httpSrv && httpSrv.listening) {
        httpSrv.close(finish);
    } else {
        finish();
    }
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
    if (data == null) return;
    const payload = cloneMergedDataWithFieldExclusions(data, serverId) || data;
    const msg = JSON.stringify({ type: 'data', serverId, data: payload, timestamp: new Date().toISOString() });
    clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(msg); });
}

// ── Data processing ───────────────────────────────────────────────────────────


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
    updateLuaLiveBackup(state, state.mergedData);
    broadcast(serverId, state.mergedData);
    console.log(`[Cache] [${serverId}] Restored last merged snapshot from disk (use until live Lua/XML return)`);
}

function getLocalLuaJsonPathForServer(srv) {
    let basePath = srv.localPath;
    if (!basePath) {
        basePath = path.join(getFs25DocumentsRoot(), 'modSettings', 'FS25_FarmDashboard');
    }
    const folderName =
        srv.localSubFolder ||
        String(srv.name || '').replace(/[<>:"/\\|?*]/g, '').trim();
    if (!folderName) return null;
    return path.join(basePath, folderName, 'data.json');
}

function productionLooksEmpty(p) {
    if (!p || typeof p !== 'object') return true;
    const chains = p.chains;
    if (Array.isArray(chains) && chains.length > 0) return false;
    const ht = p.husbandryTotals;
    if (ht && typeof ht === 'object' && Object.keys(ht).length > 0) return false;
    return true;
}

/**
 * True when data.json looks like a full in-game export (vs `{}` / minimal writes on FS exit).
 * Used to avoid restoring stale animals/production when the live export is intentionally empty.
 */
function isRichLuaExport(lua) {
    if (!lua || typeof lua !== 'object') return false;
    const keys = Object.keys(lua).length;
    if (keys >= 10) return true;
    if (Array.isArray(lua.fields) && lua.fields.length > 0) return true;
    if (Array.isArray(lua.vehicles) && lua.vehicles.length > 0) return true;
    if (lua.finance && typeof lua.finance === 'object' && Object.keys(lua.finance).length > 0) return true;
    if (lua.gameTime && typeof lua.gameTime === 'object' && Object.keys(lua.gameTime).length > 0) return true;
    if (lua.weather && typeof lua.weather === 'object') return true;
    return false;
}

/** Last non-empty Lua-only sections so shutdown/truncated data.json does not zero the UI. */
function updateLuaLiveBackup(state, merged) {
    if (!merged) return;
    const hasAnim = Array.isArray(merged.animals) && merged.animals.length > 0;
    const hasProd = !productionLooksEmpty(merged.production);
    if (!hasAnim && !hasProd) return;
    const prev = state.luaLiveBackup || {};
    state.luaLiveBackup = {
        animals: hasAnim
            ? JSON.parse(JSON.stringify(merged.animals))
            : (prev.animals ? JSON.parse(JSON.stringify(prev.animals)) : undefined),
        production: hasProd
            ? JSON.parse(JSON.stringify(merged.production))
            : (prev.production ? JSON.parse(JSON.stringify(prev.production)) : undefined),
    };
}

function applyLuaLiveBackupIfStaleExport(merged, luaPayload, state) {
    if (!merged || !state.luaLiveBackup) return merged;
    const backup = state.luaLiveBackup;
    const mergedAnimEmpty = !Array.isArray(merged.animals) || merged.animals.length === 0;
    const mergedProdEmpty = productionLooksEmpty(merged.production);
    const backupAnim = Array.isArray(backup.animals) && backup.animals.length > 0;
    const backupProd = backup.production && !productionLooksEmpty(backup.production);
    const needAnimRestore = mergedAnimEmpty && backupAnim;
    const needProdRestore = mergedProdEmpty && backupProd;
    if (!needAnimRestore && !needProdRestore) return merged;
    if (isRichLuaExport(luaPayload)) return merged;

    const ts = {
        ...(merged.dataTimestamps || {}),
        luaLiveSectionsHeldStaleAt: new Date().toISOString(),
    };
    const out = { ...merged, dataTimestamps: ts };
    if (needAnimRestore) {
        out.animals = JSON.parse(JSON.stringify(backup.animals));
    }
    if (needProdRestore) {
        out.production = JSON.parse(JSON.stringify(backup.production));
    }
    console.warn(
        '[rebuildMerged] Restored animals/production from last good Lua export ' +
            '(current data.json looks like a shutdown or minimal snapshot)'
    );
    return out;
}

/**
 * Boot-time hydration from the latest already-written Lua JSON.
 * This lets the dashboard show "last known server/save state" even while FS25 is not running.
 */
function hydrateLuaSnapshotFromDiskAtBoot(srv) {
    try {
        const state = serverStates[srv.id];
        if (!state) return;
        let luaJsonPath = null;
        if (srv.mode === 'local') {
            luaJsonPath = getLocalLuaJsonPathForServer(srv);
        } else if (srv.mode === 'ftp') {
            luaJsonPath = path.join(app.getPath('userData'), `data_${srv.id}.json`);
        }
        if (!luaJsonPath || !fs.existsSync(luaJsonPath)) return;
        const raw = readFileUtf8WithRetry(luaJsonPath);
        if (raw == null) return;
        processLuaData(srv.id, stripUtf8Bom(raw));
        console.log(`[Boot] [${srv.id}] Hydrated Lua snapshot from disk: ${luaJsonPath}`);
    } catch (e) {
        console.warn(`[Boot] [${srv.id}] Lua snapshot hydrate failed:`, e.message);
    }
}

function rebuildMerged(serverId) {
    const state = serverStates[serverId];
    if (!state) return;
    let luaPayload = state.luaData;
    const srv = getServersFromStore().find((s) => String(s.id) === String(serverId));
    if (srv && state.luaData && (srv.mode === 'local' || srv.mode === 'ftp')) {
        try {
            luaPayload = hydrateLuaDataAnimalsFromDetails(
                state.luaData,
                srv,
                getLocalLuaJsonPathForServer,
                {
                    userDataPath: app.getPath('userData'),
                    serverState: state,
                }
            );
        } catch (e) {
            console.warn('[DetailHydrate]', serverId, e && e.message ? e.message : e);
            luaPayload = state.luaData;
        }
    }
    let merged;
    try {
        merged = mergeData(luaPayload, state.xmlData, {
            fieldLiveCache: state.fieldLiveCache || {},
            lastLuaAt: state.lastLuaReceivedAt || null,
            lastXmlAt: state.lastXmlReceivedAt || null,
        });
    } catch (e) {
        console.warn('[rebuildMerged] merge threw', serverId, e && e.message ? e.message : e);
        merged = null;
    }
    if (!merged) {
        if (state.mergedData) {
            state.mergedData = {
                ...state.mergedData,
                dataTimestamps: {
                    ...(state.mergedData.dataTimestamps || {}),
                    mergeHeldStaleAt: new Date().toISOString(),
                },
            };
            if (state.fieldHistory && Object.keys(state.fieldHistory).length > 0) {
                state.mergedData.fieldStatusHistory = state.fieldHistory;
            }
            const si = { ...(state.mergedData.serverInfo || {}) };
            const cw = state.configWarning;
            if (cw) si.configWarning = cw;
            else delete si.configWarning;
            state.mergedData.serverInfo = si;
            broadcast(serverId, state.mergedData);
            schedulePersistServerCache(serverId);
            console.warn(
                `[rebuildMerged] [${serverId}] merge unavailable; keeping last merged snapshot (live export may have stopped)`
            );
            return;
        }
        try {
            hydrateServerCacheFromDisk(serverId);
        } catch (e) {
            console.warn('[rebuildMerged] hydrate fallback failed', serverId, e.message);
        }
        return;
    }
    merged = applyLuaLiveBackupIfStaleExport(merged, luaPayload, state);
    state.mergedData = merged;
    if (state.mergedData && state.fieldHistory && Object.keys(state.fieldHistory).length > 0) {
        state.mergedData.fieldStatusHistory = state.fieldHistory;
    }
    if (state.mergedData) {
        const si = { ...(state.mergedData.serverInfo || {}) };
        const cw = state.configWarning;
        if (cw) si.configWarning = cw;
        else delete si.configWarning;
        state.mergedData.serverInfo = si;
    }
    updateLuaLiveBackup(state, state.mergedData);
    broadcast(serverId, state.mergedData);
    schedulePersistServerCache(serverId);
}

function processLuaData(serverId, raw) {
    try {
        const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const state = serverStates[serverId];
        if (!state) return;

        // FS exit / partial writes can yield JSON `null` or non-objects — do not wipe live state.
        if (data == null || typeof data !== 'object' || Array.isArray(data)) {
            console.warn(
                `[processLuaData] [${serverId}] ignored invalid Lua JSON (expected object); keeping previous export`
            );
            return;
        }

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
        basePath = path.join(getFs25DocumentsRoot(), 'modSettings', 'FS25_FarmDashboard');
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

    const readFile = () => {
        const raw = readFileUtf8WithRetry(luaJsonPath);
        if (raw != null) processLuaData(srv.id, stripUtf8Bom(raw));
    };

    // fs.watch + persistent:false — avoids chokidar polling handles that kept Windows folders "in use".
    let fw;
    try {
        fw = fs.watch(luaJsonPath, { persistent: false }, () => readFile());
        fw.on('error', (err) => {
            console.warn(`[Local] watch error [${srv.id}]:`, err && err.message ? err.message : err);
            try {
                fw.close();
            } catch (_) { /* ignore */ }
            state.watcher = null;
            state.intervals.push(setTimeout(() => startLocalWatching(srv), 5000));
        });
    } catch (e) {
        console.warn(`[Local] fs.watch failed [${srv.id}]:`, e.message);
        state.intervals.push(setTimeout(() => startLocalWatching(srv), 5000));
        return;
    }
    state.watcher = fw;
    readFile();

    const dirtyPensPath = path.join(path.dirname(luaJsonPath), 'dirtyPens.json');
    try {
        const bustDirty = () => {
            try {
                livestockDetailModule.bustDirtyIndexCache(srv.id);
            } catch (_) { /* ignore */ }
        };
        let fwDirty = null;
        if (fs.existsSync(dirtyPensPath)) {
            fwDirty = fs.watch(dirtyPensPath, { persistent: false }, bustDirty);
            fwDirty.on('error', (err) => {
                console.warn(`[Local] dirtyPens watch error [${srv.id}]:`, err && err.message ? err.message : err);
                try { fwDirty.close(); } catch (_) { /* ignore */ }
                state.dirtyPensWatcher = null;
            });
        } else {
            const dirOfDirty = path.dirname(dirtyPensPath);
            const baseName = path.basename(dirtyPensPath);
            if (fs.existsSync(dirOfDirty)) {
                fwDirty = fs.watch(dirOfDirty, { persistent: false }, (_evt, fname) => {
                    if (fname === baseName) bustDirty();
                });
                fwDirty.on('error', (err) => {
                    console.warn(`[Local] slot-dir watch error [${srv.id}]:`, err && err.message ? err.message : err);
                    try { fwDirty.close(); } catch (_) { /* ignore */ }
                    state.dirtyPensWatcher = null;
                });
            }
        }
        state.dirtyPensWatcher = fwDirty;
    } catch (e) {
        console.warn(`[Local] dirtyPens watch setup failed [${srv.id}]:`, e.message);
    }

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

/** FTP FileInfo.type — Directory (skip when syncing files). */
const FTP_FILE_TYPE_DIRECTORY = 2;

/**
 * Mirror host `details/animals_*.json` into userData so livestock hydration matches local mode.
 * Only re-downloads when remote size differs from cached file (large herds = multi‑MiB files).
 */
/** @returns {Promise<number>} number of detail files newly downloaded or updated */
async function syncFtpDetailsCache(client, srv, slotRemote, userDataPath) {
    const remoteDir = `${slotRemote}/details`.replace(/\\/g, '/');
    const localRoot = path.join(userDataPath, 'ftpDetailsCache', String(srv.id));
    const st = serverStates[srv.id];
    const folderName =
        (st && st.lastSaveSlot) ||
        srv.localSubFolder ||
        'savegame1';
    const localDir = path.join(localRoot, folderName, 'details');
    try {
        fs.mkdirSync(localDir, { recursive: true });
    } catch (_) {
        return 0;
    }
    let list;
    try {
        list = await client.list(remoteDir);
    } catch (_) {
        return 0;
    }
    let pulled = 0;
    const dlOpts = { maxAttempts: 2, retryDelayMs: 400 };
    for (const ent of list) {
        if (!ent || !ent.name || ent.type === FTP_FILE_TYPE_DIRECTORY) continue;
        const name = ent.name;
        if (!name.startsWith('animals_') || !name.endsWith('.json')) continue;
        const remotePath = `${remoteDir}/${name}`;
        const localFinal = path.join(localDir, name);
        const tmpPath = `${localFinal}.tmp`;
        let need = true;
        if (fs.existsSync(localFinal)) {
            try {
                const localSize = fs.statSync(localFinal).size;
                const remSize = Number(ent.size);
                if (Number.isFinite(remSize) && remSize > 0 && localSize === remSize) {
                    need = false;
                }
            } catch (_) {
                /* re-fetch */
            }
        }
        if (!need) continue;
        if (await safeDownload(client, remotePath, tmpPath, localFinal, dlOpts)) {
            pulled += 1;
        }
    }
    if (pulled > 0) {
        console.log(`[FTP] [${srv.id}] Synced ${pulled} pen detail file(s) → ${localDir}`);
    }
    return pulled;
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
        let slotRemote = `${basePath}/modSettings/FS25_FarmDashboard/${folderName}`;
        const remotePath = `${slotRemote}/data.json`;

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

        const stAfter = serverStates[srv.id];
        const folderAfter =
            (stAfter && stAfter.lastSaveSlot) ||
            srv.localSubFolder ||
            'savegame1';
        slotRemote = `${basePath}/modSettings/FS25_FarmDashboard/${folderAfter}`;

        // Plan v5 A1: piggy-back the small dirtyPens.json index download on the same FTP session.
        // No extra connect; failures are non-fatal so data.json polling is never disrupted.
        try {
            const dirtyRemote = `${slotRemote}/dirtyPens.json`;
            const dirtyTmp = path.join(userDataPath, `livestock_dirtyPens_${srv.id}.json.tmp`);
            const dirtyFinal = path.join(userDataPath, `livestock_dirtyPens_${srv.id}.json`);
            const ok = await safeDownload(client, dirtyRemote, dirtyTmp, dirtyFinal, { maxAttempts: 1 });
            if (!ok && srv && srv.id != null) {
                // Don't spam: dirtyPens.json may not exist yet on a fresh save.
                if (!serverStates[srv.id] || !serverStates[srv.id]._dirtyMissingLogged) {
                    if (serverStates[srv.id]) serverStates[srv.id]._dirtyMissingLogged = true;
                    console.log(`[FTP] [${srv.id}] dirtyPens.json not yet available on host; live detail fetches will refetch on each click until index exists.`);
                }
            }
        } catch (e) {
            console.warn(`[FTP] [${srv.id}] dirtyPens piggy-back failed: ${e && e.message}`);
        }

        try {
            const detailPulls = await syncFtpDetailsCache(client, srv, slotRemote, userDataPath);
            if (detailPulls > 0) {
                rebuildMerged(srv.id);
            }
        } catch (e) {
            console.warn(`[FTP] [${srv.id}] details folder sync: ${e && e.message}`);
        }
    } catch (err) {
        console.warn(`[FTP] [${srv.id}] ${srv.name}: ${err.message}`);
    } finally {
        client.close();
    }
}

function getFtpPollingOptions(config) {
    const fp = config.ftpPolling || {};
    /** Default 1 min: aligns with mod default `collectionCycleMs=60000` (one full export pass / minute class). */
    const minutes = Math.min(25, Math.max(1, parseInt(fp.intervalMinutes, 10) || 1));
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
        `delay ${initialDelaySeconds}s | ${N} server(s) | ` +
        'tip: set interval to a multiple of the mod `collectionCycleMs` (default 60s) for smooth updates'
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

/** Stops local file watchers, FTP timers, and cache debouncers. Chokidar.close() was async; quit now awaits this. */
async function stopAllWatchers() {
    clearFtpPollingTimers();
    Object.keys(serverCacheSaveTimers).forEach((k) => {
        clearTimeout(serverCacheSaveTimers[k]);
        delete serverCacheSaveTimers[k];
    });
    const states = Object.values(serverStates);
    for (const state of states) {
        if (state.watcher) {
            try {
                state.watcher.close();
            } catch (_) { /* ignore */ }
            state.watcher = null;
        }
        if (state.dirtyPensWatcher) {
            try {
                state.dirtyPensWatcher.close();
            } catch (_) { /* ignore */ }
            state.dirtyPensWatcher = null;
        }
        for (const t of (state.intervals || [])) {
            clearTimeout(t);
            clearInterval(t);
        }
    }
    serverStates = {};
}

/** True if we should navigate the main window to the dashboard HTTP root (skip only when already on `/`, not on `/setup.html`). */
function shouldLoadDashboardUrl() {
    if (!mainWindow || mainWindow.isDestroyed()) return true;
    try {
        const raw = mainWindow.webContents.getURL();
        if (!raw) return true;
        let url;
        try {
            url = new URL(raw);
        } catch {
            return true;
        }
        if (url.protocol === 'file:') return true;
        const host = url.hostname.toLowerCase();
        const port = String(url.port || (url.protocol === 'https:' ? '443' : '80'));
        const onLocalApp =
            (host === '127.0.0.1' || host === 'localhost' || host === '::1') &&
            port === String(PORT);
        if (!onLocalApp) return true;
        const pathNorm = (url.pathname || '/').replace(/\/+$/, '') || '/';
        const onDashboardHome =
            pathNorm === '/' || pathNorm.toLowerCase() === '/index.html';
        return !onDashboardHome;
    } catch (_) {
        return true;
    }
}

async function bootServer(config) {
    await stopAllWatchers();

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
            dirtyPensWatcher: null,
            intervals: [],
            lastSaveSlot: null,
            lastLuaReceivedAt: null,
            lastXmlReceivedAt: null,
            fieldLiveCache: {},
            fieldHistory: {},
            luaLiveBackup: null,
            configWarning: null,
        };
    });

    // Plan v5 A5: surface localSubFolder mismatches as a one-time WARN + serverInfo.configWarning.
    // Only meaningful for local mode (FTP folder name is resolved later from save-slot probing).
    servers.forEach((srv) => {
        if (!srv || srv.mode !== 'local') return;
        try {
            let basePath = srv.localPath;
            if (!basePath) {
                basePath = path.join(getFs25DocumentsRoot(), 'modSettings', 'FS25_FarmDashboard');
            }
            const folderName = srv.localSubFolder ||
                String(srv.name || '').replace(/[<>:"/\\|?*]/g, '').trim();
            if (!folderName) {
                serverStates[srv.id].configWarning = {
                    code: 'localSubFolderMissing',
                    expected: basePath,
                    at: new Date().toISOString(),
                    message: 'Server has no localSubFolder configured. Set it to your savegame folder (e.g. savegame1).',
                };
                console.warn(`[livestock] folder mismatch serverId=${srv.id} expected: a folder under ${basePath}`);
                return;
            }
            const slotPath = path.join(basePath, folderName);
            if (!fs.existsSync(slotPath)) {
                serverStates[srv.id].configWarning = {
                    code: 'localSubFolderMissing',
                    expected: slotPath,
                    at: new Date().toISOString(),
                    message: `Configured local folder does not exist: ${slotPath}. Open the game once with the FarmDashboard mod to create it, or update the server's "Local folder" in settings.`,
                };
                console.warn(`[livestock] folder mismatch serverId=${srv.id} expected=${slotPath}`);
            }
        } catch (e) {
            console.warn('[livestock] configWarning probe failed', srv && srv.id, e && e.message);
        }
    });

    // Restore last merged JSON from disk **before** HTTP accepts traffic so the first `/api/data` after
    // reopen is not `{ error: 'Waiting for data...' }` (which cleared the renderer). Large saves may
    // add a short delay before the port opens; that is preferable to an empty dashboard flash.
    servers.forEach((srv) => {
        try {
            hydrateServerCacheFromDisk(srv.id);
        } catch (e) {
            console.error('[bootServer] hydrate', srv.id, e);
        }
    });
    // Prefer the latest on-disk Lua export per configured server/save over older persisted merged cache.
    servers.forEach((srv) => {
        try {
            hydrateLuaSnapshotFromDiskAtBoot(srv);
        } catch (e) {
            console.error('[bootServer] hydrate lua snapshot', srv.id, e);
        }
    });

    const runDeferredBootWork = () => {
        try {
            servers.forEach((srv) => {
                if (srv.mode === 'local') startLocalWatching(srv);
            });
            startFtpPollingCoordinator(config, ftpServers);
        } catch (e) {
            console.error('[bootServer] deferred work failed:', e);
        }
    };

    const loadDashboardThenDeferHeavyWork = () => {
        // Reloading http://127.0.0.1:8766 on every save-settings tears down the renderer (Settings modal open)
        // and often shows a blank/blue window until load completes — skip when already on this URL.
        if (shouldLoadDashboardUrl() && mainWindow) {
            mainWindow.loadURL(`http://127.0.0.1:${PORT}`);
        }
        setImmediate(runDeferredBootWork);
    };

    if (!server || !server.listening) {
        listenFarmdashHttp(getLanBindAddress(), loadDashboardThenDeferHeavyWork);
    } else {
        loadDashboardThenDeferHeavyWork();
    }
}

/** Same persistence + boot as ipcMain save-settings — used by POST /api/setup-config (tablet / browser on LAN). */
async function applyFarmdashSetupConfig(newConfig) {
    const prev = store.get('config') || {};
    const mergedServers = mergeServersPreserveSecrets(prev.servers, newConfig.servers);
    const merged = {
        ...prev,
        ...newConfig,
        servers: mergedServers,
    };
    if (newConfig.ftpPolling) {
        merged.ftpPolling = { ...(prev.ftpPolling || {}), ...newConfig.ftpPolling };
    }
    store.set('config', merged);
    await bootServer(merged);
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
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
            webSecurity: true,
        },
    });

    mainWindow.webContents.on('render-process-gone', (_event, details) => {
        console.error('[render-process-gone]', details.reason, details.exitCode);
    });
    mainWindow.webContents.on('unresponsive', () => {
        console.warn('[webContents unresponsive]');
    });

    const config = store.get('config');
    if (config?.isConfigured) {
        void bootServer(config).catch((e) => console.error('[bootServer]', e));
    } else {
        // Show setup immediately (do not wait for HTTP — blank window felt like a hang on cold start).
        const opts = getSetupLoadOptions();
        mainWindow.loadFile(path.join(__dirname, 'setup.html'), opts);
        // Still bring up HTTP + WS for LAN setup and dashboard after save.
        if (!server || !server.listening) {
            listenFarmdashHttp(getLanBindAddress(), () => {
                console.log(`[HTTP/WS] ready (waiting for setup)`);
                if (mainWindow && !mainWindow.isDestroyed()) {
                    const token = String(store.get('farmdashSetupWriteToken') || '');
                    mainWindow.webContents
                        .executeJavaScript(
                            `if(typeof window!=='undefined'){window.__FARMDASH_SETUP_TOKEN=${JSON.stringify(token)};}0`,
                            true
                        )
                        .catch(() => {});
                }
            });
        } else if (mainWindow && !mainWindow.isDestroyed()) {
            const token = String(store.get('farmdashSetupWriteToken') || '');
            mainWindow.webContents
                .executeJavaScript(
                    `if(typeof window!=='undefined'){window.__FARMDASH_SETUP_TOKEN=${JSON.stringify(token)};}0`,
                    true
                )
                .catch(() => {});
        }
    }
}

process.on('uncaughtException', (err) => {
    console.error('[uncaughtException]', err && err.stack ? err.stack : err);
});
process.on('unhandledRejection', (reason) => {
    console.error('[unhandledRejection]', reason);
});

app.whenReady().then(async () => {
    await consumeInstallLocaleFile();
    createWindow();
    initAppUpdater(
        () => mainWindow,
        () => {
            const l = store.get('locale');
            return l && typeof l === 'string' ? l : 'en';
        }
    );
    
});
app.on('window-all-closed', () => {
    stopAllWatchers()
        .then(() => {
            if (process.platform !== 'darwin') {
                return new Promise((resolve) => closeHttpServer(() => resolve()));
            }
        })
        .then(() => {
            if (process.platform !== 'darwin') app.quit();
        })
        .catch((e) => {
            console.error('[shutdown]', e);
            if (process.platform !== 'darwin') app.quit();
        });
});

// ── IPC ───────────────────────────────────────────────────────────────────────

ipcMain.handle('save-settings', async (_event, newConfig) => {
    try {
        await applyFarmdashSetupConfig(newConfig);
        return { ok: true };
    } catch (e) {
        console.error('[save-settings]', e);
        return { ok: false, error: String(e && e.message ? e.message : e) };
    }
});

ipcMain.handle('get-current-config', () => store.get('config'));

/** Fallback when HTTP `/api/status` is unreachable — read default local `data.json` (same path logic as former `fs` in renderer). */
ipcMain.handle('read-local-farmdash-data-json', () => {
    try {
        const bases = collectFarmDashboardModSettingsRoots(getElectronDocumentsPath);
        for (const base of bases) {
            if (!fs.existsSync(base)) continue;
            let folders;
            try {
                folders = fs.readdirSync(base, { withFileTypes: true });
            } catch {
                continue;
            }
            for (const dirent of folders) {
                if (!dirent.isDirectory()) continue;
                const p = path.join(base, dirent.name, 'data.json');
                if (!fs.existsSync(p)) continue;
                const raw = readFileUtf8WithRetry(p);
                if (raw == null) continue;
                const data = JSON.parse(stripUtf8Bom(raw));
                return { ok: true, path: p, data };
            }
        }
        const fallback = path.join(
            getFs25DocumentsRoot(),
            'modSettings',
            'FS25_FarmDashboard',
            'savegame1',
            'data.json'
        );
        return { ok: false, path: fallback, error: 'not_found' };
    } catch (e) {
        return { ok: false, error: String(e && e.message ? e.message : e) };
    }
});

/** Renderer fallback: load per-server merged snapshot persisted in userData/serverLiveCache. */
ipcMain.handle('read-server-live-cache', (_event, serverId) => {
    try {
        if (serverId == null || serverId === '') {
            return { ok: false, error: 'server_id_required' };
        }
        const sid = String(serverId);
        const record = loadServerCache(app.getPath('userData'), sid);
        if (!record || !record.mergedSnapshot || typeof record.mergedSnapshot !== 'object') {
            return { ok: false, error: 'not_found', serverId: sid };
        }
        return {
            ok: true,
            serverId: sid,
            savedAt: record.savedAt || null,
            lastLuaAt: record.lastLuaAt || null,
            lastXmlAt: record.lastXmlAt || null,
            data: record.mergedSnapshot,
        };
    } catch (e) {
        return { ok: false, error: String(e && e.message ? e.message : e) };
    }
});

ipcMain.handle('get-lan-access-settings', () => getLanSecurityFromStore());

ipcMain.handle('save-lan-access-settings', (_e, payload) => {
    // v3.9 hardening: when LAN access is being enabled, refuse weak/default
    // credentials before persisting them. This prevents an inadvertent
    // "admin/farmhub" listener on `0.0.0.0:8766` and gives the renderer a
    // localised error key so the LAN panel can surface field-level feedback.
    const validation = validateLanCredentials(payload);
    if (!validation.ok) {
        return Promise.resolve({
            ok: false,
            error: validation.error,
            field: validation.field,
        });
    }
    store.set('lanAccessEnabled', !!payload?.lanAccessEnabled);
    store.set('lanUsername', String(payload?.lanUsername ?? LAN_ACCESS_DEFAULTS.lanUsername));
    store.set('lanPassword', String(payload?.lanPassword ?? LAN_ACCESS_DEFAULTS.lanPassword));
    store.set('lanAllowedIPs', String(payload?.lanAllowedIPs ?? '').trim());
    store.set('lanAuthOptional', !!payload?.lanAuthOptional);
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
    excludedFarmlandIdsByServer: {},
    fieldClusterPrefsByServer: {},
    simHubView: {
        enabled: false,
        view: 'fields',
        fieldClusterIds: [],
        pastureIds: [],
        productionKeys: [],
    },
};

function normalizeFieldClusterPrefs(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    for (const [sid, v] of Object.entries(raw)) {
        if (!v || typeof v !== 'object') continue;
        const autoMerge = v.autoMerge !== false;
        const mg = Array.isArray(v.manualGroups) ? v.manualGroups : [];
        const clean = mg
            .map((g) =>
                [...new Set((g || []).map((x) => parseInt(String(x).trim(), 10)).filter((n) => !Number.isNaN(n) && n > 0))]
            )
            .filter((g) => g.length >= 2);
        out[String(sid)] = { autoMerge, manualGroups: clean };
    }
    return out;
}

function normalizeSimHubView(raw) {
    const d = { ...DEFAULT_UI_PREFS.simHubView };
    if (!raw || typeof raw !== 'object') return d;
    const v = String(raw.view || '').toLowerCase();
    const view = v === 'pastures' || v === 'production' ? v : 'fields';
    const fc = Array.isArray(raw.fieldClusterIds)
        ? raw.fieldClusterIds.map((x) => String(x).trim()).filter(Boolean)
        : [];
    const pa = Array.isArray(raw.pastureIds)
        ? raw.pastureIds.map((x) => parseInt(String(x).trim(), 10)).filter((n) => !Number.isNaN(n) && n >= 0)
        : [];
    const pk = Array.isArray(raw.productionKeys)
        ? raw.productionKeys.map((x) => String(x).trim()).filter(Boolean)
        : [];
    return {
        ...d,
        enabled: !!raw.enabled,
        view,
        fieldClusterIds: fc,
        pastureIds: pa,
        productionKeys: pk,
    };
}

ipcMain.handle('get-ui-preferences', () => {
    const u = store.get('uiPreferences') || {};
    return {
        sections: { ...DEFAULT_UI_PREFS.sections, ...(u.sections || {}) },
        excludedFarmlandIdsByServer: normalizeExcludedFarmlandIdsMap(u.excludedFarmlandIdsByServer),
        fieldClusterPrefsByServer: normalizeFieldClusterPrefs(u.fieldClusterPrefsByServer),
        simHubView: normalizeSimHubView(u.simHubView),
    };
});


ipcMain.handle('save-ui-preferences', (_e, prefs) => {
    const prev = store.get('uiPreferences') || {};
    const prevEx = normalizeExcludedFarmlandIdsMap(prev.excludedFarmlandIdsByServer);
    const formEx = normalizeExcludedFarmlandIdsMap(prefs?.excludedFarmlandIdsByServer);
    const mergedEx = { ...prevEx, ...formEx };
    const prevCl = normalizeFieldClusterPrefs(prev.fieldClusterPrefsByServer);
    const formCl = normalizeFieldClusterPrefs(prefs?.fieldClusterPrefsByServer);
    const mergedCl = { ...prevCl, ...formCl };
    const prevSh = normalizeSimHubView(prev.simHubView);
    const formSh = normalizeSimHubView(prefs?.simHubView);
    const mergedSh = prefs?.simHubView !== undefined ? formSh : prevSh;
    const merged = {
        sections: { ...DEFAULT_UI_PREFS.sections, ...(prefs?.sections || {}) },
        excludedFarmlandIdsByServer: mergedEx,
        fieldClusterPrefsByServer: mergedCl,
        simHubView: mergedSh,
    };
    store.set('uiPreferences', merged);
    return { ok: true };
});

ipcMain.handle('set-simhub-live-context', (_e, payload) => {
    try {
        const context = applySimHubLiveContextPatch(payload || {});
        return { ok: true, context };
    } catch (e) {
        console.error('[set-simhub-live-context]', e);
        return { ok: false, error: String(e.message || e) };
    }
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
    return path.join(getFs25DocumentsRoot(), 'modSettings', 'FS25_FarmDashboard');
}

function getModConfigPath() {
    return path.join(getModConfigDir(), 'config.xml');
}

function parseModConfigXml(text) {
    const base = {
        updateInterval: 10000,
        collectionCycleMs: 60000,
        minWriteIntervalMs: 4000,
        baleScanIntervalCycles: 1,
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
    const mwi = text.match(/minWriteIntervalMs\s*=\s*"(\d+)"/i);
    if (mwi) base.minWriteIntervalMs = Math.max(2000, Math.min(60000, parseInt(mwi[1], 10) || base.minWriteIntervalMs));
    const bsc = text.match(/baleScanIntervalCycles\s*=\s*"(\d+)"/i);
    if (bsc) base.baleScanIntervalCycles = Math.max(1, Math.min(20, parseInt(bsc[1], 10) || base.baleScanIntervalCycles));
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
    const minW = Math.max(2000, Math.min(60000, Number(cfg.minWriteIntervalMs) || 4000));
    const baleN = Math.max(1, Math.min(20, Number(cfg.baleScanIntervalCycles) || 1));
    const M = cfg.modules || {};
    const b = (k) => (M[k] === false ? 'false' : 'true');
    return `<?xml version="1.0" encoding="utf-8"?>
<farmDashboard>
    <settings updateInterval="${u}" collectionCycleMs="${c}" minWriteIntervalMs="${minW}" baleScanIntervalCycles="${baleN}"/>
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
        const text = readFileUtf8WithRetry(p);
        if (text == null) {
            return { path: p, exists: false, error: 'unreadable', ...parseModConfigXml('') };
        }
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
    /**
     * FS25 + mod write under .../modSettings/FS25_FarmDashboard/<slot>/data.json
     * Try every plausible Documents root (Electron, homedir, USERPROFILE, OneDrive).
     */
    const roots = collectFarmDashboardModSettingsRoots(getElectronDocumentsPath);
    const foundSaves = [];
    const seenJson = new Set();
    const searchedRoots = [];
    const missingRoots = [];

    for (const basePath of roots) {
        searchedRoots.push(basePath);
        if (!fs.existsSync(basePath)) {
            missingRoots.push(basePath);
            console.log('[scan-local-saves] (skip missing)', basePath);
            continue;
        }
        let folders;
        try {
            folders = fs.readdirSync(basePath, { withFileTypes: true });
        } catch (e) {
            console.warn('[scan-local-saves] readdir', basePath, e.message);
            continue;
        }
        for (const dirent of folders) {
            if (!dirent.isDirectory()) continue;
            const jsonPath = path.join(basePath, dirent.name, 'data.json');
            const dedupeKey = path.normalize(jsonPath).toLowerCase();
            if (seenJson.has(dedupeKey)) continue;
            if (!fs.existsSync(jsonPath)) continue;
            seenJson.add(dedupeKey);
            try {
                const raw = readFileUtf8WithRetry(jsonPath);
                if (raw == null) continue;
                const parsed = JSON.parse(stripUtf8Bom(raw));
                const mapName = parsed.serverInfo?.mapName || 'Unknown Map';
                foundSaves.push({
                    id: 'srv_' + Date.now() + Math.floor(Math.random() * 1000),
                    name: `${mapName} (${dirent.name})`,
                    mode: 'local',
                    localPath: basePath,
                    localSubFolder: dirent.name,
                });
            } catch (e) {
                console.warn(`[scan-local-saves] parse ${jsonPath}:`, e.message);
            }
        }
    }
    console.log('[scan-local-saves] found', foundSaves.length, 'save profile(s) under FS25_FarmDashboard');
    return { saves: foundSaves, searchedRoots, missingRoots };
});