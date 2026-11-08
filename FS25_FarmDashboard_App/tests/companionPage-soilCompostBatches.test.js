"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "SoilCompostBatchesCollector.lua";
const GAME = `
  _G.g_modIsLoaded = { FS25_SoilFertilizer = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "FS25_SoilFertilizer", version = "2.6.0.3" }
  } end }
  _G.g_currentMission = { getIsServer = function() return true end,
    compostManager = { batches = {
      [7] = { batchId = 7, farmId = 1, totalDays = 14, daysRemaining = 5,
        outputLitres = 450, ready = false, organicSafe = true },
      [8] = { batchId = 8, farmId = 1, totalDays = 14, daysRemaining = 0,
        outputLitres = 120, ready = true, organicSafe = false },
      [9] = { batchId = 9, farmId = 2, totalDays = 21, daysRemaining = 0,
        outputLitres = 900, ready = true, organicSafe = true },
    } },
  }
`;

test("exports only this farm's open compost batches and expected output", () => {
  const page = runCompanionPage(FILE, GAME, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { batchCount: 2, readyCount: 1, expectedOutputLitres: 570 } } });
  expect(page.rows).toEqual([
    { farmId: 1, batchId: 7, totalDays: 14, daysRemaining: 5,
      outputLitres: 450, ready: false, organicSafe: true },
    { farmId: 1, batchId: 8, totalDays: 14, daysRemaining: 0,
      outputLitres: 120, ready: true, organicSafe: false },
  ]);
  expect(JSON.stringify(page)).not.toContain("900");
  const merged = normalizeCompanionPages({ pages: { soilCompostBatches: page } }, { modules: loadModules() });
  expect(merged.pages.soilCompostBatches.rows).toHaveLength(2);
});

test("withholds totals when an owned batch is invalid", () => {
  const page = runCompanionPage(FILE, GAME.replace("daysRemaining = 5", "daysRemaining = -1"), { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial", coverage: "partial", reason: "invalid-owned-batch" });
  expect(page.byFarm).toBeUndefined();
  expect(page.rows).toHaveLength(1);
});

test("rejects unreviewed versions and client-only state", () => {
  const old = runCompanionPage(FILE, GAME.replace('version = "2.6.0.3"', 'version = "2.6.0.4"'), { farmId: 1 });
  expect(old).toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  const client = runCompanionPage(FILE, GAME.replace("getIsServer = function() return true end", "getIsServer = function() return false end"), { farmId: 1 });
  expect(client).toMatchObject({ readState: "settings-only", reason: "server-batch-state-only" });
});

test("does not read a shadow manager outside the mission bridge", () => {
  const page = runCompanionPage(FILE, GAME.replace("compostManager = { batches = {", "otherManager = { batches = {"), { farmId: 1 });
  expect(page).toMatchObject({ readState: "settings-only", reason: "no-compost-register" });
});
