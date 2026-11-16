-- Advanced Damage System v0.9.2.4 / v0.9.2.8: read only currently owned vehicle state.
-- Workshop log prices are recorded charges, not verified farm payments.

local MAX_ROWS, MAX_BREAKDOWNS, MAX_LOG_ENTRIES = 60, 100, 200

local function fraction(ctx, value)
    local n = ctx.num(value)
    if n ~= nil and n >= 0 and n <= 1 then return n end
    return nil
end

local function visibleCompleted(entry)
    if type(entry) ~= "table" then return false end
    local visible = entry.isVisible
    local completed = entry.isCompleted
    if type(visible) == "string" then
        visible = not ({ ["false"] = true, ["0"] = true, off = true, no = true })[string.lower(visible)]
    end
    if type(completed) == "string" then
        completed = not ({ ["false"] = true, ["0"] = true, off = true, no = true })[string.lower(completed)]
    end
    return visible ~= false and completed ~= false
end

local function countBounded(value, limit)
    if type(value) ~= "table" then return 0, false end
    local n = 0
    for _ in pairs(value) do
        n = n + 1
        if n > limit then return limit, true end
    end
    return n, false
end

local function countActiveBreakdowns(value)
    if type(value) ~= "table" then return nil, false, true end
    local active, scanned, invalid = 0, 0, false
    for _, breakdown in pairs(value) do
        scanned = scanned + 1
        if scanned > MAX_BREAKDOWNS then return nil, true, invalid end
        if type(breakdown) ~= "table" then
            invalid = true
        else
            local flag = breakdown.isActive
            if type(flag) == "string" then
                flag = string.lower(flag)
                if flag == "false" or flag == "0" then flag = false end
            end
            -- ADS creates latent faults with isVisible=false. The workshop only
            -- lists visible faults, so do not present hidden ones as jobs.
            if flag ~= false and breakdown.isVisible == true then
                active = active + 1
            end
        end
    end
    if invalid then return nil, false, true end
    return active, false, false
end

CompanionPages.register({
    key = "advancedDamageSystem",
    modNames = { "FS25_AdvancedDamageSystem", "KM_69590_Advanced_Damage_System" },
    substrings = { "advanceddamagesystem", "advanced_damage_system" },
    collect = function(ctx)
        local farmId = ctx.farmId
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-vehicles-only" }
        end
        if ctx.version ~= "0.9.2.4" and ctx.version ~= "0.9.2.8" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local vehicles = ctx.ownedVehicles()
        if type(vehicles) ~= "table" then
            return { readState = "settings-only", reason = "no-owned-vehicle-list" }
        end

        local rows, captured, withBreakdowns, withLog = {}, 0, 0, 0
        local incomplete = false
        local truncated = ctx.ownedScanTruncated == true
        for index, vehicle in ipairs(vehicles) do
            if type(vehicle) == "table" then
                local owner = ctx.num(vehicle.ownerFarmId) or ctx.num(ctx.call(vehicle, "getOwnerFarmId"))
                local spec = vehicle.spec_AdvancedDamageSystem
                local excluded = false
                if owner == farmId and type(spec) == "table" then
                    if ctx.version == "0.9.2.8" then
                        -- v0.9.2.8 replaced the old flag with this registered vehicle method.
                        excluded = ctx.call(vehicle, "getIsADSExcluded")
                        if type(excluded) ~= "boolean" then incomplete = true end
                    else
                        excluded = spec.isExcludedVehicle == true
                    end
                end
                if owner == farmId and type(spec) == "table" and excluded == false then
                    captured = captured + 1
                    local breakdownCount, breakdownLimit, breakdownInvalid = countActiveBreakdowns(spec.activeBreakdowns)
                    local log = type(spec.maintenanceLog) == "table" and spec.maintenanceLog or {}
                    local logCount, logLimit = countBounded(log, MAX_LOG_ENTRIES)
                    local logInvalid = not logLimit and logCount ~= #log
                    if not logLimit and not logInvalid then
                        for _, entry in ipairs(log) do
                            if type(entry) ~= "table" then logInvalid = true; break end
                        end
                    end
                    if breakdownLimit or breakdownInvalid or logLimit or logInvalid then incomplete = true end
                    local last = nil
                    if not (logLimit or logInvalid) then
                        for _, entry in ipairs(log) do
                            if visibleCompleted(entry) then last = entry end
                        end
                    end
                    if breakdownCount ~= nil and breakdownCount > 0 then withBreakdowns = withBreakdowns + 1 end
                    if last ~= nil then withLog = withLog + 1 end
                    if #rows < MAX_ROWS then
                        local service = fraction(ctx, spec.serviceLevel)
                        local condition = fraction(ctx, spec.conditionLevel)
                        local safeBreakdownCount = breakdownCount
                        local safeLogCount = logCount
                        if breakdownLimit or breakdownInvalid then safeBreakdownCount = nil end
                        if logLimit or logInvalid then safeLogCount = nil end
                        if service == nil or condition == nil then incomplete = true end
                        rows[#rows + 1] = {
                            farmId = farmId,
                            vehicleId = ctx.clip(tostring(ctx.call(vehicle, "getUniqueId") or vehicle.uniqueId or index), 64),
                            vehicle = ctx.clip(ctx.call(vehicle, "getFullName") or ctx.call(vehicle, "getName") or vehicle.typeName, 70),
                            serviceLevel = service,
                            conditionLevel = condition,
                            state = ctx.clip(spec.currentState, 40),
                            breakdownCount = safeBreakdownCount,
                            logCount = safeLogCount,
                            lastLogType = last and ctx.clip(last.type, 50) or nil,
                            lastLogPrice = last and ctx.num(last.price) or nil,
                        }
                    else
                        truncated = true
                    end
                end
            end
        end
        table.sort(rows, function(a, b)
            local an, bn = tostring(a.vehicle or a.vehicleId or ""), tostring(b.vehicle or b.vehicleId or "")
            if an == bn then return tostring(a.vehicleId or "") < tostring(b.vehicleId or "") end
            return an < bn
        end)
        return {
            readState = (incomplete or truncated) and "partial" or captured == 0 and "settings-only" or "ok",
            reason = captured == 0 and not (incomplete or truncated) and "no-captured-owned-vehicle" or nil,
            coverage = truncated and "truncated" or incomplete and "partial" or "complete",
            byFarm = not (incomplete or truncated) and { [tostring(farmId)] = {
                vehicleCount = captured,
                breakdownVehicleCount = withBreakdowns,
                loggedVehicleCount = withLog,
            } } or nil,
            rows = rows,
        }
    end,
})
