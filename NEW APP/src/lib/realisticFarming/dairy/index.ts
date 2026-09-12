/** Dairy Core helpers — Realistic Farming → Farm Dashboard. */

import type { RealisticFarmingPayload } from "@/types/dashboard";

export const DAIRY_DOMAIN = "dairy" as const;

export type RfDairyBarn = NonNullable<
  NonNullable<RealisticFarmingPayload["dairy"]>["byFarm"]
>[string]["barns"][number];

export type RfDairyPayload = NonNullable<RealisticFarmingPayload["dairy"]>;

export function isDairyCoreActive(
  dairy: RealisticFarmingPayload["dairy"] | null | undefined,
): boolean {
  return dairy?.enabled === true;
}

export function dairyBarnsForFarm(
  dairy: RealisticFarmingPayload["dairy"] | null | undefined,
  farmId: number | string,
): RfDairyBarn[] {
  if (!isDairyCoreActive(dairy) || !dairy?.byFarm) return [];
  const key = String(farmId);
  const direct = dairy.byFarm[key]?.barns;
  if (Array.isArray(direct)) return direct;
  // Soft fallback: some hosts stringify inconsistently
  for (const [k, row] of Object.entries(dairy.byFarm)) {
    if (Number(k) === Number(farmId) && Array.isArray(row?.barns)) {
      return row.barns;
    }
  }
  return [];
}

export function dairyHealthTone(
  score: number | undefined,
): "default" | "accent" | "warn" | "danger" {
  const n = Number(score);
  if (!Number.isFinite(n)) return "default";
  if (n >= 85) return "accent";
  if (n >= 60) return "default";
  if (n >= 35) return "warn";
  return "danger";
}

export function dairySpoilageTone(
  status: string | undefined,
): "default" | "accent" | "warn" | "danger" {
  const s = String(status || "").toLowerCase();
  if (s === "fresh") return "accent";
  if (s === "ageing" || s === "aging") return "warn";
  if (s.includes("risk") || s === "condemned") return "danger";
  return "default";
}

export function dairyQualityTone(
  tier: string | undefined,
): "default" | "accent" | "warn" | "danger" {
  const t = String(tier || "").toLowerCase();
  if (t === "premium") return "accent";
  if (t === "standard") return "default";
  if (t === "reduced") return "warn";
  if (t === "poor") return "danger";
  return "default";
}

export function shortBarnLabel(barnId: string): string {
  const raw = String(barnId || "");
  if (raw.length <= 12) return raw;
  return `${raw.slice(0, 6)}…${raw.slice(-4)}`;
}
