-- Variable Working Depth v1.0.0.0: current owned implement setpoints.
-- The setpoint and calibration reference are saved per vehicle; no worked depth is recorded.

local MAX_ROWS = 100

CompanionPages.register({
    key = "variableWorkingDepth",
    modNames = { "FS25_VariableWorkingDepth", "KM_81882_variable-working-depth" },
    collect = function(ctx)
        if ctx.version ~= "1.0.0.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmId = ctx.num(ctx.farmId)
        if farmId == nil or farmId < 1 or farmId ~= math.floor(farmId) then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-implement-state-only" }
        end
        local vehicles = ctx.ownedVehicles()
        if type(vehicles) ~= "table" then
            return { readState = "settings-only", reason = "no-owned-vehicle-list" }
        end

        local candidates, ids = {}, {}
        local invalid, truncated = false, ctx.ownedScanTruncated == true
        local specKey = "spec_" .. tostring(ctx.modName or "") .. ".variableWorkingDepth"
        for _, vehicle in ipairs(vehicles) do
            if type(vehicle) == "table" then
                local owner = ctx.num(ctx.call(vehicle, "getOwnerFarmId") or vehicle.ownerFarmId)
                local spec = vehicle[specKey]
                if owner == farmId and type(spec) == "table" then
                    local mode = ctx.num(spec.controlMode)
                    if mode == 1 or mode == 2 then
                        local id = vehicle.uniqueId
                        local setpoint = ctx.num(spec.depthSetpoint)
                        local nominal = ctx.num(spec.nodeHeightNominal)
                        if type(id) ~= "string" or id == "" or #id > 80
                            or type(spec.enabled) ~= "boolean"
                            or type(spec.isCalibrated) ~= "boolean"
                            or setpoint == nil or setpoint < 0 or setpoint > 1
                            or (spec.isCalibrated and nominal == nil) then
                            invalid = true
                        else
                            ids[id] = (ids[id] or 0) + 1
                            candidates[#candidates + 1] = {
                                farmId = farmId,
                                vehicleId = id,
                                vehicle = ctx.clip(ctx.call(vehicle, "getFullName")
                                    or ctx.call(vehicle, "getName"), 80),
                                enabled = spec.enabled,
                                controlMode = mode == 1 and "WHEELS" or "HITCH",
                                setpointPercent = setpoint * 100,
                                calibrated = spec.isCalibrated,
                            }
                        end
                    elseif mode ~= 0 then
                        invalid = true
                    end
                end
            end
        end

        local rows, count, enabledCount = {}, 0, 0
        for _, row in ipairs(candidates) do
            if ids[row.vehicleId] ~= 1 then invalid = true
            else
                count = count + 1
                if row.enabled then enabledCount = enabledCount + 1 end
                if #rows < MAX_ROWS then rows[#rows + 1] = row
                else truncated = true end
            end
        end
        table.sort(rows, function(a, b) return a.vehicleId < b.vehicleId end)
        local incomplete = invalid or truncated
        return {
            readState = incomplete and "partial" or count > 0 and "ok" or "settings-only",
            reason = invalid and "invalid-depth-state" or count == 0 and not incomplete and "no-owned-supported-implement" or nil,
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            byFarm = not incomplete and { [tostring(farmId)] = {
                implementCount = count, enabledCount = enabledCount,
            } } or nil,
            rows = rows,
        }
    end,
})
