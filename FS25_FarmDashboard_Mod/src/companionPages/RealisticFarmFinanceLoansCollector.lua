-- Realistic Farm Finance v1.2.0.0 has several finance products. This page
-- reads active term, mortgage and bullet loans plus distinct asset-finance
-- agreements and current tenancies for one farm. It does not equate contract asset names with current
-- vehicle ownership or a scheduled payment with a payment already made.
-- Revolving/overdraft facilities use a limit and current utilisation, not loan principal.

local MAX_SCAN = 300
local MAX_ROWS = 40
local SUPPORTED = { TERM = true, MORTGAGE = true, BULLET = true }
local ASSET_PRODUCTS = { HIRE_PURCHASE = true, OPERATING_LEASE = true }
local ASSET_STATES = { ACTIVE = true, RETURN_DUE = true }
local TENANCY_STATES = { ACTIVE = true, NOTICE_SERVED = true, RENEWAL_OFFERED = true, EXPIRING = true }
local APPLICATION_STATES = {
    SUBMITTED = true, INITIAL_REVIEW = true, VALUATION_INSTRUCTED = true,
    VALUATION_RETURNED = true, UNDERWRITING = true, FINAL_REVIEW = true,
    OFFERED = true,
}

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
        local facilityRows, facilityCount, facilityArrearsCount = {}, 0, 0
        local farmManager = ctx.global("g_farmManager")
        local farm = type(farmManager) == "table" and ctx.call(farmManager, "getFarmById", farmId) or nil
        local bankBalance = type(farm) == "table" and ctx.num(farm.money) or nil
        local scanned, invalid, truncated = 0, false, false
        for _, loan in pairs(repo.loans) do
            scanned = scanned + 1
            if scanned > MAX_SCAN then truncated = true; break end
            if type(loan) == "table" and ctx.num(loan.farmId) == farmId and loan.paidOff ~= true then
                if loan.type == "REVOLVING" or loan.type == "OVERDRAFT" then
                    local id = ctx.num(loan.id)
                    local limit = ctx.num(loan.creditLimit)
                    local arrears = ctx.num(loan.arrearsBalance)
                    local used
                    if loan.type == "REVOLVING" then
                        used = ctx.num(loan.drawnAmount)
                    elseif bankBalance ~= nil then
                        used = math.max(0, -bankBalance)
                    end
                    if id == nil or id <= 0 or limit == nil or limit < 0
                        or arrears == nil or arrears < 0 or used == nil or used < 0 then
                        invalid = true
                    else
                        facilityCount = facilityCount + 1
                        if arrears > 0 then facilityArrearsCount = facilityArrearsCount + 1 end
                        if #facilityRows >= MAX_ROWS then
                            truncated = true
                        else
                            local suspended = loan.type == "OVERDRAFT" and loan.overdraftSuspended == true
                            local effectiveLimit = suspended and 0 or limit
                            facilityRows[#facilityRows + 1] = {
                                farmId = farmId,
                                id = math.floor(id),
                                kind = loan.type,
                                creditLimit = ctx.round2(limit),
                                used = ctx.round2(used),
                                available = ctx.round2(math.max(0, effectiveLimit - used)),
                                overLimit = ctx.round2(math.max(0, used - effectiveLimit)),
                                arrears = ctx.round2(arrears),
                                interestRate = ctx.num(loan.interestRate),
                                remainingMonths = loan.type == "OVERDRAFT" and ctx.num(loan.remainingMonths) or nil,
                                suspended = suspended,
                            }
                        end
                    end
                elseif not SUPPORTED[loan.type] then
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
        table.sort(facilityRows, function(a, b) return a.id < b.id end)

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
        local applicationRows, applicationCount, applicationOfferCount = {}, 0, 0
        local applicationAvailable = type(repo.applications) == "table"
        local applicationInvalid, applicationTruncated = false, false
        local env = type(ctx.mission) == "table" and ctx.mission.environment or nil
        local day = type(env) == "table" and ctx.num(env.currentMonotonicDay) or nil
        local hour = type(env) == "table" and ctx.num(env.currentHour) or nil
        local nowHour = day ~= nil and hour ~= nil
            and math.floor(day) * 24 + math.max(0, math.min(23, math.floor(hour))) or nil
        if applicationAvailable then
            local applicationScanned = 0
            for _, application in pairs(repo.applications) do
                applicationScanned = applicationScanned + 1
                if applicationScanned > MAX_SCAN then applicationTruncated = true; break end
                if type(application) == "table" and ctx.num(application.farmId) == farmId
                    and APPLICATION_STATES[application.status] then
                    local id = ctx.num(application.id)
                    local requested = ctx.num(application.requestedAmount)
                    local offered = ctx.num(application.offeredAmount)
                    local expiry = ctx.num(application.offerExpiryHour)
                    if id == nil or id <= 0 or requested == nil or requested < 0
                        or (application.status == "OFFERED" and (offered == nil or offered < 0)) then
                        applicationInvalid = true
                    else
                        applicationCount = applicationCount + 1
                        if application.status == "OFFERED" then applicationOfferCount = applicationOfferCount + 1 end
                        if #applicationRows >= MAX_ROWS then applicationTruncated = true
                        else
                            applicationRows[#applicationRows + 1] = {
                                farmId = farmId, id = math.floor(id),
                                product = ctx.clip(application.product, 40),
                                status = application.status,
                                requestedAmount = ctx.round2(requested),
                                offeredAmount = application.status == "OFFERED" and ctx.round2(offered) or nil,
                                offerHoursLeft = application.status == "OFFERED"
                                    and expiry ~= nil and expiry > 0 and nowHour ~= nil
                                    and math.max(0, math.floor(expiry - nowHour)) or nil,
                            }
                        end
                    end
                end
            end
            table.sort(applicationRows, function(a, b) return a.id > b.id end)
        end
        local policyRows, policyCount, policyDueCount = {}, 0, 0
        local claimRows, claimCount = {}, 0
        local policyAvailable = type(repo.vehicleInsurancePolicies) == "table"
        local claimAvailable = type(repo.insuranceClaims) == "table"
        local insuranceInvalid, insuranceTruncated = false, false
        if policyAvailable then
            local policyScanned = 0
            for _, policy in pairs(repo.vehicleInsurancePolicies) do
                policyScanned = policyScanned + 1
                if policyScanned > MAX_SCAN then insuranceTruncated = true; break end
                if type(policy) == "table" and ctx.num(policy.farmId) == farmId then
                    local id = ctx.num(policy.id)
                    local due = ctx.num(policy.premiumDue)
                    local status = ctx.clip(policy.status, 40)
                    if id == nil or id <= 0 or due == nil or due < 0 or status == nil or status == "" then
                        insuranceInvalid = true
                    else
                        policyCount = policyCount + 1
                        if due > 0 then policyDueCount = policyDueCount + 1 end
                        if #policyRows >= MAX_ROWS then insuranceTruncated = true
                        else
                            policyRows[#policyRows + 1] = {
                                farmId = farmId, id = math.floor(id),
                                vehicle = ctx.clip(policy.vehicleName, 80),
                                cover = ctx.clip(policy.coverType, 40), status = status,
                                endPeriod = ctx.num(policy.endPeriod),
                                premiumDue = ctx.round2(due),
                                autoRenew = policy.autoRenew == true,
                            }
                        end
                    end
                end
            end
            table.sort(policyRows, function(a, b) return a.id < b.id end)
        end
        if claimAvailable then
            local claimScanned = 0
            for _, claim in pairs(repo.insuranceClaims) do
                claimScanned = claimScanned + 1
                if claimScanned > MAX_SCAN then insuranceTruncated = true; break end
                if type(claim) == "table" and ctx.num(claim.farmId) == farmId then
                    local id = ctx.num(claim.id)
                    local status = ctx.clip(claim.status, 40)
                    local claimed = ctx.num(claim.amountClaimed)
                    local approved = ctx.num(claim.approvedAmount)
                    local paid = ctx.num(claim.paidAmount)
                    if id == nil or id <= 0 or status == nil or status == ""
                        or claimed == nil or claimed < 0 or approved == nil or approved < 0
                        or paid == nil or paid < 0 then
                        insuranceInvalid = true
                    else
                        claimCount = claimCount + 1
                        if #claimRows >= MAX_ROWS then insuranceTruncated = true
                        else
                            claimRows[#claimRows + 1] = {
                                farmId = farmId, id = math.floor(id), status = status,
                                kind = ctx.clip(claim.claimType, 40),
                                subject = ctx.clip(claim.vehicleName or claim.animalName, 80),
                                amountClaimed = ctx.round2(claimed),
                                approvedAmount = ctx.round2(approved),
                                paidAmount = ctx.round2(paid),
                            }
                        end
                    end
                end
            end
            table.sort(claimRows, function(a, b) return a.id > b.id end)
        end
        local lossRows, openLossCount = {}, 0
        local lossAvailable = type(repo.insuranceLosses) == "table"
        local lossInvalid, lossTruncated = false, false
        local year = type(env) == "table" and ctx.num(env.currentYear) or nil
        local period = type(env) == "table" and ctx.num(env.currentPeriod) or nil
        local currentPeriod = year ~= nil and period ~= nil
            and math.floor(year) * 12 + math.floor(period) or nil
        if lossAvailable then
            local lossScanned = 0
            for _, loss in pairs(repo.insuranceLosses) do
                lossScanned = lossScanned + 1
                if lossScanned > MAX_SCAN then lossTruncated = true; break end
                if type(loss) == "table" and ctx.num(loss.farmId) == farmId
                    and (loss.status == "RECORDED" or loss.status == "CLAIMABLE") then
                    local id = ctx.num(loss.id)
                    local linkedClaim = ctx.num(loss.claimId)
                    local deadline = ctx.num(loss.deadlinePeriod)
                    local incident = ctx.num(loss.incidentPeriod)
                    if deadline == nil or deadline <= 0 then
                        deadline = incident ~= nil and incident > 0 and incident + 2 or nil
                    end
                    if id == nil or id <= 0 or deadline == nil or currentPeriod == nil
                        or linkedClaim == nil or linkedClaim < 0 or linkedClaim > 0 then
                        lossInvalid = true
                    elseif currentPeriod < deadline then
                        openLossCount = openLossCount + 1
                        if #lossRows >= MAX_ROWS then lossTruncated = true
                        else
                            lossRows[#lossRows + 1] = {
                                farmId = farmId, id = math.floor(id),
                                animal = ctx.clip(loss.animalName, 80),
                                animalType = ctx.clip(loss.animalType, 40),
                                reason = ctx.clip(loss.deathReason, 40),
                                periodsLeft = math.floor(deadline - currentPeriod),
                            }
                        end
                    end
                end
            end
            table.sort(lossRows, function(a, b)
                if a.periodsLeft == b.periodsLeft then return a.id > b.id end
                return a.periodsLeft < b.periodsLeft
            end)
        end
        local vetRows, eligibleVetCount = {}, 0
        local vetService = type(manager.insuranceClaims) == "table" and manager.insuranceClaims or nil
        local eligibleVet = type(vetService) == "table"
            and ctx.call(vetService, "getEligibleVeterinaryExpenses", farmId) or nil
        local vetAvailable = type(repo.insuranceVeterinaryExpenses) == "table"
            and type(eligibleVet) == "table"
        local vetInvalid, vetTruncated = false, false
        if vetAvailable then
            local vetScanned = 0
            for _, expense in pairs(eligibleVet) do
                vetScanned = vetScanned + 1
                if vetScanned > MAX_SCAN then vetTruncated = true; break end
                local id = type(expense) == "table" and ctx.num(expense.id) or nil
                local owner = type(expense) == "table" and ctx.num(expense.farmId) or nil
                local linkedClaim = type(expense) == "table" and ctx.num(expense.claimId) or nil
                local cost = type(expense) == "table" and ctx.num(expense.treatmentCost) or nil
                local deadline = type(expense) == "table" and ctx.num(expense.deadlinePeriod) or nil
                local incident = type(expense) == "table" and ctx.num(expense.incidentPeriod) or nil
                if deadline == nil or deadline <= 0 then
                    deadline = incident ~= nil and incident > 0 and incident + 3 or nil
                end
                if owner ~= farmId or id == nil or id <= 0 or linkedClaim == nil or linkedClaim ~= 0
                    or cost == nil or cost < 0 or deadline == nil or currentPeriod == nil
                    or currentPeriod >= deadline or expense.status ~= "RECORDED" then
                    vetInvalid = true
                else
                    eligibleVetCount = eligibleVetCount + 1
                    if #vetRows >= MAX_ROWS then vetTruncated = true
                    else
                        vetRows[#vetRows + 1] = {
                            farmId = farmId, id = math.floor(id),
                            animal = ctx.clip(expense.animalName, 80),
                            animalType = ctx.clip(expense.animalType, 40),
                            diseases = ctx.clip(expense.diseaseNames, 100),
                            treatmentCost = ctx.round2(cost),
                            periodsLeft = math.floor(deadline - currentPeriod),
                        }
                    end
                end
            end
            table.sort(vetRows, function(a, b)
                if a.periodsLeft == b.periodsLeft then return a.id > b.id end
                return a.periodsLeft < b.periodsLeft
            end)
        end
        local partial = invalid or assetInvalid or tenancyInvalid or applicationInvalid or insuranceInvalid
            or lossInvalid or vetInvalid
            or not assetAvailable or not tenancyAvailable or not applicationAvailable
            or not policyAvailable or not claimAvailable or not lossAvailable or not vetAvailable
        local anyRows = count > 0 or facilityCount > 0 or assetCount > 0 or tenancyCount > 0
            or applicationCount > 0
            or policyCount > 0 or claimCount > 0 or openLossCount > 0 or eligibleVetCount > 0
        return {
            readState = partial and "partial" or (anyRows and "ok" or "settings-only"),
            reason = not anyRows and "no-supported-farm-obligations" or nil,
            coverage = (truncated or assetTruncated or tenancyTruncated or applicationTruncated
                or insuranceTruncated or lossTruncated or vetTruncated)
                and "truncated" or partial and "partial" or "complete",
            byFarm = { [tostring(farmId)] = {
                loanCount = count,
                arrearsCount = arrearsCount,
                otherProductCount = omittedCount,
                facilityCount = facilityCount,
                facilityArrearsCount = facilityArrearsCount,
                assetFinanceCount = assetCount,
                assetArrearsCount = assetArrearsCount,
                operatingLeaseCount = assetLeaseCount,
                otherAssetProductCount = assetOmitted,
                assetRegisterAvailable = assetAvailable,
                tenancyCount = tenancyCount,
                tenancyArrearsCount = tenancyArrearsCount,
                tenancyRegisterAvailable = tenancyAvailable,
                applicationCount = applicationCount,
                applicationOfferCount = applicationOfferCount,
                applicationRegisterAvailable = applicationAvailable,
                insurancePolicyCount = policyCount,
                insurancePremiumDueCount = policyDueCount,
                insuranceClaimCount = claimCount,
                insurancePolicyRegisterAvailable = policyAvailable,
                insuranceClaimRegisterAvailable = claimAvailable,
                openAnimalLossCount = openLossCount,
                animalLossRegisterComplete = lossAvailable and not lossInvalid and not lossTruncated,
                eligibleVeterinaryExpenseCount = eligibleVetCount,
                veterinaryExpenseRegisterComplete = vetAvailable and not vetInvalid and not vetTruncated,
            } },
            rows = rows,
            facilityRows = facilityRows,
            assetRows = assetRows,
            tenancyRows = tenancyRows,
            applicationRows = applicationRows,
            insurancePolicyRows = policyRows,
            insuranceClaimRows = claimRows,
            openAnimalLossRows = lossRows,
            eligibleVeterinaryExpenseRows = vetRows,
        }
    end,
})
