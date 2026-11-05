"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "PowertrainUpgradeCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_PowertrainUpgrade = true }
  _G.g_currentMission = { getIsServer = function() return true end,
    vehicleSystem = { vehicles = {
      { ownerFarmId = 1, uniqueId = "tuned", getFullName = function() return "Owned tractor" end,
        configurations = { ptuPower = 2, ptuSpeed = 4 },
        spec_ptuUpgrade = { base = {}, powerLevel = 2, speedLevel = 4, speedWasCapped = false } },
      { ownerFarmId = 1, uniqueId = "stock", getFullName = function() return "Owned stock motor" end,
        configurations = { ptuPower = 1, ptuSpeed = 1 },
        spec_ptuUpgrade = { base = {}, powerLevel = 1, speedLevel = 1 } },
      { ownerFarmId = 2, uniqueId = "foreign", configurations = { ptuPower = 7, ptuSpeed = 7 },
        spec_ptuUpgrade = { base = {}, powerLevel = 7, speedLevel = 7 } },
      { ownerFarmId = 1, uniqueId = "mismatch", configurations = { ptuPower = 7, ptuSpeed = 7 },
        spec_ptuUpgrade = { base = {}, powerLevel = 1, speedLevel = 1 } },
    } } }
`;

test("reports only valid owned selected levels, without implying actual performance", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { motorCount: 2, upgradedCount: 1 } } });
  expect(page.rows.find((row) => row.vehicleId === "tuned"))
    .toMatchObject({ powerLevel: 2, powerFactor: 1.25, speedLevel: 4, speedFactor: 2 });
  expect(JSON.stringify(page)).not.toMatch(/foreign|mismatch|horsepower|paid/);
  const merged = normalizeCompanionPages({ pages: { powertrainUpgrade: page } }, { modules: loadModules() });
  expect(merged.pages.powertrainUpgrade.rows).toHaveLength(2);
});

test("withholds client state and absent mod", () => {
  const client = SETUP.replace("getIsServer = function() return true end", "getIsServer = function() return false end");
  expect(runCompanionPage(FILE, client, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-vehicle-state-only" });
  expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
});
