-- Parking Brake 1.0.1.5: current installation and requested brake state.
-- An engaged flag does not establish that wheel physics held the vehicle.

local MAX_ROWS = 160

CompanionPages.register({
    key = "parkingBrake",
    modNames = { "FS25_ParkingBrake", "KM_81129_Parking_Brake_Mod" },
    collect = function(ctx)
        if ctx.version ~= "1.0.1.5" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmId = ctx.num(ctx.farmId)
        if farmId == nil or farmId < 1 or farmId ~= math.floor(farmId) then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-brake-state-only" }
        end
        local vehicles = ctx.ownedVehicles()
        if type(vehicles) ~= "table" then
            return { readState = "settings-only", reason = "no-owned-vehicle-list" }
        end

        local rows, seen = {}, {}
        local invalid, truncated = false, ctx.ownedScanTruncated == true
        local supported, installed, engaged = 0, 0, 0
        for _, vehicle in ipairs(vehicles) do
            if type(vehicle) == "table" then
                local owner = ctx.num(ctx.call(vehicle, "getOwnerFarmId") or vehicle.ownerFarmId)
                local data = vehicle.scgParkingBrake
                if owner == farmId and data ~= nil then
                    local id = vehicle.uniqueId
                    local supportedType = vehicle.spec_motorized ~= nil
                        and vehicle.spec_enterable ~= nil and vehicle.spec_drivable ~= nil
                    if not supportedType or type(id) ~= "string" or id == "" or #id > 80
                        or seen[id] or type(data) ~= "table"
                        or type(data.installed) ~= "boolean" or type(data.is) ~= "boolean"
                        or (data.is and not data.installed) then
                        invalid = true
                    else
                        seen[id] = true
                        supported = supported + 1
                        if data.installed then installed = installed + 1 end
                        if data.is then engaged = engaged + 1 end
                        if #rows < MAX_ROWS then
                            rows[#rows + 1] = {
                                farmId = farmId, vehicleId = id,
                                vehicle = ctx.clip(ctx.call(vehicle, "getFullName")
                                    or ctx.call(vehicle, "getName"), 80),
                                brakeInstalled = data.installed,
                                brakeEngaged = data.is,
                            }
                        else truncated = true end
                    end
                end
            end
        end
        table.sort(rows, function(a, b) return a.vehicleId < b.vehicleId end)
        local incomplete = invalid or truncated
        return {
            readState = incomplete and "partial" or supported > 0 and "ok" or "settings-only",
            reason = invalid and "invalid-brake-state" or supported == 0 and not incomplete
                and "no-owned-supported-vehicle" or nil,
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            byFarm = not incomplete and { [tostring(farmId)] = {
                supportedVehicleCount = supported,
                installedBrakeCount = installed,
                engagedBrakeCount = engaged,
            } } or nil,
            rows = rows,
        }
    end,
})
