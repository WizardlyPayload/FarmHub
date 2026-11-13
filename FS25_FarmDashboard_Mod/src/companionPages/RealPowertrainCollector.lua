-- Real Powertrain 1.0.0.0: current CVT settings saved on owned vehicles.
-- Engine operation, fuel, wear and fieldwork are not measured by these settings.

local LIMIT_STEPS = { 0, 5, 8, 10, 12, 15, 20 }
local MAX_ROWS = 120

local function integer(ctx, value, min, max)
    local n = ctx.num(value)
    if n == nil or n ~= math.floor(n) or n < min or n > max then return nil end
    return n
end

CompanionPages.register({
    key = "realPowertrain",
    modNames = { "KM_83605_Real_Power_Train" },
    substrings = { "real_power_train" },
    collect = function(ctx)
        if ctx.version ~= "1.0.0.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-vehicle-state-only" }
        end
        local farmId = integer(ctx, ctx.farmId, 1, 9999)
        if farmId == nil then
            return { readState = "settings-only", reason = "no-farm" }
        end
        local mod = ctx.symbol("RealPowertrain")
        local specKey = "spec_" .. ctx.modName .. ".realPowertrain"
        if type(mod) ~= "table" or mod.SPEC_KEY ~= specKey then
            return { readState = "settings-only", reason = "mod-state-unavailable" }
        end
        local vehicles = ctx.ownedVehicles()
        if type(vehicles) ~= "table" then
            return { readState = "settings-only", reason = "no-owned-vehicle-list" }
        end

        local rows, count, incomplete = {}, 0, false
        local truncated = ctx.ownedScanTruncated == true
        local seen = {}
        for _, vehicle in ipairs(vehicles) do
            local spec = type(vehicle) == "table" and vehicle[specKey] or nil
            if type(spec) == "table" and spec.cvt == true then
                count = count + 1
                local id = ctx.call(vehicle, "getUniqueId") or vehicle.uniqueId
                local profile = type(spec.profile) == "table" and spec.profile or nil
                local state = type(spec.state) == "table" and spec.state or nil
                local rangeCount = profile and type(profile.ranges) == "table" and #profile.ranges or 0
                local range = state and integer(ctx, state.range, 1, rangeCount) or nil
                local strategy = state and integer(ctx, state.strategy, 1, 2) or nil
                local ramp = state and integer(ctx, state.ramp, 1, 4) or nil
                local limit = state and integer(ctx, state.limitStep, 1, #LIMIT_STEPS) or nil
                local throttle = state and ctx.num(state.handThrottle) or nil
                local maxRpm = state and ctx.num(state.maxRpm) or nil
                if id == nil or seen[tostring(id)] or range == nil or strategy == nil
                    or ramp == nil or limit == nil or throttle == nil or maxRpm == nil
                    or throttle < 0 or maxRpm <= 0 or throttle > maxRpm then
                    incomplete = true
                else
                    seen[tostring(id)] = true
                    if #rows < MAX_ROWS then
                        rows[#rows + 1] = {
                            farmId = farmId,
                            vehicleId = ctx.clip(id, 64),
                            vehicle = ctx.clip(ctx.call(vehicle, "getFullName") or ctx.call(vehicle, "getName"), 80),
                            profile = ctx.clip(spec.profileId, 40),
                            range = range,
                            rangeCount = rangeCount,
                            strategy = strategy,
                            ramp = ramp,
                            loadLimitPercent = LIMIT_STEPS[limit],
                            handThrottleRpm = ctx.round2(throttle),
                        }
                    else
                        truncated = true
                    end
                end
            end
        end
        if count == 0 then
            return { readState = "settings-only", reason = "no-owned-cvt-powertrain" }
        end
        table.sort(rows, function(a, b) return a.vehicleId < b.vehicleId end)
        local partial = incomplete or truncated
        return {
            readState = partial and "partial" or "ok",
            reason = incomplete and "invalid-vehicle-state" or (truncated and "row-limit" or nil),
            coverage = truncated and "truncated" or (incomplete and "partial" or "complete"),
            byFarm = not partial and { [tostring(farmId)] = { cvtVehicleCount = count } } or nil,
            rows = rows,
        }
    end,
})
