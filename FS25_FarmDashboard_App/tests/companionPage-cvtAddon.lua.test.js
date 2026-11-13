"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "CvtAddonCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_CVT_Addon = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "FS25_CVT_Addon", version = "2.1.0.0" }
  } end }
  local function vehicle(id, farm, enabled, wear)
    return { uniqueId = id, ownerFarmId = farm,
      getFullName = function() return "Tractor " .. id end,
      spec_CVTaddon = { CVTcfgExists = enabled, CVTdamage = wear } }
  end
  _G.g_currentMission = { getIsServer = function() return true end,
    vehicleSystem = { vehicles = {
      vehicle("owned-worn", 1, true, 42.5),
      vehicle("owned-clean", 1, true, 0),
      vehicle("option-off", 1, false, 90),
      vehicle("foreign", 2, true, 80),
    } } }
`;

test("exports mod wear only for owned CVT configured vehicles", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { configuredVehicleCount: 2, vehiclesWithWearCount: 1 } } });
  expect(page.rows).toHaveLength(2);
  expect(page.rows.find((row) => row.vehicleId === "owned-worn"))
    .toMatchObject({ transmissionWearPercent: 42.5, farmId: 1 });
  expect(JSON.stringify(page)).not.toMatch(/option-off|foreign/);
  const merged = normalizeCompanionPages({ pages: { cvtAddon: page } },
    { modules: loadModules() });
  expect(merged.pages.cvtAddon.rows).toHaveLength(2);
});

test("withholds counts on invalid configured wear", () => {
  const page = runCompanionPage(FILE, SETUP.replace('vehicle("owned-clean", 1, true, 0)',
    'vehicle("owned-clean", 1, true, 101)'), { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial", coverage: "partial",
    reason: "invalid-cvt-condition" });
  expect(page.byFarm).toBeUndefined();
});

test("requires reviewed version and server role", () => {
  expect(runCompanionPage(FILE, SETUP.replace('version = "2.1.0.0"',
    'version = "2.2.0.0"'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE, SETUP.replace('getIsServer = function() return true end',
    'getIsServer = function() return false end'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-vehicle-state-only" });
});
