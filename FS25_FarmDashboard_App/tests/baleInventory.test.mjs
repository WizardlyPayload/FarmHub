import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  enrichBaleInventoryFromStock,
  supplementOnFieldFromFields,
  buildFillTypeCatalog,
} = require("../dataMerger.js");

function emptyBaleBucket() {
  return { straw: 0, grass: 0, hay: 0, silage: 0, other: 0, byFillType: {} };
}

globalThis.window = globalThis.window || {
  fetch: async () => ({ ok: false, json: async () => ({}) }),
  location: { pathname: "/" },
};

const { resolveBaleInventoryForFarm, aggregateConsumables } = await import(
  "../web/assests/js/modules/economy.js"
);

test("supplement onField from field baleCountOnField when economy scan empty", () => {
  const inv = supplementOnFieldFromFields(
    { byFarm: { "1": { onField: emptyBaleBucket(), inStorage: emptyBaleBucket() } } },
    [{ ownerFarmId: 1, baleCountOnField: 60 }]
  );
  assert.equal(inv.byFarm["1"].onField.other, 60);
});

test("buildFillTypeCatalog resolves map-specific crops like TRITICALE", () => {
  const catalog = buildFillTypeCatalog({
    cropFillTypeIndex: { TRITICALE: 182, RYE: 181, SPELT: 183 },
    fields: [{ fruitType: "TRITICALE", ownerFarmId: 1 }],
    stock: {
      byFarm: {
        "1": {
          items: [{ fillTypeIndex: 182, totalLiters: 8206, fillType: "" }],
        },
      },
    },
  });
  assert.equal(catalog["182"], "TRITICALE");
});

test("buildFillTypeCatalog infers TRITICALE at 182 when RYE/SPELT neighbors exist on DS", () => {
  const catalog = buildFillTypeCatalog({
    fillTypeCatalog: { 181: "RYE", 183: "SPELT" },
    stock: {
      byFarm: {
        "1": {
          items: [{ fillTypeIndex: 182, totalLiters: 8206, fillType: "" }],
        },
      },
    },
  });
  assert.equal(catalog["182"], "TRITICALE");
});

test("supplement onField prefers field totals when economy scan is partial", () => {
  const inv = supplementOnFieldFromFields(
    {
      byFarm: {
        "1": {
          onField: { straw: 0, grass: 0, hay: 0, silage: 0, other: 9, byFillType: {} },
          inStorage: { straw: 0, grass: 0, hay: 49, silage: 44, other: 3, byFillType: {} },
        },
      },
    },
    [
      {
        ownerFarmId: 1,
        baleCountOnField: 40,
        baleOnFieldByCategory: { straw: 0, grass: 0, hay: 40, silage: 0, other: 0, byFillType: {} },
      },
      {
        ownerFarmId: 1,
        baleCountOnField: 20,
        baleOnFieldByCategory: { straw: 20, grass: 0, hay: 0, silage: 0, other: 0, byFillType: {} },
      },
    ]
  );
  assert.equal(inv.byFarm["1"].onField.hay, 40);
  assert.equal(inv.byFarm["1"].onField.straw, 20);
  assert.equal(inv.byFarm["1"].inStorage.hay, 49);
});

test("supplement onField does not double-count when baleInventory already has on-field rows", () => {
  const inv = supplementOnFieldFromFields(
    {
      byFarm: {
        "2": {
          onField: { straw: 0, grass: 0, hay: 0, silage: 0, other: 60, byFillType: {} },
          inStorage: emptyBaleBucket(),
        },
      },
    },
    [{ ownerFarmId: 2, baleCountOnField: 60, baleOnFieldByCategory: { other: 60 } }]
  );
  assert.equal(inv.byFarm["2"].onField.other, 60);
});

test("enrich skips stock derive when Lua already exported inStorage counts", () => {
  const raw = {
    baleInventory: {
      byFarm: {
        "2": {
          onField: emptyBaleBucket(),
          inStorage: { straw: 0, grass: 0, hay: 49, silage: 44, other: 3, byFillType: {} },
        },
      },
    },
    stock: {
      byFarm: {
        "2": {
          farmId: 2,
          items: [{
            fillTypeIndex: 25,
            totalLiters: 236500,
            locations: Array.from({ length: 16 }, () => ({
              kind: "objectStorage",
              liters: 5500,
              name: "Auto bale storage",
            })),
          }],
        },
      },
    },
  };
  const enriched = enrichBaleInventoryFromStock(raw, { 25: "SILAGE", 30: "DRYGRASS_WINDROW" });
  assert.equal(enriched.byFarm["2"].inStorage.silage, 44);
  assert.equal(enriched.byFarm["2"].inStorage.hay, 49);
});

test("supplement onField uses per-field bale category breakdown when exported", () => {
  const inv = supplementOnFieldFromFields(
    { byFarm: { "2": { onField: emptyBaleBucket(), inStorage: emptyBaleBucket() } } },
    [{
      ownerFarmId: 2,
      baleCountOnField: 60,
      baleOnFieldByCategory: {
        straw: 10,
        grass: 20,
        hay: 30,
        silage: 0,
        other: 0,
        byFillType: { STRAW: 10, GRASS_WINDROW: 20, DRYGRASS_WINDROW: 30 },
      },
    }]
  );
  assert.equal(inv.byFarm["2"].onField.straw, 10);
  assert.equal(inv.byFarm["2"].onField.grass, 20);
  assert.equal(inv.byFarm["2"].onField.hay, 30);
  assert.equal(inv.byFarm["2"].onField.other, 0);
});

test("enrich merges shed storage without wiping on-field totals", () => {
  const raw = {
    baleInventory: {
      byFarm: {
        "1": {
          onField: { straw: 0, grass: 0, hay: 0, silage: 0, other: 60, byFillType: {} },
          inStorage: emptyBaleBucket(),
        },
      },
    },
    fields: [{ ownerFarmId: 1, baleCountOnField: 60 }],
    stock: {
      byFarm: {
        "2": {
          farmId: 2,
          items: [{
            fillTypeIndex: 25,
            totalLiters: 55000,
            locations: [{ kind: "objectStorage", liters: 5500, name: "Auto bale storage" }],
          }],
        },
      },
    },
  };
  const enriched = enrichBaleInventoryFromStock(raw, { 25: "SILAGE" });
  assert.equal(enriched.byFarm["1"].onField.other, 60);
  assert.ok((enriched.byFarm["2"]?.inStorage?.silage || 0) >= 10);
});

test("derive bale inventory from stock objectStorage when mod export is empty", () => {
  const raw = {
    baleInventory: {
      byFarm: {
        "2": {
          inStorage: emptyBaleBucket(),
        },
      },
    },
    stock: {
      byFarm: {
        "2": {
          farmId: 2,
          items: [
            {
              fillTypeIndex: 25,
              totalLiters: 236500,
              locations: Array.from({ length: 16 }, () => ({
                kind: "objectStorage",
                liters: 5500,
                name: "Auto bale storage",
              })),
            },
            {
              fillTypeIndex: 30,
              totalLiters: 148930,
              locations: Array.from({ length: 16 }, () => ({
                kind: "objectStorage",
                liters: 6500,
                name: "Auto bale storage",
              })),
            },
          ],
        },
      },
    },
  };
  const enriched = enrichBaleInventoryFromStock(raw, { 25: "SILAGE", 30: "DRYGRASS_WINDROW" });
  const farm2 = resolveBaleInventoryForFarm(enriched, 2);
  assert.equal(farm2.inStorage.silage, 43);
  assert.equal(farm2.inStorage.hay, 23);
});

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
