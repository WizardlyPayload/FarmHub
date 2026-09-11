import { t, tOr } from "@/i18n/i18n";
import {
  getLocalFieldSuggestion,
  RULES_ENGINE_FALLBACK_KIND,
  getBaleCountStrict,
  aggregateWindrowDetected,
  aggregateBaleableLoose,
  classifyWindrowMaterial,
  fieldShowsNonBaleForageBadges,
  MIN_FORAGE_WORKFLOW_LITERS,
  nitrogenTargetForDisplay,
  PF_NUTRIENT_CLOSE_FRAC,
  isFreshlyMownGrass,
  isMowableForageCrop,
  isPreparedSeedbedGround,
  buildToolGuidanceLines,
  buildFleetLinksForSuggestion,
  formatMoisturePercent,
  moistureGradeLabel,
  weedPercentForDisplay,
  WEED_ALERT_THRESHOLD_PCT,
  type FieldRecord,
  type GameSettings,
} from "@/lib/rules-engine";
import type {
  FieldFilterType,
  FieldStatus,
  FleetLink,
  ForageBadge,
  ProgressBarModel,
  SoilBarModel,
  SuggestionModel,
  WeedBadgeModel,
} from "./types";

const MULCH_PURPLE = "#7b1fa2";
const MULCH_PURPLE_FG = "#f3e5f5";
const SOIL_TILLED_BG = "#a65d3a";
const SOIL_TILLED_FG = "#fff8f5";
const HARVEST_ORANGE = "#ff9800";

const OPTIONAL_ORGANIC_SKIP_STORAGE_KEY = "farmdash_optional_organic_skip_v1";
const INCLUDE_UNOWNED_STORAGE_KEY = "farmdash_fields_include_unowned_v1";

export function readIncludeUnownedPref(): boolean {
  try {
    return localStorage.getItem(INCLUDE_UNOWNED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeIncludeUnownedPref(on: boolean) {
  try {
    localStorage.setItem(INCLUDE_UNOWNED_STORAGE_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function filterFieldsForFarmView(
  fields: FieldRecord[],
  farmId: number,
  options: { includeUnowned?: boolean } = {},
): FieldRecord[] {
  const { includeUnowned = false } = options;
  if (!Array.isArray(fields)) return [];
  const fid = Number(farmId);
  return fields.filter((f) => {
    if (!f) return false;
    const oid = Number(f.ownerFarmId ?? f.farmId ?? 0);
    if (oid === fid) return true;
    if (includeUnowned && oid === 0) return true;
    return false;
  });
}

function isSpinachField(field: FieldRecord | null | undefined): boolean {
  return String(field?.fruitType || "").toUpperCase() === "SPINACH";
}

/**
 * Cultivated / plowed / stubble-tilled ground (FS25 density 1–6) cannot hold standing crop.
 * Older exports leave MEADOW/GRASS fruit on these parcels — clear for display + status.
 */
export function fieldWithPreparedGroundCropCleared(field: FieldRecord): FieldRecord {
  if (!field || !isPreparedSeedbedGround(field.groundType, field.groundTypeName)) {
    return field;
  }
  const fruit = String(field.fruitType || "").toLowerCase();
  const keepMulch =
    fruit === "mulched_stubble" ||
    field.growthLabel === "mulched_fallow" ||
    fieldIsMulched(field);
  if (
    (Number(field.fruitTypeIndex) || 0) === 0 &&
    (Number(field.growthState) || 0) === 0 &&
    !field.harvestReady &&
    (fruit === "empty" || fruit === "unknown" || fruit === "" || keepMulch)
  ) {
    return field;
  }
  return {
    ...field,
    fruitTypeIndex: 0,
    fruitType: keepMulch ? "mulched_stubble" : "empty",
    growthState: 0,
    harvestReady: false,
    isWithered: false,
    growthLabel: keepMulch ? "mulched_fallow" : "empty",
  };
}

/** FS25 spinach two-cut cycle phase (foliage states past numGrowthStates=7). */
type SpinachPhase =
  | "growing"
  | "ready"
  | "ready_second"
  | "cut1_regrowing"
  | "regrowing_second"
  | "final_harvested"
  | "withered"
  | null;

function spinachEngineName(field: FieldRecord): string {
  return String(
    field.growthStateName || field.stateName || field.growthLabel || "",
  )
    .toLowerCase()
    .replace(/[\s_]+/g, "");
}

function resolveSpinachPhase(field: FieldRecord): SpinachPhase {
  if (!isSpinachField(field)) return null;
  const name = spinachEngineName(field);
  if (name === "dead" || name === "withered" || field.isWithered) return "withered";
  if (name === "harvestreadysecond") return "ready_second";
  if (name === "harvestready" || field.growthLabel === "harvest_ready") return "ready";
  if (name === "harvestedsecond") return "final_harvested";
  if (name === "harvested" || name.includes("regenerat")) return "cut1_regrowing";
  if (name === "greenmiddlesecond" || name === "greenbigsecond") return "regrowing_second";
  if (field.growthLabel === "mown_regrowth") return "regrowing_second";
  if (field.growthLabel === "harvested" || field.isHarvested) return "final_harvested";

  // Fallback when older mod exports gs past max as "growing" (live bug: gs=10 / max=7).
  const gs = Number(field.growthState) || 0;
  const max = Math.max(1, Number(field.maxGrowthState) || 7);
  if (gs > max) {
    const over = gs - max;
    if (over === 1) return "withered";
    if (over === 2) return "cut1_regrowing";
    return "final_harvested";
  }
  if (gs > 0) return "growing";
  return null;
}

export function fieldShowsWithered(field: FieldRecord | null | undefined): boolean {
  if (!field) return false;
  field = fieldWithPreparedGroundCropCleared(field);
  if (isSpinachField(field) && resolveSpinachPhase(field) === "withered") return true;
  if (!field.isWithered) return false;
  if (isMowableForageCrop(field)) return false;
  return true;
}

export function fieldIsMulched(field: FieldRecord): boolean {
  if (field.isMulched === true) return true;
  if (field.isMulched === false) return false;
  const s = Number(field.stubbleShredLevel ?? field.mulchLevel ?? 0);
  return s >= 1;
}

export function isMulchedEmptyField(field: FieldRecord): boolean {
  if (!fieldIsMulched(field)) return false;
  if (field.isHarvested || field.growthLabel === "harvested") return false;
  if (field.growthLabel === "mulched_fallow" || field.fruitType === "mulched_stubble") return true;
  const fruit = (field.fruitType || "").toLowerCase();
  const noCrop = !field.fruitType || fruit === "unknown" || fruit === "empty";
  return noCrop && (field.growthState || 0) === 0;
}

export function fieldIsAlreadyHarvested(field: FieldRecord): boolean {
  const spinach = resolveSpinachPhase(field);
  if (spinach === "final_harvested") return true;
  if (spinach === "cut1_regrowing" || spinach === "regrowing_second") return false;
  if (spinach === "ready" || spinach === "ready_second") return false;
  if (field.isHarvested === true) return true;
  if (field.growthLabel === "harvested") return true;
  const gt = String(field.groundType || "").toUpperCase();
  return gt.includes("HARVESTED");
}

export function effectiveHarvestReady(field: FieldRecord): boolean {
  field = fieldWithPreparedGroundCropCleared(field);
  const spinach = resolveSpinachPhase(field);
  if (spinach === "ready" || spinach === "ready_second") return true;
  if (spinach === "final_harvested" || spinach === "cut1_regrowing" || spinach === "regrowing_second") {
    return false;
  }
  if (fieldIsAlreadyHarvested(field)) return false;
  return !!(field.harvestReady && !isMulchedEmptyField(field));
}

export function isPostHarvestField(field: FieldRecord): boolean {
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

export function getFieldStatus(f: FieldRecord): FieldStatus {
  f = fieldWithPreparedGroundCropCleared(f);
  if (fieldShowsWithered(f)) return "needswork";
  if (isMulchedEmptyField(f)) return "empty";
  if (effectiveHarvestReady(f)) return "harvest";
  const spinach = resolveSpinachPhase(f);
  if (spinach === "final_harvested") return "empty";
  if (spinach === "cut1_regrowing" || spinach === "regrowing_second") return "growing";
  if (f.needsWork || f.needsRolling) return "needswork";
  if (f.growthState > 0) return "growing";
  return "empty";
}

export function formatCropName(name: unknown): string {
  if (name == null || String(name).trim() === "") return t("fields.formatCropEmpty");
  const n = String(name).trim().toLowerCase();
  if (n === "empty" || n === "unknown") return t("fields.formatCropEmpty");
  if (n === "mulched_stubble") return t("fields.formatCropMulchedStubble");
  if (n === "beetroot") return t("fields.formatCropBeetroot");
  return String(name)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatFieldHectares(field: FieldRecord): string {
  const ha = Number(field?.hectares);
  if (Number.isFinite(ha) && ha > 0.001) return `${ha.toFixed(2)} ha`;
  return "—";
}

export function computeFieldStats(fields: FieldRecord[]) {
  const totalArea = fields.reduce((s, f) => s + (f.hectares || 0), 0);
  const needsWork = fields.filter(
    (f) => f.needsWork || f.needsRolling || fieldShowsWithered(f),
  ).length;
  const harvestReady = fields.filter((f) => effectiveHarvestReady(f)).length;
  const haKnown = fields.some((f) => Number(f.hectares) > 0.001);
  return {
    count: fields.length,
    totalArea: haKnown ? totalArea.toFixed(1) : "—",
    needsWork,
    harvestReady,
  };
}

export function filterDisplayRows(
  rows: FieldRecord[],
  filterType: FieldFilterType,
  searchTerm: string,
): FieldRecord[] {
  const q = searchTerm.trim().toLowerCase();
  return rows.filter((f) => {
    const status = getFieldStatus(f);
    if (filterType !== "all" && status !== filterType) return false;
    if (!q) return true;
    const idStr = (f._clusterFieldIds || []).join(" ");
    return (
      (f.name || "").toLowerCase().includes(q) ||
      (f.fruitType || "").toLowerCase().includes(q) ||
      idStr.includes(q)
    );
  });
}

function parseHex(hex: string) {
  const h = (hex || "#000000").replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function mixHex(a: string, b: string, tVal: number) {
  const A = parseHex(a);
  const B = parseHex(b);
  const u = Math.min(1, Math.max(0, tVal));
  const r = Math.round(A.r + (B.r - A.r) * u);
  const g = Math.round(A.g + (B.g - A.g) * u);
  const bch = Math.round(A.b + (B.b - A.b) * u);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${bch.toString(16).padStart(2, "0")}`;
}

function greenGradientForPercent(pct: number) {
  return mixHex("#c8e6c9", "#1b5e20", Math.min(1, Math.max(0, Number(pct) || 0) / 100));
}

function contrastForBg(hex: string) {
  const { r, g, b } = parseHex(hex);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.55 ? "#111" : "#fff";
}

function isGrowingBarField(field: FieldRecord) {
  const spinach = resolveSpinachPhase(field);
  if (
    spinach === "final_harvested" ||
    spinach === "cut1_regrowing" ||
    spinach === "regrowing_second" ||
    spinach === "ready" ||
    spinach === "ready_second" ||
    spinach === "withered"
  ) {
    return false;
  }
  const gs = field.growthState || 0;
  if (gs <= 0) return false;
  if (fieldShowsWithered(field)) return false;
  if (fieldIsAlreadyHarvested(field)) return false;
  if (effectiveHarvestReady(field)) return false;
  if (field.growthLabel === "harvested") return false;
  return true;
}

function isSoilTilledField(field: FieldRecord) {
  field = fieldWithPreparedGroundCropCleared(field);
  if ((field.growthState || 0) > 0) return false;
  if (effectiveHarvestReady(field)) return false;
  if (isPreparedSeedbedGround(field.groundType, field.groundTypeName)) return true;
  const gt = String(field.groundType || "").toUpperCase();
  if (gt.includes("PLOWED") || gt.includes("CULTIVATED")) return true;
  if (Number(field.plowLevel) >= 1) {
    const fruit = (field.fruitType || "").toLowerCase();
    const noCrop = !field.fruitType || fruit === "unknown" || fruit === "empty";
    if (noCrop && !fieldIsMulched(field)) return true;
  }
  return false;
}

function grassStageCapForBar(field: FieldRecord) {
  let max = Math.max(1, Number(field.maxGrowthState) || 4);
  if (isMowableForageCrop(field) && max > 4) max = 4;
  return max;
}

function grassRingCurMax(field: FieldRecord): { cur: number; max: number } | null {
  if (!isMowableForageCrop(field)) return null;
  const max = grassStageCapForBar(field);
  const ring = Number(field.grassRingStage);
  if (Number.isFinite(ring) && ring > 0) {
    return { cur: Math.min(ring, max), max };
  }
  const rawGs = Number(field.growthState) || 0;
  if (rawGs > max) {
    return { cur: ((rawGs - 1) % max) + 1, max };
  }
  return { cur: Math.min(rawGs, max), max };
}

function tryRegrowthProgressBar(field: FieldRecord): ProgressBarModel | null {
  const gl = String(field.growthLabel || "").toLowerCase();
  const rawGs = Number(field.growthState) || 0;
  const pct = Math.min(100, Math.max(0, field.growthStatePercentage || 0));
  const bg = greenGradientForPercent(pct);
  const fg = contrastForBg(bg);

  if (isMowableForageCrop(field)) {
    const cap = grassStageCapForBar(field);
    const rm = grassRingCurMax(field);
    const cur = rm ? rm.cur : Math.min(rawGs, cap);
    if (gl === "mown_regrowth" || rawGs > cap || isFreshlyMownGrass(field)) {
      return { pct, bg, label: t("fields.barMownRegrowing", { cur, max: cap }), textColour: fg };
    }
  }
  const spinach = resolveSpinachPhase(field);
  if (spinach === "cut1_regrowing" || spinach === "regrowing_second") {
    const regeneratingPct = Math.min(99, Math.max(8, pct || 15));
    const regenBg = greenGradientForPercent(regeneratingPct);
    return {
      pct: regeneratingPct,
      bg: regenBg,
      label: t("fields.barSpinachRegrowing", { cur: 1, max: 3 }),
      textColour: contrastForBg(regenBg),
    };
  }
  return null;
}

export function buildProgressBar(field: FieldRecord): ProgressBarModel {
  field = fieldWithPreparedGroundCropCleared(field);
  if (fieldShowsWithered(field)) {
    return { pct: 100, bg: "#8b0000", label: t("fields.badgeWithered"), textColour: "#fff" };
  }

  const spinach = resolveSpinachPhase(field);
  if (spinach === "final_harvested") {
    return { pct: 100, bg: "#6d4c41", label: t("fields.barHarvested"), textColour: "#fff" };
  }
  if (spinach === "ready" || spinach === "ready_second") {
    const readyLabel =
      spinach === "ready_second"
        ? tOr("fields.barSpinachReadySecond", "Spinach · ready (2nd cut)")
        : t("fields.barReadyToHarvest");
    return { pct: 100, bg: HARVEST_ORANGE, label: readyLabel, textColour: "#000" };
  }

  const regrowthBar = tryRegrowthProgressBar(field);
  if (regrowthBar) return regrowthBar;

  if (isGrowingBarField(field)) {
    const pct = Math.min(100, Math.max(0, field.growthStatePercentage || 0));
    let max = Math.max(1, Number(field.maxGrowthState) || 1);
    const ftU = (field.fruitType || "").toUpperCase();
    if (isMowableForageCrop(field) && max > 4) max = 4;
    const rawGs = Number(field.growthState) || 0;
    const rm = isMowableForageCrop(field) ? grassRingCurMax(field) : null;
    let cur = rm ? rm.cur : rawGs;
    if (!rm && cur > max) cur = max;
    const bg = greenGradientForPercent(pct);
    const fg = contrastForBg(bg);
    const label =
      ftU === "SPINACH"
        ? t("fields.barSpinachGrowing", { cur, max })
        : t("fields.barGrowingStage", { cur, max });
    return { pct, bg, label, textColour: fg };
  }

  if (effectiveHarvestReady(field)) {
    return { pct: 100, bg: HARVEST_ORANGE, label: t("fields.barReadyToHarvest"), textColour: "#000" };
  }

  if (isSoilTilledField(field)) {
    return { pct: 100, bg: SOIL_TILLED_BG, label: t("fields.barPlowedCultivated"), textColour: SOIL_TILLED_FG };
  }

  if (fieldIsMulched(field) && (field.growthState || 0) === 0) {
    return { pct: 100, bg: MULCH_PURPLE, label: t("fields.badgeMulched"), textColour: MULCH_PURPLE_FG };
  }

  if (fieldIsAlreadyHarvested(field) || isPostHarvestField(field)) {
    return { pct: 100, bg: "#6d4c41", label: t("fields.barHarvested"), textColour: "#fff" };
  }

  if (!field.growthState || field.growthState === 0) {
    return { pct: 100, bg: "#5d4037", label: t("fields.badgeEmpty"), textColour: "#f5f5f5" };
  }

  const pct = field.growthStatePercentage || 0;
  let max = Math.max(1, Number(field.maxGrowthState) || 1);
  const ftU = (field.fruitType || "").toUpperCase();
  if (isMowableForageCrop(field) && max > 4) max = 4;
  const rawGs = Number(field.growthState) || 0;
  if (isMowableForageCrop(field) && rawGs > max) {
    const cap = grassStageCapForBar(field);
    const rm = grassRingCurMax(field);
    const cur = rm ? rm.cur : ((rawGs - 1) % cap) + 1;
    const bg = greenGradientForPercent(Math.min(100, pct));
    return {
      pct,
      bg,
      label: t("fields.barMownRegrowing", { cur, max: cap }),
      textColour: contrastForBg(bg),
    };
  }
  let cur = rawGs;
  if (isMowableForageCrop(field)) {
    const rm = grassRingCurMax(field);
    if (rm) cur = rm.cur;
  }
  if (cur > max) cur = max;
  const bg = greenGradientForPercent(pct);
  const tail =
    ftU === "SPINACH"
      ? t("fields.barSpinachStage", { cur, max })
      : t("fields.growingStageShort", { cur, max });
  return { pct, bg, label: tail, textColour: contrastForBg(bg) };
}

export function buildSoilBars(field: FieldRecord): { nitrogen: SoilBarModel; ph: SoilBarModel } {
  const isPF = field.isPrecisionFarming;
  const scanned = field.isScanned;

  let nProgress = 0;
  let nColour = "#6c757d";
  let nLabel = field.nitrogenText || "0/2";

  if (isPF) {
    if (!scanned) {
      nLabel = t("fields.needsScan");
      nColour = "#dc3545";
      nProgress = 0;
    } else {
      const tn = nitrogenTargetForDisplay(field);
      const ratio = tn > 0 ? field.nitrogenLevel / tn : 0;
      nProgress = Math.min(100, ratio * 100);
      if (ratio < 0.25) nColour = "#dc3545";
      else if (ratio < 0.6) nColour = "#fd7e14";
      else if (ratio < 0.9) nColour = "#ffc107";
      else if (ratio <= 1.1) nColour = "#198754";
      else nColour = "#0dcaf0";
      const nl = Number(field.nitrogenLevel ?? 0);
      if (tn > 0) {
        const gap = Math.max(0, tn - nl);
        const gapPct = gap / tn;
        nLabel =
          gap > 1 && gapPct > PF_NUTRIENT_CLOSE_FRAC
            ? t("fields.pfNitrogenLevelsNeedGap", {
                current: Math.round(nl),
                target: Math.round(tn),
                gap: Math.round(gap),
              })
            : t("fields.pfNitrogenLevels", {
                current: Math.round(nl),
                target: Math.round(tn),
              });
      }
    }
  } else {
    const fl = Number(field.fertilizationLevel ?? 0);
    nProgress = (fl / 2) * 100;
    nColour = fl === 0 ? "#dc3545" : fl === 1 ? "#ffc107" : "#198754";
    nLabel = t("fields.fertilizationLevel", { cur: fl });
  }

  let phProgress = 0;
  let phColour = "#6c757d";
  let phLabel = field.limeText || (field.needsLime ? t("fields.phNeeded") : t("fields.phDone"));

  if (isPF) {
    if (!scanned) {
      phLabel = t("fields.needsScan");
      phColour = "#dc3545";
      phProgress = 0;
    } else {
      const pv = Number(field.phValue);
      const pvOk = Number.isFinite(pv) ? pv : 0;
      const tgt = Number(field.targetPh);
      const barMax =
        Number.isFinite(tgt) && tgt > 0
          ? tgt
          : Number(field.phLimeBarMax) > 0
            ? Number(field.phLimeBarMax)
            : 6.5;
      const rawMin = Number(field.phLimeBarMin);
      let barMin =
        Number.isFinite(rawMin) && rawMin > 0 && rawMin < barMax
          ? rawMin
          : Math.max(4.3, barMax - 1.2);
      if (barMin >= barMax) barMin = Math.max(4.3, barMax - 1.2);
      const span = barMax - barMin;
      phProgress =
        span > 0
          ? Math.max(0, Math.min(100, ((pvOk - barMin) / span) * 100))
          : field.needsLime
            ? 0
            : 100;
      let ratio: number;
      if (field.targetPh > 0) {
        ratio = pvOk / field.targetPh;
      } else {
        ratio = span > 0 ? Math.max(0, Math.min(1, (pvOk - barMin) / span)) : 0;
      }
      if (ratio < 0.8) phColour = "#dc3545";
      else if (ratio < 0.9) phColour = "#fd7e14";
      else if (ratio < 0.98) phColour = "#ffc107";
      else if (ratio <= 1.05) phColour = "#198754";
      else phColour = "#0dcaf0";
      if (Number.isFinite(tgt) && tgt > 0) {
        const gap = tgt - pvOk;
        phLabel =
          gap > 0.05
            ? t("fields.phTargetGap", {
                current: pvOk.toFixed(1),
                target: tgt.toFixed(1),
                gap: gap.toFixed(1),
              })
            : t("fields.phTargetOk", {
                current: pvOk.toFixed(1),
                target: tgt.toFixed(1),
              });
      }
    }
  } else {
    phProgress = field.needsLime ? 0 : 100;
    phColour = field.needsLime ? "#dc3545" : "#198754";
    phLabel = field.needsLime ? t("fields.limeNeededSoil") : t("fields.limeOk");
  }

  return {
    nitrogen: { progress: nProgress, colour: nColour, label: nLabel },
    ph: { progress: phProgress, colour: phColour, label: phLabel },
  };
}

export type StatusBadgeModel = {
  label: string;
  tone: "default" | "accent" | "warn" | "danger";
  style?: Record<string, string>;
};

export function buildStatusBadge(field: FieldRecord): StatusBadgeModel {
  field = fieldWithPreparedGroundCropCleared(field);
  if (fieldShowsWithered(field)) return { label: t("fields.badgeWithered"), tone: "danger" };
  const spinach = resolveSpinachPhase(field);
  if (spinach === "final_harvested" || spinach === "cut1_regrowing") {
    return { label: t("fields.badgeHarvested"), tone: "default", style: { background: "#8d6e63" } };
  }
  if (spinach === "regrowing_second") {
    return { label: t("fields.badgeGrowing"), tone: "accent" };
  }
  if (field.isHarvested && !spinach)
    return { label: t("fields.badgeHarvested"), tone: "default", style: { background: "#8d6e63" } };
  if (isMulchedEmptyField(field)) {
    return {
      label: t("fields.badgeMulched"),
      tone: "default",
      style: { background: MULCH_PURPLE, color: MULCH_PURPLE_FG },
    };
  }
  if (effectiveHarvestReady(field)) {
    return {
      label: t("fields.badgeReady"),
      tone: "warn",
      style: { background: "#ff9800", color: "#000" },
    };
  }
  if (isFreshlyMownGrass(field)) {
    return { label: t("fields.badgeHarvested"), tone: "default", style: { background: "#8d6e63" } };
  }
  if (field.needsWork || field.needsRolling) return { label: t("fields.badgeNeedsWork"), tone: "warn" };
  if ((field.growthState || 0) > 0) return { label: t("fields.badgeGrowing"), tone: "accent" };
  return { label: t("fields.badgeEmpty"), tone: "default" };
}

export function buildWeedBadge(field: FieldRecord): WeedBadgeModel | null {
  const pct = weedPercentForDisplay(field);
  const hasWeedSignal =
    pct > 0 || field.needsWeeding === true || Number(field.weedLevel ?? 0) > 0;
  if (!hasWeedSignal) return null;

  const threshold = Number(field.weedAlertThresholdPct) || WEED_ALERT_THRESHOLD_PCT;
  let labelKey = "fields.weedLevelLow";
  let tone: WeedBadgeModel["tone"] = "default";
  if (pct >= threshold) {
    labelKey = "fields.weedLevelAlert";
    tone = "danger";
  } else if (pct >= threshold * 0.85) {
    labelKey = "fields.weedLevelModerate";
    tone = "warn";
  } else if (pct >= threshold * 0.6) {
    labelKey = "fields.weedLevelRising";
    tone = "warn";
  }

  return {
    label: t(labelKey, { pct, threshold }),
    tone,
    title: t("fields.soilWeeds"),
  };
}

export function buildMoistureLabel(field: FieldRecord): string | null {
  const m = field?.moisture;
  if (!m?.enabled) return null;
  if (m.percent == null || !Number.isFinite(Number(m.percent))) {
    return t("fields.cardMoisturePending");
  }
  const pct = formatMoisturePercent(m.percent);
  const grade = m.grade != null && m.grade !== "" ? moistureGradeLabel(m.grade) : null;
  return grade
    ? t("fields.cardMoistureWithGrade", { pct, grade })
    : t("fields.cardMoisture", { pct });
}

export function buildForageBadges(field: FieldRecord): ForageBadge[] {
  const baleN = getBaleCountStrict(field);
  const hasForage = field.hasLooseForage === true;
  const wind = aggregateWindrowDetected(field);
  const baleLoose = aggregateBaleableLoose(field);
  const ls = Number(field?.looseStrawLiters ?? 0);
  const lg = Number(field?.looseGrassWindrowLiters ?? 0);
  const lh = Number(field?.looseDryGrassWindrowLiters ?? 0);
  const combinedLooseLiters = ls + lg + lh;
  const hasMeaningfulLooseForage = combinedLooseLiters >= MIN_FORAGE_WORKFLOW_LITERS;
  const windrowLiters = Number(field?.windrowLiters ?? 0);
  const hasMeaningfulWindrowLiters =
    Number.isFinite(windrowLiters) && windrowLiters >= MIN_FORAGE_WORKFLOW_LITERS;
  if (baleN <= 0 && !hasForage && !fieldShowsNonBaleForageBadges(field)) return [];
  const showWindrowBadge = wind && (hasMeaningfulWindrowLiters || hasMeaningfulLooseForage);

  const parts: ForageBadge[] = [];
  if (baleN > 0) {
    const baleLabel =
      baleN === 1
        ? t("fields.baleCount", { count: baleN })
        : t("fields.baleCountPlural", { count: baleN });
    parts.push({
      key: "bales",
      label: baleLabel,
      title: t("fields.balesOnFieldTitle"),
      tone: "warn",
    });
  }
  if (field.hasLooseStraw === true && ls >= MIN_FORAGE_WORKFLOW_LITERS) {
    parts.push({
      key: "straw",
      label: t("fields.looseStraw"),
      title: t("fields.looseStrawTitle"),
      tone: "accent",
    });
  }
  const hasGrassWindrow = field.hasLooseGrassWindrow === true && lg >= MIN_FORAGE_WORKFLOW_LITERS;
  const hasHayWindrow = field.hasLooseHayWindrow === true && lh >= MIN_FORAGE_WORKFLOW_LITERS;
  if (hasGrassWindrow || hasHayWindrow) {
    const showGrass = hasGrassWindrow && (!hasHayWindrow || lg >= lh);
    const wm = field?.windrowMoisture;
    const moistHint =
      wm?.enabled && wm.percent != null
        ? ` (${wm.percent}%${wm.isHay ? ` · ${t("fields.windrowDryHay")}` : ""})`
        : "";
    if (showGrass) {
      parts.push({
        key: "grass",
        label: `${t("fields.grassWindrow")}${moistHint}`,
        title: t("fields.grassWindrowTitle"),
        tone: "accent",
      });
    } else {
      parts.push({
        key: "hay",
        label: `${t("fields.hayWindrow")}${moistHint}`,
        title: t("fields.hayWindrowTitle"),
        tone: "accent",
      });
    }
  }
  if (!hasForage && baleLoose) {
    const bl = Number(field.baleableLooseLiters ?? 0);
    const sub =
      Number.isFinite(bl) && bl > 0
        ? t("fields.baleLooseLiters", { liters: Math.round(bl) })
        : t("fields.baleLoosePresent");
    parts.push({
      key: "baleLoose",
      label: sub,
      title: t("fields.baleLooseTitle"),
      tone: "accent",
    });
  }
  if (!hasForage && showWindrowBadge) {
    const mat = classifyWindrowMaterial(field);
    const lit = hasMeaningfulWindrowLiters ? windrowLiters : combinedLooseLiters;
    const matHint =
      mat === "straw"
        ? t("fields.windrowMatStraw")
        : mat === "grass"
          ? t("fields.windrowMatGrass")
          : mat === "hay"
            ? t("fields.windrowMatHay")
            : mat === "crop_swath"
              ? t("fields.windrowMatSwath")
              : t("fields.windrowMatGeneric");
    const sub =
      lit > 0
        ? t("fields.windrowProbeSum", { liters: Math.round(lit) })
        : t("fields.windrowOnGround");
    parts.push({
      key: "windrow",
      label: `${matHint} · ${sub}`,
      title: t("fields.windrowAnyTitle"),
      tone: "accent",
    });
  }
  return parts;
}

export function buildWindrowVolumeBadge(field: FieldRecord): string | null {
  const L = Number(field?.windrowLiters ?? 0);
  if (!Number.isFinite(L) || L < MIN_FORAGE_WORKFLOW_LITERS) return null;
  const typ = field?.windrowType;
  if (typ == null || typ === "") return null;
  const raw = String(typ).trim();
  if (!raw) return null;
  const label = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  const vol = Math.round(L).toLocaleString(undefined, { maximumFractionDigits: 0 });
  const wm = field?.windrowMoisture;
  const moistSuffix =
    wm?.enabled && wm.percent != null
      ? ` · ${String(wm.percent)}%${wm.isHay ? ` (${t("fields.windrowDryHay")})` : ""}`
      : "";
  return `${label}: ${vol} L${moistSuffix}`;
}

function shouldSuppressHarvestSuggestions(field: FieldRecord): boolean {
  if (fieldIsAlreadyHarvested(field)) return true;
  if (isPostHarvestField(field)) return true;
  if (field.growthLabel === "mulched_fallow" || field.fruitType === "mulched_stubble") return true;
  if (field.isMulched === true) return true;
  if (fieldIsMulched(field) && (field.growthState || 0) === 0) return true;
  return false;
}

const SUGGESTION_TECH_TOKEN_RE =
  /\b(rollerLevel|plowLevel|needsPlowing|needsWork|mulchLevel|stubbleShredLevel|weedLevel|stoneLevel|sprayLevel|fruitTypeIndex)\b/gi;

function sanitizeSuggestionCopy(str: unknown): string {
  if (str == null || typeof str !== "string") return "";
  return str
    .replace(SUGGESTION_TECH_TOKEN_RE, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;:])/g, "$1")
    .trim();
}

function pickApiFallbackSuggestion(field: FieldRecord) {
  if (!field.suggestions || field.suggestions.length === 0) return null;
  let sorted = [...field.suggestions].sort(
    (a: { priority?: number }, b: { priority?: number }) =>
      (a.priority || 9) - (b.priority || 9),
  );
  if (shouldSuppressHarvestSuggestions(field)) {
    sorted = sorted.filter((s: { type?: string; action?: string }) => {
      const typ = (s.type || "").toLowerCase();
      if (typ === "harvest") return false;
      const act = (s.action || "").toLowerCase();
      if (act.startsWith("harvest")) return false;
      return true;
    });
  }
  const top = sorted.find((s: { action?: string }) => s && s.action);
  if (!top) return null;
  return {
    action: sanitizeSuggestionCopy(top.action),
    reason: sanitizeSuggestionCopy(top.reason || ""),
    source: "rules" as const,
  };
}

export function readOptionalOrganicSkipMap(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(OPTIONAL_ORGANIC_SKIP_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function writeOptionalOrganicSkipMap(map: Record<string, boolean>) {
  try {
    localStorage.setItem(OPTIONAL_ORGANIC_SKIP_STORAGE_KEY, JSON.stringify(map || {}));
  } catch {
    /* ignore */
  }
}

export function optionalOrganicSkipKeyForField(field: FieldRecord): string {
  if (!field) return "";
  const id = String(field.farmlandId ?? field.id ?? "");
  if (!id) return "";
  const cyc = [
    String(field.fruitType || ""),
    String(field.growthLabel || ""),
    String(field.growthState ?? ""),
    String(field.isHarvested ? 1 : 0),
  ].join("|");
  return `${id}::${cyc}`;
}

function isWinterSeason(currentSeason: unknown): boolean {
  if (!currentSeason) return false;
  return String(currentSeason).toUpperCase() === "WINTER";
}

function getWinterFieldSeasonalNote(field: FieldRecord, currentSeason: unknown): string {
  if (!isWinterSeason(currentSeason)) return "";
  if (isMowableForageCrop(field)) return "";
  const hasCrop = (field.fruitTypeIndex || 0) > 0 && (field.growthState || 0) > 0;
  if (!hasCrop) return "";
  if (field.harvestReady || fieldIsAlreadyHarvested(field)) return "";
  return t("fields.winterSeasonNote");
}

export function buildSuggestionModel(
  field: FieldRecord,
  opts: {
    gameSettings?: GameSettings;
    vehicles?: unknown;
    farmId?: number;
    currentSeason?: unknown;
    skippedOptionalOrganic?: Record<string, boolean>;
  },
): SuggestionModel | null {
  const seasonalNote = getWinterFieldSeasonalNote(field, opts.currentSeason);
  const skippedOptionalOrganic = opts.skippedOptionalOrganic ?? readOptionalOrganicSkipMap();
  let rulesLocal = getLocalFieldSuggestion(field, {
    gameSettings: opts.gameSettings || {},
    skippedOptionalOrganic,
  });
  const rulesApi = pickApiFallbackSuggestion(field);
  if (rulesLocal && rulesLocal.kind === RULES_ENGINE_FALLBACK_KIND && rulesApi) {
    rulesLocal = rulesApi;
  }
  const rules = rulesLocal || rulesApi;
  const action = rules ? rules.action : "";

  const farmIdNum = Number(opts.farmId) || 1;
  const toolLines = action
    ? buildToolGuidanceLines(
        opts.vehicles as any[],
        farmIdNum,
        action,
        field,
        rules?.actionKey,
      )
    : [];
  const fleetLinks: FleetLink[] = action
    ? buildFleetLinksForSuggestion(
        opts.vehicles as any[],
        farmIdNum,
        action,
        field,
        rules?.actionKey,
      )
    : [];
  const fleetPrefix = `${t("tools.useFromYourFleet")}:`;
  const buyPrefix = `${t("tools.buyLeaseSuggestion")}:`;
  const fleetLines = toolLines.filter((line) => String(line).startsWith(fleetPrefix));
  const buyLeaseLines = toolLines.filter((line) => String(line).startsWith(buyPrefix));
  const otherToolLines = toolLines.filter(
    (line) =>
      String(line).trim().length > 0 &&
      !String(line).startsWith(fleetPrefix) &&
      !String(line).startsWith(buyPrefix),
  );

  if (!action && !seasonalNote) return null;

  return {
    action,
    actionKey: rules?.actionKey,
    reason: rules && typeof rules.reason === "string" ? rules.reason.trim() : "",
    seasonalNote,
    fleetLines: fleetLines.map((l) => l.replace(fleetPrefix, "").trim()),
    fleetLinks,
    buyLeaseLines: buyLeaseLines.map((l) => l.replace(buyPrefix, "").trim()),
    otherToolLines: otherToolLines.map((l) => String(l).trim()),
    showOrganicSkip: rules?.actionKey === "rules.action.optionalOrganicFirst",
    organicSkipKey:
      rules?.actionKey === "rules.action.optionalOrganicFirst"
        ? optionalOrganicSkipKeyForField(field)
        : "",
  };
}
