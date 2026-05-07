// FS25 FarmDashboard | realtime-connector.js | v2.0.0

import { t } from "./i18n/i18n.js";

/** Set true only when diagnosing livestock change notifications */
const VERBOSE_CHANGE_LOG = false;

/**
 * Animal lists are filtered by selected farm. Switching farm/server/save replaces the list — not the same as animals leaving the map.
 * Skip add/remove toasts when the dashboard view context changed since the last payload.
 */
function shouldSkipLivestockChangeToasts(oldState, dashboard) {
  if (!oldState || !dashboard) return false;
  const hadCtx =
    oldState.contextFarmId !== undefined ||
    oldState.contextServerId !== undefined ||
    oldState.contextSaveKey !== undefined;
  if (!hadCtx) return false;

  const farm = Number(dashboard.activeFarmId ?? 1);
  const srv = String(
    dashboard.activeServerId ??
      (typeof localStorage !== "undefined"
        ? localStorage.getItem("dashboard_active_server") || ""
        : "")
  );
  const save = String(dashboard.savegameName ?? "");

  if (oldState.contextFarmId !== undefined && oldState.contextFarmId !== farm) {
    return true;
  }
  if (
    oldState.contextServerId !== undefined &&
    String(oldState.contextServerId) !== srv
  ) {
    return true;
  }
  const oldSk = oldState.contextSaveKey;
  if (oldSk !== undefined && oldSk !== "" && save !== oldSk) {
    return true;
  }
  return false;
}

class RealtimeConnector {
  constructor(dashboard) {
    this.dashboard = dashboard;
    this.ws = null;
    // Same host:port as the page (LAN tablet, localhost, or custom bind) — do not assume :8766 only.
    const loc = typeof window !== "undefined" && window.location ? window.location : null;
    const wsProto = loc && loc.protocol === "https:" ? "wss:" : "ws:";
    if (loc && /^https?:$/i.test(String(loc.protocol || ""))) {
      this.httpEndpoint = loc.origin;
      this.wsEndpoint = `${wsProto}//${loc.host}`;
    } else {
      const protocol = loc ? loc.protocol : "http:";
      const hostname = loc && loc.hostname ? loc.hostname : "127.0.0.1";
      this.httpEndpoint = `${protocol}//${hostname}:8766`;
      this.wsEndpoint = `${wsProto}//${hostname}:8766`;
    }
    this.isConnected = false;
    this.reconnectInterval = 5000;
    this.reconnectTimer = null;
    this.updateInterval = 1000;
    this.updateTimer = null;
    this.useWebSocket = true;
    this.fileCheckInterval = 2000;
    this.lastFileData = null;

    // Store previous data for change comparison
    this.previousData = null;
    this.lastChangeCheck = 0;
    /** Skip handleRealtimeData when merged JSON unchanged (ignores volatile `timestamp`). */
    this.lastRealtimePayloadKey = null;
    /** Milliseconds between /api/data polls when the tab is visible (hidden tab pauses polling). */
    this.httpPollIntervalMs = 8000;
    this._httpPollVisibilityHooked = false;
    /** Throttle expensive landing tile refresh while user is deep in another tab. */
    this._lastLandingCountsFromAnimalsAt = 0;
  }

  // Helper function to generate consistent hash from string
  hashCode(str) {
    let hash = 0;
    if (str.length === 0) return hash;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }

  // Helper function for seeded random number generation
  seededRandom(seed) {
    let currentSeed = seed;
    return function () {
      currentSeed = (currentSeed * 9301 + 49297) % 233280;
      return currentSeed / 233280;
    };
  }

  init() {
    this.checkConnectionMethod();
    this.setupStatusIndicator();
  }

  checkConnectionMethod() {
    fetch(`${this.httpEndpoint}/api/status`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        this.isConnected = true;
        this.updateConnectionStatus(true); // Show online badge immediately
        this.enableAPIMode();
        this.startHTTPPolling(); // Use HTTP polling instead of WebSocket for now
      })
      .catch((error) => {
        this.startFileMonitoring();
      });
  }

  async connectWebSocket() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      let wsUrl = this.wsEndpoint;
      const h = typeof window !== "undefined" && window.location ? window.location.hostname : "";
      if (h && h !== "127.0.0.1" && h !== "localhost") {
        try {
          const tr = await fetch(`${this.httpEndpoint}/api/lan-ws-token`, { cache: "no-store" });
          if (tr.ok) {
            const j = await tr.json();
            if (j && j.token) {
              const sep = wsUrl.includes("?") ? "&" : "?";
              wsUrl = `${wsUrl}${sep}t=${encodeURIComponent(j.token)}`;
            }
          }
        } catch (_) {
          /* fall through — WS may fail; HTTP polling remains */
        }
      }
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.updateConnectionStatus(true);

        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          this.handleRealtimeData(parsed);
        } catch (error) {
          console.error(
            "[RealtimeConnector] Error parsing WebSocket data:",
            error
          );
        }
      };

      this.ws.onerror = (error) => {
        console.error("[RealtimeConnector] WebSocket error:", error);
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.updateConnectionStatus(false);
        this.scheduleReconnect();
      };
    } catch (error) {
      console.error("[RealtimeConnector] Failed to connect WebSocket:", error);
      this.fallbackToHTTP();
    }
  }

  fallbackToHTTP() {
    this.startHTTPPolling();
  }

  startHTTPPolling() {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
    }

    const self = this;
    this._httpPollData = function (bypassPayloadDedupe) {
      fetch(`${self.httpEndpoint}/api/data`)
        .then((response) => {
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          return response.json();
        })
        .then((data) => {
          if (!data || typeof data !== "object") {
            self.handleRealtimeData(data);
            self.isConnected = true;
            self.updateConnectionStatus(true);
            return;
          }
          if (data.error === "Waiting for data...") {
            self.lastRealtimePayloadKey = null;
            self.handleRealtimeData(data);
            self.isConnected = true;
            self.updateConnectionStatus(true);
            return;
          }
          if (bypassPayloadDedupe) {
            self.lastRealtimePayloadKey = null;
          }
          const rest = { ...data };
          delete rest.timestamp;
          delete rest.dataTimestamps;
          delete rest.fieldStatusHistory;
          const farmId = Number(self.dashboard?.activeFarmId ?? 1);
          const srv = String(
            self.dashboard?.activeServerId ??
              (typeof localStorage !== "undefined"
                ? localStorage.getItem("dashboard_active_server") || ""
                : "")
          );
          const payloadKey =
            JSON.stringify(rest) + "|" + farmId + "|" + srv;
          if (self.lastRealtimePayloadKey === payloadKey) {
            self.isConnected = true;
            self.updateConnectionStatus(true);
            return;
          }
          self.lastRealtimePayloadKey = payloadKey;
          self.handleRealtimeData(data);
          self.isConnected = true;
          self.updateConnectionStatus(true);
        })
        .catch((error) => {
          console.error("[RealtimeConnector] HTTP polling error:", error);
          self.isConnected = false;
          self.updateConnectionStatus(false);
        });
    };

    const poll = () => this._httpPollData(false);
    poll();
    this.updateTimer = setInterval(poll, this.httpPollIntervalMs);

    if (typeof document !== "undefined" && !this._httpPollVisibilityHooked) {
      this._httpPollVisibilityHooked = true;
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
          if (this.updateTimer) {
            clearInterval(this.updateTimer);
            this.updateTimer = null;
          }
        } else if (typeof this._httpPollData === "function") {
          this._httpPollData(false);
          if (!this.updateTimer) {
            this.updateTimer = setInterval(() => this._httpPollData(false), this.httpPollIntervalMs);
          }
        }
      });
    }

    if (this.dashboard._pendingRealtimeBootstrapResync) {
      this.dashboard._pendingRealtimeBootstrapResync = false;
      this.clearPayloadDedupeCache();
      this.refreshHttpDataNow();
    }
  }

  /**
   * Clears the last /api/data fingerprint so the next poll applies updates even if JSON is unchanged.
   * Call before a manual “refresh” or after actions that must re-run DOM hooks (farm switch, etc.).
   */
  clearPayloadDedupeCache() {
    this.lastRealtimePayloadKey = null;
  }

  /** One immediate /api/data fetch; bypasses same-payload dedupe (always runs handleRealtimeData if OK). */
  refreshHttpDataNow() {
    if (typeof this._httpPollData === "function") {
      this._httpPollData(true);
    }
  }

  startFileMonitoring() {
    const poll = () => {
      const api =
        typeof window !== "undefined" && window.farmDashAPI
          ? window.farmDashAPI
          : null;
      if (!api || typeof api.readLocalFarmdashDataJson !== "function") {
        return;
      }
      api
        .readLocalFarmdashDataJson()
        .then((res) => {
          if (!res || !res.ok || res.data == null) {
            this.isConnected = false;
            this.updateConnectionStatus(false);
            return;
          }
          const jsonData = res.data;
          if (JSON.stringify(jsonData) !== JSON.stringify(this.lastFileData)) {
            this.lastFileData = jsonData;
            this.handleRealtimeData(jsonData);
            this.isConnected = true;
            this.updateConnectionStatus(true);
          }
        })
        .catch(() => {
          this.isConnected = false;
          this.updateConnectionStatus(false);
        });
    };

    poll();
    setInterval(poll, this.fileCheckInterval);
  }

  /**
   * HTTP polling returns the merged object (+ timestamp). WebSocket sends
   * { type: 'data', serverId, data: merged, timestamp } from main process broadcast.
   */
  normalizeRealtimePayload(raw) {
    if (!raw || typeof raw !== "object") return null;
    if (raw.type === "data" && raw.data != null && typeof raw.data === "object") {
      return raw.data;
    }
    return raw;
  }

  inferBestFarmIdFromPayload(data) {
    const counts = new Map();
    const bump = (v) => {
      const id = Number(v);
      if (!Number.isFinite(id) || id <= 0) return;
      counts.set(id, (counts.get(id) || 0) + 1);
    };

    if (Array.isArray(data?.fields)) {
      data.fields.forEach((f) => bump(f?.ownerFarmId ?? f?.farmId));
    }
    if (Array.isArray(data?.vehicles)) {
      data.vehicles.forEach((v) => bump(v?.ownerFarmId ?? v?.farmId));
    }
    if (Array.isArray(data?.animals)) {
      data.animals.forEach((h) => {
        bump(h?.ownerFarmId ?? h?.farmId);
      });
    }

    if (counts.size === 0) return null;
    let best = null;
    let bestN = -1;
    for (const [id, n] of counts.entries()) {
      if (n > bestN) {
        bestN = n;
        best = id;
      }
    }
    return best;
  }

  ensureActiveFarmIdForPayload(data) {
    if (!this.dashboard) return;
    const current = Number(this.dashboard.activeFarmId ?? 1);
    const ownsCurrent =
      (Array.isArray(data?.fields) &&
        data.fields.some((f) => Number(f?.ownerFarmId ?? f?.farmId ?? 0) === current)) ||
      (Array.isArray(data?.vehicles) &&
        data.vehicles.some((v) => Number(v?.ownerFarmId ?? v?.farmId ?? 0) === current)) ||
      (Array.isArray(data?.animals) &&
        data.animals.some((h) => Number(h?.ownerFarmId ?? h?.farmId ?? 0) === current));
    if (ownsCurrent) return;

    const inferred = this.inferBestFarmIdFromPayload(data);
    if (!Number.isFinite(inferred) || inferred <= 0 || inferred === current) return;
    this.dashboard.activeFarmId = inferred;
    try {
      const sid = String(
        this.dashboard.activeServerId ??
          (typeof localStorage !== "undefined"
            ? localStorage.getItem("dashboard_active_server") || ""
            : "")
      );
      if (sid) localStorage.setItem(`dashboard_active_farm_${sid}`, String(inferred));
    } catch (_) {
      /* ignore */
    }
  }

  handleRealtimeData(raw) {
    const data = this.normalizeRealtimePayload(raw);
    if (!data) return;

    if (data.error === "Waiting for data...") return;
    this.ensureActiveFarmIdForPayload(data);

    // Store current dashboard state before updating (for change comparison)
    // Use the previously stored state, not the current state
    const oldState = this.previousData;

    if (data.animals) {
      this.dashboard.husbandryData = data.animals;
      this.updateAnimalsData(data.animals);
    }

    if (data.vehicles) {
      this.updateVehiclesData(data.vehicles);
    }

    if (data.fields) {
      this.updateFieldsData(data.fields);
    }

    if (data.production) {
      this.updateProductionData(data.production);
    }

    if (data.finance) {
      this.updateFinanceData(data.finance);
    }

    if (data.weather) {
      this.updateWeatherData(data.weather);
    }

    if (data.economy) {
      this.updateEconomyData(data.economy);
    }

    if (data.gameTime) {
      this.updateGameTime(data.gameTime);
    }

    if (data.farmInfo) {
      this.updateFarmInfo(data.farmInfo);
    }

    // Handle merged data top-level fields from dataMerger
    if (data.mapTitle)     this.dashboard.mapTitle     = data.mapTitle;
    if (data.savegameName) this.dashboard.savegameName = data.savegameName;
    if (data.dataSource)   this.dashboard.dataSource   = data.dataSource;
    if (data.xmlAvailable !== undefined) this.dashboard.xmlAvailable = data.xmlAvailable;
    if (data.luaAvailable !== undefined) this.dashboard.luaAvailable = data.luaAvailable;
    if (data.money !== undefined) this.dashboard.money = data.money;
    if (data.gameSettings || data.settings) {
      this.dashboard.gameSettings = data.gameSettings || data.settings || {};
    }

    this.dashboard.lastUpdate = new Date();
    this.updateLastUpdateTime();

    // Store current state for next comparison (include view context so we don't toast "removed" on farm/save switches)
    const newState = {
      animals: this.dashboard.animals ? [...this.dashboard.animals] : [],
      pastures: this.dashboard.pastures ? [...this.dashboard.pastures] : [],
      gameTime: this.dashboard.gameTime,
      contextFarmId: Number(this.dashboard.activeFarmId ?? 1),
      contextServerId: String(
        this.dashboard.activeServerId ??
          (typeof localStorage !== "undefined"
            ? localStorage.getItem("dashboard_active_server") || ""
            : "")
      ),
      contextSaveKey: String(this.dashboard.savegameName ?? ""),
    };

    // Check for changes and show toast notifications
    if (oldState && this.dashboard.showChangeToasts) {
      const oldCount = oldState.animals ? oldState.animals.length : 0;
      const newCount = newState.animals ? newState.animals.length : 0;

      // Check immediately if animal count changed, otherwise throttle to every 10 seconds
      const now = Date.now();
      const shouldCheckNow =
        oldCount !== newCount ||
        !this.lastChangeCheck ||
        now - this.lastChangeCheck >= 10000;

      if (shouldCheckNow) {
        if (VERBOSE_CHANGE_LOG) {
          console.log(
            `[ChangeDetection] Running change detection check... (count changed: ${
              oldCount !== newCount
            })`
          );
        }
        if (shouldSkipLivestockChangeToasts(oldState, this.dashboard)) {
          if (VERBOSE_CHANGE_LOG) {
            console.log(
              "[ChangeDetection] Skipping livestock toasts — farm/server/save context changed (not real removals)"
            );
          }
        } else {
          this.detectAndShowChanges(oldState);
        }
        this.lastChangeCheck = now;
      }
    }

    this.previousData = newState;

    if (typeof window.farmDashScheduleMergedSnapshotPersist === "function") {
      window.farmDashScheduleMergedSnapshotPersist(this.dashboard, data);
    }

    // Refresh home counts on every merged payload so startup shows data immediately.
    if (this.dashboard && typeof this.dashboard.updateLandingPageCounts === "function") {
      this.dashboard.updateLandingPageCounts();
    }
    if (this.dashboard && typeof this.dashboard.updateNavbar === "function") {
      this.dashboard.updateNavbar();
    }

    if (typeof window.farmDashNotifyDataReady === "function") {
      if (!window.__farmDashRealtimeMergeNotified) {
        window.__farmDashRealtimeMergeNotified = true;
        window.farmDashNotifyDataReady();
      }
    }
  }

  /**
   * Plan v5 A3: read the user-configured global synthetic cap; defaults to 8000 with
   * sensible bounds. Settings panel can expose this via window.farmDashSettings.lod.maxSynthAnimals.
   */
  _getMaxSynthAnimals() {
    let v = 8000;
    try {
      const root = (typeof window !== 'undefined') ? window : null;
      const u = root && root.farmDashSettings && root.farmDashSettings.lod && root.farmDashSettings.lod.maxSynthAnimals;
      if (Number.isFinite(u)) v = Math.floor(u);
      else {
        // Fallback to localStorage so the cap survives reloads when the settings UI persists it there.
        const ls = root && root.localStorage && root.localStorage.getItem('farmdash.lod.maxSynthAnimals');
        const n = ls != null ? Number(ls) : NaN;
        if (Number.isFinite(n)) v = Math.floor(n);
      }
    } catch (_) { /* ignore */ }
    if (v < 1000) v = 1000;
    if (v > 50000) v = 50000;
    return v;
  }

  /**
   * Expand mod LOD `clusters[]` into **one dashboard row per animal head** (no ×N aggregate rows).
   * Stats repeat the cluster bucket averages when per-head detail is not inlined — real RL IDs come
   * from `details/animals_<id>.json` hydration (`__detailHydrated` / `lod: full`), which skips this path.
   *
   * `globalCounter.emitted` counts emitted rows (heads); `trimmed` counts heads skipped by caps.
   */
  _fanOutClustersIndividualRows(husbandry, clusters, farmId, globalCounter) {
    const out = [];
    const PEN_HEAD_ROW_CAP = 4096;
    const GLOBAL_ROW_CAP = (globalCounter && Number.isFinite(globalCounter.cap))
      ? globalCounter.cap
      : this._getMaxSynthAnimals();
    const huName = husbandry.name || husbandry.buildingName;
    const huId = husbandry.id || husbandry.buildingId;

    let headsThisPen = 0;
    let trimmedHeads = 0;

    outer: for (let ci = 0; ci < clusters.length; ci++) {
      const c = clusters[ci];
      if (!c || !c.count || c.count <= 0) continue;

      const subType = c.subType || c.animalType || 'Unknown';
      const ageMonths = (typeof c.avgAgeMonths === 'number')
        ? c.avgAgeMonths
        : (typeof c.ageMonths === 'number' ? c.ageMonths : (c.ageDecile || 0) * 12);
      const avgHealth = (typeof c.avgHealth === 'number') ? c.avgHealth : 100;
      const avgWeight = (typeof c.avgWeight === 'number') ? c.avgWeight : 0;
      const nTotal = Math.floor(Number(c.count)) || 0;

      const genetics =
        typeof c.avgGenFert === 'number'
          ? {
              fertility: c.avgGenFert,
              productivity: c.avgGenProd,
              health: c.avgGenHealth,
              metabolism: c.avgGenMetabolism,
              quality: c.avgGenQuality,
            }
          : null;

      for (let hi = 0; hi < nTotal; hi++) {
        if (headsThisPen >= PEN_HEAD_ROW_CAP) {
          trimmedHeads += nTotal - hi;
          for (let cj = ci + 1; cj < clusters.length; cj++) {
            const cc = clusters[cj];
            if (cc && cc.count > 0) trimmedHeads += Math.floor(Number(cc.count)) || 0;
          }
          break outer;
        }
        if (globalCounter && (globalCounter.emitted || 0) >= GLOBAL_ROW_CAP) {
          trimmedHeads += nTotal - hi;
          for (let cj = ci + 1; cj < clusters.length; cj++) {
            const cc = clusters[cj];
            if (cc && cc.count > 0) trimmedHeads += Math.floor(Number(cc.count)) || 0;
          }
          break outer;
        }

        const id = `${huId || 'pen'}-c${ci}-h${hi}`;
        out.push({
          id,
          name: `${subType}`,
          husbandryName: huName,
          husbandryId: huId,
          ownerFarmId: husbandry.ownerFarmId || husbandry.farmId,
          farmId,
          age: ageMonths,
          health: avgHealth,
          weight: avgWeight,
          gender: c.gender || 'female',
          subType,
          location: huName,
          locationType: 'pasture',
          isLactating: !!c.isLactating,
          isPregnant: !!c.isPregnant,
          isParent: false,
          genetics,
          productivity: c.avgGenProd ?? null,
          __lodSynth: true,
          __lodSynthEstimate: true,
        });
        headsThisPen += 1;
        if (globalCounter) {
          globalCounter.emitted = (globalCounter.emitted || 0) + 1;
        }
      }
    }

    if (trimmedHeads > 0) {
      husbandry.__lodTrimmed = trimmedHeads;
      if (globalCounter) globalCounter.trimmed = (globalCounter.trimmed || 0) + trimmedHeads;
    }
    if (globalCounter && (globalCounter.emitted || 0) >= GLOBAL_ROW_CAP) {
      globalCounter.capHit = true;
    }
    return out;
  }

  updateAnimalsData(animalsData) {
    // Handle API data format — husbandry buildings with animal details.
    // Only include animals owned by the selected farm (same idea as vehicles/fields).

    const formattedAnimals = [];
    const activeFarmId = Number(this.dashboard?.activeFarmId ?? 1);
    let rawHusbandryCount = 0;

    // Plan v5 A3: shared counter across all husbandries. Caller (this.dashboard) can read
    // `dashboard.lodGlobalState` after this call to render the "estimated cap" banner.
    const globalCounter = {
      emitted: 0,
      trimmed: 0,
      capHit: false,
      cap: this._getMaxSynthAnimals(),
    };

    // Handle different data formats (vanilla vs RealisticLivestock)
    if (animalsData) {
      // If animalsData is not an array, try to extract array from it
      let husbandryArray = animalsData;

      // Check if data is wrapped in another object (RealisticLivestock might do this)
      if (!Array.isArray(animalsData)) {
        // Try common property names that might contain the array
        if (animalsData.husbandries) {
          husbandryArray = animalsData.husbandries;
        } else if (animalsData.animals) {
          husbandryArray = animalsData.animals;
        } else if (animalsData.data) {
          husbandryArray = animalsData.data;
        } else {
          // Try to convert object values to array
          husbandryArray = Object.values(animalsData);
        }
      }

      if (!Array.isArray(husbandryArray)) {
        console.error(
          "[RealtimeConnector] Could not extract array from animals data:",
          animalsData
        );
        return;
      }

      rawHusbandryCount = husbandryArray.length;

      husbandryArray.forEach((husbandry, index) => {
        const hfarm = Number(husbandry.ownerFarmId ?? husbandry.farmId ?? 0);
        if (hfarm !== activeFarmId) return;

        const rowCountBefore = formattedAnimals.length;

        /** Per-pen files merged in main process (`detailAnimalsHydrate.js`) — real RL individuals; never overlay clusters. */
        const detailReady =
          (husbandry.__detailHydrated === true || husbandry.lod === 'full') &&
          Array.isArray(husbandry.animals) &&
          husbandry.animals.length > 0;

        const lodClusters = Array.isArray(husbandry.clusters) ? husbandry.clusters : null;
        const hasClusterBuckets =
          lodClusters &&
          lodClusters.some((c) => c && Number(c.count) > 0);

        // LOD clusters → one table row per head (no ×N aggregates). Skipped when detail JSON hydrated `animals[]`.
        if (!detailReady && hasClusterBuckets) {
          const synth = this._fanOutClustersIndividualRows(husbandry, lodClusters, hfarm, globalCounter);
          for (let s = 0; s < synth.length; s++) formattedAnimals.push(synth[s]);
          if (synth.length > 0) {
            return;
          }
        }

        // Check different possible animal data structures
        let animalsList = null;

        // Try different property names that might contain animals
        if (husbandry.animals && Array.isArray(husbandry.animals)) {
          animalsList = husbandry.animals;
        } else if (husbandry.livestock && Array.isArray(husbandry.livestock)) {
          // RealisticLivestock might use 'livestock' instead of 'animals'
          animalsList = husbandry.livestock;
        } else if (
          husbandry.animalList &&
          Array.isArray(husbandry.animalList)
        ) {
          animalsList = husbandry.animalList;
        }

        if (animalsList) {
          animalsList.forEach((animalGroup) => {
            // Handle both grouped animals (vanilla) and individual animals (RealisticLivestock)
            const numAnimals = animalGroup.numAnimals || animalGroup.count || 1;
            const animalType =
              animalGroup.subType ||
              animalGroup.type ||
              animalGroup.animalType ||
              "Unknown";

            // If RealisticLivestock provides individual animals with detailed data
            if (
              animalGroup.id &&
              (animalGroup.numAnimals === undefined ||
                animalGroup.numAnimals <= 1) &&
              (animalGroup.uniqueId ||
                animalGroup.age !== undefined ||
                animalGroup.weight !== undefined)
            ) {
              // This is likely an individual animal from RealisticLivestock
              //console.log(`[REALTIME] Using individual RealisticLivestock animal: ID=${animalGroup.id}, uniqueId=${animalGroup.uniqueId}`);
              formattedAnimals.push({
                id: animalGroup.id,
                name: animalGroup.name || `${animalType} ${animalGroup.id}`,
                husbandryName: husbandry.name || husbandry.buildingName,
                husbandryId: husbandry.id || husbandry.buildingId,
                ownerFarmId: husbandry.ownerFarmId || husbandry.farmId,
                farmId: hfarm,
                age: animalGroup.age || animalGroup.ageInMonths || 24,
                health: animalGroup.health || animalGroup.healthStatus || 100,
                weight: animalGroup.weight || animalGroup.currentWeight || 350,
                gender: animalGroup.gender || animalGroup.sex || "female",
                subType: animalType,
                location: husbandry.name || husbandry.buildingName,
                locationType: "pasture",
                isLactating:
                  animalGroup.isLactating || animalGroup.lactating || false,
                isPregnant:
                  animalGroup.isPregnant || animalGroup.pregnant || false,
                isParent:
                  animalGroup.isParent || animalGroup.hasOffspring || false,
                // RealisticLivestock specific data if available
                genetics: animalGroup.genetics || null,
                productivity: animalGroup.productivity || null,
                sellPrice: animalGroup.sellPrice || null,
                uniqueId: animalGroup.uniqueId ?? null,
                breed: animalGroup.breed ?? null,
                motherId: animalGroup.motherId ?? null,
                fatherId: animalGroup.fatherId ?? null,
                isCastrated: !!animalGroup.isCastrated,
                birthday: animalGroup.birthday ?? null,
                dirt: animalGroup.dirt,
                fitness: animalGroup.fitness,
                diseaseCount: animalGroup.diseaseCount,
              });
            } else {
              // Handle grouped animals (vanilla format)
              //console.log(`[REALTIME] Using grouped/fallback generation for ${animalType} - numAnimals: ${numAnimals}, has ID: ${!!animalGroup.id}`);
              // Use realistic ratios for dairy operations
              const isDairyCow =
                animalType &&
                (animalType.toUpperCase().includes("COW") ||
                  animalType.toUpperCase() === "COW");

              let maleCount = 0;
              let femaleCount = 0;

              if (isDairyCow) {
                // Realistic dairy ratio: ~3-5% males, 95-97% females
                maleCount = Math.max(1, Math.floor(numAnimals * 0.04)); // ~4% males
                femaleCount = numAnimals - maleCount;
              } else {
                // Other animals: more balanced but still female-heavy for breeding
                maleCount = Math.floor(numAnimals * 0.25); // 25% males
                femaleCount = numAnimals - maleCount;
              }

              for (let i = 0; i < numAnimals; i++) {
                const animalId = `${husbandry.id}-${animalType}-${i}`;
                const seed = this.hashCode(animalId);
                const seededRandom = this.seededRandom(seed);

                // Determine gender based on realistic ratios
                const isMale = i < maleCount;
                const gender = isMale ? "male" : "female";

                // Determine age - use cluster age if available, otherwise realistic range
                const age =
                  animalGroup.age || 12 + Math.floor(seededRandom() * 36); // 12-48 months
                const isAdult = age >= 18;

                // Lactating logic for dairy cows - don't assume lactation status
                // Only set lactating to true if we have actual data indicating it
                let isLactating = false;
                // We don't have individual animal lactation data from the game
                // so we should not fabricate lactating animals

                // Pregnancy logic - don't assume pregnancy status
                // Only set pregnant to true if we have actual data indicating it
                let isPregnant = false;
                // We don't have individual animal pregnancy data from the game
                // so we should not fabricate pregnant animals

                formattedAnimals.push({
                  id: animalId,
                  name: `${animalType} ${i + 1}`,
                  husbandryName: husbandry.name || husbandry.buildingName,
                  husbandryId: husbandry.id || husbandry.buildingId,
                  ownerFarmId: husbandry.ownerFarmId || husbandry.farmId,
                  farmId: hfarm,
                  age: age,
                  health:
                    animalGroup.health && animalGroup.health > 0
                      ? animalGroup.health
                      : 85 + seededRandom() * 15,
                  weight: animalGroup.weight || 250 + seededRandom() * 200,
                  gender: gender,
                  subType: animalType,
                  location: husbandry.name || husbandry.buildingName,
                  locationType: "pasture",
                  isLactating: isLactating,
                  isPregnant: isPregnant,
                  isParent: false, // Don't fabricate parent status
                });
              }
            }
          });
        } else if (
          (husbandry.animalCount && husbandry.animalCount > 0) ||
          (husbandry.numAnimals && husbandry.numAnimals > 0)
        ) {
          // Fallback: if no detailed animal data but count exists
          const count = husbandry.animalCount || husbandry.numAnimals;
          //console.log(`[REALTIME] FALLBACK: Generating fake IDs for ${count} animals in ${husbandry.name} (no individual animal data found)`);

          for (let i = 0; i < count; i++) {
            const animalId = `${husbandry.id}-${i}`;
            // Generate consistent values based on animal ID to prevent fluctuations
            const seed = this.hashCode(animalId);
            const seededRandom = this.seededRandom(seed);

            formattedAnimals.push({
              id: animalId,
              name: `Animal ${i + 1}`,
              husbandryName: husbandry.name,
              husbandryId: husbandry.id,
              ownerFarmId: husbandry.ownerFarmId,
              farmId: hfarm,
              age: Math.floor(seededRandom() * 48) + 12, // 12-60 months, consistent
              health: 85 + seededRandom() * 15, // Consistent health
              weight: 250 + seededRandom() * 200, // Consistent weight
              gender: seededRandom() > 0.5 ? "female" : "male", // Consistent gender
              subType: "Unknown",
              location: husbandry.name,
              locationType: "pasture",
              isLactating: false, // Don't fabricate lactating status
              isPregnant: false, // Don't fabricate pregnant status
              isParent: false, // Don't fabricate parent status
            });
          }
        }
      });
    }

    if (formattedAnimals.length === 0) {
      if (rawHusbandryCount > 0) {
        console.warn(
          `[RealtimeConnector] No animals for selected farm (farmId=${activeFarmId}); other farms are hidden.`
        );
      } else {
        console.warn(
          "[RealtimeConnector] No animals found in data! Check the console logs above to debug."
        );
      }
    }

    this.dashboard.animals = formattedAnimals;
    this.dashboard.filteredAnimals = formattedAnimals;

    // Plan v5 A3: surface global LOD synthetic-cap state for the livestock UI banner.
    this.dashboard.lodGlobalState = {
      emitted: globalCounter.emitted || 0,
      trimmed: globalCounter.trimmed || 0,
      capHit: !!globalCounter.capHit,
      cap: Number.isFinite(globalCounter.cap) ? globalCounter.cap : this._getMaxSynthAnimals(),
    };
    this.dashboard.__lodTotalSynthCap = !!globalCounter.capHit;
    this.dashboard.__lodTotalTrimmed = globalCounter.trimmed || 0;

    const landingEl = typeof document !== "undefined" ? document.getElementById("landing-page") : null;
    const landingVisible = landingEl && !landingEl.classList.contains("d-none");
    const nowLc = typeof performance !== "undefined" ? performance.now() : Date.now();
    const staleLanding =
      !this._lastLandingCountsFromAnimalsAt || nowLc - this._lastLandingCountsFromAnimalsAt > 20000;
    const needPastureParse =
      this.dashboard.currentSection === "pastures" || landingVisible || staleLanding;

    if (this.dashboard.parsePastureData && needPastureParse) {
      this.dashboard.parsePastureData();
    }

    if (this.dashboard.updateLandingPageCounts && (landingVisible || staleLanding)) {
      this._lastLandingCountsFromAnimalsAt = nowLc;
      this.dashboard.updateLandingPageCounts();
    }

    // Update livestock section if it's currently visible
    const livestockSection = document.getElementById("dashboard-content");
    if (livestockSection && !livestockSection.classList.contains("d-none")) {
      // Only update table if livestock section is visible
      if (this.dashboard.dataTable) {
        // Destroy and recreate table instead of trying to update with wrong format
        this.dashboard.renderAnimalsTable();
      } else {
        // If table doesn't exist but section is visible, create it
        setTimeout(() => {
          if (this.dashboard.renderAnimalsTable) {
            this.dashboard.renderAnimalsTable();
          }
        }, 100);
      }

      if (this.dashboard.updateSummaryCards) {
        this.dashboard.updateSummaryCards();
      }
    }

    // Update pastures section if it's currently visible (avoid locale-dependent title sniffing)
    if (
      this.dashboard.currentSection === "pastures" &&
      this.dashboard.updatePastureDisplay
    ) {
      this.dashboard.updatePastureDisplay();
    }
  }

  updateVehiclesData(vehiclesData) {
    // Keep unfiltered list so farm changes can re-filter without waiting for a new API tick.
    this.dashboard._allVehiclesMerged = Array.isArray(vehiclesData) ? vehiclesData : [];
    // Filter to only show vehicles owned by the currently active farm.
    const activeFarmId = window.dashboard?.activeFarmId || 1;
    const playerVehicles = this.dashboard._allVehiclesMerged
      ? this.dashboard._allVehiclesMerged.filter(
          (v) =>
            Number(v?.ownerFarmId ?? v?.farmId ?? 0) === Number(activeFarmId)
        )
      : [];
    this.dashboard.vehicles = playerVehicles;

    // Landing card counts are centralized in navigation.updateLandingPageCounts().

    if (this.dashboard.currentSection === "vehicles") {
      this.dashboard.updateVehicleSummaryCards();
      if (typeof this.dashboard.applyVehicleFilters === "function") {
        this.dashboard.applyVehicleFilters();
      } else {
        this.dashboard.renderVehicleCards(playerVehicles);
      }
    }
  }

  updateFieldsData(fieldsData) {
    const list = Array.isArray(fieldsData) ? fieldsData : [];
    this.dashboard.allFields = list;
    const farmId = this.dashboard.activeFarmId ?? 1;
    this.dashboard.fields =
      typeof window.filterFieldsForFarmView === "function"
        ? window.filterFieldsForFarmView(list, farmId)
        : list;

    // Clear any field retry interval since we got data via realtime
    if (this.dashboard.fieldRetryInterval) {
      clearInterval(this.dashboard.fieldRetryInterval);
      this.dashboard.fieldRetryInterval = null;
    }

    // Update fields display if currently viewing fields section
    if (this.dashboard.currentSection === "fields") {
      this.dashboard.updateFieldsList();
      this.dashboard.updateFieldStats();
    }
  }

  updateProductionData(productionData) {
    this.dashboard.production = productionData;

    // Store husbandry totals separately for easy access
    if (productionData && productionData.husbandryTotals) {
      this.dashboard.husbandryTotals = productionData.husbandryTotals;
    }

    const sec = this.dashboard.currentSection;
    if (
      this.dashboard.updateFarmStorageDisplay &&
      (sec === "dashboard" || sec === "landing" || !sec || sec === "productions")
    ) {
      this.dashboard.updateFarmStorageDisplay();
    }

    if (this.dashboard.currentSection === "pastures" && this.dashboard.updatePastureDisplay) {
      this.dashboard.updatePastureDisplay();
    }

    if (this.dashboard.refreshProductionsIfVisible) {
      this.dashboard.refreshProductionsIfVisible();
    }
    // Landing card counts are centralized in navigation.updateLandingPageCounts().
  }

  updateFinanceData(financeData) {
    this.dashboard.finance = financeData;
    // TODO: Implement finance display when finance section is ready
    // this.dashboard.updateFinanceDisplay();
  }

  updateWeatherData(weatherData) {
    this.dashboard.weather = weatherData;
    
    // Update weather display in navbar
    if (this.dashboard.updateWeatherDisplay) {
      this.dashboard.updateWeatherDisplay();
    }
  }

  updateEconomyData(economyData) {
    this.dashboard.economy = economyData;

    // Store milk price for value calculations
    if (
      economyData &&
      economyData.fillTypePrices &&
      economyData.fillTypePrices.MILK
    ) {
      this.dashboard.milkPrice =
        economyData.fillTypePrices.MILK.currentPrice ||
        economyData.fillTypePrices.MILK.pricePerLiter ||
        0;
    }

    // Pasture milk-value widgets only when that section is open (saves work on every /api/data tick).
    if (
      this.dashboard.currentSection === "pastures" &&
      this.dashboard.updateMilkValues
    ) {
      this.dashboard.updateMilkValues();
    }
  }

  updateGameTime(gameTime) {
    this.dashboard.gameTime = gameTime;

    // Always call updateGameTimeDisplay since we've now defined it
    if (this.dashboard.updateGameTimeDisplay) {
      this.dashboard.updateGameTimeDisplay();
    } else {
      console.error(
        "[RealtimeConnector] updateGameTimeDisplay function not found"
      );
    }
  }

  updateFarmInfo(farmInfo) {
    const list = Array.isArray(farmInfo)
      ? farmInfo
      : farmInfo && typeof farmInfo === "object"
        ? Object.values(farmInfo)
        : [];
    this.dashboard.playerFarms = list;
    this.dashboard.farms = list;
    const active = Number(this.dashboard.activeFarmId ?? 1);
    const hasActive = list.some((f) => Number(f?.id) === active && Number(f?.id) > 0);
    if (!hasActive && list.length > 0) {
      const next = list.find((f) => Number(f?.id) > 0) || list[0];
      const nextId = Number(next?.id);
      if (Number.isFinite(nextId) && nextId > 0) {
        this.dashboard.activeFarmId = nextId;
        try {
          const sid = String(
            this.dashboard.activeServerId ??
              (typeof localStorage !== "undefined"
                ? localStorage.getItem("dashboard_active_server") || ""
                : "")
          );
          if (sid) localStorage.setItem(`dashboard_active_farm_${sid}`, String(nextId));
        } catch (_) {
          /* ignore */
        }
      }
    }

    // Re-filter existing datasets now that farm context is guaranteed valid.
    if (Array.isArray(this.dashboard.allFields) && this.dashboard.allFields.length > 0) {
      const fid = Number(this.dashboard.activeFarmId ?? 1);
      this.dashboard.fields =
        typeof window.filterFieldsForFarmView === "function"
          ? window.filterFieldsForFarmView(this.dashboard.allFields, fid)
          : this.dashboard.allFields;
    }
    if (this.dashboard.husbandryData) {
      this.updateAnimalsData(this.dashboard.husbandryData);
    }
    if (Array.isArray(this.dashboard._allVehiclesMerged)) {
      this.updateVehiclesData(this.dashboard._allVehiclesMerged);
    }
    if (typeof this.dashboard.renderFarmDropdown === "function") {
      this.dashboard.renderFarmDropdown();
    }
    if (typeof this.dashboard.updateLandingPageCounts === "function") {
      this.dashboard.updateLandingPageCounts();
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) {
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.checkConnectionMethod();
    }, this.reconnectInterval);
  }

  setupStatusIndicator() {
    const statusContainer = document.createElement("div");
    statusContainer.id = "connection-status";
    statusContainer.className = "connection-status";
    statusContainer.innerHTML = `
            <div class="status-indicator">
                <span class="status-dot"></span>
                <span class="status-text">Disconnected</span>
            </div>
            <div class="last-update">
                Last update: <span id="last-update-time">Never</span>
            </div>
        `;

    const header = document.querySelector(".dashboard-header");
    if (header) {
      header.appendChild(statusContainer);
    }

    this.addStatusStyles();
  }

  addStatusStyles() {
    const style = document.createElement("style");
    style.textContent = `
            .connection-status {
                position: absolute;
                top: 10px;
                right: 20px;
                display: flex;
                flex-direction: column;
                align-items: flex-end;
                gap: 5px;
            }

            .status-indicator {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 5px 10px;
                background: rgba(0, 0, 0, 0.1);
                border-radius: 20px;
            }

            .status-dot {
                width: 10px;
                height: 10px;
                border-radius: 50%;
                background: #dc3545;
                animation: pulse 2s infinite;
            }

            .status-dot.connected {
                background: #28a745;
            }

            .status-text {
                font-size: 12px;
                font-weight: 600;
            }

            .last-update {
                font-size: 11px;
                color: #666;
            }

            @keyframes pulse {
                0% { opacity: 1; }
                50% { opacity: 0.5; }
                100% { opacity: 1; }
            }
        `;
    document.head.appendChild(style);
  }

  updateConnectionStatus(connected) {
    const statusDot = document.querySelector(".status-dot");
    const statusText = document.querySelector(".status-text");

    if (statusDot && statusText) {
      if (connected) {
        statusDot.classList.add("connected");
        statusText.textContent = "Connected";
      } else {
        statusDot.classList.remove("connected");
        statusText.textContent = "Disconnected";
      }
    }

    const notificationBell = document.getElementById("notification-bell");
    const dash = this.dashboard;
    if (dash && typeof dash.updateNavbarConnectionStrip === "function") {
      dash.updateNavbarConnectionStrip();
    }
    if (notificationBell) {
      if (connected) {
        notificationBell.classList.remove("d-none");
      } else {
        notificationBell.classList.add("d-none");
      }
    }
  }

  enableAPIMode() {
    // Hide the file selection section
    const landingSection = document.getElementById("landing");
    if (landingSection) {
      landingSection.style.display = "none";
    }

    // Show the main dashboard sections
    const sections = [
      "livestock",
      "vehicles",
      "fields",
      "economy",
      "productions",
    ];
    sections.forEach((sectionId) => {
      const section = document.getElementById(sectionId);
      if (section) {
        section.style.display = "block";
      }
    });

    // Stay on landing page - don't auto-navigate to any section
    // User can choose which section to view

    // Update page title to indicate API mode
    document.title = "Farm Dashboard - Live API Mode";

    // Add API mode indicator
    this.addAPIModeIndicator();
  }

  addAPIModeIndicator() {
    const header = document.querySelector(".dashboard-header h1");
    if (header && !header.querySelector(".api-mode-badge")) {
      const badge = document.createElement("span");
      badge.className = "api-mode-badge";
      badge.textContent = t("realtime.liveApi");
      badge.style.cssText = `
                background: #28a745;
                color: white;
                padding: 2px 8px;
                border-radius: 4px;
                font-size: 12px;
                margin-left: 10px;
                font-weight: normal;
            `;
      header.appendChild(badge);
    }
  }

  updateLastUpdateTime() {
    const lastUpdateElement = document.getElementById("last-update-time");
    if (lastUpdateElement && this.dashboard.lastUpdate) {
      const now = new Date();
      const diff = Math.floor((now - this.dashboard.lastUpdate) / 1000);

      if (diff < 60) {
        lastUpdateElement.textContent = t("realtime.secondsAgo", {
          seconds: diff,
        });
      } else if (diff < 3600) {
        lastUpdateElement.textContent = t("realtime.minutesAgo", {
          minutes: Math.floor(diff / 60),
        });
      } else {
        lastUpdateElement.textContent = t("realtime.hoursAgo", {
          hours: Math.floor(diff / 3600),
        });
      }
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.isConnected = false;
    this.updateConnectionStatus(false);
    this.lastRealtimePayloadKey = null;
  }

  detectAndShowChanges(oldState) {
    try {
      // Quick check: if animal counts are the same and no obvious changes, skip detailed comparison
      const oldAnimalCount = oldState.animals ? oldState.animals.length : 0;
      const newAnimalCount = this.dashboard.animals
        ? this.dashboard.animals.length
        : 0;

      // Always run full comparison if animal counts changed (animals bought/sold)
      if (oldAnimalCount !== newAnimalCount) {
        if (VERBOSE_CHANGE_LOG) {
          console.log(
            `[ChangeDetection] Animal count changed (${oldAnimalCount} -> ${newAnimalCount}), running full comparison`
          );
        }
      } else if (oldAnimalCount > 0) {
        // Only check for status changes (pregnant, lactating) if counts are the same
        const hasStatusChanges = this.hasSignificantStatusChanges(
          oldState.animals,
          this.dashboard.animals
        );
        if (!hasStatusChanges) {
          return; // No meaningful changes, skip notifications
        }
        if (VERBOSE_CHANGE_LOG) console.log(`[ChangeDetection] Status changes detected`);
      } else {
        return; // No animals to compare
      }

      // Create a temporary comparison data structure similar to what the dashboard expects
      const tempPreRefreshData = {
        animals: oldState.animals,
        pastures: oldState.pastures,
        gameTime: oldState.gameTime,
        playerFarms: this.dashboard.playerFarms || [],
      };

      // Temporarily store this in dashboard for comparison
      const originalPreRefreshData = this.dashboard.preRefreshData;
      this.dashboard.preRefreshData = tempPreRefreshData;

      // Calculate changes using dashboard's existing logic
      const changes = this.dashboard.calculateDataChanges();

      if (VERBOSE_CHANGE_LOG) {
        console.log(`[ChangeDetection] Raw changes detected:`, {
          added: changes.livestock?.added?.length || 0,
          removed: changes.livestock?.removed?.length || 0,
          updated: changes.livestock?.updated?.length || 0,
        });
      }

      // Filter changes to only include truly significant ones
      const filteredChanges = this.filterSignificantChanges(changes);

      if (VERBOSE_CHANGE_LOG) {
        console.log(`[ChangeDetection] Filtered significant changes:`, {
          added: filteredChanges.livestock?.added?.length || 0,
          removed: filteredChanges.livestock?.removed?.length || 0,
          updated: filteredChanges.livestock?.updated?.length || 0,
        });
      }

      // Only show notifications if there are truly significant changes
      const hasSignificantChanges =
        (filteredChanges.livestock?.added?.length || 0) > 0 ||
        (filteredChanges.livestock?.removed?.length || 0) > 0 ||
        (filteredChanges.livestock?.updated?.length || 0) > 0;

      if (VERBOSE_CHANGE_LOG) {
        console.log(`[ChangeDetection] Has significant changes:`, hasSignificantChanges);
      }

      if (hasSignificantChanges) {
        if (VERBOSE_CHANGE_LOG) console.log(`[ChangeDetection] Showing toast notifications`);
        this.dashboard.showChangeToasts(filteredChanges);
      }

      // Restore original state
      this.dashboard.preRefreshData = originalPreRefreshData;
    } catch (error) {
      console.error("[RealtimeConnector] Error detecting changes:", error);
    }
  }

  hasSignificantStatusChanges(oldAnimals, newAnimals) {
    if (!oldAnimals || !newAnimals || oldAnimals.length !== newAnimals.length) {
      return true; // Count changed, that's significant
    }

    // Create maps for quick lookup
    const oldMap = {};
    const newMap = {};

    oldAnimals.forEach((animal) => {
      if (animal.id) {
        oldMap[animal.id] = {
          isPregnant: animal.isPregnant,
          isLactating: animal.isLactating,
          health: Math.floor(animal.health / 5) * 5, // Group health into 5-point ranges to avoid minor fluctuations
        };
      }
    });

    newAnimals.forEach((animal) => {
      if (animal.id) {
        newMap[animal.id] = {
          isPregnant: animal.isPregnant,
          isLactating: animal.isLactating,
          health: Math.floor(animal.health / 5) * 5,
        };
      }
    });

    // Check for actual status changes
    for (const id in oldMap) {
      if (newMap[id]) {
        const oldStatus = oldMap[id];
        const newStatus = newMap[id];

        if (
          oldStatus.isPregnant !== newStatus.isPregnant ||
          oldStatus.isLactating !== newStatus.isLactating ||
          Math.abs(oldStatus.health - newStatus.health) >= 10
        ) {
          // Only care about health changes of 10+ points
          return true;
        }
      }
    }

    return false; // No significant status changes found
  }

  filterSignificantChanges(changes) {
    if (!changes || !changes.livestock) {
      return changes;
    }

    // Always keep added and removed animals - these are always significant
    const filteredChanges = {
      ...changes,
      livestock: {
        ...changes.livestock,
        updated: [],
      },
    };

    // Filter updated animals to only include significant status changes
    if (changes.livestock.updated && changes.livestock.updated.length > 0) {
      changes.livestock.updated.forEach((update) => {
        if (VERBOSE_CHANGE_LOG) console.log(`[ChangeDetection] Examining update:`, update);

        // Check the actual structure of changes - it might be an object or different format
        let changesArray = [];
        if (Array.isArray(update.changes)) {
          changesArray = update.changes;
        } else if (
          typeof update.changes === "object" &&
          update.changes !== null
        ) {
          changesArray = Object.keys(update.changes);
        } else if (typeof update.changes === "string") {
          changesArray = [update.changes];
        }

        // Only include updates for pregnancy, lactation, or significant health changes
        const isSignificantUpdate =
          changesArray.includes("isPregnant") ||
          changesArray.includes("isLactating") ||
          changesArray.includes("isParent") ||
          (changesArray.includes("health") &&
            Math.abs((update.new?.health || 0) - (update.old?.health || 0)) >=
              15);

        if (isSignificantUpdate) {
          filteredChanges.livestock.updated.push(update);
          if (VERBOSE_CHANGE_LOG) {
            console.log(
              `[ChangeDetection] Keeping significant update for ID ${
                update.new?.id
              }: ${changesArray.join(", ")}`
            );
          }
        } else if (VERBOSE_CHANGE_LOG) {
          console.log(
            `[ChangeDetection] Filtering out minor update for ID ${
              update.new?.id
            }: ${changesArray.join(", ")}`
          );
        }
      });
    }

    return filteredChanges;
  }
}

window.RealtimeConnector = RealtimeConnector;
