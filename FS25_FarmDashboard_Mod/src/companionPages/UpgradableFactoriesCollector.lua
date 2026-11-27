-- Upgradable Factories v1.0.0.0: read the saved level of owned production points.
-- Never call UpgradableFactories.getState: it creates a state table when absent.

local MAX_POINTS, MAX_ROWS = 120, 80
local MAX_LEVEL, STEP = 10, 0.25

local function farmId(ctx, value)
    local n = ctx.num(value)
    return n ~= nil and n >= 1 and n <= 255 and n == math.floor(n) and n or nil
end

local function level(ctx, value)
    local n = ctx.num(value)
    return n ~= nil and n >= 0 and n <= MAX_LEVEL and n == math.floor(n) and n or nil
end

CompanionPages.register({
    key = "upgradableFactories",
    modNames = { "FS25_340901_Upgradable_Factories" },
    collect = function(ctx)
        if ctx.version ~= "1.0.0.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local selectedFarm = farmId(ctx, ctx.farmId)
        if selectedFarm == nil then
            return { readState = "settings-only", reason = "no-farm" }
        end
        local mission = ctx.mission
        if ctx.call(mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-productions-only" }
        end
        if mission.isMissionStarted == false then
            return { readState = "settings-only", reason = "world-not-started" }
        end
        local manager = mission.productionChainManager
        local points = ctx.call(manager, "getProductionPointsForFarmId", selectedFarm)
        if type(points) ~= "table" then
            return { readState = "settings-only", reason = "no-owned-production-list" }
        end

        local candidates, seenIds, duplicateIds = {}, {}, {}
        local scanned, partial, truncated = 0, false, false
        for _, point in pairs(points) do
            scanned = scanned + 1
            if scanned > MAX_POINTS then truncated = true; break end
            if type(point) == "table" then
                local pointOwner = farmId(ctx, ctx.call(point, "getOwnerFarmId") or point.ownerFarmId)
                if pointOwner == selectedFarm then
                    local placeable = point.owningPlaceable
                    local placeOwner = type(placeable) == "table"
                        and farmId(ctx, ctx.call(placeable, "getOwnerFarmId")) or nil
                    local id = type(placeable) == "table"
                        and ctx.clip(ctx.call(placeable, "getUniqueId") or placeable.uniqueId, 80) or nil
                    local state = point.fs25UF
                    local currentLevel = type(state) == "table" and level(ctx, state.level) or nil
                    if placeOwner ~= selectedFarm or id == nil or id == ""
                        or currentLevel == nil or placeable.isDeleted == true
                        or placeable.isDeleting == true then
                        partial = true
                    else
                        if seenIds[id] then duplicateIds[id] = true end
                        seenIds[id] = true
                        candidates[#candidates + 1] = {
                            farmId = selectedFarm,
                            placeableId = id,
                            production = ctx.clip(ctx.call(point, "getName")
                                or ctx.call(placeable, "getName") or "Production", 80),
                            level = currentLevel,
                            maxLevel = MAX_LEVEL,
                            configuredMultiplier = 1 + currentLevel * STEP,
                        }
                    end
                elseif pointOwner == nil then
                    -- A point returned by the farm list with no owner cannot be attributed.
                    partial = true
                end
            end
        end

        local rows, count, upgraded = {}, 0, 0
        for _, row in ipairs(candidates) do
            if duplicateIds[row.placeableId] then
                partial = true
            else
                count = count + 1
                if row.level > 0 then upgraded = upgraded + 1 end
                if #rows < MAX_ROWS then rows[#rows + 1] = row
                else truncated = true end
            end
        end
        table.sort(rows, function(a, b)
            if a.production ~= b.production then return a.production < b.production end
            return a.placeableId < b.placeableId
        end)
        local incomplete = partial or truncated
        return {
            readState = incomplete and "partial" or count > 0 and "ok" or "settings-only",
            reason = count == 0 and not incomplete and "no-owned-upgradable-productions" or nil,
            coverage = truncated and "truncated" or partial and "partial" or "complete",
            byFarm = { [tostring(selectedFarm)] = {
                productionCount = not incomplete and count or nil,
                upgradedCount = not incomplete and upgraded or nil,
            } },
            rows = rows,
        }
    end,
})
