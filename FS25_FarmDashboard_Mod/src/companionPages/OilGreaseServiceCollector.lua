-- Oil And Grease Service 1.1.0.0: live reservoir levels for owned vehicles.
-- Read the mod's existing state tables only; getOrCreateState mutates them.

local MAX_VEHICLES = 80

local function readLevel(ctx, module, vehicle)
    local states = type(module) == "table" and module.stateByVehicle or nil
    local state = type(states) == "table" and states[vehicle] or nil
    if type(state) ~= "table" then return nil, "unavailable" end
    local capacity = ctx.num(state.capacity)
    local level = ctx.num(state.level)
    if type(state.enabled) ~= "boolean" or capacity == nil or capacity <= 0
        or level == nil or level < 0 or level > capacity + 0.001 then
        return nil, "invalid"
    end
    if state.enabled == false then return { enabled = false }, nil end
    return {
        enabled = true,
        levelLitres = ctx.round2(level),
        capacityLitres = ctx.round2(capacity),
        percent = ctx.round2(level / capacity * 100),
        serviceNeeded = capacity - level > 0.05,
    }, nil
end

CompanionPages.register({
    key = "oilGreaseService",
    modNames = { "FS25_358863_Oil_And_Grease_Service", "FS25_OilAndGreaseService" },
    substrings = { "oil_and_grease_service", "oilgreaseservice" },
    collect = function(ctx)
        local farmId = ctx.farmId
        if ctx.version ~= "1.1.0.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-state-only" }
        end
        if ctx.mission.isMissionStarted == false then
            return { readState = "settings-only", reason = "world-not-started" }
        end
        local oil = ctx.symbol("VehicleOil")
        local grease = ctx.symbol("VehicleGrease")
        if type(oil) ~= "table" or type(grease) ~= "table"
            or type(oil.stateByVehicle) ~= "table" or type(grease.stateByVehicle) ~= "table" then
            return { readState = "settings-only", reason = "service-state-unavailable" }
        end
        local vehicles = ctx.ownedVehicles()
        if type(vehicles) ~= "table" then
            return { readState = "settings-only", reason = "no-owned-vehicle-list" }
        end
        local rows, seen = {}, {}
        local scanned, invalid, unavailable = 0, false, 0
        local truncated = ctx.ownedScanTruncated == true
        for _, vehicle in ipairs(vehicles) do
            scanned = scanned + 1
            if scanned > MAX_VEHICLES then truncated = true; break end
            if type(vehicle) == "table" then
                local owner = ctx.num(ctx.call(vehicle, "getOwnerFarmId")) or ctx.num(vehicle.ownerFarmId)
                local id = type(vehicle.uniqueId) == "string" and vehicle.uniqueId or nil
                if owner ~= farmId or id == nil or id == "" or seen[id] then
                    invalid = true
                else
                    seen[id] = true
                    local oilState, oilError = readLevel(ctx, oil, vehicle)
                    local greaseState, greaseError = readLevel(ctx, grease, vehicle)
                    if oilError == "invalid" or greaseError == "invalid" then
                        invalid = true
                    elseif oilError or greaseError then
                        unavailable = unavailable + 1
                    elseif oilState.enabled or greaseState.enabled then
                        local lowest = math.min(oilState.enabled and oilState.percent or 100,
                            greaseState.enabled and greaseState.percent or 100)
                        rows[#rows + 1] = {
                            farmId = farmId,
                            vehicleId = ctx.clip(id, 64),
                            vehicle = ctx.clip(ctx.call(vehicle, "getFullName") or ctx.call(vehicle, "getName"), 70),
                            oil = oilState,
                            grease = greaseState,
                            lowestPercent = lowest,
                            serviceNeeded = oilState.serviceNeeded == true or greaseState.serviceNeeded == true,
                        }
                    end
                end
            end
        end
        table.sort(rows, function(a, b)
            if a.lowestPercent ~= b.lowestPercent then return a.lowestPercent < b.lowestPercent end
            return a.vehicleId < b.vehicleId
        end)
        local complete = not invalid and not truncated and unavailable == 0
        local need = 0
        for _, row in ipairs(rows) do if row.serviceNeeded then need = need + 1 end end
        return {
            readState = complete and (#rows > 0 and "ok" or "settings-only") or "partial",
            reason = complete and #rows == 0 and "no-monitored-vehicles" or nil,
            coverage = truncated and "truncated" or (invalid or unavailable > 0) and "partial" or "complete",
            byFarm = { [tostring(farmId)] = complete and { monitoredVehicles = #rows, serviceNeeded = need } or {} },
            rows = rows,
        }
    end,
})
