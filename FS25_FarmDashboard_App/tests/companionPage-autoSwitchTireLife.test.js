"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "AutoSwitchTireLifeCollector.lua";
const GAME = `
  _G.g_modIsLoaded = { KM_82844_AutoSwitch = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "KM_82844_AutoSwitch", version = "1.0.3.0" }
  } end }
  local own = { ownerFarmId = 1, uniqueId = "owned-live", getFullName = function() return "Owned tractor" end,
    spec_wheels = { wheels = { { __asWear = 0.25 }, { __asWear = 0.4, __asCut = true } } } }
  local waiting = { ownerFarmId = 1, uniqueId = "owned-pending", getName = function() return "Stored tractor" end }
  local foreign = { ownerFarmId = 2, uniqueId = "foreign", getName = function() return "Foreign tractor" end }
  local stale = { ownerFarmId = 1, uniqueId = "stale", getOwnerFarmId = function() return 2 end }
  _G.g_currentMission = { getIsServer = function() return true end,
    vehicleSystem = { vehicles = { own, waiting, foreign, stale } } }
  _G.AS_TireLife = { active = true, ENABLED = true,
    vehicles = { [own] = { cfg = 1, sets = { [1] = { 0.1, 0.2 }, [2] = { 10.3, 0.4 } } },
      [foreign] = { cfg = 1, sets = { [1] = { 0.99 } } } },
    pending = { ["owned-pending"] = { sets = { [3] = { 0.6 } } },
      ["stale"] = { sets = { [1] = { 0.88 } } } } }
`;

test("exports live and saved wheel configurations only for current farm-owned vehicles", () => {
  const page = runCompanionPage(FILE, GAME, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { shownWheelReadings: 5 } } });
  expect(page.rows).toHaveLength(5);
  expect(page.rows).toEqual(expect.arrayContaining([
    expect.objectContaining({ vehicleId: "owned-live", wheelConfiguration: 1, wheelIndex: 1,
      wearPct: 25, cut: false, reading: "live" }),
    expect.objectContaining({ vehicleId: "owned-live", wheelConfiguration: 1, wheelIndex: 2,
      wearPct: 40, cut: true, reading: "live" }),
    expect.objectContaining({ vehicleId: "owned-live", wheelConfiguration: 2, wheelIndex: 1,
      wearPct: 30, cut: true, reading: "saved" }),
    expect.objectContaining({ vehicleId: "owned-pending", wheelConfiguration: 3, wheelIndex: 1,
      wearPct: 60, reading: "saved" }),
  ]));
  expect(JSON.stringify(page)).not.toMatch(/foreign|stale|99|88/);
  const merged = normalizeCompanionPages({ pages: { autoSwitchTireLife: page } }, { modules: loadModules() });
  expect(merged.pages.autoSwitchTireLife.rows).toHaveLength(5);
});

test("withholds client, inactive, unreviewed and absent tire state", () => {
  expect(runCompanionPage(FILE, GAME.replace("return true end,", "return false end,"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-state-only" });
  expect(runCompanionPage(FILE, GAME.replace("active = true", "active = false"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "tire-module-inactive" });
  expect(runCompanionPage(FILE, GAME.replace("1.0.3.0", "9.9.9.9"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
});
