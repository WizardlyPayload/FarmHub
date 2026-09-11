import type { AdvancedFilters, LivestockAnimal } from "./livestock-types";
import { DEFAULT_ADVANCED_FILTERS } from "./livestock-types";
import { animalTypeKey } from "./livestock-format";

export function createDefaultAdvancedFilters(): AdvancedFilters {
  return { ...DEFAULT_ADVANCED_FILTERS };
}

export function isAdvancedFiltersDefault(f: AdvancedFilters): boolean {
  const d = DEFAULT_ADVANCED_FILTERS;
  return (
    f.ageMin === d.ageMin &&
    f.ageMax === d.ageMax &&
    f.weightMin === d.weightMin &&
    f.weightMax === d.weightMax &&
    f.healthMin === d.healthMin &&
    f.healthMax === d.healthMax &&
    f.metabolismMin === d.metabolismMin &&
    f.metabolismMax === d.metabolismMax &&
    f.fertilityMin === d.fertilityMin &&
    f.fertilityMax === d.fertilityMax &&
    f.qualityMin === d.qualityMin &&
    f.qualityMax === d.qualityMax &&
    f.productivityMin === d.productivityMin &&
    f.productivityMax === d.productivityMax &&
    f.animalType === d.animalType
  );
}

export function applyAdvancedFilters(
  animals: LivestockAnimal[],
  filters: AdvancedFilters
): LivestockAnimal[] {
  let filtered = [...animals];

  if (filters.ageMin !== null) {
    filtered = filtered.filter((a) => Number(a.age) >= filters.ageMin!);
  }
  if (filters.ageMax !== null) {
    filtered = filtered.filter((a) => Number(a.age) <= filters.ageMax!);
  }
  if (filters.weightMin !== null) {
    filtered = filtered.filter((a) => Number(a.weight) >= filters.weightMin!);
  }
  if (filters.weightMax !== null) {
    filtered = filtered.filter((a) => Number(a.weight) <= filters.weightMax!);
  }
  if (filters.animalType) {
    filtered = filtered.filter((a) => animalTypeKey(a) === filters.animalType);
  }

  filtered = filtered.filter((animal) => {
    const healthPercent = animal.health || 100;
    if (healthPercent < filters.healthMin || healthPercent > filters.healthMax) {
      return false;
    }
    if (!animal.genetics) return true;

    const metabolismPercent = (animal.genetics.metabolism || 0) * 100;
    const fertilityPercent = (animal.genetics.fertility || 0) * 100;
    const qualityPercent = (animal.genetics.quality || 0) * 100;
    const productivityPercent = (animal.genetics.productivity || 0) * 100;

    return (
      metabolismPercent >= filters.metabolismMin &&
      metabolismPercent <= filters.metabolismMax &&
      fertilityPercent >= filters.fertilityMin &&
      fertilityPercent <= filters.fertilityMax &&
      qualityPercent >= filters.qualityMin &&
      qualityPercent <= filters.qualityMax &&
      productivityPercent >= filters.productivityMin &&
      productivityPercent <= filters.productivityMax
    );
  });

  return filtered;
}

export interface FilterChip {
  key: string;
  labelKey: string;
  params?: Record<string, string | number>;
}

export function buildActiveFilterChips(filters: AdvancedFilters): FilterChip[] {
  const chips: FilterChip[] = [];

  if (filters.ageMin !== null || filters.ageMax !== null) {
    if (filters.ageMin !== null && filters.ageMax !== null) {
      chips.push({
        key: "age",
        labelKey: "livestock.filterChipAgeBetween",
        params: { min: filters.ageMin, max: filters.ageMax },
      });
    } else if (filters.ageMin !== null) {
      chips.push({
        key: "age",
        labelKey: "livestock.filterChipAgeMin",
        params: { min: filters.ageMin },
      });
    } else {
      chips.push({
        key: "age",
        labelKey: "livestock.filterChipAgeMax",
        params: { max: filters.ageMax! },
      });
    }
  }

  if (filters.weightMin !== null || filters.weightMax !== null) {
    if (filters.weightMin !== null && filters.weightMax !== null) {
      chips.push({
        key: "weight",
        labelKey: "livestock.filterChipWeightBetween",
        params: { min: filters.weightMin, max: filters.weightMax },
      });
    } else if (filters.weightMin !== null) {
      chips.push({
        key: "weight",
        labelKey: "livestock.filterChipWeightMin",
        params: { min: filters.weightMin },
      });
    } else {
      chips.push({
        key: "weight",
        labelKey: "livestock.filterChipWeightMax",
        params: { max: filters.weightMax! },
      });
    }
  }

  if (filters.animalType) {
    chips.push({
      key: "type",
      labelKey: "livestock.filterChipType",
      params: { type: filters.animalType },
    });
  }

  const rangeChecks: Array<{
    key: string;
    min: number;
    max: number;
    defMin: number;
    defMax: number;
    labelKey: string;
  }> = [
    {
      key: "health",
      min: filters.healthMin,
      max: filters.healthMax,
      defMin: 0,
      defMax: 100,
      labelKey: "livestock.geneticsFilterHealth",
    },
    {
      key: "metabolism",
      min: filters.metabolismMin,
      max: filters.metabolismMax,
      defMin: 0,
      defMax: 200,
      labelKey: "livestock.geneticsFilterMetabolism",
    },
    {
      key: "fertility",
      min: filters.fertilityMin,
      max: filters.fertilityMax,
      defMin: 0,
      defMax: 200,
      labelKey: "livestock.geneticsFilterFertility",
    },
    {
      key: "quality",
      min: filters.qualityMin,
      max: filters.qualityMax,
      defMin: 0,
      defMax: 200,
      labelKey: "livestock.geneticsFilterQuality",
    },
    {
      key: "productivity",
      min: filters.productivityMin,
      max: filters.productivityMax,
      defMin: 0,
      defMax: 200,
      labelKey: "livestock.geneticsFilterProductivity",
    },
  ];

  for (const r of rangeChecks) {
    if (r.min > r.defMin || r.max < r.defMax) {
      chips.push({
        key: r.key,
        labelKey: r.labelKey,
        params: { min: r.min, max: r.max },
      });
    }
  }

  return chips;
}

export function clampDualRange(
  minVal: number,
  maxVal: number,
  position: "min" | "max"
): { min: number; max: number } {
  let min = minVal;
  let max = maxVal;
  if (position === "min" && min > max) max = min;
  if (position === "max" && max < min) min = max;
  return { min, max };
}
