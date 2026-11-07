"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "RentYourFieldCollector.lua";
const GAME = `
  _G.g_modIsLoaded = { FS25_356641_Rent_Your_Field = true }
  _G.g_farmlandManager = {
    farmlands = {
      [36] = { price = 120000 }, [37] = { price = 80000 },
      [38] = { price = 50000 }, [40] = { price = 30000 },
    },
    owners = { [36] = 0, [37] = 0, [38] = 2, [40] = 0 },
    getFarmlandById = function(self, id) return self.farmlands[id] end,
    getFarmlandOwner = function(self, id) return self.owners[id] end,
  }
  _G.g_rentYourFieldManager = {
    minDuration = 12, monthlyIncomePercent = 2,
    terminationPenaltyPercent = 50,
    rentAgreements = {
      [36] = { farmlandId = 36, farmId = 1, duration = 3 },
      [37] = { farmlandId = 37, farmId = 2, duration = 1 },
      [38] = { farmlandId = 38, farmId = 1, duration = 1 },
      [39] = { farmlandId = 40, farmId = 1, duration = 1 },
    },
    getMonthlyIncome = function(self, id)
      return g_farmlandManager:getFarmlandById(id).price * self.monthlyIncomePercent / 100
    end,
    getTerminationPenalty = function(self, id)
      local a = self.rentAgreements[id]
      if a.duration == 0 or a.duration >= self.minDuration then return 0 end
      return self:getMonthlyIncome(id) * (self.minDuration - a.duration) * self.terminationPenaltyPercent / 100
    end,
  }
  _G.g_currentMission = {
    getFarmId = function() return 1 end,
    getIsServer = function() return true end,
    isMissionStarted = true,
  }
`;

test("reads exact-farm rental despite native no-owner and labels projected money", () => {
  const page = runCompanionPage(FILE, GAME, { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial", coverage: "partial" });
  expect(page.byFarm["1"]).toMatchObject({ activeCount: 1, projectedMonthlyRent: 2400 });
  expect(page.rows).toEqual([expect.objectContaining({
    farmId: 1, farmlandId: 36, elapsedMonths: 3, minimumMonths: 12,
    remainingMinimumMonths: 9, projectedMonthlyRent: 2400,
    estimatedTerminationPenalty: 10800,
  })]);
  const merged = normalizeCompanionPages({ pages: { rentYourField: page } }, { modules: loadModules() });
  expect(merged.pages.rentYourField.rows).toHaveLength(1);
});

test("does not treat an empty register as a verified saved zero", () => {
  const game = GAME.replace(/rentAgreements = \{[\s\S]*?\n    \},/, "rentAgreements = {},");
  const page = runCompanionPage(FILE, game, { farmId: 1 });
  expect(page).toMatchObject({ readState: "settings-only", reason: "no-confirmed-farm-rentals" });
  expect(page.byFarm).toBeUndefined();
});

test("withholds client, unstarted world and absent mod", () => {
  expect(runCompanionPage(FILE, GAME.replace("getIsServer = function() return true end", "getIsServer = function() return false end"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-state-only" });
  expect(runCompanionPage(FILE, GAME.replace("isMissionStarted = true", "isMissionStarted = false"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "world-not-started" });
  expect(runCompanionPage(FILE, GAME.replace("FS25_356641_Rent_Your_Field = true", "OtherMod = true"), { farmId: 1 }))
    .toBeUndefined();
});
