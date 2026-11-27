-- Agricultural Terminal v1.0.0.0: records attached to currently owned vehicles.
-- A record has no creator-farm ID, so it must not become a farm work total.
local MAX_ROWS = 100
local MAX_HISTORY = 20

CompanionPages.register({
    key = "agriculturalTerminal",
    modNames = { "KM_82990_Agricultural_Terminal" },
    substrings = { "agricultural_terminal" },
    collect = function(ctx)
        if ctx.version ~= "1.0.0.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmId = ctx.num(ctx.farmId)
        if farmId == nil or farmId < 1 or farmId ~= math.floor(farmId) then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-terminal-records-only" }
        end
        local vehicles = ctx.ownedVehicles()
        if type(vehicles) ~= "table" then
            return { readState = "settings-only", reason = "no-owned-vehicle-list" }
        end

        local rows, ids, recordIds = {}, {}, {}
        local terminalCount, recordCount = 0, 0
        local invalid, truncated = false, ctx.ownedScanTruncated == true

        local function readRecord(record, current, vehicleId, vehicleName)
            if type(record) ~= "table" then return nil end
            local number = ctx.num(record.number)
            local area = current and ctx.num(ctx.call(record.coverage, "getArea"))
                or ctx.num(record.area)
            local workTime = ctx.num(record.workTime)
            local totalTime = ctx.num(record.totalTime)
            local liters = ctx.num(record.liters)
            local distance = ctx.num(record.distance)
            local harvestMass = ctx.num(record.harvestMass)
            local harvestHa = ctx.num(record.harvestHa)
            local parcel = record.farmlandId == nil and nil or ctx.num(record.farmlandId)
            if number == nil or number < 1 or number ~= math.floor(number)
                or area == nil or area < 0
                or workTime == nil or workTime < 0
                or totalTime == nil or totalTime < 0 or workTime > totalTime
                or liters == nil or liters < 0
                or distance == nil or distance < 0
                or harvestMass == nil or harvestMass < 0
                or harvestHa == nil or harvestHa < 0
                or (record.farmlandId ~= nil and (parcel == nil or parcel < 1
                    or parcel ~= math.floor(parcel)))
                or (current and type(record.isPaused) ~= "boolean") then
                return nil
            end
            return {
                farmId = farmId, vehicleId = vehicleId, vehicle = vehicleName,
                number = number, current = current, paused = current and record.isPaused or nil,
                startingParcel = parcel,
                areaHa = ctx.round2(area / 10000),
                workHours = ctx.round2(workTime / 3600000),
                openHours = ctx.round2(totalTime / 3600000),
                fuelLiters = ctx.round2(liters),
                distanceKm = ctx.round2(distance / 1000),
                harvestTonnes = ctx.round2(harvestMass),
                harvestHa = ctx.round2(harvestHa),
            }
        end

        for _, vehicle in ipairs(vehicles) do
            if type(vehicle) == "table" then
                local owner = ctx.num(ctx.call(vehicle, "getOwnerFarmId") or vehicle.ownerFarmId)
                local spec = vehicle.spec_terminalAgricola
                if owner == farmId and type(spec) == "table" and spec.hasTerminal == true then
                    local id = ctx.call(vehicle, "getUniqueId") or vehicle.uniqueId
                    if type(id) == "string" and id ~= "" and #id <= 80 then
                        ids[id] = (ids[id] or 0) + 1
                        if ids[id] > 1 then invalid = true end
                    end
                    if type(id) ~= "string" or id == "" or #id > 80
                        or type(spec.history) ~= "table" or #spec.history > MAX_HISTORY
                        or (spec.job ~= nil and type(spec.job) ~= "table") then
                        invalid = true
                    else
                        terminalCount = terminalCount + 1
                        local name = ctx.clip(ctx.call(vehicle, "getFullName")
                            or ctx.call(vehicle, "getName"), 80)
                        local function add(record, current)
                            local row = readRecord(record, current, id, name)
                            if row == nil then invalid = true; return end
                            local recordId = id .. ":" .. tostring(row.number)
                            recordIds[recordId] = (recordIds[recordId] or 0) + 1
                            if recordIds[recordId] > 1 then invalid = true end
                            recordCount = recordCount + 1
                            if #rows < MAX_ROWS then rows[#rows + 1] = row
                            else truncated = true end
                        end
                        if spec.job ~= nil then add(spec.job, true) end
                        for _, record in ipairs(spec.history) do add(record, false) end
                    end
                end
            end
        end
        if invalid then
            local filtered = {}
            for _, row in ipairs(rows) do
                if ids[row.vehicleId] == 1
                    and recordIds[row.vehicleId .. ":" .. tostring(row.number)] == 1 then
                    filtered[#filtered + 1] = row
                end
            end
            rows = filtered
        end
        table.sort(rows, function(a, b)
            if a.vehicleId ~= b.vehicleId then return a.vehicleId < b.vehicleId end
            if a.current ~= b.current then return a.current end
            return a.number > b.number
        end)
        local incomplete = invalid or truncated
        return {
            readState = incomplete and "partial" or "ok",
            reason = invalid and "invalid-terminal-record" or nil,
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            byFarm = { [tostring(farmId)] = {
                vehicleCount = not incomplete and terminalCount or nil,
                recordCount = not incomplete and recordCount or nil,
            } },
            rows = rows,
        }
    end,
})
