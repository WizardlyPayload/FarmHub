-- Use Your Tyres v1.1.0.0: read live wheel travel and the mod's wear model.
-- The current wheel set is shown; saved, inactive configurations are not a live reading.

local MAX_ROWS = 96
local MAX_WHEELS_PER_VEHICLE = 24
local USED_MAX_M = 240000

CompanionPages.register({
    key = "useYourTyres",
    modNames = { "FS25_321793_Use_Up_Your_Tyres", "FS25_useYourTyres" },
    collect = function(ctx)
        if ctx.version ~= "1.1.0.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmId = ctx.num(ctx.farmId)
        if farmId == nil or farmId < 1 or farmId ~= math.floor(farmId) then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-wheel-state-only" }
        end
        local model = ctx.symbol("UseYourTyres")
        local multiplier = type(model) == "table" and ctx.num(model.tyreDistanceMultiplier) or nil
        if multiplier == nil or multiplier < 0.1 or multiplier > 50 then
            return { readState = "settings-only", reason = "no-valid-tyre-multiplier" }
        end
        local vehicles = ctx.ownedVehicles()
        if type(vehicles) ~= "table" then
            return { readState = "settings-only", reason = "no-owned-vehicle-list" }
        end

        local rows, ids = {}, {}
        local count, wheelCount, maxWear = 0, 0, 0
        local invalid, truncated = false, ctx.ownedScanTruncated == true
        for _, vehicle in ipairs(vehicles) do
            if type(vehicle) == "table" then
                local owner = ctx.num(ctx.call(vehicle, "getOwnerFarmId") or vehicle.ownerFarmId)
                if owner == farmId and vehicle.uytHasTyres == true then
                    local id = vehicle.uniqueId
                    local wheels = type(vehicle.spec_wheels) == "table" and vehicle.spec_wheels.wheels or nil
                    if type(id) ~= "string" or id == "" or #id > 80 or type(wheels) ~= "table"
                        or #wheels == 0 or #wheels > MAX_WHEELS_PER_VEHICLE then
                        invalid = true
                    else
                        ids[id] = (ids[id] or 0) + 1
                        if ids[id] > 1 then invalid = true end
                        count = count + 1
                        local vehicleName = ctx.clip(ctx.call(vehicle, "getFullName")
                            or ctx.call(vehicle, "getName"), 80)
                        for wheelIndex, wheel in ipairs(wheels) do
                            local distance = type(wheel) == "table" and ctx.num(wheel.uytTravelledDist) or nil
                            local physics = type(wheel) == "table" and wheel.physics or nil
                            local radius = type(physics) == "table" and ctx.num(physics.radius) or nil
                            if distance == nil or distance < 0 or distance > 1000000000
                                or radius == nil or radius < 0.05 or radius > 10 then
                                invalid = true
                            else
                                -- Exact v1.1.0.0 getWearAmount model, including its one-revolution floor.
                                local perimeter = 6.28 * radius
                                local maxRevolutions = math.max(USED_MAX_M * multiplier / perimeter, 1)
                                local wear = math.min(math.max((distance / perimeter) / maxRevolutions, 0), 1)
                                wheelCount = wheelCount + 1
                                maxWear = math.max(maxWear, wear)
                                if #rows < MAX_ROWS then
                                    rows[#rows + 1] = {
                                        farmId = farmId, vehicleId = id, vehicle = vehicleName,
                                        wheelIndex = wheelIndex, distanceKm = distance / 1000,
                                        wearPct = wear * 100,
                                    }
                                else
                                    truncated = true
                                end
                            end
                        end
                    end
                end
            end
        end
        if invalid then
            local uniqueRows = {}
            for _, row in ipairs(rows) do
                if ids[row.vehicleId] == 1 then uniqueRows[#uniqueRows + 1] = row end
            end
            rows = uniqueRows
        end
        table.sort(rows, function(a, b)
            if a.vehicleId ~= b.vehicleId then return a.vehicleId < b.vehicleId end
            return a.wheelIndex < b.wheelIndex
        end)
        local incomplete = invalid or truncated
        return {
            readState = incomplete and "partial" or wheelCount > 0 and "ok" or "settings-only",
            reason = invalid and "invalid-wheel-state" or wheelCount == 0 and not incomplete and "no-owned-tyre-readings" or nil,
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            multiplier = multiplier,
            byFarm = { [tostring(farmId)] = {
                vehicleCount = not incomplete and count or nil,
                wheelCount = not incomplete and wheelCount or nil,
                maxWearPct = not incomplete and wheelCount > 0 and maxWear * 100 or nil,
            } },
            rows = rows,
        }
    end,
})
