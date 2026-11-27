-- FS25 FarmDashboard | EconomyDataCollector.lua | v2.3.0 (Plan v5 B1)
--
-- Plan v5 B1: when farmDashboard.settings#useStateMachine_economy is true (default), the slice
-- runs synchronously inside collectStep — no coroutine.yield, no yield-across-pcall hazard.
-- moduleCache.economy is only updated when STAGE_DERIVE_CROPS finishes (atomic per cycle).
-- When the flag is false, falls back to the existing coroutine path.

EconomyDataCollector = {}

function EconomyDataCollector:init()
    EconomyDataCollector._ecoCo = nil
    EconomyDataCollector._smState = nil
end

local function _useStateMachine()
    local cfg = rawget(_G, "FarmDashboardDataCollector")
    if cfg and cfg.config and cfg.config.useStateMachine_economy ~= nil then
        return cfg.config.useStateMachine_economy and true or false
    end
    return false
end

function EconomyDataCollector:_workYield()
    -- Plan v5 B1: state-machine path never yields. The legacy coroutine path keeps the original behavior.
    if _useStateMachine() then return end
    local stride = EconomyDataCollector._yieldStride
    if not stride or not coroutine.running() then return end
    EconomyDataCollector._yieldTick = (EconomyDataCollector._yieldTick or 0) + 1
    if EconomyDataCollector._yieldTick % stride ~= 0 then return end
    coroutine.yield("progress", EconomyDataCollector._yieldPartialEcon or {})
end

function EconomyDataCollector:collectBegin()
    if _useStateMachine() then
        EconomyDataCollector._smState = { stage = "INIT" }
        EconomyDataCollector._ecoCo = nil
        return
    end
    -- Legacy coroutine path
    EconomyDataCollector._smState = nil
    local ok, co = pcall(coroutine.create, function(opts)
        opts = opts or {}
        EconomyDataCollector._yieldStride = math.max(10, tonumber(opts.economyYieldStride) or 55)
        EconomyDataCollector._yieldTick = 0
        EconomyDataCollector._yieldSnapshot = nil
        local r = EconomyDataCollector._collectImpl(EconomyDataCollector)
        EconomyDataCollector._yieldStride = nil
        EconomyDataCollector._yieldSnapshot = nil
        return r
    end)
    if not ok or not co then
        error("coroutine.create failed: " .. tostring(co))
    end
    EconomyDataCollector._ecoCo = co
end

function EconomyDataCollector:collectStep(opts)
    -- Plan v5 B1: state-machine path. moduleCache.economy is only published at STAGE_DERIVE_CROPS done.
    if EconomyDataCollector._smState ~= nil then
        local st = EconomyDataCollector._smState
        if st.stage == "INIT" then
            -- One-shot collect; for the v1 ship, economy is small and slow-changing enough that a
            -- single synchronous pass is acceptable. The flag guards us if a particular save needs
            -- the legacy coroutine path back.
            EconomyDataCollector._yieldStride = nil
            EconomyDataCollector._yieldSnapshot = nil
            local result = EconomyDataCollector._collectImpl(EconomyDataCollector)
            EconomyDataCollector._smState = nil
            return true, result or {}
        end
        EconomyDataCollector._smState = nil
        return true, {}
    end

    -- Legacy coroutine path
    if not EconomyDataCollector._ecoCo then return true, {} end
    local ok, a, b = coroutine.resume(EconomyDataCollector._ecoCo, opts or {})
    if not ok then
        FarmDashLog.devWarn("EconomyDataCollector coroutine: %s", tostring(a))
        EconomyDataCollector._ecoCo = nil
        return true, {}
    end
    if a == "progress" then
        return false, b or {}
    end
    local cst = coroutine.status(EconomyDataCollector._ecoCo)
    if cst == "dead" then
        EconomyDataCollector._ecoCo = nil
        return true, a or {}
    end
    if cst == "suspended" then
        FarmDashLog.devWarn("EconomyDataCollector: unexpected coroutine state; ending slice.")
        EconomyDataCollector._ecoCo = nil
        return true, EconomyDataCollector._yieldPartialEcon or (type(a) == "table" and a) or {}
    end
    return false, b or {}
end

function EconomyDataCollector:collect()
    EconomyDataCollector._yieldStride = nil
    EconomyDataCollector._yieldSnapshot = nil
    return self:_collectImpl()
end

function EconomyDataCollector:_collectImpl()
    -- Safety check: Don't collect if game isn't ready or managers aren't available
    if not _G.g_currentMission then
        return {
            marketPrices = {},
            sellingStations = {},
            timestamp = 0
        }
    end
    
    local economyData = {
        marketPrices = {},
        sellingStations = {},
        timestamp = _G.g_currentMission.environment and _G.g_currentMission.environment.dayTime or 0,
        debug = {
            totalFillTypes = 0,
            milkTypes = {},
            animalProducts = {},
            allFillTypes = {}
        }
    }

    EconomyDataCollector._yieldPartialEcon = economyData
    
    if rawget(_G, "FillTypeUtils") and FillTypeUtils.rebuildCatalog then
        FillTypeUtils.rebuildCatalog()
        if FillTypeUtils.probeAllFillTypes then
            FillTypeUtils.probeAllFillTypes()
        end
    end
    
    -- Collect all market prices for each sell point
    economyData.marketPrices = self:collectMarketPrices()
    
    -- Include debug information from market prices collection
    if economyData.marketPrices and economyData.marketPrices.debug then
        economyData.debug = economyData.marketPrices.debug
    end
    

    -- FH-20260914: trim the duplicated per-crop locations view before it leaves the
    -- collector, after every aggregate that reads it has been computed.
    self:_stripExportedDuplicates(economyData)

    return economyData
end

--- FH-20260914: drop the one view that is a true duplicate, at the export boundary.
---
--- economy.marketPrices carried the same price matrix twice. Measured on the real export, the two
--- forms hold exactly the same 4,969 crop-and-station pairs, but they are not interchangeable:
--- sellPoints additionally carries basePrice, fillTypeIndex and isSpecialEvent per price plus each
--- station's id and position, while crops carries avgXmlPrice, priceHistory, maxPriceMonth and the
--- best/worst/min/max aggregates that exist nowhere else. So neither could be deleted outright.
---
--- What IS redundant is each crop's `locations` array: its three fields, name, price and
--- multiplier, are all present in sellPoints. On a 4,008,404 byte export that array set is 391,662
--- bytes, so this is roughly a tenth of everything the authority serialises, the mirror streams to
--- every joined client, and the desktop app parses.
---
--- This runs AFTER the aggregates are computed, so nothing that reads locations during collection
--- is affected; only the exported copy is trimmed. The desktop app rebuilds the array from
--- sellPoints while merging, so the By Crop view is unchanged.
---
--- Deliberately NOT stripped: the lookup tables. fillTypeTitles and fillTypesByIndex proved
--- byte-identical to copies held at economy and top level, but nameToIndex did not (598 entries
--- against 596 in the nearest sibling), so it is not a duplicate at all and dropping the set would
--- have lost two entries. All three together are about 0.6% of the export, which does not justify
--- the risk.
function EconomyDataCollector:_stripExportedDuplicates(economyData)
    local mp = economyData and economyData.marketPrices
    if type(mp) ~= "table" then return economyData end
    local crops = mp.crops
    if type(crops) ~= "table" then return economyData end

    local trimmed = 0
    for _, cropData in pairs(crops) do
        if type(cropData) == "table" and cropData.locations ~= nil then
            cropData.locations = nil
            trimmed = trimmed + 1
        end
    end
    mp.locationsOmitted = trimmed > 0 or nil
    return economyData
end

local function _economyFillTypeIndexForName(cropName)
    local ftm = _G.g_fillTypeManager
    if not ftm or not cropName then return nil end
    if ftm.nameToIndex and ftm.nameToIndex[cropName] then
        return tonumber(ftm.nameToIndex[cropName])
    end
    if ftm.getFillTypeIndexByName then
        local ok, idx = pcall(function() return ftm:getFillTypeIndexByName(cropName) end)
        if ok and idx then return tonumber(idx) end
    end
    return nil
end

local function _economyAttachFillTypeMaps(marketData)
    marketData.fillTypesByIndex = marketData.fillTypesByIndex or {}
    marketData.nameToIndex = marketData.nameToIndex or {}
    local ftm = _G.g_fillTypeManager
    if not ftm then return end

    if ftm.fillTypeIndexToName then
        for idx, name in pairs(ftm.fillTypeIndexToName) do
            marketData.fillTypesByIndex[tostring(idx)] = name
        end
    end
    if ftm.nameToIndex then
        for name, idx in pairs(ftm.nameToIndex) do
            marketData.nameToIndex[name] = idx
            marketData.fillTypesByIndex[tostring(idx)] = name
        end
    end
    if ftm.getFillTypes then
        local ok, fillTypes = pcall(function() return ftm:getFillTypes() end)
        if ok and type(fillTypes) == "table" then
            for idx, fillType in pairs(fillTypes) do
                if fillType and fillType.name then
                    marketData.fillTypesByIndex[tostring(fillType.index or idx)] = fillType.name
                end
            end
        end
    end
    if ftm.fillTypes then
        for _, filltype in pairs(ftm.fillTypes) do
            if filltype and filltype.name then
                marketData.fillTypesByIndex[tostring(filltype.index)] = filltype.name
            end
        end
    end
    if rawget(_G, "FillTypeUtils") and FillTypeUtils.catalogForJson then
        for idx, name in pairs(FillTypeUtils.catalogForJson()) do
            marketData.fillTypesByIndex[tostring(idx)] = name
        end
    end
    if rawget(_G, "FillTypeUtils") and FillTypeUtils.catalogTitlesForJson then
        marketData.fillTypeTitles = FillTypeUtils.catalogTitlesForJson()
        for idx, title in pairs(marketData.fillTypeTitles) do
            local key = tostring(idx)
            if not marketData.fillTypesByIndex[key]
                or marketData.fillTypesByIndex[key] == ""
                or tonumber(marketData.fillTypesByIndex[key]) then
                marketData.fillTypesByIndex[key] = title
            end
        end
    end
    for _, station in pairs(marketData.sellPoints or {}) do
        if type(station) == "table" and type(station.prices) == "table" then
            for productName, priceInfo in pairs(station.prices) do
                local idx = priceInfo and priceInfo.fillTypeIndex
                if not idx then
                    idx = _economyFillTypeIndexForName(productName)
                    if priceInfo and idx then priceInfo.fillTypeIndex = idx end
                end
                if idx then
                    marketData.fillTypesByIndex[tostring(idx)] = productName
                    if marketData.crops[productName] then
                        marketData.crops[productName].fillTypeIndex = idx
                    end
                end
            end
        end
    end
    for cropName, crop in pairs(marketData.crops or {}) do
        if crop and not crop.fillTypeIndex then
            crop.fillTypeIndex = _economyFillTypeIndexForName(cropName)
        end
    end
end

local _SEASON_PERIOD_KEYS = {
    "EARLY_SPRING", "MID_SPRING", "LATE_SPRING",
    "EARLY_SUMMER", "MID_SUMMER", "LATE_SUMMER",
    "EARLY_AUTUMN", "MID_AUTUMN", "LATE_AUTUMN",
    "EARLY_WINTER", "MID_WINTER", "LATE_WINTER",
}

local _SEASON_PERIOD_MONTHS = {
    EARLY_SPRING = "Mar", MID_SPRING = "Apr", LATE_SPRING = "May",
    EARLY_SUMMER = "Jun", MID_SUMMER = "Jul", LATE_SUMMER = "Aug",
    EARLY_AUTUMN = "Sep", MID_AUTUMN = "Oct", LATE_AUTUMN = "Nov",
    EARLY_WINTER = "Dec", MID_WINTER = "Jan", LATE_WINTER = "Feb",
}

local function _maxPriceMonthForFillType(fillType)
    if not fillType or not fillType.economy then return nil end
    local factors = fillType.economy.factors
    local history = fillType.economy.history
    if type(factors) ~= "table" and type(history) ~= "table" then return nil end

    local bestKey, bestValue = nil, -1
    local SP = type(_G.SeasonPeriod) == "table" and _G.SeasonPeriod or nil

    if SP then
        for i = 1, #_SEASON_PERIOD_KEYS do
            local key = _SEASON_PERIOD_KEYS[i]
            local period = SP[key]
            if period ~= nil then
                local value = 0
                if type(history) == "table" and history[period] then
                    value = tonumber(history[period]) or 0
                elseif type(factors) == "table" and factors[period] then
                    value = tonumber(factors[period]) or 0
                end
                if value > bestValue then
                    bestValue = value
                    bestKey = key
                end
            end
        end
    elseif type(factors) == "table" then
        for period, factor in pairs(factors) do
            local value = tonumber(factor) or 0
            if value > bestValue then
                bestValue = value
                local idx = tonumber(period)
                if idx and idx >= 1 and idx <= #_SEASON_PERIOD_KEYS then
                    bestKey = _SEASON_PERIOD_KEYS[idx]
                end
            end
        end
    end

    if bestKey and _SEASON_PERIOD_MONTHS[bestKey] then
        return _SEASON_PERIOD_MONTHS[bestKey]
    end
    return nil
end

--- 12-period price curve formerly sourced from economy.xml on the desktop merge.
local function _priceHistoryForFillType(fillType)
    if not fillType or not fillType.economy then return nil end
    local factors = fillType.economy.factors
    local history = fillType.economy.history
    if type(factors) ~= "table" and type(history) ~= "table" then return nil end

    local out = {}
    local sum, count = 0, 0
    local SP = type(_G.SeasonPeriod) == "table" and _G.SeasonPeriod or nil

    for i = 1, #_SEASON_PERIOD_KEYS do
        local key = _SEASON_PERIOD_KEYS[i]
        local value = nil
        if SP and SP[key] ~= nil then
            local period = SP[key]
            if type(history) == "table" and history[period] ~= nil then
                value = tonumber(history[period])
            elseif type(factors) == "table" and factors[period] ~= nil then
                value = tonumber(factors[period])
            end
        elseif type(factors) == "table" and factors[i] ~= nil then
            value = tonumber(factors[i])
        elseif type(history) == "table" and history[i] ~= nil then
            value = tonumber(history[i])
        end
        if value ~= nil and value == value then
            out[key] = value
            sum = sum + value
            count = count + 1
        end
    end

    if count == 0 then return nil end
    return out, sum / count
end

local function _economyEnrichMaxPriceMonths(marketData)
    if not marketData or type(marketData.crops) ~= "table" then return end
    local ftm = _G.g_fillTypeManager
    if not ftm or not ftm.getFillTypeByIndex then return end

    for _, cropData in pairs(marketData.crops) do
        if cropData and not cropData.maxPriceMonth then
            local idx = tonumber(cropData.fillTypeIndex)
            if idx then
                local ok, fillType = pcall(function() return ftm:getFillTypeByIndex(idx) end)
                if ok and fillType then
                    cropData.maxPriceMonth = _maxPriceMonthForFillType(fillType)
                end
            end
        end
    end
end

--- Attach season priceHistory from live g_fillTypeManager (replaces desktop economy.xml).
local function _economyEnrichPriceHistories(marketData)
    if not marketData or type(marketData.crops) ~= "table" then return end
    local ftm = _G.g_fillTypeManager
    if not ftm or not ftm.getFillTypeByIndex then return end

    for _, cropData in pairs(marketData.crops) do
        if cropData and type(cropData.priceHistory) ~= "table" then
            local idx = tonumber(cropData.fillTypeIndex)
            if idx then
                local ok, fillType = pcall(function() return ftm:getFillTypeByIndex(idx) end)
                if ok and fillType then
                    local hist, avg = _priceHistoryForFillType(fillType)
                    if hist then
                        cropData.priceHistory = hist
                        if avg and avg > 0 then
                            if not cropData.avgPrice or tonumber(cropData.avgPrice) == 0 then
                                cropData.avgPrice = avg
                            end
                            if not cropData.avgXmlPrice then
                                cropData.avgXmlPrice = avg
                            end
                        end
                    end
                end
            end
        end
    end
end

function EconomyDataCollector:collectMarketPrices()
    local marketData = {
        sellPoints = {},
        crops = {},
        lastUpdate = _G.g_time or 0,
        debug = {
            totalFillTypes = 0,
            milkTypes = {},
            animalProducts = {},
            allFillTypes = {}
        }
    }
    
    if not _G.g_currentMission then
        return marketData
    end

    EconomyDataCollector._yieldSnapshot = marketData
    EconomyDataCollector._yieldTick = 0
    
    -- Get all selling stations/points from multiple sources
    local sellingStations = {}
    local foundStations = {}
    
    -- Method 1: Check economy manager selling stations (most important for base prices)
    if _G.g_currentMission.economyManager and _G.g_currentMission.economyManager.sellingStations then
        for _, station in pairs(_G.g_currentMission.economyManager.sellingStations) do
            self:_workYield()
            if station and not foundStations[station] then
                foundStations[station] = true
                table.insert(sellingStations, station)
            end
        end
    end
    
    -- Method 2: Check storageSystem for selling stations
    if _G.g_currentMission.storageSystem then
        if _G.g_currentMission.storageSystem.unloadingStations then
            for _, station in pairs(_G.g_currentMission.storageSystem.unloadingStations) do
                self:_workYield()
                if station and station.owningPlaceable and not foundStations[station.owningPlaceable] then
                    foundStations[station.owningPlaceable] = true
                    table.insert(sellingStations, station.owningPlaceable)
                end
            end
        end
        
        if _G.g_currentMission.storageSystem.storages then
            for _, storage in pairs(_G.g_currentMission.storageSystem.storages) do
                self:_workYield()
                if storage and storage.owningPlaceable and storage.isFarmOwned == false then
                    if not foundStations[storage.owningPlaceable] then
                        foundStations[storage.owningPlaceable] = true
                        table.insert(sellingStations, storage.owningPlaceable)
                    end
                end
            end
        end
    end
    
    -- Method 3: Check all placeables for selling capabilities
    if _G.g_currentMission.placeables then
        for _, placeable in pairs(_G.g_currentMission.placeables) do
            self:_workYield()
            if placeable and not foundStations[placeable] then
                if placeable.spec_sellingStation then
                    foundStations[placeable] = true
                    table.insert(sellingStations, placeable)
                end
                if placeable.spec_animalDealer then
                    foundStations[placeable] = true
                    table.insert(sellingStations, placeable)
                end
                if placeable.spec_productionPoint and placeable.spec_productionPoint.inputFillTypes then
                    foundStations[placeable] = true
                    table.insert(sellingStations, placeable)
                end
            end
        end
    end
    
    -- Method 4: Check mission placeables (map default sell points)
    if _G.g_currentMission.placeableSystem and _G.g_currentMission.placeableSystem.placeables then
        for _, placeable in pairs(_G.g_currentMission.placeableSystem.placeables) do
            self:_workYield()
            if placeable and not foundStations[placeable] then
                local stationName = "Unknown"
                if placeable.getName then
                    stationName = placeable:getName() or "Unknown"
                elseif placeable.configFileName then
                    stationName = placeable.configFileName or "Unknown"
                end
                
                if placeable.spec_sellingStation then
                    foundStations[placeable] = true
                    table.insert(sellingStations, placeable)
                elseif placeable.spec_animalDealer then
                    foundStations[placeable] = true
                    table.insert(sellingStations, placeable)
                elseif placeable.spec_productionPoint then
                    if placeable.spec_productionPoint.inputFillTypes then
                        foundStations[placeable] = true
                        table.insert(sellingStations, placeable)
                    end
                end
            end
        end
    end
    
    -- Method 5: Add economy-based virtual sell points for base prices
    if _G.g_fillTypeManager and _G.g_currentMission.economyManager then
        local virtualStation, debugInfo = self:createVirtualEconomyStation()
        if debugInfo then
            marketData.debug = debugInfo
        end
        if virtualStation and next(virtualStation.prices) then
            table.insert(marketData.sellPoints, virtualStation)
            
            for cropName, priceInfo in pairs(virtualStation.prices) do
                self:_workYield()
                if not marketData.crops[cropName] then
                    marketData.crops[cropName] = {
                        name = cropName,
                        fillTypeIndex = _economyFillTypeIndexForName(cropName),
                        minPrice = priceInfo.price,
                        maxPrice = priceInfo.price,
                        avgPrice = priceInfo.price,
                        bestLocation = virtualStation.name,
                        worstLocation = virtualStation.name,
                        locations = {}
                    }
                else
                    local cropData = marketData.crops[cropName]
                    if priceInfo.price > cropData.maxPrice then
                        cropData.maxPrice = priceInfo.price
                        cropData.bestLocation = virtualStation.name
                    end
                    if priceInfo.price < cropData.minPrice then
                        cropData.minPrice = priceInfo.price
                        cropData.worstLocation = virtualStation.name
                    end
                end
                
                table.insert(marketData.crops[cropName].locations, {
                    name = virtualStation.name,
                    price = priceInfo.price,
                    multiplier = priceInfo.multiplier
                })
            end
        end
    end
    
    -- Process each selling station
    for _, station in pairs(sellingStations) do
        self:_workYield()
        local stationData = self:getStationPrices(station)
        if stationData then
            table.insert(marketData.sellPoints, stationData)
        end
    end
    
    -- Only observed selling-station prices and explicitly labelled base references remain.
    -- Production inputs and named places are not offers without a live SellingStation price.

    -- Method 9: COMPLETELY REBUILD crop data from ALL stations
    marketData.crops = {}
    
    local function isValidStation(stationName)
        local skipPatterns = {
            "^Unknown$", "Silo$", "Silo ", "^Grain.*Silo", "^Farm Silo", "Barn$", "Barn ", "Stable$"
        }
        for _, pattern in pairs(skipPatterns) do
            if string.find(stationName, pattern) then
                return false
            end
        end
        return true
    end
    
    for _, station in pairs(marketData.sellPoints) do
        if next(station.prices) and isValidStation(station.name) then 
            for productName, priceInfo in pairs(station.prices) do
                if not marketData.crops[productName] then
                    marketData.crops[productName] = {
                        name = productName,
                        fillTypeIndex = _economyFillTypeIndexForName(productName),
                        minPrice = priceInfo.price,
                        maxPrice = priceInfo.price,
                        avgPrice = priceInfo.price,
                        bestLocation = station.name,
                        worstLocation = station.name,
                        locations = {}
                    }
                end
                
                local cropData = marketData.crops[productName]
                
                local locationExists = false
                for _, location in pairs(cropData.locations) do
                    if location.name == station.name then
                        locationExists = true
                        break
                    end
                end
                
                if not locationExists then
                    table.insert(cropData.locations, {
                        name = station.name,
                        price = priceInfo.price,
                        multiplier = priceInfo.multiplier
                    })
                    
                    if priceInfo.price > cropData.maxPrice then
                        cropData.maxPrice = priceInfo.price
                        cropData.bestLocation = station.name
                    end
                    if priceInfo.price < cropData.minPrice then
                        cropData.minPrice = priceInfo.price
                        cropData.worstLocation = station.name
                    end
                end
            end
        end
    end
    
    for cropName, cropData in pairs(marketData.crops) do
        if cropData.locations and #cropData.locations > 0 then
            local sum = 0
            for _, location in pairs(cropData.locations) do
                sum = sum + location.price
            end
            cropData.avgPrice = sum / #cropData.locations
        end
    end
    
    -- Final cleanup: Remove unwanted stations
    local filteredSellPoints = {}
    
    for _, station in pairs(marketData.sellPoints) do
        if isValidStation(station.name) then
            table.insert(filteredSellPoints, station)
        end
    end
    
    marketData.sellPoints = filteredSellPoints
    
    for cropName, cropData in pairs(marketData.crops) do
        if cropData.locations then
            local filteredLocations = {}
            for _, location in pairs(cropData.locations) do
                if isValidStation(location.name) then
                    table.insert(filteredLocations, location)
                end
            end
            
            cropData.locations = filteredLocations
            
            if #filteredLocations > 0 then
                local allPrices = {}
                for _, location in pairs(filteredLocations) do
                    table.insert(allPrices, location.price)
                end
                
                table.sort(allPrices)
                cropData.minPrice = allPrices[1]
                cropData.maxPrice = allPrices[#allPrices]
                
                local sum = 0
                for _, price in pairs(allPrices) do sum = sum + price end
                cropData.avgPrice = sum / #allPrices
                
                for _, location in pairs(filteredLocations) do
                    if location.price == cropData.maxPrice then
                        cropData.bestLocation = location.name
                    end
                    if location.price == cropData.minPrice then
                        cropData.worstLocation = location.name
                    end
                end
            end
        end
    end
    
    _economyAttachFillTypeMaps(marketData)
    _economyEnrichMaxPriceMonths(marketData)
    _economyEnrichPriceHistories(marketData)
    
    return marketData
end

function EconomyDataCollector:createVirtualEconomyStation()
    local virtualStation = {
        name = "Market Base Prices",
        id = -1,
        position = {x = 0, y = 0, z = 0},
        prices = {},
        isSpecialEvent = false
    }
    
    local debugInfo = {
        totalFillTypes = 0,
        milkTypes = {},
        animalProducts = {},
        allFillTypes = {}
    }
    
    if not _G.g_fillTypeManager then
        return nil
    end
    
    local fillTypes = _G.g_fillTypeManager:getFillTypes()
    if fillTypes then
        local allFillTypes = {}
        
        for fillTypeIndex, fillType in pairs(fillTypes) do
            if fillType and fillType.name and type(fillTypeIndex) == "number" then
                table.insert(allFillTypes, fillType.name)
                
                if self:isValidCropName(fillType.name) then
                    local priceInfo = self:getPriceForFillType(fillTypeIndex, fillType)
                    if priceInfo then
                        virtualStation.prices[fillType.name] = priceInfo
                    end
                end
            end
        end
    end
    
    if _G.g_fillTypeManager.nameToIndex then
        for fillTypeName, fillTypeIndex in pairs(_G.g_fillTypeManager.nameToIndex) do
            if type(fillTypeIndex) == "number" and fillTypeName then
                if self:isValidCropName(fillTypeName) then
                    if not virtualStation.prices[fillTypeName] then
                        local fillType = _G.g_fillTypeManager:getFillTypeByIndex(fillTypeIndex)
                        if fillType then
                            local priceInfo = self:getPriceForFillType(fillTypeIndex, fillType)
                            if priceInfo then
                                virtualStation.prices[fillTypeName] = priceInfo
                            end
                        end
                    end
                end
            end
        end
    end
    
    if _G.g_fillTypeManager.fillTypeIndexToName then
        for fillTypeIndex, fillTypeName in pairs(_G.g_fillTypeManager.fillTypeIndexToName) do
            if type(fillTypeIndex) == "number" and fillTypeName and self:isValidCropName(fillTypeName) then
                if not virtualStation.prices[fillTypeName] then
                    local fillType = _G.g_fillTypeManager:getFillTypeByIndex(fillTypeIndex)
                    if fillType then
                        local priceInfo = self:getPriceForFillType(fillTypeIndex, fillType)
                        if priceInfo then
                            virtualStation.prices[fillTypeName] = priceInfo
                        end
                    end
                end
            end
        end
    end
    
    if _G.g_currentMission.economyManager and _G.g_currentMission.economyManager.sellingStations then
        for _, station in pairs(_G.g_currentMission.economyManager.sellingStations) do
            if station and station.acceptedFillTypes then
                for fillTypeIndex, accepted in pairs(station.acceptedFillTypes) do
                    if accepted and type(fillTypeIndex) == "number" then
                        local fillType = _G.g_fillTypeManager:getFillTypeByIndex(fillTypeIndex)
                        if fillType and fillType.name and self:isValidCropName(fillType.name) then
                            if not virtualStation.prices[fillType.name] then
                                local priceInfo = self:getPriceForFillType(fillTypeIndex, fillType)
                                if priceInfo then
                                    virtualStation.prices[fillType.name] = priceInfo
                                end
                            end
                        end
                    end
                end
            end
        end
    end
    
    if _G.g_currentMission.placeableSystem and _G.g_currentMission.placeableSystem.placeables then
        for _, placeable in pairs(_G.g_currentMission.placeableSystem.placeables) do
            if placeable and placeable.spec_productionPoint then
                local productionPoint = placeable.spec_productionPoint
                
                if productionPoint.inputFillTypes then
                    for fillTypeIndex, _ in pairs(productionPoint.inputFillTypes) do
                        if type(fillTypeIndex) == "number" then
                            local fillType = _G.g_fillTypeManager:getFillTypeByIndex(fillTypeIndex)
                            if fillType and fillType.name and self:isValidCropName(fillType.name) then
                                if not virtualStation.prices[fillType.name] then
                                    local priceInfo = self:getPriceForFillType(fillTypeIndex, fillType)
                                    if priceInfo then
                                        virtualStation.prices[fillType.name] = priceInfo
                                    end
                                end
                            end
                        end
                    end
                end
                
                if productionPoint.outputFillTypes then
                    for fillTypeIndex, _ in pairs(productionPoint.outputFillTypes) do
                        if type(fillTypeIndex) == "number" then
                            local fillType = _G.g_fillTypeManager:getFillTypeByIndex(fillTypeIndex)
                            if fillType and fillType.name and self:isValidCropName(fillType.name) then
                                if not virtualStation.prices[fillType.name] then
                                    local priceInfo = self:getPriceForFillType(fillTypeIndex, fillType)
                                    if priceInfo then
                                        virtualStation.prices[fillType.name] = priceInfo
                                    end
                                end
                            end
                        end
                    end
                end
            end
        end
    end
    
    if next(virtualStation.prices) then
        return virtualStation, debugInfo
    else
        return nil, debugInfo
    end
end

function EconomyDataCollector:getPriceForFillType(fillTypeIndex, fillType)
    local priceInfo = {
        price = 0,
        basePrice = 0,
        multiplier = 1,
        isSpecialEvent = false,
        fillTypeIndex = tonumber(fillTypeIndex),
    }
    
    if fillType.pricePerLiter and fillType.pricePerLiter > 0 then
        priceInfo.basePrice = fillType.pricePerLiter * 1000  
    end
    
    if fillType.economy then
        if fillType.economy.pricePerLiter and fillType.economy.pricePerLiter > 0 then
            priceInfo.basePrice = fillType.economy.pricePerLiter * 1000
        end
        if fillType.economy.basePrice and fillType.economy.basePrice > 0 then
            priceInfo.basePrice = fillType.economy.basePrice * 1000
        end
    end
    
    local currentPrice = 0
    if _G.g_currentMission.economyManager then
        if _G.g_currentMission.economyManager.getPricePerLiter then
            local success, price = pcall(function()
                return _G.g_currentMission.economyManager:getPricePerLiter(fillTypeIndex)
            end)
            if success and price and price > 0 then
                currentPrice = price * 1000 
            end
        end
        
        if currentPrice == 0 and _G.g_currentMission.economyManager.getPrice then
            local success, price = pcall(function()
                return _G.g_currentMission.economyManager:getPrice(fillTypeIndex)
            end)
            if success and price and price > 0 then
                currentPrice = price * 1000
            end
        end
        
        if currentPrice == 0 and _G.g_currentMission.economyManager.pricePerLiter then
            local price = _G.g_currentMission.economyManager.pricePerLiter[fillTypeIndex]
            if price and price > 0 then
                currentPrice = price * 1000
            end
        end
    end
    
    if currentPrice == 0 and priceInfo.basePrice > 0 and _G.g_currentMission.economyManager then
        if _G.g_currentMission.economyManager.getPriceMultiplier then
            local success, multiplier = pcall(function()
                return _G.g_currentMission.economyManager:getPriceMultiplier(fillTypeIndex)
            end)
            if success and multiplier and multiplier > 0 then
                priceInfo.multiplier = multiplier
                currentPrice = priceInfo.basePrice * multiplier
            end
        end
        
        if currentPrice == 0 and _G.g_currentMission.economyManager.priceMultiplier then
            local multiplier = _G.g_currentMission.economyManager.priceMultiplier[fillTypeIndex]
            if multiplier and multiplier > 0 then
                priceInfo.multiplier = multiplier
                currentPrice = priceInfo.basePrice * multiplier
            end
        end
    end
    
    if currentPrice == 0 and _G.g_currentMission.economyManager and _G.g_currentMission.economyManager.sellableProducts then
        local sellableProduct = _G.g_currentMission.economyManager.sellableProducts[fillTypeIndex]
        if sellableProduct and sellableProduct.pricePerLiter and sellableProduct.pricePerLiter > 0 then
            currentPrice = sellableProduct.pricePerLiter * 1000
        end
    end
    
    if currentPrice > 0 then
        priceInfo.price = currentPrice
    elseif priceInfo.basePrice > 0 then
        priceInfo.price = priceInfo.basePrice
    else
        return nil
    end
    
    return priceInfo.price > 0 and priceInfo or nil
end

function EconomyDataCollector:getStationPrices(station)
    if not station then
        return nil
    end
    
    local stationData = {
        name = "Unknown",
        id = station.id or 0,
        position = {x = 0, y = 0, z = 0},
        prices = {},
        isSpecialEvent = false
    }
    
    if station.getName then
        local success, name = pcall(function() return station:getName() end)
        if success and type(name) == "string" and name ~= "" then
            stationData.name = name
        end
    end
    if stationData.name == "Unknown" and station.stationName then
        stationData.name = station.stationName
    end
    if stationData.name == "Unknown" and station.owningPlaceable and station.owningPlaceable.getName then
        local success, name = pcall(station.owningPlaceable.getName, station.owningPlaceable)
        if success and type(name) == "string" and name ~= "" then
            stationData.name = name
        end
    end
    if stationData.name == "Unknown" and station.name then
        stationData.name = station.name
    end
    
    if station.rootNode then
        local success, x, y, z = pcall(getWorldTranslation, station.rootNode)
        if success and x and y and z then
            stationData.position = {x = x, y = y, z = z}
        end
    end
    
    local pricesFound = false
    
    if station.spec_sellingStation then
        pricesFound = self:collectFromSellingStation(station, stationData) or pricesFound
    end
    
    if station.spec_productionPoint then
        pricesFound = self:collectFromProductionPoint(station, stationData) or pricesFound
    end
    
    if not pricesFound and station.acceptedFillTypes then
        pricesFound = self:collectFromDirectStation(station, stationData) or pricesFound
    end
    
    return pricesFound and stationData or nil
end

function EconomyDataCollector:collectFromSellingStation(station, stationData)
    local spec = station.spec_sellingStation
    local pricesFound = false
    
    if spec.sellingStation then
        local sellStation = spec.sellingStation
        
        if sellStation.acceptedFillTypes then
            for fillTypeIndex, accepted in pairs(sellStation.acceptedFillTypes) do
                if accepted then
                    local fillType = _G.g_fillTypeManager and _G.g_fillTypeManager:getFillTypeByIndex(fillTypeIndex)
                    if fillType and fillType.name and self:isValidCropName(fillType.name) then
                        local priceInfo = self:getStationFillTypePrice(station, sellStation, fillTypeIndex, fillType)
                        if priceInfo and priceInfo.price > 0 then
                            stationData.prices[fillType.name] = priceInfo
                            pricesFound = true
                        end
                    end
                end
            end
        end
    end
    
    if spec.unloadingStations then
        for _, unloadingStation in pairs(spec.unloadingStations) do
            if unloadingStation and unloadingStation.acceptedFillTypes then
                for fillTypeIndex, accepted in pairs(unloadingStation.acceptedFillTypes) do
                    if accepted then
                        local fillType = _G.g_fillTypeManager and _G.g_fillTypeManager:getFillTypeByIndex(fillTypeIndex)
                        if fillType and fillType.name and self:isValidCropName(fillType.name) then
                            local priceInfo = self:getStationFillTypePrice(station, unloadingStation, fillTypeIndex, fillType)
                            if priceInfo and priceInfo.price > 0 then
                                stationData.prices[fillType.name] = priceInfo
                                pricesFound = true
                            end
                        end
                    end
                end
            end
        end
    end
    
    return pricesFound
end

function EconomyDataCollector:collectFromProductionPoint(station, stationData)
    local spec = station.spec_productionPoint
    local pricesFound = false
    
    if spec.unloadingStation and spec.unloadingStation.acceptedFillTypes then
        for fillTypeIndex, accepted in pairs(spec.unloadingStation.acceptedFillTypes) do
            if accepted then
                local fillType = _G.g_fillTypeManager and _G.g_fillTypeManager:getFillTypeByIndex(fillTypeIndex)
                if fillType and fillType.name and self:isValidCropName(fillType.name) then
                    local priceInfo = self:getStationFillTypePrice(station, spec.unloadingStation, fillTypeIndex, fillType)
                    if priceInfo and priceInfo.price > 0 then
                        stationData.prices[fillType.name] = priceInfo
                        pricesFound = true
                    end
                end
            end
        end
    end
    
    return pricesFound
end

function EconomyDataCollector:collectFromDirectStation(station, stationData)
    local pricesFound = false
    
    if station.acceptedFillTypes then
        for fillTypeIndex, accepted in pairs(station.acceptedFillTypes) do
            if accepted then
                local fillType = _G.g_fillTypeManager and _G.g_fillTypeManager:getFillTypeByIndex(fillTypeIndex)
                if fillType and fillType.name and self:isValidCropName(fillType.name) then
                    local priceInfo = self:getStationFillTypePrice(station, station, fillTypeIndex, fillType)
                    if priceInfo and priceInfo.price > 0 then
                        stationData.prices[fillType.name] = priceInfo
                        pricesFound = true
                    end
                end
            end
        end
    end
    
    return pricesFound
end

function EconomyDataCollector:getStationFillTypePrice(station, sellingStation, fillTypeIndex, fillType)
    -- A seasonal base price, input recipe or configured multiplier is not a buyer offer.
    -- The game uses the live SellingStation effective price for a sale.
    if not sellingStation or type(sellingStation.getEffectiveFillTypePrice) ~= "function" then
        return nil
    end
    if not sellingStation.acceptedFillTypes or not sellingStation.acceptedFillTypes[fillTypeIndex] then
        return nil
    end
    if sellingStation.fillTypePrices and sellingStation.fillTypePrices[fillTypeIndex] == nil then
        return nil
    end
    local success, price = pcall(sellingStation.getEffectiveFillTypePrice, sellingStation, fillTypeIndex)
    if not success or type(price) ~= "number" or price <= 0 or price ~= price or price == math.huge then
        return nil
    end
    local basePrice = type(fillType.pricePerLiter) == "number" and fillType.pricePerLiter * 1000 or 0
    local currentPrice = price * 1000
    return {
        price = currentPrice,
        basePrice = basePrice,
        multiplier = basePrice > 0 and currentPrice / basePrice or 1,
        isSpecialEvent = false,
        fillTypeIndex = tonumber(fillTypeIndex)
    }
end
function EconomyDataCollector:isValidCropName(name)
    if not name or type(name) ~= "string" or name == "" then
        return false
    end
    
    local skipPatterns = {
        "^BIGBAG", "^BIG_BAG", "BIGBAG$", "BIG_BAG$",
        "^PALLET", "^PALETTE", "PALLET$", "PALETTE$",
        "^UNKNOWN$", "^EMPTY$", "^NONE$", "^NULL$",
        "^TEST", "^DEBUG", "^TEMP", "PLACEHOLDER",
        "^[0-9]+$" 
    }
    
    local upperName = string.upper(name)
    
    for _, pattern in ipairs(skipPatterns) do
        if string.find(upperName, pattern) then
            return false
        end
    end
    
    if string.len(name) > 40 then
        return false
    end

    return true
end
