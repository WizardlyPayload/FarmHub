"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "BhWaterBatteryCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_BHProducedWaterTankBatteries = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "FS25_BHProducedWaterTankBatteries", version = "2.0.2.0" }
  } end }
  _G.FillType = { WATER = 1 }
  local function tank(level, high)
    return { level = 999999, inletOpen = true, outletOpen = true,
      lowLocked = false, highLatched = high, drawdownAuthorized = false,
      acknowledged = false }
  end
  local function storage(level)
    return { getFillLevel = function() return level end,
      getCapacity = function() return 80000 end }
  end
  local function battery(id, owner)
    return { uniqueId = id,
      getOwnerFarmId = function() return owner end,
      getName = function() return id end,
      ["spec_FS25_BHProducedWaterTankBatteries.bhWaterBattery"] = {
        ready = true, configValid = true, deleted = false,
        bankESD = false, bankAcknowledged = false, selectedTank = 2,
        totalProduced = 12000, totalLoaded = 3000,
        tanks = { tank(1000, false), tank(2000, true),
          tank(3000, false), tank(4000, false) },
      },
      spec_silo = { storages = { storage(1000), storage(2000),
        storage(3000), storage(4000) } },
    }
  end
  _G.g_currentMission = { getIsServer = function() return true end,
    placeableSystem = { placeables = {
      battery("own", 1), battery("foreign", 2),
    } } }
`;

test("reads native levels and saved safety state for the owned battery only", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { batteryCount: 1, tankCount: 4,
      waterLiters: 10000, totalProducedLiters: 12000,
      totalLoadedLiters: 3000, unacknowledgedHighTanks: 1 } } });
  expect(page.banks).toEqual([expect.objectContaining({
    batteryId: "own", selectedTank: 2, waterLiters: 10000,
    tanks: expect.arrayContaining([expect.objectContaining({
      number: 2, selected: true, waterLiters: 2000,
      capacityLiters: 80000, highLatched: true })]),
  })]);
  expect(JSON.stringify(page)).not.toContain("foreign");
  expect(JSON.stringify(page)).not.toContain("999999"); // never trust the mod's mutable cached level
  const merged = normalizeCompanionPages({ pages: { bhWaterBattery: page } }, { modules: loadModules() });
  expect(merged.pages.bhWaterBattery.banks).toHaveLength(1);
});

test("withholds ambiguous identity and malformed native levels", () => {
  const duplicate = runCompanionPage(FILE,
    SETUP.replace('battery("foreign", 2)', 'battery("own", 1)'), { farmId: 1 });
  expect(duplicate).toMatchObject({ readState: "partial" });
  expect(Object.keys(duplicate.banks)).toHaveLength(0);
  const invalid = runCompanionPage(FILE,
    SETUP.replace('storage(4000)', 'storage(90000)'), { farmId: 1 });
  expect(invalid).toMatchObject({ readState: "partial" });
  expect(Object.keys(invalid.banks)).toHaveLength(0);
});

test("requires reviewed version, server state and WATER fill type", () => {
  expect(runCompanionPage(FILE,
    SETUP.replace('version = "2.0.2.0"', 'version = "2.0.1.0"'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE,
    SETUP.replace('getIsServer = function() return true end', 'getIsServer = function() return false end'),
    { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-battery-state-only" });
  expect(runCompanionPage(FILE,
    SETUP.replace('_G.FillType = { WATER = 1 }', '_G.FillType = {}'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "water-filltype-not-ready" });
});
