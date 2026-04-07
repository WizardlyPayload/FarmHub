/**
 * FS25 FarmDashboard — Layer 1 local heuristic suggestions (offline-safe).
 * Parses field objects from merged /api/fields data (same shape as data.json fields).
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

  if (field.isPrecisionFarming && !field.isScanned) {
    return {
      action: "Run a soil scan (Precision Farming)",
      reason: "pH and nitrogen recommendations need scan data.",
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

  if (field.needsRolling) {
    return {
      action: "Roll field",
      reason: "Soil needs rolling (seedbed / maintenance).",
      source: "rules",
    };
  }

  if (field.needsWork) {
    return {
      action: "Complete field maintenance",
      reason: "Weeds, stones, or soil work flagged — use cultivator, sprayer, or plow as needed.",
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

  if (isMulchedEmptyField(field)) {
    return {
      action: "Cultivate or direct drill",
      reason: "Mulched stubble — till or no-till into the next crop.",
      source: "rules",
    };
  }

  if (isSoilTilledField(field)) {
    return {
      action: "Plant a crop",
      reason: "Soil is plowed/cultivated and ready for seeding.",
      source: "rules",
    };
  }

  const gs = field.growthState || 0;
  if (gs > 0) {
    const nLow =
      field.isPrecisionFarming && field.isScanned && field.targetNitrogen > 0
        ? field.nitrogenLevel / field.targetNitrogen < 0.6
        : !field.isPrecisionFarming && (field.fertilizationLevel || 0) < 1;
    if (nLow) {
      return {
        action: "Fertilize (solid or liquid)",
        reason: "Nitrogen / fertilization is below a healthy level for this growth stage.",
        source: "rules",
      };
    }
    return {
      action: "Monitor growth until harvest",
      reason: "Crop is growing — maintain N/lime and plan harvest window.",
      source: "rules",
    };
  }

  const fruit = (field.fruitType || "").toLowerCase();
  const noCrop = !field.fruitType || fruit === "unknown" || fruit === "empty";
  if (noCrop && gs === 0) {
    return {
      action: "Plow or cultivate, then plant",
      reason: "Field is empty — prepare soil and sow.",
      source: "rules",
    };
  }

  return {
    action: "Review field status in game",
    reason: "Heuristic engine has no sharper rule for this state.",
    source: "rules",
  };
}
