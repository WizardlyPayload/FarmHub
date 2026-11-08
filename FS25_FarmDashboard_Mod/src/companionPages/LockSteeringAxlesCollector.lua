-- Lock Steering Axle 1.0.0.0 stores a boolean on compatible trailers.
-- This page reports the current control state, not handling performance.

local MAX_ROWS = 120

CompanionPages.register({
    key = "lockSteeringAxles",
    modNames = { "FS25_311154_Lock_Steering_Axle", "FS25_lockSteeringAxles" },
    collect = function(ctx)
        if ctx.version ~= "1.0.0.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmId = ctx.num(ctx.farmId)
        if farmId == nil or farmId < 1 or farmId ~= math.floor(farmId) then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-trailer-state-only" }
        end
        local vehicles = ctx.ownedVehicles()
        if type(vehicles) ~= "table" then
            return { readState = "settings-only", reason = "no-owned-vehicle-list" }
        end

        local rows, seen = {}, {}
        local supported, locked = 0, 0
        local invalid, truncated = false, ctx.ownedScanTruncated == true
        for _, vehicle in ipairs(vehicles) do
            if type(vehicle) == "table" then
                local owner = ctx.num(ctx.call(vehicle, "getOwnerFarmId") or vehicle.ownerFarmId)
                local spec = vehicle.spec_lockSteeringAxles
                if owner == farmId and type(spec) == "table"
                    and spec.foundSteeringAxle == true then
                    local id, state = vehicle.uniqueId, spec.lockSteeringAxle
                    if type(id) ~= "string" or id == "" or #id > 80
                        or type(state) ~= "boolean" or seen[id] then
                        invalid = true
                    else
                        seen[id] = true
                        supported = supported + 1
                        if state then locked = locked + 1 end
                        if #rows < MAX_ROWS then
                            rows[#rows + 1] = {
                                farmId = farmId,
                                vehicleId = id,
                                vehicle = ctx.clip(ctx.call(vehicle, "getFullName")
                                    or ctx.call(vehicle, "getName"), 80),
                                steeringAxleLocked = state,
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
            reason = invalid and "invalid-axle-state" or supported == 0 and not incomplete
                and "no-owned-compatible-trailer" or nil,
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            byFarm = not incomplete and { [tostring(farmId)] = {
                compatibleTrailerCount = supported, lockedTrailerCount = locked,
            } } or nil,
            rows = rows,
        }
    end,
})
