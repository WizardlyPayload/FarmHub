-- Hand Plant Saplings 1.0.0.0. Read current sapling pieces from owned
-- placeable storage and its linked shovel backpacks. Do not call setters,
-- storage helpers, or methods that move saplings.

local MAX_PLACEABLES = 300
local MAX_AREAS = 12
local MAX_TREE_KEYS = 80
local MAX_ROWS = 120

local function integer(value, maximum)
    local n = tonumber(value)
    if n and n == n and n >= 0 and n <= maximum and n == math.floor(n) then
        return n
    end
    return nil
end

local function identity(value)
    if type(value) == "string" and value ~= "" and #value <= 80 then
        return value
    end
    return nil
end

CompanionPages.register({
    key = "handPlantSaplings",
    modNames = { "KM_71329_Hand_Plant_Saplings" },
    substrings = {},
    collect = function(ctx)
        if ctx.version ~= "1.0.0.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmId = integer(ctx.farmId, 8)
        if not farmId or farmId == 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-state-only" }
        end
        local manager = _G.g_handPlantSaplingsManager
        local treeTypes = type(manager) == "table" and manager.treeTypes or nil
        local system = type(ctx.mission) == "table" and ctx.mission.placeableSystem or nil
        local placeables = type(system) == "table" and system.placeables or nil
        if type(treeTypes) ~= "table" or type(placeables) ~= "table" then
            return { readState = "settings-only", reason = "sapling-state-not-ready" }
        end

        local specName = "spec_" .. ctx.modName .. ".handPlantSaplings"
        local candidates, ids = {}, {}
        local invalid, truncated = false, false
        local scanned = 0
        for _, placeable in ipairs(placeables) do
            scanned = scanned + 1
            if scanned > MAX_PLACEABLES then truncated = true; break end
            if type(placeable) == "table"
                and integer(ctx.call(placeable, "getOwnerFarmId"), 8) == farmId then
                local spec = placeable[specName] or placeable.spec_handPlantSaplings
                if type(spec) == "table" and spec.isValid == true then
                    local id = identity(placeable.uniqueId or ctx.call(placeable, "getUniqueId"))
                    if not id then invalid = true
                    else
                        ids[id] = (ids[id] or 0) + 1
                        candidates[#candidates + 1] = { id = id, placeable = placeable, spec = spec }
                    end
                end
            end
        end

        local rows, rackCount, backpackCount, totalPieces = {}, 0, 0, 0
        local function readArea(candidate, area, kind, index)
            if type(area) ~= "table" then return end
            if integer(ctx.call(area, "getOwnerFarmId"), 8) ~= farmId then
                invalid = true
                return
            end
            local capacity = integer(area.capacity, 100000)
            local levels = area.fillLevels
            if not capacity or type(levels) ~= "table" then
                invalid = true
                return
            end
            local areaRows, used, keys = {}, 0, 0
            for treeKey, raw in pairs(levels) do
                keys = keys + 1
                if keys > MAX_TREE_KEYS then truncated = true; return end
                local count = integer(raw, capacity)
                local info = type(treeKey) == "string" and treeTypes[treeKey] or nil
                if not count or (count > 0 and type(info) ~= "table") then
                    invalid = true
                    return
                end
                used = used + count
                if count > 0 then
                    local title = identity(info.title) or identity(info.name)
                    local name = identity(info.name)
                    local variation = identity(info.variationName)
                    if not title or not name or not variation then
                        invalid = true
                        return
                    end
                    areaRows[#areaRows + 1] = {
                        farmId = farmId, placeableId = candidate.id,
                        placeable = ctx.clip(ctx.call(candidate.placeable, "getName") or candidate.id, 80),
                        area = kind, backpackIndex = index, treeKey = treeKey,
                        tree = ctx.clip(title, 80), treeType = ctx.clip(name, 80),
                        variation = ctx.clip(variation, 80), pieces = count,
                        areaCapacityPieces = capacity,
                    }
                end
            end
            if used > capacity then invalid = true; return end
            if used > 0 then
                if kind == "rack" then rackCount = rackCount + 1
                else backpackCount = backpackCount + 1 end
                totalPieces = totalPieces + used
                for _, row in ipairs(areaRows) do
                    if #rows < MAX_ROWS then rows[#rows + 1] = row
                    else truncated = true end
                end
            end
        end

        for _, candidate in ipairs(candidates) do
            if ids[candidate.id] ~= 1 then invalid = true
            else
                readArea(candidate, candidate.spec.storage, "rack", nil)
                local backpacks = candidate.spec.backpacks
                if type(backpacks) == "table" then
                    if #backpacks > MAX_AREAS then truncated = true end
                    for index = 1, math.min(#backpacks, MAX_AREAS) do
                        readArea(candidate, backpacks[index], "backpack", index)
                    end
                elseif backpacks ~= nil then invalid = true end
            end
        end
        if #rows == 0 and not invalid and not truncated then
            return { readState = "settings-only", reason = "no-owned-saplings" }
        end
        table.sort(rows, function(a, b)
            local ka = a.placeableId .. "|" .. a.area .. "|" .. tostring(a.backpackIndex or 0) .. "|" .. a.treeKey
            local kb = b.placeableId .. "|" .. b.area .. "|" .. tostring(b.backpackIndex or 0) .. "|" .. b.treeKey
            return ka < kb
        end)
        return {
            readState = invalid and "partial" or "ok",
            reason = invalid and "unreadable-or-ambiguous-storage" or nil,
            coverage = truncated and "truncated" or "complete",
            byFarm = { [tostring(farmId)] = {
                rackCount = rackCount, backpackCount = backpackCount,
                recordedPieces = totalPieces,
            } },
            rows = rows,
        }
    end,
})
