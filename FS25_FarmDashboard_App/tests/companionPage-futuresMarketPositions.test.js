"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");
const { normalizeCompanionPages, loadModules } = require("../companionPagesMerge.cjs");

const FILE = "FuturesMarketPositionsCollector.lua";
const GAME = `
    _G.g_modIsLoaded = { KM_82100_FUTURES_MARKET = true }
    _G.g_modManager = { getActiveMods = function() return {
        { modName = "KM_82100_FUTURES_MARKET", version = "1.2.0.0" }
    } end }
    _G.g_currentMission = { getFarmId = function() return 1 end,
        getIsServer = function() return true end,
        FuturesMarket = { contracts = {
            { farmId = 1, crop = "WHEAT", direction = "LONG", amount = 100,
              leverage = 2, entry = 520, margin = 260, expiration = 8 },
            { farmId = 2, crop = "SECRET", direction = "SHORT", amount = 900,
              leverage = 3, entry = 500, margin = 5000, expiration = 8 },
            { farmId = 1, crop = "BARLEY", direction = "SHORT", amount = 50,
              leverage = 1, entry = 410, margin = 100, expiration = 9 },
        } } }
`;

test("reads only open positions for the selected farm", () => {
    const page = runCompanionPage(FILE, GAME, { farmId: 1 });
    expect(page.readState).toBe("ok");
    expect(page.byFarm["1"]).toMatchObject({ positionCount: 2, postedMargin: 360 });
    expect(page.positions.map((row) => row.crop)).toEqual(["WHEAT", "BARLEY"]);
    expect(page.positions[0]).toMatchObject({ direction: "LONG", amount: 100,
        entryPrice: 520, postedMargin: 260, expiryPeriod: 8 });
    const merged = normalizeCompanionPages({ pages: { futuresMarketPositions: page } }, { modules: loadModules() });
    expect(merged.pages.futuresMarketPositions.positions).toHaveLength(2);
});

test("client and unloaded register cannot produce position data", () => {
    expect(runCompanionPage(FILE, GAME.replace("return true end,", "return false end,"), { farmId: 1 }).positions).toBeUndefined();
    expect(runCompanionPage(FILE, GAME.replace("FuturesMarket = { contracts", "FuturesMarket = { missing"), { farmId: 1 }).positions).toBeUndefined();
});

test("withholds positions from an unreviewed Futures Market version", () => {
    const newer = GAME.replace('version = "1.2.0.0"', 'version = "1.2.0.1"');
    expect(runCompanionPage(FILE, newer, { farmId: 1 }))
        .toMatchObject({ readState: "settings-only", reason: "unreviewed-version" });
});
