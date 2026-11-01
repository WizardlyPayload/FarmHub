-- Farm Reputation 1.1.0.2: saved reputation and contractor records keyed by farm.
-- Read the exact export farm, never the mod's current-player getters (farm-1 fallback).

local MAX_CONTRACTORS = 40
local MAX_SCAN = 200

CompanionPages.register({
    key = "farmReputation",
    modNames = { "FS25_367320_FS25_FarmReputation" },
    substrings = {},
    collect = function(ctx)
        local farmId = ctx.farmId
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        local manager = ctx.symbol("ReputationManager")
        if type(manager) ~= "table" or type(manager.reputationByFarm) ~= "table" then
            return { readState = "settings-only", reason = "no-reputation-register" }
        end
        local score = ctx.num(manager.reputationByFarm[farmId])
        if score == nil then
            return { readState = "settings-only", reason = "no-farm-record" }
        end

        local rank
        if type(manager.ranks) == "table" then
            for _, entry in ipairs(manager.ranks) do
                if type(entry) == "table" and ctx.num(entry.min) ~= nil and score >= ctx.num(entry.min) then
                    rank = entry
                end
            end
        end
        local jobsByName = type(manager.contractorStatsByFarm) == "table"
            and manager.contractorStatsByFarm[farmId] or nil
        local dataByName = type(manager.contractorDataByFarm) == "table"
            and manager.contractorDataByFarm[farmId] or nil
        local names, seen = {}, {}
        local scanned, truncated = 0, false
        local function addNames(source)
            if type(source) == "table" then
                for name in pairs(source) do
                    scanned = scanned + 1
                    if scanned > MAX_SCAN then
                        truncated = true
                        break
                    end
                    if type(name) == "string" and name ~= "" and not seen[name] then
                        seen[name] = true
                        names[#names + 1] = name
                    end
                end
            end
        end
        addNames(jobsByName)
        addNames(dataByName)
        table.sort(names)
        local rows = {}
        for i = 1, math.min(#names, MAX_SCAN, MAX_CONTRACTORS) do
            local name = names[i]
            local record = type(dataByName) == "table" and dataByName[name] or nil
            rows[#rows + 1] = {
                farmId = farmId,
                contractor = ctx.clip(name, 70),
                -- The mod's getContractorJobs returns zero for a named contractor
                -- absent from contractorStatsByFarm (e.g. just accepted, no result).
                jobs = ctx.num(type(jobsByName) == "table" and jobsByName[name] or nil) or 0,
                reputation = ctx.num(type(record) == "table" and record.reputation or nil),
                completed = ctx.num(type(record) == "table" and record.completed or nil),
                cancelled = ctx.num(type(record) == "table" and record.cancelled or nil),
            }
        end
        truncated = truncated or #names > #rows
        return {
            readState = "ok",
            coverage = truncated and "truncated" or "complete",
            byFarm = { [tostring(farmId)] = {
                score = score,
                rank = rank and ctx.clip(rank.title, 50) or nil,
                missionLimit = rank and ctx.num(rank.missionLimit) or nil,
                contractorCount = #names,
            } },
            contractors = rows,
        }
    end,
})
