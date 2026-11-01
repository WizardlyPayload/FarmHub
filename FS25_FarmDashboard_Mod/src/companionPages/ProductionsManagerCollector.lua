-- Productions Manager 1.0.0.1 keeps schedules in profile-wide XML, without farm IDs.
-- Join each record to this export farm's current production point and recipe.

local MAX_POINTS = 80
local MAX_RECIPES = 400
local MAX_ROWS = 80

local function pointKey(point)
    local placeable = type(point.owningPlaceable) == "table" and point.owningPlaceable or nil
    if placeable ~= nil then
        if placeable.uniqueId ~= nil then return tostring(placeable.uniqueId) end
        if tonumber(placeable.id) ~= nil then return tostring(tonumber(placeable.id)) end
    end
    if point.uniqueId ~= nil then return tostring(point.uniqueId) end
    if tonumber(point.id) ~= nil then return tostring(tonumber(point.id)) end
    return tostring(point)
end

CompanionPages.register({
    key = "productionsManager",
    modNames = { "FS25_346503_Productions_Manager" },
    substrings = {},
    collect = function(ctx)
        local farmId = ctx.farmId
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        local schedule = ctx.symbol("ProductionScheduleManager")
        if type(schedule) ~= "table" or type(schedule.data) ~= "table" then
            return { readState = "settings-only", reason = "no-schedule-manager" }
        end
        local manager = type(ctx.mission) == "table" and ctx.mission.productionChainManager or nil
        local points = type(manager) == "table" and ctx.call(manager, "getProductionPointsForFarmId", farmId) or nil
        if type(points) ~= "table" then
            return { readState = "settings-only", reason = "no-owned-production-list" }
        end

        local rows, count, enabledCount = {}, 0, 0
        local scannedPoints, scannedRecipes, truncated = 0, 0, false
        for _, point in pairs(points) do
            scannedPoints = scannedPoints + 1
            if scannedPoints > MAX_POINTS then truncated = true; break end
            if type(point) == "table" and ctx.num(point.ownerFarmId) == farmId then
                local key = pointKey(point)
                local runtime = type(schedule.runtime) == "table" and schedule.runtime[key] or nil
                local entries = schedule.data[key]
                -- Runtime identity blocks stale or unrelated profile keys.
                if runtime == point and type(entries) == "table" then
                    local placeable = type(point.owningPlaceable) == "table" and point.owningPlaceable or nil
                    local pointName = ctx.clip(ctx.call(point, "getName") or
                        (placeable and ctx.call(placeable, "getName")) or key, 60)
                    local recipes = type(point.productionsIdToObj) == "table" and point.productionsIdToObj or nil
                    if recipes == nil then
                        recipes = {}
                        for _, recipe in pairs(type(point.productions) == "table" and point.productions or {}) do
                            if type(recipe) == "table" and recipe.id ~= nil then
                                recipes[tostring(recipe.id)] = recipe
                            end
                        end
                    end
                    for recipeId, entry in pairs(entries) do
                        scannedRecipes = scannedRecipes + 1
                        if scannedRecipes > MAX_RECIPES then truncated = true; break end
                        local recipe = recipes[recipeId] or recipes[tostring(recipeId)] or recipes[tonumber(recipeId)]
                        if type(recipe) == "table" and type(entry) == "table" then
                            local months = {}
                            for m = 1, 12 do
                                if type(entry.months) == "table" and entry.months[m] == true then
                                    months[#months + 1] = m
                                end
                            end
                            local enabled = entry.scheduleEnabled == true
                            count = count + 1
                            if enabled then enabledCount = enabledCount + 1 end
                            if #rows < MAX_ROWS then
                                rows[#rows + 1] = {
                                    farmId = farmId,
                                    point = pointName,
                                    recipe = ctx.clip(recipe.name or recipe.id or recipeId, 60),
                                    scheduleEnabled = enabled,
                                    months = months,
                                }
                            else
                                truncated = true
                            end
                        end
                    end
                end
            end
        end
        table.sort(rows, function(a, b)
            if a.point ~= b.point then return a.point < b.point end
            return a.recipe < b.recipe
        end)
        local unjoined = count == 0 and next(schedule.data) ~= nil
        return {
            readState = unjoined and "settings-only" or "ok",
            reason = unjoined and "no-owned-schedule-match" or nil,
            coverage = truncated and "truncated" or "complete",
            scope = "current-owned-production-points",
            byFarm = { [tostring(farmId)] = { scheduleCount = count, enabledCount = enabledCount } },
            rows = rows,
        }
    end,
})
