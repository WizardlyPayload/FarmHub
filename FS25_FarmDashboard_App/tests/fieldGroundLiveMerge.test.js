"use strict";

const { mergeFields } = require("../dataMerger");

test("live cultivated ground and empty crop replace stale XML meadow", () => {
  const [field] = mergeFields(
    [{ id: 42, farmlandId: 42, groundType: "NONE", stateName: "Meadow", fruitType: "MEADOW", fruitTypeIndex: 25, growthState: 4 }],
    [{ id: 42, farmlandId: 42, groundType: 3, groundTypeName: "CULTIVATED", stateName: "Cultivated", fruitType: "empty", fruitTypeIndex: 0, growthState: 0, harvestReady: false }],
  );
  expect(field).toMatchObject({
    groundType: "CULTIVATED",
    groundTypeName: "CULTIVATED",
    stateName: "Cultivated",
    fruitType: "empty",
    fruitTypeIndex: 0,
    growthState: 0,
  });
});

test("a standing live crop is retained even if the ground name is prepared", () => {
  const [field] = mergeFields(
    [{ id: 7, farmlandId: 7, groundType: "SOWN", fruitType: "WHEAT", fruitTypeIndex: 8, growthState: 3 }],
    [{ id: 7, farmlandId: 7, groundType: 3, groundTypeName: "CULTIVATED", fruitType: "WHEAT", fruitTypeIndex: 8, growthState: 3 }],
  );
  expect(field.fruitType).toBe("WHEAT");
  expect(field.growthState).toBe(3);
});
