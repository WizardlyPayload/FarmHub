-- Unload Garage 1.0.3.0. The mod removes stored vehicles from the live fleet
-- and keeps their names and storage-time snapshots in placeable save data.
-- Never export the stored vehicleData XML payload or call spawn/store methods.

local MAX_PLACEABLES = 500
local MAX_ENTRIES = 200
local MAX_ROWS = 80

local function integer(value, maximum)
    local n = tonumber(value)
    if n and n == n and n >= 0 and n <= maximum and n == math.floor(n) then return n end
    return nil
end

local function finite(value, maximum)
    local n = tonumber(value)
    if n and n == n and n ~= math.huge and n ~= -math.huge
        and n >= 0 and n <= maximum then return n end
    return nil
end

local function identity(value)
    return type(value) == "string" and value ~= "" and #value <= 80 and value or nil
end

CompanionPages.register({
    key = "unloadGarage",
    modNames = { "KM_77604_Unload_Garage" },
    substrings = {},
    collect = function(ctx)
        if ctx.version ~= "1.0.3.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmId = integer(ctx.farmId, 8)
        if not farmId or farmId == 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-garage-state-only" }
        end
        local system = type(ctx.mission) == "table" and ctx.mission.placeableSystem or nil
        local placeables = type(system) == "table" and system.placeables or nil
        if type(placeables) ~= "table" then
            return { readState = "settings-only", reason = "placeables-not-ready" }
        end

        local specName = "spec_" .. ctx.modName .. ".unloadGarage"
        local candidates, ids = {}, {}
        local invalid, truncated, scanned = false, false, 0
        for _, placeable in pairs(placeables) do
            scanned = scanned + 1
            if scanned > MAX_PLACEABLES then truncated = true; break end
            if type(placeable) == "table" and integer(ctx.call(placeable, "getOwnerFarmId"), 8) == farmId then
                local spec = placeable[specName]
                if type(spec) == "table" then
                    local id = identity(placeable.uniqueId or ctx.call(placeable, "getUniqueId"))
                    if not id then invalid = true
                    else
                        ids[id] = (ids[id] or 0) + 1
                        candidates[#candidates + 1] = { id = id, placeable = placeable, spec = spec }
                    end
                end
            end
        end

        local garages, vehicles, rows = {}, {}, {}
        local storedCount, garageCount, entryScanned = 0, 0, 0
        for _, candidate in ipairs(candidates) do
            if ids[candidate.id] ~= 1 then invalid = true
            else
                local spec = candidate.spec
                local capacity = integer(spec.maxSlots, 200)
                local entries = spec.garageVehicles
                if capacity == nil or type(entries) ~= "table"
                    or (spec.ownerFarmId ~= nil and spec.ownerFarmId ~= 0
                        and integer(spec.ownerFarmId, 8) ~= farmId) then
                    invalid = true
                else
                    garageCount = garageCount + 1
                    local name = ctx.clip(ctx.call(candidate.placeable, "getName") or candidate.id, 80)
                    local entryIds, localCount = {}, 0
                    for _, entry in ipairs(entries) do
                        entryScanned = entryScanned + 1
                        if entryScanned > MAX_ENTRIES then truncated = true; break end
                        local entryId = type(entry) == "table" and integer(entry.id, 1000000) or nil
                        local owner = type(entry) == "table" and integer(entry.farmId, 8) or nil
                        local vehicleName = type(entry) == "table" and identity(entry.vehicleName) or nil
                        local operatingMs = type(entry) == "table"
                            and finite(entry.vehicleOperatingTime, 360000000000) or nil
                        local storedAt = type(entry) == "table" and finite(entry.storedHours, 100000000) or nil
                        if not entryId or entryId == 0 or entryIds[entryId] or owner ~= farmId
                            or not vehicleName or operatingMs == nil or storedAt == nil then
                            invalid = true
                        else
                            entryIds[entryId] = true
                            localCount = localCount + 1
                            storedCount = storedCount + 1
                            if #vehicles < MAX_ROWS then
                                vehicles[#vehicles + 1] = {
                                    farmId = farmId, garageId = candidate.id, entryId = entryId,
                                    garage = name, vehicle = ctx.clip(vehicleName, 80),
                                    operatingHoursAtStorage = operatingMs / 3600000,
                                    storedAtGameHour = storedAt,
                                }
                            else truncated = true end
                        end
                    end
                    if capacity > 0 and localCount > capacity then invalid = true end
                    if #garages < MAX_ROWS then
                        garages[#garages + 1] = {
                            farmId = farmId, garageId = candidate.id, garage = name,
                            storedVehicles = localCount, slots = capacity,
                        }
                    else truncated = true end
                end
            end
        end
        table.sort(garages, function(a, b) return a.garageId < b.garageId end)
        table.sort(vehicles, function(a, b)
            if a.garageId == b.garageId then return a.entryId < b.entryId end
            return a.garageId < b.garageId
        end)
        return {
            readState = invalid and "partial" or garageCount == 0 and not truncated
                and "settings-only" or "ok",
            reason = invalid and "ambiguous-or-unreadable-owned-garage" or garageCount == 0
                and not truncated and "no-owned-garage" or nil,
            coverage = truncated and "truncated" or "complete",
            byFarm = { [tostring(farmId)] = { garageCount = garageCount, storedVehicleCount = storedCount } },
            garages = garages, rows = vehicles,
        }
    end,
})
