"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "HarvestoreConveyorCollector.lua";
const MOD = "KM_83595_Harvestore_Silo_Pack";
const SETUP = `
  _G.g_modIsLoaded = { ${MOD} = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "${MOD}", version = "0.5.0.3" }
  } end }
  _G.g_fillTypeManager = {
    getFillTypeNameByIndex = function(_, id) if id == 5 then return "SILAGE" end end,
  }
  local function silo(id, farm, enabled, total, cargo)
    return { uniqueId = id, getOwnerFarmId = function() return farm end,
      getName = function() return "Harvestore " .. id end,
      kmConveyorState = { enabled = enabled, ready = true, running = total > 0,
        fillType = 5, transit = { clock = 10, delay = 16, total = total, cargo = cargo } } }
  end
  _G.g_currentMission = { getIsServer = function() return true end,
    placeableSystem = { placeables = {
      silo("owned-loaded", 1, true, 120, {{ litres = 120, due = 18 }}),
      silo("owned-empty", 1, true, 0, {}),
      silo("disabled", 1, false, 500, {{ litres = 500, due = 20 }}),
      silo("foreign", 2, true, 999, {{ litres = 999, due = 20 }}),
    } } }
`;

test("reports queued material only for enabled owned conveyors", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { conveyorCount: 2, loadedConveyorCount: 1, inTransitLitres: 120 } } });
  expect(page.rows[1]).toMatchObject({ placeableId: "owned-loaded", fillType: "SILAGE",
    inTransitLitres: 120, batchCount: 1, nextDeliverySeconds: 8, running: true });
  expect(JSON.stringify(page)).not.toMatch(/foreign|disabled|999/);
  const merged = normalizeCompanionPages({ pages: { harvestoreConveyor: page } },
    { modules: loadModules() });
  expect(merged.pages.harvestoreConveyor.rows).toHaveLength(2);
});

test("withholds totals for inconsistent or duplicate conveyor cargo", () => {
  const inconsistent = runCompanionPage(FILE,
    SETUP.replace('silo("owned-loaded", 1, true, 120,', 'silo("owned-loaded", 1, true, 121,'),
    { farmId: 1 });
  expect(inconsistent).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(inconsistent.byFarm).toBeUndefined();
  const duplicate = runCompanionPage(FILE,
    SETUP.replace('silo("owned-empty", 1, true, 0, {})',
      'silo("owned-loaded", 1, true, 0, {})'), { farmId: 1 });
  expect(duplicate).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(duplicate.byFarm).toBeUndefined();
});

test("requires the reviewed version and server-owned state", () => {
  expect(runCompanionPage(FILE,
    SETUP.replace('version = "0.5.0.3"', 'version = "0.5.0.4"'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE,
    SETUP.replace('getIsServer = function() return true end',
      'getIsServer = function() return false end'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-conveyor-state-only" });
});
