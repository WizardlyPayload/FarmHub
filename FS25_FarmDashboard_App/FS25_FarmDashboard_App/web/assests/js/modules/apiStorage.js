// FS25 FarmDashboard | apiStorage.js | v2.0.0

/**
 * API & Storage Module
 * Handles all data fetching and Multi-Server state management
 */

/** Must match ``_schemaVersion`` written with ``serverLiveCache/*.json`` (see serverDataCache.js). */
export const SERVER_LIVE_CACHE_SCHEMA_VERSION = '1.0';

import { filterFieldsForFarmView, invalidateFieldsClientCache } from './fields.js';
import { t } from '../i18n/i18n.js';
import { isFarmDashLocalConfigHost } from './viewer-mode.js';

/** Persist active server + farm for SimHub (`GET /api/simhub-session`) — desktop app only. */
function pushSimHubLiveContext(dashboard) {
  try {
    if (typeof window === "undefined" || typeof window.farmDashAPI?.setSimHubLiveContext !== "function") {
      return;
    }
    const serverId = dashboard?.activeServerId;
    if (!serverId) return;
    const farmId = Math.max(1, Number(dashboard?.activeFarmId ?? 1) || 1);
    window.farmDashAPI.setSimHubLiveContext({ serverId: String(serverId), farmId });
  } catch (_) {
    /* ignore */
  }
}

/** Clear per-farm / per-field UI caches so rapid farm or save switches cannot paint stale field cards. */
function resetCrossFarmVisualizationCaches(dashboard) {
  try {
    invalidateFieldsClientCache();
  } catch (_) {}
  if (typeof window !== 'undefined') {
    window.__fieldRulesInsightByRef = {};
    window.__fieldRulesSuggestionSource = undefined;
    window.__fieldRulesCacheKey = null;
    window.__fieldRulesCacheHash = null;
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

/** Active server for `/api/*` calls (fetch shim + WS filter). */
function resolveServerIdForApiFetch() {
  try {
    const fromDash = window.dashboard?.activeServerId;
    if (fromDash != null && String(fromDash).trim() !== "") return String(fromDash).trim();
    const fromLs =
      typeof localStorage !== "undefined"
        ? localStorage.getItem("dashboard_active_server")
        : null;
    if (fromLs != null && String(fromLs).trim() !== "") return String(fromLs).trim();
  } catch (_) {
    /* ignore */
  }
  return "";
}

const originalFetch = window.fetch;
window.fetch = async function() {
    let [resource, config] = arguments;
    if (typeof resource === 'string' && resource.includes('/api/') && !resource.includes('serverId=')) {
        const serverId = resolveServerIdForApiFetch();
        if (serverId) {
            const separator = resource.includes('?') ? '&' : '?';
            resource = `${resource}${separator}serverId=${encodeURIComponent(serverId)}`;
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
                    const serverId = resolveServerIdForApiFetch();
                    if (data.serverId && serverId && String(data.serverId) !== String(serverId)) return;
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
                if (container) {
                    const label = t('apiStorage.noServersFound');
                    container.innerHTML = `<span class="badge bg-danger">${label}</span>`;
                }
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
        this.showAlert(t("apiStorage.toastCouldNotLoadData"), "warning");
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

    pushSimHubLiveContext(this);

  } finally {
    this._switchingServer = false;
  }
}

/**
 * Run the same data/apply flow as a server switch, but for the already-active server.
 * This aligns startup behavior with the manual "switch server/save" path that reliably populates Home cards.
 */
export async function refreshActiveServerData() {
  if (!this.activeServerId) return false;
  const ok = await this.tryLoadApiData();
  if (!ok) return false;

  resetCrossFarmVisualizationCaches(this);
  const currentSection = this.getCurrentSection ? this.getCurrentSection() : null;
  if (currentSection && currentSection !== "landing" && currentSection !== "dashboard") {
    if (this.showSection) this.showSection(currentSection);
  } else {
    if (this.updateLandingPageCounts) this.updateLandingPageCounts();
  }
  if (this.updateNavbar) this.updateNavbar();
  pushSimHubLiveContext(this);
  return true;
}

function showDashboardOrFallback(dashboard) {
  dashboard.isDataLoaded = true;
  if (typeof dashboard.showDashboard === "function") {
    dashboard.showDashboard();
  } else {
    document.getElementById("folder-selection").classList.add("d-none");
    document.getElementById("landing-page").classList.remove("d-none");
    document.getElementById("main-navbar").classList.remove("d-none");
    if (dashboard.updateLandingPageCounts) dashboard.updateLandingPageCounts();
    if (dashboard.updateNavbar) dashboard.updateNavbar();
    if (window.location.hash) dashboard.handleHashChange();
  }
}

async function tryHydrateFromDesktopServerCache(dashboard) {
  try {
    if (
      !dashboard?.activeServerId ||
      typeof window === "undefined" ||
      typeof window.farmDashAPI?.readServerLiveCache !== "function"
    ) {
      return false;
    }
    const res = await window.farmDashAPI.readServerLiveCache(String(dashboard.activeServerId));
    if (!res || !res.ok || !res.data || typeof res.data !== "object") return false;
    applyApiMergedDataPayload(dashboard, res.data);
    persistBrowserMergedSnapshot(dashboard, res.data);
    return hasRenderableDashboardData(dashboard);
  } catch (_) {
    return false;
  }
}

async function hydrateFromFirstServerWithData(dashboard, preferredServerId = "") {
  try {
    const servers = Array.isArray(dashboard?.availableServers) ? dashboard.availableServers : [];
    if (!servers.length) return false;
    const apiBaseURL = dashboard.getAPIBaseURL();
    const preferred = String(preferredServerId || "").trim();
    const ordered = preferred
      ? [
          ...servers.filter((s) => String(s?.id) === preferred),
          ...servers.filter((s) => String(s?.id) !== preferred),
        ]
      : servers;
    for (const s of ordered) {
      const sid = String(s?.id ?? "");
      if (!sid) continue;
      const r = await originalFetch(`${apiBaseURL}/api/data?serverId=${encodeURIComponent(sid)}`);
      if (!r.ok) continue;
      const data = await r.json();
      if (!data || data.error) continue;
      dashboard.activeServerId = s.id;
      try {
        localStorage.setItem("dashboard_active_server", String(s.id));
      } catch (_) {
        /* ignore */
      }
      if (typeof dashboard.renderServerTabs === "function") {
        dashboard.renderServerTabs();
      }
      applyApiMergedDataPayload(dashboard, data);
      persistBrowserMergedSnapshot(dashboard, data);
      return hasRenderableDashboardData(dashboard);
    }
    return false;
  } catch (_) {
    return false;
  }
}

export async function checkAPIAvailability() {
  try {
    await this.loadServersAndTabs();
    // Prefer the last server the user viewed; only fall back to others if it has no data.
    const preferredServerId = this.activeServerId != null ? String(this.activeServerId) : "";
    const earlyLiveServer = await hydrateFromFirstServerWithData(this, preferredServerId);
    if (earlyLiveServer) {
      showDashboardOrFallback(this);
      if (typeof window.farmDashNotifyDataReady === "function") {
        window.farmDashNotifyDataReady();
      }
      return;
    }
    if (this.activeServerId) {
      const snap = readBrowserMergedSnapshot(this.activeServerId);
      if (snap?.payload && !snap.payload.error) {
        applyApiMergedDataPayload(this, snap.payload);
        if (hasRenderableDashboardData(this)) {
          showDashboardOrFallback(this);
        }
      } else {
        const diskHydrated = await tryHydrateFromDesktopServerCache(this);
        if (diskHydrated) {
          showDashboardOrFallback(this);
        }
      }
    }

    const apiBaseURL = this.getAPIBaseURL();
    const response = await fetch(`${apiBaseURL}/api/status`);
    if (response.ok) {
      const loaded = await this.tryLoadApiData();
      if (loaded) {
        showDashboardOrFallback(this);
        return;
      }
      const switchedToLiveServer = await hydrateFromFirstServerWithData(this, preferredServerId);
      if (switchedToLiveServer) {
        showDashboardOrFallback(this);
        return;
      }
      if (hasRenderableDashboardData(this)) {
        showDashboardOrFallback(this);
        if (typeof window.farmDashNotifyDataReady === "function") {
          window.farmDashNotifyDataReady();
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
      this.scheduleStartupHydrationRetry();
    }
  } catch (error) {}
  if (hasRenderableDashboardData(this)) {
    showDashboardOrFallback(this);
    if (typeof window.farmDashNotifyDataReady === "function") {
      window.farmDashNotifyDataReady();
    }
    return;
  }
  this.loadSavedFolder();
  this.scheduleStartupHydrationRetry();
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

/** Last merged `/api/data` payload in localStorage so a reopened tab shows data before the host finishes hydrating. */
const BROWSER_SNAPSHOT_PREFIX = "farmdash_merged_snapshot_v1_";
const BROWSER_SNAPSHOT_MAX_CHARS = 4_000_000;
let _browserSnapshotSaveTimer = null;
let _startupHydrationRetryTimer = null;

function browserSnapshotKey(serverId) {
  return `${BROWSER_SNAPSHOT_PREFIX}${String(serverId)}`;
}

export function hasRenderableDashboardData(dashboard) {
  if (!dashboard) return false;
  if (dashboard.luaAvailable || dashboard.xmlAvailable) return true;
  if (Array.isArray(dashboard.allFields) && dashboard.allFields.length > 0) return true;
  if (Array.isArray(dashboard.animals) && dashboard.animals.length > 0) return true;
  if (Array.isArray(dashboard.vehicles) && dashboard.vehicles.length > 0) return true;
  if (dashboard.mapTitle || dashboard.savegameName) return true;
  return false;
}

export function readBrowserMergedSnapshot(serverId) {
  if (serverId == null || typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(browserSnapshotKey(serverId));
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || typeof o !== "object" || !o.payload || typeof o.payload !== "object") return null;
    return o;
  } catch (_) {
    return null;
  }
}

export function persistBrowserMergedSnapshot(dashboard, data) {
  if (!dashboard?.activeServerId || !data || typeof data !== "object" || data.error) return;
  if (typeof localStorage === "undefined") return;
  try {
    const copy = JSON.parse(JSON.stringify(data));
    delete copy.timestamp;
    const wrapped = {
      savedAt: new Date().toISOString(),
      serverId: String(dashboard.activeServerId),
      payload: copy,
    };
    const s = JSON.stringify(wrapped);
    if (s.length > BROWSER_SNAPSHOT_MAX_CHARS) return;
    localStorage.setItem(browserSnapshotKey(dashboard.activeServerId), s);
  } catch (_) {
    /* quota or private mode */
  }
}

/** Debounced: realtime ticks often; avoid writing multi‑MB JSON every second. */
export function scheduleBrowserMergedSnapshotPersist(dashboard, data) {
  if (!dashboard?.activeServerId || !data || data.error) return;
  clearTimeout(_browserSnapshotSaveTimer);
  _browserSnapshotSaveTimer = setTimeout(() => {
    _browserSnapshotSaveTimer = null;
    persistBrowserMergedSnapshot(dashboard, data);
  }, 2500);
}

/**
 * Apply a merged dashboard payload (same shape as `GET /api/data`) onto the LivestockDashboard instance.
 * Used by REST bootstrap and by browser snapshot restore on cold open.
 */
export function applyApiMergedDataPayload(dashboard, data) {
  if (!dashboard || !data || data.error) return;

  dashboard.vehicles = data.vehicles || [];
  dashboard.economy = data.economy || {};
  dashboard.finance = data.finance || {};
  dashboard.weather = data.weather || {};
  dashboard.production = data.production || {};
  dashboard.pastures = data.pastures || [];
  dashboard.mapTitle = data.mapTitle || null;
  dashboard.savegameName = data.savegameName || null;
  dashboard.dataSource = data.dataSource || "unknown";
  dashboard.xmlAvailable = data.xmlAvailable || false;
  dashboard.luaAvailable = data.luaAvailable || false;
  dashboard.money = data.money || 0;
  dashboard.gameSettings = data.gameSettings || data.settings || {};
  dashboard.husbandryData = ensureHusbandryArray(data.animals);

  dashboard.farms = ensureArray(data.farmInfo);
  dashboard.playerFarms = dashboard.farms;
  const mpFarmSwitch = dashboard.isFarmDropdownEnabled();
  const farmKey = `dashboard_active_farm_${String(dashboard.activeServerId)}`;
  let savedFarmId = mpFarmSwitch ? localStorage.getItem(farmKey) : null;
  if (mpFarmSwitch && savedFarmId && dashboard.farms.find((f) => Number(f.id) === Number(savedFarmId))) {
    dashboard.activeFarmId = Number(parseInt(savedFarmId, 10));
  } else if (dashboard.farms.length > 0) {
    const defaultFarm = dashboard.farms.find((f) => Number(f.id) > 0) || dashboard.farms[0];
    dashboard.activeFarmId = Number(defaultFarm.id);
  }
  dashboard.renderFarmDropdown();

  dashboard.allFields = data.fields || [];
  dashboard.fields = filterFieldsForFarmView(dashboard.allFields, dashboard.activeFarmId ?? 1);
  if (dashboard.fields.length === 0 && dashboard.allFields.length > 0) {
    const inferred = inferFarmIdFromFieldOwnership(dashboard.allFields, dashboard.farms);
    if (inferred != null && Number(inferred) !== Number(dashboard.activeFarmId)) {
      dashboard.activeFarmId = Number(inferred);
      try {
        localStorage.setItem(farmKey, String(inferred));
      } catch (_) {
        /* ignore */
      }
      dashboard.fields = filterFieldsForFarmView(dashboard.allFields, dashboard.activeFarmId);
      if (typeof dashboard.renderFarmDropdown === "function") dashboard.renderFarmDropdown();
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
    dashboard.animals = uniqueAnimals;
  } else {
    dashboard.animals = [];
  }

  dashboard.resyncRealtimeAfterBootstrap();
  if (typeof window.farmDashNotifyDataReady === "function") {
    window.farmDashNotifyDataReady();
  }
  pushSimHubLiveContext(dashboard);
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
          const diskHydrated = await tryHydrateFromDesktopServerCache(this);
          if (diskHydrated) {
            return true;
          }
          if (!hasRenderableDashboardData(this)) {
            this.applyEmptyApiState();
          }
          if (typeof window.farmDashNotifyDataReady === "function") {
            window.farmDashNotifyDataReady();
          }
          return hasRenderableDashboardData(this);
        }
        return false;
      }

      applyApiMergedDataPayload(this, data);
      persistBrowserMergedSnapshot(this, data);
      if (typeof this.updateLandingPageCounts === "function") {
        this.updateLandingPageCounts();
      }
      return true;
    }
    return false;
  } catch (error) {
    return false;
  }
}

/**
 * Cold boot race guard:
 * first `/api/data` may return "Waiting for data..." while main process finishes hydration.
 * Retry briefly so Home cards populate without manual server/save switching.
 */
export function scheduleStartupHydrationRetry() {
  if (_startupHydrationRetryTimer) return;
  let attempts = 0;
  const maxAttempts = 12;
  const run = async () => {
    attempts += 1;
    try {
      const loaded = await this.tryLoadApiData();
      if (loaded || hasRenderableDashboardData(this)) {
        if (_startupHydrationRetryTimer) {
          clearTimeout(_startupHydrationRetryTimer);
          _startupHydrationRetryTimer = null;
        }
        showDashboardOrFallback(this);
        return;
      }
    } catch (_) {
      /* ignore */
    }
    if (attempts >= maxAttempts) {
      if (_startupHydrationRetryTimer) {
        clearTimeout(_startupHydrationRetryTimer);
        _startupHydrationRetryTimer = null;
      }
      return;
    }
    _startupHydrationRetryTimer = setTimeout(run, 1500);
  };
  _startupHydrationRetryTimer = setTimeout(run, 700);
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
  if (confirm(t("apiStorage.confirmClearSavedFolder"))) {
    this.deleteStorage("livestockFolderData");
    const pathEl = document.getElementById("folder-path");
    if (pathEl) pathEl.textContent = t("apiStorage.folderNoneSelected");
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
  if (confirm(t("apiStorage.confirmUnloadAll"))) {
    this.deleteStorage("livestockFolderData");
    const pathEl = document.getElementById("folder-path");
    if (pathEl) pathEl.textContent = t("apiStorage.folderNoneSelected");
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
  if (!animalSystemFile) { alert(t("apiStorage.toastAnimalSystemXmlNotFound")); return; }
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

    pushSimHubLiveContext(this);

}
export function openSetup() {
  if (!isFarmDashLocalConfigHost()) {
    if (this.showAlert) {
      this.showAlert(t("apiStorage.toastServerSetupPcOnly"), "info");
    }
    return;
  }
  if (typeof window.farmDashAPI?.openSetup === "function") {
    window.farmDashAPI.openSetup();
    return;
  }
  window.location.href = "/setup.html";
}

if (typeof window !== "undefined") {
  window.farmDashScheduleMergedSnapshotPersist = scheduleBrowserMergedSnapshotPersist;
}
