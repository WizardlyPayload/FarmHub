-- Hydraulic Broken Trailer 1.0.0.0: current owned trailer hydraulic state.
-- A condition reading is not a tip, workshop service, or repair history.

local MAX_ROWS = 120

CompanionPages.register({
    key = "hydraulicBrokenTrailer",
    modNames = { "KM_81545_Hydraulic_Broken_Trailer" },
    collect = function(ctx)
        if ctx.version ~= "1.0.0.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmId = ctx.num(ctx.farmId)
        if farmId == nil or farmId < 1 or farmId ~= math.floor(farmId) then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-hydraulic-state-only" }
        end
        local vehicles = ctx.ownedVehicles()
        if type(vehicles) ~= "table" then
            return { readState = "settings-only", reason = "no-owned-vehicle-list" }
        end

        local rows, seen = {}, {}
        local invalid, truncated = false, ctx.ownedScanTruncated == true
        local supported, broken, service = 0, 0, 0
        local specKey = "spec_" .. ctx.modName .. ".hydraulicBroken"
        for _, vehicle in ipairs(vehicles) do
            if type(vehicle) == "table" then
                local owner = ctx.num(ctx.call(vehicle, "getOwnerFarmId") or vehicle.ownerFarmId)
                local spec = vehicle[specKey] or vehicle.spec_hydraulicBroken
                if owner == farmId and spec ~= nil then
                    local id = vehicle.uniqueId
                    local condition = type(spec) == "table" and ctx.num(spec.condition) or nil
                    local failure, hold
                    if type(spec) == "table" then
                        failure = spec.isBroken
                        hold = spec.detachHoldActive
                    end
                    local supportedType = vehicle.spec_trailer ~= nil
                        and vehicle.spec_motorized == nil and vehicle.spec_enterable == nil
                        and vehicle.spec_drivable == nil
                    if not supportedType or type(id) ~= "string" or id == "" or #id > 80
                        or seen[id] or condition == nil or condition < 0 or condition > 1
                        or type(failure) ~= "boolean" or type(hold) ~= "boolean"
                        or (failure and condition > 0.001) then
                        invalid = true
                    else
                        seen[id] = true
                        supported = supported + 1
                        local isBroken = failure or condition <= 0.001
                        local needsService = not isBroken and condition < 0.995
                        if isBroken then broken = broken + 1 end
                        if needsService then service = service + 1 end
                        if #rows < MAX_ROWS then
                            rows[#rows + 1] = {
                                farmId = farmId, vehicleId = id,
                                trailer = ctx.clip(ctx.call(vehicle, "getFullName")
                                    or ctx.call(vehicle, "getName"), 80),
                                hydraulicCondition = isBroken and 0 or condition,
                                isBroken = isBroken, needsService = needsService,
                                detachHoldActive = hold,
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
            reason = invalid and "invalid-hydraulic-state" or supported == 0 and not incomplete
                and "no-owned-supported-trailer" or nil,
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            byFarm = not incomplete and { [tostring(farmId)] = {
                supportedTrailerCount = supported,
                brokenTrailerCount = broken,
                serviceDueCount = service,
            } } or nil,
            rows = rows,
        }
    end,
})
