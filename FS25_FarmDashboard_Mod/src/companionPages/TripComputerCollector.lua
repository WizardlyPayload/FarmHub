-- Trip Computer 1.0.0.0 records resettable distance, fuel and operating time
-- per motorized vehicle. It is not lifetime mileage or an expense ledger.

local MAX_ROWS = 120
local MAX_DISTANCE_M = 1000000000
local MAX_FUEL_L = 100000000
local MAX_TIME_MS = 1000000000000

local function finite(value, maximum)
    local n = tonumber(value)
    if n == nil or n ~= n or n == math.huge or n == -math.huge
        or n < 0 or n > maximum then return nil end
    return n
end

CompanionPages.register({
    key = "tripComputer",
    modNames = { "FS25_341715_Trip_Computer", "FS25_TripComputer", "FS25_Trip_Computer" },
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
        local supported, nonempty = 0, 0
        local invalid, truncated = false, ctx.ownedScanTruncated == true
        for _, vehicle in ipairs(vehicles) do
            if type(vehicle) == "table" then
                local owner = ctx.num(ctx.call(vehicle, "getOwnerFarmId") or vehicle.ownerFarmId)
                local spec = vehicle.spec_tripComputer
                if owner == farmId and type(spec) == "table" and spec.isUsed == true then
                    local id = ctx.call(vehicle, "getUniqueId") or vehicle.uniqueId
                    local distance = finite(spec.drivenDistance, MAX_DISTANCE_M)
                    local fuel = finite(spec.totalFuel, MAX_FUEL_L)
                    local fuelMoving = finite(spec.totalFuelKM, MAX_FUEL_L)
                    local time = finite(spec.operatingTime, MAX_TIME_MS)
                    if type(id) ~= "string" or id == "" or #id > 80 or seen[id]
                        or distance == nil or fuel == nil or fuelMoving == nil
                        or fuelMoving > fuel or time == nil then
                        invalid = true
                    else
                        seen[id] = true
                        supported = supported + 1
                        if distance > 0 or fuel > 0 or time > 0 then nonempty = nonempty + 1 end
                        if #rows < MAX_ROWS then
                            rows[#rows + 1] = {
                                farmId = farmId, vehicleId = id,
                                vehicle = ctx.clip(ctx.call(vehicle, "getFullName")
                                    or ctx.call(vehicle, "getName"), 80),
                                tripKilometres = distance / 1000,
                                tripFuelLitres = fuel,
                                tripOperatingHours = time / 3600000,
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
                supportedVehicleCount = supported, nonemptyTripCount = nonempty,
            } } or nil,
            rows = rows,
        }
    end,
})
