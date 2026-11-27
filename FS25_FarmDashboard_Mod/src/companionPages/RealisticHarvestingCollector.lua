-- Realistic Harvesting v1.6.0.0: per-combine tuning memory, not harvested output.
-- The mod's live rate fields can retain values after a cutter stops; omit them.

local MAX_ROWS = 60
local MACHINE_TYPES = { grain = true, forage = true, cotton = true,
    root = true, grape = true, olive = true }
local PARAMS = { "fan", "upperSieve", "lowerSieve", "rotor", "feeder" }

CompanionPages.register({
    key = "realisticHarvesting",
    modNames = { "FS25_RealisticHarvesting", "KM_73932_realistic-harvesting" },
    substrings = { "realisticharvesting", "realistic_harvesting" },
    collect = function(ctx)
        if ctx.version ~= "1.6.0.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmId = ctx.num(ctx.farmId)
        if farmId == nil or farmId < 1 or farmId ~= math.floor(farmId) then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-combine-state-only" }
        end
        local vehicles = ctx.ownedVehicles()
        if type(vehicles) ~= "table" then
            return { readState = "settings-only", reason = "no-owned-vehicle-list" }
        end

        local rows, ids = {}, {}
        local count, calibrated, automatic = 0, 0, 0
        local invalid, truncated = false, ctx.ownedScanTruncated == true
        for _, vehicle in ipairs(vehicles) do
            if type(vehicle) == "table" then
                local owner = ctx.num(ctx.call(vehicle, "getOwnerFarmId") or vehicle.ownerFarmId)
                local spec = vehicle.spec_rhm_Combine
                if owner == farmId and type(spec) == "table" then
                    local id = vehicle.uniqueId
                    local mem = spec.combineMemory
                    local settings = type(mem) == "table" and mem.currentSettings or nil
                    local package = ctx.num(spec.packageLevel)
                    if type(id) ~= "string" or id == "" or #id > 80
                        or type(mem) ~= "table" or type(settings) ~= "table"
                        or not MACHINE_TYPES[spec.machineType]
                        or package == nil or package < 1 or package > 4 or package ~= math.floor(package)
                        or (mem.mode ~= "AUTO" and mem.mode ~= "MANUAL")
                        or type(mem.autoSwitchEnabled) ~= "boolean"
                        or type(mem.isCalibrated) ~= "boolean"
                        or (mem.currentCrop ~= nil and (type(mem.currentCrop) ~= "string" or #mem.currentCrop > 80)) then
                        invalid = true
                    else
                        ids[id] = (ids[id] or 0) + 1
                        if ids[id] > 1 then invalid = true end
                        local params, valid = {}, true
                        for _, name in ipairs(PARAMS) do
                            if settings[name] ~= nil then
                                local value = ctx.num(settings[name])
                                if value == nil or value < 0 or value > 100 then valid = false
                                else params[name] = value end
                            end
                        end
                        local target = ctx.num(settings.targetEngineLoad)
                        if target == nil or target < 70 or target > 110 then valid = false end
                        if not valid then invalid = true
                        else
                            count = count + 1
                            if mem.isCalibrated then calibrated = calibrated + 1 end
                            if mem.mode == "AUTO" then automatic = automatic + 1 end
                            if #rows < MAX_ROWS then
                                rows[#rows + 1] = {
                                    farmId = farmId, vehicleId = id,
                                    vehicle = ctx.clip(ctx.call(vehicle, "getFullName")
                                        or ctx.call(vehicle, "getName"), 80),
                                    machineType = spec.machineType, packageLevel = package,
                                    mode = mem.mode, autoSwitch = mem.autoSwitchEnabled,
                                    tuningCrop = ctx.clip(mem.currentCrop, 80),
                                    calibrated = mem.isCalibrated,
                                    fan = params.fan, upperSieve = params.upperSieve,
                                    lowerSieve = params.lowerSieve, rotor = params.rotor,
                                    feeder = params.feeder, targetEngineLoad = target,
                                }
                            else
                                truncated = true
                            end
                        end
                    end
                end
            end
        end
        if invalid then
            local uniqueRows = {}
            for _, row in ipairs(rows) do
                if ids[row.vehicleId] == 1 then uniqueRows[#uniqueRows + 1] = row end
            end
            rows = uniqueRows
        end
        table.sort(rows, function(a, b) return a.vehicleId < b.vehicleId end)
        local incomplete = invalid or truncated
        return {
            readState = incomplete and "partial" or count > 0 and "ok" or "settings-only",
            reason = invalid and "invalid-combine-memory" or count == 0 and not incomplete and "no-owned-combine-memory" or nil,
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            byFarm = { [tostring(farmId)] = {
                combineCount = not incomplete and count or nil,
                calibratedCount = not incomplete and calibrated or nil,
                autoCount = not incomplete and automatic or nil,
            } },
            rows = rows,
        }
    end,
})
