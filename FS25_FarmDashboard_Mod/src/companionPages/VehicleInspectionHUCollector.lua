-- Vehicle Inspection (HU) v1.0.0.0 stores per-vehicle inspection records.
-- Read only records that still belong to vehicles owned by the export farm.

local MAX_ROWS = 60

CompanionPages.register({
    key = "vehicleInspectionHU",
    modNames = { "FS25_Vehicle_Inspection_HU", "FS25_373915_Vehicle_Inspection_HU" },
    substrings = { "vehicle_inspection_hu", "vehicleinspectionhu" },
    collect = function(ctx)
        local farmId = ctx.farmId
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end

        local manager = ctx.global("g_huManager")
        if type(manager) ~= "table" or manager.initialized ~= true or type(manager.records) ~= "table" then
            return { readState = "settings-only", reason = "no-inspection-register" }
        end
        local vehicles = ctx.ownedVehicles()
        if type(vehicles) ~= "table" then
            return { readState = "settings-only", reason = "no-owned-vehicle-list" }
        end

        local rows = {}
        local count, due, overdue, decommissioned = 0, 0, 0, 0
        local truncated = ctx.ownedScanTruncated == true
        for _, vehicle in ipairs(vehicles) do
            if type(vehicle) == "table" then
                local uniqueId = ctx.call(vehicle, "getUniqueId") or vehicle.uniqueId
                local record = uniqueId ~= nil and manager.records[uniqueId] or nil
                if type(record) == "table" and ctx.num(record.farmId) == farmId then
                    local remaining = ctx.num(record.remainingMonths)
                    if remaining ~= nil then
                        remaining = math.floor(remaining)
                        count = count + 1
                        if remaining == 0 then due = due + 1 end
                        if remaining < 0 then overdue = overdue + 1 end
                        if record.decommissioned == true then decommissioned = decommissioned + 1 end
                        if #rows < MAX_ROWS then
                            rows[#rows + 1] = {
                                farmId = farmId,
                                vehicleId = ctx.clip(uniqueId, 64),
                                vehicle = ctx.clip(ctx.call(vehicle, "getFullName") or record.vehicleName, 70),
                                className = ctx.clip(record.className, 40),
                                intervalMonths = ctx.num(record.intervalMonths),
                                customIntervalMonths = ctx.num(record.customIntervalMonths),
                                remainingMonths = remaining,
                                decommissioned = record.decommissioned == true,
                            }
                        else
                            truncated = true
                        end
                    end
                end
            end
        end
        table.sort(rows, function(a, b)
            if a.remainingMonths ~= b.remainingMonths then return a.remainingMonths < b.remainingMonths end
            return tostring(a.vehicle or "") < tostring(b.vehicle or "")
        end)
        return {
            readState = "ok",
            coverage = truncated and "truncated" or "complete",
            byFarm = { [tostring(farmId)] = {
                vehicleCount = count, dueCount = due, overdueCount = overdue,
                decommissionedCount = decommissioned,
            } },
            rows = rows,
        }
    end,
})
