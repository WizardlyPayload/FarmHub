/** FS25_Invoices — sale/work invoice helpers for the Mods → Invoices section. */

export const INVOICE_STATE = {
  NEW: 1,
  SENT: 2,
  PAID: 3,
  CANCELLED: 4,
} as const;

export interface InvoiceCreatedAt {
  day?: number;
  hour?: number;
  minute?: number;
  period?: number;
  year?: number;
}

export interface InvoiceItem {
  id?: number | string;
  senderFarmId?: number;
  recipientFarmId?: number;
  /** Aliases some collectors may emit. */
  fromFarmId?: number;
  toFarmId?: number;
  state?: number | string;
  stateLabel?: string;
  totalAmount?: number;
  total?: number;
  vatAmount?: number;
  totalHT?: number;
  penaltyAmount?: number;
  direction?: "incoming" | "outgoing" | string;
  services?: string;
  note?: string;
  lineCount?: number;
  createdAt?: InvoiceCreatedAt;
  createdDay?: number;
  [key: string]: unknown;
}

export interface InvoicesFarmSummary {
  incomingCount?: number;
  outgoingCount?: number;
  incomingTotal?: number;
  outgoingTotal?: number;
  unpaidCount?: number;
  unpaidTotal?: number;
  overdueCount?: number;
  paidCount?: number;
  cancelledCount?: number;
  [key: string]: unknown;
}

export interface InvoicesFarmRow {
  summary?: InvoicesFarmSummary;
  items?: InvoiceItem[];
  incoming?: InvoiceItem[];
  outgoing?: InvoiceItem[];
  [key: string]: unknown;
}

export interface InvoicesSettings {
  invoiceVatSimulated?: boolean;
  invoiceReminders?: boolean;
  invoicePenalties?: boolean;
  [key: string]: unknown;
}

export interface InvoicesPayload {
  enabled?: boolean;
  settings?: InvoicesSettings;
  byFarm?: Record<string, InvoicesFarmRow>;
  [key: string]: unknown;
}

export interface NormalizedInvoicesFarm {
  summary: InvoicesFarmSummary;
  incoming: InvoiceItem[];
  outgoing: InvoiceItem[];
  items: InvoiceItem[];
}

/** Lua empty tables serialize as `{}` — never treat them as arrays. */
export function asArray<T>(x: T[] | unknown): T[] {
  return Array.isArray(x) ? x : [];
}

export function isInvoicesModActive(invoices: InvoicesPayload | null | undefined): boolean {
  return !!(invoices && invoices.enabled === true);
}

export function formatInvoiceMoney(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function invoiceSenderFarmId(item: InvoiceItem | null | undefined): number {
  if (!item) return 0;
  const n = Number(item.senderFarmId ?? item.fromFarmId ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function invoiceRecipientFarmId(item: InvoiceItem | null | undefined): number {
  if (!item) return 0;
  const n = Number(item.recipientFarmId ?? item.toFarmId ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function invoiceTotalDue(item: InvoiceItem | null | undefined): number {
  if (!item) return 0;
  const base = Number(item.totalAmount ?? item.total ?? 0);
  const penalty = Number(item.penaltyAmount ?? 0);
  const total = (Number.isFinite(base) ? base : 0) + (Number.isFinite(penalty) ? penalty : 0);
  return total;
}

export function invoiceStateCode(item: InvoiceItem | null | undefined): number {
  if (!item) return 0;
  const raw = item.state;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const lower = raw.trim().toLowerCase();
    if (lower === "new" || lower === "unpaid" || lower === "pending") return INVOICE_STATE.NEW;
    if (lower === "sent") return INVOICE_STATE.SENT;
    if (lower === "paid") return INVOICE_STATE.PAID;
    if (lower === "cancelled" || lower === "canceled") return INVOICE_STATE.CANCELLED;
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

export type InvoiceDisplayState = "paid" | "overdue" | "unpaid" | "cancelled" | "sent" | "unknown";

export function invoiceDisplayState(item: InvoiceItem | null | undefined): InvoiceDisplayState {
  if (!item) return "unknown";
  const code = invoiceStateCode(item);
  if (code === INVOICE_STATE.PAID) return "paid";
  if (code === INVOICE_STATE.CANCELLED) return "cancelled";
  const penalty = Number(item.penaltyAmount ?? 0);
  if (Number.isFinite(penalty) && penalty > 0 && code !== INVOICE_STATE.PAID) return "overdue";
  if (code === INVOICE_STATE.SENT) return "sent";
  if (code === INVOICE_STATE.NEW) return "unpaid";
  if (typeof item.stateLabel === "string" && item.stateLabel.trim()) {
    const l = item.stateLabel.trim().toLowerCase();
    if (l.includes("paid") && !l.includes("unpaid")) return "paid";
    if (l.includes("overdue")) return "overdue";
    if (l.includes("cancel")) return "cancelled";
    if (l.includes("sent")) return "sent";
    if (l.includes("unpaid") || l.includes("pending") || l.includes("new")) return "unpaid";
  }
  return code > 0 ? "unpaid" : "unknown";
}

export function invoiceStateTone(
  state: InvoiceDisplayState,
): "accent" | "default" | "warn" | "danger" {
  if (state === "paid") return "accent";
  if (state === "overdue") return "danger";
  if (state === "cancelled") return "default";
  if (state === "sent") return "warn";
  if (state === "unpaid") return "warn";
  return "default";
}

/** Split farm items into incoming (to farm) / outgoing (from farm). */
export function partitionInvoiceItems(
  items: InvoiceItem[],
  farmId: number,
): { incoming: InvoiceItem[]; outgoing: InvoiceItem[] } {
  const fid = Number(farmId) || 1;
  const incoming: InvoiceItem[] = [];
  const outgoing: InvoiceItem[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const dir = String(item.direction || "").toLowerCase();
    if (dir === "incoming") {
      incoming.push(item);
      continue;
    }
    if (dir === "outgoing") {
      outgoing.push(item);
      continue;
    }
    const to = invoiceRecipientFarmId(item);
    const from = invoiceSenderFarmId(item);
    if (to === fid) incoming.push(item);
    else if (from === fid) outgoing.push(item);
    else if (to > 0) incoming.push(item);
    else if (from > 0) outgoing.push(item);
  }
  return { incoming, outgoing };
}

function sumTotals(items: InvoiceItem[]): number {
  return items.reduce((acc, item) => acc + invoiceTotalDue(item), 0);
}

function buildSummary(
  raw: InvoicesFarmSummary | null | undefined,
  incoming: InvoiceItem[],
  outgoing: InvoiceItem[],
): InvoicesFarmSummary {
  const base = raw && typeof raw === "object" ? { ...raw } : {};
  const all = [...incoming, ...outgoing];
  const unpaid = all.filter((i) => {
    const s = invoiceDisplayState(i);
    return s === "unpaid" || s === "sent" || s === "overdue";
  });
  const overdue = all.filter((i) => invoiceDisplayState(i) === "overdue");
  const paid = all.filter((i) => invoiceDisplayState(i) === "paid");
  const cancelled = all.filter((i) => invoiceDisplayState(i) === "cancelled");

  return {
    ...base,
    incomingCount: base.incomingCount ?? incoming.length,
    outgoingCount: base.outgoingCount ?? outgoing.length,
    incomingTotal: base.incomingTotal ?? sumTotals(incoming),
    outgoingTotal: base.outgoingTotal ?? sumTotals(outgoing),
    unpaidCount: base.unpaidCount ?? unpaid.length,
    unpaidTotal: base.unpaidTotal ?? sumTotals(unpaid),
    overdueCount: base.overdueCount ?? overdue.length,
    paidCount: base.paidCount ?? paid.length,
    cancelledCount: base.cancelledCount ?? cancelled.length,
  };
}

export function normalizeInvoicesFarm(
  farm: InvoicesFarmRow | null | undefined,
  farmId: number,
): NormalizedInvoicesFarm | null {
  if (!farm || typeof farm !== "object") return null;

  const explicitIncoming = asArray<InvoiceItem>(farm.incoming);
  const explicitOutgoing = asArray<InvoiceItem>(farm.outgoing);
  const items = asArray<InvoiceItem>(farm.items);

  let incoming = explicitIncoming;
  let outgoing = explicitOutgoing;

  if (incoming.length === 0 && outgoing.length === 0 && items.length > 0) {
    const split = partitionInvoiceItems(items, farmId);
    incoming = split.incoming;
    outgoing = split.outgoing;
  } else if (items.length > 0 && (incoming.length === 0 || outgoing.length === 0)) {
    const split = partitionInvoiceItems(items, farmId);
    if (incoming.length === 0) incoming = split.incoming;
    if (outgoing.length === 0) outgoing = split.outgoing;
  }

  const mergedItems =
    items.length > 0 ? items : [...incoming, ...outgoing];

  return {
    summary: buildSummary(farm.summary, incoming, outgoing),
    incoming,
    outgoing,
    items: mergedItems,
  };
}

export function getInvoicesForFarm(
  invoices: InvoicesPayload | null | undefined,
  farmId: number | null | undefined,
): NormalizedInvoicesFarm | null {
  if (!isInvoicesModActive(invoices)) return null;
  const fid = String(Number(farmId) || 1);
  const raw =
    invoices!.byFarm?.[fid] ||
    invoices!.byFarm?.[String(Number(fid))] ||
    null;
  // Mod enabled with empty byFarm (waiting for first collect / no invoices yet).
  if (!raw) {
    return normalizeInvoicesFarm({ farmId: Number(farmId) || 1, items: [] }, Number(farmId) || 1);
  }
  return normalizeInvoicesFarm(raw, Number(farmId) || 1);
}
