"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "CryptoFarmCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_CryptoFarm = true }
  _G.g_currentMission = { getIsServer = function() return true end,
    missionDynamicInfo = { isMultiplayer = false } }
  _G.FS25_CryptoFarm = { g_cryptoFarm = {
    balances = { [1] = 420.25, [2] = 9800 }, rate = 1.75,
    getBalance = function() error("must not call mod methods") end,
    saveToDisk = function() error("must not write save") end,
  } }
`;

test("exports only this farm's positive saved coin balance and shared current rate", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { balanceCfc: 420.25, ratePerCfc: 1.75 } } });
  expect(page.reason).toBeUndefined();
  expect(JSON.stringify(page)).not.toMatch(/9800|payout|profit/);
  expect(normalizeCompanionPages({ pages: { cryptoFarm: page } }, { modules: loadModules() })
    .pages.cryptoFarm.byFarm["1"].balanceCfc).toBe(420.25);
});

test("treats an absent or zero farm balance as no meaningful holding", () => {
  const absent = SETUP.replace("[1] = 420.25, ", "");
  expect(runCompanionPage(FILE, absent, { farmId: 1 })).toMatchObject({
    readState: "settings-only", reason: "no-farm-balance",
  });
  const zero = SETUP.replace("[1] = 420.25", "[1] = 0");
  expect(runCompanionPage(FILE, zero, { farmId: 1 })).toMatchObject({
    readState: "settings-only", reason: "zero-balance",
  });
});

test("withholds multiplayer, client-only and unbound shadow balances", () => {
  expect(runCompanionPage(FILE, SETUP.replace("isMultiplayer = false", "isMultiplayer = true"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "multiplayer-sync-unproved" });
  expect(runCompanionPage(FILE, SETUP.replace("return true end", "return false end"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-register-only" });
  expect(runCompanionPage(FILE, SETUP.replace("_G.FS25_CryptoFarm = { g_cryptoFarm", "_G.shadow = { g_cryptoFarm"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "balance-register-unavailable" });
});
