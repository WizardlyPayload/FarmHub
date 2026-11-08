-- Realistic Harvesting Clogging Addon v1.4.1.0: live forage-knife condition.
-- The addon saves knifeSharpness on the vehicle. Clog flags are not a history.

local MAX_ROWS = 80
local MACHINE_TYPES = { grain = true, forage = true, cotton = true,
    root = true, grape = true, olive = true }

CompanionPages.register({
    key = "rhmClogging",
    modNames = { "WA25_RHM_CloggingAddon", "KM_81204_Clogging_Addon" },
    collect = function(ctx)
        if ctx.version ~= "1.4.1.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmId = ctx.num(ctx.farmId)
        if farmId == nil or farmId < 1 or farmId ~= math.floor(farmId) then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-knife-state-only" }
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
                local rhm = vehicle.spec_rhm_Combine
                local addon = vehicle.spec_wa_rhmClogging
                    or vehicle["spec_" .. tostring(ctx.modName or "") .. ".wa_rhmClogging"]
                if owner == farmId and type(addon) == "table" and type(rhm) == "table" then
                    local machineType = (type(rhm.combineMemory) == "table"
                        and rhm.combineMemory.machineType) or rhm.machineType
                    if not MACHINE_TYPES[machineType] then
                        invalid = true
                    elseif machineType == "forage" then
                        local id = vehicle.uniqueId
                        local sharpness = ctx.num(rhm.knifeSharpness)
                        if type(id) ~= "string" or id == "" or #id > 80
                            or sharpness == nil or sharpness < 0 or sharpness > 1 then
                            invalid = true
                        else
                            ids[id] = (ids[id] or 0) + 1
                            candidates[#candidates + 1] = {
                                farmId = farmId,
                                vehicleId = id,
                                vehicle = ctx.clip(ctx.call(vehicle, "getFullName")
                                    or ctx.call(vehicle, "getName"), 80),
                                knifeSharpnessPercent = sharpness * 100,
                            }
                        end
                    end
                end
            end
        end

        local rows, count = {}, 0
        for _, row in ipairs(candidates) do
            if ids[row.vehicleId] ~= 1 then invalid = true
            else
                count = count + 1
                if #rows < MAX_ROWS then rows[#rows + 1] = row
                else truncated = true end
            end
        end
        table.sort(rows, function(a, b) return a.vehicleId < b.vehicleId end)
        local incomplete = invalid or truncated
        return {
            readState = incomplete and "partial" or count > 0 and "ok" or "settings-only",
            reason = invalid and "invalid-knife-state" or count == 0 and not incomplete and "no-owned-forage-knife" or nil,
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            byFarm = not incomplete and { [tostring(farmId)] = { vehicleCount = count } } or nil,
            rows = rows,
        }
    end,
})
