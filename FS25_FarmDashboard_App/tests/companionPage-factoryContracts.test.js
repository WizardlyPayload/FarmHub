"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "FactoryContractsCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_FactoryContracts = true }
  _G.g_modManager = { getActiveMods = function() return { { modName = "FS25_FactoryContracts", version = "1.1.0.0" } } end }
  _G.g_currentMission = {
    getIsServer = function() return true end,
    FactoryContracts = { loadState = 2, currentDay = 12, contracts = {
      [7] = { id = 7, farmId = 1, factoryId = "mill-a", destinationName = "Oak Bridge Mill", fillTypeIndex = 3,
        contractType = "rigido", status = "activo", totalQuantity = 10000,
        deliveredTotal = 2500, lockedPrice = 1.2, durationDays = 30 },
      [8] = { id = 8, farmId = 2, factoryId = "mill-b", fillTypeIndex = 4,
        contractType = "flexible", status = "activo", totalQuantity = 99999,
        deliveredTotal = 0 },
      [9] = { id = 9, farmId = 1, factoryId = "mill-c", fillTypeIndex = 5,
        contractType = "rigido", status = "cumplido", totalQuantity = 1000,
        deliveredTotal = 1000 },
    } },
  }
`;

test("reads only the selected farm's signed obligations", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { signedCount: 2, activeCount: 1, currentDay: 12 } } });
  expect(page.contracts.map((r) => r.id)).toEqual([7, 9]);
  expect(page.contracts[0]).toMatchObject({ factoryId: "mill-a", destinationName: "Oak Bridge Mill", totalLiters: 10000,
    deliveredLiters: 2500, remainingLiters: 7500, lockedPrice: 1.2 });
  expect(JSON.stringify(page)).not.toContain("mill-b");
  expect(normalizeCompanionPages({ pages: { factoryContracts: page } }, { modules: loadModules() })
    .pages.factoryContracts.contracts).toHaveLength(2);
});

test("requires loaded server state and withholds another farm's portfolio", () => {
  expect(runCompanionPage(FILE, SETUP, { farmId: 3 })).toMatchObject({
    readState: "settings-only", reason: "no-signed-contracts", contracts: {},
  });
  expect(runCompanionPage(FILE, SETUP.replace("return true end", "return false end"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-register-only" });
  expect(runCompanionPage(FILE, SETUP.replace("loadState = 2", "loadState = 1"), { farmId: 1 }))
    .toMatchObject({ readState: "unavailable", reason: "server-register-not-loaded" });
});
