-- Production Control v1.0.0.2 stores its chosen speed on each production.
-- Read only owned lines; never call its recalculation or menu functions.

local MAX_POINTS = 60
local MAX_RECIPES_PER_POINT = 8
local MAX_ROWS = 40
local KEY = "productionControlSelfSpec_"

CompanionPages.register({
    key = "productionControl",
    modNames = { "FS25_ProductionControl", "FS25_319198_Production_Control" },
    substrings = { "productioncontrol", "production_control" },
    collect = function(ctx)
        local farmId = ctx.farmId
        local mission = ctx.mission
        local manager = type(mission) == "table" and mission.productionChainManager or nil
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if type(manager) ~= "table" then
            return { readState = "settings-only", reason = "no-production-manager" }
        end
        local points = ctx.call(manager, "getProductionPointsForFarmId", farmId)
        if type(points) ~= "table" then
            return { readState = "settings-only", reason = "no-production-list" }
        end

        local lines = {}
        local count, changed, scanned = 0, 0, 0
        local truncated, missing = false, false
        for _, point in pairs(points) do
            scanned = scanned + 1
            if scanned > MAX_POINTS then
                truncated = true
                break
            end
            if type(point) == "table" and ctx.num(point.ownerFarmId) == farmId then
                local placeable = type(point.owningPlaceable) == "table" and point.owningPlaceable or nil
                local pointName = ctx.clip(ctx.call(point, "getName") or (placeable and ctx.call(placeable, "getName")), 60)
                local recipes = 0
                for _, production in pairs(type(point.productions) == "table" and point.productions or {}) do
                    recipes = recipes + 1
                    if recipes > MAX_RECIPES_PER_POINT then
                        truncated = true
                        break
                    end
                    if type(production) == "table" then
                        count = count + 1
                        local speed = ctx.num(production[KEY .. "productivity"])
                        if speed == nil or speed < 50 or speed > 300 then
                            missing = true
                        else
                            if speed ~= 100 then changed = changed + 1 end
                            if #lines < MAX_ROWS then
                                lines[#lines + 1] = {
                                    farmId = farmId,
                                    point = pointName,
                                    recipe = ctx.clip(production.name or production.id, 60),
                                    productivityPercent = speed,
                                    baseCyclesPerMonth = ctx.round2(production[KEY .. "baseCyclesPerMonth"]),
                                    cyclesPerMonth = ctx.round2(production.cyclesPerMonth),
                                    baseCostPerMonth = ctx.round2(production[KEY .. "baseCostsPerActiveMonth"]),
                                    costPerMonth = ctx.round2(production.costsPerActiveMonth),
                                }
                            else
                                truncated = true
                            end
                        end
                    end
                end
            end
        end
        table.sort(lines, function(a, b)
            local pa, pb = tostring(a.point or ""), tostring(b.point or "")
            if pa ~= pb then return pa < pb end
            return tostring(a.recipe or "") < tostring(b.recipe or "")
        end)
        return {
            readState = missing and "partial" or "ok",
            coverage = truncated and "truncated" or "complete",
            byFarm = { [tostring(farmId)] = { lineCount = count, changedCount = changed } },
            lines = lines,
        }
    end,
})
