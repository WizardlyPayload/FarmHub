-- FS25 FarmDashboard | companionPages/FactoryProfitCalculatorCollector.lua | v1.0.0
-- Factory Profit Calculator (KOCOYPOB). Applies the mod's own projection (FactoryProfitMath.calculateProduction)
-- to the farm's native production lines: cycles/month = cyclesPerHour * 24, upkeep = costsPerActiveMonth,
-- inputs priced at getPurchasePrice (cheapest buying station) or getPeakPrice, outputs at getPeakPrice
-- (theoretical peak). Those helpers only memoize into FactoryProfitMath caches. calculateProduction itself
-- is not called (it builds icon data), and FactoryDataProvider is never called (it stamps fpc_placeable).
-- Admin overrides come from FactoryAdminPersistence.entries (server copy of the admin dialog's edits).

local SCAN_POINTS = 60
local MAX_RECIPES_PER_POINT = 8
local MAX_LINES = 40
local MAX_IO = 8
local MAX_OVERRIDES = 30
local STATUS_RUNNING = 1

local function fillTypeInfo(ctx, index)
    local idx = ctx.num(index)
    if idx == nil or idx <= 0 then
        return nil, nil
    end
    local ftm = ctx.global("g_fillTypeManager")
    if type(ftm) ~= "table" then
        return nil, nil
    end
    local name = ctx.call(ftm, "getFillTypeNameByIndex", idx)
    local title = nil
    local ft = ctx.call(ftm, "getFillTypeByIndex", idx)
    if type(ft) == "table" then
        title = ft.title
        name = name or ft.name
    end
    return ctx.clip(name, 40), ctx.clip(title, 60)
end

local function entryFillType(entry)
    return entry.fillType or entry.type or entry.fillTypeIndex or entry.fillTypeId
end

local function entryAmount(ctx, entry)
    return ctx.num(entry.amount or entry.fillTypeAmount or entry.liters or entry.value) or 0
end

local function positive(ctx, value)
    local n = ctx.num(value)
    if n == nil or n <= 0 then
        return nil
    end
    return n
end

local function ioRows(ctx, fpm, entries, cycles, isInput)
    local rows, total, missing = {}, 0, 0
    if type(entries) ~= "table" then
        return rows, nil, 0
    end
    local seen = 0
    for _, entry in pairs(entries) do
        seen = seen + 1
        if seen > MAX_IO then
            break
        end
        if type(entry) == "table" then
            local ft = ctx.num(entryFillType(entry))
            local liters = entryAmount(ctx, entry) * cycles
            local price, source = nil, nil
            if isInput then
                price = positive(ctx, ctx.try(fpm.getPurchasePrice, ft))
                source = price ~= nil and "purchase" or nil
            end
            if price == nil then
                price = positive(ctx, ctx.try(fpm.getPeakPrice, ft))
                source = price ~= nil and "peak" or nil
            end
            local name, title = fillTypeInfo(ctx, ft)
            local value = price ~= nil and (liters / 1000) * price or nil
            if value == nil then
                missing = missing + 1
            else
                total = total + value
            end
            rows[#rows + 1] = {
                fillType = name,
                title = title,
                litersPerMonth = ctx.round2(liters),
                pricePer1000 = ctx.round2(price),
                priceSource = source,
                value = ctx.round2(value),
            }
        end
    end
    return rows, total, missing
end

local function readOverrides(ctx, persistence)
    if type(persistence) ~= "table" or type(persistence.entries) ~= "table" then
        return nil
    end
    return ctx.list(persistence.entries, MAX_OVERRIDES, function(entry)
        if type(entry) ~= "table" then
            return nil
        end
        local original = type(entry.original) == "table" and entry.original or {}
        local values = type(entry.values) == "table" and entry.values or {}
        return {
            factory = ctx.clip(entry.factoryTitle, 60),
            line = ctx.clip(entry.lineTitle, 60),
            originalCyclesPerHour = ctx.round2(original.cyclesPerHour),
            cyclesPerHour = ctx.round2(values.cyclesPerHour),
            inputs = ctx.count(values.inputs),
            outputs = ctx.count(values.outputs),
            capacities = ctx.count(values.capacities),
        }
    end)
end

CompanionPages.register({
    key = "factoryProfitCalculator",
    modNames = { "FS25_FactoryProfitCalculator", "FS25_368477_Factory_Profit_Calculator" },
    substrings = { "factoryprofitcalculator", "factory_profit_calculator" },
    collect = function(ctx)
        local fpm = ctx.symbol("FactoryProfitMath")
        local persistence = ctx.symbol("FactoryAdminPersistence")
        if type(fpm) ~= "table" and type(persistence) ~= "table" then
            return nil
        end
        local out = { period = "month", periodBasis = "activeHours24" }
        local overrides = readOverrides(ctx, persistence)
        if overrides ~= nil then
            out.overrides = overrides
            out.overrideCount = ctx.count(persistence.entries)
        end
        local farmId = ctx.farmId
        local mission = ctx.mission
        local pcm = type(mission) == "table" and mission.productionChainManager or nil
        if type(fpm) ~= "table" or type(fpm.getCyclesPerMonth) ~= "function" or type(fpm.getUpkeepPerMonth) ~= "function" then
            out.readState = "settings-only"
            out.reason = "no-profit-math"
            return out
        end
        if farmId == nil or farmId <= 0 or type(pcm) ~= "table" then
            out.readState = "settings-only"
            out.reason = farmId == nil and "no-farm" or "no-production-manager"
            return out
        end
        local points = ctx.call(pcm, "getProductionPointsForFarmId", farmId)
        if type(points) ~= "table" then
            out.readState = "settings-only"
            out.reason = "no-production-list"
            return out
        end

        local farm = {
            lineCount = 0,
            runningCount = 0,
            profitableCount = 0,
            lossCount = 0,
            totalProfit = 0,
            runningProfit = 0,
            totalUpkeep = 0,
        }
        local lines = {}
        local scanned, truncated, partial = 0, false, false
        for _, point in pairs(points) do
            scanned = scanned + 1
            if scanned > SCAN_POINTS then
                truncated = true
                break
            end
            if type(point) == "table" and type(point.productions) == "table" then
                local pointName = ctx.clip(ctx.call(point, "getName"), 60)
                local recipes = 0
                for _, production in pairs(point.productions) do
                    recipes = recipes + 1
                    if recipes > MAX_RECIPES_PER_POINT or #lines >= MAX_LINES then
                        truncated = true
                        break
                    end
                    if type(production) == "table" then
                        local cycles = ctx.num(ctx.try(fpm.getCyclesPerMonth, production)) or 0
                        local upkeep = ctx.num(ctx.try(fpm.getUpkeepPerMonth, production)) or 0
                        local inputs, inputCost, inputMissing = ioRows(ctx, fpm, production.inputs, cycles, true)
                        local outputs, outputValue, outputMissing = ioRows(ctx, fpm, production.outputs, cycles, false)
                        local status = ctx.num(production.status) or 0
                        local priced = inputMissing == 0 and outputMissing == 0 and inputCost ~= nil and outputValue ~= nil
                        local profit = priced and (outputValue - inputCost - upkeep) or nil
                        if not priced then
                            partial = true
                        end
                        local line = {
                            farmId = farmId,
                            point = pointName,
                            recipe = ctx.clip(production.name or production.id, 60),
                            status = status,
                            running = status == STATUS_RUNNING,
                            cyclesPerMonth = ctx.round2(cycles),
                            upkeepPerMonth = ctx.round2(upkeep),
                            inputCost = ctx.round2(inputCost),
                            outputValue = ctx.round2(outputValue),
                            profit = ctx.round2(profit),
                            inputs = inputs,
                            outputs = outputs,
                        }
                        lines[#lines + 1] = line
                        farm.lineCount = farm.lineCount + 1
                        farm.totalUpkeep = farm.totalUpkeep + upkeep
                        if line.running then
                            farm.runningCount = farm.runningCount + 1
                        end
                        if profit ~= nil then
                            farm.totalProfit = farm.totalProfit + profit
                            if line.running then
                                farm.runningProfit = farm.runningProfit + profit
                            end
                            if profit > 0 then
                                farm.profitableCount = farm.profitableCount + 1
                            elseif profit < 0 then
                                farm.lossCount = farm.lossCount + 1
                            end
                        end
                    end
                end
            end
        end
        table.sort(lines, function(a, b)
            local pa, pb = a.profit or -math.huge, b.profit or -math.huge
            if pa ~= pb then
                return pa > pb
            end
            return tostring(a.recipe or "") < tostring(b.recipe or "")
        end)
        farm.totalProfit = ctx.round2(farm.totalProfit)
        farm.runningProfit = ctx.round2(farm.runningProfit)
        farm.totalUpkeep = ctx.round2(farm.totalUpkeep)
        if lines[1] and lines[1].profit ~= nil then
            farm.bestLine = lines[1].recipe
        end
        local worst = lines[#lines]
        if worst and worst.profit ~= nil and #lines > 1 then
            farm.worstLine = worst.recipe
        end

        out.readState = partial and "partial" or "ok"
        out.coverage = truncated and "truncated" or "complete"
        out.byFarm = { [tostring(farmId)] = farm }
        -- Top level, not under byFarm: line -> input/output rows would pass the registry's depth cap.
        out.lines = lines
        return out
    end,
})
