"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "MobileButcherMeatPickupCollector.lua";
const GAME = `
  _G.g_modIsLoaded = { FS25_MobileButcher = true }
  _G.g_currentMission = { getIsServer = function() return true end }
  local own = { getOwnerFarmId = function() return 1 end, getName = function() return "Meat Pickup" end,
    spec_meatPickup = {
      pending = { [3] = 120, [4] = 0 }, pendingPremium = { [3] = 24 },
      reserved = { [3] = 80, [5] = 50 }, reservedPremium = { [3] = 16, [5] = 10 },
    } }
  local foreign = { getOwnerFarmId = function() return 2 end,
    spec_meatPickup = { pending = { [9] = 9999 }, reserved = {} } }
  _G.FS25_MobileButcher = { PlaceableMeatPickup = {
    byFarm = { [1] = own, [2] = foreign },
    getSpec = function(placeable) return placeable.spec_meatPickup end,
  } }
  _G.g_fillTypeManager = { getFillTypeByIndex = function(_, index)
    return ({ [3] = { name = "BEEF" }, [5] = { name = "PORK" }, [9] = { name = "SECRET" } })[index]
  end }
`;

test("shows only this farm's reserved and pending meat, not delivered pallets", () => {
  const page = runCompanionPage(FILE, GAME, { farmId: 1 });
  expect(page).toMatchObject({ readState: "ok", coverage: "complete",
    byFarm: { "1": { fillTypeCount: 2, pendingKg: 120, reservedKg: 130 } } });
  expect(page.rows.find((row) => row.fillType === "BEEF"))
    .toMatchObject({ pendingKg: 120, reservedKg: 80, pendingBonus: 24, reservedBonus: 16 });
  expect(page.rows.find((row) => row.fillType === "PORK"))
    .toMatchObject({ pendingKg: 0, reservedKg: 50, reservedBonus: 10 });
  expect(JSON.stringify(page)).not.toMatch(/SECRET|9999|foreign/);
  const merged = normalizeCompanionPages({ pages: { mobileButcherMeatPickup: page } }, { modules: loadModules() });
  expect(merged.pages.mobileButcherMeatPickup.rows).toHaveLength(2);
});

test("requires server and current pickup ownership", () => {
  const client = GAME.replace("getIsServer = function() return true end", "getIsServer = function() return false end");
  expect(runCompanionPage(FILE, client, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-pickup-state-only" });
  const spoof = GAME.replace("getOwnerFarmId = function() return 1 end", "getOwnerFarmId = function() return 2 end");
  expect(runCompanionPage(FILE, spoof, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "no-owned-meat-pickup" });
});

test("recognises the exact vault package identity", () => {
  const exact = GAME.replace("FS25_MobileButcher = true",
    "KM_81657_Mobile_Butcher_for_quot_Realistic_Livestock_quot_mod_ = true")
    .replace("_G.FS25_MobileButcher =",
      "_G.KM_81657_Mobile_Butcher_for_quot_Realistic_Livestock_quot_mod_ =");
  expect(runCompanionPage(FILE, exact, { farmId: 1 }).byFarm["1"].reservedKg).toBe(130);
});
