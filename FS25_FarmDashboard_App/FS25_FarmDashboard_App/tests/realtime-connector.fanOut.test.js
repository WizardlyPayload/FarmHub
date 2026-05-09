// FS25 FarmDashboard | tests/realtime-connector.fanOut.test.js | v3.9.0
//
// Imports the production helper directly so test green status reflects the
// behavior actually shipped to users. Production fans LOD `clusters[]` into
// **one row per animal head** (no aggregate rows), with both per-pen and
// global caps. `globalCounter.emitted` counts emitted heads; `trimmed` counts
// heads skipped by either cap.

const {
  fanOutClustersIndividualRows,
  DEFAULT_PEN_HEAD_ROW_CAP,
  DEFAULT_GLOBAL_ROW_CAP,
} = require("../web/assests/js/realtime-fanout.js");

describe("LOD per-head fan-out (per pen)", () => {
  test("emits one row per head and never collapses to an aggregate", () => {
    const counter = { emitted: 0, cap: 100000 };
    const husbandry = { id: 7 };
    const out = fanOutClustersIndividualRows(
      husbandry,
      [{ count: 12, subType: "COW", avgHealth: 80 }],
      1,
      counter
    );
    expect(out.length).toBe(12);
    expect(counter.emitted).toBe(12);
    expect(out[0].subType).toBe("COW");
    expect(out[0].health).toBe(80);
    expect(out[0].__lodSynth).toBe(true);
    expect(husbandry.__lodTrimmed).toBeUndefined();
  });

  test("default per-pen cap is 4096 heads; remaining heads counted as trimmed", () => {
    expect(DEFAULT_PEN_HEAD_ROW_CAP).toBe(4096);
    const counter = { emitted: 0, cap: 100000 };
    const husbandry = { id: 8 };
    const out = fanOutClustersIndividualRows(
      husbandry,
      [{ count: 5000, subType: "PIG" }],
      1,
      counter
    );
    expect(out.length).toBe(4096);
    expect(husbandry.__lodTrimmed).toBe(5000 - 4096);
    expect(counter.trimmed).toBe(5000 - 4096);
  });

  test("future clusters are also counted as trimmed once cap is hit", () => {
    const counter = { emitted: 0, cap: 100000 };
    const husbandry = { id: 9 };
    const clusters = [
      { count: 4096, subType: "SHEEP" },
      { count: 50, subType: "GOAT" },
    ];
    const out = fanOutClustersIndividualRows(
      husbandry,
      clusters,
      1,
      counter
    );
    expect(out.length).toBe(4096);
    expect(husbandry.__lodTrimmed).toBe(50);
    expect(counter.trimmed).toBe(50);
  });

  test("propagates cluster averages into per-head rows", () => {
    const counter = { emitted: 0, cap: 100 };
    const out = fanOutClustersIndividualRows(
      { id: 11, name: "Big Pen" },
      [
        {
          count: 2,
          subType: "COW",
          avgAgeMonths: 30,
          avgHealth: 75,
          avgWeight: 600,
          avgGenFert: 0.7,
          avgGenProd: 0.6,
          avgGenHealth: 0.8,
          avgGenMetabolism: 0.65,
          avgGenQuality: 0.55,
          isLactating: true,
        },
      ],
      1,
      counter
    );
    expect(out.length).toBe(2);
    expect(out[0]).toMatchObject({
      age: 30,
      health: 75,
      weight: 600,
      isLactating: true,
      __lodSynth: true,
      __lodSynthEstimate: true,
    });
    expect(out[0].genetics).toEqual({
      fertility: 0.7,
      productivity: 0.6,
      health: 0.8,
      metabolism: 0.65,
      quality: 0.55,
    });
    expect(out[0].id).toBe("11-c0-h0");
    expect(out[1].id).toBe("11-c0-h1");
  });

  test("zero or negative cluster counts are skipped, no rows emitted", () => {
    const counter = { emitted: 0, cap: 100 };
    const husbandry = { id: 12 };
    const out = fanOutClustersIndividualRows(
      husbandry,
      [{ count: 0 }, { count: -3 }, { count: 4, subType: "SHEEP" }],
      1,
      counter
    );
    expect(out.length).toBe(4);
    expect(counter.emitted).toBe(4);
    expect(husbandry.__lodTrimmed).toBeUndefined();
  });
});

describe("LOD per-head fan-out (global cap across pens)", () => {
  test("global cap stops emission across pens and tracks trimmed heads", () => {
    const counter = { emitted: 0, cap: 5 };
    const huA = { id: "A" };
    const huB = { id: "B" };
    const a = fanOutClustersIndividualRows(
      huA,
      [{ count: 4, subType: "COW" }],
      1,
      counter
    );
    const b = fanOutClustersIndividualRows(
      huB,
      [{ count: 4, subType: "COW" }],
      1,
      counter
    );
    expect(a.length).toBe(4);
    expect(b.length).toBe(1);
    expect(counter.emitted).toBe(5);
    expect(counter.capHit).toBe(true);
    expect(counter.trimmed).toBe(3);
  });

  test("falls back to default global cap when counter has no .cap", () => {
    expect(DEFAULT_GLOBAL_ROW_CAP).toBe(8000);
    const counter = { emitted: 0 };
    const husbandry = { id: 1 };
    const out = fanOutClustersIndividualRows(
      husbandry,
      [{ count: 8001, subType: "COW" }],
      1,
      counter
    );
    expect(out.length).toBe(4096); // per-pen cap dominates first
    expect(husbandry.__lodTrimmed).toBe(8001 - 4096);
  });

  test("stable id format pens+cluster+head", () => {
    const counter = { emitted: 0, cap: 100 };
    const out = fanOutClustersIndividualRows(
      { id: 42 },
      [
        { count: 1, subType: "COW" },
        { count: 1, subType: "PIG" },
      ],
      1,
      counter
    );
    expect(out.map((r) => r.id)).toEqual(["42-c0-h0", "42-c1-h0"]);
  });
});
