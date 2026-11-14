-- Realistic Farm Finance v1.2.0.0 has several finance products. This page
-- reads active term, mortgage and bullet loans plus distinct asset-finance
-- agreements and current tenancies for one farm. It does not equate contract asset names with current
-- vehicle ownership or a scheduled payment with a payment already made.
-- Revolving/overdraft facilities have different balance semantics and are withheld.

local MAX_SCAN = 300
local MAX_ROWS = 40
local SUPPORTED = { TERM = true, MORTGAGE = true, BULLET = true }
local ASSET_PRODUCTS = { HIRE_PURCHASE = true, OPERATING_LEASE = true }
local ASSET_STATES = { ACTIVE = true, RETURN_DUE = true }
local TENANCY_STATES = { ACTIVE = true, NOTICE_SERVED = true, RENEWAL_OFFERED = true, EXPIRING = true }

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

        local assetRows, assetCount, assetArrearsCount, assetLeaseCount = {}, 0, 0, 0
        local assetAvailable = type(repo.assetFinance) == "table"
        local assetInvalid, assetTruncated, assetOmitted = false, false, 0
        if assetAvailable then
            local assetScanned = 0
            for _, agreement in pairs(repo.assetFinance) do
                assetScanned = assetScanned + 1
                if assetScanned > MAX_SCAN then assetTruncated = true; break end
                if type(agreement) == "table" and ctx.num(agreement.farmId) == farmId
                    and ASSET_STATES[agreement.status] then
                    if not ASSET_PRODUCTS[agreement.product] then
                        assetOmitted = assetOmitted + 1
                    else
                        local id = ctx.num(agreement.id)
                        local principal = ctx.num(agreement.principal)
                        local payment = ctx.num(agreement.monthlyPayment)
                        local arrears = ctx.num(agreement.arrearsBalance)
                        local remaining = ctx.num(agreement.remainingMonths)
                        local deposit = agreement.product == "OPERATING_LEASE"
                            and ctx.num(agreement.refundableDeposit) or nil
                        if id == nil or id <= 0 or principal == nil or principal < 0
                            or payment == nil or payment < 0 or arrears == nil or arrears < 0
                            or remaining == nil or remaining < 0
                            or (agreement.product == "OPERATING_LEASE" and (deposit == nil or deposit < 0)) then
                            assetInvalid = true
                        else
                            assetCount = assetCount + 1
                            if arrears > 0 then assetArrearsCount = assetArrearsCount + 1 end
                            if agreement.product == "OPERATING_LEASE" then assetLeaseCount = assetLeaseCount + 1 end
                            if #assetRows >= MAX_ROWS then
                                assetTruncated = true
                            else
                                assetRows[#assetRows + 1] = {
                                    farmId = farmId,
                                    id = math.floor(id),
                                    product = agreement.product,
                                    status = agreement.status,
                                    asset = ctx.clip(agreement.vehicleName, 80),
                                    principal = ctx.round2(principal),
                                    monthlyPayment = ctx.round2(payment),
                                    arrears = ctx.round2(arrears),
                                    remainingMonths = math.floor(remaining),
                                    refundableDeposit = deposit and ctx.round2(deposit) or nil,
                                }
                            end
                        end
                    end
                end
            end
            table.sort(assetRows, function(a, b) return a.id < b.id end)
        end

        local tenancyRows, tenancyCount, tenancyArrearsCount = {}, 0, 0
        local tenancyAvailable = type(repo.tenancies) == "table"
        local tenancyInvalid, tenancyTruncated = false, false
        if tenancyAvailable then
            local tenancyScanned = 0
            for _, tenancy in pairs(repo.tenancies) do
                tenancyScanned = tenancyScanned + 1
                if tenancyScanned > MAX_SCAN then tenancyTruncated = true; break end
                local status = type(tenancy) == "table" and (tenancy.status or "ACTIVE") or nil
                if type(tenancy) == "table" and ctx.num(tenancy.farmId) == farmId
                    and TENANCY_STATES[status] then
                    local id = ctx.num(tenancy.id)
                    local monthly = ctx.num(tenancy.monthlyRent)
                    local due = ctx.num(tenancy.rentDue)
                    local arrears = ctx.num(tenancy.arrears)
                    local nextPeriod = ctx.num(tenancy.nextRentDuePeriod)
                    if id == nil or id <= 0 or monthly == nil or monthly < 0
                        or due == nil or due < 0 or arrears == nil or arrears < 0
                        or nextPeriod == nil or nextPeriod < 0 then
                        tenancyInvalid = true
                    else
                        tenancyCount = tenancyCount + 1
                        if arrears > 0 then tenancyArrearsCount = tenancyArrearsCount + 1 end
                        if #tenancyRows >= MAX_ROWS then
                            tenancyTruncated = true
                        else
                            tenancyRows[#tenancyRows + 1] = {
                                farmId = farmId,
                                id = math.floor(id),
                                holding = ctx.clip(tenancy.holdingName, 80),
                                status = status,
                                monthlyRent = ctx.round2(monthly),
                                rentDue = ctx.round2(due),
                                arrears = ctx.round2(arrears),
                                nextRentDuePeriod = math.floor(nextPeriod),
                            }
                        end
                    end
                end
            end
            table.sort(tenancyRows, function(a, b) return a.id < b.id end)
        end
        local partial = invalid or assetInvalid or tenancyInvalid or not assetAvailable or not tenancyAvailable
        local anyRows = count > 0 or assetCount > 0 or tenancyCount > 0
        return {
            readState = partial and "partial" or (anyRows and "ok" or "settings-only"),
            reason = not anyRows and "no-supported-farm-obligations" or nil,
            coverage = (truncated or assetTruncated or tenancyTruncated) and "truncated" or partial and "partial" or "complete",
            byFarm = { [tostring(farmId)] = {
                loanCount = count,
                arrearsCount = arrearsCount,
                otherProductCount = omittedCount,
                assetFinanceCount = assetCount,
                assetArrearsCount = assetArrearsCount,
                operatingLeaseCount = assetLeaseCount,
                otherAssetProductCount = assetOmitted,
                assetRegisterAvailable = assetAvailable,
                tenancyCount = tenancyCount,
                tenancyArrearsCount = tenancyArrearsCount,
                tenancyRegisterAvailable = tenancyAvailable,
            } },
            rows = rows,
            assetRows = assetRows,
            tenancyRows = tenancyRows,
        }
    end,
})
