/** World X/Z → fleet map screen (testable, no DOM). */

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export interface MapBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  halfSize?: number;
  terrainSize?: number;
  mapWidth?: number;
  mapHeight?: number;
}

export interface MapPercent {
  left: number;
  top: number;
}

/**
 * Playable world inside overview.dds — Giants IngameMap (PC).
 * IngameMap.lua: mapExtensionOffsetX/Z = 0.25, mapExtensionScaleFactor = 0.5.
 * Same rect as drawHotspot, drawFields, and InGameMenuMapFrame fruit/farmland overlay.
 * Outer half is authored scenery (black on Witcombe, painted hills on Riverbend).
 */
export const INGAME_MAP_WORLD_INSET = { left: 0.25, top: 0.25, width: 0.5, height: 0.5 };

export interface FleetMapPercentOptions {
  /** Clip the photo to INGAME_MAP_WORLD_INSET; percents are 0–100 of that square. */
  hideBorder?: boolean;
  clampFrame?: boolean;
}

/**
 * IngameMapElement:worldToLocalPos — 0–1 of the playable terrain square, not the photo.
 * localPosX = (worldX + terrainSize/2) / terrainSize
 * CSS top uses localPosY (north = −Z = 0). Giants screen Y is up, so they draw with (1 − v).
 */
export function ingameMapWorldToLocalPercent(
  x: number,
  z: number,
  terrainSize: number,
  clampFrame = true
): MapPercent {
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

function terrainUvPercent(
  x: number,
  z: number,
  bounds: MapBounds,
  clampFrame = true
): MapPercent {
  const ts = Number(bounds.terrainSize);
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

/**
 * Remap a terrain-square percent point into a sub-rect of the overview texture.
 * Fractions are 0–1. Used for Giants' centre-50% world inset (and extra chrome).
 */
export function applyOverviewCropPercent(
  point: MapPercent,
  crop?: { left?: number; top?: number; width?: number; height?: number } | null,
  clampFrame = true
): MapPercent {
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

/**
 * World metres → 0–100% on the fleet map.
 * Full overview photo: IngameMap:drawHotspot (centre 50% of the texture).
 * Hide-border: 0–100 of that same square after the photo is clipped to it.
 */
export function fleetMapPercent(
  x: number,
  z: number,
  bounds: MapBounds,
  options?: FleetMapPercentOptions
): MapPercent {
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

/**
 * Map world metres to 0–100% on the full overview texture (PDA hotspots / crop overlay).
 * FS25: +X east, +Z south, −Z north; PDA overview has north at the top.
 */
export function worldToMapPercent(
  x: number,
  z: number,
  bounds: MapBounds,
  clampFrame = true
): MapPercent {
  return fleetMapPercent(x, z, bounds, { clampFrame });
}

/** Layout for object-fit: contain — where the image actually draws inside the stage box. */
export function computeObjectFitContainLayout(
  natW: number,
  natH: number,
  boxW: number,
  boxH: number
): { x: number; y: number; w: number; h: number } {
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

export function isFullBleedTerrainInset(
  inset?: { left?: number; top?: number; width?: number; height?: number } | null
): boolean {
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

/**
 * Pixel size of the playable terrain window inside a full overview texture.
 * Legacy / tests — NEW APP shows the full PNG and remaps pins via applyOverviewCropPercent.
 */
export function terrainClipPixelSize(
  natW: number,
  natH: number,
  inset?: { left?: number; top?: number; width?: number; height?: number } | null
): { w: number; h: number; offsetX: number; offsetY: number } {
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
export function normalizeTerrainHalf(reportedHalf: number | null | undefined): number {
  const h = Number(reportedHalf);
  if (!Number.isFinite(h) || h < MIN_TERRAIN_HALF) return 1024;
  return h;
}

function positionXZ(point: unknown): { x: number; z: number } | null {
  if (!point || typeof point !== "object") return null;
  const p = point as Record<string, unknown>;
  const nested = p.position && typeof p.position === "object" ? (p.position as Record<string, unknown>) : null;
  const x = Number(
    nested?.x ?? p.x ?? p.posX ?? (Array.isArray(point) ? (point as number[])[0] : undefined)
  );
  const z = Number(
    nested?.z ?? p.z ?? p.posZ ?? (Array.isArray(point) ? (point as number[])[1] : undefined)
  );
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  if (Math.abs(x) < 0.5 && Math.abs(z) < 0.5) return null;
  return { x, z };
}

/**
 * When the mod reports halfSize=1024 but entities sit beyond ±1024 (common on 4 km maps),
 * bump to the next standard terrain half so pins are not clamped to the image edge.
 */
export function inferSymmetricalTerrainHalf(
  reportedHalf: number,
  points: unknown[] | null | undefined
): number {
  let half = Number(reportedHalf);
  if (!Number.isFinite(half) || half <= 0) half = 1024;

  let maxAbs = 0;
  for (const raw of points || []) {
    const row = raw as { position?: unknown };
    const p = positionXZ(row?.position ?? raw);
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

export function boundsFromTerrainHalf(half: number): MapBounds {
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

/**
 * Playable world metres from map.xml / getTerrainSize.
 * Overview.dds is typically 2× pixels; Giants still maps the world into the centre
 * half of that image (INGAME_MAP_WORLD_INSET), not onto the whole texture.
 */
export function overviewMetresFromEngine(raw: Partial<MapBounds> | null | undefined): number {
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

function withMapXmlSizes(bounds: MapBounds, raw: Partial<MapBounds> | null | undefined): MapBounds {
  const out: MapBounds = { ...bounds };
  const w = Number(raw?.mapWidth);
  const h = Number(raw?.mapHeight);
  if (Number.isFinite(w) && w >= MIN_TERRAIN_HALF * 2) out.mapWidth = w;
  if (Number.isFinite(h) && h >= MIN_TERRAIN_HALF * 2) out.mapHeight = h;
  return out;
}

export function mapOverviewIdentityKey(mapId: string | null | undefined, mapTitle: string | null | undefined): string {
  const id = String(mapId || "").trim().toLowerCase();
  const title = String(mapTitle || "").trim().toLowerCase();
  return `${id}|${title}`;
}

export interface TerrainDashboard {
  mapBounds?: Partial<MapBounds> | null;
  serverInfo?: { mapBounds?: Partial<MapBounds> | null } | null;
}

export function resolveTerrainBounds(
  dashboard: TerrainDashboard | null | undefined,
  vehicles: Array<{ position?: unknown } | null> | null | undefined
): MapBounds {
  const raw = dashboard?.mapBounds || dashboard?.serverInfo?.mapBounds;
  let reportedHalf = normalizeTerrainHalf(raw?.halfSize);
  if (!raw?.halfSize) {
    const ts = Number(raw?.terrainSize);
    if (Number.isFinite(ts) && ts >= MIN_TERRAIN_HALF * 2) {
      reportedHalf = normalizeTerrainHalf(ts * 0.5);
    }
  }

  const positions: { x: number; z: number }[] = [];
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
 * Playable world size. Prefer map.xml width, then getTerrainSize.
 * Do not squash 4 km maps onto a 2 km UV. Overlay placement on the photo uses
 * INGAME_MAP_WORLD_INSET on top of this square.
 */
export function resolveOverviewTerrainBounds(dashboard: TerrainDashboard | null | undefined): MapBounds {
  const raw = dashboard?.mapBounds || dashboard?.serverInfo?.mapBounds;
  const metres = overviewMetresFromEngine(raw);
  return withMapXmlSizes(boundsFromTerrainHalf(metres * 0.5), raw);
}

/**
 * Overview UV plus a one-way bump when vehicles/fields sit clearly outside the
 * engine square (Montana 4x reporting 2 km). Rim fields on a real 2 km map stay 2 km.
 */
export function resolveFleetMapTerrainBounds(
  dashboard: TerrainDashboard | null | undefined,
  worldItems: unknown[] | null | undefined
): MapBounds {
  const raw = dashboard?.mapBounds || dashboard?.serverInfo?.mapBounds;
  const base = resolveOverviewTerrainBounds(dashboard);
  const half = inferSymmetricalTerrainHalf(base.halfSize || 1024, worldItems);
  return withMapXmlSizes(boundsFromTerrainHalf(half), raw);
}
