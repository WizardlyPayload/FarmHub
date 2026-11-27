-- ScriptHub TUV System v1.0.0.0 stores its own inspection state on each vehicle.
-- A fresh/grandfathered validity period has inspectionCount=0: it is not an inspection.

local MAX_ROWS = 80

CompanionPages.register({
    key = "tuvSystem",
    modNames = { "KM_81230_T_V_HU_System", "FS25_TUVSystem" },
    substrings = { "t_v_hu_system", "tuvsystem" },
    collect = function(ctx)
        local farmId = ctx.farmId
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        local vehicles = ctx.ownedVehicles()
        if type(vehicles) ~= "table" then
            return { readState = "settings-only", reason = "no-owned-vehicle-list" }
        end
        local env = type(ctx.mission) == "table" and ctx.mission.environment or nil
        local currentDay = type(env) == "table"
            and (ctx.num(env.currentMonotonicDay) or ctx.num(env.currentDay)) or nil
        if currentDay ~= nil then currentDay = math.max(1, math.floor(currentDay)) end

        local rows, vehicleCount, inspectedCount, expiredCount, failedCount = {}, 0, 0, 0, 0
        local partial, truncated = false, ctx.ownedScanTruncated == true
        for _, vehicle in ipairs(vehicles) do
            if type(vehicle) == "table" and type(vehicle.__tuvSystemData) == "table" then
                local data = vehicle.__tuvSystemData
                local result = ctx.num(data.result)
                local inspections = ctx.num(data.inspectionCount)
                local validUntil = ctx.num(data.validUntilDay)
                if result == nil or result < 0 or result > 4 or result ~= math.floor(result)
                    or inspections == nil or inspections < 0 or inspections ~= math.floor(inspections)
                    or validUntil == nil then
                    partial = true
                else
                    vehicleCount = vehicleCount + 1
                    if inspections > 0 then inspectedCount = inspectedCount + 1 end
                    local daysRemaining = currentDay ~= nil and validUntil >= 0
                        and (math.floor(validUntil) - currentDay) or nil
                    if daysRemaining ~= nil and daysRemaining < 0 then expiredCount = expiredCount + 1 end
                    if result == 3 or result == 4 then failedCount = failedCount + 1 end
                    if #rows >= MAX_ROWS then
                        truncated = true
                    else
                        local vehicleId = ctx.call(vehicle, "getUniqueId") or vehicle.uniqueId or vehicle.id
                        rows[#rows + 1] = {
                            farmId = farmId,
                            vehicleId = ctx.clip(vehicleId, 64),
                            vehicle = ctx.clip(ctx.call(vehicle, "getFullName")
                                or ctx.call(vehicle, "getName") or vehicleId, 70),
                            result = result,
                            inspectionCount = inspections,
                            validUntilDay = math.floor(validUntil),
                            daysRemaining = daysRemaining,
                            lastInspectionDay = inspections > 0 and ctx.num(data.lastInspectionDay) or nil,
                            lastCost = inspections > 0 and ctx.num(data.lastCost) or nil,
                        }
                    end
                end
            end
        end
        table.sort(rows, function(a, b)
            if a.daysRemaining ~= nil and b.daysRemaining ~= nil
                and a.daysRemaining ~= b.daysRemaining then
                return a.daysRemaining < b.daysRemaining
            end
            if a.daysRemaining ~= nil and b.daysRemaining == nil then return true end
            if a.daysRemaining == nil and b.daysRemaining ~= nil then return false end
            return tostring(a.vehicle or "") < tostring(b.vehicle or "")
        end)
        return {
            readState = partial and "partial" or (vehicleCount > 0 and "ok" or "settings-only"),
            reason = vehicleCount == 0 and "no-owned-tuv-vehicles" or nil,
            coverage = truncated and "truncated" or partial and "partial" or "complete",
            byFarm = { [tostring(farmId)] = {
                vehicleCount = vehicleCount,
                inspectedCount = inspectedCount,
                expiredCount = expiredCount,
                failedCount = failedCount,
            } },
            rows = rows,
        }
    end,
})
