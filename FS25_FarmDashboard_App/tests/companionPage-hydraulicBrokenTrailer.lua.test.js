"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "HydraulicBrokenTrailerCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { KM_81545_Hydraulic_Broken_Trailer = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "KM_81545_Hydraulic_Broken_Trailer", version = "1.0.0.0" }
  } end }
  local function trailer(id, farm, condition, broken, hold)
    return { uniqueId = id, ownerFarmId = farm, spec_trailer = {},
      getFullName = function() return "Trailer " .. id end,
      spec_hydraulicBroken = { condition = condition, isBroken = broken,
        detachHoldActive = hold } }
  end
  _G.g_currentMission = { getIsServer = function() return true end,
    vehicleSystem = { vehicles = {
      trailer("owned-a", 1, 0.97, false, false),
      trailer("owned-b", 1, 0, true, true),
      trailer("foreign", 2, 0.5, false, false),
    } } }
`;

test("exports current owned trailer hydraulic condition and failures", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { supportedTrailerCount: 2, brokenTrailerCount: 1,
      serviceDueCount: 1 } } });
  expect(page.rows.find((row) => row.vehicleId === "owned-a"))
    .toMatchObject({ hydraulicCondition: 0.97, isBroken: false,
      needsService: true, detachHoldActive: false });
  expect(page.rows.find((row) => row.vehicleId === "owned-b"))
    .toMatchObject({ hydraulicCondition: 0, isBroken: true,
      needsService: false, detachHoldActive: true });
  expect(JSON.stringify(page)).not.toMatch(/foreign/);
  const merged = normalizeCompanionPages({ pages: { hydraulicBrokenTrailer: page } },
    { modules: loadModules() });
  expect(merged.pages.hydraulicBrokenTrailer.rows).toHaveLength(2);
});

test("withholds totals for duplicate identity and malformed hydraulic condition", () => {
  for (const altered of [
    SETUP.replace('trailer("owned-b", 1, 0, true, true)',
      'trailer("owned-a", 1, 0, true, true)'),
    SETUP.replace('trailer("owned-a", 1, 0.97, false, false)',
      'trailer("owned-a", 1, 1.2, false, false)'),
  ]) {
    const page = runCompanionPage(FILE, altered, { farmId: 1 });
    expect(page).toMatchObject({ readState: "partial", coverage: "partial" });
    expect(page.byFarm).toBeUndefined();
  }
});

test("gates unreviewed version and client-only state", () => {
  expect(runCompanionPage(FILE,
    SETUP.replace('version = "1.0.0.0"', 'version = "1.1.0.0"'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE,
    SETUP.replace('getIsServer = function() return true end',
      'getIsServer = function() return false end'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-hydraulic-state-only" });
});
