"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "LandFinancingCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { ["KM_82121_land-financing"] = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "KM_82121_land-financing", version = "30.0.0.0" }
  } end }
  _G["KM_82121_land-financing"] = { g_landFinancingManager = {
    loans = {
      { id = 3, farmlandId = 36, farmId = 1, price = 250000, down = 50000,
        principal = 200000, balance = 180000.25, months = 48, remaining = 42,
        annualRate = 5, payment = 4605.23 },
      { id = 4, farmlandId = 21, farmId = 2, price = 100000, down = 0,
        principal = 100000, balance = 100000, months = 24, remaining = 24,
        annualRate = 2, payment = 4254.04 },
    }
  } }
  _G.g_currentMission = { missionDynamicInfo = { isMultiplayer = false },
    player = { farmId = 1 }, isMissionStarted = true,
    getIsServer = function() return true end }
`;

test("reads exact farm's active loan terms and outstanding balance", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { loanCount: 1, outstandingBalance: 180000.25 } } });
  expect(page.rows).toEqual([expect.objectContaining({
    farmId: 1, id: 3, farmlandId: 36, originalPrice: 250000,
    downPayment: 50000, principal: 200000, balance: 180000.25,
    scheduledInstallment: 4605.23, termMonths: 48,
    remainingMonths: 42, annualRatePercent: 5,
  })]);
  const merged = normalizeCompanionPages({ pages: { landFinancing: page } },
    { modules: loadModules() });
  expect(merged.pages.landFinancing.rows).toHaveLength(1);
  expect(JSON.stringify(page)).not.toContain("100000");
});

test("withholds totals and malformed or ambiguous rows", () => {
  const bad = runCompanionPage(FILE,
    SETUP.replace("balance = 180000.25", "balance = -1"), { farmId: 1 });
  expect(bad).toMatchObject({ readState: "partial", coverage: "partial",
    reason: "invalid-loan-record" });
  expect(bad.byFarm["1"]).not.toHaveProperty("outstandingBalance");
  expect(Object.keys(bad.rows)).toHaveLength(0);
  const unknown = runCompanionPage(FILE,
    SETUP.replace("farmlandId = 21, farmId = 2", "farmlandId = 21, farmId = nil"), { farmId: 1 });
  expect(unknown).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(unknown.rows).toHaveLength(1);
  expect(unknown.byFarm["1"]).not.toHaveProperty("loanCount");
  const duplicate = runCompanionPage(FILE,
    SETUP.replace("id = 4, farmlandId = 21, farmId = 2",
      "id = 3, farmlandId = 36, farmId = 1"), { farmId: 1 });
  expect(duplicate).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(Object.keys(duplicate.rows)).toHaveLength(0);
});

test("rejects unreviewed version, multiplayer, client and wrong local farm", () => {
  expect(runCompanionPage(FILE,
    SETUP.replace('version = "30.0.0.0"', 'version = "30.0.0.1"'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE,
    SETUP.replace("isMultiplayer = false", "isMultiplayer = true"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "single-player-only" });
  expect(runCompanionPage(FILE,
    SETUP.replace("getIsServer = function() return true end",
      "getIsServer = function() return false end"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-world-not-ready" });
  expect(runCompanionPage(FILE,
    SETUP.replace("player = { farmId = 1 }", "player = { farmId = 2 }"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "local-farm-mismatch" });
});
