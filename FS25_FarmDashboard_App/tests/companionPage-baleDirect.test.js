"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "BaleDirectCollector.lua";
const GAME = `
  _G.g_modIsLoaded = { FS25_354119_Bale_Direct = true }
  local mission = { getIsServer = function() return true end }
  mission.baleDirect = { paymentSystem = {
    mission = mission, isInitialized = true,
    pendingSales = {
      [7] = { id = 7, farmId = 1, netProfit = 1425.75, baleCount = 3, saleYear = 4, deliveryType = 2 },
      [8] = { id = 8, farmId = 2, netProfit = 999999, baleCount = 5, saleYear = 4, deliveryType = 2 },
      [9] = { id = 9, farmId = 1, netProfit = 87.5, baleCount = 0, saleYear = 4, deliveryType = 2 },
    },
  } }
  _G.g_currentMission = mission
`;

test("exports only the selected farm's saved standard-delivery receivables", () => {
  const page = runCompanionPage(FILE, GAME, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { pendingCount: 2, pendingNetAmount: 1513.25 } },
    pending: [
      { farmId: 1, saleId: 7, netAmount: 1425.75, baleCount: 3, saleYear: 4 },
      { farmId: 1, saleId: 9, netAmount: 87.5, baleCount: 0, saleYear: 4 },
    ],
  });
  expect(JSON.stringify(page)).not.toContain("999999");
  const merged = normalizeCompanionPages({ pages: { baleDirect: page } }, { modules: loadModules() });
  expect(merged.pages.baleDirect.pending).toHaveLength(2);
});

test("withholds a client, uninitialized register and mismatched mission", () => {
  expect(runCompanionPage(FILE, GAME.replace("return true", "return false"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-register-only" });
  expect(runCompanionPage(FILE, GAME.replace("isInitialized = true", "isInitialized = false"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "pending-register-unavailable" });
  expect(runCompanionPage(FILE, GAME.replace("mission = mission, isInitialized", "mission = {}, isInitialized"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "pending-register-unavailable" });
  expect(runCompanionPage(FILE, GAME.replace("local mission = {", "local mission = { isMissionStarted = false,"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "world-not-started" });
  const newer = GAME + `
    _G.g_modManager = { getActiveMods = function() return {
      { modName = "FS25_354119_Bale_Direct", version = "9.9.9.9" }
    } end }
  `;
  expect(runCompanionPage(FILE, newer, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE, GAME.replace("FS25_354119_Bale_Direct = true", "OtherMod = true"), { farmId: 1 }))
    .toBeUndefined();
});

test("flags malformed own-farm entries without inventing a payout", () => {
  const bad = GAME.replace("netProfit = 87.5", "netProfit = 0/0");
  const page = runCompanionPage(FILE, bad, { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial", coverage: "partial", byFarm: { "1": {} } });
  expect(page.byFarm["1"]).not.toHaveProperty("pendingNetAmount");
  expect(page.byFarm["1"]).not.toHaveProperty("pendingCount");
  expect(page.pending).toHaveLength(1);
});
