-- Realistic Diesel Start 1.3.0.0: mod-model residual heat and truck air
-- pressure on currently owned non-electric vehicles. No engine temperature,
-- journey history, start result or measured brake condition is inferred.

local MAX_ROWS = 80

CompanionPages.register({
    key = "realDieselStart",
    modNames = { "KM_79619_realistic-diesel-start", "FS25_RealDieselStart" },
    collect = function(ctx)
        if ctx.version ~= "1.3.0.0" then
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

        local candidates, ids = {}, {}
        local invalid, truncated = false, ctx.ownedScanTruncated == true
        for _, vehicle in ipairs(vehicles) do
            if type(vehicle) == "table" then
                local owner = ctx.num(ctx.call(vehicle, "getOwnerFarmId"))
                local spec = vehicle.spec_realDieselStart
                if owner == farmId and type(spec) == "table" and spec.isElectric == false then
                    local id = type(vehicle.uniqueId) == "string" and vehicle.uniqueId or nil
                    local heat = ctx.num(spec.engineHeat)
                    local airSystem = spec.hasAirSystem
                    local pressure = ctx.num(spec.airPressure)
                    if id == nil or id == "" or #id > 80 or heat == nil or heat < 0 or heat > 1
                        or type(airSystem) ~= "boolean"
                        or (airSystem and (pressure == nil or pressure < 0 or pressure > 10)) then
                        invalid = true
                    else
                        ids[id] = (ids[id] or 0) + 1
                        candidates[#candidates + 1] = {
                            farmId = farmId, vehicleId = id,
                            vehicle = ctx.clip(ctx.call(vehicle, "getFullName")
                                or ctx.call(vehicle, "getName"), 80),
                            residualHeatPercent = ctx.round2(heat * 100),
                            airPressureBar = airSystem and ctx.round2(pressure) or nil,
                        }
                    end
                end
            end
        end
        local rows, count, airCount = {}, 0, 0
        for _, row in ipairs(candidates) do
            if ids[row.vehicleId] ~= 1 then invalid = true
            else
                count = count + 1
                if row.airPressureBar ~= nil then airCount = airCount + 1 end
                if #rows < MAX_ROWS then rows[#rows + 1] = row
                else truncated = true end
            end
        end
        table.sort(rows, function(a, b) return a.vehicleId < b.vehicleId end)
        local incomplete = invalid or truncated
        return {
            readState = incomplete and "partial" or count > 0 and "ok" or "settings-only",
            reason = invalid and "invalid-vehicle-state" or count == 0 and not incomplete and "no-owned-diesel-vehicles" or nil,
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            byFarm = { [tostring(farmId)] = {
                vehicleCount = not incomplete and count or nil,
                airSystemCount = not incomplete and airCount or nil,
            } },
            rows = rows,
        }
    end,
})
