import type { DashboardPayload } from "@/types/dashboard";

export type FreshnessConfidence = "live" | "held" | "cache";

export interface FreshnessView {
  fetchedAt: string | null;
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

export function readFreshness(payload: DashboardPayload | null | undefined): FreshnessView {
  const ts = payload?.dataTimestamps || {};
  const confidence = asConfidence(ts.confidence);
  const isStale = asFlag(ts.isStale) || confidence !== "live";
  return {
    fetchedAt: ts.fetchedAt ? String(ts.fetchedAt) : payload?.lastUpdated ? String(payload.lastUpdated) : null,
    source: ts.source ? String(ts.source) : String(payload?.dataSource || "unknown"),
    isStale,
    staleReason: ts.staleReason ? String(ts.staleReason) : null,
    cacheUsedDueToFailure: asFlag(ts.cacheUsedDueToFailure),
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
