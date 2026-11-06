"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "RealFuelConsumptionCollector.lua";
const GAME = `
  _G.g_modIsLoaded = { FS25_RealFuelConsumption = true }
  _G.g_currentMission = { vehicleSystem = { vehicles = {
    { ownerFarmId = 1, uniqueId = "owned", getFullName = function() return "My tractor" end,
      spec_rfcEngineModes = { rfcStats = {
        totalLiters = 42.5, totalSeconds = 7200,
        sessionLiters = 2.5, sessionSeconds = 600,
        secondsByMode = { 3600, 2400, 1200 },
      } },
      saveToXMLFile = function() error("must not save") end },
    { ownerFarmId = 2, uniqueId = "foreign", spec_rfcEngineModes = { rfcStats = {
      totalLiters = 999, totalSeconds = 9999,
    } } },
    { ownerFarmId = 1, uniqueId = "unused", spec_rfcEngineModes = { rfcStats = {
      totalLiters = 0, totalSeconds = 0,
    } } },
  } } }
  _G.RFCReport = { getStats = function() error("must not initialize stats") end,
    buildData = function() error("must not run report") end }
`;

test("reads only positive farm-owned usage counters without invoking the third-party report", () => {
  const page = runCompanionPage(FILE, GAME, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete" });
  expect(page.reason).toBeUndefined();
  expect(page.byFarm["1"]).toMatchObject({ vehicleCount: 1, totalLiters: 42.5, totalSeconds: 7200 });
  expect(page.rows).toHaveLength(1);
  expect(page.rows[0]).toMatchObject({
    vehicleId: "owned", vehicle: "My tractor", totalLiters: 42.5, totalSeconds: 7200,
    sessionLiters: 2.5, sessionSeconds: 600,
    secondsEco: 3600, secondsNormal: 2400, secondsPower: 1200,
  });
  const merged = normalizeCompanionPages({ pages: { realFuelConsumption: page } }, { modules: loadModules() });
  expect(merged.pages.realFuelConsumption.rows).toHaveLength(1);
});

test("no captured engine time is explicitly a settings-only state", () => {
  const game = GAME.replace("totalSeconds = 7200", "totalSeconds = 0");
  const page = runCompanionPage(FILE, game, { farmId: 1 });
  expect(page.readState).toBe("settings-only");
  expect(page.reason).toBe("no-captured-owned-vehicle");
  expect(page.byFarm["1"].vehicleCount).toBe(0);
});

test("without the exact mod, no companion page is emitted", () => {
  expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
});
