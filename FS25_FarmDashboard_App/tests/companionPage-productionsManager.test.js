"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "ProductionsManagerCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_346503_Productions_Manager = true }
  local mine = {
    ownerFarmId = 1, owningPlaceable = { uniqueId = "owned-greenhouse" },
    productionsIdToObj = { TOMATO = { id = "TOMATO", name = "Tomatoes" } },
    getName = function() return "Greenhouse" end,
  }
  local foreign = {
    ownerFarmId = 2, owningPlaceable = { uniqueId = "foreign-greenhouse" },
    productionsIdToObj = { LETTUCE = { id = "LETTUCE", name = "Lettuce" } },
  }
  _G.FS25_346503_Productions_Manager = { ProductionScheduleManager = {
    data = {
      ["owned-greenhouse"] = { TOMATO = { scheduleEnabled = true, months = { [3] = true, [6] = true } } },
      ["foreign-greenhouse"] = { LETTUCE = { scheduleEnabled = true, months = { [2] = true } } },
      ["stale-profile-key"] = { TOMATO = { scheduleEnabled = true, months = { [1] = true } } },
    },
    runtime = { ["owned-greenhouse"] = mine, ["foreign-greenhouse"] = foreign },
  } }
  _G.g_currentMission = {
    productionChainManager = {
      getProductionPointsForFarmId = function(_, farmId)
        return farmId == 1 and { mine, foreign } or { foreign }
      end,
    },
  }
`;

test("joins profile schedules only to currently owned points and live recipes", () => {
    const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
    expect(page).toMatchObject({ readState: "ok", coverage: "complete",
        byFarm: { "1": { scheduleCount: 1, enabledCount: 1 } } });
    expect(page.rows).toEqual([expect.objectContaining({
        farmId: 1, point: "Greenhouse", recipe: "Tomatoes",
        scheduleEnabled: true, months: [3, 6],
    })]);
    expect(JSON.stringify(page)).not.toContain("LETTUCE");
    expect(JSON.stringify(page)).not.toContain("stale-profile-key");
    expect(normalizeCompanionPages({ pages: { productionsManager: page } },
        { modules: loadModules() }).pages.productionsManager.rows).toHaveLength(1);
});

test("withholds schedules when runtime identity or farm ownership is not proved", () => {
    const noRuntime = SETUP.replace('runtime = { ["owned-greenhouse"] = mine, ["foreign-greenhouse"] = foreign }',
        'runtime = { ["owned-greenhouse"] = foreign, ["foreign-greenhouse"] = foreign }');
    const page = runCompanionPage(FILE, noRuntime, { farmId: 1 });
    expect(page).toMatchObject({ readState: "settings-only", reason: "no-owned-schedule-match",
        byFarm: { "1": { scheduleCount: 0 } } });
    expect(Object.values(page.rows)).toHaveLength(0);
    const noOwnedList = SETUP.replace("getProductionPointsForFarmId = function(_, farmId)",
        "notTheOwnedList = function(_, farmId)");
    expect(runCompanionPage(FILE, noOwnedList, { farmId: 1 })).toMatchObject({
        readState: "settings-only", reason: "no-owned-production-list",
    });
});
