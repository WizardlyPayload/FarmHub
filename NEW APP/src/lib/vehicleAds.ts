/** Advanced Damage System helpers for merged vehicle rows. */

import { t } from "@/i18n/i18n";

export interface AdsBreakdownPart {
  id?: string;
  partKey?: string | null;
  stage?: number;
  stageSeverityKey?: string | null;
  isActive?: boolean;
  isVisible?: boolean;
  repairPrice?: number | null;
}

export interface AdsInspectionRow {
  statusKey?: string;
  severity?: number;
}

export interface AdsSystemRow {
  condition?: number;
  stress?: number;
}

export interface AdsData {
  enabled?: boolean;
  condition?: number;
  inspectedCondition?: number | null;
  serviceLevel?: number;
  inspectedService?: number | null;
  intervalRatio?: number | null;
  inService?: boolean;
  state?: string | null;
  breakdownCount?: number;
  breakdowns?: string[];
  breakdownParts?: AdsBreakdownPart[];
  systems?: Record<string, AdsSystemRow>;
  inspection?: Record<string, AdsInspectionRow>;
  inspectionNotes?: string[];
  realOperatingHours?: number | null;
  hoursSinceMaintenance?: number | null;
  maintenanceInterval?: number | null;
  maintainability?: number | null;
  ageMonths?: number | null;
  sellValue?: number | null;
  purchaseValue?: number | null;
  lastMaintenanceDate?: { year?: number; month?: number } | null;
  lastInspectionDate?: { year?: number; month?: number } | null;
  year?: number | null;
  reliability?: number | null;
  engineTemp?: number | null;
  transTemp?: number | null;
  batterySoc?: number | null;
  radiatorClogging?: number | null;
  airIntakeClogging?: number | null;
  lubricationLevel?: number | null;
  maintenanceSpend?: number | null;
}

export interface AdsVehicle {
  ads?: AdsData | null;
  damage?: number | null;
}

export function vehicleHasAds(vehicle: AdsVehicle | null | undefined): boolean {
  return Boolean(vehicle?.ads?.enabled);
}

/** 0–1 condition (1 = excellent). ADS condition or inverse of vanilla damage. */
export function getVehicleConditionFraction(vehicle: AdsVehicle | null | undefined): number {
  if (vehicleHasAds(vehicle) && Number.isFinite(Number(vehicle?.ads?.condition))) {
    return Math.min(1, Math.max(0, Number(vehicle!.ads!.condition)));
  }
  const damage = Number(vehicle?.damage);
  if (!Number.isFinite(damage)) return 1;
  return Math.min(1, Math.max(0, 1 - damage));
}

/** 0–1 wear/damage for filters (inverse of condition). */
export function getVehicleDamageFraction(vehicle: AdsVehicle | null | undefined): number {
  return 1 - getVehicleConditionFraction(vehicle);
}

export function isVehicleHighWear(vehicle: AdsVehicle | null | undefined): boolean {
  return getVehicleDamageFraction(vehicle) > 0.2;
}

export function getAdsIntervalRatio(vehicle: AdsVehicle | null | undefined): number | null {
  const ratio = Number(vehicle?.ads?.intervalRatio);
  return Number.isFinite(ratio) ? ratio : null;
}

export function isVehicleAdsOverdue(vehicle: AdsVehicle | null | undefined): boolean {
  const ratio = getAdsIntervalRatio(vehicle);
  return ratio != null && ratio > 1;
}

export function getAdsBreakdownParts(vehicle: AdsVehicle | null | undefined): AdsBreakdownPart[] {
  const list = vehicle?.ads?.breakdownParts;
  if (Array.isArray(list) && list.length > 0) {
    return list.filter((p) => p.isVisible !== false);
  }
  const ids = vehicle?.ads?.breakdowns;
  if (Array.isArray(ids) && ids.length > 0) {
    return ids.map((id) => ({
      id: String(id),
      partKey: null,
      stage: 0,
      isActive: true,
      isVisible: true,
      repairPrice: null,
    }));
  }
  return [];
}

export function countActiveAdsBreakdowns(vehicle: AdsVehicle | null | undefined): number {
  const parts = getAdsBreakdownParts(vehicle);
  if (parts.length > 0) return parts.length;
  const n = Number(vehicle?.ads?.breakdownCount);
  return Number.isFinite(n) ? n : 0;
}

export function hasVisibleAdsBreakdowns(vehicle: AdsVehicle | null | undefined): boolean {
  return getAdsBreakdownParts(vehicle).length > 0;
}

export function isVehicleInAdsService(vehicle: AdsVehicle | null | undefined): boolean {
  return Boolean(vehicle?.ads?.inService);
}

export function formatAdsStateLabel(state: string | null | undefined): string {
  if (!state || typeof state !== "string") return "";
  const localized = t(state);
  if (localized && localized !== state) return localized;
  return state.replace(/^ads_spec_state_/, "").replace(/_/g, " ");
}

/** ADS system key ("engine") → localized name via the mod's own l10n keys. */
export function formatAdsSystemLabel(systemKey: string | null | undefined): string {
  if (!systemKey || typeof systemKey !== "string") return "";
  const adsKey = systemKey.startsWith("ads_spec_system_")
    ? systemKey
    : `ads_spec_system_${systemKey}`;
  const localized = t(adsKey);
  if (localized && localized !== adsKey) return localized;
  return systemKey.replace(/^ads_spec_system_/, "").replace(/_/g, " ");
}

/** Canonical ADS system order from the mod export (8 systems). */
export const ADS_SYSTEM_ORDER = [
  "engine",
  "transmission",
  "hydraulics",
  "cooling",
  "electrical",
  "chassis",
  "workprocess",
  "fuel",
] as const;

export type AdsSystemKey = (typeof ADS_SYSTEM_ORDER)[number];

/** All 8 systems in export order, including missing rows (condition/stress null). */
export function getAdsSystemsOrdered(
  vehicle: AdsVehicle | null | undefined
): Array<{ key: string; condition: number | null; stress: number | null }> {
  const systems = vehicle?.ads?.systems;
  if (!systems || typeof systems !== "object") return [];
  const seen = new Set<string>();
  const rows: Array<{ key: string; condition: number | null; stress: number | null }> = [];
  for (const key of ADS_SYSTEM_ORDER) {
    seen.add(key);
    const row = systems[key];
    const condition = Number(row?.condition);
    const stress = Number(row?.stress);
    rows.push({
      key,
      condition: Number.isFinite(condition) ? condition : null,
      stress: Number.isFinite(stress) ? stress : null,
    });
  }
  for (const [key, row] of Object.entries(systems)) {
    if (seen.has(key)) continue;
    const condition = Number(row?.condition);
    const stress = Number(row?.stress);
    rows.push({
      key,
      condition: Number.isFinite(condition) ? condition : null,
      stress: Number.isFinite(stress) ? stress : null,
    });
  }
  return rows;
}

export function getWorstAdsSystems(
  vehicle: AdsVehicle | null | undefined,
  limit = 3
): Array<{ key: string; condition: number; stress: number }> {
  return getAdsSystemsOrdered(vehicle)
    .filter((row) => row.condition != null && Number.isFinite(row.condition))
    .map((row) => ({
      key: row.key,
      condition: row.condition as number,
      stress: row.stress ?? 0,
    }))
    .sort((a, b) => a.condition - b.condition)
    .slice(0, limit);
}

/** Format a 0–1 ADS fraction as a percent label. */
export function formatAdsPercent(value: number | null | undefined): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return t("vehicles.adsPercent", { pct: Math.round(n * 100) });
}

/** Format ADS temperature (Celsius from mod export). */
export function formatAdsTempC(value: number | null | undefined): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return t("vehicles.adsTempC", { temp: Math.round(n) });
}

export function summarizeAdsFleet(vehicles: AdsVehicle[] | null | undefined) {
  const list = Array.isArray(vehicles) ? vehicles : [];
  const summary = {
    enabled: false,
    vehicleCount: 0,
    inServiceCount: 0,
    breakdownVehicleCount: 0,
    overdueMaintenanceCount: 0,
    needsRepairCount: 0,
  };
  for (const v of list) {
    if (!vehicleHasAds(v)) continue;
    summary.enabled = true;
    summary.vehicleCount += 1;
    if (isVehicleInAdsService(v)) summary.inServiceCount += 1;
    if (hasVisibleAdsBreakdowns(v) || countActiveAdsBreakdowns(v) > 0) {
      summary.breakdownVehicleCount += 1;
    }
    if (isVehicleAdsOverdue(v)) summary.overdueMaintenanceCount += 1;
    if (vehicleNeedsAdsWarning(v)) summary.needsRepairCount += 1;
  }
  return summary;
}

export function formatIntervalRatioPercent(ratio: number | null | undefined): string {
  if (!Number.isFinite(ratio as number)) return "—";
  return `${Math.round((ratio as number) * 100)}%`;
}

/** Qualitative ADS service label from 0–1 service level. */
export function formatAdsServiceLabel(service: number | null | undefined): string {
  const s = Number(service);
  if (!Number.isFinite(s)) return "—";
  const consumed = 1 - s;
  if (consumed > 0.55) return t("vehicles.adsStateOverdue");
  if (consumed > 0.45) return t("vehicles.adsStateRequired");
  if (consumed > 0.35) return t("vehicles.adsStateRecommended");
  if (consumed > 0.1) return t("vehicles.adsStateGood");
  return t("vehicles.adsStateOptimal");
}

/** Qualitative ADS condition label from 0–1 condition. */
export function formatAdsConditionLabel(condition: number | null | undefined): string {
  const c = Number(condition);
  if (!Number.isFinite(c)) return "—";
  const damage = 1 - c;
  if (damage > 0.8) return t("vehicles.adsStateTerrible");
  if (damage > 0.6) return t("vehicles.adsStateBad");
  if (damage > 0.4) return t("vehicles.adsStateNormal");
  if (damage > 0.2) return t("vehicles.adsStateGood");
  return t("vehicles.adsStateExcellent");
}

export function formatAdsMaintainabilityLabel(value: number | null | undefined): string {
  const v = Number(value);
  if (!Number.isFinite(v)) return "—";
  if (v < 1.0) return t("vehicles.adsMaintLow");
  if (v < 1.1) return t("vehicles.adsMaintAverage");
  if (v < 1.2) return t("vehicles.adsMaintHigh");
  return t("vehicles.adsMaintWorkhorse");
}

export const ADS_INSPECTION_FIELD_I18N: Record<string, string> = {
  engineOil: "vehicles.adsInspEngineOil",
  coolant: "vehicles.adsInspCoolant",
  hydraulicFluid: "vehicles.adsInspHydraulicFluid",
  transmissionOil: "vehicles.adsInspTransmissionOil",
  radiator: "vehicles.adsInspRadiator",
  airIntake: "vehicles.adsInspAirIntake",
  airFilter: "vehicles.adsInspAirFilter",
  lubrication: "vehicles.adsInspLubrication",
};

const ADS_INSPECTION_STATUS_I18N: Record<string, string> = {
  ads_inspection_ok: "vehicles.adsInspStatusOk",
  ads_inspection_status_not_required: "vehicles.adsInspStatusNotRequired",
  ads_inspection_status_slightly_low: "vehicles.adsInspStatusSlightlyLow",
  ads_inspection_status_slightly_darkened: "vehicles.adsInspStatusSlightlyDarkened",
  ads_inspection_status_slight_moisture: "vehicles.adsInspStatusSlightMoisture",
  ads_inspection_status_slightly_dirty: "vehicles.adsInspStatusSlightlyDirty",
  ads_inspection_status_slightly_dry: "vehicles.adsInspStatusSlightlyDry",
  ads_inspection_status_low: "vehicles.adsInspStatusLow",
  ads_inspection_status_darkened: "vehicles.adsInspStatusDarkened",
  ads_inspection_status_seepage: "vehicles.adsInspStatusSeepage",
  ads_inspection_status_dirty: "vehicles.adsInspStatusDirty",
  ads_inspection_status_dry: "vehicles.adsInspStatusDry",
  ads_inspection_status_very_low: "vehicles.adsInspStatusVeryLow",
  ads_inspection_status_contaminated: "vehicles.adsInspStatusContaminated",
  ads_inspection_status_active_leak: "vehicles.adsInspStatusActiveLeak",
  ads_inspection_status_heavily_clogged: "vehicles.adsInspStatusHeavilyClogged",
  ads_inspection_status_very_dry: "vehicles.adsInspStatusVeryDry",
  ads_inspection_status_critically_low: "vehicles.adsInspStatusCriticallyLow",
  ads_inspection_status_critical_condition: "vehicles.adsInspStatusCriticalCondition",
  ads_inspection_status_severe_leak: "vehicles.adsInspStatusSevereLeak",
  ads_inspection_status_critically_clogged: "vehicles.adsInspStatusCriticallyClogged",
  ads_inspection_status_critically_dry: "vehicles.adsInspStatusCriticallyDry",
};

export function translateAdsInspectionStatus(statusKey: string | null | undefined): string {
  if (!statusKey) return "—";
  const i18nKey = ADS_INSPECTION_STATUS_I18N[statusKey];
  if (i18nKey) return t(i18nKey);
  return statusKey.replace(/^ads_inspection_/, "").replace(/_/g, " ");
}

export function translateAdsNoteKey(noteKey: string | null | undefined): string {
  if (!noteKey) return "";
  const localized = t(String(noteKey));
  if (localized && localized !== noteKey) return localized;
  return translateAdsInspectionStatus(noteKey);
}

export function getAdsInspectionSeverity(row: AdsInspectionRow | null | undefined): number {
  const n = Number(row?.severity);
  if (Number.isFinite(n)) return n;
  const key = row?.statusKey;
  if (key === "ads_inspection_ok" || key === "ads_inspection_status_not_required") {
    return 0;
  }
  if (key && key.includes("critical")) return 4;
  if (key && (key.includes("very_") || key.includes("heavily") || key.includes("active_leak"))) {
    return 3;
  }
  if (key && (key.includes("low") || key.includes("dirty") || key.includes("dry") || key.includes("dark"))) {
    return 2;
  }
  if (key && key.includes("slightly")) return 1;
  return 0;
}

export function getWorstAdsInspectionSeverity(vehicle: AdsVehicle | null | undefined): number {
  const inspection = vehicle?.ads?.inspection;
  if (!inspection || typeof inspection !== "object") return 0;
  let worst = 0;
  for (const row of Object.values(inspection)) {
    worst = Math.max(worst, getAdsInspectionSeverity(row));
  }
  return worst;
}

export function vehicleNeedsAdsWarning(vehicle: AdsVehicle | null | undefined): boolean {
  if (!vehicleHasAds(vehicle)) return false;
  if (hasVisibleAdsBreakdowns(vehicle)) return true;
  if (countActiveAdsBreakdowns(vehicle) > 0) return true;
  if (isVehicleAdsOverdue(vehicle)) return true;
  if (getWorstAdsInspectionSeverity(vehicle) >= 2) return true;
  return false;
}

/** ADS warnings, or high vanilla wear when ADS is not active on the vehicle. */
export function isVehicleInNeedOfRepair(vehicle: AdsVehicle | null | undefined): boolean {
  if (vehicleHasAds(vehicle)) return vehicleNeedsAdsWarning(vehicle);
  return isVehicleHighWear(vehicle);
}

export function formatAdsDateLabel(dateValue: { year?: number; month?: number } | null | undefined): string {
  if (!dateValue || typeof dateValue !== "object") return t("vehicles.adsDateNever");
  const year = Number(dateValue.year);
  const month = Number(dateValue.month);
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return t("vehicles.adsDateNever");
  }
  return t("vehicles.adsDateMonthYear", { month, year });
}

export function formatAdsMoney(value: number | null | undefined): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "GBP",
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return String(Math.round(n));
  }
}

function humanizeAdsKey(key: string): string {
  return String(key)
    .replace(/^ads_breakdowns_part_/, "")
    .replace(/^ads_breakdowns_severity_/, "")
    .replace(/^ads_spec_system_/, "")
    .replace(/^ads_/, "")
    .replace(/_/g, " ");
}

export function translateAdsPartKey(partKey: string | null | undefined, fallbackId?: string | null): string {
  if (partKey && typeof partKey === "string") {
    const localized = t(partKey);
    if (localized && localized !== partKey) return localized;
    if (partKey.startsWith("ads_")) return humanizeAdsKey(partKey);
  }
  if (fallbackId) {
    return humanizeAdsKey(String(fallbackId));
  }
  return "—";
}

const ADS_STAGE_SEVERITY_I18N: Record<string, string> = {
  ads_breakdowns_severity_minor: "vehicles.adsStageMinor",
  ads_breakdowns_severity_moderate: "vehicles.adsStageModerate",
  ads_breakdowns_severity_major: "vehicles.adsStageMajor",
  ads_breakdowns_severity_critical: "vehicles.adsStageCritical",
  ads_breakdowns_severity_permanent: "vehicles.adsStagePermanent",
  ads_breakdowns_quick_fix_stage: "vehicles.adsStageQuickFix",
  ads_breakdowns_defected_parts_stage: "vehicles.adsStageDefectiveParts",
};

export function translateAdsStageSeverity(
  stageSeverityKey: string | null | undefined,
  stageNum?: number | null
): string {
  if (stageSeverityKey) {
    const localized = t(String(stageSeverityKey));
    if (localized && localized !== stageSeverityKey) return localized;
    const mapped = ADS_STAGE_SEVERITY_I18N[String(stageSeverityKey)];
    if (mapped) return t(mapped);
    if (String(stageSeverityKey).startsWith("ads_")) {
      return humanizeAdsKey(stageSeverityKey);
    }
    return String(stageSeverityKey).replace(/^ads_/, "").replace(/_/g, " ");
  }
  const stage = Number(stageNum);
  if (!Number.isFinite(stage) || stage <= 0) return "—";
  if (stage >= 4) return t("vehicles.adsStageMajor");
  if (stage >= 3) return t("vehicles.adsStageModerate");
  return t("vehicles.adsStageMinor");
}

export const ADS_INSPECTION_ORDER = [
  "engineOil",
  "coolant",
  "hydraulicFluid",
  "transmissionOil",
  "radiator",
  "airIntake",
  "airFilter",
  "lubrication",
] as const;

export function adsSeverityTone(severity: number): "default" | "accent" | "warn" | "danger" {
  if (severity >= 4) return "danger";
  if (severity >= 2) return "warn";
  if (severity >= 1) return "warn";
  return "accent";
}
