-- One mission-scoped cache of proven active mod names.
-- Shared by companion readers and unit-mode lookup.
-- Membership comes from g_modManager:getActiveMods(), never from the installed
-- inventory (mm.mods) and never from a filesystem or NAS scan.
-- An unready manager is not stored as "no mods". The cache clears on teardown
-- and when the mission save identity changes.

FarmDashboardMissionRegistry = {}

local cache = {
    missionKey = nil,
    members = nil,
    attempts = 0,
}
local MAX_UNREADY_ATTEMPTS = 8

local function missionKey(mission)
    mission = mission or _G.g_currentMission
    if type(mission) ~= "table" then
        return nil
    end
    local info = mission.missionInfo
    if type(info) ~= "table" then
        return nil
    end
    local slot = info.savegameDirectory or info.savegameIndex
    if slot == nil or tostring(slot) == "" then
        return nil
    end
    local mapId = info.mapId or ""
    return tostring(slot) .. "|" .. tostring(mapId)
end

function FarmDashboardMissionRegistry.clear()
    cache.missionKey = nil
    cache.members = nil
    cache.attempts = 0
end

function FarmDashboardMissionRegistry.missionKey(mission)
    return missionKey(mission)
end

local function rememberMission(key)
    if cache.missionKey ~= key then
        cache.missionKey = key
        cache.members = nil
        cache.attempts = 0
    end
end

--- Returns a name->true map once getActiveMods has answered, or nil while the
--- manager is missing. After the retry budget, still returns nil rather than
--- an empty membership, and the next call tries again so a late manager is not
--- cached as inactive forever.
function FarmDashboardMissionRegistry.activeNames()
    local key = missionKey(nil)
    if key == nil then
        return nil, "unready"
    end
    rememberMission(key)
    if type(cache.members) == "table" then
        return cache.members, "cached"
    end
    if cache.attempts >= MAX_UNREADY_ATTEMPTS then
        cache.attempts = 0
        return nil, "unready"
    end
    local mm = _G.g_modManager
    if type(mm) ~= "table" or type(mm.getActiveMods) ~= "function" then
        cache.attempts = cache.attempts + 1
        return nil, "unready"
    end
    local ok, active = pcall(function()
        return mm:getActiveMods()
    end)
    if not ok or type(active) ~= "table" then
        cache.attempts = cache.attempts + 1
        return nil, "unready"
    end
    local members = {}
    for _, mod in pairs(active) do
        local name = nil
        if type(mod) == "string" then
            name = mod
        elseif type(mod) == "table" then
            name = mod.modName or mod.name
        end
        if type(name) == "string" and name ~= "" then
            members[name] = type(mod) == "table" and mod or true
        end
    end
    cache.members = members
    cache.attempts = 0
    return members, "fresh"
end

function FarmDashboardMissionRegistry.isActive(name)
    local members, state = FarmDashboardMissionRegistry.activeNames()
    if type(members) ~= "table" then
        return false, state or "unready"
    end
    return members[name] ~= nil, state
end
