-- Bale Capacity Multiplier 1.1.1.0: current owned baler configuration.
-- An index is a selected capacity setting, not a count of completed bales.

local MAX_ROWS = 60
local MULTIPLIERS = { 1, 2, 5, 10, 25, 50, 100, 0.5 }

CompanionPages.register({
    key = "baleCapacityMultiplier",
    modNames = { "FS25_BaleCapacityMultiplier", "KM_78197_Bale_Capacity_Multiplier" },
    substrings = { "balecapacitymultiplier", "bale_capacity_multiplier" },
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

        local rows, count, modified = {}, 0, 0
        local truncated = ctx.ownedScanTruncated == true
        for _, vehicle in ipairs(vehicles) do
            local spec = type(vehicle) == "table" and vehicle.spec_bcmBaler or nil
            local baler = type(vehicle) == "table" and vehicle.spec_baler or nil
            local fillUnitIndex = type(baler) == "table" and ctx.num(baler.fillUnitIndex) or nil
            local index = type(spec) == "table" and ctx.num(spec.multiplierIndex) or nil
            local base = fillUnitIndex and type(spec.baseCaps) == "table"
                and ctx.num(spec.baseCaps[fillUnitIndex]) or nil
            if index and index == math.floor(index) and MULTIPLIERS[index]
                and base and base > 0 and fillUnitIndex and fillUnitIndex > 0 then
                count = count + 1
                if index ~= 1 then modified = modified + 1 end
                if #rows < MAX_ROWS then
                    local row = {
                        farmId = farmId,
                        vehicleId = ctx.clip(vehicle.uniqueId or vehicle.id, 64),
                        vehicle = ctx.clip(ctx.call(vehicle, "getFullName") or ctx.call(vehicle, "getName"), 70),
                        multiplierIndex = index,
                        multiplier = MULTIPLIERS[index],
                        baseCapacityLitres = base,
                        selectedCapacityLitres = base * MULTIPLIERS[index],
                    }
                    local actual = ctx.num(ctx.call(vehicle, "getFillUnitCapacity", fillUnitIndex))
                    if actual and actual > 0 then row.currentFillUnitCapacityLitres = actual end
                    rows[#rows + 1] = row
                else
                    truncated = true
                end
            end
        end
        table.sort(rows, function(a, b) return tostring(a.vehicle or "") < tostring(b.vehicle or "") end)
        return {
            readState = count > 0 and "ok" or "settings-only",
            reason = count == 0 and "no-applicable-owned-baler" or nil,
            coverage = truncated and "truncated" or "complete",
            byFarm = { [tostring(farmId)] = { balerCount = count, modifiedCount = modified } },
            rows = rows,
        }
    end,
})
