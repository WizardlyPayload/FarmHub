-- Advanced Seeding Control v1.0.0.0: current choices on owned sowing machines.
-- A tramline lane setting is not evidence of a completed sowing pass.

local MAX_ROWS = 60

local function finite(value, minimum, maximum)
    local n = tonumber(value)
    if n == nil or n ~= n or n == math.huge or n == -math.huge or n < minimum or n > maximum then
        return nil
    end
    return n
end

CompanionPages.register({
    key = "advancedSeedingControl",
    modNames = { "FS25_372286_Advanced_Seeding_Control", "FS25_Advanced_Seeding_Control" },
    substrings = { "advanced_seeding_control", "advancedseedingcontrol" },
    collect = function(ctx)
        local farmId = ctx.farmId
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-vehicles-only" }
        end
        local vehicles = ctx.ownedVehicles()
        if type(vehicles) ~= "table" then
            return { readState = "settings-only", reason = "no-owned-vehicle-list" }
        end
        local rows, count, activeCount = {}, 0, 0
        local truncated, partial = ctx.ownedScanTruncated == true, false
        for _, vehicle in ipairs(vehicles) do
            local spec = type(vehicle) == "table" and vehicle.spec_advancedSeedingControlVehicle or nil
            if type(spec) == "table" then
                local mode = finite(spec.mode, 0, 2)
                local followUpWidth = finite(spec.followUpWidth, 1, 120)
                local trackWidth = finite(spec.trackWidth, 0.5, 4)
                local lane = finite(spec.currentLane, 1, 100)
                local fertilizer = spec.fertilizerEnabled
                if mode == nil or mode ~= math.floor(mode) or followUpWidth == nil
                    or trackWidth == nil or lane == nil or lane ~= math.floor(lane)
                    or type(fertilizer) ~= "boolean" then
                    partial = true
                else
                    count = count + 1
                    if mode ~= 0 then activeCount = activeCount + 1 end
                    if #rows < MAX_ROWS then
                        rows[#rows + 1] = {
                            farmId = farmId,
                            vehicleId = ctx.clip(vehicle.uniqueId or vehicle.id, 64),
                            vehicle = ctx.clip(ctx.call(vehicle, "getFullName")
                                or ctx.call(vehicle, "getName") or "", 70),
                            mode = mode,
                            followUpWidth = followUpWidth,
                            trackWidth = trackWidth,
                            currentLane = lane,
                            fertilizerEnabled = fertilizer,
                        }
                    else truncated = true end
                end
            end
        end
        table.sort(rows, function(a, b) return (a.vehicle or "") < (b.vehicle or "") end)
        return {
            readState = partial and "partial" or count > 0 and "ok" or "settings-only",
            reason = count == 0 and "no-applicable-owned-seeder" or nil,
            coverage = truncated and "truncated" or partial and "partial" or "complete",
            byFarm = { [tostring(farmId)] = { seederCount = count, modeOnCount = activeCount } },
            rows = rows,
        }
    end,
})
