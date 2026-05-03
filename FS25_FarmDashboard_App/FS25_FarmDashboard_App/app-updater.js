// FS25 FarmDashboard | app-updater.js
// Auto-update for the packaged Windows app via electron-updater (GitHub Releases — see package.json build.publish).

'use strict';

const fs = require('fs');
const path = require('path');
const { app, dialog } = require('electron');

let autoUpdater = null;
try {
    autoUpdater = require('electron-updater').autoUpdater;
} catch (e) {
    console.warn('[updater] electron-updater load failed:', e.message);
}

/** BCP-47 primary tags — keep in sync with web/assests/js/i18n/i18n.js LOCALE_NAMES */
const VALID_LOCALE = new Set([
    'en', 'bg', 'hr', 'cs', 'da', 'nl', 'et', 'fi', 'fr', 'de', 'el', 'hu', 'ga', 'it', 'lv', 'lt', 'mt',
    'pl', 'pt', 'ro', 'sk', 'sl', 'es', 'sv', 'is', 'nb', 'uk',
]);

const FALLBACK_LANG = 'en';

let getMainWindow = null;
let getLocale = null;
let translationsCache = null;

function normalizeLocale(code) {
    if (!code || typeof code !== 'string') return FALLBACK_LANG;
    const p = code.trim().toLowerCase().replace('_', '-').split('-')[0];
    return VALID_LOCALE.has(p) ? p : FALLBACK_LANG;
}

function loadTranslationsCatalog() {
    if (translationsCache) return translationsCache;
    const p = path.join(__dirname, 'web', 'locales', 'translations.json');
    try {
        const raw = fs.readFileSync(p, 'utf8');
        const j = JSON.parse(raw);
        translationsCache = j && typeof j === 'object' && j.strings ? j.strings : {};
    } catch (e) {
        console.warn('[updater] could not load translations.json:', e && e.message ? e.message : e);
        translationsCache = {};
    }
    return translationsCache;
}

/**
 * Resolve a catalog string for the current UI language (same rules as renderer i18n `t()`).
 * Used for native dialogs in the main process.
 */
function tr(key, params) {
    const catalog = loadTranslationsCatalog();
    const row = catalog[key];
    const locale = normalizeLocale(getLocale && typeof getLocale === 'function' ? getLocale() : FALLBACK_LANG);
    let v =
        row && typeof row === 'object'
            ? row[locale] != null && row[locale] !== ''
                ? row[locale]
                : row[FALLBACK_LANG]
            : null;
    if (v == null || v === '') v = key;
    if (params && typeof params === 'object' && typeof v === 'string') {
        for (const [pk, pv] of Object.entries(params)) {
            v = v.split(`{{${pk}}}`).join(String(pv));
        }
    }
    return v;
}

function sendToRenderer(payload) {
    const w = getMainWindow && getMainWindow();
    if (!w || w.isDestroyed()) return;
    try {
        w.webContents.send('app-update-status', payload);
    } catch (e) {
        /* ignore */
    }
}

/**
 * Call once after createWindow when app.isPackaged.
 * Checks GitHub Releases (package.json build.publish) ~10s after startup; downloads in background; prompts to restart when ready.
 * @param {() => import('electron').BrowserWindow | null | undefined} getWin
 * @param {() => string | undefined} [getLocaleCode] — returns stored UI locale (e.g. from electron-store), same as Settings → Language
 */
function initAppUpdater(getWin, getLocaleCode) {
    getMainWindow = getWin;
    getLocale = getLocaleCode || null;
    if (!autoUpdater) {
        console.log('[updater] disabled (module missing)');
        return;
    }
    if (!app.isPackaged) {
        console.log('[updater] skipped — development / unpackaged build');
        return;
    }

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('checking-for-update', () => {
        console.log('[updater] checking for update…');
    });
    autoUpdater.on('update-available', (info) => {
        console.log('[updater] update available:', info && info.version);
        sendToRenderer({
            status: 'available',
            version: info && info.version,
            releaseDate: info && info.releaseDate,
        });
    });
    autoUpdater.on('update-not-available', () => {
        sendToRenderer({ status: 'uptodate' });
    });
    autoUpdater.on('error', (err) => {
        const msg = (err && err.message) ? err.message : String(err);
        console.warn('[updater] error:', msg);
        sendToRenderer({ status: 'error', message: msg });
    });
    autoUpdater.on('download-progress', (p) => {
        sendToRenderer({
            status: 'downloading',
            percent: Math.round(p.percent != null ? p.percent : 0),
        });
    });
    autoUpdater.on('update-downloaded', (info) => {
        const ver = (info && info.version) || '';
        const w = getMainWindow && getMainWindow();
        dialog
            .showMessageBox(w && !w.isDestroyed() ? w : undefined, {
                type: 'info',
                title: tr('updater.dialogTitle'),
                message: tr('updater.dialogMessage', { version: ver }),
                detail: tr('updater.dialogDetail'),
                buttons: [tr('updater.restartNow'), tr('updater.later')],
                defaultId: 0,
                cancelId: 1,
                noLink: true,
            })
            .then((r) => {
                if (r.response === 0) {
                    autoUpdater.quitAndInstall(false, true);
                }
            })
            .catch(() => {});
    });

    setTimeout(() => {
        autoUpdater.checkForUpdates().catch((e) => {
            console.warn('[updater] initial check failed:', e && e.message ? e.message : e);
        });
    }, 10000);
}

async function checkForUpdatesNow() {
    if (!autoUpdater || !app.isPackaged) {
        return { ok: false, reason: app.isPackaged ? 'no_updater' : 'development' };
    }
    try {
        const r = await autoUpdater.checkForUpdates();
        return { ok: true, updateInfo: r && r.updateInfo ? r.updateInfo : null };
    } catch (e) {
        return { ok: false, error: e && e.message ? e.message : String(e) };
    }
}

module.exports = { initAppUpdater, checkForUpdatesNow };
