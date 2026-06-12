// FS25 FarmDashboard | fleetMapGeo.js — world X/Z → fleet map screen (testable, no DOM)

export function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Map world metres to 0–100% on the terrain square.
 * FS25: +X east, +Z south, −Z north; PDA overview has north at the top.
 */
export function worldToMapPercent(x, z, bounds) {
  const spanX = bounds.maxX - bounds.minX || 1;
  const spanZ = bounds.maxZ - bounds.minZ || 1;
  return {
    left: clamp(((Number(x) - bounds.minX) / spanX) * 100, 0.5, 99.5),
    top: clamp(((Number(z) - bounds.minZ) / spanZ) * 100, 0.5, 99.5),
  };
}

/** Apply texture insets when overview.dds includes a decorative border (fractions 0–1). */
export function applyOverviewCropPercent(point, crop) {
  const c = crop || { left: 0, top: 0, width: 1, height: 1 };
  const w = Number(c.width) > 0 ? Number(c.width) : 1;
  const h = Number(c.height) > 0 ? Number(c.height) : 1;
  return {
    left: clamp((Number(c.left) + (point.left / 100) * w) * 100, 0.5, 99.5),
    top: clamp((Number(c.top) + (point.top / 100) * h) * 100, 0.5, 99.5),
  };
}

/** Layout for object-fit: contain — where the image actually draws inside the stage box. */
export function computeObjectFitContainLayout(natW, natH, boxW, boxH) {
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

/** Full texture — no PDA desk border detected. */
export const FULL_TERRAIN_INSET = { left: 0, top: 0, width: 1, height: 1 };

export function isFullBleedTerrainInset(inset) {
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

/** Pixel size of the playable terrain window inside a full overview texture. */
export function terrainClipPixelSize(natW, natH, inset) {
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

/** @deprecated Server-side auto-detect replaces this; kept for tests only. */
export const DEFAULT_PDA_TERRAIN_INSET = { left: 0.1, top: 0.1, width: 0.8, height: 0.8 };

const STANDARD_TERRAIN_HALVES = [1024, 2048, 4096, 8192];
const MIN_TERRAIN_HALF = 64;

/** Reject bogus bootstrap values (e.g. terrainSize=1 → halfSize=0.5 before mission load). */
export function normalizeTerrainHalf(reportedHalf) {
  const h = Number(reportedHalf);
  if (!Number.isFinite(h) || h < MIN_TERRAIN_HALF) return 1024;
  return h;
}

function positionXZ(point) {
  if (!point || typeof point !== "object") return null;
  const x = Number(point.x ?? point[0]);
  const z = Number(point.z ?? point[1]);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  if (Math.abs(x) < 0.5 && Math.abs(z) < 0.5) return null;
  return { x, z };
}

/**
 * FS25 world coords are centred on the terrain; PDA overview uses the full square.
 * When the mod reports halfSize=1024 but entities sit beyond ±1024 (common on 4 km maps),
 * bump to the next standard terrain half so pins are not clamped to the image edge.
 */
export function inferSymmetricalTerrainHalf(reportedHalf, points) {
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
    if (need <= step) return step;
  }
  return Math.ceil(maxAbs / 1024) * 1024;
}

export function boundsFromTerrainHalf(half) {
  const h = Number(half);
  if (!Number.isFinite(h) || h <= 0) {
    return { minX: -1024, maxX: 1024, minZ: -1024, maxZ: 1024, halfSize: 1024, terrainSize: 2048 };
  }
  return {
    minX: -h,
    maxX: h,
    minZ: -h,
    maxZ: h,
    halfSize: h,
    terrainSize: h * 2,
  };
}

export function mapOverviewIdentityKey(mapId, mapTitle) {
  const id = String(mapId || "").trim().toLowerCase();
  const title = String(mapTitle || "").trim().toLowerCase();
  return `${id}|${title}`;
}

export function resolveTerrainBounds(dashboard, vehicles) {
  const raw = dashboard?.mapBounds || dashboard?.serverInfo?.mapBounds;
  let reportedHalf = normalizeTerrainHalf(raw?.halfSize);
  if (!raw?.halfSize) {
    const ts = Number(raw?.terrainSize);
    if (Number.isFinite(ts) && ts >= MIN_TERRAIN_HALF * 2) {
      reportedHalf = normalizeTerrainHalf(ts * 0.5);
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

/**
 * PDA overview.dds UV layout is usually the engine-standard 2 km halfSize (±1024 m)
 * even when the save reports a larger terrain (4 km mod maps). Using the full
 * terrain half for pin projection compresses north–south and clips east–west.
 */
export function resolveOverviewTerrainBounds(dashboard) {
  const raw = dashboard?.mapBounds || dashboard?.serverInfo?.mapBounds;
  let reportedHalf = normalizeTerrainHalf(raw?.halfSize);
  const terrainSize = Number(raw?.terrainSize);
  if (!raw?.halfSize && Number.isFinite(terrainSize) && terrainSize >= MIN_TERRAIN_HALF * 2) {
    reportedHalf = normalizeTerrainHalf(terrainSize * 0.5);
  }

  const isLargeTerrain =
    (Number.isFinite(terrainSize) && terrainSize > 2048) || reportedHalf > 1024;
  const overviewHalf = isLargeTerrain ? 1024 : reportedHalf;
  return boundsFromTerrainHalf(overviewHalf);
}
