-- Non-Stop Crop v1.0.0.0 saves a source vehicle's enabled flag and selected
-- target. A selection is not evidence of transfer. Resolve targets by owner.
local TYPES = {
    silo = true, productionPoint = true, vehicle = true,
    bunkerSilo = true, husbandry = true,
}
local MAX_ROWS = 80

CompanionPages.register({
    key = "nonStopCrop",
    modNames = { "FS25_363554_Non-Stop_Crop", "FS25_NonStopCrop" },
    substrings = { "non-stop_crop", "nonstopcrop" },
    collect = function(ctx)
        if ctx.version ~= "1.0.0.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmId = ctx.num(ctx.farmId)
        if farmId == nil or farmId < 1 or farmId ~= math.floor(farmId) then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-route-state-only" }
        end
        local vehicles = ctx.ownedVehicles()
        if type(vehicles) ~= "table" then
            return { readState = "settings-only", reason = "no-owned-vehicle-list" }
        end
        local rows, ids = {}, {}
        local count, enabledCount, resolvedCount = 0, 0, 0
        local invalid, truncated = false, ctx.ownedScanTruncated == true

        for _, vehicle in ipairs(vehicles) do
            if type(vehicle) == "table" then
                local owner = ctx.num(ctx.call(vehicle, "getOwnerFarmId") or vehicle.ownerFarmId)
                local state = vehicle.nonStopCrop
                if owner == farmId and type(state) == "table" then
                    local id = ctx.call(vehicle, "getUniqueId") or vehicle.uniqueId
                    local destinationType, destinationId = state.destinationType, state.destinationId
                    if type(id) ~= "string" or id == "" or #id > 80
                        or type(state.enabled) ~= "boolean"
                        or ((destinationType == nil) ~= (destinationId == nil))
                        or (destinationType ~= nil and (not TYPES[destinationType]
                            or type(destinationId) ~= "string" or destinationId == ""
                            or #destinationId > 100)) then
                        invalid = true
                    else
                        ids[id] = (ids[id] or 0) + 1
                        if ids[id] > 1 then invalid = true end
                        local status, targetName = "none", nil
                        if destinationType ~= nil then
                            status = "unavailable"
                            local system = destinationType == "vehicle"
                                and ctx.mission.vehicleSystem or ctx.mission.placeableSystem
                            local method = destinationType == "vehicle"
                                and "getVehicleByUniqueId" or "getPlaceableByUniqueId"
                            local target = ctx.call(system, method, destinationId)
                            local targetOwner = ctx.num(ctx.call(target, "getOwnerFarmId"))
                            if targetOwner == farmId then
                                status = "owned"
                                targetName = ctx.clip(ctx.call(target, "getName")
                                    or ctx.call(target, "getFullName"), 80)
                            end
                        end
                        count = count + 1
                        if state.enabled then enabledCount = enabledCount + 1 end
                        if status == "owned" then resolvedCount = resolvedCount + 1 end
                        if #rows < MAX_ROWS then
                            rows[#rows + 1] = {
                                farmId = farmId, vehicleId = id,
                                vehicle = ctx.clip(ctx.call(vehicle, "getFullName")
                                    or ctx.call(vehicle, "getName"), 80),
                                enabled = state.enabled,
                                destinationType = destinationType,
                                destinationStatus = status,
                                destination = targetName,
                            }
                        else truncated = true end
                    end
                end
            end
        end
        if invalid then
            local unique = {}
            for _, row in ipairs(rows) do
                if ids[row.vehicleId] == 1 then unique[#unique + 1] = row end
            end
            rows = unique
        end
        table.sort(rows, function(a, b) return a.vehicleId < b.vehicleId end)
        local incomplete = invalid or truncated
        return {
            readState = incomplete and "partial" or "ok",
            reason = invalid and "invalid-route-state" or nil,
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            byFarm = { [tostring(farmId)] = {
                sourceCount = not incomplete and count or nil,
                enabledCount = not incomplete and enabledCount or nil,
                ownedTargetCount = not incomplete and resolvedCount or nil,
            } },
            rows = rows,
        }
    end,
})
