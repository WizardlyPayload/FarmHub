import test from "node:test";
import assert from "node:assert/strict";

import {
  isMowableForageCrop,
  isMowableForageFruitType,
  isPreparedSeedbedGround,
} from "../web/assests/js/forage-crop-types.js";
import {
  isCoverCrop,
  isCoverCropFruitType,
} from "../web/assests/js/cover-crop-types.js";

globalThis.window = globalThis.window || {
  fetch: async () => ({ ok: false, json: async () => ({}) }),
  location: { pathname: "/" },
};

const { getLocalFieldSuggestion } = await import("../web/assests/js/rules-engine.js");

test("alfalfa and clover are mowable forage crops", () => {
  assert.equal(isMowableForageFruitType("ALFALFA"), true);
  assert.equal(isMowableForageFruitType("CLOVER"), true);
  assert.equal(isMowableForageFruitType("GRASS"), true);
  assert.equal(isMowableForageFruitType("MEADOW"), true);
  assert.equal(isMowableForageFruitType("WHEAT"), false);
  assert.equal(isMowableForageFruitType("ALFALFA_WINDROW"), false);
  assert.equal(isMowableForageCrop({ fruitType: "alfalfa" }), true);
});

test("prepared seedbed ground types match FS25 fieldGround density 1-6", () => {
  assert.equal(isPreparedSeedbedGround(1), true); // stubbleTillage
  assert.equal(isPreparedSeedbedGround(2), true); // cultivated
  assert.equal(isPreparedSeedbedGround(6), true); // ridge
  assert.equal(isPreparedSeedbedGround(7), false); // sown
  assert.equal(isPreparedSeedbedGround(14), false); // grass
  assert.equal(isPreparedSeedbedGround(0, "CULTIVATED"), true);
});

test("oilseed radish and mustard are cover crops", () => {
  assert.equal(isCoverCropFruitType("OILSEEDRADISH"), true);
  assert.equal(isCoverCropFruitType("OILSEED_RADISH"), true);
  assert.equal(isCoverCropFruitType("oil seed radish"), true);
  assert.equal(isCoverCropFruitType("MUSTARD"), true);
  assert.equal(isCoverCropFruitType("mustard"), true);
  assert.equal(isCoverCropFruitType("WHEAT"), false);
  assert.equal(isCoverCrop({ fruitType: "MUSTARD" }), true);
});

test("harvest-ready alfalfa suggests mow not combine", () => {
  const sug = getLocalFieldSuggestion({
    farmlandId: 12,
    fruitType: "ALFALFA",
    harvestReady: true,
    growthState: 4,
    maxGrowthState: 4,
  });
  assert.ok(sug);
  assert.equal(sug.actionKey, "rules.action.mowGrass");
});

test("harvest-ready clover suggests mow not combine", () => {
  const sug = getLocalFieldSuggestion({
    farmlandId: 13,
    fruitType: "CLOVER",
    harvestReady: true,
    growthState: 3,
    maxGrowthState: 4,
  });
  assert.ok(sug);
  assert.equal(sug.actionKey, "rules.action.mowGrass");
});

test("harvest-ready wheat still suggests combine", () => {
  const sug = getLocalFieldSuggestion({
    farmlandId: 14,
    fruitType: "WHEAT",
    harvestReady: true,
    growthState: 7,
    maxGrowthState: 7,
  });
  assert.ok(sug);
  assert.equal(sug.actionKey, "rules.action.combineHarvest");
});

test("harvest-ready oilseed radish suggests cultivate cover crop", () => {
  const sug = getLocalFieldSuggestion({
    farmlandId: 15,
    fruitType: "OILSEEDRADISH",
    harvestReady: true,
    growthState: 4,
    maxGrowthState: 4,
  });
  assert.ok(sug);
  assert.equal(sug.actionKey, "rules.action.cultivateCoverCrop");
});

test("harvest-ready mustard (Witcombe) suggests cultivate cover crop", () => {
  const sug = getLocalFieldSuggestion({
    farmlandId: 50,
    fruitType: "MUSTARD",
    harvestReady: true,
    growthState: 9,
    maxGrowthState: 9,
    growthLabel: "harvest_ready",
  });
  assert.ok(sug);
  assert.equal(sug.actionKey, "rules.action.cultivateCoverCrop");
});
