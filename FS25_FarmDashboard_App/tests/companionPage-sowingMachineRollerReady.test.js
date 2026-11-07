"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "SowingMachineRollerReadyCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_327528_FS25_sowingMachineRollerReady = true }
  _G.g_currentMission = { getIsServer = function() return true end,
    vehicleSystem = { vehicles = {
      { ownerFarmId = 1, uniqueId = "own-on", getFullName = function() return "Own seeder on" end,
        spec_sowingMachine = { isRollerAllowed = true, allowRollerSowingMachine = true } },
      { ownerFarmId = 1, uniqueId = "own-off", getFullName = function() return "Own seeder off" end,
        spec_sowingMachine = { isRollerAllowed = true, allowRollerSowingMachine = false } },
      { ownerFarmId = 1, uniqueId = "unreadable", spec_sowingMachine = { isRollerAllowed = true } },
      { ownerFarmId = 1, uniqueId = "ineligible", spec_sowingMachine = { isRollerAllowed = false, allowRollerSowingMachine = true } },
      { ownerFarmId = 2, uniqueId = "foreign", spec_sowingMachine = { isRollerAllowed = true, allowRollerSowingMachine = true } },
    } } }
`;

test("reads only eligible owned seeders and preserves off separately from missing", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  if (page?.readState === "failed") throw new Error(JSON.stringify(page));
  expect(page).toMatchObject({ readState: "partial", coverage: "partial",
    byFarm: { "1": { eligibleCount: 2, enabledCount: 1 } } });
  expect(page.rows).toHaveLength(2);
  expect(page.rows.find((row) => row.vehicleId === "own-on").rollerOn).toBe(true);
  expect(page.rows.find((row) => row.vehicleId === "own-off").rollerOn).toBe(false);
  expect(JSON.stringify(page)).not.toMatch(/foreign|ineligible|unreadable/);
  const merged = normalizeCompanionPages({ pages: { sowingMachineRollerReady: page } }, { modules: loadModules() });
  expect(merged.pages.sowingMachineRollerReady.rows).toHaveLength(2);
});

test("requires the server and exact loaded mod", () => {
  const client = SETUP.replace("getIsServer = function() return true end", "getIsServer = function() return false end");
  expect(runCompanionPage(FILE, client, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-vehicles-only" });
  expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
});
