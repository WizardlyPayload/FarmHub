"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "ImplementMaintenanceCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_GN_MantenimientoImplementos = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "FS25_GN_MantenimientoImplementos", version = "1.1.0.0" }
  } end }
  _G.FS25_GN_MantenimientoImplementos = { MIWearGroups = {
    applies = function(categories, key) return categories[key] == true end
  } }
  local function machine(id, owner)
    return { uniqueId = id, getOwnerFarmId = function() return owner end,
      getFullName = function() return "Cultivator " .. id end,
      spec_gnImplementMaintenance = {
        operatingHours = 14.25, hoursSinceGrease = 2.5,
        hoursSinceGeneralService = 10,
        categories = { contacto = true, transmision = true,
          greaseIntervalHours = 50 },
        greaseType = "none", greaseDurationHours = 0,
        wear = { contacto = 0.275, transmision = 0.1 },
        partQuality = { contacto = 1, transmision = 2 },
        serviceLog = { { dia = 42, mes = 5, horas = 12,
          grupo = "contacto", calidad = 2, cantidad = 1 } },
      } }
  end
  _G.g_currentMission = { getIsServer = function() return true end,
    vehicleSystem = { vehicles = { machine("owned", 1), machine("foreign", 2) } } }
`;

test("exports applicable current wear and saved service entries on owned implements", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { vehicleCount: 1, serviceCount: 1 } } });
  expect(page.rows).toEqual([expect.objectContaining({
    vehicleId: "owned", operatingHours: 14.25, hoursSinceGrease: 2.5,
    greaseThresholdHours: 50,
    groups: [
      { key: "contacto", wearPercent: 27.5, quality: "generic" },
      { key: "transmision", wearPercent: 10, quality: "original" },
    ],
    services: [{ day: 42, period: 5, meterHours: 12,
      group: "contacto", quality: "original", quantity: 1 }],
  })]);
  expect(JSON.stringify(page)).not.toContain("foreign");
  const merged = normalizeCompanionPages({ pages: { implementMaintenance: page } },
    { modules: loadModules() });
  expect(merged.pages.implementMaintenance.rows).toHaveLength(1);
});

test("uses the current greased interval and withholds an invalid threshold", () => {
  const greased = runCompanionPage(FILE,
    SETUP.replace('greaseType = "none", greaseDurationHours = 0',
      'greaseType = "premium", greaseDurationHours = 75'), { farmId: 1 });
  expect(greased.rows[0].greaseThresholdHours).toBe(75);
  const noGrease = runCompanionPage(FILE,
    SETUP.replace('greaseIntervalHours = 50', 'greaseIntervalHours = 0'),
    { farmId: 1 });
  expect(noGrease.rows[0]).not.toHaveProperty("greaseThresholdHours");
  const invalid = runCompanionPage(FILE,
    SETUP.replace('greaseIntervalHours = 50', 'greaseIntervalHours = -1'),
    { farmId: 1 });
  expect(invalid).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(invalid.byFarm["1"]).not.toHaveProperty("vehicleCount");
});

test("withholds counts for malformed wear and duplicate vehicle identity", () => {
  const bad = runCompanionPage(FILE,
    SETUP.replace("contacto = 0.275", "contacto = 1.275"), { farmId: 1 });
  expect(bad).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(bad.byFarm["1"]).not.toHaveProperty("vehicleCount");
  const duplicate = runCompanionPage(FILE,
    SETUP.replace('machine("foreign", 2)', 'machine("owned", 1)'), { farmId: 1 });
  expect(duplicate).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(Object.keys(duplicate.rows)).toHaveLength(0);
});

test("gates unreviewed version, client, and absent mod", () => {
  expect(runCompanionPage(FILE,
    SETUP.replace('version = "1.1.0.0"', 'version = "1.1.0.1"'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE,
    SETUP.replace('getIsServer = function() return true end',
      'getIsServer = function() return false end'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-implement-state-only" });
  expect(runCompanionPage(FILE, '_G.g_modIsLoaded = {}', { farmId: 1 })).toBeUndefined();
});
