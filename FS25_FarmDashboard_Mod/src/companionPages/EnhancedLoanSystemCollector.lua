-- FS25 FarmDashboard | companionPages/EnhancedLoanSystemCollector.lua | v1.0.0
-- Enhanced Loan System (Chissel): g_els_loanManager in the mod env holds loans[farmId] = { ELS_loan }
-- and loanManagerProperties (bank settings). Annuities are charged per period (month) on PERIOD_CHANGED.
-- Borrowing capacity mirrors ELS_loanManager:maxLoanAmountForFarm (money + collateral - 2x open debt).

local MAX_FARMS = 16
local MAX_LOANS = 25
local MAX_PAID = 25
local MAX_PAYOFF_MONTHS = 600

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

local function annuityOf(ctx, loan)
    local v = ctx.num(ctx.call(loan, "calculateAnnuity"))
    if v then
        return v
    end
    local amount, rate, years = ctx.num(loan.amount), ctx.num(loan.interest), ctx.num(loan.duration)
    if not (amount and rate and years) or rate <= 0 or years <= 0 then
        return nil
    end
    local q = (1 + rate / 100) ^ years
    return amount * ((q * (rate / 100)) / (q - 1)) / 12
end

--- Remaining cost if paid as scheduled (ELS_loan:calculateTotalAmount, bounded).
local function remainingCost(rest, rate, annuity)
    if not (rest and rate and annuity) or annuity <= 0 then
        return nil
    end
    local total = 0
    for _ = 1, MAX_PAYOFF_MONTHS do
        local interest = ((rate / 100) * rest) / 12
        local repayment = annuity - interest
        if repayment <= 0 then
            return nil
        end
        if repayment > rest then
            return total + rest + interest
        end
        total = total + annuity
        rest = rest - repayment
    end
    return nil
end

local function readLoan(ctx, loan)
    local rest = ctx.num(loan.restAmount) or 0
    local rate = ctx.num(loan.interest)
    local annuity = annuityOf(ctx, loan)
    local interestPortion = rate and (rate / 100) * rest / 12 or nil
    local total = remainingCost(rest, rate, annuity)
    return {
        amount = ctx.num(loan.amount),
        restAmount = rest,
        interest = ctx.round2(rate),
        durationYears = ctx.num(loan.duration),
        restMonths = ctx.num(loan.restDuration),
        monthlyAnnuity = ctx.round2(annuity),
        monthlyInterest = ctx.round2(interestPortion),
        monthlyRepayment = (annuity and interestPortion) and ctx.round2(annuity - interestPortion) or nil,
        remainingCost = ctx.round2(total),
        remainingInterest = total and ctx.round2(math.max(total - rest, 0)) or nil,
        specialRedemptionDone = loan.specialRedemptionDone == true,
    }
end

local function readFarm(ctx, mgr, props, farm)
    local fid = ctx.num(farm.farmId)
    local loans = type(mgr.loans) == "table" and mgr.loans[fid] or nil
    local current, paid = {}, {}
    local totals = { debt = 0, borrowed = 0, annuity = 0, interest = 0, remainingCost = 0, remainingInterest = 0 }
    local paidTotal, paidCount = 0, 0
    if type(loans) == "table" then
        for _, loan in pairs(loans) do
            if type(loan) == "table" then
                if loan.paidOff == true then
                    paidCount = paidCount + 1
                    paidTotal = paidTotal + (ctx.num(loan.amount) or 0)
                    if #paid < MAX_PAID then
                        paid[#paid + 1] = {
                            amount = ctx.num(loan.amount),
                            interest = ctx.round2(loan.interest),
                            durationYears = ctx.num(loan.duration),
                        }
                    end
                else
                    local row = readLoan(ctx, loan)
                    totals.debt = totals.debt + (row.restAmount or 0)
                    totals.borrowed = totals.borrowed + (row.amount or 0)
                    totals.annuity = totals.annuity + (row.monthlyAnnuity or 0)
                    totals.interest = totals.interest + (row.monthlyInterest or 0)
                    totals.remainingCost = totals.remainingCost + (row.remainingCost or 0)
                    totals.remainingInterest = totals.remainingInterest + (row.remainingInterest or 0)
                    if #current < MAX_LOANS then
                        current[#current + 1] = row
                    end
                end
            end
        end
    end
    table.sort(current, function(a, b)
        return (a.restAmount or 0) > (b.restAmount or 0)
    end)

    local money = ctx.num(ctx.call(ctx.mission, "getMoney", fid)) or ctx.num(farm.money)
    local vehicleValue = ctx.num(ctx.call(mgr, "calculateVehicleAmount", fid))
    local farmlandValue = ctx.num(ctx.call(mgr, "calculateFarmlandAmount", fid))
    local vehiclePct = props and ctx.num(props.vehicleMortgagePercentage) or nil
    local farmlandPct = props and ctx.num(props.farmlandMortgagePercentage) or nil
    local capacity = nil
    if money and vehicleValue and farmlandValue and vehiclePct and farmlandPct then
        capacity = money + vehicleValue * vehiclePct + farmlandValue * farmlandPct - totals.debt * 2
    end

    return {
        money = ctx.round2(money),
        loanCount = #current,
        debt = ctx.round2(totals.debt),
        borrowed = ctx.round2(totals.borrowed),
        monthlyAnnuity = ctx.round2(totals.annuity),
        monthlyInterest = ctx.round2(totals.interest),
        monthlyRepayment = ctx.round2(totals.annuity - totals.interest),
        remainingCost = ctx.round2(totals.remainingCost),
        remainingInterest = ctx.round2(totals.remainingInterest),
        vehicleValue = ctx.round2(vehicleValue),
        farmlandValue = ctx.round2(farmlandValue),
        vehicleCollateral = (vehicleValue and vehiclePct) and ctx.round2(vehicleValue * vehiclePct) or nil,
        farmlandCollateral = (farmlandValue and farmlandPct) and ctx.round2(farmlandValue * farmlandPct) or nil,
        borrowingCapacity = ctx.round2(capacity),
        paidOffCount = paidCount,
        paidOffTotal = ctx.round2(paidTotal),
        loans = current,
        paidOff = paid,
    }
end

CompanionPages.register({
    key = "enhancedLoanSystem",
    modNames = { "FS25_EnhancedLoanSystem", "FS25_314906_Enhanced_Loan_System" },
    substrings = { "enhancedloansystem" },
    collect = function(ctx)
        local mgr = ctx.symbol("g_els_loanManager")
        if type(mgr) ~= "table" then
            return nil
        end
        local props = type(mgr.loanManagerProperties) == "table" and mgr.loanManagerProperties or nil
        local limits = ctx.symbol("ELS_loanManagerProperties")
        limits = type(limits) == "table" and limits or {}
        local settings = nil
        if props then
            settings = {
                loanInterest = ctx.round2(props.loanInterest),
                dynamicInterest = props.dynamicLoanInterest == true,
                minInterest = ctx.round2(limits.minLoanInterest),
                maxInterest = ctx.round2(limits.maxLoanInterest),
                interestStep = ctx.round2(limits.loanInterestSteps),
                maxDurationYears = ctx.num(props.maxLoanDuration),
                vehicleMortgage = ctx.round2(props.vehicleMortgagePercentage),
                farmlandMortgage = ctx.round2(props.farmlandMortgagePercentage),
                multipleSpecialRedemptions = props.multipleSpecialRedemptionsAllowed == true,
                specialRedemptionShare = ctx.round2(props.specialRedemptionPercentageForAnnuityLoans),
            }
        end

        local byFarm = {}
        local partial = false
        if type(mgr.loans) == "table" then
            for _, farm in ipairs(farmList(ctx)) do
                local ok, row = pcall(readFarm, ctx, mgr, props, farm)
                if ok and type(row) == "table" then
                    byFarm[tostring(farm.farmId)] = row
                else
                    partial = true
                end
            end
        end

        local readState = "ok"
        if type(mgr.loans) ~= "table" then
            readState = settings and "settings-only" or "detection-only"
        elseif partial or props == nil then
            readState = "partial"
        end
        return {
            readState = readState,
            settings = settings,
            byFarm = byFarm,
        }
    end,
})
