"use strict";

const { productionTs } = require("./helpers/production-source.cjs");
const { normalizeLivestockAnimals } = productionTs("NEW APP/src/lib/livestock-normalize.ts");

test("one alpaca's measured DLC values reach the V5 livestock row", () => {
  const result = normalizeLivestockAnimals([{
    id: 4,
    ownerFarmId: 1,
    animalCount: 1,
    clusters: [{ subType: "ALPACA_WHITE", count: 1, avgHappiness: 0, avgFleeceState: 72, canBeSheared: false, fleeceLiters: 0 }],
  }], 1);
  expect(result.animals).toHaveLength(1);
  expect(result.animals[0]).toMatchObject({ happiness: 0, fleeceState: 72, canBeSheared: false, fleeceLiters: 0 });
});

test("a grouped alpaca's shearing state is not assigned to each synthetic animal", () => {
  const result = normalizeLivestockAnimals([{
    id: 6, ownerFarmId: 1, animalCount: 2,
    clusters: [{ subType: "ALPACA_BROWN", count: 2, shearableCount: 1, totalFleeceLiters: 40 }],
  }], 1);
  expect(result.animals).toHaveLength(2);
  for (const animal of result.animals) {
    expect(animal.canBeSheared).toBeUndefined();
    expect(animal.fleeceLiters).toBeUndefined();
  }
});

test("ordinary livestock does not acquire alpaca status", () => {
  const result = normalizeLivestockAnimals([{
    id: 5,
    ownerFarmId: 1,
    animalCount: 2,
    clusters: [{ subType: "COW", count: 2 }],
  }], 1);
  expect(result.animals).toHaveLength(2);
  for (const animal of result.animals) {
    expect(animal.happiness).toBeUndefined();
    expect(animal.fleeceState).toBeUndefined();
  }
});
