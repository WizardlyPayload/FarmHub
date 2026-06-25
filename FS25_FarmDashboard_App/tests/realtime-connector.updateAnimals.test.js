// FS25 FarmDashboard | tests/realtime-connector.updateAnimals.test.js | v3.9.0
//
// Integration-style coverage for the cluster path inside `updateAnimalsData`.
// We can't import realtime-connector.js directly (it's an ES module that
// imports the i18n runtime), so we mirror the husbandryArray scan that lives
// in updateAnimalsData and drive the production fan-out helper end-to-end.
// Asserts farm filtering, multi-pen aggregation, lodGlobalState, and that
// the global cap fires once across many pens.

const {
  fanOutClustersIndividualRows,
  fanOutAnimalGroupsIndividualRows,
  resolveAnimalGroupHeadCount,
  shouldEmitClusterAggregateRow,
  isDetailClusterSummaryPen,
  DEFAULT_GLOBAL_ROW_CAP,
} = require("../web/assests/js/realtime-fanout.js");

function appendDetailHydratedAnimals(husbandry, hfarm, formattedAnimals, globalCounter) {
  const animalsList = husbandry.animals;
  if (!Array.isArray(animalsList)) return;
  for (let a = 0; a < animalsList.length; a++) {
    const animalGroup = animalsList[a];
    const animalType =
      animalGroup.subType ||
      animalGroup.type ||
      animalGroup.animalType ||
      "Unknown";
    const headsInGroup = resolveAnimalGroupHeadCount(animalGroup);
    if (shouldEmitClusterAggregateRow(animalGroup) && headsInGroup > 1) {
      const synth = fanOutAnimalGroupsIndividualRows(
        husbandry,
        [animalGroup],
        hfarm,
        globalCounter
      );
      for (let s = 0; s < synth.length; s++) formattedAnimals.push(synth[s]);
      continue;
    }
    if (
      animalGroup.id &&
      headsInGroup <= 1 &&
      (animalGroup.numAnimals === undefined || animalGroup.numAnimals <= 1) &&
      (animalGroup.count === undefined || Number(animalGroup.count) <= 1) &&
      (animalGroup.uniqueId ||
        animalGroup.age !== undefined ||
        animalGroup.weight !== undefined)
    ) {
      // Mirrors production RealisticLivestock individual row in updateAnimalsData.
      formattedAnimals.push({
        id: animalGroup.id,
        name: animalGroup.name || `${animalType} ${animalGroup.id}`,
        husbandryName: husbandry.name || husbandry.buildingName,
        husbandryId: husbandry.id || husbandry.buildingId,
        ownerFarmId: husbandry.ownerFarmId || husbandry.farmId,
        farmId: hfarm,
        age: animalGroup.age || animalGroup.ageInMonths || 24,
        health: animalGroup.health || animalGroup.healthStatus || 100,
        weight: animalGroup.weight || animalGroup.currentWeight || 350,
        gender: animalGroup.gender || animalGroup.sex || "female",
        subType: animalType,
        location: husbandry.name || husbandry.buildingName,
        locationType: "pasture",
        isLactating: animalGroup.isLactating || animalGroup.lactating || false,
        isPregnant: animalGroup.isPregnant || animalGroup.pregnant || false,
        isParent: animalGroup.isParent || animalGroup.hasOffspring || false,
        genetics: animalGroup.genetics || null,
        productivity: animalGroup.productivity || null,
        sellPrice: animalGroup.sellPrice || null,
        uniqueId: animalGroup.uniqueId ?? null,
        breed: animalGroup.breed ?? null,
        motherId: animalGroup.motherId ?? null,
        fatherId: animalGroup.fatherId ?? null,
        isCastrated: !!animalGroup.isCastrated,
        birthday: animalGroup.birthday ?? null,
        dirt: animalGroup.dirt,
        fitness: animalGroup.fitness,
        diseaseCount: animalGroup.diseaseCount,
      });
    }
  }
}

function runUpdateAnimalsScenario(payload, options) {
  const opts = options || {};
  const activeFarmId = Number(opts.activeFarmId != null ? opts.activeFarmId : 1);
  const cap = Number.isFinite(opts.cap) ? opts.cap : DEFAULT_GLOBAL_ROW_CAP;
  const formattedAnimals = [];
  const globalCounter = {
    emitted: 0,
    trimmed: 0,
    capHit: false,
    cap: cap,
  };

  const husbandryArray = Array.isArray(payload) ? payload : [];
  for (let i = 0; i < husbandryArray.length; i++) {
    const husbandry = husbandryArray[i];
    if (!husbandry) continue;
    const hfarm = Number(
      husbandry.ownerFarmId != null
        ? husbandry.ownerFarmId
        : husbandry.farmId != null
        ? husbandry.farmId
        : 0
    );
    if (hfarm !== activeFarmId) continue;

    const detailReady =
      (husbandry.__detailHydrated === true || husbandry.lod === "full") &&
      Array.isArray(husbandry.animals) &&
      husbandry.animals.length > 0;
    const detailIsClusterSummary = isDetailClusterSummaryPen(husbandry);
    const clusters = Array.isArray(husbandry.clusters)
      ? husbandry.clusters
      : null;
    const hasBuckets =
      clusters && clusters.some((c) => c && Number(c.count) > 0);

    if ((!detailReady || detailIsClusterSummary) && hasBuckets) {
      const synth = fanOutClustersIndividualRows(
        husbandry,
        clusters,
        hfarm,
        globalCounter
      );
      for (let s = 0; s < synth.length; s++) formattedAnimals.push(synth[s]);
      if (synth.length > 0) continue;
    }

    if (detailReady) {
      appendDetailHydratedAnimals(husbandry, hfarm, formattedAnimals, globalCounter);
    }
  }

  return {
    animals: formattedAnimals,
    lodGlobalState: {
      emitted: globalCounter.emitted || 0,
      trimmed: globalCounter.trimmed || 0,
      capHit: !!globalCounter.capHit,
      cap: Number.isFinite(globalCounter.cap)
        ? globalCounter.cap
        : DEFAULT_GLOBAL_ROW_CAP,
    },
  };
}

describe("updateAnimalsData cluster path (multi-pen)", () => {
  test("filters out husbandries owned by other farms", () => {
    const result = runUpdateAnimalsScenario(
      [
        {
          id: 1,
          ownerFarmId: 1,
          clusters: [{ count: 3, subType: "COW" }],
        },
        {
          id: 2,
          ownerFarmId: 2,
          clusters: [{ count: 99, subType: "PIG" }],
        },
      ],
      { activeFarmId: 1 }
    );
    expect(result.animals.length).toBe(3);
    expect(result.animals.every((a) => a.farmId === 1)).toBe(true);
  });

  test("aggregates emitted heads across pens until global cap fires once", () => {
    const husbandries = [];
    for (let i = 0; i < 10; i++) {
      husbandries.push({
        id: i + 1,
        ownerFarmId: 1,
        clusters: [{ count: 100, subType: "COW" }],
      });
    }
    const result = runUpdateAnimalsScenario(husbandries, {
      activeFarmId: 1,
      cap: 350,
    });
    expect(result.animals.length).toBe(350);
    expect(result.lodGlobalState.capHit).toBe(true);
    expect(result.lodGlobalState.emitted).toBe(350);
    // 10 pens * 100 = 1000 heads; 350 emitted, 650 trimmed.
    expect(result.lodGlobalState.trimmed).toBe(650);
  });

  test("skips clusters when detail JSON has hydrated this pen", () => {
    const result = runUpdateAnimalsScenario(
      [
        {
          id: 5,
          ownerFarmId: 1,
          __detailHydrated: true,
          animals: [{ id: "real-1", subType: "COW", uniqueId: "rl-1" }],
          clusters: [{ count: 99, subType: "COW" }],
        },
      ],
      { activeFarmId: 1 }
    );
    expect(result.animals.length).toBe(1);
    expect(result.lodGlobalState.emitted).toBe(0);
  });

  test("hydrated cluster buckets fan out to one list row per head", () => {
    const result = runUpdateAnimalsScenario(
      [
        {
          id: 10,
          ownerFarmId: 1,
          __detailHydrated: true,
          clusters: [
            { count: 40, subType: "COW", gender: "female" },
            { count: 25, subType: "COW", gender: "female" },
          ],
          animals: [
            {
              id: 1,
              type: "cluster",
              subType: "COW",
              count: 40,
              avgWeight: 520,
              avgHealth: 88,
            },
            {
              id: 2,
              type: "cluster",
              subType: "COW",
              count: 25,
              weight: 500,
              health: 90,
            },
          ],
        },
      ],
      { activeFarmId: 1 }
    );
    expect(result.animals).toHaveLength(65);
    expect(result.animals.every((a) => a.__lodSynth === true)).toBe(true);
  });

  test("empty husbandry array yields zero animals and no cap hit", () => {
    const result = runUpdateAnimalsScenario([], { activeFarmId: 1 });
    expect(result.animals.length).toBe(0);
    expect(result.lodGlobalState.emitted).toBe(0);
    expect(result.lodGlobalState.capHit).toBe(false);
  });
});

describe("updateAnimalsData RealisticLivestock guardrails", () => {
  test("RL hydrated individuals are not replaced by LOD cluster fan-out", () => {
    const result = runUpdateAnimalsScenario(
      [
        {
          id: 5,
          name: "Cow Barn",
          ownerFarmId: 1,
          __detailHydrated: true,
          lod: "full",
          animals: [
            {
              id: 410001,
              uniqueId: "410001",
              subType: "HOLSTEIN",
              breed: "Holstein",
              age: 36,
              weight: 620,
              health: 94,
              genetics: { fertility: 0.8, productivity: 0.75 },
              isLactating: true,
            },
            {
              id: 410002,
              uniqueId: "410002",
              subType: "HOLSTEIN",
              breed: "Holstein",
              age: 24,
              weight: 580,
              health: 91,
            },
          ],
          clusters: [{ count: 99, subType: "COW" }],
        },
      ],
      { activeFarmId: 1 }
    );
    expect(result.animals).toHaveLength(2);
    expect(result.animals.every((a) => !a.__lodSynth)).toBe(true);
    expect(result.animals.map((a) => a.uniqueId)).toEqual(["410001", "410002"]);
    expect(result.animals[0].genetics).toEqual({
      fertility: 0.8,
      productivity: 0.75,
    });
    expect(result.animals[0].breed).toBe("Holstein");
    expect(result.animals[0].isLactating).toBe(true);
    expect(result.lodGlobalState.emitted).toBe(0);
  });

  test("incomplete RL detail does not block cluster fan-out on aggregate pen", () => {
    const result = runUpdateAnimalsScenario(
      [
        {
          id: 100,
          ownerFarmId: 1,
          animalCount: 80,
          numOfAnimalsReported: 71,
          clusters: [
            { count: 40, subType: "COW" },
            { count: 25, subType: "COW" },
            { count: 15, subType: "COW" },
          ],
        },
      ],
      { activeFarmId: 1 }
    );
    expect(result.animals.length).toBe(80);
    expect(result.animals.every((a) => a.__lodSynth === true)).toBe(true);
  });
});
