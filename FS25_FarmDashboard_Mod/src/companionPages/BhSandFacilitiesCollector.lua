-- BH Sand Facilities 1.0.0.0: owned silo inventory/cycle and yard power.
-- The yard is an unlimited paid buying source, not stored sand or a sales record.

local MAX_SCAN = 500
local MAX_ROWS = 80

local function integer(value, low, high)
    local n = tonumber(value)
    if n and n == n and n >= low and n <= high and n == math.floor(n) then return n end
    return nil
end

local function finite(value, low, high)
    local n = tonumber(value)
    if n and n == n and n ~= math.huge and n ~= -math.huge
        and n >= low and n <= high then return n end
    return nil
end

local function identity(value)
    return type(value) == "string" and value ~= "" and #value <= 80 and value or nil
end

CompanionPages.register({
    key = "bhSandFacilities",
    modNames = { "FS25_BH_SandFacilities", "ITCH_5226982_FS25_BH_SandFacilities" },
    substrings = {},
    collect = function(ctx)
        if ctx.version ~= "1.0.0.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmId = integer(ctx.farmId, 1, 8)
        if not farmId then return { readState = "settings-only", reason = "no-farm" } end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-sand-state-only" }
        end
        local system = type(ctx.mission) == "table" and ctx.mission.placeableSystem or nil
        local placeables = type(system) == "table" and system.placeables or nil
        if type(placeables) ~= "table" then
            return { readState = "settings-only", reason = "placeables-not-ready" }
        end
        local siloKey = "spec_" .. ctx.modName .. ".bhSandSystem"
        local yardKey = "spec_" .. ctx.modName .. ".bhSandYard"
        local candidates, ids, scanned = {}, {}, 0
        local invalid, truncated = false, false
        for _, placeable in pairs(placeables) do
            scanned = scanned + 1
            if scanned > MAX_SCAN then truncated = true; break end
            if type(placeable) == "table"
                and integer(ctx.call(placeable, "getOwnerFarmId"), 1, 8) == farmId then
                local siloSpec, yardSpec = placeable[siloKey], placeable[yardKey]
                if type(siloSpec) == "table" or type(yardSpec) == "table" then
                    local id = identity(placeable.uniqueId or ctx.call(placeable, "getUniqueId"))
                    if id == nil then invalid = true
                    else
                        ids[id] = (ids[id] or 0) + 1
                        candidates[#candidates + 1] = { id = id, placeable = placeable,
                            siloSpec = siloSpec, yardSpec = yardSpec }
                    end
                end
            end
        end

        local silos, yards, sandTotal, runningCount = {}, {}, 0, 0
        for _, candidate in ipairs(candidates) do
            local placeable = candidate.placeable
            local name = ctx.clip(ctx.call(placeable, "getName") or candidate.id, 80)
            local spec, yard = candidate.siloSpec, candidate.yardSpec
            if ids[candidate.id] ~= 1 or (type(spec) == "table" and type(yard) == "table") then
                invalid = true
            elseif type(spec) == "table" then
                local storage = spec.storage
                local fillType = integer(spec.fillType, 1, 65535)
                local level = type(storage) == "table" and fillType
                    and finite(ctx.call(storage, "getFillLevel", fillType), 0, 1e12) or nil
                local capacity = type(storage) == "table" and fillType
                    and finite(ctx.call(storage, "getCapacity", fillType), 0.001, 1e12) or nil
                local holdMs = finite(spec.usageHoldRemainingMs, 0, 1e9)
                local tickMs = finite(spec.usageTickElapsedMs, 0, 1e9)
                local rate = finite(spec.usageLitersPerMs, 0, 1e6)
                if spec.placed ~= true or spec.deleted == true
                    or type(spec.running) ~= "boolean" or type(spec.usageEnabled) ~= "boolean"
                    or type(spec.usageArmed) ~= "boolean" or level == nil or capacity == nil
                    or level > capacity + 0.001 or holdMs == nil or tickMs == nil or rate == nil then
                    invalid = true
                elseif #silos < MAX_ROWS then
                    silos[#silos + 1] = {
                        farmId = farmId, placeableId = candidate.id, name = name,
                        running = spec.running, sandLiters = level, capacityLiters = capacity,
                        usageEnabled = spec.usageEnabled, usageArmed = spec.usageArmed,
                        holdRemainingSeconds = holdMs / 1000,
                        tickElapsedSeconds = tickMs / 1000,
                        configuredUseLitersPerRunningHour = rate * 3600000,
                    }
                    sandTotal = sandTotal + level
                    if spec.running then runningCount = runningCount + 1 end
                else truncated = true end
            elseif type(yard) == "table" then
                local cutoff = finite(yard.stopFillRatio, 0.01, 1)
                if yard.placed ~= true or yard.deleted == true
                    or type(yard.running) ~= "boolean" or type(yard.station) ~= "table"
                    or integer(yard.fillType, 1, 65535) == nil or cutoff == nil then
                    invalid = true
                elseif #yards < MAX_ROWS then
                    yards[#yards + 1] = {
                        farmId = farmId, placeableId = candidate.id, name = name,
                        running = yard.running, truckFillCutoffRatio = cutoff,
                    }
                    if yard.running then runningCount = runningCount + 1 end
                else truncated = true end
            end
        end
        if #candidates == 0 and not invalid and not truncated then
            return { readState = "settings-only", reason = "no-owned-sand-facility" }
        end
        table.sort(silos, function(a, b) return a.placeableId < b.placeableId end)
        table.sort(yards, function(a, b) return a.placeableId < b.placeableId end)
        return {
            readState = invalid and "partial" or "ok",
            reason = invalid and "ambiguous-or-unreadable-owned-sand-facility" or nil,
            coverage = truncated and "truncated" or "complete",
            byFarm = { [tostring(farmId)] = {
                siloCount = #silos, yardCount = #yards,
                runningCount = runningCount, sandLiters = sandTotal,
            } },
            silos = silos, yards = yards,
        }
    end,
})
