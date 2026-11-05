-- Read-only Realistic Mechanical Systems v0.12.0.0 vehicle snapshot.
-- Never call its save/update methods; they can advance thermal state.

local MAX_ROWS = 60

local function fraction(ctx, value)
    local n = ctx.num(value)
    if n ~= nil and n >= 0 and n <= 1 then return n end
    return nil
end

local function countEntries(value)
    if type(value) ~= "table" then return 0 end
    local n = 0
    for _ in pairs(value) do n = n + 1 end
    return n
end

CompanionPages.register({
    key = "realisticMechanicalSystems",
    modNames = { "FS25_RealisticMechanicalSystems", "GH_Squallqt__FS25_RealisticMechanicalSystems_FS25_RealisticMechanicalSystems" },
    substrings = { "realisticmechanicalsystems" },
    collect = function(ctx)
        local farmId = ctx.farmId
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        local vehicles = ctx.ownedVehicles()
        if type(vehicles) ~= "table" then
            return { readState = "settings-only", reason = "no-owned-vehicle-list" }
        end

        local rows, captured, withBreakdowns, withLog = {}, 0, 0, 0
        local truncated = ctx.ownedScanTruncated == true
        for index, vehicle in ipairs(vehicles) do
            if type(vehicle) == "table" then
                local owner = ctx.num(vehicle.ownerFarmId) or ctx.num(ctx.call(vehicle, "getOwnerFarmId"))
                local spec = vehicle.spec_RealisticMechanicalSystems
                if owner == farmId and type(spec) == "table"
                    and spec.isExcludedVehicle ~= true and spec.isNewToRMS ~= true then
                    captured = captured + 1
                    local breakdownCount = countEntries(spec.activeBreakdowns)
                    local log = type(spec.maintenanceLog) == "table" and spec.maintenanceLog or {}
                    local logCount = #log
                    if breakdownCount > 0 then withBreakdowns = withBreakdowns + 1 end
                    if logCount > 0 then withLog = withLog + 1 end
                    if #rows < MAX_ROWS then
                        local last = log[logCount]
                        local lastCompleted = nil
                        if type(last) == "table" and type(last.isCompleted) == "boolean" then
                            lastCompleted = last.isCompleted
                        end
                        rows[#rows + 1] = {
                            farmId = farmId,
                            vehicleId = ctx.clip(tostring(ctx.call(vehicle, "getUniqueId") or vehicle.uniqueId or index), 64),
                            vehicle = ctx.clip(ctx.call(vehicle, "getFullName") or ctx.call(vehicle, "getName") or vehicle.typeName, 70),
                            serviceLevel = fraction(ctx, spec.serviceLevel),
                            conditionLevel = fraction(ctx, spec.conditionLevel),
                            state = ctx.clip(spec.currentState, 40),
                            breakdownCount = breakdownCount,
                            logCount = logCount,
                            lastLogType = type(last) == "table" and ctx.clip(last.type, 50) or nil,
                            lastLogPrice = type(last) == "table" and ctx.num(last.price) or nil,
                            lastLogCompleted = lastCompleted,
                        }
                    else
                        truncated = true
                    end
                end
            end
        end
        return {
            readState = captured > 0 and "ok" or "settings-only",
            reason = captured > 0 and nil or "no-captured-owned-vehicle",
            coverage = truncated and "truncated" or "complete",
            byFarm = { [tostring(farmId)] = {
                vehicleCount = captured,
                breakdownVehicleCount = withBreakdowns,
                loggedVehicleCount = withLog,
            } },
            rows = rows,
        }
    end,
})
