-- AgriCredit Solutions v1.0.0.0: building agreements, separate from native loans.
-- Read the loaded server register only. Link to a currently owned placeable by
-- permanent unique ID; never call getUniqueId on an agreement (it mutates it).

local MAX_AGREEMENT_SCAN, MAX_ROWS, MAX_PLACEABLE_SCAN = 300, 50, 3000

local function nonnegative(ctx, value)
    local n = ctx.num(value)
    if n == nil or n < 0 then return nil end
    return ctx.round2(n)
end

CompanionPages.register({
    key = "agriCreditSolutions",
    modNames = { "KM_81927_AgriCredit_Solutions", "FS25_AgriCredit_Solutions" },
    substrings = { "agricredit_solutions", "agricreditsolutions" },
    collect = function(ctx)
        local farmId, mission = ctx.farmId, ctx.mission
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-state-only" }
        end
        if ctx.version ~= "1.0.0.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local manager = type(mission) == "table" and mission.agriCreditManager or nil
        if type(manager) ~= "table" or manager.financeDataLoaded ~= true
            or type(manager.financeAgreements) ~= "table" then
            return { readState = "settings-only", reason = "agreement-register-unavailable" }
        end
        local placeables = type(mission.placeableSystem) == "table"
            and mission.placeableSystem.placeables or nil
        if type(placeables) ~= "table" then
            return { readState = "settings-only", reason = "placeable-register-unavailable" }
        end

        local owned, placeableScanned, truncated = {}, 0, false
        for _, placeable in pairs(placeables) do
            placeableScanned = placeableScanned + 1
            if placeableScanned > MAX_PLACEABLE_SCAN then truncated = true; break end
            if type(placeable) == "table" then
                local owner = ctx.num(ctx.call(placeable, "getOwnerFarmId"))
                    or ctx.num(placeable.ownerFarmId)
                if owner == farmId then
                    local uniqueId = ctx.call(placeable, "getUniqueId") or placeable.uniqueId
                    if type(uniqueId) == "string" and uniqueId ~= "" then
                        owned[uniqueId] = placeable
                    end
                end
            end
        end

        local rows, linkedCount, unlinkedCount, scanned = {}, 0, 0, 0
        local invalid = false
        for _, agreement in pairs(manager.financeAgreements) do
            scanned = scanned + 1
            if scanned > MAX_AGREEMENT_SCAN then truncated = true; break end
            if type(agreement) == "table" and ctx.num(agreement.farmId) == farmId then
                local uniqueId = agreement.placeableUniqueId
                local placeable = type(uniqueId) == "string" and owned[uniqueId] or nil
                if placeable == nil then
                    unlinkedCount = unlinkedCount + 1
                    invalid = true
                else
                    local term, paid = ctx.num(agreement.termMonths), ctx.num(agreement.paymentsMade)
                    local base, deposit = nonnegative(ctx, agreement.baseCost), nonnegative(ctx, agreement.deposit)
                    local final = nonnegative(ctx, agreement.finalPayment)
                    local late = ctx.num(agreement.latePaymentCount)
                    if ctx.num(agreement.agreementType) ~= 1 or term == nil or term <= 0
                        or paid == nil or paid < 0 or paid > term or paid % 1 ~= 0
                        or base == nil or base <= 0 or deposit == nil or deposit > base
                        or final == nil or late == nil or late < 0 or late > 6 then
                        invalid = true
                    else
                        local due = nonnegative(ctx, ctx.call(agreement, "getScheduledPaymentDue"))
                        local payoff = nonnegative(ctx, ctx.call(agreement, "getPayoffAmount"))
                        if due == nil or payoff == nil then invalid = true
                        else
                            local scheduled = due
                            if agreement.collectionsActive == true then scheduled = nil end
                            linkedCount = linkedCount + 1
                            if #rows >= MAX_ROWS then truncated = true
                            else
                            rows[#rows + 1] = {
                                farmId = farmId,
                                id = ctx.clip(agreement.id, 64),
                                placeableId = ctx.clip(uniqueId, 80),
                                building = ctx.clip(ctx.call(placeable, "getName")
                                    or agreement.buildingName or uniqueId, 80),
                                termMonths = math.floor(term),
                                paymentsMade = math.floor(paid),
                                deposit = deposit,
                                finalPayment = final,
                                scheduledDue = scheduled,
                                payoffAmount = payoff,
                                latePaymentCount = math.floor(late),
                                collectionsActive = agreement.collectionsActive == true,
                            }
                            end
                        end
                    end
                end
            end
        end
        table.sort(rows, function(a, b)
            return tostring(a.building or "") < tostring(b.building or "")
        end)
        return {
            readState = (invalid or truncated) and "partial" or (linkedCount > 0 and "ok" or "settings-only"),
            reason = linkedCount == 0 and not (invalid or truncated) and "no-linked-farm-agreements" or nil,
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            byFarm = not truncated and { [tostring(farmId)] = {
                linkedCount = linkedCount,
                unlinkedCount = unlinkedCount,
            } } or nil,
            rows = rows,
        }
    end,
})
