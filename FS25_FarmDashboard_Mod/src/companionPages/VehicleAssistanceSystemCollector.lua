-- Vehicle Assistance System v1.0.0.1: current saved controls on owned vehicles.
-- The source saves ICC and ALC choices per vehicle; no driving or safety events are recorded.

local MAX_ROWS = 150

CompanionPages.register({
    key = "vehicleAssistanceSystem",
    modNames = { "FS25_350273_Vehicle_Assistance_System", "FS25_VehicleAssistanceSystem" },
    collect = function(ctx)
        if ctx.version ~= "1.0.0.1" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmId = ctx.num(ctx.farmId)
        if farmId == nil or farmId < 1 or farmId ~= math.floor(farmId) then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-vehicle-state-only" }
        end
        local vehicles = ctx.ownedVehicles()
        if type(vehicles) ~= "table" then
            return { readState = "settings-only", reason = "no-owned-vehicle-list" }
        end

        local candidates, ids = {}, {}
        local invalid, truncated = false, ctx.ownedScanTruncated == true
        for _, vehicle in ipairs(vehicles) do
            if type(vehicle) == "table" then
                local owner = ctx.num(ctx.call(vehicle, "getOwnerFarmId") or vehicle.ownerFarmId)
                if owner == farmId then
                    local cruise = vehicle.spec_intelligentCruiseControl
                    local lights = vehicle.spec_automaticLightControl
                    if cruise ~= nil or lights ~= nil then
                        local id = vehicle.uniqueId
                        if type(id) ~= "string" or id == "" or #id > 80
                            or (cruise ~= nil and (type(cruise) ~= "table" or type(cruise.active) ~= "boolean"))
                            or (lights ~= nil and (type(lights) ~= "table"
                                or type(lights.lowBeamControlActive) ~= "boolean"
                                or type(lights.highBeamControlActive) ~= "boolean")) then
                            invalid = true
                        else
                            ids[id] = (ids[id] or 0) + 1
                            local cruiseState, lowBeamState, highBeamState
                            if cruise then cruiseState = cruise.active end
                            if lights then
                                lowBeamState = lights.lowBeamControlActive
                                highBeamState = lights.highBeamControlActive
                            end
                            candidates[#candidates + 1] = {
                                farmId = farmId,
                                vehicleId = id,
                                vehicle = ctx.clip(ctx.call(vehicle, "getFullName")
                                    or ctx.call(vehicle, "getName"), 80),
                                intelligentCruise = cruiseState,
                                automaticLowBeam = lowBeamState,
                                automaticHighBeam = highBeamState,
                            }
                        end
                    end
                end
            end
        end

        local rows, count, cruiseCount, lowBeamCount, highBeamCount = {}, 0, 0, 0, 0
        for _, row in ipairs(candidates) do
            if ids[row.vehicleId] ~= 1 then invalid = true
            else
                count = count + 1
                if row.intelligentCruise == true then cruiseCount = cruiseCount + 1 end
                if row.automaticLowBeam == true then lowBeamCount = lowBeamCount + 1 end
                if row.automaticHighBeam == true then highBeamCount = highBeamCount + 1 end
                if #rows < MAX_ROWS then rows[#rows + 1] = row
                else truncated = true end
            end
        end
        table.sort(rows, function(a, b) return a.vehicleId < b.vehicleId end)
        local incomplete = invalid or truncated
        return {
            readState = incomplete and "partial" or count > 0 and "ok" or "settings-only",
            reason = invalid and "invalid-assistance-state" or count == 0 and not incomplete and "no-owned-supported-vehicle" or nil,
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            byFarm = not incomplete and { [tostring(farmId)] = {
                vehicleCount = count, cruiseEnabledCount = cruiseCount,
                lowBeamEnabledCount = lowBeamCount, highBeamEnabledCount = highBeamCount,
            } } or nil,
            rows = rows,
        }
    end,
})
