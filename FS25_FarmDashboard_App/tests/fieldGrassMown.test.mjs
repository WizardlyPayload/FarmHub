import test from "node:test";
import assert from "node:assert/strict";

globalThis.window = globalThis.window || {
  fetch: async () => ({ ok: false, json: async () => ({}) }),
  location: { pathname: "/" },
};

const { isFreshlyMownGrass } = await import(
  "../web/assests/js/rules-engine.js"
);

// Mirrors the real Field 49 export: grass cut, fresh wet grass windrow present,
// engine growthState dropped to the 2/4 regrowth band (game shows "Harvested").
const field49 = {
  fruitType: "GRASS",
  growthState: 2,
  maxGrowthState: 4,
  growthLabel: "growing",
  harvestReady: false,
  isHarvested: false,
  hasLooseGrassWindrow: true,
  hasLooseHayWindrow: false,
  looseGrassWindrowLiters: 43434.38,
  windrowLiters: 43434,
  windrowType: "Grass",
  windrowByFillName: { GRASS_WINDROW: 43434.38, DRYGRASS_WINDROW: 0, STRAW: 0 },
  windrowMoisture: { isHay: false, percent: 18.1 },
};

test("freshly-cut grass with a fresh windrow reads as mown (not growing)", () => {
  assert.equal(isFreshlyMownGrass(field49), true);
});

test("a dried-grass (hay) windrow is NOT a fresh-cut signal", () => {
  const hay = {
    ...field49,
    hasLooseGrassWindrow: false,
    hasLooseHayWindrow: true,
    looseGrassWindrowLiters: 0,
    looseDryGrassWindrowLiters: 43434,
    windrowByFillName: { GRASS_WINDROW: 0, DRYGRASS_WINDROW: 43434, STRAW: 0 },
    windrowMoisture: { isHay: true, percent: 5 },
  };
  assert.equal(isFreshlyMownGrass(hay), false);
});

test("grass with no meaningful windrow stays 'growing'", () => {
  const growing = {
    ...field49,
    hasLooseGrassWindrow: false,
    looseGrassWindrowLiters: 0,
    windrowLiters: 0,
    windrowByFillName: { GRASS_WINDROW: 0, DRYGRASS_WINDROW: 0, STRAW: 0 },
  };
  assert.equal(isFreshlyMownGrass(growing), false);
});

test("tall grass at the ready-to-cut stage is not 'mown'", () => {
  const tall = { ...field49, growthState: 4 };
  assert.equal(isFreshlyMownGrass(tall), false);
});

test("a small wisp of leftover grass below the workflow floor is ignored", () => {
  const wisp = {
    ...field49,
    looseGrassWindrowLiters: 150,
    windrowLiters: 150,
    windrowByFillName: { GRASS_WINDROW: 150, DRYGRASS_WINDROW: 0, STRAW: 0 },
  };
  assert.equal(isFreshlyMownGrass(wisp), false);
});

test("non-grass crops are never flagged as mown grass", () => {
  const wheat = { ...field49, fruitType: "WHEAT" };
  assert.equal(isFreshlyMownGrass(wheat), false);
});
