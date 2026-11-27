"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "AgriculturalTerminalCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { KM_82990_Agricultural_Terminal = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "KM_82990_Agricultural_Terminal", version = "1.0.0.0" }
  } end }
  local function machine(id, owner, installed)
    return { uniqueId = id, getOwnerFarmId = function() return owner end,
      getFullName = function() return id end,
      spec_terminalAgricola = { hasTerminal = installed,
        job = { number = 3, farmlandId = 12, isPaused = false,
          coverage = { getArea = function() return 12500 end },
          workTime = 3600000, totalTime = 4500000,
          liters = 14.5, distance = 2500, harvestMass = 3.2, harvestHa = 0.8 },
        history = { { number = 2, farmlandId = 14, area = 6500,
          workTime = 1800000, totalTime = 2100000,
          liters = 7.2, distance = 1000, harvestMass = 1.4, harvestHa = 0.4 } } } }
  end
  _G.g_currentMission = { getIsServer = function() return true end,
    vehicleSystem = { vehicles = {
      machine("owned", 1, true), machine("foreign", 2, true),
      machine("unequipped", 1, false)
    } } }
`;

test("exports current-owned equipped vehicle records with source units", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { vehicleCount: 1, recordCount: 2 } } });
  expect(page.rows).toEqual([
    expect.objectContaining({ vehicleId: "owned", number: 3, current: true,
      startingParcel: 12, areaHa: 1.25, workHours: 1, openHours: 1.25,
      fuelLiters: 14.5, distanceKm: 2.5, harvestTonnes: 3.2, harvestHa: 0.8 }),
    expect.objectContaining({ vehicleId: "owned", number: 2, current: false,
      startingParcel: 14, areaHa: 0.65, workHours: 0.5, harvestTonnes: 1.4 }),
  ]);
  expect(JSON.stringify(page)).not.toContain("foreign");
  expect(JSON.stringify(page)).not.toContain("unequipped");
  const merged = normalizeCompanionPages({ pages: { agriculturalTerminal: page } },
    { modules: loadModules() });
  expect(merged.pages.agriculturalTerminal.rows).toHaveLength(2);
});

test("withholds counts and ambiguous records on malformed values or duplicate identity", () => {
  const malformed = runCompanionPage(FILE,
    SETUP.replace('liters = 7.2', 'liters = -7.2'), { farmId: 1 });
  expect(malformed).toMatchObject({ readState: "partial", coverage: "partial",
    reason: "invalid-terminal-record" });
  expect(malformed.byFarm["1"]).not.toHaveProperty("recordCount");
  expect(malformed.rows).toHaveLength(1);
  const duplicate = runCompanionPage(FILE,
    SETUP.replace('machine("foreign", 2, true)', 'machine("owned", 1, true)'), { farmId: 1 });
  expect(duplicate).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(Object.keys(duplicate.rows)).toHaveLength(0);
});

test("gates unreviewed version, client and absent mod", () => {
  expect(runCompanionPage(FILE,
    SETUP.replace('version = "1.0.0.0"', 'version = "1.0.0.1"'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE,
    SETUP.replace('getIsServer = function() return true end',
      'getIsServer = function() return false end'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-terminal-records-only" });
  expect(runCompanionPage(FILE, '_G.g_modIsLoaded = {}', { farmId: 1 })).toBeUndefined();
});
