-- Investment System 1.1.0.0: read the existing server farm register.
-- Earned interest may already have been credited to native farm money.

local MAX_SCAN, MAX_ROWS = 100, 40

local function nonnegative(ctx, value)
    local n = ctx.num(value)
    if n ~= nil and n >= 0 and n < 1000000000000 then return n end
    return nil
end

CompanionPages.register({
    key = "investmentSystem",
    modNames = { "FS25_352944_Investment_System", "FS25_InvestmentSystem" },
    substrings = { "investment_system", "investmentsystem" },
    collect = function(ctx)
        if ctx.version ~= "1.1.0.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmId, mission = ctx.num(ctx.farmId), ctx.mission
        if farmId == nil or farmId <= 0 or farmId ~= math.floor(farmId) then
            return { readState = "settings-only", reason = "selected-farm-unavailable" }
        end
        if ctx.call(mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-investments-only" }
        end
        local manager = ctx.symbol("g_bankManager")
        if type(manager) ~= "table" or type(manager.investments) ~= "table"
            or type(manager.totalEarned) ~= "table" then
            return { readState = "settings-only", reason = "investment-manager-unavailable" }
        end
        local investments = manager.investments[farmId]
        if investments ~= nil and type(investments) ~= "table" then
            return { readState = "settings-only", reason = "farm-investments-unavailable" }
        end

        local rows, count, scanned = {}, 0, 0
        local invalid, scanIncomplete, rowsTruncated = false, false, false
        for _, investment in ipairs(investments or {}) do
            scanned = scanned + 1
            if scanned > MAX_SCAN then scanIncomplete = true; break end
            if type(investment) == "table" and ctx.num(investment.farmId) == farmId then
                local amount = nonnegative(ctx, investment.amount)
                local annualRate = nonnegative(ctx, investment.annualRate)
                if amount ~= nil and annualRate ~= nil then
                    count = count + 1
                    if #rows < MAX_ROWS then
                        rows[#rows + 1] = {
                            farmId = farmId,
                            id = nonnegative(ctx, investment.id),
                            amount = ctx.round2(amount),
                            originalAmount = nonnegative(ctx, investment.originalAmount),
                            annualRatePercent = annualRate,
                            compounding = investment.isCompounding == true,
                            termYears = nonnegative(ctx, investment.termYears),
                            earnedInterest = nonnegative(ctx, investment.earnedInterest),
                            depositMonth = nonnegative(ctx, investment.depositMonth),
                            endMonth = nonnegative(ctx, investment.endMonth),
                        }
                    else rowsTruncated = true end
                else invalid = true end
            else invalid = true end
        end
        local totalEarned = nonnegative(ctx, manager.totalEarned[farmId])
        local meaningful = count > 0 or (totalEarned ~= nil and totalEarned > 0)
        local complete = not invalid and not scanIncomplete
        return {
            readState = not complete and "partial" or (meaningful and "ok" or "settings-only"),
            reason = complete and not meaningful and "no-farm-investment-records" or nil,
            coverage = (scanIncomplete or rowsTruncated) and "truncated"
                or invalid and "partial" or "complete",
            byFarm = { [tostring(farmId)] = {
                investmentCount = complete and count or nil,
                totalEarnedAllTime = totalEarned,
            } },
            rows = rows,
        }
    end,
})
