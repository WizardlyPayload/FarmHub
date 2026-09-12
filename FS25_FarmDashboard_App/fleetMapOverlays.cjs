// Node/tests mirror of NEW APP/src/lib/fleetMapOverlays.ts

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function finiteOrNull(n) {
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}

const CROP_COLORS = {
  WHEAT: "rgba(232, 197, 71, 0.58)",
  BARLEY: "rgba(212, 160, 23, 0.58)",
  EMPTY: "rgba(148, 163, 184, 0.32)",
  UNKNOWN: "rgba(148, 163, 184, 0.28)",
};

const OUTLINE_MAX_POINTS = 64;
const RELATIVE_OVERLAY_MODES = new Set([
  "soilOm",
  "soilPh",
  "soilN",
  "soilUrgency",
  "moisture",
  "fertilized",
  "weeds",
  "stones",
]);

function readWorldXZ(row) {
  if (!row || typeof row !== "object") return null;
  const pos = row.position && typeof row.position === "object" ? row.position : null;
  const x = Number(pos?.x ?? row.x ?? row.posX);
  const z = Number(pos?.z ?? row.z ?? row.posZ);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  if (Math.abs(x) < 0.5 && Math.abs(z) < 0.5) return null;
  return { x, z };
}

function fieldBlobSizePercent(hectares, terrainSize) {
  const ha = Math.max(0, Number(hectares) || 0);
  const span = Number(terrainSize) > 64 ? Number(terrainSize) : 2048;
  const sideM = Math.sqrt(ha * 10000);
  return clamp((sideM / span) * 100, 2.2, 16);
}

function cropOverlayFill(fruitType) {
  const key = String(fruitType || "EMPTY").trim().toUpperCase().replace(/\s+/g, "") || "EMPTY";
  if (CROP_COLORS[key]) return CROP_COLORS[key];
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return `hsla(${h % 360}, 55%, 42%, 0.5)`;
}

function soilActive(info) {
  return Boolean(info && info.enabled && !info.pfConflict);
}

function pushOutlinePoint(pts, x, z) {
  const nx = Number(x);
  const nz = Number(z);
  if (!Number.isFinite(nx) || !Number.isFinite(nz)) return;
  pts.push([nx, nz]);
}

function normalizeFieldOutline(raw, maxPoints = OUTLINE_MAX_POINTS) {
  let src = raw;
  if (Array.isArray(src) && src.length > 0 && Array.isArray(src[0])) {
    const inner0 = src[0][0];
    if (inner0 && typeof inner0 === "object" && !Array.isArray(inner0)) src = src[0];
  }
  const pts = [];
  if (Array.isArray(src)) {
    for (const p of src) {
      if (Array.isArray(p) && p.length >= 2 && typeof p[0] === "number") pushOutlinePoint(pts, p[0], p[1]);
      else if (p && typeof p === "object") pushOutlinePoint(pts, p.x ?? p[0], p.z ?? p[1]);
    }
  } else if (src && typeof src === "object") {
    if (Array.isArray(src.pointsX) && Array.isArray(src.pointsZ)) {
      const n = Math.min(src.pointsX.length, src.pointsZ.length);
      for (let i = 0; i < n; i++) pushOutlinePoint(pts, src.pointsX[i], src.pointsZ[i]);
    }
  }
  if (pts.length < 3) return null;
  if (pts.length <= maxPoints) return pts;
  const step = Math.ceil(pts.length / maxPoints);
  const out = [];
  for (let i = 0; i < pts.length; i += step) out.push(pts[i]);
  const last = pts[pts.length - 1];
  const kept = out[out.length - 1];
  if (!kept || kept[0] !== last[0] || kept[1] !== last[1]) out.push(last);
  return out.length >= 3 ? out : null;
}

function outlineToSvgPoints(outline, toPct) {
  return outline
    .map(([x, z]) => {
      const pct = toPct(x, z);
      return `${pct.left.toFixed(2)},${pct.top.toFixed(2)}`;
    })
    .join(" ");
}

const NEAREST_OUTLINE_MAX_M = 160;

function outlineCentroid(outline) {
  if (!outline || !outline.length) return null;
  let sx = 0;
  let sz = 0;
  for (const p of outline) {
    sx += p[0];
    sz += p[1];
  }
  return { x: sx / outline.length, z: sz / outline.length };
}

function pointInOutline(x, z, outline) {
  if (!outline || outline.length < 3) return false;
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

function outlineNearPoint(xz, row) {
  if (!xz) return true;
  const outline = row && row.outline;
  if (pointInOutline(xz.x, xz.z, outline)) return true;
  const c =
    Number.isFinite(Number(row.cx)) && Number.isFinite(Number(row.cz))
      ? { x: Number(row.cx), z: Number(row.cz) }
      : outlineCentroid(outline);
  if (!c) return false;
  return Math.hypot(c.x - xz.x, c.z - xz.z) <= NEAREST_OUTLINE_MAX_M;
}

function pickMapOutlineForField(field, mapFields) {
  if (!field) return null;
  const lua = normalizeFieldOutline(field.outline) || normalizeFieldOutline(field.polygons) ||
    (Array.isArray(field.polygons) ? normalizeFieldOutline(field.polygons[0]) : null);
  if (lua) return lua;
  const rows = Array.isArray(mapFields) ? mapFields : [];
  if (!rows.length) return null;
  const byId = (n) => rows.find((r) => Number(r.id) === n) || null;
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
    const containing = rows.filter((r) => pointInOutline(xz.x, xz.z, r.outline));
    if (containing.length === 1) return normalizeFieldOutline(containing[0].outline);
  }
  return null;
}

function snapshotHasSoilFertilizer(fields) {
  for (const f of fields || []) {
    if (soilActive(f?.soilFertilizer)) return true;
  }
  return false;
}

function snapshotHasPrecisionFarming(fields) {
  for (const f of fields || []) {
    if (f?.isPrecisionFarming === true) return true;
  }
  return false;
}

function availableOverlayModes(fields) {
  const rows = fields || [];
  const hasSf = snapshotHasSoilFertilizer(rows);
  const hasPf = snapshotHasPrecisionFarming(rows);
  const hideVanillaFertLime = hasSf || hasPf;
  const out = ["off", "crops", "growth", "ownership", "weeds"];
  if (!hideVanillaFertLime) out.push("fertilized");
  out.push("needsPlowing");
  if (!hideVanillaFertLime) out.push("needsLime");
  out.push("needsRolling", "mulched", "stones", "watered");
  if (hasPf) out.push("soilN", "soilPh", "pfSoilType");
  if (hasSf) out.push("soilOm", "soilPh", "soilN", "soilUrgency");
  if (
    rows.some((f) => {
      const stress = f?.cropStress && typeof f.cropStress === "object" ? f.cropStress : null;
      const moisture = f?.moisture && typeof f.moisture === "object" ? f.moisture : null;
      return finiteOrNull(stress?.moisturePercent) != null || finiteOrNull(moisture?.percent) != null;
    })
  ) {
    out.push("moisture");
  }
  out.push("work");
  const seen = new Set();
  return out.filter((mode) => {
    if (seen.has(mode)) return false;
    seen.add(mode);
    return true;
  });
}

function overlayNumericValue(field, mode) {
  if (!field) return null;
  const soil = field.soilFertilizer;
  const stress = field.cropStress && typeof field.cropStress === "object" ? field.cropStress : null;
  const moisture = field.moisture && typeof field.moisture === "object" ? field.moisture : null;
  if (mode === "soilOm") return soilActive(soil) ? finiteOrNull(soil?.organicMatter) : null;
  if (mode === "soilPh") {
    if (soilActive(soil)) return finiteOrNull(soil?.pH);
    if (field.isPrecisionFarming === true && field.isScanned === true) return finiteOrNull(field.phValue);
    return null;
  }
  if (mode === "soilN") {
    if (soilActive(soil)) return finiteOrNull(soil.ppm?.n ?? soil.nitrogen?.value);
    if (field.isPrecisionFarming === true && field.isScanned === true) return finiteOrNull(field.nitrogenLevel);
    return null;
  }
  if (mode === "soilUrgency") return soilActive(soil) ? finiteOrNull(soil?.urgency) : null;
  if (mode === "moisture") return finiteOrNull(stress?.moisturePercent) ?? finiteOrNull(moisture?.percent);
  if (mode === "fertilized") return finiteOrNull(field.fertilizationLevel) ?? finiteOrNull(field.sprayLevel);
  if (mode === "weeds") {
    const pct = finiteOrNull(field.weedPercent);
    if (pct != null) return pct;
    const lvl = finiteOrNull(field.weedLevel);
    if (lvl == null) return null;
    if (lvl <= 4) return (lvl / 4) * 100;
    return lvl;
  }
  if (mode === "stones") return finiteOrNull(field.stoneLevel);
  return null;
}

function rangeEpsilon(mode) {
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
    default:
      return 0;
  }
}

function computeOverlayRange(fields, mode) {
  if (!RELATIVE_OVERLAY_MODES.has(mode)) return null;
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

function relativeFill(t, invert) {
  const u = invert ? 1 - Math.max(0, Math.min(1, t)) : Math.max(0, Math.min(1, t));
  return `hsla(${8 + u * 117}, 64%, 40%, 0.5)`;
}

function overlayPaintForField(field, mode, farmCss, range) {
  if (!field || mode === "off") return null;
  const idle = { fill: "rgba(148, 163, 184, 0.22)" };
  if (
    (mode === "soilN" || mode === "soilPh" || mode === "pfSoilType") &&
    field.isPrecisionFarming === true &&
    field.isScanned !== true &&
    !soilActive(field.soilFertilizer)
  ) {
    return { fill: "rgba(148, 163, 184, 0.28)" };
  }
  if (range && RELATIVE_OVERLAY_MODES.has(mode) && range.max > range.min) {
    const v = overlayNumericValue(field, mode);
    if (v == null) return idle;
    const invert = mode === "soilUrgency" || mode === "weeds" || mode === "stones";
    return { fill: relativeFill((v - range.min) / (range.max - range.min), invert) };
  }
  if (mode === "crops") {
    const hex = String(field.fruitMapColor || "");
    if (/^#[0-9a-f]{6}$/i.test(hex)) {
      const n = parseInt(hex.slice(1), 16);
      return { fill: `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, 0.5)` };
    }
    return { fill: cropOverlayFill(field.fruitType) };
  }
  if (mode === "soilOm") {
    if (!soilActive(field.soilFertilizer)) return idle;
    const om = Number(field.soilFertilizer.organicMatter);
    if (!Number.isFinite(om)) return idle;
    const t = clamp(om / 10, 0, 1);
    return { fill: `hsla(${28 + t * 92}, 52%, 36%, 0.52)` };
  }
  if (mode === "soilN") {
    if (soilActive(field.soilFertilizer)) {
      const n = Number(field.soilFertilizer.ppm?.n ?? field.soilFertilizer.nitrogen?.value);
      if (!Number.isFinite(n)) return idle;
      const target = Number(field.soilFertilizer.ppm?.nTarget) || 40;
      const t = Math.max(0, Math.min(1.2, n / target));
      const h = t >= 0.85 ? 125 : t * 125;
      return { fill: `hsla(${h}, 58%, 38%, 0.5)` };
    }
    if (field.isPrecisionFarming === true) {
      if (field.isScanned !== true) return { fill: "rgba(148, 163, 184, 0.28)" };
      const n = Number(field.nitrogenLevel);
      if (!Number.isFinite(n)) return idle;
      const target = Number(field.targetNitrogen) || 80;
      const t = Math.max(0, Math.min(1.2, n / target));
      const h = t >= 0.85 ? 125 : t * 125;
      return { fill: `hsla(${h}, 58%, 38%, 0.5)` };
    }
    return idle;
  }
  if (mode === "fertilized") {
    const level = Number(field.fertilizationLevel ?? field.sprayLevel);
    const n = Number.isFinite(level) ? level : 0;
    const t = Math.max(0, Math.min(1.2, n / 2));
    const h = t >= 0.85 ? 125 : t * 125;
    return { fill: `hsla(${h}, 58%, 38%, 0.5)` };
  }
  if (mode === "soilUrgency") {
    if (!soilActive(field.soilFertilizer)) return idle;
    const urgency = finiteOrNull(field.soilFertilizer?.urgency);
    if (urgency == null) return idle;
    const t = clamp(urgency / 100, 0, 1);
    return { fill: `hsla(${125 - t * 125}, 70%, 42%, 0.55)` };
  }
  if (mode === "moisture") {
    const pct = overlayNumericValue(field, "moisture");
    if (pct == null) return idle;
    const p = clamp(pct, 0, 100);
    if (p < 25) return { fill: "rgba(230, 126, 34, 0.55)" };
    if (p < 40) return { fill: "rgba(241, 196, 15, 0.5)" };
    if (p <= 75) return { fill: "rgba(52, 152, 219, 0.5)" };
    return { fill: "rgba(41, 128, 185, 0.58)" };
  }
  if (mode === "needsLime") {
    if (field.needsLime === true) return { fill: "rgba(236, 240, 241, 0.5)" };
    return idle;
  }
  if (mode === "ownership") {
    const rgb = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i.exec(farmCss || "");
    if (rgb) return { fill: `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, 0.42)` };
    return { fill: farmCss };
  }
  return idle;
}

function defaultOverlayMode(fields) {
  if (snapshotHasPrecisionFarming(fields)) return "soilN";
  if (snapshotHasSoilFertilizer(fields)) return "soilOm";
  return "crops";
}

module.exports = {
  readWorldXZ,
  fieldBlobSizePercent,
  cropOverlayFill,
  overlayPaintForField,
  defaultOverlayMode,
  availableOverlayModes,
  snapshotHasSoilFertilizer,
  snapshotHasPrecisionFarming,
  normalizeFieldOutline,
  outlineToSvgPoints,
  pickMapOutlineForField,
  overlayNumericValue,
  computeOverlayRange,
};
