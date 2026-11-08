"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "UniversalSoundTunerCollector.lua";
const SETUP = `
  local name = "KM_83598_Universal_Sound_Tuner"
  _G.g_modIsLoaded = { [name] = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = name, version = "1.0.0.0" }
  } end }
  _G[name] = { HSST = { MOD_NAME = name, PARAM_ORDER = {}, PARAMS = {} } }
  local tuner = _G[name].HSST
  for i = 1, 44 do
    local id = "p" .. i
    tuner.PARAM_ORDER[i] = id
    tuner.PARAMS[id] = { kind = "float", min = 0, max = 2, def = 1 }
  end
  tuner.PARAM_ORDER[45] = "turbo"
  tuner.PARAMS.turbo = { kind = "choice", choices = { "off", "small", "big" }, def = 0 }
  local function vehicle(id, farm, tune)
    return { uniqueId = id, ownerFarmId = farm, hsST = { tune = tune },
      getFullName = function() return "Vehicle " .. id end }
  end
  local function tune(first, turbo)
    local t = {}
    for i = 1, 44 do t["p" .. i] = 1 end
    t.p1 = first
    t.turbo = turbo
    return t
  end
  _G.g_currentMission = { getIsServer = function() return true end,
    vehicleSystem = { vehicles = {
      vehicle("owned-custom", 1, tune(1.25, 2)),
      vehicle("owned-stock", 1, tune(1, 0)),
      vehicle("foreign", 2, tune(1.5, 1)),
    } } }
`;

test("reports only nondefault owned tune choices with source defaults", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { supportedVehicleCount: 2, changedVehicleCount: 1,
      changedSettingCount: 2 } } });
  expect(page.rows).toHaveLength(2);
  expect(page.rows.find((r) => r.parameter === "p1"))
    .toMatchObject({ vehicleId: "owned-custom", value: 1.25, default: 1 });
  expect(page.rows.find((r) => r.parameter === "turbo"))
    .toMatchObject({ choice: "big", defaultChoice: "off" });
  expect(JSON.stringify(page)).not.toMatch(/foreign|owned-stock/);
  const merged = normalizeCompanionPages({ pages: { universalSoundTuner: page } },
    { modules: loadModules() });
  expect(merged.pages.universalSoundTuner.rows).toHaveLength(2);
});

test("rejects malformed or ambiguous owned vehicle state without totals", () => {
  for (const altered of [
    SETUP.replace('tune(1.25, 2)', 'tune(5, 2)'),
    SETUP.replace('vehicle("owned-stock", 1', 'vehicle("owned-custom", 1'),
  ]) {
    const page = runCompanionPage(FILE, altered, { farmId: 1 });
    expect(page).toMatchObject({ readState: "partial", coverage: "partial" });
    expect(page.byFarm).toBeUndefined();
  }
});

test("gates unreviewed version and client-only state", () => {
  expect(runCompanionPage(FILE,
    SETUP.replace('version = "1.0.0.0"', 'version = "1.0.1.0"'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE,
    SETUP.replace('getIsServer = function() return true end',
      'getIsServer = function() return false end'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-vehicle-state-only" });
});
