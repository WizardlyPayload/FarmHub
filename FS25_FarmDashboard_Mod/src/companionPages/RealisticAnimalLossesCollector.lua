-- FS25 FarmDashboard | RealisticAnimalLossesCollector.lua
-- Dedicated page reader for FS25_RealisticAnimalLosses (Fetty42).
-- The mod keeps no loss history; it rolls losses at its daily check hour. This reader exports its settings,
-- its risk constants and, per pen owned by the export farm, the same inputs the mod checks: feed
-- effectivity (the mod's own getFoodEffectivity, read only), empty water / straw, animals at or past the
-- risk age, and the per-animal chance the mod's formula gives for the next check. It also copies the
-- highest risk the mod last warned about for that pen. Never calls CheckAllFarmHusbandries / onHourChanged.

local MAX_SCAN = 300
local MAX_PENS = 30
local MAX_CLUSTERS = 200

local function round1(ctx, v)
    local n = ctx.num(v)
    if n == nil then
        return nil
    end
    return math.floor(n * 10 + 0.5) / 10
end

local function careRisk(ctx, effectivity, threshold, noWater, noStraw, ral)
    local food = 0
    if effectivity ~= nil and threshold ~= nil and threshold > 0 and effectivity < threshold then
        local x = effectivity / threshold * 100
        food = (100 - x) ^ 1.3 * 0.17 + 1
    end
    local water = noWater and (ctx.num(ral.riskWaterLossesRate) or 0) or 0
    local straw = noStraw and (ctx.num(ral.riskStrawLossesRate) or 0) or 0
    return food + water + straw
end

local function readPen(ctx, ral, husbandry, days, threshold)
    local placeable = ctx.call(husbandry, "getPlaceable")
    if type(placeable) ~= "table" then
        return nil
    end
    local owner = ctx.num(ctx.call(placeable, "getOwnerFarmId")) or ctx.num(placeable.ownerFarmId)
    if owner ~= ctx.farmId then
        return nil
    end
    local typeName = type(husbandry.animalTypeName) == "string" and husbandry.animalTypeName or "UNKNOWN"
    local ages = type(ral.riskAnimalAgeInMonths) == "table" and ral.riskAnimalAgeInMonths or {}
    local riskAge = ctx.num(ages[typeName]) or ctx.num(ages.UNKNOWN)

    local effectivity = ctx.num(ctx.call(ral, "getFoodEffectivity", placeable))

    local noWater = false
    local water = placeable.spec_husbandryWater
    if type(water) == "table" and water.automaticWaterSupply ~= true then
        local level = ctx.num(ctx.call(placeable, "getHusbandryFillLevel", water.fillType, nil))
        noWater = level ~= nil and level == 0
    end
    local noStraw = false
    local straw = placeable.spec_husbandryStraw
    if type(straw) == "table" then
        local level = ctx.num(ctx.call(placeable, "getHusbandryFillLevel", straw.inputFillType, nil))
        noStraw = level ~= nil and level == 0
    end

    local animals, oldAnimals, clusters = 0, 0, ctx.call(placeable, "getClusters")
    if type(clusters) == "table" then
        for i = 1, math.min(#clusters, MAX_CLUSTERS) do
            local cluster = clusters[i]
            if type(cluster) == "table" then
                local n = ctx.num(cluster.numAnimals) or 0
                animals = animals + n
                local age = ctx.num(cluster.age)
                if riskAge ~= nil and age ~= nil and age >= riskAge then
                    oldAnimals = oldAnimals + n
                end
            end
        end
    else
        animals = ctx.num(ctx.call(placeable, "getNumOfAnimals")) or 0
    end

    local care = careRisk(ctx, effectivity, threshold, noWater, noStraw, ral)
    local careDaily = (days ~= nil and days > 0) and care / days or nil
    local ageDaily = nil
    if oldAnimals > 0 and days ~= nil and days > 0 then
        ageDaily = (ctx.num(ral.riskAgeLossesRate) or 0) / days
    end

    local warnedFood = type(ral.lastMaxProbabilityToLossAnimalsForFood) == "table"
        and ctx.num(ral.lastMaxProbabilityToLossAnimalsForFood[husbandry]) or nil
    local warnedAge = type(ral.lastMaxProbabilityToLossAnimalsForAge) == "table"
        and ctx.num(ral.lastMaxProbabilityToLossAnimalsForAge[husbandry]) or nil

    return {
        name = ctx.clip(ctx.call(placeable, "getName"), 60),
        animalType = ctx.clip(typeName, 24),
        animals = animals,
        riskAgeMonths = riskAge,
        oldAnimals = oldAnimals,
        foodEffectivity = effectivity,
        belowThreshold = effectivity ~= nil and threshold ~= nil and effectivity < threshold,
        noWater = noWater,
        noStraw = noStraw,
        careRiskPercentPerCheck = careDaily ~= nil and round1(ctx, careDaily) or nil,
        ageRiskPercentPerCheck = ageDaily ~= nil and round1(ctx, ageDaily) or nil,
        lastWarnedCareRiskPercent = round1(ctx, warnedFood),
        lastWarnedAgeRiskPercent = round1(ctx, warnedAge),
    }
end

CompanionPages.register({
    key = "realisticAnimalLosses",
    modNames = { "FS25_RealisticAnimalLosses", "FS25_324914_Realistic_Animal_Losses" },
    substrings = { "realisticanimallosses", "realistic_animal_losses" },
    collect = function(ctx)
        local ral = ctx.symbol("RealisticAnimalLosses")
        if type(ral) ~= "table" then
            return nil
        end

        local out = { readState = "ok", settings = {}, rules = {} }
        local threshold = type(ral.settings) == "table" and ctx.num(ral.settings.foodEffectivityThreshold) or nil
        out.settings.foodEffectivityThreshold = threshold
        out.settings.defaultFoodEffectivityThreshold = ctx.num(ral.DEFAULT_FOOD_EFFECTIVITY_THRESHOLD)
        out.rules.ageLossRatePercent = ctx.num(ral.riskAgeLossesRate)
        out.rules.waterLossRatePercent = ctx.num(ral.riskWaterLossesRate)
        out.rules.strawLossRatePercent = ctx.num(ral.riskStrawLossesRate)
        out.rules.checkHour = ctx.num(ral.hourForAction)
        out.rules.warningWaitingHours = ctx.num(ral.warningWaitingHours)
        local ages = {}
        if type(ral.riskAnimalAgeInMonths) == "table" then
            for typeName, months in pairs(ral.riskAnimalAgeInMonths) do
                local m = ctx.num(months)
                if type(typeName) == "string" and m ~= nil and #ages < 16 then
                    ages[#ages + 1] = { animalType = ctx.clip(typeName, 24), months = m }
                end
            end
            table.sort(ages, function(a, b) return a.animalType < b.animalType end)
        end
        out.rules.riskAges = ages

        local mission = ctx.mission
        local env = type(mission) == "table" and mission.environment or nil
        local days = type(env) == "table" and ctx.num(env.daysPerPeriod) or nil
        out.daysPerPeriod = days
        if type(env) == "table" then
            local year, period = ctx.num(env.currentYear), ctx.num(env.currentPeriod)
            if year ~= nil and period ~= nil then
                -- The mod skips its checks until period 6 of year 1.
                out.firstSeasonGrace = year == 1 and period - 6 < 1
            end
        end

        if threshold == nil then
            out.readState = "settings-only"
        end

        if ctx.farmId ~= nil and type(mission) == "table" then
            local husbandries = type(mission.husbandrySystem) == "table" and mission.husbandrySystem.clusterHusbandries or nil
            local pens, truncated, failed = {}, false, false
            local totals = { animals = 0, oldAnimals = 0, pensAtRisk = 0, pensBelowThreshold = 0, pensNoWater = 0, pensNoStraw = 0 }
            if type(husbandries) == "table" then
                local scanned = 0
                for _, husbandry in pairs(husbandries) do
                    scanned = scanned + 1
                    if scanned > MAX_SCAN then
                        truncated = true
                        break
                    end
                    if type(husbandry) == "table" then
                        local okRow, row = pcall(readPen, ctx, ral, husbandry, days, threshold)
                        if not okRow then
                            failed = true
                        elseif row ~= nil then
                            if #pens < MAX_PENS then
                                pens[#pens + 1] = row
                            else
                                truncated = true
                            end
                            totals.animals = totals.animals + (row.animals or 0)
                            totals.oldAnimals = totals.oldAnimals + (row.oldAnimals or 0)
                            if (row.careRiskPercentPerCheck or 0) > 0 or (row.ageRiskPercentPerCheck or 0) > 0 then
                                totals.pensAtRisk = totals.pensAtRisk + 1
                            end
                            if row.belowThreshold then totals.pensBelowThreshold = totals.pensBelowThreshold + 1 end
                            if row.noWater then totals.pensNoWater = totals.pensNoWater + 1 end
                            if row.noStraw then totals.pensNoStraw = totals.pensNoStraw + 1 end
                        end
                    end
                end
            end
            totals.penCount = #pens
            totals.truncated = truncated
            totals.pens = pens
            out.byFarm = { [tostring(ctx.farmId)] = totals }
            if failed and out.readState == "ok" then
                out.readState = "partial"
            end
        end
        return out
    end,
})
