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
    local SS = type(_G.SellingStation) == "table" and _G.SellingStation or nil
    if station.isa and SS then
        local ok, yes = pcall(function() return station:isa(SS) end)
        if ok and yes then return true end
    end
    return false
end

-- Engine money per litre (SellingStation:getEffectiveFillTypePrice, EconomyManager:getPricePerLiter).
-- Kept fractional: 0.80/L is a real price. Anything but a finite positive number is no price.
local function _pricePerLiter(p)
    if type(p) ~= "number" or p ~= p or p <= 0 or p == math.huge then return nil end
    return p
end

local function _positiveFarmId(v)
    local n = tonumber(v)
    if n and n > 0 and n == math.floor(n) and n ~= math.huge then return n end
    return nil
end

-- Farm that owns this stock bucket, from the bucket or its key. nil when unknown or contradictory;
-- never the viewing player's farm, which says nothing about whose stock this is.
local function _bucketFarmId(key, bucket)
    local fromBucket = _positiveFarmId(type(bucket) == "table" and bucket.farmId or nil)
    local fromKey = _positiveFarmId(key)
    if fromBucket and fromKey and fromBucket ~= fromKey then return nil end
    return fromBucket or fromKey
end

-- A farm cannot sell to its own buyer. Unowned (nil/0) buyers serve every farm; a farm-owned buyer
-- serves other farms only, so an unknown stock farm is offered unowned buyers alone.
local function _buyerServesFarm(station, stockFarmId)
    local owner = tonumber(station.ownerFarmId)
    if owner == nil or owner == 0 then return true end
    return stockFarmId ~= nil and owner ~= stockFarmId
end

local function _attachSellPrices(byFarm)
    local mission = _G.g_currentMission
    if not mission then return end
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

    local SS = type(_G.SellingStation) == "table" and _G.SellingStation or nil
    for bucketKey, farmBucket in pairs(byFarm) do
        local stockFarmId = _bucketFarmId(bucketKey, farmBucket)
        for _, item in ipairs(farmBucket.items or {}) do
            local idx = tonumber(item.fillTypeIndex)
            if idx then
                local bestPrice, bestStation, greatDemand, priceTrend = 0, nil, false, 0
                if em and em.getPricePerLiter then
                    local okE, p = pcall(function() return em:getPricePerLiter(idx) end)
                    p = okE and _pricePerLiter(p) or nil
                    if p and p > bestPrice then
                        bestPrice, bestStation = p, "Market"
                    end
                end
                for _, station in pairs(stations) do
                    if _isSellingStation(station) then
                        if type(station.acceptedFillTypes) == "table" and station.acceptedFillTypes[idx]
                            and _buyerServesFarm(station, stockFarmId) then
                            local okP, price = pcall(function()
                                if station.getEffectiveFillTypePrice then
                                    return station:getEffectiveFillTypePrice(idx)
                                end
                                return em and em.getPricePerLiter and em:getPricePerLiter(idx, station)
                            end)
                            price = okP and _pricePerLiter(price) or nil
                            if price and price > bestPrice then
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
                    item.bestSellPrice = bestPrice
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
            local placeable = m.placeableSystem.placeables[i]
            -- InventoryScan.scanPlaceableForFarm only reads these specializations.
            -- Skip decorative/map placeables before the per-frame stock queue.
            if placeable and (placeable.spec_silo or placeable.spec_siloExtension
                or placeable.spec_husbandry or placeable.spec_beehivePalletSpawner
                or placeable.spec_manureHeap or placeable.spec_bunkerSilo
                or placeable.spec_objectStorageMod or placeable.spec_objectStorage) then
                st.placeables[#st.placeables + 1] = placeable
            end
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
