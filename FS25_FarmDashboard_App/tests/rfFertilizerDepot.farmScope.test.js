"use strict";

const path = require("path");
const { productionTs } = require("./helpers/production-source.cjs");
const { runCompanionLua, MOD_SRC } = require("./helpers/companion-page-lua.cjs");

const FILE = path.join(MOD_SRC, "collectors", "rf", "RfFertilizerDepotDataCollector.lua");
const depot = productionTs("NEW APP/src/lib/realisticFarming/depot/index.ts");

test("a selected farm sees only its own depot and structured orders", () => {
  const payload = {
    enabled: true,
    depots: [
      { id: "a", farmId: 1, levels: [{ fillType: "UREA", liters: 100 }] },
      { id: "b", farmId: 2, levels: [{ fillType: "LIME", liters: 900 }] },
      { id: "unknown", levels: [{ fillType: "SEED", liters: 500 }] },
    ],
    openOrders: [
      { id: "one", farmId: 1, summary: "farm 1" },
      { id: "two", farmId: 2, summary: "farm 2" },
      { id: "legacy", summary: "Farm 1 in text only" },
    ],
  };
  expect(depot.fertilizerDepots(payload, 1).map((row) => row.id)).toEqual(["a"]);
  expect(depot.fertilizerDepotOrders(payload, 1).map((row) => row.id)).toEqual(["one"]);
  expect(depot.fertilizerDepots(payload, 2).map((row) => row.id)).toEqual(["b"]);
  expect(depot.fertilizerDepotOrders(payload, 2).map((row) => row.id)).toEqual(["two"]);
  expect(depot.fertilizerDepotOrders(payload, 0)).toEqual([]);
});

test("the live reader carries farm IDs on both order kinds", () => {
  const result = runCompanionLua([FILE], `
    _G.g_currentMission = { depotManager = {
      pendingOrders = { [1] = { depotId = 5, displayName = "Urea", maxLiters = 700 } },
      deliverySystem = { deliveries = {
        [8] = { farmId = 2, status = 1, items = { { fillType = "LIME" } } }
      } },
      depotSystem = { _depots = {} }
    } }
  `, `return __fdEncode(RfFertilizerDepotDataCollector:collect())`);
  expect(result.openOrders).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: "pending-1-5", farmId: 1 }),
    expect.objectContaining({ id: "delivery-8", farmId: 2 }),
  ]));
});
