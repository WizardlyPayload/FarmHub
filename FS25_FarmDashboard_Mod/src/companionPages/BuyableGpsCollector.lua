-- Buyable GPS 1.0.0.0: read the owned vehicle's purchased configuration.
-- Configuration 2 means installed, 1 means absent. Borrowed contract
-- equipment is excluded even though the mod allows steering on it.

local MAX_ROWS = 120

CompanionPages.register({
    key = "buyableGps",
    modNames = { "FS25_324860_Buyable_GPS", "FS25_BuyableGPS" },
    collect = function(ctx)
        if ctx.version ~= "1.0.0.0" then
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
        local supported, installed = 0, 0
        local invalid, truncated = false, ctx.ownedScanTruncated == true
        for _, vehicle in ipairs(vehicles) do
            if type(vehicle) == "table" then
                local owner = ctx.num(ctx.call(vehicle, "getOwnerFarmId") or vehicle.ownerFarmId)
                local config = type(vehicle.configurations) == "table"
                    and ctx.num(vehicle.configurations.buyableGPS) or nil
                if owner == farmId and config ~= nil and config ~= 0 then
                    local id = vehicle.uniqueId
                    if (config ~= 1 and config ~= 2) or type(id) ~= "string"
                        or id == "" or #id > 80 or seen[id] then
                        invalid = true
                    else
                        seen[id] = true
                        supported = supported + 1
                        if config == 2 then installed = installed + 1 end
                        if #rows < MAX_ROWS then
                            rows[#rows + 1] = {
                                farmId = farmId,
                                vehicleId = id,
                                vehicle = ctx.clip(ctx.call(vehicle, "getFullName")
                                    or ctx.call(vehicle, "getName"), 80),
                                gpsInstalled = config == 2,
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
            reason = invalid and "invalid-gps-configuration" or supported == 0
                and not incomplete and "no-owned-configurable-vehicle" or nil,
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            byFarm = not incomplete and { [tostring(farmId)] = {
                configurableVehicleCount = supported, gpsInstalledCount = installed,
            } } or nil,
            rows = rows,
        }
    end,
})
