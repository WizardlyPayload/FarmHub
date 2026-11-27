"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const FILE = "KiselevkaAuctionCollector.lua";
const GAME = `
  _G.g_modIsLoaded = { ["KM_77461_kiselevka-4x"] = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "KM_77461_kiselevka-4x", version = "1.0.1.3" }
  } end }
  _G["KM_77461_kiselevka-4x"] = { AuctionManager = {
    getCurrentAuction = function() return {
      farmlandId = 42, startTime = 33, endTime = 36,
      currentPrice = 125000, originalPrice = 200000,
      currentHighestFarmId = 1, hasStarted = true,
      bidHistory = { { farmId = 2, price = 120000, bidderName = "Foreign farm" } },
    } end,
    saveSavegame = function() error("must not write auction") end,
    update = function() error("must not advance auction") end,
  } }
  _G.g_currentMission = { isMissionStarted = true,
    getIsServer = function() return true end,
    environment = { currentDay = 1, dayTime = 36000000 },
  }
`;

test("reads the active auction and only this farm's leading status", () => {
  const page = runCompanionPage(FILE, GAME, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { farmlandId: 42, currentPrice: 125000,
      originalPrice: 200000, remainingGameHours: 2, leading: true } } });
  expect(JSON.stringify(page)).not.toContain("Foreign farm");
  const other = runCompanionPage(FILE, GAME, { farmId: 2 });
  expect(other.byFarm["2"].leading).toBe(false);
});

test("rejects expired, future and unstarted auction snapshots", () => {
  for (const game of [
    GAME.replace("endTime = 36", "endTime = 34"),
    GAME.replace("startTime = 33", "startTime = 35"),
    GAME.replace("hasStarted = true", "hasStarted = false"),
  ]) {
    expect(runCompanionPage(FILE, game, { farmId: 1 }))
      .toMatchObject({ readState: "settings-only", reason: "no-active-auction" });
  }
});

test("requires exact map version, server world and valid game clock", () => {
  expect(runCompanionPage(FILE, GAME.replace('version = "1.0.1.3"',
    'version = "1.0.1.4"'), { farmId: 1 }))
    .toMatchObject({ reason: "unreviewed-map-version" });
  expect(runCompanionPage(FILE, GAME.replace("return true end,",
    "return false end,"), { farmId: 1 }))
    .toMatchObject({ reason: "server-world-not-ready" });
  expect(runCompanionPage(FILE, GAME.replace("dayTime = 36000000",
    "dayTime = nil"), { farmId: 1 }))
    .toMatchObject({ reason: "game-clock-unavailable" });
  expect(runCompanionPage(FILE, GAME.replace("dayTime = 36000000",
    "dayTime = nil, getEnvironmentTime = function() return 36000000 end"), { farmId: 1 }))
    .toMatchObject({ readState: "ok" });
});
