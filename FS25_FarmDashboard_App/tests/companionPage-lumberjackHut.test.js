"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "LumberjackHutCollector.lua";
const LIVE = `
  _G.g_modIsLoaded = { KM_83343_Lumberjack_Hut = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "KM_83343_Lumberjack_Hut", version = "1.0.0.1" }
  } end }
  _G.g_currentMission = {
    getIsServer = function() return true end,
    placeableSystem = { placeables = {
      { id = 101, ownerFarmId = 1, getName = function() return "North Hut" end,
        spec_lumberjackHut = { farmlandId = 36, pendingLiters = 625.75,
          cycleProgress = 0.5, autoSuspended = false } },
      { id = 102, ownerFarmId = 1, getName = function() return "South Hut" end,
        spec_lumberjackHut = { farmlandId = 36, pendingLiters = 12.25,
          cycleProgress = 0.25, autoSuspended = true } },
      { id = 103, ownerFarmId = 2, getName = function() return "Other farm" end,
        spec_lumberjackHut = { farmlandId = 37, pendingLiters = 5000,
          cycleProgress = 0.9, autoSuspended = false } },
    } },
  }
`;

test("reads only owned hut credit and does not duplicate a shared farmland inventory", () => {
  const page = runCompanionPage(FILE, LIVE, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete" });
  expect(page.byFarm["1"]).toEqual({ hutCount: 2, autoSuspendedCount: 1, pendingLitres: 638 });
  expect(page.rows).toHaveLength(2);
  expect(page.rows[0]).toMatchObject({ site: "North Hut", farmlandId: 36,
    pendingLitres: 625.75, cycleProgressPercent: 50 });
  expect(JSON.stringify(page)).not.toMatch(/Other farm|5000|trees|sales|income/);
  const merged = normalizeCompanionPages({ pages: { lumberjackHut: page } }, { modules: loadModules() });
  expect(merged.pages.lumberjackHut.byFarm["1"].pendingLitres).toBe(638);
});

test("withholds totals on invalid owned state and rejects unreviewed or client state", () => {
  const invalid = LIVE.replace("pendingLiters = 12.25", "pendingLiters = -12.25");
  const page = runCompanionPage(FILE, invalid, { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(page.byFarm["1"].pendingLitres).toBeUndefined();
  expect(page.rows).toHaveLength(1);
  for (const [source, reason] of [
    [LIVE.replace('version = "1.0.0.1"', 'version = "2.0.0.0"'), "unreviewed-version"],
    [LIVE.replace("getIsServer = function() return true end", "getIsServer = function() return false end"), "server-state-only"],
  ]) {
    expect(runCompanionPage(FILE, source, { farmId: 1 })).toMatchObject({
      readState: "settings-only", reason,
    });
  }
});
