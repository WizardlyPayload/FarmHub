-- FS25 FarmDashboard | CompanionModsDataCollector.lua | v1.0.0
-- Soft-detect high-value third-party mods + safe aggregates (authority export only).
-- Presence via g_modIsLoaded / modManager / known globals; never deep-walk engine graphs.

CompanionModsDataCollector = {}

local MAX_LOANS_PER_FARM = 24
local MAX_MODS = 64

--- Catalog: id is stable for UI; names/substrings match ModHub folder variants.
local CATALOG = {
    {
        id = "enhancedLoanSystem",
        title = "Enhanced Loan System",
        category = "finance",
        names = { "FS25_EnhancedLoanSystem", "FS25_314906_Enhanced_Loan_System" },
        substrings = { "enhancedloansystem", "enhanced_loan_system" },
        globals = { "g_els_loanManager" },
    },
    {
        id = "automaticLoanRepay",
        title = "Automatic Loan Repay",
        category = "finance",
        names = { "FS25_AutomaticLoanRepay", "FS25_365758_Automatic_Loan_Repay" },
        substrings = { "automaticloanrepay", "automatic_loan_repay" },
        globals = { "g_automaticLoanRepay" },
    },
    {
        id = "iNeedALoan",
        title = "I Need A Loan",
        category = "finance",
        names = { "FS25_INeedALoan", "FS25_365743_I_Need_A_Loan" },
        substrings = { "ineedaloan", "i_need_a_loan" },
        globals = {},
    },
    {
        id = "noCredit",
        title = "No Credit",
        category = "finance",
        names = { "FS25_NoCredit", "FS25_339204_No_Credit" },
        substrings = { "nocredit", "no_credit" },
        globals = {},
    },
    {
        id = "realisticDieselPrice",
        title = "Realistic Diesel Price",
        category = "economy",
        names = { "FS25_RealisticDieselPrice", "FS25_363612_Realistic_Diesel_Price" },
        substrings = { "realisticdieselprice", "realistic_diesel_price" },
        globals = {},
    },
    {
        id = "fluctuatingDieselPrice",
        title = "Fluctuating Diesel Price",
        category = "economy",
        names = { "FS25_FluctuatingDieselPrice", "FS25_303059_Fluctuating_Diesel_Price" },
        substrings = { "fluctuatingdieselprice", "fluctuating_diesel_price" },
        globals = {},
    },
    {
        id = "dynamicMarket",
        title = "Dynamic Market",
        category = "economy",
        names = { "FS25_DynamicMarket", "FS25_366174_Dynamic_Market" },
        substrings = { "dynamicmarket", "dynamic_market" },
        globals = { "DynamicMarket", "g_DynamicMarket" },
    },
    {
        id = "marketPriceHelper",
        title = "Market Price Helper",
        category = "economy",
        names = { "FS25_MarketPriceHelper", "FS25_362332_Market_Price_Helper" },
        substrings = { "marketpricehelper", "market_price_helper" },
        globals = { "g_priceTicker" },
    },
    {
        id = "enhancedSeasonalPrices",
        title = "Enhanced Seasonal Prices",
        category = "economy",
        names = { "FS25_EnhancedSeasonalPrices", "FS25_310803_Enhanced_Seasonal_Prices" },
        substrings = { "enhancedseasonalprices", "enhanced_seasonal_prices" },
        globals = {},
    },
    {
        id = "restrictedPeriods",
        title = "Restricted Periods",
        category = "fields",
        names = { "FS25_RestrictedPeriods", "FS25_352961_Restricted_Periods", "RestrictedPeriods" },
        substrings = { "restrictedperiods", "restricted_periods", "slurryban" },
        globals = { "SlurryBan" },
    },
    {
        id = "regionalCropCalendar",
        title = "Regional Crop Calendar",
        category = "fields",
        names = { "FS25_RegionalCropCalendar", "FS25_368342_Regional_Crop_Calendar" },
        substrings = { "regionalcropcalendar", "regional_crop_calendar" },
        globals = { "g_regionalCropCalendar" },
    },
    {
        id = "soilWorkYieldBonus",
        title = "Soil Work Yield Bonus",
        category = "fields",
        names = { "FS25_SoilWorkYieldBonus", "FS25_367297_Soil_Work_Yield_Bonus" },
        substrings = { "soilworkyieldbonus", "soil_work_yield_bonus" },
        globals = { "g_soilWorkYieldBonus" },
    },
    {
        id = "smartCropControl",
        title = "Smart Crop Control",
        category = "fields",
        names = { "FS25_SmartCropControl", "FS25_366374_Smart_Crop_Control" },
        substrings = { "smartcropcontrol", "smart_crop_control" },
        globals = {},
    },
    {
        id = "dynamicFieldPrices",
        title = "Dynamic Field Prices",
        category = "fields",
        names = { "FS25_DynamicFieldPrices", "FS25_348187_Dynamic_Field_Prices" },
        substrings = { "dynamicfieldprices", "dynamic_field_prices" },
        globals = {},
    },
    {
        id = "farmlandMarketplace",
        title = "Farmland Marketplace",
        category = "fields",
        names = { "FS25_FarmlandMarketplace", "FS25_369241_Farmland_Marketplace" },
        substrings = { "farmlandmarketplace", "farmland_marketplace" },
        globals = {},
    },
    {
        id = "betterContracts",
        title = "Better Contracts",
        category = "contracts",
        names = { "FS25_BetterContracts", "FS25_307829_Better_Contracts" },
        substrings = { "bettercontracts", "better_contracts" },
        globals = { "BetterContracts" },
    },
    {
        id = "missionsExpanded",
        title = "Missions Expanded",
        category = "contracts",
        names = { "FS25_MissionsExpanded", "FS25_307801_Missions_Expanded" },
        substrings = { "missionsexpanded", "missions_expanded" },
        globals = {},
    },
    {
        id = "additionalContracts",
        title = "Additional Contracts",
        category = "contracts",
        names = { "FS25_AdditionalContracts", "FS25_328503_Additional-Contracts", "FS25_Additional-Contracts" },
        substrings = { "additionalcontracts", "additional-contracts" },
        globals = { "g_additionalContractTypes" },
    },
    {
        id = "livestockMonitor",
        title = "Livestock Monitor",
        category = "livestock",
        names = { "FS25_LivestockMonitor", "FS25_367447_Livestock_Monitor" },
        substrings = { "livestockmonitor", "livestock_monitor" },
        globals = { "LivestockMonitor" },
    },
    {
        id = "animalFoodOverview",
        title = "Animal Food Overview",
        category = "livestock",
        names = { "FS25_AnimalFoodOverview", "FS25_309457_Animal_Food_Overview" },
        substrings = { "animalfoodoverview", "animal_food_overview" },
        globals = { "AnimalFoodOverview" },
    },
    {
        id = "animalFoodCalculator",
        title = "Animal Food Calculator",
        category = "livestock",
        names = { "FS25_AnimalFoodCalculator", "FS25_338159_Animal_Food_Calculator" },
        substrings = { "animalfoodcalculator", "animal_food_calculator" },
        globals = { "AFCConsumptionScaling", "AnimalFoodCalculator" },
    },
    {
        id = "realisticAnimalLosses",
        title = "Realistic Animal Losses",
        category = "livestock",
        names = { "FS25_RealisticAnimalLosses", "FS25_324914_Realistic_Animal_Losses" },
        substrings = { "realisticanimallosses", "realistic_animal_losses" },
        globals = { "RealisticAnimalLosses" },
    },
    {
        id = "realisticMilkingTimes",
        title = "Realistic Milking Times",
        category = "livestock",
        names = { "FS25_RealisticMilkingTimes", "FS25_303654_Realistic_Milking_Times" },
        substrings = { "realisticmilkingtimes", "realistic_milking_times" },
        globals = {},
    },
    {
        id = "seasonalMilkProduction",
        title = "Seasonal Milk Production",
        category = "livestock",
        names = { "FS25_SeasonalMilkProduction", "FS25_365513_Seasonal_Milk_Production" },
        substrings = { "seasonalmilkproduction", "seasonal_milk_production" },
        globals = { "g_seasonalMilkProduction", "g_seasonalMilkUI" },
    },
    {
        id = "animalTrader",
        title = "Animal Trader",
        category = "livestock",
        names = { "FS25_AnimalTrader", "FS25_339284_Animal_Trader" },
        substrings = { "animaltrader", "animal_trader" },
        globals = {},
    },
    {
        id = "stallRental",
        title = "Stall Rental",
        category = "livestock",
        names = { "FS25_StallRental", "FS25_339275_Stall_Rental" },
        substrings = { "stallrental", "stall_rental" },
        globals = {},
    },
    {
        id = "productionWatcher",
        title = "Production Watcher",
        category = "production",
        names = { "FS25_ProductionWatcher", "FS25_319635_Production_Watcher" },
        substrings = { "productionwatcher", "production_watcher" },
        globals = { "ProductionWatcher" },
    },
    {
        id = "productionControl",
        title = "Production Control",
        category = "production",
        names = { "FS25_ProductionControl", "FS25_319198_Production_Control" },
        substrings = { "productioncontrol", "production_control" },
        globals = {},
    },
    {
        id = "productionsManager",
        title = "Productions Manager",
        category = "production",
        names = { "FS25_ProductionsManager", "FS25_346503_Productions_Manager" },
        substrings = { "productionsmanager", "productions_manager" },
        globals = {},
    },
    {
        id = "factoryProfitCalculator",
        title = "Factory Profit Calculator",
        category = "production",
        names = { "FS25_FactoryProfitCalculator", "FS25_368477_Factory_Profit_Calculator" },
        substrings = { "factoryprofitcalculator", "factory_profit_calculator" },
        globals = {},
    },
    {
        id = "timeSavingStockCheck",
        title = "Time Saving Stock Check",
        category = "production",
        names = { "FS25_TSStockCheck", "FS25_TimeSavingStockCheck", "FS25_302852_Time_Saving_Stock_Check" },
        substrings = { "tsstockcheck", "timesavingstockcheck", "time_saving_stock_check" },
        globals = {},
    },
    {
        id = "palletDegradation",
        title = "Pallet Degradation",
        category = "storage",
        names = {
            "FS25_StorageOverhaulPalletDegradation",
            "FS25_StorageOverhaul",
            "FS25_PalletDegradation",
            "FS25_360720_Storage_Overhaul_Pallet_Degradation_System",
        },
        substrings = { "pallet_degradation", "palletdegradation", "storage_overhaul" },
        globals = { "PalletDegradationManager" },
    },
    {
        id = "realSilo",
        title = "RealSilo",
        category = "storage",
        names = {
            "FS25_RealSilo",
            "FS25_369067_RealSilo_Realistic_Silo_Compartments",
        },
        substrings = { "realsilo", "realistic_silo" },
        globals = { "realSiloManager" },
    },
    {
        id = "advancedMaintenance",
        title = "Advanced Maintenance",
        category = "fleet",
        names = { "FS25_AdvancedMaintenance", "FS25_307003_Advanced_Maintenance" },
        substrings = { "advancedmaintenance", "advanced_maintenance" },
        globals = { "AdvancedMaintenance" },
    },
    {
        id = "extendedVehicleMaintenance",
        title = "Extended Vehicle Maintenance",
        category = "fleet",
        names = { "FS25_ExtendedVehicleMaintenance", "FS25_363077_Extended_Vehicle_Maintenance" },
        substrings = { "extendedvehiclemaintenance", "extended_vehicle_maintenance" },
        globals = {},
    },
    {
        id = "realisticVehicleService",
        title = "Realistic Vehicle Service",
        category = "fleet",
        names = { "FS25_RealisticVehicleService", "FS25_359741_Realistic_Vehicle_Service" },
        substrings = { "realisticvehicleservice", "realistic_vehicle_service" },
        globals = {},
    },
    {
        id = "outOfFuel",
        title = "Out Of Fuel",
        category = "fleet",
        names = { "FS25_OutOfFuel", "FS25_342105_Out_Of_Fuel" },
        substrings = { "outoffuel", "out_of_fuel" },
        globals = {},
    },
    {
        id = "puncturedTires",
        title = "Punctured Tires",
        category = "fleet",
        names = { "FS25_PuncturedTires", "FS25_358517_Punctured_Tires" },
        substrings = { "puncturedtire", "punctured_tire" },
        globals = {},
    },
    {
        id = "collisionDamage",
        title = "Collision Damage",
        category = "fleet",
        names = { "FS25_CollisionDamage", "FS25_361963_Collision_Damage" },
        substrings = { "collisiondamage", "collision_damage" },
        globals = {},
    },
    {
        id = "vehicleMileage",
        title = "Vehicle Mileage",
        category = "fleet",
        names = { "FS25_VehicleMileage", "FS25_Vehicle_Mileage", "FS25_347015_Vehicle_Mileage" },
        substrings = { "vehiclemileage", "vehicle_mileage" },
        globals = {},
    },
    {
        id = "vehicleYears",
        title = "Vehicle Years",
        category = "fleet",
        names = { "FS25_Vehicle_Years", "FS25_VehicleYears" },
        substrings = { "vehicle_years", "vehicleyears" },
        globals = { "VehicleYears" },
    },
    {
        -- Exact name only: a "courseplay" substring would also match FS25_CourseplayGps.
        id = "courseplay",
        title = "Courseplay",
        category = "fleet",
        names = { "FS25_Courseplay" },
        substrings = {},
        globals = { "g_Courseplay" },
    },
    {
        id = "implementUsageCounter",
        title = "Implement Usage Counter",
        category = "fleet",
        names = { "FS25_ImplementUsageCounter", "FS25_310419_Implement_Usage_Counter" },
        substrings = { "implementusagecounter", "implement_usage_counter" },
        globals = {},
    },
    {
        id = "ingameTimeOperatingHours",
        title = "Ingame Time Operating Hours",
        category = "fleet",
        names = { "FS25_IngameTimeOperatingHours", "FS25_311491_Ingame_Time_Operating_Hours" },
        substrings = { "ingametimeoperatinghours", "ingame_time_operating" },
        globals = {},
    },
    {
        id = "saveUnitProfiles",
        title = "Save Unit Profiles",
        category = "units",
        names = { "FS25_SaveUnitProfiles", "FS25_362921_Save_Unit_Profiles" },
        substrings = { "saveunitprofiles", "save_unit_profiles" },
        globals = { "SaveUnitProfiles" },
    },
    {
        id = "imperialSystem",
        title = "Imperial System",
        category = "units",
        names = { "FS25_ImperialSystem", "FS25_ImperialUnits", "FS25_316812_Imperial_System" },
        substrings = { "imperialsystem", "imperial_system", "imperialunits" },
        globals = {},
    },
    {
        id = "britishFillUnits",
        title = "British Fill Units",
        category = "units",
        names = { "FS25_BritishFillUnits", "FS25_BritishUnits" },
        substrings = { "britishfillunits", "british_fill_units", "britishunits" },
        globals = {},
    },
    {
        id = "bushelPlus",
        title = "Bushel Plus",
        category = "fleet",
        names = { "FS25_BushelPlus", "FS25_309911_Bushel_Plus" },
        substrings = { "bushelplus", "bushel_plus" },
        globals = {},
    },
    {
        id = "statisticsExtended",
        title = "Statistics Extended",
        category = "economy",
        names = { "FS25_StatisticsExtended", "FS25_364343_Statistics_Extended" },
        substrings = { "statisticsextended", "statistics_extended" },
        globals = {},
    },
    {
        id = "seasonalWoolProduction",
        title = "Seasonal Wool Production",
        category = "livestock",
        names = { "FS25_SeasonalWoolProduction", "FS25_356143_Seasonal_Wool_Production" },
        substrings = { "seasonalwool", "seasonal_wool" },
        globals = { "g_seasonalWoolProduction" },
    },
    {
        id = "taskList",
        title = "Task List",
        category = "contracts",
        names = { "FS25_TaskList", "FS25_312938_Task_List" },
        substrings = { "tasklist", "task_list" },
        globals = { "TaskList" },
    },
    {
        id = "productionSchedule",
        title = "Production Schedule",
        category = "production",
        names = { "FS25_ProductionSchedule", "FS25_352788_Production_Schedule" },
        substrings = { "productionschedule", "production_schedule" },
        globals = { "ProductionSchedule" },
    },
    {
        id = "economicHistory",
        title = "Economic History",
        category = "finance",
        names = { "FS25_EconomicHistory", "FS25_367175_Economic_History" },
        substrings = { "economichistory", "economic_history" },
        globals = { "FinancialLogger" },
    },
    {
        id = "animalPlanner",
        title = "Animal Planner",
        category = "livestock",
        names = { "FS25_AnimalPlanner", "FS25_368672_Animal_Planner" },
        substrings = { "animalplanner", "animal_planner" },
        globals = { "AnimalPlannerData" },
    },
    {
        id = "vipOrderManager",
        title = "VIP Order Manager",
        category = "economy",
        names = { "FS25_VIPOrderManager", "FS25_310861_VIP_Order_Manager" },
        substrings = { "vipordermanager", "vip_order" },
        globals = { "VIPOrderManager" },
    },
    {
        id = "fieldProfitabilityLedger",
        title = "Field Profitability Ledger",
        category = "fields",
        names = { "FS25_FieldProfitabilityLedger", "FS25_369866_Field_Profitability_Ledger" },
        substrings = { "fieldprofitability", "field_profitability" },
        globals = { "FieldProfitabilityLedger" },
    },
    {
        id = "farmReputation",
        title = "Farm Reputation",
        category = "contracts",
        names = { "FS25_FarmReputation", "FS25_367320_Farm_Reputation" },
        substrings = { "farmreputation", "farm_reputation" },
        globals = {},
    },
    {
        id = "yieldTracker",
        title = "Yield Tracker",
        category = "fields",
        names = { "FS25_YieldTracker", "FS25_326441_Yield_Tracker" },
        substrings = { "yieldtracker", "yield_tracker" },
        globals = { "YieldTracker" },
    },
    {
        id = "moistureSystem",
        title = "Moisture System",
        category = "fields",
        names = { "FS25_MoistureSystem", "FS25_354130_Moisture_System" },
        substrings = { "moisturesystem", "moisture_system" },
        globals = {},
    },
    {
        id = "fieldLeasing",
        title = "Field Leasing",
        category = "fields",
        names = { "FS25_FieldLeasing", "FS25_338381_Field_Leasing" },
        substrings = { "fieldleasing", "field_leasing" },
        globals = { "g_fieldLeasingManager" },
    },
    {
        id = "rentYourField",
        title = "Rent Your Field",
        category = "fields",
        names = { "FS25_RentYourField", "FS25_356641_Rent_Your_Field" },
        substrings = { "rentyourfield", "rent_your_field" },
        globals = {},
    },
    {
        id = "distributionRedux",
        title = "Distribution Redux",
        category = "production",
        names = { "FS25_DistributionRedux", "FS25_365583_Distribution_Redux" },
        substrings = { "distributionredux", "distribution_redux" },
        globals = {},
    },
    {
        id = "silageCompactionMonitor",
        title = "Silage Compaction Monitor",
        category = "storage",
        names = { "FS25_SilageCompactionMonitor", "FS25_349039_Silage_Compaction_Monitor" },
        substrings = { "silagecompaction", "silage_compaction" },
        globals = {},
    },
    {
        id = "farmOperationsDashboard",
        title = "Farm Operations Dashboard",
        category = "economy",
        names = { "FS25_FarmOperationsDashboard", "FS25_364188_Farm_Operations_Dashboard" },
        substrings = { "farmoperationsdashboard", "farm_operations_dashboard" },
        globals = {},
    },
}

local function envGet(name)
    local ok, env = pcall(getfenv, 0)
    if ok and type(env) == "table" and env[name] ~= nil then
        return env[name]
    end
    return rawget(_G, name)
end

local function modEntry(modName)
    local reg = rawget(_G, "FarmDashboardMissionRegistry")
    if type(reg) == "table" and type(reg.activeNames) == "function" then
        local members = reg.activeNames()
        if type(members) ~= "table" then
            return nil
        end
        local row = members[modName]
        if type(row) == "table" then
            return row
        end
        if row then
            return { modName = modName }
        end
        return nil
    end
    local mm = _G.g_modManager
    if type(mm) ~= "table" or type(mm.getActiveMods) ~= "function" then
        return nil
    end
    local ok, active = pcall(function()
        return mm:getActiveMods()
    end)
    if not ok or type(active) ~= "table" then
        return nil
    end
    local want = string.lower(tostring(modName))
    for _, mod in pairs(active) do
        if type(mod) == "table" then
            local key = mod.modName or mod.name
            if type(key) == "string" and string.lower(key) == want then
                return mod
            end
        end
    end
    return nil
end

local function modVersion(modName)
    local mod = modEntry(modName)
    if not mod then
        return nil
    end
    local v = mod.version or (mod.modDesc and mod.modDesc.version)
    if v ~= nil then
        return tostring(v)
    end
    return nil
end

local function globalPresent(names)
    if type(names) ~= "table" then
        return false
    end
    for _, name in ipairs(names) do
        if envGet(name) ~= nil then
            return true
        end
    end
    return false
end

local function findLoadedName(entry)
    local loaded = _G.g_modIsLoaded
    if type(loaded) ~= "table" then
        -- Some loaders only expose the table on the mission env, not raw _G.
        loaded = envGet("g_modIsLoaded")
    end
    if type(loaded) == "table" then
        for _, name in ipairs(entry.names or {}) do
            if loaded[name] then
                return name
            end
        end
        for key, on in pairs(loaded) do
            if on and type(key) == "string" then
                local lower = string.lower(key)
                for _, sub in ipairs(entry.substrings or {}) do
                    if string.find(lower, sub, 1, true) then
                        return key
                    end
                end
            end
        end
    end
    for _, name in ipairs(entry.names or {}) do
        if modEntry(name) ~= nil then
            return name
        end
    end
    local reg = rawget(_G, "FarmDashboardMissionRegistry")
    if type(reg) == "table" and type(reg.activeNames) == "function" then
        local members = reg.activeNames()
        if type(members) ~= "table" then
            return nil
        end
        for _, name in ipairs(entry.names or {}) do
            if members[name] then
                return name
            end
        end
        for key, on in pairs(members) do
            if on and type(key) == "string" then
                local lower = string.lower(key)
                for _, sub in ipairs(entry.substrings or {}) do
                    if string.find(lower, sub, 1, true) then
                        return key
                    end
                end
            end
        end
        return nil
    end
    -- Active mission membership only. g_modManager.mods is the installed inventory;
    -- walking it marked inactive ZIPs as loaded (F04).
    local mm = _G.g_modManager
    if type(mm) == "table" and type(mm.getActiveMods) == "function" then
        local okActive, active = pcall(function() return mm:getActiveMods() end)
        if okActive and type(active) == "table" then
            for _, mod in ipairs(active) do
                if type(mod) == "table" then
                    local key = mod.modName or mod.name
                    if type(key) == "string" and key ~= "" then
                        local lower = string.lower(key)
                        for _, name in ipairs(entry.names or {}) do
                            if lower == string.lower(name) then
                                return key
                            end
                        end
                        for _, sub in ipairs(entry.substrings or {}) do
                            if string.find(lower, sub, 1, true) then
                                return key
                            end
                        end
                    end
                end
            end
        end
    end
    return nil
end

local function detectEntry(entry)
    local listedName = findLoadedName(entry)
    if listedName then
        return true, listedName
    end
    return false, nil
end

local function round2(value)
    local n = tonumber(value)
    if n == nil then
        return nil
    end
    return math.floor(n * 100 + 0.5) / 100
end

local function clipText(value, maxLen)
    local text = tostring(value or "")
    if #text > maxLen then
        return string.sub(text, 1, maxLen)
    end
    return text
end

local function resolveExportFarmId(farmInfo)
    if type(farmInfo) ~= "table" then return nil end
    local eligible, sole, count = {}, nil, 0
    for _, farm in ipairs(farmInfo) do
        if type(farm) == "table" and farm.isPlayer == true then
            local id = tonumber(farm.id or farm.farmId)
            if id and id > 0 and id % 1 == 0 and not eligible[id] then
                eligible[id] = true
                sole = id
                count = count + 1
            end
        end
    end
    local mission = _G.g_currentMission
    if mission and type(mission.getFarmId) == "function" then
        local ok, fid = pcall(function()
            return mission:getFarmId()
        end)
        fid = ok and tonumber(fid) or nil
        if fid and eligible[fid] then
            return fid
        end
    end
    if count == 1 then return sole end
    return nil
end

local function activeExportFarmId()
    local collector = rawget(_G, "FarmDashboardDataCollector")
    if type(collector) == "table" then
        if collector._companionFarmScopeReady == true then
            return collector._companionExportFarmId
        end
        return nil
    end
    -- Standalone collector callers without the gameplay snapshot owner.
    local mission = _G.g_currentMission
    if mission and type(mission.getFarmId) == "function" then
        local ok, fid = pcall(mission.getFarmId, mission)
        fid = ok and tonumber(fid) or nil
        if fid and fid > 0 and fid % 1 == 0 then return fid end
    end
    return nil
end

local function companionSymbol(modNames, symbolName)
    local function nameIsActive(name)
        local reg = rawget(_G, "FarmDashboardMissionRegistry")
        if type(reg) == "table" and type(reg.isActive) == "function" then
            local active, state = reg.isActive(name)
            if state == "unready" then
                return false
            end
            return active == true
        end
        local loaded = _G.g_modIsLoaded
        if type(loaded) == "table" and loaded[name] then
            return true
        end
        local mm = _G.g_modManager
        if type(mm) ~= "table" or type(mm.getActiveMods) ~= "function" then
            return false
        end
        local ok, active = pcall(function()
            return mm:getActiveMods()
        end)
        if not ok or type(active) ~= "table" then
            return false
        end
        for _, mod in pairs(active) do
            if mod == name then
                return true
            end
            if type(mod) == "table" then
                local key = mod.modName or mod.name
                if key == name then
                    return true
                end
            end
        end
        return false
    end
    for _, name in ipairs(modNames) do
        if nameIsActive(name) then
            -- Ordinary script mods set env._G = env and inherit engine globals.
            -- The companion environment is the inherited engine key. A same-named
            -- table on this dashboard is a shadow and is not the companion.
            local env = nil
            local mt = getmetatable(_G)
            local parent = type(mt) == "table" and mt.__index or nil
            if type(parent) == "table" then
                local inherited = parent[name]
                if type(inherited) == "table" then
                    env = inherited
                end
            end
            if env == nil then
                local direct = _G[name]
                if type(direct) == "table" and direct ~= _G then
                    env = direct
                end
            end
            if type(env) == "table" then
                local value = rawget(env, symbolName)
                if value ~= nil then
                    return value
                end
            end
        end
    end
    return nil
end

local function providerSymbol(modNames, symbolName)
    local owned = companionSymbol(modNames, symbolName)
    if owned ~= nil then
        return owned
    end
    local mt = getmetatable(_G)
    local parent = type(mt) == "table" and mt.__index or nil
    for _, name in ipairs(modNames) do
        if type(parent) == "table" and type(parent[name]) == "table" then
            return nil
        end
        local direct = rawget(_G, name)
        if type(direct) == "table" and direct ~= _G then
            return nil
        end
    end
    local loaded = rawget(_G, "g_modIsLoaded")
    if type(loaded) ~= "table" then
        return nil
    end
    local active = false
    for _, name in ipairs(modNames) do
        if loaded[name] then
            active = true
            break
        end
    end
    if not active then
        return nil
    end
    return rawget(_G, symbolName)
end

local LOAN_REPAY_MODS = { "FS25_AutomaticLoanRepay", "FS25_365758_Automatic_Loan_Repay" }
local DIESEL_PRICE_MODS = { "FS25_RealisticDieselPrice", "FS25_363612_Realistic_Diesel_Price" }
local BETTER_CONTRACTS_MODS = { "FS25_BetterContracts", "FS25_307829_Better_Contracts" }
local WOOL_MODS = { "FS25_SeasonalWoolProduction", "FS25_356143_Seasonal_Wool_Production" }
local SCHEDULE_MODS = { "FS25_ProductionSchedule", "FS25_352788_Production_Schedule" }
local HISTORY_MODS = { "FS25_EconomicHistory", "FS25_367175_Economic_History" }
local FOOD_MODS = { "FS25_AnimalFoodCalculator", "FS25_338159_Animal_Food_Calculator" }
local PLANNER_MODS = { "FS25_AnimalPlanner", "FS25_368672_Animal_Planner" }
local VIP_MODS = { "FS25_VIPOrderManager", "FS25_310861_VIP_Order_Manager" }
local MILK_MODS = { "FS25_SeasonalMilkProduction", "FS25_365513_Seasonal_Milk_Production" }
local YIELD_MODS = { "FS25_YieldTracker", "FS25_326441_Yield_Tracker" }
local LEASE_MODS = { "FS25_FieldLeasing", "FS25_338381_Field_Leasing" }
local SILO_MODS = { "FS25_RealSilo", "FS25_369067_RealSilo_Realistic_Silo_Compartments" }
local PALLET_MODS = {
    "FS25_StorageOverhaulPalletDegradation",
    "FS25_StorageOverhaul",
    "FS25_PalletDegradation",
    "FS25_360720_Storage_Overhaul_Pallet_Degradation_System",
}
local REPUTATION_MODS = { "FS25_FarmReputation", "FS25_367320_Farm_Reputation" }
local MOISTURE_MODS = { "FS25_MoistureSystem", "FS25_354130_Moisture_System" }
local RENT_MODS = { "FS25_RentYourField", "FS25_356641_Rent_Your_Field" }
local MARKET_MODS = { "FS25_FarmlandMarketplace", "FS25_369241_Farmland_Marketplace" }
local DIST_MODS = { "FS25_DistributionRedux", "FS25_365583_Distribution_Redux" }
local SILAGE_MODS = { "FS25_SilageCompactionMonitor", "FS25_349039_Silage_Compaction_Monitor" }
local OPS_MODS = { "FS25_FarmOperationsDashboard", "FS25_364188_Farm_Operations_Dashboard" }
local FACTORY_MODS = { "FS25_FactoryProfitCalculator", "FS25_368477_Factory_Profit_Calculator" }
local LIVESTOCK_MONITOR_MODS = { "FS25_LivestockMonitor", "FS25_367447_Livestock_Monitor" }
local SAVE_UNIT_MODS = { "FS25_SaveUnitProfiles", "FS25_362921_Save_Unit_Profiles" }

local function collectElsLoans()
    local mgr = companionSymbol({
        "FS25_EnhancedLoanSystem",
        "FS25_314906_Enhanced_Loan_System",
    }, "g_els_loanManager")
    if type(mgr) ~= "table" or type(mgr.loans) ~= "table" then
        return { enabled = true, readState = "unavailable", source = "enhancedLoanSystem", byFarm = {} }
    end

    local byFarm = {}
    local totalRest = 0
    local totalCount = 0

    for farmId, farmLoans in pairs(mgr.loans) do
        local fid = tonumber(farmId)
        if fid and fid > 0 and type(farmLoans) == "table" then
            local restSum = 0
            local annuitySum = 0
            local count = 0
            local rows = {}
            for _, loan in pairs(farmLoans) do
                if type(loan) == "table" and loan.paidOff ~= true then
                    local rest = tonumber(loan.restAmount) or 0
                    if rest > 0 then
                        count = count + 1
                        restSum = restSum + rest
                        local annuity = nil
                        if type(loan.calculateAnnuity) == "function" then
                            local okA, val = pcall(function()
                                return loan:calculateAnnuity()
                            end)
                            if okA then
                                annuity = tonumber(val)
                            end
                        end
                        if annuity then
                            annuitySum = annuitySum + annuity
                        end
                        if #rows < MAX_LOANS_PER_FARM then
                            rows[#rows + 1] = {
                                amount = tonumber(loan.amount),
                                restAmount = rest,
                                interest = round2(loan.interest),
                                durationYears = tonumber(loan.duration),
                                restMonths = tonumber(loan.restDuration),
                                monthlyAnnuity = round2(annuity),
                            }
                        end
                    end
                end
            end
            if fid ~= nil then
                byFarm[tostring(fid)] = {
                    count = count,
                    restAmount = restSum,
                    monthlyAnnuity = round2(annuitySum),
                    loans = rows,
                }
                totalRest = totalRest + restSum
                totalCount = totalCount + count
            end
        end
    end

    -- A real farm with no ELS record is debt-free (zero row). A farm id the game
    -- does not list stays absent, so the card reports it as unavailable.
    local fm = _G.g_farmManager
    local farms = nil
    if type(fm) == "table" then
        if type(fm.getFarms) == "function" then
            local okFarms, list = pcall(function()
                return fm:getFarms()
            end)
            if okFarms and type(list) == "table" then
                farms = list
            end
        end
        if farms == nil and type(fm.farms) == "table" then
            farms = fm.farms
        end
    end
    if type(farms) == "table" then
        local seen = 0
        for _, farm in pairs(farms) do
            seen = seen + 1
            if seen > 32 then
                break
            end
            local fid = type(farm) == "table" and tonumber(farm.farmId) or nil
            if fid and fid > 0 and byFarm[tostring(fid)] == nil then
                byFarm[tostring(fid)] = { count = 0, restAmount = 0, monthlyAnnuity = nil, loans = {} }
            end
        end
    end

    local interest = nil
    local dynamic = nil
    if type(mgr.loanManagerProperties) == "table" then
        interest = round2(mgr.loanManagerProperties.loanInterest)
        dynamic = mgr.loanManagerProperties.dynamicLoanInterest == true
    end

    return {
        enabled = true,
        readState = "ok",
        source = "enhancedLoanSystem",
        loanCount = totalCount,
        restAmount = totalRest,
        loanInterest = interest,
        dynamicInterest = dynamic,
        byFarm = byFarm,
    }
end

-- Active diesel modifiers, in catalog order. Being active does not prove which one wrote the game price last.
local DIESEL_CONTRIBUTOR_IDS = { "realisticDieselPrice", "fluctuatingDieselPrice" }

local function collectDiesel(detectedIds)
    local contributors = {}
    for _, id in ipairs(DIESEL_CONTRIBUTOR_IDS) do
        if detectedIds[id] then
            contributors[#contributors + 1] = id
        end
    end
    if #contributors == 0 then
        return nil
    end

    -- source is the origin of the returned price: "native" (game DIESEL fill type), "rdpPreset" (RDP country
    -- preset fallback) or absent when nothing was read. It never names a mod as the writer.
    local source = nil
    local price = nil
    local ftm = _G.g_fillTypeManager
    if ftm and ftm.getFillTypeByName then
        local ok, diesel = pcall(function()
            return ftm:getFillTypeByName("DIESEL")
        end)
        if ok and type(diesel) == "table" then
            price = tonumber(diesel.pricePerLiter)
        end
    end
    if price ~= nil then
        source = "native"
    end

    local regionName = nil
    local countryName = nil
    local rdp = detectedIds.realisticDieselPrice and providerSymbol(DIESEL_PRICE_MODS, "rdp") or nil
    if type(rdp) == "table" and type(rdp.regions) == "table" then
        local region = rdp.regions[rdp.currentRegion]
        if type(region) == "table" then
            regionName = region.name and tostring(region.name) or nil
            local country = region.countries and region.countries[rdp.currentCountry]
            if type(country) == "table" then
                countryName = country.label and tostring(country.label) or nil
                if price == nil and country.price ~= nil then
                    price = tonumber(country.price)
                    if price ~= nil then
                        source = "rdpPreset"
                    end
                end
            end
        end
    end

    return {
        enabled = true,
        source = source,
        contributors = contributors,
        pricePerLiter = round2(price),
        region = regionName,
        country = countryName,
    }
end

local function collectRestrictedPeriods()
    local slurry = companionSymbol({
        "FS25_RestrictedPeriods",
        "FS25_352961_Restricted_Periods",
        "RestrictedPeriods",
    }, "SlurryBan")
    if type(slurry) ~= "table" or type(slurry.isBanActive) ~= "function" then
        return { enabled = true, readState = "unavailable" }
    end

    local function banValue(ok, value)
        if not ok or value == nil or value == false then
            return nil
        end
        if value == true then
            return "active"
        end
        return tostring(value)
    end

    local okL, lVal = pcall(function()
        return slurry.isBanActive("liquid")
    end)
    local okS, sVal = pcall(function()
        return slurry.isBanActive("solid")
    end)
    if not okL or not okS then
        return {
            enabled = true,
            readState = "failed",
            liquidBan = okL and banValue(true, lVal) or nil,
            solidBan = okS and banValue(true, sVal) or nil,
        }
    end

    local liquidBan = banValue(true, lVal)
    local solidBan = banValue(true, sVal)
    local period = nil
    local mission = _G.g_currentMission
    if mission and mission.environment and mission.environment.currentPeriod ~= nil then
        period = tonumber(mission.environment.currentPeriod)
    end

    if period == nil or period < 1 or period > 12 or period % 1 ~= 0 then
        return { enabled = true, readState = "unavailable", reason = "period-unavailable" }
    end
    -- Pinned Restricted Periods 1.0.0.0: liquid 9..11, solid 10..11;
    -- liquid period 12 is additionally conditional on current temperature.
    local function window(category, reason)
        local start = category == "liquid" and 9 or 10
        local nextPeriod = (period >= start and period <= 11) and 12 or period
        return {
            currentAllowed = reason == nil,
            nextCalendarPeriod = nextPeriod,
            temperatureConditional = category == "liquid" and nextPeriod == 12,
            nextUnconditionalPeriod = category == "liquid" and nextPeriod == 12 and 1 or nextPeriod,
            reason = reason,
        }
    end
    return {
        enabled = true,
        readState = "ok",
        scope = "map",
        windowSource = "RestrictedPeriods-1.0.0.0-period-rules",
        liquidWindow = window("liquid", liquidBan),
        solidWindow = window("solid", solidBan),
        liquidBan = liquidBan,
        solidBan = solidBan,
        anyActive = (liquidBan ~= nil) or (solidBan ~= nil),
        currentPeriod = period,
    }
end

local function collectCropCalendar()
    local mgr = companionSymbol({
        "FS25_RegionalCropCalendar",
        "FS25_368342_Regional_Crop_Calendar",
    }, "g_regionalCropCalendar")
    if type(mgr) ~= "table" then
        return { enabled = true, readState = "unavailable" }
    end
    local region = mgr.selectedRegion
    if region == nil and type(mgr.getSelectedRegion) == "function" then
        local ok, val = pcall(function()
            return mgr:getSelectedRegion()
        end)
        if ok then
            region = val
        end
    end
    local out = {
        enabled = true,
        readState = "ok",
        scope = "map",
        calendarsReadState = "unavailable",
        selectedRegion = region ~= nil and tostring(region) or nil,
        weatherEnabled = mgr.weatherEnabled == true,
        yieldEnabled = mgr.yieldEnabled == true,
        strictSuitabilityEnabled = mgr.strictSuitabilityEnabled == true,
    }
    local rcc = companionSymbol({ "FS25_RegionalCropCalendar", "FS25_368342_Regional_Crop_Calendar" }, "RCC")
    local service = type(rcc) == "table" and rcc.CalendarService or nil
    if region ~= "vanilla" and (type(service) ~= "table" or service.appliedPresetId ~= region) then
        out.calendarsReadState = "pending"
        return out
    end
    local manager = _G.g_fruitTypeManager
    if type(manager) ~= "table" or type(manager.getFruitTypes) ~= "function" then return out end
    local ok, fruits = pcall(manager.getFruitTypes, manager)
    if not ok then out.calendarsReadState = "failed"; return out end
    if type(fruits) ~= "table" then return out end
    local unmanaged = {}
    for _, name in ipairs(type(service) == "table" and service.unmanagedFruitTypes or {}) do unmanaged[name] = true end
    local rows, scanned, incomplete = {}, 0, false
    for _, fruit in pairs(fruits) do
        scanned = scanned + 1
        if scanned > 200 then out.coverage = "truncated"; break end
        if type(fruit) == "table" and type(fruit.name) == "string" then
            local data = fruit.growthDataSeasonal
            local readOk = true
            if type(fruit.getSeasonalGrowthData) == "function" then readOk, data = pcall(fruit.getSeasonalGrowthData, fruit) end
            if not readOk then incomplete = true
            elseif type(data) == "table" and type(data.periods) == "table" then
                local planting, harvest, known = {}, {}, 0
                for periodId = 1, 12 do
                    local periodInfo = data.periods[periodId]
                    if type(periodInfo) == "table" then
                        if periodInfo.plantingAllowed == true then planting[#planting + 1] = periodId end
                        if periodInfo.isHarvestable == true then harvest[#harvest + 1] = periodId end
                        if type(periodInfo.plantingAllowed) == "boolean" and type(periodInfo.isHarvestable) == "boolean" then known = known + 1 end
                    end
                end
                rows[#rows + 1] = {
                    crop = fruit.name, plantingPeriods = planting, harvestPeriods = harvest,
                    readState = known == 12 and "ok" or "partial",
                    source = (region == "vanilla" or unmanaged[fruit.name]) and "map-calendar" or "effective-game-calendar",
                }
                if known < 12 then incomplete = true end
            end
        end
    end
    table.sort(rows, function(a,b) return a.crop < b.crop end)
    out.crops = rows
    out.calendarsReadState = incomplete and "partial" or "ok"
    out.coverage = out.coverage or (incomplete and "partial" or "complete")
    return out
end

local function collectAutomaticLoanRepay()
    local alr = providerSymbol(LOAN_REPAY_MODS, "g_automaticLoanRepay")
    if type(alr) ~= "table" then
        return { enabled = true }
    end
    return {
        enabled = true,
        minimumBalance = tonumber(alr.minimumBalance),
        repaymentHour = tonumber(alr.repaymentHour),
    }
end

local function collectBetterContracts()
    local bc = providerSymbol(BETTER_CONTRACTS_MODS, "BetterContracts")
    local out = { enabled = true }
    if type(bc) == "table" then
        if type(bc.config) == "table" then
            out.lazyNPC = bc.config.lazyNPC == true
            out.hardMode = bc.config.hardMode == true
        end
    end
    local mm = _G.g_missionManager
    if mm and type(mm.missions) == "table" then
        local n = 0
        for _ in pairs(mm.missions) do
            n = n + 1
            if n >= 500 then
                break
            end
        end
        out.missionCount = n
    end
    return out
end


local function collectLivestockMonitor()
    local settings = providerSymbol(LIVESTOCK_MONITOR_MODS, "LivestockMonitorSettings")
    local alerts = providerSymbol(LIVESTOCK_MONITOR_MODS, "LivestockMonitorAlerts")
    if type(settings) ~= "table" and type(alerts) ~= "table" then
        return { enabled = true, readState = "unavailable", source = "livestockMonitor" }
    end
    local out = { enabled = true, readState = "ok", source = "livestockMonitor", scope = "global" }
    if type(settings) == "table" then
        if settings.displayMode == "hud" or settings.displayMode == "alerts" then
            out.displayMode = settings.displayMode
        end
        out.refreshInterval = tonumber(settings.hudRefreshSec)
    end
    -- The alert queue holds HUD text for the local viewer's barns and carries no farm id.
    local farmId = activeExportFarmId()
    if type(alerts) == "table" and type(alerts.queue) == "table" and farmId ~= nil then
        local n = 0
        for _ in pairs(alerts.queue) do
            n = n + 1
            if n >= 50 then
                out.alertCoverage = "truncated"
                break
            end
        end
        out.queuedAlerts = n
        out.hasActiveAlert = alerts.current ~= nil
        out.alertScope = "local-hud"
        out.farmId = farmId
    end
    return out
end

local function collectSaveUnitProfiles()
    local sup = providerSymbol(SAVE_UNIT_MODS, "SaveUnitProfiles")
    if type(sup) ~= "table" then
        return { enabled = true, readState = "unavailable", source = "saveUnitProfiles" }
    end
    local out = { enabled = true, readState = "ok", source = "saveUnitProfiles", scope = "save" }
    local money = nil
    local gs = _G.g_gameSettings
    if type(gs) == "table" then
        if type(gs.getValue) == "function" then
            local ok, v = pcall(function()
                return gs:getValue("moneyUnit")
            end)
            if ok then
                money = tonumber(v)
            end
        end
        if money == nil then
            money = tonumber(gs.moneyUnit)
        end
    end
    out.moneyUnit = money
    if money == 1 then
        out.moneyUnitName = "EUR"
    elseif money == 2 then
        out.moneyUnitName = "USD"
    elseif money == 3 then
        out.moneyUnitName = "GBP"
    elseif money ~= nil and type(sup.MONEY_UNITS) == "table" and type(sup.MONEY_UNITS[money]) == "table" then
        local name = sup.MONEY_UNITS[money].name
        if type(name) == "string" and name ~= "" then
            out.moneyUnitName = clipText(name, 40)
        end
    end
    if type(sup.activeProfileName) == "string" and sup.activeProfileName ~= "" then
        out.profileName = clipText(sup.activeProfileName, 60)
    end
    if sup.hasApplied == true or sup.hasApplied == false then
        out.hasApplied = sup.hasApplied
    end
    if sup.lastApplyOk == true or sup.lastApplyOk == false then
        out.lastApplyOk = sup.lastApplyOk
    end
    return out
end

-- Production Watcher keeps its instance private (ProductionWatcher.new() is never stored),
-- so its alert window cannot be read. The count below is the game's own production data.
local function collectProductionWatcher()
    local farmId = activeExportFarmId()
    if farmId == nil then
        return { enabled = true, readState = "unavailable", source = "productionWatcher", reason = "no-farm" }
    end
    local mission = _G.g_currentMission
    local pcm = mission and mission.productionChainManager
    if type(pcm) ~= "table" or type(pcm.productionPoints) ~= "table" then
        return { enabled = true, readState = "unavailable", source = "productionWatcher", farmId = farmId }
    end
    local n = 0
    local scanned = 0
    local truncated = false
    for _, pp in pairs(pcm.productionPoints) do
        scanned = scanned + 1
        if scanned > 250 then
            truncated = true
            break
        end
        if type(pp) == "table" and tonumber(pp.ownerFarmId) == farmId then
            n = n + 1
        end
    end
    return {
        enabled = true,
        source = "productionWatcher",
        readState = n == 0 and "empty" or "ok",
        coverage = truncated and "truncated" or "complete",
        farmId = farmId,
        productionPointCount = n,
        countSource = "native",
        alertsReadable = false,
    }
end

local function collectSeasonalWool()
    local prod = providerSymbol(WOOL_MODS, "g_seasonalWoolProduction")
    if type(prod) ~= "table" then
        return { enabled = true, readState = "unavailable", source = "seasonalWoolProduction" }
    end
    -- isShearingMonth starts false in the provider constructor, so it is only an
    -- observed value after initialize(). totalWoolSheared is never incremented
    -- by the provider and is not exported.
    if prod.isInitialized ~= true then
        return { enabled = true, readState = "pending", source = "seasonalWoolProduction", scope = "map" }
    end
    local out = {
        enabled = true,
        source = "seasonalWoolProduction",
        readState = "ok",
        scope = "map",
    }
    if prod.isShearingMonth == true or prod.isShearingMonth == false then
        out.isShearingMonth = prod.isShearingMonth
    end
    local month = tonumber(prod.lastProcessedMonth)
    if month ~= nil and month >= 1 and month <= 12 then
        out.lastProcessedMonth = month
    end
    -- One synced setting charged to every pen owner: a map-wide configured fee.
    local settings = providerSymbol(WOOL_MODS, "g_seasonalWoolSettings")
    if type(settings) == "table" then
        local fee = tonumber(settings.shearingCostPerSheep)
        if fee ~= nil and fee >= 0 then
            out.shearingCostPerSheep = fee
            out.feeScope = "map"
        end
    end
    -- woolRates is keyed by the provider's own pen id for every farm; count only
    -- pens owned by the export farm.
    local farmId = activeExportFarmId()
    local mission = _G.g_currentMission
    local placeables = mission and mission.placeableSystem and mission.placeableSystem.placeables
    if farmId ~= nil and type(prod.woolRates) == "table" and type(placeables) == "table" and type(prod.getPlaceableId) == "function" then
        local count, scanned, truncated, unknown = 0, 0, false, false
        local seen = {}
        for _, placeable in pairs(placeables) do
            scanned = scanned + 1
            if scanned > 500 then
                truncated = true
                break
            end
            if type(placeable) == "table" and type(placeable.getOwnerFarmId) == "function" then
                local okOwner, owner = pcall(placeable.getOwnerFarmId, placeable)
                if not okOwner or tonumber(owner) == nil then unknown = true end
                if okOwner and tonumber(owner) == farmId then
                    local okId, uid = pcall(prod.getPlaceableId, prod, placeable)
                    if not okId or uid == nil then unknown = true end
                    if okId and uid ~= nil and prod.woolRates[uid] ~= nil and not seen[uid] then
                        seen[uid] = true
                        count = count + 1
                    end
                end
            else
                unknown = true
            end
        end
        out.farmId = farmId
        out.trackedPens = count
        out.coverage = truncated and "truncated" or (unknown and "partial" or "complete")
        out.pensReadState = unknown and "partial" or "ok"
    end
    return out
end

local function collectTaskList()
    local farmId = activeExportFarmId()
    if farmId == nil then
        return { enabled = true, readState = "unavailable", source = "taskList", reason = "no-farm" }
    end
    local mission = _G.g_currentMission
    local list = mission and mission.taskList
    if type(list) ~= "table" or type(list.activeTasks) ~= "table" or type(list.taskGroups) ~= "table" then
        return { enabled = true, readState = "unavailable", source = "taskList" }
    end
    local tasks = {}
    local truncated = false
    local scanned = 0
    for _, active in pairs(list.activeTasks) do
        scanned = scanned + 1
        if #tasks >= 40 or scanned > 400 then
            truncated = true
            break
        end
        if type(active) == "table" then
            local group = list.taskGroups[active.groupId]
            if type(group) == "table" and tonumber(group.farmId) == farmId and type(group.tasks) == "table" then
                local task = group.tasks[active.id]
                tasks[#tasks + 1] = {
                    id = clipText(active.id, 40),
                    priority = type(task) == "table" and tonumber(task.priority) or nil,
                    period = type(task) == "table" and tonumber(task.period) or nil,
                    effort = type(task) == "table" and tonumber(task.effort) or nil,
                    detail = type(task) == "table" and clipText(task.detail, 120) or "",
                }
            end
        end
    end
    return {
        enabled = true,
        source = "taskList",
        readState = #tasks == 0 and "empty" or "ok",
        coverage = truncated and "truncated" or "complete",
        farmId = farmId,
        tasks = tasks,
    }
end

local function collectProductionSchedule()
    local farmId = activeExportFarmId()
    if farmId == nil then
        return { enabled = true, readState = "unavailable", source = "productionSchedule", reason = "no-farm" }
    end
    local sched = providerSymbol(SCHEDULE_MODS, "ProductionSchedule")
    if type(sched) ~= "table" or type(sched.data) ~= "table" then
        return { enabled = true, readState = "unavailable", source = "productionSchedule" }
    end
    local rows = {}
    local skipped = 0
    local truncated = false
    local scanned = 0
    for pointKey, recipes in pairs(sched.data) do
        scanned = scanned + 1
        if #rows >= 40 or scanned > 200 then
            truncated = true
            break
        end
        local owner = nil
        if type(sched.runtime) == "table" and type(sched.runtime[pointKey]) == "table" then
            owner = tonumber(sched.runtime[pointKey].ownerFarmId)
        end
        local owned = owner == farmId or owner == 0
        if not owned then
            skipped = skipped + 1
        elseif type(recipes) == "table" then
            for prodId, raw in pairs(recipes) do
                if #rows >= 40 then
                    truncated = true
                    break
                end
                local status = nil
                local months = nil
                if type(raw) == "table" and (raw.status == "aktiv" or raw.status == "inaktiv") then
                    status = raw.status
                    months = raw.months
                elseif type(raw) == "table" then
                    months = raw
                end
                local monthList = {}
                if type(months) == "table" then
                    for month, on in pairs(months) do
                        if type(month) == "number" and on == true and #monthList < 12 then
                            monthList[#monthList + 1] = month
                        end
                    end
                end
                rows[#rows + 1] = {
                    pointKey = clipText(pointKey, 80),
                    recipeId = clipText(prodId, 40),
                    status = status,
                    months = monthList,
                    ownerFarmId = owner,
                }
            end
        end
    end
    return {
        enabled = true,
        source = "productionSchedule",
        readState = #rows == 0 and "empty" or "ok",
        coverage = truncated and "truncated" or (skipped > 0 and "partial" or "complete"),
        farmId = farmId,
        recipes = rows,
    }
end

local function collectEconomicHistory()
    local farmId = activeExportFarmId()
    if farmId == nil then
        return { enabled = true, readState = "unavailable", source = "economicHistory", reason = "no-farm" }
    end
    local logger = providerSymbol(HISTORY_MODS, "FinancialLogger")
    if type(logger) ~= "table" then
        return { enabled = true, readState = "unavailable", source = "economicHistory" }
    end
    local current = nil
    if type(logger.getCurrentFinanceData) == "function" then
        local ok, data = pcall(function()
            return logger:getCurrentFinanceData(farmId)
        end)
        if not ok then
            return {
                enabled = true,
                source = "economicHistory",
                readState = "failed",
                farmId = farmId,
            }
        end
        if type(data) == "table" then
            current = {
                total = tonumber(data.total),
                balance = tonumber(data.balance),
                loanBalance = tonumber(data.loanBalance),
            }
        end
    end
    local months = {}
    local truncated = false
    if type(logger.history) == "table" then
        local scanned = 0
        for i = #logger.history, 1, -1 do
            scanned = scanned + 1
            if scanned > 240 then
                truncated = true
                break
            end
            local entry = logger.history[i]
            if type(entry) == "table" and type(entry.data) == "table" then
                local farmData = entry.data[farmId]
                if type(farmData) ~= "table" then
                    farmData = entry.data[tostring(farmId)]
                end
                if type(farmData) == "table" then
                    months[#months + 1] = {
                        year = tonumber(entry.year),
                        period = tonumber(entry.period),
                        total = tonumber(farmData.total),
                        balance = tonumber(farmData.balance),
                        loanBalance = tonumber(farmData.loanBalance),
                    }
                    if #months >= 12 then
                        if i > 1 then
                            truncated = true
                        end
                        break
                    end
                end
            end
        end
        local ordered = {}
        for i = #months, 1, -1 do
            ordered[#ordered + 1] = months[i]
        end
        months = ordered
    end
    local state = "empty"
    if current or #months > 0 then
        state = "ok"
    end
    return {
        enabled = true,
        source = "economicHistory",
        readState = state,
        farmId = farmId,
        coverage = truncated and "truncated" or "complete",
        current = current,
        months = months,
    }
end

local function collectAnimalFoodCalculator()
    local scaling = providerSymbol(FOOD_MODS, "AFCConsumptionScaling")
    if type(scaling) ~= "table" then
        return { enabled = true, readState = "unavailable", source = "animalFoodCalculator" }
    end
    local out = {
        enabled = true,
        source = "animalFoodCalculator",
        readState = "ok",
        scope = "global",
        scalingEnabled = scaling.enabled == true,
    }
    local mission = _G.g_currentMission
    local days = mission and mission.environment and tonumber(mission.environment.daysPerPeriod) or nil
    out.daysPerPeriod = days
    if type(scaling.getModeName) == "function" then
        local ok, mode = pcall(function()
            return scaling:getModeName()
        end)
        if ok and mode ~= nil then
            out.mode = clipText(mode, 40)
        end
    end
    if type(scaling.getCustomMultiplier) == "function" then
        local ok, multiplier = pcall(function()
            return scaling:getCustomMultiplier()
        end)
        if ok then
            out.multiplier = tonumber(multiplier)
        end
    end
    if type(scaling.getReferenceSourceName) == "function" then
        local ok, reference = pcall(function()
            return scaling:getReferenceSourceName()
        end)
        if ok and reference ~= nil then
            out.reference = clipText(reference, 40)
        end
    end
    if type(scaling.getScaleFactor) ~= "function" then
        out.readState = "failed"
        out.reason = "missing-method"
        return out
    end
    local scales = {}
    for _, input in ipairs({ "food", "water", "straw" }) do
        local ok, factor = pcall(function()
            return scaling:getScaleFactor(input, days)
        end)
        if not ok then
            out.readState = "failed"
            return out
        end
        scales[input] = tonumber(factor)
    end
    out.foodScale = scales.food
    out.waterScale = scales.water
    out.strawScale = scales.straw
    return out
end

local function collectAnimalPlanner()
    local farmId = activeExportFarmId()
    if farmId == nil then
        return { enabled = true, readState = "unavailable", source = "animalPlanner", reason = "no-farm" }
    end
    local dataApi = providerSymbol(PLANNER_MODS, "AnimalPlannerData")
    if type(dataApi) ~= "table" or type(dataApi.getHusbandryData) ~= "function" then
        return { enabled = true, readState = "unavailable", source = "animalPlanner" }
    end
    local mission = _G.g_currentMission
    local pens = mission and mission.husbandrySystem and mission.husbandrySystem.placeables
    if type(pens) ~= "table" then
        return { enabled = true, readState = "empty", source = "animalPlanner", farmId = farmId, barns = {} }
    end
    local barns = {}
    local failed = false
    local truncated = false
    local scanned = 0
    for _, placeable in pairs(pens) do
        scanned = scanned + 1
        if #barns >= 4 or scanned > 200 then
            truncated = true
            break
        end
        if type(placeable) == "table" then
            local owner = tonumber(placeable.ownerFarmId)
            if owner == farmId or owner == 0 then
                local ok, data = pcall(function()
                    return dataApi.getHusbandryData(placeable)
                end)
                if not ok then
                    failed = true
                elseif type(data) == "table" then
                    barns[#barns + 1] = {
                        name = clipText(data.name, 80),
                        numAnimals = tonumber(data.numAnimals),
                        maxAnimals = tonumber(data.maxAnimals),
                        isFull = data.isFull == true,
                    }
                end
            end
        end
    end
    local state = #barns == 0 and "empty" or "ok"
    if failed and #barns == 0 then
        state = "failed"
    end
    return {
        enabled = true,
        source = "animalPlanner",
        readState = state,
        coverage = truncated and "truncated" or (failed and "partial" or "complete"),
        farmId = farmId,
        barns = barns,
    }
end

local function collectVipOrders()
    local farmId = activeExportFarmId()
    if farmId == nil then
        return { enabled = true, readState = "unavailable", source = "vipOrderManager", reason = "no-farm" }
    end
    local md = _G.g_currentMission and _G.g_currentMission.missionDynamicInfo
    if type(md) == "table" and md.isMultiplayer == true then
        return { enabled = true, readState = "unavailable", source = "vipOrderManager", reason = "single-player-only" }
    end
    local vip = providerSymbol(VIP_MODS, "VIPOrderManager")
    if type(vip) ~= "table" then
        return { enabled = true, readState = "unavailable", source = "vipOrderManager" }
    end
    if type(vip.VIPOrders) ~= "table" then
        return { enabled = true, readState = "pending", source = "vipOrderManager", farmId = farmId }
    end
    local count = 0
    local truncated = false
    for _ in ipairs(vip.VIPOrders) do
        if count >= 20 then
            truncated = true
            break
        end
        count = count + 1
    end
    local current = nil
    local first = vip.VIPOrders[1]
    if type(first) == "table" and type(first.entries) == "table" then
        local items = 0
        local remainingItems = 0
        local payout = 0
        local itemsTruncated = false
        for _, entry in pairs(first.entries) do
            if items >= 24 then
                itemsTruncated = true
                break
            end
            if type(entry) == "table" then
                items = items + 1
                local quantity = tonumber(entry.quantity)
                local filled = tonumber(entry.fillLevel) or 0
                if quantity ~= nil and quantity - math.ceil(filled) > 0 then
                    remainingItems = remainingItems + 1
                end
                payout = payout + (tonumber(entry.payout) or 0)
            end
        end
        current = {
            level = tonumber(first.level),
            items = items,
            remainingItems = remainingItems,
            payout = payout,
            coverage = itemsTruncated and "truncated" or "complete",
        }
    end
    return {
        enabled = true,
        source = "vipOrderManager",
        readState = count == 0 and "empty" or "ok",
        farmId = farmId,
        orderCount = count,
        maxOrders = tonumber(vip.maxVIPOrdersCount),
        animalOrders = vip.isAnimalOrdersWished == true,
        currentOrder = current,
        coverage = truncated and "truncated" or "complete",
        scope = "session",
    }
end

local function collectSeasonalMilk()
    local prod = providerSymbol(MILK_MODS, "g_seasonalMilkProduction")
    local settings = providerSymbol(MILK_MODS, "g_seasonalMilkSettings")
    if type(prod) ~= "table" and type(settings) ~= "table" then
        return { enabled = true, readState = "unavailable", source = "seasonalMilkProduction" }
    end
    if type(prod) ~= "table" or prod.isInitialized ~= true or type(prod.getSeasonalModifier) ~= "function" then
        return {
            enabled = true,
            readState = type(settings) == "table" and "pending" or "unavailable",
            source = "seasonalMilkProduction",
            scope = "global",
            cowsEnabled = type(settings) == "table" and settings.seasonalCowsEnabled == true or false,
        }
    end
    local period = nil
    if type(prod.getCurrentPeriod) == "function" then
        local ok, value = pcall(function()
            return prod:getCurrentPeriod()
        end)
        if not ok then
            return { enabled = true, readState = "failed", source = "seasonalMilkProduction" }
        end
        period = tonumber(value)
    end
    local factor = nil
    if type(prod) == "table" and type(prod.getSeasonalModifier) == "function" and period ~= nil then
        local ok, value = pcall(function()
            return prod:getSeasonalModifier(period)
        end)
        if not ok then
            return { enabled = true, readState = "failed", source = "seasonalMilkProduction", period = period }
        end
        factor = tonumber(value)
    end
    if factor == nil or factor ~= factor then
        return { enabled = true, readState = "failed", source = "seasonalMilkProduction", period = period }
    end
    local nextPeak = nil
    local peakUnknown = false
    if period ~= nil and type(prod.getSeasonalModifier) == "function" then
        local best = nil
        for step = 0, 11 do
            local month = ((period - 1 + step) % 12) + 1
            local okPeak, sample = pcall(function()
                return prod:getSeasonalModifier(month)
            end)
            local number = okPeak and tonumber(sample) or nil
            if number == nil or number ~= number or number == math.huge or number == -math.huge then
                peakUnknown = true
            elseif best == nil or number > best then
                best = number
                nextPeak = month
            end
        end
    else
        peakUnknown = true
    end
    return {
        enabled = true,
        source = "seasonalMilkProduction",
        readState = peakUnknown and nextPeak == nil and "partial" or "ok",
        coverage = peakUnknown and "partial" or "complete",
        scope = "global",
        period = period,
        seasonFactor = factor,
        nextPeakPeriod = nextPeak,
        cowsEnabled = type(settings) == "table" and settings.seasonalCowsEnabled == true or false,
    }
end

local function missionIsMultiplayer()
    local mission = _G.g_currentMission
    local info = mission and mission.missionDynamicInfo
    return type(info) == "table" and info.isMultiplayer == true
end

local function collectYieldTracker()
    if missionIsMultiplayer() then
        return { enabled = true, readState = "unavailable", source = "yieldTracker", reason = "mp-disabled" }
    end
    local tracker = providerSymbol(YIELD_MODS, "YieldTracker")
    if type(tracker) ~= "table" or type(tracker.yieldData) ~= "table" then
        return { enabled = true, readState = "unavailable", source = "yieldTracker" }
    end
    local rows = {}
    local truncated = false
    local scanned = 0
    for year, fields in pairs(tracker.yieldData) do
        if type(fields) == "table" then
            for fieldId, crops in pairs(fields) do
                if type(crops) == "table" then
                    for fillTypeIndex, crop in pairs(crops) do
                        scanned = scanned + 1
                        if scanned > 80 then
                            truncated = true
                            break
                        end
                        if #rows >= 12 then
                            truncated = true
                            break
                        end
                        if type(crop) == "table" then
                            -- Yield Tracker keys its rows by the saved fill type index.
                            -- Resolve the engine name, never the translated fillTypeTitle.
                            local fillKey = nil
                            local manager = _G.g_fillTypeManager
                            if type(manager) == "table" and type(manager.getFillTypeByIndex) == "function" then
                                local ok, fill = pcall(manager.getFillTypeByIndex, manager, tonumber(fillTypeIndex))
                                if ok and type(fill) == "table" and type(fill.name) == "string" then
                                    fillKey = clipText(fill.name, 48)
                                end
                            end
                            rows[#rows + 1] = {
                                year = tonumber(year),
                                fieldId = tonumber(fieldId),
                                crop = clipText(crop.fillTypeTitle, 40),
                                fillKey = fillKey,
                                liters = tonumber(crop.amount),
                            }
                        end
                    end
                end
                if truncated then break end
            end
        end
        if truncated then break end
    end
    return {
        enabled = true,
        source = "yieldTracker",
        readState = #rows == 0 and "empty" or "ok",
        coverage = truncated and "truncated" or "complete",
        scope = "save",
        rows = rows,
    }
end

local function collectPalletDegradation()
    local farmId = activeExportFarmId()
    if farmId == nil then
        return { enabled = true, readState = "unavailable", source = "palletDegradation", reason = "no-farm" }
    end
    local meta = providerSymbol(PALLET_MODS, "PalletMetadata")
    if type(meta) ~= "table" or type(meta.records) ~= "table" then
        return { enabled = true, readState = "unavailable", source = "palletDegradation", farmId = farmId }
    end
    local nodeMap = nil
    if g_currentMission ~= nil and type(g_currentMission.nodeToObject) == "table" then
        nodeMap = g_currentMission.nodeToObject
    end
    local rows = {}
    local truncated = false
    local skipped = 0
    local seen = 0
    local seenObject = {}
    for _, record in pairs(meta.records) do
        seen = seen + 1
        if seen > 80 then
            truncated = true
            break
        end
        if type(record) == "table" then
            local owner = nil
            if nodeMap ~= nil and record.runtimeNode ~= nil then
                local object = nodeMap[record.runtimeNode]
                if type(object) == "table" then
                    owner = tonumber(object.ownerFarmId)
                    seenObject[object] = true
                end
            end
            if owner ~= farmId and owner ~= 0 then
                skipped = skipped + 1
            elseif #rows >= 40 then
                truncated = true
            else
                local perm = tonumber(record.permDamage) or 0
                rows[#rows + 1] = {
                    ownerFarmId = owner,
                    condition = math.max(0, 100 - (perm * 100)),
                    tempDamage = tonumber(record.tempDamage),
                    permDamage = tonumber(record.permDamage),
                    outside = record.isOutside == true,
                }
            end
        end
    end
    if g_server == nil and type(nodeMap) == "table" then
        for _, object in pairs(nodeMap) do
            seen = seen + 1
            if seen > 80 or #rows >= 40 then
                truncated = true
                break
            end
            if type(object) == "table" and (object.pdsHealth ~= nil or object.pdsWear ~= nil or object.pdsIsOutside ~= nil) then
                if seenObject[object] ~= true then
                    seenObject[object] = true
                    local owner = tonumber(object.ownerFarmId)
                    if owner == farmId then
                        rows[#rows + 1] = {
                            ownerFarmId = owner,
                            id = object.id ~= nil and clipText(object.id, 40) or "",
                            condition = tonumber(object.pdsHealth),
                            wear = tonumber(object.pdsWear),
                            outside = object.pdsIsOutside == true,
                            mirrored = true,
                        }
                    end
                end
            end
        end
    end
    if #rows == 0 and truncated then
        return {
            enabled = true,
            source = "palletDegradation",
            readState = "pending",
            coverage = "truncated",
            farmId = farmId,
            pallets = {},
        }
    end
    if #rows == 0 and g_server == nil then
        return {
            enabled = true,
            source = "palletDegradation",
            readState = "unavailable",
            coverage = "unsupported",
            reason = "client-records-absent",
            farmId = farmId,
            pallets = {},
        }
    end
    return {
        enabled = true,
        source = "palletDegradation",
        readState = #rows == 0 and "empty" or "ok",
        coverage = truncated and "truncated" or (skipped > 0 and "partial" or "complete"),
        farmId = farmId,
        pallets = rows,
    }
end

local function collectRealSilo()
    local farmId = activeExportFarmId()
    if farmId == nil then
        return { enabled = true, readState = "unavailable", source = "realSilo", reason = "no-farm" }
    end
    local mgr = providerSymbol(SILO_MODS, "realSiloManager")
    if type(mgr) ~= "table" or type(mgr.silos) ~= "table" then
        return { enabled = true, readState = "unavailable", source = "realSilo", farmId = farmId }
    end
    local storage = providerSymbol(SILO_MODS, "RealSiloCompartmentStorage")
    local slotMap = type(storage) == "table" and storage.siloSlots or nil
    local rows = {}
    local truncated = false
    local skipped = 0
    for uid, silo in pairs(mgr.silos) do
        if #rows >= 8 then
            truncated = true
            break
        end
        if type(silo) == "table" then
            local owner = nil
            if type(silo.placeable) == "table" then
                owner = tonumber(silo.placeable.ownerFarmId)
            end
            if owner ~= farmId and owner ~= 0 then
                skipped = skipped + 1
            else
                local cfg = type(silo.config) == "table" and silo.config or {}
                local name = ""
                if type(mgr.siloNames) == "table" then
                    name = clipText(mgr.siloNames[uid], 40) or ""
                end
                local fills = {}
                local data = type(slotMap) == "table" and slotMap[uid] or nil
                if type(data) == "table" and type(data.slots) == "table" then
                    for _, slot in ipairs(data.slots) do
                        if #fills >= 8 then
                            truncated = true
                            break
                        end
                        if type(slot) == "table" then
                            local fillType = tonumber(slot.fillType)
                            if fillType == nil and type(slot.fillType) ~= "table" and type(slot.fillType) ~= "function" then
                                fillType = nil
                            end
                            fills[#fills + 1] = {
                                index = tonumber(slot.index),
                                fillType = fillType,
                                fillLevel = tonumber(slot.fillLevel),
                                capacity = tonumber(slot.capacity),
                                isActive = slot.isActive == true,
                            }
                        end
                    end
                end
                local activeSlot = type(data) == "table" and tonumber(data.activeSlot) or nil
                local transfer = nil
                local transferState = "none"
                if type(mgr.getTransfer) == "function" then
                    local okTransfer, raw = pcall(mgr.getTransfer, uid)
                    if not okTransfer then
                        transferState = "failed"
                    elseif type(raw) == "table" then
                        transferState = "active"
                        transfer = {
                            fromSlot = tonumber(raw.fromSlot),
                            toSlot = tonumber(raw.toSlot),
                            rate = tonumber(raw.rate),
                            active = raw.active == true,
                        }
                    end
                end
                rows[#rows + 1] = {
                    id = clipText(uid, 40),
                    ownerFarmId = owner,
                    name = name,
                    compartments = tonumber(cfg.numCompartments),
                    capacityEach = tonumber(cfg.capacityPerCompartment),
                    activeSlot = activeSlot,
                    transferState = transferState,
                    transfer = transfer,
                    slots = fills,
                }
            end
        end
    end
    return {
        enabled = true,
        source = "realSilo",
        readState = #rows == 0 and "empty" or "ok",
        coverage = truncated and "truncated" or (skipped > 0 and "partial" or "complete"),
        farmId = farmId,
        silos = rows,
    }
end

local function collectFieldLeases()
    local farmId = activeExportFarmId()
    if farmId == nil then
        return { enabled = true, readState = "unavailable", source = "fieldLeasing", reason = "no-farm" }
    end
    local mgr = providerSymbol(LEASE_MODS, "g_fieldLeasingManager")
    if type(mgr) ~= "table" or type(mgr.fieldLeaseAgreements) ~= "table" then
        return { enabled = true, readState = "unavailable", source = "fieldLeasing", farmId = farmId }
    end
    local rows = {}
    local truncated = false
    local scanned = 0
    for _, agreement in pairs(mgr.fieldLeaseAgreements) do
        scanned = scanned + 1
        if scanned > 400 then
            truncated = true
            break
        end
        if type(agreement) == "table" and tonumber(agreement.farmId) == farmId then
            if #rows >= 40 then
                truncated = true
                break
            end
            rows[#rows + 1] = {
                farmlandId = tonumber(agreement.farmlandId),
                price = tonumber(agreement.price),
                duration = tonumber(agreement.duration),
            }
        end
    end
    return {
        enabled = true,
        source = "fieldLeasing",
        readState = truncated and "partial" or (#rows == 0 and "empty" or "ok"),
        coverage = truncated and "truncated" or "complete",
        farmId = farmId,
        leases = rows,
    }
end

local function collectFarmReputation()
    local farmId = activeExportFarmId()
    if farmId == nil then
        return { enabled = true, readState = "unavailable", source = "farmReputation", reason = "no-farm" }
    end
    local mgr = providerSymbol(REPUTATION_MODS, "ReputationManager")
    if type(mgr) ~= "table" or type(mgr.reputationByFarm) ~= "table" then
        return { enabled = true, readState = "unavailable", source = "farmReputation", farmId = farmId }
    end
    local score = mgr.reputationByFarm[farmId]
    if score == nil then
        score = mgr.reputationByFarm[tostring(farmId)]
    end
    if score == nil then
        return { enabled = true, readState = "empty", source = "farmReputation", farmId = farmId, scope = "farm" }
    end
    score = tonumber(score)
    if score == nil then
        return { enabled = true, readState = "failed", source = "farmReputation", farmId = farmId }
    end
    local missionLimit = nil
    local rewardBonus = nil
    if type(mgr.ranks) == "table" then
        for _, rank in ipairs(mgr.ranks) do
            if type(rank) == "table" and tonumber(rank.min) ~= nil and score >= tonumber(rank.min) then
                missionLimit = tonumber(rank.missionLimit)
                rewardBonus = tonumber(rank.rewardBonus)
            end
        end
    end
    return {
        enabled = true,
        source = "farmReputation",
        readState = "ok",
        scope = "farm",
        farmId = farmId,
        reputation = score,
        missionLimit = missionLimit,
        rewardBonus = rewardBonus,
    }
end

-- Finite, non-negative observations only. Missing values never become zero.
local function observedNumber(value)
    if type(value) ~= "number" or value ~= value or value == math.huge or value == -math.huge or value < 0 then return nil end
    return value
end

local OWNED_PLACEABLE_SCAN = 400

-- uniqueId -> true for placeables whose owner is exactly farmId. Unknown owners are left out.
local function ownedUniqueIds(farmId)
    local mission = _G.g_currentMission
    local system = mission and mission.placeableSystem
    local list = system and system.placeables
    if farmId == nil or type(list) ~= "table" then
        return nil, false
    end
    local owned, known = {}, {}
    local uncertain = false
    local seen = 0
    for _, placeable in pairs(list) do
        seen = seen + 1
        if seen > OWNED_PLACEABLE_SCAN then
            return owned, true, known
        end
        if type(placeable) == "table" and placeable.uniqueId ~= nil then
            local owner = nil
            if type(placeable.getOwnerFarmId) == "function" then
                local ok, value = pcall(placeable.getOwnerFarmId, placeable)
                owner = ok and tonumber(value) or nil
            else
                owner = tonumber(placeable.ownerFarmId)
            end
            if owner ~= nil and owner > 0 and owner % 1 == 0 then known[tostring(placeable.uniqueId)] = true else uncertain = true end
            if owner == farmId then
                owned[tostring(placeable.uniqueId)] = true
            end
        end
    end
    return owned, uncertain, known
end

local function fillTypeNameOf(index)
    local ftm = _G.g_fillTypeManager
    if index == nil or type(ftm) ~= "table" or type(ftm.getFillTypeNameByIndex) ~= "function" then
        return nil
    end
    local ok, name = pcall(ftm.getFillTypeNameByIndex, ftm, index)
    if ok and type(name) == "string" and name ~= "" then
        return name
    end
    return nil
end

local function fillTypeIndexOf(name)
    local ftm = _G.g_fillTypeManager
    if name == nil or type(ftm) ~= "table" or type(ftm.getFillTypeIndexByName) ~= "function" then
        return nil
    end
    local ok, index = pcall(ftm.getFillTypeIndexByName, ftm, name)
    return ok and tonumber(index) or nil
end

local MOISTURE_OBJECT_SCAN = 80
local MOISTURE_FILL_SCAN = 40
local MOISTURE_WARNING_LIMIT = 12

-- MoistureSystem.currentMoisturePercent is a 0..1 fraction (main.lua firstLoad / msSetMoisture divide by 100).
-- Stored-goods warnings are grade C or D from CropValueMap.getQualityGrade, owned placeables only.
local function collectMoistureSystem()
    local sys = providerSymbol(MOISTURE_MODS, "MoistureSystem")
    if type(sys) ~= "table" then
        return { enabled = true, readState = "unavailable", source = "moistureSystem" }
    end
    if sys.missionStarted == false then
        return { enabled = true, readState = "pending", source = "moistureSystem", scope = "map" }
    end
    local fraction = observedNumber(sys.currentMoisturePercent)
    if fraction == nil or fraction < 0 or fraction > 1 then
        return { enabled = true, readState = "failed", source = "moistureSystem", scope = "map", reason = "moisture-scale" }
    end
    local out = {
        enabled = true,
        source = "moistureSystem",
        readState = "ok",
        scope = "map",
        mapMoisturePercent = math.floor(fraction * 1000 + 0.5) / 10,
    }
    local farmId = activeExportFarmId()
    local cropMap = providerSymbol(MOISTURE_MODS, "CropValueMap")
    if farmId == nil then
        out.storedGoods = { readState = "unavailable", reason = "no-farm" }
        return out
    end
    if type(sys.objectInfo) ~= "table" or type(cropMap) ~= "table" or type(cropMap.getQualityGrade) ~= "function" then
        out.storedGoods = { readState = "unavailable", farmId = farmId }
        return out
    end
    local owned, ownedTruncated, known = ownedUniqueIds(farmId)
    if owned == nil then
        out.storedGoods = { readState = "unavailable", farmId = farmId, reason = "no-placeables" }
        return out
    end
    local warnings = {}
    local gradeFailed, gradeUnavailable = false, false
    local truncated = ownedTruncated
    local objects = 0
    for uniqueId, fills in pairs(sys.objectInfo) do
        objects = objects + 1
        if objects > MOISTURE_OBJECT_SCAN then
            truncated = true
            break
        end
        if not known[tostring(uniqueId)] then truncated = true end
        if owned[tostring(uniqueId)] and type(fills) ~= "table" then gradeFailed = true end
        if owned[tostring(uniqueId)] and type(fills) == "table" then
            local rows = 0
            for fillTypeName, info in pairs(fills) do
                rows = rows + 1
                if rows > MOISTURE_FILL_SCAN then
                    truncated = true
                    break
                end
                local quality = type(info) == "table" and observedNumber(info.quality) or nil
                local index = fillTypeIndexOf(fillTypeName)
                if quality ~= nil and quality <= 100 and index ~= nil then
                    local okGrade, grade = pcall(cropMap.getQualityGrade, index, quality)
                    if not okGrade then gradeFailed = true end
                    grade = okGrade and observedNumber(grade) or nil
                    if grade == nil then gradeUnavailable = true
                    elseif grade < 1 or grade > 4 or grade % 1 ~= 0 then gradeFailed = true
                    elseif grade >= 3 then
                        if #warnings >= MOISTURE_WARNING_LIMIT then
                            truncated = true
                            break
                        end
                        warnings[#warnings + 1] = {
                            fillType = tostring(fillTypeName),
                            qualityPercent = quality,
                            moisturePercent = observedNumber(info.moisture) and info.moisture <= 1 and math.floor(info.moisture * 1000 + 0.5) / 10 or nil,
                            grade = grade,
                        }
                    end
                else
                    gradeFailed = true
                end
            end
        end
    end
    out.storedGoods = {
        readState = #warnings > 0 and "ok" or (gradeFailed and "failed" or (gradeUnavailable and "unavailable" or "empty")),
        coverage = (truncated or gradeFailed or gradeUnavailable) and "truncated" or "complete",
        reason = gradeFailed and "grade-failed" or (gradeUnavailable and "grade-unavailable" or nil),
        scope = "farm",
        farmId = farmId,
        warnings = warnings,
    }
    return out
end

local DIST_MODE_KEYS = {
    [0] = "inherit", [1] = "hold", [2] = "distribute", [3] = "distributeSell", [4] = "sell",
    [5] = "distributeStore", [6] = "store", [7] = "transferMarket", [8] = "distributeMarket", [9] = "holdInternal",
}
local DIST_ASSET_SCAN = 80
local DIST_FILL_SCAN = 40
local DIST_ROW_LIMIT = 24

-- SmartDistribution.settings = S (SmartDistribution.lua 79). S.global is save-wide; S.assets[uid][ft] = mode
-- and S.lastCycle[uid][ft] = { dist, sold, stored, received } are per placeable and stay farm-private.
local function collectDistributionRedux()
    local dist = providerSymbol(DIST_MODS, "SmartDistribution")
    local settings = type(dist) == "table" and dist.settings or nil
    local global = type(settings) == "table" and settings.global or nil
    if type(global) ~= "table" then
        return { enabled = true, readState = "unavailable", source = "distributionRedux" }
    end
    local mode = observedNumber(global.mode)
    if mode == nil or DIST_MODE_KEYS[mode] == nil then
        return { enabled = true, readState = "failed", source = "distributionRedux", scope = "global" }
    end
    local participation = observedNumber(global.participation)
    local activity = "unknown"
    if settings.master == false then activity = "disabled"
    elseif participation == 3 then activity = "none"
    elseif settings.master == true and (participation == 1 or participation == 2) then activity = "active" end
    local out = {
        enabled = true, source = "distributionRedux", readState = "ok", scope = "global",
        masterEnabled = type(settings.master) == "boolean" and settings.master or nil,
        activity = activity, participation = participation,
        mode = mode, modeKey = DIST_MODE_KEYS[mode],
        radius = observedNumber(global.radius), bufferHours = observedNumber(global.bufferHours),
        sellEnabled = type(global.sellEnabled) == "boolean" and global.sellEnabled or nil,
    }
    -- Explicit false is an observation; Lua's and/or idiom cannot preserve it.
    if type(settings.master) == "boolean" then out.masterEnabled = settings.master end
    if type(global.sellEnabled) == "boolean" then out.sellEnabled = global.sellEnabled end
    local farmId = activeExportFarmId()
    local owned, ownedTruncated = ownedUniqueIds(farmId)
    if owned == nil then
        out.farmAssets = { readState = "unavailable", reason = farmId == nil and "no-farm" or "no-placeables" }
        return out
    end
    local function scan(bucket, take, absent)
        local result = { scope = "farm", farmId = farmId, coverage = ownedTruncated and "truncated" or "complete", rows = {} }
        if bucket == nil then result.readState = absent result.coverage = "truncated" return result end
        if type(bucket) ~= "table" then result.readState = "failed" result.coverage = "truncated" return result end
        local assets, failed = 0, false
        for uniqueId, byFill in pairs(bucket) do
            assets = assets + 1
            if assets > DIST_ASSET_SCAN then result.coverage = "truncated" break end
            if owned[tostring(uniqueId)] then
                if type(byFill) ~= "table" then failed = true else
                    local count = 0
                    for fillType, value in pairs(byFill) do
                        count = count + 1
                        if count > DIST_FILL_SCAN or #result.rows >= DIST_ROW_LIMIT then result.coverage = "truncated" break end
                        local index = tonumber(fillType)
                        local name = index and index > 0 and index % 1 == 0 and fillTypeNameOf(index) or nil
                        local row = name and take(value) or nil
                        if row then
                            row.uniqueId = tostring(uniqueId) row.fillType = name
                            result.rows[#result.rows + 1] = row
                        else failed = true end
                    end
                end
            end
        end
        if failed then result.coverage = "truncated" result.reason = "malformed-rows" end
        result.readState = #result.rows > 0 and "ok" or (failed and "failed" or "empty")
        return result
    end
    local overrides = scan(settings.assets, function(value)
        local m = observedNumber(value)
        return m and DIST_MODE_KEYS[m] and { mode = m, modeKey = DIST_MODE_KEYS[m] } or nil
    end, "unavailable")
    local mission = _G.g_currentMission
    local isClient = false
    if missionIsMultiplayer() then
        local server = mission and mission.isServer
        if mission and type(mission.getIsServer) == "function" then
            local ok, value = pcall(mission.getIsServer, mission)
            server = ok and value or nil
        end
        isClient = server ~= true and _G.g_server == nil
    end
    local history
    if isClient then
        history = { scope = "farm", farmId = farmId, readState = "unavailable", coverage = "truncated", reason = "client-history", rows = {} }
    else
        history = scan(settings.lastCycle, function(value)
            if type(value) ~= "table" then return nil end
            local d, s, t, r = observedNumber(value.dist), observedNumber(value.sold), observedNumber(value.stored), observedNumber(value.received)
            if d == nil or s == nil or t == nil or r == nil then return nil end
            return { distributedLiters = d, soldLiters = s, storedLiters = t, receivedLiters = r }
        end, "pending")
        if settings.lastCycle == nil then history.reason = "first-pass" end
    end
    history.window = "last-completed-cycle"
    history.retained = activity ~= "active"
    out.farmAssets = {
        readState = "ok", scope = "farm", farmId = farmId,
        coverage = overrides.coverage == "complete" and history.coverage == "complete" and "complete" or "truncated",
        overrides = overrides.rows, lastCycle = history.rows,
        overridesReading = overrides, history = history,
    }
    return out
end

-- Compaction_Monitor.lua 451-470: line1 = "Compacted: %d%% (Vol: %d L)", line3 = "Est. Time: ..." while
-- Chowkidar.showHUD is true (local controlled vehicle in a filling bunker). Bunker fill, compaction and
-- fermentation for every owned bunker already come from the native storage scan (InventoryScan).
local function collectSilageCompaction()
    if missionIsMultiplayer() or _G.g_dedicatedServer ~= nil then
        return { enabled = true, readState = "unavailable", source = "silageCompactionMonitor", reason = "hud-not-farm-scoped" }
    end
    local farmId = activeExportFarmId()
    if farmId == nil then
        return { enabled = true, readState = "unavailable", source = "silageCompactionMonitor", reason = "no-farm" }
    end
    local hud = providerSymbol(SILAGE_MODS, "Chowkidar")
    if type(hud) ~= "table" or type(hud.info) ~= "table" then
        return { enabled = true, readState = "unavailable", source = "silageCompactionMonitor", farmId = farmId }
    end
    if hud.showHUD ~= true then
        return { enabled = true, readState = "empty", source = "silageCompactionMonitor", scope = "player-hud", farmId = farmId, reason = "hud-hidden" }
    end
    local estimate = clipText(hud.info.line3, 80)
    return {
        enabled = true,
        source = "silageCompactionMonitor",
        readState = "ok",
        scope = "player-hud",
        farmId = farmId,
        context = clipText(hud.info.line1, 80),
        status = clipText(hud.info.line2, 80),
        estimate = string.sub(estimate, 1, 9) == "Est. Time" and estimate or nil,
    }
end

local FACTORY_POINT_SCAN = 40
local FACTORY_RECIPE_SCAN = 40
local FACTORY_IO_SCAN = 16
local FACTORY_LINE_LIMIT = 12

local function pointOwnerFarmId(point)
    if type(point.getOwnerFarmId) == "function" then
        local ok, value = pcall(point.getOwnerFarmId, point)
        return ok and tonumber(value) or nil
    end
    local placeable = point.owningPlaceable
    if type(placeable) == "table" and type(placeable.getOwnerFarmId) == "function" then
        local ok, value = pcall(placeable.getOwnerFarmId, placeable)
        return ok and tonumber(value) or nil
    end
    return nil
end

local function storageRead(storage, method, fillType)
    if type(storage) ~= "table" or type(storage[method]) ~= "function" or fillType == nil then
        return nil
    end
    local ok, value = pcall(storage[method], storage, fillType)
    return ok and observedNumber(value) or nil
end

local function priceRead(fn, fillType)
    if type(fn) ~= "function" or fillType == nil then
        return nil
    end
    local ok, value = pcall(fn, fillType)
    value = ok and observedNumber(value) or nil
    if value == nil or value <= 0 then
        return nil
    end
    return value
end

-- Recipe list: ProductionChainManager:getProductionPointsForFarmId (native). FactoryDataProvider is never
-- called because its getProductionPoints stamps point.fpc_placeable. FactoryProfitMath (FS25_368477 1.0.x)
-- supplies the month basis (cyclesPerHour * 24, costsPerActiveMonth) and two read-only quotes per 1000 l:
-- getPurchasePrice (cheapest buying station) and getPeakPrice (theoretical peak). Both memoize into
-- FactoryProfitMath caches only. Current selling value is priced in the renderer from economy.marketPrices.
local function collectFactoryProfit()
    local farmId = activeExportFarmId()
    if farmId == nil then
        return { enabled = true, readState = "unavailable", source = "factoryProfitCalculator", reason = "no-farm" }
    end
    local profitMath = providerSymbol(FACTORY_MODS, "FactoryProfitMath")
    if type(profitMath) ~= "table" or type(profitMath.getCyclesPerMonth) ~= "function" or type(profitMath.getUpkeepPerMonth) ~= "function" then
        return { enabled = true, readState = "unavailable", source = "factoryProfitCalculator", farmId = farmId, reason = "no-profit-math" }
    end
    local mission = _G.g_currentMission
    local pcm = mission and mission.productionChainManager
    if type(pcm) ~= "table" or type(pcm.getProductionPointsForFarmId) ~= "function" then
        return { enabled = true, readState = "pending", source = "factoryProfitCalculator", scope = "farm", farmId = farmId, reason = "no-production-list" }
    end
    local okPoints, points = pcall(pcm.getProductionPointsForFarmId, pcm, farmId)
    if not okPoints or type(points) ~= "table" then
        return { enabled = true, readState = "failed", source = "factoryProfitCalculator", scope = "farm", farmId = farmId }
    end
    local lines = {}
    local truncated = false
    local failed = false
    local scannedPoints = 0
    local function ioRows(entries, cycles, storage, quoteFn, quoteKey)
        local rows = {}
        local reading = { readState = "ok", coverage = "complete" }
        if type(entries) ~= "table" then
            reading.readState = entries == nil and "unavailable" or "failed"
            reading.coverage = "truncated"
            truncated = true
            return rows, reading
        end
        local seen, invalid = 0, false
        for _, entry in pairs(entries) do
            seen = seen + 1
            if seen > FACTORY_IO_SCAN then reading.coverage = "truncated" truncated = true break end
            local fillType = type(entry) == "table" and observedNumber(entry.type) or nil
            local amount = type(entry) == "table" and observedNumber(entry.amount) or nil
            local name = fillType and fillType > 0 and fillType % 1 == 0 and fillTypeNameOf(fillType) or nil
            local monthly = amount and cycles and observedNumber(amount * cycles) or nil
            if name == nil or amount == nil or monthly == nil then invalid = true else
                rows[#rows + 1] = {
                    fillType = name, fillTypeIndex = fillType, perCycleLiters = amount, monthlyLiters = monthly,
                    capacityLiters = storageRead(storage, "getCapacity", fillType),
                    fillLevelLiters = storageRead(storage, "getFillLevel", fillType),
                    [quoteKey] = priceRead(quoteFn, fillType),
                }
            end
        end
        if invalid then reading.readState = "failed" reading.coverage = "truncated" truncated = true
        elseif #rows == 0 then
            -- Native ProductionPoint.load rejects missing input rows and reports missing outputs.
            -- An observed empty recipe side is known malformed, not proof of an optional free input.
            reading.readState = "failed"
            reading.reason = "required-io-empty"
            reading.observedCount = 0
            truncated = true
        end
        return rows, reading
    end
    for _, point in pairs(points) do
        scannedPoints = scannedPoints + 1
        if scannedPoints > FACTORY_POINT_SCAN then
            truncated = true
            break
        end
        if type(point) == "table" and pointOwnerFarmId(point) == farmId then
            local stampBefore = rawget(point, "fpc_placeable")
            local placeable = point.owningPlaceable
            local pointId = type(placeable) == "table" and placeable.uniqueId ~= nil and tostring(placeable.uniqueId) or nil
            local pointName = nil
            if type(point.getName) == "function" then
                local okName, value = pcall(point.getName, point)
                pointName = okName and value ~= nil and clipText(value, 60) or nil
            end
            local recipes = 0
            if type(point.productions) ~= "table" then failed = true end
            for _, production in pairs(type(point.productions) == "table" and point.productions or {}) do
                recipes = recipes + 1
                if recipes > FACTORY_RECIPE_SCAN then
                    truncated = true
                    break
                end
                if type(production) == "table" then
                    if #lines >= FACTORY_LINE_LIMIT then
                        truncated = true
                        break
                    end
                    local okCycles, cycles = pcall(profitMath.getCyclesPerMonth, production)
                    local okUpkeep, upkeep = pcall(profitMath.getUpkeepPerMonth, production)
                    local rawCycles = production.cyclesPerHour
                    if rawCycles == nil then rawCycles = production.cyclesPerHourOriginal end
                    if rawCycles == nil or rawCycles == 0 then
                        if production.cyclesPerMonth ~= nil then rawCycles = production.cyclesPerMonth end
                    end
                    local rawUpkeep = production.costsPerActiveMonth
                    if rawUpkeep == nil then rawUpkeep = production.costsPerActiveHour end
                    cycles = okCycles and observedNumber(rawCycles) and observedNumber(cycles) or nil
                    upkeep = okUpkeep and observedNumber(rawUpkeep) and observedNumber(upkeep) or nil
                    local inputs, inputReading = ioRows(production.inputs, cycles, point.storage, profitMath.getPurchasePrice, "purchasePricePer1000")
                    local outputs, outputReading = ioRows(production.outputs, cycles, point.storage, profitMath.getPeakPrice, "theoreticalPeakPer1000")
                    local recipeId = type(production.id) == "string" and production.id ~= "" and production.id or nil
                    local valid = cycles ~= nil and upkeep ~= nil and pointId ~= nil and pointId ~= "" and recipeId ~= nil
                    if not valid then truncated = true end
                    lines[#lines + 1] = {
                        pointId = pointId, pointName = pointName,
                        recipeId = recipeId,
                        recipeName = production.name ~= nil and clipText(production.name, 60) or nil,
                        readState = valid and "ok" or "failed",
                        coverage = valid and inputReading.coverage == "complete" and outputReading.coverage == "complete" and "complete" or "truncated",
                        cyclesPerMonth = cycles, upkeepPerMonth = upkeep,
                        inputs = inputs, outputs = outputs, inputReading = inputReading, outputReading = outputReading,
                    }
                else
                    failed = true
                end
            end
            if rawget(point, "fpc_placeable") ~= stampBefore then
                return { enabled = true, readState = "failed", source = "factoryProfitCalculator", scope = "farm", farmId = farmId, reason = "point-mutated" }
            end
        end
    end
    if failed and #lines == 0 then
        return { enabled = true, readState = "failed", source = "factoryProfitCalculator", scope = "farm", farmId = farmId }
    end
    return {
        enabled = true,
        source = "factoryProfitCalculator",
        readState = #lines == 0 and "empty" or "ok",
        coverage = (truncated or failed) and "truncated" or "complete",
        scope = "farm",
        farmId = farmId,
        period = "month",
        periodBasis = "activeHours24",
        lines = lines,
    }
end

local function collectRentYourField()
    local farmId = activeExportFarmId()
    if farmId == nil then
        return { enabled = true, readState = "unavailable", source = "rentYourField", reason = "no-farm" }
    end
    local mgr = providerSymbol(RENT_MODS, "g_rentYourFieldManager")
    if type(mgr) ~= "table" or type(mgr.rentAgreements) ~= "table" then
        return { enabled = true, readState = "unavailable", source = "rentYourField", farmId = farmId }
    end
    local rows = {}
    local truncated = false
    local seen = 0
    for _, agreement in pairs(mgr.rentAgreements) do
        seen = seen + 1
        if seen > 80 then
            truncated = true
            break
        end
        if type(agreement) == "table" and tonumber(agreement.farmId) == farmId then
            if #rows >= 40 then
                truncated = true
                break
            end
            rows[#rows + 1] = {
                farmlandId = tonumber(agreement.farmlandId),
                duration = tonumber(agreement.duration),
            }
        end
    end
    return {
        enabled = true,
        source = "rentYourField",
        readState = #rows == 0 and "empty" or "ok",
        coverage = truncated and "truncated" or "complete",
        scope = "farm",
        farmId = farmId,
        minDuration = tonumber(mgr.minDuration),
        monthlyIncomePercent = tonumber(mgr.monthlyIncomePercent),
        agreements = rows,
    }
end

local function marketTouchesFarm(row, farmId)
    if type(row) ~= "table" then
        return false
    end
    return tonumber(row.sellerFarmId) == farmId
        or tonumber(row.targetFarmId) == farmId
        or tonumber(row.lessorFarmId) == farmId
        or tonumber(row.lesseeFarmId) == farmId
end

local function collectFarmlandMarketplace()
    local farmId = activeExportFarmId()
    if farmId == nil then
        return { enabled = true, readState = "unavailable", source = "farmlandMarketplace", reason = "no-farm" }
    end
    local host = providerSymbol(MARKET_MODS, "FlaechenVermarktung")
    local mgr = type(host) == "table" and host.manager or nil
    local state = type(mgr) == "table" and mgr.state or nil
    if type(state) ~= "table" then
        return { enabled = true, readState = "unavailable", source = "farmlandMarketplace", farmId = farmId }
    end
    local rows = {}
    local truncated = false
    local function take(bucket, kind, priceKey)
        if type(bucket) ~= "table" or truncated then
            return
        end
        local seen = 0
        for _, row in pairs(bucket) do
            seen = seen + 1
            if seen > 40 or #rows >= 20 then
                truncated = true
                break
            end
            if marketTouchesFarm(row, farmId) then
                rows[#rows + 1] = {
                    kind = kind,
                    farmlandId = tonumber(row.farmlandId),
                    price = tonumber(row[priceKey]),
                }
            end
        end
    end
    take(state.saleOffers, "sale", "price")
    take(state.leaseOffers, "lease-offer", "ratePerPeriod")
    take(state.leases, "lease", "ratePerPeriod")
    return {
        enabled = true,
        source = "farmlandMarketplace",
        readState = #rows == 0 and "empty" or "ok",
        coverage = truncated and "truncated" or "complete",
        scope = "farm",
        farmId = farmId,
        rows = rows,
    }
end

local function collectFarmOperations()
    local farmId = activeExportFarmId()
    if farmId == nil then
        return { enabled = true, readState = "unavailable", source = "farmOperationsDashboard", reason = "no-farm" }
    end
    local dash = providerSymbol(OPS_MODS, "g_farmOperationsDashboard")
    if type(dash) ~= "table" or type(dash.hudFieldData) ~= "table" then
        return { enabled = true, readState = "unavailable", source = "farmOperationsDashboard", farmId = farmId }
    end
    local fm = _G.g_farmlandManager
    if type(fm) ~= "table" or type(fm.getFarmlandOwner) ~= "function" then
        return { enabled = true, readState = "unavailable", source = "farmOperationsDashboard", farmId = farmId, reason = "no-owner-index" }
    end
    local rows = {}
    local truncated = false
    local seen = 0
    local failed = false
    for _, row in pairs(dash.hudFieldData) do
        seen = seen + 1
        if seen > 40 or #rows >= 12 then
            truncated = true
            break
        end
        if type(row) == "table" then
            local farmlandId = tonumber(row.farmlandId)
            local okOwner, owner = pcall(function()
                return fm:getFarmlandOwner(farmlandId)
            end)
            if not okOwner then
                failed = true
                break
            end
            if tonumber(owner) == farmId then
                rows[#rows + 1] = {
                    farmlandId = farmlandId,
                    growthState = tonumber(row.growthState),
                    harvestMultiplier = tonumber(row.harvestMultiplier),
                }
            end
        end
    end
    if failed then
        return { enabled = true, readState = "failed", source = "farmOperationsDashboard", farmId = farmId }
    end
    return {
        enabled = true,
        source = "farmOperationsDashboard",
        readState = #rows == 0 and "empty" or "ok",
        coverage = truncated and "truncated" or "complete",
        scope = "farm",
        farmId = farmId,
        fields = rows,
    }
end

local AM_MODS = { "FS25_AdvancedMaintenance", "FS25_307003_Advanced_Maintenance" }
local EVM_MODS = { "FS25_ExtendedVehicleMaintenance", "FS25_363077_Extended_Vehicle_Maintenance" }
local RVS_MODS = { "FS25_RealisticVehicleService", "FS25_359741_Realistic_Vehicle_Service" }

local function vehicleKey(vehicle)
    if type(vehicle) ~= "table" then
        return ""
    end
    if vehicle.id ~= nil then
        return clipText(vehicle.id, 64)
    end
    if vehicle.uniqueId ~= nil then
        return clipText(vehicle.uniqueId, 64)
    end
    return ""
end

local function vehicleName(vehicle)
    if type(vehicle.getName) ~= "function" then
        return ""
    end
    local ok, value = pcall(function()
        return vehicle:getName()
    end)
    if not ok then
        return ""
    end
    return clipText(value, 40)
end

local function walkOwnedVehicles(farmId, accept)
    local mission = _G.g_currentMission
    local list = mission and mission.vehicleSystem and mission.vehicleSystem.vehicles
    if type(list) ~= "table" then
        return nil
    end
    local rows = {}
    local truncated = false
    local pending = false
    local scanned = 0
    local function consider(vehicle)
        scanned = scanned + 1
        if scanned > 40 or #rows >= 12 then
            truncated = true
            return false
        end
        if type(vehicle) == "table" and tonumber(vehicle.ownerFarmId) == farmId then
            local row = accept(vehicle)
            if row == false then
                return "failed"
            end
            if row == "pending" then
                pending = true
            elseif type(row) == "table" then
                rows[#rows + 1] = row
            end
        end
        return true
    end
    if #list > 0 then
        for _, vehicle in ipairs(list) do
            local step = consider(vehicle)
            if step == "failed" then
                return false
            end
            if step == false then
                break
            end
        end
    else
        for _, vehicle in pairs(list) do
            local step = consider(vehicle)
            if step == "failed" then
                return false
            end
            if step == false then
                break
            end
        end
    end
    local state = "ok"
    if #rows == 0 and (pending or truncated) then
        state = "pending"
    elseif #rows == 0 then
        state = "empty"
    end
    local coverage = "complete"
    if truncated then
        coverage = "truncated"
    elseif pending then
        coverage = "partial"
    end
    return { rows = rows, state = state, coverage = coverage }
end

local function vehicleHasAdvancedMaintenance(vehicle, classRef)
    if classRef ~= nil and type(vehicle.specializations) == "table" then
        for _, spec in pairs(vehicle.specializations) do
            if spec == classRef then
                return true
            end
        end
    end
    return vehicle.spec_AdvancedMaintenance ~= nil
end

local function finiteDamage(value)
    local damage = tonumber(value)
    if damage == nil or damage ~= damage or damage == math.huge or damage == -math.huge then
        return nil
    end
    return damage
end

local function collectAdvancedMaintenance()
    local farmId = activeExportFarmId()
    if farmId == nil then
        return { enabled = true, readState = "unavailable", source = "advancedMaintenance", reason = "no-farm" }
    end
    local classRef = providerSymbol(AM_MODS, "AdvancedMaintenance")
    if classRef == nil then
        return { enabled = true, readState = "unavailable", source = "advancedMaintenance", farmId = farmId }
    end
    local walked = walkOwnedVehicles(farmId, function(vehicle)
        if not vehicleHasAdvancedMaintenance(vehicle, classRef) then
            return nil
        end
        if type(vehicle.getDamageAmount) ~= "function" then
            return "pending"
        end
        local ok, raw = pcall(function()
            return vehicle:getDamageAmount()
        end)
        if not ok then
            return false
        end
        local damage = finiteDamage(raw)
        if damage == nil then
            return "pending"
        end
        if damage ~= 1 then
            return nil
        end
        return {
            id = vehicleKey(vehicle),
            name = vehicleName(vehicle),
            startBlocked = true,
        }
    end)
    if walked == nil then
        return { enabled = true, readState = "unavailable", source = "advancedMaintenance", farmId = farmId, reason = "no-vehicle-list" }
    end
    if walked == false then
        return { enabled = true, readState = "failed", source = "advancedMaintenance", farmId = farmId }
    end
    return {
        enabled = true,
        source = "advancedMaintenance",
        readState = walked.state,
        coverage = walked.coverage,
        scope = "farm",
        farmId = farmId,
        pinnedVersion = "1.0.2.0",
        machines = walked.rows,
    }
end

local function collectExtendedVehicleMaintenance()
    local farmId = activeExportFarmId()
    if farmId == nil then
        return { enabled = true, readState = "unavailable", source = "extendedVehicleMaintenance", reason = "no-farm" }
    end
    if providerSymbol(EVM_MODS, "ExtendedVehicleMaintenance") == nil then
        return { enabled = true, readState = "unavailable", source = "extendedVehicleMaintenance", farmId = farmId }
    end
    local walked = walkOwnedVehicles(farmId, function(vehicle)
        local spec = vehicle.spec_extendedVehicleMaintenance
        if type(spec) ~= "table" then
            return nil
        end
        if spec._runtimeCreated ~= true then
            return "pending"
        end
        local ok, row = pcall(function()
            return {
                id = vehicleKey(vehicle),
                name = vehicleName(vehicle),
                hoursPool = tonumber(spec.hoursPool),
                serviceActive = spec.isServiceActive == true,
                serviceRemainingMs = tonumber(spec.serviceRemainingGameMs),
                failureType = clipText(spec.failureType, 40),
                failureSeverity = tonumber(spec.failureSeverity),
            }
        end)
        if not ok then
            return false
        end
        return row
    end)
    if walked == nil then
        return { enabled = true, readState = "unavailable", source = "extendedVehicleMaintenance", farmId = farmId, reason = "no-vehicle-list" }
    end
    if walked == false then
        return { enabled = true, readState = "failed", source = "extendedVehicleMaintenance", farmId = farmId }
    end
    return {
        enabled = true,
        source = "extendedVehicleMaintenance",
        readState = walked.state,
        coverage = walked.coverage,
        scope = "farm",
        farmId = farmId,
        pinnedVersion = "1.0.0.0",
        machines = walked.rows,
    }
end

local LEDGER_MODS = { "FS25_FieldProfitabilityLedger", "FS25_369866_Field_Profitability_Ledger" }
local LEDGER_HEADER_CAP = 8
local LEDGER_TOTAL_CAP = 12
local LEDGER_TOTAL_SCAN_CAP = 64
local LEDGER_UNITS = { money = true, litres = true, hectares = true, milliseconds = true, ratio = true }
local LEDGER_CLASSES = { Observed = true, Direct = true, Valued = true, Allocated = true, Estimated = true }
-- queryCycle rebuilds per-cycle indexes on first use; only the rows the card shows are queried.
local LEDGER_QUERY_CAP = 3

local function ledgerHeaderText(value, maxLen)
    if type(value) ~= "string" then
        return nil
    end
    return clipText(value, maxLen)
end

local function ledgerSales()
    return { present = false, reason = "no-sale-category" }
end

local function ledgerCopyTotals(query)
    if type(query) ~= "table" or type(query.categoryTotals) ~= "table" then
        return nil
    end
    local accepted, totals = {}, {}
    local count, scanned, rejected, indexed, maxIndex = 0, 0, 0, 0, 0
    local budgetExceeded = false
    for index, total in pairs(query.categoryTotals) do
        count = count + 1
        -- One lookahead establishes a lower bound without scanning unbounded rejected rows.
        if count > LEDGER_TOTAL_SCAN_CAP then budgetExceeded = true break end
        scanned = scanned + 1
        local validIndex = type(index) == "number" and index >= 1 and index == math.floor(index)
        if validIndex then indexed = indexed + 1 maxIndex = math.max(maxIndex, index) end
        local amount = type(total) == "table" and total.amount or nil
        local valid = validIndex and type(amount) == "number" and amount == amount and amount ~= math.huge and amount ~= -math.huge
            and LEDGER_CLASSES[total.accountingClass] == true and LEDGER_UNITS[total.unit] == true
            and type(total.category) == "string" and #total.category <= 48 and total.category:match("^[A-Za-z][A-Za-z0-9_-]*$") ~= nil
            and (total.direction == nil or total.direction == "expense" or total.direction == "incomeValue")
        if valid then
            accepted[#accepted + 1] = { index = index, value = {
                accountingClass = total.accountingClass, category = total.category,
                unit = total.unit, direction = total.direction, amount = amount,
            } }
        else
            rejected = rejected + 1
        end
    end
    table.sort(accepted, function(a, b) return a.index < b.index end)
    for i = 1, math.min(#accepted, LEDGER_TOTAL_CAP) do totals[i] = accepted[i].value end
    local truncated = budgetExceeded or #accepted > LEDGER_TOTAL_CAP
    return {
        totals = totals, totalsRead = "ok",
        totalsCoverage = truncated and "truncated" or (rejected > 0 or maxIndex > indexed) and "partial" or "complete",
        totalsCount = count, totalsCountExact = not budgetExceeded,
        totalsScanned = scanned, totalsRejected = rejected, totalsTruncated = truncated,
    }
end

local function ledgerQuerySummary(runtime, cycleId)
    if type(cycleId) ~= "string" or cycleId == "" or type(runtime.queryCycle) ~= "function" then
        return { totalsRead = "unavailable", totals = {} }
    end
    local ok, query, reason = pcall(function()
        return runtime.queryCycle(cycleId, {
            includeExcluded = false,
            includeLive = false,
            recordLimit = 0,
        })
    end)
    if ok and query == nil and reason == "runtimeInactive" then
        return { totalsRead = "pending", totals = {} }
    end
    if not ok or type(query) ~= "table" then
        return { totalsRead = "failed", totals = {} }
    end
    local copied, summary = pcall(ledgerCopyTotals, query)
    if not copied or summary == nil then
        return { totalsRead = "failed", totals = {} }
    end
    return summary
end

local function collectFieldProfitabilityLedger()
    if missionIsMultiplayer() then
        return {
            enabled = true,
            readState = "unavailable",
            source = "fieldProfitabilityLedger",
            reason = "mp-disabled",
            singlePlayerOnly = true,
            sales = ledgerSales(),
        }
    end
    local ns = providerSymbol(LEDGER_MODS, "FieldProfitabilityLedger")
    if type(ns) ~= "table" then
        return { enabled = true, readState = "unavailable", source = "fieldProfitabilityLedger", singlePlayerOnly = true, sales = ledgerSales() }
    end
    local runtime = type(ns.Runtime) == "table" and ns.Runtime.SinglePlayerRuntime or nil
    if type(runtime) ~= "table" or type(runtime.listCycles) ~= "function" then
        return { enabled = true, readState = "unavailable", source = "fieldProfitabilityLedger", singlePlayerOnly = true, sales = ledgerSales() }
    end
    local farmId = activeExportFarmId()
    if farmId == nil then
        return {
            enabled = true,
            readState = "unavailable",
            source = "fieldProfitabilityLedger",
            reason = "no-farm",
            singlePlayerOnly = true,
            sales = ledgerSales(),
        }
    end
    local ok, listed, reason = pcall(function()
        return runtime.listCycles({
            farmId = farmId,
            newestFirst = true,
            offset = 0,
            limit = LEDGER_HEADER_CAP,
        })
    end)
    if not ok then
        return {
            enabled = true,
            readState = "failed",
            source = "fieldProfitabilityLedger",
            farmId = farmId,
            singlePlayerOnly = true,
            sales = ledgerSales(),
        }
    end
    if listed == nil and reason == "runtimeInactive" then
        return {
            enabled = true,
            readState = "pending",
            source = "fieldProfitabilityLedger",
            reason = "runtimeInactive",
            farmId = farmId,
            singlePlayerOnly = true,
            sales = ledgerSales(),
        }
    end
    if type(listed) ~= "table" or type(listed.cycles) ~= "table" then
        return {
            enabled = true,
            readState = "failed",
            source = "fieldProfitabilityLedger",
            farmId = farmId,
            singlePlayerOnly = true,
            sales = ledgerSales(),
        }
    end
    local rows = {}
    local truncated = type(listed.page) == "table" and listed.page.nextOffset ~= nil
    for _, cycle in ipairs(listed.cycles) do
        if type(cycle) == "table" and tonumber(cycle.farmId) == farmId then
            if #rows >= LEDGER_HEADER_CAP then
                truncated = true
                break
            end
            local summary = { totalsRead = "notQueried", totals = {} }
            if #rows < LEDGER_QUERY_CAP then
                summary = ledgerQuerySummary(runtime, cycle.id)
            end
            rows[#rows + 1] = {
                cycleId = ledgerHeaderText(cycle.id, 64),
                land = ledgerHeaderText(cycle.landKey, 80),
                farmId = farmId,
                crop = ledgerHeaderText(cycle.fruitType, 40),
                state = ledgerHeaderText(cycle.state, 16),
                area = tonumber(cycle.cycleAreaHa),
                qualityClass = ledgerHeaderText(cycle.qualityClass, 24),
                totalsRead = summary.totalsRead,
                totalsCoverage = summary.totalsCoverage,
                totalsCount = summary.totalsCount,
                totalsCountExact = summary.totalsCountExact,
                totalsScanned = summary.totalsScanned,
                totalsRejected = summary.totalsRejected,
                totalsTruncated = summary.totalsTruncated,
                totals = summary.totals,
            }
        end
    end
    local readState = "ok"
    if not truncated and #rows == 0 then
        readState = "empty"
    end
    return {
        enabled = true,
        source = "fieldProfitabilityLedger",
        readState = readState,
        coverage = truncated and "truncated" or "complete",
        scope = "farm",
        farmId = farmId,
        singlePlayerOnly = true,
        cycles = rows,
        sales = ledgerSales(),
    }
end

local function collectRealisticVehicleService()
    local farmId = activeExportFarmId()
    if farmId == nil then
        return { enabled = true, readState = "unavailable", source = "realisticVehicleService", reason = "no-farm" }
    end
    if providerSymbol(RVS_MODS, "RealisticVehiclesFaultSystem") == nil and providerSymbol(RVS_MODS, "g_realisticVehicles") == nil then
        return { enabled = true, readState = "unavailable", source = "realisticVehicleService", farmId = farmId }
    end
    local walked = walkOwnedVehicles(farmId, function(vehicle)
        local spec = vehicle.spec_realisticVehiclesBreakdown
        if type(spec) ~= "table" or spec.isExcluded == true then
            return nil
        end
        if type(spec.state) ~= "table" then
            return "pending"
        end
        local ok, row = pcall(function()
            local state = spec.state
            local faults = {}
            if type(state.activeFaults) == "table" then
                for key, _ in pairs(state.activeFaults) do
                    if #faults >= 4 then
                        break
                    end
                    if type(key) == "string" then
                        faults[#faults + 1] = clipText(key, 40)
                    end
                end
            end
            return {
                id = vehicleKey(vehicle),
                name = vehicleName(vehicle),
                condition = tonumber(state.rvCondition),
                serviceSoon = state.serviceSoon == true,
                warmupMs = tonumber(state.warmupCountdownMs),
                keyInserted = state.hasKeyInserted == true,
                immobilizerArmed = state.immobilizerArmed == true,
                faults = faults,
            }
        end)
        if not ok then
            return false
        end
        return row
    end)
    if walked == nil then
        return { enabled = true, readState = "unavailable", source = "realisticVehicleService", farmId = farmId, reason = "no-vehicle-list" }
    end
    if walked == false then
        return { enabled = true, readState = "failed", source = "realisticVehicleService", farmId = farmId }
    end
    return {
        enabled = true,
        source = "realisticVehicleService",
        readState = walked.state,
        coverage = walked.coverage,
        scope = "farm",
        farmId = farmId,
        pinnedVersion = "1.0.0.0",
        machines = walked.rows,
    }
end

function CompanionModsDataCollector.copyRealSiloTransfer(manager, storage, uid)
    local activeSlot = nil
    if type(storage) == "table" and type(storage.getActiveSlot) == "function" then
        local okSlot, slot = pcall(storage.getActiveSlot, uid)
        if okSlot then
            activeSlot = tonumber(slot)
        end
    end
    local transfer = nil
    local transferState = "none"
    if type(manager) == "table" and type(manager.getTransfer) == "function" then
        local ok, raw = pcall(manager.getTransfer, uid)
        if not ok then
            transferState = "failed"
        elseif type(raw) == "table" then
            transferState = "active"
            transfer = {
                fromSlot = tonumber(raw.fromSlot),
                toSlot = tonumber(raw.toSlot),
                rate = tonumber(raw.rate),
                active = raw.active == true,
            }
        end
    end
    return {
        activeSlot = activeSlot,
        transferState = transferState,
        fromSlot = transfer and transfer.fromSlot or nil,
        toSlot = transfer and transfer.toSlot or nil,
        rate = transfer and transfer.rate or nil,
        active = transfer and transfer.active == true or false,
    }
end


local function availabilityLabel()
    local dedicated = _G.g_dedicatedServer ~= nil
    local authority = false
    if _G.g_server ~= nil and type(_G.g_server.getIsServer) == "function" then
        local ok, isSrv = pcall(function()
            return _G.g_server:getIsServer()
        end)
        if ok and isSrv == true then
            authority = true
        end
    end
    if not authority and dedicated then
        authority = true
    end
    local md = _G.g_currentMission and _G.g_currentMission.missionDynamicInfo
    local client = (not authority) and type(md) == "table" and md.isMultiplayer == true and md.isClient == true
    local role = "unknown"
    if dedicated then
        role = "dedicated"
    elseif authority then
        role = "server"
    elseif client then
        role = "client"
    end
    return {
        role = role,
        exportAuthority = authority,
        playerUiAssumed = false,
    }
end

local function emptyPayload()
    return {
        enabled = false,
        mods = {},
        availability = availabilityLabel(),
    }
end

--- Shared with CompanionPages.lua so dedicated mod pages detect mods exactly like this collector.
CompanionModsDataCollector.helpers = {
    envGet = envGet,
    findLoadedName = findLoadedName,
    modVersion = modVersion,
    companionSymbol = companionSymbol,
    providerSymbol = providerSymbol,
    activeExportFarmId = activeExportFarmId,
    resolveExportFarmId = resolveExportFarmId,
    availabilityLabel = availabilityLabel,
}

function CompanionModsDataCollector.finishCollect(ok, payload)
    if ok and type(payload) == "table" then
        if type(payload.availability) ~= "table" then
            payload.availability = availabilityLabel()
        end
        return true, payload
    end
    return true, {
        enabled = false,
        readState = "failed",
        assembly = "failed",
        mods = {},
        availability = availabilityLabel(),
    }
end

function CompanionModsDataCollector.isModLoaded()
    for _, entry in ipairs(CATALOG) do
        local detected = detectEntry(entry)
        if detected then
            return true
        end
    end
    return false
end

function CompanionModsDataCollector:init()
    CompanionModsDataCollector._inc = nil
end

function CompanionModsDataCollector:collectBegin()
    CompanionModsDataCollector._inc = { done = false }
end

function CompanionModsDataCollector:collectStep(_opts)
    CompanionModsDataCollector._inc = nil

    local ok, payload = pcall(function()
        local mods = {}
        local detectedIds = {}
        local any = false

        for _, entry in ipairs(CATALOG) do
            if #mods >= MAX_MODS then
                break
            end
            local detected, listedName = false, nil
            local okDetect, d1, d2 = pcall(detectEntry, entry)
            if okDetect then
                detected, listedName = d1, d2
            elseif FarmDashLog and FarmDashLog.error then
                FarmDashLog.error("companion detect failed id=%s err=%s", tostring(entry.id), tostring(d1))
            end
            if detected then
                any = true
                detectedIds[entry.id] = true
                mods[#mods + 1] = {
                    id = entry.id,
                    title = entry.title,
                    category = entry.category,
                    version = listedName and modVersion(listedName) or nil,
                    modName = listedName,
                    detected = true,
                }
            end
        end

        if not any then
            return emptyPayload()
        end

        local out = {
            enabled = true,
            mods = mods,
            availability = availabilityLabel(),
        }

        local function readAdapter(id, reader, fallback)
            local okRead, value = pcall(reader)
            if okRead and value ~= nil then
                return value
            end
            if not okRead and FarmDashLog and FarmDashLog.error then
                FarmDashLog.error("companion reader failed id=%s err=%s", tostring(id), tostring(value))
            end
            return fallback
        end

        if detectedIds.enhancedLoanSystem then
            out.loans = readAdapter("enhancedLoanSystem", collectElsLoans, {
                enabled = true,
                source = "enhancedLoanSystem",
                byFarm = {},
                readState = "failed",
            })
        end

        local diesel = readAdapter("diesel", function() return collectDiesel(detectedIds) end, nil)
        if diesel then
            out.diesel = diesel
        end

        if detectedIds.restrictedPeriods then
            out.restrictedPeriods = readAdapter("restrictedPeriods", collectRestrictedPeriods, { enabled = true, readState = "failed" })
        end

        if detectedIds.regionalCropCalendar then
            out.cropCalendar = readAdapter("regionalCropCalendar", collectCropCalendar, { enabled = true, readState = "failed" })
        end

        if detectedIds.automaticLoanRepay then
            out.automaticLoanRepay = readAdapter("automaticLoanRepay", collectAutomaticLoanRepay, { enabled = true, readState = "failed" })
        end

        if detectedIds.betterContracts then
            out.betterContracts = readAdapter("betterContracts", collectBetterContracts, { enabled = true, readState = "failed" })
        end

        if detectedIds.livestockMonitor then
            out.livestockMonitor = readAdapter("livestockMonitor", collectLivestockMonitor, { enabled = true, readState = "failed" })
        end
        if detectedIds.productionWatcher then
            out.productionWatcher = readAdapter("productionWatcher", collectProductionWatcher, { enabled = true, readState = "failed" })
        end
        local function detectionOnly()
            return { enabled = true, readState = "detection-only" }
        end
        if detectedIds.palletDegradation then
            out.palletDegradation = readAdapter("palletDegradation", collectPalletDegradation, { enabled = true, readState = "failed", source = "palletDegradation" })
        end
        if detectedIds.outOfFuel then
            out.outOfFuel = detectionOnly()
        end
        if detectedIds.soilWorkYieldBonus then
            out.soilWorkYieldBonus = detectionOnly()
        end
        if detectedIds.seasonalMilkProduction then
            out.seasonalMilk = readAdapter("seasonalMilkProduction", collectSeasonalMilk, { enabled = true, readState = "failed", source = "seasonalMilkProduction" })
        end
        if detectedIds.yieldTracker then
            out.yieldTracker = readAdapter("yieldTracker", collectYieldTracker, { enabled = true, readState = "failed", source = "yieldTracker" })
        end
        if detectedIds.fieldLeasing then
            out.fieldLeases = readAdapter("fieldLeasing", collectFieldLeases, { enabled = true, readState = "failed", source = "fieldLeasing" })
        end
        if detectedIds.dynamicMarket then
            out.dynamicMarket = detectionOnly()
        end
        if detectedIds.realSilo then
            out.realSilo = readAdapter("realSilo", collectRealSilo, { enabled = true, readState = "failed", source = "realSilo" })
        end
        if detectedIds.advancedMaintenance then
            out.advancedMaintenance = readAdapter("advancedMaintenance", collectAdvancedMaintenance, { enabled = true, readState = "failed", source = "advancedMaintenance" })
        end
        if detectedIds.extendedVehicleMaintenance then
            out.extendedVehicleMaintenance = readAdapter("extendedVehicleMaintenance", collectExtendedVehicleMaintenance, { enabled = true, readState = "failed", source = "extendedVehicleMaintenance" })
        end
        if detectedIds.realisticVehicleService then
            out.realisticVehicleService = readAdapter("realisticVehicleService", collectRealisticVehicleService, { enabled = true, readState = "failed", source = "realisticVehicleService" })
        end
        if detectedIds.saveUnitProfiles then
            out.saveUnitProfiles = readAdapter("saveUnitProfiles", collectSaveUnitProfiles, { enabled = true, readState = "failed" })
        end
        if detectedIds.seasonalWoolProduction then
            out.seasonalWool = readAdapter("seasonalWoolProduction", collectSeasonalWool, { enabled = true, readState = "failed", source = "seasonalWoolProduction" })
        end
        if detectedIds.taskList then
            out.taskList = readAdapter("taskList", collectTaskList, { enabled = true, readState = "failed", source = "taskList" })
        end
        if detectedIds.productionSchedule then
            out.productionSchedule = readAdapter("productionSchedule", collectProductionSchedule, { enabled = true, readState = "failed", source = "productionSchedule" })
        end
        if detectedIds.economicHistory then
            out.economicHistory = readAdapter("economicHistory", collectEconomicHistory, { enabled = true, readState = "failed", source = "economicHistory" })
        end
        if detectedIds.animalFoodCalculator then
            out.animalFoodCalculator = readAdapter("animalFoodCalculator", collectAnimalFoodCalculator, { enabled = true, readState = "failed", source = "animalFoodCalculator" })
        end
        if detectedIds.animalPlanner then
            out.animalPlanner = readAdapter("animalPlanner", collectAnimalPlanner, { enabled = true, readState = "failed", source = "animalPlanner" })
        end
        if detectedIds.vipOrderManager then
            out.vipOrders = readAdapter("vipOrderManager", collectVipOrders, { enabled = true, readState = "failed", source = "vipOrderManager" })
        end
        if detectedIds.farmReputation then
            out.farmReputation = readAdapter("farmReputation", collectFarmReputation, { enabled = true, readState = "failed", source = "farmReputation" })
        end
        if detectedIds.moistureSystem then
            out.moistureSystem = readAdapter("moistureSystem", collectMoistureSystem, { enabled = true, readState = "failed", source = "moistureSystem" })
        end
        if detectedIds.rentYourField then
            out.rentYourField = readAdapter("rentYourField", collectRentYourField, { enabled = true, readState = "failed", source = "rentYourField" })
        end
        if detectedIds.farmlandMarketplace then
            out.farmlandMarketplace = readAdapter("farmlandMarketplace", collectFarmlandMarketplace, { enabled = true, readState = "failed", source = "farmlandMarketplace" })
        end
        if detectedIds.distributionRedux then
            out.distributionRedux = readAdapter("distributionRedux", collectDistributionRedux, { enabled = true, readState = "failed", source = "distributionRedux" })
        end
        if detectedIds.silageCompactionMonitor then
            out.silageCompaction = readAdapter("silageCompactionMonitor", collectSilageCompaction, { enabled = true, readState = "failed", source = "silageCompactionMonitor" })
        end
        if detectedIds.farmOperationsDashboard then
            out.farmOperations = readAdapter("farmOperationsDashboard", collectFarmOperations, { enabled = true, readState = "failed", source = "farmOperationsDashboard" })
        end
        if detectedIds.factoryProfitCalculator then
            out.factoryProfitCalculator = readAdapter("factoryProfitCalculator", collectFactoryProfit, { enabled = true, readState = "failed", source = "factoryProfitCalculator" })
        end
        if detectedIds.fieldProfitabilityLedger then
            out.fieldProfitabilityLedger = readAdapter("fieldProfitabilityLedger", collectFieldProfitabilityLedger, { enabled = true, readState = "failed", source = "fieldProfitabilityLedger" })
        end

        return out
    end)

    if not ok and FarmDashLog and FarmDashLog.error then
        FarmDashLog.error("companion collect failed err=%s", tostring(payload))
    end
    return CompanionModsDataCollector.finishCollect(ok, payload)
end

function CompanionModsDataCollector:collect()
    self:collectBegin()
    local done, payload = self:collectStep({})
    return payload or emptyPayload()
end
