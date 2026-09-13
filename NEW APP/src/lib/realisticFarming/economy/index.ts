/** Economy agent — Tax / Market / Fuel / Workers / Income / Workplace helpers. */

import type { RealisticFarmingPayload } from "@/types/dashboard";

export const ECONOMY_DOMAIN = "economy" as const;

export type RfTaxPayload = NonNullable<RealisticFarmingPayload["tax"]>;
export type RfTaxFarmRow = NonNullable<NonNullable<RfTaxPayload["byFarm"]>[string]>;
export type RfMarketDynamicsPayload = NonNullable<RealisticFarmingPayload["marketDynamics"]>;
export type RfFuelCostsPayload = NonNullable<RealisticFarmingPayload["fuelCosts"]>;
export type RfWorkerCostsPayload = NonNullable<RealisticFarmingPayload["workerCosts"]>;
export type RfWorkerFarmRow = NonNullable<NonNullable<RfWorkerCostsPayload["byFarm"]>[string]>;
export type RfIncomePayload = NonNullable<RealisticFarmingPayload["income"]>;
export type RfIncomeFarmRow = NonNullable<NonNullable<RfIncomePayload["byFarm"]>[string]>;
export type RfWorkplaceTriggersPayload = NonNullable<RealisticFarmingPayload["workplaceTriggers"]>;
export type RfWorkplaceFarmRow = NonNullable<
  NonNullable<RfWorkplaceTriggersPayload["byFarm"]>[string]
>;
export type RfWorkplaceRow = RfWorkplaceFarmRow["workplaces"][number];

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

export function getRealisticFarming(
  payload: { realisticFarming?: RealisticFarmingPayload | null } | null | undefined
): RealisticFarmingPayload | null {
  return payload?.realisticFarming ?? null;
}

export function isRfTaxActive(rf: RealisticFarmingPayload | null | undefined): boolean {
  return rf?.tax?.enabled === true;
}

export function isRfMarketDynamicsActive(rf: RealisticFarmingPayload | null | undefined): boolean {
  return rf?.marketDynamics?.enabled === true;
}

export function isRfFuelCostsActive(rf: RealisticFarmingPayload | null | undefined): boolean {
  return rf?.fuelCosts?.enabled === true;
}

export function isRfWorkerCostsActive(rf: RealisticFarmingPayload | null | undefined): boolean {
  return rf?.workerCosts?.enabled === true;
}

export function isRfIncomeActive(rf: RealisticFarmingPayload | null | undefined): boolean {
  return rf?.income?.enabled === true;
}

export function isRfWorkplaceTriggersActive(
  rf: RealisticFarmingPayload | null | undefined
): boolean {
  return rf?.workplaceTriggers?.enabled === true;
}

export function anyRfEconomyActive(rf: RealisticFarmingPayload | null | undefined): boolean {
  return (
    isRfTaxActive(rf) ||
    isRfMarketDynamicsActive(rf) ||
    isRfFuelCostsActive(rf) ||
    isRfWorkerCostsActive(rf) ||
    isRfIncomeActive(rf) ||
    isRfWorkplaceTriggersActive(rf)
  );
}

function farmKey(farmId: number | string | null | undefined): string {
  const n = Number(farmId);
  return Number.isFinite(n) && n > 0 ? String(n) : "1";
}

function pickFarmRow<T>(
  byFarm: Record<string, T> | null | undefined,
  farmId: number | string | null | undefined
): T | null {
  if (!byFarm || typeof byFarm !== "object") return null;
  const key = farmKey(farmId);
  if (byFarm[key] != null) return byFarm[key];
  const first = Object.values(byFarm)[0];
  return first ?? null;
}

export function getRfTaxForFarm(
  rf: RealisticFarmingPayload | null | undefined,
  farmId: number | string | null | undefined
): RfTaxFarmRow | null {
  if (!isRfTaxActive(rf)) return null;
  return pickFarmRow(rf?.tax?.byFarm, farmId);
}

export function getRfWorkerCostsForFarm(
  rf: RealisticFarmingPayload | null | undefined,
  farmId: number | string | null | undefined
): RfWorkerFarmRow | null {
  if (!isRfWorkerCostsActive(rf)) return null;
  return pickFarmRow(rf?.workerCosts?.byFarm, farmId);
}

export function getRfIncomeForFarm(
  rf: RealisticFarmingPayload | null | undefined,
  farmId: number | string | null | undefined
): RfIncomeFarmRow | null {
  if (!isRfIncomeActive(rf)) return null;
  return pickFarmRow(rf?.income?.byFarm, farmId);
}

export function getRfWorkplacesForFarm(
  rf: RealisticFarmingPayload | null | undefined,
  farmId: number | string | null | undefined
): RfWorkplaceRow[] {
  if (!isRfWorkplaceTriggersActive(rf)) return [];
  const row = pickFarmRow(rf?.workplaceTriggers?.byFarm, farmId);
  const list = row?.workplaces;
  return Array.isArray(list) ? list : [];
}

export function formatRfMoney(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function formatRfDieselPrice(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `$${n.toFixed(4)}/L`;
}

export function formatRfPct(v: unknown, digits = 1): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}%`;
}

export function fuelTrendTone(
  trend: RfFuelCostsPayload["trend"]
): "accent" | "danger" | "default" {
  if (trend === "up") return "danger";
  if (trend === "down") return "accent";
  return "default";
}

/** Normalize Lua `{}` empty-table quirks for list fields. */
export function asRfList<T>(v: T[] | unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

export function marketMovers(
  rf: RealisticFarmingPayload | null | undefined
): NonNullable<RfMarketDynamicsPayload["movers"]> {
  return asRfList(rf?.marketDynamics?.movers);
}

export function marketActiveEvents(
  rf: RealisticFarmingPayload | null | undefined
): NonNullable<RfMarketDynamicsPayload["activeEvents"]> {
  return asRfList(rf?.marketDynamics?.activeEvents);
}

export function marketFutures(
  rf: RealisticFarmingPayload | null | undefined
): NonNullable<RfMarketDynamicsPayload["futures"]> {
  return asRfList(rf?.marketDynamics?.futures);
}

/** Safe read of RF economy slice from a loose payload object. */
export function readRfEconomySlice(
  payload: unknown
): RealisticFarmingPayload | null {
  const root = asRecord(payload);
  if (!root) return null;
  const rf = asRecord(root.realisticFarming);
  return (rf as RealisticFarmingPayload | null) ?? null;
}
