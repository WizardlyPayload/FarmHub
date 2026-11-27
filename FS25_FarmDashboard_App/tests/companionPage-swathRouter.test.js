"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "SwathRouterCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_372019_Swath_Router = true }
  _G.g_currentMission = { getIsServer = function() return true end,
    vehicleSystem = { vehicles = {
      { ownerFarmId = 1, uniqueId = "ready", getFullName = function() return "Farm baler" end,
        swathRouterData = { workingWidth = 2.4, fillTypes = { 1, 2 }, stopsWhenFull = false } },
      { ownerFarmId = 1, uniqueId = "full", getFullName = function() return "Farm wagon" end,
        swathRouterData = { workingWidth = 3, fillTypes = { 1 }, stopsWhenFull = true } },
      { ownerFarmId = 1, uniqueId = "bad", swathRouterData = { workingWidth = 0, fillTypes = {}, stopsWhenFull = true } },
      { ownerFarmId = 1, uniqueId = "native", spec_aiImplement = {} },
      { ownerFarmId = 2, uniqueId = "foreign", swathRouterData = { workingWidth = 4,
        fillTypes = { 1 }, stopsWhenFull = true } },
    } } }
`;

test("reports only valid owned swath adoption, not a native AI implement or foreign machine", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  if (page?.readState === "failed") throw new Error(JSON.stringify(page));
  expect(page).toMatchObject({ readState: "partial", coverage: "partial",
    byFarm: { "1": { readyCount: 2, stopWhenFullCount: 1 } } });
  expect(page.rows).toHaveLength(2);
  expect(page.rows.find((row) => row.vehicleId === "ready"))
    .toMatchObject({ workingWidthMetres: 2.4, swathFillTypeCount: 2, stopsWhenFull: false });
  expect(JSON.stringify(page)).not.toMatch(/foreign|native|bad/);
  const merged = normalizeCompanionPages({ pages: { swathRouter: page } }, { modules: loadModules() });
  expect(merged.pages.swathRouter.rows).toHaveLength(2);
});

test("withholds client-only and absent-mod states", () => {
  const client = SETUP.replace("getIsServer = function() return true end", "getIsServer = function() return false end");
  expect(runCompanionPage(FILE, client, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-vehicles-only" });
  expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
});
