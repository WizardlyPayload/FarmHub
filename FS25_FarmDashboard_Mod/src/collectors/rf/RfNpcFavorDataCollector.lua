-- FS25 FarmDashboard | RfNpcFavorDataCollector.lua | v0.2.0
-- NPC Favor aggregates (soft-detect; authority-only; never write RF state).
-- Owner: Agent Life
-- Handles: g_currentMission.npcFavorSystem / getfenv(0)["g_NPCSystem"]

RfNpcFavorDataCollector = {}

local MOD_NAME = "FS25_NPCFavor"
local MAX_RELATIONSHIPS = 24
local MAX_ACTIVE_FAVORS = 12

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
    if mission and mission.npcFavorSystem ~= nil then
        return true
    end
    if envGet("g_NPCSystem") ~= nil then
        return true
    end
    return false
end

local function resolveSystem()
    local mission = _G.g_currentMission
    if mission and mission.npcFavorSystem ~= nil then
        return mission.npcFavorSystem
    end
    return envGet("g_NPCSystem")
end

local function collectFarmIds()
    local farmIds = {}
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
                    farmIds[#farmIds + 1] = fid
                end
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
    if #farmIds < 1 then
        farmIds[1] = 1
    end
    return farmIds
end

local function buildRelationships(npcSys)
    local out = {}
    local npcs = npcSys and npcSys.activeNPCs
    if type(npcs) ~= "table" then
        return out
    end
    local sorted = {}
    for _, npc in ipairs(npcs) do
        if npc and npc.isActive ~= false then
            sorted[#sorted + 1] = npc
        end
    end
    table.sort(sorted, function(a, b)
        return (tonumber(a.relationship) or 0) > (tonumber(b.relationship) or 0)
    end)
    for _, npc in ipairs(sorted) do
        if #out >= MAX_RELATIONSHIPS then
            break
        end
        local npcId = npc.id or npc.uniqueId
        if npcId ~= nil then
            out[#out + 1] = {
                npcId = tostring(npcId),
                name = npc.name and tostring(npc.name) or nil,
                value = tonumber(npc.relationship),
            }
        end
    end
    return out
end

local function favorFarmId(favor)
    if not favor then
        return nil
    end
    return tonumber(favor.ownerFarmId) or tonumber(favor.farmId)
end

local function favorSummary(favor)
    if not favor then
        return nil
    end
    local desc = favor.description or favor.type
    if desc then
        return tostring(desc)
    end
    local npcName = favor.npcName
    if npcName then
        return tostring(npcName)
    end
    return nil
end

local function buildActiveFavors(npcSys, farmId)
    local out = {}
    local favorSys = npcSys and npcSys.favorSystem
    if not favorSys then
        return out
    end
    local favors = nil
    if type(favorSys.getActiveFavors) == "function" then
        local ok, list = pcall(function() return favorSys:getActiveFavors() end)
        if ok then
            favors = list
        end
    end
    if type(favors) ~= "table" then
        favors = favorSys.activeFavors
    end
    if type(favors) ~= "table" then
        return out
    end
    for _, favor in ipairs(favors) do
        if #out >= MAX_ACTIVE_FAVORS then
            break
        end
        if favor then
            local fid = favorFarmId(favor)
            if fid == nil or fid == farmId then
                local id = favor.id
                out[#out + 1] = {
                    id = id ~= nil and tostring(id) or nil,
                    type = favor.type and tostring(favor.type) or nil,
                    npcId = favor.npcId ~= nil and tostring(favor.npcId) or nil,
                    summary = favorSummary(favor),
                }
            end
        end
    end
    return out
end

function RfNpcFavorDataCollector.isModLoaded()
    return modLoaded()
end

function RfNpcFavorDataCollector:init()
    RfNpcFavorDataCollector._inc = nil
end

function RfNpcFavorDataCollector:collectBegin()
    RfNpcFavorDataCollector._inc = { done = false }
end

function RfNpcFavorDataCollector:collectStep(_opts)
    RfNpcFavorDataCollector._inc = nil
    if not modLoaded() then
        return true, { enabled = false }
    end
    local npcSys = resolveSystem()
    if npcSys == nil then
        return true, { enabled = true, byFarm = {} }
    end

    local ok, payload = pcall(function()
        local relationships = buildRelationships(npcSys)
        local byFarm = {}
        for _, farmId in ipairs(collectFarmIds()) do
            byFarm[tostring(farmId)] = {
                relationships = relationships,
                activeFavors = buildActiveFavors(npcSys, farmId),
            }
        end
        return { enabled = true, byFarm = byFarm }
    end)

    if ok and type(payload) == "table" then
        return true, payload
    end
    return true, { enabled = true, byFarm = {} }
end

function RfNpcFavorDataCollector:collect()
    self:collectBegin()
    local done, payload = self:collectStep({})
    return payload or { enabled = false }
end
