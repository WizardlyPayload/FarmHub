-- Job Queue v1.0.0.0: current vehicle-owned planned AI entries, not completed work.
local MAX_ROWS = 80
local JOB_TYPES = { FIELDWORK = true, GOTO = true }
local WAIT_REASONS = { REFILL = true, BLOCKED = true }

CompanionPages.register({
    key = "jobQueue",
    modNames = { "KM_82197_Job_Queue", "FS25_JobQueue" },
    substrings = { "job_queue", "jobqueue" },
    collect = function(ctx)
        if ctx.version ~= "1.0.0.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmId = ctx.num(ctx.farmId)
        if farmId == nil or farmId < 1 or farmId ~= math.floor(farmId) then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-queue-state-only" }
        end
        local vehicles = ctx.ownedVehicles()
        if type(vehicles) ~= "table" then
            return { readState = "settings-only", reason = "no-owned-vehicle-list" }
        end

        local rows, ids = {}, {}
        local vehicleCount, entryCount, armedCount = 0, 0, 0
        local invalid, truncated = false, ctx.ownedScanTruncated == true

        local function readEntry(entry, vehicleId, vehicleName, position, current)
            if type(entry) ~= "table" or not JOB_TYPES[entry.jobType] then return nil end
            local fieldId = entry.fieldId == nil and nil or ctx.num(entry.fieldId)
            local x = entry.x == nil and nil or ctx.num(entry.x)
            local z = entry.z == nil and nil or ctx.num(entry.z)
            if fieldId ~= nil and (fieldId < 1 or fieldId ~= math.floor(fieldId)) then return nil end
            if (entry.fieldId ~= nil and fieldId == nil) or (entry.x ~= nil and x == nil)
                or (entry.z ~= nil and z == nil) or ((x == nil) ~= (z == nil))
                or (fieldId == nil and x == nil) then return nil end
            return {
                farmId = farmId, vehicleId = vehicleId, vehicle = vehicleName,
                position = position, current = current, jobType = entry.jobType,
                fieldId = fieldId, x = x and ctx.round2(x) or nil,
                z = z and ctx.round2(z) or nil,
            }
        end

        for _, vehicle in ipairs(vehicles) do
            if type(vehicle) == "table" then
                local owner = ctx.num(ctx.call(vehicle, "getOwnerFarmId") or vehicle.ownerFarmId)
                local queue = vehicle.jobQueue
                if owner == farmId and type(queue) == "table" then
                    local id = ctx.call(vehicle, "getUniqueId") or vehicle.uniqueId
                    if type(id) == "string" and id ~= "" and #id <= 80 then
                        ids[id] = (ids[id] or 0) + 1
                        if ids[id] > 1 then invalid = true end
                    end
                    if type(id) ~= "string" or id == "" or #id > 80
                        or type(queue.entries) ~= "table" or type(queue.isRunning) ~= "boolean"
                        or (queue.activeEntry ~= nil and type(queue.activeEntry) ~= "table")
                        or (queue.pendingStart ~= nil and type(queue.pendingStart) ~= "boolean")
                        or (queue.waitReason ~= nil and not WAIT_REASONS[queue.waitReason]) then
                        invalid = true
                    else
                        vehicleCount = vehicleCount + 1
                        if queue.isRunning then armedCount = armedCount + 1 end
                        local name = ctx.clip(ctx.call(vehicle, "getFullName")
                            or ctx.call(vehicle, "getName"), 80)
                        local entries = {}
                        if queue.activeEntry ~= nil then entries[#entries + 1] = queue.activeEntry end
                        for _, entry in ipairs(queue.entries) do entries[#entries + 1] = entry end
                        for index, entry in ipairs(entries) do
                            local row = readEntry(entry, id, name, index,
                                queue.activeEntry ~= nil and index == 1)
                            if row == nil then
                                invalid = true
                            else
                                entryCount = entryCount + 1
                                row.running = queue.isRunning
                                if index == 1 and queue.pendingStart == true
                                    and WAIT_REASONS[queue.waitReason] then
                                    row.waitReason = queue.waitReason
                                end
                                if #rows < MAX_ROWS then rows[#rows + 1] = row
                                else truncated = true end
                            end
                        end
                    end
                end
            end
        end
        if invalid then
            local validRows = {}
            for _, row in ipairs(rows) do
                if ids[row.vehicleId] == 1 then validRows[#validRows + 1] = row end
            end
            rows = validRows
        end
        table.sort(rows, function(a, b)
            if a.vehicleId ~= b.vehicleId then return a.vehicleId < b.vehicleId end
            return a.position < b.position
        end)
        local incomplete = invalid or truncated
        return {
            readState = incomplete and "partial" or "ok",
            reason = invalid and "invalid-queue-state" or nil,
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            byFarm = { [tostring(farmId)] = {
                vehicleCount = not incomplete and vehicleCount or nil,
                entryCount = not incomplete and entryCount or nil,
                armedCount = not incomplete and armedCount or nil,
            } },
            rows = rows,
        }
    end,
})
