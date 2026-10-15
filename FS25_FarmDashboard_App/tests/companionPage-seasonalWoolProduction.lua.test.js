"use strict";

const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");

function runPage(collectorFile, key, setup) {
    return runCompanionPage(collectorFile, setup, { key });
}

const run = (setup) => runPage("SeasonalWoolProductionCollector.lua", "seasonalWoolProduction", setup);

const FULL_SETUP = `
    local function pen(uid, owner, name, pending)
        return {
            uid = uid, ownerFarmId = owner,
            getOwnerFarmId = function(self) return self.ownerFarmId end,
            getName = function() return name end,
            spec_husbandryPallets = { pendingLiters = { [7] = pending } },
            updatePallets = function() error("writer called") end,
        }
    end
    g_currentMission = {
        getFarmId = function() return 1 end,
        husbandrySystem = { placeables = {
            pen("s1", 1, "Sheep Meadow", 120),
            pen("s2", 2, "Other Farm Sheep", 900),
            pen("x", 1, "Cow Barn", 0),
        } },
    }
    g_modIsLoaded = { FS25_SeasonalWoolProduction = true }
    FS25_SeasonalWoolProduction = {
        g_seasonalWoolSettings = {
            shearingCostPerSheep = 5, notifyNextMonth = true, notifyShearingBegins = false,
            notifyShearingComplete = true, notifyShearingCost = true, notifyLargeWool = false,
        },
        g_seasonalWoolProduction = {
            isInitialized = true,
            isShearingMonth = false,
            shearingCompleted = true,
            lastProcessedMonth = 5,
            woolFillType = 7,
            adapter = { isRealisticLivestockActive = false },
            woolRates = { s1 = 2.5, s2 = 9 },
            hookedPlaceables = { s1 = true, s2 = true },
            woolRateHistory = { s1 = { [3] = 2, [4] = 3 } },
            lastShearingPeriod = { s1 = 2 },
            totalWoolSheared = 0,
            getPlaceableId = function(_, p) return p.uid end,
            getCurrentPeriod = function() return 5 end,
            checkIsShearingMonth = function(_, p) return p == 2 or p == 8 end,
            calcPeriodsSince = function(_, uid, current) return uid == "s1" and current - 2 or 0 end,
            countMatureAnimals = function(_, p) if p.uid == "s1" then return 10, 12 end return 0, 0 end,
            performShearing = function() error("writer called") end,
            captureAndSuppressRate = function() error("writer called") end,
        },
    }
`;

describe("Seasonal Wool Production companion page collector", () => {
    test("is not exported when the mod is not loaded", () => {
        expect(run(`g_modIsLoaded = {} g_currentMission = {}`)).toBeUndefined();
    });

    test("uninitialized provider exports only the synced settings", () => {
        const page = run(`
            g_modIsLoaded = { FS25_356143_Seasonal_Wool_Production = true }
            g_currentMission = { getFarmId = function() return 1 end }
            FS25_356143_Seasonal_Wool_Production = {
                g_seasonalWoolSettings = { shearingCostPerSheep = 10, notifyNextMonth = false },
                g_seasonalWoolProduction = { isInitialized = false },
            }
        `);
        expect(page.readState).toBe("settings-only");
        expect(page.settings).toEqual({ shearingCostPerSheep: 10, notifyNextMonth: false });
        expect(page.byFarm).toBeUndefined();
    });

    test("exports schedule, fee and own-farm wool pens without calling writers", () => {
        const page = run(FULL_SETUP);
        expect(page.readState).toBe("ok");
        expect(page.shearingPeriods).toEqual([2, 8]);
        expect(page.currentPeriod).toBe(5);
        expect(page.nextShearingPeriod).toBe(8);
        expect(page.monthsUntilShearing).toBe(3);
        expect(page.isShearingMonth).toBe(false);
        expect(page.shearingCompleted).toBe(true);
        expect(page.realisticLivestockMode).toBe(false);
        expect(page.totalWoolSheared).toBeUndefined();
        expect(page.settings.shearingCostPerSheep).toBe(5);
        expect(Object.keys(page.byFarm)).toEqual(["1"]);
        const farm = page.byFarm["1"];
        expect(farm.pens).toHaveLength(1);
        expect(farm.pens[0]).toMatchObject({
            name: "Sheep Meadow", hooked: true, rawRateLph: 2.5, historyAvgLph: 2.5, monthsRecorded: 2,
            lastShearingPeriod: 2, monthsSinceShearing: 3, matureSheep: 10, totalSheep: 12,
            pendingWoolLiters: 120, nextShearingCost: 50,
        });
        expect(farm).toMatchObject({ penCount: 1, totalSheep: 12, matureSheep: 10, pendingWoolLiters: 120, nextShearingCost: 50 });
    });

    test("a failing mature-animal count still keeps the pen", () => {
        const page = run(`${FULL_SETUP}
            FS25_SeasonalWoolProduction.g_seasonalWoolProduction.countMatureAnimals = function() error("cluster gone") end
        `);
        expect(page.readState).toBe("ok");
        const pen = page.byFarm["1"].pens[0];
        expect(pen.matureSheep).toBeUndefined();
        expect(pen.nextShearingCost).toBeUndefined();
    });
});
