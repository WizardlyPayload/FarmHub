"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "WelchyPerformanceAddonCollector.lua";
const SETUP = `
  local name = "KM_83271_Welchys_Performance_Addon"
  _G.g_modIsLoaded = { [name] = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = name, version = "1.0.4.2" }
  } end }
  _G[name] = { RevLimiterTuning = { fields = {} } }
  local fields = _G[name].RevLimiterTuning.fields
  for i = 1, 23 do
    fields[i] = { key = "p" .. i, label = "Setting " .. i,
      min = 0, max = 2, default = 1, unit = "percent" }
  end
  fields[24] = { key = "rpmLimit", label = "Limiter RPM",
    min = 0, max = 20000, default = 0, unit = "redline" }
  local function vehicle(id, farm, p1, rpm)
    local spec = { supported = true, rpmLimit = rpm }
    for i = 1, 23 do spec["p" .. i] = 1 end
    spec.p1 = p1
    return { uniqueId = id, ownerFarmId = farm,
      ["spec_" .. name .. ".revLimiterFlames"] = spec,
      getFullName = function() return "Vehicle " .. id end }
  end
  _G.g_currentMission = { getIsServer = function() return true end,
    vehicleSystem = { vehicles = {
      vehicle("owned-custom", 1, 1.25, 3500),
      vehicle("owned-stock", 1, 1, 0),
      vehicle("foreign", 2, 1.5, 5000),
    } } }
`;

test("reports only nondefault owned tuning with source defaults", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { supportedVehicleCount: 2, changedVehicleCount: 1,
      changedSettingCount: 2 } } });
  expect(page.rows).toHaveLength(2);
  expect(page.rows.find((r) => r.parameter === "p1"))
    .toMatchObject({ vehicleId: "owned-custom", value: 1.25, default: 1,
      unit: "percent" });
  expect(page.rows.find((r) => r.parameter === "rpmLimit"))
    .toMatchObject({ value: 3500, default: 0, label: "Limiter RPM" });
  expect(JSON.stringify(page)).not.toMatch(/foreign|owned-stock/);
  const merged = normalizeCompanionPages({ pages: { welchyPerformanceAddon: page } },
    { modules: loadModules() });
  expect(merged.pages.welchyPerformanceAddon.rows).toHaveLength(2);
});

test("withholds totals on invalid or duplicate owned identity", () => {
  for (const altered of [
    SETUP.replace('vehicle("owned-custom", 1, 1.25, 3500)',
      'vehicle("owned-custom", 1, 5, 3500)'),
    SETUP.replace('vehicle("owned-stock", 1', 'vehicle("owned-custom", 1'),
  ]) {
    const page = runCompanionPage(FILE, altered, { farmId: 1 });
    expect(page).toMatchObject({ readState: "partial", coverage: "partial" });
    expect(page.byFarm).toBeUndefined();
  }
});

test("gates unreviewed version and client-only state", () => {
  expect(runCompanionPage(FILE,
    SETUP.replace('version = "1.0.4.2"', 'version = "1.0.4.3"'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE,
    SETUP.replace('getIsServer = function() return true end',
      'getIsServer = function() return false end'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-vehicle-state-only" });
});
