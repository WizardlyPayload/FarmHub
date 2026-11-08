-- Fill Level Limiter v1.0.1.0: configured sub-capacity limits on owned fill units.
-- No overflow, rejected-load history or crop loss is recorded by the mod.

local MAX_ROWS = 120
local MAX_LIMIT = 1000000000

CompanionPages.register({
    key = "fillLevelLimiter",
    modNames = { "FS25_325794_Fill_Level_Limiter", "FS25_FillLevelLimiter" },
    collect = function(ctx)
        if ctx.version ~= "1.0.1.0" then
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

        local rows, ids = {}, {}
        local invalid, truncated = false, ctx.ownedScanTruncated == true
        local specKey = "spec_" .. tostring(ctx.modName or "") .. ".fillLevelLimiter"
        for _, vehicle in ipairs(vehicles) do
            if type(vehicle) == "table" then
                local owner = ctx.num(ctx.call(vehicle, "getOwnerFarmId") or vehicle.ownerFarmId)
                local spec = vehicle[specKey]
                if owner == farmId and type(spec) == "table" then
                    local id = vehicle.uniqueId
                    local limits = spec.fillUnitIndexToLimit
                    if type(id) ~= "string" or id == "" or #id > 80
                        or type(limits) ~= "table" then
                        invalid = true
                    else
                        ids[id] = (ids[id] or 0) + 1
                        local seenUnits = {}
                        for index, rawLimit in pairs(limits) do
                            local unitIndex = ctx.num(index)
                            local limit = ctx.num(rawLimit)
                            local capacity = unitIndex and ctx.num(ctx.call(vehicle,
                                "getFillUnitCapacity", unitIndex)) or nil
                            if unitIndex == nil or unitIndex < 1 or unitIndex > 255
                                or unitIndex ~= math.floor(unitIndex) or seenUnits[unitIndex]
                                or limit == nil or limit < 0 or limit > MAX_LIMIT
                                or capacity == nil or capacity < limit or capacity > MAX_LIMIT
                                or (limit < capacity and limit < 1) then
                                invalid = true
                            else
                                seenUnits[unitIndex] = true
                                if limit < capacity then
                                    local fillUnits = type(vehicle.spec_fillUnit) == "table"
                                        and vehicle.spec_fillUnit.fillUnits or nil
                                    local unit = type(fillUnits) == "table" and fillUnits[unitIndex] or nil
                                    local unitText = type(unit) == "table" and unit.unitText or nil
                                    local titles = spec.fillUnitTitle
                                    local title = type(titles) == "table" and titles[unitIndex] or nil
                                    rows[#rows + 1] = {
                                        farmId = farmId, vehicleId = id,
                                        vehicle = ctx.clip(ctx.call(vehicle, "getFullName")
                                            or ctx.call(vehicle, "getName") or id, 80),
                                        fillUnitIndex = unitIndex,
                                        fillUnitTitle = ctx.clip(title or tostring(unitIndex), 48),
                                        limit = limit, capacity = capacity,
                                        unitText = ctx.clip(unitText, 12),
                                    }
                                    if #rows > MAX_ROWS then truncated = true end
                                end
                            end
                        end
                    end
                elseif owner == farmId and spec ~= nil then
                    invalid = true
                end
            end
        end
        local completeRows, vehicleIds = {}, {}
        for _, row in ipairs(rows) do
            if ids[row.vehicleId] ~= 1 then invalid = true
            elseif #completeRows < MAX_ROWS then
                completeRows[#completeRows + 1] = row
                vehicleIds[row.vehicleId] = true
            else truncated = true end
        end
        table.sort(completeRows, function(a, b)
            return a.vehicleId == b.vehicleId and a.fillUnitIndex < b.fillUnitIndex
                or a.vehicleId < b.vehicleId
        end)
        local vehicleCount = 0
        for _ in pairs(vehicleIds) do vehicleCount = vehicleCount + 1 end
        local incomplete = invalid or truncated
        return {
            readState = incomplete and "partial" or #completeRows > 0 and "ok" or "settings-only",
            reason = invalid and "invalid-fill-limit-state" or #completeRows == 0
                and not incomplete and "no-owned-custom-limit" or nil,
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            byFarm = not incomplete and { [tostring(farmId)] = {
                vehicleCount = vehicleCount, customLimitCount = #completeRows,
            } } or nil,
            rows = completeRows,
        }
    end,
})
