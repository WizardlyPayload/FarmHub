-- Welchy Performance Addon 1.0.4.2: current nondefault tuning on owned vehicles.
-- These are configured choices, not measured power, acceleration or fuel use.
local MAX_VEHICLES = 150
local MAX_CHANGES = 180

CompanionPages.register({
    key = "welchyPerformanceAddon",
    modNames = { "KM_83271_Welchys_Performance_Addon" },
    collect = function(ctx)
        if ctx.version ~= "1.0.4.2" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmId = ctx.num(ctx.farmId)
        if farmId == nil or farmId < 1 or farmId ~= math.floor(farmId) then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-vehicle-state-only" }
        end
        local tuning = ctx.symbol("RevLimiterTuning")
        if type(tuning) ~= "table" or type(tuning.fields) ~= "table"
            or #tuning.fields ~= 24 then
            return { readState = "settings-only", reason = "tuning-definition-unavailable" }
        end
        local vehicles = ctx.ownedVehicles()
        if type(vehicles) ~= "table" then
            return { readState = "settings-only", reason = "no-owned-vehicle-list" }
        end
        local rows, ids = {}, {}
        local vehicleCount, changedVehicleCount, changedSettingCount = 0, 0, 0
        local invalid, truncated = false, ctx.ownedScanTruncated == true
        local specKey = "spec_" .. ctx.modName .. ".revLimiterFlames"
        for _, vehicle in ipairs(vehicles) do
            local spec = type(vehicle) == "table" and vehicle[specKey] or nil
            if type(spec) == "table" and spec.supported == true
                and ctx.num(ctx.call(vehicle, "getOwnerFarmId") or vehicle.ownerFarmId) == farmId then
                vehicleCount = vehicleCount + 1
                if vehicleCount > MAX_VEHICLES then truncated = true; break end
                local id = vehicle.uniqueId
                if type(id) ~= "string" or id == "" or #id > 80 then
                    invalid = true
                else
                    ids[id] = (ids[id] or 0) + 1
                    if ids[id] > 1 then invalid = true end
                    local changes = {}
                    for _, field in ipairs(tuning.fields) do
                        local key = type(field) == "table" and field.key or nil
                        local value = key ~= nil and ctx.num(spec[key]) or nil
                        local default = type(field) == "table" and ctx.num(field.default) or nil
                        local minimum = type(field) == "table" and ctx.num(field.min) or nil
                        local maximum = type(field) == "table" and ctx.num(field.max) or nil
                        if type(key) ~= "string" or #key > 32 or type(field.label) ~= "string"
                            or value == nil or default == nil or minimum == nil or maximum == nil
                            or value < minimum or value > maximum
                            or (field.integer == true and value ~= math.floor(value)) then
                            invalid = true; break
                        end
                        if math.abs(value - default) > 0.0001 then
                            local labels = type(field.labels) == "table" and field.labels or nil
                            changes[#changes + 1] = {
                                parameter = key, label = ctx.clip(field.label, 64),
                                value = value, default = default,
                                unit = type(field.unit) == "string" and ctx.clip(field.unit, 24) or nil,
                                choice = labels and type(labels[value]) == "string"
                                    and ctx.clip(labels[value], 64) or nil,
                                defaultChoice = labels and type(labels[default]) == "string"
                                    and ctx.clip(labels[default], 64) or nil,
                            }
                        end
                    end
                    if #changes > 0 and not invalid then
                        changedVehicleCount = changedVehicleCount + 1
                        for _, change in ipairs(changes) do
                            changedSettingCount = changedSettingCount + 1
                            if #rows < MAX_CHANGES then
                                rows[#rows + 1] = {
                                    farmId = farmId, vehicleId = id,
                                    vehicle = ctx.clip(ctx.call(vehicle, "getFullName")
                                        or ctx.call(vehicle, "getName") or id, 80),
                                    parameter = change.parameter, label = change.label,
                                    value = change.value, default = change.default,
                                    unit = change.unit, choice = change.choice,
                                    defaultChoice = change.defaultChoice,
                                }
                            else truncated = true end
                        end
                    end
                end
            end
        end
        if invalid then rows = {} end
        table.sort(rows, function(a, b)
            if a.vehicleId ~= b.vehicleId then return a.vehicleId < b.vehicleId end
            return a.parameter < b.parameter
        end)
        local complete = not invalid and not truncated
        return {
            readState = not complete and "partial" or changedSettingCount > 0
                and "ok" or "settings-only",
            reason = invalid and "invalid-tune-state" or truncated and "scan-truncated"
                or changedSettingCount == 0 and "no-nondefault-owned-tune" or nil,
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            byFarm = complete and { [tostring(farmId)] = {
                supportedVehicleCount = vehicleCount,
                changedVehicleCount = changedVehicleCount,
                changedSettingCount = changedSettingCount,
            } } or nil,
            rows = rows,
        }
    end,
})
