"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "MixerWagonFeedSwitcherCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { KM_80956_Mixer_Wagon_Feed_Switcher = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "KM_80956_Mixer_Wagon_Feed_Switcher", version = "1.0.0.0" }
  } end }
  local function wagon(id, owner, mode)
    return { uniqueId = id, ownerFarmId = owner,
      getOwnerFarmId = function() return owner end,
      getFullName = function() return id end,
      spec_mixerWagonMode = { currentMode = mode,
        customRecipeProfilesByMode = { [2] = { name = "pigFood", title = "PigFood",
          outputFillTypeName = "PIGFOOD" } } },
      spec_mixerWagon = { mixerWagonFillTypes = {
        { name = "baseGrain", fillLevel = 1200 }, { name = "protein", fillLevel = 300 },
      } },
    }
  end
  _G.g_currentMission = { getIsServer = function() return true end,
    vehicleSystem = { vehicles = { wagon("owned", 1, 2), wagon("foreign", 2, 2),
      wagon("default", 1, 1) } } }
`;

test("reads one owned custom recipe and its mod-tracked mix groups", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { customRecipeCount: 1 } } });
  expect(page.rows[0]).toMatchObject({ farmId: 1, vehicleId: "owned", mode: 2,
    recipe: "PigFood", outputFillType: "PIGFOOD", groupTotalLitres: 1500 });
  expect(page.rows[0].groups).toEqual(expect.arrayContaining([
    { name: "baseGrain", litres: 1200 }, { name: "protein", litres: 300 },
  ]));
  expect(JSON.stringify(page)).not.toMatch(/foreign|default/);
  const merged = normalizeCompanionPages({ pages: { mixerWagonFeedSwitcher: page } }, { modules: loadModules() });
  expect(merged.pages.mixerWagonFeedSwitcher.rows).toHaveLength(1);
});

test("withholds duplicate identity, invalid group state and unreviewed version", () => {
  const duplicate = runCompanionPage(FILE, SETUP.replace('wagon("default", 1, 1)', 'wagon("owned", 1, 2)'), { farmId: 1 });
  expect(duplicate).toMatchObject({ readState: "partial" });
  expect(Object.keys(duplicate.rows)).toHaveLength(0);
  const invalid = runCompanionPage(FILE, SETUP.replace('fillLevel = 300', 'fillLevel = -1'), { farmId: 1 });
  expect(invalid).toMatchObject({ readState: "partial" });
  expect(Object.keys(invalid.rows)).toHaveLength(0);
  const newer = runCompanionPage(FILE, SETUP.replace('version = "1.0.0.0"', 'version = "1.0.1.0"'), { farmId: 1 });
  expect(newer).toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
});

test("does not read client-only vehicle state", () => {
  const client = runCompanionPage(FILE, SETUP.replace('getIsServer = function() return true end', 'getIsServer = function() return false end'), { farmId: 1 });
  expect(client).toMatchObject({ readState: "settings-only", reason: "server-vehicle-state-only" });
});
