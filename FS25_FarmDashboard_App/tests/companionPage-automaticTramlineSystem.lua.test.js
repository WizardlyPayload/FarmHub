"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "AutomaticTramlineSystemCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_355320_Automatic_Tramline_System = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "FS25_355320_Automatic_Tramline_System", version = "1.6.0.0" }
  } end }
  local function seeder(id, farm, total, session)
    return { uniqueId = id, ownerFarmId = farm,
      getFullName = function() return "Seeder " .. id end,
      spec_sowingMachine = {},
      spec_fahrgassenAutomatik = { mode = "GPS", pass = 2, N = 6,
        areaTotal = total, areaSession = session } }
  end
  _G.g_currentMission = { getIsServer = function() return true end,
    vehicleSystem = { vehicles = {
      seeder("owned", 1, 23500, 12500),
      seeder("foreign", 2, 90000, 40000),
      { uniqueId = "tractor", ownerFarmId = 1 },
    } } }
`;

test("exports a nonzero owned seeder's mod counters in hectares", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { seederCount: 1, recordedSeederCount: 1,
      totalHectares: 2.35, sessionHectares: 1.25 } } });
  expect(page.rows).toHaveLength(1);
  expect(page.rows[0]).toMatchObject({ farmId: 1, vehicleId: "owned",
    mode: "GPS", currentPass: 2, passSequence: 6,
    totalHectares: 2.35, sessionHectares: 1.25 });
  expect(JSON.stringify(page)).not.toMatch(/foreign|tractor/);
  const merged = normalizeCompanionPages({ pages: { automaticTramlineSystem: page } },
    { modules: loadModules() });
  expect(merged.pages.automaticTramlineSystem.rows).toHaveLength(1);
});

test("withholds aggregate values when a compatible owned record is malformed", () => {
  const page = runCompanionPage(FILE, SETUP.replace("23500, 12500", "23500, 24000"),
    { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial", coverage: "partial",
    reason: "invalid-seeder-state" });
  expect(page.byFarm).toBeUndefined();
});

test("requires the reviewed mod version and server role", () => {
  expect(runCompanionPage(FILE, SETUP.replace('version = "1.6.0.0"',
    'version = "1.6.1.0"'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE, SETUP.replace('getIsServer = function() return true end',
    'getIsServer = function() return false end'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-seeder-state-only" });
});
