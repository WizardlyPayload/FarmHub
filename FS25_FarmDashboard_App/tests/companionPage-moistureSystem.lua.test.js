"use strict";

const path = require("path");
const fs = require("fs");
const { lauxlib, lualib, lua, to_luastring } = require("fengari");
const { runCompanionPage } = require("./helpers/companion-page-lua.cjs");

const FILE = "MoistureSystemCollector.lua";

// Mirrors Moisture System 2.0.0.8: mission handles from MoistureSystem:loadMap, CropValueMap in the mod env.
const MOD_ENV = `
    _G.g_modIsLoaded = { FS25_MoistureSystem = true }
    _G.g_modManager = { getActiveMods = function() return { { modName = "FS25_MoistureSystem", version = "2.0.0.8" } } end }
    local names = { [1] = "WHEAT", [2] = "MAIZE", [3] = "GRASS_WINDROW" }
    local byName = { WHEAT = 1, MAIZE = 2, GRASS_WINDROW = 3 }
    _G.g_fillTypeManager = {
        getFillTypeNameByIndex = function(self, i) return names[i] end,
        getFillTypeIndexByName = function(self, n) return byName[n] end,
    }
    local defs = {
        [1] = { idealMin = 0.11, idealMax = 0.13, witherThreshold = 0.03 },
        [2] = { idealMin = 0.18, idealMax = 0.22, witherThreshold = 0.03 },
    }
    local CropValueMap = {
        Data = defs,
        getQualityValue = function(ft, m) if m > defs[ft].idealMax then return 80.6 end return 100 end,
        getYieldMultiplier = function(ft, m) if m < defs[ft].idealMin then return 0.874 end return 1 end,
        getIdealRange = function(ft) local d = defs[ft]; if d then return d.idealMin, d.idealMax end end,
        getQualityGrade = function(ft, q)
            if q >= 90 then return 1, 1 elseif q >= 70 then return 2, 0.92 elseif q >= 50 then return 3, 0.8 end
            return 4, 0.6
        end,
    }
    local farmlands = {
        [7] = { id = 7, name = "Home", getName = function(self) return self.name end },
        [9] = { id = 9, name = "Far", getName = function(self) return self.name end },
    }
    local owners = { [7] = 1, [9] = 2 }
    _G.g_farmlandManager = {
        getFarmlandById = function(self, id) return farmlands[id] end,
        getFarmlandOwner = function(self, id) return owners[id] or 0 end,
    }
    local storage = { fillLevels = { [1] = 40000, [2] = 12000 } }
    local silo = { uniqueId = "silo1", spec_silo = {}, getOwnerFarmId = function() return 1 end, getName = function() return "Grain silo" end }
    local other = { uniqueId = "silo2", spec_silo = {}, getOwnerFarmId = function() return 2 end, getName = function() return "Theirs" end }
    local bales = {
        b1 = { getOwnerFarmId = function() return 1 end },
        b2 = { getOwnerFarmId = function() return 1 end },
        b3 = { getOwnerFarmId = function() return 2 end },
    }
    local MS = {
        missionStarted = true,
        currentMoisturePercent = 0.15,
        minHeight = 10, midHeight = 50, maxHeight = 90,
        settings = {
            weatherProfile = "ukwest", overrideWeather = true, moistureGainMultiplier = 3, moistureLossMultiplier = 3,
            teddingMoistureReduction = 0.04, hayConversionThreshold = 0.08, witheringEnabled = true,
            baleRotEnabled = true, baleRotRate = 1, baleExposureDecayRate = 1, qualityDecayMultiplier = 1,
            dryingSpeed = 0.01, sellDryingChargeRate = 1, irrigationCostMultiplier = 1,
            irrigationContractors = 2, irrigationContractorCapacity = 8,
        },
        objectInfo = {
            silo1 = { WHEAT = { moisture = 0.162, quality = 82.4 }, MAIZE = { moisture = 0.2, quality = 100 } },
            silo2 = { WHEAT = { moisture = 0.3, quality = 20 } },
        },
        periodToMonth = function(p) p = p + 2; if p > 12 then p = p - 12 end; return p end,
        getSiloStorages = function(p) if p == silo then return { storage } end return {} end,
    }
    _G.FS25_MoistureSystem = { CropValueMap = CropValueMap, MoistureSystem = MS }
    _G.g_currentMission = {
        getFarmId = function() return 1 end,
        environment = { currentPeriod = 4, currentMonotonicDay = 100, currentHour = 10 },
        placeableSystem = { placeables = { silo, other } },
        getObjectByUniqueId = function(self, id) return bales[id] end,
        MoistureSystem = MS,
        WeatherProfileSystem = {
            profiles = { ukwest = { displayName = "UK West" } },
            forecastOffsets = { {}, {}, {} },
            activeScenarioId = "drought",
            getClampForMonth = function(self, m) return { min = 8, max = 30 } end,
            getForecastData = function(self, i)
                return {
                    precipitation = 30 + i, sun = 40, cloudy = 30 - i, precipitationDiff = -2,
                    months = {
                        { month = 6 + i * 3, isActual = i == 0, precipitation = 28, sun = 42, cloudy = 30, precipitationDiff = -3.25 },
                    },
                }
            end,
            rollForecastOffsets = function() error("write") end,
        },
        dryingSystem = {
            activeDryers = { silo1 = true },
            getSiloCropStatus = function(self, p, ms) return { { needsDrying = true } }, 52000 end,
            calculateETA = function(self, statuses, liters, ms) return 3.2 end,
            toggleDrying = function() error("write") end,
        },
        irrigationSystem = {
            boosts = { [7] = { value = 0.035, graceUntil = 2410 }, [9] = { value = 0.05 } },
            jobs = {
                { farmlandId = 7, targetBoost = 0.02, startDay = 102, startHour = 8, hours = 3, hoursWorked = 0, price = 1450.5, farmId = 1 },
                { farmlandId = 7, targetBoost = 0.03, startDay = 100, startHour = 6, hours = 6, hoursWorked = 4, price = 2000, farmId = 1 },
                { farmlandId = 9, targetBoost = 0.05, startDay = 101, startHour = 6, hours = 4, hoursWorked = 0, price = 900, farmId = 2 },
            },
            bookJob = function() error("write") end,
        },
        baleRottingSystem = {
            baleRainExposureTimes = {
                b1 = { exposure = 1, peakExposure = 1, status = 1 },
                b2 = { exposure = 9e6, peakExposure = 9e6, status = 5 },
                b3 = { exposure = 9e6, peakExposure = 9e6, status = 4 },
                ghost = { exposure = 1, status = 2 },
            },
        },
    }
`;

describe("Moisture System page collector", () => {
    test("not detected without the mod", () => {
        expect(runCompanionPage(FILE, "_G.g_modIsLoaded = {}", { farmId: 1 })).toBeUndefined();
    });

    test("exports map moisture, crop windows and this farm's silos, bales and irrigation", () => {
        const page = runCompanionPage(FILE, MOD_ENV, { farmId: 1 });
        expect(page.readState).toBe("ok");
        expect(page.version).toBe("2.0.0.8");
        expect(page.month).toBe(6);
        expect(page.baseMoisturePercent).toBe(15);
        // base 0.15, clamp 8..30: up = min(0.02, 0.8 * 0.15), down = min(0.02, 0.8 * 0.07)
        expect(page.fieldRange).toEqual({ low: 13, high: 17 });
        expect(page.weather.profileName).toBe("UK West");
        expect(page.weather.monthRange).toEqual({ min: 8, max: 30 });
        expect(JSON.stringify(page)).not.toContain("drought");
        expect(page.weather.forecast).toHaveLength(3);
        expect(page.weather.forecast[0]).toMatchObject({ offset: 0, precipitation: 30, precipitationDiff: -2 });
        expect(page.weather.forecast[0].months[0]).toEqual({ month: 6, actual: true, precipitation: 28, sun: 42, cloudy: 30, precipitationDiff: -3.25 });

        expect(page.crops).toEqual([
            { fillType: "MAIZE", idealMinPercent: 18, idealMaxPercent: 22, witherPercent: 3, qualityNow: 100, yieldNow: 0.87, gradeNow: 1, priceFactorNow: 1, state: "dry" },
            { fillType: "WHEAT", idealMinPercent: 11, idealMaxPercent: 13, witherPercent: 3, qualityNow: 80, yieldNow: 1, gradeNow: 2, priceFactorNow: 0.92, state: "wet" },
        ]);

        expect(page.silos).toHaveLength(1);
        expect(page.silos[0]).toMatchObject({ farmId: 1, name: "Grain silo", isDrying: true, etaHours: 3.2, totalLiters: 52000 });
        expect(page.silos[0].crops).toEqual([
            { fillType: "MAIZE", liters: 12000, moisturePercent: 20, quality: 100, idealMaxPercent: 22, needsDrying: false, grade: 1, priceFactor: 1 },
            { fillType: "WHEAT", liters: 40000, moisturePercent: 16.2, quality: 82, idealMaxPercent: 13, needsDrying: true, grade: 2, priceFactor: 0.92 },
        ]);

        expect(page.irrigationJobs.map((j) => [j.farmlandId, j.state, j.daysAhead])).toEqual([[7, "working", 0], [7, "booked", 2]]);
        expect(page.irrigationJobs[1]).toMatchObject({ name: "Home", boostPercent: 2, startHour: 8, hours: 3, price: 1450.5 });
        expect(page.irrigationBoosts).toEqual([{ farmId: 1, farmlandId: 7, name: "Home", boostPercent: 3.5, holding: true }]);

        expect(page.byFarm["1"]).toEqual({
            siloCount: 1, dryingCount: 1, needsDryingCount: 1, lowGradeCount: 0, siloCoverage: "complete",
            bales: { gettingWet: 1, drying: 0, rottingSlowly: 0, rotting: 0, rottingQuickly: 1, total: 2, coverage: "complete" },
            irrigation: { jobCount: 2, boostedCount: 1, bookedSpend: 3450.5 },
        });
        expect(page.settings).toMatchObject({ weatherProfile: "ukwest", hayThresholdPercent: 8, teddingReductionPercent: 4, dryingSpeedPercentPerHour: 1 });
    });

    test("never rolls the forecast itself", () => {
        const page = runCompanionPage(FILE, `${MOD_ENV}
            g_currentMission.WeatherProfileSystem.forecastOffsets = nil
        `, { farmId: 1 });
        expect(page.readState).toBe("ok");
        expect(page.weather.forecast).toBeUndefined();
    });

    test("settings-only while the mission has not started; detection-only without the mod object", () => {
        const pending = runCompanionPage(FILE, `${MOD_ENV}
            g_currentMission.MoistureSystem.missionStarted = false
        `, { farmId: 1 });
        expect(pending.readState).toBe("settings-only");
        expect(pending.pending).toBe(true);
        expect(pending.silos).toBeUndefined();
        const none = runCompanionPage(FILE, `${MOD_ENV}
            g_currentMission.MoistureSystem = nil
            _G.FS25_MoistureSystem = {}
        `, { farmId: 1 });
        expect(none.readState).toBe("detection-only");
    });

    test("partial when the base moisture is off scale; no bales block when rotting is off", () => {
        const page = runCompanionPage(FILE, `${MOD_ENV}
            g_currentMission.MoistureSystem.currentMoisturePercent = 15
            g_currentMission.MoistureSystem.settings.baleRotEnabled = false
        `, { farmId: 1 });
        expect(page.readState).toBe("partial");
        expect(page.baseMoisturePercent).toBeUndefined();
        expect(page.crops[0].state).toBeUndefined();
        expect(page.byFarm["1"].bales).toBeUndefined();
    });

    test("collector parses as Lua", () => {
        const src = fs.readFileSync(path.join(__dirname, "../../FS25_FarmDashboard_Mod/src/companionPages", FILE), "utf8");
        const L = lauxlib.luaL_newstate();
        lualib.luaL_openlibs(L);
        expect(lauxlib.luaL_loadstring(L, to_luastring(src))).toBe(lua.LUA_OK);
    });
});
