"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "FinancialDashboardCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { KM_83516_Financial_Dashboard = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "KM_83516_Financial_Dashboard", version = "2.0.0.0" }
  } end }
  _G.KM_83516_Financial_Dashboard = { FinancialDashboard = {
    loadedSave = true, baselineInitialized = true,
    history = {
      { day = 12, balance = 1000, delta = 0 },
      { day = 12, balance = 950, delta = -50 },
    },
    daily = { [12] = { income = 0, outflow = 50, changes = 1,
      opening = 1000, closing = 950 } },
    recordBalance = function() error("reader must not sample") end,
    saveHistory = function() error("reader must not persist") end,
  } }
  _G.g_currentMission = {
    missionDynamicInfo = { isMultiplayer = false },
    isMissionStarted = true, getIsServer = function() return true end,
    player = { farmId = 1 }, environment = { currentDay = 12 },
  }
`;

test("reads local farm history as observations without invoking record or save hooks", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { sampleCount: 2, observedDays: 1,
      changedDays: 1, observedChanges: 1, lastSampleDay: 12,
      lastRecordedBalance: 950 } },
    recentDays: [{ farmId: 1, day: 12, observedInflow: 0,
      observedOutflow: 50, observedChanges: 1,
      openingBalance: 1000, closingBalance: 950 }],
  });
  expect(normalizeCompanionPages({ pages: { financialDashboardHistory: page } },
    { modules: loadModules() }).pages.financialDashboardHistory.recentDays).toHaveLength(1);
});

test("withholds history when the selected farm is not the local farm", () => {
  expect(runCompanionPage(FILE, SETUP, { farmId: 2 }))
    .toMatchObject({ readState: "settings-only", reason: "local-farm-mismatch" });
});

test("requires exact version, single player and loaded history", () => {
  expect(runCompanionPage(FILE,
    SETUP.replace('version = "2.0.0.0"', 'version = "2.0.0.1"'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE,
    SETUP.replace('isMultiplayer = false', 'isMultiplayer = true'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "single-player-only" });
  expect(runCompanionPage(FILE,
    SETUP.replace('loadedSave = true', 'loadedSave = false'), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "history-not-loaded" });
});

test("withholds malformed daily records and does not invent movements from a baseline", () => {
  expect(runCompanionPage(FILE,
    SETUP.replace('outflow = 50', 'outflow = -50'), { farmId: 1 }))
    .toMatchObject({ readState: "partial", reason: "invalid-daily-record" });
  const baseline = runCompanionPage(FILE,
    SETUP.replace('changes = 1', 'changes = 0').replace('delta = -50', 'delta = 0'),
    { farmId: 1 });
  expect(baseline).toMatchObject({ readState: "settings-only", reason: "no-observed-change" });
});

test("shows the newest 60 days while validating and counting the full captured window", () => {
  const setup = SETUP.replace('currentDay = 12', 'currentDay = 100') + `
    local fd = _G.KM_83516_Financial_Dashboard.FinancialDashboard
    fd.daily = {}
    for day = 1, 80 do
      fd.daily[day] = { income = day, outflow = 0, changes = 1,
        opening = 1000, closing = 1000 + day }
    end
  `;
  const page = runCompanionPage(FILE, setup, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { observedDays: 80, changedDays: 80 } } });
  expect(page.recentDays).toHaveLength(60);
  expect(page.recentDays[0].day).toBe(80);
  expect(page.recentDays[59].day).toBe(21);
});
