import { entityOwnerFarmId } from "@/lib/farm-scope";
import { getOwnedChainsForFarm, type ProductionPayload } from "@/lib/productions";
import { parsePasturesFromPayload } from "@/lib/pastures-parsers";
import { clusterFieldsForDisplay, type FieldRecord } from "@/lib/rules-engine";
import { computeFieldStats } from "@/sections/fields/field-helpers";
import type { DashboardPayload } from "@/types/dashboard";

/** Overview field counts for one farm. Unowned (<= 0) fields count toward every farm, as on the overview. */
export function farmFieldStats(fields: FieldRecord[] | undefined, farmId: number) {
  const scoped = (Array.isArray(fields) ? fields : []).filter((f) => {
    const oid = entityOwnerFarmId(f);
    return oid <= 0 || oid === farmId;
  });
  return computeFieldStats(
    clusterFieldsForDisplay(scoped, { autoMerge: false, manualGroups: [] }) as FieldRecord[]
  );
}

export function farmPastureWarnings(
  payload: DashboardPayload | null | undefined,
  farmId: number
): number {
  if (!payload) return 0;
  return parsePasturesFromPayload(payload, farmId).reduce(
    (n, p) => n + (Array.isArray(p.allWarnings) ? p.allWarnings.length : 0),
    0
  );
}

export function farmProductionIssues(
  production: ProductionPayload | null | undefined,
  farmInfo: unknown,
  farmId: number
): number {
  const chains = getOwnedChainsForFarm(production, farmId, farmInfo);
  return chains.filter((c) => {
    if (c.isActive === false) return true;
    const slots = Array.isArray(c.productions) ? c.productions : [];
    return slots.some((s) => s.status && /idle|empty|blocked|error/i.test(String(s.status)));
  }).length;
}
