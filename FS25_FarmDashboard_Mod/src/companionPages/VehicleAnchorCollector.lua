-- Vehicle Anchor 1.0.0.0: saved anchor choice and current physics application.
-- A saved choice alone does not prove the anchor joint was applied.

local MAX_ROWS = 80

CompanionPages.register({
    key = "vehicleAnchor",
    modNames = { "KM_81498_Vehicle_Anchor" },
    substrings = {},
    collect = function(ctx)
        if ctx.version ~= "1.0.0.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmId = ctx.num(ctx.farmId)
        if farmId == nil or farmId < 1 or farmId > 8 or farmId ~= math.floor(farmId) then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-vehicle-state-only" }
        end
        local vehicles = ctx.ownedVehicles()
        if type(vehicles) ~= "table" then
            return { readState = "settings-only", reason = "no-owned-vehicle-list" }
        end

        if type(ctx.modName) ~= "string" or ctx.modName == "" then
            return { readState = "settings-only", reason = "mod-name-unavailable" }
        end
        local specName = "spec_" .. ctx.modName .. ".vehicleAnchor"
        local candidates, ids, supported = {}, {}, 0
        local invalid, truncated = false, ctx.ownedScanTruncated == true
        for _, vehicle in ipairs(vehicles) do
            local owner = type(vehicle) == "table" and ctx.num(ctx.call(vehicle, "getOwnerFarmId")) or nil
            local spec = type(vehicle) == "table" and vehicle[specName] or nil
            if owner == farmId and type(spec) == "table" and spec.isSupported == true then
                supported = supported + 1
                if type(spec.isAnchored) ~= "boolean" or type(spec.isApplied) ~= "boolean" then
                    invalid = true
                elseif spec.isAnchored then
                    local id = type(vehicle.uniqueId) == "string" and vehicle.uniqueId or nil
                    if id == nil or id == "" or #id > 80 then invalid = true
                    else
                        ids[id] = (ids[id] or 0) + 1
                        candidates[#candidates + 1] = { vehicle = vehicle, id = id, applied = spec.isApplied }
                    end
                end
            end
        end
        local rows, applied = {}, 0
        for _, candidate in ipairs(candidates) do
            if ids[candidate.id] ~= 1 then invalid = true
            elseif #rows < MAX_ROWS then
                rows[#rows + 1] = {
                    farmId = farmId, vehicleId = candidate.id,
                    vehicle = ctx.clip(ctx.call(candidate.vehicle, "getFullName")
                        or ctx.call(candidate.vehicle, "getName"), 80),
                    applied = candidate.applied,
                }
                if candidate.applied then applied = applied + 1 end
            else truncated = true end
        end
        if supported == 0 and not invalid and not truncated then
            return { readState = "settings-only", reason = "no-supported-owned-vehicle" }
        end
        table.sort(rows, function(a, b) return tostring(a.vehicleId) < tostring(b.vehicleId) end)
        return {
            readState = invalid and "partial" or "ok",
            reason = invalid and "ambiguous-or-unreadable-anchor" or nil,
            coverage = truncated and "truncated" or "complete",
            byFarm = { [tostring(farmId)] = {
                supportedCount = supported, anchoredCount = #rows,
                appliedCount = applied,
            } },
            rows = rows,
        }
    end,
})
