// FS25 FarmDashboard | main.js | v2.0.0
// Authors: JoshWalki, WizardlyPayload
// Electron main: Express + WS (default 8766; dev 8767 via FARMDASH_DEV), local fs.watch + FTP → mergeData → renderer.

const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const url  = require('url');
const crypto = require('crypto');
const { spawn, exec, execFile } = require('child_process');

const express   = require('express');
const http      = require('http');
const WebSocket = require('ws');
const cors      = require('cors');
const ftp       = require('basic-ftp');
const Store     = require('electron-store');

/** Second instance on another port (npm run start:dev) while installed demo keeps 8766. */
const FARMDASH_DEV =
    process.env.FARMDASH_DEV === '1' ||
    process.env.FARMDASH_DEV === 'true' ||
    process.env.FARMDASH_DEV === 'yes';

const editionPolicy = require('./editionPolicy.cjs');
const uiServePolicy = require('./uiServePolicy.cjs');
const PRODUCT_LINE = editionPolicy.resolveProductLine();
const SESSION_USER_DATA_DIR = editionPolicy.applySessionPaths(app, { productLine: PRODUCT_LINE, isDev: FARMDASH_DEV }) || app.getPath("userData");

function resolveFarmdashPort() {
    return editionPolicy.resolvePort({ isDev: FARMDASH_DEV, productLine: PRODUCT_LINE });
}

const FARMDASH_PORT = resolveFarmdashPort();
const {
    getMapOverviewCacheDir,
    resolveMapOverviewImage,
    resolveMagickExe,
} = require('./mapOverviewResolver');
const { resolveMapFieldOutlines, attachOutlinesToFieldList } = require('./mapFieldOutlines.cjs');
const { getVanillaFillTypeCatalog, resolveMapFillTypeCatalog } = require('./mapFillTypes.cjs');
const {
    ensureFillTypeHudPng,
    prefetchFillTypeHudCache,
    getFillTypeHudCacheDir,
    fileLooksLikePng,
} = require('./fillTypeHud.cjs');

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
    getSavegameXmlFingerprint,
    isExplicitReplicaXmlSource,
    SAVEGAME_XML_FILES,
    FTP_SAVEGAME_XML_DOWNLOAD_ORDER,
} = require('./xmlCollector');
const {
    hasHttpFeed,
    downloadHttpFeedSavegameXml,
} = require('./httpFeedXml');
const { mergeData, buildFieldLiveFingerprints, supplementRedTapeCropRotation, applyResolvedMapBounds } = require('./dataMerger');
const exportIngress = require('./exportIngress');
const ingressOrchestration = require('./ingressOrchestration');
const { createBoundSourcePublication, ownsOrigin, statusForPayload } = require('./boundSourcePublication.cjs');
const localIngressController = require('./localIngressController');
const replicaRegistration = require('./replicaRegistration');
const pendingReplicaSession = require('./pendingReplicaSession.cjs');
const { ensureIdentityProposal, publishIdentityProposalFtp } = require('./identityProvision');
const { isCorsOriginAllowed: corsOriginAllowedPure, isLocalServerHost: isLocalServerHostPure } = require('./corsPolicy');
const lanHttpPath = require('./lanHttpPath.cjs');
const publicDemoHost = require('./publicDemoHostPolicy.cjs');
const safeFsIdentity = require('./safeFsIdentity.cjs');
const fileCommit = require('./fileCommit.cjs');
const { ftpAccessOptions } = require('./ftpAccess.cjs');
const setupAccessPolicy = require('./setupAccessPolicy.cjs');
const {
    resolveServersForSave,
    configNeedsServerReboot,
} = require('./setupConfigMerge.cjs');
const runtimeActivation = require('./runtimeActivation');
const { hydrateLuaDataAnimalsFromDetails, hydrateLuaDataAnimalsFromDetailsAsync } = require('./detailAnimalsHydrate');
const { loadServerCache, saveServerCache, appendFieldHistory } = require('./serverDataCache');
const { initAppUpdater, checkForUpdatesNow } = require('./app-updater');
const {
    collectFs25DocumentRoots,
    collectFs25ModsDirectories,
    collectFarmDashboardModSettingsRoots,
    selectPreferredFs25UserDataRoot,
    selectPreferredFs25ModsDirectory,
} = require('./fs25Paths');
const { readFileUtf8WithRetryAsync, delay: delayMs } = require('./fileReadRetry');
const {
    shouldIgnoreMinimalLuaExport,
    applyMergedSnapshotIfStaleExport,
    applyLiveSectionHold,
    updateLiveSectionBackup,
    updateLastGoodMergedSnapshot,
    buildHeldPayloadFromState,
    liftSectionOutcomes,
    createMergeRebuildGate,
} = require('./mergedSnapshotHold');
const mergeRebuildGate = createMergeRebuildGate();
const { isLuaExportStale, resolveLuaExportStaleMs } = require('./liveExportFreshness');
const livestockDetailModule = require('./livestockDetail.js');
const { validateLanCredentials } = require('./lanCredentialPolicy.js');
const {
    buildSetupStatus,
    createUxEventLog,
    applyFreshnessMeta,
    ERROR_CODES,
    selectStatusSource,
    sourceSetupEvidence,
    publicStatusForSource,
} = require('./uxContract.cjs');

const store = new Store({ cwd: SESSION_USER_DATA_DIR, defaults: { ...LAN_ACCESS_DEFAULTS } });

/** In-memory LAN prefs snapshot — refreshed at startup and whenever LAN settings are saved (avoid hot-path store.get churn). */
let lanSecurityCache = {
    lanAccessEnabled: LAN_ACCESS_DEFAULTS.lanAccessEnabled,
    lanUsername: LAN_ACCESS_DEFAULTS.lanUsername,
    lanPassword: LAN_ACCESS_DEFAULTS.lanPassword,
    lanAllowedIPs: LAN_ACCESS_DEFAULTS.lanAllowedIPs,
    lanAuthOptional: LAN_ACCESS_DEFAULTS.lanAuthOptional,
};

function refreshLanSecurityCache() {
    lanSecurityCache.lanAccessEnabled = store.get('lanAccessEnabled', LAN_ACCESS_DEFAULTS.lanAccessEnabled);
    lanSecurityCache.lanUsername = store.get('lanUsername', LAN_ACCESS_DEFAULTS.lanUsername);
    lanSecurityCache.lanPassword = store.get('lanPassword', LAN_ACCESS_DEFAULTS.lanPassword);
    lanSecurityCache.lanAllowedIPs = store.get('lanAllowedIPs', LAN_ACCESS_DEFAULTS.lanAllowedIPs);
    lanSecurityCache.lanAuthOptional = !!store.get('lanAuthOptional', LAN_ACCESS_DEFAULTS.lanAuthOptional);
}

refreshLanSecurityCache();

/** @returns {Promise<boolean>} true if path exists and is accessible */
async function pathExists(filePath) {
    try {
        await fs.promises.access(filePath, fs.constants.F_OK);
        return true;
    } catch (e) {
        if (e && e.code === 'ENOENT') return false;
        throw e;
    }
}

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

function closeAllWebSocketClients(reason) {
    const why = String(reason || 'policy_changed');
    for (const ws of Array.from(clients || [])) {
        try {
            if (ws && ws.readyState === WebSocket.OPEN) ws.close(4001, why);
        } catch (_) {
            /* ignore */
        }
    }
    if (clients && typeof clients.clear === 'function') clients.clear();
}

function rotateLanWsSecret(reason) {
    const s = crypto.randomBytes(24).toString('hex');
    store.set('lanWsSecret', s);
    closeAllWebSocketClients(reason || 'lan_credentials_rotated');
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
    const p = path.join(SESSION_USER_DATA_DIR, 'install-locale.txt');
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
        return;
    }
    // V5 never opens classic setup.html from disk (Vite assets need HTTP).
    if (isRfProductLine() || shouldServeNewUi()) return;
    mainWindow.loadFile(path.join(__dirname, 'setup.html'), opts);
}

/** PowerShell 5.1 `Set-Content -Encoding utf8` writes UTF-8 BOM; JSON.parse rejects it. */
function stripUtf8Bom(s) {
    if (typeof s !== 'string' || s.length === 0) return s;
    return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}
let mainWindow;
const ftpPollInFlight = new Map();
const ftpActiveClients = new Map();

function registerTrustedHandle(channel, handler) {
    ipcMain.handle(channel, (event, ...args) => {
        if (!isTrustedDashboardIpcSender(event)) {
            throw Object.assign(new Error('untrusted_sender'), { code: 'UNTRUSTED_IPC_SENDER' });
        }
        return handler(event, ...args);
    });
}

function registerTrustedEvent(channel, handler) {
    ipcMain.on(channel, (event, ...args) => {
        if (!isTrustedDashboardIpcSender(event)) {
            console.warn('[IPC] Rejected untrusted sender for ' + channel);
            return;
        }
        return handler(event, ...args);
    });
}
let serverStates = {};   // id → { luaData, xmlData, mergedData, watcher, intervals[] }
const boundSources = createBoundSourcePublication({
    // The private restart comparison may inspect credentials, but no signature leaves this process.
    sameBinding: (before, after) => !configNeedsServerReboot({ servers: [before] }, { servers: [after] }),
});
const uxEventLog = createUxEventLog();
let uxRequiresRestart = false;

function pushUxEvent(code, message, source) {
    const row = uxEventLog.push({
        code: code || ERROR_CODES.E_NETWORK,
        message: String(message || ''),
        source: source || 'setup',
    });
    console.log(`[UX] ${row.source} ${row.code}: ${row.message}`);
    return row;
}
/** Timeouts/intervals for coordinated multi-FTP polling (cleared in stopAllWatchers). */
let ftpPollingTimers = [];
/** Debounce writing serverLiveCache JSON to disk after merge. */
const serverCacheSaveTimers = {};
const ftpPollGenerations = Object.create(null);


/** PowerShell script: packaged resources/tools, then FarmHub/tools (dev). */
function modExportScriptCandidates() {
    const list = [];
    if (process.resourcesPath) {
        list.push(path.join(process.resourcesPath, 'tools', 'Export-ModStoreImages.ps1'));
    }
    // Dev: FS25_FarmDashboard_App/../tools  →  FarmHub/tools
    list.push(path.join(__dirname, '..', 'tools', 'Export-ModStoreImages.ps1'));
    list.push(path.join(__dirname, 'tools', 'Export-ModStoreImages.ps1'));
    return list;
}

async function resolveModExportScriptPath() {
    const seen = new Set();
    let last = '';
    for (const p of modExportScriptCandidates()) {
        if (!p || seen.has(p)) continue;
        seen.add(p);
        last = p;
        try {
            await fs.promises.access(p, fs.constants.F_OK);
            return p;
        } catch {
            /* try next */
        }
    }
    return last || path.join(__dirname, '..', 'tools', 'Export-ModStoreImages.ps1');
}

/**
 * Where Export-ModStoreImages.ps1 writes PNGs.
 * Packaged Electron: __dirname is …/resources/app.asar (a file) — cannot mkdir under it.
 * Use userData (writable). Dev: keep images inside web/assests for the repo.
 */
function resolveModStoreImagesOutputDir() {
    if (app.isPackaged) {
        return path.join(SESSION_USER_DATA_DIR, 'items_mod_extract');
    }
    return path.join(__dirname, 'web', 'assests', 'img', 'items_mod_extract');
}

/** Optional bundled DirectXTex texconv (place at resources/texconv/texconv.exe). */
async function resolveBundledTexconvPath() {
    const candidates = [
        path.join(__dirname, 'resources', 'texconv', 'texconv.exe'),
        path.join(process.resourcesPath || '', 'texconv', 'texconv.exe'),
    ];
    for (const p of candidates) {
        if (!p) continue;
        try {
            await fs.promises.access(p, fs.constants.F_OK);
            return p;
        } catch {
            /* try next */
        }
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

/** Native MessageBox unless the NEW APP (or other UI) asked to own the completion dialog. */
async function presentModExportDialog(progressSender, suppressNative, { boxType, message, detail, summary, ok }) {
    sendModExportProgress(progressSender, {
        type: 'result',
        ok: !!ok,
        boxType: boxType || 'info',
        message: message || '',
        detail: detail || '',
        summary: summary || null,
    });
    if (suppressNative || !mainWindow) return;
    await dialog.showMessageBox(mainWindow, {
        type: boxType || 'info',
        title: 'Mod shop images',
        message: message || '',
        detail: detail || undefined,
        buttons: ['OK'],
    });
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
async function runExportModStoreImages(progressSender, options) {
    const opts = options && typeof options === 'object' ? options : {};
    const suppressNative = opts.suppressNative === true;
    if (process.platform !== 'win32') {
        const msg = 'Mod image export runs only on Windows (PowerShell + FS mods folder layout).';
        if (mainWindow) {
            await dialog.showMessageBox(mainWindow, { type: 'info', title: 'Mod shop images', message: msg, buttons: ['OK'] });
        }
        return { ok: false, error: msg };
    }

    const scriptPath = await resolveModExportScriptPath();
    try {
        await fs.promises.access(scriptPath, fs.constants.F_OK);
    } catch {
        const err = `Export script not found:\n${scriptPath}`;
        if (mainWindow) {
            await dialog.showMessageBox(mainWindow, { type: 'error', title: 'Mod shop images', message: err, buttons: ['OK'] });
        }
        return { ok: false, error: err };
    }

    const modsRoot = selectPreferredFs25ModsDirectory(getElectronDocumentsPath)
        || path.join(getFs25DocumentsRoot(), 'mods');
    const modsRootsChecked = collectFs25ModsDirectories(getElectronDocumentsPath);
    const outputDir = resolveModStoreImagesOutputDir();
    try {
        await fs.promises.mkdir(outputDir, { recursive: true });
    } catch (e) {
        const err = e && e.message ? e.message : String(e);
        await presentModExportDialog(progressSender, suppressNative, {
            boxType: 'error',
            message: 'Could not create output folder for exported images.',
            detail: `${outputDir}\n\n${err}`,
            ok: false,
        });
        return { ok: false, error: err };
    }
    const summaryJson = path.join(app.getPath('temp'), 'farmdash-mod-export-summary.json');
    try {
        await fs.promises.unlink(summaryJson);
    } catch (e) {
        if (e && e.code !== 'ENOENT') {
            console.warn('[export-mod-store-images] unlink old summary:', e.message);
        }
    }

    const texconv = await resolveBundledTexconvPath();
    const magick = await resolveMagickExe().catch(() => null);
    const args = [
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath,
        '-ModsRoot', modsRoot,
        '-OutputDir', outputDir,
        '-SummaryJsonPath', summaryJson
    ];
    if (texconv) args.push('-TexconvPath', texconv);
    if (magick) args.push('-MagickPath', magick);

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
        await presentModExportDialog(progressSender, suppressNative, {
            boxType: 'error',
            message: timedOut ? 'Mod image export timed out or was stopped.' : 'Could not start PowerShell.',
            detail: err,
            ok: false,
        });
        return { ok: false, error: err };
    }

    console.log('[export-mod-store-images] PowerShell exit code:', exitCode);

    let summary = null;
    try {
        const raw = stripUtf8Bom(await fs.promises.readFile(summaryJson, 'utf8'));
        summary = JSON.parse(raw);
    } catch (e) {
        if (e && e.code === 'ENOENT') {
            /* PowerShell did not write summary */
        } else {
            console.warn('[export-mod-store-images] summary parse:', e && e.message ? e.message : e);
        }
    }

    if (!summary) {
        const detail = [
            stderr || '(no stderr)',
            '',
            `PowerShell exit code: ${exitCode}`,
            `Script: ${scriptPath}`
        ].join('\n');
        await presentModExportDialog(progressSender, suppressNative, {
            boxType: 'error',
            message: 'Export did not produce a summary file.',
            detail,
            ok: false,
        });
        return { ok: false, error: 'No summary JSON', exitCode, stderr };
    }

    if (summary.ok === false) {
        await presentModExportDialog(progressSender, suppressNative, {
            boxType: 'error',
            message: summary.error || 'Export failed',
            detail: `Mods folder:\n${summary.modsRoot || modsRoot}`,
            summary,
            ok: false,
        });
        return summary;
    }

    const n = summary.textureMatches || 0;
    const png = summary.pngCopied || 0;
    const dds = summary.ddsConverted || 0;
    const skippedExisting = summary.outputsSkippedExisting || 0;
    const skipped = summary.ddsSkippedNoConverter || 0;
    const failed = summary.ddsConvertFailed || 0;

    const detailLines = [
        `Mods folder scanned:`,
        summary.modsRoot || modsRoot,
        modsRootsChecked.length > 1
            ? `(Also checked ${modsRootsChecked.length - 1} other candidate folder(s); used the one with mod content.)`
            : null,
        '',
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
        if ((summary.topLevelModFolders ?? 0) === 0 && (summary.zipArchivesScanned ?? 0) === 0) {
            detailLines.push(
                '',
                'The scanned folder appears empty (no mod .zip files or unpacked mod folders).',
                'If you use FSG Mod Assistant, your active collection is usually set via modsDirectoryOverride in gameSettings.xml — Farm Dashboard follows that path when present.',
                'In FSG Mod Assistant, confirm the active collection is enabled and launch the game once so gameSettings.xml is updated.'
            );
        }
    } else if (n === 0 && skippedExisting > 0) {
        msg = `Nothing new to export. ${skippedExisting} texture(s) were already in the output folder (skipped).`;
    } else {
        msg = `Exported ${n} texture(s): ${png} PNG copied, ${dds} DDS converted to PNG.${
            skippedExisting ? ` (${skippedExisting} already up to date.)` : ''
        }`;
    }

    await presentModExportDialog(progressSender, suppressNative, {
        boxType,
        message: msg,
        detail: detailLines.join('\n'),
        summary,
        ok: true,
    });

    return { ...summary, ok: true };
}

registerTrustedHandle('export-mod-store-images', (event, opts) => runExportModStoreImages(event.sender, opts));

// ── Express / WebSocket ───────────────────────────────────────────────────────
const expressApp = express();
expressApp.set('trust proxy', false);
const PORT       = FARMDASH_PORT;
const clients    = new Set();
/** @type {import('http').Server | null} */
let server = null;
/** @type {import('ws').WebSocketServer | null} */
let wss = null;

/** @returns {typeof lanSecurityCache} Read-only contract — do not mutate (shared snapshot). */
function getLanSecurityFromStore() {
    return lanSecurityCache;
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

/**
 * The website demo tunnel connects from loopback with a public demo Host. Such a request is the public,
 * not this PC: it never inherits loopback or same-machine trust.
 */
function isPublicDemoRequest(req) {
    return publicDemoHost.isPublicDemoHost(req && req.headers && req.headers.host);
}

function isRequestFromThisMachine(req) {
    if (isPublicDemoRequest(req)) return false;
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
 * tokens, or server manager JSON. Matching is case-insensitive and ignores trailing slashes (Express default).
 */
function isLanSensitiveHttpPath(reqPath) {
    return lanHttpPath.isLanSensitiveHttpPath(reqPath);
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
    execFile(
        path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'netstat.exe'),
        ['-an'],
        { windowsHide: true, timeout: 8000 },
        (err, stdout) => {
            if (err) return;
            const out = stdout && String(stdout).trim();
            if (!out) return;
            const lines = out.split(/\r?\n/).filter((line) => new RegExp(`:${PORT}\\b`).test(line));
            if (lines.length === 0) return;
            console.log('[LAN] netstat (expect LISTENING on 0.0.0.0:' + PORT + ' when LAN access is on):');
            for (const line of lines) {
                const s = line.trim();
                if (s) console.log('[LAN]   ' + s);
            }
        }
    );
}

/**
 * Config as it may leave the main process (renderer IPC, setup HTTP GET): no FTP password, feed code or replica
 * session pairing; only *Set flags. Saves restore the stored values via mergeServersPreserveSecrets.
 */
function redactConfigSecrets(config) {
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
        if (copy.replicaRegistration && typeof copy.replicaRegistration === 'object' && !Array.isArray(copy.replicaRegistration)) {
            const registration = { ...copy.replicaRegistration };
            const hadPairing = registration.sessionPairing != null && String(registration.sessionPairing).length > 0;
            delete registration.sessionPairing;
            registration.sessionPairingSet = hadPairing;
            copy.replicaRegistration = registration;
        }
        return copy;
    });
    return c;
}

/** Preserve FTP / feed secrets when LAN setup POST omits redacted fields (GET never returns cleartext). */

const MARKETING_SITE_HOSTS = new Set([
    'www.farmdashboard.co.uk',
    'farmdashboard.co.uk',
    'demo.farmdashboard.co.uk',
]);

/**
 * True when `host` is a hostname this dashboard legitimately serves from:
 * loopback, or one of THIS machine's own NIC IPs (so http://<thisPcLanIp>:PORT works).
 * Deliberately NOT "any host on the dashboard port" — that let attacker pages on :PORT
 * read loopback data cross-origin.
 */
function isLocalServerHost(hostname) {
    return isLocalServerHostPure(hostname, getCachedLocalInterfaceIps());
}

/** Strict Host header parse: `name[:port]` or `[ipv6][:port]`. Anything else is malformed (null). */
function parseHostHeader(raw) {
    const s = typeof raw === 'string' ? raw : '';
    if (!s || s.length > 255) return null;
    const m = /^\[([0-9a-f:.]+)\](?::(\d{1,5}))?$/i.exec(s)
        || /^([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::(\d{1,5}))?$/i.exec(s);
    if (!m) return null;
    return { hostname: m[1].toLowerCase(), port: m[2] === undefined ? null : Number(m[2]) };
}

/**
 * Names this listener legitimately answers to: this PC's NIC IPs, its machine name, and the address the
 * socket was accepted on (loopback names are added by isLocalServerHostPure). Never read from Host or
 * X-Forwarded-* / Forwarded — trust proxy stays false.
 */
function listenerHostNames(req) {
    const names = new Set(getCachedLocalInterfaceIps());
    const local = normalizeSocketIp(req && req.socket && req.socket.localAddress);
    if (local && local !== '0.0.0.0' && local !== '::') names.add(local);
    const machine = String(os.hostname() || '').trim().toLowerCase();
    if (machine) {
        names.add(machine);
        names.add(machine + '.local');
    }
    return names;
}

/**
 * DNS-rebinding guard: the Host header must name this listener on the port the socket was accepted on.
 * Runs before the loopback bypass, so a rebound attacker name on 127.0.0.1 is still refused.
 */
function requestHostAllowed(req) {
    const host = parseHostHeader(req && req.headers && req.headers.host);
    const listenPort = Number(req && req.socket && req.socket.localPort);
    if (!host || !Number.isInteger(listenPort) || listenPort <= 0) return false;
    if ((host.port == null ? 80 : host.port) !== listenPort) return false;
    return isLocalServerHostPure(host.hostname, listenerHostNames(req));
}

function isHostGatedPath(normalizedPath) {
    return lanHttpPath.isApiPath(normalizedPath) || normalizedPath === '/setup.html';
}

function hostGateMiddleware(req, res, next) {
    const pathOnly = lanHttpPath.normalizeHttpPath(req.path || (req.url && String(req.url).split('?')[0]) || '');
    if (isPublicDemoRequest(req)) {
        if (publicDemoHost.demoRequestAllowed(req.method, pathOnly)) return next();
        res.setHeader('Cache-Control', 'no-store');
        return res.status(403).json({ ok: false, error: 'Read-only demo', errorCode: publicDemoHost.ERROR_DEMO_READ_ONLY });
    }
    if (!isHostGatedPath(pathOnly) || requestHostAllowed(req)) return next();
    res.setHeader('Cache-Control', 'no-store');
    // Setup keeps its own denial contract (JSON for the API at any path casing, redirect for the page).
    if (pathOnly === '/setup.html') return denySetupAccess(req, res, { status: 403 });
    if (pathOnly === '/api/setup-config') {
        return res.status(403).json({
            ok: false,
            error: setupAccessPolicy.LOCAL_ONLY_MESSAGE,
            errorCode: setupAccessPolicy.ERROR_SETUP_LOCAL_ONLY,
        });
    }
    return res.status(403).json({ ok: false, error: 'Host not allowed', errorCode: 'E_HOST_NOT_ALLOWED' });
}

/** Electron resolves `*.asar` path segments as archives; never let a request path reach that. */
function denyArchivePathMiddleware(req, res, next) {
    const segments = lanHttpPath.normalizeHttpPath(req.path || '').split('/');
    if (!segments.some((seg) => seg.endsWith('.asar') || seg.endsWith('.asar.unpacked'))) return next();
    res.setHeader('Cache-Control', 'no-store');
    return res.status(404).type('text/plain').send('Not Found');
}

const FS_NOT_FOUND_CODES = new Set(['ENOENT', 'ENOTDIR', 'ENAMETOOLONG']);

function httpErrorStatus(err) {
    const s = Number(err && (err.status || err.statusCode));
    if (Number.isInteger(s) && s >= 400 && s < 600) return s;
    if (err && FS_NOT_FOUND_CODES.has(err.code)) return 404;
    return 500;
}

/** Same body shape as the route catches used, minus the raw exception text. */
function apiInternalErrorBody(extra) {
    return { ...(extra || {}), error: 'internal_error', errorCode: 'E_INTERNAL' };
}

/** Last-stage handler: status + stable code only; no exception text, stack, file path or token reaches the client. */
function farmdashHttpErrorHandler(err, req, res, _next) {
    const status = httpErrorStatus(err);
    const pathOnly = String(req.path || '').slice(0, 120);
    const detail = err && err.message ? err.message : String(err);
    console.error('[http] error', status, req.method, pathOnly, err && err.code ? err.code : '', String(detail).slice(0, 200));
    if (res.headersSent) {
        if (req.socket) req.socket.destroy();
        return;
    }
    const errorCode = status === 404 ? 'E_NOT_FOUND' : status >= 500 ? 'E_INTERNAL' : 'E_BAD_REQUEST';
    res.statusCode = status;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (lanHttpPath.isApiPath(pathOnly)) {
        const error = status === 404 ? 'not_found' : status >= 500 ? 'internal_error' : 'bad_request';
        return res.json({ ok: false, error, errorCode });
    }
    return res.type('text/plain').send(http.STATUS_CODES[status] || 'Error');
}

let httpErrorHandlerInstalled = false;

function ensureHttpErrorHandler() {
    if (httpErrorHandlerInstalled) return;
    httpErrorHandlerInstalled = true;
    expressApp.use(farmdashHttpErrorHandler);
}

function corsOriginAllowed(origin, callback) {
    const allowed = corsOriginAllowedPure(origin, {
        port: PORT,
        marketingHosts: MARKETING_SITE_HOSTS,
        localIps: getCachedLocalInterfaceIps(),
    });
    return callback(null, allowed);
}

/**
 * LAN security for non-loopback clients: optional IP allowlist + HTTP Basic (same creds as Settings).
 * Loopback always allowed. Used by Express middleware and WebSocket `verifyClient`.
 */
function checkLanAccessForRequest(req) {
    const rawIp = requestRemoteAddress(req);
    const expressIp = req.ip ? String(req.ip) : '';
    const demo = isPublicDemoRequest(req);
    if (demo) {
        const method = String(req.method || 'GET').toUpperCase();
        const pathOnly = lanHttpPath.normalizeHttpPath(req.path || (req.url && String(req.url).split('?')[0]) || '');
        if (!publicDemoHost.demoRequestAllowed(method, pathOnly)) {
            return { ok: false, code: 403, message: 'Forbidden' };
        }
        // Only the tunnel on this PC serves the public demo; a LAN client naming the demo Host gets no shortcut.
        if (isLoopbackIp(rawIp)) return { ok: true };
    } else if (isLoopbackIp(expressIp) || isLoopbackIp(rawIp)) {
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
    const pathOnly = lanHttpPath.normalizeHttpPath(
        req.path || (req.url && String(req.url).split('?')[0]) || ''
    );
    /**
     * Remote tablets need the HTML/JS/CSS shell and a health check without the browser's HTTP Basic
     * dialog. Farm data stays on /api/* (sensitive list + other /api routes still require auth below).
     * WebSocket upgrades are never allowed here (token or Basic on the upgrade request).
     */
    if (
        (method === 'GET' || method === 'HEAD') &&
        !isWsUpgrade &&
        lanHttpPath.maySkipLanBasicForGet(pathOnly, false)
    ) {
        return { ok: true };
    }
    if (
        cfg.lanAuthOptional &&
        (method === 'GET' || method === 'HEAD') &&
        !isWsUpgrade &&
        lanHttpPath.maySkipLanBasicForGet(pathOnly, true)
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
    if (isPublicDemoRequest(req)) return false;
    return isLoopbackIp(requestRemoteAddress(req));
}

function isSetupLocalClient(req) {
    return isLocalhostSocket(req) || isRequestFromThisMachine(req);
}

function setupTokenMatches(req) {
    const expected = String(store.get('farmdashSetupWriteToken') || '');
    const got = String((req && req.headers && req.headers['x-setup-token']) || '').trim();
    return !!expected && got === expected;
}

/**
 * Local-first setup gate. Same helper for /setup.html, GET/POST /api/setup-config.
 * Loopback and same-machine NIC IPs are allowed. Other LAN clients are 403 unless
 * FARMDASH_ALLOW_REMOTE_SETUP=1. Writes also require X-Setup-Token.
 */
/** Host header must be this machine (loopback or NIC IP). A reverse proxy with a public Host must not inherit setup trust. */
function setupHostAllowed(req) {
    const raw = String((req.headers && req.headers.host) || '').trim();
    if (!raw) return isLocalhostSocket(req);
    const host = raw.split(':')[0].toLowerCase();
    return isLocalServerHost(host);
}

function evaluateSetupAccess(req, requireToken) {
    const remoteAllowed = setupAccessPolicy.isRemoteSetupAllowed();
    const isLocalClient = isSetupLocalClient(req) && (remoteAllowed || setupHostAllowed(req));
    return setupAccessPolicy.canAccessSetupPayload(req, {
        isLocalClient,
        remoteAllowed,
        requireToken: !!requireToken,
        tokenMatches: setupTokenMatches(req),
    });
}

function denySetupAccess(req, res, decision) {
    res.setHeader('Cache-Control', 'no-store');
    if (setupAccessPolicy.wantsJsonSetupDenial(req)) {
        return res.status(decision.status || 403).json({
            ok: false,
            error: decision.error || setupAccessPolicy.LOCAL_ONLY_MESSAGE,
            errorCode: decision.errorCode || setupAccessPolicy.ERROR_SETUP_LOCAL_ONLY,
        });
    }
    return res.redirect(302, setupAccessPolicy.setupDeniedLocation());
}

/** Allow POST /api/export-mod-store-images from LAN (default: localhost only). Power users: set env FARMDASH_ALLOW_LAN_EXPORT=1 */
function allowLanModExportHttp() {
    return process.env.FARMDASH_ALLOW_LAN_EXPORT === '1';
}

/**
 * NEW APP Vite output is copied to App/ui-v2 at build time (tools/app/copy-ui-v2.mjs).
 * Prefer packaged ui-v2 next to main.js; fall back to repo NEW APP/dist for local Vite builds.
 */
function resolveNewUiDistDir() {
    const packaged = path.join(__dirname, 'ui-v2');
    if (fs.existsSync(path.join(packaged, 'index.html'))) return packaged;
    const repoDist = path.join(__dirname, '..', 'NEW APP', 'dist');
    if (fs.existsSync(path.join(repoDist, 'index.html'))) return repoDist;
    return packaged;
}

function readPackagedProductLine() {
    return PRODUCT_LINE;
}

function isRfProductLine() {
    return editionPolicy.isV5ProductLine(readPackagedProductLine());
}

function shouldServeNewUi() {
    let useNewUiPref;
    try {
        const prefs = store.get('uiPreferences') || {};
        if (prefs.useNewUi !== undefined) useNewUiPref = prefs.useNewUi === true;
    } catch (_) { /* store not ready */ }
    return uiServePolicy.shouldServeNewUi({
        productLine: readPackagedProductLine(),
        env: process.env,
        useNewUiPref,
    });
}

function newUiPagePath(fileName) {
    return path.join(resolveNewUiDistDir(), fileName);
}

function newUiPageExists(fileName) {
    return fs.existsSync(newUiPagePath(fileName));
}

function sendMissingNewUiPage(res) {
    res.status(500);
    res.setHeader('Cache-Control', 'no-store');
    res.type('html').send(uiServePolicy.missingNewUiPageHtml());
}

function sendDashboardHtml(res, fileName, classicRel) {
    if (newUiPageExists(fileName)) {
        return res.sendFile(newUiPagePath(fileName));
    }
    if (isRfProductLine()) {
        return sendMissingNewUiPage(res);
    }
    if (classicRel) {
        return res.sendFile(path.join(__dirname, classicRel));
    }
    return res.status(404).end();
}

// Host is checked before CORS and before the LAN loopback bypass; Origin/CORS stay as a separate layer.
expressApp.use(hostGateMiddleware);
expressApp.use(denyArchivePathMiddleware);
expressApp.use(cors({ origin: corsOriginAllowed }));
// Explicit cap (config saves are small JSON). Per-route parsers may set tighter limits (e.g. livestock 8kb).
expressApp.use(express.json({ limit: '256kb' }));
expressApp.use(lanAccessHttpMiddleware);
expressApp.get('/simhub', (_req, res) => {
    res.redirect(302, '/simhub.html');
});
/** Mod shop PNG export target (writable when packaged; mounted before web/ so it wins over asar). */
expressApp.use('/assests/img/items_mod_extract', express.static(resolveModStoreImagesOutputDir()));
/** Cached in-game PDA overview textures (overview.dds → PNG). Lazy-init so Electron is ready. */
let mapOverviewCacheStatic = null;
expressApp.use('/map-overview-cache', (req, res, next) => {
    try {
        if (!mapOverviewCacheStatic) {
            mapOverviewCacheStatic = express.static(getMapOverviewCacheDir());
        }
        return mapOverviewCacheStatic(req, res, next);
    } catch (e) {
        console.warn('[map-overview-cache]', e && e.message ? e.message : e);
        return res.status(503).end();
    }
});
let fillTypeHudCacheStatic = null;
expressApp.use('/fill-type-hud', (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const name = String(req.path || '').replace(/^\/+/, '');
    if (!name || name.includes('/') || name.includes('\\')) return next();
    try {
        const dest = path.join(getFillTypeHudCacheDir(), name);
        if (fileLooksLikePng(dest)) {
            if (!fillTypeHudCacheStatic) {
                fillTypeHudCacheStatic = express.static(getFillTypeHudCacheDir(), {
                    fallthrough: true,
                    maxAge: '1h',
                });
            }
            return fillTypeHudCacheStatic(req, res, next);
        }
    } catch {
        /* convert below */
    }
    return next();
});
expressApp.get('/fill-type-hud/:name', async (req, res) => {
    let raw = String(req.params.name || '');
    try {
        raw = decodeURIComponent(raw);
    } catch {
        /* keep raw */
    }
    raw = raw.replace(/\.png$/i, '').trim();
    if (!raw) return res.status(400).end();
    try {
        const png = await ensureFillTypeHudPng(
            raw,
            hudSourcesForMap(req.query.mapId, req.query.mapTitle)
        );
        if (!png) return res.status(404).end();
        return res.type('png').sendFile(path.resolve(png));
    } catch (e) {
        console.warn('[fill-type-hud]', e && e.message ? e.message : e);
        return res.status(404).end();
    }
});
expressApp.get('/api/map-overview-image', async (req, res) => {
    const mapId = String(req.query.mapId || '').trim();
    const mapTitle = String(req.query.mapTitle || '').trim();
    if (!mapId && !mapTitle) {
        return res.status(400).json({ ok: false, error: 'missing_map_id' });
    }
    try {
        const modsRoots = collectFs25ModsDirectories(getElectronDocumentsPath);
        const modsRoot = modsRoots[0] || path.join(getFs25DocumentsRoot(), 'mods');
        const result = await resolveMapOverviewImage({ mapId, mapTitle, modsRoot, modsRoots });
        if (!result.ok) {
            result.modsFoldersChecked = modsRoots;
        }
        return res.json(isPublicDemoRequest(req) ? publicDemoHost.redactMapResultForDemo(result) : result);
    } catch (e) {
        const msg = e && e.message ? e.message : String(e);
        console.warn('[map-overview]', msg);
        return res.status(500).json(apiInternalErrorBody({ ok: false }));
    }
});
expressApp.get('/api/map-field-outlines', async (req, res) => {
    const mapId = String(req.query.mapId || '').trim();
    const mapTitle = String(req.query.mapTitle || '').trim();
    if (!mapId && !mapTitle) {
        return res.status(400).json({ ok: false, error: 'missing_map_id', fields: [] });
    }
    try {
        const modsRoots = collectFs25ModsDirectories(getElectronDocumentsPath);
        const modsRoot = modsRoots[0] || path.join(getFs25DocumentsRoot(), 'mods');
        const result = await resolveMapFieldOutlines({ mapId, mapTitle, modsRoot, modsRoots });
        return res.json(isPublicDemoRequest(req) ? publicDemoHost.redactMapResultForDemo(result) : result);
    } catch (e) {
        const msg = e && e.message ? e.message : String(e);
        console.warn('[map-field-outlines]', msg);
        return res.status(500).json(apiInternalErrorBody({ ok: false, fields: [] }));
    }
});
const newUiDistDir = resolveNewUiDistDir();
const newUiBuildReady = newUiPageExists('index.html');
const v5LocksNewUi = isRfProductLine();

/**
 * Setup must inject __FARMDASH_SETUP_TOKEN before static middleware.
 * V5 always uses ui-v2/setup.html. V4 uses NEW APP when opted in, otherwise classic setup.html.
 */
expressApp.get('/setup.html', async (req, res) => {
    try {
        const access = evaluateSetupAccess(req, false);
        if (!access.ok) return denySetupAccess(req, res, access);
        ensureSetupWriteToken();
        const token = String(store.get('farmdashSetupWriteToken') || '');
        const newUiSetup = newUiPagePath('setup.html');
        let p;
        if (shouldServeNewUi() && fs.existsSync(newUiSetup)) {
            p = newUiSetup;
        } else if (v5LocksNewUi) {
            return sendMissingNewUiPage(res);
        } else {
            p = path.join(__dirname, 'setup.html');
        }
        let html = await fs.promises.readFile(p, 'utf8');
        const inj = `<script>window.__FARMDASH_SETUP_TOKEN=${JSON.stringify(token)};</script>`;
        const i = html.indexOf('</head>');
        if (i === -1) {
            html = inj + html;
        } else {
            html = html.slice(0, i) + inj + html.slice(i);
        }
        res.setHeader('Cache-Control', 'no-store');
        res.type('html').send(html);
    } catch (e) {
        console.error('[setup.html]', e);
        res.status(500).end();
    }
});

/** Register dashboard HTML before static(web) so classic index.html cannot win on V5. */
expressApp.get(['/', '/index.html'], (_req, res) => {
    sendDashboardHtml(res, 'index.html', v5LocksNewUi ? null : path.join('web', 'index.html'));
});
expressApp.get('/simhub.html', (_req, res) => {
    sendDashboardHtml(res, 'simhub.html', v5LocksNewUi ? null : path.join('web', 'simhub.html'));
});

if (newUiBuildReady) {
    expressApp.use(express.static(newUiDistDir));
    console.log('[UI] Serving NEW APP from', newUiDistDir);
} else if (v5LocksNewUi) {
    console.error('[UI] V5 is missing ui-v2/index.html — classic dashboard will not be served.');
}

const webRoot = path.join(__dirname, 'web');
const webStatic = express.static(webRoot, { index: v5LocksNewUi ? false : 'index.html' });
expressApp.use((req, res, next) => {
    if (v5LocksNewUi && uiServePolicy.isClassicDashboardShellPath(req.path)) {
        return next();
    }
    return webStatic(req, res, next);
});
/** setup.html uses src="web/assests/..." — same paths work over http://host:8766/… and file:// */
expressApp.use('/web', (req, res, next) => {
    if (v5LocksNewUi) {
        const leaf = String(req.path || '').replace(/^\/+/, '').toLowerCase();
        if (leaf === 'index.html' || leaf === 'simhub.html') {
            return res.redirect(302, leaf === 'simhub.html' ? '/simhub.html' : '/');
        }
    }
    next();
}, express.static(webRoot));
/** Same icon as the Windows desktop app (electron-builder `icon.ico`) — splash screen in web/index.html */
expressApp.get('/app-brand-icon.ico', async (req, res) => {
    const icoPath = path.join(__dirname, 'icon.ico');
    try {
        await fs.promises.access(icoPath, fs.constants.F_OK);
        res.type('image/x-icon');
        return res.sendFile(icoPath);
    } catch (_) {
        /* fall through */
    }
    const pngFallback = path.join(__dirname, 'web', 'assests', 'img', 'app-icon.png');
    try {
        await fs.promises.access(pngFallback, fs.constants.F_OK);
        res.type('image/png');
        return res.sendFile(pngFallback);
    } catch (_) {
        res.status(404).end();
    }
});

/** Setup wizard JSON — FTP / feed / replica pairing secrets never included (only *Set flags), same as IPC. Local-first: not for LAN tablets. */
expressApp.get('/api/setup-config', (req, res) => {
    try {
        const access = evaluateSetupAccess(req, false);
        if (!access.ok) return denySetupAccess(req, res, access);
        res.setHeader('Cache-Control', 'no-store');
        res.json(redactConfigSecrets(store.get('config') || {}));
    } catch (e) {
        console.error('[api/setup-config GET]', e);
        res.status(500).json(apiInternalErrorBody());
    }
});

/**
 * Save first-run / Server Manager config from a browser (same effect as ipcRenderer `save-settings`).
 * Requires ``X-Setup-Token`` (see ``ensureSetupWriteToken`` / setup page injection).
 */
expressApp.post('/api/setup-config', async (req, res) => {
    try {
        ensureSetupWriteToken();
        const access = evaluateSetupAccess(req, true);
        if (!access.ok) return denySetupAccess(req, res, access);
        const body = req.body;
        if (!body || typeof body !== 'object') {
            return res.status(400).json({ ok: false, error: 'Expected JSON body' });
        }
        if (!Array.isArray(body.servers)) {
            return res.status(400).json({ ok: false, error: 'servers array required' });
        }
        const saved = await applyFarmdashSetupConfig(body);
        if (saved && saved.ok === false) {
            return res.status(500).json({ ok: false, error: saved.error || "recovery-required", recoveryPending: true });
        }
        res.setHeader('Cache-Control', 'no-store');
        res.json({ ok: true, recoveryPending: !!(saved && saved.recoveryPending), saveState: saved && saved.saveState });
    } catch (e) {
        console.error('[api/setup-config POST]', e);
        res.status(500).json(apiInternalErrorBody({ ok: false }));
    }
});

function looksLikeSaveSlotId(value) {
    return /^savegame\d+$/i.test(String(value || '').trim());
}

/** Read player-facing save + map names from careerSavegame.xml for a Local slot. */
function peekCareerSaveLabels(localSubFolder) {
    const slot = safeFsIdentity.sanitizeSaveSlot(localSubFolder, '');
    if (!slot) return { savegameName: null, mapTitle: null };
    try {
        const careerPath = path.join(getFs25DocumentsRoot(), slot, 'careerSavegame.xml');
        if (!fs.existsSync(careerPath)) return { savegameName: null, mapTitle: null };
        const raw = fs.readFileSync(careerPath, 'utf8');
        const sn = raw.match(/<savegameName>([^<]*)<\/savegameName>/i);
        const mt = raw.match(/<mapTitle>([^<]*)<\/mapTitle>/i);
        return {
            savegameName: sn && sn[1].trim() ? sn[1].trim() : null,
            mapTitle: mt && mt[1].trim() ? mt[1].trim() : null,
        };
    } catch (_) {
        return { savegameName: null, mapTitle: null };
    }
}

function sameResolvedDirectory(left, right) {
    if (!left || !right) return false;
    const a = path.resolve(String(left)).replace(/[\\/]+$/, '').toLowerCase();
    const b = path.resolve(String(right)).replace(/[\\/]+$/, '').toLowerCase();
    return a === b;
}

function usesDefaultCareerProfile(server, state) {
    if (!server || typeof server !== 'object') return false;
    if (server.mode === 'ftp') return false;
    if (isExplicitReplicaXmlSource(server, state?.ingressKind)) return false;
    if (server.mode && server.mode !== 'local') return false;
    const raw = server.localPath || server.path;
    if (typeof raw !== 'string' || !raw.trim()) return true;
    let root = '';
    try { root = getFs25DocumentsRoot(); } catch (_) { return false; }
    if (!root) return false;
    const dashboard = path.join(root, 'modSettings', 'FS25_FarmDashboard');
    const resolved = path.resolve(raw.trim());
    if (sameResolvedDirectory(resolved, dashboard)) return true;
    if (/^savegame\d+$/i.test(path.basename(resolved)) && sameResolvedDirectory(path.dirname(resolved), dashboard)) return true;
    return false;
}

function labelText(value) {
    const text = String(value || '').trim();
    return text || null;
}

function projectConfiguredServerRow(server, state) {
    const sourceId = server && server.id != null ? String(server.id) : '';
    const publication = sourceId ? boundSources.snapshot(sourceId) : null;
    const merged = publication ? publication.payload : (state && state.mergedData) || null;
    const career = publication ? null : (state && state.xmlData && state.xmlData.career) || null;
    let savegameName = labelText(merged && merged.savegameName) || labelText(career && career.savegameName);
    let mapTitle = labelText(merged && merged.mapTitle)
        || labelText(merged && merged.serverInfo && merged.serverInfo.mapName)
        || labelText(career && career.mapTitle);
    const saveMissing = !savegameName || looksLikeSaveSlotId(savegameName);
    const mapMissing = !mapTitle;
    if (!publication && (saveMissing || mapMissing) && usesDefaultCareerProfile(server, state)) {
        const peeked = peekCareerSaveLabels(server && server.localSubFolder);
        if (saveMissing) savegameName = peeked.savegameName || null;
        if (mapMissing) mapTitle = peeked.mapTitle || null;
    } else if (looksLikeSaveSlotId(savegameName)) {
        savegameName = null;
    }
    return {
        id: server && server.id,
        name: server && server.name,
        mode: (server && server.mode) || 'local',
        localSubFolder: (server && server.localSubFolder) || null,
        savegameName: savegameName || null,
        mapTitle: mapTitle || null,
        configWarning: publication ? publication.configWarning : (state && state.configWarning) || null,
        sourceBinding: publication ? publication.sourceBinding : null,
    };
}

function configuredServerList() {
    const config = store.get('config');
    if (!config || !Array.isArray(config.servers)) return [];
    return config.servers.map((server) => {
        const id = server && server.id != null ? String(server.id) : '';
        const state = id && serverStates && Object.prototype.hasOwnProperty.call(serverStates, id) ? serverStates[id] : null;
        return projectConfiguredServerRow(server, state);
    });
}

expressApp.get('/api/servers', (_req, res) => {
    res.json(configuredServerList());
});

function explicitRequestServerId(req) {
    const query = req && req.query;
    if (!query || !Object.prototype.hasOwnProperty.call(query, 'serverId')) return { explicit: false, id: '' };
    const raw = query.serverId;
    if (typeof raw !== 'string') return { explicit: true, id: '' };
    return { explicit: true, id: raw.trim() };
}

function requestSourceEligible(id, servers, states) {
    if (!id) return false;
    const state = states && Object.prototype.hasOwnProperty.call(states, id) ? states[id] : null;
    if (!state && !boundSources.snapshot(id)) return false;
    if (state && state.active === false) return false;
    const listed = Array.isArray(servers) && servers.some((server) => server && server.id != null);
    if (!listed) return true;
    let match = null;
    for (const server of servers) {
        if (server && server.id != null && String(server.id) === String(id)) {
            match = server;
            break;
        }
    }
    if (!match || match.enabled === false) return false;
    return true;
}

function getDataForServer(req) {
    const serverId = resolveServerIdForRequest(req);
    if (serverId == null || !Object.prototype.hasOwnProperty.call(serverStates, serverId)) return null;
    return serverStates[serverId]?.mergedData || null;
}

/** Resolve a request to one eligible source. An explicit unknown id does not fall back. */
function resolveServerIdForRequest(req) {
    const servers = typeof getServersFromStore === 'function' ? getServersFromStore() : [];
    const states = serverStates && typeof serverStates === 'object' ? serverStates : {};
    const query = explicitRequestServerId(req);
    if (query.explicit) return requestSourceEligible(query.id, servers, states) ? query.id : null;
    const excluded = new Set();
    if (Array.isArray(servers)) {
        for (const server of servers) {
            if (!server || server.id == null) continue;
            const id = String(server.id);
            if (!requestSourceEligible(id, servers, states)) {
                excluded.add(id);
                continue;
            }
            return id;
        }
    }
    for (const id of Object.keys(states)) {
        if (excluded.has(id) || !requestSourceEligible(id, servers, states)) continue;
        return id;
    }
    return null;
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

const mapFieldOutlineMemo = new Map();
const mapFieldOutlineWarmup = new Set();
const mapFillTypeMemo = new Map();
const mapFillTypeWarmup = new Set();

function outlineMemoKeyFromMerged(merged) {
    if (!merged || typeof merged !== 'object') return '';
    const mapId = String(merged.mapId || (merged.serverInfo && merged.serverInfo.mapId) || '').trim();
    const mapTitle = String(merged.mapTitle || (merged.serverInfo && merged.serverInfo.mapName) || '').trim();
    if (!mapId && !mapTitle) return '';
    return `${mapId}::${mapTitle}`;
}

function warmupMapFieldOutlines(serverId, merged) {
    const key = outlineMemoKeyFromMerged(merged);
    if (!key || mapFieldOutlineMemo.has(key) || mapFieldOutlineWarmup.has(key)) return;
    const originState = serverId ? serverStates[serverId] : null;
    const originGeneration = originState && originState.activationGeneration;
    mapFieldOutlineWarmup.add(key);
    const mapId = String(merged.mapId || (merged.serverInfo && merged.serverInfo.mapId) || '').trim();
    const mapTitle = String(merged.mapTitle || (merged.serverInfo && merged.serverInfo.mapName) || '').trim();
    const modsRoots = collectFs25ModsDirectories(getElectronDocumentsPath);
    const modsRoot = modsRoots[0] || path.join(getFs25DocumentsRoot(), 'mods');
    resolveMapFieldOutlines({ mapId, mapTitle, modsRoot, modsRoots })
        .then((result) => {
            if (!ownsOrigin(serverStates[serverId], originState, originGeneration)
                || !boundSources.owns(serverId, originState, originGeneration)) return;
            if (result && result.ok && Array.isArray(result.fields) && result.fields.length > 0) {
                mapFieldOutlineMemo.set(key, result.fields);
                if (originState.mergedData) broadcast(serverId, originState.mergedData, originState);
            }
        })
        .catch((e) => {
            console.warn('[map-field-outlines] warmup', e && e.message ? e.message : e);
        })
        .finally(() => mapFieldOutlineWarmup.delete(key));
}

function mapFillResultForMerged(merged) {
    const key = outlineMemoKeyFromMerged(merged);
    if (key && mapFillTypeMemo.has(key)) return mapFillTypeMemo.get(key);
    return null;
}

function mapFillCatalogForMerged(merged) {
    const hit = mapFillResultForMerged(merged);
    if (hit && hit.catalog) return hit.catalog;
    if (hit && typeof hit === 'object' && !hit.catalog) {
        // legacy memo stored the catalog object itself
        const keys = Object.keys(hit);
        if (keys.length > 1 && hit['1'] === 'UNKNOWN') return hit;
    }
    return getVanillaFillTypeCatalog();
}

function mapFillTitlesForMerged(merged) {
    const hit = mapFillResultForMerged(merged);
    return (hit && hit.titlesByIndex) || null;
}

function hudSourcesForMap(mapId, mapTitle) {
    const key = `${String(mapId || '').trim()}::${String(mapTitle || '').trim()}`;
    if (key !== '::' && mapFillTypeMemo.has(key)) {
        const hit = mapFillTypeMemo.get(key);
        return (hit && hit.hudByName) || {};
    }
    const merged = getActiveMergedDataForStatus();
    const fromActive = mapFillResultForMerged(merged);
    return (fromActive && fromActive.hudByName) || {};
}

let vanillaFillTypeHudEpoch = 0;
let vanillaFillTypeHudWarmupStarted = false;

function stampFillTypeHudEpochOnServers(epoch) {
    vanillaFillTypeHudEpoch = epoch;
    for (const [sid, st] of Object.entries(serverStates || {})) {
        if (!st || !st.mergedData) continue;
        st.mergedData.fillTypeHudEpoch = epoch;
        try {
            broadcast(sid, st.mergedData, st);
        } catch {
            /* ignore */
        }
    }
}

function startVanillaFillTypeHudWarmup() {
    if (vanillaFillTypeHudWarmupStarted) return;
    vanillaFillTypeHudWarmupStarted = true;
    prefetchFillTypeHudCache({})
        .then((wrote) => {
            const epoch = Date.now();
            console.log('[fill-type-hud] vanilla warmup wrote', wrote);
            stampFillTypeHudEpochOnServers(epoch);
        })
        .catch((e) => {
            console.warn('[fill-type-hud] vanilla warmup', e && e.message ? e.message : e);
            stampFillTypeHudEpochOnServers(Date.now());
        });
}

function warmupFillTypeHudIcons(serverId, result) {
    if (!result || result.hudPrefetchStarted) return;
    const originState = serverId ? serverStates[serverId] : null;
    const originGeneration = originState && originState.activationGeneration;
    result.hudPrefetchStarted = true;
    prefetchFillTypeHudCache(result.hudByName || {})
        .then(() => {
            if (!ownsOrigin(serverStates[serverId], originState, originGeneration)
                || !boundSources.owns(serverId, originState, originGeneration)) return;
            result.hudPrefetched = true;
            result.hudEpoch = Date.now();
            vanillaFillTypeHudEpoch = result.hudEpoch;
            if (serverId) rebuildMerged(serverId);
        })
        .catch((e) => {
            if (!ownsOrigin(serverStates[serverId], originState, originGeneration)
                || !boundSources.owns(serverId, originState, originGeneration)) return;
            console.warn('[fill-type-hud] prefetch', e && e.message ? e.message : e);
            result.hudEpoch = Date.now();
            vanillaFillTypeHudEpoch = result.hudEpoch;
            if (serverId) rebuildMerged(serverId);
        });
}

function warmupMapFillTypes(serverId, merged) {
    const key = outlineMemoKeyFromMerged(merged);
    if (!key) return;
    if (mapFillTypeMemo.has(key)) {
        warmupFillTypeHudIcons(serverId, mapFillTypeMemo.get(key));
        return;
    }
    if (mapFillTypeWarmup.has(key)) return;
    const originState = serverId ? serverStates[serverId] : null;
    const originGeneration = originState && originState.activationGeneration;
    mapFillTypeWarmup.add(key);
    const mapId = String(merged.mapId || (merged.serverInfo && merged.serverInfo.mapId) || '').trim();
    const mapTitle = String(merged.mapTitle || (merged.serverInfo && merged.serverInfo.mapName) || '').trim();
    const modsRoots = collectFs25ModsDirectories(getElectronDocumentsPath);
    const modsRoot = modsRoots[0] || path.join(getFs25DocumentsRoot(), 'mods');
    resolveMapFillTypeCatalog({ mapId, mapTitle, modsRoot, modsRoots })
        .then((result) => {
            if (!ownsOrigin(serverStates[serverId], originState, originGeneration)
                || !boundSources.owns(serverId, originState, originGeneration)) return;
            if (result && result.catalog && Object.keys(result.catalog).length > 1) {
                mapFillTypeMemo.set(key, result);
                warmupFillTypeHudIcons(serverId, result);
                if (serverId) rebuildMerged(serverId);
            }
        })
        .catch((e) => {
            console.warn('[map-fill-types] warmup', e && e.message ? e.message : e);
        })
        .finally(() => mapFillTypeWarmup.delete(key));
}

function cloneMergedDataWithFieldExclusions(mergedData, serverId) {
    if (!mergedData) return null;
    const raw =
        Array.isArray(mergedData.fields) && mergedData.fields.length > 0
            ? mergedData.fields
            : Array.isArray(mergedData.allFields) && mergedData.allFields.length > 0
              ? mergedData.allFields
              : mergedData.fields;
    let fields = filterFieldsByExclusions(Array.isArray(raw) ? raw : [], serverId);
    const key = outlineMemoKeyFromMerged(mergedData);
    const mapFields = key ? mapFieldOutlineMemo.get(key) : null;
    if (mapFields) fields = attachOutlinesToFieldList(fields, mapFields);
    else warmupMapFieldOutlines(serverId, mergedData);
    return applyResolvedMapBounds({ ...mergedData, fields });
}

expressApp.get('/api/data',       (req, res) => {
    try {
        const sid = resolveServerIdForRequest(req);
        const published = sid ? boundSources.snapshot(sid) : null;
        const stamp = new Date().toISOString();
        res.json(published && published.payload
            ? { ...published.payload, sourceBinding: published.sourceBinding, timestamp: stamp }
            : { error: 'Waiting for data...', sourceBinding: published?.sourceBinding || null, timestamp: stamp });
    } catch (e) {
        console.error('[api/data]', e && e.stack ? e.stack : e);
        res.json({ error: 'Waiting for data...', sourceBinding: null, timestamp: new Date().toISOString() });
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
    const headers = req.headers || {};
    const hasOrigin = Object.prototype.hasOwnProperty.call(headers, 'origin');
    const hasReferer = Object.prototype.hasOwnProperty.call(headers, 'referer');
    if (!hasOrigin && !hasReferer) return '';
    const raw = hasOrigin ? headers.origin : headers.referer;
    if (typeof raw !== 'string' || !raw.trim()) return 'null';
    try {
        const parsed = new URL(raw);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return 'null';
        return parsed.origin;
    } catch (_) { return 'null'; }
}
function isAllowedSameOrigin(originStr, req) {
    if (!originStr) return false;
    try {
        const u = new URL(originStr);
        const host = String(u.hostname || '').toLowerCase();
        const port = String(u.port || (u.protocol === 'https:' ? 443 : 80));
        if (port !== String(PORT)) return false;
        // Loopback or this machine's own NIC IPs only — not an arbitrary host on the dashboard port.
        if (isLocalServerHost(host)) return true;
        // LAN tablet hitting <hostIp>:PORT with a matching Host header (still must be one of our IPs).
        const hostHeader = String((req.headers && req.headers.host) || '').split(':')[0].toLowerCase();
        if (hostHeader && host === hostHeader && isLocalServerHost(hostHeader)) return true;
    } catch (_) { /* ignore */ }
    return false;
}
function enforceWriteOriginAndToken(req, res) {
    const origin = getRequestOrigin(req);
    // Browser pages always send Origin/Referer. Reject hostile origins even on loopback.
    // Native/curl with no Origin still allowed from this machine.
    if (origin) {
        if (!isAllowedSameOrigin(origin, req) && !corsOriginAllowedPure(origin, {
            port: PORT,
            marketingHosts: MARKETING_SITE_HOSTS,
            localIps: getCachedLocalInterfaceIps(),
        })) {
            return { code: 403, body: { ok: false, error: 'origin not allowed' } };
        }
    } else if (!isLocalhostSocket(req) && !isRequestFromThisMachine(req)) {
        return { code: 403, body: { ok: false, error: 'origin not allowed' } };
    }
    if (isLocalhostSocket(req)) return null;
    // When LAN access is enabled the API binds beyond localhost — require setup token for writes.
    // With LAN off, only local processes reach the port; same-origin check above still applies for browsers.
    const lanOn = !!getLanSecurityFromStore().lanAccessEnabled;
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
        res.status(500).json(apiInternalErrorBody());
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
        const handled = await handleLivestockPenRequest(req);
        res.status(handled.status).json(handled.body);
    } catch (e) {
        if (e && e.code === 'INVALID_ID') {
            return res.status(400).json({ ok: false, error: 'invalid id' });
        }
        console.error('[api/livestock/:id/request]', e && e.stack ? e.stack : e);
        res.status(500).json(apiInternalErrorBody({ ok: false }));
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
async function handleLivestockPenRequest(req) {
    const idCheck = livestockDetailModule.validatePenId(req && req.params && req.params.id);
    if (idCheck == null) return { status: 400, body: { ok: false, error: 'invalid id' } };
    if (resolveServerIdForRequest(req) == null) return { status: 200, body: { ok: false } };
    const ok = await requestLivestockDetail(req);
    return { status: 200, body: { ok: !!ok } };
}
expressApp.get('/api/vehicles', (req, res) => {
    const raw = getDataForServer(req)?.vehicles;
    if (Array.isArray(raw)) return res.json(raw);
    if (raw && typeof raw === 'object') return res.json(Object.values(raw));
    res.json([]);
});
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
function statusSourceSelection(requestedSourceId = '') {
    const config = store.get('config') || {};
    const ctx = store.get('simHubLiveContext');
    const requested = typeof requestedSourceId === 'string' ? requestedSourceId.trim() : '';
    const selectedId = requested || (ctx && ctx.serverId != null ? String(ctx.serverId).trim() : '');
    return selectStatusSource({
        selectedId,
        servers: Array.isArray(config.servers) ? config.servers : [],
        states: serverStates,
    });
}

function getActiveMergedDataForStatus() {
    const resolved = statusSourceSelection();
    return (resolved.state && resolved.state.mergedData) || null;
}

function buildPublicStatusPayload() {
    const resolved = statusSourceSelection();
    const published = resolved.id ? boundSources.snapshot(resolved.id) : null;
    const publicResolved = published?.sourceBinding?.stateStatus === 'blocked'
        ? { ...resolved, state: null, unavailable: true }
        : resolved;
    // savegameName, paths, and credentials stay off this payload. /api/status is reachable
    // unauthenticated on LAN. Map counts and projected identity come from the same source.
    return publicStatusForSource({
        status: 'online',
        service: editionPolicy.isV5ProductLine(PRODUCT_LINE) ? 'fs25-farm-dashboard-rf' : 'fs25-farm-dashboard',
        productLine: PRODUCT_LINE,
        port: PORT,
        appVersion: app.getVersion(),
    }, publicResolved, (ident, tracker) => ingressOrchestration.projectStatus(ident, tracker));
}

expressApp.get('/api/status', (req, res) => res.json(buildPublicStatusPayload()));

function buildRuntimeSetupStatus(opts) {
    const tokenOk = opts && Object.prototype.hasOwnProperty.call(opts, 'setupTokenValid')
        ? !!opts.setupTokenValid
        : true;
    const config = store.get('config') || {};
    const resolved = statusSourceSelection(opts && opts.sourceId);
    const evidence = sourceSetupEvidence(resolved.state, { staleMs: getLuaExportStaleMs() });
    const status = buildSetupStatus({
        config,
        httpListening: !!(server && server.listening),
        hasMergedData: evidence.hasMergedData,
        luaFresh: evidence.luaFresh,
        xmlAvailable: evidence.xmlAvailable,
        setupTokenValid: tokenOk,
        lan: getLanSecurityFromStore(),
        modVersionCheck: evidence.modVersionCheck,
        pathDenied: evidence.pathDenied,
        requiresRestart: uxRequiresRestart,
        recentEvents: uxEventLog.list(),
        identityProvision: evidence.identityProvision,
        exportGeneration: evidence.exportGeneration,
        startupOnly: evidence.startupOnly,
        emptyCommitted: evidence.emptyCommitted,
        sourceId: resolved.id,
    });
    const servers = Array.isArray(config.servers) ? config.servers : [];
    const enabled = servers.filter((srv) => srv && srv.enabled !== false);
    const selected = enabled.find((srv) => srv.id != null && String(srv.id) === String(resolved.id || ''));
    const localOnly = selected
        ? selected.mode !== 'ftp'
        : enabled.length > 0 && enabled.every((srv) => srv.mode !== 'ftp');
    // A saved local source with no committed export yet is waiting on the game, not failing transport.
    if (status.status === 'incomplete'
        && status.lastErrorCode === ERROR_CODES.E_LUA_STALE
        && !status.nextStep
        && !evidence.hasMergedData
        && localOnly) {
        status.waitingFor = 'first-export';
        status.nextAction = 'start_game';
        status.nextStep = 'Setup is saved. This save has no dashboard export yet. Load it in Farming Simulator 25 with the Farm Dashboard mod enabled; the dashboard fills in after the mod writes its first export.';
    }
    return status;
}

async function runSetupHandshake(tokenValid, sourceId = '') {
    const config = store.get('config') || {};
    const servers = Array.isArray(config.servers) ? config.servers : [];
    for (const srv of servers) {
        if (!srv || srv.mode === 'ftp') continue;
        try {
            const luaPath = getLocalLuaJsonPathForServer(srv);
            if (!luaPath) continue;
            try {
                await fs.promises.access(luaPath);
            } catch (e) {
                const code = e && e.code;
                if (code === 'EACCES' || code === 'EPERM') {
                    pushUxEvent(ERROR_CODES.E_PERMISSION_DENIED, `Cannot read export for ${srv.name || srv.id}`, 'setup');
                } else if (code === 'ENOENT') {
                    pushUxEvent(ERROR_CODES.E_LUA_STALE, `No data.json yet for ${srv.name || srv.id}`, 'mod');
                }
            }
        } catch (_) {
            /* ignore per-server probe */
        }
    }
    const status = buildRuntimeSetupStatus({ setupTokenValid: tokenValid !== false, sourceId });
    if (status.lastErrorCode) pushUxEvent(status.lastErrorCode, `Handshake ${status.status}`, 'setup');
    return status;
}

expressApp.get('/api/setup-status', (req, res) => {
    try {
        const tokenOk = isLocalhostSocket(req) || setupTokenMatches(req);
        const sourceId = req.query && typeof req.query.serverId === 'string' ? req.query.serverId : '';
        res.json(buildRuntimeSetupStatus({ setupTokenValid: tokenOk || !getLanSecurityFromStore().lanAccessEnabled, sourceId }));
    } catch (e) {
        console.error('[api/setup-status]', e);
        res.status(500).json(apiInternalErrorBody());
    }
});

expressApp.post('/api/setup-handshake', async (req, res) => {
    try {
        const tokenOk = isLocalhostSocket(req) || setupTokenMatches(req);
        const sourceId = req.query && typeof req.query.serverId === 'string' ? req.query.serverId : '';
        const status = await runSetupHandshake(tokenOk || !getLanSecurityFromStore().lanAccessEnabled, sourceId);
        res.json(status);
    } catch (e) {
        console.error('[api/setup-handshake]', e);
        res.status(500).json(apiInternalErrorBody());
    }
});

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
        res.status(500).json(apiInternalErrorBody());
    }
});

expressApp.get('/api/simhub-session', (_req, res) => {
    try {
        const ctx = getSimHubLiveContext();
        res.json(ctx);
    } catch (e) {
        console.error('[api/simhub-session]', e);
        res.status(500).json(apiInternalErrorBody({ serverId: '', farmId: 1 }));
    }
});

/** For WebSocket clients that cannot send Basic auth on the upgrade request (browsers). */
expressApp.get('/api/lan-ws-token', (req, res) => {
    res.json({ token: ensureLanWsSecret() });
});


/** Curated PNGs under items/ + exported mod shop PNGs under items_mod_extract/ (for vehicle image matching). */
expressApp.get('/api/item-image-filenames', async (req, res) => {
    const itemsDir = path.join(__dirname, 'web', 'assests', 'img', 'items');
    const modDir = resolveModStoreImagesOutputDir();
    const listPng = async (dir) => {
        try {
            const names = await fs.promises.readdir(dir);
            return names.filter((f) => /\.png$/i.test(f));
        } catch (e) {
            return [];
        }
    };
    try {
        const [items, modExtract] = await Promise.all([listPng(itemsDir), listPng(modDir)]);
        res.json({ items, modExtract });
    } catch (e) {
        console.error('[api/item-image-filenames]', e);
        res.status(500).json(apiInternalErrorBody({ items: [], modExtract: [] }));
    }
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
    const gate = enforceWriteOriginAndToken(req, res);
    if (gate) return res.status(gate.code).json(gate.body);
    try {
        const result = await runExportModStoreImages(null, { suppressNative: true });
        res.json(result);
    } catch (e) {
        console.error('[export-mod-store-images] HTTP:', e);
        res.status(500).json(apiInternalErrorBody({ ok: false }));
    }
});

function webSocketOriginAllowed(req) {
    const origin = getRequestOrigin(req);
    if (!origin) {
        // Non-browser clients (no Origin). Allow only this machine.
        return isLoopbackIp(requestRemoteAddress(req)) || isRequestFromThisMachine(req);
    }
    return corsOriginAllowedPure(origin, {
        port: PORT,
        marketingHosts: MARKETING_SITE_HOSTS,
        localIps: getCachedLocalInterfaceIps(),
    }) || isAllowedSameOrigin(origin, req);
}

function checkWebSocketLanAccess(info) {
    const req = info.req;
    if (isPublicDemoRequest(req)) {
        // The socket only pushes the same data as GET /api/data. Demo pages get it from the tunnel alone,
        // without the LAN WebSocket token, which is never handed to a demo visitor.
        return isLoopbackIp(requestRemoteAddress(req)) && publicDemoHost.isPublicDemoOrigin(getRequestOrigin(req));
    }
    if (!requestHostAllowed(req)) return false;
    if (!webSocketOriginAllowed(req)) return false;
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
let httpPortInUseDialogShown = false;

function showHttpPortInUseDialog() {
    if (httpPortInUseDialogShown) return;
    httpPortInUseDialogShown = true;
    const msg = editionPolicy.portInUseMessage({ productLine: PRODUCT_LINE, port: PORT });
    try {
        if (app && app.isReady && app.isReady()) {
            dialog.showErrorBox('Farm Dashboard — port in use', msg);
        } else if (app && typeof app.once === 'function') {
            app.once('ready', () => dialog.showErrorBox('Farm Dashboard — port in use', msg));
        }
    } catch (_) {
        console.error('[HTTP/WS]', msg);
    }
}

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
                        ensureHttpErrorHandler();
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
                            if (settled) return;
                            settled = true;
                            if (err && err.code === 'EADDRINUSE') {
                                showHttpPortInUseDialog();
                            }
                            reject(err);
                        });
                        server.listen(PORT, bindHost, () => {
                            console.log(`[HTTP/WS] listening on http://${bindHost === '0.0.0.0' ? '0.0.0.0 (all interfaces)' : bindHost}:${PORT}`);
                            logLanStartupHints(bindHost);
                            logWindowsSocketsForFarmdashPort();
                            if (typeof onListening === 'function') onListening();
                            startVanillaFillTypeHudWarmup();
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
    let finished = false;
    const finish = () => {
        if (finished) return;
        finished = true;
        server = null;
        if (typeof done === 'function') done();
    };
    // Renderer Save IPC used to deadlock here: http.close() waits for keep-alive +
    // the dashboard WebSocket the Settings modal still holds.
    clients.forEach((ws) => {
        try {
            ws.terminate();
        } catch (_) { /* ignore */ }
    });
    clients.clear();
    const killTimer = setTimeout(() => {
        try {
            if (httpSrv && typeof httpSrv.closeAllConnections === 'function') {
                httpSrv.closeAllConnections();
            }
        } catch (_) { /* ignore */ }
        finish();
    }, 2000);
    const finishAndClear = () => {
        clearTimeout(killTimer);
        finish();
    };
    if (wsSrv) {
        try {
            wsSrv.close(() => {
                if (httpSrv && httpSrv.listening) {
                    httpSrv.close(finishAndClear);
                } else {
                    finishAndClear();
                }
            });
        } catch (_) {
            if (httpSrv && httpSrv.listening) {
                httpSrv.close(finishAndClear);
            } else {
                finishAndClear();
            }
        }
    } else if (httpSrv && httpSrv.listening) {
        httpSrv.close(finishAndClear);
    } else {
        finishAndClear();
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

const lastBroadcastHashByServer = {};

function broadcastSourceState(event) {
    const message = JSON.stringify(event);
    clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) client.send(message);
    });
}

function broadcast(serverId, data, ownerState) {
    if (data == null || !ownerState
        || !boundSources.owns(serverId, ownerState, ownerState.activationGeneration)) return;
    const payload = cloneMergedDataWithFieldExclusions(data, serverId) || data;
    const published = boundSources.publish(serverId, ownerState, ownerState.activationGeneration,
        payload, statusForPayload(ownerState, payload));
    if (!published || !published.changed) return;
    const body = { type: 'data', serverId,
        data: { ...published.payload, sourceBinding: published.sourceBinding },
        sourceBinding: published.sourceBinding };
    const publicationKey = `${published.sourceBinding.bindingId}:${published.sourceBinding.stateRevision}`;
    if (lastBroadcastHashByServer[serverId] === publicationKey) return;
    lastBroadcastHashByServer[serverId] = publicationKey;
    const msg = JSON.stringify({ ...body, timestamp: new Date().toISOString() });
    const maxBuffered = 2 * 1024 * 1024;
    clients.forEach((c) => {
        if (c.readyState !== WebSocket.OPEN) return;
        if (typeof c.bufferedAmount === 'number' && c.bufferedAmount > maxBuffered) {
            try { c.close(1013, 'slow_consumer'); } catch (_) { /* ignore */ }
            return;
        }
        c.send(msg);
    });
}

// ── Data processing ───────────────────────────────────────────────────────────


/** Persist only a proved local authority identity with a merged snapshot. */
function localCacheSourceProof(serverId, state) {
    const srv = getServersFromStore().find((s) => String(s.id) === String(serverId));
    const identity = state && state.exportIdentity;
    if (!srv || srv.mode === 'ftp' || isExplicitReplicaXmlSource(srv, state?.ingressKind)
        || !identity || identity.replica === true || identity.legacy === true
        || String(identity.sourceId || '') !== String(serverId)
        || !identity.careerId || !identity.sessionId || !identity.configuredSlot) return null;
    return {
        kind: 'authority',
        sourceId: String(serverId),
        careerId: identity.careerId,
        sessionId: identity.sessionId,
        configuredSlot: identity.configuredSlot,
    };
}

/** Never render a local merged cache until its source is proven again. */
function localCacheSourceEligible(srv, state, record) {
    if (!srv || srv.mode === 'ftp' || isExplicitReplicaXmlSource(srv, state?.ingressKind)
        || state?.exportIdentity?.replica === true) return false;
    const proof = record && record.sourceProof;
    if (!proof || proof.kind !== 'authority' || proof.sourceId !== String(srv.id)
        || !proof.careerId || !proof.sessionId || !proof.configuredSlot) return false;

    const matches = (identity) => !!(identity && identity.replica !== true
        && identity.legacy !== true
        && String(identity.sourceId || '') === proof.sourceId
        && identity.careerId === proof.careerId
        && identity.sessionId === proof.sessionId
        && identity.configuredSlot === proof.configuredSlot);
    try {
        const parts = resolveLocalWatchParts(srv);
        const selected = localIngressController.selectIngress(srv, parts, fs.existsSync);
        if (selected.kind !== 'authority' || !selected.dir) return false;
        const ingress = exportIngress.ingestWatchedSlot(selected.dir, {
            sourceId: String(srv.id),
            configuredSlot: selected.configuredSlot,
            trustedLocalClock: true,
            explicitLegacy: srv.legacyJson === true,
        });
        return !!(ingress && ingress.status === 'valid' && ingress.replica !== true
            && matches(ingress.identity));
    } catch (_) {
        return false;
    }
}

function schedulePersistServerCache(serverId) {
    clearTimeout(serverCacheSaveTimers[serverId]);
    serverCacheSaveTimers[serverId] = setTimeout(() => {
        const state = serverStates[serverId];
        if (!state || !state.mergedData) return;
        try {
            const userData = SESSION_USER_DATA_DIR;
            saveServerCache(userData, serverId, {
                mergedSnapshot: state.mergedData,
                sourceProof: localCacheSourceProof(serverId, state),
                lastKnownSaveSlot: state.lastSaveSlot || null,
                fieldLiveByFarmlandId: state.fieldLiveCache || {},
                fieldHistory: state.fieldHistory || {},
                lastLuaAt: state.lastLuaReceivedAt || null,
                lastXmlAt: state.lastXmlReceivedAt || null,
                sectionAge: state.sectionAge || null,
                savedAt: new Date().toISOString(),
            });
        } catch (e) {
            console.warn('[Cache] persist failed', serverId, e.message);
        }
    }, 600);
}

function persistAllServerCaches(reason) {
    const userData = SESSION_USER_DATA_DIR;
    const states = Object.entries(serverStates || {});
    for (const [serverId, state] of states) {
        if (!state || !state.mergedData) continue;
        try {
            saveServerCache(userData, serverId, {
                mergedSnapshot: state.mergedData,
                sourceProof: localCacheSourceProof(serverId, state),
                lastKnownSaveSlot: state.lastSaveSlot || null,
                fieldLiveByFarmlandId: state.fieldLiveCache || {},
                fieldHistory: state.fieldHistory || {},
                lastLuaAt: state.lastLuaReceivedAt || null,
                lastXmlAt: state.lastXmlReceivedAt || null,
                sectionAge: state.sectionAge || null,
                savedAt: new Date().toISOString(),
                savedReason: reason || 'flush',
            });
        } catch (e) {
            console.warn('[Cache] persist flush failed', serverId, e.message);
        }
    }
}

function hydrateServerCacheFromDisk(serverId) {
    const srv = getServersFromStore().find((s) => String(s.id) === String(serverId));
    if (isExplicitReplicaXmlSource(srv, serverStates[serverId]?.ingressKind)) return;
    let disk;
    try {
        disk = loadServerCache(SESSION_USER_DATA_DIR, serverId);
    } catch (_) {
        disk = null;
    }
    if (!disk || !disk.mergedSnapshot || !localCacheSourceEligible(srv, serverStates[serverId], disk)) return;
    const state = serverStates[serverId];
    if (!state) return;
    state.fieldLiveCache = disk.fieldLiveByFarmlandId || {};
    state.fieldHistory = disk.fieldHistory || {};
    state.lastLuaReceivedAt = disk.lastLuaAt || null;
    state.lastXmlReceivedAt = disk.lastXmlAt || null;
    state.sectionAge = disk.sectionAge || 'last-known';
    state.mergedData = applyResolvedMapBounds(
        applyFreshnessMeta(JSON.parse(JSON.stringify(disk.mergedSnapshot)), {
            lastLuaAt: disk.lastLuaAt || null,
            lastXmlAt: disk.lastXmlAt || null,
            cacheUsedDueToFailure: true,
            source: 'cache',
            collectionHealth:
                disk.mergedSnapshot &&
                disk.mergedSnapshot.dataTimestamps &&
                disk.mergedSnapshot.dataTimestamps.collectionHealth,
        })
    );
    state.mergedData.dataTimestamps = {
        ...(state.mergedData.dataTimestamps || {}),
        loadedFromDiskCacheAt: new Date().toISOString(),
    };
    pushUxEvent(ERROR_CODES.E_CACHE_FALLBACK, `Restored last-known snapshot for ${serverId}`, 'merge');
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
    updateLiveSectionBackup(state, state.mergedData, null);
    updateLastGoodMergedSnapshot(state, state.mergedData, null);
    broadcast(serverId, state.mergedData, state);
    console.log(`[Cache] [${serverId}] Restored last merged snapshot from disk (use until live Lua/XML return)`);
}

function getLocalLuaJsonPathForServer(srv) {
    const { basePath, folderName } = resolveLocalWatchParts(srv);
    if (!folderName) return null;
    return path.join(basePath, folderName, 'data.json');
}

/** Resolve Local-mode path: prefer localPath, accept legacy `path`. */
function resolveServerLocalPath(srv) {
    if (!srv || typeof srv !== 'object') return null;
    const raw = srv.localPath || srv.path;
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
    return null;
}

/** True when this server should use the Local file watcher / disk hydrate. */
function isLocalModeServer(srv) {
    if (!srv || typeof srv !== 'object') return false;
    if (srv.mode === 'ftp') return false;
    if (srv.mode === 'local') return true;
    // Mis-saved configs (type/path instead of mode/localPath) still count as local.
    return !!(resolveServerLocalPath(srv) || srv.localSubFolder);
}

/**
 * localPath should be the FS25_FarmDashboard parent; localSubFolder the save slot.
 * If someone saved the slot folder as localPath, peel savegameN into localSubFolder.
 */
function resolveLocalWatchParts(srv) {
    let basePath = resolveServerLocalPath(srv);
    if (!basePath) {
        basePath = path.join(getFs25DocumentsRoot(), 'modSettings', 'FS25_FarmDashboard');
    }
    let folderName =
        (typeof srv.localSubFolder === 'string' && srv.localSubFolder.trim()) ||
        String(srv.name || '')
            .replace(/[<>:"/\\|?*]/g, '')
            .trim();
    const baseNorm = String(basePath).replace(/[\\/]+$/, '');
    const leaf = path.basename(baseNorm);
    if (/^savegame\d+$/i.test(leaf) && !(typeof srv.localSubFolder === 'string' && srv.localSubFolder.trim())) {
        folderName = leaf;
        basePath = path.dirname(baseNorm);
    }
    return { basePath, folderName };
}

/** A boot-time missing-folder warning expires only with this source's committed authority export. */
function clearRecoveredLocalFolderWarning(srv, state, selected, ingress, ownsSource) {
    if (!srv || !state || !isLocalModeServer(srv) || srv.replicaRegistration || srv.replicaRemoteSlot
        || typeof ownsSource !== 'function' || !ownsSource()
        || state.configWarning?.code !== 'localSubFolderMissing') return false;
    const { basePath, folderName } = resolveLocalWatchParts(srv);
    if (!folderName) return false;
    const expected = path.resolve(basePath, folderName);
    const identity = ingress?.identity;
    if (path.resolve(state.configWarning.expected || '') !== expected
        || selected?.kind !== 'authority' || path.resolve(selected.dir || '') !== expected
        || ingress?.status !== 'valid' || !ingress.payload || ingress.replica === true
        || identity?.legacy !== false || identity.sourceId !== String(srv.id)
        || identity.configuredSlot !== folderName
        || !Number.isSafeInteger(identity.exportGeneration) || identity.exportGeneration < 1) return false;
    const applied = state.exportIdentity;
    if (!applied || applied.sourceId !== identity.sourceId
        || applied.configuredSlot !== identity.configuredSlot
        || applied.careerId !== identity.careerId || applied.sessionId !== identity.sessionId
        || applied.publicationSequence !== identity.publicationSequence
        || applied.exportGeneration !== identity.exportGeneration) return false;
    const current = getServersFromStore().find((row) => String(row.id) === String(srv.id));
    if (!current || JSON.stringify(current) !== JSON.stringify(srv)
        || !boundSources.owns(srv.id, state, state.activationGeneration)) return false;
    state.configWarning = null;
    return true;
}

/**
 * Boot-time hydration from the latest already-written Lua JSON.
 * This lets the dashboard show "last known server/save state" even while FS25 is not running.
 */
async function hydrateLuaSnapshotFromDiskAtBoot(srv) {
    try {
        const state = serverStates[srv.id];
        if (!state || state.active === false) return;
        const bootGeneration = state.ingressGeneration;
        const bootOwned = () => serverStates[srv.id] === state && state.active !== false && state.ingressGeneration === bootGeneration;
        let luaJsonPath = null;
        if (isLocalModeServer(srv)) {
            luaJsonPath = getLocalLuaJsonPathForServer(srv);
        } else if (srv.mode === 'ftp') {
            luaJsonPath = path.join(SESSION_USER_DATA_DIR, `data_${srv.id}.json`);
        }
        if (isLocalModeServer(srv)) {
            const parts = resolveLocalWatchParts(srv);
            const selected = localIngressController.selectIngress(srv, parts, (target) => fs.existsSync(target));
            if (selected.dir) {
                const ingress = exportIngress.ingestWatchedSlot(selected.dir, {
                    sourceId: String(srv.id),
                    configuredSlot: selected.configuredSlot,
                    trustedLocalClock: selected.kind === 'authority',
                    explicitLegacy: srv.legacyJson === true,
                    previous: state.exportIngress,
                    tracker: state.exportIngress && state.exportIngress.tracker,
                });
                if (!bootOwned()) return;
                if (localIngressController.applyWatchedIngress(state, srv, ingress, processLuaData)) {
                    console.log(`[Boot] [${srv.id}] Hydrated ${selected.kind} from ${selected.dir}`);
                    return;
                }
                if (ingress && (ingress.reason === "replica-rejected" || ingress.status === "unavailable")) return;
            }
            if (selected.reason === "configuration-required") return;
            if (!localIngressController.allowRawLegacy(srv, selected)) return;
        }
        if (!luaJsonPath || !(await pathExists(luaJsonPath))) return;
        if (!bootOwned()) return;
        const raw = await readFileUtf8WithRetryAsync(luaJsonPath);
        if (!bootOwned() || raw == null) return;
        let parsed;
        try {
            parsed = JSON.parse(stripUtf8Bom(raw));
        } catch (_) {
            return;
        }
        if (!bootOwned()) return;
        if (shouldIgnoreMinimalLuaExport(parsed, state)) {
            console.log(
                `[Boot] [${srv.id}] Skipped minimal/shutdown Lua snapshot on disk; using cached merged snapshot`
            );
            return;
        }
        processLuaData(srv.id, stripUtf8Bom(raw));
        console.log(`[Boot] [${srv.id}] Hydrated Lua snapshot from disk: ${luaJsonPath}`);
    } catch (e) {
        console.warn(`[Boot] [${srv.id}] Lua snapshot hydrate failed:`, e.message);
    }
}

function getLuaExportStaleMs(state, srv) {
    const cfg = store.get('config') || {};
    return resolveLuaExportStaleMs(getFtpPollingOptions(cfg).intervalMinutes, {
        mode: srv?.mode,
        replica: state?.exportIdentity?.replica === true || state?.ingressKind === 'replica',
    });
}

function stampLuaExportFreshness(merged, state, srv) {
    if (!merged || !state) return merged;
    const staleMs = getLuaExportStaleMs(state, srv);
    const ts = { ...(merged.dataTimestamps || {}), luaExportStaleMs: staleMs };
    let next = merged;
    if (state.luaData) {
        if (isLuaExportStale(state.lastLuaReceivedAt, Date.now(), staleMs)) {
            if (!ts.liveExportStaleAt) {
                ts.liveExportStaleAt = state.lastLuaReceivedAt || new Date().toISOString();
            }
            next = {
                ...merged,
                luaAvailable: false,
                dataTimestamps: ts,
            };
            return applyFreshnessMeta(next, {
                lastLuaAt: state.lastLuaReceivedAt || null,
                lastXmlAt: state.lastXmlReceivedAt || null,
                staleMs,
                collectionHealth: state.xmlData && state.xmlData.collectionHealth,
            });
        }
        delete ts.liveExportStaleAt;
        delete ts.heldFromSnapshotAt;
        delete ts.mergeHeldStaleAt;
        delete ts.liveSectionsHeldAt;
    }
    next = { ...merged, dataTimestamps: ts };
    return applyFreshnessMeta(next, {
        lastLuaAt: state.lastLuaReceivedAt || null,
        lastXmlAt: state.lastXmlReceivedAt || null,
        staleMs,
        collectionHealth: state.xmlData && state.xmlData.collectionHealth,
    });
}

async function rebuildMerged(serverId) {
    const state = serverStates[serverId];
    if (!state) return;
    const gen = mergeRebuildGate.begin(serverId);
    const stillCurrent = () =>
        mergeRebuildGate.isCurrent(serverId, gen) && serverStates[serverId] === state;
    let luaPayload = state.luaData;
    const srv = getServersFromStore().find((s) => String(s.id) === String(serverId));
    const activationGeneration = state.activationGeneration;
    const sourceSignature = srv ? JSON.stringify(srv) : null;
    const ownsSource = () => {
        const current = getServersFromStore().find((s) => String(s.id) === String(serverId));
        return serverStates[serverId] === state && state.active !== false
            && state.activationGeneration === activationGeneration
            && (current ? JSON.stringify(current) : null) === sourceSignature;
    };
    if (srv && state.luaData && (isLocalModeServer(srv) || srv.mode === 'ftp')) {
        try {
            luaPayload = await hydrateLuaDataAnimalsFromDetailsAsync(
                state.luaData,
                srv,
                getLocalLuaJsonPathForServer,
                {
                    userDataPath: SESSION_USER_DATA_DIR,
                    serverState: state,
                }
            );
        } catch (e) {
            console.warn('[DetailHydrate]', serverId, e && e.message ? e.message : e);
            luaPayload = state.luaData;
        }
    }
    if (!ownsSource()) return;
    let merged;
    try {
        const mapHint = {
            mapId: (luaPayload && luaPayload.serverInfo && luaPayload.serverInfo.mapId)
                || (state.xmlData && state.xmlData.career && state.xmlData.career.mapId)
                || '',
            mapTitle: (luaPayload && luaPayload.serverInfo && luaPayload.serverInfo.mapName)
                || (state.xmlData && state.xmlData.career && state.xmlData.career.mapTitle)
                || '',
            serverInfo: luaPayload && luaPayload.serverInfo,
        };
        merged = mergeData(luaPayload, state.xmlData, {
            fieldLiveCache: state.fieldLiveCache || {},
            lastLuaAt: state.lastLuaReceivedAt || null,
            lastXmlAt: state.lastXmlReceivedAt || null,
            mapFillTypeCatalog: mapFillCatalogForMerged(mapHint),
            mapFillTypeTitles: mapFillTitlesForMerged(mapHint),
            collectionHealth: state.xmlData && state.xmlData.collectionHealth,
        });
    } catch (e) {
        console.warn('[rebuildMerged] merge threw', serverId, e && e.message ? e.message : e);
        merged = null;
    }
    if (!ownsSource()) return;
    if (!merged) {
        if (!stillCurrent()) return;
        if (state.mergedData) {
            if (!ownsSource()) return;
            state.mergedData = applyFreshnessMeta(
                {
                    ...state.mergedData,
                    dataTimestamps: {
                        ...(state.mergedData.dataTimestamps || {}),
                        mergeHeldStaleAt: new Date().toISOString(),
                    },
                },
                {
                    lastLuaAt: state.lastLuaReceivedAt || null,
                    lastXmlAt: state.lastXmlReceivedAt || null,
                    cacheUsedDueToFailure: true,
                    staleMs: getLuaExportStaleMs(state, srv),
                    collectionHealth: state.xmlData && state.xmlData.collectionHealth,
                }
            );
            pushUxEvent(ERROR_CODES.E_LUA_STALE, `Merge unavailable; kept last snapshot (${serverId})`, 'merge');
            if (state.fieldHistory && Object.keys(state.fieldHistory).length > 0) {
                state.mergedData.fieldStatusHistory = state.fieldHistory;
            }
            const si = { ...(state.mergedData.serverInfo || {}) };
            const cw = state.configWarning;
            if (cw) si.configWarning = cw;
            else delete si.configWarning;
            state.mergedData.serverInfo = si;
            if (!ownsSource()) return;
            broadcast(serverId, state.mergedData, state);
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
    const preHeldAt = merged && merged.dataTimestamps && merged.dataTimestamps.heldFromSnapshotAt;
    merged = applyLiveSectionHold(merged, state, state.luaData, luaPayload);
    merged = applyMergedSnapshotIfStaleExport(merged, luaPayload, state);
    if (state.xmlData?.redTapeHarvest) {
        merged = supplementRedTapeCropRotation(merged, state.xmlData.redTapeHarvest);
    }
    if (!preHeldAt && merged && merged.dataTimestamps && merged.dataTimestamps.heldFromSnapshotAt) {
        console.warn(
            `[rebuildMerged] [${serverId}] Serving last good merged snapshot (live export looks minimal or shutdown)`
        );
    }
    merged = stampLuaExportFreshness(merged, state, srv);
    const fillHit = mapFillResultForMerged(merged);
    merged.fillTypeHudEpoch =
        (fillHit && fillHit.hudEpoch) || vanillaFillTypeHudEpoch || merged.fillTypeHudEpoch;
    if (!ownsSource()) return;
    state.mergedData = merged;
    const recovery = state.pendingLocalFolderRecovery;
    if (recovery && recovery.ingress === state.exportIngress
        && recovery.activationGeneration === state.activationGeneration
        && recovery.ingressGeneration === state.ingressGeneration
        && srv && merged.luaAvailable === true
        && !merged.dataTimestamps?.heldFromSnapshotAt
        && !merged.dataTimestamps?.mergeHeldStaleAt
        && !merged.dataTimestamps?.liveExportStaleAt) {
        const selected = localIngressController.selectIngress(srv, resolveLocalWatchParts(srv),
            (target) => fs.existsSync(target));
        if (clearRecoveredLocalFolderWarning(srv, state, selected, recovery.ingress,
            () => ownsSource() && runtimeActivation.matches(activationGeneration))) {
            state.pendingLocalFolderRecovery = null;
        }
    }
    warmupMapFieldOutlines(serverId, merged);
    warmupMapFillTypes(serverId, merged);
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
    updateLiveSectionBackup(state, state.mergedData, luaPayload);
    updateLastGoodMergedSnapshot(state, state.mergedData, luaPayload);
    if (!ownsSource()) return;
    broadcast(serverId, state.mergedData, state);
    schedulePersistServerCache(serverId);
}

/**
 * Mirror join-as-client writes truncate then rewrite data.json (~800KB+).
 * fs.watch often fires mid-write → "Unexpected end of JSON input". Keep previous luaData.
 */
function parseLuaJsonObject(raw) {
    if (raw == null) return { ok: false, reason: 'empty' };
    if (typeof raw !== 'string') {
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) return { ok: true, data: raw };
        return { ok: false, reason: 'not-object' };
    }
    const text = String(raw).trim();
    if (!text) return { ok: false, reason: 'empty' };
    try {
        const data = JSON.parse(text);
        if (data == null || typeof data !== 'object' || Array.isArray(data)) {
            return { ok: false, reason: 'not-object' };
        }
        return { ok: true, data };
    } catch (e) {
        return { ok: false, reason: 'parse', error: e };
    }
}

async function readLocalLuaJsonReady(luaJsonPath, serverId) {
    const maxAttempts = 10;
    let lastReason = 'empty';
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const raw = await readFileUtf8WithRetryAsync(luaJsonPath, {
            maxAttempts: 2,
            baseDelayMs: 40,
        });
        if (raw == null) {
            lastReason = 'missing';
            await delayMs(40 * attempt);
            continue;
        }
        const stripped = stripUtf8Bom(raw);
        const parsed = parseLuaJsonObject(stripped);
        if (parsed.ok) return stripped;
        lastReason = parsed.reason || 'parse';
        // Incomplete write — wait for the writer to finish.
        await delayMs(60 * attempt);
    }
    if (lastReason === 'parse') {
        console.warn(
            `[Local] [${serverId}] data.json still incomplete after retries; keeping previous export`
        );
    }
    return null;
}

function processLuaData(serverId, raw, transport) {
    try {
        const parsed = parseLuaJsonObject(typeof raw === 'string' ? stripUtf8Bom(raw) : raw);
        if (!parsed.ok) {
            // Mid-write / truncated mirror is expected during join-as-client streams — stay quiet-ish.
            if (parsed.reason === 'parse') {
                console.warn(
                    `[processLuaData] ${serverId}: Unexpected end of JSON input (incomplete write); keeping previous export`
                );
            } else {
                console.warn(
                    `[processLuaData] [${serverId}] ignored invalid Lua JSON (${parsed.reason}); keeping previous export`
                );
            }
            return;
        }
        const data = parsed.data;
        const state = serverStates[serverId];
        if (!state) return;

        const previousIdentity = state.exportIdentity;
        const careerChanged = !!(
            transport && previousIdentity && transport.careerId && previousIdentity.careerId
            && (previousIdentity.careerId !== transport.careerId || previousIdentity.sourceId !== transport.sourceId)
        );
        if (careerChanged) {
            state.lastGoodMergedSnapshot = null;
            state.liveSectionBackup = null;
            state.fieldHistory = {};
            state.fieldLiveCache = null;
            state.mergedData = null;
            const cleared = boundSources.clearOwned(state);
            if (cleared?.changed) broadcastSourceState({ type: 'source-state', serverId,
                sourceBinding: cleared.sourceBinding });
            state.luaData = null;
        }
        const source = getServersFromStore().find((srv) => String(srv.id) === String(serverId));
        if (isExplicitReplicaXmlSource(source, transport?.replica === true ? 'replica' : state.ingressKind)) {
            clearUnprovenReplicaXml(state);
        }

        if (transport) {
            const sessionChanged = !!(
                previousIdentity && transport.sessionId && previousIdentity.sessionId
                && previousIdentity.sessionId !== transport.sessionId
            );
            if (sessionChanged) {
                state.sectionAge = 'last-known';
            }
        }
        liftSectionOutcomes(data);
        if (data.sectionOutcomes) {
            data.sectionOutcomes.sessionId = transport && transport.sessionId ? transport.sessionId : null;
            data.sectionOutcomes.careerId = transport && exportIngress.safeId(transport.careerId) ? transport.careerId : null;
        }
        const declaresTerminal = data.sectionOutcomes && ['animals', 'fields', 'production', 'stock'].some((name) => {
            const rec = data.sectionOutcomes[name];
            return rec && (rec.outcome === 'empty' || rec.outcome === 'zero' || rec.outcome === 'disabled');
        });
        if (declaresTerminal) {
            applyLiveSectionHold(data, state, data, null);
        }

        if (shouldIgnoreMinimalLuaExport(data, state, transport)) {
            if (careerChanged) return;
            console.warn(
                `[processLuaData] [${serverId}] ignored minimal/shutdown Lua export; keeping last good snapshot`
            );
            const held = buildHeldPayloadFromState(state);
            if (held) {
                state.mergedData = held;
                const si = { ...(state.mergedData.serverInfo || {}) };
                const cw = state.configWarning;
                if (cw) si.configWarning = cw;
                else delete si.configWarning;
                state.mergedData.serverInfo = si;
                if (state.fieldHistory && Object.keys(state.fieldHistory).length > 0) {
                    state.mergedData.fieldStatusHistory = state.fieldHistory;
                }
                broadcast(serverId, state.mergedData, state);
                schedulePersistServerCache(serverId);
            }
            return;
        }

        if (!(transport && transport.sessionId && state.sectionAge === 'last-known' && previousIdentity
            && previousIdentity.sessionId && previousIdentity.sessionId !== transport.sessionId)) {
            state.sectionAge = 'current';
        }
        const nowIso = new Date().toISOString();
        ingressOrchestration.recordIngress(state, data, transport, nowIso);
        const selectedIdentity = state.exportIngress?.identity;
        if (state.configWarning?.code === 'localSubFolderMissing'
            && state.exportIngress?.status === 'valid' && transport
            && selectedIdentity?.sourceId === String(serverId)
            && selectedIdentity.configuredSlot === transport.configuredSlot
            && selectedIdentity.careerId === transport.careerId
            && selectedIdentity.sessionId === transport.sessionId
            && selectedIdentity.publicationSequence === transport.publicationSequence
            && selectedIdentity.exportGeneration === transport.exportGeneration) {
            state.pendingLocalFolderRecovery = {
                ingress: state.exportIngress,
                activationGeneration: state.activationGeneration,
                ingressGeneration: state.ingressGeneration,
            };
        }
        try {
            const fps = buildFieldLiveFingerprints(data.fields || [], nowIso);
            if (Object.keys(fps).length > 0) {
                state.fieldLiveCache = { ...(state.fieldLiveCache || {}), ...fps };
                state.fieldHistory = appendFieldHistory(state.fieldHistory || {}, fps);
            }
        } catch (e) {
            console.warn('[Cache] fingerprint', serverId, e.message);
        }

        // If we don't have XML yet (or saveSlot changed), trigger XML poll now
        const saveSlot = safeFsIdentity.sanitizeSaveSlot(data.serverInfo?.saveSlot, state.lastSaveSlot || 'savegame1');
        if (saveSlot && saveSlot !== state.lastSaveSlot) {
            state.lastSaveSlot = saveSlot;
            triggerXmlPoll(serverId);
        }

        void rebuildMerged(serverId).catch((e) => {
            console.warn('[rebuildMerged]', serverId, e && e.message ? e.message : e);
        });

        console.log(`[${new Date().toISOString()}] [${serverId}] Lua data updated`);
    } catch (e) {
        console.error(`[processLuaData] ${serverId}:`, e.message);
    }
}

/** Pull savegame XML from FTP (e.g. GPortal: profile/savegameN/…) into userData/ftpXmlCache. */
async function downloadFtpSavegameXml(srv, saveSlot) {
    const slot = safeFsIdentity.sanitizeSaveSlot(saveSlot || srv.localSubFolder, 'savegame1');
    const cacheRoot = path.join(SESSION_USER_DATA_DIR, 'ftpXmlCache', String(srv.id));
    const localDir = safeFsIdentity.joinContained(cacheRoot, slot);
    await fs.promises.mkdir(localDir, { recursive: true });

    const remoteDir = srv.ftpSavegameRemoteDir
        ? String(srv.ftpSavegameRemoteDir).replace(/\\/g, '/').replace(/\/$/, '')
        : `${String(srv.ftpBasePath || 'profile').replace(/\\/g, '/').replace(/\/$/, '')}/${slot}`;

    const client = new ftp.Client(120000);
    ftpActiveClients.set(srv.id, client);
    client.ftp.verbose = false;
    try {
        await client.access(ftpAccessOptions(srv));

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
            // Moisture System mod (optional — only when FS25_MoistureSystem is on the save).
            await pullOne('MoistureSystem.xml');
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

/** Drop XML-derived holds once a local row is identified as a remote replica. */
function clearUnprovenReplicaXml(state) {
    if (!state || (state.replicaXmlIsolated && state.xmlData == null
        && state.lastXmlReceivedAt == null && state.lastXmlFingerprint == null)) return false;
    state.xmlData = null;
    state.lastXmlReceivedAt = null;
    state.lastXmlFingerprint = null;
    state.mergedData = null;
    const cleared = boundSources.clearOwned(state);
    if (cleared?.changed) broadcastSourceState({ type: 'source-state', serverId: cleared.serverId,
        sourceBinding: cleared.sourceBinding });
    state.lastGoodMergedSnapshot = null;
    state.liveSectionBackup = null;
    state.fieldLiveCache = {};
    state.fieldHistory = {};
    state.replicaXmlIsolated = true;
    return true;
}

async function triggerXmlPoll(serverId) {
    const config = store.get('config');
    const srv    = config?.servers?.find(s => String(s.id) === String(serverId));
    if (!srv) return;

    const state    = serverStates[serverId];
    const saveSlot = state?.lastSaveSlot;
    const effectiveSlot = saveSlot || srv.localSubFolder || 'savegame1';
    const activationGeneration = state?.activationGeneration;
    const sourceSignature = JSON.stringify(srv);
    const ownsSource = () => {
        const current = store.get('config')?.servers?.find(s => String(s.id) === String(serverId));
        return serverStates[serverId] === state && state?.active !== false
            && state?.activationGeneration === activationGeneration
            && !!current && JSON.stringify(current) === sourceSignature;
    };
    if (!ownsSource()) return;

    if (isExplicitReplicaXmlSource(srv, state?.ingressKind)) {
        if (clearUnprovenReplicaXml(state) && state?.luaData) await rebuildMerged(serverId);
        return;
    }

    try {
        if (srv.mode === 'ftp') {
            await downloadFtpSavegameXml(srv, saveSlot);
            if (!ownsSource()) return;
        }
        if (hasHttpFeed(srv)) {
            const result = await downloadHttpFeedSavegameXml(srv, saveSlot, SESSION_USER_DATA_DIR);
            if (!ownsSource()) return;
            if (result.ok) {
                console.log(
                    `[HTTP-Feed] [${serverId}] saved ${result.saved.join(', ')}` +
                    (result.skipped.length ? ` (skipped empty: ${result.skipped.join(', ')})` : '')
                );
            } else if (result.failed?.length) {
                console.warn(`[HTTP-Feed] [${serverId}] download issues:`, result.failed);
            }
        }
        const fingerprint = await getSavegameXmlFingerprint(srv, effectiveSlot, state?.ingressKind);
        if (!ownsSource()) return;
        if (isExplicitReplicaXmlSource(srv, state?.ingressKind)) {
            if (clearUnprovenReplicaXml(state) && state?.luaData) await rebuildMerged(serverId);
            return;
        }
        if (
            fingerprint &&
            state?.xmlData &&
            state.lastXmlFingerprint === fingerprint
        ) {
            return;
        }
        const xmlData = await collectXmlData(srv, saveSlot, state?.ingressKind);
        if (!ownsSource()) return;
        if (isExplicitReplicaXmlSource(srv, state?.ingressKind)) {
            if (clearUnprovenReplicaXml(state) && state?.luaData) await rebuildMerged(serverId);
            return;
        }
        if (xmlData) {
            serverStates[serverId].xmlData = xmlData;
            serverStates[serverId].lastXmlReceivedAt = new Date().toISOString();
            serverStates[serverId].lastXmlFingerprint = fingerprint || null;
            await rebuildMerged(serverId);
            console.log(`[XML] [${serverId}] XML data updated (slot=${effectiveSlot})`);
        } else if (srv.mode === 'ftp') {
            console.warn(
                `[XML] [${serverId}] Parsed XML is empty (no usable savegame in ftpXmlCache for slot=${effectiveSlot}). ` +
                'If Lua never loads, the slot may be wrong — set this server\'s save slot to match the host (e.g. savegame3).'
            );
        } else if (hasHttpFeed(srv)) {
            console.warn(
                `[XML] [${serverId}] HTTP feed configured but no usable XML in httpXmlCache yet ` +
                `(hosts often only expose careerSavegame / vehicles / economy).`
            );
        }
    } catch (e) {
        console.warn(`[XML] [${serverId}] XML poll failed:`, e.message);
    }
}

function releaseWatcherHandles(state) {
    if (!state) return;
    if (state.readDebounceTimer) {
        clearTimeout(state.readDebounceTimer);
        state.readDebounceTimer = null;
    }
    if (state.watcher) {
        try { state.watcher.close(); } catch (_) { /* already closed */ }
        state.watcher = null;
    }
    if (state.dirtyPensWatcher) {
        try { state.dirtyPensWatcher.close(); } catch (_) { /* already closed */ }
        state.dirtyPensWatcher = null;
    }
    for (const timer of (state.intervals || [])) {
        clearTimeout(timer);
        clearInterval(timer);
    }
    state.intervals = [];
}

function disposeLocalWatcherState(state) {
    if (!state) return;
    state.active = false;
    if (state.retryTimer) {
        clearTimeout(state.retryTimer);
        state.retryTimer = null;
    }
    releaseWatcherHandles(state);
}

// ── Local file watcher ────────────────────────────────────────────────────────

async function startLocalWatching(srv) {
    const state = serverStates[srv.id];
    if (!state || state.active === false) return { status: "superseded" };
    const attempt = (state.watcherAttempt || 0) + 1;
    state.watcherAttempt = attempt;
    state.ingressGeneration = (state.ingressGeneration || 0) + 1;
    const ingressGeneration = state.ingressGeneration;
    releaseWatcherHandles(state);
    state.active = true;
    const stillOwned = () => serverStates[srv.id] === state && state.active === true && state.ingressGeneration === ingressGeneration;
    const generationCurrent = () => state.activationGeneration == null || runtimeActivation.matches(state.activationGeneration);
    const ownedNow = () => stillOwned() && generationCurrent() && state.watcherAttempt === attempt;
    const watcherWarningCodes = { "watcher-start-failed": true, "watcher-runtime-error": true };
    const reportReadiness = (status) => {
        if (state.activationGeneration == null) return;
        runtimeActivation.noteSource(state.activationGeneration, String(srv.id), attempt, status);
    };
    const noteWatcherProblem = (code, message) => {
        if (!ownedNow()) return;
        state.watchReadiness = "retrying";
        state.watcherWarning = { code, message, attempt, generation: state.activationGeneration };
        if (!state.configWarning || watcherWarningCodes[state.configWarning.code]) {
            state.configWarning = {
                code,
                at: new Date().toISOString(),
                message,
                owner: "watcher",
                attempt,
                generation: state.activationGeneration,
            };
        }
        reportReadiness("retrying");
    };
    const noteWatcherArmed = () => {
        if (!ownedNow()) return;
        state.watchReadiness = "armed";
        const warningIsCurrent = (warning) => warning && warning.generation === state.activationGeneration && !(warning.attempt > attempt);
        if (warningIsCurrent(state.watcherWarning)) state.watcherWarning = null;
        if (warningIsCurrent(state.configWarning) && state.configWarning.owner === "watcher" && watcherWarningCodes[state.configWarning.code]) {
            state.configWarning = null;
        }
        reportReadiness("armed");
    };
    const scheduleOwnedRetry = (delayMs) => {
        if (state.retryTimer || !ownedNow()) return false;
        const timer = setTimeout(() => {
            state.retryTimer = null;
            if (!ownedNow()) return;
            const token = state.activationGeneration;
            startLocalWatching(srv).then(() => {
                const sameState = serverStates[srv.id] === state;
                const sameGeneration = token == null || runtimeActivation.matches(token);
                if (!sameState || !sameGeneration) {
                    if (!sameState) disposeLocalWatcherState(state);
                }
            }).catch((err) => {
                console.error(`[Local] startLocalWatching retry failed [${srv.id}]:`, err && err.message ? err.message : err);
            });
        }, delayMs);
        state.retryTimer = timer;
        state.intervals.push(timer);
        return true;
    };

    const { basePath, folderName } = resolveLocalWatchParts(srv);
    try {
        state.identityProvision = ensureIdentityProposal(basePath).status;
    } catch (provisionError) {
        state.identityProvision = "proposal-failed";
    }
    const luaJsonPath = path.join(basePath, folderName, 'data.json');

    const routeWatchPath = path.join(path.dirname(luaJsonPath), "active.xml");
    const replicaDirEarly = path.join(basePath, "replicas", String(srv.id));
    let replicaReadyEarly = false;
    try {
        replicaReadyEarly = (await pathExists(path.join(replicaDirEarly, "slot-a.xml")))
            || (await pathExists(path.join(replicaDirEarly, "selection-a.xml")))
            || (await pathExists(path.join(replicaDirEarly, "slot-b.xml")))
            || (await pathExists(path.join(replicaDirEarly, "selection-b.xml")))
            || (await pathExists(path.join(replicaDirEarly, "selected.xml")));
    } catch (replicaGateError) {
        replicaReadyEarly = false;
    }
    if (!ownedNow()) return { status: "superseded" };
    if (!replicaReadyEarly && !(await pathExists(luaJsonPath)) && !(await pathExists(routeWatchPath))) {
        if (!ownedNow()) return { status: "superseded" };
        console.log(`[Local] Waiting for: ${luaJsonPath}`);
        state.watchReadiness = "waiting";
        scheduleOwnedRetry(5000);
        reportReadiness("waiting");
        return { status: "waiting", attempt };
    }

    console.log(`[Local] Watching: ${luaJsonPath}`);

    let lastMtimeMs = 0;
    let readDebounceTimer = null;
    const updateMtime = (mtimeMs) => {
        if (Number.isFinite(mtimeMs) && mtimeMs > 0) lastMtimeMs = mtimeMs;
    };
    const readFileNow = (knownMtimeMs) => {
        if (!ownedNow()) return;
        let ingress = null;
        let selected = null;
        try {
            selected = localIngressController.selectIngress(srv, { basePath, folderName }, (target) => fs.existsSync(target));
            if (!selected.dir) {
                ingress = selected.reason ? { status: "unavailable", reason: selected.reason, payload: null } : null;
            } else {
                ingress = exportIngress.ingestWatchedSlot(selected.dir, {
                    sourceId: String(srv.id),
                    configuredSlot: selected.configuredSlot,
                    trustedLocalClock: selected.kind === 'authority',
                    explicitLegacy: srv.legacyJson === true,
                    previous: state.exportIngress,
                    tracker: state.exportIngress && state.exportIngress.tracker,
                });
            }
        } catch (ingressError) {
            ingress = null;
        }
        if (ingress && ingress.payload && (ingress.status === "valid" || ingress.status === "identity-unconfirmed" || ingress.status === "last-known" || ingress.status === "replica")) {
            state.exportIngress = ingress;
            const transport = {
                ...(ingress.identity || {}),
                freshness: ingress.freshness,
                ingressStatus: ingress.status,
                sourceId: String(srv.id),
                replica: (ingress.identity && ingress.identity.replica === true) || ingress.replica === true,
                authoritative: ((ingress.identity && ingress.identity.replica === true) || ingress.replica === true) ? false : ingress.authoritative,
            };
            if (!ownedNow()) return;
            processLuaData(srv.id, JSON.stringify(ingress.payload), transport);
            if (Number.isFinite(knownMtimeMs)) updateMtime(knownMtimeMs);
            return;
        }
        if (ingress && (ingress.reason === "replica-rejected" || ingress.reason === "configuration-required")) return;
        let routePresent = false;
        try { routePresent = fs.existsSync(routeWatchPath); } catch (_) { return; }
        if (routePresent) return;
        if (srv.legacyJson !== true) return;
        readLocalLuaJsonReady(luaJsonPath, srv.id)
            .then((raw) => {
                if (!ownedNow()) return;
                if (raw != null) processLuaData(srv.id, raw);
                if (Number.isFinite(knownMtimeMs)) {
                    updateMtime(knownMtimeMs);
                } else {
                    fs.promises.stat(luaJsonPath)
                        .then((stat) => updateMtime(Number(stat.mtimeMs) || 0))
                        .catch(() => {});
                }
            })
            .catch((e) => {
                console.warn(`[Local] read data.json [${srv.id}]:`, e && e.message ? e.message : e);
            });
    };
    // Debounce: join-as-client mirror truncates then streams ~800KB; many watch events mid-write.
    const readFile = (knownMtimeMs) => {
        if (!ownedNow()) return;
        if (state.readDebounceTimer) clearTimeout(state.readDebounceTimer);
        state.readDebounceTimer = setTimeout(() => {
            state.readDebounceTimer = null;
            if (!ownedNow()) return;
            readFileNow(knownMtimeMs);
        }, 350);
    };

    // fs.watch + persistent:false — avoids chokidar polling handles that kept Windows folders "in use".
    let fw;
    try {
        const selectedWatch = localIngressController.selectIngress(srv, { basePath, folderName }, (target) => fs.existsSync(target));
        const watchTarget = selectedWatch.kind === "authority"
            ? routeWatchPath
            : ((selectedWatch.kind === "replica" && selectedWatch.dir && fs.existsSync(selectedWatch.dir))
                ? selectedWatch.dir
                : ((await pathExists(routeWatchPath)) ? routeWatchPath : luaJsonPath));
        if (!ownedNow()) return { status: "superseded" };
        fw = fs.watch(watchTarget, { persistent: false }, () => readFile());
        if (!ownedNow()) {
            try { fw.close(); } catch (_) { /* stale setup releases only the handle it just opened */ }
            return { status: "superseded" };
        }
        fw.on('error', (err) => {
            console.warn(`[Local] watch error [${srv.id}]:`, err && err.message ? err.message : err);
            try { fw.close(); } catch (_) { /* ignore */ }
            if (!ownedNow()) return;
            state.watcher = null;
            noteWatcherProblem("watcher-runtime-error", err && err.message ? err.message : "watcher-runtime-error");
            scheduleOwnedRetry(5000);
        });
    } catch (e) {
        console.warn(`[Local] fs.watch failed [${srv.id}]:`, e.message);
        if (!ownedNow()) return { status: "superseded" };
        state.watcher = null;
        noteWatcherProblem("watcher-start-failed", e && e.message ? e.message : "watcher-start-failed");
        scheduleOwnedRetry(5000);
        return { status: "retrying", error: e && e.message ? e.message : "watcher-start-failed", attempt };
    }
    state.watcher = fw;
    readFile();

    // Poll mtime as a fallback for missed fs.watch events (Windows can drop change signals).
    const pollIntervalMs = 10000;
    const pollTimer = setInterval(async () => {
        try {
            if (!stillOwned()) return;
            const selected = localIngressController.selectIngress(srv, { basePath, folderName }, (target) => fs.existsSync(target));
            if (selected.reason === "configuration-required") return;
            let mtimeMs = 0;
            if (selected.kind === "replica" && selected.dir) {
                for (const name of ["selected.xml", "slot-a.xml", "slot-b.xml", "selection-a.xml", "selection-b.xml"]) {
                    try {
                        const candidate = path.join(selected.dir, name);
                        if (!fs.existsSync(candidate)) continue;
                        const candidateStat = await fs.promises.stat(candidate);
                        mtimeMs = Math.max(mtimeMs, Number(candidateStat.mtimeMs) || 0);
                    } catch (_) { /* keep polling the files that are present */ }
                }
            } else if (selected.kind === "authority") {
                const stat = await fs.promises.stat(routeWatchPath);
                mtimeMs = Number(stat.mtimeMs) || 0;
            } else if (srv.legacyJson === true && luaJsonPath) {
                const stat = await fs.promises.stat(luaJsonPath);
                mtimeMs = Number(stat.mtimeMs) || 0;
            } else return;
            if (typeof livestockDetailModule.reconcileDirtyWatch === 'function' && ownedNow()) {
                const nextDirty = typeof livestockDetailModule.dirtyIndexWatchPath === 'function'
                    ? livestockDetailModule.dirtyIndexWatchPath(path.dirname(luaJsonPath), srv, serverStates[srv.id])
                    : null;
                await livestockDetailModule.reconcileDirtyWatch({
                    state,
                    desired: nextDirty,
                    fsImpl: fs,
                    pathExists,
                    ownedNow,
                    onEvent: () => {
                        try { livestockDetailModule.bustDirtyIndexCache(srv.id); } catch (_) { /* ignore */ }
                    },
                });
            }
            if (!stillOwned()) return;
            if (mtimeMs > lastMtimeMs + 1) readFile(mtimeMs);
        } catch (_) {
            /* ignore */
        }
    }, pollIntervalMs);
    state.intervals.push(pollTimer);

    const dirtySlotDir = path.dirname(luaJsonPath);
    const dirtyPensPath = typeof livestockDetailModule.dirtyIndexWatchPath === 'function'
        ? livestockDetailModule.dirtyIndexWatchPath(dirtySlotDir, srv, serverStates[srv.id])
        : path.join(dirtySlotDir, 'dirtyPens.json');
    const closeIfStale = (handle) => {
        if (!handle) return;
        try { handle.close(); } catch (_) { /* stale setup releases only the handle it just opened */ }
    };
    try {
        const bustDirty = () => {
            if (!ownedNow()) return;
            try {
                livestockDetailModule.bustDirtyIndexCache(srv.id);
            } catch (_) { /* ignore */ }
        };
        let fwDirty = null;
        if (typeof livestockDetailModule.reconcileDirtyWatch === 'function') {
            await livestockDetailModule.reconcileDirtyWatch({
                state,
                desired: dirtyPensPath,
                fsImpl: fs,
                pathExists,
                ownedNow,
                onEvent: bustDirty,
            });
        } else if (!dirtyPensPath) {
            fwDirty = null;
        } else {
        const dirtyFileExists = await pathExists(dirtyPensPath);
        if (!ownedNow()) return { status: "superseded" };
        if (dirtyFileExists) {
            fwDirty = fs.watch(dirtyPensPath, { persistent: false }, bustDirty);
            if (!ownedNow()) {
                closeIfStale(fwDirty);
                return { status: "superseded" };
            }
            fwDirty.on('error', (err) => {
                console.warn(`[Local] dirtyPens watch error [${srv.id}]:`, err && err.message ? err.message : err);
                try { fwDirty.close(); } catch (_) { /* ignore */ }
                if (ownedNow() && state.dirtyPensWatcher === fwDirty) state.dirtyPensWatcher = null;
            });
        } else {
            const dirOfDirty = path.dirname(dirtyPensPath);
            const baseName = path.basename(dirtyPensPath);
            const dirtyDirExists = await pathExists(dirOfDirty);
            if (!ownedNow()) return { status: "superseded" };
            if (dirtyDirExists) {
                fwDirty = fs.watch(dirOfDirty, { persistent: false }, (_evt, fname) => {
                    if (!ownedNow()) return;
                    if (fname === baseName) bustDirty();
                });
                if (!ownedNow()) {
                    closeIfStale(fwDirty);
                    return { status: "superseded" };
                }
                fwDirty.on('error', (err) => {
                    console.warn(`[Local] slot-dir watch error [${srv.id}]:`, err && err.message ? err.message : err);
                    try { fwDirty.close(); } catch (_) { /* ignore */ }
                    if (ownedNow() && state.dirtyPensWatcher === fwDirty) state.dirtyPensWatcher = null;
                });
            }
        }
        if (!ownedNow()) {
            closeIfStale(fwDirty);
            return { status: "superseded" };
        }
        state.dirtyPensWatcher = fwDirty;
        }
    } catch (e) {
        console.warn(`[Local] dirtyPens watch setup failed [${srv.id}]:`, e.message);
        if (!ownedNow()) return { status: "superseded" };
    }

    if (!ownedNow()) return { status: "superseded" };
    // XML poll immediately then every 60s (XML changes on save, not every 10s)
    triggerXmlPoll(srv.id);
    if (!ownedNow()) return { status: "superseded" };
    const xmlInterval = setInterval(() => {
        if (!ownedNow()) return;
        triggerXmlPoll(srv.id);
    }, 60000);
    if (!ownedNow()) {
        clearInterval(xmlInterval);
        return { status: "superseded" };
    }
    state.intervals.push(xmlInterval);
    noteWatcherArmed();
    return { status: "armed", attempt };
}

// ── FTP polling ───────────────────────────────────────────────────────────────

/**
 * Download a single remote file with optional retries. Dedicated servers often write savegame XML in a
 * burst; FTP during that window can see locked files, partial writes, or zero-byte reads — different
 * files fail on each poll. Retries with short backoff usually clear it.
 */
async function safeDownload(client, remotePath, localTmp, localFinal, options = {}) {
    return fileCommit.downloadAndCommit(client, remotePath, localTmp, localFinal, options);
}

/** FTP FileInfo.type — Directory (skip when syncing files). */
const FTP_FILE_TYPE_DIRECTORY = 2;

/**
 * Mirror host `details/animals_*.json` into userData so livestock hydration matches local mode.
 * Only re-downloads when remote size differs from cached file (large herds = multi‑MiB files).
 */
/** @returns {Promise<number>} number of detail files newly downloaded or updated */
async function syncFtpDetailsCache(client, srv, slotRemote, userDataPath, options = {}) {
    const remoteDir = `${slotRemote}/details`.replace(/\\/g, '/');
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(String(srv.id))) return 0;
    const localRoot = path.join(userDataPath, 'ftpDetailsCache', String(srv.id));
    const st = serverStates[srv.id];
    const folderName =
        (st && st.lastSaveSlot) ||
        srv.localSubFolder ||
        'savegame1';
    if (!safeFsIdentity.SAVE_SLOT_RE.test(String(folderName))) return 0;
    const localDir = path.join(localRoot, folderName, 'details');
    try {
        await fs.promises.mkdir(localDir, { recursive: true });
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
    const dlOpts = { maxAttempts: 2, retryDelayMs: 400, canCommit: options.canCommit };
    for (const ent of list) {
        if (!ent || !ent.name || ent.type === FTP_FILE_TYPE_DIRECTORY) continue;
        const name = ent.name;
        if (typeof name !== 'string' || !/^animals_[A-Za-z0-9_-]+\.json$/.test(name)) continue;
        if (options.canCommit && !options.canCommit()) break;
        const remotePath = `${remoteDir}/${name}`;
        const localFinal = path.join(localDir, name);
        const tmpPath = `${localFinal}.tmp`;
        let need = true;
        if (await pathExists(localFinal)) {
            try {
                const localSize = (await fs.promises.stat(localFinal)).size;
                const remSize = Number(ent.size);
                if (Number.isFinite(remSize) && remSize > 0 && localSize === remSize) {
                    const remMod = ent.modifiedAt instanceof Date ? ent.modifiedAt.getTime() : 0;
                    const locMod = (await fs.promises.stat(localFinal)).mtimeMs;
                    if (remMod && locMod >= remMod - 2000) {
                        need = false;
                    }
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
    if (ftpPollInFlight.has(srv.id)) return;
    const pollToken = {};
    ftpPollInFlight.set(srv.id, pollToken);
    const gen = (ftpPollGenerations[srv.id] = (ftpPollGenerations[srv.id] || 0) + 1);
    const client = new ftp.Client(120000);
    client.ftp.verbose = false;
    const userDataPath = SESSION_USER_DATA_DIR;
    try {
        await client.access(ftpAccessOptions(srv));

        const basePath = srv.ftpBasePath || 'profile';
        const st = serverStates[srv.id];
        const folderName =
            (st && st.lastSaveSlot) ||
            srv.localSubFolder ||
            'savegame1';
        let slotRemote = `${basePath}/modSettings/FS25_FarmDashboard/${folderName}`;
        const remotePath = `${slotRemote}/data.json`;

        const tmpPath   = path.join(userDataPath, `data_${srv.id}_${gen}.json.tmp`);
        const finalPath = path.join(userDataPath, `data_${srv.id}.json`);

        if (ftpPollGenerations[srv.id] !== gen) return;
        if (st) {
            try {
                const proposal = await publishIdentityProposalFtp(client, `${basePath}/modSettings/FS25_FarmDashboard`);
                st.identityProvision = proposal.status;
            } catch (proposalError) {
                st.identityProvision = "remote-unknown";
            }
        }

        const routeTmp = path.join(userDataPath, `route_${srv.id}_${gen}.xml.tmp`);
        const routeFinal = path.join(userDataPath, `route_${srv.id}.xml`);
        let envelopeDelivered = false;
        let routeAttempted = false;
        if (await safeDownload(client, `${slotRemote}/active.xml`, routeTmp, routeFinal, { maxAttempts: 2, canCommit: () => ftpPollGenerations[srv.id] === gen })) {
            routeAttempted = true;
            const routeXml = await readFileUtf8WithRetryAsync(routeFinal, { maxAttempts: 2 });
            const route = exportIngress.parseRoute(routeXml);
            if (route && exportIngress.safeId(route.careerId)) {
                const slotTmp = path.join(userDataPath, `slot_${srv.id}_${gen}.xml.tmp`);
                const slotFinal = path.join(userDataPath, `slot_${srv.id}.xml`);
                const slotRemoteFile = `${slotRemote}/${route.careerId}/${exportIngress.slotFileName(route.slot)}`;
                if (await safeDownload(client, slotRemoteFile, slotTmp, slotFinal, { maxAttempts: 2, canCommit: () => ftpPollGenerations[srv.id] === gen })) {
                    const slotXml = await readFileUtf8WithRetryAsync(slotFinal, { maxAttempts: 2 });
                    const ingested = exportIngress.readExportBuffers({
                        routeXml,
                        slotXml,
                        sourceId: String(srv.id),
                        configuredSlot: folderName,
                        previous: st && st.exportIngress,
                    });
                    if (ingested && ingested.payload && ftpPollGenerations[srv.id] === gen) {
                        if (st) st.exportIngress = ingested;
                        processLuaData(srv.id, JSON.stringify(ingested.payload), { ...(ingested.identity || {}), freshness: ingested.freshness, sourceId: String(srv.id) });
                        envelopeDelivered = true;
                    }
                }
            }
        }

        if (!envelopeDelivered && srv.legacyJson === true && await safeDownload(client, remotePath, tmpPath, finalPath, { maxAttempts: 4, retryDelayMs: 350, canCommit: () => ftpPollGenerations[srv.id] === gen })) {
            if (ftpPollGenerations[srv.id] !== gen) return;
            const luaRaw = await readFileUtf8WithRetryAsync(finalPath, { maxAttempts: 3 });
            if (luaRaw != null && ftpPollGenerations[srv.id] === gen) {
                processLuaData(srv.id, stripUtf8Bom(luaRaw));
            }
        } else if (!envelopeDelivered && srv.legacyJson === true) {
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

        // Modern sources refresh both resource slots. Explicit legacy keeps dirtyPens.json.
        try {
            if (srv.legacyJson !== true) {
                await livestockDetailModule.ftpRefreshDirtyIndex(srv, {
                    userDataPath,
                    serverStates,
                    slotRemote,
                    client,
                    canCommit: () => ftpPollGenerations[srv.id] === gen,
                });
            } else {
            const dirtyRemote = `${slotRemote}/dirtyPens.json`;
            const dirtyTmp = path.join(userDataPath, `livestock_dirtyPens_${srv.id}.json.tmp`);
            const dirtyFinal = path.join(userDataPath, `livestock_dirtyPens_${srv.id}.json`);
            const ok = await safeDownload(client, dirtyRemote, dirtyTmp, dirtyFinal, { maxAttempts: 1, canCommit: () => ftpPollGenerations[srv.id] === gen });
            if (!ok && srv && srv.id != null) {
                // Don't spam: dirtyPens.json may not exist yet on a fresh save.
                if (!serverStates[srv.id] || !serverStates[srv.id]._dirtyMissingLogged) {
                    if (serverStates[srv.id]) serverStates[srv.id]._dirtyMissingLogged = true;
                    console.log(`[FTP] [${srv.id}] dirtyPens.json not yet available on host; live detail fetches will refetch on each click until index exists.`);
                }
            }
            }
        } catch (e) {
            console.warn(`[FTP] [${srv.id}] dirtyPens piggy-back failed: ${e && e.message}`);
        }

        if (srv.legacyJson === true) {
        try {
            const detailPulls = await syncFtpDetailsCache(client, srv, slotRemote, userDataPath, { canCommit: () => ftpPollGenerations[srv.id] === gen });
            if (detailPulls > 0 && ftpPollGenerations[srv.id] === gen) {
                await rebuildMerged(srv.id);
            }
        } catch (e) {
            console.warn(`[FTP] [${srv.id}] details folder sync: ${e && e.message}`);
        }
        }
    } catch (err) {
        console.warn(`[FTP] [${srv.id}] ${srv.name}: ${err.message}`);
    } finally {
        client.close();
        if (ftpActiveClients.get(srv.id) === client) ftpActiveClients.delete(srv.id);
        if (ftpPollInFlight.get(srv.id) === pollToken) ftpPollInFlight.delete(srv.id);
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
    for (const id of Object.keys(ftpPollGenerations)) ftpPollGenerations[id] += 1;
    for (const client of ftpActiveClients.values()) { try { client.close(); } catch (_) {} }
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
    persistAllServerCaches('shutdown');
    clearFtpPollingTimers();
    Object.keys(serverCacheSaveTimers).forEach((k) => {
        clearTimeout(serverCacheSaveTimers[k]);
        delete serverCacheSaveTimers[k];
    });
    const states = Object.values(serverStates);
    for (const state of states) {
        state.ingressGeneration = (state.ingressGeneration || 0) + 1;
        disposeLocalWatcherState(state);
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

function isTrustedDashboardIpcSender(event) {
    try {
        const wc = event && event.sender;
        if (!mainWindow || mainWindow.isDestroyed() || !wc || wc.isDestroyed()) return false;
        if (wc !== mainWindow.webContents || !event.senderFrame || event.senderFrame !== wc.mainFrame) return false;
        const options = { port: PORT, appDirectory: __dirname };
        return editionPolicy.isTrustedDashboardIpcUrl(wc.getURL(), options)
            && editionPolicy.isTrustedDashboardIpcUrl(event.senderFrame.url, options);
    } catch (_) { return false; }
}

let launchDashboardInFlight = null;
let dashboardNavigationInFlight = null;

function waitForDashboardNavigation(dest, timeoutMs) {
    const targetWindow = mainWindow;
    if (!targetWindow || targetWindow.isDestroyed()) return Promise.reject(new Error('no_window'));
    const destination = new URL(dest).href;
    const pending = dashboardNavigationInFlight;
    if (pending && pending.window === targetWindow && pending.destination === destination) {
        return pending.promise;
    }
    const wc = targetWindow.webContents;
    if (wc.getURL() === destination && !wc.isLoadingMainFrame()) return Promise.resolve();
    // Setup IPC and deferred backend boot can arrive in either order. Only one
    // loadURL may own the hand-off, otherwise Electron aborts the first request.
    const navigation = { window: targetWindow, destination, promise: null };
    const work = new Promise((resolve, reject) => {
        let settled = false;
        const finish = (err) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            wc.removeListener('did-finish-load', onOk);
            wc.removeListener('did-fail-load', onFail);
            wc.removeListener('destroyed', onDestroyed);
            if (err) reject(err);
            else resolve();
        };
        const timer = setTimeout(() => finish(new Error('navigation_timeout')), timeoutMs);
        const onOk = () => {
            if (wc.getURL() === destination) finish(null);
        };
        const onFail = (_e, _code, desc, _url, isMainFrame) => {
            if (isMainFrame !== false) finish(new Error(desc || 'did-fail-load'));
        };
        const onDestroyed = () => finish(new Error('no_window'));
        wc.on('did-finish-load', onOk);
        wc.on('did-fail-load', onFail);
        wc.once('destroyed', onDestroyed);
        try {
            targetWindow.loadURL(destination).catch((err) => finish(err));
        } catch (err) {
            finish(err);
        }
    });
    navigation.promise = work.finally(() => {
        if (dashboardNavigationInFlight === navigation) dashboardNavigationInFlight = null;
    });
    dashboardNavigationInFlight = navigation;
    return navigation.promise;
}

// Older approved links could be saved before the setup flag was set. Recover only
// rows with the app-side pairing for this FS25 profile; bootServer and ingress
// still enforce registration and the committed replica's slot/career identity.
function hasRecoverablePersistedReplica(config) {
    if (!config || !Array.isArray(config.servers) || config.servers.length === 0) return false;
    const profile = getFs25DocumentsRoot();
    if (!profile) return false;
    const expectedRoot = path.resolve(profile, 'modSettings', 'FS25_FarmDashboard').toLowerCase();
    if (!config.servers.every((row) => row && row.mode === 'local' &&
        row.replicaRegistration && row.replicaRemoteSlot &&
        row.localSubFolder === row.replicaRemoteSlot &&
        row.replicaRegistration.remoteSlot === row.replicaRemoteSlot &&
        typeof row.localPath === 'string' &&
        path.resolve(row.localPath).toLowerCase() === expectedRoot)) return false;
    const checked = replicaRegistration.validateSnapshot(config.servers);
    return checked.ok === true && checked.rows.length === config.servers.length;
}

async function launchDashboardFromIpc(event) {
    if (!isTrustedDashboardIpcSender(event)) {
        return { ok: false, error: 'untrusted_sender', stage: 'idle' };
    }
    if (launchDashboardInFlight) return launchDashboardInFlight;
    const work = (async () => {
        const config = store.get('config');
        if (!config || (!config.isConfigured && !hasRecoverablePersistedReplica(config))) {
            return { ok: false, error: 'not_configured', stage: 'persisted' };
        }
        const idleWithSources = Array.isArray(config.servers) && config.servers.length > 0 &&
            runtimeActivation.snapshot().phase === 'idle';
        if (!server || !server.listening || idleWithSources) {
            const boot = await bootServer(config, { deferHydrate: true });
            if (boot && (boot.failed || boot.blocked)) {
                return { ok: false, error: 'source_activation_failed', stage: 'activating' };
            }
        }
        if (!server || !server.listening) {
            return { ok: false, error: 'backend_not_listening', stage: 'activating' };
        }
        const dest = `http://127.0.0.1:${PORT}/`;
        try {
            await waitForDashboardNavigation(dest, 15000);
            return { ok: true, stage: 'ready' };
        } catch (e) {
            return {
                ok: false,
                error: String(e && e.message ? e.message : e),
                stage: 'navigating',
            };
        }
    })();
    launchDashboardInFlight = work;
    try {
        return await work;
    } finally {
        if (launchDashboardInFlight === work) launchDashboardInFlight = null;
    }
}

function probeLoopbackStatus(port, timeoutMs) {
    return new Promise((resolve) => {
        try {
            const req = http.get(
                { host: '127.0.0.1', port, path: '/api/status', timeout: timeoutMs },
                (res) => {
                    let body = '';
                    res.on('data', (chunk) => {
                        body += chunk;
                        if (body.length > 4096) res.destroy();
                    });
                    res.on('end', () => {
                        try {
                            resolve(JSON.parse(body));
                        } catch (_) {
                            resolve(null);
                        }
                    });
                }
            );
            req.on('error', () => resolve(null));
            req.on('timeout', () => {
                req.destroy();
                resolve(null);
            });
        } catch (_) {
            resolve(null);
        }
    });
}

async function peerEditionIsRunning() {
    const port = editionPolicy.otherEditionPort(PRODUCT_LINE);
    const st = await probeLoopbackStatus(port, 250);
    if (!st || typeof st !== 'object') return false;
    const line = String(st.productLine || '').trim().toLowerCase();
    if (line && editionPolicy.isV5ProductLine(line) !== editionPolicy.isV5ProductLine(PRODUCT_LINE)) return true;
    return st.status === 'online';
}

async function assertGameWritesAllowed() {
    if (await peerEditionIsRunning()) {
        return {
            ok: false,
            error:
                'The other Farm Dashboard (V4 or V5) is open. Close it before changing in-game mod settings.',
        };
    }
    return { ok: true };
}

async function maybeOfferClassicConfigImport() {
    if (!editionPolicy.isV5ProductLine(PRODUCT_LINE)) return;
    if (store.get('classicConfigImportedV1')) return;
    const cfg = store.get('config');
    if (cfg && cfg.isConfigured && Array.isArray(cfg.servers) && cfg.servers.length) {
        store.set('classicConfigImportedV1', true);
        return;
    }
    const classicStore = path.join(editionPolicy.siblingClassicUserDataDir(), 'config.json');
    const classicCfg = editionPolicy.readElectronStoreConfig(classicStore);
    const sanitized = editionPolicy.sanitizeClassicConfigForRf(classicCfg);
    if (!sanitized) {
        store.set('classicConfigImportedV1', true);
        return;
    }
    let response = 1;
    try {
        const box = await dialog.showMessageBox({
            type: 'question',
            buttons: ['Import saves', 'Start fresh'],
            defaultId: 0,
            cancelId: 1,
            title: 'Farm Dashboard V5',
            message: 'Import saves from Farm Dashboard V4?',
            detail:
                'Copies save names and folders only. Passwords, feed codes, and LAN access stay in V4. V5 uses its own profile and port 8768.',
        });
        response = box.response;
    } catch (_) {
        response = 1;
    }
    store.set('classicConfigImportedV1', true);
    if (response === 0) store.set('config', sanitized);
}

async function bootServer(config, options) {
    const deferHydrate = !!(options && options.deferHydrate);
    const claim = runtimeActivation.begin(config);
    if (claim.action !== "start") {
        return {
            registrationReady: claim.action === "noop",
            applied: claim.action === "noop",
            shared: claim.action === "share",
            scheduled: claim.action === "share",
            ownsCompletion: true,
            generation: claim.generation,
        };
    }
    const activationToken = claim.generation;
    const servers = config.servers || (config.mode ? [{
        id: 'srv_legacy', name: 'My Server', ...config
    }] : []);
    // Publish pending/removed bindings synchronously before old watchers are stopped.
    boundSources.beginActivation(servers, activationToken).forEach(broadcastSourceState);
    try {
    const activationOwns = () => runtimeActivation.owns(activationToken);
    await stopAllWatchers();
    if (!activationOwns()) {
        return { registrationReady: false, applied: false, superseded: true, ownsCompletion: true, generation: activationToken };
    }

    const ftpServers = servers.filter(s => s.mode === 'ftp');
    let registrationReady = false;
    let registrationWarning = {
        code: "configuration-required",
        at: new Date().toISOString(),
        message: "The FS25 profile could not be resolved. Replica registration will not be applied until the profile is available.",
    };
    try {
        const recoveryProfile = getFs25DocumentsRoot();
        if (!recoveryProfile) {
            console.warn("[Boot] replica registration profile is unavailable");
        } else {
            const recovered = replicaRegistration.reconcileRegistrationTransaction(recoveryProfile, servers);
            registrationReady = !!(recovered && recovered.ok);
            registrationWarning = registrationReady ? null : {
                code: "registration-recovery-required",
                at: new Date().toISOString(),
                message: "Replica registration recovery is unfinished. The dashboard will not apply that pending registration.",
            };
            if (!registrationReady) console.warn("[Boot] replica registration recovery required");
        }
    } catch (recoveryError) {
        registrationReady = false;
        registrationWarning = {
            code: "registration-recovery-required",
            at: new Date().toISOString(),
            message: "Replica registration recovery is unfinished. The dashboard will not apply that pending registration.",
        };
        console.warn("[Boot] replica registration recovery failed:", recoveryError && recoveryError.message ? recoveryError.message : recoveryError);
    }
    const replicaBlocked = (srv) => !!(srv && srv.replicaRegistration && !registrationReady);

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
            lastGoodMergedSnapshot: null,
            liveSectionBackup: null,
            configWarning: replicaBlocked(srv) ? registrationWarning : null,
            active: true,
            ingressGeneration: 0,
            readDebounceTimer: null,
            activationGeneration: activationToken,
        };
        if (boundSources.attach(srv.id, serverStates[srv.id], activationToken)) {
            const published = boundSources.snapshot(srv.id);
            broadcastSourceState({ type: 'source-state', serverId: String(srv.id),
                sourceBinding: published.sourceBinding });
        }
    });
    if (!activationOwns()) {
        return { registrationReady: false, applied: false, superseded: true, ownsCompletion: true, generation: activationToken };
    }

    // Plan v5 A5: surface localSubFolder mismatches as a one-time WARN + serverInfo.configWarning.
    // Only meaningful for local mode (FTP folder name is resolved later from save-slot probing).
    for (const srv of servers) {
        if (!srv || !isLocalModeServer(srv)) continue;
        if (srv.replicaRemoteSlot && !srv.replicaRegistration) {
            const unverified = serverStates[srv.id];
            if (unverified) {
                unverified.configWarning = {
                    code: 'registration-recovery-required',
                    at: new Date().toISOString(),
                    message: 'This replica has no app-side pairing. Recover it with a fresh game challenge before using its data.',
                };
                boundSources.clearOwned(unverified, 'blocked');
            }
            continue;
        }
        if (serverStates[srv.id] && serverStates[srv.id].configWarning && (serverStates[srv.id].configWarning.code === "registration-recovery-required" || serverStates[srv.id].configWarning.code === "configuration-required")) continue;
        // A paired replica is read from its registered replica directory, not
        // from the local authority save slot. Do not warn when that slot is absent.
        if (srv.replicaRegistration) continue;
        try {
            const { basePath, folderName } = resolveLocalWatchParts(srv);
            if (!folderName) {
                serverStates[srv.id].configWarning = {
                    code: 'localSubFolderMissing',
                    expected: basePath,
                    at: new Date().toISOString(),
                    message: 'Server has no localSubFolder configured. Set it to your savegame folder (e.g. savegame1).',
                };
                const blocked = boundSources.clearOwned(serverStates[srv.id], 'blocked');
                if (blocked?.changed) broadcastSourceState({ type: 'source-state', serverId: String(srv.id),
                    sourceBinding: blocked.sourceBinding });
                console.warn(`[livestock] folder mismatch serverId=${srv.id} expected: a folder under ${basePath}`);
                continue;
            }
            const slotPath = path.join(basePath, folderName);
            const ownedState = serverStates[srv.id];
            if (!(await pathExists(slotPath))) {
                if (!activationOwns() || serverStates[srv.id] !== ownedState) {
                    return { registrationReady: false, applied: false, superseded: true, ownsCompletion: true, generation: activationToken };
                }
                ownedState.configWarning = {
                    code: 'localSubFolderMissing',
                    expected: slotPath,
                    at: new Date().toISOString(),
                    message: `Configured local folder does not exist: ${slotPath}. Open the game once with the FarmDashboard mod to create it, or update the server's "Local folder" in settings.`,
                };
                const blocked = boundSources.clearOwned(ownedState, 'blocked');
                if (blocked?.changed) broadcastSourceState({ type: 'source-state', serverId: String(srv.id),
                    sourceBinding: blocked.sourceBinding });
                console.warn(`[livestock] folder mismatch serverId=${srv.id} expected=${slotPath}`);
            }
        } catch (e) {
            console.warn('[livestock] configWarning probe failed', srv && srv.id, e && e.message);
        }
        if (!activationOwns()) {
            return { registrationReady: false, applied: false, superseded: true, ownsCompletion: true, generation: activationToken };
        }
    }
    if (!activationOwns()) {
        return { registrationReady: false, applied: false, superseded: true, ownsCompletion: true, generation: activationToken };
    }

    // Restore last merged JSON from disk **before** HTTP accepts traffic so the first `/api/data` after
    // reopen is not `{ error: 'Waiting for data...' }` (which cleared the renderer). Large saves may
    // add a short delay before the port opens; that is preferable to an empty dashboard flash.
    servers.forEach((srv) => {
        if (srv && srv.mode === 'ftp') return;
        if (replicaBlocked(srv)) return;
        if (!activationOwns() || !serverStates[srv.id] || serverStates[srv.id].activationGeneration !== activationToken) return;
        try {
            hydrateServerCacheFromDisk(srv.id);
        } catch (e) {
            console.error('[bootServer] hydrate', srv.id, e);
        }
    });
    const hydrateLua = async () => {
        for (const srv of servers) {
            if (replicaBlocked(srv)) continue;
            if (!activationOwns() || !serverStates[srv.id] || serverStates[srv.id].activationGeneration !== activationToken) return;
            try {
                await hydrateLuaSnapshotFromDiskAtBoot(srv);
            } catch (e) {
                console.error('[bootServer] hydrate lua snapshot', srv.id, e);
            }
        }
    };

    const armRequiredWatchers = async () => {
        if (!activationOwns()) return { ok: false, superseded: true };
        const starts = [];
        for (const srv of servers) {
            if (!activationOwns() || !serverStates[srv.id] || serverStates[srv.id].activationGeneration !== activationToken) {
                return { ok: false, superseded: true };
            }
            if (replicaBlocked(srv) || !isLocalModeServer(srv)) continue;
            const ownedState = serverStates[srv.id];
            starts.push(Promise.resolve(startLocalWatching(srv)).then((outcome) => {
                const reported = outcome && outcome.status ? outcome : { status: "armed" };
                const current = runtimeActivation.matches(activationToken) && serverStates[srv.id] === ownedState && ownedState.active !== false;
                if (!current) {
                    disposeLocalWatcherState(ownedState);
                    return { status: "superseded" };
                }
                if (reported.status !== "superseded") {
                    runtimeActivation.noteSource(activationToken, String(srv.id), reported.attempt, reported.status);
                }
                return reported;
            }));
        }
        try {
            await Promise.all(starts);
        } catch (error) {
            if (!activationOwns()) return { ok: false, superseded: true };
            console.error("[bootServer] startLocalWatching", error && error.message ? error.message : error);
            return { ok: false, error: error && error.message ? error.message : "watcher-start-failed" };
        }
        if (!activationOwns()) return { ok: false, superseded: true };
        const statuses = starts.length ? await Promise.all(starts) : [];
        if (statuses.some((item) => item && item.status === "superseded") || !activationOwns()) {
            return { ok: false, superseded: true };
        }
        const retrying = statuses.find((item) => item && item.status === "retrying");
        if (retrying) return { ok: false, retrying: true, error: retrying.error || "watcher-start-failed" };
        const waiting = statuses.find((item) => item && item.status === "waiting");
        if (waiting) return { ok: false, waiting: true };
        return { ok: true };
    };

    const publishActivation = (watcherResult) => {
        if (!watcherResult || watcherResult.superseded || !runtimeActivation.matches(activationToken)) {
            return { registrationReady, applied: false, superseded: true, ownsCompletion: true, generation: activationToken };
        }
        if (watcherResult.retrying || watcherResult.waiting) {
            const waitingBlocked = servers.some((srv) => srv && srv.replicaRegistration) && !registrationReady;
            if (waitingBlocked) runtimeActivation.block(activationToken);
            const waitingView = runtimeActivation.syncAggregate(activationToken);
            return {
                registrationReady: registrationReady && !waitingBlocked,
                applied: waitingView.applied === true,
                retrying: !!watcherResult.retrying,
                waiting: !!watcherResult.waiting,
                blocked: waitingView.phase === "blocked",
                error: watcherResult.error || null,
                completionPending: waitingView.applied !== true,
                ownsCompletion: true,
                generation: activationToken,
            };
        }
        if (!watcherResult.ok && !watcherResult.retrying && !watcherResult.waiting) {
            if (activationOwns()) runtimeActivation.fail(activationToken, watcherResult.error || "watcher-start-failed");
            return { registrationReady, applied: false, failed: true, ownsCompletion: true, generation: activationToken };
        }
        const replicaBlockedConfig = servers.some((srv) => srv && srv.replicaRegistration) && !registrationReady;
        if (replicaBlockedConfig) runtimeActivation.block(activationToken);
        const view = runtimeActivation.syncAggregate(activationToken);
        return {
            registrationReady: registrationReady && !replicaBlockedConfig,
            applied: view.applied === true,
            retrying: !!watcherResult.retrying,
            waiting: !!watcherResult.waiting,
            blocked: view.phase === "blocked",
            error: watcherResult.error || null,
            completionPending: view.applied !== true,
            ownsCompletion: true,
            generation: activationToken,
        };
    };

    const openDashboard = () => {
        // Reloading http://127.0.0.1:8766 on every save-settings tears down the renderer (Settings modal open)
        // and often shows a blank/blue window until load completes — skip when already on this URL.
        if (shouldLoadDashboardUrl() && mainWindow) {
            void waitForDashboardNavigation(`http://127.0.0.1:${PORT}/`, 15000)
                .catch((e) => console.error('[bootServer] navigation', e));
        }
    };

    let remoteScheduled = false;
    const scheduleRemoteMonitoring = () => {
        if (!runtimeActivation.matches(activationToken) || remoteScheduled) return;
        remoteScheduled = true;
        try {
            startFtpPollingCoordinator(config, ftpServers);
            ftpServers.forEach((srv) => {
                runtimeActivation.noteSource(activationToken, String(srv.id), 1, "armed");
            });
        } catch (remoteError) {
            console.error("[bootServer] ftp coordinator failed:", remoteError && remoteError.message ? remoteError.message : remoteError);
            ftpServers.forEach((srv) => {
                runtimeActivation.noteSource(activationToken, String(srv.id), 1, "failed");
            });
        }
    };

    const runOwnedStartup = async () => {
        if (!activationOwns()) return { ok: false, superseded: true };
        scheduleRemoteMonitoring();
        if (!activationOwns()) return { ok: false, superseded: true };
        await hydrateLua();
        if (!activationOwns()) return { ok: false, superseded: true };
        const watchers = await armRequiredWatchers();
        if (runtimeActivation.matches(activationToken)) runtimeActivation.settleStartup(activationToken);
        return watchers;
    };

    if (!server || !server.listening) {
        listenFarmdashHttp(getLanBindAddress(), openDashboard);
    } else {
        openDashboard();
    }

    runtimeActivation.setReadyContinuation(activationToken, () => {
        try {
            startVanillaFillTypeHudWarmup();
        } catch (warmupError) {
            console.error("[bootServer] optional warmup failed:", warmupError);
        }
    });
    const requiredRows = [];
    servers.forEach((srv) => {
        if (!srv || srv.id == null) return;
        if (srv.mode === "ftp") {
            requiredRows.push({ id: String(srv.id), status: "pending" });
            return;
        }
        if (isLocalModeServer(srv)) {
            requiredRows.push({ id: String(srv.id), status: replicaBlocked(srv) ? "blocked" : "pending" });
        }
    });
    runtimeActivation.bindSources(activationToken, requiredRows);

    if (deferHydrate) {
        setImmediate(() => runOwnedStartup().then(publishActivation).catch((error) => {
            if (activationOwns()) runtimeActivation.fail(activationToken, error);
            console.error("[bootServer] deferred startup failed:", error && error.message ? error.message : error);
        }));
        return {
            registrationReady,
            applied: false,
            scheduled: true,
            completionPending: true,
            ownsCompletion: true,
            generation: activationToken,
        };
    }

    return publishActivation(await runOwnedStartup());
    } catch (bootError) {
        if (runtimeActivation.owns(activationToken)) runtimeActivation.fail(activationToken, bootError);
        console.error("[bootServer]", bootError);
        return {
            registrationReady: false,
            applied: false,
            failed: true,
            ownsCompletion: true,
            generation: activationToken,
        };
    }
}

/** Same persistence + boot as ipcMain save-settings — used by POST /api/setup-config (tablet / browser on LAN). */
async function applyFarmdashSetupConfig(newConfig, options) {
    const adoption = options && options.adoption;
    const prev = store.get('config') || {};
    const resolved = resolveServersForSave(prev.servers, newConfig.servers);
    if (resolved.keptExisting) {
        console.warn('[save-settings] ignored empty servers list; kept existing saves');
    }
    const merged = {
        ...prev,
        ...newConfig,
        servers: resolved.servers,
    };
    const previousTrusted = new Map((Array.isArray(prev.servers) ? prev.servers : [])
        .filter((row) => row && row.replicaRegistration)
        .map((row) => [String(row.id), row]));
    const changedReplicaRows = merged.servers.filter((row) => {
        if (!row || (!row.replicaRemoteSlot && !row.replicaRegistration)) return false;
        const before = previousTrusted.get(String(row.id));
        return !before;
    });
    if (changedReplicaRows.length && !adoption) {
        const approved = options && options.approvedPendingReplica;
        if (changedReplicaRows.length !== 1 || !approved ||
            String(changedReplicaRows[0].id) !== String(approved.id) ||
            String(changedReplicaRows[0].replicaRemoteSlot || '') !== String(approved.replicaRemoteSlot || '') ||
            JSON.stringify(changedReplicaRows[0].replicaRegistration) !== JSON.stringify(approved.replicaRegistration)) {
            throw new Error('replica-proof-required');
        }
    }
    if (newConfig.ftpPolling) {
        merged.ftpPolling = { ...(prev.ftpPolling || {}), ...newConfig.ftpPolling };
    }
    const profile = getFs25DocumentsRoot();
    if (profile && !adoption) {
        const reconciled = replicaRegistration.reconcileRegistrationTransaction(profile, prev.servers);
        if (!reconciled || reconciled.ok !== true) {
            const pending = new Error("recovery-required");
            pending.restoreError = reconciled && reconciled.restoreError;
            throw pending;
        }
    }
    const nextRegistration = replicaRegistration.validateSnapshot(merged.servers);
    if (!nextRegistration.ok) {
        throw new Error(nextRegistration.error || "invalid-registration");
    }
    const registrationUnchanged = replicaRegistration.sameRegistration(prev.servers, merged.servers);
    if (adoption && (!profile || adoption.profileDir !== profile || registrationUnchanged ||
        JSON.stringify(nextRegistration.rows) !== JSON.stringify(adoption.rows))) {
        throw new Error("changed");
    }
    let published = adoption || null;
    if (!registrationUnchanged && !adoption) {
        if (!profile) throw new Error("registration-profile-missing");
        try {
            published = replicaRegistration.publishReplicaRegistration(profile, merged.servers);
        } catch (registrationError) {
            throw new Error(registrationError && registrationError.message ? registrationError.message : "registration-failed");
        }
        if (!published || published.ok !== true) {
            throw new Error((published && published.error) || "registration-failed");
        }
    }
    try {
        store.set('config', merged);
    } catch (storeError) {
        if (published) {
            const restored = replicaRegistration.restoreRegistrationPublication(published);
            if (!restored || restored.ok !== true) {
                const recovery = new Error(`recovery-required: ${storeError && storeError.message ? storeError.message : "store-failed"}; ${restored && restored.error ? restored.error : "rollback-failed"}`);
                recovery.storeError = storeError && storeError.message ? storeError.message : "store-failed";
                recovery.restoreError = restored && restored.error;
                throw recovery;
            }
        }
        throw storeError;
    }
    if (published) {
        const committed = replicaRegistration.commitRegistrationPublication(published);
        if (!committed || committed.ok !== true) {
            if (committed && committed.error === "cleanup-pending") {
                runtimeActivation.markUnapplied(merged);
                return {
                    ok: true,
                    rebooted: false,
                    recoveryPending: true,
                    saveState: "saved-with-recovery-pending",
                    keptExisting: resolved.keptExisting,
                };
            }
            return {
                ok: false,
                error: (committed && committed.error) || "recovery-required",
                recoveryPending: true,
                rebooted: false,
                keptExisting: resolved.keptExisting,
            };
        }
    }
    const activationPreview = runtimeActivation.preview(merged);
    const restart = configNeedsServerReboot(prev, merged);
    if (activationPreview.action === "share") {
        return { ok: true, rebooted: true, scheduled: true, shared: true, keptExisting: resolved.keptExisting };
    }
    if (activationPreview.action === "noop" || (!restart && activationPreview.phase === "idle")) {
        return { ok: true, rebooted: false, keptExisting: resolved.keptExisting };
    }
    // Persist already happened. Do not await Lua hydrate of every save on the IPC thread —
    // that hung Settings Save, and pairing it with a LAN HTTP restart deadlocked keep-alive.
    try {
        const bootResult = bootServer(merged, { deferHydrate: true });
        if (bootResult && typeof bootResult.then === "function") {
            bootResult.then(() => {}, (error) => {
                console.error("[bootServer]", error);
            });
            return { ok: true, rebooted: true, scheduled: true, applied: false, keptExisting: resolved.keptExisting };
        }
        const claim = runtimeActivation.begin(merged);
        if (claim.action === "start") runtimeActivation.complete(claim.generation);
        return { ok: true, rebooted: true, keptExisting: resolved.keptExisting };
    } catch (bootError) {
        console.error("[bootServer]", bootError);
        const claim = runtimeActivation.begin(merged);
        if (claim.action === "start") runtimeActivation.fail(claim.generation, bootError);
        return {
            ok: true,
            rebooted: false,
            recoveryPending: true,
            saveState: "saved-with-activation-pending",
            keptExisting: resolved.keptExisting,
        };
    }
}

// ── Electron window ───────────────────────────────────────────────────────────

/** Hidden Edit menu enables Ctrl+C/V/X/A; context menu adds right-click paste on inputs. */
let editApplicationMenuInstalled = false;

function ensureEditApplicationMenu() {
    if (editApplicationMenuInstalled) return;
    editApplicationMenuInstalled = true;
    const editSubmenu = [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
    ];
    const template = process.platform === 'darwin'
        ? [{ role: 'editMenu' }]
        : [{ label: 'Edit', submenu: editSubmenu }];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function attachEditContextMenu(webContents) {
    if (!webContents || webContents.isDestroyed()) return;
    webContents.on('context-menu', (_event, params) => {
        const win = BrowserWindow.fromWebContents(webContents);
        const template = [];
        if (params.isEditable) {
            template.push(
                { role: 'cut', enabled: params.editFlags.canCut },
                { role: 'copy', enabled: params.editFlags.canCopy },
                { role: 'paste', enabled: params.editFlags.canPaste },
                { type: 'separator' },
                { role: 'selectAll', enabled: params.editFlags.canSelectAll }
            );
        } else if (params.selectionText) {
            template.push({ role: 'copy', enabled: params.editFlags.canCopy });
        }
        if (template.length === 0) return;
        Menu.buildFromTemplate(template).popup({ window: win });
    });
}

function createWindow() {
    ensureSetupWriteToken();
    const winTitle = editionPolicy.windowTitle({
        productLine: PRODUCT_LINE,
        isDev: FARMDASH_DEV,
        port: PORT,
    });
    mainWindow = new BrowserWindow({
        width: 1400, height: 900,
        title: winTitle,
        backgroundColor: '#0f172a',
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
            webSecurity: true,
        },
    });

    attachEditContextMenu(mainWindow.webContents);

    mainWindow.webContents.on('render-process-gone', (_event, details) => {
        console.error('[render-process-gone]', details.reason, details.exitCode);
    });
    mainWindow.webContents.on('unresponsive', () => {
        console.warn('[webContents unresponsive]');
    });

    const config = store.get('config');
    if (isRfProductLine() && !config?.isConfigured) {
        try {
            const expectedProfile = path.join(os.homedir(), 'AppData', 'Roaming',
                editionPolicy.profileDirName(PRODUCT_LINE, FARMDASH_DEV));
            const expectedConfig = path.join(expectedProfile, 'config.json');
            if (fs.existsSync(expectedConfig)) {
                const report = {
                    productLine: PRODUCT_LINE,
                    appVersion: app.getVersion(),
                    pid: process.pid,
                    storePath: store.path,
                    sessionUserDataDir: SESSION_USER_DATA_DIR,
                    appUserDataDir: app.getPath('userData'),
                    appDataEnv: process.env.APPDATA || null,
                    hasUserDataSwitch: !!app.commandLine?.hasSwitch('user-data-dir'),
                    explicitUserDataArg: process.argv.some((arg) => /^--user-data-dir(?:=|$)/i.test(arg)),
                    expectedConfig,
                    expectedConfigBytes: fs.statSync(expectedConfig).size,
                };
                fs.writeFileSync(path.join(os.tmpdir(), `FarmDashProfileDiagnostic-${process.pid}.json`),
                    JSON.stringify(report, null, 2), { encoding: 'utf8', mode: 0o600 });
            }
        } catch (error) {
            console.warn('[ProfileDiagnostic] unable to record path evidence', error?.message || error);
        }
    }
    const recoverLinked = !config?.isConfigured && Array.isArray(config?.servers) &&
        config.servers.length > 0 && hasRecoverablePersistedReplica(config);
    if (config?.isConfigured || recoverLinked) {
        void bootServer(config).catch((e) => console.error('[bootServer]', e));
    } else {
        // Vite's root-relative assets require HTTP; loadFile leaves a fresh V5 window blank.
        const opts = getSetupLoadOptions();
        if (shouldServeNewUi() || isRfProductLine()) {
            const showNewUiSetup = () => {
                if (mainWindow && !mainWindow.isDestroyed()) loadSetupWindow();
            };
            if (!server || !server.listening) {
                listenFarmdashHttp(getLanBindAddress(), showNewUiSetup);
            } else {
                showNewUiSetup();
            }
            return;
        }
        // Classic V4 setup can still open immediately from disk.
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

let gotSingleInstanceLock = true;
if (FARMDASH_DEV) {
    console.log('[dev] FARMDASH_DEV=1 — running alongside installed app (port ' + PORT + ')');
} else {
    gotSingleInstanceLock = app.requestSingleInstanceLock({ productLine: PRODUCT_LINE });
    if (!gotSingleInstanceLock) {
        app.quit();
    } else {
        app.on('second-instance', () => {
            if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
            }
        });
    }
}

if (gotSingleInstanceLock) {
    app.whenReady().then(async () => {
        if (FARMDASH_DEV) {
            console.log('[dev] userData:', SESSION_USER_DATA_DIR);
            console.log('[dev] Open http://127.0.0.1:' + PORT + '/ (installed demo can stay on 8766)');
        }
        await consumeInstallLocaleFile();
        await maybeOfferClassicConfigImport();
        ensureEditApplicationMenu();
        app.on('web-contents-created', (_event, contents) => {
            contents.on('will-navigate', (event, navUrl) => {
                try {
                    const u = new URL(navUrl);
                    const ok = editionPolicy.isTrustedDashboardIpcUrl(u.href, { port: PORT, appDirectory: __dirname });
                    if (!ok) event.preventDefault();
                } catch (_) {
                    event.preventDefault();
                }
            });
            contents.on('will-redirect', (event, navUrl) => {
                if (!editionPolicy.isTrustedDashboardIpcUrl(navUrl, { port: PORT, appDirectory: __dirname })) event.preventDefault();
            });
            contents.setWindowOpenHandler(() => ({ action: 'deny' }));
        });
        createWindow();
        initAppUpdater(
            () => mainWindow,
            () => {
                const l = store.get('locale');
                return l && typeof l === 'string' ? l : 'en';
            }
        );
        
    });
}
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

function setupSaveOutcome(result) {
    if (result && result.ok === false) {
        return { ok: false, error: result.error || "recovery-required", recoveryPending: true };
    }
    const saveState = result && result.recoveryPending ? "saved-with-recovery-pending" : "saved";
    // Events describe the configuration that was just replaced. A successful save is not an error code.
    if (saveState === "saved") uxEventLog.clear();
    return { ok: true, saveState, ...result };
}

registerTrustedHandle('save-settings', async (_event, newConfig) => {
    try {
        return setupSaveOutcome(await applyFarmdashSetupConfig(newConfig));
    } catch (e) {
        console.error('[save-settings]', e);
        return { ok: false, error: String(e && e.message ? e.message : e) };
    }
});

// "Link this server?" — the joined game writes one pending record; approval publishes a replica source row.
const declinedPendingIds = new Set();

async function pendingReplicaState() {
    const profile = getFs25DocumentsRoot();
    const read = await pendingReplicaSession.readPendingSession(profile);
    if (read.state !== 'pending') return { read, view: { state: read.state, error: read.error || null } };
    if (declinedPendingIds.has(read.session.pendingId)) return { read, view: { state: 'declined' } };
    const servers = (store.get('config') || {}).servers || [];
    const linked = servers.find((s) => s && s.replicaRegistration && s.replicaRegistration.sessionPairing === read.session.serverKey);
    if (linked) return { read, view: { state: 'linked', sourceId: String(linked.id), session: pendingReplicaSession.publicView(read.session) } };
    return { read, view: { state: 'pending', session: pendingReplicaSession.publicView(read.session) } };
}

registerTrustedHandle('get-pending-replica-session', async () => {
    try {
        return (await pendingReplicaState()).view;
    } catch (_e) {
        return { state: 'unavailable' };
    }
});

registerTrustedHandle('approve-pending-replica-session', async (_event, pendingId) => {
    try {
        const { read, view } = await pendingReplicaState();
        if (view.state !== 'pending' || read.session.pendingId !== pendingId) {
            return { ok: false, error: view.state === 'pending' ? 'changed' : view.state };
        }
        const prev = store.get('config') || {};
        const built = pendingReplicaSession.approvedServerRow(read.session, getFs25DocumentsRoot(), prev.servers);
        if (!built.ok) return { ok: false, error: built.error };
        const servers = Array.isArray(prev.servers) ? prev.servers.slice() : [];
        servers.push(built.row);
        const outcome = setupSaveOutcome(await applyFarmdashSetupConfig({ servers, isConfigured: true }, { approvedPendingReplica: built.row }));
        if (!outcome || outcome.ok !== true) return { ok: false, error: (outcome && outcome.error) || 'save-failed' };
        return { ok: true, sourceId: built.row.id, name: built.row.name };
    } catch (e) {
        const message = String(e && e.message ? e.message : e);
        return { ok: false, error: message.startsWith('recovery-required') ? 'recovery-required' : message };
    }
});

registerTrustedHandle('decline-pending-replica-session', async (_event, pendingId) => {
    if (typeof pendingId === 'string' && /^[0-9a-f]{16}$/.test(pendingId)) declinedPendingIds.add(pendingId);
    return { ok: true };
});

// Retained registration/trust can offer recovery, but only the currently loaded game can
// answer a fresh key-bound challenge. The renderer never receives the trust key or token.
const orphanOfferState = { offer: null };
async function orphanReplicaState() {
    const profile = getFs25DocumentsRoot();
    const pending = await pendingReplicaSession.readPendingSession(profile);
    if (pending.state !== 'none') {
        if (orphanOfferState.offer && orphanOfferState.offer.challenge) {
            replicaRegistration.retireRecoveryChallenge(profile, orphanOfferState.offer.challenge);
        }
        orphanOfferState.offer = null;
        return { view: { state: 'none' } };
    }
    const servers = (store.get('config') || {}).servers || [];
    const candidate = replicaRegistration.detectOrphanLinkedSource(profile, servers);
    if (!candidate.ok) {
        if (orphanOfferState.offer && orphanOfferState.offer.challenge) {
            replicaRegistration.retireRecoveryChallenge(profile, orphanOfferState.offer.challenge);
        }
        orphanOfferState.offer = null;
        return { view: { state: 'none' } };
    }
    const fingerprint = `${candidate.revision}:${candidate.digest}:${candidate.sourceId}:${candidate.remoteSlot}`;
    if (!orphanOfferState.offer || orphanOfferState.offer.fingerprint !== fingerprint) {
        if (orphanOfferState.offer && orphanOfferState.offer.challenge) {
            replicaRegistration.retireRecoveryChallenge(profile, orphanOfferState.offer.challenge);
        }
        orphanOfferState.offer = { id: crypto.randomBytes(16).toString('hex'), fingerprint, challenge: null, challengeId: null };
    }
    let state = 'offer';
    let error = null;
    if (orphanOfferState.offer.challenge) {
        const proof = replicaRegistration.verifyRecoveryChallenge(profile, candidate, orphanOfferState.offer.challenge);
        if (proof.ok) state = 'verified';
        else if (proof.error === 'waiting') state = 'waiting';
        else {
            error = proof.error;
            replicaRegistration.retireRecoveryChallenge(profile, orphanOfferState.offer.challenge);
            orphanOfferState.offer.challenge = null;
            orphanOfferState.offer.challengeId = null;
        }
    }
    return {
        candidate,
        view: {
            state,
            ...(error ? { error } : {}),
            ...(orphanOfferState.offer.challengeId ? { challengeId: orphanOfferState.offer.challengeId } : {}),
            offer: { offerId: orphanOfferState.offer.id, sourceId: candidate.sourceId, sourceSlot: candidate.remoteSlot },
        },
    };
}

registerTrustedHandle('get-orphan-replica-recovery', async () => {
    try { return (await orphanReplicaState()).view; }
    catch (_) { return { state: 'none' }; }
});

registerTrustedHandle('start-orphan-replica-challenge', async (_event, offerId) => {
    try {
        const state = await orphanReplicaState();
        if (!state.candidate || !orphanOfferState.offer || orphanOfferState.offer.id !== offerId) {
            return { ok: false, error: 'changed' };
        }
        if (orphanOfferState.offer.challenge) {
            replicaRegistration.retireRecoveryChallenge(getFs25DocumentsRoot(), orphanOfferState.offer.challenge);
            orphanOfferState.offer.challenge = null;
            orphanOfferState.offer.challengeId = null;
        }
        const started = replicaRegistration.startRecoveryChallenge(getFs25DocumentsRoot(), state.candidate);
        if (!started.ok) return { ok: false, error: started.error };
        orphanOfferState.offer.challenge = started.challenge;
        orphanOfferState.offer.challengeId = crypto.randomBytes(16).toString('hex');
        return { ok: true, challengeId: orphanOfferState.offer.challengeId };
    } catch (_) { return { ok: false, error: 'unavailable' }; }
});

registerTrustedHandle('cancel-orphan-replica-challenge', async (_event, offerId, challengeId) => {
    if (orphanOfferState.offer && orphanOfferState.offer.id === offerId) {
        if (orphanOfferState.offer.challenge) {
            if (challengeId !== orphanOfferState.offer.challengeId) return { ok: false, error: 'changed' };
            replicaRegistration.retireRecoveryChallenge(getFs25DocumentsRoot(), orphanOfferState.offer.challenge);
        }
        orphanOfferState.offer.challenge = null;
        orphanOfferState.offer.challengeId = null;
    }
    return { ok: true };
});

registerTrustedHandle('restore-orphan-replica', async (_event, offerId, challengeId) => {
    try {
        if (typeof offerId !== 'string' || !/^[a-f0-9]{32}$/.test(offerId)) return { ok: false, error: 'changed' };
        const state = await orphanReplicaState();
        if (!state.candidate || !orphanOfferState.offer || orphanOfferState.offer.id !== offerId) {
            return { ok: false, error: 'changed' };
        }
        if (challengeId !== orphanOfferState.offer.challengeId) return { ok: false, error: 'changed' };
        if (state.view.state !== 'verified' || !orphanOfferState.offer.challenge) {
            return { ok: false, error: 'proof-required' };
        }
        const profile = getFs25DocumentsRoot();
        const prev = store.get('config') || {};
        const adoption = replicaRegistration.beginOrphanAdoption(profile, prev.servers || [], state.candidate, orphanOfferState.offer.challenge);
        if (!adoption.ok) return { ok: false, error: adoption.error || 'recovery-required' };
        replicaRegistration.retireRecoveryChallenge(profile, orphanOfferState.offer.challenge);
        orphanOfferState.offer = null;
        const servers = [...(prev.servers || []), adoption.row];
        const outcome = setupSaveOutcome(await applyFarmdashSetupConfig({ servers, isConfigured: true }, { adoption }));
        if (!outcome || outcome.ok !== true) return { ok: false, error: (outcome && outcome.error) || 'save-failed' };
        orphanOfferState.offer = null;
        return { ok: true, sourceId: adoption.row.id };
    } catch (e) {
        const message = String(e && e.message ? e.message : e);
        return { ok: false, error: message.startsWith('recovery-required') ? 'recovery-required' : 'save-failed' };
    }
});

registerTrustedHandle('launch-dashboard', async (event) => {
    try {
        return await launchDashboardFromIpc(event);
    } catch (e) {
        console.error('[launch-dashboard]', e);
        return { ok: false, error: String(e && e.message ? e.message : e), stage: 'failed' };
    }
});

function currentConfigForRenderer() {
    const config = store.get('config');
    return config && typeof config === 'object' ? redactConfigSecrets(config) : config;
}

registerTrustedHandle('get-current-config', () => currentConfigForRenderer());

/** Fallback when HTTP `/api/status` is unreachable — read default local `data.json` (same path logic as former `fs` in renderer). */
registerTrustedHandle('read-local-farmdash-data-json', async () => {
    try {
        const bases = collectFarmDashboardModSettingsRoots(getElectronDocumentsPath);
        for (const base of bases) {
            try {
                await fs.promises.access(base);
            } catch {
                continue;
            }
            let folders;
            try {
                folders = await fs.promises.readdir(base, { withFileTypes: true });
            } catch {
                continue;
            }
            for (const dirent of folders) {
                if (!dirent.isDirectory()) continue;
                const p = path.join(base, dirent.name, 'data.json');
                try {
                    await fs.promises.access(p);
                } catch {
                    continue;
                }
                const raw = await readFileUtf8WithRetryAsync(p);
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

/** Renderer fallback obeys the same pre-ingress identity gate as boot hydration. */
function readServerLiveCacheForRenderer(serverId) {
    try {
        if (serverId == null || serverId === '') {
            return { ok: false, error: 'server_id_required' };
        }
        const sid = String(serverId);
        const srv = getServersFromStore().find((s) => String(s.id) === sid);
        if (srv && srv.mode === 'ftp') {
            return { ok: false, error: 'ftp_requires_fresh', serverId: sid };
        }
        if (isExplicitReplicaXmlSource(srv, serverStates[sid]?.ingressKind)) {
            return { ok: false, error: 'replica_requires_fresh_lua', serverId: sid };
        }
        const record = loadServerCache(SESSION_USER_DATA_DIR, sid);
        if (!record || !record.mergedSnapshot || typeof record.mergedSnapshot !== 'object') {
            return { ok: false, error: 'not_found', serverId: sid };
        }
        if (!localCacheSourceEligible(srv, serverStates[sid], record)) {
            return { ok: false, error: 'source_unconfirmed', serverId: sid };
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
}
registerTrustedHandle('read-server-live-cache', (_event, serverId) => readServerLiveCacheForRenderer(serverId));

registerTrustedHandle('get-lan-access-settings', () => ({ ...getLanSecurityFromStore() }));

registerTrustedHandle('save-lan-access-settings', (_e, payload) => {
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
    const prevBind = getLanBindAddress();
    store.set('lanAccessPrevious', { ...getLanSecurityFromStore() });
    store.set('lanAccessEnabled', !!payload?.lanAccessEnabled);
    store.set('lanUsername', String(payload?.lanUsername ?? LAN_ACCESS_DEFAULTS.lanUsername));
    store.set('lanPassword', String(payload?.lanPassword ?? LAN_ACCESS_DEFAULTS.lanPassword));
    store.set('lanAllowedIPs', String(payload?.lanAllowedIPs ?? '').trim());
    store.set('lanAuthOptional', !!payload?.lanAuthOptional);
    refreshLanSecurityCache();
    rotateLanWsSecret('lan_credentials_changed');
    const enabled = !!payload?.lanAccessEnabled;
    const nextBind = getLanBindAddress();
    pushUxEvent(
        enabled ? 'LAN_EXPOSED' : 'LAN_LOCAL',
        enabled ? 'LAN access enabled (HTTP rebound)' : 'LAN access off (localhost only)',
        'lan'
    );
    if (prevBind === nextBind) {
        return Promise.resolve({
            ok: true,
            bind: nextBind,
            saveState: 'synced',
            restarted: false,
        });
    }
    return new Promise((resolve) => {
        restartHttpServer(() => {
            resolve({
                ok: true,
                bind: getLanBindAddress(),
                saveState: 'synced',
                restarted: true,
            });
        });
    });
});

registerTrustedHandle('get-setup-status', () => buildRuntimeSetupStatus({ setupTokenValid: true }));

registerTrustedHandle('run-setup-handshake', async () => runSetupHandshake(true));

registerTrustedHandle('restore-lan-defaults', () => {
    const prev = store.get('lanAccessPrevious');
    const target = prev && typeof prev === 'object'
        ? {
            lanAccessEnabled: false,
            lanUsername: String(prev.lanUsername || LAN_ACCESS_DEFAULTS.lanUsername),
            lanPassword: String(prev.lanPassword || store.get('lanPassword') || LAN_ACCESS_DEFAULTS.lanPassword),
            lanAllowedIPs: String(prev.lanAllowedIPs || ''),
            lanAuthOptional: false,
        }
        : {
            lanAccessEnabled: false,
            lanUsername: LAN_ACCESS_DEFAULTS.lanUsername,
            lanPassword: store.get('lanPassword') || LAN_ACCESS_DEFAULTS.lanPassword,
            lanAllowedIPs: '',
            lanAuthOptional: false,
        };
    store.set('lanAccessEnabled', false);
    store.set('lanUsername', target.lanUsername);
    store.set('lanPassword', target.lanPassword);
    store.set('lanAllowedIPs', target.lanAllowedIPs);
    store.set('lanAuthOptional', false);
    refreshLanSecurityCache();
    rotateLanWsSecret('lan_restored_defaults');
    pushUxEvent('LAN_LOCAL', 'LAN restored to local-only default', 'lan');
    return new Promise((resolve) => {
        restartHttpServer(() => {
            resolve({ ok: true, bind: getLanBindAddress(), lan: { ...getLanSecurityFromStore() } });
        });
    });
});

registerTrustedHandle('get-desktop-app-version', () => app.getVersion());

registerTrustedHandle('check-desktop-app-updates', () => checkForUpdatesNow());


registerTrustedHandle('get-stored-locale', () => {
    const l = store.get('locale');
    return l && typeof l === 'string' ? l : 'en';
});

registerTrustedHandle('get-translations-json', async () => {
    const p = path.join(__dirname, 'web', 'locales', 'translations.json');
    try {
        await fs.promises.access(p);
        const raw = await fs.promises.readFile(p, 'utf8');
        return JSON.parse(stripUtf8Bom(raw));
    } catch (e) {
        if (e && e.code === 'ENOENT') {
            console.error('[get-translations-json] missing file:', p);
        } else {
            console.error('[get-translations-json]', e.message);
        }
        return { strings: {} };
    }
});

registerTrustedEvent('set-stored-locale', (_e, code) => {
    if (typeof code === 'string' && VALID_LOCALE_RE.test(code.substring(0, 2))) {
        store.set('locale', code.substring(0, 2).toLowerCase());
    }
});

registerTrustedEvent('reset-settings', () => {
    store.delete('config');
    app.relaunch();
    app.exit();
});

registerTrustedEvent('open-setup', () => {
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
        productions: true,
        storage: true
    },
    excludedFarmlandIdsByServer: {},
    fieldClusterPrefsByServer: {},
    /** Opt-in only on V4. V5 ignores this and always serves NEW APP. */
    useNewUi: false,
    /** overview | last | section id — NEW APP open preference */
    defaultSection: 'last',
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

registerTrustedHandle('get-ui-preferences', () => {
    const u = store.get('uiPreferences') || {};
    const rf = isRfProductLine();
    return {
        sections: { ...DEFAULT_UI_PREFS.sections, ...(u.sections || {}) },
        excludedFarmlandIdsByServer: normalizeExcludedFarmlandIdsMap(u.excludedFarmlandIdsByServer),
        fieldClusterPrefsByServer: normalizeFieldClusterPrefs(u.fieldClusterPrefsByServer),
        simHubView: normalizeSimHubView(u.simHubView),
        useNewUi: rf ? true : (u.useNewUi !== undefined ? u.useNewUi === true : DEFAULT_UI_PREFS.useNewUi === true),
        newUiLocked: rf,
        productLine: readPackagedProductLine(),
        defaultSection: typeof u.defaultSection === 'string' && u.defaultSection
            ? String(u.defaultSection)
            : DEFAULT_UI_PREFS.defaultSection,
    };
});


registerTrustedHandle('save-ui-preferences', (_e, prefs) => {
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
    const rfLine = isRfProductLine();
    const useNewUi = rfLine
        ? true
        : (prefs?.useNewUi !== undefined
            ? prefs.useNewUi === true
            : (prev.useNewUi !== undefined ? prev.useNewUi === true : DEFAULT_UI_PREFS.useNewUi === true));
    const defaultSection =
        prefs?.defaultSection !== undefined
            ? String(prefs.defaultSection || 'last')
            : (typeof prev.defaultSection === 'string' && prev.defaultSection
                ? String(prev.defaultSection)
                : DEFAULT_UI_PREFS.defaultSection);
    const merged = {
        sections: { ...DEFAULT_UI_PREFS.sections, ...(prefs?.sections || {}) },
        excludedFarmlandIdsByServer: mergedEx,
        fieldClusterPrefsByServer: mergedCl,
        simHubView: mergedSh,
        useNewUi,
        defaultSection,
    };
    store.set('uiPreferences', merged);
    if (JSON.stringify(prevEx) !== JSON.stringify(mergedEx)) {
        for (const [sid, state] of Object.entries(serverStates)) {
            if (state?.mergedData) broadcast(sid, state.mergedData, state);
        }
    }
    const restartRequired = !rfLine && prefs?.useNewUi !== undefined && prefs.useNewUi !== (prev.useNewUi === true);
    return { ok: true, useNewUi, restartRequired };
});

registerTrustedHandle('set-simhub-live-context', (_e, payload) => {
    try {
        const context = applySimHubLiveContextPatch(payload || {});
        return { ok: true, context };
    } catch (e) {
        console.error('[set-simhub-live-context]', e);
        return { ok: false, error: String(e.message || e) };
    }
});

/** For Dashboard Settings: list owned fields only (same farm as the dashboard farm selector). */
registerTrustedHandle('get-field-exclusion-options', (_e, payload) => {
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

const { handleGetModConfig, handleSaveModConfig } = require('./modConfigXml');

registerTrustedHandle('get-mod-config', async () => {
    return handleGetModConfig(getModConfigPath(), {
        pathExists,
        readFile: readFileUtf8WithRetryAsync,
    });
});

registerTrustedHandle('save-mod-config', async (_e, cfg) => {
    try {
        return await handleSaveModConfig(getModConfigPath(), cfg, { assertGameWritesAllowed });
    } catch (e) {
        return { ok: false, error: e.message };
    }
});

function profileRootForDashboard(basePath) {
    const listed = typeof collectFs25DocumentRoots === 'function'
        ? collectFs25DocumentRoots(getElectronDocumentsPath)
        : [];
    const roots = Array.isArray(listed) ? listed : [];
    for (const fs25 of roots) {
        if (!fs25 || typeof fs25 !== 'string') continue;
        const expected = path.join(fs25, 'modSettings', 'FS25_FarmDashboard');
        if (sameResolvedDirectory(basePath, expected)) return fs25;
    }
    return null;
}

function discoveryLabel(value) {
    const text = String(value || '').trim();
    return text || null;
}

async function scanLocalSaves() {
    /**
     * FS25 + mod write under .../modSettings/FS25_FarmDashboard/<slot>/.
     * Each collected dashboard root stays tied to the document profile that owns it.
     */
    const roots = collectFarmDashboardModSettingsRoots(getElectronDocumentsPath);
    const foundSaves = [];
    const seenDirs = new Set();
    const searchedRoots = [];
    const missingRoots = [];
    const keyForRoot = (dir) => path.normalize(dir).replace(/[\\/]+/g, '/').replace(/\/+$/g, '').toLowerCase();
    const rootsWithSources = new Set();
    const blockedRoots = new Set();

    for (const basePath of roots) {
        searchedRoots.push(basePath);
        if (!(await pathExists(basePath))) {
            missingRoots.push(basePath);
            console.log('[scan-local-saves] (skip missing)', basePath);
            continue;
        }
        let folders;
        try {
            folders = await fs.promises.readdir(basePath, { withFileTypes: true });
        } catch (e) {
            console.warn('[scan-local-saves] readdir', basePath, e.message);
            blockedRoots.add(keyForRoot(basePath));
            continue;
        }
        let registeredSlots = null;
        let registrationBlocked = false;
        const registrationPath = path.join(basePath, 'replicaSources.xml');
        try {
            const registrationText = await fs.promises.readFile(registrationPath, 'utf8');
            const parsedRegistration = replicaRegistration.parseRegistrationDocument(registrationText);
            if (parsedRegistration && parsedRegistration.ok && Array.isArray(parsedRegistration.rows)) {
                registeredSlots = new Map(parsedRegistration.rows.map((row) => [row.sourceId, row.remoteSlot]));
            } else {
                registrationBlocked = true;
            }
        } catch (error) {
            if (!error || error.code !== 'ENOENT') {
                registrationBlocked = true;
                console.warn('[scan-local-saves] registration unreadable', error && error.code ? error.code : 'failed');
            }
        }
        const rootKey = keyForRoot(basePath);
        const candidates = [];
        for (const dirent of folders) {
            if (!dirent.isDirectory() || dirent.name === 'replicas') continue;
            candidates.push({ dirPath: path.join(basePath, dirent.name), folderName: dirent.name, kind: 'slot' });
        }
        const replicaRoot = path.join(basePath, 'replicas');
        if (await pathExists(replicaRoot)) {
            let replicaFolders = [];
            try {
                replicaFolders = await fs.promises.readdir(replicaRoot, { withFileTypes: true });
            } catch (e) {
                console.warn('[scan-local-saves] readdir replicas', replicaRoot, e.message);
            }
            for (const dirent of replicaFolders) {
                if (!dirent.isDirectory() || !exportIngress.safeId(dirent.name)) continue;
                const dirPath = ingressOrchestration.replicaDirFor(basePath, dirent.name);
                if (!dirPath) continue;
                candidates.push({ dirPath, folderName: dirent.name, kind: 'replica' });
            }
        }
        for (const candidate of candidates) {
            const dedupeKey = path.normalize(candidate.dirPath).toLowerCase();
            if (seenDirs.has(dedupeKey)) continue;
            seenDirs.add(dedupeKey);
            try {
                const replicaLayout = candidate.kind === 'replica';
                const opts = replicaLayout
                    ? { sourceId: candidate.folderName }
                    : { sourceId: candidate.folderName, configuredSlot: candidate.folderName };
                let ingested = exportIngress.ingestWatchedSlot(candidate.dirPath, opts);
                const routePresent = await pathExists(path.join(candidate.dirPath, 'active.xml'));
                if (!replicaLayout && !routePresent && ingested && ingested.status === 'unavailable' && ingested.reason === 'route-unavailable' && ingested.replica !== true) {
                    ingested = exportIngress.readExportDirectorySync(candidate.dirPath, { ...opts, explicitLegacy: true });
                }
                if (!ingested || ingested.payload == null) continue;
                const replica = ingested.replica === true || ingested.status === 'replica';
                if (replica && !replicaLayout) continue;
                if (replicaLayout && (ingested.status !== 'replica' || ingested.identity == null || ingested.identity.sourceId !== candidate.folderName)) continue;
                const legacy = !replica && (!!(ingested.identity && ingested.identity.legacy === true) || ingested.legacy === true);
                const modern = !replica && !legacy && (
                    ingested.status === 'valid'
                    || ingested.status === 'last-known'
                    || ingested.status === 'identity-unconfirmed'
                );
                const accepted = replica
                    ? ingested.status === 'replica'
                    : (legacy ? ingested.status === 'identity-unconfirmed' : modern);
                if (!accepted) continue;
                const remoteSlot = replica && ingested.identity
                    ? String(ingested.identity.sourceSlot || '')
                    : '';
                if (replica && !exportIngress.safeId(remoteSlot)) continue;
                const parsed = ingested.payload;
                let savegameName = discoveryLabel(parsed.savegameName);
                let mapTitle = discoveryLabel(parsed.mapTitle) || discoveryLabel(parsed.serverInfo && parsed.serverInfo.mapName);
                const saveMissing = !savegameName || looksLikeSaveSlotId(savegameName);
                const mapMissing = !mapTitle;
                if (!replica && (saveMissing || mapMissing)) {
                    const profile = profileRootForDashboard(basePath);
                    const labelFolder = candidate.folderName;
                    if (profile && exportIngress.safeId(labelFolder)) {
                        try {
                            const careerPath = path.join(profile, labelFolder, 'careerSavegame.xml');
                            if (await pathExists(careerPath)) {
                                const careerRaw = await readFileUtf8WithRetryAsync(careerPath);
                                if (careerRaw) {
                                    const sn = careerRaw.match(/<savegameName>([^<]*)<\/savegameName>/i);
                                    const mt = careerRaw.match(/<mapTitle>([^<]*)<\/mapTitle>/i);
                                    if (saveMissing && sn && sn[1].trim()) savegameName = sn[1].trim();
                                    if (mapMissing && mt && mt[1].trim()) mapTitle = mt[1].trim();
                                }
                            }
                        } catch (_) { /* optional matching profile only */ }
                    }
                }
                const displayName = savegameName && mapTitle && savegameName.toLowerCase() !== mapTitle.toLowerCase()
                    ? `${savegameName} — ${mapTitle}`
                    : (savegameName || mapTitle || 'Unknown Map');
                const row = {
                    id: replica ? candidate.folderName : ('srv_' + Date.now() + Math.floor(Math.random() * 1000)),
                    name: displayName,
                    mode: 'local',
                    localPath: basePath,
                    localSubFolder: replica ? remoteSlot : candidate.folderName,
                    savegameName: savegameName || null,
                    mapTitle: mapTitle || null,
                };
                if (replica) {
                    row.replicaRemoteSlot = remoteSlot;
                    row.sourceKey = `replica:${rootKey}:${candidate.folderName}`;
                    if (registrationBlocked) {
                        row.bindingStatus = 'registration-recovery';
                    } else if (registeredSlots && registeredSlots.has(candidate.folderName) && registeredSlots.get(candidate.folderName) !== remoteSlot) {
                        row.bindingStatus = 'registration-mismatch';
                    }
                } else if (legacy) {
                    row.legacyJson = true;
                    row.sourceKey = `local:${rootKey}:${String(candidate.folderName).toLowerCase()}`;
                } else {
                    row.sourceKey = `local:${rootKey}:${String(candidate.folderName).toLowerCase()}`;
                }
                foundSaves.push(row);
                rootsWithSources.add(rootKey);
            } catch (e) {
                console.warn(`[scan-local-saves] parse ${candidate.dirPath}:`, e.message);
            }
        }
    }

    // First run: a profile whose dashboard root holds no readable source yet can still name its real
    // careers. Each row needs the profile's own careerSavegame.xml and an absent or empty dashboard slot.
    // Profiles that already export are left alone so unexported careers never mix with completed sources.
    const pendingProfiles = new Set();
    const noEntry = (error) => (error && error.code === 'ENOENT' ? null : false);
    // The profile itself may be a redirected Documents folder. modSettings and FS25_FarmDashboard below it
    // must be real directories that physically resolve inside that profile, or a missing part of that chain.
    const dashboardStaysInProfile = async (profile) => {
        let expected;
        try {
            if (!(await fs.promises.stat(profile)).isDirectory()) return false;
            expected = await fs.promises.realpath(profile);
        } catch (_) {
            return false;
        }
        let nearest = profile;
        for (const part of ['modSettings', 'FS25_FarmDashboard']) {
            const next = path.join(nearest, part);
            const stat = await fs.promises.lstat(next).catch(noEntry);
            if (stat === false) return false;
            if (!stat) break;
            if (!stat.isDirectory() || stat.isSymbolicLink()) return false;
            nearest = next;
            expected = path.join(expected, part);
        }
        try {
            return keyForRoot(await fs.promises.realpath(nearest)) === keyForRoot(expected);
        } catch (_) {
            return false;
        }
    };
    // Only a complete, well-formed careerSavegame document may name a pending career. Loaded here because
    // scanLocalSaves is also evaluated on its own, without main.js module scope, by the discovery regressions.
    const { XMLParser, XMLValidator } = require('fast-xml-parser');
    const careerParser = new XMLParser({
        ignoreAttributes: true,
        processEntities: false,
        parseTagValue: false,
        trimValues: true,
    });
    const careerLabels = (raw) => {
        if (typeof raw !== 'string') return null;
        const xml = raw.replace(/^\uFEFF/, '');
        if (/<!DOCTYPE|<!ENTITY/i.test(xml)) return null;
        if (XMLValidator.validate(xml, { allowBooleanAttributes: false }) !== true) return null;
        let doc;
        try {
            doc = careerParser.parse(xml);
        } catch (_) {
            return null;
        }
        const rootNames = Object.keys(doc || {}).filter((name) => name !== '?xml');
        if (rootNames.length !== 1 || rootNames[0] !== 'careerSavegame') return null;
        const career = doc.careerSavegame;
        if (!career || typeof career !== 'object') return null;
        const text = (value) => (typeof value === 'string' ? discoveryLabel(value) : null);
        const settings = career.settings && typeof career.settings === 'object' && !Array.isArray(career.settings)
            ? career.settings
            : {};
        return {
            savegameName: text(settings.savegameName) || text(career.savegameName),
            mapTitle: text(settings.mapTitle) || text(career.mapTitle),
        };
    };
    for (const basePath of roots) {
        const rootKey = keyForRoot(basePath);
        if (rootsWithSources.has(rootKey) || blockedRoots.has(rootKey)) continue;
        const profile = profileRootForDashboard(basePath);
        if (!profile) continue;
        const profileKey = keyForRoot(path.resolve(profile));
        if (pendingProfiles.has(profileKey)) continue;
        pendingProfiles.add(profileKey);
        if (!(await dashboardStaysInProfile(profile))) {
            console.warn('[scan-local-saves] dashboard root leaves its profile', basePath);
            continue;
        }
        let entries;
        try {
            entries = await fs.promises.readdir(profile, { withFileTypes: true });
        } catch (e) {
            console.warn('[scan-local-saves] readdir profile', profile, e && e.code ? e.code : 'failed');
            continue;
        }
        const slots = entries
            .filter((dirent) => dirent.isDirectory() && !dirent.isSymbolicLink() && looksLikeSaveSlotId(dirent.name))
            .map((dirent) => dirent.name)
            .sort((a, b) => Number(a.replace(/\D+/g, '')) - Number(b.replace(/\D+/g, '')));
        for (const slot of slots) {
            try {
                const careerDir = path.join(profile, slot);
                const dirStat = await fs.promises.lstat(careerDir);
                if (!dirStat.isDirectory() || dirStat.isSymbolicLink()) continue;
                const careerPath = path.join(careerDir, 'careerSavegame.xml');
                const fileStat = await fs.promises.lstat(careerPath).catch(noEntry);
                if (!fileStat || !fileStat.isFile() || fileStat.size <= 0 || fileStat.size > 4 * 1024 * 1024) continue;
                const slotDir = path.join(basePath, slot);
                const slotStat = await fs.promises.lstat(slotDir).catch(noEntry);
                if (slotStat === false) continue;
                if (slotStat) {
                    if (!slotStat.isDirectory() || slotStat.isSymbolicLink()) continue;
                    if ((await fs.promises.readdir(slotDir)).length) continue;
                }
                const careerRaw = await readFileUtf8WithRetryAsync(careerPath);
                if (!careerRaw || careerRaw.length > 4 * 1024 * 1024) continue;
                const labels = careerLabels(careerRaw);
                if (!labels) continue;
                const { savegameName, mapTitle } = labels;
                if (!savegameName && !mapTitle) continue;
                const displayName = savegameName && mapTitle && savegameName.toLowerCase() !== mapTitle.toLowerCase()
                    ? `${savegameName} — ${mapTitle}`
                    : (savegameName || mapTitle);
                foundSaves.push({
                    id: 'srv_' + Date.now() + Math.floor(Math.random() * 1000),
                    name: displayName,
                    mode: 'local',
                    localPath: basePath,
                    localSubFolder: slot,
                    savegameName,
                    mapTitle,
                    sourceKey: `local:${rootKey}:${slot.toLowerCase()}`,
                    awaitingFirstExport: true,
                });
            } catch (e) {
                console.warn(`[scan-local-saves] career ${slot}:`, e && e.code ? e.code : (e && e.message));
            }
        }
    }
    console.log('[scan-local-saves] found', foundSaves.length, 'save profile(s) under FS25_FarmDashboard');
    let defaultDashboardRoot = null;
    try {
        const documentsRoot = typeof getFs25DocumentsRoot === 'function' ? getFs25DocumentsRoot() : null;
        if (documentsRoot) defaultDashboardRoot = path.join(documentsRoot, 'modSettings', 'FS25_FarmDashboard');
    } catch (_) { /* an unresolved default root stays null */ }
    return { saves: foundSaves, searchedRoots, missingRoots, defaultDashboardRoot };
}

registerTrustedHandle('scan-local-saves', scanLocalSaves);
