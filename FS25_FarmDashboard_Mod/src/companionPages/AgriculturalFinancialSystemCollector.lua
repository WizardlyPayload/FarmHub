-- Agricultural Financial System 1.0.2.0 keeps a separate farm bank and
-- outstanding payable/receivable ledger. Read only the loaded server book.
-- Balances here are not native farm money or a lifetime transaction total.

local MAX_SCAN, MAX_ROWS = 300, 40
local KIND = { [1] = "payable", [2] = "receivable" }
local STATUS = { [1] = "open", [2] = "overdue", [4] = "pending" }
local INSTRUMENT = { [1] = "currentAccount", [2] = "promissoryNote", [3] = "cheque" }

local function boundedMoney(ctx, value)
    local n = ctx.num(value)
    if n ~= nil and n >= 0 and n < 1000000000000 then return ctx.round2(n) end
    return nil
end

CompanionPages.register({
    key = "agriculturalFinancialSystem",
    modNames = { "KM_80824_agricultural-financial-system" },
    substrings = { "agricultural-financial-system" },
    collect = function(ctx)
        local farmId, mission = ctx.num(ctx.farmId), ctx.mission
        if farmId == nil or farmId <= 0 or farmId ~= math.floor(farmId) then
            return { readState = "settings-only", reason = "selected-farm-unavailable" }
        end
        if ctx.call(mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-book-only" }
        end
        local manager = type(mission) == "table" and mission.gnFinanzas or nil
        local ledger = type(manager) == "table" and manager.ledger or nil
        if type(ledger) ~= "table" or (manager.loadState ~= 2 and manager.loadState ~= 3)
            or type(ledger.entries) ~= "table" or type(ledger.bankBalances) ~= "table" then
            return { readState = "settings-only", reason = "finance-book-unavailable" }
        end

        local bankBalance = boundedMoney(ctx, ledger.bankBalances[farmId] or 0)
        if bankBalance == nil then
            return { readState = "partial", reason = "invalid-bank-balance", coverage = "partial" }
        end
        local rows, count, payable, receivable, overdue = {}, 0, 0, 0, 0
        local scanned, invalid, truncated = 0, false, false
        for _, entry in pairs(ledger.entries) do
            scanned = scanned + 1
            if scanned > MAX_SCAN then truncated = true; break end
            if type(entry) == "table" and ctx.num(entry.farmId) == farmId and entry.status ~= 3 then
                local id = type(entry.id) == "string" and ctx.clip(entry.id, 64) or nil
                local kind, status = KIND[ctx.num(entry.kind)], STATUS[ctx.num(entry.status)]
                local amount, balance = boundedMoney(ctx, entry.amount), boundedMoney(ctx, entry.balance)
                local dueDay = entry.dueDay == nil and nil or ctx.num(entry.dueDay)
                if id == nil or id == "" or kind == nil or status == nil or amount == nil
                    or balance == nil or (dueDay ~= nil and (dueDay < 0 or dueDay ~= math.floor(dueDay)))
                    or (entry.dueDay ~= nil and dueDay == nil) then
                    invalid = true
                else
                    count = count + 1
                    if kind == "payable" then payable = payable + balance
                    else receivable = receivable + balance end
                    if status == "overdue" then overdue = overdue + 1 end
                    if #rows >= MAX_ROWS then
                        truncated = true
                    else
                        rows[#rows + 1] = {
                            farmId = farmId, id = id, kind = kind, status = status,
                            instrument = INSTRUMENT[ctx.num(entry.instrument)] or "unknown",
                            description = ctx.clip(entry.counterpartName, 100),
                            counterparty = ctx.clip(entry.providerName, 80),
                            amount = amount, balance = balance, dueDay = dueDay,
                        }
                    end
                end
            end
        end
        table.sort(rows, function(a, b)
            if a.dueDay == nil and b.dueDay ~= nil then return true end
            if b.dueDay == nil and a.dueDay ~= nil then return false end
            if a.dueDay ~= b.dueDay then return a.dueDay < b.dueDay end
            return a.id < b.id
        end)
        local coverage = truncated and "truncated" or invalid and "partial" or "complete"
        local hasData = count > 0 or bankBalance > 0
        return {
            readState = (invalid or truncated) and "partial" or (hasData and "ok" or "settings-only"),
            reason = not hasData and coverage == "complete" and "no-farm-finance-records" or nil,
            coverage = coverage,
            byFarm = { [tostring(farmId)] = {
                bankBalance = bankBalance, entryCount = count, overdueCount = overdue,
                payableBalance = coverage == "complete" and ctx.round2(payable) or nil,
                receivableBalance = coverage == "complete" and ctx.round2(receivable) or nil,
            } },
            rows = rows,
        }
    end,
})
