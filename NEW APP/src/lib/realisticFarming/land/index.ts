import type {
  CropStressFieldInfo,
  RfTreatmentStep,
  SoilFertilizerFieldInfo,
} from "@/types/dashboard";

/** Land agent — Soil Fertilizer + Seasonal Crop Stress helpers. */
export const LAND_DOMAIN = "land" as const;

export type RfNutrientKey = "nitrogen" | "phosphorus" | "potassium";

export interface RfNutrientReading {
  key: RfNutrientKey;
  value: number;
  target: number;
  status: string;
  /** Current / target ratio clamped 0–100 for bar fill. */
  percent: number;
  tone: "good" | "fair" | "poor" | "unknown";
}

export interface RfPressureReading {
  key: "weed" | "pest" | "disease";
  value: number | null;
  /** Disease only — nil shownDiseasePressure means unscouted. */
  unscouted?: boolean;
  activeDisease?: string | null;
  percent: number;
  tone: "good" | "fair" | "poor" | "unknown";
}

export interface RfTreatmentPlanRow {
  key: string;
  label: string;
  text: string;
  priority: "urgent" | "watch" | "ok" | "info";
  hasRates: boolean;
}

export type RfSoilBarKey =
  | "nitrogen"
  | "phosphorus"
  | "potassium"
  | "ph"
  | "organicMatter"
  | "weed"
  | "pest"
  | "disease";

/** How the row's number should be rendered (unit lives with the value, not the label). */
export type RfSoilBarUnit = "ppm" | "ph" | "om" | "percent";

/** One full-width reading row: label, severity-toned bar, right-aligned value. */
export interface RfSoilBarRow {
  key: RfSoilBarKey;
  unit: RfSoilBarUnit;
  value: number | null;
  target: number | null;
  /** Bar fill 0–100. */
  percent: number;
  tone: "good" | "fair" | "poor" | "unknown";
  /** Disease only — no reading until the field has been scouted. */
  unscouted: boolean;
  /** Disease only — named infection once discovered. */
  activeDisease?: string | null;
}

/** A localisable fragment: the component resolves `key` through `t()`. */
export interface RfSoilPhrase {
  key: string;
  params?: Record<string, string | number>;
}

/**
 * Plain-language rollup of the mod's treatment rows: one headline, the reasons
 * behind it, and secondary "also worth doing" notes.
 */
export interface RfSoilPlanSummary {
  tone: "urgent" | "watch" | "ok";
  title: RfSoilPhrase;
  reasons: RfSoilPhrase[];
  also: RfSoilPhrase[];
  urgentCount: number;
  watchCount: number;
}

export interface RfSoilPanelModel {
  nutrients: RfNutrientReading[];
  pressures: RfPressureReading[];
  pH: number | null;
  pHTarget: number;
  organicMatter: number | null;
  omTarget: number;
  yieldEfficiency: number | null;
  urgency: number;
  urgencyTone: "good" | "fair" | "poor";
  needsFertilization: boolean;
  treatments: {
    herbicide: boolean;
    insecticide: boolean;
    fungicide: boolean;
  };
  treatmentPlan: RfTreatmentPlanRow[];
  rotation: {
    lastCrop: string | null;
    lastCrop2: string | null;
    lastCrop3: string | null;
    status: string | null;
    bonusDaysLeft: number;
  };
  compaction: number | null;
  simDisabled: boolean;
  simDisabledReason: string | null;
  isMeadow: boolean;
  growthFraction: number | null;
  coverageFraction: number | null;
  sessionCoverageFraction: number | null;
  sessionLastProduct: string | null;
  amendBurnRisk: boolean;
  burnDaysLeft: number;
  fieldArea: number | null;
  /** The eight reading rows, in the fixed order the card renders them. */
  bars: RfSoilBarRow[];
  plan: RfSoilPlanSummary;
}

export interface RfCropStressPanelModel {
  moisturePercent: number | null;
  stressPercent: number | null;
  critical: boolean;
  irrigationActive: boolean | null;
  difficulty: string | null;
  alertHint: string | null;
  outlook: { dayOffset: number; moisturePercent: number }[];
}

function finiteOrNull(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function nutrientTone(status: unknown): RfNutrientReading["tone"] {
  const value = String(status || "").trim().toLowerCase();
  if (value === "good") return "good";
  if (value === "fair") return "fair";
  if (value === "poor") return "poor";
  return "unknown";
}

function pressureTone(value: number | null, unscouted?: boolean): RfPressureReading["tone"] {
  if (unscouted || value == null) return "unknown";
  if (value >= 20) return "poor";
  if (value >= 10) return "fair";
  return "good";
}

function urgencyTone(urgency: number): RfSoilPanelModel["urgencyTone"] {
  if (urgency >= 55) return "poor";
  if (urgency >= 30) return "fair";
  return "good";
}

function asCropLabel(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s ? s : null;
}

function normalizePriority(value: unknown): RfTreatmentPlanRow["priority"] {
  const p = String(value || "").toLowerCase();
  if (p === "urgent" || p === "watch" || p === "ok" || p === "info") return p;
  return "info";
}

function normalizeTreatmentPlan(raw: RfTreatmentStep[] | undefined): RfTreatmentPlanRow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 12)
    .map((row, index) => {
      const label = String(row?.label || "").trim();
      const text = String(row?.text || "").trim();
      if (!label && !text) return null;
      return {
        key: String(row?.key || `step-${index}`),
        label: label || "—",
        text: text || "—",
        priority: normalizePriority(row?.priority),
        hasRates: row?.hasRates === true,
      };
    })
    .filter((row): row is RfTreatmentPlanRow => row != null);
}

export function isRfSoilActive(
  info: SoilFertilizerFieldInfo | null | undefined,
): boolean {
  return Boolean(info?.enabled && !info.pfConflict);
}

/** Field urgency 0–100 (SoilFertilitySystem:getFieldUrgency), or null when unknown. */
export function rfSoilUrgency(
  info: SoilFertilizerFieldInfo | null | undefined,
): number | null {
  if (!isRfSoilActive(info)) return null;
  const value = finiteOrNull(info?.urgency);
  return value == null ? null : clamp(value, 0, 100);
}

/**
 * Fallback soil-test scaling (SoilConstants.PPM_DISPLAY). Only used for payloads
 * from a mod build that predates the `ppm` block; the mod resolves it live.
 */
const PPM_DISPLAY_FALLBACK: Record<"n" | "p" | "k", number> = {
  n: 3.0,
  p: 0.6,
  k: 4.0,
};

function phTone(ph: number | null): RfSoilBarRow["tone"] {
  if (ph == null) return "unknown";
  if (ph >= 6 && ph <= 7.5) return "good";
  if (ph >= 5.5 && ph <= 8) return "fair";
  return "poor";
}

function omTone(om: number | null): RfSoilBarRow["tone"] {
  if (om == null) return "unknown";
  if (om >= 3.5) return "good";
  if (om >= 3) return "fair";
  return "poor";
}

function buildSoilBars(
  info: SoilFertilizerFieldInfo,
  nutrients: RfNutrientReading[],
  pressures: RfPressureReading[],
  pH: number | null,
  pHTarget: number,
  organicMatter: number | null,
): RfSoilBarRow[] {
  const ppm = info.ppm || null;
  const ppmFor = (
    slot: "n" | "p" | "k",
    reading: RfNutrientReading | undefined,
  ): { value: number | null; target: number | null } => {
    const direct = finiteOrNull(ppm?.[slot]);
    const directTarget = finiteOrNull(
      ppm?.[`${slot}Target` as "nTarget" | "pTarget" | "kTarget"],
    );
    if (direct != null) return { value: direct, target: directTarget };
    if (!reading) return { value: null, target: null };
    const factor = PPM_DISPLAY_FALLBACK[slot];
    return {
      value: Math.round(reading.value * factor),
      target: Math.round(reading.target * factor),
    };
  };

  const nutrientBar = (
    key: RfNutrientKey,
    slot: "n" | "p" | "k",
  ): RfSoilBarRow => {
    const reading = nutrients.find((n) => n.key === key);
    const scaled = ppmFor(slot, reading);
    return {
      key,
      unit: "ppm",
      value: scaled.value,
      target: scaled.target,
      percent: reading?.percent ?? 0,
      tone: reading?.tone ?? "unknown",
      unscouted: false,
    };
  };

  const pressureBar = (key: RfPressureReading["key"]): RfSoilBarRow => {
    const reading = pressures.find((p) => p.key === key);
    return {
      key,
      unit: "percent",
      value: reading?.value ?? null,
      target: null,
      percent: reading?.percent ?? 0,
      tone: reading?.tone ?? "unknown",
      unscouted: reading?.unscouted === true,
      activeDisease: reading?.activeDisease ?? null,
    };
  };

  return [
    nutrientBar("nitrogen", "n"),
    nutrientBar("phosphorus", "p"),
    nutrientBar("potassium", "k"),
    {
      key: "ph",
      unit: "ph",
      value: pH,
      target: pHTarget,
      // Distance from the optimum, not an absolute scale: a full bar means on target.
      percent:
        pH == null ? 0 : clamp((1 - Math.min(1, Math.abs(pH - pHTarget) / 2)) * 100, 0, 100),
      tone: phTone(pH),
      unscouted: false,
    },
    {
      key: "organicMatter",
      unit: "om",
      value: organicMatter,
      target: null,
      percent: organicMatter == null ? 0 : clamp((organicMatter / 10) * 100, 0, 100),
      tone: omTone(organicMatter),
      unscouted: false,
    },
    pressureBar("weed"),
    pressureBar("pest"),
    pressureBar("disease"),
  ];
}

const NUTRIENT_SHORT: Record<string, string> = { n: "N", p: "P", k: "K" };

/**
 * Collapse the mod's per-item treatment rows into a headline plus reasons.
 * The rows already carry SF's own thresholds, so this only groups and phrases them.
 */
function buildPlanSummary(
  rows: RfTreatmentPlanRow[],
  isMeadow: boolean,
): RfSoilPlanSummary {
  const actionable = rows.filter((r) => r.priority === "urgent" || r.priority === "watch");
  const urgent = actionable.filter((r) => r.priority === "urgent");
  const watch = actionable.filter((r) => r.priority === "watch");
  const has = (key: string, priority?: RfTreatmentPlanRow["priority"]) =>
    rows.some((r) => r.key === key && (priority == null || r.priority === priority));

  const reasons: RfSoilPhrase[] = [];

  const lowNutrients = urgent
    .filter((r) => r.key === "n" || r.key === "p" || r.key === "k")
    .map((r) => NUTRIENT_SHORT[r.key]);
  if (lowNutrients.length > 0) {
    reasons.push({
      key: "fields.rf.soil.reasonNutrientLow",
      params: { list: lowNutrients.join("/") },
    });
  }

  const softNutrients = watch
    .filter((r) => r.key === "n" || r.key === "p" || r.key === "k")
    .map((r) => NUTRIENT_SHORT[r.key]);
  if (softNutrients.length > 0) {
    reasons.push({
      key: "fields.rf.soil.reasonNutrientBelowTarget",
      params: { list: softNutrients.join("/") },
    });
  }

  if (has("ph", "urgent")) reasons.push({ key: "fields.rf.soil.reasonPhLow" });
  else if (has("ph", "watch")) reasons.push({ key: "fields.rf.soil.reasonPhHigh" });

  if (has("om", "urgent")) reasons.push({ key: "fields.rf.soil.reasonOmLow" });
  else if (has("om", "watch")) reasons.push({ key: "fields.rf.soil.reasonOmFair" });

  const weed = has("weed", "urgent");
  const pest = has("pest", "urgent");
  if (weed && pest) reasons.push({ key: "fields.rf.soil.reasonWeedAndPest" });
  else if (weed) reasons.push({ key: "fields.rf.soil.reasonWeed" });
  else if (pest) reasons.push({ key: "fields.rf.soil.reasonPest" });

  if (has("disease", "urgent")) reasons.push({ key: "fields.rf.soil.reasonDisease" });
  if (has("burn")) reasons.push({ key: "fields.rf.soil.reasonBurnRisk" });

  const also: RfSoilPhrase[] = [];
  if (weed) also.push({ key: "fields.rf.soil.alsoHerbicide" });
  if (pest) also.push({ key: "fields.rf.soil.alsoInsecticide" });
  if (has("disease", "urgent")) also.push({ key: "fields.rf.soil.alsoFungicide" });
  if (has("disease", "info")) also.push({ key: "fields.rf.soil.alsoDiseaseUnscouted" });

  if (actionable.length === 0) {
    return {
      tone: "ok",
      title: { key: "fields.rf.soil.planClear" },
      reasons: [{ key: "fields.rf.soil.reasonClear" }],
      also,
      urgentCount: 0,
      watchCount: 0,
    };
  }

  let title: RfSoilPhrase;
  let tone: RfSoilPlanSummary["tone"];
  if (urgent.length >= 2) {
    title = { key: "fields.rf.soil.planMultiple" };
    tone = "urgent";
  } else if (urgent.length === 1) {
    title = { key: "fields.rf.soil.planSingle", params: { item: urgent[0].label } };
    tone = "urgent";
  } else {
    title = { key: "fields.rf.soil.planMinor" };
    tone = "watch";
  }

  // A grass sward tolerates lower P/K than an arable crop; say so rather than
  // implying the player is behind on fertiliser.
  if (tone === "watch" && isMeadow) {
    reasons.push({ key: "fields.rf.soil.reasonMeadowTolerant" });
  }

  return { tone, title, reasons, also, urgentCount: urgent.length, watchCount: watch.length };
}

export function buildRfSoilPanel(
  info: SoilFertilizerFieldInfo | null | undefined,
): RfSoilPanelModel | null {
  if (!isRfSoilActive(info) || !info) return null;

  const defaults = info.targetDefaults;
  const cropTargets = info.cropTargets;
  const targetN =
    finiteOrNull(cropTargets?.N?.opt) ?? finiteOrNull(defaults?.nitrogen) ?? 50;
  const targetP =
    finiteOrNull(cropTargets?.P?.opt) ?? finiteOrNull(defaults?.phosphorus) ?? 40;
  const targetK =
    finiteOrNull(cropTargets?.K?.opt) ?? finiteOrNull(defaults?.potassium) ?? 40;
  const pHTarget = finiteOrNull(defaults?.pH) ?? 6.5;
  const omTarget = finiteOrNull(defaults?.organicMatter) ?? 4;

  const nutrientSpecs: { key: RfNutrientKey; target: number }[] = [
    { key: "nitrogen", target: targetN },
    { key: "phosphorus", target: targetP },
    { key: "potassium", target: targetK },
  ];

  const nutrients = nutrientSpecs.flatMap(({ key, target }) => {
    const reading = info[key];
    const value = finiteOrNull(reading?.value);
    if (value == null) return [];
    return [
      {
        key,
        value,
        target,
        status: String(reading?.status || "unknown").toLowerCase(),
        percent: clamp((value / Math.max(target, 1)) * 100, 0, 100),
        tone: nutrientTone(reading?.status),
      },
    ];
  });

  const weed = finiteOrNull(info.weedPressure) ?? 0;
  const pest = finiteOrNull(info.pestPressure) ?? 0;
  const shownDisease = finiteOrNull(info.shownDiseasePressure);
  const diseaseUnscouted = info.shownDiseasePressure == null && !info.diseaseDiscovered;

  const pressures: RfPressureReading[] = [
    {
      key: "weed",
      value: weed,
      percent: clamp(weed, 0, 100),
      tone: pressureTone(weed),
    },
    {
      key: "pest",
      value: pest,
      percent: clamp(pest, 0, 100),
      tone: pressureTone(pest),
    },
    {
      key: "disease",
      value: shownDisease,
      unscouted: diseaseUnscouted,
      activeDisease: info.activeDisease ? String(info.activeDisease) : null,
      percent: shownDisease == null ? 0 : clamp(shownDisease, 0, 100),
      tone: pressureTone(shownDisease, diseaseUnscouted),
    },
  ];

  const urgency = clamp(finiteOrNull(info.urgency) ?? 0, 0, 100);
  const growthFraction = finiteOrNull(info.growthFraction);
  const coverageFraction = finiteOrNull(info.coverageFraction);
  const sessionCoverage = finiteOrNull(info.sessionCoverageFraction);

  const pH = finiteOrNull(info.pH);
  const organicMatter = finiteOrNull(info.organicMatter);
  const treatmentPlan = normalizeTreatmentPlan(info.treatmentPlan);
  const isMeadow = info.isMeadow === true;

  return {
    bars: buildSoilBars(info, nutrients, pressures, pH, pHTarget, organicMatter),
    plan: buildPlanSummary(treatmentPlan, isMeadow),
    nutrients,
    pressures,
    pH,
    pHTarget,
    organicMatter,
    omTarget,
    yieldEfficiency: finiteOrNull(info.yieldEfficiency),
    urgency,
    urgencyTone: urgencyTone(urgency),
    needsFertilization: info.needsFertilization === true,
    treatments: {
      herbicide: info.herbicideActive === true,
      insecticide: info.insecticideActive === true,
      fungicide: info.fungicideActive === true,
    },
    treatmentPlan,
    rotation: {
      lastCrop: asCropLabel(info.lastCrop),
      lastCrop2: asCropLabel(info.lastCrop2),
      lastCrop3: asCropLabel(info.lastCrop3),
      status: info.rotationStatus != null ? String(info.rotationStatus) : null,
      bonusDaysLeft: Math.max(0, finiteOrNull(info.rotationBonusDaysLeft) ?? 0),
    },
    compaction: finiteOrNull(info.compaction),
    simDisabled: info.simDisabled === true,
    simDisabledReason: info.simDisabledReason ? String(info.simDisabledReason) : null,
    isMeadow,
    growthFraction:
      growthFraction == null ? null : clamp(growthFraction, 0, 1),
    coverageFraction:
      coverageFraction == null ? null : clamp(coverageFraction, 0, 1),
    sessionCoverageFraction:
      sessionCoverage == null ? null : clamp(sessionCoverage, 0, 1),
    sessionLastProduct: info.sessionLastProduct
      ? String(info.sessionLastProduct)
      : null,
    amendBurnRisk: info.amendBurnRisk === true,
    burnDaysLeft: Math.max(0, finiteOrNull(info.burnDaysLeft) ?? 0),
    fieldArea: finiteOrNull(info.fieldArea),
  };
}

export function buildRfCropStressPanel(
  info: CropStressFieldInfo | null | undefined,
): RfCropStressPanelModel | null {
  if (!info?.enabled) return null;

  const outlook = (Array.isArray(info.moistureOutlook) ? info.moistureOutlook : [])
    .map((row) => ({
      dayOffset: finiteOrNull(row?.dayOffset),
      moisturePercent: finiteOrNull(row?.moisturePercent),
    }))
    .filter(
      (row): row is { dayOffset: number; moisturePercent: number } =>
        row.dayOffset != null && row.moisturePercent != null,
    )
    .slice(0, 5)
    .map((row) => ({
      dayOffset: row.dayOffset,
      moisturePercent: clamp(row.moisturePercent, 0, 100),
    }));

  return {
    moisturePercent:
      info.moisturePercent == null
        ? null
        : clamp(finiteOrNull(info.moisturePercent) ?? 0, 0, 100),
    stressPercent:
      info.stressPercent == null
        ? null
        : clamp(finiteOrNull(info.stressPercent) ?? 0, 0, 100),
    critical: info.critical === true,
    irrigationActive:
      typeof info.irrigationActive === "boolean" ? info.irrigationActive : null,
    difficulty: info.difficulty ? String(info.difficulty).toLowerCase() : null,
    alertHint: info.alertHint ? String(info.alertHint) : null,
    outlook,
  };
}
