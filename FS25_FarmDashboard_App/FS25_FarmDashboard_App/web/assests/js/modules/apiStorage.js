// FS25 FarmDashboard | apiStorage.js | v2.0.0

/**
 * API & Storage Module
 * Handles all data fetching and Multi-Server state management
 */

/** Must match ``_schemaVersion`` written with ``serverLiveCache/*.json`` (see serverDataCache.js). */
export const SERVER_LIVE_CACHE_SCHEMA_VERSION = '1.0';

import { filterFieldsForFarmView, invalidateFieldsClientCache } from './fields.js';

/** Clear per-farm / per-field UI caches so rapid farm or save switches cannot paint stale field cards. */
function resetCrossFarmVisualizationCaches(dashboard) {
  try {
    invalidateFieldsClientCache();
  } catch (_) {}
  if (typeof window !== 'undefined') {
    window.__fieldConsultantByRef = {};
    window.__fieldConsultantLlmUsed = false;
    window.__fieldConsultantSuggestionTier = undefined;
    window.__fieldConsultantAppliedKey = null;
    window.__fieldConsultantAppliedHash = null;
    window.__lastFieldStateHash = null;
  }
  if (dashboard && dashboard.realtimeConnector) {
    dashboard.realtimeConnector.previousData = null;
    dashboard.realtimeConnector._lastLandingCountsFromAnimalsAt = 0;
    if (typeof dashboard.realtimeConnector.clearPayloadDedupeCache === 'function') {
      dashboard.realtimeConnector.clearPayloadDedupeCache();
    }
  }
}
import { isFarmDashLocalConfigHost } from './viewer-mode.js';

/** When the farm picker / saved id does not own any fields (multi-farm dedicated), pick the farm with the most field rows. */
function inferFarmIdFromFieldOwnership(fields, farms) {
  if (!Array.isArray(fields) || fields.length === 0) return null;
  const counts = new Map();
  for (const f of fields) {
    if (!f || typeof f !== 'object') continue;
    const oid = Number(f.ownerFarmId ?? f.farmId ?? 0);
    if (!oid || Number.isNaN(oid)) continue;
    counts.set(oid, (counts.get(oid) || 0) + 1);
  }
  let best = null;
  let bestN = -1;
  for (const [id, n] of counts) {
    if (n > bestN) {
      bestN = n;
      best = id;
    }
  }
  if (best != null) return best;
  const arr = ensureArray(farms);
  const pl = arr.find((x) => x && Number(x.id) > 0);
  return pl ? Number(pl.id) : null;
}

/** `/api/servers` may return numeric ids; localStorage always uses strings — strict `===` breaks lookups. */
function sameServerId(a, b) {
  if (a == null || b == null) return false;
  return String(a) === String(b);
}

/** Lua / JSON may yield {} instead of [] — never assign a non-array to `farms` (breaks .filter). */
function ensureArray(val) {
  if (val == null) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'object') return Object.values(val);
  return [];
}

/** Husbandry buildings list at `data.animals` — same coercion as merged API / Lua. */
function ensureHusbandryArray(val) {
  return ensureArray(val);
}

/**
 * Animals nested under one building — must match realtime-connector `updateAnimalsData`
 * (vanilla `animals`, RealisticLivestock `livestock`, legacy `animalList`).
 */
function getAnimalListFromBuilding(building) {
  if (!building || typeof building !== "object") return [];
  if (building.animals && Array.isArray(building.animals)) return building.animals;
  if (building.livestock && Array.isArray(building.livestock)) return building.livestock;
  if (building.animalList && Array.isArray(building.animalList)) return building.animalList;
  return [];
}

const originalFetch = window.fetch;
window.fetch = async function() {
    let [resource, config] = arguments;
    if (typeof resource === 'string' && resource.includes('/api/') && !resource.includes('serverId=')) {
        let serverId = window.dashboard ? window.dashboard.activeServerId : localStorage.getItem('dashboard_active_server');
        if (serverId) {
            const separator = resource.includes('?') ? '&' : '?';
            resource = `${resource}${separator}serverId=${serverId}`;
        }
    }
    return originalFetch(resource, config);
};

const OriginalWebSocket = window.WebSocket;
window.WebSocket = function(url, protocols) {
    const ws = new OriginalWebSocket(url, protocols);
    Object.defineProperty(ws, 'onmessage', {
        set: function(func) {
            this._onmessage = function(event) {
                try {
                    const data = JSON.parse(event.data);
                    let serverId = window.dashboard ? window.dashboard.activeServerId : localStorage.getItem('dashboard_active_server');
                    if (data.serverId && serverId && data.serverId !== serverId) return; 
                } catch(e) {}
                if (func) func.call(this, event);
            };
        },
        get: function() { return this._onmessage; }
    });
    return ws;
};

/**
 * Base URL for REST calls. When the UI is served over http(s) (LAN IP, localhost, etc.),
 * use the same origin so tablets/remote clients hit the host machine, not 127.0.0.1 on the client.
 */
export function getAPIBaseURL() {
  if (typeof window !== "undefined" && window.location && /^https?:$/i.test(window.location.protocol || "")) {
    return window.location.origin;
  }
  return "http://127.0.0.1:8766";
}

/** Farm switcher: FTP (always) or local when the save has more than one player farm. */
export function isFarmDropdownEnabled() {
    const srv = (this.availableServers || []).find(s => sameServerId(s.id, this.activeServerId));
    if (!srv) return false;
    if (srv.mode === 'ftp') return true;
    const farms = this.playerFarms || [];
    return farms.length > 1;
}

export async function loadServersAndTabs() {
    this.availableServers = [];
    try {
        const apiBaseURL = this.getAPIBaseURL();
        const response = await originalFetch(`${apiBaseURL}/api/servers`);
        
        if (response.ok) {
            this.availableServers = await response.json();
            if (!Array.isArray(this.availableServers)) this.availableServers = [];
            if (this.availableServers.length > 0) {
                const savedServerId = localStorage.getItem('dashboard_active_server');
                const matched = savedServerId
                    ? this.availableServers.find(s => sameServerId(s.id, savedServerId))
                    : null;
                if (matched) {
                    this.activeServerId = matched.id;
                    localStorage.setItem('dashboard_active_server', String(this.activeServerId));
                } else {
                    this.activeServerId = this.availableServers[0].id;
                    localStorage.setItem('dashboard_active_server', String(this.activeServerId));
                }
                this.renderServerTabs();
            } else {
                this.activeServerId = undefined;
                const container = document.getElementById("server-tabs-container");
                if(container) container.innerHTML = '<span class="badge bg-danger">No Servers Found</span>';
            }
        }
    } catch (error) {
        console.error("[API] Error loading servers:", error);
    }
}

export function renderServerTabs() {
    const container = document.getElementById("server-tabs-container");
    if (!container) return;

    let html = '<div class="btn-group shadow-sm" role="group">';
    this.availableServers.forEach(server => {
        const isActive = sameServerId(server.id, this.activeServerId) ? 'btn-farm-accent text-dark' : 'btn-outline-light';
        html += `<button type="button" class="btn ${isActive} btn-sm fw-bold" onclick="dashboard.switchServer('${server.id}')">
                    <i class="bi bi-hdd-network me-1"></i>${server.name}
                 </button>`;
    });
    html += '</div>';
    container.innerHTML = html;
}

/**
 * Switch active save/server in memory — no full page reload (avoids splash and reload cost).
 * Fetches `/api/data` for the new `activeServerId` and refreshes the current view.
 */
export async function switchServer(serverId) {
  if (sameServerId(this.activeServerId, serverId)) return;
  if (this._switchingServer) return;

  const prevId = this.activeServerId;
  this._switchingServer = true;

  try {
    const match = (this.availableServers || []).find(s => sameServerId(s.id, serverId));
    const canonicalId = match ? match.id : serverId;
    localStorage.setItem("dashboard_active_server", String(canonicalId));
    this.activeServerId = canonicalId;
    this.renderServerTabs();

    const ok = await this.tryLoadApiData();
    if (!ok) {
      this.activeServerId = prevId;
      if (prevId) localStorage.setItem("dashboard_active_server", prevId);
      else localStorage.removeItem("dashboard_active_server");
      this.renderServerTabs();
      if (this.showAlert) {
        this.showAlert(
          "Could not load data for this save. Check that the server has data or try again.",
          "warning"
        );
      }
      return;
    }

    /** One merge already ran in tryLoadApiData; avoid a second GET here. */
    resetCrossFarmVisualizationCaches(this);

    const currentSection = this.getCurrentSection ? this.getCurrentSection() : null;
    if (currentSection && currentSection !== "landing" && currentSection !== "dashboard") {
      if (this.showSection) this.showSection(currentSection);
    } else {
      if (this.updateLandingPageCounts) this.updateLandingPageCounts();
    }
    if (this.updateNavbar) this.updateNavbar();

  } finally {
    this._switchingServer = false;
  }
}

export async function checkAPIAvailability() {
  try {
    await this.loadServersAndTabs();
    const apiBaseURL = this.getAPIBaseURL();
    const response = await fetch(`${apiBaseURL}/api/status`);
    if (response.ok) {
      const loaded = await this.tryLoadApiData();
      if (loaded) {
        this.isDataLoaded = true;
        if (typeof this.showDashboard === "function") {
          this.showDashboard();
        } else {
          document.getElementById("folder-selection").classList.add("d-none");
          document.getElementById("landing-page").classList.remove("d-none");
          document.getElementById("main-navbar").classList.remove("d-none");
          if (this.updateLandingPageCounts) this.updateLandingPageCounts();
          if (this.updateNavbar) this.updateNavbar();
          if (window.location.hash) this.handleHashChange();
        }
        return;
      }
      // API is online but no server in config — still show the app (Settings / Home to fix)
      if (!this.activeServerId) {
        this.applyEmptyApiState();
        this.isDataLoaded = true;
        if (typeof this.showDashboard === "function") {
          this.showDashboard();
        } else {
          document.getElementById("folder-selection").classList.add("d-none");
          document.getElementById("landing-page").classList.remove("d-none");
          document.getElementById("main-navbar").classList.remove("d-none");
          if (this.updateLandingPageCounts) this.updateLandingPageCounts();
          if (this.updateNavbar) this.updateNavbar();
          if (window.location.hash) this.handleHashChange();
        }
        if (this.showAlert) {
          this.showAlert(
            isFarmDashLocalConfigHost()
              ? "No server configured. Use Settings (gear) or Back to Home to add a server and local saves."
              : "No server configured on the host PC. Add servers and saves on the machine running Farm Dashboard, then reload.",
            "warning"
          );
        }
        if (typeof window.farmDashNotifyDataReady === "function") {
          window.farmDashNotifyDataReady();
        }
        return;
      }
    }
  } catch (error) {}
  this.loadSavedFolder();
}

export function applyEmptyApiState() {
  this.vehicles = [];
  this.economy = {};
  this.finance = {};
  this.weather = {};
  this.production = {};
  this.pastures = [];
  this.husbandryData = [];
  this.mapTitle = null;
  this.savegameName = null;
  this.dataSource = "unknown";
  this.xmlAvailable = false;
  this.luaAvailable = false;
  this.money = 0;
  this.gameSettings = {};
  this.farms = [];
  this.playerFarms = [];
  this.allFields = [];
  this.fields = [];
  this.animals = [];
  if (this.activeFarmId == null) this.activeFarmId = 1;
  this.renderFarmDropdown();
}

/**
 * RealtimeConnector starts an immediate /api/data poll on window load, often before tryLoadApiData()
 * restores activeFarmId from localStorage — first poll can filter the wrong farm. After REST merge,
 * force one dedupe-bypassed poll so UI matches the selected farm/server.
 */
export function resyncRealtimeAfterBootstrap() {
  const rc = this.realtimeConnector;
  if (rc && typeof rc.clearPayloadDedupeCache === "function" && typeof rc.refreshHttpDataNow === "function") {
    rc.clearPayloadDedupeCache();
    rc.refreshHttpDataNow();
    return;
  }
  this._pendingRealtimeBootstrapResync = true;
}

export async function tryLoadApiData() {
  try {
    if (!this.activeServerId) return false;
    const apiBaseURL = this.getAPIBaseURL();
    const response = await fetch(`${apiBaseURL}/api/data`);
    if (response.ok) {
      const data = await response.json();
      if (data.error) {
        const errMsg = typeof data.error === "string" ? data.error : String(data.error || "");
        const waiting =
          errMsg === "Waiting for data..." || /waiting\s+for\s+data/i.test(errMsg);
        if (waiting) {
          this.applyEmptyApiState();
          if (typeof window.farmDashNotifyDataReady === "function") {
            window.farmDashNotifyDataReady();
          }
          return true;
        }
        return false;
      }

      this.vehicles = data.vehicles || [];
      this.economy = data.economy || {};
      this.finance = data.finance || {};
      this.weather = data.weather || {};
      this.production = data.production || {};
      this.pastures = data.pastures || [];
      // Merged data top-level fields
      this.mapTitle      = data.mapTitle      || null;
      this.savegameName  = data.savegameName  || null;
      this.dataSource    = data.dataSource    || 'unknown';
      this.xmlAvailable  = data.xmlAvailable  || false;
      this.luaAvailable  = data.luaAvailable  || false;
      this.money         = data.money         || 0;
      this.gameSettings  = data.gameSettings  || {};
      this.husbandryData = ensureHusbandryArray(data.animals);

      this.farms = ensureArray(data.farmInfo);
      this.playerFarms = this.farms;
      const mpFarmSwitch = this.isFarmDropdownEnabled();
      const farmKey = `dashboard_active_farm_${String(this.activeServerId)}`;
      let savedFarmId = mpFarmSwitch ? localStorage.getItem(farmKey) : null;
      if (mpFarmSwitch && savedFarmId && this.farms.find(f => Number(f.id) === Number(savedFarmId))) {
          this.activeFarmId = Number(parseInt(savedFarmId, 10));
      } else if (this.farms.length > 0) {
          const defaultFarm = this.farms.find(f => Number(f.id) > 0) || this.farms[0];
          this.activeFarmId = Number(defaultFarm.id);
      }
      this.renderFarmDropdown();

      this.allFields = data.fields || [];
      this.fields = filterFieldsForFarmView(this.allFields, this.activeFarmId ?? 1);
      if (this.fields.length === 0 && this.allFields.length > 0) {
        const inferred = inferFarmIdFromFieldOwnership(this.allFields, this.farms);
        if (inferred != null && Number(inferred) !== Number(this.activeFarmId)) {
          this.activeFarmId = Number(inferred);
          try {
            localStorage.setItem(farmKey, String(inferred));
          } catch (_) {
            /* ignore */
          }
          this.fields = filterFieldsForFarmView(this.allFields, this.activeFarmId);
          if (typeof this.renderFarmDropdown === 'function') this.renderFarmDropdown();
        }
      }

      const husbandryBuildings = ensureHusbandryArray(data.animals);
      if (husbandryBuildings.length > 0) {
        const allAnimals = [];
        husbandryBuildings.forEach((building) => {
          const inner = getAnimalListFromBuilding(building);
          if (!inner.length) return;
          const ownerFarmId = building.ownerFarmId ?? building.farmId;
          const hid = building.id ?? building.buildingId;
          const hname = building.name;
          inner.forEach((animal) => {
            allAnimals.push({
              ...animal,
              subType: animal.subType || animal.type || animal.animalType,
              ownerFarmId: animal.ownerFarmId ?? ownerFarmId,
              farmId: animal.farmId ?? ownerFarmId,
              husbandryId: animal.husbandryId ?? hid,
              husbandryName: animal.husbandryName ?? hname,
            });
          });
        });
        const uniqueAnimals = [];
        const seenIds = new Set();
        allAnimals.forEach((animal) => {
          if (!seenIds.has(animal.id)) {
            seenIds.add(animal.id);
            uniqueAnimals.push(animal);
          }
        });
        this.animals = uniqueAnimals;
      } else {
        this.animals = [];
      }
      this.resyncRealtimeAfterBootstrap();
      if (typeof window.farmDashNotifyDataReady === "function") {
        window.farmDashNotifyDataReady();
      }
      return true;
    }
    return false;
  } catch (error) {
    return false;
  }
}

export function setStorage(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (error) { return false; }
}

export function getStorage(key) {
  try { const item = localStorage.getItem(key); return item ? JSON.parse(item) : null; } catch (error) { return null; }
}

export function deleteStorage(key) {
  try { localStorage.removeItem(key); } catch (error) {}
}

export function clearSavedData() {
  if (confirm("Are you sure you want to clear the saved folder data?")) {
    this.deleteStorage("livestockFolderData");
    const pathEl = document.getElementById("folder-path");
    if (pathEl) pathEl.textContent = "No folder selected";
    const clearBtn = document.getElementById("clear-folder-btn");
    if (clearBtn) clearBtn.classList.add("d-none");
    document.getElementById("folder-selection").classList.remove("d-none");
    document.getElementById("dashboard-content").classList.add("d-none");
    this.animals = [];
    this.filteredAnimals = [];
    this.lastAnimalsDataHash = null;
    if (this.dataTable) { this.dataTable.destroy(); this.dataTable = null; }
  }
}

export function unloadData() {
  if (confirm("Are you sure you want to unload all farm data?")) {
    this.deleteStorage("livestockFolderData");
    const pathEl = document.getElementById("folder-path");
    if (pathEl) pathEl.textContent = "No folder selected";
    const clearBtn = document.getElementById("clear-folder-btn");
    if (clearBtn) clearBtn.classList.add("d-none");
    document.getElementById("main-navbar").classList.add("d-none");
    document.getElementById("folder-selection").classList.remove("d-none");
    document.getElementById("landing-page").classList.add("d-none");
    document.getElementById("dashboard-content").classList.add("d-none");
    document.getElementById("section-content").classList.add("d-none");
    this.animals = []; this.filteredAnimals = []; this.lastAnimalsDataHash = null;
    this.placeables = []; this.playerFarms = []; this.selectedFarm = null; this.selectedFarmId = null; this.savedFolderData = null;
    if (this.dataTable) { this.dataTable.destroy(); this.dataTable = null; }
  }
}

export function refreshData() {
  if (!this.savedFolderData) return;
  const modal = new bootstrap.Modal(document.getElementById("refreshDataModal"));
  modal.show();
}

export function confirmRefreshData(useFiles) {
  if (useFiles) {
    this.storeDataForComparison();
    this.isRefreshing = true;
    document.getElementById("folder-input")?.click();
  } else {
    this.storeDataForComparison();
    const currentSection = this.getCurrentSection();
    this.isRefreshing = true;
    if (this.savedFolderData.farmsData) this.parseFarmsData(this.savedFolderData.farmsData);
    this.tryLoadApiData().then(() => {
      if (!this.animals || this.animals.length === 0) {
        if (this.savedFolderData.xmlData) this.parseRealisticLivestockData(this.savedFolderData.xmlData);
        else if (this.savedFolderData.placeablesData) this.parsePlaceablesData(this.savedFolderData.placeablesData);
      }
      this.updateLandingPageCounts();
      if (currentSection === "livestock") { this.updateSummaryCards(); this.renderAnimalsTable(); }
    });
    if (this.savedFolderData.environmentData) this.parseEnvironmentData(this.savedFolderData.environmentData);
    this.isRefreshing = false;
    try { this.compareDataAndShowChanges(); } catch (comparisonError) { this.preRefreshData = null; }
  }
}

export async function loadSavedFolder() {
  const savedData = this.getStorage("livestockFolderData");
  if (savedData) {
    try {
      this.savedFolderData = savedData;
      document.getElementById("folder-path").textContent = this.savedFolderData.folderName + " (saved)";
      if (this.savedFolderData.xmlData) {
        if (this.savedFolderData.farmsData) this.parseFarmsData(this.savedFolderData.farmsData);
        else {
          if (this.savedFolderData.placeablesData) this.parsePlaceablesData(this.savedFolderData.placeablesData);
          if (this.savedFolderData.environmentData) this.parseEnvironmentData(this.savedFolderData.environmentData);
          this.showDashboard();
        }
        const clearBtn = document.getElementById("clear-folder-btn");
        if (clearBtn) clearBtn.classList.remove("d-none");
        this.showNavbar();
      }
    } catch (error) { this.deleteStorage("livestockFolderData"); }
  }
}

export async function handleFolderSelection(event) {
  const files = Array.from(event.target.files);
  const animalSystemFile = files.find((file) => file.name === "animalSystem.xml");
  const placeablesFile = files.find((file) => file.name === "placeables.xml");
  const farmsFile = files.find((file) => file.name === "farms.xml");
  const environmentFile = files.find((file) => file.name === "environment.xml");
  if (!animalSystemFile) { alert("animalSystem.xml not found."); return; }
  const folderName = animalSystemFile.webkitRelativePath.split("/")[0];
  const pathEl = document.getElementById("folder-path");
  if (pathEl) pathEl.textContent = folderName;
  try {
    const xmlContent = await this.readFileAsText(animalSystemFile);
    let placeablesContent = placeablesFile ? await this.readFileAsText(placeablesFile) : null;
    let farmsContent = farmsFile ? await this.readFileAsText(farmsFile) : null;
    let environmentContent = environmentFile ? await this.readFileAsText(environmentFile) : null;
    const folderData = { folderName: folderName, xmlData: xmlContent, placeablesData: placeablesContent, farmsData: farmsContent, environmentData: environmentContent, lastUpdated: new Date().toISOString() };
    this.setStorage("livestockFolderData", folderData);
    this.savedFolderData = folderData;
    const wasRefreshing = this.isRefreshing;
    const currentSection = wasRefreshing ? this.getCurrentSection() : null;
    if (farmsContent) this.parseFarmsData(farmsContent);
    else {
      if (placeablesContent) this.parsePlaceablesData(placeablesContent);
      if (environmentContent) this.parseEnvironmentData(environmentContent);
      if (!wasRefreshing) this.showDashboard();
    }
    const clearBtnPick = document.getElementById("clear-folder-btn");
    if (clearBtnPick) clearBtnPick.classList.remove("d-none");
    this.showNavbar();
    if (wasRefreshing) {
      this.updateLandingPageCounts();
      if (currentSection === "livestock") { this.updateSummaryCards(); this.renderAnimalsTable(); }
      this.isRefreshing = false;
      if (this.preRefreshData) this.compareDataAndShowChanges();
    }
  } catch (error) { this.isRefreshing = false; this.preRefreshData = null; }
}

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = (e) => reject(e);
    reader.readAsText(file);
  });
}

export function renderFarmDropdown() {
    const container = document.getElementById("farm-dropdown-container");
    if (!container) return;
    if (!this.isFarmDropdownEnabled()) {
        container.innerHTML = "";
        container.classList.remove("d-flex");
        container.classList.add("d-none");
        return;
    }
    if (!Array.isArray(this.farms) || this.farms.length === 0) return;
    const playerFarms = this.farms.filter(f => Number(f.id) > 0);
    if (playerFarms.length === 0) {
        container.classList.remove("d-flex"); container.classList.add("d-none"); return;
    }
    container.classList.remove("d-none"); container.classList.add("d-flex");
    let currentFarm =
      playerFarms.find(f => Number(f.id) === Number(this.activeFarmId)) || playerFarms[0];
    let html = `
        <div class="dropdown">
            <button class="btn btn-farm-accent btn-sm dropdown-toggle fw-bold text-dark" type="button" id="farmDropdownBtn" data-bs-toggle="dropdown" aria-expanded="false">
                <i class="bi bi-house-door me-1"></i>${currentFarm.name}
            </button>
            <ul class="dropdown-menu dropdown-menu-dark dropdown-menu-end shadow border-farm-accent" aria-labelledby="farmDropdownBtn">
    `;
    playerFarms.forEach(farm => {
        const isActive = Number(farm.id) === Number(this.activeFarmId) ? 'active bg-farm-accent text-dark fw-bold' : '';
        html += `<li><a class="dropdown-item ${isActive}" href="#" onclick="dashboard.switchFarm(${Number(farm.id)}, event)">${farm.name}</a></li>`;
    });
    html += `</ul></div>`;
    container.innerHTML = html;
}

export function switchFarm(farmId, event) {
    if (!this.isFarmDropdownEnabled()) return;
    if (event) event.preventDefault();
    const fid = Number(farmId);
    if (!Number.isFinite(fid) || fid <= 0) return;
    if (Number(this.activeFarmId) === fid) return;
    this.activeFarmId = fid;
    localStorage.setItem(`dashboard_active_farm_${String(this.activeServerId)}`, String(fid));
    resetCrossFarmVisualizationCaches(this);
    this.renderFarmDropdown();

    if (this.realtimeConnector?.updateAnimalsData && this.husbandryData) {
        this.realtimeConnector.updateAnimalsData(this.husbandryData);
    }

    if (this.allFields && this.allFields.length) {
        this.fields = filterFieldsForFarmView(this.allFields, fid);
    }

    const currentSection = this.getCurrentSection ? this.getCurrentSection() : null;
    if (currentSection && currentSection !== 'landing' && currentSection !== 'dashboard') {
        if (this.showSection) this.showSection(currentSection);
    } else {
        if (this.updateLandingPageCounts) this.updateLandingPageCounts();
    }
    if (this.updateNavbar) this.updateNavbar();

}
export function openSetup() {
  if (!isFarmDashLocalConfigHost()) {
    if (this.showAlert) {
      this.showAlert(
        "Server and save setup is only available on the PC running Farm Dashboard.",
        "info"
      );
    }
    return;
  }
  if (typeof window.farmDashAPI?.openSetup === "function") {
    window.farmDashAPI.openSetup();
    return;
  }
  window.location.href = "/setup.html";
}
