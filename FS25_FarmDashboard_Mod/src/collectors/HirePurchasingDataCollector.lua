-- FS25 FarmDashboard | HirePurchasingDataCollector.lua | v1.0.1
-- Optional FS25_HirePurchasing export — per-farm deal summary + capped deal list.
-- Host needs FarmDashboard (this zip) AND FS25_HirePurchasing loaded; export only on authority.

HirePurchasingDataCollector = {}

local MAX_DEALS = 100
local MOD_NAME = "FS25_HirePurchasing"

--- Soft detect third-party mod (g_modIsLoaded / modManager / known globals).
--- Prefer enabled=true with empty byFarm once the mod is present — do not wait for
--- LeasingOptions.leaseDeals to be non-nil after the first mission tick.
local function hpModLoaded()
    if _G.g_modIsLoaded and _G.g_modIsLoaded[MOD_NAME] then
        return true
    end
    if _G.g_modManager and _G.g_modManager.getActiveModByName then
        local ok, mod = pcall(function()
            return _G.g_modManager:getActiveModByName(MOD_NAME)
        end)
        if ok and mod ~= nil then
            return true
        end
    end
    -- Hire Purchasing registers global LeasingOptions at source time (before loadMap).
    if type(rawget(_G, "LeasingOptions")) == "table" then
        return true
    end
    if type(rawget(_G, "LeaseDeal")) == "table" then
        return true
    end
    local m = _G.g_currentMission
    if m and m.LeasingOptions ~= nil then
        return true
    end
    return false
end

local function hpManagerReady()
    local m = _G.g_currentMission
    return m ~= nil and m.LeasingOptions ~= nil and type(m.LeasingOptions.leaseDeals) == "table"
end

local function hpEmptyPayload()
    return { enabled = true, byFarm = {} }
end

local function hpCollectFarmIds()
    local farmIds = {}
    local seen = {}
    if _G.g_farmManager and _G.g_farmManager.farms then
        for _, farm in pairs(_G.g_farmManager.farms) do
            local fid = farm and tonumber(farm.farmId)
            if fid and fid > 0 then
                local hasPlayers = false
                if farm.players then
                    for _ in pairs(farm.players) do
                        hasPlayers = true
                        break
                    end
                end
                local name = farm.name and tostring(farm.name):match("^%s*(.-)%s*$") or ""
                if hasPlayers or name ~= "" then
                    seen[fid] = true
                    farmIds[#farmIds + 1] = fid
                end
            end
        end
    end
    -- Include farms that only appear on active deals (edge case).
    local lo = _G.g_currentMission and _G.g_currentMission.LeasingOptions
    if lo and type(lo.leaseDeals) == "table" then
        for _, deal in pairs(lo.leaseDeals) do
            local fid = deal and tonumber(deal.farmId)
            if fid and fid > 0 and not seen[fid] then
                seen[fid] = true
                farmIds[#farmIds + 1] = fid
            end
        end
    end
    if #farmIds < 1 then
        local mission = _G.g_currentMission
        if mission and mission.getFarmId then
            local ok, fid = pcall(function() return mission:getFarmId() end)
            if ok and fid and fid > 0 then
                farmIds[#farmIds + 1] = fid
            end
        end
    end
    return farmIds
end

local function hpRound2(value)
    local n = tonumber(value)
    if n == nil then return nil end
    return math.floor(n * 100 + 0.5) / 100
end

local function hpVehicleName(deal)
    if not deal then return nil end
    local ok, vehicle = pcall(function()
        if deal.getVehicle then return deal:getVehicle() end
        return nil
    end)
    if ok and vehicle then
        if vehicle.getName then
            local okN, name = pcall(function() return vehicle:getName() end)
            if okN and name and tostring(name) ~= "" then
                return tostring(name)
            end
        end
        if vehicle.name then return tostring(vehicle.name) end
    end
    return nil
end

local function hpSerializeDeal(deal)
    local monthsPaid = tonumber(deal.monthsPaid) or 0
    local duration = tonumber(deal.durationMonths) or 0
    local monthsLeft = math.max(0, duration - monthsPaid)

    local monthlyPayment, remainingCost, settlementCost, interestRate = nil, nil, nil, nil
    if deal.getMonthlyPayment then
        local ok, v = pcall(function() return deal:getMonthlyPayment() end)
        if ok then monthlyPayment = hpRound2(v) end
    end
    if deal.getRemainingCost then
        local ok, v = pcall(function() return deal:getRemainingCost() end)
        if ok then remainingCost = hpRound2(v) end
    end
    if deal.getSettlementCost then
        local ok, v = pcall(function() return deal:getSettlementCost() end)
        if ok then settlementCost = hpRound2(v) end
    end
    if deal.getInterestRate then
        local ok, v = pcall(function() return deal:getInterestRate() end)
        if ok then interestRate = hpRound2((tonumber(v) or 0) * 100) end
    end

    local uniqueId = nil
    if deal.getUniqueId then
        local ok, uid = pcall(function() return deal:getUniqueId() end)
        if ok and uid and tostring(uid) ~= "" then
            uniqueId = tostring(uid)
        end
    elseif deal.vehicle and tostring(deal.vehicle) ~= "" then
        uniqueId = tostring(deal.vehicle)
    end

    return {
        id = deal.id and tostring(deal.id) or nil,
        farmId = tonumber(deal.farmId),
        dealType = tonumber(deal.dealType),
        vehicleName = hpVehicleName(deal),
        vehicleUniqueId = uniqueId,
        baseCost = math.floor(tonumber(deal.baseCost) or 0),
        deposit = math.floor(tonumber(deal.deposit) or 0),
        durationMonths = duration,
        monthsPaid = monthsPaid,
        monthsLeft = monthsLeft,
        finalFee = math.floor(tonumber(deal.finalFee) or 0),
        monthlyPayment = monthlyPayment,
        remainingCost = remainingCost,
        settlementCost = settlementCost,
        interestPercent = interestRate,
    }
end

local function hpSerializeFarm(leaseDeals, farmId)
    local summary = {
        dealCount = 0,
        totalMonthly = 0,
        totalRemaining = 0,
        totalSettlement = 0,
        totalFinalFee = 0,
    }
    local deals = {}

    for _, deal in pairs(leaseDeals) do
        if deal and tonumber(deal.farmId) == farmId then
            -- Skip orphan deals with no resolvable vehicle (same as MenuFinanceList).
            local hasVehicle = true
            if deal.getVehicle then
                local okV, vehicle = pcall(function() return deal:getVehicle() end)
                hasVehicle = okV and vehicle ~= nil
            end
            if hasVehicle then
                local ok, row = pcall(function() return hpSerializeDeal(deal) end)
                if ok and row then
                    summary.dealCount = summary.dealCount + 1
                    summary.totalMonthly = summary.totalMonthly + (tonumber(row.monthlyPayment) or 0)
                    summary.totalRemaining = summary.totalRemaining + (tonumber(row.remainingCost) or 0)
                    summary.totalSettlement = summary.totalSettlement + (tonumber(row.settlementCost) or 0)
                    summary.totalFinalFee = summary.totalFinalFee + (tonumber(row.finalFee) or 0)
                    table.insert(deals, row)
                end
            end
        end
    end

    summary.totalMonthly = hpRound2(summary.totalMonthly) or 0
    summary.totalRemaining = hpRound2(summary.totalRemaining) or 0
    summary.totalSettlement = hpRound2(summary.totalSettlement) or 0

    table.sort(deals, function(a, b)
        local ra = tonumber(a and a.remainingCost) or 0
        local rb = tonumber(b and b.remainingCost) or 0
        if ra ~= rb then return ra > rb end
        return tostring(a and a.id or "") < tostring(b and b.id or "")
    end)

    local truncated = #deals > MAX_DEALS
    if truncated then
        local capped = {}
        for i = 1, MAX_DEALS do
            capped[i] = deals[i]
        end
        deals = capped
    end

    return {
        farmId = farmId,
        summary = summary,
        deals = deals,
        truncated = truncated or nil,
        totalDealCount = summary.dealCount,
    }
end

function HirePurchasingDataCollector.isModLoaded()
    return hpModLoaded()
end

function HirePurchasingDataCollector:init()
    HirePurchasingDataCollector._inc = nil
end

function HirePurchasingDataCollector:collectBegin()
    HirePurchasingDataCollector._inc = {
        stage = "init",
        farmIds = {},
        farmIdx = 1,
        byFarm = {},
    }
end

function HirePurchasingDataCollector:collectStep(opts)
    if not hpModLoaded() then
        HirePurchasingDataCollector._inc = nil
        return true, { enabled = false }
    end

    -- Mod present but lease table not ready yet — still export enabled stub so UI tabs appear.
    if not hpManagerReady() then
        HirePurchasingDataCollector._inc = nil
        return true, hpEmptyPayload()
    end

    local st = HirePurchasingDataCollector._inc
    if not st then return true, hpEmptyPayload() end

    local per = math.max(1, tonumber(opts and opts.hirePurchasingFarmsPerFrame) or 1)
    local leaseDeals = _G.g_currentMission.LeasingOptions.leaseDeals

    if st.stage == "init" then
        st.farmIds = hpCollectFarmIds()
        st.stage = "farms"
        if #st.farmIds < 1 then
            HirePurchasingDataCollector._inc = nil
            return true, { enabled = true, byFarm = {} }
        end
    end

    if st.stage == "farms" then
        local hi = math.min(st.farmIdx + per - 1, #st.farmIds)
        for i = st.farmIdx, hi do
            local fid = st.farmIds[i]
            local ok, row = pcall(function() return hpSerializeFarm(leaseDeals, fid) end)
            if ok and row then
                st.byFarm[tostring(fid)] = row
            end
        end
        st.farmIdx = hi + 1
        if st.farmIdx > #st.farmIds then
            HirePurchasingDataCollector._inc = nil
            return true, { enabled = true, byFarm = st.byFarm }
        end
        return false, { enabled = true, byFarm = st.byFarm, partial = true }
    end

    HirePurchasingDataCollector._inc = nil
    return true, { enabled = true, byFarm = st.byFarm }
end

function HirePurchasingDataCollector:collect()
    self:collectBegin()
    local done, result = false, nil
    while not done do
        done, result = self:collectStep({ hirePurchasingFarmsPerFrame = 9999 })
    end
    return result or { enabled = false }
end
