import type { DashboardPayload } from "@/types/dashboard";

type Compatibility = "compatible" | "attention" | "unchecked";

function validTime(value: unknown): string | null {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  return value;
}

export function readHealthClock(payload: DashboardPayload | null | undefined): {
  lastExportAt: string | null;
  xmlCollectedAt: string | null;
  publishedAt: string | null;
  compatibility: Compatibility;
} {
  const ts = payload?.dataTimestamps;
  const diag = payload?.diagnostics;
  const lastExportAt = validTime(ts?.lastLuaReceivedAt);
  const modVersion = diag?.modVersion || payload?.modVersionCheck?.actual;
  const missing = diag?.missingDependencies;
  // The Lua JSON encoder writes an empty table as {}, not []. Both mean no missing modules.
  const noMissing = missing == null || (Array.isArray(missing)
    ? missing.length === 0
    : typeof missing === "object" && Object.keys(missing).length === 0);
  const hasEvidence = !!(lastExportAt && modVersion
    && noMissing
    && payload?.modVersionCheck?.status !== "outdated");
  const sourceBinding = (payload as DashboardPayload & {
    sourceBinding?: { publishedAt?: unknown };
  } | null | undefined)?.sourceBinding;

  return {
    lastExportAt,
    xmlCollectedAt: validTime(ts?.lastXmlReceivedAt),
    publishedAt: validTime(sourceBinding?.publishedAt),
    compatibility: diag?.compatible === false ? "attention"
      : diag?.compatible === true && hasEvidence ? "compatible" : "unchecked",
  };
}
