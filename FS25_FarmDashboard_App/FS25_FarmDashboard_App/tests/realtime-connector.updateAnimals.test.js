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
  DEFAULT_GLOBAL_ROW_CAP,
} = require("../web/assests/js/realtime-fanout.js");

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
    const clusters = Array.isArray(husbandry.clusters)
      ? husbandry.clusters
      : null;
    const hasBuckets =
      clusters && clusters.some((c) => c && Number(c.count) > 0);

    if (!detailReady && hasBuckets) {
      const synth = fanOutClustersIndividualRows(
        husbandry,
        clusters,
        hfarm,
        globalCounter
      );
      for (let s = 0; s < synth.length; s++) formattedAnimals.push(synth[s]);
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
          animals: [{ id: "real-1", subType: "COW" }],
          clusters: [{ count: 99, subType: "COW" }],
        },
      ],
      { activeFarmId: 1 }
    );
    expect(result.animals.length).toBe(0);
    expect(result.lodGlobalState.emitted).toBe(0);
  });

  test("empty husbandry array yields zero animals and no cap hit", () => {
    const result = runUpdateAnimalsScenario([], { activeFarmId: 1 });
    expect(result.animals.length).toBe(0);
    expect(result.lodGlobalState.emitted).toBe(0);
    expect(result.lodGlobalState.capHit).toBe(false);
  });
});
