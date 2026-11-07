"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "FlexibleCombiSeederCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_369800_FS25_FlexibleCombiSeeder = true }
  _G.g_currentMission = { getIsServer = function() return true end,
    vehicleSystem = { vehicles = {
      { ownerFarmId = 1, uniqueId = "own-seeds", getFullName = function() return "Own seeds" end,
        spec_flexibleCombiSeeder = { isActive = true, mode = "seeds" } },
      { ownerFarmId = 1, uniqueId = "own-fert", getFullName = function() return "Own fertilizer" end,
        spec_flexibleCombiSeeder = { isActive = true, mode = "fertilizer" } },
      { ownerFarmId = 1, uniqueId = "bad", spec_flexibleCombiSeeder = { isActive = true, mode = "unknown" } },
      { ownerFarmId = 1, uniqueId = "ineligible", spec_flexibleCombiSeeder = { isActive = false, mode = "seeds" } },
      { ownerFarmId = 2, uniqueId = "foreign", spec_flexibleCombiSeeder = { isActive = true, mode = "seeds" } },
    } } }
`;

test("reads the two tank modes on eligible owned combi seeders only", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  if (page?.readState === "failed") throw new Error(JSON.stringify(page));
  expect(page).toMatchObject({ readState: "partial", coverage: "partial",
    byFarm: { "1": { eligibleCount: 2, seedModeCount: 1 } } });
  expect(page.rows).toHaveLength(2);
  expect(page.rows.find((row) => row.vehicleId === "own-seeds").mode).toBe("seeds");
  expect(page.rows.find((row) => row.vehicleId === "own-fert").mode).toBe("fertilizer");
  expect(JSON.stringify(page)).not.toMatch(/foreign|ineligible|unknown/);
  const merged = normalizeCompanionPages({ pages: { flexibleCombiSeeder: page } }, { modules: loadModules() });
  expect(merged.pages.flexibleCombiSeeder.rows).toHaveLength(2);
});

test("withholds client-only and absent-mod states", () => {
  const client = SETUP.replace("getIsServer = function() return true end", "getIsServer = function() return false end");
  expect(runCompanionPage(FILE, client, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-vehicles-only" });
  expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
});
