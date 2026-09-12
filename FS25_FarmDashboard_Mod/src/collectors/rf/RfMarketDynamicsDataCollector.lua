-- FS25 FarmDashboard | RfMarketDynamicsDataCollector.lua | v0.2.0
-- Market Dynamics aggregates (soft-detect; SCHEMAS.md realisticFarming.marketDynamics)
-- Owner: Agent Economy — never write RF mod state.

RfMarketDynamicsDataCollector = {}

local MAX_EVENTS = 12
local MAX_MOVERS = 12
local MAX_FUTURES = 12

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

local function resolveMarketDynamics()
    local mission = _G.g_currentMission
    if mission and mission.MarketDynamics ~= nil then
        return mission.MarketDynamics
    end
    local ok, mgr = pcall(function()
        return getfenv(0)["g_MarketDynamics"]
    end)
    if ok and mgr ~= nil then
        return mgr
    end
    return nil
end

function RfMarketDynamicsDataCollector.isModLoaded()
    if rfModLoaded("FS25_MarketDynamics") then
        return true
    end
    return resolveMarketDynamics() ~= nil
end

local function gameTimeMs()
    local env = _G.g_currentMission and _G.g_currentMission.environment
    if not env then
        return 0
    end
    return ((env.currentDay or 1) - 1) * 86400000 + (env.dayTime or 0)
end

local function fillTypeTitle(idx)
    if not _G.g_fillTypeManager then
        return nil
    end
    local ok, ft = pcall(function()
        return _G.g_fillTypeManager:getFillTypeByIndex(idx)
    end)
    if not ok or not ft then
        return nil
    end
    return ft.title or ft.name or ("Type " .. tostring(idx))
end

local function collectActiveEvents(mgr)
    local out = {}
    local we = mgr.worldEvents
    if not we or type(we.getActiveEvents) ~= "function" then
        return out
    end
    local ok, events = pcall(function()
        return we:getActiveEvents()
    end)
    if not ok or type(events) ~= "table" then
        return out
    end
    local now = gameTimeMs()
    local list = {}
    for _, evt in pairs(events) do
        if type(evt) == "table" then
            list[#list + 1] = evt
        end
    end
    table.sort(list, function(a, b)
        return (tonumber(a.endsAt) or 0) < (tonumber(b.endsAt) or 0)
    end)
    for _, evt in ipairs(list) do
        if #out >= MAX_EVENTS then
            break
        end
        local endsAt = tonumber(evt.endsAt)
        local remMin = nil
        if endsAt ~= nil then
            remMin = math.max(0, math.ceil((endsAt - now) / 60000))
        end
        out[#out + 1] = {
            id = tostring(evt.id or evt.name or (#out + 1)),
            name = tostring(evt.name or evt.id or "Event"),
            intensity = tonumber(evt.intensity) or 0,
            endsAt = endsAt,
            remainingMin = remMin,
        }
    end
    return out
end

local function collectMovers(mgr)
    local out = {}
    local engine = mgr.marketEngine
    if not engine or type(engine.prices) ~= "table" then
        return out
    end
    local movers = {}
    for idx, entry in pairs(engine.prices) do
        if type(entry) == "table" and tonumber(entry.base) and entry.base > 0 and entry.current ~= nil then
            local pct = (entry.current - entry.base) / entry.base * 100
            if math.abs(pct) >= 0.05 then
                local title = fillTypeTitle(idx)
                if title then
                    movers[#movers + 1] = {
                        fillType = title,
                        pricePer1000l = (tonumber(entry.current) or 0) * 1000,
                        pctFromBase = pct,
                    }
                end
            end
        end
    end
    table.sort(movers, function(a, b)
        return math.abs(a.pctFromBase) > math.abs(b.pctFromBase)
    end)
    for i = 1, math.min(MAX_MOVERS, #movers) do
        out[#out + 1] = movers[i]
    end
    return out
end

local function collectFutures(mgr)
    local out = {}
    local fm = mgr.futuresMarket
    if not fm or type(fm.contracts) ~= "table" then
        return out
    end
    local list = {}
    for id, contract in pairs(fm.contracts) do
        if type(contract) == "table" then
            list[#list + 1] = contract
            if contract.id == nil then
                contract.id = id
            end
        end
    end
    table.sort(list, function(a, b)
        return (tonumber(a.id) or 0) < (tonumber(b.id) or 0)
    end)
    for _, c in ipairs(list) do
        if #out >= MAX_FUTURES then
            break
        end
        local status = tostring(c.status or "active")
        if status == "active" or status == "fulfilled" or status == "defaulted" then
            local name = tostring(c.fillTypeName or "Contract")
            local qty = tonumber(c.quantity) or 0
            local delivered = tonumber(c.delivered) or 0
            local summary = string.format("%s · %.0f / %.0f L", name, delivered, qty)
            out[#out + 1] = {
                id = tostring(c.id or (#out + 1)),
                label = name,
                status = status,
                summary = summary,
            }
        end
    end
    return out
end

function RfMarketDynamicsDataCollector:init()
    RfMarketDynamicsDataCollector._inc = nil
end

function RfMarketDynamicsDataCollector:collectBegin()
    RfMarketDynamicsDataCollector._inc = { done = false }
end

function RfMarketDynamicsDataCollector:collectStep(_opts)
    RfMarketDynamicsDataCollector._inc = nil

    local okAll, payload = pcall(function()
        local mgr = resolveMarketDynamics()
        if mgr == nil then
            return { enabled = false }
        end

        local settings = mgr.settings
        local engine = mgr.marketEngine

        return {
            enabled = true,
            isActive = mgr.isActive == true,
            pricesEnabled = settings and settings.pricesEnabled == true or false,
            eventsEnabled = settings and settings.eventsEnabled == true or false,
            eventFrequency = settings and tonumber(settings.eventFrequency) or nil,
            volatilityScale = engine and tonumber(engine.volatilityScale) or nil,
            activeEvents = collectActiveEvents(mgr),
            movers = collectMovers(mgr),
            futures = collectFutures(mgr),
        }
    end)

    if not okAll or type(payload) ~= "table" then
        return true, { enabled = false }
    end
    return true, payload
end

function RfMarketDynamicsDataCollector:collect()
    self:collectBegin()
    local done, payload = self:collectStep({})
    return payload or { enabled = false }
end
