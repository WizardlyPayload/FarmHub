"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "DieselFuelSystemCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_GNRealism_FuelSystem = true }
  _G.g_currentMission = { getIsServer = function() return true end,
    vehicleSystem = { vehicles = {
      { ownerFarmId = 1, uniqueId = "own-tractor", getFullName = function() return "MF 8570" end,
        ["spec_FS25_GNRealism_FuelSystem.scFuel"] = {
          activo = true, fillUnitDiesel = 2, filtro = { horas = 34.5, obstruccion = 0.25 },
          trampa = 0.75, aire = true, lotes = { [2] = { ageDays = 15, oxidation = 0.12 } },
        } },
      { ownerFarmId = 1, uniqueId = "own-harvester", spec_scFuel = {
          activo = true, fillUnitDiesel = 1, filtro = { horas = 3, obstruccion = 0 },
          trampa = 0, lotes = { [1] = { ageDays = 1, oxidation = 0 } },
        } },
      { ownerFarmId = 2, uniqueId = "foreign", spec_scFuel = {
          activo = true, fillUnitDiesel = 1, filtro = { horas = 900, obstruccion = 1 },
          trampa = 9, lotes = { [1] = { ageDays = 90, oxidation = 1 } },
        } },
      { ownerFarmId = 1, uniqueId = "electric", spec_scFuel = { activo = false, filtro = {} } },
    } } }
  _G.FS25_GNRealism_FuelSystem = { SCVehicle = {
    getSpec = function() error("must not mutate missing state") end,
  } }
`;

test("reads nonzero condition from this farm's active diesel vehicles only", () => {
    const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
    expect(page).toMatchObject({ readState: "ok", coverage: "complete",
        byFarm: { "1": { vehicleCount: 2, waterTrapCount: 1, airInLineCount: 1 } } });
    expect(page.rows).toHaveLength(2);
    expect(page.rows.find((row) => row.vehicleId === "own-tractor")).toMatchObject({
        filterHours: 34.5, filterBlockagePct: 25, trapWaterLitres: 0.75,
        fuelAgeDays: 15, oxidationPct: 12, airInLine: true,
    });
    expect(JSON.stringify(page)).not.toMatch(/foreign|electric|900/);
    const merged = normalizeCompanionPages({ pages: { dieselFuelSystem: page } }, { modules: loadModules() });
    expect(merged.pages.dieselFuelSystem.rows).toHaveLength(2);
});

test("withholds a client-only or missing owned vehicle list", () => {
    const client = SETUP.replace("getIsServer = function() return true end", "getIsServer = function() return false end");
    expect(runCompanionPage(FILE, client, { farmId: 1 }))
        .toMatchObject({ readState: "settings-only", reason: "server-vehicle-state-only" });
    expect(runCompanionPage(FILE, SETUP.replace("vehicleSystem = { vehicles = {", "vehicleSystem = { vehicles = nil, unused = {"), { farmId: 1 }))
        .toMatchObject({ readState: "settings-only", reason: "no-owned-vehicle-list" });
    expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
});
