-- Mowing Contracts Plus 1.0.0.0: a saved decision on an assigned mowing mission.
-- Single-player only. Never call ensureOffer: it rolls a new offer and mutates the mission.

local MAX_SCAN = 250
local MAX_ROWS = 40

CompanionPages.register({
    key = "mowingContractsPlus",
    modNames = { "FS25_MowingContractsPlus", "KM_82704_Mowing_Contracts_Plus" },
    substrings = { "mowingcontractsplus", "mowing_contracts_plus" },
    collect = function(ctx)
        local farmId = ctx.farmId
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.isMultiplayer then
            return { readState = "settings-only", reason = "single-player-only" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-missions-only" }
        end
        local mod = ctx.symbol("MowingContractsPlus")
        local manager = ctx.global("g_missionManager")
        if type(mod) ~= "table" or type(manager) ~= "table" or type(manager.missions) ~= "table" then
            return { readState = "settings-only", reason = "mission-register-unavailable" }
        end

        local rows, count, scanned = {}, 0, 0
        local invalid, truncated = false, false
        for _, mission in ipairs(manager.missions) do
            scanned = scanned + 1
            if scanned > MAX_SCAN then truncated = true; break end
            if type(mission) == "table" and type(mission.type) == "table"
                and mission.type.name == "mowMission" and ctx.num(mission.farmId) == farmId then
                local choice = ctx.num(mission.mcpChoice)
                if choice ~= nil and choice ~= 0 then
                    local reduction = ctx.num(mission.mcpReduction)
                    local id = ctx.clip(mission.uniqueId, 80)
                    if choice < 1 or choice > 3 or choice ~= math.floor(choice)
                        or reduction == nil or reduction < 0 or reduction > 1
                        or id == nil or id == "" then
                        invalid = true
                    else
                        count = count + 1
                        if #rows < MAX_ROWS then
                            rows[#rows + 1] = {
                                farmId = farmId,
                                id = id,
                                fieldName = ctx.clip(ctx.call(mission.field, "getName"), 80),
                                choice = choice,
                                rewardReductionPct = ctx.round2(reduction * 100),
                            }
                        else
                            truncated = true
                        end
                    end
                end
            end
        end
        table.sort(rows, function(a, b) return a.id < b.id end)
        return {
            readState = invalid and "partial" or count > 0 and "ok" or "settings-only",
            reason = count == 0 and "no-assigned-offer" or nil,
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            byFarm = { [tostring(farmId)] = { decisionCount = count } },
            decisions = rows,
        }
    end,
})
