"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");

const FILE = "FairLeasingPlusCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_356407_Fair_Leasing_Plus = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "FS25_356407_Fair_Leasing_Plus", version = "1.0.0.0" }
  } end }
  _G.g_currentMission = {
    getFarmId = function() return 1 end,
    getIsServer = function() return true end,
  }
  _G.FS25_356407_Fair_Leasing_Plus = { FairLeasingPlus = {
    rewards = { farms = {
      [1] = { points = 12, returnsCount = 5, cleanReturns = 3,
              fullTankReturns = 2, savedMoney = 1234.56 },
      [2] = { points = 160, returnsCount = 20, cleanReturns = 18,
              fullTankReturns = 19, savedMoney = 99999 },
    } },
    settings = { baseDiscount = 0.10, dayDiscount = 0.05, hourDiscount = 0.08 },
  } }
`;

test("reads only this farm's returns, rank and explicitly estimated upfront saving", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page.readState).toBe("ok");
  expect(Object.keys(page.byFarm)).toEqual(["1"]);
  expect(page.byFarm["1"]).toMatchObject({
    returnsCount: 5, points: 12, cleanReturns: 3, fullTankReturns: 2,
    estimatedUpfrontSaving: 1234.56, rank: "BRONZE", bonusDiscountPercent: 5,
    baseDiscountPercent: 15, dayDiscountPercent: 10, hourDiscountPercent: 13,
  });
  expect(JSON.stringify(page)).not.toContain("99999");
});

test("withholds zero, invalid and client-side reward state", () => {
  const emptySetup = SETUP.replace("points = 12, returnsCount = 5, cleanReturns = 3,", "points = 0, returnsCount = 0, cleanReturns = 0,")
    .replace("fullTankReturns = 2, savedMoney = 1234.56", "fullTankReturns = 0, savedMoney = 0");
  const empty = runCompanionPage(FILE, emptySetup, { farmId: 1 });
  expect(empty).toMatchObject({ readState: "settings-only", reason: "no-return-history" });
  expect(empty.byFarm).toBeUndefined();
  const invalid = runCompanionPage(FILE, SETUP.replace("savedMoney = 1234.56", "savedMoney = -4"), { farmId: 1 });
  expect(invalid).toMatchObject({ readState: "partial", reason: "invalid-reward-state" });
  const client = runCompanionPage(FILE, SETUP.replace("getIsServer = function() return true", "getIsServer = function() return false"), { farmId: 1 });
  expect(client).toMatchObject({ readState: "settings-only", reason: "server-rewards-only" });
});
