-- Variable Tire Pressure 1.0.0.13: live mode and pressure of equipped owned vehicles.
-- Pressure is a current reading, not tyre wear, work performed or a saved history.

local MAX_ROWS = 60

CompanionPages.register({
    key = "variableTirePressure",
    modNames = { "FS25_VariableTirePressure", "FS25_347991_FS25_VariableTirePressure" },
    substrings = { "variabletirepressure", "variable_tire_pressure" },
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

        local rows, count, field = {}, 0, 0
        local truncated = ctx.ownedScanTruncated == true
        for _, vehicle in ipairs(vehicles) do
            local spec = type(vehicle) == "table" and vehicle.spec_variableTirePressure or nil
            if type(spec) == "table" and spec.hasVTPXml == true and spec.isConfigEnabled == true then
                local mode = ctx.num(ctx.call(vehicle, "vtpGetDashboardMode"))
                local current = ctx.num(ctx.call(vehicle, "vtpGetDashboardPressureBar"))
                local target = ctx.num(ctx.call(vehicle, "vtpGetDashboardPressureTarget"))
                if mode and mode == math.floor(mode) and mode >= 0 and mode <= 3
                    and current and current > 0 and current <= 10
                    and target and target > 0 and target <= 10 then
                    count = count + 1
                    if mode == 1 or mode == 2 or mode == 3 then field = field + 1 end
                    if #rows < MAX_ROWS then
                        rows[#rows + 1] = {
                            farmId = farmId,
                            vehicleId = ctx.clip(vehicle.uniqueId or vehicle.id, 64),
                            vehicle = ctx.clip(ctx.call(vehicle, "getFullName") or ctx.call(vehicle, "getName"), 70),
                            mode = mode,
                            currentBar = ctx.round2(current),
                            targetBar = ctx.round2(target),
                        }
                    else
                        truncated = true
                    end
                end
            end
        end
        table.sort(rows, function(a, b) return tostring(a.vehicle or "") < tostring(b.vehicle or "") end)
        return {
            readState = count > 0 and "ok" or "settings-only",
            reason = count == 0 and "no-equipped-owned-vehicle" or nil,
            coverage = truncated and "truncated" or "complete",
            byFarm = { [tostring(farmId)] = { equippedCount = count, fieldOrMixedCount = field } },
            rows = rows,
        }
    end,
})
