"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "VehicleAssistanceSystemCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_350273_Vehicle_Assistance_System = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "FS25_350273_Vehicle_Assistance_System", version = "1.0.0.1" }
  } end }
  local function vehicle(id, farm, cruise, low, high)
    local v = { uniqueId = id, ownerFarmId = farm,
      getFullName = function() return "Tractor " .. id end }
    if cruise ~= nil then v.spec_intelligentCruiseControl = { active = cruise } end
    if low ~= nil then v.spec_automaticLightControl = {
      lowBeamControlActive = low, highBeamControlActive = high } end
    return v
  end
  _G.g_currentMission = { getIsServer = function() return true end,
    vehicleSystem = { vehicles = {
      vehicle("owned-a", 1, true, true, false),
      vehicle("owned-b", 1, false, nil, nil),
      vehicle("foreign", 2, true, true, true),
      vehicle("unsupported", 1, nil, nil, nil),
    } } }
`;

test("reports saved controls only for owned supported vehicles, retaining false", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { vehicleCount: 2, cruiseEnabledCount: 1,
      lowBeamEnabledCount: 1, highBeamEnabledCount: 0 } } });
  expect(page.rows.find((row) => row.vehicleId === "owned-a"))
    .toMatchObject({ intelligentCruise: true, automaticLowBeam: true,
      automaticHighBeam: false });
  expect(page.rows.find((row) => row.vehicleId === "owned-b"))
    .toMatchObject({ intelligentCruise: false });
  expect(JSON.stringify(page)).not.toMatch(/foreign|unsupported/);
  const merged = normalizeCompanionPages({ pages: { vehicleAssistanceSystem: page } },
    { modules: loadModules() });
  expect(merged.pages.vehicleAssistanceSystem.rows).toHaveLength(2);
});

test("withholds totals for invalid state or duplicate vehicle identity", () => {
  for (const altered of [
    SETUP.replace('vehicle("owned-a", 1, true, true, false)',
      'vehicle("owned-a", 1, "yes", true, false)'),
    SETUP.replace('vehicle("owned-b", 1, false', 'vehicle("owned-a", 1, false'),
  ]) {
    const page = runCompanionPage(FILE, altered, { farmId: 1 });
    expect(page).toMatchObject({ readState: "partial", coverage: "partial" });
    expect(page.byFarm).toBeUndefined();
  }
});

test("gates unreviewed version and client state", () => {
  expect(runCompanionPage(FILE,
    SETUP.replace('version = "1.0.0.1"', 'version = "1.0.1.0"'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE,
    SETUP.replace("getIsServer = function() return true end",
      "getIsServer = function() return false end"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-vehicle-state-only" });
});
