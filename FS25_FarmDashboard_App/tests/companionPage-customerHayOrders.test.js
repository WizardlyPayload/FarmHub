"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "CustomerHayOrdersCollector.lua";
const GAME = `
  _G.g_modIsLoaded = { KM_81634_Custom_Hay_Orders = true }
  _G.g_modManager = { getActiveMods = function() return {
    { modName = "KM_81634_Custom_Hay_Orders", version = "0.9.9.3" }
  } end }
  _G.g_currentMission = {
    getFarmId = function() return 1 end,
    getIsServer = function() return true end,
    missionDynamicInfo = { isMultiplayer = false },
  }
  _G.KM_81634_Custom_Hay_Orders = { CustomerHayOrders = { nextOrderGameMinute = 600, orders = {
    { customer = "Hill Farm", fillTypeName = "HAY", round = true, wrapped = false,
      pending = false, accepted = true, required = 24, progress = 6, reward = 30000,
      deadline = 21, dropName = "Hill Farm yard", dropX = 412, dropZ = 928 },
    { customer = "Oak House", fillTypeName = "SILAGE", round = false, wrapped = true,
      pending = true, accepted = false, required = 20, progress = 0, reward = 26000,
      deadline = 22, dropName = "Oak House gate", dropX = 100, dropZ = 200 },
  }, dropoffs = {} } }
`;

test("single-player page reports only saved offer and accepted delivery state", () => {
  const page = runCompanionPage(FILE, GAME, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { orderCount: 2, offerCount: 1, acceptedCount: 1 } } });
  expect(page.rows[0]).toMatchObject({ farmId: 1, customer: "Hill Farm", progress: 6,
    required: 24, rewardOffered: 30000, deadlineDay: 21, status: "accepted" });
  expect(page.rows[1]).toMatchObject({ farmId: 1, status: "offer", progress: 0 });
  expect(JSON.stringify(page)).not.toContain("dropX");
  const merged = normalizeCompanionPages({ pages: { customerHayOrders: page } }, { modules: loadModules() });
  expect(merged.pages.customerHayOrders.rows).toHaveLength(2);
});

test("shared multiplayer register is never assigned to a farm", () => {
  const mp = GAME.replace("isMultiplayer = false", "isMultiplayer = true");
  expect(runCompanionPage(FILE, mp, { farmId: 1 })).toMatchObject({
    readState: "unavailable", reason: "single-player-only" });
  expect(runCompanionPage(FILE, GAME.replace("getFarmId = function() return 1 end", "getFarmId = function() return 2 end"), { farmId: 2 })).toMatchObject({
    readState: "unavailable", reason: "single-player-only" });
  const missingFlag = GAME.replace("missionDynamicInfo = { isMultiplayer = false },", "");
  expect(runCompanionPage(FILE, missingFlag, { farmId: 1 })).toMatchObject({
    readState: "unavailable", reason: "single-player-only" });
});

test("unreviewed version, client and shadow global do not expose orders", () => {
  expect(runCompanionPage(FILE, GAME.replace('version = "0.9.9.3"', 'version = "1.0.0.0"'), { farmId: 1 }))
    .toMatchObject({ readState: "unavailable", reason: "unreviewed-version" });
  expect(runCompanionPage(FILE, GAME.replace("return true end", "return false end"), { farmId: 1 }))
    .toMatchObject({ readState: "unavailable", reason: "server-register-only" });
  const shadow = GAME.replace("_G.KM_81634_Custom_Hay_Orders = { CustomerHayOrders", "_G.shadow = { CustomerHayOrders");
  expect(runCompanionPage(FILE, shadow, { farmId: 1 }))
    .toMatchObject({ readState: "unavailable", reason: "order-register-unavailable" });
});

test("pre-load empty register is pending, not a confirmed empty order list", () => {
  const loadedEmpty = GAME.replace(/orders = \{[\s\S]*?\}, dropoffs = \{\}/, "orders = {}, dropoffs = {}");
  const preLoad = loadedEmpty.replace("nextOrderGameMinute = 600, ", "");
  expect(runCompanionPage(FILE, preLoad, { farmId: 1 })).toMatchObject({
    readState: "pending", reason: "order-register-not-loaded" });
  expect(runCompanionPage(FILE, loadedEmpty, { farmId: 1 })).toMatchObject({
    readState: "settings-only", reason: "no-current-orders", coverage: "complete" });
});

test("malformed order is withheld and coverage is partial", () => {
  const malformed = GAME.replace("required = 20, progress = 0", "required = 20, progress = 25");
  const page = runCompanionPage(FILE, malformed, { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial", coverage: "partial",
    byFarm: { "1": { orderCount: 1, acceptedCount: 1, offerCount: 0 } } });
  expect(page.rows).toHaveLength(1);
});
