// FS25 FarmDashboard | tests/pastures.warnings.test.js | v3.9.0
//
// Unit coverage for the pasture warning decision boundaries. Tests run
// against the shared `pastures-warnings.js` helper that production code
// delegates to, so green tests reflect shipping behavior. Verifies the
// telemetry-absent vs critical separation introduced in v3.9 and confirms
// head-aware counting on cluster-LOD aggregates.

const {
  countLivestockHeads,
  buildFoodWaterDecisions,
} = require("../web/assests/js/pastures-warnings.js");

describe("countLivestockHeads (head-aware)", () => {
  test("counts each plain row as one head", () => {
    expect(countLivestockHeads([{ id: 1 }, { id: 2 }, { id: 3 }])).toBe(3);
  });

  test("respects clusterCount on LOD aggregate rows", () => {
    expect(
      countLivestockHeads([
        { id: 1, __lodClusterAggregate: true, clusterCount: 12 },
        { id: 2, __lodClusterAggregate: true, clusterCount: 7 },
      ])
    ).toBe(19);
  });

  test("ignores empty-pen sentinels", () => {
    expect(
      countLivestockHeads([{ id: 1 }, { __emptyPen: true }, { id: 2 }])
    ).toBe(2);
  });

  test("non-array input returns 0", () => {
    expect(countLivestockHeads(null)).toBe(0);
    expect(countLivestockHeads(undefined)).toBe(0);
    expect(countLivestockHeads({})).toBe(0);
  });
});

describe("buildFoodWaterDecisions: telemetry-absent path", () => {
  test("emits info-severity data_unavailable warnings (food + water)", () => {
    const out = buildFoodWaterDecisions(8, { hasRealData: false });
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      type: "data_unavailable",
      subtype: "food",
      severity: "info",
      count: 8,
    });
    expect(out[1]).toMatchObject({
      type: "data_unavailable",
      subtype: "water",
      severity: "info",
      count: 8,
    });
  });

  test("never emits danger severity when telemetry is missing", () => {
    const out = buildFoodWaterDecisions(40, { hasRealData: false });
    for (const w of out) expect(w.severity).not.toBe("danger");
  });

  test("zero heads suppresses telemetry warnings (empty pen)", () => {
    const out = buildFoodWaterDecisions(0, { hasRealData: false });
    expect(out).toHaveLength(0);
  });
});

describe("buildFoodWaterDecisions: critical path (real data)", () => {
  test("emits danger severity below 10%", () => {
    const out = buildFoodWaterDecisions(5, {
      hasRealData: true,
      totalMixedRation: 50,
      totalCapacity: 1000,
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      type: "food",
      severity: "danger",
    });
    expect(out[0].percent).toBeCloseTo(5);
  });

  test("emits warning severity between 10% and 20%", () => {
    const out = buildFoodWaterDecisions(5, {
      hasRealData: true,
      totalMixedRation: 150,
      totalCapacity: 1000,
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      type: "food",
      severity: "warning",
    });
  });

  test("no warning when food >= 20%", () => {
    const out = buildFoodWaterDecisions(5, {
      hasRealData: true,
      totalMixedRation: 500,
      totalCapacity: 1000,
    });
    expect(out).toHaveLength(0);
  });

  test("guards against zero capacity (no division by zero)", () => {
    const out = buildFoodWaterDecisions(5, {
      hasRealData: true,
      totalMixedRation: 0,
      totalCapacity: 0,
    });
    expect(out).toHaveLength(0);
  });
});

describe("Telemetry vs critical: distinct semantics", () => {
  test("identical animal count, two different food reports => different severities", () => {
    const heads = 12;
    const telemetry = buildFoodWaterDecisions(heads, { hasRealData: false });
    const critical = buildFoodWaterDecisions(heads, {
      hasRealData: true,
      totalMixedRation: 10,
      totalCapacity: 1000,
    });
    expect(telemetry.some((w) => w.severity === "danger")).toBe(false);
    expect(critical.some((w) => w.severity === "danger")).toBe(true);
    expect(telemetry.every((w) => w.type === "data_unavailable")).toBe(true);
    expect(critical.every((w) => w.type === "food")).toBe(true);
  });
});

describe("Head-aware counting via clusterCount", () => {
  test("buildFoodWaterDecisions trusts the heads count we pass in", () => {
    // The helper itself does not call countLivestockHeads; it accepts the
    // number directly. Pair them: a single LOD aggregate row that represents
    // 50 heads should yield warnings tied to 50 heads, not 1.
    const aggregateRows = [
      { id: 1, __lodClusterAggregate: true, clusterCount: 50 },
    ];
    const heads = countLivestockHeads(aggregateRows);
    expect(heads).toBe(50);
    const out = buildFoodWaterDecisions(heads, { hasRealData: false });
    expect(out).toHaveLength(2);
    expect(out[0].count).toBe(50);
    expect(out[1].count).toBe(50);
  });
});
