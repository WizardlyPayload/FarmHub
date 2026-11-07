"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "RealisticSeederCollector.lua";
const GAME = `
  _G.g_modIsLoaded = { FS25_372197_Realistic_Seeder = true }
  _G.g_currentMission = { getIsServer = function() return true end,
    vehicleSystem = { vehicles = {
      { ownerFarmId = 1, uniqueId = "owned-1", getFullName = function() return "Seeder A" end,
        spec_realisticSeeder = { isValidStoreCategory = true, currentUnloadMode = 2,
          currentFillUnitNumber = 2, isUnloadingToLeft = false, allowFertilizer = false },
        spec_sowingMachine = {}, spec_sprayer = {} },
      { ownerFarmId = 1, uniqueId = "owned-2", getFullName = function() return "Seeder B" end,
        spec_realisticSeeder = { isValidStoreCategory = true, currentUnloadMode = 1,
          currentFillUnitNumber = 1, isUnloadingToLeft = true } },
      { ownerFarmId = 1, uniqueId = "unsupported", spec_realisticSeeder = { isValidStoreCategory = false } },
      { ownerFarmId = 2, uniqueId = "foreign-secret", spec_realisticSeeder = {
          isValidStoreCategory = true, currentUnloadMode = 2, currentFillUnitNumber = 2,
          isUnloadingToLeft = false } },
    } } }
`;

test("reads owned seeder choices without foreign or unsupported vehicles", () => {
  const page = runCompanionPage(FILE, GAME, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { seederCount: 2, nondefaultCount: 1 } } });
  expect(page.rows.find((row) => row.vehicleId === "owned-1")).toMatchObject({
    unloadMode: 2, fillUnitNumber: 2, unloadingLeft: false, fertilizerAllowed: false,
  });
  expect(page.rows.find((row) => row.vehicleId === "owned-2")).toMatchObject({
    unloadMode: 1, fillUnitNumber: 1, unloadingLeft: true,
  });
  expect(JSON.stringify(page)).not.toMatch(/foreign-secret|unsupported/);
  const merged = normalizeCompanionPages({ pages: { realisticSeeder: page } }, { modules: loadModules() });
  expect(merged.pages.realisticSeeder.rows).toHaveLength(2);
});

test("withholds client state and marks invalid live choices partial", () => {
  const client = GAME.replace("getIsServer = function() return true end", "getIsServer = function() return false end");
  expect(runCompanionPage(FILE, client, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-vehicle-state-only" });
  const invalid = GAME.replace("currentUnloadMode = 2", "currentUnloadMode = 9")
    .replace("currentFillUnitNumber = 2", "currentFillUnitNumber = 0");
  const page = runCompanionPage(FILE, invalid, { farmId: 1 });
  expect(page.readState).toBe("partial");
  expect(page.rows.find((row) => row.vehicleId === "owned-1")).toMatchObject({
    unloadingLeft: false, fertilizerAllowed: false,
  });
  expect(page.rows.find((row) => row.vehicleId === "owned-1").unloadMode).toBeUndefined();
});

test("withholds unowned farm and recognises the exact vault archive", () => {
  const otherFarm = runCompanionPage(FILE, GAME, { farmId: 3 });
  expect(otherFarm).toMatchObject({ readState: "settings-only", reason: "no-owned-supported-seeder" });
  expect(Object.keys(otherFarm.rows)).toHaveLength(0);
  expect(runCompanionPage(FILE, GAME.replace("FS25_372197_Realistic_Seeder", "FS25_RealisticSeeder"), { farmId: 1 })
    .byFarm["1"].seederCount).toBe(2);
});
