-- FS25 FarmDashboard | RfWeatherGuardDataCollector.lua | v0.3.0
-- Weather Guard sky/forecast aggregates (soft-detect; authority-only; never write).
-- Owner: Agent Cores
-- Handle: g_currentMission.weatherGuard (getfenv g_weatherGuard / g_WeatherGuard fallback)

RfWeatherGuardDataCollector = {}

local MOD_NAME = "FS25_WeatherGuard"
-- Weather Guard native horizon is 9 days ahead (today + 9).
local MAX_FORECAST_DAYS = 9

local function envGet(name)
    local ok, env = pcall(getfenv, 0)
    if ok and type(env) == "table" then
        return env[name]
    end
    return rawget(_G, name)
end

local function modLoaded()
    if _G.g_modIsLoaded and _G.g_modIsLoaded[MOD_NAME] then
        return true
    end
    if _G.g_modManager and _G.g_modManager.getActiveModByName then
        local ok, mod = pcall(function()
            return _G.g_modManager:getActiveModByName(MOD_NAME)
        end)
        if ok and mod ~= nil then
            return true
        end
    end
    local mission = _G.g_currentMission
    if mission and mission.weatherGuard ~= nil then
        return true
    end
    if envGet("g_weatherGuard") ~= nil or envGet("g_WeatherGuard") ~= nil then
        return true
    end
    return false
end

local function resolveGuard()
    local mission = _G.g_currentMission
    if mission and mission.weatherGuard ~= nil then
        return mission.weatherGuard
    end
    return envGet("g_weatherGuard") or envGet("g_WeatherGuard")
end

-- Reject NaN / ±inf so uncovered daily slots (engine sentinels) never ship.
local function finiteNumber(v)
    v = tonumber(v)
    if v == nil or v ~= v then
        return nil
    end
    if v == math.huge or v == -math.huge then
        return nil
    end
    return v
end

local function weatherTypeName(typeId)
    if typeId == nil then
        return nil
    end
    if type(typeId) == "string" then
        return string.lower(typeId)
    end
    local WT = _G.WeatherType
    if WT ~= nil and type(WT.getName) == "function" then
        local ok, n = pcall(WT.getName, typeId)
        if ok and type(n) == "string" and n ~= "" then
            return string.lower(n)
        end
    end
    return nil
end

-- PDA calendar uses getDailyForecast. Weather Guard's getForecastTemperature
-- samples getHourlyForecast(daysAhead*24), and Giants only wraps that clock
-- forward one day — so dayOffset >= 2 is usually nil even when rain/items fill.
local function readEngineDailyForecast(dayOffset)
    local mission = _G.g_currentMission
    local forecastObj = mission
        and mission.environment
        and mission.environment.weather
        and mission.environment.weather.forecast
    if type(forecastObj) ~= "table" or type(forecastObj.getDailyForecast) ~= "function" then
        return nil
    end
    local ok, daily = pcall(function()
        return forecastObj:getDailyForecast(dayOffset)
    end)
    if not ok or type(daily) ~= "table" then
        return nil
    end
    return {
        high = finiteNumber(daily.highTemperature),
        low = finiteNumber(daily.lowTemperature),
        weatherType = weatherTypeName(daily.forecastType),
    }
end

function RfWeatherGuardDataCollector.isModLoaded()
    return modLoaded()
end

function RfWeatherGuardDataCollector:init()
    RfWeatherGuardDataCollector._inc = nil
end

function RfWeatherGuardDataCollector:collectBegin()
    RfWeatherGuardDataCollector._inc = { done = false }
end

function RfWeatherGuardDataCollector:collectStep(_opts)
    RfWeatherGuardDataCollector._inc = nil
    if not modLoaded() then
        return true, { enabled = false }
    end

    local wg = resolveGuard()
    if wg == nil then
        return true, { enabled = true, sky = nil, forecast = {}, horizonDays = nil }
    end

    local ok, payload = pcall(function()
        local sky = nil
        if type(wg.getCurrentSky) == "function" then
            local sok, skyTbl = pcall(function() return wg:getCurrentSky() end)
            if sok and type(skyTbl) == "table" then
                sky = {
                    rainScale = tonumber(skyTbl.rainScale),
                    isRaining = skyTbl.isRaining,
                    cloudCoverage = tonumber(skyTbl.cloudCoverage),
                    temperature = tonumber(skyTbl.temperature),
                    humidity = tonumber(skyTbl.humidity),
                    weatherType = skyTbl.weatherType and tostring(skyTbl.weatherType) or nil,
                }
            end
        end

        local horizonDays = nil
        if type(wg.getForecastHorizonDays) == "function" then
            local hok, h = pcall(function() return wg:getForecastHorizonDays() end)
            if hok then
                horizonDays = tonumber(h)
            end
        end
        if horizonDays == nil and type(wg.getContext) == "function" then
            local cok, ctx = pcall(function() return wg:getContext() end)
            if cok and type(ctx) == "table" then
                horizonDays = tonumber(ctx.forecastHorizonDays)
            end
        end

        local forecast = {}
        local maxDay = MAX_FORECAST_DAYS
        if horizonDays ~= nil then
            maxDay = math.min(maxDay, math.max(0, math.floor(horizonDays)))
        end
        for dayOffset = 0, maxDay do
            local rain, temp, humidity = nil, nil, nil
            if type(wg.getForecastRain) == "function" then
                local rok, rv = pcall(function() return wg:getForecastRain(dayOffset) end)
                if rok then
                    rain = finiteNumber(rv)
                end
            end
            if type(wg.getForecastTemperature) == "function" then
                local tok, tv = pcall(function() return wg:getForecastTemperature(dayOffset) end)
                if tok then
                    temp = finiteNumber(tv)
                end
            end
            if type(wg.getForecastHumidity) == "function" then
                local hok, hv = pcall(function() return wg:getForecastHumidity(dayOffset) end)
                if hok then
                    humidity = finiteNumber(hv)
                end
            end

            local daily = readEngineDailyForecast(dayOffset)
            local minTemp = daily and daily.low or nil
            local maxTemp = daily and daily.high or nil
            local weatherType = daily and daily.weatherType or nil
            if temp == nil then
                if minTemp ~= nil and maxTemp ~= nil then
                    temp = (minTemp + maxTemp) * 0.5
                else
                    temp = minTemp or maxTemp
                end
            end

            if rain ~= nil or temp ~= nil or minTemp ~= nil or maxTemp ~= nil
                or humidity ~= nil or weatherType ~= nil then
                forecast[#forecast + 1] = {
                    dayOffset = dayOffset,
                    rain = rain,
                    temperature = temp,
                    minTemperature = minTemp,
                    maxTemperature = maxTemp,
                    humidity = humidity,
                    weatherType = weatherType,
                }
            end
        end

        return {
            enabled = true,
            sky = sky,
            forecast = forecast,
            horizonDays = horizonDays,
        }
    end)

    if ok and type(payload) == "table" then
        return true, payload
    end
    return true, { enabled = true, sky = nil, forecast = {}, horizonDays = nil }
end

function RfWeatherGuardDataCollector:collect()
    self:collectBegin()
    local done, payload = self:collectStep({})
    return payload or { enabled = false }
end
