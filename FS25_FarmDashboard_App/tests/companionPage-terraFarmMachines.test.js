"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "TerraFarmMachinesCollector.lua";
const GAME = `
  local own = { ownerFarmId = 1, uniqueId = "own", name = "Owned loader", spec_machine = {
    machineTypeId = "shovel", enabled = true, active = false, resourcesEnabled = true,
    inputMode = 2, outputMode = 1, fillTypeIndex = 9,
    inputAreaEnabled = true, outputAreaEnabled = false,
  } }
  local foreign = { ownerFarmId = 2, uniqueId = "foreign", name = "Other farm's machine", spec_machine = {
    machineTypeId = "shovel", enabled = true, active = true, inputMode = 1, outputMode = 1,
  } }
  local unregistered = { ownerFarmId = 1, uniqueId = "unregistered", name = "Another mod's machine", spec_machine = {
    machineTypeId = "other", enabled = true,
  } }
  _G.g_modIsLoaded = { KM_66597_TerraFarm = true }
  _G.KM_66597_TerraFarm = {
    g_machineManager = { vehicles = { own, foreign } },
    Machine = { MODE_NAME = { [1] = "RAISE", [2] = "LOWER", [3] = "SMOOTH",
        [4] = "FLATTEN", [5] = "PAINT", [6] = "MATERIAL" } },
  }
  _G.g_fillTypeManager = { getFillTypeByIndex = function(_, index)
    if index == 9 then return { title = "Gravel" } end
  end }
  _G.g_currentMission = { getFarmId = function() return 1 end,
    vehicleSystem = { vehicles = { own, foreign, unregistered } } }
`;

test("exports only registered machines explicitly owned by this farm", () => {
    const page = runCompanionPage(FILE, GAME, { farmId: 1 });
    expect(page).toMatchObject({ readState: "ok", coverage: "complete",
        byFarm: { "1": { machineCount: 1, enabledCount: 1, activeCount: 0 } } });
    expect(page.rows).toEqual([expect.objectContaining({
        farmId: 1, vehicleId: "own", vehicle: "Owned loader", machineType: "shovel",
        inputMode: "LOWER", outputMode: "RAISE", material: "Gravel",
        inputAreaEnabled: true, outputAreaEnabled: false,
    })]);
    expect(normalizeCompanionPages({ pages: { terraFarmMachines: page } }, { modules: loadModules() })
        .pages.terraFarmMachines.rows).toHaveLength(1);
});

test("withholds an unavailable manager and does not read a shared-global shadow", () => {
    const page = runCompanionPage(FILE, `
      _G.g_modIsLoaded = { KM_66597_TerraFarm = true }
      _G.g_machineManager = { vehicles = { { ownerFarmId = 1, spec_machine = { machineTypeId = "shovel" } } } }
    `, { farmId: 1 });
    expect(page).toMatchObject({ readState: "settings-only", reason: "no-terrafarm-manager" });
    expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
});
