"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "BuyableGpsCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_324860_Buyable_GPS = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "FS25_324860_Buyable_GPS", version = "1.0.0.0" }
  } end }
  local function vehicle(id, farm, gps)
    return { uniqueId = id, ownerFarmId = farm,
      getFullName = function() return "Vehicle " .. id end,
      configurations = { buyableGPS = gps } }
  end
  _G.g_currentMission = { getIsServer = function() return true end,
    vehicleSystem = { vehicles = {
      vehicle("owned-gps", 1, 2), vehicle("owned-no-gps", 1, 1),
      vehicle("no-option", 1, 0), vehicle("foreign-gps", 2, 2),
    } } }
`;

test("counts only configured owned vehicles and purchased GPS", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { configurableVehicleCount: 2, gpsInstalledCount: 1 } } });
  expect(page.rows.find((row) => row.vehicleId === "owned-gps"))
    .toMatchObject({ gpsInstalled: true, farmId: 1 });
  expect(JSON.stringify(page)).not.toMatch(/foreign-gps|no-option/);
  const merged = normalizeCompanionPages({ pages: { buyableGps: page } },
    { modules: loadModules() });
  expect(merged.pages.buyableGps.rows).toHaveLength(2);
});

test("withholds totals on unreviewed configuration ID", () => {
  const page = runCompanionPage(FILE,
    SETUP.replace('vehicle("owned-no-gps", 1, 1)',
      'vehicle("owned-no-gps", 1, 3)'), { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(page.byFarm).toBeUndefined();
});

test("requires reviewed version and server vehicle state", () => {
  expect(runCompanionPage(FILE,
    SETUP.replace('version = "1.0.0.0"', 'version = "1.1.0.0"'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE,
    SETUP.replace('getIsServer = function() return true end',
      'getIsServer = function() return false end'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-vehicle-state-only" });
});
