-- Income Mod 2.2.0.7 owns a separate emergency-debt register per farm.
-- Never call forecast, quote, grant, repay or persistence functions here.

local function nonnegative(ctx, value)
    local n = ctx.num(value)
    return n ~= nil and n >= 0 and n or nil
end

local function integer(ctx, value)
    local n = nonnegative(ctx, value)
    return n ~= nil and n == math.floor(n) and n or nil
end

CompanionPages.register({
    key = "incomeModEmergencyDebt",
    modNames = { "FS25_IncomeMod" },
    substrings = { "incomemod" },
    collect = function(ctx)
        local farmId = integer(ctx, ctx.farmId)
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-debt-only" }
        end
        if ctx.version ~= nil and ctx.version ~= "2.2.0.7" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local manager = ctx.global("g_IncomeManager")
        local loan = type(manager) == "table" and manager.emergencyLoan or nil
        if type(loan) ~= "table" or loan.readiness ~= "READY"
            or type(loan.debts) ~= "table" then
            return { readState = "settings-only", reason = "debt-register-not-ready" }
        end
        local debt = loan.debts[farmId]
        if type(debt) ~= "table" then
            return { readState = "settings-only", reason = "no-farm-emergency-debt" }
        end
        local principal = nonnegative(ctx, debt.principal)
        local interest = nonnegative(ctx, debt.accruedInterest)
        local draws = integer(ctx, debt.drawCount)
        if principal == nil or interest == nil or draws == nil
            or (debt.active == false and principal + interest > 0) then
            return { readState = "partial", reason = "invalid-debt-record",
                coverage = "partial" }
        end
        local active = debt.active == true and principal + interest > 0
        return {
            readState = "ok",
            coverage = "complete",
            byFarm = { [tostring(farmId)] = {
                principal = principal,
                accruedInterest = interest,
                outstanding = principal + interest,
                drawCount = draws,
                active = active,
                revision = integer(ctx, debt.revision),
                lastSettledMonth = integer(ctx, debt.lastSettledMonth),
                interestEligibleFromMonth = integer(ctx, debt.interestEligibleFromMonth),
            } },
        }
    end,
})
