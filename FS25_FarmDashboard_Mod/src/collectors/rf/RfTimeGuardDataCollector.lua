-- FS25 FarmDashboard | RfTimeGuardDataCollector.lua | v0.2.0
-- Time Guard calendar context (soft-detect; authority-only; never money).
-- Owner: Agent Cores
-- Handle: g_currentMission.timeGuard / getfenv(0)["g_timeGuard"]

RfTimeGuardDataCollector = {}

local MOD_NAME = "FS25_TimeGuard"

local function envGet(name)
    local ok, env = pcall(getfenv, 0)
    if ok and type(env) == "table" then
        return env[name]
    end
    return rawget(_G, name)
end

local function modLoaded()
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
    local mission = _G.g_currentMission
    if mission and mission.timeGuard ~= nil then
        return true
    end
    if envGet("g_timeGuard") ~= nil then
        return true
    end
    return false
end

local function resolveGuard()
    local mission = _G.g_currentMission
    if mission and mission.timeGuard ~= nil then
        return mission.timeGuard
    end
    return envGet("g_timeGuard")
end

function RfTimeGuardDataCollector.isModLoaded()
    return modLoaded()
end

function RfTimeGuardDataCollector:init()
    RfTimeGuardDataCollector._inc = nil
end

function RfTimeGuardDataCollector:collectBegin()
    RfTimeGuardDataCollector._inc = { done = false }
end

function RfTimeGuardDataCollector:collectStep(_opts)
    RfTimeGuardDataCollector._inc = nil
    if not modLoaded() then
        return true, { enabled = false }
    end

    local tg = resolveGuard()
    if tg == nil then
        return true, {
            enabled = true,
            period = nil,
            year = nil,
            monthCounter = nil,
            monotonicDay = nil,
            dayInPeriod = nil,
            daysPerPeriod = nil,
            normalizationFactor = nil,
            synced = nil,
        }
    end

    local ok, payload = pcall(function()
        local ctx = nil
        if type(tg.getContext) == "function" then
            local cok, c = pcall(function() return tg:getContext() end)
            if cok and type(c) == "table" then
                ctx = c
            end
        end
        if type(ctx) ~= "table" then
            ctx = {}
        end
        return {
            enabled = true,
            period = tonumber(ctx.period),
            year = tonumber(ctx.year),
            monthCounter = tonumber(ctx.monthCounter),
            monotonicDay = tonumber(ctx.monotonicDay),
            dayInPeriod = tonumber(ctx.dayInPeriod),
            daysPerPeriod = tonumber(ctx.daysPerPeriod),
            normalizationFactor = tonumber(ctx.normalizationFactor),
            synced = ctx.synced,
        }
    end)

    if ok and type(payload) == "table" then
        return true, payload
    end
    return true, {
        enabled = true,
        period = nil,
        year = nil,
        monthCounter = nil,
        monotonicDay = nil,
        dayInPeriod = nil,
        daysPerPeriod = nil,
        normalizationFactor = nil,
        synced = nil,
    }
end

function RfTimeGuardDataCollector:collect()
    self:collectBegin()
    local done, payload = self:collectStep({})
    return payload or { enabled = false }
end
