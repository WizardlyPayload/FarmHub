-- Pallet Spawn Store v1.0.0.0: current output routing on owned production points.
-- Its live disabled map distinguishes native KEEP with pallets from KEEP without.
local MAX_POINTS = 60
local MAX_OUTPUTS = 24
local MAX_ROWS = 120

local function positiveId(value)
    local n = tonumber(value)
    if n and n == n and n > 0 and n <= 65535 and n == math.floor(n) then
        return n
    end
    return nil
end

CompanionPages.register({
    key = "palletSpawnStore",
    modNames = { "FS25_PalletSpawnStore", "FS25_352670_Pallet_Spawn_Store" },
    substrings = { "palletspawnstore", "pallet_spawn_store" },
    collect = function(ctx)
        if ctx.version ~= "1.0.0.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmId = positiveId(ctx.farmId)
        if not farmId then
            return { readState = "settings-only", reason = "no-farm" }
        end
        local mission = ctx.mission
        if ctx.call(mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-production-state-only" }
        end
        local psm = ctx.symbol("PalletSpawnMode")
        if type(psm) ~= "table" or psm.psmHasLoaded ~= true then
            return { readState = "settings-only", reason = "pallet-spawn-state-not-loaded" }
        end
        local productionPoint = ctx.global("ProductionPoint")
        local modes = type(productionPoint) == "table" and productionPoint.OUTPUT_MODE or nil
        if type(modes) ~= "table" or modes.KEEP == nil
            or modes.DIRECT_SELL == nil or modes.AUTO_DELIVER == nil then
            return { readState = "settings-only", reason = "production-modes-unavailable" }
        end
        local manager = type(mission) == "table" and mission.productionChainManager or nil
        local points = ctx.call(manager, "getProductionPointsForFarmId", farmId)
        if type(points) ~= "table" then
            return { readState = "settings-only", reason = "no-production-list" }
        end
        local fillTypes = ctx.global("g_fillTypeManager")
        if type(fillTypes) ~= "table" then
            return { readState = "settings-only", reason = "fill-types-unavailable" }
        end

        local rows, seen = {}, {}
        local scanned, count, noPallets, withPallets = 0, 0, 0, 0
        local invalid, truncated = false, false
        for _, point in pairs(points) do
            scanned = scanned + 1
            if scanned > MAX_POINTS then truncated = true; break end
            if type(point) == "table" and ctx.num(point.ownerFarmId) == farmId then
                local placeable = type(point.owningPlaceable) == "table" and point.owningPlaceable or nil
                local owner = placeable and (ctx.call(placeable, "getOwnerFarmId")
                    or placeable.ownerFarmId) or nil
                local id = placeable and placeable.uniqueId or nil
                if ctx.num(owner) ~= farmId or type(id) ~= "string" or id == ""
                    or #id > 80 or seen[id] then
                    invalid = true
                    if type(id) == "string" then seen[id] = (seen[id] or 0) + 1 end
                else
                    seen[id] = 1
                    local outputs = point.outputFillTypeIds
                    if type(outputs) ~= "table" then
                        invalid = true
                    else
                        local outputCount = 0
                        local seenFill = {}
                        for _, rawFillId in ipairs(outputs) do
                            outputCount = outputCount + 1
                            if outputCount > MAX_OUTPUTS then truncated = true; break end
                            local fillId = positiveId(rawFillId)
                            local name = fillId and ctx.call(fillTypes,
                                "getFillTypeNameByIndex", fillId) or nil
                            local fill = fillId and ctx.call(fillTypes,
                                "getFillTypeByIndex", fillId) or nil
                            local title = type(fill) == "table" and fill.title or nil
                            local base = fillId and ctx.call(point,
                                "getOutputDistributionMode", fillId) or nil
                            local disabled = fillId and type(point.psm_spawnDisabled) == "table"
                                and point.psm_spawnDisabled[fillId] or nil
                            local mode = base == modes.KEEP and
                                (disabled == true and "store" or "spawn")
                                or base == modes.DIRECT_SELL and "sell"
                                or base == modes.AUTO_DELIVER and "distribute" or nil
                            if not fillId or seenFill[fillId] or type(name) ~= "string"
                                or name == "" or #name > 80 or mode == nil
                                or (disabled ~= nil and type(disabled) ~= "boolean") then
                                invalid = true
                            else
                                seenFill[fillId] = true
                                count = count + 1
                                if mode == "store" then noPallets = noPallets + 1 end
                                if mode == "spawn" then withPallets = withPallets + 1 end
                                if #rows < MAX_ROWS then
                                    rows[#rows + 1] = {
                                        farmId = farmId, placeableId = id,
                                        production = ctx.clip(ctx.call(point, "getName")
                                            or ctx.call(placeable, "getName") or id, 80),
                                        fillType = name, fillTitle = ctx.clip(title, 80),
                                        mode = mode,
                                    }
                                else
                                    truncated = true
                                end
                            end
                        end
                    end
                end
            end
        end
        if invalid then
            local unique = {}
            for _, row in ipairs(rows) do
                if seen[row.placeableId] == 1 then unique[#unique + 1] = row end
            end
            rows = unique
        end
        table.sort(rows, function(a, b)
            if a.placeableId ~= b.placeableId then return a.placeableId < b.placeableId end
            return a.fillType < b.fillType
        end)
        local complete = not invalid and not truncated
        return {
            readState = not complete and "partial" or count == 0
                and "settings-only" or "ok",
            reason = invalid and "invalid-owned-output"
                or truncated and "scan-truncated"
                or count == 0 and "no-owned-output" or nil,
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            byFarm = complete and { [tostring(farmId)] = {
                outputCount = count, storeCount = noPallets, spawnCount = withPallets,
            } } or nil,
            rows = rows,
        }
    end,
})
