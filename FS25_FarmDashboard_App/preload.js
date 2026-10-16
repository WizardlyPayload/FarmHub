// FS25 FarmDashboard | preload.js | Phase 2 — contextIsolation + IPC bridge
// Exposes window.farmDashAPI only (no raw ipcRenderer).

const { contextBridge, ipcRenderer } = require('electron');

function onChannel(channel, callback) {
    const wrap = (_event, ...args) => callback(...args);
    ipcRenderer.on(channel, wrap);
    return () => ipcRenderer.removeListener(channel, wrap);
}

contextBridge.exposeInMainWorld('farmDashAPI', {
    getCurrentConfig: () => ipcRenderer.invoke('get-current-config'),
    saveSettings: (config) => ipcRenderer.invoke('save-settings', config),
    launchDashboard: () => ipcRenderer.invoke('launch-dashboard'),
    scanLocalSaves: () => ipcRenderer.invoke('scan-local-saves'),
    getPendingReplicaSession: () => ipcRenderer.invoke('get-pending-replica-session'),
    approvePendingReplicaSession: (pendingId) => ipcRenderer.invoke('approve-pending-replica-session', pendingId),
    declinePendingReplicaSession: (pendingId) => ipcRenderer.invoke('decline-pending-replica-session', pendingId),
    getOrphanReplicaRecovery: () => ipcRenderer.invoke('get-orphan-replica-recovery'),
    startOrphanReplicaChallenge: (offerId) => ipcRenderer.invoke('start-orphan-replica-challenge', offerId),
    cancelOrphanReplicaChallenge: (offerId, challengeId) => ipcRenderer.invoke('cancel-orphan-replica-challenge', offerId, challengeId),
    restoreOrphanReplica: (offerId, challengeId) => ipcRenderer.invoke('restore-orphan-replica', offerId, challengeId),
    openSetup: () => ipcRenderer.send('open-setup'),
    resetSettings: () => ipcRenderer.send('reset-settings'),
    getStoredLocale: () => ipcRenderer.invoke('get-stored-locale'),
    setStoredLocale: (code) => ipcRenderer.send('set-stored-locale', code),
    getTranslationsJson: () => ipcRenderer.invoke('get-translations-json'),
    getUiPreferences: () => ipcRenderer.invoke('get-ui-preferences'),
    saveUiPreferences: (prefs) => ipcRenderer.invoke('save-ui-preferences', prefs),
    getLanAccessSettings: () => ipcRenderer.invoke('get-lan-access-settings'),
    saveLanAccessSettings: (payload) => ipcRenderer.invoke('save-lan-access-settings', payload),
    getDesktopAppVersion: () => ipcRenderer.invoke('get-desktop-app-version'),
    checkDesktopAppUpdates: () => ipcRenderer.invoke('check-desktop-app-updates'),
    exportModStoreImages: (opts) => ipcRenderer.invoke('export-mod-store-images', opts || {}),
    getFieldExclusionOptions: (payload) => ipcRenderer.invoke('get-field-exclusion-options', payload),
    getModConfig: () => ipcRenderer.invoke('get-mod-config'),
    saveModConfig: (cfg) => ipcRenderer.invoke('save-mod-config', cfg),
    readLocalFarmdashDataJson: () => ipcRenderer.invoke('read-local-farmdash-data-json'),
    readServerLiveCache: (serverId) => ipcRenderer.invoke('read-server-live-cache', serverId),
    setSimHubLiveContext: (payload) => ipcRenderer.invoke('set-simhub-live-context', payload),
    getSetupStatus: () => ipcRenderer.invoke('get-setup-status'),
    runSetupHandshake: () => ipcRenderer.invoke('run-setup-handshake'),
    restoreLanDefaults: () => ipcRenderer.invoke('restore-lan-defaults'),
    onAppUpdateStatus: (callback) => onChannel('app-update-status', callback),
    subscribeExportModStoreImagesProgress: (callback) =>
        onChannel('export-mod-store-images-progress', callback),
});
