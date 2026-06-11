import test from "node:test";
import assert from "node:assert/strict";

globalThis.window = globalThis.window || {
  fetch: async () => ({ ok: false, json: async () => ({}) }),
  location: { pathname: "/" },
};

const { getLocalFieldSuggestion, pfNitrogenWithinTolerance } = await import(
  "../web/assests/js/rules-engine.js"
);

const base = {
  gameSettings: {
    weedsEnabled: true,
    stonesEnabled: true,
    plowingRequired: true,
    limeRequired: true,
  },
  skippedOptionalOrganic: {},
};

test("roll is suggested before mechanical weed at early growth", () => {
  const sug = getLocalFieldSuggestion(
    {
      farmlandId: 28,
      fruitType: "WHEAT",
      growthState: 1,
      needsRolling: true,
      needsWeeding: true,
      weedLevel: 0.85,
    },
    base
  );
  assert.ok(sug);
  assert.match(String(sug.actionKey || sug.action), /roll/i);
});

test("weed is suggested when roll is not required", () => {
  const sug = getLocalFieldSuggestion(
    {
      farmlandId: 30,
      fruitType: "WHEAT",
      growthState: 2,
      needsRolling: false,
      rollerLevel: 1,
      needsWeeding: true,
      weedLevel: 0.6,
      fertilizationLevel: 2,
      needsFertilizer: false,
    },
    base
  );
  assert.ok(sug);
  assert.match(String(sug.actionKey || sug.action), /weed|herbicide/i);
});

test("PF nitrogen within 10% skips add-N and moves to next step", () => {
  const field = {
    farmlandId: 15,
    fruitType: "LINSEED",
    growthState: 3,
    isPrecisionFarming: true,
    isScanned: true,
    nitrogenLevel: 156,
    targetNitrogen: 165,
    needsFertilizer: true,
    needsLime: false,
    needsWeeding: false,
    needsRolling: false,
    fertilizationLevel: 1.9,
  };
  assert.equal(pfNitrogenWithinTolerance(field), true);
  const sug = getLocalFieldSuggestion(field, base);
  assert.ok(sug);
  assert.doesNotMatch(String(sug.actionKey || sug.action), /nitrogen|kg n/i);
});

test("PF nitrogen below 10% gap still suggests top-up", () => {
  const field = {
    farmlandId: 99,
    fruitType: "LINSEED",
    growthState: 3,
    isPrecisionFarming: true,
    isScanned: true,
    nitrogenLevel: 130,
    targetNitrogen: 165,
    needsFertilizer: true,
    needsLime: false,
    needsWeeding: false,
    needsRolling: false,
  };
  assert.equal(pfNitrogenWithinTolerance(field), false);
  const sug = getLocalFieldSuggestion(field, base);
  assert.ok(sug);
  assert.match(String(sug.actionKey || sug.action), /addNTarget|nitrogen|kg n/i);
});
