"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "DynamicDealershipCollector.lua";
const GAME = `
    _G.g_modIsLoaded = { FS25_369544_Dynamic_Dealership = true }
    _G.g_storeManager = { getItemByXMLFilename = function(_, filename)
        if filename == "tractor.xml" then return { name = "MF 9S" } end
        return nil
    end }
    local mission = { getFarmId = function() return 1 end, getIsServer = function() return true end }
    local dealer = { mission = mission, modName = "FS25_369544_Dynamic_Dealership", isInitialised = true,
        purchaseOrders = {
            { id = 4, orderType = "STOCK", xmlFilename = "tractor.xml", quantity = 8,
              deliveryDay = 120, paidAmount = 0, remainingAmount = 0 },
            { id = 5, orderType = "CUSTOMER", farmId = 1, xmlFilename = "tractor.xml", quantity = 1,
              deliveryDay = 123, paidAmount = 12000, remainingAmount = 24000 },
            { id = 6, orderType = "CUSTOMER", farmId = 2, xmlFilename = "tractor.xml", quantity = 1,
              deliveryDay = 124, paidAmount = 30000, remainingAmount = 40000 },
        } }
    mission.dealerManager = dealer
    _G.g_currentMission = mission
`;

test("reads only this farm's pending customer order, excluding shared stock and another farm", () => {
    const page = runCompanionPage(FILE, GAME, { farmId: 1 });
    expect(page.readState).toBe("ok");
    expect(page.byFarm["1"].orderCount).toBe(1);
    expect(page.rows).toEqual([{ farmId: 1, orderId: 5, vehicle: "MF 9S", quantity: 1,
        deliveryDay: 123, paidAmount: 12000, remainingAmount: 24000, financed: false }]);
    const merged = normalizeCompanionPages({ pages: { dynamicDealership: page } }, { modules: loadModules() });
    expect(merged.pages.dynamicDealership.rows).toHaveLength(1);
});

test("withholds a client register", () => {
    const page = runCompanionPage(FILE, GAME.replace("getIsServer = function() return true end", "getIsServer = function() return false end"), { farmId: 1 });
    expect(page).toMatchObject({ readState: "settings-only", reason: "server-orders-only" });
});
