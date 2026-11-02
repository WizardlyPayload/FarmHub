-- Production Revamp 1.0.0.0 stores its extra STORE mode and distribution
-- priorities on production points. Read owned, live points only; never call
-- Revamp.refreshDistributionTargets or any setter (both mutate game state).

local MAX_POINTS = 80
local MAX_OUTPUTS_PER_POINT = 50
local MAX_TARGETS_PER_OUTPUT = 40
local MAX_ROWS = 100
local MAX_RECIPE_ROWS = 100
local LEVEL = { PRIMARY = true, SECONDARY = true, REST = true, NEVER = true }
local SELECTION_MODE = { ASC = true, DESC = true, MOST = true, LEAST = true }
-- Exact Production Revamp 1.0.0.0 adds STORE=3 to the vanilla modes 0..2.
-- Its saved flag can disagree with the effective getter when another mod
-- replaces a ProductionPoint hook; report both rather than claiming activity.
local OUTPUT_MODE = { [0] = "KEEP", [1] = "DIRECT_SELL",
    [2] = "AUTO_DELIVER", [3] = "STORE" }

CompanionPages.register({
    key = "productionRevamp",
    modNames = { "FS25_378044_Production_Revamp", "FS25_ProductionRevamp" },
    substrings = { "production_revamp", "productionrevamp" },
    collect = function(ctx)
        local farmId, mission = ctx.farmId, ctx.mission
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-production-state-only" }
        end
        local revamp = ctx.symbol("Revamp")
        local settings = type(revamp) == "table" and revamp.settings or nil
        local manager = type(mission) == "table" and mission.productionChainManager or nil
        local fillManager = ctx.global("g_fillTypeManager")
        if type(settings) ~= "table" or type(manager) ~= "table"
            or type(fillManager) ~= "table" then
            return { readState = "settings-only", reason = "no-revamp-production-state" }
        end
        local points = ctx.call(manager, "getProductionPointsForFarmId", farmId)
        if type(points) ~= "table" then
            return { readState = "settings-only", reason = "no-production-list" }
        end

        -- Resolve destination IDs only against this same farm's live points.
        -- A saved unique ID is local to the server and can be stale after a
        -- placeable is sold or removed. Never export the opaque ID itself.
        local owned, byUniqueId = {}, {}
        local scanned, truncated = 0, false
        for _, point in pairs(points) do
            scanned = scanned + 1
            if scanned > MAX_POINTS then truncated = true; break end
            if type(point) == "table" and ctx.num(point.ownerFarmId) == farmId then
                local placeable = point.owningPlaceable
                if type(placeable) == "table" then
                    local uniqueId = ctx.call(placeable, "getUniqueId")
                    if type(uniqueId) == "string" and uniqueId ~= "" then
                        owned[#owned + 1] = point
                        byUniqueId[uniqueId] = point
                    end
                end
            end
        end

        local rows, recipeRows, storeCount, getterStoreCount, targetCount = {}, {}, 0, 0, 0
        local incomplete = false
        local modeMismatch = false
        for _, point in ipairs(owned) do
            local sourceName = ctx.clip(ctx.call(point, "getName")
                or ctx.call(point.owningPlaceable, "getName"), 64)
            local recipes = type(point.productions) == "table" and point.productions or nil
            if recipes == nil then incomplete = true end
            local recipeCount = 0
            for _, recipe in pairs(recipes or {}) do
                recipeCount = recipeCount + 1
                if recipeCount > MAX_OUTPUTS_PER_POINT then truncated = true; break end
                if type(recipe) == "table" and (recipe.hasMixChoice == true or recipe.hasBoostChoice == true) then
                    local recipeId = ctx.clip(recipe.id, 64)
                    local recipeName = ctx.clip(recipe.name or recipe.id, 64)
                    local mix = recipe.hasMixChoice == true and recipe.mixMode or nil
                    local boost = recipe.hasBoostChoice == true and recipe.boostMode or nil
                    if recipeId == nil or recipeId == "" or recipeName == nil or recipeName == ""
                        or (mix ~= nil and not SELECTION_MODE[mix])
                        or (boost ~= nil and not SELECTION_MODE[boost])
                        or (recipe.hasMixChoice == true and mix == nil)
                        or (recipe.hasBoostChoice == true and boost == nil) then
                        incomplete = true
                    elseif #recipeRows < MAX_RECIPE_ROWS then
                        recipeRows[#recipeRows + 1] = {
                            farmId = farmId, source = sourceName, recipe = recipeName,
                            mixMode = mix, boostMode = boost,
                        }
                    else truncated = true end
                end
            end
            local outputs = type(point.outputFillTypeIds) == "table"
                and point.outputFillTypeIds or {}
            local store = type(point.outputFillTypeIdsStorage) == "table"
                and point.outputFillTypeIdsStorage or nil
            local targets = type(point.distributionTargets) == "table"
                and point.distributionTargets or {}
            local autoDeliver = type(point.outputFillTypeIdsAutoDeliver) == "table"
                and point.outputFillTypeIdsAutoDeliver or {}
            if store == nil then incomplete = true end
            local outputCount = 0
            for fillTypeId in pairs(outputs) do
                outputCount = outputCount + 1
                if outputCount > MAX_OUTPUTS_PER_POINT then truncated = true; break end
                local fillName = ctx.call(fillManager, "getFillTypeNameByIndex", fillTypeId)
                if type(fillName) ~= "string" or fillName == "" then
                    incomplete = true
                else
                    local serverMode = OUTPUT_MODE[ctx.num(ctx.call(point,
                        "getOutputDistributionMode", fillTypeId))]
                    if serverMode == nil then incomplete = true end
                    if store and store[fillTypeId] then
                        storeCount = storeCount + 1
                        if serverMode == "STORE" and settings.storageActive == true then
                            getterStoreCount = getterStoreCount + 1
                        elseif settings.storageActive == true then
                            -- The mod's saved flag does not match its server
                            -- getter. Do not call this a live Store setting.
                            modeMismatch = true
                            incomplete = true
                        end
                        if #rows < MAX_ROWS then
                            rows[#rows + 1] = {
                                farmId = farmId, source = sourceName,
                                product = ctx.clip(fillName, 48), kind = "STORE",
                                serverMode = serverMode,
                                storageEnabled = settings.storageActive == true,
                            }
                        else truncated = true end
                    end
                    local perOutput = targets[fillTypeId]
                    if type(perOutput) == "table" then
                        local seen = 0
                        for targetId, entry in pairs(perOutput) do
                            seen = seen + 1
                            if seen > MAX_TARGETS_PER_OUTPUT then truncated = true; break end
                            local destination = byUniqueId[targetId]
                            local level = type(entry) == "table" and entry.level or nil
                            local limit = type(entry) == "table" and ctx.num(entry.limit) or nil
                            if destination == nil or destination == point or not LEVEL[level]
                                or (limit ~= nil and (limit < 0 or limit ~= math.floor(limit))) then
                                incomplete = true
                            else
                                targetCount = targetCount + 1
                                if #rows < MAX_ROWS then
                                    rows[#rows + 1] = {
                                        farmId = farmId, source = sourceName,
                                        product = ctx.clip(fillName, 48),
                                        kind = "TARGET", level = level,
                                        serverMode = serverMode,
                                        distributionEnabled = settings.distributionActive == true,
                                        destination = ctx.clip(ctx.call(destination, "getName")
                                            or ctx.call(destination.owningPlaceable, "getName"), 64),
                                        limitLitres = limit,
                                        autoDeliverFlag = autoDeliver[fillTypeId] ~= nil,
                                    }
                                else truncated = true end
                            end
                        end
                    end
                end
            end
        end
        table.sort(rows, function(a, b)
            local ka = table.concat({ a.source or "", a.product or "", a.kind or "",
                a.destination or "" }, "|")
            local kb = table.concat({ b.source or "", b.product or "", b.kind or "",
                b.destination or "" }, "|")
            return ka < kb
        end)
        table.sort(recipeRows, function(a, b)
            return table.concat({ a.source or "", a.recipe or "" }, "|")
                < table.concat({ b.source or "", b.recipe or "" }, "|")
        end)
        return {
            readState = incomplete and "partial" or (#rows > 0 or #recipeRows > 0)
                and "ok" or "settings-only",
            reason = modeMismatch and "store-mode-mismatch"
                or (#rows == 0 and #recipeRows == 0) and "no-owned-revamp-settings" or nil,
            coverage = truncated and "truncated" or incomplete and "partial" or "complete",
            byFarm = { [tostring(farmId)] = {
                productionCount = #owned, storeCount = storeCount,
                getterStoreCount = getterStoreCount, targetCount = targetCount,
                recipeChoiceCount = #recipeRows,
                storageActive = settings.storageActive == true,
                distributionActive = settings.distributionActive == true,
            } },
            rows = rows,
            recipeRows = recipeRows,
        }
    end,
})
