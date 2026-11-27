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
        -- Use the reviewed mod's read-only mode getter. Its production-menu
        -- labels use this same function, including its STORE fallback.
        if type(psm.getExtendedMode) ~= "function"
            or type(psm.MODE_STORE) ~= "number"
            or type(psm.MODE_SPAWN) ~= "number"
            or type(psm.MODE_SELL) ~= "number"
            or type(psm.MODE_DISTRIBUTE) ~= "number" then
            return { readState = "settings-only", reason = "pallet-spawn-modes-unavailable" }
        end
        local modeNames = {
            [psm.MODE_STORE] = "store", [psm.MODE_SPAWN] = "spawn",
            [psm.MODE_SELL] = "sell", [psm.MODE_DISTRIBUTE] = "distribute",
        }
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
        local invalidReasons = {}
        local function markInvalid(reason)
            invalid = true
            invalidReasons[reason] = (invalidReasons[reason] or 0) + 1
        end
        for _, point in pairs(points) do
            scanned = scanned + 1
            if scanned > MAX_POINTS then truncated = true; break end
            if type(point) == "table" then
                local placeable = type(point.owningPlaceable) == "table" and point.owningPlaceable or nil
                local owner = placeable and (ctx.call(placeable, "getOwnerFarmId")
                    or placeable.ownerFarmId) or nil
                -- The farm list may include accessible points. Verify the
                -- owning placeable even though the point also has ownerFarmId.
                local ownerId = ctx.num(owner)
                if ownerId == nil then
                    markInvalid("owner-unavailable")
                elseif ownerId == farmId then
                    local id = placeable and placeable.uniqueId or nil
                    if type(id) ~= "string" or id == ""
                        or #id > 80 or seen[id] then
                        markInvalid("placeable-id")
                        if type(id) == "string" then seen[id] = (seen[id] or 0) + 1 end
                    else
                        seen[id] = 1
                        -- The keyed set is authoritative for supported output
                        -- types. Sort its keys for stable rows.
                        local outputs = point.outputFillTypeIds
                        if type(outputs) ~= "table" then
                            markInvalid("output-set-unavailable")
                        else
                            local outputIds = {}
                            for rawFillId, supported in pairs(outputs) do
                                local fillId = positiveId(rawFillId)
                                if fillId == nil or supported ~= true then
                                    markInvalid("output-set-entry")
                                else
                                    outputIds[#outputIds + 1] = fillId
                                end
                            end
                            table.sort(outputIds)
                            if #outputIds > MAX_OUTPUTS then truncated = true end
                            for i = 1, math.min(#outputIds, MAX_OUTPUTS) do
                                local fillId = outputIds[i]
                                local name = ctx.call(fillTypes,
                                    "getFillTypeNameByIndex", fillId)
                                local fill = ctx.call(fillTypes,
                                    "getFillTypeByIndex", fillId)
                                name = name or (type(fill) == "table" and fill.name or nil)
                                local title = type(fill) == "table" and fill.title or nil
                                local ok, code = pcall(psm.getExtendedMode, point, fillId)
                                local mode = ok and modeNames[code] or nil
                                if type(name) ~= "string" or name == ""
                                    or #name > 80 then
                                    markInvalid("fill-name")
                                elseif mode == nil then
                                    markInvalid("output-mode")
                                else
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
            else
                markInvalid("point-unavailable")
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
            invalidReasons = invalid and invalidReasons or nil,
            byFarm = complete and { [tostring(farmId)] = {
                outputCount = count, storeCount = noPallets, spawnCount = withPallets,
            } } or nil,
            rows = rows,
        }
    end,
})
