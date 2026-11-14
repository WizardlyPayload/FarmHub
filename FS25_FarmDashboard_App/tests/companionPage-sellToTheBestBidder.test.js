"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "SellToTheBestBidderCollector.lua";
const GAME = `
  _G.g_modIsLoaded = { FS25_359753_Sell_To_The_Best_Bidder = true }
  _G.g_modManager = { getActiveMods = function() return { { modName = "FS25_359753_Sell_To_The_Best_Bidder", version = "1.0.0.1" } } end }
  _G.g_currentMission = { getIsServer = function() return true end }
  local owned = { ownerFarmId = 1, name = "8570", brand = { title = "Massey Ferguson" },
    getName = function(self) return self.name end }
  local sold = { ownerFarmId = 2, name = "Former trailer", getName = function(self) return self.name end }
  local other = { ownerFarmId = 2, name = "Other tractor", getName = function(self) return self.name end }
  _G.stbb = { vehiclesForSale = {
    [owned] = { farmId = 1, askingPrice = 40000, offerPrice = 38000,
      workshopPrice = 32000, buyerArrived = true, buyerWaitElapsed = 2 },
    [sold] = { farmId = 1, askingPrice = 10000, buyerArrived = false },
    [other] = { farmId = 2, askingPrice = 15000, buyerArrived = false,
      elapsedGameMinutes = 3, buyerDelayMinutes = 8 },
  },
  listVehicle = function() error("must not list a vehicle") end,
  saveToXMLFile = function() error("must not save listings") end }
`;

test("exports only the selected farm's currently owned live listing and offer", () => {
  const page = runCompanionPage(FILE, GAME, { farmId: 1 });
  expect(page).toMatchObject({ readState: "partial", coverage: "partial",
    byFarm: { "1": { listingCount: 1, activeOfferCount: 1, withheldOwnership: 1 } } });
  expect(page.rows).toHaveLength(1);
  expect(page.rows[0]).toMatchObject({ farmId: 1, vehicle: "Massey Ferguson 8570",
    askingPrice: 40000, offerPrice: 38000, workshopPrice: 32000,
    buyerArrived: true, buyerWaitElapsed: 2 });
  const merged = normalizeCompanionPages({ pages: { sellToTheBestBidder: page } }, { modules: loadModules() });
  expect(merged.pages.sellToTheBestBidder.rows).toHaveLength(1);
});

test("other farm gets only its pending listing without a false offer", () => {
  const page = runCompanionPage(FILE, GAME, { farmId: 2 });
  expect(page).toMatchObject({ readState: "ok",
    byFarm: { "2": { listingCount: 1, activeOfferCount: 0, pendingCount: 1 } } });
  expect(page.rows).toHaveLength(1);
  expect(page.rows[0]).toMatchObject({ farmId: 2, vehicle: "Other tractor",
    askingPrice: 15000, buyerArrived: false, elapsedGameMinutes: 3,
    buyerDelayMinutes: 8 });
  expect(page.rows[0].offerPrice).toBeUndefined();
});

test("client or absent register cannot expose server listings", () => {
  const client = GAME.replace("getIsServer = function() return true end",
    "getIsServer = function() return false end");
  expect(runCompanionPage(FILE, client, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "server-listings-only" });
  const missing = GAME.replace("_G.stbb = { vehiclesForSale = {",
    "_G.stbb = { other = {");
  expect(runCompanionPage(FILE, missing, { farmId: 1 }))
    .toMatchObject({ readState: "settings-only", reason: "listing-register-unavailable" });
  expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
});
