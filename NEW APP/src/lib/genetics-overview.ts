import type { AnimalGenetics, LivestockAnimal } from "@/lib/livestock-types";
import { getGeneticsDescriptionKey } from "@/lib/livestock-value";

export interface GeneticsTraitAverages {
  health: number;
  metabolism: number;
  fertility: number;
  quality: number;
  productivity: number;
  overall: number;
}

export interface GeneticsBandCount {
  key: string;
  count: number;
}

export interface GeneticsTopAnimal {
  id: string | number;
  name: string;
  typeLabel: string;
  overall: number;
  bandKey: string;
  genetics: AnimalGenetics;
}

export interface GeneticsTypeBreakdown {
  typeKey: string;
  typeLabel: string;
  count: number;
  avgOverall: number;
}

export interface GeneticsOverview {
  totalAnimals: number;
  withGenetics: number;
  coveragePct: number;
  averages: GeneticsTraitAverages | null;
  bands: GeneticsBandCount[];
  top: GeneticsTopAnimal[];
  byType: GeneticsTypeBreakdown[];
}

function traitAvg(genetics: AnimalGenetics): number {
  return (
    ((genetics.health || 0) +
      (genetics.metabolism || 0) +
      (genetics.fertility || 0) +
      (genetics.quality || 0) +
      (genetics.productivity || 0)) /
    5
  );
}

function animalLabel(animal: LivestockAnimal): string {
  const name = String(animal.name ?? "").trim();
  if (name) return name;
  return `#${animal.id}`;
}

function typeLabel(animal: LivestockAnimal): string {
  return String(animal.animalTypeName || animal.type || animal.subType || "").trim() || "—";
}

/** Aggregate genetics for the livestock Genetics tab (legacy left this as placeholder). */
export function buildGeneticsOverview(animals: LivestockAnimal[]): GeneticsOverview {
  const withGenetics = animals.filter((a) => a.genetics && typeof a.genetics === "object");
  const totalAnimals = animals.filter((a) => !a.__emptyPen).length;

  if (withGenetics.length === 0) {
    return {
      totalAnimals,
      withGenetics: 0,
      coveragePct: 0,
      averages: null,
      bands: [],
      top: [],
      byType: [],
    };
  }

  let health = 0;
  let metabolism = 0;
  let fertility = 0;
  let quality = 0;
  let productivity = 0;
  const bandMap = new Map<string, number>();

  for (const a of withGenetics) {
    const g = a.genetics!;
    health += g.health || 0;
    metabolism += g.metabolism || 0;
    fertility += g.fertility || 0;
    quality += g.quality || 0;
    productivity += g.productivity || 0;
    const band = getGeneticsDescriptionKey(g);
    bandMap.set(band, (bandMap.get(band) || 0) + 1);
  }

  const n = withGenetics.length;
  const averages: GeneticsTraitAverages = {
    health: health / n,
    metabolism: metabolism / n,
    fertility: fertility / n,
    quality: quality / n,
    productivity: productivity / n,
    overall: (health + metabolism + fertility + quality + productivity) / (n * 5),
  };

  const bandOrder = [
    "livestock.geneticsDescExcellent",
    "livestock.geneticsDescGood",
    "livestock.geneticsDescAverage",
    "livestock.geneticsDescBelowAverage",
    "livestock.geneticsDescPoor",
    "livestock.geneticsDescUnknown",
  ];
  const bands: GeneticsBandCount[] = bandOrder
    .filter((key) => (bandMap.get(key) || 0) > 0)
    .map((key) => ({ key, count: bandMap.get(key) || 0 }));

  const top = [...withGenetics]
    .map((a) => {
      const g = a.genetics!;
      const overall = traitAvg(g);
      return {
        id: a.id,
        name: animalLabel(a),
        typeLabel: typeLabel(a),
        overall,
        bandKey: getGeneticsDescriptionKey(g),
        genetics: g,
      };
    })
    .sort((a, b) => b.overall - a.overall)
    .slice(0, 8);

  const typeMap = new Map<string, { count: number; sum: number }>();
  for (const a of withGenetics) {
    const raw = String(a.animalTypeName || a.subType || a.type || "unknown").trim().toUpperCase();
    const key = raw || "UNKNOWN";
    const bucket = typeMap.get(key) || { count: 0, sum: 0 };
    bucket.count += 1;
    bucket.sum += traitAvg(a.genetics!);
    typeMap.set(key, bucket);
  }

  const byType: GeneticsTypeBreakdown[] = [...typeMap.entries()]
    .map(([typeKey, bucket]) => ({
      typeKey,
      typeLabel: typeKey,
      count: bucket.count,
      avgOverall: bucket.sum / bucket.count,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    totalAnimals,
    withGenetics: n,
    coveragePct: totalAnimals > 0 ? Math.round((n / totalAnimals) * 100) : 0,
    averages,
    bands,
    top,
    byType,
  };
}

export function formatGeneticsPercent(multiplier: number): string {
  return `${Math.round(multiplier * 100)}%`;
}
