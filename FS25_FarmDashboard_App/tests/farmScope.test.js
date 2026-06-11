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
