"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "InvestmentSystemCollector.lua";
const GAME = `
  _G.g_modIsLoaded = { FS25_352944_Investment_System = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "FS25_352944_Investment_System", version = "1.1.0.0" }
  } end }
  _G.g_currentMission = { getIsServer = function() return true end }
  _G.FS25_352944_Investment_System = { g_bankManager = {
    getInvestmentsForFarm = function() error("must not call a manager helper") end,
    investments = {
      [1] = {
        { farmId = 1, id = 7, amount = 12000, originalAmount = 10000,
          annualRate = 4.5, isCompounding = true, termYears = 2,
          earnedInterest = 2000, depositMonth = 36, endMonth = 60 },
        { farmId = 2, id = 8, amount = 900000, annualRate = 5 },
      },
      [2] = { { farmId = 2, id = 9, amount = 6000, annualRate = 3.5,
        isCompounding = false, earnedInterest = 90 } },
    },
    totalEarned = { [1] = 2500, [2] = 90 },
  } }
`;

test("reads selected farm's saved investment and interest history only", () => {
  const page = runCompanionPage(FILE, GAME, { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial", coverage: "partial",
    byFarm: { "1": { totalEarnedAllTime: 2500 } } });
  expect(page.byFarm["1"].investmentCount).toBeUndefined();
  expect(page.rows).toHaveLength(1);
  expect(page.rows[0]).toMatchObject({ farmId: 1, id: 7, amount: 12000,
    annualRatePercent: 4.5, compounding: true, earnedInterest: 2000,
    depositMonth: 36, endMonth: 60 });
  const merged = normalizeCompanionPages({ pages: { investmentSystem: page } }, { modules: loadModules() });
  expect(merged.pages.investmentSystem.rows).toHaveLength(1);
});

test("other farm's register is separate; client and missing manager are withheld", () => {
  const other = runCompanionPage(FILE, GAME, { farmId: 2 });
  expect(other).toMatchObject({ readState: "ok", byFarm: { "2": { investmentCount: 1, totalEarnedAllTime: 90 } } });
  expect(other.rows[0].id).toBe(9);
  const client = GAME.replace("getIsServer = function() return true end", "getIsServer = function() return false end");
  expect(runCompanionPage(FILE, client, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-investments-only" });
  expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
});

test("does not read an investment manager shadow outside the loaded mod", () => {
  const shadow = GAME.replace("_G.FS25_352944_Investment_System = { g_bankManager = {", "_G.g_bankManager = {")
    .replace("  } }\n", "  }\n");
  expect(runCompanionPage(FILE, shadow, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "investment-manager-unavailable" });
});

test("historical interest remains meaningful after all deposits have matured", () => {
  const historical = GAME.replace(/\[1\] = \{\s*\{ farmId = 1[\s\S]*?\},\s*\{ farmId = 2[\s\S]*?\},\s*\},/, "[1] = {},");
  const page = runCompanionPage(FILE, historical, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", byFarm: { "1": { investmentCount: 0, totalEarnedAllTime: 2500 } } });
});

test("withholds investments from an unreviewed Investment System version", () => {
  const newer = GAME.replace('version = "1.1.0.0"', 'version = "1.1.0.1"');
  expect(runCompanionPage(FILE, newer, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
});

test("separates an incomplete register scan from a display-row limit", () => {
  const clean = GAME.replace("{ farmId = 2, id = 8, amount = 900000, annualRate = 5 },", "");
  const prefix = `local p = _G.FS25_352944_Investment_System.g_bankManager.investments[1]\n`;
  const append = `for i = 1, N do p[#p + 1] = {
    farmId = 1, id = i + 20, amount = 100, annualRate = 4,
  } end`;
  const capped = runCompanionPage(FILE, clean + prefix + append.replace("N", "101"), { farmId: 1 });
  expect(capped).toMatchObject({ readState: "partial", coverage: "truncated",
    byFarm: { "1": { totalEarnedAllTime: 2500 } } });
  expect(capped.byFarm["1"].investmentCount).toBeUndefined();
  const listed = runCompanionPage(FILE, clean + prefix + append.replace("N", "41"), { farmId: 1 });
  expect(listed).toMatchObject({ readState: "ok", coverage: "truncated",
    byFarm: { "1": { investmentCount: 42, totalEarnedAllTime: 2500 } } });
  expect(listed.rows).toHaveLength(40);
});
