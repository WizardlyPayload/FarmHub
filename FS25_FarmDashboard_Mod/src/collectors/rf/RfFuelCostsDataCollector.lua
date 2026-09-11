-- FS25 FarmDashboard | RfFuelCostsDataCollector.lua | v0.2.0
-- Fuel Costs aggregates (soft-detect; SCHEMAS.md realisticFarming.fuelCosts)
-- Owner: Agent Economy — never write RF mod state.

RfFuelCostsDataCollector = {}

local function rfModLoaded(name)
    if _G.g_modIsLoaded and _G.g_modIsLoaded[name] then
        return true
    end
    if _G.g_modManager and _G.g_modManager.getActiveModByName then
        local ok, mod = pcall(function()
            return _G.g_modManager:getActiveModByName(name)
        end)
        if ok and mod ~= nil then
            return true
        end
    end
    return false
end

local function resolveFuelManager()
    local mission = _G.g_currentMission
    if mission and mission.fuelCostsManager ~= nil then
        return mission.fuelCostsManager
    end
    local ok, mgr = pcall(function()
        return getfenv(0)["g_FuelCostsManager"]
    end)
    if ok and mgr ~= nil then
        return mgr
    end
    return nil
end

function RfFuelCostsDataCollector.isModLoaded()
    if rfModLoaded("FS25_FuelCosts") then
        return true
    end
    return resolveFuelManager() ~= nil
end

local function mapTrend(raw)
    if raw == "up" then
        return "up"
    end
    if raw == "down" then
        return "down"
    end
    if raw == "stable" or raw == "flat" then
        return "flat"
    end
    return nil
end

function RfFuelCostsDataCollector:init()
    RfFuelCostsDataCollector._inc = nil
end

function RfFuelCostsDataCollector:collectBegin()
    RfFuelCostsDataCollector._inc = { done = false }
end

function RfFuelCostsDataCollector:collectStep(_opts)
    RfFuelCostsDataCollector._inc = nil

    local okAll, payload = pcall(function()
        local mgr = resolveFuelManager()
        if mgr == nil then
            return { enabled = false }
        end

        local pe = mgr.priceEngine
        if pe == nil then
            return { enabled = true, dieselPrice = nil, trend = nil, lastChangePct = nil }
        end

        local dieselPrice = nil
        if type(pe.getDisplayPrice) == "function" then
            local ok, price = pcall(function()
                return pe:getDisplayPrice()
            end)
            if ok then
                dieselPrice = tonumber(price)
            end
        end
        if dieselPrice == nil then
            dieselPrice = tonumber(pe.currentPrice)
        end

        local trend = nil
        if type(pe.getTrend) == "function" then
            local ok, t = pcall(function()
                return pe:getTrend()
            end)
            if ok then
                trend = mapTrend(t)
            end
        end

        local lastChangePct = nil
        local prev = tonumber(pe.previousPrice)
        local cur = tonumber(pe.currentPrice) or dieselPrice
        if prev and prev > 0 and cur ~= nil then
            lastChangePct = ((cur - prev) / prev) * 100
        end

        return {
            enabled = true,
            dieselPrice = dieselPrice,
            trend = trend,
            lastChangePct = lastChangePct,
        }
    end)

    if not okAll or type(payload) ~= "table" then
        return true, { enabled = false }
    end
    return true, payload
end

function RfFuelCostsDataCollector:collect()
    self:collectBegin()
    local done, payload = self:collectStep({})
    return payload or { enabled = false }
end
