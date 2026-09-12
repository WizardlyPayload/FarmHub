-- FS25 FarmDashboard | RfFertilizerDepotDataCollector.lua | v0.3.0
-- Fertilizer Depot aggregates → realisticFarming.fertilizerDepot (SCHEMAS.md)
-- Owner: Agent Depot
-- Soft-detect only; aggregates; authority-only; never write RF mod state.
--
-- FertilizerDepot 1.0.4+ sets g_currentMission.depotManager AND getfenv g_DepotManager.
-- The placeable is a Giants production hall. Dumped fill lives in ProductionPoint bins
-- (getFillLevel / getCapacity). depotSystem.getStorageInfo is the walk-in shop book
-- (50k) and is only a fallback when the hall does not answer.
-- Never write depot settings, stock, or orders.

RfFertilizerDepotDataCollector = {}

local MAX_DEPOTS = 12
local MAX_LEVELS_PER_DEPOT = 32
local MAX_OPEN_ORDERS = 16
local MOD_NAMES = { "FS25_FertilizerDepot" }

local SEASON_LABELS = {
    fd_season_spring = "Spring",
    fd_season_summer = "Summer",
    fd_season_fall = "Fall",
    fd_season_winter = "Winter",
}

local function modLoaded()
    if _G.g_modIsLoaded then
        for _, name in ipairs(MOD_NAMES) do
            if _G.g_modIsLoaded[name] then
                return true
            end
        end
    end
    if _G.g_modManager and _G.g_modManager.getActiveModByName then
        for _, name in ipairs(MOD_NAMES) do
            local ok, mod = pcall(function()
                return _G.g_modManager:getActiveModByName(name)
            end)
            if ok and mod ~= nil then
                return true
            end
        end
    end
    return RfFertilizerDepotDataCollector.resolveManager() ~= nil
end

--- Resolve DepotManager. Mission handle first (1.0.4+), then getfenv / _G alias.
function RfFertilizerDepotDataCollector.resolveManager()
    local mission = _G.g_currentMission
    if mission ~= nil and mission.depotManager ~= nil then
        return mission.depotManager
    end
    local okEnv, fromEnv = pcall(function()
        return getfenv(0)["g_DepotManager"]
    end)
    if okEnv and fromEnv ~= nil then
        return fromEnv
    end
    if _G.g_DepotManager ~= nil then
        return _G.g_DepotManager
    end
    return nil
end

function RfFertilizerDepotDataCollector.isModLoaded()
    return modLoaded()
end

function RfFertilizerDepotDataCollector:init()
    RfFertilizerDepotDataCollector._inc = nil
end

function RfFertilizerDepotDataCollector:collectBegin()
    RfFertilizerDepotDataCollector._inc = { done = false }
end

local function seasonPriceHint(mgr)
    local hint = nil
    pcall(function()
        local pricing = mgr.pricing
        if pricing == nil then
            return
        end
        local key = nil
        if type(pricing.getSeasonKey) == "function" then
            key = pricing:getSeasonKey()
        end
        local mult = 1
        if type(pricing.getSeasonMultiplier) == "function" then
            mult = tonumber(pricing:getSeasonMultiplier()) or 1
        end
        local seasonalOn = true
        if type(mgr.settings) == "table" and mgr.settings.seasonalPricing == false then
            seasonalOn = false
        end
        if not seasonalOn then
            hint = "Seasonal pricing off · buy ×1.00"
            return
        end
        local season = SEASON_LABELS[tostring(key or "")] or "Season"
        hint = string.format("%s · buy ×%.2f", season, mult)
    end)
    return hint
end

local function placeableName(placeable, depotId)
    local name = nil
    pcall(function()
        if placeable == nil then
            return
        end
        if type(placeable.getName) == "function" then
            name = placeable:getName()
        elseif placeable.name ~= nil then
            name = tostring(placeable.name)
        end
    end)
    if name == nil or name == "" then
        name = "Depot #" .. tostring(depotId)
    end
    return tostring(name)
end

local function storageCapacity(mgr)
    local cap = 50000
    pcall(function()
        if mgr.settings and tonumber(mgr.settings.storageCapacity) then
            cap = tonumber(mgr.settings.storageCapacity)
        elseif _G.DepotConstants and tonumber(DepotConstants.STORAGE_CAPACITY) then
            cap = tonumber(DepotConstants.STORAGE_CAPACITY)
        end
    end)
    return cap
end

local function collectSettings(mgr)
    local cap = storageCapacity(mgr)
    local seasonalOn = true
    pcall(function()
        if type(mgr.settings) == "table" and mgr.settings.seasonalPricing == false then
            seasonalOn = false
        end
    end)
    return {
        storageCapacity = cap,
        seasonalPricing = seasonalOn,
    }
end

local function finishLevelRows(rows)
    local levels = {}
    if type(rows) ~= "table" or #rows == 0 then
        return levels
    end
    table.sort(rows, function(a, b)
        if a.liters ~= b.liters then
            return a.liters > b.liters
        end
        return a.fillType < b.fillType
    end)
    local stocked = {}
    for _, row in ipairs(rows) do
        if (tonumber(row.liters) or 0) > 0 then
            stocked[#stocked + 1] = row
        end
    end
    local source = #stocked > 0 and stocked or rows
    local limit = #stocked > 0 and MAX_LEVELS_PER_DEPOT or math.min(6, MAX_LEVELS_PER_DEPOT)
    for i = 1, math.min(#source, limit) do
        levels[i] = source[i]
    end
    return levels
end

--- Giants ProductionPoint on the depot placeable (hall bins).
--- Same chain Esc uses: spec_productionPoint.productionPoint, then getFillLevel / getCapacity.
local function resolveHallPoint(placeable)
    if placeable == nil then
        return nil
    end
    local spec = placeable.spec_productionPoint or placeable.spec_extendedProductionPoint
    if spec == nil then
        return nil
    end
    local pp = spec.productionPoint or spec
    if type(pp.getFillLevel) == "function" and type(pp.getCapacity) == "function" then
        return pp
    end
    return nil
end

local function fillTypeNameByIndex(idx)
    local name = nil
    pcall(function()
        local ftm = _G.g_fillTypeManager
        if ftm ~= nil and type(ftm.getFillTypeNameByIndex) == "function" then
            name = ftm:getFillTypeNameByIndex(idx)
        end
    end)
    if name == nil or name == "" then
        return nil
    end
    return tostring(name)
end

local function fillTypeIndexByName(name, cached)
    local idx = tonumber(cached)
    pcall(function()
        local ftm = _G.g_fillTypeManager
        if ftm ~= nil and type(ftm.getFillTypeIndexByName) == "function" then
            local live = ftm:getFillTypeIndexByName(tostring(name))
            if live ~= nil and live > 0 then
                idx = live
            end
        end
    end)
    if idx == nil or idx <= 0 then
        return nil
    end
    return idx
end

--- Hall bins the player tips into / loads from. Skip fill types the hall cannot hold (capacity 0).
local function collectHallLevels(mgr, placeable)
    local pp = resolveHallPoint(placeable)
    if pp == nil then
        return nil
    end

    local seen = {}
    local rows = {}

    local function consider(name, idx)
        if name == nil or name == "" or seen[name] then
            return
        end
        if idx == nil or idx <= 0 then
            return
        end
        local cap = 0
        local liters = 0
        pcall(function()
            cap = tonumber(pp:getCapacity(idx)) or 0
        end)
        if cap <= 0 then
            return
        end
        pcall(function()
            liters = tonumber(pp:getFillLevel(idx)) or 0
        end)
        seen[name] = true
        rows[#rows + 1] = {
            fillType = name,
            liters = liters,
            capacity = cap,
        }
    end

    pcall(function()
        local list = nil
        if mgr.sfBridge ~= nil and type(mgr.sfBridge.getFillTypeList) == "function" then
            list = mgr.sfBridge:getFillTypeList()
        end
        if type(list) == "table" then
            for _, ft in ipairs(list) do
                if type(ft) == "table" and ft.name ~= nil then
                    consider(tostring(ft.name), fillTypeIndexByName(ft.name, ft.fillTypeIndex))
                end
            end
        end
    end)

    pcall(function()
        for idx, _ in pairs(pp.inputFillTypeIds or {}) do
            consider(fillTypeNameByIndex(idx), tonumber(idx))
        end
        for idx, _ in pairs(pp.outputFillTypeIds or {}) do
            consider(fillTypeNameByIndex(idx), tonumber(idx))
        end
    end)

    if #rows == 0 then
        return nil
    end
    return finishLevelRows(rows)
end

local function collectShopBookLevels(mgr, depotId)
    local levels = {}
    local system = mgr.depotSystem
    if system == nil then
        return levels
    end
    local cap = storageCapacity(mgr)

    local info = nil
    pcall(function()
        if type(system.getStorageInfo) == "function" then
            info = system:getStorageInfo(depotId)
        end
    end)

    if type(info) == "table" then
        local rows = {}
        for fillType, entry in pairs(info) do
            if type(entry) == "table" then
                rows[#rows + 1] = {
                    fillType = tostring(fillType),
                    liters = tonumber(entry.current) or 0,
                    capacity = tonumber(entry.capacity) or cap,
                }
            end
        end
        return finishLevelRows(rows)
    end

    pcall(function()
        local depot = system:getDepot(depotId)
        if type(depot) ~= "table" or type(depot.storageLevel) ~= "table" then
            return
        end
        local rows = {}
        for fillType, liters in pairs(depot.storageLevel) do
            rows[#rows + 1] = {
                fillType = tostring(fillType),
                liters = tonumber(liters) or 0,
                capacity = cap,
            }
        end
        levels = finishLevelRows(rows)
    end)
    return levels
end

--- Prefer hall bins; shop book only when the production point is missing.
local function collectLevels(mgr, depotId, placeable)
    local hall = collectHallLevels(mgr, placeable)
    if type(hall) == "table" and #hall > 0 then
        return hall, "hall"
    end
    return collectShopBookLevels(mgr, depotId), "shopBook"
end

local function collectOpenOrders(mgr)
    local orders = {}

    pcall(function()
        local pending = mgr.pendingOrders
        if type(pending) ~= "table" then
            return
        end
        for farmId, order in pairs(pending) do
            if type(order) == "table" and #orders < MAX_OPEN_ORDERS then
                local display = tostring(order.displayName or order.fillTypeName or "fill")
                local liters = tonumber(order.maxLiters) or 0
                orders[#orders + 1] = {
                    id = string.format("pending-%s-%s", tostring(farmId), tostring(order.depotId or "?")),
                    summary = string.format("Farm %s · %s · %.0f L (silo pickup)", tostring(farmId), display, liters),
                    status = "pending",
                }
            end
        end
    end)

    pcall(function()
        local ds = mgr.deliverySystem
        if ds == nil or type(ds.deliveries) ~= "table" then
            return
        end
        local statusNames = { [1] = "pending", [2] = "loaded" }
        for depotId, rec in pairs(ds.deliveries) do
            if type(rec) == "table" and #orders < MAX_OPEN_ORDERS then
                local st = tonumber(rec.status) or 0
                if st > 0 then
                    local itemCount = 0
                    if type(rec.items) == "table" then
                        itemCount = #rec.items
                    end
                    orders[#orders + 1] = {
                        id = string.format("delivery-%s", tostring(depotId)),
                        summary = string.format(
                            "Depot #%s delivery · %d item(s) · farm %s",
                            tostring(depotId),
                            itemCount,
                            tostring(rec.farmId or "?")
                        ),
                        status = statusNames[st] or tostring(st),
                    }
                end
            end
        end
    end)

    return orders
end

local function collectPayload()
    local mgr = RfFertilizerDepotDataCollector.resolveManager()
    if mgr == nil then
        return { enabled = false }
    end

    local hint = seasonPriceHint(mgr)
    local depots = {}
    local seen = {}
    local stockSource = "shopBook"

    pcall(function()
        local system = mgr.depotSystem
        local placeables = mgr.depots
        if system == nil then
            return
        end
        local ids = {}
        if type(system._depots) == "table" then
            for id, _ in pairs(system._depots) do
                ids[#ids + 1] = id
            end
        elseif type(placeables) == "table" then
            for id, _ in pairs(placeables) do
                ids[#ids + 1] = id
            end
        end
        table.sort(ids, function(a, b)
            local na, nb = tonumber(a) or 0, tonumber(b) or 0
            return na < nb
        end)

        for _, depotId in ipairs(ids) do
            if #depots >= MAX_DEPOTS then
                break
            end
            if not seen[depotId] then
                seen[depotId] = true
                local placeable = placeables and placeables[depotId] or nil
                local farmId = nil
                pcall(function()
                    if placeable and type(placeable.getOwnerFarmId) == "function" then
                        farmId = tonumber(placeable:getOwnerFarmId())
                    elseif placeable and placeable.ownerFarmId ~= nil then
                        farmId = tonumber(placeable.ownerFarmId)
                    end
                end)
                local levels, source = collectLevels(mgr, depotId, placeable)
                if source == "hall" then
                    stockSource = "hall"
                end
                depots[#depots + 1] = {
                    id = tostring(depotId),
                    name = placeableName(placeable, depotId),
                    farmId = farmId,
                    levels = levels,
                    seasonalPriceHint = hint,
                }
            end
        end
    end)

    local settings = collectSettings(mgr)
    settings.stockSource = stockSource

    return {
        enabled = true,
        seasonalPriceHint = hint,
        settings = settings,
        depots = depots,
        openOrders = collectOpenOrders(mgr),
    }
end

function RfFertilizerDepotDataCollector:collectStep(_opts)
    RfFertilizerDepotDataCollector._inc = nil
    local ok, payload = pcall(collectPayload)
    if not ok or type(payload) ~= "table" then
        return true, { enabled = false }
    end
    return true, payload
end

function RfFertilizerDepotDataCollector:collect()
    self:collectBegin()
    local done, payload = self:collectStep({})
    return payload or { enabled = false }
end
