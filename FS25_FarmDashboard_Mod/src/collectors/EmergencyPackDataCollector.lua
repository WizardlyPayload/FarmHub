-- Read-only Emergency Pack 1.3.0.0 incident state. The DLC attaches RolePlay
-- to mission.rolePlay and keys running/pending scenarios by owning farm ID.
EmergencyPackDataCollector = {}

local MAX_PLAYER_FARM_ID = 8
local SCENARIO_TYPES = { fire = true, tree = true, oilSpill = true }
-- The DLC's StateIds.lua and FiniteStateMachine:getCurrentState().id.
local RUNNING_STATES = { [1] = "starting", [2] = "running", [3] = "closing", [4] = "aborting" }

local function farmId(value)
    local id = tonumber(value)
    if id and id == id and id % 1 == 0 and id >= 1 and id <= MAX_PLAYER_FARM_ID then
        return id
    end
    return nil
end

local function safeCall(target, method)
    if type(target) ~= "table" or type(target[method]) ~= "function" then return nil end
    local ok, result = pcall(target[method], target)
    if ok then return result end
    return nil
end

local function resolveFarmId(mission, farmInfo)
    -- A local host has a definite farm. A headless server does not; its
    -- snapshot can identify a farm only when the export has exactly one.
    local localId = farmId(safeCall(mission, "getFarmId"))
    if localId then return localId end
    if type(farmInfo) ~= "table" or #farmInfo ~= 1 then return nil end
    local info = farmInfo[1]
    if type(info) ~= "table" or info.isPlayer ~= true then return nil end
    return farmId(info.farmId or info.id)
end

local function incident(rolePlay, scenario, status, ownerId)
    if type(scenario) ~= "table" or farmId(scenario.farmId) ~= ownerId then
        return nil
    end
    local out = { status = status }
    local id = tonumber(scenario.id)
    if id and id == id and id % 1 == 0 and id >= 1 and id <= 255
        and type(rolePlay.scenarioReferences) == "table" then
        local info = rolePlay.scenarioReferences[id]
        if type(info) == "table" and SCENARIO_TYPES[info.type] then
            out.type = info.type
        end
    end
    -- Do not export target coordinates, player participation, rewards,
    -- checkpoint details or descriptions from third-party scenario XML.
    return out
end

function EmergencyPackDataCollector.collect(mission, farmInfo)
    local rolePlay = type(mission) == "table" and mission.rolePlay or nil
    if type(rolePlay) ~= "table" or rolePlay.mission ~= mission then
        return { enabled = false }
    end
    local out = { enabled = true, schema = 1, authoritative = false }
    if safeCall(mission, "getIsServer") ~= true or rolePlay.isServer ~= true then
        return out
    end
    local ownerId = resolveFarmId(mission, farmInfo)
    if not ownerId or type(rolePlay.runningScenarios) ~= "table"
        or type(rolePlay.pendingScenarios) ~= "table" then
        return out
    end
    out.authoritative = true
    out.farmId = ownerId

    local running = rolePlay.runningScenarios[ownerId]
    if running ~= nil then
        local machine = type(rolePlay.stateMachines) == "table"
            and rolePlay.stateMachines[ownerId] or nil
        local state = safeCall(machine, "getCurrentState")
        local status = type(state) == "table" and RUNNING_STATES[state.id] or nil
        if status then out.incident = incident(rolePlay, running, status, ownerId) end
        if out.incident == nil then out.authoritative = false end
        return out
    end
    local pending = rolePlay.pendingScenarios[ownerId]
    if pending ~= nil then
        out.incident = incident(rolePlay, pending, "pending", ownerId)
        if out.incident == nil then out.authoritative = false end
        return out
    end
    out.incident = { status = "none" }
    return out
end
