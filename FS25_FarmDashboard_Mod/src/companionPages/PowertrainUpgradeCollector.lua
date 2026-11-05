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

        local rows, count, changed = {}, 0, 0
        local truncated = ctx.ownedScanTruncated == true
        for _, vehicle in ipairs(vehicles) do
            local spec = type(vehicle) == "table" and vehicle.spec_ptuUpgrade or nil
            local config = type(vehicle) == "table" and vehicle.configurations or nil
            local power = type(config) == "table" and ctx.num(config.ptuPower) or nil
            local speed = type(config) == "table" and ctx.num(config.ptuSpeed) or nil
            if type(spec) == "table" and type(spec.base) == "table"
                and power and power == math.floor(power) and FACTORS[power]
                and speed and speed == math.floor(speed) and FACTORS[speed]
                and ctx.num(spec.powerLevel) == power and ctx.num(spec.speedLevel) == speed then
                count = count + 1
                if power > 1 or speed > 1 then changed = changed + 1 end
                if #rows < MAX_ROWS then
                    rows[#rows + 1] = {
                        farmId = farmId,
                        vehicleId = ctx.clip(vehicle.uniqueId or vehicle.id, 64),
                        vehicle = ctx.clip(ctx.call(vehicle, "getFullName") or ctx.call(vehicle, "getName"), 70),
                        powerLevel = power,
                        powerFactor = FACTORS[power],
                        speedLevel = speed,
                        speedFactor = FACTORS[speed],
                        speedWasCapped = spec.speedWasCapped == true,
                    }
                else
                    truncated = true
                end
            end
        end
        table.sort(rows, function(a, b) return tostring(a.vehicle or "") < tostring(b.vehicle or "") end)
        return {
            readState = count > 0 and "ok" or "settings-only",
            reason = count == 0 and "no-applicable-owned-motor" or nil,
            coverage = truncated and "truncated" or "complete",
            byFarm = { [tostring(farmId)] = { motorCount = count, upgradedCount = changed } },
            rows = rows,
        }
    end,
})
