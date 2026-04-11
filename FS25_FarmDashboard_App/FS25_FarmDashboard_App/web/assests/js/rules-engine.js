/**
 * FS25 FarmDashboard — Layer 1 local heuristic suggestions (offline-safe).
 * Parses field objects from merged /api/fields data (same shape as data.json fields).
 *
 * Evaluation order (highest → lowest priority):
 *   1) Withered / reset
 *   2) Needs harvesting (ripe)
 *   3) Needs baling / collection (whole-field swath / windrow, cereal vs grass)
 *   4) Needs bale removal (strict bale count > 0, swath cleared)
 *   5) Precision Farming soil scan (when PF enabled and not scanned)
 *   6) Needs mulching (mulched stubble pipeline)
 *   7) Needs lime (pH low)
 *   8) Plowing / cultivating
 *   9) Seeding
 *  10) Rolling
 *  11) Weeding
 *  12) Fertilizer
 */

/** Stable id for matching VPS consultant `field_ref` (farmlandId preferred). */
export function getFieldStableId(field) {
  if (field == null) return "";
  const id = field.farmlandId ?? field.id;
  if (id != null && id !== "") return String(id);
  const n = field.name;
  return n != null && String(n).trim() !== "" ? String(n) : "";
}

function fieldShowsWithered(f) {
  if (!f || !f.isWithered) return false;
  if (String(f.fruitType || "").toUpperCase() === "GRASS") return false;
  return true;
}

function fieldIsAlreadyHarvested(field) {
  if (field.isHarvested === true) return true;
  if (field.growthLabel === "harvested") return true;
  const gt = String(field.groundType || "").toUpperCase();
  return gt.includes("HARVESTED");
}

function fieldIsMulched(field) {
  if (field.isMulched === true) return true;
  if (field.isMulched === false) return false;
  const s = Number(field.stubbleShredLevel ?? field.mulchLevel ?? 0);
  return s >= 1;
}

function isMulchedEmptyField(field) {
  if (!fieldIsMulched(field)) return false;
  if (field.isHarvested || field.growthLabel === "harvested") return false;
  if (field.growthLabel === "mulched_fallow" || field.fruitType === "mulched_stubble") return true;
  const fruit = (field.fruitType || "").toLowerCase();
  const noCrop = !field.fruitType || fruit === "unknown" || fruit === "empty";
  return noCrop && (field.growthState || 0) === 0;
}

function effectiveHarvestReady(field) {
  if (fieldIsAlreadyHarvested(field)) return false;
  return !!(field.harvestReady && !isMulchedEmptyField(field));
}

function isSoilTilledField(field) {
  if ((field.growthState || 0) > 0) return false;
  if (effectiveHarvestReady(field)) return false;
  const gt = String(field.groundType || "").toUpperCase();
  if (gt.includes("PLOWED") || gt.includes("CULTIVATED")) return true;
  if (Number(field.plowLevel) >= 1) {
    const fruit = (field.fruitType || "").toLowerCase();
    const noCrop = !field.fruitType || fruit === "unknown" || fruit === "empty";
    if (noCrop && !fieldIsMulched(field)) return true;
  }
  return false;
}

function isPostHarvestField(field) {
  if (effectiveHarvestReady(field)) return false;
  if (fieldShowsWithered(field)) return false;
  const gs = field.growthState || 0;
  const gl = field.growthLabel;
  const gt = String(field.groundType || "").toUpperCase();
  if (gl === "growing") return false;
  if (gs > 0 && !field.isHarvested && gl !== "harvested" && !gt.includes("HARVESTED")) {
    return false;
  }
  if (field.isHarvested) return true;
  if (field.growthLabel === "harvested") return true;
  if (field.growthLabel === "mulched_fallow") return true;
  if (gt.includes("HARVESTED")) return true;
  const fruit = (field.fruitType || "").toLowerCase();
  const noCrop = !field.fruitType || fruit === "unknown" || fruit === "empty";
  if (noCrop && gs === 0 && (fieldIsMulched(field) || Number(field.stubbleShredLevel ?? field.mulchLevel ?? 0) > 0)) {
    return true;
  }
  return false;
}

const CEREAL_STRAW = new Set(["WHEAT", "BARLEY", "OAT"]);

function fruitUpper(field) {
  return String(field.fruitType || "").toUpperCase();
}

function isGrassCrop(field) {
  if (fruitUpper(field) === "GRASS") return true;
  return false;
}

/** Whole-field swath / windrow: any aggregate or per-sample evidence from Lua or JSON. */
export function aggregateWindrowDetected(field) {
  if (!field || typeof field !== "object") return false;
  if (field.hasWindrow === true || field.hasSwath === true) return true;
  const liters = Number(field.windrowLiters ?? field.windrowVolume ?? field.swathLiters ?? 0);
  const area = Number(field.windrowArea ?? field.swathArea ?? 0);
  if (Number.isFinite(liters) && liters > 0) return true;
  if (Number.isFinite(area) && area > 0) return true;
  const samples = field.windrowSamples;
  if (Array.isArray(samples) && samples.some((v) => Number(v) > 0)) return true;
  if (Array.isArray(field.windrowPerStrip) && field.windrowPerStrip.some((v) => Number(v) > 0)) {
    return true;
  }
  return false;
}

/**
 * Strict integer bale count on this field — no rounding away small counts.
 * Prefer Lua `baleCountOnField`; then `baleCount`; then `field.bales.length`.
 */
export function getBaleCountStrict(field) {
  if (!field) return 0;
  const a = field.baleCountOnField;
  if (a !== undefined && a !== null && Number.isFinite(Number(a))) {
    return Math.max(0, Math.floor(Number(a)));
  }
  const b = field.baleCount;
  if (b !== undefined && b !== null && Number.isFinite(Number(b))) {
    return Math.max(0, Math.floor(Number(b)));
  }
  if (Array.isArray(field.bales)) return field.bales.length;
  return 0;
}

/**
 * Optional: count world bales whose [x,z] lies inside field.polygon / corners (if provided).
 * If no polygon, returns 0 (caller should use getBaleCountStrict from Lua).
 */
export function countBalesIntersectingFieldPolygon(field, balesWorld) {
  if (!field || !Array.isArray(balesWorld) || balesWorld.length === 0) return 0;
  const poly = field.polygon || field.boundary || field.corners;
  if (!Array.isArray(poly) || poly.length < 3) return 0;
  let n = 0;
  for (const b of balesWorld) {
    if (!b) continue;
    const x = Number(b.x ?? b[0]);
    const z = Number(b.z ?? b[2] ?? b[1]);
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    if (pointInPolygon2D(x, z, poly)) n += 1;
  }
  return n;
}

function pointInPolygon2D(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = Number(poly[i].x ?? poly[i][0]);
    const zi = Number(poly[i].z ?? poly[i][1] ?? poly[i][2]);
    const xj = Number(poly[j].x ?? poly[j][0]);
    const zj = Number(poly[j].z ?? poly[j][1] ?? poly[j][2]);
    const denom = zj - zi || 1e-9;
    const intersect =
      (zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / denom + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function isCerealWheatBarleyOat(field) {
  const ft = fruitUpper(field);
  if (CEREAL_STRAW.has(ft)) return true;
  const hint = String(field.xmlFruitTypeHint || "").toUpperCase();
  if (CEREAL_STRAW.has(hint)) return true;
  return false;
}

/**
 * Straw from cereal harvest: current/hint crop is wheat/barley/oat, or harvested stubble with XML hint.
 */
function isCerealStrawContext(field) {
  if (isCerealWheatBarleyOat(field)) return true;
  const emptyish =
    !field.fruitType ||
    ["UNKNOWN", "EMPTY", "MULCHED_STUBBLE"].includes(fruitUpper(field));
  if (emptyish && fieldIsAlreadyHarvested(field)) {
    const hint = String(field.xmlFruitTypeHint || "").toUpperCase();
    if (CEREAL_STRAW.has(hint)) return true;
  }
  return false;
}

function needsFertilizerRule(field) {
  const gs = field.growthState || 0;
  if (gs <= 0) return false;
  if (field.isPrecisionFarming && field.isScanned && field.targetNitrogen > 0) {
    return field.nitrogenLevel / field.targetNitrogen < 0.6;
  }
  return (field.fertilizationLevel || 0) < 1;
}

/**
 * @returns {{ action: string, reason: string, source: 'rules' } | null}
 */
export function getLocalFieldSuggestion(field) {
  if (!field) return null;

  if (fieldShowsWithered(field)) {
    return {
      action: "Plow or cultivate and replant",
      reason: "Crop has withered — reset soil work and sow again.",
      source: "rules",
    };
  }

  if (effectiveHarvestReady(field)) {
    return {
      action: "Harvest when ready",
      reason: "Crop is ready to harvest before weather or stage penalties.",
      source: "rules",
    };
  }

  const swath = aggregateWindrowDetected(field);
  if (swath) {
    if (isGrassCrop(field)) {
      return {
        action: "Grass mown. Tedder for hay, or windrow and bale for silage.",
        reason: "Grass mown — finish hay or silage prep (tedder / windrow / bale) before tillage.",
        source: "rules",
      };
    }
    if (isCerealStrawContext(field)) {
      return {
        action: "Straw swath detected. Needs baling or collecting with a forage wagon.",
        reason: "Straw swath on the field — bale or pick up with a forage wagon before soil work.",
        source: "rules",
      };
    }
    return {
      action: "Bale or collect swath with a forage wagon",
      reason: "Swath or windrow on the field — clear it before cultivation.",
      source: "rules",
    };
  }

  const baleN = getBaleCountStrict(field);
  if (baleN > 0) {
    return {
      action: "Bales detected on field. Collect and remove them to clear the area for fieldwork.",
      reason: "Bales still on the field — remove them so you can cultivate and plant.",
      source: "rules",
    };
  }

  if (field.isPrecisionFarming && !field.isScanned) {
    return {
      action: "Run a soil scan (Precision Farming)",
      reason: "pH and nitrogen recommendations need scan data.",
      source: "rules",
    };
  }

  if (isMulchedEmptyField(field)) {
    return {
      action: "Cultivate or direct drill",
      reason: "Mulched stubble — till or no-till into the next crop.",
      source: "rules",
    };
  }

  if (field.needsLime) {
    return {
      action: "Apply lime",
      reason: "Soil pH is below target — spread lime to improve yields.",
      source: "rules",
    };
  }

  if (isPostHarvestField(field) || fieldIsAlreadyHarvested(field)) {
    return {
      action: "Cultivate or mulch, then plant",
      reason: "Post-harvest pipeline: prepare seedbed and choose the next crop.",
      source: "rules",
    };
  }

  {
    const fr = (field.fruitType || "").toLowerCase();
    const noCrop =
      !field.fruitType || fr === "unknown" || fr === "empty" || fr === "mulched_stubble";
    if (
      noCrop &&
      (field.growthState || 0) === 0 &&
      field.needsPlowing &&
      Number(field.plowLevel || 0) < 1
    ) {
      return {
        action: "Plow or cultivate",
        reason: "Fallow field — plough or cultivate before drilling.",
        source: "rules",
      };
    }
  }

  if (isSoilTilledField(field)) {
    return {
      action: "Plant a crop",
      reason: "Soil is plowed/cultivated and ready for seeding.",
      source: "rules",
    };
  }

  if (field.needsRolling) {
    return {
      action: "Roll field",
      reason: "Soil needs rolling (seedbed / maintenance).",
      source: "rules",
    };
  }

  if (field.needsWeeding) {
    return {
      action: "Weed the field",
      reason: "Weeds above threshold — hoe, weeder, or herbicide as appropriate for growth stage.",
      source: "rules",
    };
  }

  if (needsFertilizerRule(field)) {
    return {
      action: "Fertilize (solid or liquid)",
      reason: "Nitrogen / fertilization is below a healthy level for this growth stage.",
      source: "rules",
    };
  }

  if (field.needsWork) {
    return {
      action: "Complete field maintenance",
      reason: "Stones, compaction, or other work flagged — use the right tool for the job.",
      source: "rules",
    };
  }

  const gs = field.growthState || 0;
  const fruit = (field.fruitType || "").toLowerCase();
  const noCrop = !field.fruitType || fruit === "unknown" || fruit === "empty";
  if (noCrop && gs === 0) {
    return {
      action: "Plow or cultivate, then plant",
      reason: "Field is empty — prepare soil and sow.",
      source: "rules",
    };
  }

  if (gs > 0) {
    return {
      action: "Monitor growth until harvest",
      reason: "Crop is growing — maintain N/lime and plan harvest window.",
      source: "rules",
    };
  }

  return {
    action: "Review field status in game",
    reason: "Heuristic engine has no sharper rule for this state.",
    source: "rules",
  };
}
