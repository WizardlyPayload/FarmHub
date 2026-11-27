-- Enhanced Mixer Wagons 1.0.1.0: current mixing timer on owned mixer wagons.
-- The third-party save schema calls the value seconds, but its percentage
-- calculation and update logic use milliseconds.

local MAX_ROWS = 60

CompanionPages.register({
    key = "enhancedMixerWagons",
    modNames = { "FS25_308285_Enhanced_Mixer_Wagons" },
    substrings = {},
    collect = function(ctx)
        if ctx.version ~= "1.0.1.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmId = ctx.num(ctx.farmId)
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

        local rows, count, mixing = {}, 0, 0
        local truncated = ctx.ownedScanTruncated == true
        for _, vehicle in ipairs(vehicles) do
            local owner = type(vehicle) == "table" and ctx.num(ctx.call(vehicle, "getOwnerFarmId") or vehicle.ownerFarmId) or nil
            local spec = type(vehicle) == "table" and vehicle.spec_mixerWagon or nil
            local required = type(spec) == "table" and ctx.num(spec.requiredMixingTime) or nil
            local elapsedMs = type(spec) == "table" and ctx.num(spec.currentMixingTime) or nil
            local fillUnitIndex = type(spec) == "table" and ctx.num(spec.fillUnitIndex) or nil
            if owner == farmId and required and required > 0 and required <= 86400
                and elapsedMs and elapsedMs >= 0 and elapsedMs <= required * 1000
                and fillUnitIndex and fillUnitIndex > 0 and fillUnitIndex == math.floor(fillUnitIndex) then
                count = count + 1
                if elapsedMs > 0 and elapsedMs < required * 1000 then mixing = mixing + 1 end
                if #rows < MAX_ROWS then
                    local row = {
                        farmId = farmId,
                        vehicleId = ctx.clip(vehicle.uniqueId or vehicle.id, 64),
                        vehicle = ctx.clip(ctx.call(vehicle, "getFullName") or ctx.call(vehicle, "getName"), 70),
                        requiredSeconds = required,
                        elapsedSeconds = elapsedMs / 1000,
                        progressPercent = math.min(100, elapsedMs / (required * 10)),
                    }
                    local fill = ctx.num(ctx.call(vehicle, "getFillUnitFillLevel", fillUnitIndex))
                    if fill and fill >= 0 then row.currentFillLitres = fill end
                    rows[#rows + 1] = row
                else
                    truncated = true
                end
            end
        end
        if count == 0 then
            return { readState = "settings-only", reason = "no-applicable-owned-mixer" }
        end
        table.sort(rows, function(a, b) return tostring(a.vehicle or "") < tostring(b.vehicle or "") end)
        return {
            readState = "ok", coverage = truncated and "truncated" or "complete",
            byFarm = { [tostring(farmId)] = { wagonCount = count, inProgressCount = mixing } },
            rows = rows,
        }
    end,
})
