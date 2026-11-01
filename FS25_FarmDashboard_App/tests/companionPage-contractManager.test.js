"use strict";

const { runCompanionPage, runCompanionLua } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "ContractManagerCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_ContractManager = true }
  _G.g_currentMission = { getIsServer = function() return true end }
  _G.FS25_ContractManager = { ContractManagerRegistry = {
    active = {
      a = { id = "a", farmId = 1, typeName = "harvest", fieldId = 36,
        rewardAtAccept = 1300, acceptedDay = 22 },
      b = { id = "b", farmId = 2, typeName = "mow", rewardAtAccept = 3000 },
    },
    history = {
      { id = "old", farmId = 1, typeName = "fertilize", fieldId = 4,
        reward = 500, payout = 450, finishedDay = 18 },
      { id = "foreign", farmId = 2, typeName = "harvest", payout = 9000 },
      { id = "recent", farmId = 1, typeName = "sow", fieldId = 9,
        reward = 700, finishedDay = 21 },
    },
    stats = {
      [1] = { completed = 1, failed = 1, earned = 450,
        penalties = 20, reputation = 12, failStreak = 1 },
      [2] = { completed = 20, earned = 9000 },
    },
    getFarmStats = function() error("must not be called") end,
  } }
`;

test("reads only this farm's server ledger without treating offers as payouts", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { activeCount: 1, historyCount: 2,
      stats: { completed: 1, failed: 1, earned: 450, penalties: 20 } } } });
  expect(page.reason).toBeUndefined();
  expect(page.active).toEqual([expect.objectContaining({ id: "a", offeredReward: 1300 })]);
  expect(page.active[0].payout).toBeUndefined();
  expect(page.history.map((x) => x.id)).toEqual(["recent", "old"]);
  expect(page.history[0].payout).toBeUndefined();
  expect(page.history[1].payout).toBe(450);
  expect(JSON.stringify(page)).not.toContain("foreign");
  expect(normalizeCompanionPages({ pages: { contractManager: page } }, { modules: loadModules() })
    .pages.contractManager.active).toHaveLength(1);
});

test("does not mutate the registry or create farm stats", () => {
  const outcome = runCompanionLua([FILE], SETUP, `
    local before = _G.FS25_ContractManager.ContractManagerRegistry.active.a.rewardAtAccept
    local page = CompanionPages.collectEntry(CompanionPages.entries.contractManager, 1)
    local registry = _G.FS25_ContractManager.ContractManagerRegistry
    return __fdEncode({ reward = registry.active.a.rewardAtAccept,
      stillOne = registry.stats[1] ~= nil,
      noOtherFarmCreated = registry.stats[3] == nil,
      exportReward = page.active[1].offeredReward,
      unchanged = before == registry.active.a.rewardAtAccept })
  `, { farmId: 1 });
  expect(outcome).toMatchObject({ reward: 1300, stillOne: true,
    noOtherFarmCreated: true, exportReward: 1300, unchanged: true });
});

test("withholds incomplete client history and shared shadow registries", () => {
  const client = SETUP.replace("return true end", "return false end");
  expect(runCompanionPage(FILE, client, { farmId: 1 })).toMatchObject({
    readState: "settings-only", reason: "server-register-only",
  });
  const shadow = `
    _G.g_modIsLoaded = { FS25_ContractManager = true }
    _G.g_currentMission = { getIsServer = function() return true end }
    _G.ContractManagerRegistry = { active = {}, history = {}, stats = {} }
  `;
  expect(runCompanionPage(FILE, shadow, { farmId: 1 })).toMatchObject({
    readState: "settings-only", reason: "no-contract-register",
  });
});

test("reports the empty reason only before this farm has a record", () => {
  const empty = `
    _G.g_modIsLoaded = { FS25_ContractManager = true }
    _G.g_currentMission = { getIsServer = function() return true end }
    _G.FS25_ContractManager = { ContractManagerRegistry = {
      active = {}, history = {}, stats = {}
    } }
  `;
  expect(runCompanionPage(FILE, empty, { farmId: 1 })).toMatchObject({
    readState: "settings-only", reason: "no-farm-record",
  });
});
