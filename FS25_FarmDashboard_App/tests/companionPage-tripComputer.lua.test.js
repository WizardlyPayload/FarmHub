"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "TripComputerCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_341715_Trip_Computer = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "FS25_341715_Trip_Computer", version = "1.0.0.0" }
  } end }
  local function vehicle(id, farm, used, distance, fuel, moving, time)
    return { uniqueId = id, ownerFarmId = farm,
      getFullName = function() return "Tractor " .. id end,
      spec_tripComputer = { isUsed = used, drivenDistance = distance,
        totalFuel = fuel, totalFuelKM = moving, operatingTime = time } }
  end
  _G.g_currentMission = { getIsServer = function() return true end,
    vehicleSystem = { vehicles = {
      vehicle("active", 1, true, 2500, 12, 9, 3600000),
      vehicle("reset", 1, true, 0, 0, 0, 0),
      vehicle("no-fuel-system", 1, false, 4000, 8, 8, 3600000),
      vehicle("foreign", 2, true, 9000, 20, 18, 7200000),
    } } }
`;

test("exports resettable trip values on owned supported vehicles", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { supportedVehicleCount: 2, nonemptyTripCount: 1 } } });
  expect(page.rows).toHaveLength(2);
  expect(page.rows.find((row) => row.vehicleId === "active"))
    .toMatchObject({ tripKilometres: 2.5, tripFuelLitres: 12,
      tripOperatingHours: 1, farmId: 1 });
  expect(JSON.stringify(page)).not.toMatch(/no-fuel-system|foreign/);
  const merged = normalizeCompanionPages({ pages: { tripComputer: page } },
    { modules: loadModules() });
  expect(merged.pages.tripComputer.rows).toHaveLength(2);
});

test("withholds counts when a supported trip record is inconsistent", () => {
  const page = runCompanionPage(FILE, SETUP.replace('2500, 12, 9, 3600000',
    '2500, 12, 13, 3600000'), { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial", coverage: "partial",
    reason: "invalid-trip-state" });
  expect(page.byFarm).toBeUndefined();
});

test("requires reviewed version and server role", () => {
  expect(runCompanionPage(FILE, SETUP.replace('version = "1.0.0.0"',
    'version = "1.1.0.0"'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE, SETUP.replace('getIsServer = function() return true end',
    'getIsServer = function() return false end'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-trip-state-only" });
});
