-- FS25 FarmDashboard | companionPages/AutomaticLoanRepayCollector.lua | v1.0.0
-- Automatic Loan Repay: g_automaticLoanRepay (mod env). On PERIOD_CHANGED it arms a run; at the
-- configured hour it repays the vanilla farm loan in LOAN_STEP chunks, keeping minimumBalance.
-- The projected repayment below is AutomaticLoanRepay:getRepaymentAmount applied to live balances.

local MAX_FARMS = 16

local function farmList(ctx)
    local fm = ctx.global("g_farmManager")
    local out = {}
    if type(fm) ~= "table" then
        return out
    end
    local farms = ctx.call(fm, "getFarms")
    if type(farms) ~= "table" then
        farms = type(fm.farms) == "table" and fm.farms or {}
    end
    for _, farm in pairs(farms) do
        local fid = type(farm) == "table" and ctx.num(farm.farmId) or nil
        if fid and fid > 0 and #out < MAX_FARMS then
            out[#out + 1] = farm
        end
    end
    return out
end

local function repaymentAmount(balance, loan, minimum, step)
    if not (balance and loan and minimum and step) or step <= 0 then
        return 0
    end
    local available = balance - minimum
    if available < step or loan <= 0 then
        return 0
    end
    local amount = math.floor(available / step) * step
    amount = math.min(amount, loan)
    amount = math.floor(amount / step) * step
    return math.max(amount, 0)
end

local function numberList(ctx, tbl, max)
    return ctx.list(tbl, max, function(v)
        return ctx.num(v)
    end)
end

CompanionPages.register({
    key = "automaticLoanRepay",
    modNames = { "FS25_AutomaticLoanRepay", "FS25_365758_Automatic_Loan_Repay" },
    substrings = { "automaticloanrepay" },
    collect = function(ctx)
        local alr = ctx.symbol("g_automaticLoanRepay")
        if type(alr) ~= "table" then
            return nil
        end
        local class = ctx.symbol("AutomaticLoanRepay")
        class = type(class) == "table" and class or {}
        local minimum = ctx.num(alr.minimumBalance)
        local hour = ctx.num(alr.repaymentHour)
        local step = ctx.num(class.LOAN_STEP) or 5000
        local pendingKey = alr.pendingRunKey
        local runArmed = pendingKey ~= nil and pendingKey ~= alr.lastRunKey

        local env = type(ctx.mission) == "table" and ctx.mission.environment or nil
        local currentHour = type(env) == "table" and ctx.num(env.currentHour) or nil
        local hoursUntil = nil
        if runArmed and currentHour and hour then
            hoursUntil = (hour - math.floor(currentHour)) % 24
        end

        local byFarm = {}
        for _, farm in ipairs(farmList(ctx)) do
            local fid = ctx.num(farm.farmId)
            local balance = ctx.num(ctx.call(ctx.mission, "getMoney", fid)) or ctx.num(farm.money)
            local loan = ctx.num(ctx.call(farm, "getLoan")) or ctx.num(farm.loan)
            local upcoming = repaymentAmount(balance, loan, minimum, step)
            local spare = (balance and minimum) and balance - minimum or nil
            byFarm[tostring(fid)] = {
                balance = ctx.round2(balance),
                loan = ctx.round2(loan),
                dailyInterest = ctx.round2(ctx.call(farm, "calculateDailyLoanInterest")),
                nextRepayment = upcoming,
                loanAfter = loan and ctx.round2(math.max(loan - upcoming, 0)) or nil,
                balanceAfter = balance and ctx.round2(balance - upcoming) or nil,
                spareAboveMinimum = ctx.round2(spare),
                shortOfStep = (spare and loan and loan > 0 and upcoming == 0) and ctx.round2(math.max(step - spare, 0)) or nil,
            }
        end

        return {
            readState = (minimum and hour) and "ok" or "partial",
            settings = {
                minimumBalance = minimum,
                repaymentHour = hour,
                loanStep = step,
                defaultMinimumBalance = ctx.num(class.DEFAULT_MINIMUM_BALANCE),
                defaultRepaymentHour = ctx.num(class.DEFAULT_REPAYMENT_HOUR),
                minimumBalanceOptions = numberList(ctx, class.minimumBalanceValues, 20),
            },
            schedule = {
                runArmed = runArmed,
                currentHour = currentHour,
                hoursUntilRun = hoursUntil,
                periodChanges = ctx.num(alr.periodChangeCounter),
            },
            byFarm = byFarm,
        }
    end,
})
