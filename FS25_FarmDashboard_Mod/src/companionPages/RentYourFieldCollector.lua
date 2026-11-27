-- Rent Your Field v1.0.0.1: active farm agreements, not native owned land.
-- Renting transfers native land ownership to NO_OWNER (0). Monthly income and
-- termination penalty are current projections; neither proves payment.

local MAX_SCAN, MAX_ROWS = 300, 50

local function nonnegative(ctx, value)
    local n = ctx.num(value)
    if n == nil or n < 0 then return nil end
    return ctx.round2(n)
end

CompanionPages.register({
    key = "rentYourField",
    modNames = { "FS25_356641_Rent_Your_Field", "FS25_RentYourField" },
    substrings = { "rent_your_field", "rentyourfield" },
    collect = function(ctx)
        local farmId, mission = ctx.farmId, ctx.mission
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-state-only" }
        end
        if type(mission) ~= "table" or mission.isMissionStarted ~= true then
            return { readState = "settings-only", reason = "world-not-started" }
        end
        local manager = ctx.symbol("g_rentYourFieldManager")
            or ctx.global("g_rentYourFieldManager")
        local landManager = ctx.symbol("g_farmlandManager")
            or ctx.global("g_farmlandManager")
        if type(manager) ~= "table" or type(manager.rentAgreements) ~= "table"
            or type(landManager) ~= "table" then
            return { readState = "settings-only", reason = "rental-register-unavailable" }
        end

        local rows, count, projectedMonthly, scanned = {}, 0, 0, 0
        local invalid, truncated = false, false
        local minDuration = ctx.num(manager.minDuration)
        for key, agreement in pairs(manager.rentAgreements) do
            scanned = scanned + 1
            if scanned > MAX_SCAN then truncated = true; break end
            if type(agreement) == "table" and ctx.num(agreement.farmId) == farmId then
                local id, duration = ctx.num(agreement.farmlandId), ctx.num(agreement.duration)
                local farmland = id and ctx.call(landManager, "getFarmlandById", id) or nil
                local currentOwner = id and ctx.num(ctx.call(landManager, "getFarmlandOwner", id)) or nil
                if id == nil or id <= 0 or id % 1 ~= 0 or ctx.num(key) ~= id
                    or duration == nil or duration < 0 or duration % 1 ~= 0
                    or type(farmland) ~= "table" or currentOwner ~= 0
                    or minDuration == nil or minDuration < 0 then
                    invalid = true
                else
                    local monthly = nonnegative(ctx, ctx.call(manager, "getMonthlyIncome", id))
                    local penalty = nonnegative(ctx, ctx.call(manager, "getTerminationPenalty", id))
                    if monthly == nil or penalty == nil then invalid = true
                    else
                        count = count + 1
                        projectedMonthly = projectedMonthly + monthly
                        if #rows >= MAX_ROWS then truncated = true
                        else
                            rows[#rows + 1] = {
                                farmId = farmId,
                                farmlandId = id,
                                elapsedMonths = duration,
                                minimumMonths = math.floor(minDuration),
                                remainingMinimumMonths = math.max(0, math.floor(minDuration - duration)),
                                projectedMonthlyRent = monthly,
                                estimatedTerminationPenalty = penalty,
                            }
                        end
                    end
                end
            end
        end
        table.sort(rows, function(a, b) return a.farmlandId < b.farmlandId end)
        return {
            -- The mod has no explicit load-complete flag. An empty live table
            -- cannot establish that a saved zero has been read.
            readState = invalid and "partial" or (count > 0 and "ok" or "settings-only"),
            reason = count == 0 and "no-confirmed-farm-rentals" or nil,
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            byFarm = count > 0 and { [tostring(farmId)] = {
                activeCount = count,
                projectedMonthlyRent = ctx.round2(projectedMonthly),
            } } or nil,
            rows = rows,
        }
    end,
})
