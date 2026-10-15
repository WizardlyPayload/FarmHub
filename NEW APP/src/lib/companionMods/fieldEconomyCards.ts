/** Labeled field/economy card model. Private blocks fail closed without a matching farm id. */

import { selectedCompanionFarmId } from "./readings";

export const FIELD_SURFACE_IDS = [
  "yieldTracker",
  "fieldLeasing",
  "rentYourField",
  "farmlandMarketplace",
  "fieldProfitabilityLedger",
] as const;

export const ECONOMY_SURFACE_IDS = [
  "farmReputation",
  "fieldLeasing",
  "rentYourField",
  "farmlandMarketplace",
  "fieldProfitabilityLedger",
] as const;

export type FieldEconomyLiveKey =
  | "yieldTracker"
  | "fieldLeases"
  | "farmReputation"
  | "rentYourField"
  | "farmlandMarketplace"
  | "fieldProfitabilityLedger";

export type FieldEconomyStatus = "failed" | "pending" | "unavailable" | "other-farm" | "partial" | "empty" | "ok";

export type FieldEconomyUnit = "money" | "liters" | "hectares" | "count" | "hours" | "ratio";

/** `labelKey` is an i18n key; `textKey` (when set) is an i18n key for the value, `text` is raw provider text. */
export type FieldEconomyLine = {
  labelKey: string;
  labelParams?: Record<string, string>;
  text?: string;
  textKey?: string;
  textParams?: Record<string, string | number>;
  amount?: number;
  unit?: FieldEconomyUnit;
  /** Canonical commodity identity, never a translated display title or a mixed input category. */
  fillKey?: string;
};

export type FieldEconomyRow = FieldEconomyLine[];

export type FieldEconomyCard = {
  status: FieldEconomyStatus;
  liveKey: FieldEconomyLiveKey;
  messageKey: string;
  rows: FieldEconomyRow[];
  rowCount: number;
  truncated: boolean;
};

type Block = Record<string, unknown> & {
  enabled?: unknown;
  readState?: unknown;
  farmId?: unknown;
  scope?: unknown;
  coverage?: unknown;
  reason?: unknown;
};

type Payload = Partial<Record<FieldEconomyLiveKey, unknown>>;

export const FIELD_ECONOMY_ROW_LIMIT = 3;

/** Only Yield Tracker is save-scoped: the pinned mod is single-player and keeps no farm id. */
const SAVE_SCOPED: ReadonlySet<FieldEconomyLiveKey> = new Set(["yieldTracker"]);

const ROWS_FIELD: Record<Exclude<FieldEconomyLiveKey, "farmReputation">, string> = {
  yieldTracker: "rows",
  fieldLeases: "leases",
  rentYourField: "agreements",
  farmlandMarketplace: "rows",
  fieldProfitabilityLedger: "cycles",
};

const EMPTY_KEY: Record<FieldEconomyLiveKey, string> = {
  yieldTracker: "companions.live.yieldEmpty",
  fieldLeases: "companions.live.leaseEmpty",
  farmReputation: "companions.live.reputationEmpty",
  rentYourField: "companions.live.rentEmpty",
  farmlandMarketplace: "companions.live.marketEmpty",
  fieldProfitabilityLedger: "companions.live.ledgerEmpty",
};

const OK_KEY: Record<FieldEconomyLiveKey, string> = {
  yieldTracker: "companions.live.yieldRows",
  fieldLeases: "companions.live.leaseCount",
  farmReputation: "companions.live.reputationScore",
  rentYourField: "companions.live.rentCount",
  farmlandMarketplace: "companions.live.marketCount",
  fieldProfitabilityLedger: "companions.live.ledgerRows",
};

const LEDGER_UNIT: Record<string, FieldEconomyUnit> = {
  money: "money",
  litres: "liters",
  hectares: "hectares",
  milliseconds: "hours",
  ratio: "ratio",
};

function card(status: FieldEconomyStatus, liveKey: FieldEconomyLiveKey, messageKey: string): FieldEconomyCard {
  return { status, liveKey, messageKey, rows: [], rowCount: 0, truncated: false };
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function token(value: unknown): string | null {
  const s = text(value);
  return s && /^[A-Za-z][A-Za-z0-9_-]{0,47}$/.test(s) ? s : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

/** The production Lua encoder writes an empty table as {}. Only that empty
 * plain-object representation is interchangeable with an empty list. */
function listRows(value: unknown): Record<string, unknown>[] | null {
  if (Array.isArray(value)) {
    // Iteration also rejects holes, which JSON would represent as null members.
    for (const row of value) if (!isRecord(row)) return null;
    return value;
  }
  if (isRecord(value)) {
    const prototype = Object.getPrototypeOf(value);
    if ((prototype === Object.prototype || prototype === null) && Reflect.ownKeys(value).length === 0) return [];
  }
  return null;
}

function quantity(value: unknown, unit: FieldEconomyUnit, fillKey?: string): Pick<FieldEconomyLine, "amount" | "unit" | "fillKey"> | null {
  const n = finite(value);
  return n == null ? null : { amount: unit === "hours" ? n / 3_600_000 : n, unit, ...(fillKey ? { fillKey } : {}) };
}

function num(rows: FieldEconomyLine[], labelKey: string, value: unknown, unit: FieldEconomyUnit, fillKey?: string) {
  const reading = quantity(value, unit, fillKey);
  if (reading) rows.push({ labelKey, ...reading });
}

function fillKey(row: Record<string, unknown>, canonicalCrop = false): string | undefined {
  const key = token(row.fillKey) ?? (canonicalCrop ? token(row.crop) : null);
  // Older producer rows may already carry an uppercase canonical key in crop.
  // Mixed case/localized display titles are never inferred to be fill identities.
  const legacy = token(row.crop);
  return key?.toUpperCase() ?? (legacy && legacy === legacy.toUpperCase() ? legacy : undefined);
}

function raw(rows: FieldEconomyLine[], labelKey: string, value: unknown) {
  const s = text(value);
  if (s) rows.push({ labelKey, text: s });
}

function keyed(rows: FieldEconomyLine[], labelKey: string, prefix: string, value: unknown) {
  const s = token(value);
  if (s) rows.push({ labelKey, textKey: `${prefix}.${s}`, text: s });
}

function farmland(rows: FieldEconomyLine[], row: Record<string, unknown>) {
  const id = finite(row.farmlandId);
  if (id != null) rows.push({ labelKey: "companions.field.farmland", text: String(id) });
}

function ledgerTotals(lines: FieldEconomyLine[], row: Record<string, unknown>) {
  const state = row.totalsRead;
  if (state === "pending" || state === "failed" || state === "notQueried" || state === "unavailable") {
    lines.push({ labelKey: "companions.field.totals", textKey: `companions.ledger.totals.${state}`, text: String(state) });
    return;
  }
  const totals = listRows(row.totals);
  if (state !== "ok" || totals == null) {
    lines.push({ labelKey: "companions.field.totals", textKey: state === "ok"
      ? "companions.ledger.totals.failed" : "companions.ledger.totals.unavailable" });
    return;
  }
  if (row.totalsCoverage === "truncated" || row.totalsCoverage === "partial") {
    lines.push({
      labelKey: "companions.field.totals",
      textKey: row.totalsCoverage === "partial" ? "companions.ledger.totals.partial"
        : row.totalsCountExact === false ? "companions.ledger.totals.truncatedUnknown" : "companions.ledger.totals.truncated",
      textParams: { shown: totals.length, count: finite(row.totalsCount) ?? totals.length },
    });
  } else if (totals.length === 0 && row.totalsCoverage === "complete") {
    lines.push({ labelKey: "companions.field.totals", textKey: "companions.ledger.totals.empty" });
  }
  for (const total of totals) {
    if (!isRecord(total)) continue;
    const amount = finite(total.amount);
    const unit = LEDGER_UNIT[String(total.unit)];
    const category = token(total.category);
    const accountingClass = token(total.accountingClass);
    if (amount == null || !unit || !category || !accountingClass) continue;
    const direction = token(total.direction);
    lines.push({
      labelKey: direction ? "companions.ledger.totalDirected" : "companions.ledger.total",
      labelParams: {
        category: `companions.ledger.category.${category}`,
        accountingClass: `companions.ledger.class.${accountingClass}`,
        ...(direction ? { direction: `companions.ledger.direction.${direction}` } : {}),
      },
      ...quantity(amount, unit, unit === "liters" && category === "harvest" ? fillKey(row, true) : undefined),
    });
  }
}

function rowLines(liveKey: FieldEconomyLiveKey, row: Record<string, unknown>): FieldEconomyRow {
  const lines: FieldEconomyLine[] = [];
  switch (liveKey) {
    case "yieldTracker":
      num(lines, "companions.field.year", row.year, "count");
      num(lines, "companions.field.field", row.fieldId, "count");
      raw(lines, "companions.field.crop", row.crop);
      num(lines, "companions.field.harvested", row.liters, "liters", fillKey(row));
      break;
    case "fieldLeases":
      farmland(lines, row);
      num(lines, "companions.field.landValueBasis", row.price, "money");
      num(lines, "companions.field.periodsLeased", row.duration, "count");
      break;
    case "rentYourField":
      farmland(lines, row);
      num(lines, "companions.field.periodsRented", row.duration, "count");
      break;
    case "farmlandMarketplace":
      keyed(lines, "companions.field.offerKind", "companions.field.kind", row.kind);
      farmland(lines, row);
      num(lines, row.kind === "sale" ? "companions.field.askingPrice" : "companions.field.ratePerPeriod", row.price, "money");
      break;
    case "fieldProfitabilityLedger":
      raw(lines, "companions.field.land", row.land);
      raw(lines, "companions.field.crop", row.crop);
      keyed(lines, "companions.field.cycleState", "companions.field.cycleStates", row.state);
      num(lines, "companions.field.area", row.area, "hectares");
      keyed(lines, "companions.field.quality", "companions.ledger.quality", row.qualityClass);
      ledgerTotals(lines, row);
      break;
    case "farmReputation":
      break;
    default: {
      const never: never = liveKey;
      return never;
    }
  }
  return lines;
}

function gate(liveKey: FieldEconomyLiveKey, block: Block, farmId: number): FieldEconomyCard | null {
  const readState = block.readState;
  if (readState === "failed") return card("failed", liveKey, "companions.live.readFailed");
  if (readState === "pending") return card("pending", liveKey, "companions.live.readPending");
  const saveWide = SAVE_SCOPED.has(liveKey) && block.scope === "save" && block.farmId == null;
  if (readState !== "ok" && readState !== "empty") {
    const selected = selectedCompanionFarmId(farmId);
    const noSelection = selected == null || selected <= 0;
    const noFarm = block.reason === "no-farm" || (!saveWide && noSelection);
    return card("unavailable", liveKey, noFarm ? "companions.live.needsFarm" : "companions.live.readUnavailable");
  }
  if (saveWide) return null;
  const id = finite(block.farmId);
  if (id == null || id <= 0 || !Number.isInteger(id)) return card("unavailable", liveKey, "companions.live.needsFarm");
  if (id !== Number(farmId)) return card("other-farm", liveKey, "companions.live.otherFarm");
  return null;
}

export function fieldEconomyCard(liveKey: FieldEconomyLiveKey, payload: Payload, farmId: number): FieldEconomyCard | null {
  const block = payload[liveKey];
  if (!isRecord(block) || block.enabled !== true) return null;
  const closed = gate(liveKey, block as Block, farmId);
  if (closed) return closed;
  const complete = block.coverage === "complete";
  const truncated = block.coverage === "truncated";
  const incomplete = truncated || block.coverage === "partial";

  if (liveKey === "farmReputation") {
    if (block.readState === "empty") return incomplete
      ? card("partial", liveKey, "companions.live.partialNoRows")
      : card("empty", liveKey, EMPTY_KEY.farmReputation);
    const score = finite(block.reputation);
    if (score == null) return incomplete ? card("partial", liveKey, "companions.live.partialNoRows")
      : card("failed", liveKey, "companions.live.readFailed");
    const lines: FieldEconomyLine[] = [{ labelKey: "companions.field.reputation", amount: score, unit: "count" }];
    num(lines, "companions.field.missionLimit", block.missionLimit, "count");
    num(lines, "companions.field.rewardBonus", block.rewardBonus, "ratio");
    return { status: incomplete ? "partial" : "ok", liveKey,
      messageKey: incomplete ? "companions.live.partialRows" : OK_KEY.farmReputation,
      rows: [lines], rowCount: 1, truncated: false };
  }

  const list = block[ROWS_FIELD[liveKey]];
  // A legacy explicit-empty marker can be authoritative when the list is omitted;
  // a successful read alone cannot turn missing data into confirmed empty.
  if (list === undefined) return block.readState === "empty" && !incomplete
    ? card("empty", liveKey, EMPTY_KEY[liveKey])
    : card("partial", liveKey, "companions.live.partialNoRows");
  const rows = listRows(list);
  if (rows == null) return card("failed", liveKey, "companions.live.readFailed");

  if (rows.length === 0) {
    if (block.readState === "empty" && !incomplete) return card("empty", liveKey, EMPTY_KEY[liveKey]);
    if (complete) return card("empty", liveKey, EMPTY_KEY[liveKey]);
    return card("partial", liveKey, "companions.live.partialNoRows");
  }

  const selected = (rows as Record<string, unknown>[]).slice(0, FIELD_ECONOMY_ROW_LIMIT);
  const totalsIncomplete = liveKey === "fieldProfitabilityLedger" && selected.some((row) =>
    row.totalsRead !== "ok" || listRows(row.totals) == null || row.totalsCoverage === "partial" || row.totalsCoverage === "truncated");
  const shown = selected.map((row) => rowLines(liveKey, row));
  return {
    status: complete && !totalsIncomplete ? "ok" : "partial",
    liveKey,
    messageKey: !truncated
      ? incomplete || totalsIncomplete ? "companions.live.partialRows" : OK_KEY[liveKey]
      : liveKey === "fieldProfitabilityLedger"
        ? "companions.live.ledgerTruncated"
        : "companions.live.rowsTruncated",
    rows: shown,
    rowCount: rows.length,
    truncated: truncated || rows.length > FIELD_ECONOMY_ROW_LIMIT,
  };
}

export type FieldLeasingPageView = {
  status: "needs-farm" | "waiting" | "failed" | "unavailable" | "partial" | "empty" | "ok";
  farmData: Record<string, unknown> | null;
  leases: Record<string, unknown>[];
};

function leaseView(status: FieldLeasingPageView["status"]): FieldLeasingPageView {
  return { status, farmData: null, leases: [] };
}

/** A lease count is authoritative only when the complete page and any live block
 * both belong to the selected farm. Settings-only and missing rows are unread. */
export function fieldLeasingPageView(page: unknown, live: unknown, farmId: unknown): FieldLeasingPageView {
  const selected = selectedCompanionFarmId(farmId);
  if (selected == null || selected <= 0) return leaseView("needs-farm");

  if (live != null) {
    if (!isRecord(live) || live.enabled !== true) return leaseView("unavailable");
    if (live.reason === "no-farm") return leaseView("needs-farm");
    if (live.readState === "failed") return leaseView("failed");
    if (live.readState !== "ok" && live.readState !== "empty") return leaseView("unavailable");
    if (live.farmId !== selected) return leaseView("unavailable");
    if (live.coverage !== "complete") return leaseView("partial");
  }

  if (page == null) return leaseView("waiting");
  if (!isRecord(page)) return leaseView("unavailable");
  if (page.reason === "no-farm") return leaseView("needs-farm");
  if (page.readState === "failed") return leaseView("failed");
  if (page.readState === "partial" || page.coverage === "truncated" || page.coverage === "partial") {
    return leaseView("partial");
  }
  if (page.readState !== "ok" || page.coverage !== "complete") return leaseView("unavailable");

  const byFarm = isRecord(page.byFarm) ? page.byFarm : null;
  const farmData = byFarm && isRecord(byFarm[String(selected)]) ? byFarm[String(selected)] as Record<string, unknown> : null;
  const rows = listRows(page.leases);
  if (!farmData || rows == null) return leaseView("unavailable");
  const leases = rows.filter((row) => row.farmId === selected);
  const count = finite(farmData.leaseCount);
  if (count == null || !Number.isInteger(count) || count < 0 || count !== leases.length) return leaseView("unavailable");

  if (live != null && isRecord(live)) {
    const liveRows = listRows(live.leases);
    if (liveRows == null || liveRows.length !== leases.length || (live.readState === "empty" && leases.length !== 0)) {
      return leaseView("unavailable");
    }
  }
  return { status: leases.length === 0 ? "empty" : "ok", farmData, leases };
}
