-- FS25 FarmDashboard | companionPages/RegionalCropCalendarCollector.lua | v1.0.0
-- Regional Crop Calendar (moji, 1.1.0.2). Mod-env reads:
--   g_regionalCropCalendar (RegionManager): selectedRegion, weatherEnabled, yieldEnabled,
--       strictSuitabilityEnabled, getRegionTitle(id)
--   RCC.RegionLoader.getRegion(id) / getRegionIds(): preset tables parsed from presets/*.xml
--       { title, group, climate, description, tip, anchor{name}, yield{mult,sigBonus}, weather.seasons[1..4],
--         crops[] {name, signature, suitable}, availability[] {name, suitable}, economy[] {name, priceScale}, sources[] }
--   RCC.MoistureService: active, bonusSteps, penaltySteps, dryStreak, snowPack, getFactor(), constants
--   RCC.CropAvailabilityService.blockedNames (set, only filled with strict suitability on)
--   RCC.CalendarService.appliedPresetId / unmanagedFruitTypes; Economy/Yield/WeatherService applied ids
-- The crop x period windows are read from the effective game calendar (g_fruitTypeManager seasonal growth
-- data), which the mod patches in place; that is what the game actually enforces for sowing and harvest.
-- The moisture balance is region-wide (one number), not per field.

local MAX_CROPS = 60
local SCAN_FRUITS = 200
local MAX_NAMES = 40
local MAX_ECONOMY = 30

local function nameList(ctx, rows, predicate)
    local out, seen = {}, {}
    if type(rows) ~= "table" then
        return out
    end
    for i = 1, #rows do
        local row = rows[i]
        if type(row) == "table" and type(row.name) == "string" and predicate(row) and not seen[row.name] then
            seen[row.name] = true
            out[#out + 1] = ctx.clip(row.name, 40)
            if #out >= MAX_NAMES then
                break
            end
        end
    end
    table.sort(out)
    return out
end

local function readRegion(ctx, rcc, id)
    local loader = type(rcc) == "table" and rcc.RegionLoader or nil
    if type(loader) ~= "table" or id == nil or id == "vanilla" then
        return nil
    end
    local region = ctx.try(loader.getRegion, id)
    if type(region) ~= "table" then
        return nil
    end
    local seasons = {}
    local weather = type(region.weather) == "table" and region.weather.seasons or nil
    if type(weather) == "table" then
        for index = 1, 4 do
            local s = weather[index]
            if type(s) == "table" then
                seasons[#seasons + 1] = {
                    season = index,
                    temperatureOffset = ctx.round2(s.temperatureOffset),
                    precipitationRatio = ctx.round2(s.precipitationRatio),
                }
            end
        end
    end
    local economy = {}
    if type(region.economy) == "table" then
        for i = 1, math.min(#region.economy, MAX_ECONOMY) do
            local e = region.economy[i]
            if type(e) == "table" and type(e.name) == "string" then
                economy[#economy + 1] = {
                    fillType = ctx.clip(e.name, 40),
                    priceScale = ctx.round2(e.priceScale),
                    pricePerLiter = ctx.round2(e.pricePerLiter),
                }
            end
        end
    end
    local yield = type(region.yield) == "table" and region.yield or {}
    local anchor = type(region.anchor) == "table" and region.anchor or {}
    local unsuitable = nameList(ctx, region.crops, function(c) return c.suitable == false end)
    for _, name in ipairs(nameList(ctx, region.availability, function(c) return c.suitable == false end)) do
        local dup = false
        for _, existing in ipairs(unsuitable) do
            if existing == name then
                dup = true
                break
            end
        end
        if not dup and #unsuitable < MAX_NAMES then
            unsuitable[#unsuitable + 1] = name
        end
    end
    table.sort(unsuitable)
    return {
        group = ctx.clip(region.group, 40),
        climate = ctx.clip(region.climate, 40),
        anchor = ctx.clip(anchor.name, 60),
        description = ctx.clip(region.description, 240),
        tip = ctx.clip(region.tip, 240),
        yieldMultiplier = ctx.round2(yield.mult),
        signatureBonus = ctx.round2(yield.sigBonus),
        signatureCrops = nameList(ctx, region.crops, function(c) return c.signature == true end),
        unsuitableCrops = unsuitable,
        calendarCrops = ctx.count(region.crops),
        seasons = seasons,
        economy = economy,
        economyCount = ctx.count(region.economy),
        sourceCount = ctx.count(region.sources),
    }
end

local function readMoisture(ctx, rcc)
    local ms = type(rcc) == "table" and rcc.MoistureService or nil
    if type(ms) ~= "table" then
        return nil
    end
    local factor = ctx.num(ctx.try(ms.getFactor))
    return {
        active = ms.active == true,
        bonusSteps = ctx.num(ms.bonusSteps),
        penaltySteps = ctx.num(ms.penaltySteps),
        dryStreak = ctx.num(ms.dryStreak),
        snowPack = ctx.num(ms.snowPack),
        factor = ctx.round2(factor),
        percent = factor ~= nil and math.floor((factor - 1) * 100 + 0.5) or nil,
        maxBonusSteps = ctx.num(ms.MAX_BONUS_STEPS),
        maxPenaltySteps = ctx.num(ms.MAX_PENALTY_STEPS),
        droughtAfter = ctx.num(ms.DROUGHT_AFTER),
        bonusPerMonth = ctx.num(ms.BONUS_PER_MONTH),
        penaltyPerMonth = ctx.num(ms.PENALTY_PER_MONTH),
    }
end

local function blockedCrops(ctx, rcc)
    local svc = type(rcc) == "table" and rcc.CropAvailabilityService or nil
    local names = type(svc) == "table" and svc.blockedNames or nil
    if type(names) ~= "table" then
        return nil
    end
    local out = {}
    for name, on in pairs(names) do
        if on == true and type(name) == "string" then
            out[#out + 1] = ctx.clip(name, 40)
            if #out >= MAX_NAMES then
                break
            end
        end
    end
    table.sort(out)
    return out
end

--- Effective sowing/harvest windows per fruit, same reading as the Fields companion panel.
local function readCalendar(ctx, service, region)
    local manager = ctx.global("g_fruitTypeManager")
    local fruits = type(manager) == "table" and ctx.call(manager, "getFruitTypes") or nil
    if type(fruits) ~= "table" then
        return nil, "unavailable", nil
    end
    local unmanaged = {}
    local list = type(service) == "table" and service.unmanagedFruitTypes or nil
    if type(list) == "table" then
        for i = 1, math.min(#list, SCAN_FRUITS) do
            if type(list[i]) == "string" then
                unmanaged[list[i]] = true
            end
        end
    end
    local rows, scanned, incomplete, truncated = {}, 0, false, false
    for _, fruit in pairs(fruits) do
        scanned = scanned + 1
        if scanned > SCAN_FRUITS or #rows >= MAX_CROPS then
            truncated = true
            break
        end
        if type(fruit) == "table" and type(fruit.name) == "string" then
            local data = fruit.growthDataSeasonal
            local readOk = true
            if type(fruit.getSeasonalGrowthData) == "function" then
                readOk, data = pcall(fruit.getSeasonalGrowthData, fruit)
            end
            if not readOk then
                incomplete = true
            elseif type(data) == "table" and type(data.periods) == "table" then
                local planting, harvest, known = {}, {}, 0
                for periodId = 1, 12 do
                    local info = data.periods[periodId]
                    if type(info) == "table" then
                        if info.plantingAllowed == true then
                            planting[#planting + 1] = periodId
                        end
                        if info.isHarvestable == true then
                            harvest[#harvest + 1] = periodId
                        end
                        if type(info.plantingAllowed) == "boolean" and type(info.isHarvestable) == "boolean" then
                            known = known + 1
                        end
                    end
                end
                if known < 12 then
                    incomplete = true
                end
                rows[#rows + 1] = {
                    crop = ctx.clip(fruit.name, 40),
                    plantingPeriods = planting,
                    harvestPeriods = harvest,
                    complete = known == 12,
                    source = (region == "vanilla" or unmanaged[fruit.name]) and "map-calendar" or "region",
                }
            end
        end
    end
    table.sort(rows, function(a, b) return a.crop < b.crop end)
    local state = incomplete and "partial" or "ok"
    return rows, state, truncated and "truncated" or "complete"
end

CompanionPages.register({
    key = "regionalCropCalendar",
    modNames = { "FS25_RegionalCropCalendar", "FS25_368342_Regional_Crop_Calendar" },
    substrings = { "regionalcropcalendar", "regional_crop_calendar" },
    collect = function(ctx)
        local mgr = ctx.symbol("g_regionalCropCalendar")
        if type(mgr) ~= "table" then
            return nil
        end
        local rcc = ctx.symbol("RCC")
        local region = mgr.selectedRegion
        if region == nil then
            region = ctx.call(mgr, "getSelectedRegion")
        end
        region = type(region) == "string" and region or nil
        local loader = type(rcc) == "table" and rcc.RegionLoader or nil
        local service = type(rcc) == "table" and rcc.CalendarService or nil
        local ids = type(loader) == "table" and ctx.try(loader.getRegionIds) or nil
        local out = {
            currentPeriod = ctx.envMonth(),
            selectedRegion = ctx.clip(region, 40),
            regionTitle = region and ctx.clip(ctx.call(mgr, "getRegionTitle", region), 60) or nil,
            isVanilla = region == "vanilla",
            regionCount = type(ids) == "table" and math.max(#ids - 1, 0) or nil,
            settings = {
                weatherEnabled = mgr.weatherEnabled == true,
                yieldEnabled = mgr.yieldEnabled == true,
                strictSuitabilityEnabled = mgr.strictSuitabilityEnabled == true,
            },
            region = readRegion(ctx, rcc, region),
            moisture = readMoisture(ctx, rcc),
            blockedCrops = blockedCrops(ctx, rcc),
            applied = type(rcc) == "table" and {
                calendar = type(service) == "table" and ctx.clip(service.appliedPresetId, 40) or nil,
                economy = type(rcc.EconomyService) == "table" and ctx.clip(rcc.EconomyService.appliedPresetId, 40) or nil,
                yield = type(rcc.YieldService) == "table" and ctx.clip(rcc.YieldService.appliedRegion, 40) or nil,
                weather = type(rcc.WeatherService) == "table" and ctx.clip(rcc.WeatherService.appliedRegion, 40) or nil,
            } or nil,
        }
        if region == nil then
            out.readState = "settings-only"
            out.calendarState = "unavailable"
            return out
        end
        if region ~= "vanilla" and (type(service) ~= "table" or service.appliedPresetId ~= region) then
            out.calendarState = "pending"
            out.readState = "partial"
            return out
        end
        local crops, state, coverage = readCalendar(ctx, service, region)
        out.crops = crops
        out.calendarState = state
        out.calendarCoverage = coverage
        out.readState = (state == "ok" and type(rcc) == "table") and "ok" or "partial"
        return out
    end,
})
