import {
  fanOutAnimalGroupsIndividualRows,
  fanOutClustersIndividualRows,
  isDetailClusterSummaryPen,
  looksLikeStableAnimalId,
  resolveAnimalGroupHeadCount,
  shouldEmitClusterAggregateRow,
  stableAnimalRowId,
  DEFAULT_GLOBAL_ROW_CAP,
  type LodCounter,
} from "./livestock-fanout";

export { looksLikeStableAnimalId, stableAnimalRowId } from "./livestock-fanout";
import type {
  HusbandryPen,
  LivestockAnimal,
  LivestockSummary,
  LodGlobalState,
} from "./livestock-types";
import {
  countLivestockHeads,
  headCount,
  husbandryHeadCount,
  isLivestockLowHealthRow,
} from "./livestock-format";

export {
  countLivestockHeads,
  husbandryHeadCount,
  resolvePastureDisplayCapacity,
  sumClusterCounts,
} from "./livestock-format";

export function entityOwnerFarmId(entity: Record<string, unknown> | null | undefined): number {
  const direct = Number(entity?.ownerFarmId ?? entity?.farmId ?? 0);
  if (Number.isFinite(direct) && direct > 0) return direct;
  if (!entity || typeof entity !== "object") return 0;
  const nestedLists = [entity.animals, entity.livestock, entity.animalList].filter(Array.isArray);
  for (const list of nestedLists) {
    for (const row of list as Record<string, unknown>[]) {
      const fid = Number(row?.ownerFarmId ?? row?.farmId ?? 0);
      if (Number.isFinite(fid) && fid > 0) return fid;
    }
  }
  return 0;
}

function extractHusbandryArray(animalsData: unknown): HusbandryPen[] {
  if (!animalsData) return [];
  if (Array.isArray(animalsData)) return animalsData as HusbandryPen[];
  if (typeof animalsData !== "object") return [];
  const obj = animalsData as Record<string, unknown>;
  if (Array.isArray(obj.husbandries)) return obj.husbandries as HusbandryPen[];
  if (Array.isArray(obj.animals)) return obj.animals as HusbandryPen[];
  if (Array.isArray(obj.data)) return obj.data as HusbandryPen[];
  return Object.values(obj).filter((v) => v && typeof v === "object") as HusbandryPen[];
}

/** True when payload rows already look like flattened animal rows (not husbandry pens). */
function looksLikeFlattenedAnimals(rows: unknown[]): boolean {
  if (!rows.length) return false;
  let animalish = 0;
  let husbandryish = 0;
  const sample = rows.slice(0, Math.min(rows.length, 12));
  for (const row of sample) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    if (Array.isArray(r.animals) || Array.isArray(r.clusters) || Array.isArray(r.livestock)) {
      husbandryish += 1;
      continue;
    }
    if (
      r.__emptyPen ||
      r.__lodSynth ||
      r.__lodClusterAggregate ||
      r.subType != null ||
      r.uniqueId != null ||
      (r.gender != null && (r.age != null || r.weight != null || r.health != null))
    ) {
      animalish += 1;
    }
  }
  return animalish > husbandryish;
}

function mapIndividualAnimal(
  animalGroup: LivestockAnimal,
  husbandry: HusbandryPen,
  farmId: number,
  indexInPen: number
): LivestockAnimal {
  const husbandryId = husbandry.id ?? husbandry.buildingId;
  const uniqueId = animalGroup.uniqueId ?? null;
  const id = looksLikeStableAnimalId(animalGroup.id)
    ? animalGroup.id
    : stableAnimalRowId(husbandryId, uniqueId, indexInPen);
  const animalType =
    animalGroup.subType || animalGroup.type || (animalGroup.animalType as string) || "Unknown";
  const earTag = uniqueId != null && String(uniqueId) !== "" ? String(uniqueId) : String(id);
  return {
    id,
    name: animalGroup.name || `${animalType} ${earTag}`,
    husbandryName: husbandry.name || husbandry.buildingName,
    husbandryId,
    ownerFarmId: husbandry.ownerFarmId || husbandry.farmId,
    farmId,
    age: animalGroup.age || (animalGroup.ageInMonths as number) || 24,
    health: animalGroup.health || (animalGroup.healthStatus as number) || 100,
    weight: animalGroup.weight || (animalGroup.currentWeight as number) || 350,
    gender: animalGroup.gender || (animalGroup.sex as string) || "female",
    subType: String(animalType),
    location: husbandry.name || husbandry.buildingName,
    locationType: "pasture",
    isLactating: !!(animalGroup.isLactating || animalGroup.lactating),
    isPregnant: !!(animalGroup.isPregnant || animalGroup.pregnant),
    isParent: !!(animalGroup.isParent || animalGroup.hasOffspring),
    genetics: animalGroup.genetics || null,
    productivity: animalGroup.productivity ?? null,
    sellPrice: animalGroup.sellPrice ?? null,
    uniqueId,
    breed: animalGroup.breed ?? null,
    motherId: animalGroup.motherId ?? null,
    fatherId: animalGroup.fatherId ?? null,
    isCastrated: !!animalGroup.isCastrated,
    birthday: animalGroup.birthday ?? null,
    dirt: animalGroup.dirt,
    fitness: animalGroup.fitness,
    diseaseCount: animalGroup.diseaseCount,
    reproduction: animalGroup.reproduction,
    monthsSinceLastBirth: animalGroup.monthsSinceLastBirth,
    impregnatedBy: animalGroup.impregnatedBy,
    pregnancyDuration: animalGroup.pregnancyDuration,
    offspring: animalGroup.offspring,
    numAnimals: animalGroup.numAnimals,
    __lodClusterAggregate: animalGroup.__lodClusterAggregate,
    clusterCount: animalGroup.clusterCount,
    __emptyPen: animalGroup.__emptyPen,
    fillSummary: animalGroup.fillSummary,
  };
}

/** Ensure already-flat rows use stable `husbandryId:uniqueId:index` ids. */
function ensureFlatStableIds(animals: LivestockAnimal[]): LivestockAnimal[] {
  const penIndex = new Map<string, number>();
  return animals.map((a) => {
    if (looksLikeStableAnimalId(a.id)) return a;
    const key = String(a.husbandryId ?? a.huId ?? "pen");
    const idx = penIndex.get(key) ?? 0;
    penIndex.set(key, idx + 1);
    return {
      ...a,
      id: stableAnimalRowId(a.husbandryId ?? a.huId, a.uniqueId, idx),
    };
  });
}

export interface NormalizeAnimalsResult {
  animals: LivestockAnimal[];
  lodState: LodGlobalState;
}

/**
 * Normalize `/api/data` animals into flat livestock rows.
 * Handles husbandry pens (with LOD cluster fan-out) and already-flattened rows.
 */
export function normalizeLivestockAnimals(
  animalsData: unknown,
  activeFarmId: number | null,
  opts?: { globalCap?: number }
): NormalizeAnimalsResult {
  const farmId = Number(activeFarmId ?? 1);
  const globalCounter: LodCounter = {
    emitted: 0,
    trimmed: 0,
    capHit: false,
    cap: opts?.globalCap ?? DEFAULT_GLOBAL_ROW_CAP,
  };

  if (!animalsData) {
    return {
      animals: [],
      lodState: { emitted: 0, trimmed: 0, capHit: false, cap: globalCounter.cap },
    };
  }

  if (Array.isArray(animalsData) && looksLikeFlattenedAnimals(animalsData)) {
    const filtered = ensureFlatStableIds(
      (animalsData as LivestockAnimal[]).filter((a) => {
        const af = Number(a.ownerFarmId ?? a.farmId ?? 0);
        if (af > 0 && af !== farmId) return false;
        return true;
      })
    );
    return {
      animals: filtered,
      lodState: {
        emitted: filtered.filter((a) => a.__lodSynth).length,
        trimmed: 0,
        capHit: false,
        cap: globalCounter.cap,
      },
    };
  }

  const husbandryArray = extractHusbandryArray(animalsData);
  const formatted: LivestockAnimal[] = [];

  for (const husbandry of husbandryArray) {
    if (!husbandry || typeof husbandry !== "object") continue;
    const hfarm = entityOwnerFarmId(husbandry as Record<string, unknown>);
    if (hfarm > 0 && hfarm !== farmId) continue;

    const detailReady =
      (husbandry.__detailHydrated === true || husbandry.lod === "full") &&
      Array.isArray(husbandry.animals) &&
      husbandry.animals.length > 0;

    const lodClusters = Array.isArray(husbandry.clusters) ? husbandry.clusters : null;
    const hasClusterBuckets = !!lodClusters?.some((c) => c && Number(c.count) > 0);
    const detailIsClusterSummary = isDetailClusterSummaryPen(husbandry);

    if ((!detailReady || detailIsClusterSummary) && hasClusterBuckets) {
      const synth = fanOutClustersIndividualRows(
        husbandry,
        lodClusters,
        hfarm || farmId,
        globalCounter
      );
      for (const s of synth) formatted.push(s);
      if (synth.length > 0) continue;
    }

    let animalsList: LivestockAnimal[] | null = null;
    if (Array.isArray(husbandry.animals)) animalsList = husbandry.animals;
    else if (Array.isArray(husbandry.livestock)) animalsList = husbandry.livestock;
    else if (Array.isArray(husbandry.animalList)) animalsList = husbandry.animalList;

    if (animalsList) {
      let penIndex = 0;
      for (const animalGroup of animalsList) {
        const headsInGroup = resolveAnimalGroupHeadCount(animalGroup);
        if (shouldEmitClusterAggregateRow(animalGroup) && headsInGroup > 1) {
          const synth = fanOutAnimalGroupsIndividualRows(
            husbandry,
            [animalGroup],
            hfarm || farmId,
            globalCounter,
            { startHeadIndex: penIndex }
          );
          for (const s of synth) formatted.push(s);
          penIndex += synth.length;
          continue;
        }

        if (
          animalGroup.id != null &&
          headsInGroup <= 1 &&
          (animalGroup.numAnimals === undefined || animalGroup.numAnimals <= 1) &&
          (animalGroup.count === undefined || Number(animalGroup.count) <= 1) &&
          (animalGroup.uniqueId ||
            animalGroup.age !== undefined ||
            animalGroup.weight !== undefined ||
            animalGroup.__emptyPen ||
            animalGroup.__lodClusterAggregate)
        ) {
          formatted.push(mapIndividualAnimal(animalGroup, husbandry, hfarm || farmId, penIndex));
          penIndex += 1;
        } else if (animalGroup.__emptyPen || animalGroup.__lodClusterAggregate) {
          formatted.push(mapIndividualAnimal(animalGroup, husbandry, hfarm || farmId, penIndex));
          penIndex += 1;
        } else {
          // Keep a single aggregate-style row rather than fabricating seeded individuals.
          const animalType =
            animalGroup.subType || animalGroup.type || (animalGroup.animalType as string) || "Unknown";
          const count = Math.max(1, Number(animalGroup.numAnimals || animalGroup.count || 1) || 1);
          const husbandryId = husbandry.id ?? husbandry.buildingId;
          const rowId = looksLikeStableAnimalId(animalGroup.id)
            ? animalGroup.id
            : stableAnimalRowId(husbandryId, animalGroup.uniqueId, penIndex);
          penIndex += 1;
          formatted.push({
            id: rowId,
            name: String(animalType),
            husbandryName: husbandry.name || husbandry.buildingName,
            husbandryId,
            ownerFarmId: husbandry.ownerFarmId || husbandry.farmId,
            farmId: hfarm || farmId,
            age: animalGroup.age || 24,
            health: animalGroup.health && animalGroup.health > 0 ? animalGroup.health : 100,
            weight: animalGroup.weight || 0,
            gender: animalGroup.gender || "female",
            subType: String(animalType),
            location: husbandry.name || husbandry.buildingName,
            locationType: "pasture",
            isLactating: !!animalGroup.isLactating,
            isPregnant: !!animalGroup.isPregnant,
            isParent: false,
            genetics: animalGroup.genetics || null,
            uniqueId: animalGroup.uniqueId ?? null,
            __lodClusterAggregate: count > 1,
            clusterCount: count > 1 ? count : undefined,
            __lodSynth: count > 1,
            __lodSynthEstimate: count > 1,
          });
        }
      }
    } else if (
      husbandryHeadCount(husbandry) > 0 ||
      (husbandry.animalCount && husbandry.animalCount > 0) ||
      (husbandry.numAnimals && husbandry.numAnimals > 0)
    ) {
      const count = husbandryHeadCount(husbandry);
      if (count > 0) {
        formatted.push({
          id: stableAnimalRowId(husbandry.id, null, 0),
          name: husbandry.animalTypeName || husbandry.name || "Animals",
          husbandryName: husbandry.name,
          husbandryId: husbandry.id,
          ownerFarmId: husbandry.ownerFarmId,
          farmId: hfarm || farmId,
          age: 24,
          health: 100,
          weight: 0,
          gender: "female",
          subType: husbandry.animalTypeName || "Unknown",
          location: husbandry.name,
          locationType: "pasture",
          isLactating: false,
          isPregnant: false,
          isParent: false,
          __lodClusterAggregate: true,
          clusterCount: count,
          __lodSynth: true,
          __lodSynthEstimate: true,
        });
      }
    }
  }

  return {
    animals: formatted,
    lodState: {
      emitted: globalCounter.emitted || 0,
      trimmed: globalCounter.trimmed || 0,
      capHit: !!globalCounter.capHit,
      cap: globalCounter.cap,
    },
  };
}

export function computeLivestockSummary(animals: LivestockAnimal[]): LivestockSummary {
  const totalCount = countLivestockHeads(animals);
  const lactatingCount = animals.reduce((s, a) => {
    if (a.__emptyPen || !a.isLactating) return s;
    return s + Math.max(1, headCount(a) || 1);
  }, 0);
  const pregnantCount = animals.reduce((s, a) => {
    if (a.__emptyPen || !a.isPregnant) return s;
    return s + Math.max(1, headCount(a) || 1);
  }, 0);
  const avgHealth =
    totalCount > 0
      ? Math.round(
          animals.reduce((sum, a) => {
            if (a.__emptyPen) return sum;
            const h = Number(a.health) || 0;
            const w = headCount(a) || 1;
            return sum + h * w;
          }, 0) / totalCount
        )
      : 0;

  return { totalCount, lactatingCount, pregnantCount, avgHealth };
}

export function sortLivestockAnimals(animals: LivestockAnimal[]): LivestockAnimal[] {
  return [...animals].sort((a, b) => {
    const ea = a.__emptyPen ? 1 : 0;
    const eb = b.__emptyPen ? 1 : 0;
    if (ea !== eb) return ea - eb;
    return String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
  });
}

export function applySummaryFilter(
  animals: LivestockAnimal[],
  filter: "all" | "lactating" | "pregnant" | "health"
): LivestockAnimal[] {
  switch (filter) {
    case "lactating":
      return animals.filter((a) => a.isLactating);
    case "pregnant":
      return animals.filter((a) => a.isPregnant);
    case "health":
      return animals.filter((a) => isLivestockLowHealthRow(a));
    default:
      return [...animals];
  }
}
