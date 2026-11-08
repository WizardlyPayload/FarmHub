"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "HelperSilageCompactingCollector.lua";
const MOD = "KM_81547_Helper_Silage_Compacting";
const SETUP = `
  _G.g_modIsLoaded = { ${MOD} = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "${MOD}", version = "1.0.0.0" }
  } end }
  local function tractor(id, farm, state, silo)
    return { uniqueId = id, ownerFarmId = farm, typeName = "tractor",
      getFullName = function() return "Tractor " .. id end,
      ["spec_${MOD}.bunkerSiloWorker"] = { runState = state, bunkerSilo = silo } }
  end
  _G.g_currentMission = { getIsServer = function() return true end,
    vehicleSystem = { vehicles = {
      tractor("running", 1, 1, {}), tractor("waiting", 1, 2, {}),
      tractor("idle-at-bunker", 1, 0, {}), tractor("not-assigned", 1, 0, nil),
      tractor("foreign", 2, 1, {}),
    } } }
`;

test("exports only assigned owned tractors and their current helper state", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { assignedVehicleCount: 3, runningVehicleCount: 1, waitingVehicleCount: 1 } } });
  expect(page.rows.map((row) => row.workerState)).toEqual(["Idle", "Running", "Waiting"]);
  expect(JSON.stringify(page)).not.toMatch(/foreign|not-assigned/);
  const merged = normalizeCompanionPages({ pages: { helperSilageCompacting: page } },
    { modules: loadModules() });
  expect(merged.pages.helperSilageCompacting.rows).toHaveLength(3);
});

test("withholds totals when an active tractor has no bunker assignment", () => {
  const page = runCompanionPage(FILE,
    SETUP.replace('tractor("waiting", 1, 2, {})', 'tractor("waiting", 1, 2, nil)'),
    { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(page.byFarm).toBeUndefined();
});

test("requires exact reviewed version and server worker state", () => {
  expect(runCompanionPage(FILE,
    SETUP.replace('version = "1.0.0.0"', 'version = "1.1.0.0"'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE,
    SETUP.replace('getIsServer = function() return true end',
      'getIsServer = function() return false end'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-worker-state-only" });
});
