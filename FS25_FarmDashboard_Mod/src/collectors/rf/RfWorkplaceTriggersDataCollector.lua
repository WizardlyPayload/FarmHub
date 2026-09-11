-- FS25 FarmDashboard | RfWorkplaceTriggersDataCollector.lua | v0.2.0
-- Workplace Triggers aggregates (soft-detect; SCHEMAS.md realisticFarming.workplaceTriggers)
-- Owner: Agent Economy — never write RF mod state.

RfWorkplaceTriggersDataCollector = {}

local MAX_WORKPLACES = 24

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

local function resolveWorkplaceSystem()
    local mission = _G.g_currentMission
    if mission and mission.workplaceTriggers ~= nil then
        return mission.workplaceTriggers
    end
    local ok, sys = pcall(function()
        return getfenv(0)["g_WorkplaceSystem"]
    end)
    if ok and sys ~= nil then
        return sys
    end
    return nil
end

function RfWorkplaceTriggersDataCollector.isModLoaded()
    if rfModLoaded("FS25_WorkplaceTriggers") then
        return true
    end
    return resolveWorkplaceSystem() ~= nil
end

local function collectFarmIds()
    local ids = {}
    local seen = {}
    local function add(fid)
        fid = tonumber(fid)
        if fid and fid > 0 and not seen[fid] then
            seen[fid] = true
            ids[#ids + 1] = fid
        end
    end
    if _G.g_farmManager and _G.g_farmManager.farms then
        for _, farm in pairs(_G.g_farmManager.farms) do
            if farm then
                add(farm.farmId or farm.id)
            end
        end
    end
    if #ids < 1 then
        add(1)
    end
    return ids
end

local function listTriggers(sys)
    local tm = sys.triggerManager
    if not tm then
        return {}
    end
    if type(tm.getAllTriggers) == "function" then
        local ok, list = pcall(function()
            return tm:getAllTriggers()
        end)
        if ok and type(list) == "table" then
            return list
        end
    end
    if type(tm.triggers) == "table" then
        return tm.triggers
    end
    return {}
end

local function activeTriggerIdForFarm(sys, farmId)
    local st = sys.shiftTracker
    if not st then
        return nil
    end
    if type(st.isShiftActiveForFarm) == "function" then
        local ok, active = pcall(function()
            return st:isShiftActiveForFarm(farmId)
        end)
        if not ok or not active then
            return nil
        end
    end
    local shifts = st._farmShifts
    if type(shifts) == "table" and type(shifts[farmId]) == "table" then
        return shifts[farmId].triggerId or shifts[farmId].activeTriggerId
    end
    if st.activeTriggerId ~= nil then
        return st.activeTriggerId
    end
    return nil
end

local function buildWorkplacesForFarm(sys, farmId)
    local out = {}
    local triggers = listTriggers(sys)
    local activeId = activeTriggerIdForFarm(sys, farmId)
    local activeIdStr = activeId ~= nil and tostring(activeId) or nil

    for _, t in ipairs(triggers) do
        if type(t) == "table" and #out < MAX_WORKPLACES then
            local visible = tonumber(t.visibleForFarm)
            if visible == nil or visible == 0 or visible == farmId then
                local id = tostring(t.id or t.uniqueId or (#out + 1))
                local onClock = activeIdStr ~= nil and id == activeIdStr
                out[#out + 1] = {
                    id = id,
                    name = t.workplaceName or t.name or "Workplace",
                    onClock = onClock == true,
                    wage = tonumber(t.hourlyWage) or tonumber(t.wage) or nil,
                }
            end
        end
    end
    return out
end

function RfWorkplaceTriggersDataCollector:init()
    RfWorkplaceTriggersDataCollector._inc = nil
end

function RfWorkplaceTriggersDataCollector:collectBegin()
    RfWorkplaceTriggersDataCollector._inc = { done = false }
end

function RfWorkplaceTriggersDataCollector:collectStep(_opts)
    RfWorkplaceTriggersDataCollector._inc = nil

    local okAll, payload = pcall(function()
        local sys = resolveWorkplaceSystem()
        if sys == nil then
            return { enabled = false }
        end

        local byFarm = {}
        for _, fid in ipairs(collectFarmIds()) do
            byFarm[tostring(fid)] = {
                workplaces = buildWorkplacesForFarm(sys, fid),
            }
        end

        return {
            enabled = true,
            byFarm = byFarm,
        }
    end)

    if not okAll or type(payload) ~= "table" then
        return true, { enabled = false }
    end
    return true, payload
end

function RfWorkplaceTriggersDataCollector:collect()
    self:collectBegin()
    local done, payload = self:collectStep({})
    return payload or { enabled = false }
end
