"use strict";

const path = require("path");
const fs = require("fs");
const { lauxlib, lualib, lua, to_luastring } = require("fengari");
const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");

const FILE = "RegionalCropCalendarCollector.lua";

// Mirrors RegionManager / RCC services from Regional Crop Calendar 1.1.0.2.
const MOD_ENV = `
    _G.g_modIsLoaded = { FS25_RegionalCropCalendar = true }
    _G.g_modManager = { getActiveMods = function() return { { modName = "FS25_RegionalCropCalendar", version = "1.1.0.2" } } end }
    local function periods(plant, harvest)
        local out = {}
        for p = 1, 12 do out[p] = { plantingAllowed = plant[p] == true, isHarvestable = harvest[p] == true } end
        return out
    end
    local wheat = { name = "WHEAT", growthDataSeasonal = { periods = periods({ [7] = true, [8] = true }, { [4] = true, [5] = true }) } }
    local maize = { name = "MAIZE", getSeasonalGrowthData = function(self) return { periods = periods({ [2] = true }, { [7] = true, [8] = true }) } end }
    local grass = { name = "GRASS", growthDataSeasonal = { periods = periods({ [1] = true, [2] = true }, { [4] = true }) } }
    local broken = { name = "RICE", getSeasonalGrowthData = function() error("boom") end }
    _G.g_fruitTypeManager = { fruits = { wheat, maize, grass }, getFruitTypes = function(self) return self.fruits end }
    _G.g_currentMission = { environment = { currentPeriod = 7 } }
    local region = {
        title = "UK temperate", group = "europe", climate = "maritime",
        description = "Mild wet winters.", tip = "Sow winter wheat early.",
        anchor = { name = "Cambridge", latitude = 52.2, longitude = 0.1 },
        weather = { seasons = { { temperatureOffset = -1, precipitationRatio = 1.2 }, nil, { temperatureOffset = 0.5, precipitationRatio = 0.9 } } },
        yield = { mult = 1.03, sigBonus = 0.02 },
        crops = { { name = "WHEAT", signature = true }, { name = "SUNFLOWER", suitable = false }, { name = "MAIZE" } },
        availability = { { name = "COTTON", suitable = false }, { name = "SUNFLOWER", suitable = false } },
        economy = { { name = "WHEAT", priceScale = 1.05 }, { name = "BARLEY", priceScale = 0.95, pricePerLiter = 0.3 } },
        sources = { { name = "DEFRA" } },
    }
    _G.FS25_RegionalCropCalendar = {
        g_regionalCropCalendar = {
            selectedRegion = "uk_temperate", weatherEnabled = true, yieldEnabled = true, strictSuitabilityEnabled = true,
            getRegionTitle = function(self, id) return "UK (temperate)" end,
            applyRegion = function() error("write") end,
            requestState = function() error("write") end,
        },
        RCC = {
            RegionLoader = {
                getRegion = function(id) if id == "uk_temperate" then return region end end,
                getRegionIds = function() return { "vanilla", "uk_temperate", "us_midwest" } end,
            },
            CalendarService = { appliedPresetId = "uk_temperate", unmanagedFruitTypes = { "GRASS" }, apply = function() error("write") end },
            EconomyService = { appliedPresetId = "uk_temperate" },
            YieldService = { appliedRegion = "uk_temperate" },
            WeatherService = { appliedRegion = "uk_temperate" },
            CropAvailabilityService = { blockedNames = { SUNFLOWER = true, COTTON = true } },
            MoistureService = {
                active = true, bonusSteps = 0, penaltySteps = 2, dryStreak = 5, snowPack = 0,
                MAX_BONUS_STEPS = 5, MAX_PENALTY_STEPS = 4, DROUGHT_AFTER = 3, BONUS_PER_MONTH = 0.03, PENALTY_PER_MONTH = 0.06,
                getFactor = function() return 0.88 end,
                reset = function() error("write") end,
            },
        },
    }
`;

describe("Regional Crop Calendar page collector", () => {
    test("not detected without the mod", () => {
        expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
    });

    test("exports region profile, toggles, moisture balance, blocked crops and the effective calendar", () => {
        const page = runCompanionPage(FILE, MOD_ENV, { farmId: 1 });
        expect(page).toMatchObject({
            readState: "ok",
            version: "1.1.0.2",
            currentPeriod: 7,
            selectedRegion: "uk_temperate",
            regionTitle: "UK (temperate)",
            isVanilla: false,
            regionCount: 2,
            settings: { weatherEnabled: true, yieldEnabled: true, strictSuitabilityEnabled: true },
            calendarState: "ok",
            calendarCoverage: "complete",
            applied: { calendar: "uk_temperate", economy: "uk_temperate", yield: "uk_temperate", weather: "uk_temperate" },
        });
        expect(page.region).toMatchObject({
            climate: "maritime", anchor: "Cambridge", yieldMultiplier: 1.03, signatureBonus: 0.02,
            signatureCrops: ["WHEAT"], unsuitableCrops: ["COTTON", "SUNFLOWER"], calendarCrops: 3, sourceCount: 1, economyCount: 2,
        });
        expect(page.region.seasons).toEqual([
            { season: 1, temperatureOffset: -1, precipitationRatio: 1.2 },
            { season: 3, temperatureOffset: 0.5, precipitationRatio: 0.9 },
        ]);
        expect(page.region.economy[1]).toEqual({ fillType: "BARLEY", priceScale: 0.95, pricePerLiter: 0.3 });
        expect(page.moisture).toMatchObject({ active: true, penaltySteps: 2, dryStreak: 5, factor: 0.88, percent: -12, droughtAfter: 3 });
        expect(page.blockedCrops).toEqual(["COTTON", "SUNFLOWER"]);
        expect(page.crops.map((c) => c.crop)).toEqual(["GRASS", "MAIZE", "WHEAT"]);
        expect(page.crops[2]).toEqual({ crop: "WHEAT", plantingPeriods: [7, 8], harvestPeriods: [4, 5], complete: true, source: "region" });
        expect(page.crops[0].source).toBe("map-calendar");
    });

    test("pending while the preset has not been applied yet", () => {
        const page = runCompanionPage(FILE, `${MOD_ENV}
            _G.FS25_RegionalCropCalendar.RCC.CalendarService.appliedPresetId = nil
        `, { farmId: 1 });
        expect(page.readState).toBe("partial");
        expect(page.calendarState).toBe("pending");
        expect(page.crops).toBeUndefined();
        expect(page.region.climate).toBe("maritime");
    });

    test("vanilla region: map calendar, no profile; a throwing fruit makes the calendar partial", () => {
        const page = runCompanionPage(FILE, `${MOD_ENV}
            _G.FS25_RegionalCropCalendar.g_regionalCropCalendar.selectedRegion = "vanilla"
            table.insert(_G.g_fruitTypeManager.fruits, broken)
        `, { farmId: 1 });
        expect(page.isVanilla).toBe(true);
        expect(page.region).toBeUndefined();
        expect(page.calendarState).toBe("partial");
        expect(page.readState).toBe("partial");
        expect(page.crops.every((c) => c.source === "map-calendar")).toBe(true);
    });

    test("detection-only without the region manager", () => {
        const page = runCompanionPage(FILE, `${MOD_ENV}
            _G.FS25_RegionalCropCalendar.g_regionalCropCalendar = nil
        `, { farmId: 1 });
        expect(page.readState).toBe("detection-only");
    });

    test("collector parses as Lua", () => {
        const src = fs.readFileSync(path.join(__dirname, "../../FS25_FarmDashboard_Mod/src/companionPages", FILE), "utf8");
        const L = lauxlib.luaL_newstate();
        lualib.luaL_openlibs(L);
        expect(lauxlib.luaL_loadstring(L, to_luastring(src))).toBe(lua.LUA_OK);
    });
});
