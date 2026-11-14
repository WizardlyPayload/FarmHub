"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "WorkplaceTriggersCollector.lua";
const GAME = `
  _G.g_modIsLoaded = { FS25_WorkplaceTriggers = true }
  _G.g_modManager = { getActiveMods = function() return { { modName = "FS25_WorkplaceTriggers", version = "1.1.2.4" } } end }
  local mission = { getIsServer = function() return true end }
  local system = { mission = mission, isInitialized = true,
    siteService = { store = {
      finalized = true, containerState = "OK",
      listForFarm = function() error("must not build unbounded site list") end,
      records = {
        { siteId = "S-1", ownerFarmId = 1, name = "North Orchard", purpose = "harvest",
          centreX = 120, centreZ = 240, radiusMetres = 25, state = "ACTIVE" },
        { siteId = "S-2", ownerFarmId = 1, name = "Old Yard", purpose = "storage",
          centreX = 90, centreZ = 100, radiusMetres = 12, state = "UNAVAILABLE",
          reason = "OWNER_MISSING" },
        { siteId = "S-3", ownerFarmId = 2, name = "Other Farm Site", purpose = "delivery",
          centreX = 320, centreZ = 340, radiusMetres = 35, state = "ACTIVE" },
      },
    } },
    shiftTracker = { _farmShifts = {
      [1] = { workplaceName = "Orchard shift", hourlyWage = 500,
        paySchedule = "hourly", timeMultiplier = 0 },
    }, shiftHistory = { { workplaceName = "Other farm history", earned = 100000 } } },
    saveToXMLFile = function() error("must not save workplace state") end,
  }
  mission.workplaceTriggers = system
  _G.g_currentMission = mission
  _G.g_WorkplaceSystem = system
`;

test("reads only selected farm sites and live shift without shared history", () => {
  const page = runCompanionPage(FILE, GAME, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { siteCount: 2, unavailableCount: 1, hasLiveShift: true } },
    liveShift: { farmId: 1, workplace: "Orchard shift",
      payAmount: 500, paySchedule: "hourly" } });
  expect(page.rows).toHaveLength(2);
  expect(page.rows[0]).toMatchObject({ farmId: 1, name: "North Orchard",
    centreX: 120, centreZ: 240, radiusMetres: 25, state: "ACTIVE" });
  expect(page.rows.some((row) => row.name === "Other Farm Site")).toBe(false);
  expect(page.shiftHistory).toBeUndefined();
  const merged = normalizeCompanionPages({ pages: { workplaceTriggersSites: page } },
    { modules: loadModules() });
  expect(merged.pages.workplaceTriggersSites.rows).toHaveLength(2);
});

test("other farm sees only its site and no borrowed shift", () => {
  const page = runCompanionPage(FILE, GAME, { farmId: 2 });
  expect(page).toMatchObject({ readState: "ok",
    byFarm: { "2": { siteCount: 1, unavailableCount: 0, hasLiveShift: false } } });
  expect(page.rows).toHaveLength(1);
  expect(page.rows[0]).toMatchObject({ name: "Other Farm Site" });
  expect(page.liveShift).toBeUndefined();
});

test("map mismatch marks every owned site unavailable", () => {
  const mismatch = GAME.replace('containerState = "OK"', 'containerState = "MAP_MISMATCH"');
  const page = runCompanionPage(FILE, mismatch, { farmId: 1 });
  expect(page.byFarm["1"].unavailableCount).toBe(2);
  expect(page.rows.every((row) => row.state === "UNAVAILABLE"
    && row.reason === "MAP_MISMATCH")).toBe(true);
  expect(page.rows.every((row) => row.centreX == null
    && row.centreZ == null && row.radiusMetres == null)).toBe(true);
});

test("client, unfinished site store and absent mod yield no farm sites", () => {
  const client = GAME.replace("getIsServer = function() return true end",
    "getIsServer = function() return false end");
  expect(runCompanionPage(FILE, client, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-sites-only" });
  const unready = GAME.replace("finalized = true", "finalized = false");
  expect(runCompanionPage(FILE, unready, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "site-store-not-ready" });
  expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
});
