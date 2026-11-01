-- Realistic Farm Finance v1.2.0.0 has several finance products. This page
-- reads only active term, mortgage and bullet loan obligations for one farm.
-- Revolving/overdraft facilities have different balance semantics and are withheld.

local MAX_SCAN = 300
local MAX_ROWS = 40
local SUPPORTED = { TERM = true, MORTGAGE = true, BULLET = true }

CompanionPages.register({
    key = "realisticFarmFinanceLoans",
    modNames = { "KM_82429_Realistic_Farm_Finance", "FS25_RealisticFarmFinance" },
    substrings = { "realistic_farm_finance", "realisticfarmfinance" },
    collect = function(ctx)
        local farmId = ctx.farmId
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        local manager = type(ctx.mission) == "table" and ctx.mission.realisticFarmFinance or nil
        local repo = type(manager) == "table" and manager.repository or nil
        if type(repo) ~= "table" or repo.loaded ~= true or type(repo.loans) ~= "table" then
            return { readState = "settings-only", reason = "finance-repository-unavailable" }
        end

        local rows, count, arrearsCount, omittedCount = {}, 0, 0, 0
        local scanned, invalid, truncated = 0, false, false
        for _, loan in pairs(repo.loans) do
            scanned = scanned + 1
            if scanned > MAX_SCAN then truncated = true; break end
            if type(loan) == "table" and ctx.num(loan.farmId) == farmId and loan.paidOff ~= true then
                if not SUPPORTED[loan.type] then
                    omittedCount = omittedCount + 1
                else
                    local id = ctx.num(loan.id)
                    local principal = ctx.num(loan.principal)
                    local arrears = ctx.num(loan.arrearsBalance)
                    if id == nil or id <= 0 or principal == nil or principal < 0
                        or arrears == nil or arrears < 0 then
                        invalid = true
                    else
                        count = count + 1
                        if arrears > 0 then arrearsCount = arrearsCount + 1 end
                        if #rows >= MAX_ROWS then
                            truncated = true
                        else
                            rows[#rows + 1] = {
                                farmId = farmId,
                                id = math.floor(id),
                                kind = loan.type,
                                principal = ctx.round2(principal),
                                arrears = ctx.round2(arrears),
                                interestRate = ctx.num(loan.interestRate),
                                remainingMonths = ctx.num(loan.remainingMonths),
                                paymentsMade = ctx.num(loan.paymentsMade),
                                arrearsStage = ctx.clip(loan.arrearsStage, 32),
                                legacyImported = loan.legacyImported == true,
                            }
                        end
                    end
                end
            end
        end
        table.sort(rows, function(a, b) return a.id < b.id end)
        return {
            readState = invalid and "partial" or (count > 0 and "ok" or "settings-only"),
            reason = count == 0 and "no-supported-farm-loans" or nil,
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            byFarm = { [tostring(farmId)] = {
                loanCount = count,
                arrearsCount = arrearsCount,
                otherProductCount = omittedCount,
            } },
            rows = rows,
        }
    end,
})
