/**
 * FS25 FarmDashboard — Layer 1 local heuristic suggestions (offline-safe).
 * Parses field objects from merged /api/fields data (same shape as data.json fields).
 *
 * Priority pipeline (highest → lowest) aligns with FieldDataCollector.lua suggestion PR order:
 *
 *   A) Blockers: withered → harvest-ready → loose straw/grass/hay presence (hasLooseStraw / hasLooseGrassWindrow / hasLooseHayWindrow; legacy litre fields optional) →
 *      generic swath/windrow (incl. needsBaling / baleableLooseLiters) → physical bales on field → soil scan when variable-rate maps apply but not scanned
 *   B) Fallow (no crop): mulch stubble → plough → lime (before seed) → cultivate mulched soil →
 *      pre-drill N / organic → sow when soil prep + scan data allow
 *   C) Growing crop: roll (first stage) → lime → weeds (mechanical vs herbicide by stage) → fert
 *   D) Catch-all: stones / needsWork → tend growing crop → fallback
 */

/**
 * When Layer 1 cannot pick a sharper rule, `fields.js` may substitute XML/Lua `suggestions[]`
 * if present — compare against this exact action string.
 */
export const RULES_ENGINE_FALLBACK_ACTION =
  "Use in-game field hints — saved data doesn’t show one clear job";

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

/** Same notion as FieldDataCollector: no planted crop (`fruitTypeIndex == 0`). */
function hasNoCrop(field) {
  return (Number(field.fruitTypeIndex ?? 0) || 0) === 0;
}

function mulchLevelNum(field) {
  return Number(field.mulchLevel ?? field.stubbleShredLevel ?? 0) || 0;
}

/**
 * Loose straw / grass / hay — prefer Lua `hasLooseForage` / `needsBaling`; fallback `baleableLooseLiters`
 * (TEDDER + STRAW; excludes unthreshed crop swaths from the forage flags).
 */
export function aggregateBaleableLoose(field) {
  if (!field || typeof field !== "object") return false;
  if (field.hasLooseForage === true) return true;
  if (field.needsBaling === true) return true;
  const v = Number(field.baleableLooseLiters ?? 0);
  return Number.isFinite(v) && v > 0;
}

/**
 * Whole-field swath / windrow — any probe evidence, or baler-relevant loose material (`needsBaling` /
 * `baleableLooseLiters`), aligned with field-map consultant prompts and `FieldDataCollector` exports.
 */
export function aggregateWindrowDetected(field) {
  if (!field || typeof field !== "object") return false;
  if (field.hasLooseForage === true) return true;
  if (aggregateBaleableLoose(field)) return true;
  if (field.hasWindrow === true || field.hasSwath === true) return true;
  const byName = field.windrowByFillName;
  if (byName && typeof byName === "object") {
    for (const k of Object.keys(byName)) {
      if (Number(byName[k]) > 0) return true;
    }
  }
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
 * Best-effort classification from `windrowByFillName` (straw / mown grass / hay / crop swaths).
 * @returns {'straw'|'grass'|'hay'|'crop_swath'|'mixed'|null}
 */
export function classifyWindrowMaterial(field) {
  const w = field?.windrowByFillName;
  if (!w || typeof w !== "object") return null;
  const pairs = Object.entries(w)
    .map(([name, vol]) => [String(name).toUpperCase(), Number(vol) || 0])
    .filter(([, vol]) => vol > 0)
    .sort((a, b) => b[1] - a[1]);
  if (pairs.length === 0) return null;
  const top = pairs[0][0];
  if (top === "STRAW") return "straw";
  if (top === "GRASS_WINDROW") return "grass";
  if (top === "DRYGRASS_WINDROW") return "hay";
  if (top.includes("_SWATH")) return "crop_swath";
  if (pairs.length >= 2 && pairs[1][1] > 0 && pairs[0][1] / (pairs[1][1] + 1) < 3) return "mixed";
  return "mixed";
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

/**
 * Fallow: safe to drill seed — plough + soil scan OK when maps apply, and **lime / starter N prep done**
 * (lime always before seed; never sow while `needsLime` or fallow nutrient prep is still true).
 */
function canSowFallow(field) {
  const plowOk = !field.needsPlowing || Number(field.plowLevel ?? 0) >= 1;
  const soilScanOk = !field.isPrecisionFarming || field.isScanned;
  if (field.needsLime) return false;
  if (needsFallowNutrientPrep(field)) return false;
  return plowOk && soilScanOk;
}

/** Lime on bare / prepared soil before drilling (shared by fallow pipeline + edge paths). */
function fallowLimeBeforeSeedSuggestion(field) {
  const ph = Number(field.phValue ?? 0);
  const pht = Number(field.targetPh ?? 0);
  const detail =
    field.isPrecisionFarming && pht > 0
      ? `pH is about ${ph.toFixed(1)} vs ~${pht.toFixed(1)} target — spread lime on prepared soil, then drill seed (not after seeding).`
      : "pH is below target for the next crop — lime before you drill or plant seed, so pH is right from emergence.";
  return {
    action: "Spread lime before drilling seed",
    reason: detail,
    source: "rules",
  };
}

/** Growing crop: use live `needsFertilizer` when present, else spray / mapped N heuristics when scanned. */
function needsGrowingFertilizer(field) {
  const gs = field.growthState || 0;
  if (gs <= 0) return false;
  if (typeof field.needsFertilizer === "boolean") return field.needsFertilizer;
  if (field.isPrecisionFarming && field.isScanned && field.targetNitrogen > 0) {
    return field.nitrogenLevel / field.targetNitrogen < 0.6;
  }
  return (field.fertilizationLevel || 0) < 1;
}

/** Bare field before first crop: mirror base spray steps + mapped N target when soil data is scanned. */
function needsFallowNutrientPrep(field) {
  if (!hasNoCrop(field)) return false;
  if (typeof field.needsFertilizer === "boolean") return field.needsFertilizer;
  if (field.isPrecisionFarming) {
    if (!field.isScanned || !field.targetNitrogen) return false;
    return field.nitrogenLevel < field.targetNitrogen * 0.95;
  }
  return (field.fertilizationLevel || 0) < 1.9;
}

/** Short crop name for sentences, e.g. WINTER_WHEAT → "winter wheat". */
function displayCropLabel(field) {
  const ft = fruitUpper(field);
  if (!ft || ft === "UNKNOWN" || ft === "EMPTY") return "this crop";
  if (ft === "MULCHED_STUBBLE") return "mulched stubble";
  return ft
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function suggestionForNeedsWork(field) {
  const stones = Number(field.stoneLevel ?? 0);
  if (Number.isFinite(stones) && stones > 0) {
    return {
      action: "Pick stones or roll to bury them",
      reason: "Stone level is up — clear rocks so drills and harvesters don’t get blocked.",
      source: "rules",
    };
  }
  return {
    action: "Finish flagged soil work (see field icons)",
    reason:
      "needsWork is set — match the in-field icons (stones, lime, N, weeds, plough, roll) to the right tool.",
    source: "rules",
  };
}

/**
 * @returns {{ action: string, reason: string, source: 'rules' } | null}
 */
export function getLocalFieldSuggestion(field) {
  if (!field) return null;

  // ── A1. Withered (reset before anything else) ─────────────────────────────
  if (fieldShowsWithered(field)) {
    const lost = displayCropLabel(field);
    const reason =
      lost === "this crop"
        ? "The standing crop has withered — till the soil and plant something new."
        : `Your ${lost} has withered — till the soil and plant something new.`;
    return {
      action: "Start over: cultivate, then re-seed this parcel",
      reason,
      source: "rules",
    };
  }

  // ── A2. Harvest-ready ───────────────────────────────────────────────────────
  if (effectiveHarvestReady(field)) {
    const ft = fruitUpper(field);
    if (ft === "GRASS") {
      return {
        action: "Mow or collect — grass is ready to cut",
        reason: "Grass has reached cutting stage — bale silage/hay, wrap, or pick up before it gets rank.",
        source: "rules",
      };
    }
    const label = displayCropLabel(field);
    return {
      action: `Combine-harvest — ${label} is ready`,
      reason: `${label} is at harvest stage — get it off the field before rain, lodging, or withering costs yield.`,
      source: "rules",
    };
  }

  // ── A2.5 Loose forage (presence: Lua hasLooseStraw / hasLooseGrassWindrow / hasLooseHayWindrow — next stage when all false)
  const hs = field.hasLooseStraw === true;
  const hg = field.hasLooseGrassWindrow === true;
  const hh = field.hasLooseHayWindrow === true;
  if (hs || hg || hh) {
    if (hs && !hg && !hh) {
      return {
        action: "Bale loose straw or pick up with a forage wagon",
        reason: "Loose straw on the field — bale or collect before tillage or the next pass.",
        source: "rules",
      };
    }
    if (hg && !hs && !hh) {
      return {
        action: "Tedder to make hay, or bale wet and wrap for silage",
        reason: "Fresh grass windrow on the field — tedder or bale before the next stage.",
        source: "rules",
      };
    }
    if (hh && !hs && !hg) {
      return {
        action: "Bale hay windrow or collect dry forage",
        reason: "Hay / dry grass windrow on the field — bale or load before the next stage.",
        source: "rules",
      };
    }
    if (hs && hg && hh) {
      return {
        action: "Clear loose straw, grass, and hay windrows",
        reason: "Straw, grass, and hay windrows on the ground — clear forage before continuing.",
        source: "rules",
      };
    }
    if (hs && hg) {
      return {
        action: "Clear loose straw and grass windrows",
        reason: "Straw and grass windrows on the field — bale or collect before continuing.",
        source: "rules",
      };
    }
    if (hs && hh) {
      return {
        action: "Clear loose straw and hay",
        reason: "Straw and hay on the field — bale or collect before continuing.",
        source: "rules",
      };
    }
    if (hg && hh) {
      return {
        action: "Clear grass and hay windrows",
        reason: "Grass and hay windrows on the field — finish before the next stage.",
        source: "rules",
      };
    }
    return {
      action: "Clear loose forage on the field",
      reason: "Loose forage material detected — bale or collect before the next field stage.",
      source: "rules",
    };
  }
  // Legacy: older JSON without boolean flags (litre thresholds)
  const MIN_LOOSE_CH = 25;
  const ls = Number(field.looseStrawLiters ?? 0);
  const lg = Number(field.looseGrassWindrowLiters ?? 0);
  const lh = Number(field.looseDryGrassWindrowLiters ?? 0);
  if (Math.max(ls, lg, lh) >= MIN_LOOSE_CH) {
    if (ls >= lg && ls >= lh && ls >= MIN_LOOSE_CH) {
      return {
        action: "Bale loose straw or pick up with a forage wagon",
        reason: "Loose straw on the ground — bale or collect before tillage or the next pass.",
        source: "rules",
      };
    }
    if (lg >= ls && lg >= lh && lg >= MIN_LOOSE_CH) {
      return {
        action: "Tedder to make hay, or bale wet and wrap for silage",
        reason: "Grass windrow on the field — tedder or bale before the next stage.",
        source: "rules",
      };
    }
    if (lh >= ls && lh >= lg && lh >= MIN_LOOSE_CH) {
      return {
        action: "Bale hay windrow or collect dry forage",
        reason: "Hay windrow on the field — bale or load before the next stage.",
        source: "rules",
      };
    }
    return {
      action: "Clear loose straw, grass, or hay windrows",
      reason: "Multiple forage windrow types — clear before the next field stage.",
      source: "rules",
    };
  }

  // ── A3. Loose swath / windrow / baler-relevant surface material (blocks tillage) — density probes + needsBaling ──
  const swath = aggregateWindrowDetected(field);
  if (swath) {
    const mat = classifyWindrowMaterial(field);
    if (mat === "straw" || (isCerealStrawContext(field) && mat !== "grass" && mat !== "hay")) {
      return {
        action: "Bale straw or pick it up with a forage wagon",
        reason:
          mat === "straw"
            ? "Loose straw is on the field (density map) — bale or collect before tillage or the next crop."
            : "Loose straw or cereal residue is on the field — clear it so cultivation and the next crop aren’t blocked.",
        source: "rules",
      };
    }
    if (mat === "hay") {
      return {
        action: "Ted dry hay or bale before weather hits",
        reason:
          "Dried grass (hay windrow) is on the ground — finish tedding if needed, then bale or store before rain.",
        source: "rules",
      };
    }
    if (isGrassCrop(field) || mat === "grass") {
      return {
        action: "Finish grass: tedder for hay, or merge and bale for silage",
        reason:
          "Fresh-cut grass is still on the ground — dry/ted for hay, or bale for silage (wrap wet bales) before you till.",
        source: "rules",
      };
    }
    if (mat === "crop_swath") {
      return {
        action: "Pick up or bale the swathed crop",
        reason:
          "Crop windrows are on the field — combine pick-up, baler, or loader work before you work the soil.",
        source: "rules",
      };
    }
    if (isCerealStrawContext(field)) {
      return {
        action: "Bale straw or pick it up with a forage wagon",
        reason: "Loose straw is lying on the field — clear it so cultivation and the next crop aren’t blocked.",
        source: "rules",
      };
    }
    return {
      action: "Clear the swath (baler or forage wagon)",
      reason:
        "Windrow or swath is covering the soil — remove it before you work ground for the next pass.",
      source: "rules",
    };
  }

  // ── A4. Bales on field (Lua: baleCountOnField — physical bales on this farmland) ──
  const baleN = getBaleCountStrict(field);
  if (baleN > 0) {
    const action =
      baleN === 1
        ? "Move 1 bale off this field first"
        : `Move ${baleN} bales off this field first`;
    const reason =
      baleN === 1
        ? "There is 1 bale still on this farmland — clear it so cultivators and planters aren’t blocked."
        : `There are ${baleN} bales still on this farmland — load or stack them out of the way before tillage or drilling.`;
    return {
      action,
      reason,
      source: "rules",
    };
  }

  // ── A5. Soil scan before lime / N / sow when variable-rate maps apply (Lua fallow_soil / grow_soil) ──
  if (field.isPrecisionFarming && !field.isScanned) {
    return {
      action: "Run a soil scan on this field",
      reason: "Scan data is needed before pH, nitrogen maps, and drilling advice match this parcel.",
      source: "rules",
    };
  }

  const noCrop = hasNoCrop(field);
  const grass = isGrassCrop(field);
  const mulch = mulchLevelNum(field);
  /** Match Lua `needsPlowing = plowLevel < 1` when the flag isn’t explicitly false. */
  const needsPlow = field.needsPlowing === false ? false : Number(field.plowLevel ?? 0) < 1;

  // ── B. Fallow soil pipeline (matches Lua: mulch → plough → cultivate → lime → N → sow) ──
  if (noCrop) {
    // B1. Mulch stubble before plough (arable only, when plough still needed)
    if (needsPlow && !grass && mulch < 1) {
      return {
        action: "Mulch stubble before you plough",
        reason:
          "Field data says this parcel still needs ploughing — shred harvest residue first (not for grass reseeding).",
        source: "rules",
      };
    }

    // B2. Primary tillage
    if (needsPlow) {
      return {
        action: "Plough or deep-cultivate this field",
        reason: "plowLevel / needsPlowing says primary tillage is still due before a clean seedbed.",
        source: "rules",
      };
    }

    // B3. Lime on prepared / fallow ground — before drilling seed (and typically before last cultivation passes).
    if (field.needsLime) {
      return fallowLimeBeforeSeedSuggestion(field);
    }

    // B4. Work mulched stubble into the soil (Lua fallow_cult — after plough / lime when pH is OK).
    if (mulch >= 1) {
      return {
        action: "Cultivate to work in mulched stubble",
        reason:
          "Stubble is mulched — mix it in for an even seedbed. Lime (if needed) should already be planned before seed.",
        source: "rules",
      };
    }

    // B5. Build nitrogen / starter fert before first crop (optional organic first in rotation)
    if (needsFallowNutrientPrep(field)) {
      if (field.isPrecisionFarming && field.targetNitrogen > 0) {
        const n = Number(field.nitrogenLevel ?? 0);
        const t = Number(field.targetNitrogen ?? 0);
        return {
          action: "Build soil N (manure/slurry or bag) before you drill",
          reason: `Target ~${Math.round(t)} kg N/ha — you’re near ${Math.round(n)}; add organic first if you use it, then mineral.`,
          source: "rules",
        };
      }
      return {
        action: "Fertilize — spray / nutrient level is low for drilling",
        reason:
          "Spray / nutrient step isn’t full — build N after lime, before you drill seed (or in an early pass right after drilling if that’s your routine).",
        source: "rules",
      };
    }

    // B6. Sow only when lime + starter N prep are satisfied (see canSowFallow).
    if (canSowFallow(field)) {
      return {
        action: "Sow or plant your next crop",
        reason: mulch >= 1
          ? "Lime and N prep are in a good place for drilling — put seed in after mulch/cultivation work."
          : "Lime and N prep are in a good place for drilling — seed while moisture and soil conditions hold.",
        source: "rules",
      };
    }
  }

  // ── Mulched empty without full fallow detection (legacy shape) ───────────
  if (isMulchedEmptyField(field)) {
    return {
      action: "No-till drill or cultivate, then sow the next crop",
      reason: "Stubble is mulched and there’s no active crop — seed directly or work the soil first.",
      source: "rules",
    };
  }

  // ── Post-harvest stubble (has crop index may still be 0 on some saves) ───
  if (isPostHarvestField(field) || fieldIsAlreadyHarvested(field)) {
    return {
      action: "Work the stubble, then line up the next crop",
      reason: "Harvest is done — mulch, plough, or drill depending on rotation; follow the fallow steps above next.",
      source: "rules",
    };
  }

  // ── C. Growing crop — maintenance order: roll → lime → weed → fert ───────
  if (!noCrop) {
    if (field.needsRolling) {
      return {
        action: "Roll — first growth stage / seedbed finish",
        reason: "rollerLevel says rolling isn’t complete — roll once early for soil contact and stone knock-down.",
        source: "rules",
      };
    }

    if (field.needsLime) {
      const ph = Number(field.phValue ?? 0);
      const pht = Number(field.targetPh ?? 0);
      const label = displayCropLabel(field);
      const detail =
        field.isPrecisionFarming && pht > 0
          ? `${label}: pH ~${ph.toFixed(1)} vs target ~${pht.toFixed(1)} — lime now only if the crop stage still allows; best timing is before seeding next time.`
          : `${label}: pH is low — lime now only if stage still permits; on future fields, lime before drilling seed.`;
      return {
        action: "Spread lime (emerged crop — pre-drill is ideal next season)",
        reason: detail,
        source: "rules",
      };
    }

    if (field.needsWeeding) {
      const label = displayCropLabel(field);
      const gs = field.growthState || 0;
      if (gs <= 2) {
        return {
          action: "Weed mechanically (hoe / weeder)",
          reason: `Early growth (stage ${gs}) — weeds are high for ${label}; mechanical tools before herbicide is ideal.`,
          source: "rules",
        };
      }
      return {
        action: "Spray herbicide — weeds past mechanical window",
        reason: `Growth stage ${gs} — weed pressure on ${label} is best handled with a sprayer now.`,
        source: "rules",
      };
    }

    if (needsGrowingFertilizer(field)) {
      const label = displayCropLabel(field);
      if (field.isPrecisionFarming && field.isScanned && field.targetNitrogen > 0) {
        const n = Number(field.nitrogenLevel ?? 0);
        const t = Number(field.targetNitrogen ?? 0);
        return {
          action: "Top up nitrogen for this growth stage",
          reason: `About ${Math.round(n)} / ${Math.round(t)} kg N/ha — ${label} is under-fed for where it is in growth.`,
          source: "rules",
        };
      }
      return {
        action: "Fertilize — N or spray level is low",
        reason: `${label} needs more nutrient for this stage — mineral or organic, then roll in if needed.`,
        source: "rules",
      };
    }
  }

  // ── Empty seedbed without going through fallow branch (XML-only / edge) ───
  if (isSoilTilledField(field)) {
    if (field.needsLime && hasNoCrop(field)) {
      return fallowLimeBeforeSeedSuggestion(field);
    }
    if (hasNoCrop(field) && needsFallowNutrientPrep(field)) {
      if (field.isPrecisionFarming && field.targetNitrogen > 0) {
        const n = Number(field.nitrogenLevel ?? 0);
        const t = Number(field.targetNitrogen ?? 0);
        return {
          action: "Build soil N (manure/slurry or bag) before you drill",
          reason: `Target ~${Math.round(t)} kg N/ha — you’re near ${Math.round(n)}; finish after lime, before seed.`,
          source: "rules",
        };
      }
      return {
        action: "Fertilize — spray / nutrient level is low for drilling",
        reason: "Bring spray/N up after lime and before drilling seed.",
        source: "rules",
      };
    }
    return {
      action: "Sow — seedbed is worked and empty",
      reason:
        "Ground reads cultivated/plowed with no crop — drill seed only after any required lime and starter N prep for this field.",
      source: "rules",
    };
  }

  // ── needsWork — stones or generic icon queue ──────────────────────────────
  if (field.needsWork) {
    return suggestionForNeedsWork(field);
  }

  // ── Growing — nothing flagged; remind to monitor ─────────────────────────
  const gs = field.growthState || 0;
  const fruit = (field.fruitType || "").toLowerCase();
  const noCropLoose = !field.fruitType || fruit === "unknown" || fruit === "empty";
  if (noCropLoose && gs === 0) {
    return {
      action: "Prepare soil, then drill or plant",
      reason: "Field reads empty — plough/cultivate as needed, then put a crop in.",
      source: "rules",
    };
  }

  if (gs > 0) {
    const label = displayCropLabel(field);
    return {
      action: `Tend ${label} until it’s harvest-ready`,
      reason: `Crop is growing — roll, weed, and fertilize when the HUD shows those jobs; plan the harvest window.`,
      source: "rules",
    };
  }

  return {
    action: RULES_ENGINE_FALLBACK_ACTION,
    reason:
      "The offline rules don’t match this odd state — use in-game field hints or the live suggestions list from your save.",
    source: "rules",
  };
}
