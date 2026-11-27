-- Adjust Production Points 1.0.0.0: read configured production rates and
-- storage limits from currently owned points. Another mod may also change the
-- live rate; these rows do not attribute effective throughput to this mod.

local MAX_POINTS = 80
local MAX_RECIPES = 16
local MAX_CAPACITY_ENTRIES = 80
local MAX_ROWS = 100

local function valid(value, minimum, maximum)
    local n = tonumber(value)
    return n ~= nil and n == n and n >= minimum and n <= maximum and n or nil
end

CompanionPages.register({
    key = "adjustProductionPoints",
    modNames = { "FS25_352087_Adjust_Production_Points" },
    substrings = {},
    collect = function(ctx)
        if ctx.version ~= "1.0.0.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmId = valid(ctx.farmId, 1, 8)
        if farmId == nil or farmId ~= math.floor(farmId) then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-production-state-only" }
        end
        local manager = type(ctx.mission) == "table" and ctx.mission.productionChainManager or nil
        local points = ctx.call(manager, "getProductionPointsForFarmId", farmId)
        if type(points) ~= "table" then
            return { readState = "settings-only", reason = "no-owned-production-list" }
        end

        local rows, owned, changedRates, changedLimits, mismatches = {}, 0, 0, 0, 0
        local scanned, invalid, truncated = 0, false, false
        local fillManager = ctx.global("g_fillTypeManager")
        local function add(row)
            if #rows < MAX_ROWS then rows[#rows + 1] = row else truncated = true end
        end
        for _, point in pairs(points) do
            scanned = scanned + 1
            if scanned > MAX_POINTS then truncated = true; break end
            if type(point) == "table" and ctx.num(point.ownerFarmId) == farmId then
                local placeable = point.owningPlaceable
                if type(placeable) == "table" and ctx.num(ctx.call(placeable, "getOwnerFarmId")) == farmId then
                    owned = owned + 1
                    local name = ctx.clip(ctx.call(point, "getName") or ctx.call(placeable, "getName"), 80)
                    local placeableId = ctx.clip(placeable.uniqueId, 80)
                    local recipes = 0
                    for _, recipe in ipairs(type(point.productions) == "table" and point.productions or {}) do
                        recipes = recipes + 1
                        if recipes > MAX_RECIPES then truncated = true; break end
                        local current = type(recipe) == "table" and valid(recipe.cyclesPerMonth, 0, 1000000000) or nil
                        local baseline = type(recipe) == "table" and valid(recipe.cyclesPerMonthDefault, 0, 1000000000) or nil
                        if current ~= nil and baseline ~= nil and math.abs(current - baseline) > 0.001 then
                            changedRates = changedRates + 1
                            add({ farmId = farmId, placeableId = placeableId, name = name,
                                  kind = "cycles", item = ctx.clip(recipe.name or recipe.id, 80),
                                  baseline = ctx.round2(baseline), current = ctx.round2(current) })
                        elseif type(recipe) == "table" and (current == nil or baseline == nil) then
                            invalid = true
                        end
                    end

                    local spec = placeable.spec_adjustProductionPointStorage
                    local storage = point.storage
                    if type(spec) == "table" then
                        local savedTotal = spec.adjustedTotalCapacity
                        if savedTotal ~= nil then
                            local saved = valid(savedTotal, 0, 1000000000000)
                            local live = type(storage) == "table" and valid(storage.capacity, 0, 1000000000000) or nil
                            if saved ~= nil and live ~= nil then
                                changedLimits = changedLimits + 1
                                if math.abs(saved - live) > 0.001 then mismatches = mismatches + 1 end
                                add({ farmId = farmId, placeableId = placeableId, name = name,
                                      kind = "totalCapacity", saved = saved, current = live })
                            else invalid = true end
                        end
                        local seen, duplicates = {}, {}
                        local entries = type(spec.adjustedCapacities) == "table" and spec.adjustedCapacities or {}
                        local entryCount = 0
                        for _, entry in ipairs(entries) do
                            entryCount = entryCount + 1
                            if entryCount > MAX_CAPACITY_ENTRIES then truncated = true; break end
                            local index = type(entry) == "table" and valid(entry.fillTypeIndex, 1, 65535) or nil
                            local saved = type(entry) == "table" and valid(entry.capacity, 0, 1000000000000) or nil
                            if index ~= nil and index == math.floor(index) and saved ~= nil then
                                if seen[index] ~= nil then duplicates[index] = true end
                                seen[index] = saved
                            else invalid = true end
                        end
                        for index, saved in pairs(seen) do
                            if duplicates[index] then
                                invalid = true -- save code writes repeated fill types; do not guess which wins
                            else
                                local live = type(storage) == "table" and type(storage.capacities) == "table"
                                    and valid(storage.capacities[index], 0, 1000000000000) or nil
                                if live ~= nil then
                                    if math.abs(saved - live) > 0.001 then mismatches = mismatches + 1 end
                                    local fillName = ctx.call(fillManager, "getFillTypeTitleByIndex", index)
                                        or ctx.call(fillManager, "getFillTypeNameByIndex", index)
                                    changedLimits = changedLimits + 1
                                    add({ farmId = farmId, placeableId = placeableId, name = name,
                                          kind = "fillCapacity", item = ctx.clip(fillName, 80),
                                          fillTypeIndex = index, saved = saved, current = live })
                                else invalid = true end
                            end
                        end
                    end
                end
            end
        end
        table.sort(rows, function(a, b)
            local left = tostring(a.name or "") .. tostring(a.placeableId or "") .. tostring(a.kind) .. tostring(a.item or a.fillTypeIndex or "")
            local right = tostring(b.name or "") .. tostring(b.placeableId or "") .. tostring(b.kind) .. tostring(b.item or b.fillTypeIndex or "")
            return left < right
        end)
        return {
            readState = (invalid or mismatches > 0) and "partial" or "ok",
            reason = invalid and "unreadable-or-duplicate-adjustment"
                or (mismatches > 0 and "saved-live-capacity-disagreement" or nil),
            coverage = truncated and "truncated" or "complete",
            byFarm = { [tostring(farmId)] = {
                ownedPointCount = owned, changedRateCount = changedRates,
                adjustedCapacityCount = changedLimits, mismatchCount = mismatches,
            } },
            rows = rows,
        }
    end,
})
