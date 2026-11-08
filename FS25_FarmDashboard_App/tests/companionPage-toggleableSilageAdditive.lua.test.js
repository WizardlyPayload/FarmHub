"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "ToggleableSilageAdditiveCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_330718_Toggleable_Silage_Additive = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "FS25_330718_Toggleable_Silage_Additive", version = "1.0.0.0" }
  } end }
  local function vehicle(id, farm, available, active)
    return { uniqueId = id, ownerFarmId = farm,
      getFullName = function() return "Equipment " .. id end,
      spec_toggleableSilageAdditive = {
        isAvailable = available, isActive = active } }
  end
  _G.g_currentMission = { getIsServer = function() return true end,
    vehicleSystem = { vehicles = {
      vehicle("owned-on", 1, true, true),
      vehicle("owned-off", 1, true, false),
      vehicle("unavailable", 1, false, true),
      vehicle("foreign", 2, true, false),
    } } }
`;

test("exports only available owned equipment and current switch state", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { supportedVehicleCount: 2, disabledVehicleCount: 1 } } });
  expect(page.rows.find((row) => row.vehicleId === "owned-off"))
    .toMatchObject({ additiveUsageEnabled: false, farmId: 1 });
  expect(JSON.stringify(page)).not.toMatch(/foreign|unavailable/);
  const merged = normalizeCompanionPages({ pages: { toggleableSilageAdditive: page } },
    { modules: loadModules() });
  expect(merged.pages.toggleableSilageAdditive.rows).toHaveLength(2);
});

test("withholds totals when owned state is ambiguous", () => {
  for (const altered of [
    SETUP.replace('vehicle("owned-off", 1, true, false)',
      'vehicle("owned-on", 1, true, false)'),
    SETUP.replace('vehicle("owned-off", 1, true, false)',
      'vehicle("owned-off", 1, true, nil)'),
  ]) {
    const page = runCompanionPage(FILE, altered, { farmId: 1 });
    expect(page).toMatchObject({ readState: "partial", coverage: "partial" });
    expect(page.byFarm).toBeUndefined();
  }
});

test("gates unreviewed versions and client-only state", () => {
  expect(runCompanionPage(FILE,
    SETUP.replace('version = "1.0.0.0"', 'version = "1.1.0.0"'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE,
    SETUP.replace('getIsServer = function() return true end',
      'getIsServer = function() return false end'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-vehicle-state-only" });
});
