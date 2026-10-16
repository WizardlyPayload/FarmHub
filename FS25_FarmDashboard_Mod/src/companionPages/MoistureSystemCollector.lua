-- FS25 FarmDashboard | companionPages/MoistureSystemCollector.lua | v1.0.0
-- Moisture System (Ozz, 2.0.0.8). Mission handles set in MoistureSystem:loadMap:
--   mission.MoistureSystem        currentMoisturePercent (0..1 map base), settings, objectInfo[uniqueId][fillTypeName]
--                                 = { moisture 0..1, quality 0..100 }, min/mid/maxHeight, missionStarted
--   mission.WeatherProfileSystem  profiles[id].displayName, getClampForMonth(month), getForecastData(0..2)
--   mission.dryingSystem          activeDryers[uniqueId], getSiloCropStatus, calculateETA
--   mission.irrigationSystem      boosts[farmlandId] = { value 0..1, graceUntil }, jobs[] (farm-tagged)
--   mission.baleRottingSystem     baleRainExposureTimes[baleUniqueId] = { exposure, peakExposure, status }
--   mod-env CropValueMap          Data[fillTypeIndex] crop windows, getQualityValue / getYieldMultiplier / getQualityGrade
-- The active weather scenario is hidden from players in game (they only see a jittered forecast), so it is
-- never exported. getForecastData is only called once the mod has rolled its own forecast offsets, so this
-- collector never rolls them. Sheds are skipped: their pile moisture needs density-map probes per pile.

local SILO_SCAN = 300
local SILO_LIMIT = 20
local SILO_CROPS = 8
local BALE_SCAN = 400
local JOB_LIMIT = 30
local BOOST_LIMIT = 40
local CROP_LIMIT = 40

local BALE_STATUS = { [1] = "gettingWet", [2] = "drying", [3] = "rottingSlowly", [4] = "rotting", [5] = "rottingQuickly" }

local function pct(value)
    if type(value) ~= "number" or value ~= value then
        return nil
    end
    return math.floor(value * 1000 + 0.5) / 10
end

local function currentMonth(ctx, ms)
    local env = ctx.mission and ctx.mission.environment
    local period = env and ctx.num(env.currentPeriod)
    if period == nil then
        return nil
    end
    local fn = type(ms.periodToMonth) == "function" and ms.periodToMonth or nil
    local month = fn and ctx.try(fn, period) or nil
    month = ctx.num(month)
    if month == nil then
        month = period + 2
        if month > 12 then
            month = month - 12
        end
    end
    return month
end

local function fillTypeName(ctx, index)
    local mgr = ctx.global("g_fillTypeManager")
    local name = mgr and ctx.call(mgr, "getFillTypeNameByIndex", index) or nil
    return type(name) == "string" and name or nil
end

local function ownerOf(ctx, object)
    if type(object) ~= "table" then
        return nil
    end
    local owner = ctx.call(object, "getOwnerFarmId")
    if owner == nil then
        owner = object.ownerFarmId
    end
    return ctx.num(owner)
end

local function readSettings(ctx, s)
    local function bool(v)
        if type(v) == "boolean" then
            return v
        end
        return nil
    end
    return {
        weatherProfile = type(s.weatherProfile) == "string" and ctx.clip(s.weatherProfile, 40) or nil,
        overrideWeather = bool(s.overrideWeather),
        moistureGainMultiplier = ctx.num(s.moistureGainMultiplier),
        moistureLossMultiplier = ctx.num(s.moistureLossMultiplier),
        teddingReductionPercent = pct(ctx.num(s.teddingMoistureReduction)),
        hayThresholdPercent = pct(ctx.num(s.hayConversionThreshold)),
        witheringEnabled = bool(s.witheringEnabled),
        baleRotEnabled = bool(s.baleRotEnabled),
        baleRotRate = ctx.num(s.baleRotRate),
        baleDryingRate = ctx.num(s.baleExposureDecayRate),
        qualityDecayMultiplier = ctx.num(s.qualityDecayMultiplier),
        dryingSpeedPercentPerHour = pct(ctx.num(s.dryingSpeed)),
        sellDryingChargeRate = ctx.num(s.sellDryingChargeRate),
        irrigationCostMultiplier = ctx.num(s.irrigationCostMultiplier),
        irrigationContractors = ctx.num(s.irrigationContractors),
        irrigationContractorCapacity = ctx.num(s.irrigationContractorCapacity),
    }
end

--- The mod's own elevation spread (getMoistureAtPosition): at most 2 points either side of the base value.
local function fieldRange(ms, base, clamp)
    local minH, midH, maxH = tonumber(ms.minHeight), tonumber(ms.midHeight), tonumber(ms.maxHeight)
    if clamp == nil or minH == nil or midH == nil or maxH == nil or maxH - minH <= 0 then
        return nil
    end
    local minM, maxM = clamp.min / 100, clamp.max / 100
    local up = math.min(0.02, 0.8 * (maxM - base))
    local down = math.min(0.02, 0.8 * (base - minM))
    local low = math.max(minM, math.min(maxM, base - math.max(0, down)))
    local high = math.max(minM, math.min(maxM, base + math.max(0, up)))
    return { low = pct(low), high = pct(high) }
end

local function readWeather(ctx, ms, wps, month)
    if type(wps) ~= "table" then
        return nil
    end
    local out = {}
    local profileId = type(ms.settings) == "table" and ms.settings.weatherProfile or nil
    local profile = type(wps.profiles) == "table" and profileId and wps.profiles[profileId] or nil
    if type(profile) == "table" and type(profile.displayName) == "string" then
        out.profileName = ctx.clip(profile.displayName, 60)
    end
    if month ~= nil then
        local clamp = ctx.call(wps, "getClampForMonth", month)
        if type(clamp) == "table" and ctx.num(clamp.min) and ctx.num(clamp.max) then
            out.monthRange = { min = ctx.round2(clamp.min), max = ctx.round2(clamp.max) }
        end
    end
    if type(wps.forecastOffsets) == "table" then
        local seasons = {}
        for index = 0, 2 do
            local data = ctx.call(wps, "getForecastData", index)
            if type(data) == "table" and type(data.months) == "table" then
                local months = ctx.list(data.months, 3, function(m)
                    if type(m) ~= "table" or ctx.num(m.month) == nil then
                        return nil
                    end
                    return {
                        month = ctx.num(m.month),
                        actual = m.isActual == true,
                        precipitation = ctx.round2(m.precipitation),
                        sun = ctx.round2(m.sun),
                        cloudy = ctx.round2(m.cloudy),
                        precipitationDiff = ctx.round2(m.precipitationDiff),
                    }
                end)
                seasons[#seasons + 1] = {
                    offset = index,
                    precipitation = ctx.round2(data.precipitation),
                    sun = ctx.round2(data.sun),
                    cloudy = ctx.round2(data.cloudy),
                    precipitationDiff = ctx.round2(data.precipitationDiff),
                    months = months,
                }
            end
        end
        if #seasons > 0 then
            out.forecast = seasons
        end
    end
    return out
end

local function readCrops(ctx, cropMap, base)
    if type(cropMap) ~= "table" or type(cropMap.Data) ~= "table" then
        return nil
    end
    local rows = {}
    local seen = 0
    for index, def in pairs(cropMap.Data) do
        seen = seen + 1
        if seen > CROP_LIMIT then
            break
        end
        local name = type(def) == "table" and fillTypeName(ctx, index) or nil
        if name and ctx.num(def.idealMin) and ctx.num(def.idealMax) then
            local row = {
                fillType = name,
                idealMinPercent = pct(def.idealMin),
                idealMaxPercent = pct(def.idealMax),
                witherPercent = pct(ctx.num(def.witherThreshold)),
            }
            if base ~= nil then
                local quality = type(cropMap.getQualityValue) == "function" and ctx.num(ctx.try(cropMap.getQualityValue, index, base)) or nil
                local yield = type(cropMap.getYieldMultiplier) == "function" and ctx.num(ctx.try(cropMap.getYieldMultiplier, index, base)) or nil
                row.qualityNow = quality and math.floor(quality) or nil
                row.yieldNow = yield and ctx.round2(yield) or nil
                if quality and type(cropMap.getQualityGrade) == "function" then
                    local ok, grade, factor = pcall(cropMap.getQualityGrade, index, math.floor(quality))
                    if ok then
                        row.gradeNow = ctx.num(grade)
                        row.priceFactorNow = ctx.round2(factor)
                    end
                end
                row.state = base < def.idealMin and "dry" or (base > def.idealMax and "wet" or "ideal")
            end
            rows[#rows + 1] = row
        end
    end
    table.sort(rows, function(a, b) return a.fillType < b.fillType end)
    return rows
end

local function siloLiters(ms, placeable)
    local byName, total = {}, 0
    local storages = type(ms.getSiloStorages) == "function" and ms.getSiloStorages(placeable) or nil
    if type(storages) ~= "table" then
        return byName, nil
    end
    for _, storage in ipairs(storages) do
        if type(storage) == "table" and type(storage.fillLevels) == "table" then
            for index, level in pairs(storage.fillLevels) do
                if type(level) == "number" and level > 0 then
                    byName[index] = (byName[index] or 0) + level
                    total = total + level
                end
            end
        end
    end
    return byName, total
end

local function readSilos(ctx, ms, drying, cropMap, fid)
    local system = ctx.mission and ctx.mission.placeableSystem
    local list = system and system.placeables
    if type(list) ~= "table" or type(ms.objectInfo) ~= "table" then
        return nil
    end
    local mgr = ctx.global("g_fillTypeManager")
    local silos, scanned, truncated = {}, 0, false
    for _, placeable in pairs(list) do
        scanned = scanned + 1
        if scanned > SILO_SCAN then
            truncated = true
            break
        end
        if type(placeable) == "table" and placeable.spec_silo ~= nil and placeable.uniqueId ~= nil
            and ownerOf(ctx, placeable) == fid then
            local info = ms.objectInfo[placeable.uniqueId]
            local isDrying = type(drying) == "table" and type(drying.activeDryers) == "table"
                and drying.activeDryers[placeable.uniqueId] ~= nil or false
            if type(info) == "table" and (next(info) ~= nil or isDrying) then
                if #silos >= SILO_LIMIT then
                    truncated = true
                    break
                end
                local okL, byIndex, total = pcall(siloLiters, ms, placeable)
                if not okL then
                    byIndex, total = {}, nil
                end
                local crops = {}
                for name, entry in pairs(info) do
                    if #crops >= SILO_CROPS then
                        truncated = true
                        break
                    end
                    if type(name) == "string" and type(entry) == "table" and ctx.num(entry.moisture) then
                        local index = mgr and ctx.call(mgr, "getFillTypeIndexByName", name) or nil
                        local row = {
                            fillType = name,
                            liters = index and byIndex[index] and math.floor(byIndex[index] + 0.5) or nil,
                            moisturePercent = pct(entry.moisture),
                            quality = ctx.num(entry.quality) and math.floor(entry.quality) or nil,
                        }
                        if index and type(cropMap) == "table" then
                            if type(cropMap.getIdealRange) == "function" then
                                local ok, _, idealMax = pcall(cropMap.getIdealRange, index)
                                if ok and ctx.num(idealMax) then
                                    row.idealMaxPercent = pct(idealMax)
                                    row.needsDrying = entry.moisture > idealMax
                                end
                            end
                            if row.quality and type(cropMap.getQualityGrade) == "function" then
                                local ok, grade, factor = pcall(cropMap.getQualityGrade, index, row.quality)
                                if ok then
                                    row.grade = ctx.num(grade)
                                    row.priceFactor = ctx.round2(factor)
                                end
                            end
                        end
                        crops[#crops + 1] = row
                    end
                end
                table.sort(crops, function(a, b) return a.fillType < b.fillType end)
                local eta = nil
                if drying and total and type(drying.getSiloCropStatus) == "function" and type(drying.calculateETA) == "function" then
                    local statuses = ctx.call(drying, "getSiloCropStatus", placeable, ms)
                    if type(statuses) == "table" then
                        eta = ctx.num(ctx.call(drying, "calculateETA", statuses, total, ms))
                    end
                end
                silos[#silos + 1] = {
                    farmId = fid,
                    name = ctx.clip(ctx.call(placeable, "getName") or "?", 60),
                    isDrying = isDrying,
                    etaHours = eta and ctx.round2(eta) or nil,
                    totalLiters = total and math.floor(total + 0.5) or nil,
                    crops = crops,
                }
            end
        end
    end
    table.sort(silos, function(a, b) return a.name < b.name end)
    return silos, truncated
end

local function readBales(ctx, rot, fid)
    if type(rot) ~= "table" or type(rot.baleRainExposureTimes) ~= "table" then
        return nil
    end
    local mission = ctx.mission
    local counts = { gettingWet = 0, drying = 0, rottingSlowly = 0, rotting = 0, rottingQuickly = 0 }
    local scanned, truncated, tracked = 0, false, 0
    for uniqueId, data in pairs(rot.baleRainExposureTimes) do
        scanned = scanned + 1
        if scanned > BALE_SCAN then
            truncated = true
            break
        end
        local bale = mission and ctx.call(mission, "getObjectByUniqueId", uniqueId) or nil
        local key = type(data) == "table" and BALE_STATUS[data.status] or nil
        if key and ownerOf(ctx, bale) == fid then
            counts[key] = counts[key] + 1
            tracked = tracked + 1
        end
    end
    counts.total = tracked
    counts.coverage = truncated and "sampled" or "complete"
    return counts
end

local function readIrrigation(ctx, irr, fid)
    if type(irr) ~= "table" then
        return nil
    end
    local env = ctx.mission and ctx.mission.environment
    local today = env and ctx.num(env.currentMonotonicDay)
    local hour = env and ctx.num(env.currentHour)
    local farmlands = ctx.global("g_farmlandManager")
    local function farmlandName(id)
        local land = farmlands and ctx.call(farmlands, "getFarmlandById", id) or nil
        local name = land and (ctx.call(land, "getName") or land.name) or nil
        return ctx.clip(name ~= nil and tostring(name) or tostring(id), 60)
    end
    local jobs = {}
    if type(irr.jobs) == "table" then
        for _, job in ipairs(irr.jobs) do
            if #jobs >= JOB_LIMIT then
                break
            end
            if type(job) == "table" and ctx.num(job.farmId) == fid and ctx.num(job.farmlandId) then
                local hours, worked = ctx.num(job.hours) or 0, ctx.num(job.hoursWorked) or 0
                local startDay, startHour = ctx.num(job.startDay), ctx.num(job.startHour)
                local elapsed = (today and hour and startDay and startHour) and ((today - startDay) * 24 + (hour - startHour)) or nil
                jobs[#jobs + 1] = {
                    farmId = fid,
                    farmlandId = job.farmlandId,
                    name = farmlandName(job.farmlandId),
                    boostPercent = pct(ctx.num(job.targetBoost)),
                    daysAhead = (today and startDay) and math.max(0, startDay - today) or nil,
                    startHour = startHour,
                    hours = hours,
                    hoursWorked = worked,
                    price = ctx.round2(job.price),
                    state = (elapsed ~= nil and elapsed >= 0 and worked < hours) and "working" or "booked",
                }
            end
        end
    end
    table.sort(jobs, function(a, b) return (a.daysAhead or 0) * 24 + (a.startHour or 0) < (b.daysAhead or 0) * 24 + (b.startHour or 0) end)
    local boosts = {}
    if type(irr.boosts) == "table" and farmlands then
        local seen = 0
        for farmlandId, boost in pairs(irr.boosts) do
            seen = seen + 1
            if seen > BOOST_LIMIT * 4 or #boosts >= BOOST_LIMIT then
                break
            end
            local owner = ctx.num(ctx.call(farmlands, "getFarmlandOwner", farmlandId))
            if owner == fid and type(boost) == "table" and ctx.num(boost.value) then
                boosts[#boosts + 1] = {
                    farmId = fid,
                    farmlandId = farmlandId,
                    name = farmlandName(farmlandId),
                    boostPercent = pct(boost.value),
                    holding = boost.graceUntil ~= nil,
                }
            end
        end
    end
    table.sort(boosts, function(a, b) return (a.boostPercent or 0) > (b.boostPercent or 0) end)
    return jobs, boosts
end

CompanionPages.register({
    key = "moistureSystem",
    modNames = { "FS25_MoistureSystem", "FS25_354130_Moisture_System" },
    substrings = { "moisturesystem", "moisture_system" },
    collect = function(ctx)
        local mission = ctx.mission
        local ms = mission and mission.MoistureSystem or nil
        if type(ms) ~= "table" then
            ms = ctx.symbol("MoistureSystem")
        end
        if type(ms) ~= "table" or type(ms.settings) ~= "table" then
            return nil
        end
        local out = { settings = readSettings(ctx, ms.settings) }
        if ms.missionStarted == false then
            out.pending = true
            out.readState = "settings-only"
            return out
        end
        local wps = mission and mission.WeatherProfileSystem or nil
        local cropMap = ctx.symbol("CropValueMap")
        local month = currentMonth(ctx, ms)
        local base = ctx.num(ms.currentMoisturePercent)
        if base ~= nil and (base < 0 or base > 1) then
            base = nil
        end
        out.month = month
        out.weather = readWeather(ctx, ms, wps, month)
        if base ~= nil then
            out.baseMoisturePercent = pct(base)
            local range = out.weather and out.weather.monthRange or nil
            out.fieldRange = fieldRange(ms, base, range)
        end
        out.crops = readCrops(ctx, cropMap, base)

        local fid = ctx.farmId
        if fid ~= nil and fid > 0 then
            local farm = {}
            local silos, siloTruncated = readSilos(ctx, ms, mission and mission.dryingSystem, cropMap, fid)
            if silos then
                out.silos = silos
                local drying, needs, low = 0, 0, 0
                for _, silo in ipairs(silos) do
                    if silo.isDrying then
                        drying = drying + 1
                    end
                    for _, crop in ipairs(silo.crops) do
                        if crop.needsDrying then
                            needs = needs + 1
                        end
                        if crop.grade and crop.grade >= 3 then
                            low = low + 1
                        end
                    end
                end
                farm.siloCount = #silos
                farm.dryingCount = drying
                farm.needsDryingCount = needs
                farm.lowGradeCount = low
                farm.siloCoverage = siloTruncated and "sampled" or "complete"
            end
            if ms.settings.baleRotEnabled ~= false then
                farm.bales = readBales(ctx, mission and mission.baleRottingSystem, fid)
            end
            local jobs, boosts = readIrrigation(ctx, mission and mission.irrigationSystem, fid)
            if jobs then
                out.irrigationJobs = jobs
                out.irrigationBoosts = boosts
                local spend = 0
                for _, job in ipairs(jobs) do
                    spend = spend + (job.price or 0)
                end
                farm.irrigation = { jobCount = #jobs, boostedCount = #boosts, bookedSpend = ctx.round2(spend) }
            end
            out.byFarm = { [tostring(fid)] = farm }
        end

        if base == nil or out.crops == nil then
            out.readState = "partial"
        elseif out.byFarm == nil then
            out.readState = "settings-only"
        else
            out.readState = "ok"
        end
        return out
    end,
})
