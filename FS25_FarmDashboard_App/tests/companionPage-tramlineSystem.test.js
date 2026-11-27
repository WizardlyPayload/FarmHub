"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "TramlineSystemCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_TramlineSystem = true }
  _G.g_currentMission = { getIsServer = function() return true end,
    vehicleSystem = { vehicles = {
      { ownerFarmId = 1, uniqueId = "own-one", getFullName = function() return "Farm seeder" end,
        spec_tramlineSystemTramLines = { tramLineMode = 2, createTramLines = true,
          currentLane = 3, tramLinePeriodicSequence = 6, tramLineDistance = 24,
          sprayerProfileWidth = 24 },
        spec_tramlineSystemSowingExtension = { sessionHectares = 1.25,
          totalHectares = 31.5, seedUsage = 3.4 } },
      { ownerFarmId = 1, uniqueId = "own-two", getFullName = function() return "Second seeder" end,
        spec_tramlineSystemTramLines = { tramLineMode = 0, createTramLines = false,
          currentLane = 1, tramLinePeriodicSequence = 4, tramLineDistance = 18 },
        spec_tramlineSystemSowingExtension = { sessionHectares = 0, totalHectares = 0 } },
      { ownerFarmId = 2, uniqueId = "foreign", getFullName = function() return "Other farm" end,
        spec_tramlineSystemTramLines = { tramLineMode = 1, createTramLines = true,
          currentLane = 1, tramLinePeriodicSequence = 4, tramLineDistance = 18 } },
      { ownerFarmId = 1, uniqueId = "plain", getFullName = function() return "Plain tractor" end },
    } } }
`;

test("reads exact-farm saved tramline settings and hectares, not transient seed usage", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { seederCount: 2, tramlinesEnabledCount: 1, recordedAreaCount: 1 } } });
  expect(page.rows).toHaveLength(2);
  expect(page.rows.find((row) => row.vehicleId === "own-one"))
    .toMatchObject({ mode: 2, createTramLines: true, currentLane: 3,
      passSequence: 6, tramlineDistance: 24, sessionHectares: 1.25,
      totalHectares: 31.5 });
  expect(page.rows.find((row) => row.vehicleId === "own-two"))
    .toMatchObject({ mode: 0, createTramLines: false, totalHectares: 0 });
  expect(JSON.stringify(page)).not.toMatch(/foreign|plain|seedUsage/);
  const merged = normalizeCompanionPages({ pages: { tramlineSystem: page } }, { modules: loadModules() });
  expect(merged.pages.tramlineSystem.rows).toHaveLength(2);
});

test("marks incomplete owned settings partial instead of inventing values", () => {
  const partial = SETUP.replace("currentLane = 3, tramLinePeriodicSequence = 6, tramLineDistance = 24,",
    "currentLane = 3.5, tramLinePeriodicSequence = 6, tramLineDistance = 24,");
  const page = runCompanionPage(FILE, partial, { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(page.rows.find((row) => row.vehicleId === "own-one").currentLane).toBeUndefined();
});

test("withholds client and absent-mod readings", () => {
  const client = SETUP.replace("getIsServer = function() return true end",
    "getIsServer = function() return false end");
  expect(runCompanionPage(FILE, client, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-vehicles-only" });
  expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
});
