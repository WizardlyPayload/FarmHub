"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "ForageWagonCompressionCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_ForageWagonCompression = true }
  _G.g_currentMission = { getIsServer = function() return true end,
    vehicleSystem = { vehicles = {
      { ownerFarmId = 1, uniqueId = "owned-on", getFullName = function() return "Owned loaded wagon" end,
        spec_fwc = { fillUnitIndex = 2, baseCapacity = 10000, compressedCapacity = 16000 },
        getIsTurnedOn = function() return true end,
        getFillUnitCapacity = function(self, index) return index == 2 and 16000 end,
        getFillUnitFillLevel = function(self, index) return index == 2 and 11000 end },
      { ownerFarmId = 1, uniqueId = "owned-off", getFullName = function() return "Owned parked wagon" end,
        spec_fwc = { fillUnitIndex = 1, baseCapacity = 8000, compressedCapacity = 12800 },
        getIsTurnedOn = function() return false end,
        getFillUnitCapacity = function() return 8000 end,
        getFillUnitFillLevel = function() return 0 end },
      { ownerFarmId = 2, uniqueId = "foreign", spec_fwc = { fillUnitIndex = 1,
        baseCapacity = 9000, compressedCapacity = 14400 } },
      { ownerFarmId = 1, uniqueId = "invalid", spec_fwc = { fillUnitIndex = 1,
        baseCapacity = 9000, compressedCapacity = 1000 } },
    } } }
`;

test("exports only owned valid wagon state with separate compressed and current capacities", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  if (page?.readState === "failed") throw new Error(JSON.stringify(page));
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { wagonCount: 2, compressionOnCount: 1 } } });
  expect(page.rows.find((row) => row.vehicleId === "owned-on"))
    .toMatchObject({ compressionOn: true, baseCapacityLitres: 10000,
      compressedCapacityLitres: 16000, currentCapacityLitres: 16000, currentFillLitres: 11000 });
  expect(page.rows.find((row) => row.vehicleId === "owned-off"))
    .toMatchObject({ compressionOn: false, baseCapacityLitres: 8000,
      compressedCapacityLitres: 12800, currentCapacityLitres: 8000, currentFillLitres: 0 });
  expect(JSON.stringify(page)).not.toMatch(/foreign|invalid/);
  const merged = normalizeCompanionPages({ pages: { forageWagonCompression: page } }, { modules: loadModules() });
  expect(merged.pages.forageWagonCompression.rows).toHaveLength(2);
});

test("withholds client state and absent mod", () => {
  const client = SETUP.replace("getIsServer = function() return true end", "getIsServer = function() return false end");
  expect(runCompanionPage(FILE, client, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-vehicle-state-only" });
  expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
});
