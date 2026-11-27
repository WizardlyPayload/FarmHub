-- Bank And Credit v1.1.0.0 keeps its own bankCredit.xml loan register.
-- Read only this export farm's live, active loan contracts on the server.

local MAX_SCAN, MAX_ROWS = 300, 40
local KINDS = { [1] = "annuity", [2] = "bullet", [3] = "revolving" }

CompanionPages.register({
    key = "bankAndCreditLoans",
    modNames = { "KM_77828_Bank_And_Credit", "FS25_BankAndCredit" },
    substrings = { "bank_and_credit", "bankandcredit" },
    collect = function(ctx)
        if ctx.version ~= "1.1.0.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmId, mission = ctx.farmId, ctx.mission
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if type(mission) ~= "table" or type(mission.getIsServer) ~= "function"
            or mission:getIsServer() ~= true then
            return { readState = "settings-only", reason = "server-unavailable" }
        end
        local manager = mission.bankManager
        local repo = type(manager) == "table" and manager.repository or nil
        if type(repo) ~= "table" or type(repo.loans) ~= "table" then
            return { readState = "settings-only", reason = "bank-repository-unavailable" }
        end

        local rows, activeCount, scanned = {}, 0, 0
        local invalid, scanIncomplete, rowsTruncated = false, false, false
        for _, loan in pairs(repo.loans) do
            scanned = scanned + 1
            if scanned > MAX_SCAN then scanIncomplete = true; break end
            if type(loan) == "table" and ctx.num(loan.farmId) == farmId and loan.paidOff ~= true then
                local id, kind = ctx.num(loan.id), KINDS[ctx.num(loan.type)]
                local limit, outstanding = ctx.num(loan.amount), ctx.num(loan.restAmount)
                local rate, payment = ctx.num(loan.interestRate), ctx.num(loan.monthlyPayment)
                local months = ctx.num(loan.restDuration)
                if id == nil or id <= 0 or kind == nil or limit == nil or limit < 0
                    or outstanding == nil or outstanding < 0 or rate == nil or rate < 0
                    or payment == nil or payment < 0 or months == nil or months < 0 then
                    invalid = true
                else
                    activeCount = activeCount + 1
                    if #rows >= MAX_ROWS then
                        rowsTruncated = true
                    else
                        rows[#rows + 1] = {
                            farmId = farmId,
                            id = math.floor(id),
                            kind = kind,
                            creditLimit = ctx.round2(limit),
                            outstanding = ctx.round2(outstanding),
                            interestRate = ctx.round2(rate),
                            monthlyPayment = ctx.round2(payment),
                            remainingMonths = math.floor(months),
                        }
                    end
                end
            end
        end
        table.sort(rows, function(a, b) return a.id < b.id end)
        return {
            readState = (invalid or scanIncomplete) and "partial"
                or (activeCount > 0 and "ok" or "settings-only"),
            reason = activeCount == 0 and not (invalid or scanIncomplete)
                and "no-active-farm-loans" or nil,
            coverage = (scanIncomplete or rowsTruncated) and "truncated"
                or invalid and "partial" or "complete",
            byFarm = not (invalid or scanIncomplete)
                and { [tostring(farmId)] = { activeCount = activeCount } } or nil,
            rows = rows,
        }
    end,
})
