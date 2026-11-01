-- Finance Your Fleet v1.0.0.1 keeps active agreements on the live mission.
-- Join their stored vehicle unique IDs to this farm's current vehicles; never
-- scan its cross-save profile mirror or call agreement:getVehicle/getUniqueId.

local MAX_SCAN = 300
local MAX_ROWS = 50

CompanionPages.register({
    key = "financeYourFleet",
    modNames = { "KM_81456_Finance_Your_Fleet", "FS25_FinanceYourFleet" },
    substrings = { "finance_your_fleet", "financeyourfleet" },
    collect = function(ctx)
        local farmId = ctx.farmId
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        local manager = type(ctx.mission) == "table" and ctx.mission.financeManager or nil
        if type(manager) ~= "table" or manager.financeDataLoaded ~= true
            or manager.disabledForSession == true or type(manager.financeAgreements) ~= "table" then
            return { readState = "settings-only", reason = "finance-register-unavailable" }
        end
        local vehicles = ctx.ownedVehicles()
        if type(vehicles) ~= "table" then
            return { readState = "settings-only", reason = "no-owned-vehicle-list" }
        end
        local owned = {}
        for _, vehicle in ipairs(vehicles) do
            if type(vehicle) == "table" and type(vehicle.uniqueId) == "string"
                and vehicle.uniqueId ~= "" then
                owned[vehicle.uniqueId] = vehicle
            end
        end

        local rows, count, lateCount, recoveryCount, unlinkedCount = {}, 0, 0, 0, 0
        local scanned, invalid, truncated = 0, false, ctx.ownedScanTruncated == true
        for _, agreement in pairs(manager.financeAgreements) do
            scanned = scanned + 1
            if scanned > MAX_SCAN then truncated = true; break end
            if type(agreement) == "table" and ctx.num(agreement.farmId) == farmId then
                local linked = type(agreement.vehicle) == "string" and owned[agreement.vehicle] or nil
                if linked == nil then
                    unlinkedCount = unlinkedCount + 1
                    invalid = true
                else
                    local term, paid = ctx.num(agreement.termMonths), ctx.num(agreement.paymentsMade)
                    local base, deposit = ctx.num(agreement.baseCost), ctx.num(agreement.deposit)
                    local final = ctx.num(agreement.finalPayment)
                    if agreement.agreementType ~= 1 or term == nil or term <= 0
                        or paid == nil or paid < 0 or paid > term
                        or base == nil or base <= 0 or deposit == nil or deposit < 0
                        or final == nil or final < 0 then
                        invalid = true
                    else
                        count = count + 1
                        local late = ctx.num(agreement.latePaymentCount) or 0
                        if late > 0 then lateCount = lateCount + 1 end
                        if agreement.recoveryActive == true then recoveryCount = recoveryCount + 1 end
                        if #rows >= MAX_ROWS then
                            truncated = true
                        else
                            local scheduled = agreement.recoveryActive ~= true
                                and ctx.num(ctx.call(agreement, "getScheduledPaymentDue")) or nil
                            local payoff = ctx.num(ctx.call(agreement, "getPayoffAmount"))
                            rows[#rows + 1] = {
                                farmId = farmId,
                                id = ctx.clip(agreement.id, 64),
                                vehicleId = ctx.clip(agreement.vehicle, 64),
                                vehicle = ctx.clip(ctx.call(linked, "getFullName")
                                    or ctx.call(linked, "getName") or agreement.vehicle, 70),
                                termMonths = math.floor(term),
                                paymentsMade = math.floor(paid),
                                deposit = deposit,
                                finalPayment = final,
                                scheduledDue = scheduled,
                                payoffEstimate = payoff,
                                latePaymentCount = math.max(0, math.floor(late)),
                                recoveryActive = agreement.recoveryActive == true,
                            }
                        end
                    end
                end
            end
        end
        table.sort(rows, function(a, b) return tostring(a.vehicle or "") < tostring(b.vehicle or "") end)
        return {
            readState = invalid and "partial" or (count > 0 and "ok" or "settings-only"),
            reason = count == 0 and "no-farm-agreements" or nil,
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            byFarm = { [tostring(farmId)] = {
                agreementCount = count,
                lateCount = lateCount,
                recoveryCount = recoveryCount,
                unlinkedCount = unlinkedCount,
            } },
            rows = rows,
        }
    end,
})
