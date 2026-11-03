"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "EnhancedVehicleCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_EnhancedVehicle = true }
  _G.g_currentMission = { getIsServer = function() return true end,
    vehicleSystem = { vehicles = {
      { ownerFarmId = 1, uniqueId = "own", getFullName = function() return "MF 8570" end,
        vData = { is = { [14] = 12345.67, [15] = 345.67, [16] = 1 } } },
      { ownerFarmId = 2, uniqueId = "foreign", vData = { is = { [14] = 900000 } } },
      { ownerFarmId = 1, uniqueId = "no-enhanced-vehicle" },
      { ownerFarmId = 1, uniqueId = "negative", vData = { is = { [14] = -5 } } },
    } } }
`;

test("reads the mod's own distance only for this farm's tracked vehicles", () => {
    const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
    expect(page).toMatchObject({ readState: "ok", coverage: "complete", byFarm: { "1": { trackedCount: 1 } } });
    expect(page.rows).toMatchObject([{ id: "own", vehicle: "MF 8570", odoKm: 12.35, tripKm: 0.35, hudMode: "trip" }]);
    expect(JSON.stringify(page)).not.toMatch(/foreign|900000|negative/);
    const merged = normalizeCompanionPages({ pages: { enhancedVehicle: page } }, { modules: loadModules() });
    expect(merged.pages.enhancedVehicle.rows).toHaveLength(1);
});

test("withholds client state and missing owned vehicle list", () => {
    const client = SETUP.replace("getIsServer = function() return true end", "getIsServer = function() return false end");
    expect(runCompanionPage(FILE, client, { farmId: 1 })).toMatchObject({ readState: "settings-only", reason: "server-vehicle-state-only" });
    expect(runCompanionPage(FILE, SETUP.replace("vehicleSystem = { vehicles = {", "vehicleSystem = { vehicles = nil, unused = {"), { farmId: 1 }))
        .toMatchObject({ readState: "settings-only", reason: "no-owned-vehicle-list" });
    expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
});
