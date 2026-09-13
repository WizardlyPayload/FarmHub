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
