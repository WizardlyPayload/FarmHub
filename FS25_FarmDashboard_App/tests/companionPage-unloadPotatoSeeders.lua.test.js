"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "UnloadPotatoSeedersCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_UnloadPotatoSeeders = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "FS25_UnloadPotatoSeeders", version = "1.0.0.2" }
  } end }
  _G.FillType = { POTATO = 10, SEEDS = 11, FERTILIZER = 12 }
  local function vehicle(id, farm, state)
    return { uniqueId = id, ownerFarmId = farm,
      getFullName = function() return "Seeder " .. id end,
      spec_unloadPotatoSeeder = state }
  end
  _G.g_currentMission = { getIsServer = function() return true end,
    vehicleSystem = { vehicles = {
      vehicle("owned-potato", 1, { isPotatoSeeder = true,
        unloadFillTypeIndex = FillType.POTATO, supportsFertilizer = false }),
      vehicle("owned-fertilizer", 1, { isPotatoSeeder = true,
        unloadFillTypeIndex = FillType.FERTILIZER, supportsFertilizer = true }),
      vehicle("foreign", 2, { isPotatoSeeder = true,
        unloadFillTypeIndex = FillType.SEEDS, supportsFertilizer = false }),
      vehicle("normal-seeder", 1, { isPotatoSeeder = false,
        unloadFillTypeIndex = FillType.SEEDS, supportsFertilizer = false }),
    } } }
`;

test("reads only owned potato-seeder live choices", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { seederCount: 2, potatoCount: 1,
      seedsCount: 0, fertilizerCount: 1 } } });
  expect(page.rows).toHaveLength(2);
  expect(page.rows.find((row) => row.vehicleId === "owned-potato"))
    .toMatchObject({ farmId: 1, selectedUnload: "potato", supportsFertilizer: false });
  expect(JSON.stringify(page)).not.toMatch(/foreign|normal-seeder/);
  const merged = normalizeCompanionPages({ pages: { unloadPotatoSeeders: page } },
    { modules: loadModules() });
  expect(merged.pages.unloadPotatoSeeders.rows).toHaveLength(2);
});

test("withholds totals for invalid choice and duplicate owned identity", () => {
  const invalid = runCompanionPage(FILE,
    SETUP.replace("unloadFillTypeIndex = FillType.FERTILIZER, supportsFertilizer = true",
      "unloadFillTypeIndex = FillType.FERTILIZER, supportsFertilizer = false"),
    { farmId: 1 });
  expect(invalid).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(invalid.byFarm).toBeUndefined();
  const duplicate = runCompanionPage(FILE,
    SETUP.replace('vehicle("owned-fertilizer", 1,', 'vehicle("owned-potato", 1,'),
    { farmId: 1 });
  expect(duplicate).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(Object.keys(duplicate.rows)).toHaveLength(0);
  expect(duplicate.byFarm).toBeUndefined();
});

test("gates unreviewed version and client-only vehicle state", () => {
  expect(runCompanionPage(FILE,
    SETUP.replace('version = "1.0.0.2"', 'version = "1.0.0.1"'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE,
    SETUP.replace("getIsServer = function() return true end",
      "getIsServer = function() return false end"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-seeder-state-only" });
});
