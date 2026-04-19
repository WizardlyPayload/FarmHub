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
    saveSettings: (config) => ipcRenderer.send('save-settings', config),
    scanLocalSaves: () => ipcRenderer.invoke('scan-local-saves'),
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
    getAiClientBranding: () => ipcRenderer.invoke('get-ai-client-branding'),
    getAiManagerConnection: () => ipcRenderer.invoke('get-ai-manager-connection'),
    saveAiManagerConnection: (payload) => ipcRenderer.invoke('save-ai-manager-connection', payload),
    aiFarmInstallConfigXml: (opts) => ipcRenderer.invoke('ai-farm-install-config-xml', opts),
    exportModStoreImages: () => ipcRenderer.invoke('export-mod-store-images'),
    getConsultantByokCredentials: () => ipcRenderer.invoke('get-consultant-byok-credentials'),
    getConsultantByokMeta: () => ipcRenderer.invoke('get-consultant-byok-meta'),
    listByokProviderModels: (args) => ipcRenderer.invoke('list-byok-provider-models', args),
    listSavedByokProviderModels: () => ipcRenderer.invoke('list-saved-byok-provider-models'),
    saveConsultantByokCredentials: (payload) => ipcRenderer.invoke('save-consultant-byok-credentials', payload),
    getFieldExclusionOptions: (payload) => ipcRenderer.invoke('get-field-exclusion-options', payload),
    getModConfig: () => ipcRenderer.invoke('get-mod-config'),
    saveModConfig: (cfg) => ipcRenderer.invoke('save-mod-config', cfg),
    readLocalFarmdashDataJson: () => ipcRenderer.invoke('read-local-farmdash-data-json'),
    onAppUpdateStatus: (callback) => onChannel('app-update-status', callback),
    subscribeExportModStoreImagesProgress: (callback) =>
        onChannel('export-mod-store-images-progress', callback),
});
