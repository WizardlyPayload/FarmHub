-- Adjustable Fill Level Advanced 1.1.0.0: non-stock capacity choices on
-- owned vehicles. A selected multiplier is not proof of applied capacity.

local MULTIPLIERS = { 1, 1.5, 2, 3, 4, 6, 8, 10 }
local MAX_ROWS = 80

CompanionPages.register({
    key = "adjustableFillLevelAdvanced",
    modNames = { "FS25_adjustableFillLevelAdvanced", "FS25_367048_FS25_adjustableFillLevelAdvanced" },
    substrings = { "adjustablefillleveladvanced" },
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

        local rows, vehicleCount, observedCount = {}, 0, 0
        local incomplete = false
        local truncated = ctx.ownedScanTruncated == true
        for _, vehicle in ipairs(vehicles) do
            local configurations = type(vehicle) == "table" and vehicle.configurations or nil
            local index = type(configurations) == "table" and ctx.num(configurations.adjustableFillLevel) or nil
            if index and index == math.floor(index) and MULTIPLIERS[index] and index > 1 then
                vehicleCount = vehicleCount + 1
                local multiplier = MULTIPLIERS[index]
                local fillUnits = type(vehicle.spec_fillUnit) == "table" and vehicle.spec_fillUnit.fillUnits or nil
                local found = false
                if type(fillUnits) == "table" then
                    for unitIndex, unit in ipairs(fillUnits) do
                        local base = type(unit) == "table" and ctx.num(unit._afcOriginalCapacity) or nil
                        local current = type(unit) == "table" and ctx.num(unit.capacity) or nil
                        if base and base > 0 then
                            found = true
                            observedCount = observedCount + 1
                            local matches = current ~= nil and current > 0
                                and math.abs(current - base * multiplier) <= math.max(0.01, base * multiplier * 0.001)
                            if not matches then incomplete = true end
                            if #rows < MAX_ROWS then
                                rows[#rows + 1] = {
                                    farmId = farmId,
                                    vehicleId = ctx.clip(vehicle.uniqueId or vehicle.id, 64),
                                    vehicle = ctx.clip(ctx.call(vehicle, "getFullName") or ctx.call(vehicle, "getName"), 70),
                                    fillUnitIndex = unitIndex,
                                    multiplierIndex = index,
                                    selectedMultiplier = multiplier,
                                    originalCapacityLitres = base,
                                    selectedCapacityLitres = base * multiplier,
                                    currentCapacityLitres = current and current > 0 and current or nil,
                                    capacityMatchesSelection = matches,
                                }
                            else
                                truncated = true
                            end
                        end
                    end
                end
                if not found then
                    incomplete = true
                    if #rows < MAX_ROWS then
                        rows[#rows + 1] = {
                            farmId = farmId,
                            vehicleId = ctx.clip(vehicle.uniqueId or vehicle.id, 64),
                            vehicle = ctx.clip(ctx.call(vehicle, "getFullName") or ctx.call(vehicle, "getName"), 70),
                            multiplierIndex = index,
                            selectedMultiplier = multiplier,
                        }
                    else
                        truncated = true
                    end
                end
            end
        end
        table.sort(rows, function(a, b)
            local an, bn = tostring(a.vehicle or a.vehicleId or ""), tostring(b.vehicle or b.vehicleId or "")
            if an == bn then return (a.fillUnitIndex or 0) < (b.fillUnitIndex or 0) end
            return an < bn
        end)
        return {
            readState = truncated and "partial" or (vehicleCount == 0 and "settings-only" or (incomplete and "partial" or "ok")),
            reason = not truncated and vehicleCount == 0 and "no-nonstock-owned-selection" or nil,
            coverage = truncated and "truncated" or "complete",
            byFarm = not truncated and { [tostring(farmId)] = {
                selectedVehicleCount = vehicleCount, observedFillUnitCount = observedCount,
            } } or nil,
            rows = rows,
        }
    end,
})
