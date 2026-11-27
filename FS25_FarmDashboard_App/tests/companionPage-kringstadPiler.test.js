"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "KringstadPilerCollector.lua";
const GAME = `
  _G.g_modIsLoaded = { KM_82896_Kringstad_Ironworks_Sugar_Beet_Piler = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "KM_82896_Kringstad_Ironworks_Sugar_Beet_Piler", version = "1.1.0.0" }
  } end }
  local public = { ownerFarmId = 0, uniqueId = "shared-piler", getName = function() return "Shared beet piler" end,
    spec_tareDirtManagement = { initialized = true, fillTypeIndex = 51, inputFillTypeIndex = 2,
      outstandingByFarm = { [1] = 275, [2] = 999 },
      pendingBatches = { { farmId = 1, amount = 55 }, { farmId = 2, amount = 444 } },
      feePerLiter = 0.5 } }
  local owned = { ownerFarmId = 1, uniqueId = "owned-piler", getName = function() return "Owned beet piler" end,
    spec_tareDirtManagement = { initialized = true, fillTypeIndex = 51, inputFillTypeIndex = 2,
      outstandingByFarm = { [1] = 25 },
      pendingBatches = {}, feePerLiter = 0.2 } }
  _G.g_currentMission = { getIsServer = function() return true end,
    placeableSystem = { placeables = { public, owned } } }
`;

test("reads only this farm's ledger on owned and public pilers, without physical or foreign tare", () => {
  const page = runCompanionPage(FILE, GAME, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { pilerCount: 2, outstandingLiters: 300, pendingLiters: 55 } } });
  expect(page.rows).toEqual(expect.arrayContaining([
    expect.objectContaining({ placeableId: "shared-piler", outstandingLiters: 275,
      pendingLiters: 55, feePerLiter: 0.5 }),
    expect.objectContaining({ placeableId: "owned-piler", outstandingLiters: 25,
      pendingLiters: 0, feePerLiter: 0.2 }),
  ]));
  expect(JSON.stringify(page)).not.toMatch(/999|444/);
  const merged = normalizeCompanionPages({ pages: { kringstadPiler: page } }, { modules: loadModules() });
  expect(merged.pages.kringstadPiler.rows).toHaveLength(2);
});

test("withholds totals for unreadable farm data and for client state", () => {
  const bad = GAME.replace("[1] = 275", "[1] = 'unknown'");
  const page = runCompanionPage(FILE, bad, { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(page.byFarm).toBeUndefined();
  expect(page.rows).toEqual([expect.objectContaining({ placeableId: "owned-piler" })]);
  const client = GAME.replace("return true end,", "return false end,");
  expect(runCompanionPage(FILE, client, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-state-only" });
  expect(runCompanionPage(FILE, GAME.replace("1.1.0.0", "9.9.9.9"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
});
