-- FS25 FarmDashboard | companionPages/PalletDegradationCollector.lua | v1.0.0
-- Storage Overhaul: Pallet Degradation System (TommyNookah). Mod-env tables read here:
--   PalletData            settings (GlobalMultiplier, RecoveryRate, BaseTempRate, BasePermRate) and
--                         ValidFillTypes { perm, temp, disabledByWhitelist } via getMultipliers/isWhitelisted
--   PalletPriceModifier   sale settings (PRISTINE_BONUS/THRESHOLD, MAX_TEMP/PERM_PENALTY, SALVAGE_FLOOR)
--   PalletMetadata.records[id] { runtimeNode, isOutside, tempDamage, permDamage } (server authority)
--   PalletDegradationManager.cachedPallets { node, object, id, fillType } (refreshed by the mod every 1 s)
-- Read only: no mod function that mutates records (applyTick, registerOrUpdate, syncToEntity) is called.

local SCAN_PALLETS = 300
local MAX_PALLETS = 40
local MAX_FILLTYPES = 30
local SCAN_FILLTYPES = 400

local function condition(ctx, perm)
    local p = ctx.num(perm)
    if p == nil then
        return nil
    end
    return math.max(0, 100 - p * 100)
end

--- PalletPriceModifier:update sale adjustment for one pallet, as a signed ratio of the sale revenue.
local function saleAdjust(ctx, prices, temp, perm)
    if type(prices) ~= "table" then
        return nil
    end
    local t, p = ctx.num(temp) or 0, ctx.num(perm) or 0
    local threshold = ctx.num(prices.PRISTINE_THRESHOLD)
    local bonus = ctx.num(prices.PRISTINE_BONUS)
    local maxTemp = ctx.num(prices.MAX_TEMP_PENALTY)
    local maxPerm = ctx.num(prices.MAX_PERM_PENALTY)
    local floor = ctx.num(prices.SALVAGE_FLOOR) or 0
    if threshold == nil or bonus == nil or maxTemp == nil or maxPerm == nil then
        return nil
    end
    if (t + p) < threshold then
        return bonus
    end
    local penalty = math.min(1.0 - floor, (t * maxTemp) + (p * maxPerm))
    if penalty > 0.001 then
        return -penalty
    end
    return 0
end

local function readSettings(ctx, data, prices)
    local settings = {}
    if type(data) == "table" then
        settings.globalMultiplier = ctx.num(data.GlobalMultiplier)
        settings.recoveryRate = ctx.num(data.RecoveryRate)
        settings.baseTempRate = ctx.num(data.BaseTempRate)
        settings.basePermRate = ctx.num(data.BasePermRate)
    end
    if type(prices) == "table" then
        settings.pristineBonus = ctx.num(prices.PRISTINE_BONUS)
        settings.pristineThreshold = ctx.num(prices.PRISTINE_THRESHOLD)
        settings.maxTempPenalty = ctx.num(prices.MAX_TEMP_PENALTY)
        settings.maxPermPenalty = ctx.num(prices.MAX_PERM_PENALTY)
        settings.salvageFloor = ctx.num(prices.SALVAGE_FLOOR)
    end
    return settings
end

local function readCatalog(ctx, data)
    if type(data) ~= "table" or type(data.ValidFillTypes) ~= "table" then
        return nil
    end
    local tracked, muted, disabled, scanned = 0, 0, 0, 0
    for _, entry in pairs(data.ValidFillTypes) do
        scanned = scanned + 1
        if scanned > SCAN_FILLTYPES then
            break
        end
        if type(entry) == "table" then
            local d, w = ctx.num(entry[1]) or 0, ctx.num(entry[2]) or 0
            if entry.disabledByWhitelist == true then
                disabled = disabled + 1
            elseif d > 0.001 or w > 0.001 then
                tracked = tracked + 1
            else
                muted = muted + 1
            end
        end
    end
    return { tracked = tracked, muted = muted, disabledByWhitelist = disabled }
end

local function fillLevelOf(ctx, object)
    return ctx.round2(ctx.call(object, "getFillUnitFillLevel", 1))
end

CompanionPages.register({
    key = "palletDegradation",
    modNames = {
        "FS25_StorageOverhaulPalletDegradation",
        "FS25_StorageOverhaul",
        "FS25_PalletDegradation",
        "FS25_360720_Storage_Overhaul_Pallet_Degradation_System",
    },
    substrings = { "palletdegradation", "pallet_degradation", "storageoverhaul", "storage_overhaul" },
    collect = function(ctx)
        local data = ctx.symbol("PalletData")
        local meta = ctx.symbol("PalletMetadata")
        local prices = ctx.symbol("PalletPriceModifier")
        local manager = ctx.symbol("PalletDegradationManager")
        if type(data) ~= "table" and type(meta) ~= "table" and type(prices) ~= "table" then
            return nil
        end
        local out = {
            settings = readSettings(ctx, data, prices),
            fillTypeCatalog = readCatalog(ctx, data),
        }
        local farmId = ctx.farmId
        if type(meta) ~= "table" or type(meta.records) ~= "table" or farmId == nil or farmId <= 0 then
            out.readState = "settings-only"
            out.reason = farmId == nil and "no-farm" or "no-records"
            return out
        end

        -- Candidates: prefer the mod's own pallet cache (carries object + fill type name); fall back to
        -- records resolved through nodeToObject when the cache is not built yet.
        local candidates = {}
        local cache = type(manager) == "table" and type(manager.cachedPallets) == "table" and manager.cachedPallets or nil
        local scanned, truncated = 0, false
        if cache ~= nil and #cache > 0 then
            for i = 1, #cache do
                scanned = scanned + 1
                if scanned > SCAN_PALLETS then
                    truncated = true
                    break
                end
                local item = cache[i]
                if type(item) == "table" and type(item.object) == "table" then
                    candidates[#candidates + 1] = {
                        id = item.id ~= nil and tostring(item.id) or nil,
                        object = item.object,
                        fillType = type(item.fillType) == "string" and item.fillType or nil,
                    }
                end
            end
        else
            local mission = ctx.mission
            local nodeMap = type(mission) == "table" and type(mission.nodeToObject) == "table" and mission.nodeToObject or nil
            for id, record in pairs(meta.records) do
                scanned = scanned + 1
                if scanned > SCAN_PALLETS then
                    truncated = true
                    break
                end
                local object = nodeMap and type(record) == "table" and record.runtimeNode ~= nil and nodeMap[record.runtimeNode] or nil
                if type(object) == "table" then
                    candidates[#candidates + 1] = { id = tostring(id), object = object }
                end
            end
        end

        local farm = {
            palletCount = 0,
            trackedCount = 0,
            outsideCount = 0,
            belowHalf = 0,
            belowEighty = 0,
            pristineCount = 0,
            penaltyCount = 0,
            pallets = {},
            byFillType = {},
        }
        local rows = {}
        local byType = {}
        local conditionSum, conditionN, wearSum = 0, 0, 0
        local minCondition = nil
        for _, cand in ipairs(candidates) do
            local object = cand.object
            if ctx.num(object.ownerFarmId) == farmId then
                farm.palletCount = farm.palletCount + 1
                local record = cand.id and meta.records[cand.id] or nil
                local fillType = cand.fillType
                if fillType == nil and type(manager) == "table" then
                    fillType = ctx.call(manager, "getFillTypeName", object)
                end
                fillType = type(fillType) == "string" and fillType ~= "UNKNOWN" and fillType or nil
                local whitelisted = fillType ~= nil and type(data) == "table" and ctx.call(data, "isWhitelisted", fillType) == true
                local row = {
                    id = ctx.clip(cand.id, 40),
                    fillType = ctx.clip(fillType, 40),
                    fillLevel = fillLevelOf(ctx, object),
                    tracked = whitelisted,
                }
                if type(data) == "table" and fillType ~= nil then
                    local d, w = ctx.call(data, "getMultipliers", fillType)
                    row.spoilRate = ctx.round2(d)
                    row.wearRate = ctx.round2(w)
                end
                if type(record) == "table" then
                    row.condition = ctx.round2(condition(ctx, record.permDamage))
                    row.wear = ctx.round2((ctx.num(record.tempDamage) or 0) * 100)
                    row.outside = record.isOutside == true
                    if whitelisted then
                        row.saleAdjust = ctx.round2(saleAdjust(ctx, prices, record.tempDamage, record.permDamage))
                    end
                end
                if whitelisted then
                    farm.trackedCount = farm.trackedCount + 1
                end
                if row.outside then
                    farm.outsideCount = farm.outsideCount + 1
                end
                if row.condition ~= nil then
                    conditionSum = conditionSum + row.condition
                    wearSum = wearSum + (row.wear or 0)
                    conditionN = conditionN + 1
                    minCondition = minCondition == nil and row.condition or math.min(minCondition, row.condition)
                    if row.condition < 50 then
                        farm.belowHalf = farm.belowHalf + 1
                    end
                    if row.condition < 80 then
                        farm.belowEighty = farm.belowEighty + 1
                    end
                end
                if row.saleAdjust ~= nil then
                    if row.saleAdjust > 0 then
                        farm.pristineCount = farm.pristineCount + 1
                    elseif row.saleAdjust < 0 then
                        farm.penaltyCount = farm.penaltyCount + 1
                    end
                end
                rows[#rows + 1] = row
                local typeKey = row.fillType or "UNKNOWN"
                local agg = byType[typeKey]
                if agg == nil then
                    agg = { fillType = row.fillType, count = 0, outside = 0, conditionSum = 0, conditionN = 0 }
                    byType[typeKey] = agg
                end
                agg.count = agg.count + 1
                if row.outside then
                    agg.outside = agg.outside + 1
                end
                if row.condition ~= nil then
                    agg.conditionSum = agg.conditionSum + row.condition
                    agg.conditionN = agg.conditionN + 1
                end
            end
        end

        -- Worst condition first so the bounded list keeps the pallets that need moving.
        table.sort(rows, function(a, b)
            local ca, cb = a.condition or 101, b.condition or 101
            if ca ~= cb then
                return ca < cb
            end
            return tostring(a.id or "") < tostring(b.id or "")
        end)
        for i = 1, math.min(#rows, MAX_PALLETS) do
            farm.pallets[i] = rows[i]
        end
        if #rows > MAX_PALLETS then
            truncated = true
        end
        local typeRows = {}
        for _, agg in pairs(byType) do
            typeRows[#typeRows + 1] = {
                fillType = agg.fillType,
                count = agg.count,
                outside = agg.outside,
                avgCondition = agg.conditionN > 0 and ctx.round2(agg.conditionSum / agg.conditionN) or nil,
            }
        end
        table.sort(typeRows, function(a, b)
            if a.count ~= b.count then
                return a.count > b.count
            end
            return tostring(a.fillType or "") < tostring(b.fillType or "")
        end)
        for i = 1, math.min(#typeRows, MAX_FILLTYPES) do
            farm.byFillType[i] = typeRows[i]
        end
        if conditionN > 0 then
            farm.avgCondition = ctx.round2(conditionSum / conditionN)
            farm.avgWear = ctx.round2(wearSum / conditionN)
            farm.minCondition = ctx.round2(minCondition)
        end

        out.readState = "ok"
        out.coverage = truncated and "truncated" or "complete"
        out.source = cache ~= nil and #cache > 0 and "palletCache" or "records"
        out.recordCount = ctx.count(meta.records)
        out.byFarm = { [tostring(farmId)] = farm }
        return out
    end,
})
