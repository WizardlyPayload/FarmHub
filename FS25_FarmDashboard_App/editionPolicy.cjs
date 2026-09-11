'use strict';

/**
 * V4 vs V5 runtime identity.
 *
 * User-facing names: Farm Dashboard V4 (classic screens) and Farm Dashboard V5 (rebuild).
 * Packaged V5 stamps extraMetadata.productLine = v5. Older 5.0.x packages still stamp `rf`;
 * both map to the V5 line. V4 has no productLine (or classic/v4).
 *
 * Install identity is unchanged so existing side-by-side installs keep working:
 * V5 appId / AppUserModelId com.farmdashboard.rf, profile fs25-farm-dashboard-rf, port 8768,
 * update feed latest-rf.yml. V4 uses com.farmdashboard.app, fs25-farm-dashboard, port 8766.
 * Unpackaged FARMDASH_DEV uses 8767.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const CLASSIC_PORT = 8766;
const RF_PORT = 8768;
const V5_PORT = RF_PORT;
const DEV_PORT = 8767;

function normalizeLineToken(value) {
    return String(value || '').trim().toLowerCase();
}

function isV5ProductLine(productLine) {
    const s = normalizeLineToken(productLine);
    return s === 'v5' || s === 'rf' || s === 'realistic-farming';
}

function isV4ProductLine(productLine) {
    return !isV5ProductLine(productLine);
}

function resolveProductLine(opts) {
    const o = opts || {};
    const env = normalizeLineToken(o.envProductLine || process.env.FARMDASH_PRODUCT_LINE || '');
    if (isV5ProductLine(env)) return 'v5';
    if (env === 'v4' || env === 'classic') return 'classic';
    let pkg = o.pkg;
    if (!pkg) {
        try {
            pkg = require('./package.json');
        } catch (_) {
            pkg = {};
        }
    }
    const line = normalizeLineToken(pkg.productLine || '');
    if (isV5ProductLine(line)) return 'v5';
    return 'classic';
}

function resolvePort(opts) {
    const o = opts || {};
    const raw = o.envPort != null ? o.envPort : process.env.FARMDASH_PORT;
    if (raw != null && String(raw).trim() !== '') {
        const n = parseInt(String(raw).trim(), 10);
        if (Number.isFinite(n) && n >= 1024 && n <= 65535) return n;
    }
    if (o.isDev) return DEV_PORT;
    return isV5ProductLine(o.productLine) ? V5_PORT : CLASSIC_PORT;
}

function profileDirName(productLine, isDev) {
    if (isDev) return isV5ProductLine(productLine) ? 'fs25-farm-dashboard-rf-dev' : 'fs25-farm-dashboard-dev';
    return isV5ProductLine(productLine) ? 'fs25-farm-dashboard-rf' : 'fs25-farm-dashboard';
}

function appUserModelId(productLine) {
    return isV5ProductLine(productLine) ? 'com.farmdashboard.rf' : 'com.farmdashboard.app';
}

function otherEditionPort(productLine) {
    return isV5ProductLine(productLine) ? CLASSIC_PORT : V5_PORT;
}

function roamingAppData() {
    return process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
}

function localAppData() {
    return process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
}

function siblingClassicUserDataDir() {
    return path.join(roamingAppData(), 'fs25-farm-dashboard');
}

function uninstallProfileNames(edition) {
    const ed = normalizeLineToken(edition || 'classic');
    if (isV5ProductLine(ed)) {
        return {
            roaming: ['fs25-farm-dashboard-rf'],
            local: [
                'fs25-farm-dashboard-rf',
                'fs25-farm-dashboard-rf-updater',
                'com.farmdashboard.rf-updater',
            ],
        };
    }
    return {
        roaming: ['fs25-farm-dashboard', 'FS25 Farm Dashboard', 'com.farmdashboard.app'],
        local: [
            'fs25-farm-dashboard',
            'fs25-farm-dashboard-updater',
            'com.farmdashboard.app-updater',
        ],
    };
}

/**
 * Override userData / sessionData before Store and requestSingleInstanceLock.
 * No-op when Electron was started with --user-data-dir (dev launcher).
 */
function applySessionPaths(electronApp, opts) {
    const o = opts || {};
    if (!electronApp || typeof electronApp.setPath !== 'function') return null;
    try {
        if (electronApp.commandLine && electronApp.commandLine.hasSwitch('user-data-dir')) {
            return electronApp.getPath('userData');
        }
    } catch (_) {
        /* ignore */
    }
    const name = profileDirName(o.productLine, !!o.isDev);
    const userData = o.isDev ? path.join(localAppData(), name) : path.join(roamingAppData(), name);
    const sessionData = path.join(localAppData(), name);
    try {
        fs.mkdirSync(userData, { recursive: true });
    } catch (_) {
        /* ignore */
    }
    try {
        fs.mkdirSync(sessionData, { recursive: true });
    } catch (_) {
        /* ignore */
    }
    electronApp.setPath('userData', userData);
    try {
        electronApp.setPath('sessionData', sessionData);
    } catch (_) {
        /* older Electron */
    }
    try {
        if (typeof electronApp.setAppUserModelId === 'function') {
            electronApp.setAppUserModelId(appUserModelId(o.productLine));
        }
    } catch (_) {
        /* ignore */
    }
    return userData;
}

/**
 * Copy V4 save list into V5 without secrets or LAN exposure.
 * @returns {object|null} sanitized config or null if nothing to import
 */
function sanitizeClassicConfigForRf(config) {
    if (!config || typeof config !== 'object') return null;
    const serversIn = Array.isArray(config.servers) ? config.servers : [];
    const servers = [];
    for (const s of serversIn) {
        if (!s || typeof s !== 'object') continue;
        const id = String(s.id || '').trim();
        if (!id) continue;
        const mode = s.mode === 'ftp' ? 'ftp' : 'local';
        const row = {
            id,
            name: String(s.name || id),
            mode,
            localPath: s.localPath != null ? String(s.localPath) : undefined,
            localSubFolder: s.localSubFolder != null ? String(s.localSubFolder) : undefined,
            ftpHost: s.ftpHost != null ? String(s.ftpHost) : undefined,
            ftpPort: s.ftpPort,
            ftpUser: s.ftpUser != null ? String(s.ftpUser) : undefined,
            ftpBasePath: s.ftpBasePath != null ? String(s.ftpBasePath) : undefined,
            httpFeedHost: s.httpFeedHost != null ? String(s.httpFeedHost) : undefined,
            httpFeedPort: s.httpFeedPort,
        };
        for (const key of ['ftpSecure', 'ftpFtps', 'ftpAllowInsecureTls', 'httpFeedSecure']) {
            if (typeof s[key] === 'boolean' || (key === 'ftpSecure' && s[key] === 'explicit')) row[key] = s[key];
        }
        servers.push(row);
    }
    if (!servers.length) return null;
    const out = { isConfigured: true, servers };
    if (config.ftpPolling && typeof config.ftpPolling === 'object') {
        out.ftpPolling = {
            initialDelaySeconds: config.ftpPolling.initialDelaySeconds,
            intervalMinutes: config.ftpPolling.intervalMinutes,
            scheduleMode: config.ftpPolling.scheduleMode,
        };
    }
    return out;
}

function readElectronStoreConfig(storeJsonPath) {
    try {
        const raw = fs.readFileSync(storeJsonPath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && parsed.config && typeof parsed.config === 'object') {
            return parsed.config;
        }
        return null;
    } catch (_) {
        return null;
    }
}

/**
 * Trusted desktop IPC: packaged/setup file documents, or exact loopback dashboard origin.
 * Does not accept LAN IPs or other ports.
 */
function isTrustedDashboardIpcUrl(rawUrl, opts) {
    const o = opts || {};
    const port = String(o.port != null ? o.port : '');
    if (!rawUrl || !port) return false;
    try {
        const u = new URL(String(rawUrl));
        if (u.username || u.password) return false;
        if (u.protocol === 'file:') {
            if (u.hostname && u.hostname !== 'localhost') return false;
            const { fileURLToPath } = require('url');
            const documentPath = path.resolve(fileURLToPath(u));
            const root = path.resolve(o.appDirectory || __dirname);
            const relative = path.relative(root, documentPath).replace(/\\/g, '/');
            return ['setup.html', 'index.html', 'ui-v2/setup.html', 'ui-v2/index.html',
                'ui-v2/simhub.html', 'web/index.html', 'web/simhub.html'].includes(relative);
        }
        if (u.protocol !== 'http:') return false;
        const host = String(u.hostname || '').toLowerCase();
        if (!['127.0.0.1', 'localhost', '[::1]', '::1'].includes(host)) return false;
        if (String(u.port || '80') !== port) return false;
        return ['/', '/index.html', '/setup.html', '/simhub.html'].includes(u.pathname);
    } catch (_) {
        return false;
    }
}

function productDisplayName(productLine) {
    return isV5ProductLine(productLine) ? 'FS25 Farm Dashboard V5' : 'FS25 Farm Dashboard V4';
}

function productShortName(productLine) {
    return isV5ProductLine(productLine) ? 'Farm Dashboard V5' : 'Farm Dashboard V4';
}

function windowTitle(opts) {
    const o = opts || {};
    const base = productDisplayName(o.productLine);
    if (o.isDev) return `${base} (dev :${o.port})`;
    return base;
}

function portInUseMessage(opts) {
    const o = opts || {};
    const edition = productShortName(o.productLine);
    const peer = isV5ProductLine(o.productLine)
        ? 'Farm Dashboard V4 uses port 8766; this V5 copy uses 8768.'
        : 'Farm Dashboard V5 uses port 8768; this V4 copy uses 8766.';
    return (
        `Port ${o.port} is already in use — ${edition} cannot start its API.\n\n` +
        `Close another window of this same version (not the other Farm Dashboard). ${peer}\n` +
        'Then restart this app. Do not end unrelated Electron or Farming Simulator tasks.'
    );
}

module.exports = {
    CLASSIC_PORT,
    RF_PORT,
    V5_PORT,
    DEV_PORT,
    isV5ProductLine,
    isV4ProductLine,
    resolveProductLine,
    resolvePort,
    profileDirName,
    appUserModelId,
    otherEditionPort,
    siblingClassicUserDataDir,
    uninstallProfileNames,
    applySessionPaths,
    sanitizeClassicConfigForRf,
    readElectronStoreConfig,
    isTrustedDashboardIpcUrl,
    productDisplayName,
    productShortName,
    windowTitle,
    portInUseMessage,
};
