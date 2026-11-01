-- Contract Manager 1.26.0.0 owns a server-side contract ledger and farm stats.
-- Read only the current export farm; native mission offers are outside this page.

local MAX_SCAN = 250
local MAX_ROWS = 40

local function record(ctx, source, farmId, active)
    if type(source) ~= "table" or ctx.num(source.farmId) ~= farmId then
        return nil
    end
    local id = ctx.clip(source.id, 80)
    if id == nil or id == "" then
        return nil
    end
    return {
        farmId = farmId,
        id = id,
        typeName = ctx.clip(source.typeName, 60),
        fieldId = ctx.num(source.fieldId),
        acceptedDay = ctx.num(source.acceptedDay),
        finishedDay = active and nil or ctx.num(source.finishedDay),
        finishState = active and nil or ctx.num(source.finishState),
        -- Acceptance reward is only an offer. Payout exists only after dismiss.
        offeredReward = active and ctx.num(source.rewardAtAccept) or ctx.num(source.reward),
        payout = active and nil or ctx.num(source.payout),
        completion = active and nil or ctx.num(source.completion),
    }
end

CompanionPages.register({
    key = "contractManager",
    modNames = { "FS25_ContractManager", "GH_Dostlar-Studio__FS25_ContractManager_FS25_ContractManager" },
    substrings = { "fs25_contractmanager" },
    collect = function(ctx)
        local farmId = ctx.farmId
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        -- The mod's client history is an on-demand GUI response, not a complete
        -- authoritative register. Withhold it rather than showing partial totals.
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-register-only" }
        end
        local registry = ctx.symbol("ContractManagerRegistry")
        if type(registry) ~= "table" or type(registry.active) ~= "table"
            or type(registry.history) ~= "table" or type(registry.stats) ~= "table" then
            return { readState = "settings-only", reason = "no-contract-register" }
        end

        local active, history = {}, {}
        local activeCount, historyCount, scanned, truncated, invalid = 0, 0, 0, false, false
        for _, source in pairs(registry.active) do
            scanned = scanned + 1
            if scanned > MAX_SCAN then truncated = true; break end
            if type(source) == "table" and ctx.num(source.farmId) == farmId then
                local row = record(ctx, source, farmId, true)
                if row == nil then invalid = true
                else
                    activeCount = activeCount + 1
                    if #active < MAX_ROWS then active[#active + 1] = row
                    else truncated = true end
                end
            end
        end
        table.sort(active, function(a, b) return a.id < b.id end)
        scanned = 0
        for i = #registry.history, 1, -1 do
            scanned = scanned + 1
            if scanned > MAX_SCAN then truncated = true; break end
            local source = registry.history[i]
            if type(source) == "table" and ctx.num(source.farmId) == farmId then
                local row = record(ctx, source, farmId, false)
                if row == nil then invalid = true
                else
                    historyCount = historyCount + 1
                    if #history < MAX_ROWS then history[#history + 1] = row
                    else truncated = true end
                end
            end
        end

        -- getFarmStats creates a new row. Reading the table is deliberately inert.
        local rawStats = registry.stats[farmId]
        local stats = type(rawStats) == "table" and {
            completed = ctx.num(rawStats.completed),
            failed = ctx.num(rawStats.failed),
            canceled = ctx.num(rawStats.canceled),
            timedOut = ctx.num(rawStats.timedOut),
            earned = ctx.num(rawStats.earned),
            penalties = ctx.num(rawStats.penalties),
            reputation = ctx.num(rawStats.reputation),
            failStreak = ctx.num(rawStats.failStreak),
        } or nil
        local hasFarmState = activeCount > 0 or historyCount > 0 or stats ~= nil
        return {
            readState = invalid and "partial" or (hasFarmState and "ok" or "settings-only"),
            reason = hasFarmState and nil or "no-farm-record",
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            byFarm = { [tostring(farmId)] = {
                activeCount = activeCount,
                historyCount = historyCount,
                stats = stats,
            } },
            active = active,
            history = history,
        }
    end,
})
