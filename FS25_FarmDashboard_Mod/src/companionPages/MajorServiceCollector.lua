-- Major Service v1.0.0.0: the mod records the operating-time reading at
-- each service on the vehicle. No repair or payment history is inferred.

local MAX_ROWS = 80
local MAX_TIME_MS = 10000000000000
local MS_PER_HOUR = 3600000

CompanionPages.register({
    key = "majorService",
    modNames = { "FS25_318291_Major_Service", "FS25_MajorService" },
    collect = function(ctx)
        if ctx.version ~= "1.0.0.0" then
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
                local owner = ctx.num(ctx.call(vehicle, "getOwnerFarmId") or vehicle.ownerFarmId)
                local spec = vehicle.spec_MajorService or vehicle.MajorService
                if owner == farmId and type(spec) == "table" then
                    local id = vehicle.uniqueId
                    local current = ctx.num(vehicle.operatingTime)
                    local last = ctx.num(spec.lastServiceAt)
                    if type(id) ~= "string" or id == "" or #id > 80
                        or current == nil or current < 0 or current > MAX_TIME_MS
                        or last == nil or last < 0 or last > current then
                        invalid = true
                    else
                        ids[id] = (ids[id] or 0) + 1
                        candidates[#candidates + 1] = {
                            farmId = farmId,
                            vehicleId = id,
                            vehicle = ctx.clip(ctx.call(vehicle, "getFullName")
                                or ctx.call(vehicle, "getName"), 80),
                            operatingHours = current / MS_PER_HOUR,
                            lastServiceHours = last > 0 and last / MS_PER_HOUR or nil,
                            sinceServiceHours = last > 0 and (current - last) / MS_PER_HOUR or nil,
                            serviceRecorded = last > 0,
                        }
                    end
                end
            end
        end

        local rows, count, recorded = {}, 0, 0
        for _, row in ipairs(candidates) do
            if ids[row.vehicleId] ~= 1 then invalid = true
            else
                count = count + 1
                if row.serviceRecorded then recorded = recorded + 1 end
                if #rows < MAX_ROWS then rows[#rows + 1] = row
                else truncated = true end
            end
        end
        table.sort(rows, function(a, b) return a.vehicleId < b.vehicleId end)
        local incomplete = invalid or truncated
        return {
            readState = incomplete and "partial" or count > 0 and "ok" or "settings-only",
            reason = invalid and "invalid-vehicle-state" or count == 0 and not incomplete and "no-owned-service-vehicles" or nil,
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            byFarm = { [tostring(farmId)] = {
                vehicleCount = not incomplete and count or nil,
                recordedCount = not incomplete and recorded or nil,
            } },
            rows = rows,
        }
    end,
})
