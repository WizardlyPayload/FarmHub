"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "MowingContractsPlusCollector.lua";
const SETUP = `
  _G.g_modIsLoaded = { FS25_MowingContractsPlus = true }
  _G.g_currentMission = { getIsServer = function() return true end,
    missionDynamicInfo = { isMultiplayer = false } }
  _G.FS25_MowingContractsPlus = { MowingContractsPlus = {
    ensureOffer = function() error("must not roll or mutate an offer") end
  } }
  _G.g_missionManager = { missions = {
    { uniqueId = "accepted", farmId = 1, type = { name = "mowMission" },
      field = { getName = function() return "Field 36" end },
      mcpChoice = 2, mcpReduction = 0.5 },
    { uniqueId = "pending", farmId = 1, type = { name = "mowMission" },
      mcpChoice = 1, mcpReduction = 0.25 },
    { uniqueId = "foreign", farmId = 2, type = { name = "mowMission" },
      mcpChoice = 2, mcpReduction = 0.6 },
    { uniqueId = "unassigned", type = { name = "mowMission" },
      mcpChoice = 1, mcpReduction = 0.5 },
    { uniqueId = "other-type", farmId = 1, type = { name = "harvestMission" },
      mcpChoice = 2, mcpReduction = 0.5 },
  } }
`;

test("reads only assigned mowing decisions without rolling an offer or showing payout", () => {
  const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { decisionCount: 2 } } });
  expect(page.reason).toBeUndefined();
  expect(page.decisions).toEqual([
    expect.objectContaining({ id: "accepted", fieldName: "Field 36", choice: 2,
      rewardReductionPct: 50 }),
    expect.objectContaining({ id: "pending", choice: 1, rewardReductionPct: 25 }),
  ]);
  expect(JSON.stringify(page)).not.toMatch(/foreign|unassigned|other-type|payout/);
  expect(normalizeCompanionPages({ pages: { mowingContractsPlus: page } }, { modules: loadModules() })
    .pages.mowingContractsPlus.decisions).toHaveLength(2);
});

test("withholds multiplayer and client-only mission state", () => {
  const multiplayer = SETUP.replace("isMultiplayer = false", "isMultiplayer = true");
  expect(runCompanionPage(FILE, multiplayer, { farmId: 1 })).toMatchObject({
    readState: "settings-only", reason: "single-player-only",
  });
  const client = SETUP.replace("return true end", "return false end");
  expect(runCompanionPage(FILE, client, { farmId: 1 })).toMatchObject({
    readState: "settings-only", reason: "server-missions-only",
  });
});

test("withholds an unbound or shared-only mod symbol", () => {
  const shadow = SETUP.replace("_G.FS25_MowingContractsPlus = { MowingContractsPlus = {", "_G.shadow = { MowingContractsPlus = {");
  expect(runCompanionPage(FILE, shadow, { farmId: 1 })).toMatchObject({
    readState: "settings-only", reason: "mission-register-unavailable",
  });
});
