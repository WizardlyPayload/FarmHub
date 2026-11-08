"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "RhmCloggingCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { WA25_RHM_CloggingAddon = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "WA25_RHM_CloggingAddon", version = "1.4.1.0" }
  } end }
  local function vehicle(id, farm, machineType, sharpness, addon)
    return { uniqueId = id, ownerFarmId = farm,
      getFullName = function() return "Harvester " .. id end,
      spec_rhm_Combine = { machineType = machineType,
        knifeSharpness = sharpness },
      spec_wa_rhmClogging = addon and {} or nil }
  end
  _G.g_currentMission = { getIsServer = function() return true end,
    vehicleSystem = { vehicles = {
      vehicle("forage-one", 1, "forage", 0.63, true),
      vehicle("grain-one", 1, "grain", 0.72, true),
      vehicle("foreign", 2, "forage", 0.27, true),
      vehicle("base-only", 1, "forage", 0.58, false),
    } } }
`;

test("reports only owned forage knife condition and survives merge", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { vehicleCount: 1 } } });
  expect(page.rows).toHaveLength(1);
  expect(page.rows[0]).toMatchObject({ vehicleId: "forage-one",
    knifeSharpnessPercent: 63 });
  expect(JSON.stringify(page)).not.toMatch(/foreign|grain-one|base-only/);
  const merged = normalizeCompanionPages({ pages: { rhmClogging: page } },
    { modules: loadModules() });
  expect(merged.pages.rhmClogging.rows).toHaveLength(1);
});

test("withholds uncertain totals for malformed or duplicate readings", () => {
  const malformed = runCompanionPage(FILE,
    SETUP.replace("0.63, true", "1.5, true"), { farmId: 1 });
  expect(malformed).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(malformed.byFarm).toBeUndefined();
  const unknownType = runCompanionPage(FILE,
    SETUP.replace('"grain", 0.72, true', '"unknown", 0.72, true'), { farmId: 1 });
  expect(unknownType).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(unknownType.byFarm).toBeUndefined();
  const duplicate = runCompanionPage(FILE,
    SETUP.replace('vehicle("grain-one", 1, "grain", 0.72, true)',
      'vehicle("forage-one", 1, "forage", 0.72, true)'), { farmId: 1 });
  expect(duplicate).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(Object.keys(duplicate.rows ?? {})).toHaveLength(0);
  expect(duplicate.byFarm).toBeUndefined();
});

test("gates unreviewed version and client state", () => {
  expect(runCompanionPage(FILE,
    SETUP.replace('version = "1.4.1.0"', 'version = "1.4.2.0"'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE,
    SETUP.replace("getIsServer = function() return true end",
      "getIsServer = function() return false end"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-knife-state-only" });
});
