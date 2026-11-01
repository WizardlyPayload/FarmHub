-- Production Booster System 1.0.0.0 tracks cumulative output by fill type on each
-- production. Read only the bound server's owned points; never invoke PBS helpers,
-- which initialise or change the live statistics table.

local MAX_POINTS = 60
local MAX_LINES = 120
local MAX_OUTPUTS = 400
local MAX_ROWS = 80

CompanionPages.register({
    key = "productionBoosterSystem",
    modNames = { "FS25_ProductionBoosterSystem", "KM_82331_Production_Booster_System" },
    substrings = { "productionboostersystem", "production_booster_system" },
    collect = function(ctx)
        local farmId = ctx.farmId
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-statistics-only" }
        end
        local manager = type(ctx.mission) == "table" and ctx.mission.productionChainManager or nil
        local points = ctx.call(manager, "getProductionPointsForFarmId", farmId)
        if type(points) ~= "table" then
            return { readState = "settings-only", reason = "no-production-list" }
        end

        local fillManager = ctx.global("g_fillTypeManager")
        local rows, pointsSeen, linesSeen, outputsSeen = {}, 0, 0, 0
        local activeLines, truncated, invalid = 0, false, false
        for _, point in pairs(points) do
            pointsSeen = pointsSeen + 1
            if pointsSeen > MAX_POINTS then truncated = true; break end
            if type(point) == "table" then
                local placeable = type(point.owningPlaceable) == "table" and point.owningPlaceable or nil
                local pointOwner = ctx.num(point.ownerFarmId)
                local placeableOwner = ctx.num(ctx.call(placeable, "getOwnerFarmId"))
                local owner = placeableOwner or pointOwner
                if pointOwner ~= nil and placeableOwner ~= nil and pointOwner ~= placeableOwner then
                    invalid = true
                elseif owner == farmId then
                    local pointName = ctx.clip(ctx.call(point, "getName") or ctx.call(placeable, "getName"), 70)
                    for _, production in pairs(type(point.productions) == "table" and point.productions or {}) do
                        linesSeen = linesSeen + 1
                        if linesSeen > MAX_LINES then truncated = true; break end
                        if type(production) == "table" and production.pbsUsesCustomUpdate == true then
                            local stats = production.pbsStatistics
                            if type(stats) ~= "table" or type(stats.outputs) ~= "table" then
                                invalid = true
                            else
                                local lineHasOutput = false
                                for fillTypeIndex, values in pairs(stats.outputs) do
                                    outputsSeen = outputsSeen + 1
                                    if outputsSeen > MAX_OUTPUTS then truncated = true; break end
                                    local base = type(values) == "table" and ctx.num(values.base) or nil
                                    local actual = type(values) == "table" and ctx.num(values.actual) or nil
                                    local bonus = type(values) == "table" and ctx.num(values.bonus) or nil
                                    if base == nil or actual == nil or bonus == nil or base < 0 or actual < 0 or bonus < 0 then
                                        invalid = true
                                    elseif base > 0 or actual > 0 or bonus > 0 then
                                        lineHasOutput = true
                                        local fillName = ctx.call(fillManager, "getFillTypeNameByIndex", fillTypeIndex)
                                        if #rows < MAX_ROWS then
                                            rows[#rows + 1] = {
                                                farmId = farmId,
                                                point = pointName,
                                                recipe = ctx.clip(production.name or production.id, 70),
                                                output = ctx.clip(fillName or fillTypeIndex, 48),
                                                baseLitres = ctx.round2(base),
                                                actualLitres = ctx.round2(actual),
                                                bonusLitres = ctx.round2(bonus),
                                            }
                                        else
                                            truncated = true
                                        end
                                    end
                                end
                                if lineHasOutput then activeLines = activeLines + 1 end
                            end
                        end
                    end
                end
            end
        end
        table.sort(rows, function(a, b)
            local aKey = tostring(a.point or "") .. "\0" .. tostring(a.recipe or "") .. "\0" .. tostring(a.output or "")
            local bKey = tostring(b.point or "") .. "\0" .. tostring(b.recipe or "") .. "\0" .. tostring(b.output or "")
            return aKey < bKey
        end)
        return {
            readState = invalid and "partial" or (#rows > 0 and "ok" or "settings-only"),
            reason = not invalid and #rows == 0 and "no-recorded-output" or nil,
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            byFarm = { [tostring(farmId)] = { activeLineCount = activeLines, outputCount = #rows } },
            rows = rows,
        }
    end,
})
