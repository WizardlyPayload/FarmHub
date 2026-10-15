"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");

const FILE = "BritishFillUnitsCollector.lua";

const SETUP = `
    local types = {
        { name = "WHEAT", title = "Wheat", massPerLiter = 0.00078 },
        { name = "MILK", title = "Milk", massPerLiter = 0.00103 },
        { name = "BALE_NET", title = "Bale net", massPerLiter = 0.0001 },
        { name = "STONE", title = "Stone", massPerLiter = 0.0016 },
    }
    local byName = {}
    for _, t in ipairs(types) do byName[t.name] = t end
    _G.g_fillTypeManager = { fillTypes = types, getFillTypeByName = function(self, n) return byName[n] end }
    local FMD = {
        shopCapacityInstalled = true, fillLevelsDisplayInstalled = false, controlBarDisplayInstalled = true,
        priceStatisticsFrameContextInstalled = true, i18nFormatMoneyInstalled = false,
        textElementSetTextInstalled = true, i18nFormatVolumeInstalled = true,
        install = function() error("write") end,
    }
    function FMD:getShouldKeepVolumeFillType(d) return d.name == "MILK" end
    function FMD:getShouldKeepLengthFillType(d) return d.name == "BALE_NET" end
    _G.g_modIsLoaded = { FS25_BritishFillUnits = true }
    _G.FS25_BritishFillUnits = {
        FillMassDisplay = FMD,
        BFU = { Runtime = { VERSION = "1.3.0.0", getSessionRole = function() return "SINGLEPLAYER" end } },
    }
    _G.g_gameSettings = { getValue = function(self, n) if n == "useMiles" then return true end if n == "useAcre" then return false end end }
`;

describe("British Fill Units page collector", () => {
    test("not detected without the mod", () => {
        expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
    });

    test("exports version, session role, hook flags and how sample fill types are shown", () => {
        const page = runCompanionPage(FILE, SETUP, { farmId: 1 });
        expect(page.readState).toBe("ok");
        expect(page.runtimeVersion).toBe("1.3.0.0");
        expect(page.sessionRole).toBe("SINGLEPLAYER");
        expect(page.hooks).toEqual({ storeCapacity: true, quantityHud: true, pricesFrame: true, priceMoney: false, textFormatting: true });
        expect(page.gameUnits).toEqual({ useMiles: true, useAcre: false });
        expect(page.samples).toEqual([
            { fillType: "WHEAT", title: "Wheat", tonnesPer1000L: 0.78, shownAs: "mass" },
            { fillType: "MILK", title: "Milk", tonnesPer1000L: 1.03, shownAs: "litres" },
        ]);
        expect(page.catalog).toEqual({ mass: 2, litres: 1, length: 1, truncated: false });
    });

    test("detection-only when neither BFU table is present", () => {
        const page = runCompanionPage(FILE, `_G.g_modIsLoaded = { FS25_BritishFillUnits = true }`, { farmId: 1 });
        expect(page.readState).toBe("detection-only");
    });
});
