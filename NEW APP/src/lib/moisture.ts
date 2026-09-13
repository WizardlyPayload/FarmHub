/** MoistureSystem helpers — grades, rot labels, environment gauge copy. */

import { t } from "@/i18n/i18n";

export function formatMoisturePercent(pct: unknown): string {
  const n = Number(pct);
  if (!Number.isFinite(n)) return "—";
  return `${n.toFixed(1)}%`;
}

export function moistureGradeLabel(grade: unknown): string {
  if (grade == null || grade === "") return "—";
  const g = String(grade).toLowerCase();
  const letterToKey: Record<string, string> = { a: "premium", b: "good", c: "average", d: "poor" };
  const slug = letterToKey[g] || g;
  const key = `moisture.grade.${slug}`;
  const out = t(key);
  return out === key ? String(grade) : out;
}

export function moistureRotLabel(rot: unknown): string {
  if (!rot) return "";
  const norm = String(rot).toLowerCase().replace(/_/g, "");
  const alias = norm === "rottingslowly" || norm === "rottingquickly" ? "rotting" : norm;
  const key = `moisture.rot.${alias}`;
  const out = t(key);
  return out === key ? String(rot) : out;
}

export function moistureRotTone(rot: unknown): "danger" | "warn" | "default" {
  const r = String(rot || "")
    .toLowerCase()
    .replace(/_/g, "");
  if (r === "rotting" || r === "rottingslowly" || r === "rottingquickly") return "danger";
  if (r === "gettingwet") return "warn";
  return "default";
}

export interface WeatherMoisture {
  enabled?: boolean;
  currentPercent?: number;
  environment?: string;
  dryingActiveCount?: number;
  baleRotEnabled?: boolean;
}

export interface MoistureEnvInfo {
  pct: string;
  environment: string;
  drying: string;
  rotOff: string;
}

export function getMoistureEnvironmentInfo(
  weather: { moisture?: WeatherMoisture } | null | undefined
): MoistureEnvInfo | null {
  const m = weather?.moisture;
  if (!m?.enabled) return null;
  return {
    pct: formatMoisturePercent(m.currentPercent),
    environment: m.environment ? String(m.environment) : "",
    drying: Number(m.dryingActiveCount) > 0 ? t("moisture.dryingActive", { count: m.dryingActiveCount! }) : "",
    rotOff: m.baleRotEnabled === false ? t("moisture.baleRotDisabled") : "",
  };
}

export interface BaleMoistureWorstRow {
  fillType?: string;
  moisturePct?: number;
  grade?: string | number;
  rotStatus?: string;
}

export interface BaleMoistureFarmRow {
  enabled?: boolean;
  gradeCounts?: Record<string, number>;
  rottingCount?: number;
  gettingWetCount?: number;
  worst?: BaleMoistureWorstRow[];
}

export function getBaleMoistureForFarm(
  baleInventory: { moisture?: { byFarm?: Record<string, BaleMoistureFarmRow> } } | null | undefined,
  farmId: number | null | undefined
): BaleMoistureFarmRow | null {
  const inv = baleInventory && typeof baleInventory === "object" ? baleInventory : {};
  const fid = String(Number(farmId) || 1);
  const farmRow = inv.moisture?.byFarm?.[fid] || inv.moisture?.byFarm?.[String(Number(fid))] || null;
  if (!farmRow || farmRow.enabled === false) return null;
  return farmRow;
}
