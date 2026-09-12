import type {
  AnimalGenetics,
  AnimalValueInfo,
  LivestockAnimal,
} from "./livestock-types";

const BASE_VALUES: Record<string, number> = {
  COW_HOLSTEIN: 1100,
  COW_ANGUS: 1050,
  COW_SWISS_BROWN: 1100,
  COW_LIMOUSIN: 1080,
  COW_HEREFORD: 1020,
  COW_WATERBUFFALO: 1150,
  COW_AYRSHIRE: 1000,
  COW_BRAHMAN: 1080,
  COW_BROWN_SWISS: 1050,
  COW: 1050,
  BULL_HOLSTEIN: 1200,
  BULL_ANGUS: 1150,
  BULL_SWISS_BROWN: 1200,
  BULL_LIMOUSIN: 1170,
  BULL_HEREFORD: 1100,
  BULL_WATERBUFFALO: 1250,
  BULL: 1150,
  SHEEP_SUFFOLK: 1200,
  SHEEP_DORPER: 1100,
  SHEEP_ALPINE: 1300,
  SHEEP_LANDRACE: 600,
  SHEEP: 600,
  PIG_LANDRACE: 1500,
  PIG_DUROC: 1400,
  PIG_PIETRAIN: 1100,
  PIG: 1000,
  CHICKEN_BROWN: 25,
  CHICKEN_WHITE: 25,
  CHICKEN: 5,
  ROOSTER_BROWN: 30,
  ROOSTER_WHITE: 30,
  ROOSTER: 30,
  HORSE_QUARTER: 5000,
  HORSE_CLYDESDALE: 6000,
  HORSE_HAFLINGER: 4000,
  HORSE_AMERICAN_QUARTER: 5000,
  HORSE_SEAL_BROWN: 4500,
  HORSE: 5000,
};

const TARGET_WEIGHTS: Record<string, number> = {
  COW_HOLSTEIN: 650,
  COW_ANGUS: 600,
  COW_SWISS_BROWN: 620,
  COW_LIMOUSIN: 640,
  COW_HEREFORD: 580,
  COW_WATERBUFFALO: 700,
  BULL_HOLSTEIN: 950,
  BULL_ANGUS: 900,
  BULL_SWISS_BROWN: 920,
  BULL_LIMOUSIN: 940,
  BULL_HEREFORD: 880,
  BULL_WATERBUFFALO: 1000,
  SHEEP_SUFFOLK: 80,
  SHEEP_DORPER: 75,
  SHEEP_ALPINE: 85,
  SHEEP: 80,
  PIG_LANDRACE: 120,
  PIG_DUROC: 115,
  PIG: 120,
  CHICKEN_BROWN: 2.5,
  CHICKEN_WHITE: 2.5,
  CHICKEN: 2.5,
  ROOSTER_BROWN: 3.0,
  ROOSTER_WHITE: 3.0,
  ROOSTER: 3.0,
  HORSE_QUARTER: 500,
  HORSE_CLYDESDALE: 800,
  HORSE_HAFLINGER: 450,
  HORSE_SEAL_BROWN: 500,
  HORSE: 500,
};

const MIN_WEIGHTS: Record<string, number> = {
  COW_HOLSTEIN: 40,
  COW_ANGUS: 35,
  COW_SWISS_BROWN: 38,
  COW_LIMOUSIN: 42,
  COW_HEREFORD: 32,
  COW_WATERBUFFALO: 45,
  BULL_HOLSTEIN: 42,
  BULL_ANGUS: 38,
  BULL_SWISS_BROWN: 40,
  BULL_LIMOUSIN: 45,
  BULL_HEREFORD: 35,
  BULL_WATERBUFFALO: 48,
  SHEEP_SUFFOLK: 3,
  SHEEP_DORPER: 2.8,
  SHEEP_ALPINE: 3.2,
  SHEEP: 3,
  PIG_LANDRACE: 1.5,
  PIG_DUROC: 1.4,
  PIG: 1.5,
  CHICKEN_BROWN: 0.1,
  CHICKEN_WHITE: 0.1,
  CHICKEN: 0.1,
  ROOSTER_BROWN: 0.12,
  ROOSTER_WHITE: 0.12,
  ROOSTER: 0.12,
  HORSE_QUARTER: 50,
  HORSE_CLYDESDALE: 80,
  HORSE_HAFLINGER: 45,
  HORSE_SEAL_BROWN: 50,
  HORSE: 50,
};

function lookup(map: Record<string, number>, subType: string | undefined, fallback: number): number {
  if (!subType) return fallback;
  return map[subType] ?? map[subType.split("_")[0]] ?? fallback;
}

export function calculateAnimalValue(animal: LivestockAnimal): AnimalValueInfo {
  if (animal?.__emptyPen) {
    return {
      value: 0,
      breakdown: {
        baseValue: 0,
        ageFactor: 0,
        healthFactor: 0,
        geneticsFactor: 0,
        reproductionFactor: 0,
        weightFactor: 0,
        animalType: "EMPTY_PEN",
        heads: 0,
        perHead: 0,
      },
    };
  }

  const subType = String(animal.subType || animal.type?.toString().toUpperCase() || "COW");
  const baseValue = lookup(BASE_VALUES, subType, BASE_VALUES.COW);
  const targetWeight = lookup(TARGET_WEIGHTS, subType, 100);
  const minWeight = lookup(MIN_WEIGHTS, subType, 10);
  const reproductionMinAge = 12;
  const age = animal.age || 12;

  let sellPrice: number;
  if (subType.includes("COW")) {
    if (age <= 1) sellPrice = baseValue * 0.15;
    else if (age <= 6) sellPrice = baseValue * (0.15 + (age - 1) * 0.07);
    else if (age <= 12) sellPrice = baseValue * (0.5 + (age - 6) * 0.08);
    else if (age <= 36) sellPrice = baseValue * 1.0;
    else if (age <= 120) sellPrice = baseValue * Math.max(0.6, 1.0 - ((age - 36) / 84) * 0.4);
    else sellPrice = baseValue * 0.4;
  } else if (subType.includes("BULL")) {
    if (age <= 1) sellPrice = baseValue * 0.2;
    else if (age <= 6) sellPrice = baseValue * (0.2 + (age - 1) * 0.08);
    else if (age <= 12) sellPrice = baseValue * (0.6 + (age - 6) * 0.07);
    else if (age <= 48) sellPrice = baseValue * 1.0;
    else if (age <= 120) sellPrice = baseValue * Math.max(0.5, 1.0 - ((age - 48) / 72) * 0.5);
    else sellPrice = baseValue * 0.3;
  } else if (subType.includes("HORSE")) {
    if (age < 24) sellPrice = baseValue * (0.2 + (age / 24) * 0.4);
    else if (age < 60) sellPrice = baseValue * (0.6 + ((age - 24) / 36) * 0.4);
    else if (age > 240) sellPrice = baseValue * Math.max(0.3, 1.0 - ((age - 240) / 120) * 0.7);
    else sellPrice = baseValue;
  } else {
    if (age <= 6) sellPrice = baseValue * (0.3 + age * 0.1);
    else if (age <= 24) sellPrice = baseValue;
    else sellPrice = baseValue * Math.max(0.6, 1.0 - ((age - 24) / 96) * 0.4);
  }

  let ageFactor = 1.0;
  if (age < reproductionMinAge) {
    ageFactor = 0.3 + (age / reproductionMinAge) * 0.7;
  } else if (age > 120) {
    ageFactor = Math.max(0.2, 1.0 - ((age - 120) / 120) * 0.8);
  }

  let weightFactor = 1.0;
  const weight = parseFloat(String(animal.weight)) || targetWeight;
  if (weight > 0) {
    const targetWeightForAge =
      ((targetWeight - minWeight) / (reproductionMinAge * 1.5)) *
      Math.min(age + 1.5, reproductionMinAge * 1.5) *
      0.85;
    weightFactor = 1 + (weight - targetWeightForAge) / targetWeightForAge;
  }

  const healthFactor = (animal.health || 0) / 100;
  const meatFactor = animal.genetics?.quality || 1.0;

  sellPrice = sellPrice + sellPrice * 0.25 * (meatFactor - 1);
  sellPrice = sellPrice + ((sellPrice * 0.6) / targetWeight) * weight * (-1 + meatFactor);

  if (animal.isPregnant) sellPrice = sellPrice + sellPrice * 0.25;
  if (animal.isLactating) sellPrice = sellPrice + sellPrice * 0.15;

  let finalValue: number;
  if (subType.includes("HORSE")) {
    const fitnessFactor = (animal.fitness || 0) / 100;
    const ridingFactor = (animal.riding || 0) / 100;
    const dirtFactor = (animal.dirt || 0) / 100;
    finalValue = Math.max(
      sellPrice *
        meatFactor *
        weightFactor *
        (0.3 + 0.5 * healthFactor + 0.3 * ridingFactor + 0.2 * fitnessFactor - 0.2 * dirtFactor),
      sellPrice * 0.05
    );
  } else {
    finalValue = Math.max(
      sellPrice * 0.6 + sellPrice * 0.4 * weightFactor * (0.75 * healthFactor),
      sellPrice * 0.05
    );
  }

  let geneticsFactor = 1.0;
  if (animal.genetics) {
    geneticsFactor =
      (animal.genetics.productivity || 0) * 0.4 +
      (animal.genetics.quality || 0) * 0.3 +
      (animal.genetics.health || 0) * 0.15 +
      (animal.genetics.fertility || 0) * 0.1 +
      (animal.genetics.metabolism || 0) * 0.05;
  }

  let reproductionFactor = 1.0;
  if (animal.isPregnant) reproductionFactor += 0.25;
  if (animal.isLactating) reproductionFactor += 0.15;

  const perHead = Math.round(Math.max(finalValue, baseValue * 0.05));
  const heads =
    animal.__lodClusterAggregate && Number(animal.clusterCount) > 0
      ? Math.max(1, Math.floor(Number(animal.clusterCount)))
      : 1;

  return {
    value: perHead * heads,
    breakdown: {
      baseValue,
      ageFactor,
      healthFactor,
      geneticsFactor,
      reproductionFactor,
      weightFactor,
      animalType: subType,
      heads,
      perHead,
    },
  };
}

export function getAgeDescriptionKey(age: number): string {
  if (age < 6) return "livestock.ageDescVeryYoung";
  if (age < 12) return "livestock.ageDescYoung";
  if (age < 120) return "livestock.ageDescMature";
  return "livestock.ageDescOld";
}

export function getGeneticsDescriptionKey(genetics: AnimalGenetics | null | undefined): string {
  if (!genetics) return "livestock.geneticsDescUnknown";
  const avg =
    ((genetics.health || 0) +
      (genetics.metabolism || 0) +
      (genetics.fertility || 0) +
      (genetics.quality || 0) +
      (genetics.productivity || 0)) /
    5;
  if (avg > 1.8) return "livestock.geneticsDescExcellent";
  if (avg > 1.6) return "livestock.geneticsDescGood";
  if (avg > 1.4) return "livestock.geneticsDescAverage";
  if (avg > 1.2) return "livestock.geneticsDescBelowAverage";
  return "livestock.geneticsDescPoor";
}

export function getPregnancyEstimate(animal: LivestockAnimal): {
  monthsRemaining: number;
  pregnancyProgress: number;
  expectedCount: string | number;
} {
  const gestationPeriods: Record<string, number> = {
    COW: 9,
    PIG: 4,
    SHEEP: 5,
    GOAT: 5,
    HORSE: 11,
    CHICKEN: 1,
  };
  const expectedOffspring: Record<string, string | number> = {
    COW: 1,
    PIG: "8-12",
    SHEEP: "1-2",
    GOAT: "1-2",
    HORSE: 1,
    CHICKEN: "8-15",
  };

  const animalType = String(animal.type || resolveTypeFromSubType(animal.subType) || "COW");
  const gestationMonths = gestationPeriods[animalType] || 6;
  const expectedCount = expectedOffspring[animalType] || "1-2";
  const reproductionPercent = (animal.reproduction || 0) * 100;

  let pregnancyProgress = 0.2;
  if (reproductionPercent > 80) pregnancyProgress = 0.8;
  else if (reproductionPercent > 60) pregnancyProgress = 0.6;
  else if (reproductionPercent > 40) pregnancyProgress = 0.4;

  const monthsRemaining = Math.max(0, Math.round(gestationMonths * (1 - pregnancyProgress)));
  return { monthsRemaining, pregnancyProgress, expectedCount };
}

function resolveTypeFromSubType(subType: string | undefined): string {
  if (!subType) return "COW";
  return subType.split("_")[0] || "COW";
}
