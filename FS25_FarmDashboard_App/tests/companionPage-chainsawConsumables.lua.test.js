"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "ChainsawConsumablesCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { KM_82857_Chainsaw_Consumables = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "KM_82857_Chainsaw_Consumables", version = "1.0.0" }
  } end }
  local function saw(id, owner)
    return { ownerFarmId = owner, spec_chainsaw = {},
      getOwnerFarmId = function() return owner end,
      getUniqueId = function() return id end,
      getName = function() return id end,
      ccState = { fuel = 0.3, oil = 0.15, sharpness = 0.8,
        chainLife = 0.6, engine = 0.95 },
    }
  end
  _G.g_currentMission = { getIsServer = function() return true end,
    handToolSystem = { handTools = { saw("own-saw", 1), saw("foreign-saw", 2) } } }
`;

test("reads only owned live chainsaw levels and condition", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { sawCount: 1 } } });
  expect(page.rows[0]).toMatchObject({ toolId: "own-saw", fuelLitres: 0.3,
    chainOilLitres: 0.15, sharpnessPercent: 80, chainLifePercent: 60,
    enginePercent: 95 });
  expect(JSON.stringify(page)).not.toContain("foreign-saw");
  const merged = normalizeCompanionPages({ pages: { chainsawConsumables: page } }, { modules: loadModules() });
  expect(merged.pages.chainsawConsumables.rows).toHaveLength(1);
});

test("withholds duplicate identity, missing state and invalid condition", () => {
  const duplicate = runCompanionPage(FILE, SETUP.replace('saw("foreign-saw", 2)', 'saw("own-saw", 1)'), { farmId: 1 });
  expect(duplicate).toMatchObject({ readState: "partial" });
  expect(Object.keys(duplicate.rows)).toHaveLength(0);
  const missing = runCompanionPage(FILE, SETUP.replace('ccState = { fuel', 'ccState = nil, other = { fuel'), { farmId: 1 });
  expect(missing).toMatchObject({ readState: "partial" });
  const invalid = runCompanionPage(FILE, SETUP.replace('chainLife = 0.6', 'chainLife = -0.6'), { farmId: 1 });
  expect(invalid).toMatchObject({ readState: "partial" });
  expect(Object.keys(invalid.rows)).toHaveLength(0);
});

test("gates unreviewed version and client-only state", () => {
  expect(runCompanionPage(FILE, SETUP.replace('version = "1.0.0"', 'version = "1.0.1"'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE, SETUP.replace('getIsServer = function() return true end', 'getIsServer = function() return false end'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-hand-tool-state-only" });
});
