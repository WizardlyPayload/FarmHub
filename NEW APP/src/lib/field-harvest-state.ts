/**
 * Classify FS25 harvest from FieldState growth index.
 * Giants keeps groundType HARVEST_READY after the combine; wheat cut is foliage state 10.
 */

const VANILLA_ARABLE_STAGES: Record<string, { ready: number[]; withered: number[]; harvested: number[] }> = {
  WHEAT: { ready: [8], withered: [9], harvested: [10] },
  BARLEY: { ready: [8], withered: [9], harvested: [10] },
  OAT: { ready: [5], withered: [6], harvested: [7] },
  CANOLA: { ready: [9], withered: [10], harvested: [11] },
};

function fruitKey(fruitType: unknown): string {
  return String(fruitType || "").trim().toUpperCase();
}

function isMowableForage(fruit: string): boolean {
  if (!fruit) return false;
  if (fruit === "GRASS" || fruit === "MEADOW" || fruit === "ALFALFA" || fruit === "CLOVER") return true;
  if (fruit.includes("CLOVER") || fruit.includes("MEADOW")) return true;
  if (fruit.includes("ALFALFA") && !fruit.includes("WINDROW") && !fruit.includes("BALE")) return true;
  return false;
}

export type FieldHarvestClass = {
  harvestReady: boolean;
  isHarvested: boolean;
  isWithered: boolean;
};

export function classifyFieldHarvestState(field: {
  fruitType?: unknown;
  growthState?: unknown;
  groundType?: unknown;
} | null | undefined): FieldHarvestClass {
  const fruit = fruitKey(field?.fruitType);
  const gs = parseInt(String(field?.growthState ?? "0"), 10) || 0;
  const gt = String(field?.groundType || "").toUpperCase();
  const groundReady = gt === "HARVEST_READY" || gt === "HARVEST_READY_OTHER";

  if (!fruit || fruit === "UNKNOWN" || gs <= 0 || isMowableForage(fruit) || fruit === "SPINACH") {
    return {
      harvestReady: fruit === "SPINACH" ? groundReady && gs > 0 : false,
      isHarvested: false,
      isWithered: false,
    };
  }

  const spec = VANILLA_ARABLE_STAGES[fruit];
  if (spec) {
    if (spec.harvested.includes(gs)) {
      return { harvestReady: false, isHarvested: true, isWithered: false };
    }
    if (spec.withered.includes(gs)) {
      return { harvestReady: false, isHarvested: false, isWithered: true };
    }
    if (spec.ready.includes(gs)) {
      return { harvestReady: true, isHarvested: false, isWithered: false };
    }
    return { harvestReady: false, isHarvested: false, isWithered: false };
  }

  if (groundReady && gs >= 10) {
    return { harvestReady: false, isHarvested: true, isWithered: false };
  }
  if (groundReady) {
    return { harvestReady: true, isHarvested: false, isWithered: false };
  }
  return { harvestReady: false, isHarvested: false, isWithered: false };
}

export function xmlGrowthLooksHarvested(field: {
  fruitType?: unknown;
  growthState?: unknown;
  groundType?: unknown;
} | null | undefined): boolean {
  return classifyFieldHarvestState(field).isHarvested === true;
}
