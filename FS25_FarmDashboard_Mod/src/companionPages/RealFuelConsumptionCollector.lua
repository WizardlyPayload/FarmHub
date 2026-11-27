-- Read-only Real Fuel Consumption v1.4.0.0 usage counters.
-- Read the saved/current per-vehicle spec; never call RFCReport.getStats(..., true).

local MAX_ROWS = 60

local function nonnegative(ctx, value)
    local n = ctx.num(value)
    if n ~= nil and n >= 0 then return n end
    return nil
end

CompanionPages.register({
    key = "realFuelConsumption",
    modNames = { "FS25_RealFuelConsumption", "FS25_realFuelConsumption", "KM_79107_real-fuel-consumption" },
    substrings = { "realfuelconsumption", "real-fuel-consumption" },
    collect = function(ctx)
        local farmId = ctx.farmId
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        local vehicles = ctx.ownedVehicles()
        if type(vehicles) ~= "table" then
            return { readState = "settings-only", reason = "no-owned-vehicle-list" }
        end

        local rows, captured = {}, 0
        local totalLiters, totalSeconds = 0, 0
        local truncated = ctx.ownedScanTruncated == true
        for index, vehicle in ipairs(vehicles) do
            if type(vehicle) == "table" then
                local owner = ctx.num(vehicle.ownerFarmId) or ctx.num(ctx.call(vehicle, "getOwnerFarmId"))
                local spec = vehicle.spec_rfcEngineModes
                local stats = type(spec) == "table" and spec.rfcStats or nil
                local seconds = type(stats) == "table" and nonnegative(ctx, stats.totalSeconds) or nil
                local liters = type(stats) == "table" and nonnegative(ctx, stats.totalLiters) or nil
                -- The mod itself includes a vehicle in its farm report only after
                -- positive accumulated engine time. Missing or invalid values are
                -- not silently turned into zero usage.
                if owner == farmId and seconds ~= nil and seconds > 0 and liters ~= nil then
                    captured = captured + 1
                    totalLiters = totalLiters + liters
                    totalSeconds = totalSeconds + seconds
                    if #rows < MAX_ROWS then
                        local modes = type(stats.secondsByMode) == "table" and stats.secondsByMode or {}
                        rows[#rows + 1] = {
                            farmId = farmId,
                            vehicleId = ctx.clip(tostring(ctx.call(vehicle, "getUniqueId") or vehicle.uniqueId or index), 64),
                            vehicle = ctx.clip(ctx.call(vehicle, "getFullName") or ctx.call(vehicle, "getName") or vehicle.typeName, 70),
                            totalLiters = liters,
                            totalSeconds = seconds,
                            sessionLiters = nonnegative(ctx, stats.sessionLiters),
                            sessionSeconds = nonnegative(ctx, stats.sessionSeconds),
                            secondsEco = nonnegative(ctx, modes[1]),
                            secondsNormal = nonnegative(ctx, modes[2]),
                            secondsPower = nonnegative(ctx, modes[3]),
                        }
                    else
                        truncated = true
                    end
                end
            end
        end
        return {
            readState = captured > 0 and "ok" or "settings-only",
            reason = captured == 0 and "no-captured-owned-vehicle" or nil,
            coverage = truncated and "truncated" or "complete",
            byFarm = { [tostring(farmId)] = {
                vehicleCount = captured,
                totalLiters = totalLiters,
                totalSeconds = totalSeconds,
            } },
            rows = rows,
        }
    end,
})
