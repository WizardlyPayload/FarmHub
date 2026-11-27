-- Tramline System 2.0.0.5: saved setup and recorded hectares on owned sowers.
-- A lane setting is not proof that a tramline was created in a field.

local MAX_ROWS = 60

local function finite(value, minimum, maximum)
    local n = tonumber(value)
    if n == nil or n ~= n or n == math.huge or n == -math.huge
        or n < minimum or n > maximum then return nil end
    return n
end

CompanionPages.register({
    key = "tramlineSystem",
    modNames = { "FS25_TramlineSystem", "FS25_Tramline_System", "KM_83120_Tramline_System" },
    collect = function(ctx)
        local farmId = ctx.num(ctx.farmId)
        if farmId == nil or farmId <= 0 or farmId ~= math.floor(farmId) then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-vehicles-only" }
        end
        local vehicles = ctx.ownedVehicles()
        if type(vehicles) ~= "table" then
            return { readState = "settings-only", reason = "no-owned-vehicle-list" }
        end

        local rows, count, activeCount, workedCount = {}, 0, 0, 0
        local truncated, partial = ctx.ownedScanTruncated == true, false
        for _, vehicle in ipairs(vehicles) do
            if type(vehicle) == "table" then
                local setup = vehicle.spec_tramlineSystemTramLines
                local sowing = vehicle.spec_tramlineSystemSowingExtension
                if type(setup) == "table" or type(sowing) == "table" then
                    local row = {
                        farmId = farmId,
                        vehicleId = ctx.clip(ctx.call(vehicle, "getUniqueId") or vehicle.uniqueId or vehicle.id, 64),
                        vehicle = ctx.clip(ctx.call(vehicle, "getFullName")
                            or ctx.call(vehicle, "getName"), 70),
                    }
                    if type(setup) == "table" then
                        row.mode = finite(setup.tramLineMode, 0, 2)
                        row.currentLane = finite(setup.currentLane, 1, 100)
                        row.passSequence = finite(setup.tramLinePeriodicSequence, 1, 100)
                        row.tramlineDistance = finite(setup.tramLineDistance, 0.5, 200)
                        row.sprayerProfileWidth = finite(setup.sprayerProfileWidth, 0.5, 200)
                        if row.mode ~= nil and row.mode ~= math.floor(row.mode) then row.mode = nil end
                        if row.currentLane ~= nil and row.currentLane ~= math.floor(row.currentLane) then row.currentLane = nil end
                        if row.passSequence ~= nil and row.passSequence ~= math.floor(row.passSequence) then row.passSequence = nil end
                        if type(setup.createTramLines) == "boolean" then
                            row.createTramLines = setup.createTramLines
                        end
                        if row.mode == nil or row.currentLane == nil or row.passSequence == nil
                            or row.tramlineDistance == nil or row.createTramLines == nil then
                            partial = true
                        end
                    end
                    if type(sowing) == "table" then
                        row.sessionHectares = finite(sowing.sessionHectares, 0, 1000000)
                        row.totalHectares = finite(sowing.totalHectares, 0, 1000000)
                        if row.sessionHectares == nil or row.totalHectares == nil then partial = true end
                    end
                    count = count + 1
                    if row.createTramLines == true then activeCount = activeCount + 1 end
                    if row.totalHectares ~= nil and row.totalHectares > 0 then
                        workedCount = workedCount + 1
                    end
                    if #rows < MAX_ROWS then rows[#rows + 1] = row else truncated = true end
                end
            end
        end
        table.sort(rows, function(a, b) return (a.vehicle or "") < (b.vehicle or "") end)
        return {
            readState = count == 0 and "settings-only" or partial and "partial" or "ok",
            reason = count == 0 and "no-applicable-owned-seeder" or nil,
            coverage = truncated and "truncated" or partial and "partial" or "complete",
            byFarm = { [tostring(farmId)] = { seederCount = count,
                tramlinesEnabledCount = activeCount, recordedAreaCount = workedCount } },
            rows = rows,
        }
    end,
})
