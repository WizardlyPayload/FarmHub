"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "RitterFreshLossCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_Fresh = true }
  _G.g_currentMission = { getIsServer = function() return true end }
  _G.FS25_Fresh = {
    RmFreshManager = { initialized = true },
    RmLossTracker = { lossLog = {
      { farmId = 1, year = 2, period = 6, dayInPeriod = 3, hour = 14,
        fillTypeName = "TOMATO", amount = 125.5, value = 36.2, location = "Farm silo" },
      { farmId = 2, year = 2, period = 6, dayInPeriod = 3, hour = 15,
        fillTypeName = "WHEAT", amount = 800, value = 100, location = "Foreign silo" },
      { farmId = 0, year = 2, period = 6, dayInPeriod = 3, hour = 16,
        fillTypeName = "BARLEY", amount = 50, value = 10, location = "Ownerless" },
      { farmId = 1, year = 2, period = 6, dayInPeriod = 4, hour = 8,
        fillTypeName = "LETTUCE", amount = 25, value = 0, location = "Greenhouse" },
    } },
  }
`;

test("shows only the selected farm's valid log rows, newest first", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { loggedLossCountScanned: 2, lostLitresScanned: 150.5 } } });
  expect(page.rows).toHaveLength(2);
  expect(page.rows[0]).toMatchObject({ fillTypeName: "LETTUCE", amountLitres: 25,
    year: 2, period: 6, dayInPeriod: 4, hour: 8 });
  expect(page.rows[0].estimatedValue).toBeUndefined();
  expect(page.rows[1]).toMatchObject({ fillTypeName: "TOMATO", amountLitres: 125.5,
    estimatedValue: 36.2 });
  expect(JSON.stringify(page)).not.toMatch(/Foreign silo|Ownerless|WHEAT|BARLEY/);
  const merged = normalizeCompanionPages({ pages: { ritterFreshLoss: page } }, { modules: loadModules() });
  expect(merged.pages.ritterFreshLoss.rows).toHaveLength(2);
});

test("labels incomplete history and rejects malformed exact-farm rows", () => {
  const setup = SETUP.replace("    } },\n  }", `
      { farmId = 1, year = 2, period = 14, dayInPeriod = 1, hour = 3,
        fillTypeName = "BAD", amount = 9, value = 5, location = "Invalid" },
    } },
  }`);
  const partial = runCompanionPage(FILE, setup, { farmId: 1 });
  expect(partial).toMatchObject({ readState: "partial", coverage: "partial",
    byFarm: { "1": { loggedLossCountScanned: 2, lostLitresScanned: 150.5 } } });
  expect(JSON.stringify(partial)).not.toContain("Invalid");

  const many = `
    _G.g_modIsLoaded = { FS25_Fresh = true }
    _G.g_currentMission = { getIsServer = function() return true end }
    local log = {}
    for i=1,45 do log[i] = { farmId=1, year=2, period=6,
      dayInPeriod=1, hour=0, fillTypeName="TOMATO", amount=10, value=2 } end
    _G.FS25_Fresh = { RmFreshManager={initialized=true}, RmLossTracker={lossLog=log} }
  `;
  const truncated = runCompanionPage(FILE, many, { farmId: 1 });
  expect(truncated).toMatchObject({ readState: "ok", coverage: "truncated",
    byFarm: { "1": { loggedLossCountScanned: 45, lostLitresScanned: 450 } } });
  expect(truncated.rows).toHaveLength(40);

  const longLog = `
    _G.g_modIsLoaded = { FS25_Fresh = true }
    _G.g_currentMission = { getIsServer = function() return true end }
    local log = { { farmId=1, year=2, period=6, dayInPeriod=1, hour=0,
      fillTypeName="OLD", amount=100, value=20 } }
    for i=2,2001 do log[i] = { farmId=2, year=2, period=6,
      dayInPeriod=1, hour=0, fillTypeName="FOREIGN", amount=10, value=2 } end
    _G.FS25_Fresh = { RmFreshManager={initialized=true}, RmLossTracker={lossLog=log} }
  `;
  const windowed = runCompanionPage(FILE, longLog, { farmId: 1 });
  expect(windowed).toMatchObject({ readState: "ok", coverage: "truncated",
    byFarm: { "1": { loggedLossCountScanned: 0, lostLitresScanned: 0 } } });
  expect(JSON.stringify(windowed)).not.toMatch(/OLD|FOREIGN/);
});

test("withholds client, unready manager and absent mod", () => {
  const client = SETUP.replace("getIsServer = function() return true end",
    "getIsServer = function() return false end");
  expect(runCompanionPage(FILE, client, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-log-only" });
  const unready = SETUP.replace("initialized = true", "initialized = false");
  expect(runCompanionPage(FILE, unready, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "log-not-ready" });
  expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
});
