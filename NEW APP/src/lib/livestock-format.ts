import type { LivestockAnimal } from "./livestock-types";

/** Minimal row shape for head counting (flattened animals or pasture rows). */
export type LivestockHeadLike = {
  __emptyPen?: boolean;
  __lodClusterAggregate?: boolean;
  clusterCount?: number | string;
};

/** Minimal husbandry/pen shape for authoritative head counts. */
export type HusbandryHeadLike = {
  numOfAnimalsReported?: number;
  animalCount?: number;
  numAnimals?: number;
  clusters?: Array<{ count?: number } | null | undefined> | null;
  animals?: LivestockHeadLike[] | null;
  livestock?: LivestockHeadLike[] | null;
  animalList?: LivestockHeadLike[] | null;
};

export function isUnknownSubTypeLabel(subType: unknown): boolean {
  if (subType == null || subType === "") return true;
  return String(subType).trim().toLowerCase() === "unknown";
}

export function resolveAnimalSubTypeRaw(animal: LivestockAnimal | null | undefined): string {
  if (!animal) return "";
  if (!isUnknownSubTypeLabel(animal.subType)) return String(animal.subType);
  if (!isUnknownSubTypeLabel(animal.animalTypeName)) return String(animal.animalTypeName);
  if (!isUnknownSubTypeLabel(animal.type) && animal.type !== "cluster") {
    return String(animal.type);
  }
  return "";
}

/** Pastures drilldown uses the same <70 threshold; skip LOD rows with no health telemetry. */
export function isLivestockLowHealthRow(animal: LivestockAnimal): boolean {
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

export function shouldShowHealthErrorBadge(animal: LivestockAnimal): boolean {
  if (!animal || animal.health !== 0) return false;
  if (animal.__lodSynth || animal.__lodSynthEstimate || animal.__lodClusterAggregate) {
    return false;
  }
  return true;
}

export function displayAnimalHealth(animal: LivestockAnimal | null | undefined): number {
  const h = Number(animal?.health);
  if (animal?.health != null && Number.isFinite(h) && h >= 0) return h;
  if (animal?.__lodSynth || animal?.__lodClusterAggregate || animal?.__lodSynthEstimate) {
    return 100;
  }
  return Number.isFinite(h) ? h : 100;
}

export function roundAgeMonths(m: unknown): number {
  const n = Number(m);
  if (!Number.isFinite(n)) return 0;
  return Math.abs(n - Math.round(n)) < 0.001 ? Math.round(n) : Math.round(n * 10) / 10;
}

export function getHealthClass(health: number): string {
  if (health >= 80) return "health-excellent";
  if (health >= 60) return "health-good";
  if (health >= 40) return "health-average";
  if (health >= 20) return "health-poor";
  return "health-critical";
}

export function capitalize(str: string): string {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

export function formatAnimalType(subType: string, unknownLabel = "Unknown"): string {
  if (isUnknownSubTypeLabel(subType)) return unknownLabel;
  const parts = subType.split("_");
  if (parts.length > 1) {
    const type = parts[0].toLowerCase();
    const breed = parts
      .slice(1)
      .join(" ")
      .toLowerCase()
      .replace(/\b\w/g, (l) => l.toUpperCase());
    return `${breed} ${capitalize(type)}`;
  }
  return capitalize(subType);
}

export function resolveAnimalLocationLabel(animal: LivestockAnimal | null | undefined): string {
  if (!animal || typeof animal !== "object") return "Unknown";
  const direct = String(animal.location || "").trim();
  if (direct && direct.toLowerCase() !== "unknown") return direct;
  const husbandry = String(animal.husbandryName || "").trim();
  if (husbandry && husbandry.toLowerCase() !== "unknown") return husbandry;
  return "Unknown";
}

export function resolveAnimalLocationType(animal: LivestockAnimal | null | undefined): string {
  if (!animal || typeof animal !== "object") return "unknown";
  const direct = String(animal.locationType || "").trim();
  if (direct && direct.toLowerCase() !== "unknown") return direct;
  const husbandry = String(animal.husbandryName || "").trim();
  return husbandry ? "Livestock Building" : "unknown";
}

export function locationBadgeTone(
  locationType: string
): "default" | "accent" | "warn" | "danger" {
  if (locationType.includes("Cow")) return "accent";
  if (locationType.includes("Pig")) return "warn";
  if (locationType.includes("Chicken")) return "default";
  if (locationType.includes("Sheep")) return "default";
  return "default";
}

export function animalTypeKey(animal: LivestockAnimal): string {
  const raw = resolveAnimalSubTypeRaw(animal);
  if (!raw) return "";
  return raw.split("_")[0] || "";
}

export function headCount(animal: LivestockHeadLike | null | undefined): number {
  if (!animal || animal.__emptyPen) return 0;
  const c = Number(animal.clusterCount);
  if (animal.__lodClusterAggregate && Number.isFinite(c) && c > 0) return Math.floor(c);
  return 1;
}

/**
 * Heads on farm from flattened livestock rows.
 * Cluster LOD aggregate rows count as `clusterCount`; empty-pen stubs are excluded.
 * Overview / badges must use this — not `animals.length` (row count ≠ herd size).
 */
export function countLivestockHeads(
  animals: Array<LivestockHeadLike | null | undefined> | null | undefined
): number {
  if (!Array.isArray(animals)) return 0;
  let n = 0;
  for (const a of animals) {
    if (!a || a.__emptyPen) continue;
    n += headCount(a);
  }
  return n;
}

/** Sum of cluster bucket counts (may be RL-sampled + scaled). */
export function sumClusterCounts(
  clusters: Array<{ count?: number } | null | undefined> | null | undefined
): number {
  if (!Array.isArray(clusters)) return 0;
  let sum = 0;
  for (const c of clusters) {
    const cc = Number(c?.count);
    if (Number.isFinite(cc) && cc > 0) sum += Math.floor(cc);
  }
  return sum;
}

/**
 * Authoritative pen head count.
 * Prefer `numOfAnimalsReported` (engine getNumOfAnimals) when it disagrees with
 * scaled RL cluster sums / animalCount — sampling scale can overshoot or undershoot.
 */
export function husbandryHeadCount(
  husbandry: HusbandryHeadLike | null | undefined
): number {
  if (!husbandry || typeof husbandry !== "object") return 0;

  const reported = Number(husbandry.numOfAnimalsReported);
  if (Number.isFinite(reported) && reported > 0) return Math.floor(reported);

  const direct = Number(husbandry.animalCount ?? husbandry.numAnimals ?? 0);
  if (Number.isFinite(direct) && direct > 0) return Math.floor(direct);

  const clusterSum = sumClusterCounts(husbandry.clusters);
  if (clusterSum > 0) return clusterSum;

  // Nested animal/group lists (detail / placeable shapes)
  const lists = [husbandry.animals, husbandry.livestock, husbandry.animalList].filter(
    Array.isArray
  ) as LivestockHeadLike[][];
  let nested = 0;
  for (const list of lists) {
    nested += countLivestockHeads(list);
  }
  return nested;
}

/**
 * Display barn capacity: prefer `maxAnimals` (getMaxNumOfAnimals).
 * `capacity` from getCapacity() is often fill/storage liters — not animal slots.
 */
export function resolvePastureDisplayCapacity(
  husbandry:
    | {
        maxAnimals?: number;
        capacity?: number;
        name?: string;
        buildingName?: string;
        filename?: string;
      }
    | null
    | undefined,
  estimateFromName: (name: string | null | undefined) => number
): number {
  const maxA = Number(husbandry?.maxAnimals);
  if (Number.isFinite(maxA) && maxA > 0) return Math.floor(maxA);

  // Only trust capacity when it looks like animal slots (not food fill liters).
  const cap = Number(husbandry?.capacity);
  if (Number.isFinite(cap) && cap > 0 && cap <= 500) return Math.floor(cap);

  const name =
    husbandry?.filename ||
    husbandry?.name ||
    husbandry?.buildingName ||
    null;
  return estimateFromName(name);
}

/** Prefer RL ear tag (`uniqueId`); fall back to stable row id. */
export function animalEarTag(animal: LivestockAnimal | null | undefined): string {
  if (!animal) return "";
  if (animal.uniqueId != null && String(animal.uniqueId) !== "") {
    return String(animal.uniqueId);
  }
  return animal.id != null ? String(animal.id) : "";
}

/**
 * Display tag for tables/panels. When the same ear tag appears more than once
 * in `animalsInView`, append the pen index from the stable row id.
 */
export function displayAnimalEarTag(
  animal: LivestockAnimal,
  animalsInView?: LivestockAnimal[] | null
): string {
  const tag = animalEarTag(animal);
  if (!tag) return "";
  if (animal.uniqueId == null || String(animal.uniqueId) === "") return tag;
  if (!animalsInView?.length) return tag;
  const uid = String(animal.uniqueId);
  const dupCount = animalsInView.filter(
    (a) => a.uniqueId != null && String(a.uniqueId) === uid
  ).length;
  if (dupCount <= 1) return tag;
  const parts = String(animal.id ?? "").split(":");
  const penIdx = parts.length >= 3 ? parts[parts.length - 1] : "";
  return penIdx !== "" ? `${tag}·${penIdx}` : tag;
}

export function livestockTableRowId(
  row: LivestockAnimal,
  index: number
): string {
  if (row?.id != null && String(row.id) !== "") return String(row.id);
  return `row-${index}`;
}

/** Match by stable row `id` first (string-safe; no parseInt). */
export function findAnimalById(
  animals: LivestockAnimal[],
  animalId: string | number
): LivestockAnimal | undefined {
  const target = String(animalId);
  const byStable = animals.find((a) => String(a.id) === target);
  if (byStable) return byStable;
  // Legacy / ambiguous: only accept uniqueId match when unambiguous in the list.
  const byTag = animals.filter(
    (a) => a.uniqueId != null && String(a.uniqueId) === target
  );
  return byTag.length === 1 ? byTag[0] : undefined;
}

export function reproductionRate(animal: LivestockAnimal): number {
  if (animal.reproduction != null && !Number.isNaN(Number(animal.reproduction))) {
    return Number(animal.reproduction);
  }
  if (animal.genetics?.fertility != null && !Number.isNaN(Number(animal.genetics.fertility))) {
    return Number(animal.genetics.fertility);
  }
  return 0;
}
