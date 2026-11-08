-- HUD+ v1.0.0.0: vehicle-attached odometer and resettable trip counters.
-- These mod-calculated values may predate the current owner's acquisition.

local MAX_ROWS = 120

local function counter(ctx, value, limit)
    local n = ctx.num(value)
    if n == nil or n < 0 or n > limit then return nil end
    return n
end

CompanionPages.register({
    key = "hudPlus",
    modNames = { "KM_81497_HUD_" },
    collect = function(ctx)
        if ctx.version ~= "1.0.0.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmId = ctx.num(ctx.farmId)
        if farmId == nil or farmId < 1 or farmId ~= math.floor(farmId) then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-trip-state-only" }
        end
        local vehicles = ctx.ownedVehicles()
        if type(vehicles) ~= "table" then
            return { readState = "settings-only", reason = "no-owned-vehicle-list" }
        end

        local rows, seen = {}, {}
        local invalid, truncated = false, ctx.ownedScanTruncated == true
        local supported, trips = 0, 0
        local specKey = "spec_" .. ctx.modName .. ".hudPlus"
        for _, vehicle in ipairs(vehicles) do
            if type(vehicle) == "table" then
                local owner = ctx.num(ctx.call(vehicle, "getOwnerFarmId") or vehicle.ownerFarmId)
                local spec = vehicle[specKey]
                if owner == farmId and spec ~= nil then
                    local id = vehicle.uniqueId
                    local total = type(spec) == "table" and counter(ctx, spec.totalDistanceMeters, 1000000000) or nil
                    local trip = type(spec) == "table" and counter(ctx, spec.sessionDistanceMeters, 1000000000) or nil
                    local fuel = type(spec) == "table" and counter(ctx, spec.sessionFuelUsedLiters, 10000000) or nil
                    if type(id) ~= "string" or id == "" or #id > 80
                        or total == nil or trip == nil or fuel == nil or trip > total
                        or seen[id] then
                        invalid = true
                    else
                        seen[id] = true
                        supported = supported + 1
                        if trip > 0 or fuel > 0 then trips = trips + 1 end
                        if #rows < MAX_ROWS then
                            rows[#rows + 1] = {
                                farmId = farmId,
                                vehicleId = id,
                                vehicle = ctx.clip(ctx.call(vehicle, "getFullName")
                                    or ctx.call(vehicle, "getName"), 80),
                                totalDistanceMeters = total,
                                tripDistanceMeters = trip,
                                tripFuelUsedLiters = fuel,
                            }
                        else truncated = true end
                    end
                end
            end
        end
        table.sort(rows, function(a, b) return a.vehicleId < b.vehicleId end)
        local incomplete = invalid or truncated
        return {
            readState = incomplete and "partial" or supported > 0 and "ok" or "settings-only",
            reason = invalid and "invalid-trip-state" or supported == 0 and not incomplete
                and "no-owned-supported-vehicle" or nil,
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            byFarm = not incomplete and { [tostring(farmId)] = {
                supportedVehicleCount = supported, nonzeroTripCount = trips,
            } } or nil,
            rows = rows,
        }
    end,
})
