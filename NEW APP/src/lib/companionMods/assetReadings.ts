/**
 * Shared contract for the asset companion readings (maintenance, silo compartments, pallet condition, seasonal milk).
 * Fleet, storage, pastures and the companion page all read these through the same selectors.
 */

export type CompanionReadState = "ok" | "empty" | "partial" | "pending" | "failed" | "unavailable";
export type CompanionCoverage = "complete" | "partial" | "truncated" | "unsupported";

export type CompanionReadEnvelope = {
  enabled?: boolean;
  source?: string;
  readState?: CompanionReadState | string;
  coverage?: CompanionCoverage | string;
  scope?: "farm" | "global" | "save" | string;
  farmId?: number | null;
  reason?: string;
  pinnedVersion?: string;
};

export type AdvancedMaintenanceMachine = { id?: string; name?: string; startBlocked?: boolean };
export type AdvancedMaintenanceReading = CompanionReadEnvelope & { machines?: AdvancedMaintenanceMachine[] };

export type ExtendedMaintenanceMachine = {
  id?: string;
  name?: string;
  hoursPool?: number | null;
  serviceActive?: boolean;
  serviceRemainingMs?: number | null;
  failureType?: string | null;
  failureSeverity?: number | null;
};
export type ExtendedMaintenanceReading = CompanionReadEnvelope & { machines?: ExtendedMaintenanceMachine[] };

export type VehicleServiceMachine = {
  id?: string;
  name?: string;
  condition?: number | null;
  serviceSoon?: boolean;
  warmupMs?: number | null;
  keyInserted?: boolean;
  immobilizerArmed?: boolean;
  faults?: string[];
};
export type VehicleServiceReading = CompanionReadEnvelope & { machines?: VehicleServiceMachine[] };

export type RealSiloSlot = {
  index?: number | null;
  fillType?: number | null;
  fillLevel?: number | null;
  capacity?: number | null;
  isActive?: boolean;
};
export type RealSiloRow = {
  id?: string;
  ownerFarmId?: number | null;
  name?: string;
  compartments?: number | null;
  capacityEach?: number | null;
  activeSlot?: number | null;
  transferState?: "none" | "active" | "failed" | string;
  transfer?: { fromSlot?: number | null; toSlot?: number | null; rate?: number | null; active?: boolean } | null;
  slots?: RealSiloSlot[];
};
export type RealSiloReading = CompanionReadEnvelope & { silos?: RealSiloRow[] };

export type PalletConditionRow = {
  id?: string;
  ownerFarmId?: number | null;
  condition?: number | null;
  tempDamage?: number | null;
  permDamage?: number | null;
  wear?: number | null;
  outside?: boolean;
  mirrored?: boolean;
};
export type PalletConditionReading = CompanionReadEnvelope & { pallets?: PalletConditionRow[] };

export type SeasonalMilkReading = CompanionReadEnvelope & {
  seasonFactor?: number | null;
  period?: number | null;
  nextPeakPeriod?: number | null;
  cowsEnabled?: boolean;
};

export type AssetStatus = "ok" | "empty" | "pending" | "failed" | "unavailable" | "no-farm" | "disabled" | "other-farm" | "unknown";

export type AssetReading<T> = {
  status: AssetStatus;
  rows: T[];
  /** Coverage of an ok/empty reading; anything but "complete" means counts may be low. */
  coverage: CompanionCoverage | "unknown";
};

const STATES = new Set(["ok", "empty", "partial", "pending", "failed", "unavailable"]);
const COVERAGE = new Set(["complete", "partial", "truncated", "unsupported"]);

export function isFarmId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function list<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/**
 * Private readings need the block's own positive farm id to equal the selected farm.
 * Global readings (seasonal milk) are map-wide and carry no farm id.
 */
export function assetStatus(
  block: CompanionReadEnvelope | null | undefined,
  selectedFarmId: number,
  scope: "farm" | "global",
): AssetStatus {
  if (!block || typeof block !== "object") return "unavailable";
  if (block.enabled === false) return "disabled";
  const state = String(block.readState ?? "");
  if (!STATES.has(state)) return "unknown";
  if (state === "failed" || state === "pending") return state;
  if (state === "unavailable") return block.reason === "no-farm" ? "no-farm" : "unavailable";
  if (scope === "farm") {
    if (!isFarmId(block.farmId) || !isFarmId(selectedFarmId)) return "no-farm";
    if (block.farmId !== selectedFarmId) return "other-farm";
  }
  return state === "empty" ? "empty" : "ok";
}

export function assetRows<T>(
  block: (CompanionReadEnvelope & Record<string, unknown>) | null | undefined,
  selectedFarmId: number,
  scope: "farm" | "global",
  key: string,
): AssetReading<T> {
  const status = assetStatus(block, selectedFarmId, scope);
  const declaredCoverage = block && COVERAGE.has(String(block.coverage)) ? (block.coverage as CompanionCoverage) : "unknown";
  const coverage = block?.readState === "partial" && declaredCoverage === "complete" ? "partial" : declaredCoverage;
  if (status !== "ok" && status !== "empty") return { status, rows: [], coverage };
  const raw = block?.[key];
  const luaEmpty = raw != null && typeof raw === "object" && !Array.isArray(raw) && Object.keys(raw).length === 0;
  if (!Array.isArray(raw) && !luaEmpty && !(status === "empty" && raw == null)) {
    return { status: "failed", rows: [], coverage };
  }
  const rows = list<T>(raw);
  if (rows.some((row) => row == null || typeof row !== "object" || Array.isArray(row)) || (status === "empty" && rows.length > 0)) {
    return { status: "failed", rows: [], coverage };
  }
  return { status: rows.length ? "ok" : "empty", rows, coverage };
}

export function readAdvancedMaintenance(block: AdvancedMaintenanceReading | null | undefined, farmId: number) {
  const reading = assetRows<AdvancedMaintenanceMachine>(block, farmId, "farm", "machines");
  // Unobserved booleans are not evidence that every machine can start.
  const incomplete = reading.rows.some((row) => typeof row.startBlocked !== "boolean");
  const coverage = incomplete && reading.coverage === "complete" ? "partial" as const : reading.coverage;
  return { ...reading, coverage, blocked: reading.rows.filter((row) => row?.startBlocked === true) };
}

export function readExtendedMaintenance(block: ExtendedMaintenanceReading | null | undefined, farmId: number) {
  const reading = assetRows<ExtendedMaintenanceMachine>(block, farmId, "farm", "machines");
  return {
    ...reading,
    inService: reading.rows.filter((row) => row?.serviceActive === true),
    failing: reading.rows.filter((row) => typeof row?.failureType === "string" && row.failureType.trim() !== ""),
  };
}

export function serviceFaults(row: VehicleServiceMachine | null | undefined): string[] {
  return list<unknown>(row?.faults).filter((fault): fault is string => typeof fault === "string" && fault.trim() !== "");
}

export function readVehicleService(block: VehicleServiceReading | null | undefined, farmId: number) {
  const reading = assetRows<VehicleServiceMachine>(block, farmId, "farm", "machines");
  // The exporter represents a genuinely empty Lua faults list as {}. Other
  // containers or malformed entries cannot support a whole-farm no-fault claim.
  const incomplete = reading.rows.some((row) => {
    const faults: unknown = row.faults;
    if (Array.isArray(faults)) return faults.some((fault) => typeof fault !== "string" || fault.trim() === "");
    return faults == null || typeof faults !== "object" || Object.keys(faults).length !== 0;
  });
  const coverage = incomplete && reading.coverage === "complete" ? "partial" as const : reading.coverage;
  const conditions = reading.rows.map((row) => finite(row?.condition)).filter((value): value is number => value != null);
  return {
    ...reading,
    coverage,
    faulted: reading.rows.filter((row) => serviceFaults(row).length > 0),
    serviceSoon: reading.rows.filter((row) => row?.serviceSoon === true),
    warmingUp: reading.rows.filter((row) => (finite(row?.warmupMs) ?? 0) > 0),
    lowestCondition: conditions.length ? Math.min(...conditions) : null,
  };
}

/** Owned silo rows only; rows without this farm's owner id are ignored. */
export function readRealSilo(block: RealSiloReading | null | undefined, farmId: number) {
  const reading = assetRows<RealSiloRow>(block, farmId, "farm", "silos");
  const rows = reading.rows.filter((row) => row && row.ownerFarmId === farmId && typeof row.id === "string" && row.id !== "");
  return { ...reading, status: reading.status === "ok" && rows.length === 0 ? "empty" : reading.status, rows } as AssetReading<RealSiloRow>;
}

export function activeSiloSlot(row: RealSiloRow): RealSiloSlot | null {
  const active = finite(row.activeSlot);
  if (active == null) return null;
  return list<RealSiloSlot>(row.slots).find((slot) => finite(slot?.index) === active) ?? null;
}

export function readPalletCondition(block: PalletConditionReading | null | undefined, farmId: number) {
  const reading = assetRows<PalletConditionRow>(block, farmId, "farm", "pallets");
  const rows = reading.rows.filter((row) => row && row.ownerFarmId === farmId);
  const conditions = rows.map((row) => finite(row.condition)).filter((value): value is number => value != null);
  return {
    ...reading,
    status: (reading.status === "ok" && rows.length === 0 ? "empty" : reading.status) as AssetStatus,
    rows,
    damaged: rows.filter((row) => {
      const condition = finite(row.condition);
      return condition != null && condition < 100;
    }),
    outside: rows.filter((row) => row.outside === true),
    lowestCondition: conditions.length ? Math.min(...conditions) : null,
  };
}

export function readSeasonalMilk(block: SeasonalMilkReading | null | undefined) {
  const status = assetStatus(block, 0, "global");
  const factor = status === "ok" ? finite(block?.seasonFactor) : null;
  const peak = status === "ok" ? finite(block?.nextPeakPeriod) : null;
  return {
    status: status === "ok" && (factor == null || factor < 0) ? ("failed" as AssetStatus) : status,
    factor: factor != null && factor >= 0 ? factor : null,
    nextPeakPeriod: peak != null && Number.isInteger(peak) && peak >= 1 && peak <= 12 ? peak : null,
  };
}
