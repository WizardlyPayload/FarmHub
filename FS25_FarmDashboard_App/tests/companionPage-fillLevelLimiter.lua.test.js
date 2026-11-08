"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "FillLevelLimiterCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_325794_Fill_Level_Limiter = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "FS25_325794_Fill_Level_Limiter", version = "1.0.1.0" }
  } end }
  local function vehicle(id, farm, firstLimit)
    local v = { uniqueId = id, ownerFarmId = farm,
      getFullName = function() return "Trailer " .. id end,
      getFillUnitCapacity = function(_, index)
        return index == 1 and 12000 or index == 2 and 0 or nil end,
      spec_fillUnit = { fillUnits = { [1] = {unitText = "L"} } } }
    v["spec_FS25_325794_Fill_Level_Limiter.fillLevelLimiter"] = {
      fillUnitIndexToLimit = { [1] = firstLimit, [2] = 0 },
      fillUnitTitle = { [1] = "Grain" } }
    return v
  end
  _G.g_currentMission = { getIsServer = function() return true end,
    vehicleSystem = { vehicles = {
      vehicle("owned", 1, 8000), vehicle("default", 1, 12000),
      vehicle("foreign", 2, 7000),
    } } }
`;

test("reports only owned below-capacity limits and skips default capacities", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { vehicleCount: 1, customLimitCount: 1 } } });
  expect(page.rows).toHaveLength(1);
  expect(page.rows[0]).toMatchObject({ vehicleId: "owned", fillUnitIndex: 1,
    fillUnitTitle: "Grain", limit: 8000, capacity: 12000, unitText: "L" });
  expect(JSON.stringify(page)).not.toMatch(/foreign|default/);
  const merged = normalizeCompanionPages({ pages: { fillLevelLimiter: page } },
    { modules: loadModules() });
  expect(merged.pages.fillLevelLimiter.rows).toHaveLength(1);
});

test("withholds totals for invalid cap or duplicate vehicle identity", () => {
  for (const altered of [
    SETUP.replace('vehicle("owned", 1, 8000)', 'vehicle("owned", 1, 13000)'),
    SETUP.replace('vehicle("default", 1, 12000)', 'vehicle("owned", 1, 12000)'),
  ]) {
    const page = runCompanionPage(FILE, altered, { farmId: 1 });
    expect(page).toMatchObject({ readState: "partial", coverage: "partial" });
    expect(page.byFarm).toBeUndefined();
  }
});

test("gates unreviewed version and client state", () => {
  expect(runCompanionPage(FILE,
    SETUP.replace('version = "1.0.1.0"', 'version = "1.0.2.0"'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE,
    SETUP.replace("getIsServer = function() return true end",
      "getIsServer = function() return false end"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-vehicle-state-only" });
});
