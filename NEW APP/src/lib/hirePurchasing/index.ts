/** FS25_HirePurchasing — lease/hire-purchase deal helpers. */

export interface HirePurchasingDeal {
  id?: string;
  farmId?: number;
  vehicleUniqueId?: string;
  vehicleName?: string;
  vehicle?: string;
  baseCost?: number;
  deposit?: number;
  durationMonths?: number;
  monthsPaid?: number;
  monthsLeft?: number;
  finalFee?: number;
  monthlyPayment?: number;
  remainingCost?: number;
  settlementCost?: number;
  totalCost?: number;
  interestRate?: number;
  [key: string]: unknown;
}

export interface HirePurchasingFarmSummary {
  dealCount?: number;
  totalMonthly?: number;
  totalRemaining?: number;
  totalSettlement?: number;
  [key: string]: unknown;
}

export interface HirePurchasingFarmRow {
  summary?: HirePurchasingFarmSummary;
  deals?: HirePurchasingDeal[];
  dealCount?: number;
  totalMonthly?: number;
  totalRemaining?: number;
  totalSettlement?: number;
  [key: string]: unknown;
}

export interface HirePurchasingPayload {
  enabled?: boolean;
  byFarm?: Record<string, HirePurchasingFarmRow>;
  deals?: HirePurchasingDeal[];
  [key: string]: unknown;
}

/** Lua empty tables serialize as `{}` — never treat them as arrays. */
export function asArray<T>(x: T[] | unknown): T[] {
  return Array.isArray(x) ? x : [];
}

export function formatMoney(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function isHirePurchasingModActive(
  payload: HirePurchasingPayload | null | undefined
): boolean {
  return !!(payload && payload.enabled === true);
}

export function normalizeHirePurchasingFarm(
  farm: HirePurchasingFarmRow | null | undefined
): HirePurchasingFarmRow | null {
  if (!farm || typeof farm !== "object") return null;
  const deals = asArray<HirePurchasingDeal>(farm.deals);
  const summary: HirePurchasingFarmSummary = {
    ...(farm.summary && typeof farm.summary === "object" ? farm.summary : {}),
    dealCount:
      farm.summary?.dealCount ?? farm.dealCount ?? deals.length,
    totalMonthly: farm.summary?.totalMonthly ?? farm.totalMonthly,
    totalRemaining: farm.summary?.totalRemaining ?? farm.totalRemaining,
    totalSettlement: farm.summary?.totalSettlement ?? farm.totalSettlement,
  };
  return {
    ...farm,
    deals,
    summary,
  };
}

export function getHirePurchasingForActiveFarm(
  hirePurchasing: HirePurchasingPayload | null | undefined,
  farmId: number | null | undefined
): HirePurchasingFarmRow | null {
  if (!isHirePurchasingModActive(hirePurchasing)) return null;
  const fid = String(Number(farmId) || 1);
  const raw =
    hirePurchasing!.byFarm?.[fid] ||
    hirePurchasing!.byFarm?.[String(Number(fid))] ||
    null;
  if (raw) return normalizeHirePurchasingFarm(raw);

  // Fallback: top-level deals list filtered by farm (older/flat export shapes).
  const all = asArray<HirePurchasingDeal>(hirePurchasing!.deals);
  if (!all.length) return normalizeHirePurchasingFarm({ deals: [] });
  const deals = all.filter((d) => Number(d.farmId) === Number(fid));
  return normalizeHirePurchasingFarm({ deals });
}

export function dealVehicleLabel(deal: HirePurchasingDeal): string {
  const name = deal.vehicleName || deal.vehicle;
  if (name != null && String(name).trim()) return String(name).trim();
  if (deal.vehicleUniqueId) return String(deal.vehicleUniqueId);
  return "—";
}

export function dealMonthsLeft(deal: HirePurchasingDeal): number | null {
  if (deal.monthsLeft != null && Number.isFinite(Number(deal.monthsLeft))) {
    return Math.max(0, Math.floor(Number(deal.monthsLeft)));
  }
  const duration = Number(deal.durationMonths);
  const paid = Number(deal.monthsPaid);
  if (Number.isFinite(duration) && Number.isFinite(paid)) {
    return Math.max(0, Math.floor(duration - paid));
  }
  return null;
}

export function formatMonthsLeft(deal: HirePurchasingDeal): string {
  const n = dealMonthsLeft(deal);
  return n == null ? "—" : String(n);
}
