-- FS25 FarmDashboard | SeasonalWoolProductionCollector.lua
-- Dedicated page reader for FS25_SeasonalWoolProduction (Argsy Gaming).
-- Reads the shearing schedule (checkIsShearingMonth, pure), the synced fee/notification settings and, per
-- pen owned by the export farm, the raw wool rate the mod captured, its recorded monthly history, months
-- since the last shearing, mature/total sheep and wool still waiting to spawn as pallets.
-- Never calls performShearing / updatePallets / captureAndSuppressRate. totalWoolSheared is never
-- incremented by the mod and is not exported.

local MAX_SCAN = 300
local MAX_PENS = 24

local NOTIFY_KEYS = {
    "notifyNextMonth",
    "notifyShearingBegins",
    "notifyShearingComplete",
    "notifyShearingCost",
    "notifyLargeWool",
}

local function ownedHusbandries(ctx)
    local out, truncated = {}, false
    local farmId = ctx.farmId
    local mission = ctx.mission
    if farmId == nil or type(mission) ~= "table" then
        return out, truncated
    end
    local list = type(mission.husbandrySystem) == "table" and mission.husbandrySystem.placeables or nil
    if type(list) ~= "table" then
        list = type(mission.placeableSystem) == "table" and mission.placeableSystem.placeables or nil
    end
    if type(list) ~= "table" then
        return out, truncated
    end
    local scanned = 0
    for _, placeable in pairs(list) do
        scanned = scanned + 1
        if scanned > MAX_SCAN then
            truncated = true
            break
        end
        if type(placeable) == "table" then
            local owner = ctx.num(ctx.call(placeable, "getOwnerFarmId")) or ctx.num(placeable.ownerFarmId)
            if owner == farmId then
                out[#out + 1] = placeable
            end
        end
    end
    return out, truncated
end

local function readPen(ctx, prod, placeable, period, fee)
    local uid = ctx.call(prod, "getPlaceableId", placeable)
    if uid == nil then
        return nil
    end
    local rates = type(prod.woolRates) == "table" and prod.woolRates or {}
    local hooked = type(prod.hookedPlaceables) == "table" and prod.hookedPlaceables[uid] == true
    local rawRate = ctx.num(rates[uid])
    if rawRate == nil and not hooked then
        return nil
    end

    local historyAvg, recorded = nil, 0
    local history = type(prod.woolRateHistory) == "table" and prod.woolRateHistory[uid] or nil
    if type(history) == "table" then
        local total = 0
        for p = 1, 12 do
            local v = ctx.num(history[p])
            if v ~= nil then
                total = total + v
                recorded = recorded + 1
            end
        end
        if recorded > 0 then
            historyAvg = total / recorded
        end
    end

    local mature, total = nil, nil
    local okCount, m, t = pcall(prod.countMatureAnimals, prod, placeable)
    if okCount then
        mature, total = ctx.num(m), ctx.num(t)
    end

    local pending = nil
    local palletSpec = placeable.spec_husbandryPallets
    local woolIndex = prod.woolFillType
    if type(palletSpec) == "table" and type(palletSpec.pendingLiters) == "table" and woolIndex ~= nil then
        pending = ctx.num(palletSpec.pendingLiters[woolIndex])
    end

    local last = type(prod.lastShearingPeriod) == "table" and ctx.num(prod.lastShearingPeriod[uid]) or nil
    local since = period ~= nil and ctx.num(ctx.call(prod, "calcPeriodsSince", uid, period)) or nil

    return {
        name = ctx.clip(ctx.call(placeable, "getName"), 60),
        hooked = hooked,
        rawRateLph = ctx.round2(rawRate),
        historyAvgLph = ctx.round2(historyAvg),
        monthsRecorded = recorded,
        lastShearingPeriod = last,
        monthsSinceShearing = since,
        matureSheep = mature,
        totalSheep = total,
        pendingWoolLiters = ctx.round2(pending),
        nextShearingCost = (fee ~= nil and mature ~= nil) and ctx.round2(fee * mature) or nil,
    }
end

CompanionPages.register({
    key = "seasonalWoolProduction",
    modNames = { "FS25_SeasonalWoolProduction", "FS25_356143_Seasonal_Wool_Production" },
    substrings = { "seasonalwool", "seasonal_wool" },
    collect = function(ctx)
        local prod = ctx.symbol("g_seasonalWoolProduction")
        local settings = ctx.symbol("g_seasonalWoolSettings")
        if type(prod) ~= "table" and type(settings) ~= "table" then
            return nil
        end

        local out = { readState = "ok", settings = {} }
        local fee = nil
        if type(settings) == "table" then
            fee = ctx.num(settings.shearingCostPerSheep)
            if fee ~= nil and fee >= 0 then
                out.settings.shearingCostPerSheep = fee
            else
                fee = nil
            end
            for _, key in ipairs(NOTIFY_KEYS) do
                if settings[key] == true or settings[key] == false then
                    out.settings[key] = settings[key]
                end
            end
        end

        if type(prod) ~= "table" or prod.isInitialized ~= true then
            out.readState = "settings-only"
            out.initialized = false
            return out
        end
        out.initialized = true

        local failed = false
        local period = ctx.num(ctx.call(prod, "getCurrentPeriod"))
        if period ~= nil and period >= 1 and period <= 12 then
            out.currentPeriod = math.floor(period)
        else
            period = nil
        end

        local shearing = {}
        for p = 1, 12 do
            if ctx.call(prod, "checkIsShearingMonth", p) == true then
                shearing[#shearing + 1] = p
            end
        end
        out.shearingPeriods = shearing
        if out.currentPeriod ~= nil and #shearing > 0 then
            for step = 1, 12 do
                local p = ((out.currentPeriod - 1 + step) % 12) + 1
                if ctx.call(prod, "checkIsShearingMonth", p) == true then
                    out.nextShearingPeriod = p
                    out.monthsUntilShearing = step
                    break
                end
            end
        end

        out.isShearingMonth = prod.isShearingMonth == true
        out.shearingCompleted = prod.shearingCompleted == true
        local lastMonth = ctx.num(prod.lastProcessedMonth)
        if lastMonth ~= nil and lastMonth >= 1 and lastMonth <= 12 then
            out.lastProcessedMonth = lastMonth
        end
        if type(prod.adapter) == "table" then
            out.realisticLivestockMode = prod.adapter.isRealisticLivestockActive == true
        end

        if ctx.farmId ~= nil then
            local owned, truncated = ownedHusbandries(ctx)
            local pens, sheep, mature, pending, cost = {}, 0, 0, 0, 0
            for _, placeable in ipairs(owned) do
                local okRow, row = pcall(readPen, ctx, prod, placeable, out.currentPeriod, fee)
                if not okRow then
                    failed = true
                elseif row ~= nil then
                    if #pens < MAX_PENS then
                        pens[#pens + 1] = row
                    else
                        truncated = true
                    end
                    sheep = sheep + (row.totalSheep or 0)
                    mature = mature + (row.matureSheep or 0)
                    pending = pending + (row.pendingWoolLiters or 0)
                    cost = cost + (row.nextShearingCost or 0)
                end
            end
            out.byFarm = {
                [tostring(ctx.farmId)] = {
                    penCount = #pens,
                    totalSheep = sheep,
                    matureSheep = mature,
                    pendingWoolLiters = ctx.round2(pending),
                    nextShearingCost = fee ~= nil and ctx.round2(cost) or nil,
                    truncated = truncated,
                    pens = pens,
                },
            }
        end

        if failed then
            out.readState = "partial"
        end
        return out
    end,
})
