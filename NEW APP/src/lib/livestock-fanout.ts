import type { HusbandryPen, LodCluster, LivestockAnimal } from "./livestock-types";
import { sumClusterCounts } from "./livestock-format";

export const DEFAULT_PEN_HEAD_ROW_CAP = 4096;
export const DEFAULT_GLOBAL_ROW_CAP = 8000;

export interface LodCounter {
  emitted: number;
  trimmed: number;
  capHit: boolean;
  cap: number;
}

function isUnknownSubType(st: unknown): boolean {
  if (st == null || st === "") return true;
  const s = String(st).trim();
  return s === "" || s.toLowerCase() === "unknown";
}

function resolveClusterSubType(c: LodCluster, husbandry: HusbandryPen): string {
  if (!isUnknownSubType(c.subType)) return String(c.subType);
  if (!isUnknownSubType(c.animalType)) return String(c.animalType);
  if (husbandry && !isUnknownSubType(husbandry.animalTypeName)) {
    return String(husbandry.animalTypeName);
  }
  return "Unknown";
}

function resolveClusterHealth(c: LodCluster, husbandry: HusbandryPen): number {
  if (typeof c.avgHealth === "number" && Number.isFinite(c.avgHealth)) {
    return Math.max(0, Math.min(100, c.avgHealth));
  }
  if (typeof husbandry.health === "number" && Number.isFinite(husbandry.health)) {
    return Math.max(0, Math.min(100, husbandry.health));
  }
  return 100;
}

export function resolveAnimalGroupHeadCount(animalGroup: LivestockAnimal | null | undefined): number {
  if (!animalGroup) return 1;
  const cc = Number(animalGroup.clusterCount);
  if (animalGroup.__lodClusterAggregate && Number.isFinite(cc) && cc > 0) {
    return Math.floor(cc);
  }
  const raw =
    animalGroup.count != null
      ? animalGroup.count
      : animalGroup.numAnimals != null
        ? animalGroup.numAnimals
        : NaN;
  const c = Number(raw);
  if (Number.isFinite(c) && c > 0) return Math.floor(c);
  return 1;
}

export function shouldEmitClusterAggregateRow(animalGroup: LivestockAnimal | null | undefined): boolean {
  if (!animalGroup) return false;
  if (animalGroup.__lodClusterAggregate === true) return true;
  if (String(animalGroup.type || "").toLowerCase() === "cluster") return true;
  return resolveAnimalGroupHeadCount(animalGroup) > 1;
}

export function isDetailClusterSummaryPen(husbandry: HusbandryPen | null | undefined): boolean {
  if (!husbandry) return false;
  const detailReady =
    (husbandry.__detailHydrated === true || husbandry.lod === "full") &&
    Array.isArray(husbandry.animals) &&
    husbandry.animals.length > 0;
  if (!detailReady) return false;
  for (const a of husbandry.animals!) {
    if (a?.uniqueId) return false;
  }
  for (const row of husbandry.animals!) {
    if (shouldEmitClusterAggregateRow(row) && resolveAnimalGroupHeadCount(row) > 1) {
      return true;
    }
  }
  return false;
}

/**
 * When engine-reported heads disagree with RL-scaled cluster sums, rescale
 * bucket counts so fan-out / display totals match `numOfAnimalsReported`.
 */
export function reconcileClustersToReported(
  clusters: LodCluster[] | null | undefined,
  reportedHeads: number
): LodCluster[] {
  if (!Array.isArray(clusters) || clusters.length === 0) return [];
  if (reportedHeads == null || (reportedHeads as unknown) === "") return clusters.map(c => ({ ...c }));
  const target = Math.floor(Number(reportedHeads));
  if (target === 0) return [];
  if (!Number.isFinite(target) || target <= 0) {
    return clusters.map((c) => ({ ...c }));
  }

  const sum = sumClusterCounts(clusters);
  if (sum === target) return clusters.map((c) => ({ ...c }));
  if (sum <= 0) {
    const first = clusters[0] || {};
    return [{ ...first, count: target }];
  }

  const scale = target / sum;
  const scaled = clusters.map((c) => {
    const cc = Number(c?.count);
    const exact = !Number.isFinite(cc) || cc <= 0 ? 0 : cc * scale;
    const floor = Math.max(0, Math.floor(exact));
    return { cluster: c, exact, floor, frac: exact - floor };
  });
  let used = scaled.reduce((a, r) => a + r.floor, 0);
  let remain = target - used;
  const order = scaled
    .map((_, i) => i)
    .sort((a, b) => scaled[b]!.frac - scaled[a]!.frac || scaled[b]!.floor - scaled[a]!.floor);
  const counts = scaled.map((r) => r.floor);
  for (const i of order) {
    if (remain <= 0) break;
    counts[i] = (counts[i] || 0) + 1;
    remain -= 1;
  }
  if (remain < 0) {
    for (const i of order) {
      if (remain >= 0) break;
      const take = Math.min(counts[i] || 0, -remain);
      counts[i] = (counts[i] || 0) - take;
      remain += take;
    }
  }
  return clusters.map((c, i) => ({ ...c, count: Math.max(0, counts[i] || 0) }));
}

/**
 * Clusters for fan-out: prefer engine-reported total when it disagrees with
 * scaled RL bucket sums (Witcombe-style large pens).
 */
export function clustersForFanOut(
  husbandry: HusbandryPen | null | undefined,
  clusters: LodCluster[] | null | undefined
): LodCluster[] {
  if (!Array.isArray(clusters)) return [];
  const rawReported = husbandry?.numOfAnimalsReported;
  if (rawReported == null || (rawReported as unknown) === "") return clusters.map(c => ({ ...c }));
  const reported = Number(rawReported);
  if (reported === 0) return [];
  if (!Number.isFinite(reported) || reported <= 0) {
    return clusters.map((c) => ({ ...c }));
  }
  const sum = sumClusterCounts(clusters);
  if (sum <= 0 || sum === Math.floor(reported)) {
    return clusters.map((c) => ({ ...c }));
  }
  return reconcileClustersToReported(clusters, reported);
}

function animalGroupToClusterEntry(animalGroup: LivestockAnimal): LodCluster {
  return {
    count: resolveAnimalGroupHeadCount(animalGroup),
    subType: animalGroup.subType || animalGroup.type || (animalGroup.animalType as string | undefined),
    gender: animalGroup.gender,
    avgHealth:
      (animalGroup.avgHealth as number | undefined) != null
        ? (animalGroup.avgHealth as number)
        : animalGroup.health,
    avgWeight:
      (animalGroup.avgWeight as number | undefined) != null
        ? (animalGroup.avgWeight as number)
        : animalGroup.weight,
    avgAgeMonths:
      (animalGroup.avgAgeMonths as number | undefined) != null
        ? (animalGroup.avgAgeMonths as number)
        : (animalGroup.ageMonths as number | undefined) != null
          ? (animalGroup.ageMonths as number)
          : animalGroup.age,
    ageMonths: (animalGroup.ageMonths as number | undefined) ?? animalGroup.age,
    isLactating: animalGroup.isLactating,
    isPregnant: animalGroup.isPregnant,
  };
}

export function stableAnimalRowId(
  husbandryId: string | number | null | undefined,
  uniqueId: string | number | null | undefined,
  indexInPen: number
): string {
  const hid =
    husbandryId != null && String(husbandryId) !== "" ? String(husbandryId) : "pen";
  const uid =
    uniqueId != null && String(uniqueId) !== "" ? String(uniqueId) : "x";
  return `${hid}:${uid}:${indexInPen}`;
}

export function looksLikeStableAnimalId(id: unknown): boolean {
  if (typeof id !== "string" || !id.includes(":")) return false;
  const parts = id.split(":");
  if (parts.length < 3) return false;
  return /^\d+$/.test(parts[parts.length - 1] || "");
}

export function fanOutClustersIndividualRows(
  husbandry: HusbandryPen,
  clusters: LodCluster[] | null | undefined,
  farmId: number,
  globalCounter?: LodCounter,
  opts?: { penCap?: number; globalCap?: number; startHeadIndex?: number }
): LivestockAnimal[] {
  const out: LivestockAnimal[] = [];
  if (!husbandry || !Array.isArray(clusters)) return out;

  const penCap = Number.isFinite(opts?.penCap) ? Math.floor(opts!.penCap!) : DEFAULT_PEN_HEAD_ROW_CAP;
  const globalCap = globalCounter && Number.isFinite(globalCounter.cap)
    ? Math.floor(globalCounter.cap)
    : Number.isFinite(opts?.globalCap)
      ? Math.floor(opts!.globalCap!)
      : DEFAULT_GLOBAL_ROW_CAP;
  const startHeadIndex = Number.isFinite(opts?.startHeadIndex)
    ? Math.max(0, Math.floor(opts!.startHeadIndex!))
    : 0;

  const huName = husbandry.name || husbandry.buildingName;
  const huId = husbandry.id ?? husbandry.buildingId;

  const clustersForEmit = clustersForFanOut(husbandry, clusters);

  let headsThisPen = 0;
  let trimmedHeads = 0;

  outer: for (let ci = 0; ci < clustersForEmit.length; ci++) {
    const c = clustersForEmit[ci];
    if (!c || !c.count || c.count <= 0) continue;

    const subType = resolveClusterSubType(c, husbandry);
    const ageMonths =
      typeof c.avgAgeMonths === "number"
        ? c.avgAgeMonths
        : typeof c.ageMonths === "number"
          ? c.ageMonths
          : (c.ageDecile || 0) * 12;
    const avgHealth = resolveClusterHealth(c, husbandry);
    const avgWeight = typeof c.avgWeight === "number" && c.avgWeight > 0 ? c.avgWeight : null;
    const nTotal = Math.floor(Number(c.count)) || 0;

    const genetics =
      typeof c.avgGenFert === "number"
        ? {
            fertility: c.avgGenFert,
            productivity: c.avgGenProd,
            health: c.avgGenHealth,
            metabolism: c.avgGenMetabolism,
            quality: c.avgGenQuality,
          }
        : null;

    for (let hi = 0; hi < nTotal; hi++) {
      if (headsThisPen >= penCap) {
        trimmedHeads += nTotal - hi;
        for (let cj = ci + 1; cj < clustersForEmit.length; cj++) {
          const cc = clustersForEmit[cj];
          if (cc && cc.count && cc.count > 0) trimmedHeads += Math.floor(Number(cc.count)) || 0;
        }
        break outer;
      }
      if (globalCounter && (globalCounter.emitted || 0) >= globalCap) {
        trimmedHeads += nTotal - hi;
        for (let ck = ci + 1; ck < clustersForEmit.length; ck++) {
          const cd = clustersForEmit[ck];
          if (cd && cd.count && cd.count > 0) trimmedHeads += Math.floor(Number(cd.count)) || 0;
        }
        break outer;
      }

      // Pen-wide index (startHeadIndex + headsThisPen) — never reset per cluster group.
      const id = stableAnimalRowId(huId, null, startHeadIndex + headsThisPen);
      out.push({
        id,
        name: String(subType),
        husbandryName: huName,
        husbandryId: huId,
        ownerFarmId: husbandry.ownerFarmId || husbandry.farmId,
        farmId,
        age: ageMonths,
        health: avgHealth,
        weight: avgWeight != null ? avgWeight : 0,
        gender: c.gender || "female",
        subType,
        animalTypeName: husbandry.animalTypeName || undefined,
        location: huName,
        locationType: "pasture",
        isLactating: !!c.isLactating,
        isPregnant: !!c.isPregnant,
        isParent: false,
        genetics,
        productivity: c.avgGenProd != null ? c.avgGenProd : null,
        __lodSynth: true,
        __lodSynthEstimate: true,
      });
      headsThisPen += 1;
      if (globalCounter) globalCounter.emitted = (globalCounter.emitted || 0) + 1;
    }
  }

  if (trimmedHeads > 0) {
    husbandry.__lodTrimmed = trimmedHeads;
    if (globalCounter) globalCounter.trimmed = (globalCounter.trimmed || 0) + trimmedHeads;
  }
  if (globalCounter && (globalCounter.emitted || 0) >= globalCap) {
    globalCounter.capHit = true;
  }
  return out;
}

export function fanOutAnimalGroupsIndividualRows(
  husbandry: HusbandryPen,
  groups: LivestockAnimal[] | null | undefined,
  farmId: number,
  globalCounter?: LodCounter,
  opts?: { penCap?: number; globalCap?: number; startHeadIndex?: number }
): LivestockAnimal[] {
  if (!husbandry || !Array.isArray(groups)) return [];
  const clusters: LodCluster[] = [];
  for (const g of groups) {
    if (!shouldEmitClusterAggregateRow(g)) continue;
    const heads = resolveAnimalGroupHeadCount(g);
    if (heads <= 1) continue;
    clusters.push(animalGroupToClusterEntry(g));
  }
  return fanOutClustersIndividualRows(husbandry, clusters, farmId, globalCounter, opts);
}
