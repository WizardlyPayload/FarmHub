-- FS25 FarmDashboard | companionPages/VehicleMileageCollector.lua | v1.0.0
-- Vehicle Mileage (NX Modding 1.0.0.1). The mod adds the NXMileage specialization to drivable, enterable,
-- motorized types (not trains / conveyors) and stores on the root vehicle:
--   vehicle.nxMileage { odoMeter (m), tripMeter (m), odoMode (0 = mileage, 1 = trip on the HUD) }
-- Meters only grow on the server while the engine runs (lastMovedDistance). The HUD formats the value
-- with g_i18n:getDistance, i.e. the game's own miles setting, so that setting is exported too.

local SCAN_VEHICLES = 400
local MAX_ROWS = 50

local function vehicleLabel(ctx, vehicle)
    local name = ctx.call(vehicle, "getFullName")
    if type(name) ~= "string" or name == "" then
        name = ctx.call(vehicle, "getName")
    end
    if type(name) ~= "string" or name == "" then
        name = type(vehicle.typeName) == "string" and vehicle.typeName or nil
    end
    return ctx.clip(name, 60)
end

local function vehicleId(ctx, vehicle, index)
    local id = vehicle.uniqueId or vehicle.id or index
    return ctx.clip(tostring(id), 64)
end

local function ownedVehicles(ctx)
    local farmId = ctx.farmId
    local shared = type(ctx.ownedVehicles) == "function" and ctx.try(ctx.ownedVehicles) or nil
    local source = type(shared) == "table" and shared or nil
    if source == nil then
        local mission = ctx.mission
        local system = type(mission) == "table" and mission.vehicleSystem or nil
        source = type(system) == "table" and type(system.vehicles) == "table" and system.vehicles or nil
    end
    if source == nil then
        return nil, false
    end
    local out, scanned, truncated = {}, 0, false
    local function consider(vehicle)
        scanned = scanned + 1
        if scanned > SCAN_VEHICLES then
            truncated = true
            return false
        end
        if type(vehicle) == "table" then
            local owner = ctx.num(vehicle.ownerFarmId) or ctx.num(ctx.call(vehicle, "getOwnerFarmId"))
            if owner == farmId then
                out[#out + 1] = vehicle
            end
        end
        return true
    end
    if #source > 0 then
        for i = 1, #source do
            if not consider(source[i]) then
                break
            end
        end
    else
        for _, vehicle in pairs(source) do
            if not consider(vehicle) then
                break
            end
        end
    end
    return out, truncated
end

local function gameUsesMiles(ctx)
    local settings = ctx.global("g_gameSettings")
    if type(settings) ~= "table" then
        return nil
    end
    local value = ctx.call(settings, "getValue", "useMiles")
    if value == nil then
        value = ctx.try(function() return settings.useMiles end)
    end
    if value == true or value == false then
        return value
    end
    return nil
end

CompanionPages.register({
    key = "vehicleMileage",
    modNames = { "FS25_VehicleMileage", "FS25_Vehicle_Mileage", "FS25_347015_Vehicle_Mileage" },
    substrings = { "vehiclemileage", "vehicle_mileage" },
    collect = function(ctx)
        local out = { useMiles = gameUsesMiles(ctx) }
        if ctx.farmId == nil or ctx.farmId <= 0 then
            out.readState = "detection-only"
            out.reason = "no-farm"
            return out
        end
        local vehicles, truncated = ownedVehicles(ctx)
        if vehicles == nil then
            out.readState = "detection-only"
            out.reason = "no-vehicle-list"
            return out
        end
        local farm = { trackedCount = 0, totalKm = 0, tripKm = 0, vehicles = {} }
        local rows = {}
        for i, vehicle in ipairs(vehicles) do
            local nx = vehicle.nxMileage
            if type(nx) == "table" and (vehicle.rootVehicle == nil or vehicle.rootVehicle == vehicle) then
                local odo = ctx.num(nx.odoMeter)
                local trip = ctx.num(nx.tripMeter)
                if odo ~= nil then
                    local opMs = ctx.num(ctx.call(vehicle, "getOperatingTime"))
                    local row = {
                        id = vehicleId(ctx, vehicle, i),
                        name = vehicleLabel(ctx, vehicle),
                        odoKm = ctx.round2(odo / 1000),
                        tripKm = trip ~= nil and ctx.round2(trip / 1000) or nil,
                        hudMode = ctx.num(nx.odoMode) == 1 and "trip" or "mileage",
                        operatingHours = opMs ~= nil and ctx.round2(opMs / 3600000) or nil,
                    }
                    farm.trackedCount = farm.trackedCount + 1
                    farm.totalKm = farm.totalKm + odo / 1000
                    farm.tripKm = farm.tripKm + (trip or 0) / 1000
                    rows[#rows + 1] = row
                end
            end
        end
        table.sort(rows, function(a, b)
            if a.odoKm ~= b.odoKm then
                return a.odoKm > b.odoKm
            end
            return tostring(a.id) < tostring(b.id)
        end)
        for i = 1, math.min(#rows, MAX_ROWS) do
            farm.vehicles[i] = rows[i]
        end
        if #rows > 0 then
            farm.highestKm = rows[1].odoKm
            farm.averageKm = ctx.round2(farm.totalKm / #rows)
        end
        farm.totalKm = ctx.round2(farm.totalKm)
        farm.tripKm = ctx.round2(farm.tripKm)
        out.readState = "ok"
        out.coverage = (truncated or #rows > MAX_ROWS) and "truncated" or "complete"
        out.byFarm = { [tostring(ctx.farmId)] = farm }
        return out
    end,
})
