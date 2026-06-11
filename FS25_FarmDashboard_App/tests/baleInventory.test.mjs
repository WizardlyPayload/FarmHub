import test from "node:test";
import assert from "node:assert/strict";

globalThis.window = globalThis.window || {
  fetch: async () => ({ ok: false, json: async () => ({}) }),
  location: { pathname: "/" },
};

const { resolveBaleInventoryForFarm, aggregateConsumables } = await import(
  "../web/assests/js/modules/economy.js"
);

test("resolveBaleInventoryForFarm uses inStorage from byFarm", () => {
  const inv = {
    byFarm: {
      "1": {
        onField: { straw: 2 },
        inStorage: { hay: 4, silage: 1 },
      },
    },
  };
  const f1 = resolveBaleInventoryForFarm(inv, 1);
  assert.equal(f1.onField.straw, 2);
  assert.equal(f1.inStorage.hay, 4);
  assert.equal(f1.offField.hay, 4);
});

test("resolveBaleInventoryForFarm falls back offField to inStorage", () => {
  const inv = {
    byFarm: {
      "2": { onField: {}, offField: { grass: 3 } },
    },
  };
  const f2 = resolveBaleInventoryForFarm(inv, 2);
  assert.equal(f2.inStorage.grass, 3);
});

test("aggregateConsumables groups full pallets and lists partials", () => {
  const items = [
    {
      name: "Lime Pallet",
      typeName: "pallet",
      fillLevels: {
        LIME: { level: 2000, capacity: 2000 },
      },
    },
    {
      name: "Lime Pallet",
      typeName: "pallet",
      fillLevels: {
        LIME: { level: 2000, capacity: 2000 },
      },
    },
    {
      name: "Lime Pallet",
      typeName: "pallet",
      fillLevels: {
        LIME: { level: 900, capacity: 2000 },
      },
    },
    {
      name: "Lime Pallet",
      typeName: "pallet",
      fillLevels: {
        LIME: { level: 400, capacity: 2000 },
      },
    },
  ];
  const groups = aggregateConsumables(items);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].fillType, "LIME");
  assert.equal(groups[0].full, 2);
  assert.equal(groups[0].partials.length, 2);
  assert.equal(groups[0].partials[0].pct, 45);
  assert.equal(groups[0].partials[1].pct, 20);
});
