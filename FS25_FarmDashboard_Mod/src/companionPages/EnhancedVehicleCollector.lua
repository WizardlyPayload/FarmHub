-- EnhancedVehicle 1.1.7.1 stores its own odometer/trip distance on the root vehicle.
-- vData.is[14/15] are metres and are also what the mod's HUD and save hook read.
-- Keep this source separate from Vehicle Mileage's nxMileage; the two are not additive.

local MAX_ROWS = 60

CompanionPages.register({
    key = "enhancedVehicle",
    modNames = { "FS25_EnhancedVehicle", "KM_58808_Enhanced_Vehicle" },
    substrings = { "enhancedvehicle", "enhanced_vehicle" },
    collect = function(ctx)
        local farmId = ctx.farmId
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-vehicle-state-only" }
        end
        local vehicles, scanTruncated = ctx.ownedVehicles()
        if type(vehicles) ~= "table" then
            return { readState = "settings-only", reason = "no-owned-vehicle-list" }
        end

        local rows, tracked = {}, 0
        for index, vehicle in ipairs(vehicles) do
            if type(vehicle) == "table" and (vehicle.rootVehicle == nil or vehicle.rootVehicle == vehicle) then
                local data = type(vehicle.vData) == "table" and vehicle.vData.is or nil
                local odo = type(data) == "table" and ctx.num(data[14]) or nil
                local trip = type(data) == "table" and ctx.num(data[15]) or nil
                if odo ~= nil and odo >= 0 then
                    tracked = tracked + 1
                    if #rows < MAX_ROWS then
                        local id = ctx.call(vehicle, "getUniqueId") or vehicle.uniqueId or vehicle.id or index
                        local name = ctx.call(vehicle, "getFullName") or ctx.call(vehicle, "getName") or vehicle.typeName
                        rows[#rows + 1] = {
                            farmId = farmId,
                            id = ctx.clip(id, 64),
                            vehicle = ctx.clip(name, 70),
                            odoKm = ctx.round2(odo / 1000),
                            tripKm = trip ~= nil and trip >= 0 and ctx.round2(trip / 1000) or nil,
                            hudMode = ctx.num(data[16]) == 1 and "trip" or "odometer",
                        }
                    end
                end
            end
        end
        table.sort(rows, function(a, b)
            if a.odoKm ~= b.odoKm then return a.odoKm > b.odoKm end
            return tostring(a.id) < tostring(b.id)
        end)
        return {
            readState = "ok",
            coverage = (scanTruncated or tracked > MAX_ROWS) and "truncated" or "complete",
            byFarm = { [tostring(farmId)] = { trackedCount = tracked } },
            rows = rows,
        }
    end,
})
