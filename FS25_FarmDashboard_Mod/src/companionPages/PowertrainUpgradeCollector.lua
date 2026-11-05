-- Powertrain Upgrade 1.0.1.0: selected native configuration on owned motors.
-- These are chosen settings, not measured horsepower or driving performance.

local MAX_ROWS = 60
local FACTORS = { 1, 1.25, 1.5, 2, 2.5, 3, 6 }

CompanionPages.register({
    key = "powertrainUpgrade",
    modNames = { "FS25_PowertrainUpgrade", "FS25_372458_Powertrain_Upgrade" },
    substrings = { "powertrainupgrade", "powertrain_upgrade" },
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

        local rows, count, changed, unverified = {}, 0, 0, 0
        local nativeSelectionCount, runtimeBaseCount, rejectedChoiceCount = 0, 0, 0
        local truncated = ctx.ownedScanTruncated == true
        for _, vehicle in ipairs(vehicles) do
            local spec = type(vehicle) == "table" and vehicle.spec_ptuUpgrade or nil
            local config = type(vehicle) == "table" and vehicle.configurations or nil
            if type(spec) == "table" and type(spec.base) == "table" then runtimeBaseCount = runtimeBaseCount + 1 end
            local hasNativeChoice = type(config) == "table" and (config.ptuPower ~= nil or config.ptuSpeed ~= nil)
            if hasNativeChoice then nativeSelectionCount = nativeSelectionCount + 1 end
            -- The mod itself treats an absent configuration key as Stock (index 1).
            -- The native selection is useful even if the transient mod state cannot
            -- be observed; never turn that selection into a performance claim.
            local power = hasNativeChoice and ctx.num(config.ptuPower or 1) or nil
            local speed = hasNativeChoice and ctx.num(config.ptuSpeed or 1) or nil
            if hasNativeChoice and power and power == math.floor(power) and FACTORS[power]
                and speed and speed == math.floor(speed) and FACTORS[speed] then
                local modStateMatched = type(spec) == "table" and type(spec.base) == "table"
                    and ctx.num(spec.powerLevel) == power and ctx.num(spec.speedLevel) == speed
                count = count + 1
                if power > 1 or speed > 1 then changed = changed + 1 end
                if not modStateMatched then unverified = unverified + 1 end
                if #rows < MAX_ROWS then
                    rows[#rows + 1] = {
                        farmId = farmId,
                        vehicleId = ctx.clip(vehicle.uniqueId or vehicle.id, 64),
                        vehicle = ctx.clip(ctx.call(vehicle, "getFullName") or ctx.call(vehicle, "getName"), 70),
                        powerLevel = power,
                        powerFactor = FACTORS[power],
                        speedLevel = speed,
                        speedFactor = FACTORS[speed],
                        modStateMatched = modStateMatched,
                        speedWasCapped = modStateMatched and spec.speedWasCapped == true,
                    }
                else
                    truncated = true
                end
            elseif hasNativeChoice then rejectedChoiceCount = rejectedChoiceCount + 1 end
        end
        table.sort(rows, function(a, b) return tostring(a.vehicle or "") < tostring(b.vehicle or "") end)
        return {
            readState = count > 0 and (unverified > 0 and "partial" or "ok") or "settings-only",
            reason = count == 0 and "no-applicable-owned-motor" or nil,
            coverage = truncated and "truncated" or "complete",
            byFarm = { [tostring(farmId)] = { motorCount = count, upgradedCount = changed } },
            diagnostics = { ownedVehicleCount = #vehicles, nativeSelectionCount = nativeSelectionCount,
                runtimeBaseCount = runtimeBaseCount, rejectedChoiceCount = rejectedChoiceCount,
                unverifiedSelectionCount = unverified },
            rows = rows,
        }
    end,
})
