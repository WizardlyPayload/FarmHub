-- FS25 FarmDashboard | FarmDashboardDataCollector.lua | v2.1.1
-- Inter-module staggering: one collector slot per collectionCycleMs / N (same as v2).
-- Intra-module: collectors may expose collectBegin/collectStep (cooperative / batched).
-- data.json is emitted progressively as each module slice completes.

FarmDashboardDataCollector = {}
FarmDashboardDataCollector.data = {}
FarmDashboardDataCollector.moduleCache = {}
FarmDashboardDataCollector.slotAccumulator = 0

function FarmDashboardDataCollector:init()
    self.collectors = {
        animals    = AnimalDataCollector,
        vehicles   = VehicleDataCollector,
        weather    = WeatherDataCollector,
        fields     = FieldDataCollector,
        finance    = FinanceDataCollector,
        economy    = EconomyDataCollector,
        production = ProductionDataCollector
    }

    for name, collector in pairs(self.collectors) do
        if collector.init then
            collector:init()
        end
    end

    self:loadConfig()
    self:resetStaggerState()
end

function FarmDashboardDataCollector:resetStaggerState()
    self.moduleCache = {}
    self.staggerFirstRunDone = false
    self.nextSliceIdx = 1
    self.slotAccumulator = 0
    self._lastSliceGTime = nil
    self._firstWriteLogged = nil
    self._incActiveModule = nil
    self._cycleFresh = {}
    self._husbandryJob = nil
    self._slicePendingFinish = nil
    self._jsonWriteJob = nil
    if rawget(_G, "VehicleDataCollector") then
        VehicleDataCollector._inc = nil
    end
    if rawget(_G, "FieldDataCollector") then
        FieldDataCollector._fdCo = nil
        FieldDataCollector._yieldEvery = nil
        FieldDataCollector._baleYieldStride = nil
        FieldDataCollector._lastGameplayFlags = nil
    end
    if rawget(_G, "EconomyDataCollector") then
        EconomyDataCollector._ecoCo = nil
        EconomyDataCollector._yieldStride = nil
        EconomyDataCollector._yieldPartialEcon = nil
    end
    if rawget(_G, "ProductionDataCollector") then
        ProductionDataCollector._co = nil
    end
    if rawget(_G, "AnimalDataCollector") then
        AnimalDataCollector._co = nil
        AnimalDataCollector._yieldEvery = nil
    end
    if rawget(_G, "FinanceDataCollector") then
        FinanceDataCollector._incFin = false
    end
    if rawget(_G, "WeatherDataCollector") then
        WeatherDataCollector._incWx = false
    end
end

function FarmDashboardDataCollector:loadConfig()
    self.config = {
        interval            = 10000,
        collectionCycleMs   = 60000,
        enableAnimals       = true,
        enableVehicles      = true,
        enableWeather       = true,
        enableFields        = true,
        enableFinance       = true,
        enableEconomy       = true,
        enableProduction    = true,
        --- When true, FieldDataCollector prints a throttled line to log.txt after bale scans (see FieldDataCollector.lua).
        debugBaleScan       = false,
        --- Intra-module budgets (collectStep); see FieldDataCollector / VehicleDataCollector.
        fieldsPerFrame      = 1,
        baleEntitiesBudget  = 8,
        vehiclesPerFrame    = 2,
        animalsPerFrame      = 1,
        husbandryPlaceablesPerFrame = 1,
        jsonTopLevelKeysPerFrame    = 1,
        economyYieldStride          = 20,
        productionChainsPerYield    = 1,
        productionPlaceablesPerYield = 4,
    }

    local configPath = getUserProfileAppPath() .. "modSettings/FS25_FarmDashboard/config.xml"

    if fileExists(configPath) then
        local xmlFile = loadXMLFile("FarmDashboardConfig", configPath)
        if xmlFile ~= 0 then
            self.config.interval = getXMLInt(xmlFile, "farmDashboard.settings#updateInterval") or self.config.interval
            local cycleMs = getXMLInt(xmlFile, "farmDashboard.settings#collectionCycleMs")
            if cycleMs and cycleMs > 0 then
                self.config.collectionCycleMs = cycleMs
            else
                -- Legacy configs: stretch one old tick across ~7 modules → full cycle length
                self.config.collectionCycleMs = math.max(60000, (self.config.interval or 10000) * 7)
            end
            self.config.enableAnimals    = Utils.getNoNil(getXMLBool(xmlFile, "farmDashboard.modules#animals"),    true)
            self.config.enableVehicles   = Utils.getNoNil(getXMLBool(xmlFile, "farmDashboard.modules#vehicles"),   true)
            self.config.enableWeather    = Utils.getNoNil(getXMLBool(xmlFile, "farmDashboard.modules#weather"),    true)
            self.config.enableFields     = Utils.getNoNil(getXMLBool(xmlFile, "farmDashboard.modules#fields"),     true)
            self.config.enableFinance    = Utils.getNoNil(getXMLBool(xmlFile, "farmDashboard.modules#finance"),    true)
            self.config.enableEconomy    = Utils.getNoNil(getXMLBool(xmlFile, "farmDashboard.modules#economy"),    true)
            self.config.enableProduction = Utils.getNoNil(getXMLBool(xmlFile, "farmDashboard.modules#production"), true)
            self.config.debugBaleScan = Utils.getNoNil(getXMLBool(xmlFile, "farmDashboard.settings#debugBaleScan"), false)
            local fpf = getXMLInt(xmlFile, "farmDashboard.settings#fieldsPerFrame")
            if fpf and fpf > 0 then self.config.fieldsPerFrame = fpf end
            local beb = getXMLInt(xmlFile, "farmDashboard.settings#baleEntitiesBudget")
            if beb and beb > 0 then self.config.baleEntitiesBudget = beb end
            local vpf = getXMLInt(xmlFile, "farmDashboard.settings#vehiclesPerFrame")
            if vpf and vpf > 0 then self.config.vehiclesPerFrame = vpf end
            local hpp = getXMLInt(xmlFile, "farmDashboard.settings#husbandryPlaceablesPerFrame")
            if hpp and hpp > 0 then self.config.husbandryPlaceablesPerFrame = hpp end
            local jtk = getXMLInt(xmlFile, "farmDashboard.settings#jsonTopLevelKeysPerFrame")
            if jtk and jtk > 0 then self.config.jsonTopLevelKeysPerFrame = jtk end
            local eys = getXMLInt(xmlFile, "farmDashboard.settings#economyYieldStride")
            if eys and eys > 0 then self.config.economyYieldStride = eys end
            delete(xmlFile)
        end
    else
        createFolder(getUserProfileAppPath() .. "modSettings/FS25_FarmDashboard/")
        local xmlFile = createXMLFile("FarmDashboardConfig", configPath, "farmDashboard")
        setXMLInt(xmlFile, "farmDashboard.settings#updateInterval", self.config.interval)
        setXMLInt(xmlFile, "farmDashboard.settings#collectionCycleMs", self.config.collectionCycleMs)
        setXMLBool(xmlFile, "farmDashboard.settings#debugBaleScan", false)
        setXMLBool(xmlFile, "farmDashboard.modules#animals",    true)
        setXMLBool(xmlFile, "farmDashboard.modules#vehicles",   true)
        setXMLBool(xmlFile, "farmDashboard.modules#weather",    true)
        setXMLBool(xmlFile, "farmDashboard.modules#fields",     true)
        setXMLBool(xmlFile, "farmDashboard.modules#finance",    true)
        setXMLBool(xmlFile, "farmDashboard.modules#economy",    true)
        setXMLBool(xmlFile, "farmDashboard.modules#production", true)
        setXMLInt(xmlFile, "farmDashboard.settings#fieldsPerFrame", self.config.fieldsPerFrame)
        setXMLInt(xmlFile, "farmDashboard.settings#baleEntitiesBudget", self.config.baleEntitiesBudget)
        setXMLInt(xmlFile, "farmDashboard.settings#vehiclesPerFrame", self.config.vehiclesPerFrame)
        setXMLInt(xmlFile, "farmDashboard.settings#husbandryPlaceablesPerFrame", self.config.husbandryPlaceablesPerFrame)
        setXMLInt(xmlFile, "farmDashboard.settings#jsonTopLevelKeysPerFrame", self.config.jsonTopLevelKeysPerFrame)
        setXMLInt(xmlFile, "farmDashboard.settings#economyYieldStride", self.config.economyYieldStride)
        saveXMLFile(xmlFile)
        delete(xmlFile)
    end

    -- Keep staggered collection on a slow cadence by default: never faster than 60s per full pass.
    self.config.collectionCycleMs = math.max(60000, math.min(1800000, self.config.collectionCycleMs or 60000))
    self.config.fieldsPerFrame = math.max(1, math.min(12, self.config.fieldsPerFrame or 1))
    self.config.baleEntitiesBudget = math.max(4, math.min(128, self.config.baleEntitiesBudget or 8))
    self.config.vehiclesPerFrame = math.max(1, math.min(16, self.config.vehiclesPerFrame or 2))
    self.config.animalsPerFrame = math.max(1, math.min(8, self.config.animalsPerFrame or 1))
    self.config.husbandryPlaceablesPerFrame = math.max(1, math.min(8, self.config.husbandryPlaceablesPerFrame or 1))
    self.config.jsonTopLevelKeysPerFrame = math.max(1, math.min(20, self.config.jsonTopLevelKeysPerFrame or 1))
    self.config.economyYieldStride = math.max(8, math.min(120, self.config.economyYieldStride or 20))
    self.config.productionChainsPerYield = math.max(1, math.min(8, self.config.productionChainsPerYield or 1))
    self.config.productionPlaceablesPerYield = math.max(1, math.min(24, self.config.productionPlaceablesPerYield or 4))
    FarmDashboard.UPDATE_INTERVAL = self.config.collectionCycleMs
end

--- Stable order must match slice spacing (one module per slot over collectionCycleMs).
function FarmDashboardDataCollector:getEnabledCollectorOrder()
    local order = {}
    local seq = {
        { "animals",    "enableAnimals" },
        { "vehicles",   "enableVehicles" },
        { "fields",     "enableFields" },
        { "finance",    "enableFinance" },
        { "weather",    "enableWeather" },
        { "economy",    "enableEconomy" },
        { "production", "enableProduction" }
    }
    for _, row in ipairs(seq) do
        local name, flag = row[1], row[2]
        if self.config[flag] then
            table.insert(order, name)
        end
    end
    return order
end

function FarmDashboardDataCollector:assembleDataFromModuleCache()
    if not _G.g_currentMission then return nil end

    local mc = self.moduleCache
    local data = {
        timestamp  = _G.g_time or 0,
        status     = "active",
        gameTime   = self:getGameTime(),
        farmInfo   = self:getFarmInfo(),
        animals    = mc.animals or {},
        vehicles   = mc.vehicles or {},
        fields     = mc.fields or {},
        production = mc.production or {},
        finance    = mc.finance or {},
        weather    = mc.weather or {},
        economy    = mc.economy or {}
    }

    if rawget(_G, "FieldDataCollector") and FieldDataCollector.getCachedGameplayFlags then
        data.gameSettings = FieldDataCollector.getCachedGameplayFlags()
    end

    if data.finance and data.finance.money then
        data.money = data.finance.money
    end

    self.data = data
    return data
end

--- @return boolean hasIncrementalCollector
function FarmDashboardDataCollector:collectorSupportsIncremental(name)
    local c = self.collectors[name]
    return c ~= nil and type(c.collectBegin) == "function" and type(c.collectStep) == "function"
end

function FarmDashboardDataCollector:startModuleSlice(name, order)
    if self:collectorSupportsIncremental(name) then
        local c = self.collectors[name]
        local ok = pcall(function() c:collectBegin() end)
        if not ok then
            Logging.warning("[FarmDash] collectBegin failed for " .. tostring(name))
            self:runLegacyModuleSlice(name, order)
            return
        end
    end
    self._incActiveModule = name
end

--- After a module produces fresh data (partial or final), refresh in-memory payload without disk write.
function FarmDashboardDataCollector:refreshAssembledInMemory()
    local assembled = self:assembleDataFromModuleCache()
    if assembled then
        self.data = assembled
    end
end

--- When a module slice completes (full collect or incremental done), advance schedule and maybe flush JSON.
function FarmDashboardDataCollector:finishModuleSlice(name, order, usedIncremental)
    self._incActiveModule = nil
    local n = #order
    if n > 0 then
        self.nextSliceIdx = (self.nextSliceIdx or 1) % n + 1
    end

    self._cycleFresh[name] = true
    self:refreshAssembledInMemory()
    --- refreshAssembledInMemory already ran assembleDataFromModuleCache; avoid a second full merge before JSON defer.
    if self.data and type(self.data) == "table" then
        self:beginDeferredJsonWrite(self.data)
    end
    self:tryFlushAfterFullCycle(order)
end

--- Track full-cycle completion while still allowing progressive per-slice writes.
function FarmDashboardDataCollector:tryFlushAfterFullCycle(order)
    for _, n in ipairs(order) do
        if not self._cycleFresh[n] then return end
    end
    self._cycleFresh = {}
end

--- Run at most one incremental step for the active module (same frame as slot start is allowed).
function FarmDashboardDataCollector:runIncrementalActiveStep(order)
    local name = self._incActiveModule
    if not name then return end
    local c = self.collectors[name]
    if not c or not c.collectStep then
        self._incActiveModule = nil
        return
    end

    local opts = {
        batchSize = self.config.fieldsPerFrame or 8,
        animalBatch = self.config.animalsPerFrame or 2,
        baleBudget = self.config.baleEntitiesBudget or 48,
        vehicleBatch = self.config.vehiclesPerFrame or 12,
        economyYieldStride = self.config.economyYieldStride or 55,
        productionChainsPerYield = self.config.productionChainsPerYield or 2,
        productionPlaceablesPerYield = self.config.productionPlaceablesPerYield or 10,
    }

    local ok, done, payload = pcall(function() return c:collectStep(opts) end)
    if not ok then
        Logging.warning("[FarmDash] collectStep failed for " .. tostring(name))
        self.moduleCache[name] = {}
        self:finishModuleSlice(name, order, true)
        return
    end

    if name == "production" and done then
        local prod = payload or {}
        self.moduleCache.production = prod
        self:startHusbandryJobAfterProduction(order, true)
        if self._husbandryJob then
            self._incActiveModule = nil
        else
            self.moduleCache.production.husbandryTotals = {}
            self:finishModuleSlice("production", order, true)
        end
    else
        self.moduleCache[name] = payload or {}
    end

    --- Partial incremental steps skip refreshAssembledInMemory (full assemble every frame hitched while driving).

    if done and name ~= "production" then
        self:finishModuleSlice(name, order, true)
    end
end

--- Legacy synchronous collect for one module name.
function FarmDashboardDataCollector:runLegacyModuleSlice(name, order)
    local result = self:safeCollect(name)
    if name == "production" then
        local prod = result or {}
        self.moduleCache.production = prod
        self:startHusbandryJobAfterProduction(order, false)
        self:refreshAssembledInMemory()
        if self._husbandryJob then
            return
        end
        self.moduleCache.production.husbandryTotals = {}
        self:finishModuleSlice(name, order, false)
        return
    end
    self.moduleCache[name] = result or {}
    self:finishModuleSlice(name, order, false)
end

--- Consume one inter-module slot: start or continue incremental work, or run a full legacy collect.
function FarmDashboardDataCollector:consumeOneModuleSlot(order)
    local n = #order
    if n < 1 then return end

    local idx = self.nextSliceIdx or 1
    if idx > n then idx = 1 end
    local name = order[idx]

    if self:collectorSupportsIncremental(name) then
        self:startModuleSlice(name, order)
        --- First collectStep runs next frame (update drain) so slot boundary does not stack collectBegin + collectStep in one frame.
        return
    end

    self:runLegacyModuleSlice(name, order)
end

function FarmDashboardDataCollector:update(dt)
    if type(dt) ~= "number" then return end
    if not _G.g_currentMission then return end

    -- If the engine passes dt<=0 (pause / menu), advance the stagger timer using mission time when possible.
    local gt = _G.g_time
    local effDt = dt
    if effDt <= 0 and type(gt) == "number" and type(self._lastSliceGTime) == "number" and gt > self._lastSliceGTime then
        effDt = gt - self._lastSliceGTime
    end
    if type(gt) == "number" then
        self._lastSliceGTime = gt
    end

    local order = self:getEnabledCollectorOrder()
    local n = #order
    local cycleMs = self.config.collectionCycleMs

    --- Drain incremental / husbandry / deferred JSON even when effDt<=0 (pause, menu, zero-dt ticks).
    --- Otherwise mid-flight work never advances and data.json can stall permanently behind _jsonWriteJob.
    if self._incActiveModule then
        self:runIncrementalActiveStep(order)
    end
    if self._husbandryJob then
        self:husbandryTotalsStep()
    end
    if self._jsonWriteJob then
        self:jsonWriteStep()
    end

    if self._incActiveModule or self._husbandryJob or self._jsonWriteJob then
        return
    end

    if effDt <= 0 then return end

    -- All modules disabled in config: still emit data.json on a heartbeat (otherwise file never appears).
    if n < 1 then
        if not self.staggerFirstRunDone then
            self.staggerFirstRunDone = true
            self.nextSliceIdx = 1
            self.slotAccumulator = 0
            local assembled = self:assembleDataFromModuleCache()
            if assembled then self:writeDataToFile(assembled) end
            return
        end
        self.slotAccumulator = (self.slotAccumulator or 0) + effDt
        while self.slotAccumulator >= cycleMs do
            self.slotAccumulator = self.slotAccumulator - cycleMs
            local assembled = self:assembleDataFromModuleCache()
            if assembled then self:writeDataToFile(assembled) end
        end
        return
    end

    --- Next inter-module slot after this many ms of mission time (same units as collectionCycleMs / dt).
    --- Example: 60000 ms cycle, 5 modules enabled → ~12s between periodic export slot boundaries.
    local slotMs = cycleMs / n

    if not self.staggerFirstRunDone then
        self.staggerFirstRunDone = true
        self.nextSliceIdx = 1
        self.slotAccumulator = 0
        self:consumeOneModuleSlot(order)
        return
    end

    self.slotAccumulator = (self.slotAccumulator or 0) + effDt
    --- At most one inter-module slot per engine tick to avoid multi-collector spikes in a single frame.
    if self.slotAccumulator >= slotMs then
        self.slotAccumulator = self.slotAccumulator - slotMs
        self:consumeOneModuleSlot(order)
    end
end

--- Merge one placeable's husbandry fill readings into `totals` (farm id 1 only).
function FarmDashboardDataCollector:accumulateHusbandryTotalsForPlaceable(placeable, totals)
    if not placeable or type(totals) ~= "table" then return end
    local okFarm, isPlayer = pcall(function() return placeable:getOwnerFarmId() == 1 end)
    if not okFarm or not isPlayer then return end

    local function addFill(specObj)
        if not specObj then return end
        local fillLevel = specObj.fillLevel
        local fillType  = specObj.fillType

        if fillLevel and type(fillLevel) == "number" and fillLevel > 0 then
            local typeName = "UNKNOWN"
            if fillType and _G.g_fillTypeManager then
                local ftData = _G.g_fillTypeManager:getFillTypeByIndex(fillType)
                if ftData and ftData.name then
                    typeName = ftData.name
                end
            end
            totals[typeName] = (totals[typeName] or 0) + fillLevel
        end
    end

    addFill(placeable.spec_husbandryMilk)
    addFill(placeable.spec_husbandryLiquidManure)
    addFill(placeable.spec_husbandryManure)

    if placeable.spec_fillUnit and placeable.spec_fillUnit.fillUnits then
        for _, unit in pairs(placeable.spec_fillUnit.fillUnits) do
            if unit.fillType and unit.fillLevel and type(unit.fillLevel) == "number" and unit.fillLevel > 0 then
                local ftData = _G.g_fillTypeManager and _G.g_fillTypeManager:getFillTypeByIndex(unit.fillType)
                local typeName = (ftData and ftData.name) or "UNKNOWN"
                if typeName ~= "UNKNOWN" then
                    totals[typeName] = (totals[typeName] or 0) + unit.fillLevel
                end
            end
        end
    end
end

function FarmDashboardDataCollector:startHusbandryJobAfterProduction(order, incrementalFlag)
    self._slicePendingFinish = nil
    self._husbandryJob = nil
    local list = {}
    if _G.g_currentMission and _G.g_currentMission.husbandrySystem then
        for _, placeable in pairs(_G.g_currentMission.husbandrySystem.placeables or {}) do
            if placeable then
                local ok, isOurs = pcall(function() return placeable:getOwnerFarmId() == 1 end)
                if ok and isOurs then
                    table.insert(list, placeable)
                end
            end
        end
    end
    if #list < 1 then
        return
    end
    self._husbandryJob = { list = list, idx = 1, totals = {} }
    self._slicePendingFinish = { name = "production", order = order, incremental = incrementalFlag }
end

--- @return boolean true when job finished (or none)
function FarmDashboardDataCollector:husbandryTotalsStep()
    local job = self._husbandryJob
    if not job then return true end
    local per = self.config.husbandryPlaceablesPerFrame or 3
    local n = #job.list
    local hi = math.min(job.idx + per - 1, n)
    for i = job.idx, hi do
        local ok, err = pcall(function()
            self:accumulateHusbandryTotalsForPlaceable(job.list[i], job.totals)
        end)
        if not ok then
            Logging.warning("[FarmDash] husbandryTotalsStep placeable: " .. tostring(err))
        end
    end
    job.idx = hi + 1
    if job.idx > n then
        if self.moduleCache.production then
            self.moduleCache.production.husbandryTotals = job.totals
        end
        self._husbandryJob = nil
        self:refreshAssembledInMemory()
        local pending = self._slicePendingFinish
        self._slicePendingFinish = nil
        if pending then
            self:finishModuleSlice(pending.name, pending.order, pending.incremental)
        end
        return true
    end
    return false
end

--- Spread top-level JSON keys across frames, then write the file once.
function FarmDashboardDataCollector:beginDeferredJsonWrite(data)
    if not data or type(data) ~= "table" then return end
    local savegameDir = self:getSavegameDirName()
    local currentMapName = "Unknown Map"
    if _G.g_currentMission and _G.g_currentMission.missionInfo then
        local info = _G.g_currentMission.missionInfo
        if info.mapTitle and info.mapTitle ~= "" then
            currentMapName = info.mapTitle
        end
    end
    data.serverInfo = { mapName = currentMapName, saveSlot = savegameDir }
    self._jsonWriteJob = nil
    local keys = {}
    for k in pairs(data) do
        table.insert(keys, tostring(k))
    end
    table.sort(keys, function(a, b) return a < b end)
    self._jsonWriteJob = {
        data = data,
        keys = keys,
        i = 1,
        buf = "{" .. "\n",
    }
end

function FarmDashboardDataCollector:jsonWriteStep()
    local job = self._jsonWriteJob
    if not job then return true end
    local per = self.config.jsonTopLevelKeysPerFrame or 1
    local nk = #job.keys
    for _ = 1, per do
        if job.i > nk then break end
        local k = job.keys[job.i]
        local v = job.data[k]
        local escKey = tostring(k)
            :gsub('[\x00-\x1f]', '')
            :gsub('\\', '\\\\')
            :gsub('"', '\\"')
        local piece = '  "' .. escKey .. '": '
        local okJson, frag = pcall(function() return self:toJSON(v, 0) end)
        if not okJson then
            Logging.error("[FarmDash] json chunk toJSON failed: %s", tostring(frag))
            frag = "null"
        end
        job.buf = job.buf .. piece .. (frag or "null")
        if job.i < nk then
            job.buf = job.buf .. ","
        end
        job.buf = job.buf .. "\n"
        job.i = job.i + 1
    end
    if job.i > nk then
        job.buf = job.buf .. "}"
        local savegameDir = self:getSavegameDirName()
        self:_writeJsonStringToDisk(job.buf, savegameDir)
        self._jsonWriteJob = nil
        return true
    end
    return false
end

--- Write a fully built JSON string to data.json (I/O only).
function FarmDashboardDataCollector:_writeJsonStringToDisk(jsonData, savegameDir)
    if not jsonData or jsonData == "" then
        Logging.warning("[FarmDash] skip write: empty JSON string")
        return
    end
    savegameDir = savegameDir or self:getSavegameDirName()
    local dataPath = self:getDataOutputDir()
    local filePath = dataPath .. "data.json"
    local normPath = string.gsub(filePath, "\\", "/")
    local written = false

    if type(io) == "table" and type(io.open) == "function" then
        local file = io.open(normPath, "w") or io.open(filePath, "w")
        if file then
            file:write(jsonData)
            file:close()
            written = true
        end
    elseif not self._ioNilLogged then
        self._ioNilLogged = true
        Logging.error("[FarmDash] Lua io.open is not available; cannot write data.json.")
    end

    if not written and type(_G.saveFile) == "function" then
        local rel = "modSettings/FS25_FarmDashboard/" .. savegameDir .. "/data.json"
        local okSf = pcall(function() _G.saveFile(rel, jsonData) end)
        if okSf then
            written = true
        end
    end

    if written then
        self._ioNilLogged = nil
        if not self._firstWriteLogged then
            self._firstWriteLogged = true
            Logging.info("[FarmDash] data.json write OK: %s", tostring(normPath))
        end
        self._writeFailLogged = nil
        self._writeFailCount = 0
    else
        self._writeFailCount = (self._writeFailCount or 0) + 1
        if not self._writeFailLogged or self._writeFailCount % 40 == 0 then
            self._writeFailLogged = true
            Logging.error("[FarmDash] Could not write data.json (path: %s) [fail #%d]", tostring(normPath), self._writeFailCount)
        end
    end
end

--- FIX: Aggregate milk/manure/slurry totals across all husbandry buildings.
-- This provides the farm-wide storage numbers that pastures.js needs.
function FarmDashboardDataCollector:collectHusbandryTotals()
    local totals = {}
    if not _G.g_currentMission or not _G.g_currentMission.husbandrySystem then
        return totals
    end
    local ok, err = pcall(function()
        for _, placeable in pairs(_G.g_currentMission.husbandrySystem.placeables or {}) do
            self:accumulateHusbandryTotalsForPlaceable(placeable, totals)
        end
    end)
    if not ok then
        Logging.warning("[FarmDash] collectHusbandryTotals failed: " .. tostring(err))
    end
    return totals
end

function FarmDashboardDataCollector:safeCollect(collectorName)
    local collector = self.collectors[collectorName]
    if not collector or not collector.collect then return {} end

    local success, result = pcall(function() return collector:collect() end)
    if success then
        return result or {}
    else
        Logging.warning("[FarmDash] Failed to collect " .. tostring(collectorName))
        return {}
    end
end

function FarmDashboardDataCollector:getGameTime()
    if not _G.g_currentMission or not _G.g_currentMission.environment then return {} end
    local env = _G.g_currentMission.environment
    return {
        day          = env.currentDay         or 1,
        dayInPeriod  = env.currentDayInPeriod or 1,
        period       = env.currentPeriod      or 1,
        year         = env.currentYear        or 1,
        hour         = env.currentHour        or 0,
        minute       = env.currentMinute      or 0,
        dayTime      = env.dayTime            or 0,
        timeScale    = (_G.g_currentMission.missionInfo and _G.g_currentMission.missionInfo.timeScale) or 1
    }
end

function FarmDashboardDataCollector:getFarmInfo()
    local farms = {}
    if _G.g_farmManager then
        for _, farm in pairs(_G.g_farmManager.farms) do
            local farmData = {
                id      = farm.farmId,
                farmId  = farm.farmId,
                name    = farm.name   or ("Farm " .. tostring(farm.farmId)),
                color   = farm.color  or 0,
                loan    = farm.loan   or 0,
                money   = farm.money  or 0,
                players = {}
            }
            if farm.players then
                for _, player in pairs(farm.players) do
                    table.insert(farmData.players, {
                        name   = player.nickname or "Unknown",
                        id     = player.userId
                    })
                end
            end
            table.insert(farms, farmData)
        end
    end
    return farms
end

function FarmDashboardDataCollector:getSavegameDirName()
    local savegameDir = "default_save"
    if _G.g_currentMission and _G.g_currentMission.missionInfo then
        local info = _G.g_currentMission.missionInfo
        if info.savegameDirectoryName and info.savegameDirectoryName ~= "" then
            savegameDir = info.savegameDirectoryName
        elseif info.savegameIndex and info.savegameIndex > 0 then
            savegameDir = "savegame" .. tostring(info.savegameIndex)
        end
    end
    return savegameDir
end

--- modSettings/FS25_FarmDashboard/<saveSlot>/ (same folder as data.json)
function FarmDashboardDataCollector:getDataOutputDir()
    local dataPath = getUserProfileAppPath() .. "modSettings/FS25_FarmDashboard/" .. self:getSavegameDirName() .. "/"
    createFolder(dataPath)
    return dataPath
end

function FarmDashboardDataCollector:writeDataToFile(data)
    local savegameDir = self:getSavegameDirName()
    local currentMapName = "Unknown Map"
    if _G.g_currentMission and _G.g_currentMission.missionInfo then
        local info = _G.g_currentMission.missionInfo
        if info.mapTitle and info.mapTitle ~= "" then
            currentMapName = info.mapTitle
        end
    end
    data.serverInfo = { mapName = currentMapName, saveSlot = savegameDir }

    local okJson, jsonData = pcall(function() return self:toJSON(data, 0) end)
    if not okJson then
        Logging.error("[FarmDash] toJSON failed: %s", tostring(jsonData))
        return
    end
    self:_writeJsonStringToDisk(jsonData, savegameDir)
end

--- @param depth number|nil nil = compact (legacy); 0+ = pretty-print with 2-space indent
function FarmDashboardDataCollector:toJSON(data, depth)
    --- FieldDataCollector.lua uses this sentinel so `windrowType` can become JSON `null`.
    if type(data) == "string" and data == "__FD_JSON_NULL__" then
        return "null"
    end
    local compact = (depth == nil)
    local level   = compact and 0 or depth
    local ind     = (not compact) and string.rep("  ", level) or ""
    local ind1    = (not compact) and string.rep("  ", level + 1) or ""
    local nl      = compact and "" or "\n"
    local sp      = compact and "" or " "

    if type(data) == "table" then
        local isArray = true
        local count   = 0
        for k, v in pairs(data) do
            count = count + 1
            if type(k) ~= "number" or k ~= count then
                isArray = false
                break
            end
        end

        if count == 0 then
            if compact then return "{}" end
            return "{" .. nl .. ind .. "}"
        end

        if isArray and count > 0 then
            local result = "[" .. nl
            for i, v in ipairs(data) do
                if i > 1 then result = result .. "," .. nl end
                if not compact then result = result .. ind1 end
                result = result .. self:toJSON(v, compact and nil or (level + 1))
            end
            if not compact then result = result .. nl .. ind end
            return result .. "]"
        else
            local keys = {}
            for k in pairs(data) do
                table.insert(keys, k)
            end
            table.sort(keys, function(a, b)
                return tostring(a) < tostring(b)
            end)

            local result = "{" .. nl
            local first  = true
            for _, k in ipairs(keys) do
                local v = data[k]
                if not first then result = result .. "," .. nl end
                if not compact then result = result .. ind1 end
                first = false
                local key = tostring(k)
                    :gsub('[\x00-\x1f]', '')
                    :gsub('\\', '\\\\')
                    :gsub('"', '\\"')
                result = result .. '"' .. key .. '":' .. sp .. self:toJSON(v, compact and nil or (level + 1))
            end
            if not compact then result = result .. nl .. ind end
            return result .. "}"
        end
    elseif type(data) == "string" then
        local escaped = data
            :gsub('\\', '\\\\')
            :gsub('"',  '\\"')
            :gsub('\n', '\\n')
            :gsub('\r', '\\r')
            :gsub('\t', '\\t')
            :gsub('[\x00-\x08\x0b\x0c\x0e-\x1f]', '')
        return '"' .. escaped .. '"'
    elseif type(data) == "number" then
        if data ~= data or data == math.huge or data == -math.huge then return "null" end
        return tostring(data)
    elseif type(data) == "boolean" then
        return tostring(data)
    else
        return "null"
    end
end

function FarmDashboardDataCollector:getCurrentData() return self.data end

function FarmDashboardDataCollector:shutdown()
    for name, collector in pairs(self.collectors) do
        if collector.shutdown then collector:shutdown() end
    end
    if rawget(_G, "FieldDataCollector") then
        FieldDataCollector._fdCo = nil
        FieldDataCollector._yieldEvery = nil
        FieldDataCollector._baleYieldStride = nil
        FieldDataCollector._lastGameplayFlags = nil
    end
    if rawget(_G, "EconomyDataCollector") then
        EconomyDataCollector._ecoCo = nil
        EconomyDataCollector._yieldStride = nil
    end
    if rawget(_G, "ProductionDataCollector") then
        ProductionDataCollector._co = nil
    end
    if rawget(_G, "AnimalDataCollector") then
        AnimalDataCollector._co = nil
        AnimalDataCollector._yieldEvery = nil
    end
    self:resetStaggerState()
end
