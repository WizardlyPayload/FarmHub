import { t, tOr } from "@/i18n/i18n";
import { filterFieldsForFarmView } from "@/sections/fields/field-helpers";
import { clusterFieldsForDisplay, type FieldRecord } from "@/lib/rules-engine";
import {
  filterPasturesForFarmView,
  parsePastureData,
} from "@/lib/pastures-parsers";
import {
  pastureFoodLiters,
  pastureWaterLiters,
} from "@/lib/pastures-display";
import type { Pasture } from "@/lib/pastures-types";
import {
  getChainsForFarmView,
  type ProductionChain,
  type ProductionPayload,
} from "@/lib/productions";

export interface SimHubCard {
  title: string;
  subtitle?: string;
  badge?: string;
  lines: string[];
}

export function simHubFieldCards(
  fields: unknown,
  farmId: number,
  clusterIds: string[],
): SimHubCard[] {
  const raw = Array.isArray(fields) ? (fields as FieldRecord[]) : [];
  let list = clusterFieldsForDisplay(
    filterFieldsForFarmView(raw, farmId, { includeUnowned: false }),
    { manualGroups: [] },
  ) as FieldRecord[];
  if (clusterIds.length) {
    list = list.filter((f) => {
      const ids = [
        String(f._displayClusterId || ""),
        String(f.farmlandId ?? ""),
        String(f.id ?? ""),
        ...((f._clusterFieldIds || []).map((n: number) => String(n))),
      ];
      return clusterIds.some((id) => ids.includes(String(id)));
    });
  }
  return list.map((f) => {
    const ha = Number(f.hectares);
    const fruit = String(f.fruitType || "—");
    const lines: string[] = [];
    if (f.needsWork) lines.push(tOr("simhub.needsWork", "Needs work"));
    if (f.harvestReady) lines.push(tOr("simhub.harvestReady", "Harvest ready"));
    return {
      title: String(f.name || `Field ${f.farmlandId ?? f.id}`),
      badge: f._displayClusterId ? String(f._displayClusterId) : undefined,
      subtitle: `${Number.isFinite(ha) && ha > 0 ? `${ha.toFixed(2)} ha` : "—"} · ${fruit}`,
      lines,
    };
  });
}

export function simHubPastureCards(
  payload: {
    animals?: unknown;
    pastures?: unknown;
    production?: { husbandryData?: unknown; husbandryTotals?: unknown };
    placeables?: unknown;
    farmInfo?: unknown;
  },
  farmId: number,
  pastureIds: number[],
): SimHubCard[] {
  let pastures = parsePastureData({
    animals: Array.isArray(payload.animals) ? payload.animals : [],
    husbandryData: Array.isArray(payload.production?.husbandryData)
      ? payload.production!.husbandryData
      : [],
    placeables: Array.isArray(payload.placeables) ? payload.placeables : [],
    activeFarmId: farmId,
    husbandryTotals:
      payload.production?.husbandryTotals && typeof payload.production.husbandryTotals === "object"
        ? (payload.production.husbandryTotals as Record<string, number>)
        : null,
  });
  pastures = filterPasturesForFarmView(pastures, farmId, payload.farmInfo);
  if (pastureIds.length) {
    pastures = pastures.filter((_, i) => pastureIds.includes(i));
  }
  if (pastures.length === 0 && Array.isArray(payload.pastures)) {
    pastures = filterPasturesForFarmView(payload.pastures as Pasture[], farmId, payload.farmInfo);
    if (pastureIds.length) {
      pastures = pastures.filter((_, i) => pastureIds.includes(i));
    }
  }
  return pastures.map((p, i) => pastureCard(p, i));
}

function pastureCard(p: Pasture, index: number): SimHubCard {
  const warnings = Array.isArray(p.allWarnings) ? p.allWarnings : [];
  const food = pastureFoodLiters(p.foodReport);
  const water = pastureWaterLiters(p.foodReport);
  const lines: string[] = [
    tOr("simhub.pastureHeads", "{{count}} animals", { count: Number(p.animalCount) || 0 }),
  ];
  if (food > 0) {
    lines.push(tOr("simhub.pastureFood", "Food {{liters}} L", { liters: Math.round(food) }));
  }
  if (water > 0) {
    lines.push(tOr("simhub.pastureWater", "Water {{liters}} L", { liters: Math.round(water) }));
  }
  for (const w of warnings.slice(0, 3)) {
    lines.push(String(w.message || w.type || ""));
  }
  const danger = warnings.some((w) => w.severity === "danger");
  return {
    title: String(p.name || p.id || `Pasture ${index + 1}`),
    badge: danger ? t("pastures.warning.danger") : warnings.length ? t("pastures.warning.warning") : undefined,
    lines,
  };
}

export function simHubProductionCards(
  production: ProductionPayload | null | undefined,
  farmId: number,
  farmInfo: unknown,
  productionKeys: string[],
): SimHubCard[] {
  let chains = getChainsForFarmView(production, farmId, farmInfo, true);
  if (productionKeys.length) {
    chains = chains.filter((c) => productionKeys.includes(String(c.name || c.id || "")));
  }
  return chains.map((c) => productionCard(c));
}

function productionCard(c: ProductionChain): SimHubCard {
  const slots = Array.isArray(c.productions) ? c.productions : [];
  const activeSlots = slots.filter((s) => s.isActive !== false).length;
  const lines: string[] = [
    c.isActive === false
      ? tOr("simhub.productionIdle", "Idle")
      : tOr("simhub.productionSlots", "{{active}} / {{total}} recipes active", {
          active: activeSlots,
          total: slots.length,
        }),
  ];
  const blocked = slots.find((s) => s.status && /idle|empty|blocked|error/i.test(String(s.status)));
  if (blocked?.status) {
    lines.push(String(blocked.status));
  }
  return {
    title: String(c.name || c.id || "Chain"),
    badge: c.isPublic ? tOr("simhub.public", "Public") : undefined,
    lines,
  };
}
