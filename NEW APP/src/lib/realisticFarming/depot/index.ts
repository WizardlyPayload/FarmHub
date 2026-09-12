/** Fertilizer Depot helpers — Realistic Farming → Farm Dashboard. */

import type { RealisticFarmingPayload } from "@/types/dashboard";

export const DEPOT_DOMAIN = "depot" as const;

export type RfDepotRow = NonNullable<
  NonNullable<RealisticFarmingPayload["fertilizerDepot"]>["depots"]
>[number];

export type RfDepotOrder = NonNullable<
  NonNullable<RealisticFarmingPayload["fertilizerDepot"]>["openOrders"]
>[number];

export type RfFertilizerDepotPayload = NonNullable<
  RealisticFarmingPayload["fertilizerDepot"]
>;

export function isFertilizerDepotActive(
  depot: RealisticFarmingPayload["fertilizerDepot"] | null | undefined,
): boolean {
  return depot?.enabled === true;
}

export function fertilizerDepotSettings(
  depot: RealisticFarmingPayload["fertilizerDepot"] | null | undefined,
): NonNullable<RfFertilizerDepotPayload["settings"]> | null {
  if (!isFertilizerDepotActive(depot)) return null;
  return depot?.settings ?? null;
}

export function fertilizerDepotSeasonHint(
  depot: RealisticFarmingPayload["fertilizerDepot"] | null | undefined,
): string | null {
  if (!isFertilizerDepotActive(depot)) return null;
  if (depot?.seasonalPriceHint) return depot.seasonalPriceHint;
  const fromRow = fertilizerDepots(depot).find((d) => d.seasonalPriceHint)?.seasonalPriceHint;
  return fromRow || null;
}

export function fertilizerDepots(
  depot: RealisticFarmingPayload["fertilizerDepot"] | null | undefined,
): RfDepotRow[] {
  if (!isFertilizerDepotActive(depot)) return [];
  return Array.isArray(depot?.depots) ? depot!.depots! : [];
}

export function fertilizerDepotOrders(
  depot: RealisticFarmingPayload["fertilizerDepot"] | null | undefined,
): RfDepotOrder[] {
  if (!isFertilizerDepotActive(depot)) return [];
  return Array.isArray(depot?.openOrders) ? depot!.openOrders! : [];
}

export function depotFillPercent(liters: number, capacity?: number): number | null {
  const cap = Number(capacity);
  const L = Number(liters);
  if (!Number.isFinite(cap) || cap <= 0 || !Number.isFinite(L)) return null;
  return Math.max(0, Math.min(100, (L / cap) * 100));
}

export function formatDepotLiters(liters: number): string {
  const n = Number(liters);
  if (!Number.isFinite(n)) return "0";
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(Math.round(n));
}

/** Levels with stock first; empty rows capped for UI. */
export function depotLevelsForDisplay(
  depot: RfDepotRow,
  maxRows = 12,
): RfDepotRow["levels"] {
  const levels = Array.isArray(depot.levels) ? [...depot.levels] : [];
  levels.sort((a, b) => {
    const d = (b.liters || 0) - (a.liters || 0);
    if (d !== 0) return d;
    return String(a.fillType).localeCompare(String(b.fillType));
  });
  const withStock = levels.filter((l) => (l.liters || 0) > 0);
  if (withStock.length > 0) return withStock.slice(0, maxRows);
  return levels.slice(0, Math.min(maxRows, 6));
}

export function humanizeFillType(name: string): string {
  return String(name || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
