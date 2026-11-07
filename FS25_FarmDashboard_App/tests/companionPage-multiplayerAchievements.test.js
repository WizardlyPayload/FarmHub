"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");
const FILE = "MultiplayerAchievementsCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_MultiplayerAchievements = true }
  _G.g_server = {}
  _G.g_currentMission = {
    missionDynamicInfo = { isMultiplayer = true }, gameStarted = true,
    getIsServer = function() return true end,
  }
  _G.g_farmManager = {
    getFarmById = function(self, id)
      local farms = {
        [1] = {farmId=1, money=1000, mpaLedger={
          balance=1200, peak=1800, cows=3, sheep=2, pigs=1, chickens=4}},
        [2] = {farmId=2, money=800, mpaLedger={
          balance=700, peak=900, cows=50, sheep=40, pigs=30, chickens=20}},
      }
      return farms[id]
    end,
  }
  _G.FS25_MultiplayerAchievements = {
    MPAchievementShared = {getLedger = function() error('mutating getter called') end},
  }
`;

test("reads only the requested farm ledger without mutating it", () => {
  const page = runCompanionPage(FILE, SETUP, {farmId:1});
  expect(page).toMatchObject({readState:"ok",coverage:"complete",
    byFarm:{"1":{eligibleBalance:1000,eligiblePeak:1800,
      eligibleCowsBred:3,eligibleSheepBred:2,eligiblePigsBred:1,
      eligibleChickensBred:4}}});
  expect(JSON.stringify(page)).not.toMatch(/"2"|50|40|30|20/);
  const merged = normalizeCompanionPages({pages:{multiplayerAchievements:page}},
    {modules:loadModules()});
  expect(merged.pages.multiplayerAchievements.byFarm["1"].eligiblePeak).toBe(1800);
});

test("withholds single-player, client and missing ledger states", () => {
  const single = SETUP.replace("isMultiplayer = true", "isMultiplayer = false");
  expect(runCompanionPage(FILE, single, {farmId:1}))
    .toMatchObject({readState:"settings-only",reason:"active-multiplayer-server-only"});
  const client = SETUP.replace("getIsServer = function() return true end",
    "getIsServer = function() return false end");
  expect(runCompanionPage(FILE, client, {farmId:1}))
    .toMatchObject({readState:"settings-only",reason:"active-multiplayer-server-only"});
  const missing = SETUP.replace("[1] = {farmId=1, money=1000, mpaLedger={",
    "[1] = {farmId=1, money=1000, noLedger={");
  expect(runCompanionPage(FILE, missing, {farmId:1}))
    .toMatchObject({readState:"settings-only",reason:"ledger-not-captured"});
});

test("rejects wrong-farm and malformed counters", () => {
  const wrong = SETUP.replace("[1] = {farmId=1, money=1000", "[1] = {farmId=2, money=1000");
  expect(runCompanionPage(FILE, wrong, {farmId:1}))
    .toMatchObject({readState:"settings-only",reason:"farm-not-ready"});
  const malformed = SETUP.replace("cows=3, sheep=2", "cows=-3, sheep=2");
  expect(runCompanionPage(FILE, malformed, {farmId:1}))
    .toMatchObject({readState:"settings-only",reason:"malformed-ledger"});
});
