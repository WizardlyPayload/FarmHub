-- FS25 FarmDashboard | WeatherDataCollector.lua | v2.1.0

WeatherDataCollector = {}

function WeatherDataCollector:init()
    WeatherDataCollector._incWx = false
end

function WeatherDataCollector:collectBegin()
    WeatherDataCollector._incWx = true
end

function WeatherDataCollector:collectStep()
    if WeatherDataCollector._incWx then
        WeatherDataCollector._incWx = false
        return true, self:collect()
    end
    return true, {}
end

function WeatherDataCollector:collect()
    local weatherData = {}
    
    if not _G.g_currentMission or not _G.g_currentMission.environment or not _G.g_currentMission.environment.weather then
        return weatherData
    end
    
    local env = _G.g_currentMission.environment
    local weather = env.weather
    
    -- Get temperature - prioritize engine temperature updater, then property fallbacks
    local temperature = nil
    local tempSource = "default"
    
    local function setTemp(val, source)
        if type(val) == "number" and val == val then
            temperature = val
            tempSource = source
        end
    end

    if weather.temperatureUpdater and type(weather.temperatureUpdater.getTemperatureAtTime) == "function" then
        local dayTime = env.dayTime
        if dayTime == nil and type(env.getDayTime) == "function" then
            local dtOk, dt = pcall(function() return env:getDayTime() end)
            if dtOk then dayTime = dt end
        end
        if dayTime ~= nil then
            local ok, temp = pcall(function()
                return weather.temperatureUpdater:getTemperatureAtTime(dayTime)
            end)
            if ok then setTemp(temp, "temperatureUpdater:getTemperatureAtTime") end
        end
    end

    if temperature == nil and type(weather.getTemperatureAtTime) == "function" then
        local day = env.currentDay or 1
        local dayTime = env.dayTime or 0
        local ok, temp = pcall(function() return weather:getTemperatureAtTime(day, dayTime) end)
        if ok then setTemp(temp, "weather:getTemperatureAtTime") end
    end
    
    -- Property fallbacks (not forecast)
    if temperature == nil and weather.currentTemperature ~= nil then
        setTemp(weather.currentTemperature, "weather.currentTemperature")
    elseif temperature == nil and weather.temperature ~= nil then
        setTemp(weather.temperature, "weather.temperature")
    elseif temperature == nil and weather.currentTemp ~= nil then
        setTemp(weather.currentTemp, "weather.currentTemp")
    elseif temperature == nil and weather.actualTemperature ~= nil then
        setTemp(weather.actualTemperature, "weather.actualTemperature")
    elseif temperature == nil and weather.realTimeTemperature ~= nil then
        setTemp(weather.realTimeTemperature, "weather.realTimeTemperature")
    elseif temperature == nil and env.currentTemperature ~= nil then
        setTemp(env.currentTemperature, "env.currentTemperature")
    elseif temperature == nil and env.temperature ~= nil then
        setTemp(env.temperature, "env.temperature")
    elseif temperature == nil and weather.getCurrentTemperature and type(weather.getCurrentTemperature) == "function" then
        local success, temp = pcall(function() return weather:getCurrentTemperature() end)
        if success then setTemp(temp, "weather:getCurrentTemperature()") end
    elseif temperature == nil and env.getCurrentTemperature and type(env.getCurrentTemperature) == "function" then
        local success, temp = pcall(function() return env:getCurrentTemperature() end)
        if success then setTemp(temp, "env:getCurrentTemperature()") end
    end

    if temperature == nil then
        temperature = 20
    end
    
    -- Get weather type - prioritize actual current conditions
    local weatherType = 0
    local weatherSource = "default"
    
    if weather.currentWeatherType ~= nil then
        weatherType = weather.currentWeatherType
        weatherSource = "weather.currentWeatherType"
    elseif weather.weatherType ~= nil then
        weatherType = weather.weatherType
        weatherSource = "weather.weatherType"
    elseif weather.weatherTypeId ~= nil then
        weatherType = weather.weatherTypeId
        weatherSource = "weather.weatherTypeId"
    elseif weather.weatherTypeIndex ~= nil then
        weatherType = weather.weatherTypeIndex
        weatherSource = "weather.weatherTypeIndex"
    -- Try state-based weather properties
    elseif weather.actualWeatherType ~= nil then
        weatherType = weather.actualWeatherType
        weatherSource = "weather.actualWeatherType"
    elseif weather.realTimeWeatherType ~= nil then
        weatherType = weather.realTimeWeatherType
        weatherSource = "weather.realTimeWeatherType"
    -- Check if there's a getCurrentWeatherType function
    elseif weather.getCurrentWeatherType and type(weather.getCurrentWeatherType) == "function" then
        local success, wType = pcall(function() return weather:getCurrentWeatherType() end)
        if success and wType then
            weatherType = wType
            weatherSource = "weather:getCurrentWeatherType()"
        end
    end
    
    -- Get wind data
    local windSpeed = 0
    local windDirection = 0
    if weather.windSpeed ~= nil then
        windSpeed = weather.windSpeed
    elseif weather.windVelocity ~= nil then
        windSpeed = weather.windVelocity
    elseif weather.currentWindSpeed ~= nil then
        windSpeed = weather.currentWindSpeed
    elseif env.windSpeed ~= nil then
        windSpeed = env.windSpeed
    end
    
    if weather.windDirX ~= nil then
        windDirection = weather.windDirX
    elseif weather.windDirection ~= nil then
        windDirection = weather.windDirection
    elseif weather.windAngle ~= nil then
        windDirection = weather.windAngle
    end
    
    -- Get cloud coverage
    local cloudCoverage = 0
    if weather.cloudCoverage ~= nil then
        cloudCoverage = weather.cloudCoverage
    elseif weather.cloudiness ~= nil then
        cloudCoverage = weather.cloudiness
    elseif weather.clouds ~= nil then
        cloudCoverage = weather.clouds
    elseif weather.cloudLevel ~= nil then
        cloudCoverage = weather.cloudLevel
    end
    
    -- Get fog level
    local fogLevel = 0
    if weather.fogLevel ~= nil then
        fogLevel = weather.fogLevel
    elseif weather.fogDensity ~= nil then
        fogLevel = weather.fogDensity
    elseif weather.fogIntensity ~= nil then
        fogLevel = weather.fogIntensity
    elseif weather.visibility ~= nil then
        -- Inverse visibility (lower visibility = more fog)
        fogLevel = math.max(0, 1 - weather.visibility)
    end
    
    weatherData = {
        currentTemperature = temperature,
        currentWeather = self:getWeatherTypeName(weatherType),
        windSpeed = windSpeed,
        windDirection = windDirection,
        cloudCoverage = cloudCoverage,
        fogLevel = fogLevel,
        rainLevel = weather.rainLevel or weather.precipitation or weather.rain or 0,
        snowLevel = weather.snowLevel or weather.snow or weather.snowDepth or 0,
        timeSinceLastRain = weather.timeSinceLastRain or 0,
        forecast = self:collectForecast(weather)
    }

    local mission = _G.g_currentMission
    local ms = mission and mission.MoistureSystem
    if ms then
        local moistureBlock = { enabled = true }
        local pct = tonumber(ms.currentMoisturePercent)
        if pct ~= nil then
            moistureBlock.currentPercent = math.floor(pct * 1000 + 0.5) / 10
        end
        if ms.settings then
            moistureBlock.environment = ms.settings.environment
            moistureBlock.baleRotEnabled = ms.settings.baleRotEnabled == true
            moistureBlock.showFieldMoisture = ms.settings.showFieldMoisture == true
        end
        local ds = mission.dryingSystem
        if ds and ds.activeDryers then
            local n = 0
            for _ in pairs(ds.activeDryers) do n = n + 1 end
            if n > 0 then moistureBlock.dryingActiveCount = n end
        end
        weatherData.moisture = moistureBlock
    end
    
    return weatherData
end

function WeatherDataCollector:getWeatherTypeName(weatherType)
    local weatherTypes = {
        [0] = "sun",
        [1] = "rain",
        [2] = "cloudy",
        [3] = "snow",
        [4] = "fog",
        [5] = "hail"
    }
    
    return weatherTypes[weatherType] or "unknown"
end

function WeatherDataCollector:collectForecast(weather)
    local forecast = {}
    
    -- Try different forecast data structures
    if weather.forecast and type(weather.forecast) == "table" then
        -- Check if it's an array
        if #weather.forecast > 0 then
            for i = 1, math.min(7, #weather.forecast) do
                local forecastData = weather.forecast[i]
                if forecastData then
                    table.insert(forecast, {
                        day = i,
                        weatherType = self:getWeatherTypeName(
                            forecastData.weatherType or 
                            forecastData.weatherTypeIndex or 
                            forecastData.weather or 0
                        ),
                        minTemperature = forecastData.minTemperature or forecastData.minTemp or forecastData.tempMin or 15,
                        maxTemperature = forecastData.maxTemperature or forecastData.maxTemp or forecastData.tempMax or 25,
                        precipitationChance = forecastData.precipitationChance or forecastData.rainChance or forecastData.precipitation or 0
                    })
                end
            end
        end
    end
    
    -- If no forecast data found, generate a stable 3-day forecast.
    -- Seed from current game day so values are consistent within a day
    -- but change naturally as days progress — no random flicker on each collect.
    if #forecast == 0 then
        local currentTemp = weather.currentTemperature or 20
        local currentType = weather.currentWeatherType or 0
        local env2 = _G.g_currentMission and _G.g_currentMission.environment
        local seed = env2 and (env2.currentDay or 1) or 1

        for i = 1, 3 do
            -- Simple deterministic variation: different offset per day using seed
            local variation = ((seed * 7 + i * 13) % 5) - 2  -- produces -2..2
            table.insert(forecast, {
                day = i,
                weatherType = self:getWeatherTypeName(currentType),
                minTemperature = math.floor(currentTemp - 5 + variation),
                maxTemperature = math.floor(currentTemp + 5 + variation),
                precipitationChance = currentType == 1 and 70 or (currentType == 3 and 80 or 20)
            })
        end
    end
    
    return forecast
end