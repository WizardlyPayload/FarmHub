const {
  getPlayerFarmRecords,
  getPlayerFarmIdSet,
  pruneMergedDataToPlayerFarms,
} = require("../farmScope.cjs");

describe("farmScope", () => {
  const witcombeFarmInfo = [
    { id: 0, name: "", players: {} },
    { id: 14, name: "", players: {} },
    { id: 1, name: "Main Arable Farm", players: [{ name: "Unknown" }] },
    { id: 2, name: "Main Dairy Farm", players: [{ name: "Unknown" }] },
  ];

  test("Witcombe player farms exclude empty NPC slots", () => {
    const ids = [...getPlayerFarmIdSet(witcombeFarmInfo)];
    expect(ids.sort((a, b) => a - b)).toEqual([1, 2]);
  });

  test("named farm with no online players still counts (dedicated MP)", () => {
    // Mirrors getFarmInfo after 3.4.0.18: empty players[] but non-empty name → keep farm.
    const farmInfo = [
      { id: 1, name: "Main Arable Farm", players: [], isPlayer: true },
      { id: 2, name: "Main Dairy Farm", players: [{ name: "Host" }], isPlayer: true },
      { id: 3, name: "Livestock Farm", players: [], isPlayer: true },
      { id: 15, name: "", players: [] },
    ];
    const ids = [...getPlayerFarmIdSet(farmInfo)].sort((a, b) => a - b);
    expect(ids).toEqual([1, 2, 3]);
    const out = pruneMergedDataToPlayerFarms({
      farmInfo,
      fields: [
        { id: 10, ownerFarmId: 1 },
        { id: 20, ownerFarmId: 2 },
        { id: 30, ownerFarmId: 3 },
        { id: 99, ownerFarmId: 15 },
      ],
      vehicles: [
        { id: "v1", ownerFarmId: 1 },
        { id: "v2", ownerFarmId: 15 },
      ],
    });
    expect(out.fields.map((f) => f.ownerFarmId).sort((a, b) => a - b)).toEqual([1, 2, 3]);
    expect(out.vehicles.map((v) => v.ownerFarmId)).toEqual([1]);
  });

  test("orchard rows retain map orchards and player farms, but not other farms", () => {
    const out = pruneMergedDataToPlayerFarms({
      farmInfo: witcombeFarmInfo,
      orchards: { available: true, rows: [
        { id: "map", farmId: 0, fruitType: "BANANA" },
        { id: "own", farmId: 1, fruitType: "GRAPE" },
        { id: "other", farmId: 14, fruitType: "OLIVE" },
      ] },
    });
    expect(out.orchards.rows.map((row) => row.id)).toEqual(["map", "own"]);
  });

  test("DLC washing capacity remains scoped to player farms", () => {
    const out = pruneMergedDataToPlayerFarms({
      farmInfo: witcombeFarmInfo,
      beansAndAlpacas: {
        enabled: true,
        workersByFarm: { "1": { count: 1 }, "14": { count: 9 } },
        washingCapacityByFarm: { "2": { availableLitres: 500 }, "14": { availableLitres: 9000 } },
      },
    });
    expect(Object.keys(out.beansAndAlpacas.workersByFarm)).toEqual(["1"]);
    expect(Object.keys(out.beansAndAlpacas.washingCapacityByFarm)).toEqual(["2"]);
  });

  test("Highlands fishing totals do not expose non-player farms", () => {
    const out = pruneMergedDataToPlayerFarms({
      farmInfo: witcombeFarmInfo,
      highlandsFishing: {
        enabled: true,
        authoritative: true,
        byFarm: {
          "1": { total: { soldFish: 4 } },
          "14": { total: { soldFish: 99 } },
        },
      },
    });
    expect(Object.keys(out.highlandsFishing.byFarm)).toEqual(["1"]);
    expect(out.highlandsFishing.authoritative).toBe(true);
  });

  test("Pumps N' Hoses and Emergency state stay within player farms", () => {
    const out = pruneMergedDataToPlayerFarms({
      farmInfo: witcombeFarmInfo,
      pumpsAndHoses: {
        enabled: true,
        byFarm: { "1": { ownedVehiclePumps: 1 }, "15": { ownedVehiclePumps: 9 } },
      },
      emergencyPack: {
        enabled: true, authoritative: true, farmId: 15,
        incident: { status: "running", type: "fire" },
      },
    });
    expect(Object.keys(out.pumpsAndHoses.byFarm)).toEqual(["1"]);
    expect(out.emergencyPack.authoritative).toBe(false);
    expect(out.emergencyPack.incident).toBeUndefined();
  });

  test("prune drops farm 15 production and animals", () => {
    const raw = {
      farmInfo: witcombeFarmInfo,
      production: {
        chains: [
          { id: 1, ownerFarmId: 2, name: "Greenhouse" },
          { id: 2, ownerFarmId: 15, name: "Biogas" },
        ],
      },
      animals: [
        { id: "a1", ownerFarmId: 2 },
        { id: "a2", ownerFarmId: 15, husbandryName: "Sheep Pasture" },
      ],
    };
    const out = pruneMergedDataToPlayerFarms(raw);
    expect(out.production.chains.map((c) => c.ownerFarmId)).toEqual([2]);
    expect(out.animals.map((a) => a.ownerFarmId)).toEqual([2]);
  });

  test("prune scopes invoices and hirePurchasing byFarm to player farms", () => {
    const raw = {
      farmInfo: witcombeFarmInfo,
      invoices: {
        enabled: true,
        byFarm: {
          "1": { items: [] },
          "15": { items: [{ id: 9 }] },
        },
      },
      hirePurchasing: {
        enabled: true,
        byFarm: {
          "2": { deals: [] },
          "15": { deals: [{ id: "x" }] },
        },
      },
    };
    const out = pruneMergedDataToPlayerFarms(raw);
    expect(out.invoices.byFarm["1"]).toBeTruthy();
    expect(out.invoices.byFarm["15"]).toBeUndefined();
    expect(out.hirePurchasing.byFarm["2"]).toBeTruthy();
    expect(out.hirePurchasing.byFarm["15"]).toBeUndefined();
  });

  test("DLC worker counts stay within the selected player's farms", () => {
    const out = pruneMergedDataToPlayerFarms({
      farmInfo: witcombeFarmInfo,
      beansAndAlpacas: {
        enabled: true,
        catuaiMap: true,
        workersByFarm: {
          "1": { activeWorkers: 2 },
          "2": { activeWorkers: 3 },
          "15": { activeWorkers: 9 },
        },
      },
    });
    expect(out.beansAndAlpacas.workersByFarm).toEqual({
      "1": { activeWorkers: 2 },
      "2": { activeWorkers: 3 },
    });
    expect(out.beansAndAlpacas.catuaiMap).toBe(true);
  });

  test("prune keeps hydrated husbandry when pen row lacks ownerFarmId", () => {
    const raw = {
      farmInfo: witcombeFarmInfo,
      animals: [
        {
          id: 100,
          name: "Dairy",
          ownerFarmId: 0,
          animals: [
            { id: 1, ownerFarmId: 2, subType: "COW" },
            { id: 2, ownerFarmId: 2, subType: "COW" },
          ],
          __detailHydrated: true,
        },
      ],
    };
    const out = pruneMergedDataToPlayerFarms(raw);
    expect(out.animals).toHaveLength(1);
    expect(out.animals[0].id).toBe(100);
  });
});
