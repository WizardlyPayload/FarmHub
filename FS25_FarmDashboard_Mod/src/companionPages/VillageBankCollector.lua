-- Village Bank 1.6.0.0: existing server farm book only. getFarmData creates
-- accounts, so never call it or the mod's account/contract view helpers.

local MAX_SCAN, MAX_ROWS = 200, 40

local function nonnegative(ctx, value)
    local n = ctx.num(value)
    if n ~= nil and n >= 0 and n < 1000000000000 then return n end
    return nil
end

local function scanList(ctx, source, output, map, allowed)
    local count, scanned, invalid, truncated = 0, 0, false, false
    for _, item in ipairs(source) do
        scanned = scanned + 1
        if scanned > MAX_SCAN then truncated = true; break end
        if type(item) == "table" and (allowed == nil or allowed(item)) then
            local row = map(item)
            if row ~= nil then
                count = count + 1
                if #output < MAX_ROWS then output[#output + 1] = row
                else truncated = true end
            else invalid = true end
        end
    end
    return count, invalid, truncated
end

CompanionPages.register({
    key = "villageBank",
    modNames = { "KM_82435_Village_Bank", "FS25_VillageBank" },
    substrings = { "village_bank", "villagebank" },
    collect = function(ctx)
        if ctx.version ~= "1.6.0.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmId, mission = ctx.num(ctx.farmId), ctx.mission
        if farmId == nil or farmId <= 0 or farmId ~= math.floor(farmId) then
            return { readState = "settings-only", reason = "selected-farm-unavailable" }
        end
        if ctx.call(mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-book-only" }
        end
        local bank = ctx.symbol("g_villageBank")
        local data = type(bank) == "table" and type(bank.farms) == "table"
            and bank.farms[farmId] or nil
        if type(data) ~= "table" or type(data.accounts) ~= "table" then
            return { readState = "settings-only", reason = "farm-book-unavailable" }
        end

        local accounts, deposits, contracts, transactions = {}, {}, {}, {}
        local accountCount, badA, cutA = scanList(ctx, data.accounts, accounts,
            function(account)
                local balance = nonnegative(ctx, account.balance)
                if account.isMain == true or balance == nil then return nil end
                return { farmId = farmId, id = nonnegative(ctx, account.id),
                    name = ctx.clip(account.name, 70), balance = ctx.round2(balance) }
            end, function(account) return account.isMain ~= true end)
        local depositCount, badD, cutD = scanList(ctx, data.savingsDeposits or {}, deposits,
            function(deposit)
                local balance = nonnegative(ctx, deposit.balance)
                if balance == nil then return nil end
                return { farmId = farmId, id = nonnegative(ctx, deposit.id),
                    balance = ctx.round2(balance), principal = nonnegative(ctx, deposit.principal),
                    annualRate = nonnegative(ctx, deposit.annualRate),
                    maturityDay = nonnegative(ctx, deposit.maturityDay) }
            end)
        local financeCount, badF, cutF = scanList(ctx, data.loans or {}, contracts,
            function(loan)
                local outstanding = nonnegative(ctx, loan.outstanding)
                if outstanding == nil then return nil end
                return { farmId = farmId, kind = "finance", id = nonnegative(ctx, loan.id),
                    vehicle = ctx.clip(loan.vehicleName, 70), status = ctx.clip(loan.status, 24),
                    monthlyRate = nonnegative(ctx, loan.monthlyRate),
                    monthsLeft = nonnegative(ctx, loan.monthsLeft),
                    outstanding = ctx.round2(outstanding), arrears = nonnegative(ctx, loan.arrearsCount) }
            end, function(loan)
                return loan.status ~= "repossessed" and (ctx.num(loan.monthsLeft) or 0) > 0
            end)
        local leaseCount, badL, cutL = scanList(ctx, data.leases or {}, contracts,
            function(lease)
                local residual = nonnegative(ctx, lease.residual)
                if residual == nil then return nil end
                return { farmId = farmId, kind = "lease", id = nonnegative(ctx, lease.id),
                    vehicle = ctx.clip(lease.vehicleName, 70), status = ctx.clip(lease.status, 24),
                    monthlyRate = nonnegative(ctx, lease.monthlyRate),
                    monthsLeft = nonnegative(ctx, lease.monthsLeft),
                    residual = ctx.round2(residual), arrears = nonnegative(ctx, lease.arrearsCount) }
            end, function(lease)
                return lease.status == "active" or lease.status == "purchaseOption"
            end)
        local transactionCount, badT, cutT = scanList(ctx, data.transactions or {}, transactions,
            function(item)
                local amount = ctx.num(item.amount)
                if amount == nil then return nil end
                return { farmId = farmId, type = ctx.clip(item.transactionType, 60),
                    source = ctx.clip(item.source, 60), target = ctx.clip(item.target, 60),
                    amount = ctx.round2(amount), day = nonnegative(ctx, item.day) }
            end)
        local invalid = badA or badD or badF or badL or badT
        local truncated = cutA or cutD or cutF or cutL or cutT
        local hasData = accountCount + depositCount + financeCount + leaseCount + transactionCount > 0
        return {
            readState = invalid and "partial" or (hasData and "ok" or "settings-only"),
            reason = not hasData and "no-mod-owned-bank-records" or nil,
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            byFarm = { [tostring(farmId)] = {
                subaccountCount = accountCount, depositCount = depositCount,
                financeCount = financeCount, leaseCount = leaseCount,
                transactionCount = transactionCount,
            } },
            accounts = accounts, deposits = deposits, contracts = contracts,
            transactions = transactions,
        }
    end,
})
