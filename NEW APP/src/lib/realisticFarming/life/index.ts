/** Life agent — NPC Favor / RWE / Pro Staff helpers. */

import type { RealisticFarmingPayload } from "@/types/dashboard";

export const LIFE_DOMAIN = "life" as const;

export type NpcFavorPayload = NonNullable<RealisticFarmingPayload["npcFavor"]>;
export type WorldEventsPayload = NonNullable<RealisticFarmingPayload["worldEvents"]>;
export type ProStaffPayload = NonNullable<RealisticFarmingPayload["proStaff"]>;

export type NpcRelationship = {
  npcId: string;
  name?: string;
  value?: number;
};

export type NpcActiveFavor = {
  id?: string;
  type?: string;
  npcId?: string;
  summary?: string;
};

export type ProStaffFarmRow = {
  level: number;
  membershipActive?: boolean;
  investmentTotal?: number;
  discounts?: { id: string; label: string; value?: number }[];
  flags?: string[];
};

export function getNpcFavor(rf: RealisticFarmingPayload | null | undefined): NpcFavorPayload | null {
  const block = rf?.npcFavor;
  if (!block || block.enabled !== true) return null;
  return block;
}

export function getNpcFavorForFarm(
  rf: RealisticFarmingPayload | null | undefined,
  farmId: number,
): { relationships: NpcRelationship[]; activeFavors: NpcActiveFavor[] } | null {
  const block = getNpcFavor(rf);
  if (!block) return null;
  const row = block.byFarm?.[String(farmId)] ?? block.byFarm?.[String(Number(farmId))];
  return {
    relationships: Array.isArray(row?.relationships) ? row!.relationships! : [],
    activeFavors: Array.isArray(row?.activeFavors) ? row!.activeFavors! : [],
  };
}

export function getWorldEvents(rf: RealisticFarmingPayload | null | undefined): WorldEventsPayload | null {
  const block = rf?.worldEvents;
  if (!block || block.enabled !== true) return null;
  return block;
}

export function getProStaff(rf: RealisticFarmingPayload | null | undefined): ProStaffPayload | null {
  const block = rf?.proStaff;
  if (!block || block.enabled !== true) return null;
  return block;
}

export function getProStaffForFarm(
  rf: RealisticFarmingPayload | null | undefined,
  farmId: number,
): ProStaffFarmRow | null {
  const block = getProStaff(rf);
  if (!block) return null;
  const row = block.byFarm?.[String(farmId)] ?? block.byFarm?.[String(Number(farmId))];
  if (!row) return null;
  return row;
}

/** Relationship tone for badges (FarmTablet thresholds). */
export function npcFavorTone(value: number | null | undefined): "accent" | "warn" | "danger" | "default" {
  const v = Number(value) || 0;
  if (v >= 70) return "accent";
  if (v >= 40) return "warn";
  if (v > 0) return "danger";
  return "default";
}

export function npcFavorLabel(value: number | null | undefined): "friend" | "neutral" | "cold" {
  const v = Number(value) || 0;
  if (v >= 70) return "friend";
  if (v >= 40) return "neutral";
  return "cold";
}

/** Discount multiplier → percent off (e.g. 0.95 → 5). */
export function discountPercentOff(multiplier: number | null | undefined): number | null {
  if (multiplier == null || !Number.isFinite(multiplier)) return null;
  if (Math.abs(multiplier - 1) < 0.0005) return null;
  return Math.round((1 - multiplier) * 1000) / 10;
}

/** Map Pro Staff unlock flag ids to i18n keys (fallback = raw id). */
export function proStaffFlagLabelKey(flag: string): string {
  switch (flag) {
    case "hasMarketIntel":
      return "rf.prostaff.flag.marketIntel";
    case "hasForecastAccess":
      return "rf.prostaff.flag.forecastAccess";
    case "hasPredictiveControl":
      return "rf.prostaff.flag.predictiveControl";
    case "hasEarlyWarning":
      return "rf.prostaff.flag.earlyWarning";
    default:
      return "";
  }
}

/** @deprecated Prefer proStaffFlagLabelKey + t(); kept for callers during Release polish. */
export function formatProStaffFlag(flag: string): string {
  switch (flag) {
    case "hasMarketIntel":
      return "Market intel";
    case "hasForecastAccess":
      return "Forecast access";
    case "hasPredictiveControl":
      return "Predictive control";
    case "hasEarlyWarning":
      return "Early warning";
    default:
      return flag;
  }
}

/** Top relationships for Overview chips (highest favor first). */
export function npcFavorHighlights(
  rf: RealisticFarmingPayload | null | undefined,
  farmId: number,
  limit = 3,
): NpcRelationship[] {
  const farm = getNpcFavorForFarm(rf, farmId);
  if (!farm) return [];
  return [...farm.relationships]
    .filter((r) => (Number(r.value) || 0) >= 70)
    .sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0))
    .slice(0, limit);
}
