/**
 * Pasture parse / report / warning logic — ported from modules/pastures.js
 * Pure TypeScript; UI layers localized strings via t()/tOr().
 */

import { entityOwnerFarmId, isMultiFarmEnabled } from "@/lib/farm-scope";
import {
  buildFoodWaterDecisions,
  computeFoodDurationEstimates,
} from "@/lib/pastures-warnings";
import {
  countLivestockHeads,
  husbandryHeadCount,
  resolvePastureDisplayCapacity,
} from "@/lib/livestock-format";
import { normalizeLivestockAnimals } from "@/lib/livestock-normalize";
import type {
  ConditionReport,
  FoodReport,
  HusbandryRow,
  MilkProductionData,
  Pasture,
  PastureAnimal,
  PastureWarning,
} from "@/lib/pastures-types";
import { t, tOr } from "@/i18n/i18n";

export {
  countLivestockHeads,
  husbandryHeadCount,
  resolvePastureDisplayCapacity,
} from "@/lib/livestock-format";

function pastureHeadWeight(animal: PastureAnimal): number {
  if (!animal || animal.__emptyPen) return 0;
  if (animal.__lodClusterAggregate && Number(animal.clusterCount) > 0) {
    return Number(animal.clusterCount);
  }
  return 1;
}

function isUnmeasuredSynthAnimal(animal: PastureAnimal): boolean {
  if (animal.__detailHydrated) return false;
  return !!(animal.__lodSynth || animal.__lodSynthEstimate);
}

/** Sex and health from the same animal rows the livestock table uses. */
export function summarizePastureAnimals(animals: PastureAnimal[] | null | undefined): {
  maleCount: number;
  femaleCount: number;
  unknownSexCount: number;
  avgHealth: number;
  avgHealthKnown: boolean;
} {
  let maleCount = 0;
  let femaleCount = 0;
  let unknownSexCount = 0;
  let healthWeighted = 0;
  let healthHeads = 0;
  for (const animal of animals || []) {
    if (!animal || animal.__emptyPen) continue;
    const heads = pastureHeadWeight(animal);
    if (heads <= 0) continue;
    const g = String(animal.gender ?? (animal as { sex?: string }).sex ?? "").toLowerCase();
    if (g === "male" || g === "m") maleCount += heads;
    else if (g === "female" || g === "f") femaleCount += heads;
    else unknownSexCount += heads;
    if (isUnmeasuredSynthAnimal(animal)) continue;
    if (animal.health == null || animal.health === ("" as unknown)) continue;
    const h = Number(animal.health);
    if (!Number.isFinite(h)) continue;
    healthWeighted += h * heads;
    healthHeads += heads;
  }
  return {
    maleCount,
    femaleCount,
    unknownSexCount,
    avgHealth: healthHeads > 0 ? Number((healthWeighted / healthHeads).toFixed(0)) : 0,
    avgHealthKnown: healthHeads > 0,
  };
}

export function formatPastureHealthPercent(
  pasture: Pick<Pasture, "avgHealth" | "avgHealthKnown">
): string {
  if (pasture.avgHealthKnown === false) return "—";
  return `${pasture.avgHealth}%`;
}

function nestedAnimalsFromHusbandry(husbandryData: HusbandryRow): PastureAnimal[] {
  if (Array.isArray(husbandryData.animals) && husbandryData.animals.length) {
    return husbandryData.animals;
  }
  if (Array.isArray(husbandryData.livestock) && husbandryData.livestock.length) {
    return husbandryData.livestock as PastureAnimal[];
  }
  if (Array.isArray(husbandryData.animalList) && husbandryData.animalList.length) {
    return husbandryData.animalList as PastureAnimal[];
  }
  return [];
}

export function inferPastureFarmId(p: Pasture | null | undefined): number {
  if (!p) return NaN;
  const raw = p.farmId ?? (p as { ownerFarmId?: number }).ownerFarmId;
  let pid = Number(raw);
  if (Number.isFinite(pid) && pid > 0) return pid;
  for (const a of p.animals || []) {
    const aid = Number(a?.ownerFarmId ?? a?.farmId);
    if (Number.isFinite(aid) && aid > 0) return aid;
  }
  return NaN;
}

export function filterPasturesForFarmView(
  pastures: Pasture[],
  farmId: number | null | undefined,
  farmInfo: unknown
): Pasture[] {
  if (!Array.isArray(pastures)) return [];
  const fid = Number(farmId);
  const multiFarm = isMultiFarmEnabled(farmInfo);

  if (!Number.isFinite(fid) || fid <= 0) {
    return pastures.slice();
  }

  const filtered = pastures.filter((p) => {
    const pid = inferPastureFarmId(p);
    if (Number.isFinite(pid) && pid > 0) return pid === fid;
    return !multiFarm;
  });

  if (!multiFarm && filtered.length === 0 && pastures.length > 0) {
    const anyResolved = pastures.some((p) => {
      const pid = inferPastureFarmId(p);
      return Number.isFinite(pid) && pid > 0;
    });
    if (!anyResolved) return pastures.slice();
  }

  return filtered;
}

function husbandryReportsZeroAnimals(h: HusbandryRow): boolean {
  if (!h || typeof h !== "object") return false;

  if (h.__detailHydrated === true && Array.isArray(h.animals) && h.animals.length > 0) {
    return false;
  }

  if (husbandryHeadCount(h) > 0) return false;

  const clusters = Array.isArray(h.clusters) ? h.clusters : [];
  if (clusters.some((c) => c && Number(c.count) > 0)) return false;

  const ac = Number(h.animalCount);
  const na = Number(h.numAnimals);
  if (Number.isFinite(ac) && ac > 0) return false;
  if (Number.isFinite(na) && na > 0) return false;

  const lists = [h.animals, h.livestock, h.animalList].filter(Array.isArray) as PastureAnimal[][];
  let groupedHeads = 0;
  for (const list of lists) {
    for (const g of list) {
      if (!g || typeof g !== "object") continue;
      const num = Number(g.numAnimals ?? g.count);
      if (Number.isFinite(num) && num > 0) {
        groupedHeads += num;
        continue;
      }
      if (
        g.id &&
        (g.numAnimals === undefined || Number(g.numAnimals) <= 1) &&
        (g.uniqueId != null || g.age !== undefined || g.weight !== undefined)
      ) {
        return false;
      }
      if (g.id != null && !Number.isFinite(num)) return false;
    }
  }
  if (groupedHeads > 0) return false;
  return true;
}

function husbandryRowHasStock(h: HusbandryRow): boolean {
  if (!h || typeof h !== "object") return false;
  if (husbandryHeadCount(h) > 0) return true;
  if (Number(h.animalCount) > 0 || Number(h.numAnimals) > 0) return true;
  const clusters = h.clusters;
  if (Array.isArray(clusters) && clusters.some((c) => c && Number(c.count) > 0)) return true;
  if (Array.isArray(h.animals) && h.animals.length > 0) return true;
  return false;
}

function stockCountFromHusbandry(h: HusbandryRow | null | undefined): number {
  return husbandryHeadCount(h);
}

/** Prefer engine-reported heads when they disagree with row/cluster sums. */
function resolvePastureAnimalCount(
  stockingAnimals: PastureAnimal[],
  husbandry: HusbandryRow | null | undefined
): number {
  const fromRows = countLivestockHeads(stockingAnimals);
  const reported = Number(husbandry?.numOfAnimalsReported);
  if (Number.isFinite(reported) && reported > 0) return Math.floor(reported);
  if (fromRows > 0) return fromRows;
  return stockCountFromHusbandry(husbandry);
}

export function estimatePastureCapacity(filename: string | null | undefined): number {
  if (!filename) return 20;
  const lowerFilename = filename.toLowerCase();
  if (lowerFilename.includes("cowbarnbig") || lowerFilename.includes("large")) return 80;
  if (lowerFilename.includes("cowbarnmedium") || lowerFilename.includes("medium")) return 45;
  if (lowerFilename.includes("cowbarnsmall") || lowerFilename.includes("small")) return 15;
  if (lowerFilename.includes("chickencoop")) return 30;
  if (lowerFilename.includes("pigbarn")) return 25;
  if (lowerFilename.includes("sheepbarn")) return 25;
  if (lowerFilename.includes("horsestable")) return 10;
  return 20;
}

export function calculateConditionReport(
  animals: PastureAnimal[],
  husbandryData?: HusbandryRow | null
): ConditionReport {
  if (husbandryData) {
    const productionData = husbandryData.productionData || {};
    const consumptionData = husbandryData.consumptionData || {};
    const storageData = husbandryData.storageData || {};
    const hasStorageData =
      Object.keys(storageData).length > 0 &&
      Object.values(storageData).some((val) => (val || 0) > 0);

    const hasProductionData =
      (husbandryData.productivity ?? 0) > 0 ||
      (productionData.milkPerDay ?? 0) > 0 ||
      (productionData.milk ?? 0) > 0 ||
      (productionData.eggsPerDay ?? 0) > 0 ||
      (productionData.eggs ?? 0) > 0 ||
      (productionData.woolPerDay ?? 0) > 0 ||
      (productionData.wool ?? 0) > 0 ||
      (productionData.manurePerDay ?? 0) > 0 ||
      (productionData.manure ?? 0) > 0 ||
      (productionData.slurryPerDay ?? 0) > 0 ||
      (productionData.liquidManure ?? 0) > 0 ||
      (Number(consumptionData.strawPerDay) || 0) > 0 ||
      (Number(consumptionData.straw) || 0) > 0 ||
      (Number(consumptionData.foodPerDay) || 0) > 0 ||
      (Number(consumptionData.food) || 0) > 0 ||
      (Number(consumptionData.waterPerDay) || 0) > 0 ||
      (Number(consumptionData.water) || 0) > 0 ||
      hasStorageData;

    if (hasProductionData) {
      const p0 = Number(husbandryData.productivity);
      const productivityPct = Number.isFinite(p0) ? p0 * 100 : 0;
      return {
        productivity: productivityPct,
        milk: productionData.milkPerDay || productionData.milk || 0,
        straw: Number(consumptionData.strawPerDay || consumptionData.straw) || 0,
        manure: productionData.manurePerDay || productionData.manure || 0,
        slurry: productionData.slurryPerDay || productionData.liquidManure || 0,
        pallets: productionData.palletsPerDay || productionData.pallets || 0,
        eggs: productionData.eggsPerDay || productionData.eggs || 0,
        wool: productionData.woolPerDay || productionData.wool || 0,
        water: Number(consumptionData.waterPerDay || consumptionData.water) || 0,
        food: Number(consumptionData.foodPerDay || consumptionData.food) || 0,
        hasRealData: true,
      };
    }
  }

  let totalProductivity = 0;
  let milkProduction = 0;
  let strawConsumption = 0;
  let manureProduction = 0;

  animals.forEach((animal) => {
    if (animal.genetics) {
      totalProductivity += (animal.genetics.productivity || 0) * 100;
    }
    if (animal.isLactating && animal.subType?.includes("COW")) {
      milkProduction += 20;
    }
    strawConsumption += 1;
    if (animal.subType?.includes("COW")) manureProduction += 3;
    else if (animal.subType?.includes("PIG")) manureProduction += 2;
    else manureProduction += 1;
  });

  return {
    productivity: animals.length > 0 ? Number((totalProductivity / animals.length).toFixed(1)) : 0,
    milk: milkProduction,
    straw: strawConsumption,
    manure: manureProduction,
    slurry: 0,
    pallets: 0,
    eggs: 0,
    wool: 0,
    water: 0,
    food: 0,
    hasRealData: false,
  };
}

export function calculateMilkProduction(
  _pasture: { name?: string },
  animals: PastureAnimal[]
): MilkProductionData {
  let totalMilkProduction = 0;
  let lactatingAnimals = 0;
  let totalProductivity = 0;

  animals.forEach((animal) => {
    const subTypeUpper = (animal.subType || "").toUpperCase();
    const isDairyCow = subTypeUpper.includes("COW") || subTypeUpper === "COW";
    const isDairyGoat = subTypeUpper.includes("GOAT") || subTypeUpper === "GOAT";
    const isDairyAnimal = isDairyCow || isDairyGoat;

    if (!isDairyAnimal) return;

    const isAdult = (animal.age ?? 0) >= 18;
    const isFemale = animal.gender === "female" || animal.gender === "FEMALE";
    const isLactating = animal.isLactating === true || animal.isLactating === "true";
    const hasLactatingFlag = "isLactating" in animal;
    const canLactate = hasLactatingFlag ? isLactating : true;
    const canProduceMilk = isAdult && isFemale && canLactate;

    if (!canProduceMilk) return;

    lactatingAnimals++;
    const productivity = (animal.health || 100) / 100;
    totalProductivity += productivity;

    let baseDailyProduction = 0;
    if (isDairyCow) {
      if (subTypeUpper.includes("HOLSTEIN")) baseDailyProduction = 200;
      else if (subTypeUpper.includes("BRAHMAN") || subTypeUpper.includes("ANGUS")) {
        baseDailyProduction = 100;
      } else baseDailyProduction = 150;
    } else if (isDairyGoat) {
      baseDailyProduction = 30;
    }

    totalMilkProduction += (baseDailyProduction * productivity) / 24;
  });

  return {
    lactatingCows: lactatingAnimals,
    hourlyProduction: totalMilkProduction,
    estimatedStorage: 0,
    avgProductivity: lactatingAnimals > 0 ? totalProductivity / lactatingAnimals : 0.9,
  };
}

function applyFoodDurationEstimates(
  foodReport: FoodReport,
  husbandryData: HusbandryRow | null | undefined,
  animalCount: number
): FoodReport {
  if (!foodReport || foodReport.hasRealData === false) return foodReport;
  const heads =
    Number(animalCount) ||
    Number(husbandryData?.animalCount) ||
    Number(husbandryData?.numOfAnimalsReported) ||
    0;
  const est = computeFoodDurationEstimates(
    foodReport,
    husbandryData?.consumptionData as Parameters<typeof computeFoodDurationEstimates>[1],
    heads
  );
  if (!est) return foodReport;
  return { ...foodReport, ...est };
}

export function calculateFoodReport(
  husbandryData: HusbandryRow | null | undefined,
  animalCount?: number,
  husbandryTotals?: Record<string, number> | null
): FoodReport {
  const headCount =
    Number(animalCount) > 0 ? Number(animalCount) : stockCountFromHusbandry(husbandryData);

  if (husbandryData && typeof husbandryData === "object") {
    const storageData = husbandryData.storageData || {};
    const fillLevels = husbandryData.fillLevels || {};

    const hasStorageData = Object.keys(storageData).length > 0;
    const hasFillLevelsData =
      typeof fillLevels === "object" && Object.keys(fillLevels).length > 0;
    const hasForageSpecifically = storageData.FORAGE !== undefined;
    const hasAnyFoodData = hasStorageData || hasFillLevelsData || hasForageSpecifically;

    if (hasAnyFoodData) {
      const totalCapacity =
        (storageData.wheatCapacity || 0) +
          (storageData.barleyCapacity || 0) +
          (storageData.oatCapacity || 0) +
          (storageData.canolaCapacity || 0) +
          (storageData.soybeanCapacity || 0) +
          (storageData.cornCapacity || 0) +
          (storageData.sunflowerCapacity || 0) +
          (storageData.silageCapacity || 0) +
          (storageData.totalmixedrationCapacity || 0) || 1000;

      const availableFood = parseFloat(String(fillLevels["Available Food"])) || 0;
      const forage = parseFloat(String(storageData.FORAGE)) || 0;
      const hay = parseFloat(String(storageData.DRYGRASS_WINDROW)) || 0;
      const silage = parseFloat(String(storageData.SILAGE)) || 0;
      const grass = parseFloat(String(storageData.GRASS_WINDROW)) || 0;
      const tmr = parseFloat(String(storageData.TOTALMIXEDRATION)) || 0;

      let milkFromStorage = 0;
      let manureFromStorage = 0;
      let slurryFromStorage = 0;
      let liquidManureFromStorage = 0;
      let hasAggregatedData = false;

      if (husbandryTotals) {
        milkFromStorage = parseFloat(String(husbandryTotals.MILK)) || 0;
        manureFromStorage = parseFloat(String(husbandryTotals.MANURE)) || 0;
        slurryFromStorage = parseFloat(String(husbandryTotals.SLURRY)) || 0;
        liquidManureFromStorage = parseFloat(String(husbandryTotals.LIQUIDMANURE)) || 0;
        hasAggregatedData = true;
      } else if (husbandryData.aggregatedStorage?.totalMilk) {
        milkFromStorage = parseFloat(String(husbandryData.aggregatedStorage.totalMilk)) || 0;
        hasAggregatedData = true;
      } else {
        milkFromStorage = parseFloat(String(storageData.MILK)) || 0;
      }

      const liquidManure =
        liquidManureFromStorage ||
        parseFloat(String(storageData.liquidManure)) ||
        parseFloat(String(storageData.LIQUIDMANURE)) ||
        parseFloat(String(storageData.SLURRY)) ||
        0;
      const manure = manureFromStorage || parseFloat(String(storageData.MANURE)) || 0;
      const straw =
        parseFloat(String(storageData.straw)) || parseFloat(String(storageData.STRAW)) || 0;
      const water =
        parseFloat(String(storageData.water)) || parseFloat(String(storageData.WATER)) || 0;

      const productionData = husbandryData.productionData || {};
      const milkProduction =
        milkFromStorage ||
        parseFloat(String(productionData.MILK)) ||
        parseFloat(String(productionData.milk)) ||
        0;
      const manureProduction =
        manure ||
        parseFloat(String(productionData.MANURE)) ||
        parseFloat(String(productionData.manure)) ||
        0;
      const liquidManureProduction =
        liquidManure ||
        parseFloat(String(productionData.LIQUIDMANURE)) ||
        parseFloat(String(productionData.liquidManure)) ||
        0;
      const meadowProduction =
        parseFloat(String(storageData.MEADOW)) ||
        parseFloat(String(productionData.MEADOW)) ||
        parseFloat(String(productionData.meadow)) ||
        0;

      const result: FoodReport = {
        totalCapacity: totalCapacity || 10000,
        availableFood,
        totalMixedRation: availableFood || forage || tmr,
        hay,
        silage,
        grass,
        forage,
        food: availableFood || forage || tmr || hay || silage || grass || 0,
        water,
        waterCapacity: parseFloat(String(storageData.waterCapacity)) || 0,
        straw,
        strawCapacity: parseFloat(String(storageData.strawCapacity)) || 0,
        liquidManure: liquidManureProduction,
        liquidManureCapacity: parseFloat(String(storageData.liquidManureCapacity)) || 0,
        milk: milkProduction,
        manure: manureProduction,
        MANURE: manure,
        SLURRY: slurryFromStorage || parseFloat(String(storageData.SLURRY)) || 0,
        LIQUIDMANURE: liquidManure,
        meadow: meadowProduction,
        milkRate: parseFloat(String(productionData.milkPerHour)) || 0,
        liquidManureRate: parseFloat(String(productionData.liquidManurePerHour)) || 0,
        hasRealData: true,
        hasAggregatedData,
        aggregatedInfo: hasAggregatedData ? husbandryData.aggregatedStorage : null,
      };

      return applyFoodDurationEstimates(result, husbandryData, headCount);
    }
  }

  if (husbandryData?.foodData && typeof husbandryData.foodData === "object") {
    const fd = husbandryData.foodData;
    const availableFood =
      Number(fd.availableFood) || Number(fd.totalMixedRation) || Number(fd.food) || 0;
    return applyFoodDurationEstimates(
      {
        totalCapacity: fd.totalCapacity || 1000,
        availableFood,
        totalMixedRation: fd.totalMixedRation || availableFood || 0,
        hay: fd.hay || 0,
        silage: fd.silage || 0,
        grass: fd.grass || 0,
        food: availableFood || fd.food || 0,
        water: fd.water || 0,
        straw: fd.straw || 0,
        hasRealData: true,
      },
      husbandryData,
      headCount
    );
  }

  return {
    totalCapacity: 1000,
    totalMixedRation: 0,
    hay: 0,
    silage: 0,
    grass: 0,
    food: 0,
    water: 0,
    hasRealData: false,
  };
}

export function calculateAllPastureWarnings(
  pasture: HusbandryRow | Pasture,
  animals: PastureAnimal[],
  conditionReport: ConditionReport,
  foodReport: FoodReport
): PastureWarning[] {
  const warnings: PastureWarning[] = [];
  const stocked = Array.isArray(animals) ? animals.filter((a) => a && !a.__emptyPen) : [];
  const heads = countLivestockHeads(stocked);
  if (heads === 0 || (pasture as Pasture).isEmptyPasture) return warnings;

  const foodWaterDecisions = buildFoodWaterDecisions(heads, foodReport);
  for (const d of foodWaterDecisions) {
    if (d.type === "data_unavailable" && d.subtype === "food") {
      warnings.push({
        type: "data_unavailable",
        subtype: "food",
        severity: "info",
        message: t("pastures.warnNoFoodTelemetry", { count: d.count ?? heads }),
        icon: "bi-question-circle",
        details: {
          animalCount: d.count,
          message: t("pastures.warnFoodTelemetryHint"),
        },
      });
    } else if (d.type === "data_unavailable" && d.subtype === "water") {
      warnings.push({
        type: "data_unavailable",
        subtype: "water",
        severity: "info",
        message: t("pastures.warnNoWaterTelemetry", { count: d.count ?? heads }),
        icon: "bi-question-circle",
        details: {
          animalCount: d.count,
          message: t("pastures.warnWaterTelemetryHint"),
        },
      });
    } else if (d.type === "food") {
      warnings.push({
        type: "food",
        severity: d.severity,
        message: `Low totalMixedRation: ${(d.percent ?? 0).toFixed(0)}% remaining`,
        icon: "bi-basket",
      });
    }
  }

  const sickAnimals = stocked.filter((a) => (a.health ?? 100) < 70);
  const sickHeads = countLivestockHeads(sickAnimals);
  if (sickHeads > 0) {
    const criticalAnimals = sickAnimals.filter((a) => (a.health ?? 100) < 20);
    const criticalHeads = countLivestockHeads(criticalAnimals);
    warnings.push({
      type: "health",
      severity: criticalHeads > 0 ? "danger" : "warning",
      message: t("pastures.warnLowHealth", { sick: sickHeads, critical: criticalHeads }),
      icon: "bi-heart-pulse",
      affectedAnimals: sickAnimals,
      details: { total: sickHeads, critical: criticalHeads, warning: sickHeads - criticalHeads },
    });
  }

  const lactatingCows = stocked.filter((a) => a.isLactating && a.subType?.includes("COW"));
  const lactatingHeads = countLivestockHeads(lactatingCows);
  if (lactatingHeads > 5) {
    warnings.push({
      type: "production",
      severity: "info",
      message: t("pastures.warnHighMilk", { milk: conditionReport.milk, cows: lactatingHeads }),
      icon: "bi-droplet-fill",
      affectedAnimals: lactatingCows,
      details: { totalProduction: conditionReport.milk, cowCount: lactatingHeads },
    });
  }

  const manureStorage = foodReport?.MANURE ? foodReport.MANURE : 0;
  const slurryStorage = foodReport?.SLURRY ? foodReport.SLURRY : 0;
  const liquidManureStorage = foodReport?.LIQUIDMANURE ? foodReport.LIQUIDMANURE : 0;
  const totalManureStorage = manureStorage + slurryStorage + liquidManureStorage;
  if (totalManureStorage > 500) {
    warnings.push({
      type: "maintenance",
      severity: "warning",
      message: t("pastures.warnManureStorage", { storage: totalManureStorage.toFixed(1) }),
      icon: "bi-recycle",
    });
  }

  const maleAnimals = stocked.filter((a) => a.gender?.toLowerCase() === "male");
  const femaleAnimals = stocked.filter((a) => a.gender?.toLowerCase() === "female");
  const maleHeads = countLivestockHeads(maleAnimals);
  const femaleHeads = countLivestockHeads(femaleAnimals);
  if (maleHeads > 0 && femaleHeads > 10) {
    const ratio = femaleHeads / maleHeads;
    if (ratio > 20) {
      warnings.push({
        type: "breeding",
        severity: "info",
        message: t("pastures.warnBreedingRatio", { ratio: ratio.toFixed(0) }),
        icon: "bi-gender-ambiguous",
      });
    }
  }

  const oldAnimals = stocked.filter((a) => {
    const lifeExpectancy: Record<string, number> = {
      COW: 240,
      PIG: 180,
      SHEEP: 144,
      GOAT: 168,
      HORSE: 360,
      CHICKEN: 96,
    };
    const type = a.type || a.subType?.split("_")[0] || "";
    const maxAge = lifeExpectancy[type] || 200;
    return (a.age ?? 0) > maxAge * 0.8;
  });
  const oldHeads = countLivestockHeads(oldAnimals);
  if (heads > 0 && oldHeads > heads * 0.3) {
    warnings.push({
      type: "age",
      severity: "warning",
      message: t("pastures.warnAgingAnimals", { count: oldHeads }),
      icon: "bi-clock-history",
      affectedAnimals: oldAnimals,
      details: { total: oldHeads, percentage: Math.round((oldHeads / heads) * 100) },
    });
  }

  const dairyAnimals = animals.filter(
    (a) =>
      a.isLactating &&
      (a.subType?.includes("COW") || a.subType?.includes("GOAT") || a.subType?.includes("SHEEP"))
  );

  if (dairyAnimals.length > 0) {
    const potentialOffspring: Array<{
      mother: PastureAnimal;
      offspring: PastureAnimal[];
      type: string;
    }> = [];

    dairyAnimals.forEach((mother) => {
      const motherType = mother.subType?.split("_")[0] || mother.type || "";
      const youngOfSameType = animals.filter((animal) => {
        const animalType = animal.subType?.split("_")[0] || animal.type;
        return (
          animalType === motherType &&
          (animal.age ?? 0) < 12 &&
          animal.id !== mother.id &&
          !animal.isLactating
        );
      });
      if (youngOfSameType.length > 0) {
        potentialOffspring.push({ mother, offspring: youngOfSameType, type: motherType });
      }
    });

    if (potentialOffspring.length > 0) {
      const totalOffspring = potentialOffspring.reduce((sum, pair) => sum + pair.offspring.length, 0);
      const totalMothers = potentialOffspring.length;
      warnings.push({
        type: "dairy_optimization",
        severity: "info",
        message: t("pastures.warnDairySeparate", {
          mothers: totalMothers,
          offspring: totalOffspring,
        }),
        icon: "bi-droplet-half",
        affectedAnimals: [
          ...potentialOffspring.map((p) => p.mother),
          ...potentialOffspring.flatMap((p) => p.offspring),
        ],
        details: {
          motherOffspringPairs: potentialOffspring,
          totalMothers,
          totalOffspring,
          potentialMilkGain: totalMothers * 15,
        },
      });
    }
  }

  const animalsDueSoon = animals.filter((animal) => {
    if (!animal.isPregnant) return false;
    const animalType = animal.type || animal.subType?.split("_")[0] || "";
    const gestationPeriods: Record<string, number> = {
      COW: 9,
      PIG: 4,
      SHEEP: 5,
      GOAT: 5,
      HORSE: 11,
      CHICKEN: 1,
    };
    const gestationMonths = gestationPeriods[animalType] || 6;
    const reproductionPercent = (animal.reproduction || 0) * 100;
    let pregnancyProgress = 0.2;
    if (reproductionPercent > 80) pregnancyProgress = 0.8;
    else if (reproductionPercent > 60) pregnancyProgress = 0.6;
    else if (reproductionPercent > 40) pregnancyProgress = 0.4;
    const monthsRemaining = Math.max(0, Math.round(gestationMonths * (1 - pregnancyProgress)));
    return monthsRemaining <= 1;
  });

  if (animalsDueSoon.length > 0) {
    const dueNames = animalsDueSoon
      .slice(0, 3)
      .map((a) => a.name || `#${a.id}`)
      .join(", ");
    const moreCount = animalsDueSoon.length > 3 ? animalsDueSoon.length - 3 : 0;
    const displayNames = moreCount > 0 ? `${dueNames} +${moreCount}` : dueNames;
    warnings.push({
      type: "birth",
      severity: "warning",
      message: `${animalsDueSoon.length} animal${animalsDueSoon.length > 1 ? "s" : ""} due to give birth soon`,
      icon: "bi-exclamation-triangle",
      details: { dueCount: animalsDueSoon.length, dueNames: displayNames, animals: animalsDueSoon },
    });
  }

  return warnings;
}

function buildPastureFromHusbandryRow(
  husbandryData: HusbandryRow,
  husbandryTotals?: Record<string, number> | null
): Pasture {
  const nestedAnimals = nestedAnimalsFromHusbandry(husbandryData);
  const stockingCount = stockCountFromHusbandry(husbandryData);
  const stock = summarizePastureAnimals(nestedAnimals);
  const conditionReport = calculateConditionReport(nestedAnimals, husbandryData);
  const milkProductionData = calculateMilkProduction({ name: husbandryData.name }, nestedAnimals);
  const foodReportInput = {
    ...husbandryData,
    calculatedMilkProduction: milkProductionData.estimatedStorage,
  };
  const foodReport = calculateFoodReport(foodReportInput, stockingCount, husbandryTotals);
  const allWarnings = calculateAllPastureWarnings(
    husbandryData,
    nestedAnimals,
    conditionReport,
    foodReport
  );
  const husbandryHealth = Number(husbandryData.health);
  const husbandryHealthKnown =
    typeof husbandryData.health === "number" && Number.isFinite(husbandryHealth);
  return {
    id: husbandryData.id ?? "",
    name: husbandryData.name || husbandryData.buildingName || `Pen ${husbandryData.id}`,
    animals: nestedAnimals,
    animalCount: stockingCount,
    maleCount: stock.maleCount,
    femaleCount: stock.femaleCount,
    unknownSexCount: stock.unknownSexCount,
    avgHealth: stock.avgHealthKnown
      ? stock.avgHealth
      : husbandryHealthKnown
        ? husbandryHealth
        : 0,
    avgHealthKnown: stock.avgHealthKnown || husbandryHealthKnown,
    conditionReport,
    foodReport,
    milkProductionData,
    allWarnings,
    farmId: husbandryData.ownerFarmId ?? husbandryData.farmId ?? "Unknown",
    capacity: resolvePastureDisplayCapacity(husbandryData, estimatePastureCapacity),
    husbandryData,
  };
}

export interface ParsePastureInput {
  animals?: PastureAnimal[] | null;
  husbandryData?: HusbandryRow[] | null;
  placeables?: Array<Record<string, unknown>> | null;
  activeFarmId?: number | null;
  husbandryTotals?: Record<string, number> | null;
}

export function parsePastureData(input: ParsePastureInput): Pasture[] {
  const pastures: Pasture[] = [];
  const animals = Array.isArray(input.animals) ? input.animals : [];
  const husbandryData = Array.isArray(input.husbandryData) ? input.husbandryData : [];
  const husbandryTotals = input.husbandryTotals ?? null;
  const activeFarmId = Number(input.activeFarmId ?? 1);

  if (animals.length > 0 && animals.some((a) => a && a.husbandryId != null && String(a.husbandryId) !== "")) {
    const animalsByHusbandry: Record<
      string,
      { id: string | number; name: string; animals: PastureAnimal[]; ownerFarmId?: number }
    > = {};

    animals.forEach((animal) => {
      const husbandryId = animal.husbandryId ?? animal.id ?? "unknown";
      const key = String(husbandryId);
      const locationName = animal.husbandryName || animal.location || "Unknown Location";
      if (!animalsByHusbandry[key]) {
        animalsByHusbandry[key] = {
          id: husbandryId,
          name: locationName,
          animals: [],
          ownerFarmId: animal.ownerFarmId || animal.farmId,
        };
      }
      animalsByHusbandry[key].animals.push(animal);
    });

    Object.values(animalsByHusbandry).forEach((group) => {
      const pastureAnimals = group.animals;
      const stockingAnimals = pastureAnimals.filter((a) => a && !a.__emptyPen);

      let originalHusbandry: HusbandryRow | null = null;
      if (husbandryData.length > 0) {
        originalHusbandry =
          husbandryData.find((h) => h.id === group.id || h.name === group.name) ?? null;
      }

      const stock = summarizePastureAnimals(stockingAnimals);
      const conditionReport = calculateConditionReport(stockingAnimals, originalHusbandry);
      const milkProductionData = calculateMilkProduction({ name: group.name }, stockingAnimals);
      const foodReportInput = {
        ...(originalHusbandry || group),
        calculatedMilkProduction: milkProductionData.estimatedStorage,
      } as HusbandryRow;
      const foodReport = calculateFoodReport(
        foodReportInput,
        resolvePastureAnimalCount(stockingAnimals, originalHusbandry),
        husbandryTotals
      );
      const allWarnings = calculateAllPastureWarnings(
        group as unknown as HusbandryRow,
        stockingAnimals,
        conditionReport,
        foodReport
      );

      pastures.push({
        id: group.id,
        name: group.name,
        animals: pastureAnimals,
        animalCount: resolvePastureAnimalCount(stockingAnimals, originalHusbandry),
        maleCount: stock.maleCount,
        femaleCount: stock.femaleCount,
        unknownSexCount: stock.unknownSexCount,
        avgHealth: stock.avgHealth,
        avgHealthKnown: stock.avgHealthKnown,
        conditionReport,
        foodReport,
        milkProductionData,
        allWarnings,
        farmId: group.ownerFarmId || "Unknown",
        capacity: resolvePastureDisplayCapacity(
          originalHusbandry || { name: group.name },
          estimatePastureCapacity
        ),
        husbandryData: originalHusbandry,
      });
    });
  } else if (husbandryData.some(husbandryRowHasStock)) {
    husbandryData.forEach((h) => {
      const hf = entityOwnerFarmId(h);
      if (hf > 0 && hf !== activeFarmId) return;
      if (!husbandryRowHasStock(h)) return;
      pastures.push(buildPastureFromHusbandryRow(h, husbandryTotals));
    });
  } else if (Array.isArray(input.placeables) && input.placeables.length > 0) {
    input.placeables.forEach((placeable) => {
      if (
        placeable.type === "Livestock Building" &&
        Array.isArray(placeable.animals) &&
        (placeable.animals as PastureAnimal[]).length > 0
      ) {
        const pastureAnimals = placeable.animals as PastureAnimal[];
        const stock = summarizePastureAnimals(pastureAnimals);
        const conditionReport = calculateConditionReport(pastureAnimals);
        const milkProductionData = calculateMilkProduction(
          { name: String(placeable.name || "") },
          pastureAnimals
        );
        const placeableWithMilk = {
          ...placeable,
          calculatedMilkProduction: milkProductionData.estimatedStorage,
        } as HusbandryRow;
        const foodReport = calculateFoodReport(
          placeableWithMilk,
          countLivestockHeads(pastureAnimals),
          husbandryTotals
        );
        const allWarnings = calculateAllPastureWarnings(
          placeable as HusbandryRow,
          pastureAnimals,
          conditionReport,
          foodReport
        );
        pastures.push({
          id: (placeable.uniqueId as string | number) ?? String(placeable.name),
          name: String(placeable.name || "Pasture"),
          animals: pastureAnimals,
          animalCount: countLivestockHeads(pastureAnimals),
          maleCount: stock.maleCount,
          femaleCount: stock.femaleCount,
          unknownSexCount: stock.unknownSexCount,
          avgHealth: stock.avgHealth,
          avgHealthKnown: stock.avgHealthKnown,
          conditionReport,
          foodReport,
          milkProductionData,
          allWarnings,
          farmId: (placeable.farmId as string | number) || "Unknown",
          filename: placeable.filename as string | undefined,
          capacity: resolvePastureDisplayCapacity(
            {
              maxAnimals: Number(placeable.maxAnimals) || undefined,
              capacity: Number(placeable.capacity) || undefined,
              filename: placeable.filename as string | undefined,
              name: String(placeable.name || ""),
            },
            estimatePastureCapacity
          ),
        });
      }
    });
  } else if (animals.length > 0) {
    const animalsByLocation: Record<
      string,
      { name: string; animals: PastureAnimal[]; uniqueId: string; farmId?: number }
    > = {};
    animals.forEach((animal) => {
      const location = animal.location || "Unknown";
      if (location !== "Unknown" && animal.locationType === "Livestock Building") {
        if (!animalsByLocation[location]) {
          animalsByLocation[location] = {
            name: location,
            animals: [],
            uniqueId: `pasture_${location.replace(/\s+/g, "_")}`,
            farmId: animal.farmId,
          };
        }
        animalsByLocation[location].animals.push(animal);
      }
    });

    Object.values(animalsByLocation).forEach((locationData) => {
      const pastureAnimals = locationData.animals;
      const stock = summarizePastureAnimals(pastureAnimals);
      const conditionReport = calculateConditionReport(pastureAnimals);
      const milkProductionData = calculateMilkProduction(
        { name: locationData.name },
        pastureAnimals
      );
      const locationWithMilk = {
        ...locationData,
        calculatedMilkProduction: milkProductionData.estimatedStorage,
      } as HusbandryRow;
      const foodReport = calculateFoodReport(
        locationWithMilk,
        countLivestockHeads(pastureAnimals),
        husbandryTotals
      );
      const allWarnings = calculateAllPastureWarnings(
        locationData as unknown as HusbandryRow,
        pastureAnimals,
        conditionReport,
        foodReport
      );
      pastures.push({
        id: locationData.uniqueId,
        name: locationData.name,
        animals: pastureAnimals,
        animalCount: countLivestockHeads(pastureAnimals),
        maleCount: stock.maleCount,
        femaleCount: stock.femaleCount,
        unknownSexCount: stock.unknownSexCount,
        avgHealth: stock.avgHealth,
        avgHealthKnown: stock.avgHealthKnown,
        conditionReport,
        foodReport,
        milkProductionData,
        allWarnings,
        farmId: locationData.farmId || "Unknown",
        capacity: resolvePastureDisplayCapacity(
          { name: locationData.name },
          estimatePastureCapacity
        ),
      });
    });
  }

  // Empty pens from husbandry metadata
  const existing = new Set(
    pastures.map((p) => (p && p.id != null && p.id !== "" ? String(p.id) : ""))
  );
  for (const h of husbandryData) {
    const hid = h.id ?? h.buildingId;
    if (hid == null || hid === "") continue;
    const hidStr = String(hid);
    if (existing.has(hidStr)) continue;
    if (!husbandryReportsZeroAnimals(h)) continue;

    const penName = h.name || h.buildingName || "Pen";
    const milkProductionData = calculateMilkProduction({ name: penName }, []);
    const foodReportInput = {
      ...h,
      calculatedMilkProduction: milkProductionData.estimatedStorage,
    };
    const foodReport = calculateFoodReport(foodReportInput, undefined, husbandryTotals);
    const conditionReport = calculateConditionReport([], h);
    const allWarnings = calculateAllPastureWarnings(h, [], conditionReport, foodReport);

    pastures.push({
      id: hid,
      name: penName,
      animals: [],
      animalCount: 0,
      maleCount: 0,
      femaleCount: 0,
      unknownSexCount: 0,
      avgHealth: 0,
      avgHealthKnown: false,
      conditionReport,
      foodReport,
      milkProductionData,
      allWarnings,
      farmId: h.ownerFarmId ?? h.farmId ?? "Unknown",
      capacity: resolvePastureDisplayCapacity(h, estimatePastureCapacity),
      husbandryData: h,
      isEmptyPasture: true,
    });
    existing.add(hidStr);
  }

  return pastures;
}

export function formatResourceDurationHint(
  foodReport: FoodReport | null | undefined,
  resource: "food" | "water" | "straw"
): string {
  const days = foodReport?.durationDays?.[resource];
  if (days == null || !Number.isFinite(days)) return "";
  const rounded = days >= 10 ? Math.round(days) : Math.round(days * 10) / 10;
  const est = !!foodReport?.durationEstimated;
  const keys = {
    food: est ? "pastures.card.foodLastsDaysEst" : "pastures.card.foodLastsDays",
    water: est ? "pastures.card.waterLastsDaysEst" : "pastures.card.waterLastsDays",
    straw: est ? "pastures.card.strawLastsDaysEst" : "pastures.card.strawLastsDays",
  } as const;
  const fallbacks = {
    food: est
      ? "food will last ~{{days}} days (estimated)"
      : "food will last ~{{days}} days",
    water: est
      ? "water will last ~{{days}} days (estimated)"
      : "water will last ~{{days}} days",
    straw: est
      ? "straw will last ~{{days}} days (estimated)"
      : "straw will last ~{{days}} days",
  };
  let text = tOr(keys[resource], fallbacks[resource], { days: rounded });
  if (text.includes("{{days}}")) {
    text = text.split("{{days}}").join(String(rounded));
  }
  return text;
}

export function getWarningTypeTitle(type: string): string {
  const titles: Record<string, string> = {
    health: "Health Warning",
    capacity: "Capacity Warning",
    food: "Food Warning",
    production: "Production Notice",
    maintenance: "Maintenance Required",
    breeding: "Breeding Notice",
    age: "Age Management",
    dairy_optimization: "Dairy Optimization",
    birth: "Birth Warning",
    data_unavailable: "Data Unavailable",
  };
  return titles[type] || "Warning";
}

function isLowHealthAnimalCandidate(animal: PastureAnimal): boolean {
  if (!animal || animal.__emptyPen) return false;
  const health = Number(animal.health ?? 0);
  if (!Number.isFinite(health) || health >= 70) return false;
  if (
    health <= 0 &&
    (animal.__lodSynth || animal.__lodSynthEstimate) &&
    Number(animal.weight ?? 0) <= 0
  ) {
    return false;
  }
  return true;
}

export function getLowHealthAnimalsForPastures(
  pasturesList: Pasture[]
): Array<PastureAnimal & { pastureName: string; health: number }> {
  const rows: Array<PastureAnimal & { pastureName: string; health: number }> = [];
  pasturesList.forEach((pasture) => {
    const animals = Array.isArray(pasture?.animals) ? pasture.animals : [];
    animals.forEach((animal) => {
      if (!isLowHealthAnimalCandidate(animal)) return;
      const health = Number(animal.health ?? 0);
      rows.push({ ...animal, health, pastureName: pasture?.name || "Unknown" });
    });
  });
  rows.sort((a, b) => a.health - b.health);
  return rows;
}

export function formatGenderLabel(gender: unknown): string {
  const g = String(gender ?? "").trim().toLowerCase();
  if (g === "male" || g === "m") return t("livestock.genderMale");
  if (g === "female" || g === "f") return t("livestock.genderFemale");
  return t("livestock.genderUnknown");
}

export function fmtAgeMonthsStr(m: unknown): string {
  const n = Number(m);
  const months = !Number.isFinite(n)
    ? 0
    : Math.abs(n - Math.round(n)) < 0.001
      ? Math.round(n)
      : Math.round(n * 10) / 10;
  return t("livestock.fmtAgeMonths", { months });
}

export function fmtWeightKgStr(w: unknown, decimals = 1): string {
  return t("livestock.fmtWeightKg", { kg: Number(w).toFixed(decimals) });
}

export function formatAnimalType(subType: unknown): string {
  if (subType == null || String(subType).trim() === "" || String(subType).toLowerCase() === "unknown") {
    return t("common.unknown");
  }
  const s = String(subType);
  const parts = s.split("_");
  if (parts.length > 1) {
    const type = parts[0].toLowerCase();
    const breed = parts
      .slice(1)
      .join(" ")
      .toLowerCase()
      .replace(/\b\w/g, (l) => l.toUpperCase());
    const cap = type.charAt(0).toUpperCase() + type.slice(1);
    return `${breed} ${cap}`;
  }
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/** Simplified animal value estimate (parity for table display). */
export function estimateAnimalValue(animal: PastureAnimal): number {
  if (!animal || animal.__emptyPen) return 0;
  const baseValues: Record<string, number> = {
    COW_HOLSTEIN: 1100,
    COW_ANGUS: 1050,
    COW: 1000,
    PIG: 500,
    SHEEP: 400,
    GOAT: 350,
    HORSE: 2000,
    CHICKEN: 50,
  };
  const sub = String(animal.subType || animal.type || "COW").toUpperCase();
  let base = baseValues[sub];
  if (base == null) {
    const prefix = sub.split("_")[0];
    base = baseValues[prefix] ?? 500;
  }
  const healthFactor = Math.max(0.2, (Number(animal.health) || 100) / 100);
  const heads =
    animal.__lodClusterAggregate && Number(animal.clusterCount) > 0
      ? Number(animal.clusterCount)
      : 1;
  return Math.round(base * healthFactor * heads);
}

export function getHealthClass(health: number): string {
  if (health >= 80) return "health-excellent";
  if (health >= 60) return "health-good";
  if (health >= 40) return "health-average";
  if (health >= 20) return "health-poor";
  return "health-critical";
}

/** Resolve husbandry rows from payload (animals may be pens or flat livestock). */
export function resolveHusbandryRows(payload: {
  animals?: unknown;
  production?: Record<string, unknown> | null;
}): HusbandryRow[] {
  const animals = payload.animals;
  if (!Array.isArray(animals)) return [];
  // Husbandry pens typically have storageData / clusters / animalCount without individual animal ids
  const looksLikeHusbandry = animals.some(
    (a) =>
      a &&
      typeof a === "object" &&
      ((a as HusbandryRow).storageData != null ||
        (a as HusbandryRow).clusters != null ||
        ((a as HusbandryRow).animalCount != null && (a as PastureAnimal).husbandryId == null))
  );
  if (looksLikeHusbandry) return animals as HusbandryRow[];
  return [];
}

export function resolveHusbandryTotals(
  production: Record<string, unknown> | null | undefined
): Record<string, number> | null {
  if (!production || typeof production !== "object") return null;
  const ht = production.husbandryTotals;
  if (ht && typeof ht === "object") return ht as Record<string, number>;
  return null;
}

export function parsePasturesFromPayload(
  payload: {
    animals?: unknown;
    production?: Record<string, unknown> | null;
    farmInfo?: unknown;
  } | null | undefined,
  activeFarmId: number | null | undefined,
  animalsOverride?: PastureAnimal[] | null
): Pasture[] {
  if (!payload) return [];
  const farmId = Number(activeFarmId ?? 1);
  const animals =
    animalsOverride != null
      ? animalsOverride
      : (normalizeLivestockAnimals(payload.animals, farmId).animals as PastureAnimal[]);
  const all = parsePastureData({
    animals,
    husbandryData: resolveHusbandryRows(payload),
    activeFarmId: farmId,
    husbandryTotals: resolveHusbandryTotals(payload.production),
  });
  return filterPasturesForFarmView(all, farmId, payload.farmInfo);
}
