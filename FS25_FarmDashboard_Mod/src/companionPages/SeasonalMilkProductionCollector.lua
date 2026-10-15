-- FS25 FarmDashboard | SeasonalMilkProductionCollector.lua
-- Dedicated page reader for FS25_SeasonalMilkProduction (Argsy Gaming).
-- Reads the mod's settings, its effective monthly curve (getSeasonalModifier, pure) and, per pen owned by
-- the export farm, the baseline litres/hour it captured next to the rate it currently applies.
-- Never calls applySeasonalModifiers / getHealthModifier (the latter can raise in-game notifications).

local MAX_SCAN = 300
local MAX_PENS = 24
local MAX_FILL_TYPES = 4

local SETTING_KEYS = {
    "healthImpactEnabled",
    "seasonalCowsEnabled",
    "seasonalBuffaloEnabled",
    "seasonalGoatsEnabled",
    "notifySeasonChange",
    "notifyPeakSeason",
    "notifyDryPeriod",
    "notifyHealthWarning",
}

local function ownedHusbandries(ctx)
    local out, truncated = {}, false
    local farmId = ctx.farmId
    local mission = ctx.mission
    if farmId == nil or type(mission) ~= "table" then
        return out, truncated
    end
    local list = type(mission.husbandrySystem) == "table" and mission.husbandrySystem.placeables or nil
    if type(list) ~= "table" then
        list = type(mission.placeableSystem) == "table" and mission.placeableSystem.placeables or nil
    end
    if type(list) ~= "table" then
        return out, truncated
    end
    local scanned = 0
    for _, placeable in pairs(list) do
        scanned = scanned + 1
        if scanned > MAX_SCAN then
            truncated = true
            break
        end
        if type(placeable) == "table" then
            local owner = ctx.num(ctx.call(placeable, "getOwnerFarmId")) or ctx.num(placeable.ownerFarmId)
            if owner == farmId then
                out[#out + 1] = placeable
            end
        end
    end
    return out, truncated
end

local function fillTypeName(ctx, index)
    local ftm = ctx.global("g_fillTypeManager")
    local name = ctx.call(ftm, "getFillTypeNameByIndex", index)
    return ctx.clip(name or tostring(index), 32)
end

local function readPen(ctx, prod, placeable, period, woolIndex)
    local milkSpec = placeable.spec_husbandryMilk
    local palletSpec = placeable.spec_husbandryPallets
    local hasMilk = type(milkSpec) == "table" and type(milkSpec.litersPerHour) == "table"
    local hasPallets = type(palletSpec) == "table" and type(palletSpec.litersPerHour) == "table"
    if not hasMilk and not hasPallets then
        return nil
    end
    local uid = ctx.call(prod, "getPlaceableId", placeable)
    local baselines = type(prod.baselineRates) == "table" and uid ~= nil and prod.baselineRates[uid] or nil
    local kind = hasMilk and "milk" or "pallets"
    local current = hasMilk and milkSpec.litersPerHour or palletSpec.litersPerHour

    local baseSum, currentSum, types = 0, 0, {}
    local anyBaseline = false
    if type(baselines) == "table" then
        for fillType, base in pairs(baselines) do
            local b = ctx.num(base)
            if b ~= nil and b > 0 and fillType ~= woolIndex then
                anyBaseline = true
                baseSum = baseSum + b
                currentSum = currentSum + (ctx.num(current[fillType]) or 0)
                if #types < MAX_FILL_TYPES then
                    types[#types + 1] = fillTypeName(ctx, fillType)
                end
            end
        end
    end
    if kind == "pallets" and not anyBaseline then
        -- Sheep-only pallet pens never get a milk baseline; they belong to the wool mod.
        return nil
    end

    local health = nil
    local history = type(prod.healthHistory) == "table" and uid ~= nil and prod.healthHistory[uid] or nil
    if type(history) == "table" and period ~= nil then
        health = ctx.round2(history[period])
    end

    return {
        name = ctx.clip(ctx.call(placeable, "getName"), 60),
        kind = kind,
        animals = ctx.num(ctx.call(placeable, "getNumOfAnimals")),
        baselineCaptured = anyBaseline,
        baselineLph = anyBaseline and ctx.round2(baseSum) or nil,
        currentLph = anyBaseline and ctx.round2(currentSum) or nil,
        appliedRatio = (anyBaseline and baseSum > 0) and ctx.round2(currentSum / baseSum) or nil,
        avgHealth = health,
        fillTypes = types,
    }
end

CompanionPages.register({
    key = "seasonalMilkProduction",
    modNames = { "FS25_SeasonalMilkProduction", "FS25_365513_Seasonal_Milk_Production" },
    substrings = { "seasonalmilkproduction", "seasonal_milk_production" },
    collect = function(ctx)
        local prod = ctx.symbol("g_seasonalMilkProduction")
        local settings = ctx.symbol("g_seasonalMilkSettings")
        local settingsClass = ctx.symbol("SeasonalMilkSettings")
        if type(prod) ~= "table" and type(settings) ~= "table" then
            return nil
        end

        local out = { readState = "ok", settings = {} }
        if type(settings) == "table" then
            for _, key in ipairs(SETTING_KEYS) do
                if settings[key] == true or settings[key] == false then
                    out.settings[key] = settings[key]
                end
            end
        end
        if type(settingsClass) == "table" then
            out.minimumAgeMonths = ctx.num(settingsClass.MINIMUM_AGE)
            local pattern = settingsClass.SEASONAL_PATTERN
            if type(pattern) == "table" then
                local base, complete = {}, true
                for p = 1, 12 do
                    base[p] = ctx.num(pattern[p])
                    complete = complete and base[p] ~= nil
                end
                -- Arrays with holes get compacted by the sanitizer, which would shift months.
                if complete then
                    out.basePatternPercent = base
                end
            end
        end

        if type(prod) ~= "table" or prod.isInitialized ~= true then
            out.readState = "settings-only"
            out.initialized = false
            return out
        end
        out.initialized = true
        if prod.hemisphere == "north" or prod.hemisphere == "south" then
            out.hemisphere = prod.hemisphere
        end

        local period = ctx.num(ctx.call(prod, "getCurrentPeriod"))
        if period ~= nil and period >= 1 and period <= 12 then
            out.currentPeriod = math.floor(period)
        end

        local curve, failed = {}, false
        for p = 1, 12 do
            local modifier = ctx.num(ctx.call(prod, "getSeasonalModifier", p))
            if modifier == nil then
                failed = true
            else
                curve[p] = math.floor(modifier * 100 + 0.5)
            end
        end
        if not failed then
            out.monthlyPercent = curve
        end
        if out.currentPeriod ~= nil then
            out.currentPercent = curve[out.currentPeriod]
            local best, bestPeriod = nil, nil
            for step = 0, 11 do
                local p = ((out.currentPeriod - 1 + step) % 12) + 1
                if curve[p] ~= nil and (best == nil or curve[p] > best) then
                    best, bestPeriod = curve[p], p
                end
            end
            out.nextPeakPeriod = bestPeriod
            out.nextPeakPercent = best
        end

        if ctx.farmId ~= nil then
            local ftm = ctx.global("g_fillTypeManager")
            local woolIndex = ctx.call(ftm, "getFillTypeIndexByName", "WOOL")
            local owned, truncated = ownedHusbandries(ctx)
            local pens, baseTotal, currentTotal, withBaseline = {}, 0, 0, 0
            for _, placeable in ipairs(owned) do
                local okRow, row = pcall(readPen, ctx, prod, placeable, out.currentPeriod, woolIndex)
                if not okRow then
                    failed = true
                elseif row ~= nil then
                    if #pens < MAX_PENS then
                        pens[#pens + 1] = row
                    else
                        truncated = true
                    end
                    if row.baselineCaptured then
                        withBaseline = withBaseline + 1
                        baseTotal = baseTotal + (row.baselineLph or 0)
                        currentTotal = currentTotal + (row.currentLph or 0)
                    end
                end
            end
            out.byFarm = {
                [tostring(ctx.farmId)] = {
                    penCount = #pens,
                    pensWithBaseline = withBaseline,
                    baselineLph = ctx.round2(baseTotal),
                    currentLph = ctx.round2(currentTotal),
                    truncated = truncated,
                    pens = pens,
                },
            }
        end

        if failed then
            out.readState = "partial"
        end
        return out
    end,
})
