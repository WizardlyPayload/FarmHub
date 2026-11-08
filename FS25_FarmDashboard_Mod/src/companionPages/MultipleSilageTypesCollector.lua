-- Multiple Silage Types 1.0.0.1. Report owned equipment choices and recorded
-- closed-bunker composition only. Closed amounts are cleared at drain start;
-- they are not a current inventory or a measured harvest yield.

local MAX_VEHICLES = 80
local MAX_BUNKERS = 60
local MAX_TYPES = 16
local MAX_ROWS = 80

local function valid(value, maximum)
    local n = tonumber(value)
    if n and n == n and n >= 0 and n <= maximum then return n end
    return nil
end

local function identity(value)
    if type(value) == "string" and value ~= "" and #value <= 80 then return value end
    return nil
end

CompanionPages.register({
    key = "multipleSilageTypes",
    modNames = { "FS25_354139_Multiple_Silage_Types" },
    substrings = {},
    collect = function(ctx)
        if ctx.version ~= "1.0.0.1" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmId = valid(ctx.farmId, 8)
        if farmId == nil or farmId < 1 or farmId ~= math.floor(farmId) then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-state-only" }
        end
        local mst = _G.MultipleSilageTypes
        local silageTypes = type(mst) == "table" and mst.silageTypes or nil
        if type(silageTypes) ~= "table" or #silageTypes == 0 then
            return { readState = "settings-only", reason = "silage-types-not-ready" }
        end
        local vehicles = ctx.ownedVehicles()
        local system = type(ctx.mission) == "table" and ctx.mission.placeableSystem or nil
        local bunkers = type(system) == "table" and system.bunkerSilos or nil
        if type(vehicles) ~= "table" or type(bunkers) ~= "table" then
            return { readState = "settings-only", reason = "owned-objects-not-ready" }
        end

        local types, known, typesValid = {}, {}, true
        local invalid, truncated = false, ctx.ownedScanTruncated == true
        if #silageTypes > MAX_TYPES then
            return { readState = "settings-only", reason = "too-many-silage-types" }
        end
        for _, st in ipairs(silageTypes) do
            local name = type(st) == "table" and identity(st.name) or nil
            if name == nil or known[name] then invalid = true; typesValid = false
            else types[#types + 1] = name; known[name] = true end
        end
        local candidates, ids = {}, {}
        local scanned = 0
        for _, vehicle in ipairs(vehicles) do
            scanned = scanned + 1
            if scanned > MAX_VEHICLES then truncated = true; break end
            if type(vehicle) == "table" and valid(ctx.call(vehicle, "getOwnerFarmId"), 8) == farmId then
                local isWagon = type(vehicle.spec_forageWagon) == "table"
                local isBaler = type(vehicle.spec_baler) == "table"
                    and vehicle.spec_balerStationary == nil and not isWagon
                if isWagon or isBaler then
                    local mode = vehicle._mst_chopMode
                    local original = isWagon and valid(vehicle._mst_originalCapacity, 1000000000) or nil
                    local compressed = isWagon and valid(vehicle._mst_compressionCapacity, 1000000000) or nil
                    if type(mode) ~= "boolean" then invalid = true
                    elseif vehicle._mst_compressionCapacity ~= nil and (original == nil
                        or compressed == nil or compressed <= original) then invalid = true
                    elseif mode or compressed ~= nil then
                        local id = identity(vehicle.uniqueId)
                        if id == nil then invalid = true
                        else
                            ids[id] = (ids[id] or 0) + 1
                            candidates[#candidates + 1] = {
                                id = id, vehicle = vehicle, kind = isWagon and "forageWagon" or "baler",
                                chopMode = mode, original = original, compressed = compressed,
                            }
                        end
                    end
                end
            end
        end
        local vehicleRows = {}
        for _, candidate in ipairs(candidates) do
            if ids[candidate.id] ~= 1 then invalid = true
            elseif #vehicleRows < MAX_ROWS then
                vehicleRows[#vehicleRows + 1] = {
                    farmId = farmId, vehicleId = candidate.id,
                    vehicle = ctx.clip(ctx.call(candidate.vehicle, "getFullName")
                        or ctx.call(candidate.vehicle, "getName"), 80),
                    kind = candidate.kind, chopMode = candidate.chopMode,
                    originalCapacityLitres = candidate.original,
                    compressionCapacityLitres = candidate.compressed,
                }
            else truncated = true end
        end

        local bunkerCandidates, bunkerIds = {}, {}
        local closed = type(_G.BunkerSilo) == "table" and _G.BunkerSilo.STATE_CLOSED or nil
        local fermented = type(_G.BunkerSilo) == "table" and _G.BunkerSilo.STATE_FERMENTED or nil
        if closed == nil or fermented == nil then invalid = true end
        scanned = 0
        for _, placeable in ipairs(bunkers) do
            scanned = scanned + 1
            if scanned > MAX_BUNKERS then truncated = true; break end
            if type(placeable) == "table" and valid(ctx.call(placeable, "getOwnerFarmId"), 8) == farmId then
                local spec = placeable.spec_bunkerSilo
                local bunker = type(spec) == "table" and spec.bunkerSilo or nil
                local amounts = type(bunker) == "table" and bunker._mst_closedAmounts or nil
                if type(amounts) == "table" and typesValid then
                    local total, mix, good = 0, {}, true
                    for _, name in ipairs(types) do
                        local raw = amounts[name]
                        local amount = valid(raw == nil and 0 or raw, 1000000000)
                        if amount == nil then good = false; break end
                        if amount > 0 then
                            mix[#mix + 1] = { type = ctx.clip(name, 80), recordedLitres = amount }
                            total = total + amount
                        end
                    end
                    if not good then invalid = true
                    elseif total > 0 then
                        if bunker.state ~= closed and bunker.state ~= fermented then invalid = true
                        else
                            local id = identity(placeable.uniqueId)
                            if id == nil then invalid = true
                            else
                                bunkerIds[id] = (bunkerIds[id] or 0) + 1
                                bunkerCandidates[#bunkerCandidates + 1] = {
                                    id = id, placeable = placeable, mix = mix, total = total,
                                    state = bunker.state == closed and "closed" or "fermented",
                                }
                            end
                        end
                    end
                end
            end
        end
        local bunkerRows = {}
        for _, candidate in ipairs(bunkerCandidates) do
            if bunkerIds[candidate.id] ~= 1 then invalid = true
            elseif #bunkerRows < MAX_ROWS then
                bunkerRows[#bunkerRows + 1] = {
                    farmId = farmId, bunkerId = candidate.id,
                    bunker = ctx.clip(ctx.call(candidate.placeable, "getName") or candidate.id, 80),
                    state = candidate.state, recordedTotalLitres = candidate.total,
                    mix = candidate.mix,
                }
            else truncated = true end
        end
        if #vehicleRows == 0 and #bunkerRows == 0 and not invalid and not truncated then
            return { readState = "settings-only", reason = "no-selected-mode-or-closed-mix" }
        end
        table.sort(vehicleRows, function(a, b) return a.vehicleId < b.vehicleId end)
        table.sort(bunkerRows, function(a, b) return a.bunkerId < b.bunkerId end)
        return {
            readState = invalid and "partial" or "ok",
            reason = invalid and "unreadable-or-ambiguous-state" or nil,
            coverage = truncated and "truncated" or "complete",
            byFarm = { [tostring(farmId)] = {
                configuredVehicleCount = #vehicleRows, recordedBunkerCount = #bunkerRows,
            } },
            vehicles = vehicleRows, bunkers = bunkerRows,
        }
    end,
})
