-- Optional, read-only Highlands Fishing snapshot. The DLC registers these
-- FarmStats counters and its catch events update the owning farm on the server.
HighlandsFishingDataCollector = {}

local STAT_FIELDS = {
    { "numSoldFish", "soldFish" },
    { "numReleasedFish", "releasedFish" },
    -- The spelling is the DLC's actual FarmStats key.
    { "numCaugthTrashItems", "caughtTrashItems" },
}

local function call(target, method, ...)
    if type(target) ~= "table" or type(target[method]) ~= "function" then return nil end
    local ok, result = pcall(target[method], target, ...)
    if ok then return result end
    return nil
end

local function count(value)
    local n = tonumber(value)
    if n and n == n and n ~= math.huge and n ~= -math.huge and n >= 0 and n % 1 == 0 then
        return n
    end
    return nil
end

function HighlandsFishingDataCollector.collect(mission, farmInfo)
    if type(mission) ~= "table" or type(mission.fishingSystem) ~= "table" then
        return { enabled = false }
    end

    local out = { enabled = true, schema = 1, authoritative = false, byFarm = {} }
    -- FarmStats are changed by the DLC's client-to-server events. A client's
    -- local copy is not evidence of current totals, even when it has zeroes.
    if call(mission, "getIsServer") ~= true or type(farmInfo) ~= "table"
        or type(g_farmManager) ~= "table" or type(g_farmManager.getFarmById) ~= "function" then
        return out
    end
    out.authoritative = true

    local seen = {}
    local limit = math.min(#farmInfo, 32)
    out.farmsTruncated = #farmInfo > limit or nil
    for i = 1, limit do
        local info = farmInfo[i]
        local farmId = type(info) == "table" and count(info.farmId or info.id) or nil
        if type(info) == "table" and info.isPlayer == true and farmId and farmId > 0
            and farmId ~= 100 and not seen[farmId] then
            seen[farmId] = true
            -- Do not call mission:farmStats for an absent farm: FSBaseMission
            -- creates a new FarmStats object in that case.
            local farm = call(g_farmManager, "getFarmById", farmId)
            local stats = type(farm) == "table" and farm.stats or nil
            if type(stats) == "table" then
                local totals, session = {}, {}
                local complete = true
                for _, fields in ipairs(STAT_FIELDS) do
                    local total = count(call(stats, "getTotalValue", fields[1]))
                    local current = count(call(stats, "getSessionValue", fields[1]))
                    if total == nil or current == nil then
                        complete = false
                        break
                    end
                    totals[fields[2]] = total
                    session[fields[2]] = current
                end
                if complete then
                    out.byFarm[tostring(farmId)] = { total = totals, session = session }
                end
            end
        end
    end
    return out
end
