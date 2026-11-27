-- A. O. Smith Harvestore 0.5.0.3: queued conveyor stock is already out of
-- native silo storage and has not yet reached a receiving trailer.
-- Read only server state; never tick the conveyor or alter its cargo queue.

local MAX_SCAN = 500
local MAX_ROWS = 60
local MAX_BATCHES = 200
local MAX_LITRES = 100000000

local function bounded(ctx, value, low, high)
    local n = ctx.num(value)
    if n ~= nil and n >= low and n <= high then return n end
    return nil
end

CompanionPages.register({
    key = "harvestoreConveyor",
    modNames = { "KM_83595_Harvestore_Silo_Pack" },
    collect = function(ctx)
        if ctx.version ~= "0.5.0.3" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmId = bounded(ctx, ctx.farmId, 1, 8)
        if farmId == nil or farmId ~= math.floor(farmId) then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-conveyor-state-only" }
        end
        local system = type(ctx.mission) == "table" and ctx.mission.placeableSystem or nil
        local placeables = type(system) == "table" and system.placeables or nil
        if type(placeables) ~= "table" then
            return { readState = "settings-only", reason = "placeables-not-ready" }
        end

        local candidates, seen = {}, {}
        local invalid, truncated, scanned = false, false, 0
        for _, placeable in pairs(placeables) do
            scanned = scanned + 1
            if scanned > MAX_SCAN then truncated = true; break end
            if type(placeable) == "table" and type(placeable.kmConveyorState) == "table"
                and bounded(ctx, ctx.call(placeable, "getOwnerFarmId"), 1, 8) == farmId then
                local state = placeable.kmConveyorState
                if state.enabled == true then
                    local id = placeable.uniqueId or ctx.call(placeable, "getUniqueId")
                    if type(id) ~= "string" or id == "" or #id > 80 or seen[id] then
                        invalid = true
                    else
                        seen[id] = true
                        candidates[#candidates + 1] = { placeable = placeable, state = state, id = id }
                    end
                elseif state.enabled ~= false then
                    invalid = true
                end
            end
        end

        local rows, totalLitres, loadedCount = {}, 0, 0
        for _, candidate in ipairs(candidates) do
            local state, transit = candidate.state, candidate.state.transit
            local total = type(transit) == "table" and bounded(ctx, transit.total, 0, MAX_LITRES) or nil
            local clock = type(transit) == "table" and bounded(ctx, transit.clock, 0, 1e12) or nil
            local delay = type(transit) == "table" and bounded(ctx, transit.delay, 0.1, 1e5) or nil
            local cargo = type(transit) == "table" and transit.cargo or nil
            local valid = state.ready == true and type(state.running) == "boolean"
                and total ~= nil and clock ~= nil and delay ~= nil
                and type(cargo) == "table"
            local batches, summed, nextSeconds = 0, 0, nil
            if valid then
                for _, batch in pairs(cargo) do
                    batches = batches + 1
                    if batches > MAX_BATCHES or type(batch) ~= "table" then valid = false; break end
                    local litres = bounded(ctx, batch.litres, 0, MAX_LITRES)
                    local due = bounded(ctx, batch.due, 0, 1e12)
                    if litres == nil or due == nil then valid = false; break end
                    summed = summed + litres
                    local remaining = math.max(0, due - clock)
                    nextSeconds = nextSeconds == nil and remaining or math.min(nextSeconds, remaining)
                end
                if math.abs(summed - total) > math.max(0.01, total * 0.00001) then
                    valid = false
                end
            end
            local fillType = nil
            if valid and total > 0 then
                local manager = _G.g_fillTypeManager
                fillType = ctx.call(manager, "getFillTypeNameByIndex", state.fillType)
                if type(fillType) ~= "string" or fillType == "" or #fillType > 80 then
                    valid = false
                end
            end
            if not valid then
                invalid = true
            elseif #rows >= MAX_ROWS then
                truncated = true
            else
                local placeable = candidate.placeable
                rows[#rows + 1] = {
                    farmId = farmId, placeableId = candidate.id,
                    silo = ctx.clip(ctx.call(placeable, "getName") or candidate.id, 80),
                    fillType = fillType, inTransitLitres = total,
                    batchCount = batches, nextDeliverySeconds = nextSeconds,
                    running = state.running == true,
                }
                totalLitres = totalLitres + total
                if total > 0 then loadedCount = loadedCount + 1 end
            end
        end
        table.sort(rows, function(a, b) return a.placeableId < b.placeableId end)
        local incomplete = invalid or truncated
        return {
            readState = incomplete and "partial" or #rows > 0 and "ok" or "settings-only",
            reason = invalid and "invalid-or-ambiguous-conveyor" or #rows == 0 and not incomplete
                and "no-owned-enabled-conveyor" or nil,
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            byFarm = not incomplete and { [tostring(farmId)] = {
                conveyorCount = #rows, loadedConveyorCount = loadedCount,
                inTransitLitres = totalLitres,
            } } or nil,
            rows = rows,
        }
    end,
})
