-- Capacity Upgrade 1.0.0.0: applied effects on farm-owned fill units.
-- A selected level is not proof of extra storage or reduced consumption.

local FACTORS = { 1, 1.25, 1.5, 2, 2.5, 3, 6 }
local MAX_ROWS = 100

CompanionPages.register({
    key = "capacityUpgrade",
    modNames = { "FS25_CapacityUpgrade", "FS25_373637_Capacity_Upgrade", "KM_83362_Capacity_Upgrade" },
    substrings = { "capacityupgrade", "capacity_upgrade" },
    collect = function(ctx)
        local farmId = ctx.farmId
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-vehicle-state-only" }
        end
        local vehicles = ctx.ownedVehicles()
        if type(vehicles) ~= "table" then
            return { readState = "settings-only", reason = "no-owned-vehicle-list" }
        end

        local rows, vehicleCount, capacityCount, slowedCount = {}, 0, 0, 0
        local truncated = ctx.ownedScanTruncated == true
        for _, vehicle in ipairs(vehicles) do
            local spec = type(vehicle) == "table" and vehicle.spec_cuUpgrade or nil
            local config = type(vehicle) == "table" and vehicle.configurations or nil
            local level = type(config) == "table" and ctx.num(config.capacityUpgrade) or nil
            if type(spec) == "table" and level and level == math.floor(level)
                and level > 1 and FACTORS[level] and ctx.num(spec.level) == level then
                local seen = false
                local name = ctx.clip(ctx.call(vehicle, "getFullName") or ctx.call(vehicle, "getName"), 70)
                local id = ctx.clip(vehicle.uniqueId or vehicle.id, 64)
                if type(spec.stockCapacity) == "table" then
                    for index, rawStock in pairs(spec.stockCapacity) do
                        local unit = ctx.num(index)
                        local stock = ctx.num(rawStock)
                        local current = unit and ctx.num(ctx.call(vehicle, "getFillUnitCapacity", unit)) or nil
                        if unit and unit > 0 and unit == math.floor(unit)
                            and stock and stock > 0 and current and current > stock then
                            seen = true
                            capacityCount = capacityCount + 1
                            if #rows < MAX_ROWS then
                                rows[#rows + 1] = {
                                    farmId = farmId, vehicleId = id, vehicle = name,
                                    fillUnitIndex = unit, level = level, factor = FACTORS[level],
                                    effect = "capacity", stockCapacity = stock, currentCapacity = current,
                                }
                            else
                                truncated = true
                            end
                        end
                    end
                end
                if type(spec.slowed) == "table" then
                    for index, rawFactor in pairs(spec.slowed) do
                        local unit = ctx.num(index)
                        local applied = ctx.num(rawFactor)
                        if unit and unit > 0 and unit == math.floor(unit)
                            and applied and math.abs(applied - FACTORS[level]) < 0.0001
                            and (type(spec.stockCapacity) ~= "table" or spec.stockCapacity[index] == nil) then
                            seen = true
                            slowedCount = slowedCount + 1
                            if #rows < MAX_ROWS then
                                rows[#rows + 1] = {
                                    farmId = farmId, vehicleId = id, vehicle = name,
                                    fillUnitIndex = unit, level = level, factor = applied,
                                    effect = "usage-slowed",
                                }
                            else
                                truncated = true
                            end
                        end
                    end
                end
                if seen then vehicleCount = vehicleCount + 1 end
            end
        end
        table.sort(rows, function(a, b)
            if tostring(a.vehicle or "") ~= tostring(b.vehicle or "") then
                return tostring(a.vehicle or "") < tostring(b.vehicle or "")
            end
            return a.fillUnitIndex < b.fillUnitIndex
        end)
        local count = capacityCount + slowedCount
        return {
            readState = count > 0 and "ok" or "settings-only",
            reason = count == 0 and "no-applied-owned-upgrade" or nil,
            coverage = truncated and "truncated" or "complete",
            byFarm = { [tostring(farmId)] = {
                vehicleCount = vehicleCount, capacityUnitCount = capacityCount,
                slowedUnitCount = slowedCount,
            } },
            rows = rows,
        }
    end,
})
