-- FS25 FarmDashboard | companionPages/DynamicMarketCollector.lua | v1.0.0
-- Dynamic Market: DynamicMarket (mod env) scales selling-station prices per market group each period.
-- Factors are a deterministic hash of map, year and period (buildMarketFactorForGroup), so the next
-- period's outlook is the mod's own model; with daily recalculation on it is only a rough guide.
-- Station sell pressure: __stationPressure[station][fillTypeIndex] = { percent, peakPercent, ... }.
-- buildMarketOverviewRows (the in-game menu) walks every station and storage: not called here.

local MAX_PRESSURE = 30
local MAX_FAVORITES = 30
local SCAN_STATIONS = 200
local PRICE_BASE_NORMAL = 1
local DAILY_ENABLED = 2
local VANILLA_ENABLED = 2

local function fillTypeInfo(ctx, index)
    local ftm = ctx.global("g_fillTypeManager")
    if type(ftm) ~= "table" then
        return nil, nil
    end
    local ft = ctx.call(ftm, "getFillTypeByIndex", index)
    if type(ft) ~= "table" then
        return nil, nil
    end
    return ctx.clip(ft.name, 40), ctx.clip(ft.title, 60)
end

local function fillTypeByName(ctx, name)
    local ftm = ctx.global("g_fillTypeManager")
    if type(ftm) ~= "table" then
        return nil
    end
    local ft = ctx.call(ftm, "getFillTypeByName", name)
    return type(ft) == "table" and ft or nil
end

local function stationName(ctx, dm, station)
    local name = ctx.call(station, "getName")
    if name == nil and type(station.owningPlaceable) == "table" then
        name = ctx.call(dm, "getPlaceableDisplayName", station.owningPlaceable)
            or ctx.call(station.owningPlaceable, "getName")
    end
    return ctx.clip(name, 60)
end

local function readGroup(ctx, dm, name, data, period)
    local curve = type(dm.CURVES) == "table" and dm.CURVES[name] or nil
    local cfg = type(dm.MARKET_GROUPS) == "table" and dm.MARKET_GROUPS[name] or nil
    local factor = type(data) == "table" and ctx.num(data.factor) or ctx.num(ctx.call(dm, "getMarketFactor", name))
    return {
        key = name,
        title = ctx.clip(ctx.call(dm, "getMarketGroupDisplayName", name), 60),
        factor = factor and math.floor(factor * 10000 + 0.5) / 10000 or nil,
        changePercent = factor and ctx.round2((factor - 1) * 100) or nil,
        trend = ctx.clip(ctx.call(dm, "getTrendDirection", name), 10),
        weather = type(data) == "table" and ctx.round2(data.weather) or nil,
        supply = type(data) == "table" and ctx.round2(data.supply) or nil,
        demand = type(data) == "table" and ctx.round2(data.demand) or nil,
        seasonalSupply = type(data) == "table" and ctx.round2(data.seasonalSupplyPressure) or nil,
        volatility = cfg and ctx.round2(cfg.volatility) or nil,
        curve = ctx.list(curve, 12, function(v)
            return ctx.round2(v)
        end),
        curveNow = (curve and period) and ctx.round2(curve[period]) or nil,
    }
end

local function outlook(ctx, dm, name, period, year, mapName)
    local nextPeriod = period % 12 + 1
    local nextYear = period == 12 and year + 1 or year
    local factor = ctx.call(dm, "buildMarketFactorForGroup", name, nextPeriod, nextYear, mapName)
    factor = ctx.num(factor)
    return factor and ctx.round2((factor - 1) * 100) or nil
end

local function readPressure(ctx, dm)
    local rows = {}
    local pressure = dm.__stationPressure
    if type(pressure) ~= "table" then
        return rows, 0
    end
    local scanned, active = 0, 0
    for station, byFillType in pairs(pressure) do
        scanned = scanned + 1
        if scanned > SCAN_STATIONS then
            break
        end
        if type(station) == "table" and type(byFillType) == "table" then
            for fillTypeIndex, entry in pairs(byFillType) do
                local pct = type(entry) == "table" and ctx.num(entry.percent) or nil
                if pct and pct > 0 then
                    active = active + 1
                    if #rows < MAX_PRESSURE then
                        local name, title = fillTypeInfo(ctx, fillTypeIndex)
                        local peak = ctx.num(entry.peakPercent) or 0
                        rows[#rows + 1] = {
                            station = stationName(ctx, dm, station),
                            fillType = name,
                            title = title,
                            percent = ctx.round2(pct),
                            peakPercent = ctx.round2(peak),
                            recovering = peak > 0 and pct < peak,
                        }
                    end
                end
            end
        end
    end
    table.sort(rows, function(a, b)
        return (a.percent or 0) > (b.percent or 0)
    end)
    return rows, active
end

local function readFavorites(ctx, dm, groupFactors)
    local rows = {}
    if type(dm.__favorites) ~= "table" then
        return rows
    end
    for name, on in pairs(dm.__favorites) do
        if on == true and type(name) == "string" and #rows < MAX_FAVORITES then
            local ft = fillTypeByName(ctx, name)
            local group = ft and ctx.call(dm, "getGroup", ft) or nil
            local best = ft and ctx.num(ctx.call(dm, "getBestMonthForFillType", ft)) or nil
            rows[#rows + 1] = {
                fillType = ctx.clip(name, 40),
                title = ft and ctx.clip(ft.title, 60) or nil,
                group = ctx.clip(group, 40),
                changePercent = group and groupFactors[group] or nil,
                bestPeriod = best,
            }
        end
    end
    table.sort(rows, function(a, b)
        return tostring(a.title or a.fillType) < tostring(b.title or b.fillType)
    end)
    return rows
end

CompanionPages.register({
    key = "dynamicMarket",
    modNames = { "FS25_DynamicMarket", "FS25_366174_Dynamic_Market" },
    substrings = { "dynamicmarket" },
    collect = function(ctx)
        local dm = ctx.symbol("DynamicMarket")
        if type(dm) ~= "table" then
            dm = ctx.global("g_DynamicMarket")
        end
        if type(dm) ~= "table" then
            return nil
        end

        local key, period, year, mapName = ctx.call(dm, "getMarketKey")
        period = ctx.num(period) or ctx.envMonth()
        year = ctx.num(year)
        local daily = ctx.num(dm.dailyRecalcMode) == DAILY_ENABLED
        local vanilla = ctx.num(dm.vanillaMode) == VANILLA_ENABLED

        local groups, groupFactors = {}, {}
        local order = type(dm.GROUP_ORDER) == "table" and dm.GROUP_ORDER or {}
        local factors = type(dm.__marketFactors) == "table" and dm.__marketFactors or {}
        for _, name in ipairs(order) do
            if type(name) == "string" and #groups < 12 then
                local ok, row = pcall(readGroup, ctx, dm, name, factors[name], period)
                if ok and type(row) == "table" then
                    if period and year and type(mapName) == "string" and not vanilla then
                        row.nextChangePercent = outlook(ctx, dm, name, period, year, mapName)
                    end
                    groups[#groups + 1] = row
                    groupFactors[name] = row.changePercent
                end
            end
        end

        local pressureRows, pressureActive = readPressure(ctx, dm)
        local report = type(dm.__lastSaleMarketReport) == "table" and dm.__lastSaleMarketReport or {}
        local driver = type(dm.__marketDriverReport) == "table" and dm.__marketDriverReport or {}

        return {
            readState = #groups > 0 and "ok" or "partial",
            modVersion = ctx.clip(dm.VERSION, 20),
            marketKey = ctx.clip(key, 80),
            period = period,
            year = year,
            settings = {
                priceBase = ctx.num(dm.priceBaseMode) == PRICE_BASE_NORMAL and "normal" or "yearAverage",
                dailyRecalc = daily,
                vanillaMode = vanilla,
                stationPressure = dm.STATION_PRESSURE_ENABLED == true,
                pressureThresholdLiters = ctx.num(dm.STATION_PRESSURE_THRESHOLD_LITERS),
                pressurePercentPerStep = ctx.num(dm.STATION_PRESSURE_PERCENT_PER_STEP),
                pressureMaxPercent = ctx.num(dm.STATION_PRESSURE_MAX_PERCENT),
                pressureDecayPerHour = ctx.num(dm.STATION_PRESSURE_DECAY_PERCENT_PER_HOUR),
                marketNotices = dm.PLAYER_MARKET_NOTICES == true,
            },
            lastApply = {
                success = report.success == true,
                reason = ctx.clip(report.reason, 40),
                stations = ctx.num(report.stations),
                adjusted = ctx.num(report.adjusted),
                fillTypes = ctx.num(report.uniqueFillTypes),
                skipped = ctx.num(report.skipped),
                minFactor = ctx.round2(report.minFactor),
                maxFactor = ctx.round2(report.maxFactor),
            },
            strongestUp = ctx.clip(driver.strongestPositiveName, 40),
            strongestDown = ctx.clip(driver.strongestNegativeName, 40),
            groups = groups,
            pressure = pressureRows,
            pressureActive = pressureActive,
            favorites = readFavorites(ctx, dm, groupFactors),
        }
    end,
})
