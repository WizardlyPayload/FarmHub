"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "InvoicesProductionSalesOffersCollector.lua";
const GAME = `
    _G.g_modIsLoaded = { ["FS25_373258_Invoices_-_Production_Sales"] = true }
    local function point(name, owner)
        return { getName = function() return name end,
            owningPlaceable = { getOwnerFarmId = function() return owner end },
            outputFillTypeIds = { [1] = true } }
    end
    local m = {
        integrationAvailable = true,
        productionByUniqueId = { greenhouse = point("Greenhouse", 1),
            transferred = point("Sold greenhouse", 2), foreign = point("Foreign factory", 2) },
        getFillTypeMetadata = function() return "Tomatoes" end,
        offers = {
            { productionUniqueId = "greenhouse", fillTypeIndex = 1, sellerFarmId = 1,
              enabled = true, price = 184, listedLiters = 1000, remainingLiters = 700 },
            { productionUniqueId = "transferred", fillTypeIndex = 1, sellerFarmId = 1,
              enabled = true, price = 180, listedLiters = 500, remainingLiters = 500 },
            { productionUniqueId = "foreign", fillTypeIndex = 1, sellerFarmId = 2,
              enabled = true, price = 200, listedLiters = 900, remainingLiters = 900 },
            { productionUniqueId = "greenhouse", fillTypeIndex = 1, sellerFarmId = 1,
              enabled = false, price = 180, listedLiters = 400, remainingLiters = 400 },
        },
    }
    _G.g_currentMission = { getFarmId = function() return 1 end,
        getIsServer = function() return true end, invoicesProductionSalesManager = m }
`;

test("shows only the selected farm's current owned posted offers", () => {
    const page = runCompanionPage(FILE, GAME, { farmId: 1 });
    expect(page.readState).toBe("partial");
    expect(page.byFarm["1"]).toMatchObject({ postedCount: 1, withheldCount: 1 });
    expect(page.offers).toHaveLength(1);
    expect(page.offers[0]).toMatchObject({ production: "Greenhouse", product: "Tomatoes",
        pricePer1000L: 184, listedLiters: 1000, remainingLiters: 700 });
    const merged = normalizeCompanionPages({ pages: { invoicesProductionSalesOffers: page } }, { modules: loadModules() });
    expect(merged.pages.invoicesProductionSalesOffers.offers).toHaveLength(1);
});

test("withholds client-side and unavailable invoice registers", () => {
    expect(runCompanionPage(FILE, GAME.replace("return true end, invoicesProductionSalesManager", "return false end, invoicesProductionSalesManager"), { farmId: 1 }).offers).toBeUndefined();
    expect(runCompanionPage(FILE, GAME.replace("integrationAvailable = true", "integrationAvailable = false"), { farmId: 1 }).offers).toBeUndefined();
});

test("an available empty offer register remains a live reading", () => {
    const game = `
        _G.g_modIsLoaded = { FS25_InvoicesProductionSales = true }
        _G.g_currentMission = {
            getFarmId = function() return 1 end,
            getIsServer = function() return true end,
            invoicesProductionSalesManager = {
                integrationAvailable = true, offers = {}, productionByUniqueId = {},
            },
        }
    `;
    const page = runCompanionPage(FILE, game, { farmId: 1 });
    expect(page).toMatchObject({
        readState: "ok", coverage: "complete",
        byFarm: { "1": { postedCount: 0, withheldCount: 0 } },
    });
    expect(page.reason).toBeUndefined();
    expect(page.offers).toEqual({});
});

test("a capped global scan cannot claim exact farm offer totals or an empty register", () => {
    const game = `
        _G.g_modIsLoaded = { FS25_InvoicesProductionSales = true }
        local offers = {}
        for i = 1, 301 do
            offers[i] = { sellerFarmId = 2, enabled = true }
        end
        _G.g_currentMission = {
            getFarmId = function() return 1 end,
            getIsServer = function() return true end,
            invoicesProductionSalesManager = {
                integrationAvailable = true, offers = offers, productionByUniqueId = {},
            },
        }
    `;
    const page = runCompanionPage(FILE, game, { farmId: 1 });
    expect(page.readState).toBe("partial");
    expect(page.coverage).toBe("truncated");
    expect(page.byFarm["1"].postedCount).toBeUndefined();
    expect(page.byFarm["1"].withheldCount).toBeUndefined();
});
