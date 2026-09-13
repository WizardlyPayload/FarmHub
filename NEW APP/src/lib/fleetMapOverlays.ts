/**
 * Fleet-map field overlays from per-field aggregates (LiveMap-style layers).
 * Prefer a compact `outline` (≤32 world X/Z vertices). Fall back to a centroid blob.
 * Do not dump full densmap rings. Organic matter is 0–10, never percent.
 */

import { clamp } from "@/lib/fleetMapGeo";
import type { FleetMapIconKind } from "@/lib/fleetMapMarkers";

export const FLEET_MAP_OVERLAY_MODES = [
  "off",
  "crops",
  "growth",
  "ownership",
  "fertilized",
  "weeds",
  "stones",
  "needsPlowing",
  "needsLime",
  "needsRolling",
  "mulched",
  "watered",
  "soilOm",
  "soilPh",
  "soilN",
  "soilUrgency",
  "pfSoilType",
  "moisture",
  "work",
] as const;

export type FleetMapOverlayMode = (typeof FLEET_MAP_OVERLAY_MODES)[number];

export const FLEET_MAP_TYPE_FILTERS = [
  "all",
  "tractor",
  "harvester",
  "trailer",
  "truck",
  "car",
  "loader",
  "cutter",
  "implement",
  "other",
] as const;

export type FleetMapTypeFilter = (typeof FLEET_MAP_TYPE_FILTERS)[number];

const CROP_COLORS: Record<string, string> = {
  WHEAT: "rgba(232, 197, 71, 0.58)",
  BARLEY: "rgba(212, 160, 23, 0.58)",
  OAT: "rgba(196, 181, 138, 0.58)",
  OATS: "rgba(196, 181, 138, 0.58)",
  CANOLA: "rgba(245, 230, 66, 0.55)",
  RAPE: "rgba(245, 230, 66, 0.55)",
  CORN: "rgba(106, 176, 76, 0.55)",
  MAIZE: "rgba(106, 176, 76, 0.55)",
  SOYBEAN: "rgba(45, 106, 79, 0.55)",
  SOYBEANS: "rgba(45, 106, 79, 0.55)",
  POTATO: "rgba(201, 162, 39, 0.55)",
  POTATOES: "rgba(201, 162, 39, 0.55)",
  SUGARBEET: "rgba(142, 68, 173, 0.52)",
  SUGARCANE: "rgba(39, 174, 96, 0.52)",
  COTTON: "rgba(245, 240, 230, 0.5)",
  SUNFLOWER: "rgba(243, 156, 18, 0.55)",
  GRASS: "rgba(61, 158, 74, 0.5)",
  MEADOW: "rgba(45, 106, 79, 0.5)",
  CLOVER: "rgba(92, 184, 92, 0.5)",
  ALFALFA: "rgba(76, 175, 80, 0.5)",
  OILSEEDRADISH: "rgba(124, 179, 66, 0.5)",
  SPINACH: "rgba(27, 94, 32, 0.55)",
  PEA: "rgba(139, 195, 74, 0.52)",
  GREENBEAN: "rgba(104, 159, 56, 0.52)",
  CARROT: "rgba(230, 126, 34, 0.55)",
  PARSNIP: "rgba(212, 165, 116, 0.55)",
  BEETROOT: "rgba(192, 57, 43, 0.52)",
  RICE: "rgba(144, 202, 249, 0.5)",
  RICELONGGRAIN: "rgba(100, 181, 246, 0.5)",
  GRAPE: "rgba(106, 27, 154, 0.5)",
  OLIVE: "rgba(130, 119, 23, 0.52)",
  POPLAR: "rgba(51, 105, 30, 0.5)",
  SORGHUM: "rgba(239, 108, 0, 0.52)",
  EMPTY: "rgba(148, 163, 184, 0.32)",
  UNKNOWN: "rgba(148, 163, 184, 0.28)",
  MULCHED_STUBBLE: "rgba(123, 31, 162, 0.45)",
};

export const OVERLAY_IDLE_FILL = "rgba(148, 163, 184, 0.22)";
const FILL_PLOW = "rgba(166, 93, 58, 0.5)";
const FILL_LIME = "rgba(236, 240, 241, 0.5)";
const FILL_ROLL = "rgba(93, 173, 226, 0.5)";
const FILL_MULCH = "rgba(123, 31, 162, 0.45)";
const FILL_WATER = "rgba(41, 128, 185, 0.5)";
const FILL_STONES = "rgba(161, 136, 127, 0.55)";
const FILL_UNSCANNED = "rgba(148, 163, 184, 0.28)";
const FILL_HARVEST = "rgba(249, 168, 37, 0.58)";
const FILL_WEEDS = "rgba(46, 204, 113, 0.5)";
const FILL_WORK_FERT = "rgba(155, 89, 182, 0.5)";

export function isOwnedField(field: Record<string, unknown> | null | undefined): boolean {
  const oid = Number(field?.ownerFarmId ?? field?.farmId ?? 0);
  return Number.isFinite(oid) && oid > 0;
}

export function isFleetMapOverlayMode(value: string | null | undefined): value is FleetMapOverlayMode {
  return FLEET_MAP_OVERLAY_MODES.includes(value as FleetMapOverlayMode);
}

export function isFleetMapTypeFilter(value: string | null | undefined): value is FleetMapTypeFilter {
  return FLEET_MAP_TYPE_FILTERS.includes(value as FleetMapTypeFilter);
}

export function readWorldXZ(row: unknown): { x: number; z: number } | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const pos = r.position && typeof r.position === "object" ? (r.position as Record<string, unknown>) : null;
  const x = Number(pos?.x ?? r.x ?? r.posX);
  const z = Number(pos?.z ?? r.z ?? r.posZ);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  if (Math.abs(x) < 0.5 && Math.abs(z) < 0.5) return null;
  return { x, z };
}

/** Square-equivalent field side as a % of the terrain span. */
export function fieldBlobSizePercent(hectares: number, terrainSize: number): number {
  const ha = Math.max(0, Number(hectares) || 0);
  const span = Number(terrainSize) > 64 ? Number(terrainSize) : 2048;
  const sideM = Math.sqrt(ha * 10000);
  return clamp((sideM / span) * 100, 2.2, 16);
}

const OUTLINE_MAX_POINTS = 64;

function pushOutlinePoint(pts: Array<[number, number]>, x: unknown, z: unknown) {
  const nx = Number(x);
  const nz = Number(z);
  if (!Number.isFinite(nx) || !Number.isFinite(nz)) return;
  pts.push([nx, nz]);
}

/** Compact [[x,z], ...] from Lua outline or LiveMap `polygons` rings. */
export function normalizeFieldOutline(raw: unknown, maxPoints = OUTLINE_MAX_POINTS): Array<[number, number]> | null {
  let src: unknown = raw;
  if (Array.isArray(src) && src.length > 0 && Array.isArray(src[0])) {
    const inner0 = (src[0] as unknown[])[0];
    if (inner0 && typeof inner0 === "object" && !Array.isArray(inner0)) {
      src = src[0];
    }
  }
  const pts: Array<[number, number]> = [];
  if (Array.isArray(src)) {
    for (const p of src) {
      if (Array.isArray(p) && p.length >= 2 && typeof p[0] === "number") {
        pushOutlinePoint(pts, p[0], p[1]);
      } else if (p && typeof p === "object") {
        const row = p as Record<string, unknown>;
        pushOutlinePoint(pts, row.x ?? row["0"], row.z ?? row["1"]);
      }
    }
  } else if (src && typeof src === "object") {
    const row = src as { pointsX?: unknown; pointsZ?: unknown };
    if (Array.isArray(row.pointsX) && Array.isArray(row.pointsZ)) {
      const n = Math.min(row.pointsX.length, row.pointsZ.length);
      for (let i = 0; i < n; i++) pushOutlinePoint(pts, row.pointsX[i], row.pointsZ[i]);
    }
  }
  if (pts.length < 3) return null;
  if (pts.length <= maxPoints) return pts;
  const step = Math.ceil(pts.length / maxPoints);
  const out: Array<[number, number]> = [];
  for (let i = 0; i < pts.length; i += step) out.push(pts[i]);
  const last = pts[pts.length - 1];
  const kept = out[out.length - 1];
  if (!kept || kept[0] !== last[0] || kept[1] !== last[1]) out.push(last);
  return out.length >= 3 ? out : null;
}

export function outlineToSvgPoints(
  outline: Array<[number, number]>,
  toPct: (x: number, z: number) => { left: number; top: number },
): string {
  return outline
    .map(([x, z]) => {
      const pct = toPct(x, z);
      return `${pct.left.toFixed(2)},${pct.top.toFixed(2)}`;
    })
    .join(" ");
}

export interface MapFieldOutlineRow {
  id: number;
  outline: Array<[number, number]>;
  cx?: number;
  cz?: number;
}

const NEAREST_OUTLINE_MAX_M = 160;

function outlineCentroid(outline: Array<[number, number]>): { x: number; z: number } | null {
  if (!outline.length) return null;
  let sx = 0;
  let sz = 0;
  for (const p of outline) {
    sx += p[0];
    sz += p[1];
  }
  return { x: sx / outline.length, z: sz / outline.length };
}

function pointInOutline(x: number, z: number, outline: Array<[number, number]>): boolean {
  if (outline.length < 3) return false;
  let inside = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const xi = outline[i][0];
    const zi = outline[i][1];
    const xj = outline[j][0];
    const zj = outline[j][1];
    const denom = zj - zi || 1e-9;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / denom + xi) inside = !inside;
  }
  return inside;
}

function outlineNearPoint(xz: { x: number; z: number } | null, row: MapFieldOutlineRow): boolean {
  if (!xz) return true;
  const outline = Array.isArray(row.outline) ? row.outline : [];
  if (pointInOutline(xz.x, xz.z, outline)) return true;
  const c =
    Number.isFinite(Number(row.cx)) && Number.isFinite(Number(row.cz))
      ? { x: Number(row.cx), z: Number(row.cz) }
      : outlineCentroid(outline);
  if (!c) return false;
  return Math.hypot(c.x - xz.x, c.z - xz.z) <= NEAREST_OUTLINE_MAX_M;
}

/** Lua outline if present; else map i3d polygon matched by farmlandId / id / containment. */
export function pickMapOutlineForField(
  field: Record<string, unknown> | null | undefined,
  mapFields: MapFieldOutlineRow[] | null | undefined,
): Array<[number, number]> | null {
  if (!field) return null;
  const lua =
    normalizeFieldOutline(field.outline) ||
    normalizeFieldOutline(field.polygons) ||
    normalizeFieldOutline((field.polygons as unknown[] | undefined)?.[0]);
  if (lua) return lua;
  const rows = Array.isArray(mapFields) ? mapFields : [];
  if (!rows.length) return null;
  const byId = (n: number) => rows.find((r) => Number(r.id) === n) || null;
  const fa = Number(field.farmlandId);
  const id = Number(field.id);
  const xz = readWorldXZ(field);
  if (Number.isFinite(fa) && fa > 0) {
    const hit = byId(fa);
    if (hit) return normalizeFieldOutline(hit.outline);
  }
  if (Number.isFinite(id) && id > 0 && id !== fa) {
    const hit = byId(id);
    if (hit && outlineNearPoint(xz, hit)) return normalizeFieldOutline(hit.outline);
  }
  if (xz) {
    const containing = rows.filter((r) => pointInOutline(xz.x, xz.z, Array.isArray(r.outline) ? r.outline : []));
    if (containing.length === 1) return normalizeFieldOutline(containing[0].outline);
  }
  return null;
}

function finiteOrNull(n: unknown): number | null {
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}

function soilActive(info: unknown): boolean {
  if (!info || typeof info !== "object") return false;
  const s = info as { enabled?: boolean; pfConflict?: boolean };
  return Boolean(s.enabled) && !s.pfConflict;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

export function snapshotHasSoilFertilizer(
  fields: Array<Record<string, unknown>> | null | undefined,
): boolean {
  for (const f of fields || []) {
    if (soilActive(f.soilFertilizer)) return true;
  }
  return false;
}

export function snapshotHasPrecisionFarming(
  fields: Array<Record<string, unknown>> | null | undefined,
): boolean {
  for (const f of fields || []) {
    if (f.isPrecisionFarming === true) return true;
  }
  return false;
}

export type FleetMapOverlayGroup = "fields" | "soil" | "precisionFarming" | "soilFertilizer" | "other";

export function overlayGroup(mode: FleetMapOverlayMode): FleetMapOverlayGroup {
  switch (mode) {
    case "off":
    case "crops":
    case "growth":
    case "ownership":
      return "fields";
    case "fertilized":
    case "weeds":
    case "stones":
    case "needsPlowing":
    case "needsLime":
    case "needsRolling":
    case "mulched":
    case "watered":
      return "soil";
    case "pfSoilType":
      return "precisionFarming";
    case "soilOm":
    case "soilUrgency":
      return "soilFertilizer";
    case "soilPh":
    case "soilN":
      return "soilFertilizer";
    case "moisture":
    case "work":
      return "other";
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

export function overlayGroupForMode(
  mode: FleetMapOverlayMode,
  hasPf: boolean,
  hasSf: boolean,
): FleetMapOverlayGroup {
  if ((mode === "soilN" || mode === "soilPh") && hasPf && !hasSf) return "precisionFarming";
  return overlayGroup(mode);
}

export function availableOverlayModes(
  fields: Array<Record<string, unknown>> | null | undefined,
): FleetMapOverlayMode[] {
  const rows = fields || [];
  const hasSf = snapshotHasSoilFertilizer(rows);
  const hasPf = snapshotHasPrecisionFarming(rows);
  const hideVanillaFertLime = hasSf || hasPf;
  // PDA soil order: weeds, fertilized, plow, lime, rolling, mulched, stones, watered.
  // PF/SF remove fertilized + needs lime (InGameMenuMapFrameExtension / SF stand-down).
  const out: FleetMapOverlayMode[] = ["off", "crops", "growth", "ownership", "weeds"];
  if (!hideVanillaFertLime) out.push("fertilized");
  out.push("needsPlowing");
  if (!hideVanillaFertLime) out.push("needsLime");
  out.push("needsRolling", "mulched", "stones", "watered");
  if (hasPf) {
    out.push("soilN", "soilPh", "pfSoilType");
  }
  if (hasSf) {
    out.push("soilOm", "soilPh", "soilN", "soilUrgency");
  }
  if (
    rows.some((f) => {
      const stress = asRecord(f.cropStress);
      const moisture = asRecord(f.moisture);
      return finiteOrNull(stress?.moisturePercent) != null || finiteOrNull(moisture?.percent) != null;
    })
  ) {
    out.push("moisture");
  }
  out.push("work");
  const seen = new Set<FleetMapOverlayMode>();
  return out.filter((mode) => {
    if (seen.has(mode)) return false;
    seen.add(mode);
    return true;
  });
}

const OVERLAY_GROUP_ORDER: FleetMapOverlayGroup[] = [
  "fields",
  "soil",
  "precisionFarming",
  "soilFertilizer",
  "other",
];

export function groupedAvailableOverlayModes(
  fields: Array<Record<string, unknown>> | null | undefined,
): Array<{ group: FleetMapOverlayGroup; modes: FleetMapOverlayMode[] }> {
  const rows = fields || [];
  const modes = availableOverlayModes(rows);
  const hasPf = snapshotHasPrecisionFarming(rows);
  const hasSf = snapshotHasSoilFertilizer(rows);
  const groups: Array<{ group: FleetMapOverlayGroup; modes: FleetMapOverlayMode[] }> = [];
  for (const group of OVERLAY_GROUP_ORDER) {
    const slice = modes.filter((mode) => mode !== "off" && overlayGroupForMode(mode, hasPf, hasSf) === group);
    if (slice.length) groups.push({ group, modes: slice });
  }
  return groups;
}

function cropKey(field: Record<string, unknown>): string {
  const raw = String(field.fruitType || field.fruitTypeName || "UNKNOWN").trim().toUpperCase();
  if (!raw || raw === "UNKNOWN" || raw === "NONE") return "EMPTY";
  return raw.replace(/\s+/g, "");
}

function hashHue(token: string): number {
  let h = 0;
  for (let i = 0; i < token.length; i++) h = (h * 31 + token.charCodeAt(i)) >>> 0;
  return h % 360;
}

export function cropOverlayFill(fruitType: string | null | undefined): string {
  const key = String(fruitType || "EMPTY").trim().toUpperCase().replace(/\s+/g, "") || "EMPTY";
  if (CROP_COLORS[key]) return CROP_COLORS[key];
  return `hsla(${hashHue(key)}, 55%, 42%, 0.5)`;
}

function growthFill(percent: number): string {
  const p = clamp(percent, 0, 100);
  if (p >= 88) return "rgba(249, 168, 37, 0.58)";
  const h = 28 + (p / 88) * 92;
  return `hsla(${h}, 58%, 38%, 0.5)`;
}

function omFill(om: number): string {
  const t = clamp(om / 10, 0, 1);
  const h = 28 + t * 92;
  return `hsla(${h}, 52%, 36%, 0.52)`;
}

function phFill(ph: number): string {
  const delta = clamp(Math.abs(ph - 6.5) / 2.5, 0, 1);
  if (ph < 6.5) return `hsla(${8 + (1 - delta) * 110}, 62%, 40%, 0.52)`;
  return `hsla(${120 - delta * 80}, 55%, 40%, 0.52)`;
}

function nutrientFill(value: number, target: number): string {
  if (!(target > 0)) return "rgba(148, 163, 184, 0.35)";
  const t = clamp(value / target, 0, 1.2);
  const h = t >= 0.85 ? 125 : t * 125;
  return `hsla(${h}, 58%, 38%, 0.5)`;
}

function urgencyFill(urgency: number): string {
  const t = clamp(urgency / 100, 0, 1);
  const h = 125 - t * 125;
  return `hsla(${h}, 70%, 42%, 0.55)`;
}

function moistureFill(percent: number): string {
  const p = clamp(percent, 0, 100);
  if (p < 25) return "rgba(230, 126, 34, 0.55)";
  if (p < 40) return "rgba(241, 196, 15, 0.5)";
  if (p <= 75) return "rgba(52, 152, 219, 0.5)";
  return "rgba(41, 128, 185, 0.58)";
}

export function cssColorWithAlpha(css: string, alpha: number): string {
  const parsed = parseCssWithAlpha(css, alpha);
  return parsed || css;
}

function parseCssWithAlpha(css: string, alpha: number): string | null {
  const a = clamp(alpha, 0, 1);
  const rgb = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i.exec(css);
  if (rgb) return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${a})`;
  const rgba = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*[\d.]+\s*\)$/i.exec(css);
  if (rgba) return `rgba(${rgba[1]}, ${rgba[2]}, ${rgba[3]}, ${a})`;
  const hex = /^#([0-9a-f]{6})$/i.exec(css);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }
  return null;
}

const RELATIVE_OVERLAY_MODES: ReadonlySet<FleetMapOverlayMode> = new Set([
  "soilOm",
  "soilPh",
  "soilN",
  "soilUrgency",
  "moisture",
  "fertilized",
  "weeds",
  "stones",
]);

export function isRelativeOverlayMode(mode: FleetMapOverlayMode): boolean {
  return RELATIVE_OVERLAY_MODES.has(mode);
}

export function overlayScaleInvert(mode: FleetMapOverlayMode): boolean {
  return mode === "soilUrgency" || mode === "weeds" || mode === "stones";
}

export function canonicalOverlayRange(mode: FleetMapOverlayMode): OverlayValueRange | null {
  switch (mode) {
    case "soilOm":
      return { min: 0, max: 10 };
    case "soilPh":
      return { min: 5, max: 8 };
    case "soilN":
      return { min: 0, max: 100 };
    case "soilUrgency":
      return { min: 0, max: 100 };
    case "moisture":
      return { min: 0, max: 100 };
    case "fertilized":
      return { min: 0, max: 2 };
    case "weeds":
      return { min: 0, max: 100 };
    case "stones":
      return { min: 0, max: 1 };
    case "off":
    case "crops":
    case "growth":
    case "ownership":
    case "work":
    case "needsPlowing":
    case "needsLime":
    case "needsRolling":
    case "mulched":
    case "watered":
    case "pfSoilType":
      return null;
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

export function overlayLegendRange(
  mode: FleetMapOverlayMode,
  computed: OverlayValueRange | null | undefined,
): OverlayValueRange | null {
  if (!isRelativeOverlayMode(mode)) return null;
  if (computed && computed.max > computed.min) return computed;
  return canonicalOverlayRange(mode);
}

export interface OverlayValueRange {
  min: number;
  max: number;
}

function relativeFill(t: number, invert = false): string {
  const u = invert ? 1 - clamp(t, 0, 1) : clamp(t, 0, 1);
  return `hsla(${8 + u * 117}, 64%, 40%, 0.5)`;
}

function rangeEpsilon(mode: FleetMapOverlayMode): number {
  switch (mode) {
    case "soilOm":
      return 0.15;
    case "soilPh":
      return 0.12;
    case "soilN":
      return 1;
    case "soilUrgency":
      return 4;
    case "moisture":
      return 2.5;
    case "fertilized":
      return 0.25;
    case "weeds":
      return 8;
    case "stones":
      return 0.2;
    case "off":
    case "crops":
    case "growth":
    case "ownership":
    case "work":
    case "needsPlowing":
    case "needsLime":
    case "needsRolling":
    case "mulched":
    case "watered":
    case "pfSoilType":
      return 0;
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

export function overlayNumericValue(
  field: Record<string, unknown> | null | undefined,
  mode: FleetMapOverlayMode,
): number | null {
  if (!field) return null;
  const soil = field.soilFertilizer && typeof field.soilFertilizer === "object"
    ? (field.soilFertilizer as Record<string, unknown>)
    : null;
  const stress = field.cropStress && typeof field.cropStress === "object"
    ? (field.cropStress as Record<string, unknown>)
    : null;
  const moisture = field.moisture && typeof field.moisture === "object"
    ? (field.moisture as Record<string, unknown>)
    : null;
  const pfOn = field.isPrecisionFarming === true;

  switch (mode) {
    case "soilOm":
      return soilActive(soil) ? finiteOrNull(soil?.organicMatter) : null;
    case "soilPh":
      if (soilActive(soil)) return finiteOrNull(soil?.pH);
      if (pfOn && field.isScanned === true) return finiteOrNull(field.phValue);
      return null;
    case "soilN": {
      if (soilActive(soil)) {
        const ppm = soil?.ppm && typeof soil.ppm === "object" ? (soil.ppm as Record<string, unknown>) : null;
        return finiteOrNull(ppm?.n) ?? finiteOrNull((soil?.nitrogen as { value?: number } | undefined)?.value);
      }
      if (pfOn && field.isScanned === true) return finiteOrNull(field.nitrogenLevel);
      return null;
    }
    case "soilUrgency":
      return soilActive(soil) ? finiteOrNull(soil?.urgency) : null;
    case "moisture":
      return finiteOrNull(stress?.moisturePercent) ?? finiteOrNull(moisture?.percent);
    case "fertilized":
      return finiteOrNull(field.fertilizationLevel) ?? finiteOrNull(field.sprayLevel);
    case "weeds":
      return finiteOrNull(field.weedPercent) ?? (finiteOrNull(field.weedLevel) != null
        ? Number(field.weedLevel) <= 4
          ? (Number(field.weedLevel) / 4) * 100
          : Number(field.weedLevel) <= 1
            ? Number(field.weedLevel) * 100
            : Number(field.weedLevel)
        : null);
    case "stones":
      return finiteOrNull(field.stoneLevel);
    case "off":
    case "crops":
    case "growth":
    case "ownership":
    case "work":
    case "needsPlowing":
    case "needsLime":
    case "needsRolling":
    case "mulched":
    case "watered":
    case "pfSoilType":
      return null;
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

export function computeOverlayRange(
  fields: Array<Record<string, unknown>> | null | undefined,
  mode: FleetMapOverlayMode,
): OverlayValueRange | null {
  if (!isRelativeOverlayMode(mode)) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const field of fields || []) {
    const v = overlayNumericValue(field, mode);
    if (v == null) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || max - min < rangeEpsilon(mode)) return null;
  return { min, max };
}

function workFill(field: Record<string, unknown>, soil: Record<string, unknown> | null): string {
  if (field.harvestReady === true) return FILL_HARVEST;
  if (Number(field.weedLevel) >= 0.45 || field.needsWeeding === true) return FILL_WEEDS;
  if (field.needsLime === true || Number(field.limeLevel) <= 0) return FILL_LIME;
  if (field.needsPlowing === true || Number(field.plowLevel) <= 0) return FILL_PLOW;
  if (field.needsRolling === true) return FILL_ROLL;
  if (soil?.needsFertilization === true) return FILL_WORK_FERT;
  return OVERLAY_IDLE_FILL;
}

export interface OverlayPaint {
  fill: string;
}

function idlePaint(): OverlayPaint {
  return { fill: OVERLAY_IDLE_FILL };
}

export function overlayPaintForField(
  field: Record<string, unknown> | null | undefined,
  mode: FleetMapOverlayMode,
  farmCss: string,
  range?: OverlayValueRange | null,
): OverlayPaint | null {
  if (!field || mode === "off") return null;

  const soil = field.soilFertilizer && typeof field.soilFertilizer === "object"
    ? (field.soilFertilizer as Record<string, unknown>)
    : null;
  const stress = field.cropStress && typeof field.cropStress === "object"
    ? (field.cropStress as Record<string, unknown>)
    : null;
  const moisture = field.moisture && typeof field.moisture === "object"
    ? (field.moisture as Record<string, unknown>)
    : null;

  if (
    (mode === "soilN" || mode === "soilPh" || mode === "pfSoilType") &&
    field.isPrecisionFarming === true &&
    field.isScanned !== true &&
    !soilActive(soil)
  ) {
    return { fill: FILL_UNSCANNED };
  }

  if (range && isRelativeOverlayMode(mode) && range.max > range.min) {
    const v = overlayNumericValue(field, mode);
    if (v == null) return idlePaint();
    const t = (v - range.min) / (range.max - range.min);
    return { fill: relativeFill(t, overlayScaleInvert(mode)) };
  }

  switch (mode) {
    case "crops": {
      const engine = parseCssWithAlpha(String(field.fruitMapColor || ""), 0.5);
      if (engine) return { fill: engine };
      return { fill: cropOverlayFill(cropKey(field)) };
    }
    case "growth": {
      const pct =
        finiteOrNull(field.growthStatePercentage) ??
        (finiteOrNull(soil?.growthFraction) != null ? Number(soil!.growthFraction) * 100 : null) ??
        0;
      if (cropKey(field) === "EMPTY" && pct <= 0) return { fill: CROP_COLORS.EMPTY };
      return { fill: growthFill(pct) };
    }
    case "soilOm": {
      if (!soilActive(soil)) return idlePaint();
      const om = finiteOrNull(soil?.organicMatter);
      if (om == null) return idlePaint();
      return { fill: omFill(om) };
    }
    case "soilPh": {
      if (soilActive(soil)) {
        const ph = finiteOrNull(soil?.pH);
        if (ph == null) return idlePaint();
        return { fill: phFill(ph) };
      }
      if (field.isPrecisionFarming === true) {
        if (field.isScanned !== true) return { fill: FILL_UNSCANNED };
        const ph = finiteOrNull(field.phValue);
        if (ph == null) return idlePaint();
        return { fill: phFill(ph) };
      }
      return idlePaint();
    }
    case "soilN": {
      if (soilActive(soil)) {
        const ppm = soil?.ppm && typeof soil.ppm === "object" ? (soil.ppm as Record<string, unknown>) : null;
        const n = finiteOrNull(ppm?.n) ?? finiteOrNull((soil?.nitrogen as { value?: number } | undefined)?.value);
        const target =
          finiteOrNull(ppm?.nTarget) ??
          finiteOrNull((soil?.cropTargets as { N?: { opt?: number } } | undefined)?.N?.opt) ??
          40;
        if (n == null) return idlePaint();
        return { fill: nutrientFill(n, target) };
      }
      if (field.isPrecisionFarming === true) {
        if (field.isScanned !== true) return { fill: FILL_UNSCANNED };
        const n = finiteOrNull(field.nitrogenLevel);
        const target = finiteOrNull(field.targetNitrogen) ?? 80;
        if (n == null) return idlePaint();
        return { fill: nutrientFill(n, target) };
      }
      return idlePaint();
    }
    case "soilUrgency": {
      if (!soilActive(soil)) return idlePaint();
      const urgency = finiteOrNull(soil?.urgency);
      if (urgency == null) return idlePaint();
      return { fill: urgencyFill(urgency) };
    }
    case "pfSoilType": {
      if (field.isPrecisionFarming !== true) return idlePaint();
      if (field.isScanned !== true) return { fill: FILL_UNSCANNED };
      const idx = finiteOrNull(field.pfSoilTypeIndex);
      if (idx == null || idx <= 0) return idlePaint();
      return { fill: `hsla(${hashHue(`pfsoil-${idx}`)}, 48%, 38%, 0.52)` };
    }
    case "fertilized": {
      const level = finiteOrNull(field.fertilizationLevel) ?? finiteOrNull(field.sprayLevel) ?? 0;
      return { fill: nutrientFill(level, 2) };
    }
    case "weeds": {
      const v = overlayNumericValue(field, "weeds");
      if (v == null || v <= 0) return idlePaint();
      return { fill: urgencyFill(clamp(v, 0, 100)) };
    }
    case "stones": {
      const v = finiteOrNull(field.stoneLevel);
      if (v == null || v <= 0) return idlePaint();
      return { fill: FILL_STONES };
    }
    case "needsPlowing":
      return {
        fill:
          field.needsPlowing === true || (finiteOrNull(field.plowLevel) != null && Number(field.plowLevel) < 1)
            ? FILL_PLOW
            : OVERLAY_IDLE_FILL,
      };
    case "needsLime":
      return { fill: field.needsLime === true ? FILL_LIME : OVERLAY_IDLE_FILL };
    case "needsRolling":
      return { fill: field.needsRolling === true ? FILL_ROLL : OVERLAY_IDLE_FILL };
    case "mulched": {
      const mulch = finiteOrNull(field.mulchLevel) ?? finiteOrNull(field.stubbleShredLevel);
      return { fill: mulch != null && mulch >= 1 ? FILL_MULCH : OVERLAY_IDLE_FILL };
    }
    case "watered":
      return { fill: (finiteOrNull(field.waterLevel) ?? 0) > 0 ? FILL_WATER : OVERLAY_IDLE_FILL };
    case "moisture": {
      const pct = finiteOrNull(stress?.moisturePercent) ?? finiteOrNull(moisture?.percent);
      if (pct == null) return idlePaint();
      return { fill: moistureFill(pct) };
    }
    case "ownership":
      return { fill: cssColorWithAlpha(farmCss, 0.42) };
    case "work":
      return { fill: workFill(field, soil) };
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}


export function typeFilterMatches(kind: FleetMapIconKind, filter: FleetMapTypeFilter): boolean {
  if (filter === "all") return true;
  return kind === filter;
}

export function defaultOverlayMode(fields: Array<Record<string, unknown>> | null | undefined): FleetMapOverlayMode {
  if (snapshotHasPrecisionFarming(fields)) return "soilN";
  if (snapshotHasSoilFertilizer(fields)) return "soilOm";
  return "crops";
}

export interface OverlayLegendItem {
  fill: string;
  labelKey?: string;
  cropKey?: string;
  soilTypeIndex?: number;
}

export function overlayLegendItems(
  mode: FleetMapOverlayMode,
  fields: Array<Record<string, unknown>> | null | undefined,
): OverlayLegendItem[] {
  const rows = fields || [];
  switch (mode) {
    case "off":
    case "ownership":
      return [];
    case "crops": {
      const keys = new Set<string>();
      for (const f of rows) keys.add(cropKey(f));
      const ordered = [...keys].sort((a, b) => {
        if (a === "EMPTY") return 1;
        if (b === "EMPTY") return -1;
        return a.localeCompare(b);
      });
      if (!ordered.length) ordered.push("EMPTY");
      return ordered.map((key) => ({ fill: cropOverlayFill(key), cropKey: key }));
    }
    case "growth":
      return [
        { fill: CROP_COLORS.EMPTY, labelKey: "map.legend.empty" },
        { fill: growthFill(40), labelKey: "map.legend.growing" },
        { fill: growthFill(92), labelKey: "map.legend.harvestReady" },
      ];
    case "fertilized":
      return [
        { fill: nutrientFill(0, 2), labelKey: "map.legend.fertNone" },
        { fill: nutrientFill(1, 2), labelKey: "map.legend.fertPartial" },
        { fill: nutrientFill(2, 2), labelKey: "map.legend.fertFull" },
      ];
    case "weeds":
      return [
        { fill: OVERLAY_IDLE_FILL, labelKey: "map.legend.noWeeds" },
        { fill: urgencyFill(100), labelKey: "map.legend.weeds" },
      ];
    case "stones":
      return [
        { fill: OVERLAY_IDLE_FILL, labelKey: "map.legend.noStones" },
        { fill: FILL_STONES, labelKey: "map.legend.stones" },
      ];
    case "needsPlowing":
      return [
        { fill: FILL_PLOW, labelKey: "map.legend.needsPlowing" },
        { fill: OVERLAY_IDLE_FILL, labelKey: "map.legend.ok" },
      ];
    case "needsLime":
      return [
        { fill: FILL_LIME, labelKey: "map.legend.needsLime" },
        { fill: OVERLAY_IDLE_FILL, labelKey: "map.legend.ok" },
      ];
    case "needsRolling":
      return [
        { fill: FILL_ROLL, labelKey: "map.legend.needsRolling" },
        { fill: OVERLAY_IDLE_FILL, labelKey: "map.legend.ok" },
      ];
    case "mulched":
      return [
        { fill: FILL_MULCH, labelKey: "map.legend.mulched" },
        { fill: OVERLAY_IDLE_FILL, labelKey: "map.legend.notMulched" },
      ];
    case "watered":
      return [
        { fill: FILL_WATER, labelKey: "map.legend.watered" },
        { fill: OVERLAY_IDLE_FILL, labelKey: "map.legend.dry" },
      ];
    case "soilOm":
    case "soilPh":
    case "soilN":
    case "soilUrgency":
    case "moisture":
      if (rows.some((f) => overlayNumericValue(f, mode) == null)) {
        return [{ fill: OVERLAY_IDLE_FILL, labelKey: "map.legend.noData" }];
      }
      return [];
    case "pfSoilType": {
      const items: OverlayLegendItem[] = [];
      const idxs = new Set<number>();
      let unscanned = false;
      for (const f of rows) {
        if (f.isPrecisionFarming === true && f.isScanned !== true) unscanned = true;
        const idx = finiteOrNull(f.pfSoilTypeIndex);
        if (idx != null && idx > 0) idxs.add(idx);
      }
      if (unscanned) items.push({ fill: FILL_UNSCANNED, labelKey: "map.legend.unscanned" });
      for (const idx of [...idxs].sort((a, b) => a - b)) {
        items.push({
          fill: `hsla(${hashHue(`pfsoil-${idx}`)}, 48%, 38%, 0.52)`,
          soilTypeIndex: idx,
        });
      }
      if (!items.length) items.push({ fill: OVERLAY_IDLE_FILL, labelKey: "map.legend.noData" });
      return items;
    }
    case "work":
      return [
        { fill: FILL_HARVEST, labelKey: "map.legend.workHarvest" },
        { fill: FILL_WEEDS, labelKey: "map.legend.workWeeds" },
        { fill: FILL_LIME, labelKey: "map.legend.workLime" },
        { fill: FILL_PLOW, labelKey: "map.legend.workPlow" },
        { fill: FILL_ROLL, labelKey: "map.legend.workRoll" },
        { fill: FILL_WORK_FERT, labelKey: "map.legend.workFert" },
        { fill: OVERLAY_IDLE_FILL, labelKey: "map.legend.workNone" },
      ];
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}
