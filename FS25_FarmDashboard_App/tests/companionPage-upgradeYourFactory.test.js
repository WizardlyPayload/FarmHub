"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "UpgradeYourFactoryCollector.lua";
const GAME = `
  _G.g_modIsLoaded = { FS25_335994_Upgrade_Your_Factory = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "FS25_335994_Upgrade_Your_Factory", version = "1.0.1.0" }
  } end }
  _G.UpgradeYourFactory = { MAX_LEVEL = 15 }
  local ownPlace = { upgradePrice = 13000, getOwnerFarmId = function() return 1 end }
  local foreignPlace = { upgradePrice = 999999, getOwnerFarmId = function() return 2 end }
  local points = {
    { ownerFarmId = 1, owningPlaceable = ownPlace, isUpgradable = true,
      productionLevel = 3, baseName = "Bakery" },
    { ownerFarmId = 2, owningPlaceable = foreignPlace, isUpgradable = true,
      productionLevel = 9, baseName = "Foreign factory" },
  }
  _G.g_currentMission = {
    missionDynamicInfo = { isMultiplayer = false },
    getIsServer = function() return true end,
    productionChainManager = {
      getProductionPointsForFarmId = function() return points end,
    },
  }
`;

test("reports the selected farm's live upgrade level without foreign price or history", () => {
  const page = runCompanionPage(FILE, GAME, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { upgradableCount: 1, upgradedCount: 1 } },
    productions: [{ farmId: 1, production: "Bakery", level: 3,
      maxLevel: 15, nextUpgradePrice: 13000 }],
  });
  expect(JSON.stringify(page)).not.toContain("999999");
  const merged = normalizeCompanionPages({ pages: { upgradeYourFactory: page } }, { modules: loadModules() });
  expect(merged.pages.upgradeYourFactory.productions).toHaveLength(1);
});

test("withholds multiplayer, client and unknown-version state", () => {
  expect(runCompanionPage(FILE, GAME.replace("isMultiplayer = false", "isMultiplayer = true"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "single-player-only" });
  expect(runCompanionPage(FILE, GAME.replace("return true end,", "return false end,"), { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-productions-only" });
  const newer = GAME + `
    _G.g_modManager = { getActiveMods = function() return {
      { modName = "FS25_335994_Upgrade_Your_Factory", version = "9.9.9.9" }
    } end }
  `;
  expect(runCompanionPage(FILE, newer, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
});

test("does not claim complete totals when an owned next-price preview is missing", () => {
  const page = runCompanionPage(FILE, GAME.replace("upgradePrice = 13000", "upgradePrice = nil"), { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial", coverage: "partial",
    productions: [{ production: "Bakery", level: 3 }] });
  expect(page.byFarm["1"]).not.toHaveProperty("upgradableCount");
  expect(page.productions[0]).not.toHaveProperty("nextUpgradePrice");
});
