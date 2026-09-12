// FS25 FarmDashboard | fleetMapGeo.cjs — Node/tests mirror of fleetMapGeo.js

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

/** Giants IngameMap PC — playable world is the centre half of overview.dds. */
const INGAME_MAP_WORLD_INSET = { left: 0.25, top: 0.25, width: 0.5, height: 0.5 };

function ingameMapWorldToLocalPercent(x, z, terrainSize, clampFrame) {
  const ts = Number(terrainSize);
  const size = Number.isFinite(ts) && ts >= 128 ? ts : 2048;
  const left = ((Number(x) + size * 0.5) / size) * 100;
  const top = ((Number(z) + size * 0.5) / size) * 100;
  if (clampFrame === false) return { left, top };
  return {
    left: clamp(left, 0.5, 99.5),
    top: clamp(top, 0.5, 99.5),
  };
}

function terrainUvPercent(x, z, bounds, clampFrame) {
  const ts = Number(bounds?.terrainSize);
  if (Number.isFinite(ts) && ts >= 128) {
    return ingameMapWorldToLocalPercent(x, z, ts, clampFrame);
  }
  const spanX = bounds.maxX - bounds.minX || 1;
  const spanZ = bounds.maxZ - bounds.minZ || 1;
  const left = ((Number(x) - bounds.minX) / spanX) * 100;
  const top = ((Number(z) - bounds.minZ) / spanZ) * 100;
  if (clampFrame === false) return { left, top };
  return {
    left: clamp(left, 0.5, 99.5),
    top: clamp(top, 0.5, 99.5),
  };
}

function applyOverviewCropPercent(point, crop, clampFrame) {
  const c = crop || { left: 0, top: 0, width: 1, height: 1 };
  const w = Number(c.width) > 0 ? Number(c.width) : 1;
  const h = Number(c.height) > 0 ? Number(c.height) : 1;
  const left = (Number(c.left) + (point.left / 100) * w) * 100;
  const top = (Number(c.top) + (point.top / 100) * h) * 100;
  if (clampFrame === false) return { left, top };
  return {
    left: clamp(left, 0.5, 99.5),
    top: clamp(top, 0.5, 99.5),
  };
}

function fleetMapPercent(x, z, bounds, options) {
  const clampFrame = options?.clampFrame !== false;
  const terrain = terrainUvPercent(x, z, bounds, false);
  if (options?.hideBorder) {
    if (clampFrame === false) return terrain;
    return {
      left: clamp(terrain.left, 0.5, 99.5),
      top: clamp(terrain.top, 0.5, 99.5),
    };
  }
  return applyOverviewCropPercent(terrain, INGAME_MAP_WORLD_INSET, clampFrame);
}

function worldToMapPercent(x, z, bounds, clampFrame) {
  return fleetMapPercent(x, z, bounds, { clampFrame: clampFrame !== false });
}

function computeObjectFitContainLayout(natW, natH, boxW, boxH) {
  const nw = Number(natW);
  const nh = Number(natH);
  const bw = Number(boxW);
  const bh = Number(boxH);
  if (!nw || !nh || !bw || !bh) {
    return { x: 0, y: 0, w: bw || 0, h: bh || 0 };
  }
  const scale = Math.min(bw / nw, bh / nh);
  const w = nw * scale;
  const h = nh * scale;
  return { x: (bw - w) / 2, y: (bh - h) / 2, w, h };
}

const FULL_TERRAIN_INSET = { left: 0, top: 0, width: 1, height: 1 };

function isFullBleedTerrainInset(inset) {
  const c = inset || FULL_TERRAIN_INSET;
  const area = Number(c.width) * Number(c.height);
  return (
    area >= 0.94 &&
    Number(c.left) <= 0.03 &&
    Number(c.top) <= 0.03 &&
    Number(c.left) + Number(c.width) >= 0.97 &&
    Number(c.top) + Number(c.height) >= 0.97
  );
}

function terrainClipPixelSize(natW, natH, inset) {
  const nw = Number(natW);
  const nh = Number(natH);
  const c = inset || FULL_TERRAIN_INSET;
  if (!nw || !nh) return { w: 0, h: 0, offsetX: 0, offsetY: 0 };
  if (isFullBleedTerrainInset(c)) {
    return { w: nw, h: nh, offsetX: 0, offsetY: 0 };
  }
  return {
    w: nw * Number(c.width),
    h: nh * Number(c.height),
    offsetX: nw * Number(c.left),
    offsetY: nh * Number(c.top),
  };
}

function mapOverviewIdentityKey(mapId, mapTitle) {
  const id = String(mapId || "").trim().toLowerCase();
  const title = String(mapTitle || "").trim().toLowerCase();
  return `${id}|${title}`;
}

const STANDARD_TERRAIN_HALVES = [1024, 2048, 4096, 8192];
const MIN_TERRAIN_HALF = 64;

function normalizeTerrainHalf(reportedHalf) {
  const h = Number(reportedHalf);
  if (!Number.isFinite(h) || h < MIN_TERRAIN_HALF) return 1024;
  return h;
}

function positionXZ(point) {
  if (!point || typeof point !== "object") return null;
  const nested = point.position && typeof point.position === "object" ? point.position : null;
  const x = Number(nested?.x ?? point.x ?? point.posX ?? point[0]);
  const z = Number(nested?.z ?? point.z ?? point.posZ ?? point[1]);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  if (Math.abs(x) < 0.5 && Math.abs(z) < 0.5) return null;
  return { x, z };
}

function inferSymmetricalTerrainHalf(reportedHalf, points) {
  let half = Number(reportedHalf);
  if (!Number.isFinite(half) || half <= 0) half = 1024;
  let maxAbs = 0;
  for (const raw of points || []) {
    const p = positionXZ(raw?.position ?? raw);
    if (!p) continue;
    maxAbs = Math.max(maxAbs, Math.abs(p.x), Math.abs(p.z));
  }
  if (maxAbs <= 0) return half;
  const need = maxAbs * 1.02;
  if (need <= half * 1.05) return half;
  for (const step of STANDARD_TERRAIN_HALVES) {
    if (step < half) continue;
    // Rim vertices on a 4 km map sit at ~±2038 m. need is then ~2078, which is
    // greater than 2048 but still that size class — not an 8 km world.
    if (maxAbs <= step * 1.02) return step;
  }
  return Math.max(half, Math.ceil(maxAbs / 1024) * 1024);
}

function boundsFromTerrainHalf(half) {
  const h = Number(half);
  if (!Number.isFinite(h) || h <= 0) {
    return { minX: -1024, maxX: 1024, minZ: -1024, maxZ: 1024, halfSize: 1024, terrainSize: 2048 };
  }
  return { minX: -h, maxX: h, minZ: -h, maxZ: h, halfSize: h, terrainSize: h * 2 };
}

/**
 * Playable world metres from map.xml / getTerrainSize.
 * Overview.dds is typically 2× pixels; Giants still maps the world into the centre
 * half of that image (INGAME_MAP_WORLD_INSET), not onto the whole texture.
 */
function overviewMetresFromEngine(raw) {
  const w = Number(raw?.mapWidth);
  if (Number.isFinite(w) && w >= MIN_TERRAIN_HALF * 2) return w;
  const h = Number(raw?.mapHeight);
  if (Number.isFinite(h) && h >= MIN_TERRAIN_HALF * 2) return h;
  const ts = Number(raw?.terrainSize);
  if (Number.isFinite(ts) && ts >= MIN_TERRAIN_HALF * 2) return ts;
  const half = Number(raw?.halfSize);
  if (Number.isFinite(half) && half >= MIN_TERRAIN_HALF) return half * 2;
  return 2048;
}

function withMapXmlSizes(bounds, raw) {
  const out = { ...bounds };
  const w = Number(raw?.mapWidth);
  const h = Number(raw?.mapHeight);
  if (Number.isFinite(w) && w >= MIN_TERRAIN_HALF * 2) out.mapWidth = w;
  if (Number.isFinite(h) && h >= MIN_TERRAIN_HALF * 2) out.mapHeight = h;
  return out;
}

function resolveTerrainBounds(dashboard, vehicles) {
  const raw = dashboard?.mapBounds || dashboard?.serverInfo?.mapBounds;
  let reportedHalf = normalizeTerrainHalf(raw?.halfSize);
  if (!raw?.halfSize) {
    const ts = Number(raw?.terrainSize);
    const mapW = Number(raw?.mapWidth);
    if (Number.isFinite(ts) && ts >= MIN_TERRAIN_HALF * 2) {
      reportedHalf = normalizeTerrainHalf(ts * 0.5);
    } else if (Number.isFinite(mapW) && mapW >= MIN_TERRAIN_HALF * 2) {
      reportedHalf = normalizeTerrainHalf(mapW * 0.5);
    }
  }
  const positions = [];
  for (const v of vehicles || []) {
    const p = positionXZ(v?.position ?? v);
    if (p) positions.push(p);
  }
  let half = inferSymmetricalTerrainHalf(reportedHalf, positions);
  if (raw && Number.isFinite(Number(raw.minX)) && Number.isFinite(Number(raw.maxX))) {
    half = Math.max(
      half,
      Math.abs(Number(raw.minX)),
      Math.abs(Number(raw.maxX)),
      Math.abs(Number(raw.minZ)),
      Math.abs(Number(raw.maxZ))
    );
  }
  return boundsFromTerrainHalf(half);
}

/** Playable world size — map.xml width, then getTerrainSize. Photo placement uses INGAME_MAP_WORLD_INSET. */
function resolveOverviewTerrainBounds(dashboard) {
  const raw = dashboard?.mapBounds || dashboard?.serverInfo?.mapBounds;
  const metres = overviewMetresFromEngine(raw);
  return withMapXmlSizes(boundsFromTerrainHalf(metres * 0.5), raw);
}

function resolveFleetMapTerrainBounds(dashboard, worldItems) {
  const raw = dashboard?.mapBounds || dashboard?.serverInfo?.mapBounds;
  const base = resolveOverviewTerrainBounds(dashboard);
  const half = inferSymmetricalTerrainHalf(base.halfSize || 1024, worldItems);
  return withMapXmlSizes(boundsFromTerrainHalf(half), raw);
}

module.exports = {
  worldToMapPercent,
  fleetMapPercent,
  ingameMapWorldToLocalPercent,
  applyOverviewCropPercent,
  computeObjectFitContainLayout,
  mapOverviewIdentityKey,
  inferSymmetricalTerrainHalf,
  boundsFromTerrainHalf,
  normalizeTerrainHalf,
  resolveTerrainBounds,
  resolveOverviewTerrainBounds,
  resolveFleetMapTerrainBounds,
  overviewMetresFromEngine,
  FULL_TERRAIN_INSET,
  INGAME_MAP_WORLD_INSET,
  isFullBleedTerrainInset,
  terrainClipPixelSize,
};
