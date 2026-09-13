import { looksLikeStableAnimalId, stableAnimalRowId } from "./livestock-fanout";
import type { LivestockAnimal, PenDetailAnimal } from "./livestock-types";

function finiteNumber(v: unknown, fallback?: number): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function parentRef(v: unknown): string | number | null {
  if (v == null || v === "" || v === -1 || v === "-1") return null;
  return v as string | number;
}

/** Pens whose table rows are still cloned cluster averages, not RL unique-id heads. */
export function collectPensNeedingDetailHydration(animals: LivestockAnimal[]): string[] {
  const byPen = new Map<string, { synth: boolean; unique: boolean }>();
  for (const a of animals) {
    if (!a || a.__emptyPen) continue;
    const pid = a.husbandryId ?? a.huId;
    if (pid == null || String(pid) === "") continue;
    const key = String(pid);
    const cur = byPen.get(key) || { synth: false, unique: false };
    if (a.__lodSynth || a.__lodSynthEstimate) cur.synth = true;
    if (a.uniqueId != null && String(a.uniqueId).trim() !== "") cur.unique = true;
    byPen.set(key, cur);
  }
  const need: string[] = [];
  for (const [pid, v] of byPen) {
    if (v.synth && !v.unique) need.push(pid);
  }
  return need;
}

export function penDetailAnimalsLookIndividual(animals: PenDetailAnimal[]): boolean {
  if (!animals.length) return false;
  let unique = 0;
  for (const a of animals) {
    if (a?.uniqueId != null && String(a.uniqueId).trim() !== "") unique += 1;
  }
  if (unique === 0) return false;
  if (animals.length === 1) return true;
  if (unique >= Math.max(1, animals.length * 0.5)) return true;
  const first = animals[0];
  const sameWeight = animals.every((a) => Number(a.weight) === Number(first.weight));
  const sameHealth = animals.every((a) => Number(a.health) === Number(first.health));
  return !(sameWeight && sameHealth);
}

export function penDetailAnimalsToLivestockRows(
  penId: string | number,
  animals: PenDetailAnimal[],
  template: LivestockAnimal | null | undefined,
  farmId: number
): LivestockAnimal[] {
  const husbandryName = template?.husbandryName || template?.location || "";
  const ownerFarmId = template?.ownerFarmId || template?.farmId || farmId;
  return animals.map((a, i) => {
    const uniqueId = a.uniqueId ?? a.tag ?? null;
    const id = looksLikeStableAnimalId(a.id) ? a.id! : stableAnimalRowId(penId, uniqueId, i);
    const subType = String(a.subType || a.type || a.name || "Unknown");
    const earTag = uniqueId != null && String(uniqueId) !== "" ? String(uniqueId) : String(id);
    const genetics =
      a.genetics && typeof a.genetics === "object" ? a.genetics : null;
    return {
      id,
      name: a.name || `${subType} ${earTag}`,
      husbandryName,
      husbandryId: penId,
      ownerFarmId,
      farmId,
      age: finiteNumber(a.age ?? a.ageInMonths),
      health: finiteNumber(a.health),
      weight: finiteNumber(a.weight),
      gender: a.gender || "female",
      subType,
      type: a.type || subType,
      location: husbandryName,
      locationType: template?.locationType || "pasture",
      isLactating: !!a.isLactating,
      isPregnant: !!a.isPregnant,
      isCastrated: !!a.isCastrated,
      genetics,
      uniqueId,
      breed: a.breed ?? null,
      motherId: parentRef(a.motherId),
      fatherId: parentRef(a.fatherId),
      dirt: finiteNumber(a.dirt),
      fitness: finiteNumber(a.fitness),
      productivity: finiteNumber(a.productivity) ?? null,
      birthday: a.birthday ?? null,
      __lodSynth: false,
      __lodSynthEstimate: false,
      __detailHydrated: true,
    };
  });
}

/** Replace cloned cluster rows with per-head detail rows for the same pen. */
export function mergeAnimalsWithPenHydration(
  base: LivestockAnimal[],
  hydratedByPen: Record<string, LivestockAnimal[]>
): LivestockAnimal[] {
  const used = new Set<string>();
  const out: LivestockAnimal[] = [];
  for (const row of base) {
    const pid =
      row.husbandryId != null
        ? String(row.husbandryId)
        : row.huId != null
          ? String(row.huId)
          : "";
    const replacement = pid ? hydratedByPen[pid] : undefined;
    const penStillSynth =
      !!replacement?.length && !!(row.__lodSynth || row.__lodSynthEstimate);
    if (pid && penStillSynth) {
      if (!used.has(pid)) {
        used.add(pid);
        out.push(...replacement);
      }
      continue;
    }
    out.push(row);
  }
  return out;
}
