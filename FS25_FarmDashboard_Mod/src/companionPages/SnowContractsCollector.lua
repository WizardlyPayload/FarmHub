-- Snow Contracts 1.1.0.0: unpaid clearing amount keyed by the vehicle owner's farm.
-- The mod's paidTotal is session-only; never present it as saved earnings.

CompanionPages.register({
    key = "snowContracts",
    modNames = { "FS25_354811_FS25_SnowContracts", "KM_76170_Snow_Contracts" },
    substrings = {},
    collect = function(ctx)
        local farmId = ctx.farmId
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        local mod = ctx.symbol("SnowContracts")
        if type(mod) ~= "table" or type(mod._pending) ~= "table" then
            return { readState = "settings-only", reason = "no-pending-register" }
        end
        local amount = ctx.num(mod._pending[farmId]) or 0
        if amount < 0 then
            return { readState = "failed", reason = "invalid-pending-amount" }
        end
        return {
            readState = "ok",
            coverage = "complete",
            byFarm = { [tostring(farmId)] = { pendingAmount = ctx.round2(amount) } },
        }
    end,
})
