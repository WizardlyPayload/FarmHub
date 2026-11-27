"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "UnloadGarageCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { KM_77604_Unload_Garage = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "KM_77604_Unload_Garage", version = "1.0.3.0" }
  } end }
  local function site(id, owner, entries)
    return { uniqueId = id,
      getOwnerFarmId = function() return owner end,
      getName = function() return id end,
      ["spec_KM_77604_Unload_Garage.unloadGarage"] = {
        ownerFarmId = owner, maxSlots = 20, garageVehicles = entries,
      } }
  end
  _G.g_currentMission = { getIsServer = function() return true end,
    placeableSystem = { placeables = {
      site("own-garage", 1, {
        { id=1, farmId=1, vehicleName="Stored tractor", vehicleAgeMonths=18,
          vehicleOperatingTime=153000000, storedHours=901.25,
          vehicleData="<vehicles><privatePayload>SECRET</privatePayload></vehicles>" },
      }),
      site("foreign-garage", 2, {
        { id=1, farmId=2, vehicleName="Foreign tractor", vehicleAgeMonths=36,
          vehicleOperatingTime=100, storedHours=900 },
      }),
    } } }
`;

test("exports only owned garages' stored vehicles without their XML payload", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { garageCount: 1, storedVehicleCount: 1 } } });
  expect(page.garages).toEqual([expect.objectContaining({ garageId: "own-garage", storedVehicles: 1, slots: 20 })]);
  expect(page.rows).toEqual([expect.objectContaining({ garageId: "own-garage", vehicle: "Stored tractor",
    operatingHoursAtStorage: 42.5, storedAtGameHour: 901.25 })]);
  expect(JSON.stringify(page)).not.toMatch(/SECRET|privatePayload|Foreign tractor/);
  const merged = normalizeCompanionPages({ pages: { unloadGarage: page } }, { modules: loadModules() });
  expect(merged.pages.unloadGarage.rows).toHaveLength(1);
});

test("withholds duplicate garage IDs, foreign entries and invalid snapshots", () => {
  const duplicate = runCompanionPage(FILE,
    SETUP.replace('site("foreign-garage", 2,', 'site("own-garage", 1,'), { farmId: 1 });
  expect(duplicate).toMatchObject({ readState: "partial" });
  expect(Object.keys(duplicate.rows)).toHaveLength(0);
  const foreignEntry = runCompanionPage(FILE,
    SETUP.replace('id=1, farmId=1,', 'id=1, farmId=2,'), { farmId: 1 });
  expect(foreignEntry).toMatchObject({ readState: "partial" });
  expect(Object.keys(foreignEntry.rows)).toHaveLength(0);
  const invalid = runCompanionPage(FILE,
    SETUP.replace('vehicleOperatingTime=153000000', 'vehicleOperatingTime=-18'), { farmId: 1 });
  expect(invalid).toMatchObject({ readState: "partial" });
  expect(Object.keys(invalid.rows)).toHaveLength(0);
});

test("requires the reviewed version and server state", () => {
  expect(runCompanionPage(FILE,
    SETUP.replace('version = "1.0.3.0"', 'version = "1.0.3.1"'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE,
    SETUP.replace('getIsServer = function() return true end', 'getIsServer = function() return false end'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-garage-state-only" });
});

test("accepts zero maxSlots as the mod's unlimited garage capacity", () => {
  const page = runCompanionPage(FILE,
    SETUP.replace('maxSlots = 20', 'maxSlots = 0'), { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete" });
  expect(page.garages).toEqual([expect.objectContaining({ slots: 0, storedVehicles: 1 })]);
});
