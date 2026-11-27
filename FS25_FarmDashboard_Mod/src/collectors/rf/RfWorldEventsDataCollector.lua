-- FS25 FarmDashboard | RfWorldEventsDataCollector.lua | v0.2.0
-- Random World Events aggregates (soft-detect; authority-only; never write RF state).
-- Owner: Agent Life
-- Handles: g_currentMission.randomWorldEvents / getfenv(0)["g_RandomWorldEvents"]
-- Shape mirrors FarmTablet RandomWorldEventsApp reads.

RfWorldEventsDataCollector = {}

local MOD_NAME = "FS25_RandomWorldEvents"

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
    if mission and mission.randomWorldEvents ~= nil then
        return true
    end
    if envGet("g_RandomWorldEvents") ~= nil then
        return true
    end
    return false
end

local function resolveManager()
    local mission = _G.g_currentMission
    if mission and mission.randomWorldEvents ~= nil then
        return mission.randomWorldEvents
    end
    return envGet("g_RandomWorldEvents")
end

local function displayName(eventId)
    local s = tostring(eventId or ""):gsub("_", " ")
    if #s < 1 then
        return "Event"
    end
    return s:sub(1, 1):upper() .. s:sub(2)
end

local MAX_PENDING_PER_FARM = 24

local function collectPendingSettlements()
    local mission = _G.g_currentMission
    local farms = _G.g_farmManager
    local ledger = rawget(_G, "RWESettlement")
    if not mission or type(mission.getIsServer) ~= "function"
        or not mission:getIsServer()
        or not farms or type(farms.getFarmById) ~= "function"
        or type(ledger) ~= "table" or type(ledger.pending) ~= "table" then
        return {}, "unavailable"
    end

    local byFarm = {}
    for key, lines in pairs(ledger.pending) do
        local farmId = tonumber(key)
        if farmId and farmId > 0 and farmId % 1 == 0 and type(lines) == "table" then
            local ok, farm = pcall(farms.getFarmById, farms, farmId)
            if ok and farm ~= nil then
                local rows = {}
                local truncated = false
                for _, line in ipairs(lines) do
                    if type(line) == "table" and line.farmRef == farm then
                        local amount = tonumber(line.amount)
                        local day = tonumber(line.queuedDay)
                        if amount and amount == amount and amount ~= 0
                            and amount % 1 == 0 and day and day >= 0 and day % 1 == 0 then
                            if #rows < MAX_PENDING_PER_FARM then
                                rows[#rows + 1] = {
                                    event = line.eventName and tostring(line.eventName) or nil,
                                    amount = amount,
                                    queuedDay = day,
                                }
                            else
                                truncated = true
                            end
                        end
                    end
                end
                if #rows > 0 then
                    byFarm[tostring(farmId)] = { lines = rows, truncated = truncated }
                end
            end
        end
    end
    return byFarm, "ok"
end

function RfWorldEventsDataCollector.isModLoaded()
    return modLoaded()
end

function RfWorldEventsDataCollector:init()
    RfWorldEventsDataCollector._inc = nil
end

function RfWorldEventsDataCollector:collectBegin()
    RfWorldEventsDataCollector._inc = { done = false }
end

function RfWorldEventsDataCollector:collectStep(_opts)
    RfWorldEventsDataCollector._inc = nil
    if not modLoaded() then
        return true, { enabled = false }
    end

    local mgr = resolveManager()
    if mgr == nil then
        return true, {
            enabled = true,
            frequency = nil,
            intensity = nil,
            eventTypeCount = nil,
            active = nil,
            cooldownReady = nil,
        }
    end

    local ok, payload = pcall(function()
        local pendingByFarm, pendingReadState = collectPendingSettlements()
        local evCfg = mgr.events
        local state = mgr.EVENT_STATE
        local frequency = evCfg and tonumber(evCfg.frequency) or nil
        local intensity = evCfg and tonumber(evCfg.intensity) or nil
        local eventTypeCount = tonumber(mgr.eventCounter)

        local active = nil
        local cooldownReady = nil
        local nowMs = (_G.g_currentMission and tonumber(_G.g_currentMission.time)) or 0
        local live = nil
        if type(mgr.getActiveEvent) == "function" then
            local okLive, info = pcall(function() return mgr:getActiveEvent() end)
            if okLive and type(info) == "table" and info.name then
                live = info
            end
        end
        local activeId = (live and live.name) or (state and state.activeEvent) or nil

        if activeId then
            local eventDef = mgr.EVENTS and mgr.EVENTS[activeId]
            local remMs = tonumber(live and live.remainingMs)
            if remMs == nil then
                local elapsed = nowMs - (tonumber(state.eventStartTime) or 0)
                local duration = tonumber(state.eventDuration) or 0
                remMs = math.max(0, duration - elapsed)
            end
            local duration = tonumber(state and state.eventDuration) or 0
            if duration <= 0 and remMs > 0 then
                duration = remMs
            end
            active = {
                id = tostring(activeId),
                name = displayName(activeId),
                category = (live and live.category and tostring(live.category))
                    or (eventDef and eventDef.category and tostring(eventDef.category))
                    or nil,
                remainingMin = math.ceil(remMs / 60000),
                durationMin = math.max(1, math.ceil(duration / 60000)),
            }
            cooldownReady = false
        else
            local coolUntil = (state and tonumber(state.cooldownUntil)) or 0
            cooldownReady = coolUntil == 0 or nowMs >= coolUntil
        end

        return {
            enabled = true,
            frequency = frequency,
            intensity = intensity,
            eventTypeCount = eventTypeCount,
            active = active,
            cooldownReady = cooldownReady,
            pendingByFarm = pendingByFarm,
            pendingReadState = pendingReadState,
        }
    end)

    if ok and type(payload) == "table" then
        return true, payload
    end
    return true, {
        enabled = true,
        frequency = nil,
        intensity = nil,
        eventTypeCount = nil,
        active = nil,
        cooldownReady = nil,
    }
end

function RfWorldEventsDataCollector:collect()
    self:collectBegin()
    local done, payload = self:collectStep({})
    return payload or { enabled = false }
end
