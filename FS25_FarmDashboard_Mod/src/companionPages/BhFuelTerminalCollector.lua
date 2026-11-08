-- BH Bulk Fuel Terminal 1.2.0.0: owned terminal controls and lifetime transfer counters.
-- These counters are native litres moved, not purchases or sales.

local MAX_SCAN = 500
local MAX_ROWS = 60

local function integer(value, low, high)
    local n = tonumber(value)
    if n and n == n and n >= low and n <= high and n == math.floor(n) then return n end
    return nil
end

local function nonnegative(value)
    local n = tonumber(value)
    if n and n == n and n ~= math.huge and n >= 0 and n <= 1e12 then return n end
    return nil
end

local function identity(value)
    return type(value) == "string" and value ~= "" and #value <= 80 and value or nil
end

CompanionPages.register({
    key = "bhFuelTerminal",
    modNames = { "FS25_BH_FuelTerminal_V1", "ITCH_5227540_FS25_BH_FuelTerminal_V1" },
    substrings = {},
    collect = function(ctx)
        if ctx.version ~= "1.2.0.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmId = integer(ctx.farmId, 1, 8)
        if not farmId then return { readState = "settings-only", reason = "no-farm" } end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-terminal-state-only" }
        end
        local system = type(ctx.mission) == "table" and ctx.mission.placeableSystem or nil
        local placeables = type(system) == "table" and system.placeables or nil
        if type(placeables) ~= "table" then
            return { readState = "settings-only", reason = "placeables-not-ready" }
        end

        local candidates, ids, scanned = {}, {}, 0
        local invalid, truncated = false, false
        for _, placeable in pairs(placeables) do
            scanned = scanned + 1
            if scanned > MAX_SCAN then truncated = true; break end
            if type(placeable) == "table"
                and integer(ctx.call(placeable, "getOwnerFarmId"), 1, 8) == farmId
                and type(placeable.spec_bhBulkFuelTerminal) == "table" then
                local id = identity(placeable.uniqueId or ctx.call(placeable, "getUniqueId"))
                if id == nil then invalid = true
                else
                    ids[id] = (ids[id] or 0) + 1
                    candidates[#candidates + 1] = { id = id, placeable = placeable,
                        spec = placeable.spec_bhBulkFuelTerminal }
                end
            end
        end

        local rows, loadedTotal, receivedTotal, stoppedCount, esdCount = {}, 0, 0, 0, 0
        for _, candidate in ipairs(candidates) do
            local spec = candidate.spec
            local valid = ids[candidate.id] == 1 and spec.ready == true
                and spec.finalized == true and spec.deleted ~= true
                and type(spec.power) == "boolean" and type(spec.esd) == "boolean"
                and type(spec.tanks) == "table" and #spec.tanks == 6
                and type(spec.bays) == "table" and #spec.bays == 2
            local openTanks, bays, loaded, received = 0, {}, 0, 0
            if valid then
                for i = 1, 6 do
                    local tank = spec.tanks[i]
                    if type(tank) ~= "table" or type(tank.open) ~= "boolean" then
                        valid = false; break
                    end
                    if tank.open then openTanks = openTanks + 1 end
                end
            end
            if valid then
                for i = 1, 2 do
                    local bay = spec.bays[i]
                    local mode = type(bay) == "table" and integer(bay.mode, 0, 3) or nil
                    local out = type(bay) == "table" and nonnegative(bay.loaded) or nil
                    local incoming = type(bay) == "table" and nonnegative(bay.received) or nil
                    if mode == nil or out == nil or incoming == nil then
                        valid = false; break
                    end
                    bays[i] = { mode = mode, loadedLiters = out, receivedLiters = incoming }
                    loaded, received = loaded + out, received + incoming
                end
            end
            if not valid or loaded > 1e12 or received > 1e12 then
                invalid = true
            elseif #rows < MAX_ROWS then
                rows[#rows + 1] = {
                    farmId = farmId, terminalId = candidate.id,
                    terminal = ctx.clip(ctx.call(candidate.placeable, "getName") or candidate.id, 80),
                    power = spec.power, esd = spec.esd, openTanks = openTanks,
                    bays = bays, loadedLiters = loaded, receivedLiters = received,
                }
                loadedTotal, receivedTotal = loadedTotal + loaded, receivedTotal + received
                if not spec.power then stoppedCount = stoppedCount + 1 end
                if spec.esd then esdCount = esdCount + 1 end
            else truncated = true end
        end
        if #candidates == 0 and not invalid and not truncated then
            return { readState = "settings-only", reason = "no-owned-terminal" }
        end
        table.sort(rows, function(a, b) return a.terminalId < b.terminalId end)
        return {
            readState = invalid and "partial" or "ok",
            reason = invalid and "ambiguous-or-unreadable-owned-terminal" or nil,
            coverage = truncated and "truncated" or "complete",
            byFarm = { [tostring(farmId)] = {
                terminalCount = #rows, loadedLiters = loadedTotal,
                receivedLiters = receivedTotal, stoppedCount = stoppedCount, esdCount = esdCount,
            } },
            rows = rows,
        }
    end,
})
