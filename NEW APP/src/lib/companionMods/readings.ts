/** Preserve an explicit store default, but never manufacture farm 1 from missing selection. */
export function selectedCompanionFarmId(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !/^\d+$/.test(value.trim())) return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

type LoanRow = {
  amount?: number;
  restAmount?: number;
  interest?: number | null;
  durationYears?: number;
  restMonths?: number;
  monthlyAnnuity?: number | null;
};

type LoansFarm = {
  count?: number;
  restAmount?: number;
  monthlyAnnuity?: number | null;
  loans?: LoanRow[];
};

type ReadingsPayload = {
  loans?: {
    enabled?: boolean;
    readState?: string;
    coverage?: string;
    restAmount?: number;
    loanCount?: number;
    byFarm?: Record<string, LoansFarm>;
  };
  restrictedPeriods?: {
    enabled?: boolean;
    readState?: string;
    anyActive?: boolean;
    liquidBan?: string | null;
    solidBan?: string | null;
  };
  cropCalendar?: {
    enabled?: boolean;
    readState?: string;
    selectedRegion?: string | null;
  };
};

function isCurrentRead(readState: string | undefined): boolean {
  return readState === "ok";
}

function finiteNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

export function companionLoansForFarm(
  payload: ReadingsPayload | null | undefined,
  farmId: number | null,
): LoansFarm | null {
  if (selectedCompanionFarmId(farmId) == null) return null;
  const byFarm = payload?.loans?.byFarm;
  if (!byFarm || typeof byFarm !== "object") return null;
  const row = byFarm[String(farmId)] || byFarm[String(Number(farmId))] || null;
  return row && typeof row === "object" ? row : null;
}

export type LoanFarmView =
  | { status: "unavailable" }
  | {
      status: "ok";
      restAmount: number;
      count: number;
      monthlyAnnuity: number | null;
      loans: LoanRow[];
    };

/** Selected-farm loans. Missing coverage is unavailable, never another farm's total. */
export function loanFarmView(
  payload: ReadingsPayload | null | undefined,
  farmId: number | null,
): LoanFarmView {
  if (selectedCompanionFarmId(farmId) == null) return { status: "unavailable" };
  const loans = payload?.loans;
  if (!loans?.enabled || !isCurrentRead(loans.readState)) return { status: "unavailable" };
  const farm = companionLoansForFarm(payload, farmId);
  if (farm) {
    const rest = finiteNumber(farm.restAmount);
    const count = finiteNumber(farm.count);
    if (rest == null || count == null) return { status: "unavailable" };
    const annuity = farm.monthlyAnnuity;
    return {
      status: "ok",
      restAmount: rest,
      count,
      monthlyAnnuity: annuity == null ? null : finiteNumber(annuity),
      loans: Array.isArray(farm.loans) ? farm.loans : [],
    };
  }
  if (loans.coverage === "complete") {
    return { status: "ok", restAmount: 0, count: 0, monthlyAnnuity: null, loans: [] };
  }
  return { status: "unavailable" };
}

export function overviewOutstanding(
  payload: ReadingsPayload | null | undefined,
  farmId: number | null,
): number | null {
  const view = loanFarmView(payload, farmId);
  return view.status === "ok" ? view.restAmount : null;
}

export function restrictionAdvice(
  block: ReadingsPayload["restrictedPeriods"] | null | undefined,
): "banned" | "allowed" | "unavailable" {
  if (!block?.enabled || !isCurrentRead(block.readState)) return "unavailable";
  if (typeof block.anyActive !== "boolean") return "unavailable";
  return block.anyActive ? "banned" : "allowed";
}

export function cropRegionView(
  block: ReadingsPayload["cropCalendar"] | null | undefined,
): { status: "unavailable" } | { status: "ok"; region: string } {
  if (!block?.enabled || !isCurrentRead(block.readState)) return { status: "unavailable" };
  if (typeof block.selectedRegion !== "string" || block.selectedRegion.trim() === "") {
    return { status: "unavailable" };
  }
  return { status: "ok", region: block.selectedRegion };
}
