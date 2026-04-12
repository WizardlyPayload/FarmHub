// FS25 FarmDashboard | app-updater.js
// Auto-update for the packaged Windows app via electron-updater (GitHub Releases — see package.json build.publish).

'use strict';

const { app, dialog } = require('electron');

let autoUpdater = null;
try {
    autoUpdater = require('electron-updater').autoUpdater;
} catch (e) {
    console.warn('[updater] electron-updater load failed:', e.message);
}

let getMainWindow = null;

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
 */
function initAppUpdater(getWin) {
    getMainWindow = getWin;
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
                title: 'Update ready',
                message: `Farm Dashboard ${ver} is downloaded.`,
                detail: 'Restart now to install? Your dashboard settings and farm data stay on this PC.',
                buttons: ['Restart and install', 'Later'],
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
