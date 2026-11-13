-- CVT Addon 2.1.0.0 saves its own transmission wear percentage per configured vehicle.
-- This is current mod condition, not a service charge or repair transaction.

local MAX_ROWS = 120

local function wearPercent(value)
    local n = tonumber(value)
    if n == nil or n ~= n or n == math.huge or n == -math.huge
        or n < 0 or n > 100 then return nil end
    return n
end

CompanionPages.register({
    key = "cvtAddon",
    modNames = { "FS25_CVT_Addon" },
    collect = function(ctx)
        if ctx.version ~= "2.1.0.0" then
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

        local rows, seen = {}, {}
        local configured, worn = 0, 0
        local invalid, truncated = false, ctx.ownedScanTruncated == true
        for _, vehicle in ipairs(vehicles) do
            if type(vehicle) == "table" then
                local owner = ctx.num(ctx.call(vehicle, "getOwnerFarmId") or vehicle.ownerFarmId)
                local spec = vehicle.spec_CVTaddon
                if owner == farmId and type(spec) == "table" and spec.CVTcfgExists == true then
                    local id = ctx.call(vehicle, "getUniqueId") or vehicle.uniqueId
                    local wear = wearPercent(spec.CVTdamage)
                    if type(id) ~= "string" or id == "" or #id > 80 or seen[id]
                        or wear == nil then
                        invalid = true
                    else
                        seen[id] = true
                        configured = configured + 1
                        if wear > 0 then worn = worn + 1 end
                        if #rows < MAX_ROWS then
                            rows[#rows + 1] = {
                                farmId = farmId, vehicleId = id,
                                vehicle = ctx.clip(ctx.call(vehicle, "getFullName")
                                    or ctx.call(vehicle, "getName"), 80),
                                transmissionWearPercent = wear,
                            }
                        else truncated = true end
                    end
                end
            end
        end
        table.sort(rows, function(a, b) return a.vehicleId < b.vehicleId end)
        local incomplete = invalid or truncated
        return {
            readState = incomplete and "partial" or configured > 0 and "ok" or "settings-only",
            reason = invalid and "invalid-cvt-condition" or configured == 0 and not incomplete
                and "no-owned-configured-vehicle" or nil,
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            byFarm = not incomplete and { [tostring(farmId)] = {
                configuredVehicleCount = configured, vehiclesWithWearCount = worn,
            } } or nil,
            rows = rows,
        }
    end,
})
