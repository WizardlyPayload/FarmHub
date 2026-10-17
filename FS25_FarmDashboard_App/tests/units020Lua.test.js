"use strict";

const fs = require("fs");
const path = require("path");
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require("fengari");

const collectorPath = path.resolve(
    __dirname,
    "../../FS25_FarmDashboard_Mod/src/collectors/CompanionModsDataCollector.lua",
);
const source = fs.readFileSync(collectorPath, "utf8");
const fixtures = JSON.parse(fs.readFileSync(
    path.resolve(__dirname, "fixtures/reproductions/units-017.json"),
    "utf8",
));

function run(setup, expression) {
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    const chunk = `${source}\n${setup}\nlocal out = CompanionModsDataCollector:collect()\nreturn ${expression}`;
    if (lauxlib.luaL_dostring(L, to_luastring(chunk)) !== lua.LUA_OK) {
        throw new Error(to_jsstring(lua.lua_tostring(L, -1)));
    }
    return to_jsstring(lua.lua_tostring(L, -1));
}

describe("owning-mod companion readers", () => {
    test.each(fixtures.fixtures)("$id returns $expected", (row) => {
        expect(run(row.setup, row.expression)).toBe(row.expected);
    });

    test("milk, yield, and leases copy numbers without calling writers", () => {
        const milk = run(`
            getfenv = function() return _G end
            g_currentMission = { getFarmId = function() return 1 end }
            g_modIsLoaded = { ['FS25_365513_Seasonal_Milk_Production'] = true }
            _G['FS25_365513_Seasonal_Milk_Production'] = {
                g_seasonalMilkProduction = {
                    isInitialized = true,
                    getCurrentPeriod = function() return 4 end,
                    getSeasonalModifier = function(_, period) return period == 4 and 1.1 or 1 end,
                    applySeasonalModifiers = function() error('write') end,
                },
            }
        `, "out.seasonalMilk.readState..'|'..tostring(out.seasonalMilk.seasonFactor)");
        expect(milk).toBe("ok|1.1");

        const yields = run(`
            getfenv = function() return _G end
            g_currentMission = { getFarmId = function() return 1 end, missionDynamicInfo = { isMultiplayer = false } }
            g_modIsLoaded = { ['FS25_326441_Yield_Tracker'] = true }
            _G['FS25_326441_Yield_Tracker'] = {
                YieldTracker = { yieldData = { [2026] = { [3] = { [1] = { fillTypeTitle = 'Wheat', amount = 40 } } } } },
            }
        `, "out.yieldTracker.readState..'|'..tostring(out.yieldTracker.rows[1].liters)");
        expect(yields).toBe("ok|40");

        const leases = run(`
            getfenv = function() return _G end
            g_currentMission = { getFarmId = function() return 1 end }
            g_modIsLoaded = { ['FS25_338381_Field_Leasing'] = true }
            _G['FS25_338381_Field_Leasing'] = {
                g_fieldLeasingManager = {
                    fieldLeaseAgreements = {
                        a = { farmlandId = 9, farmId = 1, price = 500, duration = 3 },
                        b = { farmlandId = 8, farmId = 2, price = 900, duration = 1 },
                    },
                    setLandOwnership = function() error('write') end,
                },
            }
        `, "out.fieldLeases.readState..'|'..tostring(#out.fieldLeases.leases)..'|'..tostring(out.fieldLeases.leases[1].price)");
        expect(leases).toBe("ok|1|500");

        const silo = run(`
            getfenv = function() return _G end
            g_currentMission = { getFarmId = function() return 1 end }
            g_modIsLoaded = { ['FS25_369067_RealSilo_Realistic_Silo_Compartments'] = true }
            _G['FS25_369067_RealSilo_Realistic_Silo_Compartments'] = {
                realSiloManager = {
                    silos = { rs1 = { placeable = { ownerFarmId = 1 }, config = { numCompartments = 2, capacityPerCompartment = 1000 } } },
                    siloNames = { rs1 = 'Grain' },
                    applyConfig = function() error('write') end,
                },
                RealSiloCompartmentStorage = { siloSlots = { rs1 = { slots = { { fillLevel = 250, capacity = 1000 } } } } },
            }
        `, "out.realSilo.readState..'|'..tostring(out.realSilo.silos[1].slots[1].fillLevel)");
        expect(silo).toBe("ok|250");

        const pallet = run(`
            getfenv = function() return _G end
            g_currentMission = {
                getFarmId = function() return 1 end,
                nodeToObject = { [9] = { ownerFarmId = 1 } },
            }
            g_modIsLoaded = { ['FS25_360720_Storage_Overhaul_Pallet_Degradation_System'] = true }
            _G['FS25_360720_Storage_Overhaul_Pallet_Degradation_System'] = {
                PalletMetadata = { records = { p1 = { runtimeNode = 9, permDamage = 0.25, isOutside = true } } },
                PalletDegradationManager = { update = function() error('write') end },
            }
        `, "out.palletDegradation.readState..'|'..tostring(out.palletDegradation.pallets[1].condition)");
        expect(pallet).toBe("ok|75.0");
    });

    test("unread adapters copy plain values and do not call writers", () => {
        const reputation = run(`
            getfenv = function() return _G end
            g_currentMission = { getFarmId = function() return 1 end }
            g_modIsLoaded = { ['FS25_367320_Farm_Reputation'] = true }
            _G['FS25_367320_Farm_Reputation'] = {
                ReputationManager = {
                    reputationByFarm = { [1] = 800, [2] = 9000 },
                    ranks = { { min = 0, missionLimit = 1, rewardBonus = 0 }, { min = 750, missionLimit = 4, rewardBonus = 0.05 } },
                    get = function() error('write') end,
                    add = function() error('write') end,
                    ensureFarmData = function() error('write') end,
                },
            }
        `, "out.farmReputation.readState..'|'..tostring(out.farmReputation.reputation)..'|'..tostring(out.farmReputation.missionLimit)");
        expect(reputation).toBe("ok|800|4");

        const moisture = run(`
            getfenv = function() return _G end
            g_currentMission = { getFarmId = function() return 1 end }
            g_modIsLoaded = { ['FS25_354130_Moisture_System'] = true }
            _G['FS25_354130_Moisture_System'] = {
                MoistureSystem = {
                    missionStarted = true,
                    currentMoisturePercent = 0.42,
                    setObjectInfo = function() error('write') end,
                    consoleCommandSetMoisture = function() error('write') end,
                },
            }
        `, "out.moistureSystem.readState..'|'..tostring(out.moistureSystem.mapMoisturePercent)");
        expect(moisture).toBe("ok|42.0");

        const rent = run(`
            getfenv = function() return _G end
            g_currentMission = { getFarmId = function() return 1 end }
            g_modIsLoaded = { ['FS25_356641_Rent_Your_Field'] = true }
            _G['FS25_356641_Rent_Your_Field'] = {
                g_rentYourFieldManager = {
                    minDuration = 3,
                    monthlyIncomePercent = 10,
                    rentAgreements = {
                        a = { farmlandId = 4, farmId = 1, duration = 2 },
                        b = { farmlandId = 5, farmId = 2, duration = 9 },
                    },
                    rent = function() error('write') end,
                    terminateRent = function() error('write') end,
                },
            }
        `, "out.rentYourField.readState..'|'..tostring(#out.rentYourField.agreements)..'|'..tostring(out.rentYourField.agreements[1].farmlandId)");
        expect(rent).toBe("ok|1|4");

        const market = run(`
            getfenv = function() return _G end
            g_currentMission = { getFarmId = function() return 1 end }
            g_modIsLoaded = { ['FS25_369241_Farmland_Marketplace'] = true }
            _G['FS25_369241_Farmland_Marketplace'] = {
                FlaechenVermarktung = {
                    manager = {
                        state = {
                            saleOffers = { o1 = { farmlandId = 7, sellerFarmId = 1, targetFarmId = 2, price = 1500 } },
                            leaseOffers = {},
                            leases = { c1 = { farmlandId = 8, lessorFarmId = 3, lesseeFarmId = 4, ratePerPeriod = 20 } },
                        },
                        createSaleOffer = function() error('write') end,
                        respondSaleOffer = function() error('write') end,
                        loadState = function() error('write') end,
                    },
                },
            }
        `, "out.farmlandMarketplace.readState..'|'..tostring(#out.farmlandMarketplace.rows)..'|'..tostring(out.farmlandMarketplace.rows[1].price)");
        expect(market).toBe("ok|1|1500");

        const distribution = run(`
            getfenv = function() return _G end
            g_currentMission = { getFarmId = function() return 1 end }
            g_modIsLoaded = { ['FS25_365583_Distribution_Redux'] = true }
            _G['FS25_365583_Distribution_Redux'] = {
                SmartDistribution = {
                    settings = { global = { mode = 2, radius = 50, bufferHours = 2, sellEnabled = true } },
                    setAssetMode = function() error('write') end,
                    applyAssetMode = function() error('write') end,
                },
            }
        `, "out.distributionRedux.readState..'|'..tostring(out.distributionRedux.mode)..'|'..tostring(out.distributionRedux.radius)");
        expect(distribution).toBe("ok|2|50");

        const silage = run(`
            getfenv = function() return _G end
            g_currentMission = { getFarmId = function() return 1 end, missionDynamicInfo = { isMultiplayer = false } }
            g_modIsLoaded = { ['FS25_349039_Silage_Compaction_Monitor'] = true }
            _G['FS25_349039_Silage_Compaction_Monitor'] = {
                Chowkidar = {
                    showHUD = true,
                    info = { line1 = 'Compacted: 40%', line2 = 'Compacting', line3 = 'Est. Time: 0h 5m' },
                    updateSilo = function() error('write') end,
                    saveSettings = function() error('write') end,
                },
            }
        `, "out.silageCompaction.readState..'|'..out.silageCompaction.context..'|'..out.silageCompaction.estimate");
        expect(silage).toBe("ok|Compacted: 40%|Est. Time: 0h 5m");

        const ops = run(`
            getfenv = function() return _G end
            g_currentMission = { getFarmId = function() return 1 end }
            g_farmlandManager = { getFarmlandOwner = function(_, id) return id == 9 and 1 or 2 end }
            g_modIsLoaded = { ['FS25_364188_Farm_Operations_Dashboard'] = true }
            _G['FS25_364188_Farm_Operations_Dashboard'] = {
                g_farmOperationsDashboard = {
                    hudFieldData = {
                        a = { farmlandId = 9, growthState = 4, harvestMultiplier = 1.1 },
                        b = { farmlandId = 10, growthState = 1, harvestMultiplier = 1 },
                    },
                    rebuildRows = function() error('write') end,
                    addRow = function() error('write') end,
                },
            }
        `, "out.farmOperations.readState..'|'..tostring(#out.farmOperations.fields)..'|'..tostring(out.farmOperations.fields[1].growthState)");
        expect(ops).toBe("ok|1|4");
    });

    test("a dashboard shadow is not the owning provider", () => {
        const result = run(`
            getfenv = function() return _G end
            g_currentMission = { getFarmId = function() return 1 end }
            g_modIsLoaded = { ['FS25_356143_Seasonal_Wool_Production'] = true }
            g_modManager = { getActiveMods = function() return { { modName = 'FS25_356143_Seasonal_Wool_Production' } } end }
            _G['FS25_356143_Seasonal_Wool_Production'] = {}
            g_seasonalWoolProduction = { isInitialized = true, isShearingMonth = true, woolRates = {} }
        `, "tostring(out.seasonalWool and out.seasonalWool.readState)");
        expect(result).toBe("unavailable");
    });
});
