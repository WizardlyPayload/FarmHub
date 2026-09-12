import { useEffect, useMemo, useState } from "preact/hooks";
import { loadPenDetail } from "@/lib/pen-detail";
import {
  collectPensNeedingDetailHydration,
  mergeAnimalsWithPenHydration,
  penDetailAnimalsLookIndividual,
  penDetailAnimalsToLivestockRows,
} from "@/lib/livestock-hydrate";
import { normalizeLivestockAnimals } from "@/lib/livestock-normalize";
import type { LivestockAnimal, LodGlobalState } from "@/lib/livestock-types";

export function useHydratedLivestockAnimals(opts: {
  animalsData: unknown;
  activeFarmId: number | null;
  activeServerId: string | null;
  husbandryId?: string | number | null;
}): {
  flattenedAnimals: LivestockAnimal[];
  animals: LivestockAnimal[];
  lodState: LodGlobalState;
} {
  const { animalsData, activeFarmId, activeServerId, husbandryId } = opts;
  const { animals: flattenedAnimals, lodState } = useMemo(
    () => normalizeLivestockAnimals(animalsData, activeFarmId),
    [animalsData, activeFarmId],
  );
  // An immutable source payload is one hydration generation, even if pen IDs do not change.
  const generation = useMemo(
    () => ({}),
    [animalsData, activeServerId, activeFarmId, husbandryId],
  );
  const [hydration, setHydration] = useState<{
    generation: object | null;
    byPen: Record<string, LivestockAnimal[]>;
  }>({ generation: null, byPen: {} });
  const animals = useMemo(
    () => mergeAnimalsWithPenHydration(
      flattenedAnimals,
      hydration.generation === generation ? hydration.byPen : {},
    ),
    [flattenedAnimals, hydration, generation],
  );
  useEffect(() => {
    let cancelled = false;
    const needed = collectPensNeedingDetailHydration(flattenedAnimals).filter(
      id => husbandryId == null || husbandryId === "" || id === String(husbandryId),
    );
    const farmId = Number(activeFarmId ?? 1);
    setHydration({ generation, byPen: {} });
    let cursor = 0;
    const worker = async () => {
      while (!cancelled && cursor < needed.length) {
        const pid = needed[cursor++];
        if (pid == null) return;
        try {
          const envelope = await loadPenDetail(pid, { serverId: activeServerId });
          const list = envelope?.detail?.animals;
          if (cancelled || !list?.length || !penDetailAnimalsLookIndividual(list)) continue;
          const template = flattenedAnimals.find(
            animal => String(animal.husbandryId ?? animal.huId ?? "") === pid,
          );
          const rows = penDetailAnimalsToLivestockRows(pid, list, template, farmId);
          if (!cancelled && rows.length) {
            setHydration(previous => previous.generation === generation
              ? { generation, byPen: { ...previous.byPen, [pid]: rows } }
              : previous);
          }
        } catch {
          // Keep the current summary; a failed pen must not strand the other workers.
        }
      }
    };
    void Promise.all(Array.from({ length: Math.min(4, needed.length) }, () => worker()));
    return () => { cancelled = true; };
  }, [generation, flattenedAnimals, activeServerId, activeFarmId, husbandryId]);
  return { flattenedAnimals, animals, lodState };
}
