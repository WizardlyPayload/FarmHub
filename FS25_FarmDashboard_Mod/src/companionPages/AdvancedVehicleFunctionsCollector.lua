-- Advanced Vehicle Functions 1.9.0.0: current switches on owned vehicles.
-- These settings are not driving, accident or cost history.

local MAX_ROWS = 60

CompanionPages.register({
    key = "advancedVehicleFunctions",
    modNames = { "FS25_AdvancedVehicleFunctions", "KM_82760_Advanced_Vehicle_Functions" },
    substrings = { "advancedvehiclefunctions", "advanced_vehicle_functions" },
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

        local rows, count, absOn, asrOn, espOn = {}, 0, 0, 0, 0
        local truncated = ctx.ownedScanTruncated == true
        for _, vehicle in ipairs(vehicles) do
            local settings = type(vehicle) == "table" and vehicle.vdcSettings or nil
            if type(settings) == "table"
                and type(settings.ABS) == "boolean"
                and type(settings.ASR) == "boolean"
                and type(settings.ESP) == "boolean" then
                count = count + 1
                if settings.ABS then absOn = absOn + 1 end
                if settings.ASR then asrOn = asrOn + 1 end
                if settings.ESP then espOn = espOn + 1 end
                if #rows < MAX_ROWS then
                    local drivetrainReady = vehicle.frcDrivetrainInitialized == true
                    local drivetrain = drivetrainReady
                        and type(vehicle.frcFourWheelDriveActive) == "boolean"
                        and type(vehicle.frcFrontDifferentialLockActive) == "boolean"
                        and type(vehicle.frcRearDifferentialLockActive) == "boolean"
                    local row = {
                        farmId = farmId,
                        vehicleId = ctx.clip(vehicle.uniqueId or vehicle.id, 64),
                        vehicle = ctx.clip(ctx.call(vehicle, "getFullName") or ctx.call(vehicle, "getName"), 70),
                        absOn = settings.ABS,
                        asrOn = settings.ASR,
                        espOn = settings.ESP,
                    }
                    if type(vehicle.frcHandbrakeActive) == "boolean" then
                        row.handbrakeOn = vehicle.frcHandbrakeActive
                    end
                    if drivetrain then
                        row.fourWheelDriveOn = vehicle.frcFourWheelDriveActive
                        row.frontDifferentialLockOn = vehicle.frcFrontDifferentialLockActive
                        row.rearDifferentialLockOn = vehicle.frcRearDifferentialLockActive
                    end
                    rows[#rows + 1] = row
                else
                    truncated = true
                end
            end
        end
        table.sort(rows, function(a, b) return tostring(a.vehicle or "") < tostring(b.vehicle or "") end)
        return {
            readState = count > 0 and "ok" or "settings-only",
            reason = count == 0 and "no-applicable-owned-vehicle" or nil,
            coverage = truncated and "truncated" or "complete",
            byFarm = { [tostring(farmId)] = {
                vehicleCount = count,
                absOnCount = absOn,
                asrOnCount = asrOn,
                espOnCount = espOn,
            } },
            rows = rows,
        }
    end,
})
