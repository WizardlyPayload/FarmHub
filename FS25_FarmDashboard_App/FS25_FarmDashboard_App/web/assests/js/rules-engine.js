import { t } from "./i18n/i18n.js";

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
 * Sentinel value identifying the offline rules' generic fallback suggestion.
 * Suggestion objects also carry `kind: "fallback"` for direct comparison without
 * relying on the localized action text. Kept exported for backwards compatibility
 * with callers that still string-match the English label.
 */
export const RULES_ENGINE_FALLBACK_ACTION =
  "Use in-game field hints — saved data doesn’t show one clear job";

/** Stable kind tag for the generic offline-rules fallback suggestion. */
export const RULES_ENGINE_FALLBACK_KIND = "fallback";
let fallbackSuggestionCounter = 0;

export function getRulesFallbackCounter() {
  return fallbackSuggestionCounter;
}

function localizedFruitLabel(ft) {
  if (!ft) return null;
  const slug = ft.toLowerCase();
  const key = `rules.cropLabel.${slug}`;
  const localized = t(key);
  if (localized && localized !== key) return localized;
  return null;
}

function humanizedFruitLabel(ft) {
  return ft
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Stable id for matching external `field_ref` style keys (farmlandId preferred). */
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
  if (gl === "growing" || gl === "mown_regrowth") return false;
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

/** Use PF map N for ratio/gap copy when PF is on (call sites also gate on scan + target). */
function usePrecisionFarmingNitrogenTarget(field) {
  return !!field;
}

/** Career savegame flags from `gameSettings` / `settings` (XML). Missing key → assume on (older payloads). */
function careerBool(gs, key) {
  if (!gs || typeof gs !== "object" || !(key in gs)) return true;
  return !!gs[key];
}

/**
 * @param {{ gameSettings?: object } | null | undefined} opts
 * @returns {{ stones: boolean, weeds: boolean, plow: boolean, lime: boolean }}
 */
function rulesGameContext(opts) {
  const gs =
    opts && typeof opts === "object" && opts.gameSettings && typeof opts.gameSettings === "object"
      ? opts.gameSettings
      : {};
  fallbackSuggestionCounter += 1;
  return {
    stones: careerBool(gs, "stonesEnabled"),
    weeds: careerBool(gs, "weedsEnabled"),
    plow: careerBool(gs, "plowingRequired"),
    lime: careerBool(gs, "limeRequired"),
  };
}

/** Legumes / N-fixing crops — do not suggest sidedress N from soil-map gaps (maps still show low mineral N). */
function isLegumeSkipGrowingNFertilizer(field) {
  const ft = fruitUpper(field);
  if (!ft) return false;
  if (ft === "SOYBEAN" || ft === "SOY_BEAN" || ft === "SOYBEANS") return true;
  if (ft === "PEA" || ft === "GREENPEA" || ft === "FABA_BEAN" || ft === "LUPINE" || ft === "LUPIN") return true;
  if (ft === "CHICKPEA" || ft === "LENTIL" || ft === "DRYBEAN" || ft === "FIELD_BEAN") return true;
  return false;
}

/**
 * True bare / unplanted parcel — used for fallow pipeline (mulch → plough → lime → N → sow).
 * Must not treat “missing fruitTypeIndex” (NaN) as empty when fruitType or growth proves a crop exists
 * (common with XML-only or merged exports) — that produced silly “sow this field” on standing crops.
 */
function hasNoCrop(field) {
  const gs = Number(field.growthState ?? 0);
  if (Number.isFinite(gs) && gs > 0) return false;

  const ft = fruitUpper(field);
  if (ft && ft !== "UNKNOWN" && ft !== "EMPTY" && ft !== "MULCHED_STUBBLE") return false;

  const rawIdx = field.fruitTypeIndex;
  if (rawIdx !== undefined && rawIdx !== null && String(rawIdx).trim() !== "") {
    const n = Number(rawIdx);
    if (Number.isFinite(n) && n > 0) return false;
  }
  return true;
}

/** PF soil-map N kg/ha is often not meaningful vs game prep (mulched stubble, empty, grass). */
function shouldCapPfNitrogenTargetForDisplay(field) {
  if (isGrassCrop(field)) return true;
  const ft = fruitUpper(field);
  if (ft === "MULCHED_STUBBLE" || ft === "EMPTY") return true;
  if (hasNoCrop(field)) return true;
  return false;
}

/**
 * PF map target for N bars and rule copy. Prefer mod `nitrogenTargetDisplay` when set.
 * Caps huge map targets for grass and bare/mulch parcels (growthStage can be > 0 on cultivated soil).
 */
export function nitrogenTargetForDisplay(field) {
  const cap = field?.nitrogenTargetDisplay;
  const c = Number(cap);
  if (Number.isFinite(c) && c > 0) return c;
  const raw = Number(field?.targetNitrogen ?? 0);
  const n = Number(field?.nitrogenLevel ?? 0);
  if (
    !field?.isPrecisionFarming ||
    !field?.isScanned ||
    raw <= 0 ||
    !Number.isFinite(n) ||
    !shouldCapPfNitrogenTargetForDisplay(field)
  ) {
    return raw;
  }
  if (isGrassCrop(field)) {
    return Math.min(raw, Math.max(n * 1.15 + 30, 90));
  }
  return Math.min(raw, Math.max(n * 1.15 + 40, 120));
}

function mulchLevelNum(field) {
  return Number(field.mulchLevel ?? field.stubbleShredLevel ?? 0) || 0;
}

function optionalOrganicSkipKeyForField(field) {
  const id = getFieldStableId(field);
  if (!id) return "";
  const cyc = [
    String(field.fruitType || ""),
    String(field.growthLabel || ""),
    String(field.growthState ?? ""),
    String(field.isHarvested ? 1 : 0),
  ].join("|");
  return `${id}::${cyc}`;
}

function isOptionalOrganicSkipped(field, opts) {
  const m = opts && typeof opts === "object" ? opts.skippedOptionalOrganic : null;
  if (!m || typeof m !== "object") return false;
  const k = optionalOrganicSkipKeyForField(field);
  if (k && m[k] === true) return true;
  // Backward compatibility for previously server-prefixed keys.
  if (k) {
    for (const key of Object.keys(m)) {
      if (typeof key === "string" && key.endsWith(`::${k}`) && m[key] === true) return true;
    }
  }
  return false;
}

function shouldSuggestOptionalOrganicStep(field, opts = {}) {
  if (!hasNoCrop(field)) return false;
  if (isOptionalOrganicSkipped(field, opts)) return false;
  if (isGrassCrop(field)) return false;
  const nNeed =
    typeof field.needsFertilizer === "boolean"
      ? field.needsFertilizer
      : Number(field.fertilizationLevel ?? 0) < 1;
  if (!nNeed) return false;
  return true;
}

/** Combined straw + grass + hay windrow litres from mod export; below this, skip forage workflow (matches Lua `FORAGE_WORKFLOW_MIN_L`). */
export const MIN_FORAGE_WORKFLOW_LITERS = 100;

function totalStrawGrassHayLiters(field) {
  if (!field || typeof field !== "object") return null;
  const ls = field.looseStrawLiters;
  const lg = field.looseGrassWindrowLiters;
  const lh = field.looseDryGrassWindrowLiters;
  if (ls == null && lg == null && lh == null) return null;
  return Number(ls ?? 0) + Number(lg ?? 0) + Number(lh ?? 0);
}

/** True when exported litre totals say residue is only trace amounts — suppress A2.5 even if stale flags exist. */
function forageLitersNegligible(field) {
  const t = totalStrawGrassHayLiters(field);
  return t != null && Number.isFinite(t) && t >= 0 && t < MIN_FORAGE_WORKFLOW_LITERS;
}

/**
 * Loose straw / grass / hay — prefer Lua `hasLooseForage` / `needsBaling`; fallback `baleableLooseLiters`
 * (TEDDER + STRAW; excludes unthreshed crop swaths from the forage flags).
 */
export function aggregateBaleableLoose(field) {
  if (!field || typeof field !== "object") return false;
  const v = Number(field.baleableLooseLiters ?? 0);
  if (Number.isFinite(v) && v >= MIN_FORAGE_WORKFLOW_LITERS) return true;
  if (field.hasLooseForage === true || field.needsBaling === true) {
    return !forageLitersNegligible(field);
  }
  return false;
}

/** Ignore float noise / stale probes — only “clear swath” when material is non-trivial. */
const MIN_WINDROW_LITERS = 100;
const MIN_WINDROW_AREA = 0.0005;
const MIN_WINDROW_SAMPLE = 15;

/**
 * Whole-field swath / windrow — probe evidence above noise floor, or explicit game flags /
 * baler-relevant loose material (`needsBaling` / `baleableLooseLiters`).
 */
export function aggregateWindrowDetected(field) {
  if (!field || typeof field !== "object") return false;
  if (aggregateBaleableLoose(field)) return true;
  if (field.hasWindrow === true || field.hasSwath === true) return true;
  const byName = field.windrowByFillName;
  if (byName && typeof byName === "object") {
    let sum = 0;
    for (const k of Object.keys(byName)) {
      const v = Number(byName[k]) || 0;
      sum += v;
      if (v >= MIN_WINDROW_LITERS) return true;
    }
    if (sum >= MIN_FORAGE_WORKFLOW_LITERS) return true;
  }
  const liters = Number(field.windrowLiters ?? field.windrowVolume ?? field.swathLiters ?? 0);
  const area = Number(field.windrowArea ?? field.swathArea ?? 0);
  if (Number.isFinite(liters) && liters >= MIN_WINDROW_LITERS) return true;
  if (Number.isFinite(area) && area >= MIN_WINDROW_AREA) return true;
  const samples = field.windrowSamples;
  if (Array.isArray(samples) && samples.some((v) => Number(v) >= MIN_WINDROW_SAMPLE)) return true;
  if (
    Array.isArray(field.windrowPerStrip) &&
    field.windrowPerStrip.some((v) => Number(v) >= MIN_WINDROW_SAMPLE)
  ) {
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
function canSowFallow(field, limeMatter = true) {
  const plowOk = !field.needsPlowing || Number(field.plowLevel ?? 0) >= 1;
  const soilScanOk = !field.isPrecisionFarming || field.isScanned;
  if (limeMatter && field.needsLime) return false;
  return plowOk && soilScanOk;
}

/** Lime on bare / prepared soil before drilling (shared by fallow pipeline + edge paths). */
function fallowLimeBeforeSeedSuggestion(field) {
  const ph = Number(field.phValue ?? 0);
  const pht = Number(field.targetPh ?? 0);
  const detail =
    field.isPrecisionFarming && pht > 0
      ? t("rules.reason.limeBeforeSeedPF", { ph: ph.toFixed(1), target: pht.toFixed(1) })
      : t("rules.reason.limeBeforeSeedNoPF");
  return {
    action: t("rules.action.spreadLimeBeforeSeed"),
    actionKey: "rules.action.spreadLimeBeforeSeed",
    reason: detail,
    source: "rules",
  };
}

const GRASS_LIME_GAP_TOLERANCE = 0.15;
const GRASS_N_GAP_TOLERANCE_PCT = 0.12;

function grassPfLimeGap(field) {
  const ph = Number(field?.phValue ?? 0);
  const pht = Number(field?.targetPh ?? 0);
  if (!field?.isPrecisionFarming || !field?.isScanned || !Number.isFinite(pht) || pht <= 0) return 0;
  return Math.max(0, pht - ph);
}

function grassPfNitrogenGap(field) {
  const n = Number(field?.nitrogenLevel ?? 0);
  const target = nitrogenTargetForDisplay(field);
  if (!field?.isPrecisionFarming || !field?.isScanned || !Number.isFinite(target) || target <= 0) {
    return { gap: 0, pct: 0, target: 0, n: 0 };
  }
  const gap = Math.max(0, target - n);
  const pct = target > 0 ? gap / target : 0;
  return { gap, pct, target, n };
}

function grassGapActionable(field) {
  const limeGap = grassPfLimeGap(field);
  const nGap = grassPfNitrogenGap(field);
  return limeGap > GRASS_LIME_GAP_TOLERANCE || nGap.pct > GRASS_N_GAP_TOLERANCE_PCT;
}

function monitorRegrowthSuggestion(field) {
  const label = displayCropLabel(field);
  return {
    action: t("rules.monitorTowardHarvest", { label }),
    actionKey: "rules.monitorTowardHarvest",
    reason: t("rules.cropGrowingWatchHud"),
    source: "rules",
  };
}

/** Growing crop: use live `needsFertilizer` when present, else spray / mapped N heuristics when scanned. */
function needsGrowingFertilizer(field) {
  if (isLegumeSkipGrowingNFertilizer(field)) return false;
  const gs = field.growthState || 0;
  if (gs <= 0) return false;
  if (typeof field.needsFertilizer === "boolean") return field.needsFertilizer;
  if (
    usePrecisionFarmingNitrogenTarget(field) &&
    field.isPrecisionFarming &&
    field.isScanned &&
    field.targetNitrogen > 0
  ) {
    const t = nitrogenTargetForDisplay(field);
    return t > 0 && field.nitrogenLevel / t < 0.6;
  }
  return (field.fertilizationLevel || 0) < 1;
}

/**
 * One growing-crop maintenance suggestion: pick the job with the largest deficit vs targets.
 * Tie order (when urgencies match): lime → nitrogen → weeds → roll.
 * @param {object} field
 * @returns {{ action: string, reason: string, source: 'rules' } | null}
 */
function pickGrowingCropMaintenanceSuggestion(field, ctx) {
  const game = ctx || rulesGameContext({});
  /** Lower `tie` wins on equal urgency. */
  const candidates = [];

  if (field.needsRolling && String(field.growthLabel || "") !== "mown_regrowth") {
    const gs = field.growthState || 0;
    const urgency = gs <= 2 ? 0.95 : gs <= 4 ? 0.52 : 0.28;
    candidates.push({
      urgency,
      tie: 4,
      apply() {
        return {
          action: t("rules.action.rollFirstStage"),
          actionKey: "rules.action.rollFirstStage",
          reason: t("rules.reason.rollFirstStage"),
          source: "rules",
        };
      },
    });
  }

  if (game.lime && field.needsLime && !isGrassCrop(field)) {
    const ph = Number(field.phValue ?? 0);
    const pht = Number(field.targetPh ?? 0);
    let urgency = 0.42;
    if (field.isPrecisionFarming && field.isScanned && pht > 0) {
      urgency = Math.min(1.25, Math.max(0, (pht - ph) / 0.75));
    }
    const label = displayCropLabel(field);
    candidates.push({
      urgency,
      tie: 1,
      apply() {
        const detail =
          field.isPrecisionFarming && pht > 0
            ? t("rules.reason.limeEmergedPF", { label, ph: ph.toFixed(1), target: pht.toFixed(1) })
            : t("rules.reason.limeEmergedNoPF", { label });
        return {
          action: t("rules.action.spreadLimeEmerged"),
          actionKey: "rules.action.spreadLimeEmerged",
          reason: detail,
          source: "rules",
        };
      },
    });
  }

  if (game.weeds && field.needsWeeding) {
    const w = Math.min(1, Math.max(0, Number(field.weedLevel ?? 0)));
    const urgency = Math.min(1.15, w + 0.08);
    const label = displayCropLabel(field);
    const gs = field.growthState || 0;
    candidates.push({
      urgency,
      tie: 3,
      apply() {
        if (gs <= 2) {
          return {
            action: t("rules.action.weedMechanically"),
            actionKey: "rules.action.weedMechanically",
            reason: t("rules.reason.weedsEarlyMechanical", { gs, label }),
            source: "rules",
          };
        }
        return {
          action: t("rules.action.sprayHerbicide"),
          actionKey: "rules.action.sprayHerbicide",
          reason: t("rules.reason.weedsHerbicide", { gs, label }),
          source: "rules",
        };
      },
    });
  }

  if (needsGrowingFertilizer(field)) {
    const label = displayCropLabel(field);
    let urgency = 0.5;
    const pfN =
      usePrecisionFarmingNitrogenTarget(field) &&
      field.isPrecisionFarming &&
      field.isScanned &&
      field.targetNitrogen > 0;
    if (pfN) {
      const n = Number(field.nitrogenLevel ?? 0);
      const t = nitrogenTargetForDisplay(field);
      if (t > 0 && Number.isFinite(n)) {
        const deficitRatio = Math.max(0, 1 - n / t);
        if (isGrassCrop(field) && deficitRatio <= GRASS_N_GAP_TOLERANCE_PCT) {
          urgency = 0;
        } else {
          urgency = Math.min(1.25, deficitRatio);
        }
      }
    } else {
      const fl = Number(field.fertilizationLevel ?? 0);
      urgency = Math.min(1, (2 - fl) / 2);
    }
    candidates.push({
      urgency,
      tie: 2,
      apply() {
        if (pfN) {
          const n = Number(field.nitrogenLevel ?? 0);
          const target = nitrogenTargetForDisplay(field);
          const gap = Math.max(0, target - n);
          const gapPct = target > 0 ? gap / target : 0;
          if (isGrassCrop(field) && gapPct <= GRASS_N_GAP_TOLERANCE_PCT) {
            return monitorRegrowthSuggestion(field);
          }
          const pct =
            target > 0 ? Math.round(Math.min(100, Math.max(0, (n / target) * 100))) : 0;
          return {
            action:
              gap > 1
                ? t("rules.action.addNTarget", { n: Math.round(gap) })
                : t("rules.action.topUpNitrogen"),
            actionKey:
              gap > 1 ? "rules.action.addNTarget" : "rules.action.topUpNitrogen",
            reason: t("rules.reason.fertilizerPFGap", {
              n: Math.round(n),
              target: Math.round(target),
              pct,
              label,
            }),
            source: "rules",
          };
        }
        const fl = Number(field.fertilizationLevel ?? 0);
        return {
          action: t("rules.action.fertilizeStep", { fl }),
          actionKey: "rules.action.fertilizeStep",
          reason: t("rules.reason.fertilizerSimple", { label }),
          source: "rules",
        };
      },
    });
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    if (Math.abs(b.urgency - a.urgency) > 0.02) return b.urgency - a.urgency;
    return a.tie - b.tie;
  });
  return candidates[0].apply();
}

/** Bare field before first crop: mirror base spray steps + mapped N target when soil data is scanned. */
function needsFallowNutrientPrep(field) {
  if (!hasNoCrop(field)) return false;
  if (typeof field.needsFertilizer === "boolean") return field.needsFertilizer;
  if (field.isPrecisionFarming) {
    if (!field.isScanned || !field.targetNitrogen) return false;
    return field.nitrogenLevel < field.targetNitrogen * 0.95;
  }
  // Match growing-crop threshold (< 1 “step”) — 1.9 was almost always true and nagged “fertilize” on fallow.
  return (field.fertilizationLevel || 0) < 1;
}

/** Short crop name for sentences, e.g. WINTER_WHEAT → "winter wheat". */
function displayCropLabel(field) {
  const ft = fruitUpper(field);
  if (!ft || ft === "UNKNOWN" || ft === "EMPTY") return t("rules.cropLabel.thisCrop");
  if (ft === "MULCHED_STUBBLE") return t("rules.cropLabel.mulchedStubble");
  return localizedFruitLabel(ft) || humanizedFruitLabel(ft);
}

function suggestionForNeedsWork(field, ctx, opts = {}) {
  const g = ctx || rulesGameContext({});
  const stones = Number(field.stoneLevel ?? 0);
  if (g.stones && Number.isFinite(stones) && stones > 0) {
    return {
      action: t("rules.action.pickStones"),
      actionKey: "rules.action.pickStones",
      reason: t("rules.reason.pickStones"),
      source: "rules",
    };
  }
  const noCrop = hasNoCrop(field);
  const grass = isGrassCrop(field);
  const mulch = mulchLevelNum(field);
  const needsPlowRaw = field.needsPlowing === false ? false : Number(field.plowLevel ?? 0) < 1;
  const needsPlow = g.plow && needsPlowRaw;

  // Keep deterministic soil-order for empty fields.
  if (noCrop) {
    if (needsPlow && !grass && mulch < 1) {
      return {
        action: t("rules.action.mulchStubble"),
        actionKey: "rules.action.mulchStubble",
        reason: t("rules.reason.mulchBeforePlough"),
        source: "rules",
      };
    }
    if (needsPlow) {
      return {
        action: t("rules.action.ploughDeepCultivate"),
        actionKey: "rules.action.ploughDeepCultivate",
        reason: t("rules.reason.ploughDeep"),
        source: "rules",
      };
    }
    if (shouldSuggestOptionalOrganicStep(field, opts)) {
      return {
        action: t("rules.action.optionalOrganicFirst"),
        actionKey: "rules.action.optionalOrganicFirst",
        reason: t("rules.reason.optionalOrganicFirst"),
        source: "rules",
      };
    }
    if (g.lime && field.needsLime) return fallowLimeBeforeSeedSuggestion(field);
  }

  // Growing fallback: infer specific deficit even if `needs*` booleans were flattened/rounded away.
  if (!noCrop) {
    if (grass) {
      if (g.weeds && field.needsWeeding) {
        return pickGrowingCropMaintenanceSuggestion(field, g) || monitorRegrowthSuggestion(field);
      }
      if (field.needsRolling && String(field.growthLabel || "") !== "mown_regrowth") {
        return pickGrowingCropMaintenanceSuggestion(field, g) || monitorRegrowthSuggestion(field);
      }
      const limeGap = grassPfLimeGap(field);
      const nGap = grassPfNitrogenGap(field);
      if (g.lime && limeGap > GRASS_LIME_GAP_TOLERANCE) {
        const ph = Number(field.phValue ?? 0);
        const pht = Number(field.targetPh ?? 0);
        return {
          action: t("rules.action.limePastureMap"),
          actionKey: "rules.action.limePastureMap",
          reason: t("rules.reason.limePastureMapPF", {
            ph: ph.toFixed(1),
            target: pht.toFixed(1),
          }),
          source: "rules",
        };
      }
      if (nGap.pct > GRASS_N_GAP_TOLERANCE_PCT && nGap.gap > 1) {
        const label = displayCropLabel(field);
        const pct = nGap.target > 0 ? Math.round(Math.min(100, Math.max(0, (nGap.n / nGap.target) * 100))) : 0;
        return {
          action: t("rules.action.addNTarget", { n: Math.round(nGap.gap) }),
          actionKey: "rules.action.addNTarget",
          reason: t("rules.reason.fertilizerPFGap", {
            n: Math.round(nGap.n),
            target: Math.round(nGap.target),
            pct,
            label,
          }),
          source: "rules",
        };
      }
      return monitorRegrowthSuggestion(field);
    }

    // 1) Native strict picker first (uses explicit needs flags).
    const growingPick = pickGrowingCropMaintenanceSuggestion(field, g);
    if (growingPick) return growingPick;

    // 2) Inferred PF pH gap (exact-ish amount guidance in reason).
    const ph = Number(field.phValue ?? 0);
    const pht = Number(field.targetPh ?? 0);
    const pfLimeGap = field.isPrecisionFarming && field.isScanned && pht > 0 ? (pht - ph) : 0;
    if (g.lime && Number.isFinite(pfLimeGap) && pfLimeGap > 0.05) {
      if (grass) {
        return {
          action: t("rules.action.limePastureMap"),
          actionKey: "rules.action.limePastureMap",
          reason: t("rules.reason.limePastureMapPF", {
            ph: ph.toFixed(1),
            target: pht.toFixed(1),
          }),
          source: "rules",
        };
      }
      const label = displayCropLabel(field);
      return {
        action: t("rules.action.spreadLimeEmerged"),
        actionKey: "rules.action.spreadLimeEmerged",
        reason: t("rules.reason.limeEmergedPF", {
          label,
          ph: ph.toFixed(1),
          target: pht.toFixed(1),
        }),
        source: "rules",
      };
    }

    // 3) Inferred PF nitrogen gap (action carries kg N/ha).
    if (
      field.isPrecisionFarming &&
      field.isScanned &&
      Number(field.targetNitrogen ?? 0) > 0
    ) {
      const n = Number(field.nitrogenLevel ?? 0);
      const target = nitrogenTargetForDisplay(field);
      const gap = Math.max(0, target - n);
      if (Number.isFinite(gap) && gap > 1) {
        const label = displayCropLabel(field);
        const pct = target > 0 ? Math.round(Math.min(100, Math.max(0, (n / target) * 100))) : 0;
        return {
          action:
            gap > 1
              ? t("rules.action.addNTarget", { n: Math.round(gap) })
              : t("rules.action.topUpNitrogen"),
          actionKey:
            gap > 1 ? "rules.action.addNTarget" : "rules.action.topUpNitrogen",
          reason: t("rules.reason.fertilizerPFGap", {
            n: Math.round(n),
            target: Math.round(target),
            pct,
            label,
          }),
          source: "rules",
        };
      }
    }
  }

  return {
    action: t("rules.action.finishFlaggedSoilWork"),
    actionKey: "rules.action.finishFlaggedSoilWork",
    reason: t("rules.reason.finishFlaggedSoilWork"),
    source: "rules",
    kind: RULES_ENGINE_FALLBACK_KIND,
  };
}

/**
 * @param {object} field
 * @param {{ gameSettings?: object }} [opts] — savegame flags (`weedsEnabled`, `stonesEnabled`, …)
 * @returns {{ action: string, reason: string, source: 'rules' } | null}
 */
export function getLocalFieldSuggestion(field, opts = {}) {
  if (!field) return null;
  const ctx = rulesGameContext(opts);

  // ── A1. Withered (reset before anything else) ─────────────────────────────
  if (fieldShowsWithered(field)) {
    const lost = displayCropLabel(field);
    const isGenericLabel = lost === t("rules.cropLabel.thisCrop");
    const reason = isGenericLabel
      ? t("rules.reason.witheredGeneric")
      : t("rules.reason.witheredCrop", { label: lost });
    return {
      action: t("rules.action.cultivateReseed"),
      actionKey: "rules.action.cultivateReseed",
      reason,
      source: "rules",
    };
  }

  // ── A2. Harvest-ready ───────────────────────────────────────────────────────
  if (effectiveHarvestReady(field)) {
    const ft = fruitUpper(field);
    if (ft === "GRASS") {
      return {
        action: t("rules.action.mowGrass"),
        actionKey: "rules.action.mowGrass",
        reason: t("rules.reason.grassReadyMow"),
        source: "rules",
      };
    }
    const label = displayCropLabel(field);
    return {
      action: t("rules.action.combineHarvest", { label }),
      actionKey: "rules.action.combineHarvest",
      reason: t("rules.reason.combineHarvest", { label }),
      source: "rules",
    };
  }

  // ── A2.5 Loose forage (presence: Lua hasLooseStraw / hasLooseGrassWindrow / hasLooseHayWindrow — next stage when all false)
  const flNeg = forageLitersNegligible(field);
  const hs = field.hasLooseStraw === true && !flNeg;
  const hg = field.hasLooseGrassWindrow === true && !flNeg;
  const hh = field.hasLooseHayWindrow === true && !flNeg;
  if (hs || hg || hh) {
    if (hs && !hg && !hh) {
      return {
        action: t("rules.action.baleStrawForage"),
        actionKey: "rules.action.baleStrawForage",
        reason: t("rules.reason.looseStrawField"),
        source: "rules",
      };
    }
    if (hg && !hs && !hh) {
      return {
        action: t("rules.action.tedderOrBale"),
        actionKey: "rules.action.tedderOrBale",
        reason: t("rules.reason.freshGrassWindrow"),
        source: "rules",
      };
    }
    if (hh && !hs && !hg) {
      return {
        action: t("rules.action.baleHay"),
        actionKey: "rules.action.baleHay",
        reason: t("rules.reason.hayWindrowField"),
        source: "rules",
      };
    }
    if (hs && hg && hh) {
      return {
        action: t("rules.action.clearAllWindrows"),
        actionKey: "rules.action.clearAllWindrows",
        reason: t("rules.reason.allWindrowsField"),
        source: "rules",
      };
    }
    if (hs && hg) {
      return {
        action: t("rules.action.clearStrawGrassWindrows"),
        actionKey: "rules.action.clearStrawGrassWindrows",
        reason: t("rules.reason.strawGrassWindrows"),
        source: "rules",
      };
    }
    if (hs && hh) {
      return {
        action: t("rules.action.clearStrawHay"),
        actionKey: "rules.action.clearStrawHay",
        reason: t("rules.reason.strawHayField"),
        source: "rules",
      };
    }
    if (hg && hh) {
      return {
        action: t("rules.action.clearGrassHay"),
        actionKey: "rules.action.clearGrassHay",
        reason: t("rules.reason.grassHayWindrows"),
        source: "rules",
      };
    }
    return {
      action: t("rules.action.clearLooseForage"),
      actionKey: "rules.action.clearLooseForage",
      reason: t("rules.reason.looseForageGeneric"),
      source: "rules",
    };
  }
  // Legacy: older JSON without boolean flags (litre thresholds — combined straw / grass / hay >= workflow minimum)
  const ls = Number(field.looseStrawLiters ?? 0);
  const lg = Number(field.looseGrassWindrowLiters ?? 0);
  const lh = Number(field.looseDryGrassWindrowLiters ?? 0);
  const sumLooseCh = ls + lg + lh;
  if (sumLooseCh >= MIN_FORAGE_WORKFLOW_LITERS) {
    if (ls >= lg && ls >= lh && ls > 0) {
      return {
        action: t("rules.action.baleStrawForage"),
        actionKey: "rules.action.baleStrawForage",
        reason: t("rules.reason.looseStrawGround"),
        source: "rules",
      };
    }
    if (lg >= ls && lg >= lh && lg > 0) {
      return {
        action: t("rules.action.tedderOrBale"),
        actionKey: "rules.action.tedderOrBale",
        reason: t("rules.reason.grassWindrowField"),
        source: "rules",
      };
    }
    if (lh >= ls && lh >= lg && lh > 0) {
      return {
        action: t("rules.action.baleHay"),
        actionKey: "rules.action.baleHay",
        reason: t("rules.reason.hayWindrowSimple"),
        source: "rules",
      };
    }
    return {
      action: t("rules.action.clearStrawGrassOrHay"),
      actionKey: "rules.action.clearStrawGrassOrHay",
      reason: t("rules.reason.multipleWindrows"),
      source: "rules",
    };
  }

  // ── A3. Loose swath / windrow / baler-relevant surface material (blocks tillage) — density probes + needsBaling ──
  const swath = aggregateWindrowDetected(field);
  if (swath) {
    const mat = classifyWindrowMaterial(field);
    if (mat === "straw" || (isCerealStrawContext(field) && mat !== "grass" && mat !== "hay")) {
      return {
        action: t("rules.action.baleStrawWagon"),
        actionKey: "rules.action.baleStrawWagon",
        reason:
          mat === "straw"
            ? t("rules.reason.strawDensityMap")
            : t("rules.reason.strawCerealResidue"),
        source: "rules",
      };
    }
    if (mat === "hay") {
      return {
        action: t("rules.action.tedDryHay"),
        actionKey: "rules.action.tedDryHay",
        reason: t("rules.reason.dryHayWindrow"),
        source: "rules",
      };
    }
    if (isGrassCrop(field) || mat === "grass") {
      return {
        action: t("rules.action.finishGrass"),
        actionKey: "rules.action.finishGrass",
        reason: t("rules.reason.freshGrassCut"),
        source: "rules",
      };
    }
    if (mat === "crop_swath") {
      return {
        action: t("rules.action.pickupSwath"),
        actionKey: "rules.action.pickupSwath",
        reason: t("rules.reason.cropSwath"),
        source: "rules",
      };
    }
    if (isCerealStrawContext(field)) {
      return {
        action: t("rules.action.baleStrawWagon"),
        actionKey: "rules.action.baleStrawWagon",
        reason: t("rules.reason.strawCerealLying"),
        source: "rules",
      };
    }
    return {
      action: t("rules.action.clearSwath"),
      actionKey: "rules.action.clearSwath",
      reason: t("rules.reason.swathCovering"),
      source: "rules",
    };
  }

  // ── A4. Bales on field (Lua: baleCountOnField — physical bales on this farmland) ──
  const baleN = getBaleCountStrict(field);
  if (baleN > 0) {
    const action =
      baleN === 1
        ? t("rules.action.moveOneBale")
        : t("rules.action.moveBales", { n: baleN });
    const actionKey =
      baleN === 1 ? "rules.action.moveOneBale" : "rules.action.moveBales";
    const reason =
      baleN === 1
        ? t("rules.reason.oneBale")
        : t("rules.reason.manyBales", { n: baleN });
    return {
      action,
      actionKey,
      reason,
      source: "rules",
    };
  }

  // ── A5. Soil scan before lime / N / sow when variable-rate maps apply (Lua fallow_soil / grow_soil) ──
  if (field.isPrecisionFarming && !field.isScanned) {
    return {
      action: t("rules.action.runSoilScan"),
      actionKey: "rules.action.runSoilScan",
      reason: t("rules.reason.runSoilScan"),
      source: "rules",
    };
  }

  const noCrop = hasNoCrop(field);
  const grass = isGrassCrop(field);
  const mulch = mulchLevelNum(field);
  /** Match Lua `needsPlowing = plowLevel < 1` when the flag isn’t explicitly false. */
  const needsPlowRaw = field.needsPlowing === false ? false : Number(field.plowLevel ?? 0) < 1;
  const needsPlow = ctx.plow && needsPlowRaw;

  // ── B. Fallow soil pipeline (matches Lua: mulch → plough → cultivate → lime → N → sow) ──
  if (noCrop) {
    // B1. Mulch stubble before plough (arable only, when plough still needed)
    if (needsPlow && !grass && mulch < 1) {
      return {
        action: t("rules.action.mulchStubble"),
        actionKey: "rules.action.mulchStubble",
        reason: t("rules.reason.mulchBeforePlough"),
        source: "rules",
      };
    }

    // B2. Primary tillage
    if (needsPlow) {
      return {
        action: t("rules.action.ploughDeepCultivate"),
        actionKey: "rules.action.ploughDeepCultivate",
        reason: t("rules.reason.ploughDeep"),
        source: "rules",
      };
    }

    // B3. Optional organic route before cultivation (user may skip).
    if (shouldSuggestOptionalOrganicStep(field, opts)) {
      return {
        action: t("rules.action.optionalOrganicFirst"),
        actionKey: "rules.action.optionalOrganicFirst",
        reason: t("rules.reason.optionalOrganicFirst"),
        source: "rules",
      };
    }

    // B4. Lime on prepared / fallow ground — before drilling seed (and typically before last cultivation passes).
    if (ctx.lime && field.needsLime) {
      return fallowLimeBeforeSeedSuggestion(field);
    }

    // B5. Work mulched stubble into the soil (mulched + plough-required path: plough -> lime -> cultivate).
    if (mulch >= 1) {
      return {
        action: t("rules.action.cultivateMulch"),
        actionKey: "rules.action.cultivateMulch",
        reason: t("rules.reason.cultivateMulch"),
        source: "rules",
      };
    }

    // B6. Sow only when plough/scan/lime gates are satisfied.
    if (canSowFallow(field, ctx.lime)) {
      if (field.isPrecisionFarming && field.isScanned) {
        return {
          action: t("rules.action.directDrill"),
          actionKey: "rules.action.directDrill",
          reason:
            mulch >= 1
              ? t("rules.reason.directDrillMulched")
              : t("rules.reason.directDrillBare"),
          source: "rules",
        };
      }
      return {
        action: t("rules.action.sowPlant"),
        actionKey: "rules.action.sowPlant",
        reason: t("rules.reason.sowPlant"),
        source: "rules",
      };
    }
  }

  // ── Mulched empty without full fallow detection (legacy shape) ───────────
  if (isMulchedEmptyField(field)) {
    if (field.isPrecisionFarming && field.isScanned) {
      return {
        action: t("rules.action.directDrill"),
        actionKey: "rules.action.directDrill",
        reason: t("rules.reason.directDrillNoCrop"),
        source: "rules",
      };
    }
    return {
      action: t("rules.action.cultivateMulchedDrill"),
      actionKey: "rules.action.cultivateMulchedDrill",
      reason: t("rules.reason.cultivateMulchedDrill"),
      source: "rules",
    };
  }

  // ── Post-harvest stubble (fruit type may still show on the card after combine) ───
  if (isPostHarvestField(field) || fieldIsAlreadyHarvested(field)) {
    if (ctx.lime && field.needsLime) {
      return fallowLimeBeforeSeedSuggestion(field);
    }

    if (needsPlow && !grass && mulch < 1) {
      return {
        action: t("rules.action.mulchStubble"),
        actionKey: "rules.action.mulchStubble",
        reason: t("rules.reason.mulchPostHarvest"),
        source: "rules",
      };
    }

    if (field.isPrecisionFarming && field.isScanned) {
      if (needsPlow) {
        return {
          action: t("rules.action.ploughBeforeNextCrop"),
          actionKey: "rules.action.ploughBeforeNextCrop",
          reason: t("rules.reason.ploughBeforeNextCrop"),
          source: "rules",
        };
      }
      return {
        action: t("rules.action.directDrill"),
        actionKey: "rules.action.directDrill",
        reason: t("rules.reason.directDrillPostHarvest"),
        source: "rules",
      };
    }

    if (needsPlow) {
      return {
        action: t("rules.action.ploughThenSeedbed"),
        actionKey: "rules.action.ploughThenSeedbed",
        reason: t("rules.reason.ploughThenSeedbed"),
        source: "rules",
      };
    }

    return {
      action: t("rules.action.cultivateStubbleDrill"),
      actionKey: "rules.action.cultivateStubbleDrill",
      reason: t("rules.reason.cultivateStubbleDrill"),
      source: "rules",
    };
  }

  // ── C. Growing crop — one job: worst deficit vs scan/targets (lime first on tie) ──
  if (!noCrop) {
    // Permanent grass + lime: keep pasture-specific wording (not mixed into arable deficit ranks).
    if (ctx.lime && field.needsLime && isGrassCrop(field)) {
      const ph = Number(field.phValue ?? 0);
      const pht = Number(field.targetPh ?? 0);
      const limeGap = grassPfLimeGap(field);
      if (field.isPrecisionFarming && field.isScanned && pht > 0 && limeGap > GRASS_LIME_GAP_TOLERANCE) {
        return {
          action: t("rules.action.limePastureMap"),
          actionKey: "rules.action.limePastureMap",
          reason: t("rules.reason.limePastureMapPF", {
            ph: ph.toFixed(1),
            target: pht.toFixed(1),
          }),
          source: "rules",
        };
      }
      if (!grassGapActionable(field)) return monitorRegrowthSuggestion(field);
    }

    const growingPick = pickGrowingCropMaintenanceSuggestion(field, ctx);
    if (growingPick) {
      return growingPick;
    }
  }

  // ── Empty seedbed without going through fallow branch (XML-only / edge) ───
  if (isSoilTilledField(field)) {
    if (ctx.lime && field.needsLime && hasNoCrop(field)) {
      return fallowLimeBeforeSeedSuggestion(field);
    }
    return {
      action: t("rules.action.sowSeedbed"),
      actionKey: "rules.action.sowSeedbed",
      reason: t("rules.reason.sowSeedbed"),
      source: "rules",
    };
  }

  // ── needsWork — stones or generic icon queue ──────────────────────────────
  if (field.needsWork) {
    return suggestionForNeedsWork(field, ctx, opts);
  }

  // ── Growing — nothing flagged; remind to monitor ─────────────────────────
  const gs = field.growthState || 0;
  const fruit = (field.fruitType || "").toLowerCase();
  const noCropLoose = !field.fruitType || fruit === "unknown" || fruit === "empty";
  if (noCropLoose && gs === 0) {
    return {
      action: t("rules.action.prepareDrill"),
      actionKey: "rules.action.prepareDrill",
      reason: t("rules.reason.prepareDrill"),
      source: "rules",
    };
  }

  if (gs > 0) {
    const label = displayCropLabel(field);
    return {
      action: t("rules.monitorTowardHarvest", { label }),
      actionKey: "rules.monitorTowardHarvest",
      reason: t("rules.cropGrowingWatchHud"),
      source: "rules",
    };
  }

  return {
    action: t("rules.action.fallback"),
    actionKey: "rules.action.fallback",
    reason: t("rules.reason.fallback"),
    source: "rules",
    kind: RULES_ENGINE_FALLBACK_KIND,
  };
}

export const SUGGESTION_ORDER_CATALOG = Object.freeze([
  "Withered reset",
  "Harvest-ready",
  "Loose forage / swath",
  "Bales on field",
  "PF soil scan",
  "Optional slurry/manure (skippable)",
  "Mulch/plough/lime/cultivate",
  "Sow/plant",
  "Rolling after seeding",
  "Growing maintenance: lime/N/weeds",
  "Monitor / fallback",
]);

export function getSuggestionOrderCatalog() {
  return SUGGESTION_ORDER_CATALOG.slice();
}

/**
 * Urgency score for ranking parcels (tie-break when priorities match).
 * @param {object} field
 * @returns {number}
 */
export function fieldRulesUrgencyScore(field) {
  if (!field) return 0;
  let s = 0;
  if (fieldShowsWithered(field)) s += 100;
  if (effectiveHarvestReady(field)) s += 80;
  if (field.needsWork || field.needsRolling) s += 40;
  const w = Number(field.weedLevel ?? 0);
  if (w >= 0.5) s += 15;
  if (field.needsPlowing || field.needsLime || field.needsCultivation) s += 10;
  const bales = Number(field.baleCountOnField ?? field.baleCount ?? 0);
  if (Number.isFinite(bales) && bales > 0) s += 25;
  const forageUrgent =
    (field.hasLooseForage === true || field.needsBaling === true) && !forageLitersNegligible(field);
  if (forageUrgent) s += 20;
  else if (field.hasWindrow === true || Number(field.windrowLiters ?? 0) > 0) s += 20;
  if (forageUrgent || Number(field.baleableLooseLiters ?? 0) >= MIN_FORAGE_WORKFLOW_LITERS) {
    s += 12;
  }
  return s;
}

/**
 * Best “do this first” from offline rules only.
 * @param {object[]} fields
 * @returns {{ field: object, action: string, reason: string } | null}
 */
export function pickDoThisFirstFieldRulesOnly(fields, opts = {}) {
  if (!Array.isArray(fields) || fields.length === 0) return null;
  const base = opts && typeof opts === "object" ? opts : {};
  const gameSettings =
    base.gameSettings != null
      ? base.gameSettings
      : (typeof window !== "undefined" && window.dashboard && window.dashboard.gameSettings) || {};
  const mergedOpts = { ...base, gameSettings };
  const rows = [];
  for (const field of fields) {
    const sug = getLocalFieldSuggestion(field, mergedOpts);
    if (!sug || typeof sug.action !== "string" || !String(sug.action).trim()) continue;
    if (sug.kind === RULES_ENGINE_FALLBACK_KIND) continue;
    rows.push({ field, sug, score: fieldRulesUrgencyScore(field) });
  }
  if (rows.length === 0) return null;
  rows.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ida = Number(a.field.farmlandId ?? a.field.id ?? 0);
    const idb = Number(b.field.farmlandId ?? b.field.id ?? 0);
    return ida - idb;
  });
  const top = rows[0];
  return { field: top.field, action: top.sug.action, reason: top.sug.reason || "" };
}

export function runSuggestionRegressionMatrix() {
  const base = {
    gameSettings: { weedsEnabled: true, stonesEnabled: true, plowingRequired: true, limeRequired: true },
    skippedOptionalOrganic: {},
  };
  const scenarios = [
    { name: "arable-fallow-mulched-plow", field: { farmlandId: 1, fruitType: "EMPTY", growthState: 0, isMulched: true, plowLevel: 0, needsPlowing: true, needsLime: false } },
    { name: "arable-fallow-lime", field: { farmlandId: 2, fruitType: "EMPTY", growthState: 0, plowLevel: 1, needsPlowing: false, needsLime: true, isPrecisionFarming: true, isScanned: true, phValue: 5.8, targetPh: 6.5 } },
    { name: "arable-growing-weeds", field: { farmlandId: 3, fruitType: "WHEAT", growthState: 2, needsWeeding: true, weedLevel: 0.7 } },
    { name: "grass-mown-regrowth-n", field: { farmlandId: 4, fruitType: "GRASS", growthState: 5, growthLabel: "mown_regrowth", isScanned: true, isPrecisionFarming: true, nitrogenLevel: 40, targetNitrogen: 90 } },
    { name: "seeded-roll-first", field: { farmlandId: 5, fruitType: "BARLEY", growthState: 1, needsRolling: true } },
  ];
  return scenarios.map((s) => ({
    name: s.name,
    suggestion: getLocalFieldSuggestion(s.field, base),
  }));
}

if (typeof window !== "undefined") {
  window.pickDoThisFirstFieldRulesOnly = pickDoThisFirstFieldRulesOnly;
  window.fieldRulesUrgencyScore = fieldRulesUrgencyScore;
  window.getRulesFallbackCounter = getRulesFallbackCounter;
  window.runSuggestionRegressionMatrix = runSuggestionRegressionMatrix;
}
