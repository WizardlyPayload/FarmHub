-- FS25 FarmDashboard | StockDataCollector.lua | v2.0.0
-- Farm-wide fill-type stock via InventoryScan (TSStockCheck-aligned pipeline).

StockDataCollector = {}

StockDataCollector._inc = nil
StockDataCollector._baleLast = nil

local function _currentFarmId()
    local m = _G.g_currentMission
    if m and m.getFarmId then
        local ok, fid = pcall(function() return m:getFarmId() end)
        if ok and fid and fid > 0 then return fid end
    end
    return 1
end

local function _isSellingStation(station)
    if not station or station.hideFromPricesMenu then return false end
    if station.spec_sellingStation then return true end
    local SS = rawget(_G, "SellingStation")
    if station.isa and SS then
        local ok, yes = pcall(function() return station:isa(SS) end)
        if ok and yes then return true end
    end
    return false
end

local function _attachSellPrices(byFarm)
    local mission = _G.g_currentMission
    if not mission then return end
    local playerFarmId = mission.getFarmId and mission:getFarmId() or 1
    local em = mission.economyManager
    local stations = {}
    if mission.storageSystem and mission.storageSystem.getUnloadingStations then
        local ok, list = pcall(function() return mission.storageSystem:getUnloadingStations() end)
        if ok and type(list) == "table" then stations = list end
    end
    if em and em.sellingStations then
        for _, st in pairs(em.sellingStations) do
            if st then table.insert(stations, st) end
        end
    end

    local SS = rawget(_G, "SellingStation")
    for _, farmBucket in pairs(byFarm) do
        for _, item in ipairs(farmBucket.items or {}) do
            local idx = tonumber(item.fillTypeIndex)
            if idx then
                local bestPrice, bestStation, greatDemand, priceTrend = 0, nil, false, 0
                if em and em.getPricePerLiter then
                    local okE, p = pcall(function() return em:getPricePerLiter(idx) end)
                    if okE and p and p > bestPrice then
                        bestPrice, bestStation = p, "Market"
                    end
                end
                for _, station in pairs(stations) do
                    if _isSellingStation(station) then
                        if station.acceptedFillTypes and station.acceptedFillTypes[idx]
                            and station.ownerFarmId ~= playerFarmId then
                            local okP, price = pcall(function()
                                if station.getEffectiveFillTypePrice then
                                    return station:getEffectiveFillTypePrice(idx)
                                end
                                return em and em.getPricePerLiter and em:getPricePerLiter(idx, station)
                            end)
                            if okP and price and price > bestPrice then
                                bestPrice = price
                                if station.getName then
                                    local okN, nm = pcall(function() return station:getName() end)
                                    if okN and nm then bestStation = nm end
                                end
                                if station.greatDemandFillType == idx then greatDemand = true end
                                if station.getCurrentPricingTrend then
                                    local okT, tr = pcall(function() return station:getCurrentPricingTrend(idx) end)
                                    if okT and tr then priceTrend = tr end
                                end
                            end
                        end
                    end
                end
                if bestPrice > 0 then
                    item.bestSellPrice = math.floor(bestPrice)
                    item.bestSellStation = bestStation
                    item.greatDemand = greatDemand
                    item.priceTrend = priceTrend
                end
            end
        end
    end
end

function StockDataCollector:init()
    StockDataCollector._inc = nil
    StockDataCollector._baleLast = nil
end

function StockDataCollector:collectBegin()
    if rawget(_G, "FillTypeUtils") and FillTypeUtils.rebuildCatalog then
        FillTypeUtils.rebuildCatalog()
    end
    local farmIds = InventoryScan.collectPlayerFarmIds()
    StockDataCollector._inc = {
        placeables = {},
        idx = 1,
        state = InventoryScan.newStockState(farmIds),
        baleState = InventoryScan.newBaleState(farmIds),
        farmIds = farmIds,
    }
    local st = StockDataCollector._inc
    local m = _G.g_currentMission
    if m and m.placeableSystem and m.placeableSystem.placeables then
        for i = 1, #m.placeableSystem.placeables do
            table.insert(st.placeables, m.placeableSystem.placeables[i])
        end
    end
end

function StockDataCollector:collectStep(opts)
    local st = StockDataCollector._inc
    if not st then return true, { enabled = true, byFarm = {} } end

    local batch = math.max(1, tonumber(opts and opts.stockPlaceablesPerFrame) or 4)
    local n = #st.placeables
    local hi = math.min(st.idx + batch - 1, n)
    for i = st.idx, hi do
        InventoryScan.scanPlaceable(st.placeables[i], st.farmIds, st.state, st.baleState)
    end
    st.idx = hi + 1

    if st.idx > n then
        _attachSellPrices(st.state.byFarm)
        local result = InventoryScan.finalizeStock(st.state)
        StockDataCollector._baleLast = InventoryScan.finalizeBales(st.baleState, _currentFarmId())
        StockDataCollector._inc = nil
        return true, result
    end
    return false, { enabled = true, byFarm = {}, partial = true }
end

function StockDataCollector:collect()
    self:collectBegin()
    local done, result = false, nil
    while not done do
        done, result = self:collectStep({ stockPlaceablesPerFrame = 9999 })
    end
    return result or { enabled = true, byFarm = {} }
end
