-- Realistic Brakes v1.2.0.0: current server vehicle brake condition.
-- Damage is the mod's permanent brake-force reduction fraction, not native vehicle damage.

local MAX_ROWS = 120

local function bounded(ctx, value, low, high)
    local n = ctx.num(value)
    if n == nil or n < low or n > high then return nil end
    return n
end

CompanionPages.register({
    key = "realisticBrakes",
    modNames = { "FS25_RealisticBrakes", "KM_79862_realistic-brakes" },
    collect = function(ctx)
        if ctx.version ~= "1.2.0.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmId = ctx.num(ctx.farmId)
        if farmId == nil or farmId < 1 or farmId ~= math.floor(farmId) then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-brake-state-only" }
        end
        local vehicles = ctx.ownedVehicles()
        if type(vehicles) ~= "table" then
            return { readState = "settings-only", reason = "no-owned-vehicle-list" }
        end

        local rows, seen = {}, {}
        local invalid, truncated = false, ctx.ownedScanTruncated == true
        local supported, damaged, parked = 0, 0, 0
        for _, vehicle in ipairs(vehicles) do
            if type(vehicle) == "table" then
                local owner = ctx.num(ctx.call(vehicle, "getOwnerFarmId") or vehicle.ownerFarmId)
                local spec = vehicle.spec_realisticBrakes
                if owner == farmId and spec ~= nil then
                    local id = vehicle.uniqueId
                    local damage = type(spec) == "table" and bounded(ctx, spec.brakeDamage, 0, 0.75) or nil
                    local temp = type(spec) == "table" and bounded(ctx, spec.brakeTempC, -50, 800) or nil
                    local park
                    if type(spec) == "table" then park = spec.parkBrakeOn end
                    if type(id) ~= "string" or id == "" or #id > 80
                        or damage == nil or temp == nil or type(park) ~= "boolean"
                        or seen[id] then
                        invalid = true
                    else
                        seen[id] = true
                        supported = supported + 1
                        if damage > 0 then damaged = damaged + 1 end
                        if park then parked = parked + 1 end
                        if #rows < MAX_ROWS then
                            rows[#rows + 1] = {
                                farmId = farmId,
                                vehicleId = id,
                                vehicle = ctx.clip(ctx.call(vehicle, "getFullName")
                                    or ctx.call(vehicle, "getName"), 80),
                                brakeDamageFraction = damage,
                                brakeTempC = temp,
                                parkBrakeOn = park,
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
            reason = invalid and "invalid-brake-state" or supported == 0 and not incomplete
                and "no-owned-supported-vehicle" or nil,
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            byFarm = not incomplete and { [tostring(farmId)] = {
                supportedVehicleCount = supported,
                damagedVehicleCount = damaged,
                parkedVehicleCount = parked,
            } } or nil,
            rows = rows,
        }
    end,
})
