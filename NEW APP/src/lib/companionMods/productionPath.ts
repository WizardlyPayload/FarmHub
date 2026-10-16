/**
 * Readings for the production-path companions (Factory Profit Calculator, Moisture System,
 * Distribution Redux, Silage Compaction Monitor). Farm-private rows show only for the selected farm.
 */
import { filterUsableMarketLocations, type MarketPrices } from "@/lib/economy";

export type ReadingStatus = "ok" | "empty" | "pending" | "failed" | "unavailable" | "other-farm" | "disabled";
export type Coverage = "complete" | "truncated";

export type ReadingEnvelope = {
  enabled?: boolean;
  readState?: string;
  scope?: string;
  farmId?: number | null;
  coverage?: string;
  reason?: string;
};
type Envelope = ReadingEnvelope;

export type FactoryIoRow = {
  fillType?: string | null;
  fillTypeIndex?: number | null;
  perCycleLiters?: number | null;
  monthlyLiters?: number | null;
  capacityLiters?: number | null;
  fillLevelLiters?: number | null;
  purchasePricePer1000?: number | null;
  theoreticalPeakPer1000?: number | null;
};

export type FactoryLine = {
  readState?: string;
  coverage?: string;
  inputReading?: ReadingEnvelope;
  outputReading?: ReadingEnvelope;
  pointId?: string | null;
  pointName?: string | null;
  recipeId?: string | null;
  recipeName?: string | null;
  cyclesPerMonth?: number | null;
  upkeepPerMonth?: number | null;
  inputs?: FactoryIoRow[];
  outputs?: FactoryIoRow[];
};

export type FactoryProfitBlock = Envelope & { period?: string; periodBasis?: string; lines?: FactoryLine[] };

export type MoistureBlock = Envelope & {
  mapMoisturePercent?: number | null;
  storedGoods?: Envelope & {
    warnings?: Array<{ fillType?: string; qualityPercent?: number | null; moisturePercent?: number | null; grade?: number | null }>;
  };
};

export type DistributionBlock = Envelope & {
  masterEnabled?: boolean;
  participation?: number | null;
  activity?: "active" | "disabled" | "none" | "unknown";
  mode?: number | null;
  modeKey?: string | null;
  radius?: number | null;
  bufferHours?: number | null;
  sellEnabled?: boolean;
  farmAssets?: Envelope & {
    overridesReading?: Envelope & { rows?: DistributionOverride[] };
    history?: Envelope & { window?: "last-completed-cycle"; retained?: boolean; rows?: DistributionMovement[] };
    overrides?: Array<{ uniqueId?: string; fillType?: string | null; mode?: number | null; modeKey?: string | null }>;
    lastCycle?: Array<{
      uniqueId?: string;
      fillType?: string | null;
      distributedLiters?: number | null;
      soldLiters?: number | null;
      storedLiters?: number | null;
      receivedLiters?: number | null;
    }>;
  };
};

export type DistributionOverride = { uniqueId?: string; fillType?: string | null; mode?: number | null; modeKey?: string | null };
export type DistributionMovement = { uniqueId?: string; fillType?: string | null; distributedLiters?: number | null; soldLiters?: number | null; storedLiters?: number | null; receivedLiters?: number | null };

export type SilageHudBlock = Envelope & { context?: string; status?: string; estimate?: string | null };

const STATES = new Set(["ok", "empty", "pending", "failed", "unavailable"]);

function isFarmId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * Privacy is supplied by the typed caller, never by a payload scope string. Private readings need an
 * exported farm id equal to the selected farm. Only known map/configuration callers opt into sharing.
 */
export function readingStatus(block: Envelope | null | undefined, selectedFarmId: number, expectedScope: "private" | "shared" = "private"): ReadingStatus {
  if (!block || typeof block !== "object") return "unavailable";
  if (block.enabled === false) return "disabled";
  const state = String(block.readState ?? "");
  if (!STATES.has(state)) return "unavailable";
  if (state === "failed" || state === "pending" || state === "unavailable") return state as ReadingStatus;
  if (expectedScope === "private") {
    if (!isFarmId(block.farmId) || !isFarmId(selectedFarmId)) return "unavailable";
    if (block.farmId !== selectedFarmId) return "other-farm";
  }
  return state as ReadingStatus;
}

export function coverageOf(block: Envelope | null | undefined): Coverage {
  return block?.coverage === "complete" ? "complete" : "truncated";
}

function crop(market: MarketPrices | null | undefined, row: FactoryIoRow) {
  const crops = market?.crops;
  if (!crops || typeof crops !== "object") return undefined;
  const index = finite(row.fillTypeIndex);
  if (index != null) {
    const byIndex = Object.values(crops).find((c) => Number(c?.fillTypeIndex) === index);
    if (byIndex) return byIndex;
  }
  return row.fillType ? crops[row.fillType] : undefined;
}

/** Best current quote per 1000 l from the economy export's sell points (multipliers already applied there). */
export function currentSellPricePer1000(market: MarketPrices | null | undefined, row: FactoryIoRow): number | null {
  const entry = crop(market, row);
  const prices = filterUsableMarketLocations(entry?.locations).map((loc) => Number(loc.price));
  return prices.length ? Math.max(...prices) : null;
}

function valueOf(rows: FactoryIoRow[], price: (row: FactoryIoRow) => number | null): number | null {
  let total = 0;
  for (const row of rows) {
    const liters = finite(row.monthlyLiters);
    if (liters == null) return null;
    if (liters === 0) continue;
    const quote = price(row);
    if (quote == null) return null;
    total += (liters / 1000) * quote;
  }
  return Number.isFinite(total) ? total : null;
}

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const textId = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

/** Validate once before both valuation and flow formatting. Keep good rows, but never value a partial side. */
function ioSide(raw: unknown, envelope: Envelope | undefined) {
  const rows: FactoryIoRow[] = [];
  let valid = Array.isArray(raw);
  if (Array.isArray(raw)) for (const candidate of raw) {
    if (!record(candidate) || !textId(candidate.fillType) || !isFarmId(candidate.fillTypeIndex)
      || finite(candidate.perCycleLiters) == null || finite(candidate.monthlyLiters) == null
      || ["capacityLiters", "fillLevelLiters", "purchasePricePer1000", "theoreticalPeakPer1000"].some(
        (key) => candidate[key] != null && finite(candidate[key]) == null)) {
      valid = false;
    } else rows.push(candidate as FactoryIoRow);
  }
  const state = envelope?.readState;
  const complete = valid && envelope?.enabled !== false && envelope?.coverage === "complete"
    && (state === "ok" || state === "empty") && !(state === "empty" && rows.length > 0);
  return { rows, complete };
}

export type FactoryProjection = {
  line: FactoryLine;
  inputComplete: boolean;
  outputComplete: boolean;
  cyclesPerMonth: number | null;
  upkeepPerMonth: number | null;
  outputValue: number | null;
  purchasedInputExpense: number | null;
  inputOpportunityCost: number | null;
  expectedMarginBuyingInputs: number | null;
  expectedMarginOwnInputs: number | null;
  theoreticalPeakOutputValue: number | null;
};

/**
 * Monthly projection for one recipe. Output value and input opportunity cost use current sell quotes;
 * purchased inputs use the buying-station quote the mod exposes. Any missing quote leaves that figure null.
 * Realized profit is never derived here: it needs sales history no reader provides.
 */
export function projectFactoryLine(line: FactoryLine, market: MarketPrices | null | undefined, period = "month"): FactoryProjection {
  const input = ioSide(line.inputs, line.inputReading);
  const output = ioSide(line.outputs, line.outputReading);
  const inputs = input.rows;
  const outputs = output.rows;
  const valid = period === "month" && line.readState === "ok" && textId(line.pointId) && textId(line.recipeId)
    && finite(line.cyclesPerMonth) != null;
  const inputComplete = valid && input.complete;
  const outputComplete = valid && output.complete;
  const upkeep = finite(line.upkeepPerMonth);
  const outputValue = outputComplete ? valueOf(outputs, (r) => currentSellPricePer1000(market, r)) : null;
  const purchased = inputComplete ? valueOf(inputs, (r) => {
    const p = finite(r.purchasePricePer1000);
    return p != null && p > 0 ? p : null;
  }) : null;
  const opportunity = inputComplete ? valueOf(inputs, (r) => currentSellPricePer1000(market, r)) : null;
  const peak = outputComplete
    ? valueOf(outputs, (r) => {
        const p = finite(r.theoreticalPeakPer1000);
        return p != null && p > 0 ? p : null;
      })
    : null;
  const margin = (cost: number | null) => {
    if (outputValue == null || cost == null || upkeep == null) return null;
    const result = outputValue - cost - upkeep;
    return Number.isFinite(result) ? result : null;
  };
  return {
    line: { ...line, pointId: textId(line.pointId) ? line.pointId : undefined,
      recipeId: textId(line.recipeId) ? line.recipeId : undefined,
      pointName: textId(line.pointName) ? line.pointName : undefined,
      recipeName: textId(line.recipeName) ? line.recipeName : undefined, inputs, outputs },
    inputComplete,
    outputComplete,
    cyclesPerMonth: finite(line.cyclesPerMonth),
    upkeepPerMonth: upkeep,
    outputValue,
    purchasedInputExpense: purchased,
    inputOpportunityCost: opportunity,
    expectedMarginBuyingInputs: margin(purchased),
    expectedMarginOwnInputs: margin(opportunity),
    theoreticalPeakOutputValue: peak,
  };
}

export type FactoryView =
  | { status: Exclude<ReadingStatus, "ok">; projections: []; coverage: Coverage }
  | { status: "ok"; projections: FactoryProjection[]; coverage: Coverage };

export function factoryView(
  block: FactoryProfitBlock | null | undefined,
  market: MarketPrices | null | undefined,
  selectedFarmId: number,
): FactoryView {
  const status = readingStatus(block, selectedFarmId);
  if (status !== "ok") return { status, projections: [], coverage: coverageOf(block) };
  if (!Array.isArray(block!.lines)) return { status: "failed", projections: [], coverage: "truncated" };
  if (block!.lines.length === 0) return { status: "empty", projections: [], coverage: coverageOf(block) };
  return {
    status: "ok",
    projections: block!.lines.map((l) => projectFactoryLine(record(l) ? l : { readState: "failed" }, market, block!.period ?? "unknown")),
    coverage: block!.lines.every(record) ? coverageOf(block) : "truncated",
  };
}

/** Farm-private sub-reading inside a shared map/global block. */
export function privateRows<T>(sub: (Envelope & Record<string, unknown>) | null | undefined, selectedFarmId: number, key: string): { status: ReadingStatus; rows: T[]; coverage: Coverage } {
  const status = readingStatus(sub, selectedFarmId, "private");
  const raw = sub ? (sub as Record<string, unknown>)[key] : undefined;
  if (status === "ok" && (!Array.isArray(raw) || !raw.every(record))) return { status: "failed", rows: [], coverage: "truncated" };
  return { status, rows: status === "ok" ? (raw as T[]) : [], coverage: coverageOf(sub) };
}
