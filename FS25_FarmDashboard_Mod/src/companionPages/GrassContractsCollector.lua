-- Grass Contracts 1.0.0.0: unpaid mowing amount keyed by the mower owner's farm.
-- The mod's paidTotal is session-only and is not an income ledger.

CompanionPages.register({
    key = "grassContracts",
    modNames = { "FS25_377438_Grass_Contracts", "KM_83139_Grass_Contracts" },
    substrings = {},
    collect = function(ctx)
        local farmId = ctx.farmId
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        local mod = ctx.symbol("GrassContracts")
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
