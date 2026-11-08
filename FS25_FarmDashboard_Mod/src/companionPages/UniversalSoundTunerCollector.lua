-- Universal Sound Tuner 1.0.0.0: current nondefault settings on owned vehicles.
-- Presets, local drag slips and performance measurements are outside this farm reading.
local MAX_VEHICLES = 150
local MAX_CHANGES = 180

CompanionPages.register({
    key = "universalSoundTuner",
    modNames = { "KM_83598_Universal_Sound_Tuner", "FS25_UniversalSoundTuner" },
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
        local tuner = ctx.symbol("HSST")
        if type(tuner) ~= "table" or tuner.MOD_NAME ~= ctx.modName
            or type(tuner.PARAM_ORDER) ~= "table" or type(tuner.PARAMS) ~= "table"
            or #tuner.PARAM_ORDER ~= 45 then
            return { readState = "settings-only", reason = "tuner-definition-unavailable" }
        end
        local vehicles = ctx.ownedVehicles()
        if type(vehicles) ~= "table" then
            return { readState = "settings-only", reason = "no-owned-vehicle-list" }
        end
        local rows, ids = {}, {}
        local vehicleCount, changedVehicleCount, changedSettingCount = 0, 0, 0
        local invalid, truncated = false, ctx.ownedScanTruncated == true
        for _, vehicle in ipairs(vehicles) do
            if type(vehicle) == "table" and type(vehicle.hsST) == "table"
                and ctx.num(ctx.call(vehicle, "getOwnerFarmId") or vehicle.ownerFarmId) == farmId then
                vehicleCount = vehicleCount + 1
                if vehicleCount > MAX_VEHICLES then truncated = true; break end
                local id, tune = vehicle.uniqueId, vehicle.hsST.tune
                if type(id) ~= "string" or id == "" or #id > 80 or type(tune) ~= "table" then
                    invalid = true
                else
                    ids[id] = (ids[id] or 0) + 1
                    if ids[id] > 1 then invalid = true end
                    local changes = {}
                    for _, paramId in ipairs(tuner.PARAM_ORDER) do
                        local def = tuner.PARAMS[paramId]
                        local value = ctx.num(tune[paramId])
                        local default = type(def) == "table" and ctx.num(def.def) or nil
                        local minimum = type(def) == "table" and ctx.num(def.min) or nil
                        local maximum = type(def) == "table" and ctx.num(def.max) or nil
                        local kind = type(def) == "table" and def.kind or nil
                        local valid = type(paramId) == "string" and #paramId <= 32
                            and value ~= nil and default ~= nil
                            and (kind == "float" and minimum ~= nil and maximum ~= nil
                                and value >= minimum and value <= maximum
                                or kind == "choice" and type(def.choices) == "table"
                                and value == math.floor(value) and value >= 0
                                and value < #def.choices)
                        if not valid then invalid = true; break end
                        if math.abs(value - default) > 0.0001 then
                            changes[#changes + 1] = { parameter = paramId,
                                value = value, default = default, kind = kind,
                                choice = kind == "choice" and ctx.clip(def.choices[value + 1], 40) or nil,
                                defaultChoice = kind == "choice" and ctx.clip(def.choices[default + 1], 40) or nil }
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
                                    parameter = change.parameter, value = change.value,
                                    default = change.default, kind = change.kind,
                                    choice = change.choice, defaultChoice = change.defaultChoice,
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
