// FS25 FarmDashboard | fleet-map.js | pan/zoom fleet map with live positions

import { t } from "../i18n/i18n.js";
import {
  isStorageItem,
  isUsedEquipmentYardStock,
  resolveVehicleDisplayName,
  vehicleMatchesActiveFarm,
} from "./vehicles.js";
import {
  worldToMapPercent,
  mapOverviewIdentityKey,
  resolveOverviewTerrainBounds,
  FULL_TERRAIN_INSET,
  terrainClipPixelSize,
} from "./fleetMapGeo.js";
import { FleetMapViewport } from "./fleetMapViewport.js";

const FARM_COLOR_FALLBACK = [
  "#e74c3c",
  "#3498db",
  "#2ecc71",
  "#f39c12",
  "#9b59b6",
  "#1abc9c",
  "#e67e22",
  "#95a5a6",
];

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function farmColorToCss(farmId, rawColor) {
  const n = Number(rawColor);
  if (Number.isFinite(n) && n > 0) {
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    if (r + g + b > 24) return `rgb(${r}, ${g}, ${b})`;
    const r2 = n & 255;
    const g2 = (n >> 8) & 255;
    const b2 = (n >> 16) & 255;
    if (r2 + g2 + b2 > 24) return `rgb(${r2}, ${g2}, ${b2})`;
  }
  const idx = Math.max(0, (Number(farmId) || 1) - 1) % FARM_COLOR_FALLBACK.length;
  return FARM_COLOR_FALLBACK[idx];
}

function coerceVehicles(list) {
  if (!list) return [];
  if (Array.isArray(list)) return list;
  if (typeof list === "object") return Object.values(list);
  return [];
}

function getVehicleSource(dashboard, showAllFarms) {
  const merged = coerceVehicles(dashboard._allVehiclesMerged);
  const scoped = coerceVehicles(dashboard.vehicles);
  const src = showAllFarms && merged.length ? merged : scoped.length ? scoped : merged;
  return src.filter(
    (v) => v && !isStorageItem(v) && !isUsedEquipmentYardStock(v)
  );
}

function farmLookup(dashboard) {
  const map = new Map();
  for (const f of Array.isArray(dashboard.farms) ? dashboard.farms : []) {
    const id = Number(f.id ?? f.farmId);
    if (Number.isFinite(id)) map.set(id, f);
  }
  return map;
}

function markerIconClass(vehicle) {
  const tn = String(vehicle.typeName || vehicle.vehicleType || "").toLowerCase();
  if (tn.includes("tractor")) return "bi-truck";
  if (tn.includes("trailer") || tn.includes("wagon")) return "bi-link-45deg";
  if (tn.includes("harvester") || tn.includes("combine")) return "bi-grid-3x3-gap";
  if (tn.includes("loader") || tn.includes("telehandler")) return "bi-arrows-angle-expand";
  if (vehicle.isMotorized) return "bi-truck-front";
  return "bi-gear-wide-connected";
}

function resolveMapMeta(dashboard) {
  return {
    mapId: dashboard.mapId || dashboard.serverInfo?.mapId || "",
    mapTitle: dashboard.mapTitle || dashboard.serverInfo?.mapName || "",
  };
}

function vehicleMapPercent(x, z, bounds) {
  return worldToMapPercent(x, z, bounds);
}

let _overviewFetchKey = "";
let _overviewFetchPromise = null;
let _mapViewport = null;
let _terrainInset = { ...FULL_TERRAIN_INSET };
export function resetFleetMapOverviewCache() {
  _overviewFetchKey = "";
  _overviewFetchPromise = null;
  _terrainInset = { ...FULL_TERRAIN_INSET };
}

function applyTerrainInsetFromOverview(data) {
  const inset = data?.terrainInset;
  if (inset && Number(inset.width) > 0 && Number(inset.height) > 0) {
    _terrainInset = {
      left: Number(inset.left) || 0,
      top: Number(inset.top) || 0,
      width: Number(inset.width) || 1,
      height: Number(inset.height) || 1,
    };
    return;
  }
  _terrainInset = { ...FULL_TERRAIN_INSET };
}

export function syncTerrainClipLayout() {
  const img = document.getElementById("fleet-map-overview-img");
  const clip = document.getElementById("fleet-map-terrain-clip");
  const canvas = document.querySelector(".farm-fleet-map-canvas");
  if (!img || !clip || !canvas) return false;

  const natW = Number(img.naturalWidth);
  const natH = Number(img.naturalHeight);
  if (!natW || !natH) return false;

  const { w, h, offsetX, offsetY } = terrainClipPixelSize(natW, natH, _terrainInset);
  if (!w || !h) return false;

  clip.style.width = `${w}px`;
  clip.style.height = `${h}px`;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  img.style.width = `${natW}px`;
  img.style.height = `${natH}px`;
  img.style.left = `${-offsetX}px`;
  img.style.top = `${-offsetY}px`;
  return true;
}

export function syncFleetMapOverviewIdentity(dashboard) {
  const { mapId, mapTitle } = resolveMapMeta(dashboard);
  const key = mapOverviewIdentityKey(mapId, mapTitle);
  if (dashboard._fleetMapOverviewKey !== key) {
    dashboard._fleetMapOverviewKey = key;
    resetFleetMapOverviewCache();
  }
}

function destroyMapViewport() {
  if (_mapViewport) {
    _mapViewport.destroy();
    _mapViewport = null;
  }
}

function ensureMapViewport() {
  const stage = document.getElementById("fleet-map-stage");
  if (!stage) return null;
  if (!_mapViewport) {
    _mapViewport = new FleetMapViewport(stage);
    _mapViewport.bind();
  }
  return _mapViewport;
}

function bindMapControls(dashboard) {
  const showAll = document.getElementById("fleet-map-show-all-farms");
  if (showAll && showAll.dataset.farmdashMapBound !== "1") {
    showAll.dataset.farmdashMapBound = "1";
    showAll.addEventListener("change", () => dashboard.renderFleetMap());
  }

  const stage = document.getElementById("fleet-map-stage");
  if (stage && stage.dataset.farmdashToolbarBound !== "1") {
    stage.dataset.farmdashToolbarBound = "1";
    document.getElementById("fleet-map-zoom-in")?.addEventListener("click", () => {
      ensureMapViewport()?.zoomBy(1.2);
    });
    document.getElementById("fleet-map-zoom-out")?.addEventListener("click", () => {
      ensureMapViewport()?.zoomBy(1 / 1.2);
    });
    document.getElementById("fleet-map-reset")?.addEventListener("click", () => {
      ensureMapViewport()?.fitWholeImage();
    });
    document.getElementById("fleet-map-fit-items")?.addEventListener("click", () => {
      ensureMapViewport()?.fitToPins();
    });
  }

  const markers = document.getElementById("fleet-map-markers");
  if (markers && markers.dataset.farmdashPinBound !== "1") {
    markers.dataset.farmdashPinBound = "1";
    markers.addEventListener("click", (ev) => {
      const pin = ev.target.closest(".farm-fleet-map-pin");
      if (!pin) return;
      const tip = document.getElementById("fleet-map-tooltip");
      if (!tip) return;
      ev.stopPropagation();
      tip.classList.remove("d-none");
      tip.innerHTML = pin.getAttribute("data-tooltip-html") || "";
      tip.style.left = pin.style.left;
      tip.style.top = pin.style.top;
    });
  }
}

async function applyMapOverviewBackground(dashboard) {
  const img = document.getElementById("fleet-map-overview-img");
  const stage = document.getElementById("fleet-map-stage");
  const hint = document.getElementById("fleet-map-hint");
  if (!img || !stage) return;

  syncFleetMapOverviewIdentity(dashboard);
  const { mapId, mapTitle } = resolveMapMeta(dashboard);
  const key = mapOverviewIdentityKey(mapId, mapTitle);
  if (key === _overviewFetchKey && img.dataset.loadedUrl) {
    syncTerrainClipLayout();
    ensureMapViewport()?.syncCanvasSize();
    return;
  }
  _overviewFetchKey = key;

  if (hint) hint.textContent = t("map.loadingOverview");

  const q = new URLSearchParams();
  if (mapId) q.set("mapId", mapId);
  if (mapTitle) q.set("mapTitle", mapTitle);

  if (!_overviewFetchPromise || _overviewFetchPromise._key !== key) {
    _overviewFetchPromise = fetch(`/api/map-overview-image?${q}`)
      .then((r) => r.json())
      .then((data) => ({ data, key }))
      .catch(() => ({ data: { ok: false }, key }));
    _overviewFetchPromise._key = key;
  }

  const { data } = await _overviewFetchPromise;
  if (_overviewFetchKey !== key) return;

  applyTerrainInsetFromOverview(data);

  const viewport = ensureMapViewport();

  if (data?.ok && data.url) {
    img.onload = () => {
      stage.classList.add("farm-fleet-map-stage--has-overview");
      syncTerrainClipLayout();
      viewport?.syncCanvasSize();
      viewport?.fitWholeImage();
      if (hint) {
        hint.textContent = t("map.hint", { map: mapTitle || mapId || t("map.unknownMap") });
      }
      if (typeof dashboard?.renderFleetMap === "function") {
        dashboard.renderFleetMap();
      }
    };
    img.onerror = () => {
      stage.classList.remove("farm-fleet-map-stage--has-overview");
      img.classList.add("d-none");
      if (hint) hint.textContent = t("map.hintNoImage");
    };
    const cacheV = data?.cacheVersion ?? key;
    img.src = `${data.url}?v=${encodeURIComponent(String(cacheV))}`;
    img.alt = mapTitle || mapId || t("map.unknownMap");
    img.classList.remove("d-none");
    img.dataset.loadedUrl = data.url;
    if (typeof dashboard.renderFleetMap === "function") {
      dashboard.renderFleetMap();
    }
    if (img.complete && img.naturalWidth > 0) img.onload();
  } else {
    stage.classList.remove("farm-fleet-map-stage--has-overview");
    img.classList.add("d-none");
    img.removeAttribute("src");
    img.dataset.loadedUrl = "";
    if (hint) {
      const label = mapTitle || mapId || t("map.unknownMap");
      if (data?.error === "missing_map_id") {
        hint.textContent = t("map.hintNoImage");
      } else if (label && label !== t("map.unknownMap")) {
        const token = String(label).split(/[^A-Za-z0-9]+/).find((p) => p.length >= 4) || "";
        hint.textContent = t("map.hintNoImageNamed", { map: label, hint: token || label });
      } else {
        hint.textContent = t("map.hintNoImage");
      }
    }
  }
}

export function renderFleetMap() {
  const markers = document.getElementById("fleet-map-markers");
  const legend = document.getElementById("fleet-map-legend");
  const empty = document.getElementById("fleet-map-empty");
  const countEl = document.getElementById("fleet-map-plotted-count");
  const mapTitleEl = document.getElementById("fleet-map-map-title");
  if (!markers) return;

  syncFleetMapOverviewIdentity(this);

  const showAll = document.getElementById("fleet-map-show-all-farms")?.checked === true;
  const activeFarmId = Number(this.activeFarmId ?? 1);
  const vehicles = getVehicleSource(this, showAll);
  const farmsById = farmLookup(this);
  const { mapTitle } = resolveMapMeta(this);

  if (mapTitleEl) mapTitleEl.textContent = mapTitle || t("map.unknownMap");

  const plotted = [];
  for (const v of vehicles) {
    const x = Number(v?.position?.x);
    const z = Number(v?.position?.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    if (Math.abs(x) < 0.5 && Math.abs(z) < 0.5) continue;
    if (!showAll && !vehicleMatchesActiveFarm(v, activeFarmId)) continue;
    plotted.push(v);
  }

  if (countEl) countEl.textContent = t("map.plottedCount", { count: plotted.length });
  if (empty) empty.classList.toggle("d-none", plotted.length > 0);

  const bounds = resolveOverviewTerrainBounds(this);
  markers.innerHTML = "";
  const pinPoints = [];

  for (const v of plotted.slice(0, 400)) {
    const x = Number(v.position.x);
    const z = Number(v.position.z);
    const pos = vehicleMapPercent(x, z, bounds);
    pinPoints.push(pos);
    const fid = Number(v.ownerFarmId ?? v.farmId ?? 0);
    const farm = farmsById.get(fid);
    const name = resolveVehicleDisplayName(v);
    const farmName = farm?.name || t("map.farmFallback", { id: fid || "?" });
    const pin = document.createElement("button");
    pin.type = "button";
    pin.className = "farm-fleet-map-pin";
    pin.style.left = `${pos.left}%`;
    pin.style.top = `${pos.top}%`;
    pin.style.setProperty("--fleet-pin-color", farmColorToCss(fid, farm?.color));
    pin.setAttribute(
      "data-tooltip-html",
      `<strong>${esc(name)}</strong><br><span class="text-muted">${esc(farmName)}</span><br><small>${esc(v.typeName || v.vehicleType || "")} · ${Math.round(x)}, ${Math.round(z)}</small>`
    );
    pin.setAttribute("title", `${name} (${farmName})`);
    pin.innerHTML = `<i class="bi ${markerIconClass(v)}" aria-hidden="true"></i>`;
    markers.appendChild(pin);
  }

  const viewport = ensureMapViewport();
  viewport?.setPinPoints(pinPoints);

  if (legend) {
    const farms = Array.isArray(this.farms) ? this.farms.filter((f) => Number(f.id) > 0) : [];
    legend.innerHTML =
      farms.length === 0
        ? `<span class="text-muted small">${esc(t("map.legendEmpty"))}</span>`
        : farms
            .map((f) => {
              const id = Number(f.id);
              return `<span class="farm-fleet-map-legend-item"><span class="farm-fleet-map-legend-swatch" style="background:${esc(farmColorToCss(id, f.color))}"></span>${esc(f.name || `Farm ${id}`)}</span>`;
            })
            .join("");
  }

  bindMapControls(this);
  void applyMapOverviewBackground(this);
}

export function showMapSection() {
  resetFleetMapOverviewCache();
  destroyMapViewport();

  const dyn = document.getElementById("section-content-dynamic");
  if (dyn) {
    dyn.innerHTML = `
    <div class="row mb-3">
      <div class="col-12 text-center">
        <h2 class="text-farm-accent mb-1"><i class="bi bi-map me-2"></i>${t("map.title")}</h2>
        <p class="lead text-muted mb-0">${t("map.subtitle")}</p>
        <p class="small text-muted mb-0" id="fleet-map-map-title">—</p>
      </div>
    </div>
    <div class="row mb-3">
      <div class="col-12 d-flex flex-wrap align-items-center justify-content-between gap-2">
        <div class="form-check mb-0">
          <input class="form-check-input" type="checkbox" id="fleet-map-show-all-farms"/>
          <label class="form-check-label small" for="fleet-map-show-all-farms">${t("map.showAllFarms")}</label>
        </div>
        <span class="small text-muted" id="fleet-map-plotted-count">—</span>
      </div>
    </div>
    <div class="farm-fleet-map-shell mb-3">
      <div class="farm-fleet-map-toolbar btn-group btn-group-sm mb-2" role="group" aria-label="${esc(t("map.toolbarLabel"))}">
        <button type="button" class="btn btn-outline-light" id="fleet-map-zoom-out" title="${esc(t("map.zoomOut"))}"><i class="bi bi-dash-lg"></i></button>
        <button type="button" class="btn btn-outline-light" id="fleet-map-zoom-in" title="${esc(t("map.zoomIn"))}"><i class="bi bi-plus-lg"></i></button>
        <button type="button" class="btn btn-outline-light" id="fleet-map-reset">${t("map.resetView")}</button>
        <button type="button" class="btn btn-farm-accent" id="fleet-map-fit-items">${t("map.fitItems")}</button>
      </div>
      <div class="farm-fleet-map-stage" id="fleet-map-stage">
        <div class="farm-fleet-map-viewport" id="fleet-map-viewport">
          <div class="farm-fleet-map-transform" id="fleet-map-transform">
            <div class="farm-fleet-map-canvas">
              <div id="fleet-map-terrain-clip" class="farm-fleet-map-terrain-clip">
                <img id="fleet-map-overview-img" class="farm-fleet-map-overview d-none" alt="" decoding="async" draggable="false" />
                <div id="fleet-map-markers" class="farm-fleet-map-markers"></div>
              </div>
            </div>
          </div>
        </div>
        <div class="farm-fleet-map-grid" aria-hidden="true"></div>
        <div class="farm-fleet-map-compass" aria-hidden="true"><span>N</span></div>
        <div id="fleet-map-tooltip" class="farm-fleet-map-tooltip d-none" role="status"></div>
      </div>
      <p class="small text-muted mt-2 mb-0" id="fleet-map-hint">${t("map.hintGeneric")}</p>
    </div>
    <div id="fleet-map-empty" class="alert alert-secondary d-none text-center mb-3">
      <i class="bi bi-geo-alt me-1"></i>${t("map.empty")}
    </div>
    <div class="farm-fleet-map-legend-wrap">
      <h6 class="text-farm-accent small text-uppercase mb-2">${t("map.legendTitle")}</h6>
      <div id="fleet-map-legend" class="farm-fleet-map-legend d-flex flex-wrap gap-2"></div>
    </div>`;
  }

  document.getElementById("dashboard-content")?.classList.add("d-none");
  const sectionShell = document.getElementById("section-content");
  sectionShell?.classList.remove("d-none");
  sectionShell?.classList.add("farm-glass-page--map");
  this.renderFleetMap();
}

export function refreshFleetMapIfVisible() {
  if (this.currentSection === "map" && typeof this.renderFleetMap === "function") {
    syncFleetMapOverviewIdentity(this);
    this.renderFleetMap();
  }
}
