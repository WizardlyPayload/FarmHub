import type { DashboardPayload } from "@/types/dashboard";

export type FreshnessConfidence = "live" | "held" | "cache";

export interface FreshnessView {
  sourceAt: string | null;
  source: string;
  isStale: boolean;
  staleReason: string | null;
  cacheUsedDueToFailure: boolean;
  confidence: FreshnessConfidence;
}

function asConfidence(value: unknown): FreshnessConfidence {
  if (value === "cache" || value === "held" || value === "live") return value;
  return "live";
}

function asFlag(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

function validSourceTime(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }
  if (typeof value !== "string") return null;
  const time = value.trim();
  return time && Number.isFinite(Date.parse(time)) ? time : null;
}

export function readFreshness(payload: DashboardPayload | null | undefined): FreshnessView {
  const ts = payload?.dataTimestamps || {};
  const cacheUsedDueToFailure = asFlag(ts.cacheUsedDueToFailure);
  const confidence = cacheUsedDueToFailure ? "cache" : asConfidence(ts.confidence);
  const source = ts.source ? String(ts.source) : String(payload?.dataSource || "unknown");
  const isStale = asFlag(ts.isStale) || cacheUsedDueToFailure || confidence !== "live" || source === "xml_only";
  return {
    sourceAt: validSourceTime(source === "xml_only" ? ts.lastXmlReceivedAt : ts.lastLuaReceivedAt),
    source,
    isStale,
    staleReason: ts.staleReason ? String(ts.staleReason) : null,
    cacheUsedDueToFailure,
    confidence,
  };
}

export function formatFetchedAt(iso: string | null, locale = "en"): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return d.toLocaleString(locale);
  } catch {
    return d.toISOString();
  }
}
