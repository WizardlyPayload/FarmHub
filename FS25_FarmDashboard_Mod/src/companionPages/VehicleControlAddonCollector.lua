-- Vehicle Control Addon 9.0.0.26: current per-vehicle settings only.
-- Global defaults and unsaved active flags are not a vehicle-work history.

local MOD_NAMES = { "FS25_vehicleControlAddon", "vehicleControlAddon", "KM_82841_Vehicle_Control_Addon_VCA_" }
local MAX_ROWS = 60

CompanionPages.register({
    key = "vehicleControlAddon",
    modNames = MOD_NAMES,
    substrings = { "vehiclecontroladdon", "vehicle_control_addon" },
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

        local rows, count, guidanceOn, limiterOn = {}, 0, 0, 0
        local truncated = ctx.ownedScanTruncated == true
        for _, vehicle in ipairs(vehicles) do
            local spec = type(vehicle) == "table" and vehicle.spec_vca or nil
            if type(spec) == "table" and spec.isInitialized == true then
                local spacing = ctx.num(spec.snapDistance)
                if spacing ~= nil and spacing >= 0 and spacing <= 1000
                    and type(spec.snapIsOn) == "boolean"
                    and type(spec.speedLimiter) == "boolean"
                    and type(spec.diffManual) == "boolean" then
                    count = count + 1
                    if spec.snapIsOn then guidanceOn = guidanceOn + 1 end
                    if spec.speedLimiter then limiterOn = limiterOn + 1 end
                    if #rows < MAX_ROWS then
                        local quarterTurnGuidanceOn = nil
                        if type(spec.snapEvery90) == "boolean" then
                            quarterTurnGuidanceOn = spec.snapEvery90
                        end
                        rows[#rows + 1] = {
                            farmId = farmId,
                            vehicleId = ctx.clip(vehicle.uniqueId or vehicle.id, 64),
                            vehicle = ctx.clip(ctx.call(vehicle, "getFullName") or ctx.call(vehicle, "getName"), 70),
                            guidanceOn = spec.snapIsOn,
                            guidanceSpacingM = spacing >= 0.25 and spacing or nil,
                            quarterTurnGuidanceOn = quarterTurnGuidanceOn,
                            speedLimiterOn = spec.speedLimiter,
                            manualDifferential = spec.diffManual,
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
            reason = count == 0 and "no-applicable-owned-vehicle" or nil,
            coverage = truncated and "truncated" or "complete",
            byFarm = { [tostring(farmId)] = {
                vehicleCount = count, guidanceOnCount = guidanceOn, speedLimiterOnCount = limiterOn,
            } },
            rows = rows,
        }
    end,
})
