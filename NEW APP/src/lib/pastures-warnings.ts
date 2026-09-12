/**
 * Pure helpers for pasture warning decisions.
 * Ported from FS25_FarmDashboard_App/web/assests/js/pastures-warnings.js
 */

export interface LivestockHeadProp {
  __emptyPen?: boolean;
  __lodClusterAggregate?: boolean;
  clusterCount?: number | string;
}

export interface FoodReportLike {
  hasRealData?: boolean;
  totalMixedRation?: number;
  totalCapacity?: number;
  availableFood?: number;
  food?: number;
  hay?: number;
  silage?: number;
  grass?: number;
  forage?: number;
  water?: number;
  straw?: number;
}

export interface ConsumptionDataLike {
  foodPerDay?: number;
  food?: number;
  waterPerDay?: number;
  water?: number;
  strawPerDay?: number;
  straw?: number;
  foodEstimated?: boolean;
  waterEstimated?: boolean;
  strawEstimated?: boolean;
}

export interface FoodWaterDecision {
  type: "data_unavailable" | "food";
  subtype?: string;
  severity: "info" | "warning" | "danger";
  count?: number;
  percent?: number;
}

export interface FoodDurationEstimates {
  durationDays: { food: number | null; water: number | null; straw: number | null };
  durationEstimated: boolean;
  consumptionPerDay: { food: number; water: number; straw: number };
}

export function countLivestockHeads(animals: LivestockHeadProp[] | null | undefined): number {
  if (!Array.isArray(animals)) return 0;
  let n = 0;
  for (const a of animals) {
    if (!a) continue;
    if (a.__emptyPen) continue;
    const c = Number(a.clusterCount);
    if (a.__lodClusterAggregate && Number.isFinite(c) && c > 0) n += c;
    else n += 1;
  }
  return n;
}

export function buildFoodWaterDecisions(
  heads: number,
  foodReport: FoodReportLike | null | undefined
): FoodWaterDecision[] {
  const out: FoodWaterDecision[] = [];
  if (heads <= 0) return out;
  if (!foodReport) return out;
  if (foodReport.hasRealData === false) {
    out.push({ type: "data_unavailable", subtype: "food", severity: "info", count: heads });
    out.push({ type: "data_unavailable", subtype: "water", severity: "info", count: heads });
    return out;
  }
  const amount = Number(foodReport.totalMixedRation) || 0;
  const capacity = Number(foodReport.totalCapacity) || 0;
  if (capacity <= 0) return out;
  const percent = (amount / capacity) * 100;
  if (percent < 20) {
    out.push({
      type: "food",
      subtype: "totalMixedRation",
      severity: percent < 10 ? "danger" : "warning",
      percent,
    });
  }
  return out;
}

export function computeFoodDurationEstimates(
  foodReport: FoodReportLike | null | undefined,
  consumptionData: ConsumptionDataLike | null | undefined,
  animalCount: number
): FoodDurationEstimates | null {
  if (!foodReport || foodReport.hasRealData === false) return null;
  const heads = Number(animalCount) || 0;
  if (heads <= 0) return null;

  const cons = consumptionData && typeof consumptionData === "object" ? consumptionData : {};
  let foodPerDay = Number(cons.foodPerDay || cons.food || 0);
  let waterPerDay = Number(cons.waterPerDay || cons.water || 0);
  let strawPerDay = Number(cons.strawPerDay || cons.straw || 0);
  let estimated = !!(cons.foodEstimated || cons.waterEstimated || cons.strawEstimated);

  if (foodPerDay <= 0) {
    foodPerDay = heads * 20;
    estimated = true;
  }
  if (waterPerDay <= 0) {
    waterPerDay = heads * 30;
    estimated = true;
  }
  if (strawPerDay <= 0) {
    strawPerDay = heads * 5;
    estimated = true;
  }

  let availableFood =
    Number(foodReport.availableFood) ||
    Number(foodReport.totalMixedRation) ||
    Number(foodReport.food) ||
    0;
  if (availableFood <= 0) {
    availableFood =
      (Number(foodReport.hay) || 0) +
      (Number(foodReport.silage) || 0) +
      (Number(foodReport.grass) || 0) +
      (Number(foodReport.forage) || 0);
  }
  const water = Number(foodReport.water) || 0;
  const straw = Number(foodReport.straw) || 0;

  function daysFor(stock: number, perDay: number): number | null {
    if (!Number.isFinite(stock) || stock <= 0) return null;
    if (!Number.isFinite(perDay) || perDay <= 0) return null;
    return stock / perDay;
  }

  return {
    durationDays: {
      food: daysFor(availableFood, foodPerDay),
      water: daysFor(water, waterPerDay),
      straw: daysFor(straw, strawPerDay),
    },
    durationEstimated: estimated,
    consumptionPerDay: { food: foodPerDay, water: waterPerDay, straw: strawPerDay },
  };
}
