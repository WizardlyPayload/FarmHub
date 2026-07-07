-- FS25 FarmDashboard | FarmDashboardDataCollector.lua | v2.3.0 (Plan v5)
-- Inter-module staggering: one collector slot per collectionCycleMs / N (same as v2).
-- Intra-module: coroutine slices by default (multi-frame); set useStateMachine_<name>=true for sync one-shot slices.
-- Row-count caps are the primary safety net; opportunistic wall-clock budgets are advisory.
-- data.json is emitted progressively as each module slice completes via table.concat parts.
--
-- =====================================================================================
-- WIRE FORMAT CONTRACTS (Phase 0 — must match livestockDetail.js header byte-for-byte)
-- =====================================================================================
--
-- 1. data.json (top-level adds): schemaVersion=1, serverTimeSec=<unix sec>, serverInfo.animalMode
--
-- 2. dirtyPens.json:
--    { schemaVersion=1, idScheme="composite-v1"|"integer-v1", updatedAt=<unix sec>,
--      animalMode="base"|"RL"|"unknown",
--      pens=[ {id=<id>, ts=<unix sec>, animalCount=<int>} ] }   (bounded 4096)
--
-- 3. details/animals_<id>.json:
--    { schemaVersion=1, idScheme=..., penId=<id>, placeableId=<int>,
--      generatedAt=<unix sec>, mode="base"|"RL", lod="full"|"sample",
--      animals=[...] }
--
-- 4. requests.json:
--    { schemaVersion=1, updatedAt=<unix sec>,
--      pens=[ {id=<int>, ts=<unix sec>} ] }   (bounded 256, drop > 300s old)
--
-- Both sides reject schemaVersion > 1; missing schemaVersion is treated as legacy
-- (only `data.json` accepts legacy reads with a one-time WARN).
-- =====================================================================================
--
-- LUA LOAD ORDER (audit / maintenance):
--   File-level `local function` helpers used from methods (e.g. _escapeJsonKey) MUST appear
--   *above* the first `function FarmDashboardDataCollector:...` that references them. In Lua,
--   a `local` defined below a method does not close over that method; the name becomes a
--   *global* lookup (nil) → "attempt to call a nil value" at runtime, and update() will spam
--   [FarmDash] Update error until fixed. JSON helpers live immediately after this block.
-- =====================================================================================

FarmDashboardDataCollector = {}
FarmDashboardDataCollector.data = {}
FarmDashboardDataCollector.moduleCache = {}
FarmDashboardDataCollector.slotAccumulator = 0

-- Plan v5 wire format constants
local DATA_SCHEMA_VERSION       = 1
local DIRTY_SCHEMA_VERSION      = 1
local DETAIL_SCHEMA_VERSION     = 1
local REQUESTS_SCHEMA_VERSION   = 1
local REQUESTS_MAX_BYTES        = 65536  -- 64 KiB cap on requests.json reads
local REQUESTS_MAX_ENTRIES      = 256
local REQUESTS_MAX_AGE_SEC      = 300
local DIRTY_MAX_ENTRIES         = 4096
local DIRTY_PENS_HARD_CAP       = 256    -- in-memory dirty set cap (B11)
local POST_LOAD_SILENCE_SEC     = 5      -- ignore inserts for first 5s after onStartMission (B11)
local POST_LOAD_COLLECTION_GRACE_SEC = 45 -- defer new collector slots after save load (CoursePlay / UI friendly)
local VEHICLE_SPAWN_GRACE_MS = 15000
local VEHICLE_SPAWN_GRACE_SERVER_MS = 45000
local VEHICLE_SPAWN_GRACE_SERVER_TAIL_MS = 15000
local VEHICLE_SPAWN_GRACE_CP_MS = 30000
local VEHICLE_SPAWN_GRACE_CP_TAIL_MS = 15000
local COURSEPLAY_FLEET_SETTLE_MS = 30000
local COURSEPLAY_POST_LOAD_SCAN_DELAY_MS = 45000

-- Must be declared before `jsonWriteStep` / any method that references them. In Lua, a `local`
-- below a method definition is not an upvalue of that method — the name resolves to a *global*
-- and is nil, which matches log: "attempt to call a nil value" on `_escapeJsonKey`.
local function _escapeJsonString(s)
    return s
        :gsub('\\', '\\\\')
        :gsub('"',  '\\"')
        :gsub('\n', '\\n')
        :gsub('\r', '\\r')
        :gsub('\t', '\\t')
        :gsub('[\x00-\x08\x0b\x0c\x0e-\x1f]', '')
end

local function _escapeJsonKey(s)
    return s
        :gsub('[\x00-\x1f]', '')
        :gsub('\\', '\\\\')
        :gsub('"', '\\"')
end

local function _formatNumber(n)
    if n ~= n then return "null" end
    if n == math.huge or n == -math.huge then return "null" end
    if n % 1 == 0 and n > -1e15 and n < 1e15 then
        return string.format("%d", n)
    end
    return string.format("%.14g", n)
end

--- Index → name map for all fill types (delegates to FillTypeUtils when loaded).
local function _buildFillTypeCatalog(data)
    local catalog = {}
    local function put(idx, name)
        local n = tonumber(idx)
        local nm = tostring(name or "")
        if n and nm ~= "" and not tonumber(nm) then
            catalog[tostring(n)] = nm
        end
    end

    if rawget(_G, "FillTypeUtils") and FillTypeUtils.rebuildCatalog then
        FillTypeUtils.rebuildCatalog()
        if FillTypeUtils.enrichCatalogFromData then
            FillTypeUtils.enrichCatalogFromData(data)
        end
        for idx, name in pairs(FillTypeUtils.catalog()) do
            put(idx, name)
        end
        if FillTypeUtils.catalogTitlesForJson then
            for idx, title in pairs(FillTypeUtils.catalogTitlesForJson()) do
                local key = tostring(idx)
                if not catalog[key] or catalog[key] == "" or tonumber(catalog[key]) then
                    put(idx, title)
                end
            end
        end
    end

    local mp = data and data.economy and data.economy.marketPrices
    if mp then
        if mp.fillTypesByIndex then
            for idx, name in pairs(mp.fillTypesByIndex) do put(idx, name) end
        end
        if mp.nameToIndex then
            for name, idx in pairs(mp.nameToIndex) do put(idx, name) end
        end
        for cropName, crop in pairs(mp.crops or {}) do
            if crop and crop.fillTypeIndex then
                put(crop.fillTypeIndex, cropName)
            end
        end
        for _, station in pairs(mp.sellPoints or {}) do
            if type(station) == "table" and type(station.prices) == "table" then
                for productName, priceInfo in pairs(station.prices) do
                    if priceInfo and priceInfo.fillTypeIndex then
                        put(priceInfo.fillTypeIndex, productName)
                    end
                end
            end
        end
    end

    return catalog
end

local function _resolveFillTypeName(idx, catalog)
    idx = tonumber(idx)
    if not idx then return nil end
    local key = tostring(idx)
    if catalog[key] then return catalog[key] end
    local ftm = rawget(_G, "g_fillTypeManager")
    if ftm and ftm.getFillTypeByIndex then
        local ok, ft = pcall(function() return ftm:getFillTypeByIndex(idx) end)
        if ok and ft and ft.name and tostring(ft.name) ~= "" and not tonumber(ft.name) then
            catalog[key] = tostring(ft.name)
            return catalog[key]
        end
    end
    if rawget(_G, "FillTypeUtils") and FillTypeUtils.nameForIndex then
        local name = FillTypeUtils.nameForIndex(idx)
        if name then
            catalog[key] = name
            return name
        end
    end
    if rawget(_G, "FillTypeUtils") and FillTypeUtils.titleForIndex then
        local title = FillTypeUtils.titleForIndex(idx)
        if title then
            catalog[key] = title
            return title
        end
    end
    return nil
end

--- Patch stock + bale payloads with resolved names after all modules have collected.
local function _finalizeFillTypeNames(data)
    if type(data) ~= "table" then return end
    if rawget(_G, "FillTypeUtils") and FillTypeUtils.enrichFromMissionPlaceables then
        FillTypeUtils.enrichFromMissionPlaceables()
    end
    if rawget(_G, "FillTypeUtils") and FillTypeUtils.enrichCatalogFromData then
        FillTypeUtils.enrichCatalogFromData(data)
    end
    local catalog = _buildFillTypeCatalog(data)
    data.fillTypeCatalog = catalog
    data.fillTypeTitles = {}
    if rawget(_G, "FillTypeUtils") and FillTypeUtils.catalogTitlesForJson then
        data.fillTypeTitles = FillTypeUtils.catalogTitlesForJson()
    end
    if rawget(_G, "FillTypeUtils") and FillTypeUtils.collectObservedIndices then
        for idx in pairs(FillTypeUtils.collectObservedIndices(data)) do
            local key = tostring(idx)
            if not catalog[key] or catalog[key] == "" or tonumber(catalog[key]) then
                local name = _resolveFillTypeName(idx, catalog)
                if not name and FillTypeUtils.displayForIndex then
                    name = FillTypeUtils.displayForIndex(idx)
                end
                if not name and FillTypeUtils.titleForIndex then
                    name = FillTypeUtils.titleForIndex(idx)
                end
                if name then catalog[key] = name end
            end
        end
        data.fillTypeCatalog = catalog
    end
    if rawget(_G, "FillTypeUtils") and FillTypeUtils.cropIndexMapForJson then
        data.cropFillTypeIndex = FillTypeUtils.cropIndexMapForJson()
    end

    if type(data.stock) == "table" and type(data.stock.byFarm) == "table" then
        for _, farm in pairs(data.stock.byFarm) do
            for _, item in ipairs(farm.items or {}) do
                local idx = tonumber(item.fillTypeIndex)
                if idx then
                    local name = _resolveFillTypeName(idx, catalog)
                    if not name and rawget(_G, "FillTypeUtils") and FillTypeUtils.displayForIndex then
                        name = FillTypeUtils.displayForIndex(idx)
                    end
                    if name then
                        item.fillType = name
                        catalog[tostring(idx)] = catalog[tostring(idx)] or name
                    elseif item.fillType and tonumber(item.fillType) then
                        item.fillType = ""
                    end
                    if (not item.fillType or item.fillType == "") and rawget(_G, "FillTypeUtils") and FillTypeUtils.titleForIndex then
                        local title = FillTypeUtils.titleForIndex(idx)
                        if title then
                            item.fillTypeDisplay = title
                            catalog[tostring(idx)] = catalog[tostring(idx)] or title
                        end
                    end
                end
            end
        end
        --- Merge resolved stock labels back into catalog (helps app when DS name maps are sparse).
        for _, farm in pairs(data.stock.byFarm) do
            for _, item in ipairs(farm.items or {}) do
                local idx = tonumber(item.fillTypeIndex)
                if idx then
                    local key = tostring(idx)
                    if item.fillType and item.fillType ~= "" then
                        catalog[key] = item.fillType
                    elseif item.fillTypeDisplay and item.fillTypeDisplay ~= "" then
                        catalog[key] = item.fillTypeDisplay
                    end
                end
            end
        end
        data.stock.fillTypeCatalog = catalog
        data.fillTypeCatalog = catalog
        data.stock.fillTypeTitles = data.fillTypeTitles
        if rawget(_G, "InventoryScan") and InventoryScan.applyStockMoistureToExport then
            InventoryScan.applyStockMoistureToExport(data.stock)
        end
    end

    if type(data.economy) == "table" and data.economy.marketPrices then
        data.economy.marketPrices.fillTypesByIndex = data.economy.marketPrices.fillTypesByIndex or {}
        for idx, name in pairs(catalog) do
            data.economy.marketPrices.fillTypesByIndex[tostring(idx)] = name
        end
        if data.fillTypeTitles then
            data.economy.marketPrices.fillTypeTitles = data.fillTypeTitles
            for idx, title in pairs(data.fillTypeTitles) do
                local key = tostring(idx)
                if not data.economy.marketPrices.fillTypesByIndex[key]
                    or data.economy.marketPrices.fillTypesByIndex[key] == ""
                    or tonumber(data.economy.marketPrices.fillTypesByIndex[key]) then
                    data.economy.marketPrices.fillTypesByIndex[key] = title
                end
            end
        end
    end
    if type(data.economy) == "table" then
        data.economy.fillTypeCatalog = catalog
        data.economy.fillTypeTitles = data.fillTypeTitles or {}
    end

    local function fixBaleBucket(bucket)
        if not bucket or type(bucket) ~= "table" then return bucket end
        if rawget(_G, "FillTypeUtils") and FillTypeUtils.reconcileBaleBucket then
            return FillTypeUtils.reconcileBaleBucket(bucket)
        end
        return bucket
    end

    if type(data.baleInventory) == "table" then
        if type(data.baleInventory.byFarm) == "table" then
            for _, row in pairs(data.baleInventory.byFarm) do
                if type(row) == "table" then
                    row.onField = fixBaleBucket(row.onField)
                    row.inStorage = fixBaleBucket(row.inStorage)
                    row.offField = fixBaleBucket(row.offField or row.inStorage)
                end
            end
        end
        data.baleInventory.onField = fixBaleBucket(data.baleInventory.onField)
        data.baleInventory.offField = fixBaleBucket(data.baleInventory.offField)
    end
end

-- =====================================================================================
-- FS25 Engine I/O compatibility (Foundation Lua surface differs by build):
--   * getFiles requires 3 args: getFiles(directory, patternString, recursiveBool).
--     (Passing bool as arg2 yields "Expected: String. Actual: Bool".)
--   * io.open is often sandboxed to mode "w" only — avoid "r"/"rb" (use readFile if present).
--   * copyFile requires 3 args on FS25 — try bool then numeric overloads best-effort.
--   * `os` may be nil — os.rename unavailable; use copy/delete or direct write.
-- =====================================================================================

local function _normalizeFilenameList(list)
    if type(list) ~= "table" then return {} end
    if #list > 0 then return list end
    local out = {}
    for _, name in pairs(list) do
        if type(name) == "string" then
            out[#out + 1] = name
        end
    end
    table.sort(out)
    return out
end

--- Returns an array of file names in `dir`, or nil. Never throws (uses pcall internally).
local function _tryGetFilesList(dir)
    if type(dir) ~= "string" then return nil end
    if type(getFiles) == "function" then
        local attempts = {
            function() return getFiles(dir, "*", false) end,
            function() return getFiles(dir, "*.*", false) end,
            function() return getFiles(dir, "*", true) end,
            function() return getFiles(dir, "*.*", true) end,
        }
        for _, fn in ipairs(attempts) do
            local ok, res = pcall(fn)
            if ok and type(res) == "table" then
                return _normalizeFilenameList(res)
            end
        end
    end
    if type(Files) == "table" and type(Files.new) == "function" then
        local ok, inst = pcall(function() return Files.new(dir) end)
        if ok and inst and type(inst.files) == "table" then
            local out = {}
            for _, file in pairs(inst.files) do
                if file and file.filename and not file.isDirectory then
                    out[#out + 1] = file.filename
                end
            end
            if #out > 0 then
                table.sort(out)
                return out
            end
        end
    end
    return nil
end

local function _ioReadBytes(f, maxBytes)
    if f == nil then return nil end
    if type(f.read) == "function" then
        local ok, data = pcall(function() return f:read(maxBytes) end)
        if ok and data ~= nil then return data end
    end
    if type(f.readAll) == "function" then
        local ok, data = pcall(function() return f:readAll() end)
        if ok and type(data) == "string" then
            if maxBytes and #data > maxBytes then
                return string.sub(data, 1, maxBytes)
            end
            return data
        end
    end
    if type(read) == "function" then
        local ok, data = pcall(function() return read(f, maxBytes) end)
        if ok and data ~= nil then return data end
    end
    return nil
end

--- Read at most `maxBytes` from a path. Avoids io.open(..., "r") on FS25 (often disallowed).
local function _readPathLimited(path, maxBytes)
    if type(path) ~= "string" then return nil end
    if type(readFile) == "function" then
        local ok, data = pcall(function() return readFile(path) end)
        if ok and type(data) == "string" then
            if maxBytes and #data > maxBytes then
                return string.sub(data, 1, maxBytes)
            end
            return data
        end
    end
    return nil
end

local function _pathExists(p)
    if type(p) ~= "string" then return false end
    if type(fileExists) == "function" then
        local ok, y = pcall(function() return fileExists(p) end)
        if ok and y then return true end
    end
    return false
end

--- Dedicated servers may omit debug.traceback; never call it blindly inside xpcall handlers.
local function _farmDashFormatError(err)
    local msg = tostring(err)
    if type(debug) == "table" and type(debug.traceback) == "function" then
        local okTb, tb = pcall(debug.traceback, "", 2)
        if okTb and type(tb) == "string" then
            return msg .. "\n" .. tb
        end
    end
    return msg
end

local function _probeCoroutinesAvailable()
    if type(coroutine) ~= "table" or type(coroutine.create) ~= "function" then
        return false
    end
    local ok, co = pcall(coroutine.create, function() end)
    return ok and co ~= nil
end

--- Incremental spread for these collectors relies on coroutine.resume/yield in collectStep.
local COROUTINE_INCREMENTAL_COLLECTORS = {
    economy = true,
    production = true,
}

local function _copyFileFs25BestEffort(src, dst)
    if type(copyFile) ~= "function" or type(src) ~= "string" or type(dst) ~= "string" then
        return false
    end
    local trials = {
        function() copyFile(src, dst, true) end,
        function() copyFile(src, dst, false) end,
        function() copyFile(src, dst, 1) end,
        function() copyFile(src, dst, 0) end,
    }
    for _, fn in ipairs(trials) do
        local ok = pcall(fn)
        if ok and _pathExists(dst) then return true end
    end
    return false
end

local function _parentDir(filePath)
    if type(filePath) ~= "string" or filePath == "" then return nil end
    return filePath:match("^(.+)[/\\][^/\\]+$")
end

--- Cache PDA overview.dds for the desktop fleet map (DLC maps are not in mods/*.zip).
function FarmDashboardDataCollector:_exportMapOverviewForDashboard()
    if self._mapOverviewExportDone then return end
    if not _G.g_currentMission or not _G.g_currentMission.missionInfo then return end
    local info = _G.g_currentMission.missionInfo
    local mapId = (info.mapId and tostring(info.mapId) ~= "") and tostring(info.mapId) or nil
    local mapTitle = (info.mapTitle and tostring(info.mapTitle) ~= "") and tostring(info.mapTitle) or nil
    if not mapId and not mapTitle then return end

    local key = mapId or mapTitle
    local destDir = getUserProfileAppPath() .. "modSettings/FS25_FarmDashboard/mapOverview/" .. key .. "/"
    createFolder(destDir)
    local destDds = destDir .. "overview.dds"

    local candidates = {}
    local function addCandidate(p)
        if type(p) == "string" and p ~= "" then
            candidates[#candidates + 1] = p
        end
    end

    if info.mapXMLFilename and type(info.mapXMLFilename) == "string" then
        local mapDir = _parentDir(info.mapXMLFilename)
        if mapDir then
            addCandidate(mapDir .. "/textures/ui/overview.dds")
            addCandidate(mapDir .. "/overview.dds")
        end
    end
    if info.filename and type(info.filename) == "string" then
        local mapDir = _parentDir(info.filename)
        if mapDir then
            addCandidate(mapDir .. "/textures/ui/overview.dds")
            addCandidate(mapDir .. "/overview.dds")
        end
    end
    if _G.g_currentMission.baseDirectory and type(_G.g_currentMission.baseDirectory) == "string" then
        local base = _G.g_currentMission.baseDirectory
        if not base:match("[/\\]$") then base = base .. "/" end
        addCandidate(base .. "textures/ui/overview.dds")
        addCandidate(base .. "overview.dds")
        addCandidate(base .. "map/textures/ui/overview.dds")
        addCandidate(base .. "map/overview.dds")
    end

    for i = 1, #candidates do
        local src = candidates[i]
        if _pathExists(src) and _copyFileFs25BestEffort(src, destDds) then
            local meta = {
                mapId = mapId,
                mapTitle = mapTitle,
                sourcePath = src,
                exportedAt = os and os.time and os.time() or 0,
            }
            local metaPath = destDir .. "meta.json"
            if type(io) == "table" and type(io.open) == "function" then
                local okJson, jsonBody = pcall(function() return toJSON(meta) end)
                if okJson and jsonBody then
                    local fh = io.open(metaPath, "w")
                    if fh then
                        pcall(function() fh:write(jsonBody) end)
                        pcall(function() fh:close() end)
                    end
                end
            end
            self._mapOverviewExportDone = true
            FarmDashLog.dev("exported map overview for fleet map: %s", key)
            return
        end
    end
end

--- Cap for read/write fallback when rename/copy fail (atomic write recovery only). Bounds hitch vs huge tmp→final copies.
local MOVE_FALLBACK_READ_MAX = 2 * 1024 * 1024

--- Replace `src` with `dst` (move). Works when `os` is nil. Returns true on success.
local function _movePathBestEffort(src, dst)
    if type(src) ~= "string" or type(dst) ~= "string" then return false end
    if type(os) == "table" and type(os.rename) == "function" then
        pcall(function() os.rename(src, dst) end)
        if _pathExists(dst) then return true end
    end
    if type(deleteFile) == "function" and _copyFileFs25BestEffort(src, dst) then
        pcall(function() deleteFile(src) end)
        return true
    end
    local body = _readPathLimited(src, MOVE_FALLBACK_READ_MAX)
    if body and type(io) == "table" and type(io.open) == "function" then
        local o, e = io.open(dst, "w")
        if o then
            pcall(function() o:write(body) end)
            pcall(function() o:close() end)
            if type(deleteFile) == "function" then pcall(function() deleteFile(src) end) end
            if type(os) == "table" and type(os.remove) == "function" then
                pcall(function() os.remove(src) end)
            end
            return _pathExists(dst)
        end
    end
    return false
end

function FarmDashboardDataCollector:init()
    self.coroutinesAvailable = _probeCoroutinesAvailable()
    if not self.coroutinesAvailable and FarmDashLog and FarmDashLog.devWarn then
        FarmDashLog.devWarn(
            "Lua coroutines unavailable on this machine — fields/economy/production use sync collect per slot (no frame spread)"
        )
    end

    self.collectors = {
        animals    = AnimalDataCollector,
        vehicles   = VehicleDataCollector,
        weather    = WeatherDataCollector,
        fields     = FieldDataCollector,
        finance    = FinanceDataCollector,
        economy    = EconomyDataCollector,
        production = ProductionDataCollector,
        stock          = StockDataCollector,
        baleInventory  = BaleInventoryCollector,
        redTape        = RedTapeDataCollector,
    }

    for name, collector in pairs(self.collectors) do
        if collector.init then
            collector:init()
        end
    end

    self:loadConfig()
    self:resetStaggerState()

    if rawget(_G, "FarmDashDiagnostics") then
        FarmDashDiagnostics:setEnabled(self.config and self.config.diagnostics or false)
    end

    self:calibrateRowCapsAtBoot()

    self._animalMode = "unknown"
    -- Plan v5 B6: animalMode stability: requires 2 consecutive matching samples to leave
    -- "unknown", and 3 consecutive opposite samples to flip after promoted.
    self._animalModeSamples = { last = nil, agree = 0 }

    -- Plan v5 B11: _dirtyPens is bounded; insertions during the first POST_LOAD_SILENCE_SEC
    -- after onStartMission are ignored to absorb RL save-load event floods.
    self._dirtyPens = {}
    self._dirtyPensCount = 0
    self._dirtyPensDropLogAt = 0
    self._postLoadSilenceUntil = 0

    self._rlSubscribed = false
    self._rlSubscriptionTokens = {}
    self._rlEventErrLogAt = 0
    self._rlEventFirstHitLogged = false
    self._vehicleFleetSubscribed = false
    self._vehicleSpawnGraceLogAt = 0
    self._vehicleCountProbe = nil
    self._vehicleReadyCountProbe = nil
    self._vehicleSpawnGraceUntilMs = nil

    -- Plan v5 B5: pen ID scheme. Detected lazily on first pen access; either "composite-v1"
    -- (configFileName:id when available) or "integer-v1" (raw runtime id).
    self._idScheme = "integer-v1"
    self._idSchemeDetected = false

    -- Plan v5 B4: write-failure log throttling.
    self._writeFailLogAtSec = 0

    -- Plan v5 B4: tmp paths currently being written — `_sweepStaleTmpFiles` must not delete these.
    self._activeTmpPaths = {}

    -- Plan v5 B4: details/ writability self-test. When false, detail writes are skipped for
    -- the rest of the session.
    self._detailsDisabled = false

    -- Phase 7: detail file ledger. penKey -> { ts = lastWriteSec, animalCount = N, placeableId = N }.
    self._detailLedger = {}
    self._lastRequestPollSec = 0

    -- Plan v5 B8: prime _dirtyPens with all owned husbandry pens after the first full cycle.
    self._primedAfterFirstCycle = false

    -- Plan v5 B10: runtime auto-tuner state.
    self._lastAutoTuneSec = 0
    self._autoTuneInitialRowsPerSlice = self.config and self.config.animalRowsPerSlice or 256

    -- Plan v5 B8: rebuild detail ledger from disk so first cycle does not refetch every pen.
    self:_bootstrapDetailLedgerFromDisk()
end

--- Phase 5 + Plan v5 B6: tri-state animalMode detection with stability gates.
--- Sample is taken every _updateBody. Promotion to "base" or "RL" requires two consecutive
--- matching samples; demotion (flipping back to "unknown" or to the other side) requires
--- three consecutive opposite samples. This avoids spurious flips during save-load / mod hot-reload.
function FarmDashboardDataCollector:detectAnimalModeOnce()
    if not _G.g_currentMission or not _G.g_currentMission.husbandrySystem then
        -- Don't reset stable promotions just because the husbandry system is briefly absent.
        if self._animalMode == nil then self._animalMode = "unknown" end
        return
    end

    -- Fast path: known mod metadata
    local activeMod = nil
    if _G.g_modManager and _G.g_modManager.getActiveModByName then
        local ok, m = pcall(function() return _G.g_modManager:getActiveModByName("FS25_RealisticLivestockRM") end)
        if ok and m then activeMod = m end
    end

    -- Probe one placeable's first cluster to detect RL's isIndividual flag.
    local sawRL = false
    local sawBase = false
    local placeables = _G.g_currentMission.husbandrySystem.placeables or {}
    for _, placeable in pairs(placeables) do
        if placeable and placeable.getClusters then
            local ok, clusters = pcall(function() return placeable:getClusters() end)
            if ok and type(clusters) == "table" then
                for _, c in pairs(clusters) do
                    if c then
                        if c.isIndividual == true then
                            sawRL = true
                        else
                            sawBase = true
                        end
                        break
                    end
                end
            end
        end
        if sawRL or sawBase then break end
    end

    local sample
    if sawRL or activeMod ~= nil then
        sample = "RL"
    elseif sawBase then
        sample = "base"
    else
        sample = "unknown"
    end

    local s = self._animalModeSamples
    if s.last == sample then
        s.agree = (s.agree or 0) + 1
    else
        s.last = sample
        s.agree = 1
    end

    -- Promotion gates (B6).
    if self._animalMode == "unknown" then
        if (sample == "base" or sample == "RL") and s.agree >= 2 then
            self._animalMode = sample
        end
    else
        -- We're already promoted; require 3 consecutive opposing samples to flip.
        if sample ~= self._animalMode and s.agree >= 3 then
            self._animalMode = sample
        end
    end

    if self._animalMode == "RL" and not self._rlSubscribed then
        self:_subscribeToRLEvents()
    end
end

--- Phase 5.3 + Plan v5 B7: subscribe to RL's AnimalClusterUpdateEvent.
--- The handler is wrapped in xpcall+debug.traceback with rate-limited (1/60s) error logging.
--- The first invocation logs received-arg `type()` only (NOT values) so a signature change is
--- visible in log.txt without leaking user-supplied animal data.
function FarmDashboardDataCollector:_subscribeToRLEvents()
    if self._rlSubscribed then return end
    if not _G.g_messageCenter or type(_G.g_messageCenter.subscribe) ~= "function" then return end
    local evt = rawget(_G, "AnimalClusterUpdateEvent")
    if evt == nil then return end
    if not (FarmDashboard and FarmDashboard.isAuthority and FarmDashboard:isAuthority()) then return end

    local self_ref = self
    local handler = function(...)
        local args = { ... }
        -- B7: types-only first-hit signature log (security: no values)
        if not self_ref._rlEventFirstHitLogged then
            self_ref._rlEventFirstHitLogged = true
            local types = {}
            for i = 1, math.min(#args, 6) do
                types[#types + 1] = type(args[i])
            end
            FarmDashLog.dev("AnimalClusterUpdateEvent first-hit signature types=[%s]", table.concat(types, ","))
        end

        local ok, err = xpcall(function()
            if not (FarmDashboard and FarmDashboard:isAuthority()) then return end
            -- Defensive: handler may receive (eventInstance, owner, animals) or (owner, animals).
            -- Search args for the first placeable-shaped value.
            local owner
            for i = 1, math.min(#args, 4) do
                local v = args[i]
                if type(v) == "table" and (v.id ~= nil or v.getClusters ~= nil) then
                    owner = v
                    break
                end
            end
            if owner and owner.id ~= nil then
                self_ref:_addDirtyPen(owner)
            end
        end, _farmDashFormatError)
        if not ok then
            local D = rawget(_G, "FarmDashDiagnostics")
            local nowS = (D and D.nowSec and D.nowSec()) or 0
            if (nowS - (self_ref._rlEventErrLogAt or 0)) >= 60 then
                self_ref._rlEventErrLogAt = nowS
                FarmDashLog.devWarn("AnimalClusterUpdateEvent handler error: %s", tostring(err))
            end
        end
    end

    local subscribeOk, subscribeErr = pcall(function()
        local token = _G.g_messageCenter:subscribe(evt, handler, self)
        if token ~= nil then
            self._rlSubscriptionTokens[#self._rlSubscriptionTokens + 1] = { evt = evt, token = token }
        end
    end)
    if subscribeOk then
        self._rlSubscribed = true
        FarmDashLog.dev("subscribed to AnimalClusterUpdateEvent")
    else
        FarmDashLog.devWarn("could not subscribe to AnimalClusterUpdateEvent: %s", tostring(subscribeErr))
    end
end

--- Plan v5 B5 + B11: bound-aware insertion into _dirtyPens.
--- Uses the stable pen key derived from the chosen idScheme.
--- Drops oldest entry when count exceeds DIRTY_PENS_HARD_CAP. Honors POST_LOAD_SILENCE_SEC.
function FarmDashboardDataCollector:_addDirtyPen(placeable)
    if not placeable then return end
    local D = rawget(_G, "FarmDashDiagnostics")
    local nowS = (D and D.nowSec and D.nowSec()) or 0

    -- Silence window after onStartMission absorbs RL save-load floods.
    if (self._postLoadSilenceUntil or 0) > nowS then return end

    local penKey = self:_penKeyFor(placeable)
    if penKey == nil then return end

    -- Already present: just refresh timestamp (no growth).
    if self._dirtyPens[penKey] ~= nil then
        self._dirtyPens[penKey] = nowS
        return
    end

    -- Bounded: drop oldest by ts when at cap.
    if (self._dirtyPensCount or 0) >= DIRTY_PENS_HARD_CAP then
        local oldestKey, oldestTs
        for k, v in pairs(self._dirtyPens) do
            if oldestKey == nil or v < oldestTs then
                oldestKey = k; oldestTs = v
            end
        end
        if oldestKey ~= nil then
            self._dirtyPens[oldestKey] = nil
            self._dirtyPensCount = self._dirtyPensCount - 1
            if (nowS - (self._dirtyPensDropLogAt or 0)) >= 30 then
                self._dirtyPensDropLogAt = nowS
                FarmDashLog.dev("_dirtyPens at cap %d; dropped oldest %s", DIRTY_PENS_HARD_CAP, tostring(oldestKey))
            end
        end
    end

    self._dirtyPens[penKey] = nowS
    self._dirtyPensCount = (self._dirtyPensCount or 0) + 1
end

--- Plan v5 B5: build the stable per-pen key.
--- "composite-v1": `<configFileName>:<id>` when the placeable exposes a configFileName.
--- "integer-v1":   tostring(integer id) — fallback when no configFileName is available.
--- The chosen scheme is locked once on first successful detection.
function FarmDashboardDataCollector:_penKeyFor(placeable)
    if not placeable or placeable.id == nil then return nil end
    local idNum = tonumber(placeable.id)
    if idNum == nil then return nil end
    local cfg = placeable.configFileName
    if not self._idSchemeDetected then
        if type(cfg) == "string" and #cfg > 0 then
            self._idScheme = "composite-v1"
        else
            self._idScheme = "integer-v1"
        end
        self._idSchemeDetected = true
    end
    if self._idScheme == "composite-v1" and type(cfg) == "string" and #cfg > 0 then
        return string.format("%s:%d", cfg, idNum)
    end
    return string.format("%d", idNum)
end

--- Plan v5 B5: filename-safe key. Replaces unsafe bytes with `_`, keeps under 96 chars.
function FarmDashboardDataCollector:_penKeyToFilename(penKey)
    if penKey == nil then return nil end
    local s = tostring(penKey)
    s = string.gsub(s, "[^A-Za-z0-9._%-]", "_")
    if #s > 96 then s = string.sub(s, #s - 95) end
    return s
end

--- Phase 5.2: probe entity counts and tune the collection cycle to match scale.
--- Tier mapping (from plan): light/medium/heavy/extreme.
function FarmDashboardDataCollector:runAdaptiveProbeOnce()
    if not _G.g_currentMission then return end

    local totalAnimals = 0
    local totalPens = 0
    if _G.g_currentMission.husbandrySystem and _G.g_currentMission.husbandrySystem.placeables then
        for _, p in pairs(_G.g_currentMission.husbandrySystem.placeables) do
            if p then
                totalPens = totalPens + 1
                if self._animalMode == "RL" or self._animalMode == "base" then
                    -- Both modes: getNumOfAnimals returns a meaningful sum.
                    local ok, n = pcall(function()
                        if p.getNumOfAnimals then return p:getNumOfAnimals() end
                        return 0
                    end)
                    if ok and type(n) == "number" then
                        totalAnimals = totalAnimals + n
                    end
                end
            end
        end
    end

    local totalVehicles = 0
    if self:_isServerExportHost() or not self:mayScanLiveFleet() then
        local cached = self.moduleCache and self.moduleCache.vehicles
        if type(cached) == "table" then totalVehicles = #cached end
    else
        totalVehicles = self:_getMissionVehicleCount()
    end

    self._lastAnimalProbe = { total = totalAnimals, pens = totalPens, vehicles = totalVehicles }

    local cycleMs
    if totalAnimals >= 20000 or totalVehicles >= 400 then
        cycleMs = 300000
    elseif totalAnimals >= 8000 or totalVehicles >= 200 then
        cycleMs = 240000
    elseif totalAnimals >= 2000 or totalVehicles >= 100 then
        cycleMs = 120000
    else
        cycleMs = 60000
    end

    local prev = self.config.collectionCycleMs
    if prev ~= cycleMs then
        self.config.collectionCycleMs = cycleMs
        FarmDashboard.UPDATE_INTERVAL = cycleMs
        FarmDashLog.dev("adaptive cadence: animals=%d pens=%d vehicles=%d cycleMs=%d",
            totalAnimals, totalPens, totalVehicles, cycleMs)
    end
end

--- Phase 2: best-effort calibration. Runs a synthetic table walk a few times,
--- measures wall-clock, and scales animalRowsPerSlice so a slice fits in ~70% of sliceBudgetMs.
--- This is best-effort: when no high-resolution timer is available we keep the configured default.
function FarmDashboardDataCollector:calibrateRowCapsAtBoot()
    local diag = rawget(_G, "FarmDashDiagnostics")
    if not diag or type(diag.nowSec) ~= "function" then return end

    local t0 = diag.nowSec()
    if not t0 then return end

    local SAMPLES = 4096
    local synth = {}
    for i = 1, SAMPLES do
        synth[i] = { subType = "COW", subTypeIndex = 1, age = (i % 96), gender = ((i % 2 == 0) and "male" or "female"),
                     weight = 500 + (i % 400), health = 0.95, isPregnant = (i % 7 == 0), isLactating = (i % 5 == 0) }
    end

    local buckets = {}
    local before = diag.nowSec()
    for i = 1, SAMPLES do
        local a = synth[i]
        local ageDecile = math.floor(a.age / 12)
        local key = a.subType .. "|" .. ageDecile .. "|" .. a.gender .. "|" .. (a.isPregnant and "P" or "p") .. "|" .. (a.isLactating and "L" or "l")
        local b = buckets[key]
        if not b then
            b = { count = 0, sumWeight = 0, sumHealth = 0 }
            buckets[key] = b
        end
        b.count = b.count + 1
        b.sumWeight = b.sumWeight + a.weight
        b.sumHealth = b.sumHealth + a.health
    end
    local after = diag.nowSec()
    if not before or not after or after <= before then return end

    local elapsedMs = (after - before) * 1000
    if elapsedMs <= 0 then return end

    local rowsPerMs = SAMPLES / elapsedMs
    local targetMs = math.max(1, (self.config.sliceBudgetMs or 4) * 0.7)
    local cap = math.floor(rowsPerMs * targetMs)
    cap = math.max(64, math.min(8192, cap))

    -- Only override if calibration produced a significantly better value than the configured default.
    local cur = self.config.animalRowsPerSlice or 256
    if cap >= cur * 1.25 or cap <= cur * 0.75 then
        self.config.animalRowsPerSlice = cap
        FarmDashLog.dev("calibrated animalRowsPerSlice=%d (synthetic %d rows in %.2fms, target %.2fms)",
            cap, SAMPLES, elapsedMs, targetMs)
    else
        FarmDashLog.dev("calibration kept animalRowsPerSlice=%d (synthetic %d rows in %.2fms)",
            cur, SAMPLES, elapsedMs)
    end
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
    self._jsonWritePending = nil
    self._jsonPendingDisk = nil
    self._cycleTailJob = nil
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
        AnimalDataCollector._iter = nil
        AnimalDataCollector._co = nil
        AnimalDataCollector._yieldEvery = nil
    end
    if rawget(_G, "FinanceDataCollector") then
        FinanceDataCollector._incFin = false
    end
    if rawget(_G, "WeatherDataCollector") then
        WeatherDataCollector._incWx = false
    end
    if rawget(_G, "StockDataCollector") then
        StockDataCollector._inc = nil
    end
    if rawget(_G, "RedTapeDataCollector") then
        RedTapeDataCollector._inc = false
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
        enableStock         = true,
        enableBaleInventory = true,
        enableRedTape       = true,
        stockPlaceablesPerFrame = 3,
        baleWorldEntitiesPerFrame = 8,
        financeVehiclesPerFrame = 4,
        redTapeFarmsPerFrame = 1,
        --- When true, FieldDataCollector prints a throttled line to log.txt after bale scans (see FieldDataCollector.lua).
        debugBaleScan       = false,
        --- When true, FarmDash periodically logs median/p99 collectStep + serializer timings. Verification only.
        diagnostics         = false,
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
        --- Phase 4 LOD: rows scanned per slice when AnimalDataCollector aggregates clusters/animals.
        --- Acts as the primary safety net (wall-clock budget is opportunistic only — see Phase 2).
        animalRowsPerSlice          = 256,
        --- Phase 5: detail mode rotation. Pens whose detail file is older than this get refreshed first.
        detailMaxAgeSec             = 60,
        --- Phase 5: max number of detail files kept on disk (capped to max(512, totalPens + 64) at runtime).
        detailFileCapBase           = 512,
        --- Phase 5: opportunistic wall-clock budget per slice (ms). Best-effort; row caps are the actual safety net.
        sliceBudgetMs               = 4,
        --- Plan v5 B1/B2/B3: per-collector kill switches.
        --- Default false = spread fields/economy/production across frames (fewer hitches).
        useStateMachine_economy     = false,
        useStateMachine_fields      = false,
        useStateMachine_production  = false,
        --- Seconds after save load before starting new collector slots (reduces CP/menu contention).
        postLoadCollectionGraceSec  = POST_LOAD_COLLECTION_GRACE_SEC,
        --- Plan v5 B1: row cap for economy state-machine slice.
        economyRowsPerSlice         = 64,
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
            self.config.enableStock     = Utils.getNoNil(getXMLBool(xmlFile, "farmDashboard.modules#stock"),     true)
            local stockOn = self.config.enableStock
            self.config.enableBaleInventory = Utils.getNoNil(
                getXMLBool(xmlFile, "farmDashboard.modules#baleInventory"),
                stockOn
            )
            self.config.enableRedTape   = Utils.getNoNil(getXMLBool(xmlFile, "farmDashboard.modules#redTape"),   true)
            self.config.debugBaleScan = Utils.getNoNil(getXMLBool(xmlFile, "farmDashboard.settings#debugBaleScan"), false)
            self.config.diagnostics = Utils.getNoNil(getXMLBool(xmlFile, "farmDashboard.settings#diagnostics"), false)
            local arps = getXMLInt(xmlFile, "farmDashboard.settings#animalRowsPerSlice")
            if arps and arps > 0 then self.config.animalRowsPerSlice = arps end
            local sbm = getXMLInt(xmlFile, "farmDashboard.settings#sliceBudgetMs")
            if sbm and sbm > 0 then self.config.sliceBudgetMs = sbm end
            local dms = getXMLInt(xmlFile, "farmDashboard.settings#detailMaxAgeSec")
            if dms and dms > 0 then self.config.detailMaxAgeSec = dms end
            local dfcb = getXMLInt(xmlFile, "farmDashboard.settings#detailFileCapBase")
            if dfcb and dfcb > 0 then self.config.detailFileCapBase = dfcb end
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
            -- Plan v5 B1/B2/B3: collector kill switches.
            self.config.useStateMachine_economy    = Utils.getNoNil(getXMLBool(xmlFile, "farmDashboard.settings#useStateMachine_economy"),    false)
            self.config.useStateMachine_fields     = Utils.getNoNil(getXMLBool(xmlFile, "farmDashboard.settings#useStateMachine_fields"),     false)
            self.config.useStateMachine_production = Utils.getNoNil(getXMLBool(xmlFile, "farmDashboard.settings#useStateMachine_production"), false)
            local plg = getXMLInt(xmlFile, "farmDashboard.settings#postLoadCollectionGraceSec")
            if plg and plg >= 0 then self.config.postLoadCollectionGraceSec = plg end
            local erp = getXMLInt(xmlFile, "farmDashboard.settings#economyRowsPerSlice")
            if erp and erp > 0 then self.config.economyRowsPerSlice = erp end
            local spp = getXMLInt(xmlFile, "farmDashboard.settings#stockPlaceablesPerFrame")
            if spp and spp > 0 then self.config.stockPlaceablesPerFrame = spp end
            local bwp = getXMLInt(xmlFile, "farmDashboard.settings#baleWorldEntitiesPerFrame")
            if bwp and bwp > 0 then self.config.baleWorldEntitiesPerFrame = bwp end
            local fvp = getXMLInt(xmlFile, "farmDashboard.settings#financeVehiclesPerFrame")
            if fvp and fvp > 0 then self.config.financeVehiclesPerFrame = fvp end
            local rtp = getXMLInt(xmlFile, "farmDashboard.settings#redTapeFarmsPerFrame")
            if rtp and rtp > 0 then self.config.redTapeFarmsPerFrame = rtp end
            if not Utils.getNoNil(getXMLBool(xmlFile, "farmDashboard.settings#collectionSafetyV2Applied"), false) then
                self.config.useStateMachine_economy = false
                self.config.useStateMachine_fields = false
                self.config.useStateMachine_production = false
                self.config.postLoadCollectionGraceSec = self.config.postLoadCollectionGraceSec or POST_LOAD_COLLECTION_GRACE_SEC
                setXMLBool(xmlFile, "farmDashboard.settings#useStateMachine_economy", false)
                setXMLBool(xmlFile, "farmDashboard.settings#useStateMachine_fields", false)
                setXMLBool(xmlFile, "farmDashboard.settings#useStateMachine_production", false)
                setXMLInt(xmlFile, "farmDashboard.settings#postLoadCollectionGraceSec", self.config.postLoadCollectionGraceSec)
                setXMLBool(xmlFile, "farmDashboard.settings#collectionSafetyV2Applied", true)
                saveXMLFile(xmlFile)
            end
            if not Utils.getNoNil(getXMLBool(xmlFile, "farmDashboard.settings#collectionSafetyV3Applied"), false) then
                self.config.jsonTopLevelKeysPerFrame = 1
                self.config.baleWorldEntitiesPerFrame = self.config.baleWorldEntitiesPerFrame or 8
                self.config.financeVehiclesPerFrame = self.config.financeVehiclesPerFrame or 4
                self.config.redTapeFarmsPerFrame = self.config.redTapeFarmsPerFrame or 1
                self.config.stockPlaceablesPerFrame = math.min(self.config.stockPlaceablesPerFrame or 3, 3)
                self.config.baleEntitiesBudget = math.min(self.config.baleEntitiesBudget or 8, 8)
                self.config.economyYieldStride = math.min(self.config.economyYieldStride or 20, 20)
                setXMLInt(xmlFile, "farmDashboard.settings#jsonTopLevelKeysPerFrame", self.config.jsonTopLevelKeysPerFrame)
                setXMLInt(xmlFile, "farmDashboard.settings#baleWorldEntitiesPerFrame", self.config.baleWorldEntitiesPerFrame)
                setXMLInt(xmlFile, "farmDashboard.settings#financeVehiclesPerFrame", self.config.financeVehiclesPerFrame)
                setXMLInt(xmlFile, "farmDashboard.settings#redTapeFarmsPerFrame", self.config.redTapeFarmsPerFrame)
                setXMLInt(xmlFile, "farmDashboard.settings#stockPlaceablesPerFrame", self.config.stockPlaceablesPerFrame)
                setXMLInt(xmlFile, "farmDashboard.settings#baleEntitiesBudget", self.config.baleEntitiesBudget)
                setXMLInt(xmlFile, "farmDashboard.settings#economyYieldStride", self.config.economyYieldStride)
                setXMLBool(xmlFile, "farmDashboard.settings#collectionSafetyV3Applied", true)
                saveXMLFile(xmlFile)
            end
            if not Utils.getNoNil(getXMLBool(xmlFile, "farmDashboard.settings#collectionSafetyV4Applied"), false) then
                setXMLBool(xmlFile, "farmDashboard.settings#collectionSafetyV4Applied", true)
                saveXMLFile(xmlFile)
            end
            if not Utils.getNoNil(getXMLBool(xmlFile, "farmDashboard.settings#collectionSafetyV5Applied"), false) then
                if FarmDashboard and FarmDashboard.isDedicatedServer and FarmDashboard:isDedicatedServer() then
                    if self.config.enableVehicles == false then
                        self.config.enableVehicles = true
                        Logging.info(
                            "[FarmDash] Dedicated server: vehicle export re-enabled (spawn-grace skips live fleet during shop buys)."
                        )
                    end
                end
                setXMLBool(xmlFile, "farmDashboard.modules#vehicles", Utils.getNoNil(self.config.enableVehicles, true))
                setXMLBool(xmlFile, "farmDashboard.settings#collectionSafetyV5Applied", true)
                saveXMLFile(xmlFile)
            end
            delete(xmlFile)
        end
    else
        createFolder(getUserProfileAppPath() .. "modSettings/FS25_FarmDashboard/")
        local xmlFile = createXMLFile("FarmDashboardConfig", configPath, "farmDashboard")
        setXMLInt(xmlFile, "farmDashboard.settings#updateInterval", self.config.interval)
        setXMLInt(xmlFile, "farmDashboard.settings#collectionCycleMs", self.config.collectionCycleMs)
        setXMLBool(xmlFile, "farmDashboard.settings#debugBaleScan", false)
        setXMLBool(xmlFile, "farmDashboard.settings#diagnostics", false)
        setXMLInt(xmlFile, "farmDashboard.settings#animalRowsPerSlice", self.config.animalRowsPerSlice)
        setXMLInt(xmlFile, "farmDashboard.settings#sliceBudgetMs", self.config.sliceBudgetMs)
        setXMLInt(xmlFile, "farmDashboard.settings#detailMaxAgeSec", self.config.detailMaxAgeSec)
        setXMLInt(xmlFile, "farmDashboard.settings#detailFileCapBase", self.config.detailFileCapBase)
        setXMLBool(xmlFile, "farmDashboard.modules#animals",    true)
        setXMLBool(xmlFile, "farmDashboard.modules#vehicles",   true)
        setXMLBool(xmlFile, "farmDashboard.modules#weather",    true)
        setXMLBool(xmlFile, "farmDashboard.modules#fields",     true)
        setXMLBool(xmlFile, "farmDashboard.modules#finance",    true)
        setXMLBool(xmlFile, "farmDashboard.modules#economy",    true)
        setXMLBool(xmlFile, "farmDashboard.modules#production", true)
        setXMLBool(xmlFile, "farmDashboard.modules#stock", true)
        setXMLBool(xmlFile, "farmDashboard.modules#redTape", true)
        setXMLInt(xmlFile, "farmDashboard.settings#stockPlaceablesPerFrame", self.config.stockPlaceablesPerFrame)
        setXMLInt(xmlFile, "farmDashboard.settings#baleWorldEntitiesPerFrame", self.config.baleWorldEntitiesPerFrame)
        setXMLInt(xmlFile, "farmDashboard.settings#financeVehiclesPerFrame", self.config.financeVehiclesPerFrame)
        setXMLInt(xmlFile, "farmDashboard.settings#redTapeFarmsPerFrame", self.config.redTapeFarmsPerFrame)
        setXMLInt(xmlFile, "farmDashboard.settings#fieldsPerFrame", self.config.fieldsPerFrame)
        setXMLInt(xmlFile, "farmDashboard.settings#baleEntitiesBudget", self.config.baleEntitiesBudget)
        setXMLInt(xmlFile, "farmDashboard.settings#vehiclesPerFrame", self.config.vehiclesPerFrame)
        setXMLInt(xmlFile, "farmDashboard.settings#husbandryPlaceablesPerFrame", self.config.husbandryPlaceablesPerFrame)
        setXMLInt(xmlFile, "farmDashboard.settings#jsonTopLevelKeysPerFrame", self.config.jsonTopLevelKeysPerFrame)
        setXMLInt(xmlFile, "farmDashboard.settings#economyYieldStride", self.config.economyYieldStride)
        -- Plan v5 B1/B2/B3 + B10:
        setXMLBool(xmlFile, "farmDashboard.settings#useStateMachine_economy",    false)
        setXMLBool(xmlFile, "farmDashboard.settings#useStateMachine_fields",     false)
        setXMLBool(xmlFile, "farmDashboard.settings#useStateMachine_production", false)
        setXMLInt(xmlFile, "farmDashboard.settings#postLoadCollectionGraceSec", self.config.postLoadCollectionGraceSec)
        setXMLBool(xmlFile, "farmDashboard.settings#collectionSafetyV2Applied", true)
        setXMLBool(xmlFile, "farmDashboard.settings#collectionSafetyV3Applied", true)
        setXMLBool(xmlFile, "farmDashboard.settings#collectionSafetyV4Applied", true)
        setXMLBool(xmlFile, "farmDashboard.settings#collectionSafetyV5Applied", true)
        setXMLInt(xmlFile, "farmDashboard.settings#economyRowsPerSlice", self.config.economyRowsPerSlice)
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
    self.config.animalRowsPerSlice = math.max(32, math.min(8192, self.config.animalRowsPerSlice or 256))
    self.config.sliceBudgetMs = math.max(1, math.min(64, self.config.sliceBudgetMs or 4))
    self.config.detailMaxAgeSec = math.max(15, math.min(3600, self.config.detailMaxAgeSec or 60))
    self.config.detailFileCapBase = math.max(64, math.min(8192, self.config.detailFileCapBase or 512))
    self.config.economyRowsPerSlice = math.max(8, math.min(2048, self.config.economyRowsPerSlice or 64))
    self.config.stockPlaceablesPerFrame = math.max(1, math.min(16, self.config.stockPlaceablesPerFrame or 3))
    self.config.baleWorldEntitiesPerFrame = math.max(4, math.min(64, self.config.baleWorldEntitiesPerFrame or 8))
    self.config.financeVehiclesPerFrame = math.max(1, math.min(16, self.config.financeVehiclesPerFrame or 4))
    self.config.redTapeFarmsPerFrame = math.max(1, math.min(8, self.config.redTapeFarmsPerFrame or 1))
    self.config.postLoadCollectionGraceSec = math.max(0, math.min(300, self.config.postLoadCollectionGraceSec or POST_LOAD_COLLECTION_GRACE_SEC))
    FarmDashboard.UPDATE_INTERVAL = self.config.collectionCycleMs
end

function FarmDashboardDataCollector:getConfigPath()
    return getUserProfileAppPath() .. "modSettings/FS25_FarmDashboard/config.xml"
end

function FarmDashboardDataCollector:applyDiagnosticsFromConfig()
    local D = rawget(_G, "FarmDashDiagnostics")
    if D and D.setEnabled and self.config then
        D:setEnabled(self.config.diagnostics)
        if self.config.diagnostics and FarmDashboard and FarmDashboard.isAuthority and not FarmDashboard:isAuthority() then
            if FarmDashLog and FarmDashLog.warnNoAuthorityTrace then
                FarmDashLog.warnNoAuthorityTrace()
            end
        end
    end
end

--- Persist current in-memory config to modSettings/config.xml (GUI + shutdown paths).
function FarmDashboardDataCollector:saveConfig()
    local cfg = self.config
    if type(cfg) ~= "table" then return false end

    local configPath = self:getConfigPath()
    createFolder(getUserProfileAppPath() .. "modSettings/FS25_FarmDashboard/")

    local xmlFile = 0
    if fileExists(configPath) then
        xmlFile = loadXMLFile("FarmDashboardConfigSave", configPath)
    end
    if not xmlFile or xmlFile == 0 then
        xmlFile = createXMLFile("FarmDashboardConfigSave", configPath, "farmDashboard")
    end
    if not xmlFile or xmlFile == 0 then return false end

    setXMLInt(xmlFile, "farmDashboard.settings#updateInterval", cfg.interval or 10000)
    setXMLInt(xmlFile, "farmDashboard.settings#collectionCycleMs", cfg.collectionCycleMs or 60000)
    setXMLBool(xmlFile, "farmDashboard.settings#debugBaleScan", Utils.getNoNil(cfg.debugBaleScan, false))
    setXMLBool(xmlFile, "farmDashboard.settings#diagnostics", Utils.getNoNil(cfg.diagnostics, false))
    setXMLInt(xmlFile, "farmDashboard.settings#animalRowsPerSlice", cfg.animalRowsPerSlice or 256)
    setXMLInt(xmlFile, "farmDashboard.settings#sliceBudgetMs", cfg.sliceBudgetMs or 4)
    setXMLInt(xmlFile, "farmDashboard.settings#detailMaxAgeSec", cfg.detailMaxAgeSec or 60)
    setXMLInt(xmlFile, "farmDashboard.settings#detailFileCapBase", cfg.detailFileCapBase or 512)
    setXMLInt(xmlFile, "farmDashboard.settings#fieldsPerFrame", cfg.fieldsPerFrame or 1)
    setXMLInt(xmlFile, "farmDashboard.settings#baleEntitiesBudget", cfg.baleEntitiesBudget or 8)
    setXMLInt(xmlFile, "farmDashboard.settings#vehiclesPerFrame", cfg.vehiclesPerFrame or 2)
    setXMLInt(xmlFile, "farmDashboard.settings#husbandryPlaceablesPerFrame", cfg.husbandryPlaceablesPerFrame or 1)
    setXMLInt(xmlFile, "farmDashboard.settings#jsonTopLevelKeysPerFrame", cfg.jsonTopLevelKeysPerFrame or 1)
    setXMLInt(xmlFile, "farmDashboard.settings#economyYieldStride", cfg.economyYieldStride or 20)
    setXMLInt(xmlFile, "farmDashboard.settings#stockPlaceablesPerFrame", cfg.stockPlaceablesPerFrame or 3)
    setXMLInt(xmlFile, "farmDashboard.settings#baleWorldEntitiesPerFrame", cfg.baleWorldEntitiesPerFrame or 8)
    setXMLInt(xmlFile, "farmDashboard.settings#financeVehiclesPerFrame", cfg.financeVehiclesPerFrame or 4)
    setXMLInt(xmlFile, "farmDashboard.settings#redTapeFarmsPerFrame", cfg.redTapeFarmsPerFrame or 1)
    setXMLInt(xmlFile, "farmDashboard.settings#postLoadCollectionGraceSec", cfg.postLoadCollectionGraceSec or POST_LOAD_COLLECTION_GRACE_SEC)
    setXMLInt(xmlFile, "farmDashboard.settings#economyRowsPerSlice", cfg.economyRowsPerSlice or 64)
    setXMLBool(xmlFile, "farmDashboard.settings#useStateMachine_economy", Utils.getNoNil(cfg.useStateMachine_economy, false))
    setXMLBool(xmlFile, "farmDashboard.settings#useStateMachine_fields", Utils.getNoNil(cfg.useStateMachine_fields, false))
    setXMLBool(xmlFile, "farmDashboard.settings#useStateMachine_production", Utils.getNoNil(cfg.useStateMachine_production, false))

    setXMLBool(xmlFile, "farmDashboard.modules#animals", Utils.getNoNil(cfg.enableAnimals, true))
    setXMLBool(xmlFile, "farmDashboard.modules#vehicles", Utils.getNoNil(cfg.enableVehicles, true))
    setXMLBool(xmlFile, "farmDashboard.modules#weather", Utils.getNoNil(cfg.enableWeather, true))
    setXMLBool(xmlFile, "farmDashboard.modules#fields", Utils.getNoNil(cfg.enableFields, true))
    setXMLBool(xmlFile, "farmDashboard.modules#finance", Utils.getNoNil(cfg.enableFinance, true))
    setXMLBool(xmlFile, "farmDashboard.modules#economy", Utils.getNoNil(cfg.enableEconomy, true))
    setXMLBool(xmlFile, "farmDashboard.modules#production", Utils.getNoNil(cfg.enableProduction, true))
    setXMLBool(xmlFile, "farmDashboard.modules#stock", Utils.getNoNil(cfg.enableStock, true))
    setXMLBool(xmlFile, "farmDashboard.modules#baleInventory", Utils.getNoNil(cfg.enableBaleInventory, true))
    setXMLBool(xmlFile, "farmDashboard.modules#redTape", Utils.getNoNil(cfg.enableRedTape, true))

    saveXMLFile(xmlFile)
    delete(xmlFile)

    self:applyDiagnosticsFromConfig()
    FarmDashboard.UPDATE_INTERVAL = cfg.collectionCycleMs or FarmDashboard.UPDATE_INTERVAL
    return true
end

--- Mission clock in ms (g_time on DS; diagnostics fallback).
function FarmDashboardDataCollector:_missionNowMs()
    if type(_G.g_time) == "number" then return _G.g_time end
    local D = rawget(_G, "FarmDashDiagnostics")
    if D and type(D.nowSec) == "function" then
        local ok, t = pcall(function() return D.nowSec() end)
        if ok and type(t) == "number" then return t * 1000 end
    end
    return 0
end

--- Unix-ish mission seconds for grace / pause gates (best-effort).
function FarmDashboardDataCollector:_missionNowSec()
    return self:_missionNowMs() / 1000
end

function FarmDashboardDataCollector:_getMissionVehicleTable()
    if not _G.g_currentMission then return nil end
    if _G.g_currentMission.vehicles then
        return _G.g_currentMission.vehicles
    end
    if _G.g_currentMission.vehicleSystem and _G.g_currentMission.vehicleSystem.vehicles then
        return _G.g_currentMission.vehicleSystem.vehicles
    end
    if _G.g_currentMission.ownedVehicles then
        return _G.g_currentMission.ownedVehicles
    end
    return nil
end

function FarmDashboardDataCollector:_getCurrentGuiName()
    local gui = rawget(_G, "g_gui")
    if not gui then return nil end
    local ok, name = pcall(function()
        if type(gui.getCurrentGuiName) == "function" then
            return gui:getCurrentGuiName()
        end
        if gui.currentGuiName then return gui.currentGuiName end
        if gui.currentGui and gui.currentGui.name then return gui.currentGui.name end
        return nil
    end)
    if ok and name and name ~= "" then return tostring(name) end
    return nil
end

--- Fleet size for spawn-grace and adaptive cadence (read-only; never mutates mission).
function FarmDashboardDataCollector:_getMissionVehicleCount()
    local total = self:_probeMissionFleet()
    return total
end

--- Spawn-ready fleet size (both getOwnerFarmId and getName exist — no method calls).
function FarmDashboardDataCollector:_getMissionVehicleReadyCount()
    local _, ready = self:_probeMissionFleet()
    return ready
end

--- One read-only pass over the fleet table: total slots, spawn-ready count, incomplete flag.
--- Never walks the live fleet table on MP authority or while Courseplay settle is active.
function FarmDashboardDataCollector:_probeMissionFleet()
    if self:_isServerExportHost() or not self:mayScanLiveFleet() then
        local cached = self.moduleCache and self.moduleCache.vehicles
        local n = (type(cached) == "table") and #cached or 0
        local pending = self:_getPendingVehicleLoadCount()
        local settling = self:_isCourseplayFleetSettleActive()
        return n, n, pending > 0 or settling
    end

    local cached = self._fleetProbeCache
    local gt = _G.g_time
    if cached and type(gt) == "number" and cached.gt == gt then
        return cached.total, cached.ready, cached.incomplete
    end

    local vehicles = self:_getMissionVehicleTable()
    if not vehicles then
        self._fleetProbeCache = { gt = gt, total = 0, ready = 0, incomplete = false }
        return 0, 0, false
    end

    local total, ready, incomplete = 0, 0, false
    for _, vehicle in pairs(vehicles) do
        if vehicle ~= nil then
            total = total + 1
            local hasOwner = type(vehicle.getOwnerFarmId) == "function"
            local hasName = type(vehicle.getName) == "function"
            if hasOwner and hasName then
                ready = ready + 1
            else
                incomplete = true
            end
        end
    end

    self._fleetProbeCache = { gt = gt, total = total, ready = ready, incomplete = incomplete }
    return total, ready, incomplete
end

--- True while the fleet list contains a half-spawned vehicle (no getOwnerFarmId / getName yet).
function FarmDashboardDataCollector:_fleetHasIncompleteSpawn()
    if self:_getPendingVehicleLoadCount() > 0 then
        return true
    end
    if not self:mayScanLiveFleet() then
        return false
    end
    local _, _, incomplete = self:_probeMissionFleet()
    return incomplete == true
end

--- FS25_Courseplay attaches specs asynchronously; scanning the fleet during that window causes CP errors.
function FarmDashboardDataCollector:isCourseplayLoaded()
    if self._courseplayLoaded ~= nil then return self._courseplayLoaded end
    local loaded = false
    if _G.g_modIsLoaded and _G.g_modIsLoaded["FS25_Courseplay"] then
        loaded = true
    elseif rawget(_G, "CpAIJob") ~= nil or rawget(_G, "CpUtil") ~= nil then
        loaded = true
    elseif _G.g_modManager and type(_G.g_modManager.getActiveModByName) == "function" then
        local ok, mod = pcall(function() return _G.g_modManager:getActiveModByName("FS25_Courseplay") end)
        if ok and mod ~= nil then loaded = true end
    end
    self._courseplayLoaded = loaded
    return loaded
end

function FarmDashboardDataCollector:_isCourseplayFleetSettleActive()
    if not self:isCourseplayLoaded() then return false end
    if not (FarmDashboard and FarmDashboard.isAuthority and FarmDashboard:isAuthority()) then return false end
    local untilScan = self._cpAllowFleetScanAfterGTime
    return type(untilScan) == "number" and type(_G.g_time) == "number" and _G.g_time < untilScan
end

function FarmDashboardDataCollector:usesCourseplayIncrementalFleet()
    if not self:isCourseplayLoaded() then return false end
    if not (FarmDashboard and FarmDashboard.isAuthority and FarmDashboard:isAuthority()) then return false end
    return self:_isServerExportHost()
end

--- Safe to call getOwnerFarmId / walk g_currentMission.vehicles (Courseplay + shop spawn).
function FarmDashboardDataCollector:mayScanLiveFleet()
    if not (FarmDashboard and FarmDashboard.isAuthority and FarmDashboard:isAuthority()) then
        return true
    end
    if self:usesCourseplayIncrementalFleet() then return false end
    if self:_getPendingVehicleLoadCount() > 0 then return false end
    local untilG = self._vehicleSpawnGraceUntilGTime
    if type(untilG) == "number" and type(_G.g_time) == "number" and _G.g_time < untilG then
        return false
    end
    if self:_isCourseplayFleetSettleActive() then return false end
    return true
end

--- Called when engine reports a shop vehicle load started (pendingVehicleLoads became non-empty).
function FarmDashboardDataCollector:_notifyShopVehicleLoadStarted()
    if not self:isCourseplayLoaded() then return end
    self:_beginVehicleSpawnGrace("shop_load_started")
    Logging.info("[FarmDash] Shop vehicle load started — export paused until spawn completes")
end

--- Called when engine reports a shop vehicle load finished (pendingVehicleLoads cleared).
function FarmDashboardDataCollector:_notifyShopVehicleLoadFinished()
    local tailMs = self:_vehicleSpawnGraceTailMs()
    if self:isCourseplayLoaded() then
        local gt = _G.g_time
        if type(gt) == "number" then
            self._cpAllowFleetScanAfterGTime = gt + COURSEPLAY_FLEET_SETTLE_MS
        end
        Logging.info(
            "[FarmDash] Shop vehicle load finished — export resumes after %ds settle",
            math.floor(COURSEPLAY_FLEET_SETTLE_MS / 1000)
        )
    end
    self:_beginVehicleSpawnGrace("pending_load_finished", tailMs)
end

--- Courseplay incremental fleet: one fully registered vehicle -> moduleCache (no fleet table walk).
function FarmDashboardDataCollector:onVehicleRegistered(vehicle)
    if not self.config.enableVehicles then return end
    if not self:usesCourseplayIncrementalFleet() then return end
    local vdc = rawget(_G, "VehicleDataCollector")
    if not vdc or not vdc._isVehicleAlive or not vdc:_isVehicleAlive(vehicle) then
        if FarmDashboardCourseplayCompat and FarmDashboardCourseplayCompat.queueVehicleRegister then
            FarmDashboardCourseplayCompat.queueVehicleRegister(vehicle)
        end
        return
    end
    if vdc.upsertVehicleInCache then
        vdc:upsertVehicleInCache(vehicle)
        self:refreshAssembledInMemory()
    end
end

function FarmDashboardDataCollector:onVehicleDeleted(vehicle)
    if not self.config.enableVehicles then return end
    if not self:usesCourseplayIncrementalFleet() then return end
    local vdc = rawget(_G, "VehicleDataCollector")
    if vdc and vdc.removeVehicleFromCache then
        vdc:removeVehicleFromCache(vehicle)
        self:refreshAssembledInMemory()
    end
end

--- Skip live fleet reads during shop spawn grace or while a half-spawned entry exists (serve moduleCache instead).
function FarmDashboardDataCollector:shouldSkipLiveFleetScan()
    if not self:mayScanLiveFleet() then return true end
    return self:shouldDeferVehicleFleetWork()
end

function FarmDashboardDataCollector:_enginePendingVehicleLoadActive()
    local guard = rawget(_G, "FarmDashboardVehicleShopGuard")
    if guard and type(guard.hasEnginePendingLoads) == "function" then
        local ok, active = pcall(function() return guard.hasEnginePendingLoads() end)
        if ok then return active == true end
    end
    return false
end

function FarmDashboardDataCollector:_getPendingVehicleLoadCount()
    return self:_enginePendingVehicleLoadActive() and 1 or 0
end

--- Passive shop-load edge detect (no vehicleSystem method hooks).
function FarmDashboardDataCollector:_pollShopPendingLoads()
    if not (FarmDashboard and FarmDashboard.isAuthority and FarmDashboard:isAuthority()) then
        return
    end
    local pending = self:_enginePendingVehicleLoadActive()
    local prev = self._polledPendingLoadsActive
    if prev == nil then
        self._polledPendingLoadsActive = pending
        return
    end
    if pending and not prev then
        if self:isCourseplayLoaded() then
            self:_notifyShopVehicleLoadStarted()
        end
        self:_beginVehicleSpawnGrace("engine.pendingVehicleLoads")
    elseif not pending and prev then
        self:_notifyShopVehicleLoadFinished()
    end
    self._polledPendingLoadsActive = pending
end

--- MP host or dedicated server (export authority; shop handled remotely on DS).
function FarmDashboardDataCollector:_isServerExportHost()
    if not (FarmDashboard and FarmDashboard.isAuthority and FarmDashboard:isAuthority()) then
        return false
    end
    local md = _G.g_currentMission and _G.g_currentMission.missionDynamicInfo
    if md and md.isMultiplayer == true then return true end
    if rawget(_G, "g_dedicatedServer") ~= nil then return true end
    if _G.g_server ~= nil and type(_G.g_server.getIsServer) == "function" then
        local ok, isSrv = pcall(function() return _G.g_server:getIsServer() end)
        if ok and isSrv then return true end
    end
    return false
end

function FarmDashboardDataCollector:_vehicleSpawnGraceTailMs()
    if self:isCourseplayLoaded() then
        return VEHICLE_SPAWN_GRACE_CP_TAIL_MS
    end
    return VEHICLE_SPAWN_GRACE_SERVER_TAIL_MS
end

function FarmDashboardDataCollector:_vehicleSpawnGraceDurationMs()
    if not (FarmDashboard and FarmDashboard.isAuthority and FarmDashboard:isAuthority()) then
        return VEHICLE_SPAWN_GRACE_MS
    end
    if self:isCourseplayLoaded() then
        return VEHICLE_SPAWN_GRACE_CP_MS
    end
    return VEHICLE_SPAWN_GRACE_SERVER_MS
end

--- True while shop spawn grace is active — pauses ALL export on authority (not only fleet slices).
function FarmDashboardDataCollector:isExportPausedForVehicleSpawn()
    if not (FarmDashboard and FarmDashboard.isAuthority and FarmDashboard:isAuthority()) then
        return false
    end
    if self:_getPendingVehicleLoadCount() > 0 then return true end
    return self:shouldDeferVehicleFleetWork()
end

function FarmDashboardDataCollector:_isServerShopFreeze()
    return self:isExportPausedForVehicleSpawn()
end

--- Extend the fleet spawn grace window (shop buy / sell / config change / incomplete spawn).
--- @param tailMs number|nil optional shorter grace (e.g. after pending load completes)
function FarmDashboardDataCollector:_beginVehicleSpawnGrace(reason, tailMs)
    if not FarmDashboard or not FarmDashboard.isAuthority or not FarmDashboard:isAuthority() then return end
    local graceMs = tailMs
    if type(graceMs) ~= "number" then
        graceMs = self:_vehicleSpawnGraceDurationMs()
    end
    local gt = _G.g_time
    if type(gt) == "number" then
        local untilG = gt + graceMs
        if type(self._vehicleSpawnGraceUntilGTime) == "number" and not tailMs then
            untilG = math.max(self._vehicleSpawnGraceUntilGTime, untilG)
        end
        self._vehicleSpawnGraceUntilGTime = untilG
    end
    local untilMs = self:_missionNowMs() + graceMs
    if type(self._vehicleSpawnGraceUntilMs) == "number" and not tailMs then
        untilMs = math.max(self._vehicleSpawnGraceUntilMs, untilMs)
    end
    self._vehicleSpawnGraceUntilMs = untilMs

    if FarmDashboard and FarmDashboard.isAuthority and FarmDashboard:isAuthority() then
        self:_abortActiveIncrementalWork()
        self._jsonWriteJob = nil
        self._jsonPendingDisk = nil
        self._cycleTailJob = nil
    end

    local nowS = self:_missionNowSec()
    if (nowS - (self._vehicleSpawnGraceLogAt or 0)) >= 2 then
        self._vehicleSpawnGraceLogAt = nowS
        Logging.info(
            "[FarmDash] Shop spawn freeze %ds (%s) — server export paused during vehicle spawn",
            math.floor(graceMs / 1000),
            tostring(reason or "shop")
        )
    end
end

--- Subscribe to engine shop events when available (optional; vehicleSystem hook is primary on DS).
function FarmDashboardDataCollector:_subscribeToVehicleFleetEvents()
    if self._vehicleFleetSubscribed then return end
    if self:_isServerExportHost() then return end
    if not (FarmDashboard and FarmDashboard.isAuthority and FarmDashboard:isAuthority()) then return end
    if not _G.g_messageCenter or type(_G.g_messageCenter.subscribe) ~= "function" then return end

    local self_ref = self
    local function onFleetMutation(reason)
        return function(...)
            local ok, err = xpcall(function()
                if not (FarmDashboard and FarmDashboard:isAuthority()) then return end
                self_ref:_beginVehicleSpawnGrace(reason)
            end, _farmDashFormatError)
            if not ok and FarmDashLog and FarmDashLog.devWarn then
                FarmDashLog.devWarn("vehicle fleet event (%s): %s", tostring(reason), tostring(err))
            end
        end
    end

    local eventNames = {
        "BuyVehicleEvent",
        "SellVehicleEvent",
        "ChangeVehicleConfigEvent",
    }
    local subscribed = 0
    for _, name in ipairs(eventNames) do
        local evt = rawget(_G, name)
        if evt ~= nil then
            local subOk = pcall(function()
                _G.g_messageCenter:subscribe(evt, onFleetMutation(name), self_ref)
            end)
            if subOk then subscribed = subscribed + 1 end
        end
    end

    if subscribed > 0 then
        self._vehicleFleetSubscribed = true
        if FarmDashLog and FarmDashLog.dev then
            FarmDashLog.dev("subscribed to %d vehicle shop event(s)", subscribed)
        end
    end
end

--- Fallback probe for SP only — MP authority uses shop hooks (never walk fleet table).
function FarmDashboardDataCollector:_updateVehicleSpawnGrace()
    if not FarmDashboard or not FarmDashboard.isAuthority or not FarmDashboard:isAuthority() then return end
    if self:_isServerExportHost() then return end
    local untilG = self._vehicleSpawnGraceUntilGTime
    if type(untilG) == "number" and type(_G.g_time) == "number" and _G.g_time < untilG then
        return
    end

    local total, ready, incomplete = self:_probeMissionFleet()

    if incomplete then
        self:_beginVehicleSpawnGrace("incomplete_spawn")
        self._vehicleCountProbe = total
        self._vehicleReadyCountProbe = ready
        return
    end

    local nowS = self:_missionNowSec()
    if type(self._postLoadCollectionGraceUntil) == "number" and nowS < self._postLoadCollectionGraceUntil then
        self._vehicleCountProbe = total
        self._vehicleReadyCountProbe = ready
        return
    end

    local prevTotal = self._vehicleCountProbe
    local prevReady = self._vehicleReadyCountProbe
    if type(prevTotal) ~= "number" then
        self._vehicleCountProbe = total
        self._vehicleReadyCountProbe = ready
        return
    end

    self._vehicleCountProbe = total
    self._vehicleReadyCountProbe = ready

    if total > prevTotal then
        self:_beginVehicleSpawnGrace("fleet_total_increased")
    end
end

function FarmDashboardDataCollector:shouldDeferVehicleFleetWork()
    if self:_getPendingVehicleLoadCount() > 0 then return true end

    local untilG = self._vehicleSpawnGraceUntilGTime
    if type(untilG) == "number" and type(_G.g_time) == "number" and _G.g_time < untilG then
        return true
    end

    if self:_isCourseplayFleetSettleActive() then
        return true
    end

    if self:_fleetHasIncompleteSpawn() then return true end
    local untilMs = self._vehicleSpawnGraceUntilMs
    if type(untilMs) ~= "number" then return false end
    if self:_missionNowMs() >= untilMs then return false end
    local total, ready, incomplete = self:_probeMissionFleet()
    if not incomplete and total > 0 and total == ready then
        return false
    end
    return true
end

--- Skip fleet-related slots during spawn grace without marking modules done or writing JSON.
function FarmDashboardDataCollector:_skipFleetSliceForSpawnGrace(order, name)
    self:_diagTrace("%s deferred (spawn grace)", tostring(name or "fleet"))
    if name == "vehicles" and rawget(_G, "VehicleDataCollector") then
        VehicleDataCollector._inc = nil
    elseif name == "finance" and rawget(_G, "FinanceDataCollector") then
        FinanceDataCollector._inc = nil
    end
    self._incActiveModule = nil
    local n = #order
    if n > 0 then
        self.nextSliceIdx = (self.nextSliceIdx or 1) % n + 1
    end
end

--- True when menus, pause, post-load grace, or zero-dt ticks should defer heavy collection.
function FarmDashboardDataCollector:shouldDeferCollectionWork(dt)
    if not _G.g_currentMission then return true end

    if self:_isServerShopFreeze() then return true end

    local nowS = self:_missionNowSec()
    if type(self._postLoadCollectionGraceUntil) == "number" and nowS < self._postLoadCollectionGraceUntil then
        return true
    end

    if type(dt) == "number" and dt <= 0 then
        return true
    end

    local mission = _G.g_currentMission
    local okPaused, paused = pcall(function()
        if mission.paused then return mission.paused end
        if type(mission.isPaused) == "function" then return mission:isPaused() end
        if type(mission.getIsPaused) == "function" then return mission:getIsPaused() end
        return false
    end)
    if okPaused and paused then return true end

    local gui = rawget(_G, "g_gui")
    if gui and type(gui.getIsGuiVisible) == "function" then
        local okVis, visible = pcall(function() return gui:getIsGuiVisible() end)
        if okVis and visible then
            local name = self:_getCurrentGuiName()
            if name then
                local lower = string.lower(name)
                if lower:find("shop", 1, true)
                    or lower:find("sell", 1, true)
                    or lower:find("courseplay", 1, true)
                    or lower:find("cpglobal", 1, true)
                    or lower:find("cpsettings", 1, true)
                    or lower:find("ingamemenu", 1, true)
                    or lower:find("pause", 1, true)
                    or lower:find("construction", 1, true)
                    or lower:find("vehicle", 1, true)
                then
                    return true
                end
            end
            return true
        end
    end

    return false
end

--- Drop in-flight incremental work when entering pause/menu (avoids stale vehicle refs during shop sell).
function FarmDashboardDataCollector:_abortActiveIncrementalWork()
    local name = self._incActiveModule
    if name == "vehicles" and rawget(_G, "VehicleDataCollector") then
        VehicleDataCollector._inc = nil
    elseif name == "finance" and rawget(_G, "FinanceDataCollector") then
        FinanceDataCollector._inc = nil
    elseif name == "fields" and rawget(_G, "FieldDataCollector") then
        FieldDataCollector._fdCo = nil
        FieldDataCollector._smState = nil
    elseif name == "economy" and rawget(_G, "EconomyDataCollector") then
        EconomyDataCollector._ecoCo = nil
        EconomyDataCollector._smState = nil
    elseif name == "production" and rawget(_G, "ProductionDataCollector") then
        ProductionDataCollector._co = nil
        ProductionDataCollector._smState = nil
    elseif name == "animals" and rawget(_G, "AnimalDataCollector") then
        AnimalDataCollector._iter = nil
        AnimalDataCollector._co = nil
    elseif name == "stock" and rawget(_G, "StockDataCollector") then
        StockDataCollector._inc = nil
    end
    self._incActiveModule = nil
    self._husbandryJob = nil
end

function FarmDashboardDataCollector:_updateCollectionPauseLatch(deferHeavy)
    if deferHeavy then
        if not self._collectionPausedLatch then
            self._collectionPausedLatch = true
            if self._incActiveModule or self._husbandryJob then
                self:_abortActiveIncrementalWork()
            end
        end
    else
        self._collectionPausedLatch = false
    end
end

--- Plan v5 B6+B8+B11: hook called by FarmDashboard:onStartMission to reset stability state.
--- - Clears animalMode samples so detection starts fresh on save load.
--- - Clears _detailLedger and _dirtyPens so we don't re-emit stale data from a previous session.
--- - Sets POST_LOAD_SILENCE_SEC silence window to absorb RL save-load event flood.
function FarmDashboardDataCollector:onMissionLoaded()
    self._animalMode = "unknown"
    self._animalModeSamples = { last = nil, agree = 0 }
    self._dirtyPens = {}
    self._dirtyPensCount = 0
    self._detailLedger = {}
    self._idSchemeDetected = false
    self._idScheme = "integer-v1"
    self._primedAfterFirstCycle = false
    self._rlEventFirstHitLogged = false
    self._vehicleCountProbe = nil
    self._vehicleReadyCountProbe = nil
    self._vehicleSpawnGraceUntilMs = nil
    self._vehicleSpawnGraceUntilGTime = nil
    self._fleetProbeCache = nil
    self._courseplayLoaded = nil
    self._cpAllowFleetScanAfterGTime = nil
    self._polledPendingLoadsActive = nil

    local D = rawget(_G, "FarmDashDiagnostics")
    local nowS = (D and D.nowSec and D.nowSec()) or 0
    self._postLoadSilenceUntil = nowS + POST_LOAD_SILENCE_SEC
    local graceSec = self.config.postLoadCollectionGraceSec or POST_LOAD_COLLECTION_GRACE_SEC
    self._postLoadCollectionGraceUntil = nowS + graceSec
    self._collectionPausedLatch = false

    if self:isCourseplayLoaded() and FarmDashboard and FarmDashboard.isAuthority and FarmDashboard:isAuthority() then
        local gt = _G.g_time
        if type(gt) == "number" then
            self._cpAllowFleetScanAfterGTime = gt + (graceSec * 1000) + COURSEPLAY_POST_LOAD_SCAN_DELAY_MS
        end
        Logging.info(
            "[FarmDash] Courseplay detected — fleet scans deferred until save load settles (~%ds)",
            graceSec + math.floor(COURSEPLAY_POST_LOAD_SCAN_DELAY_MS / 1000)
        )
    end

    -- Re-bootstrap from disk so we know which pens were already covered last session.
    self:_bootstrapDetailLedgerFromDisk()
    self:_subscribeToVehicleFleetEvents()
    if FarmDashboardCourseplayCompat and FarmDashboardCourseplayCompat.install then
        FarmDashboardCourseplayCompat.install()
    end
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
        { "production", "enableProduction" },
        { "stock",          "enableStock" },
        { "baleInventory",  "enableBaleInventory" },
        { "redTape",        "enableRedTape" },
    }
    for _, row in ipairs(seq) do
        local name, flag = row[1], row[2]
        if self.config[flag] then
            table.insert(order, name)
        end
    end
    return order
end

function FarmDashboardDataCollector:_diagEnabled()
    local D = rawget(_G, "FarmDashDiagnostics")
    return D and type(D.isEnabled) == "function" and D:isEnabled()
end

function FarmDashboardDataCollector:_diagNow()
    local D = rawget(_G, "FarmDashDiagnostics")
    if D and type(D.nowSec) == "function" then return D.nowSec() end
    return nil
end

function FarmDashboardDataCollector:_diagHitchMs()
    local slice = self.config and self.config.sliceBudgetMs
    return math.max(8, type(slice) == "number" and slice or 4)
end

function FarmDashboardDataCollector:_diagMarkHitch(ms)
    if type(ms) == "number" and ms >= self:_diagHitchMs() then return " HITCH" end
    return ""
end

function FarmDashboardDataCollector:_diagTrace(fmt, ...)
    if not self:_diagEnabled() then return end
    if FarmDashLog and FarmDashLog.trace then
        FarmDashLog.trace(fmt, ...)
    end
end

function FarmDashboardDataCollector:_cycleFreshCount(order)
    local n = 0
    for _, name in ipairs(order) do
        if self._cycleFresh and self._cycleFresh[name] then n = n + 1 end
    end
    return n
end

function FarmDashboardDataCollector:assembleDataFromModuleCache()
    if not _G.g_currentMission then return nil end

    local D = rawget(_G, "FarmDashDiagnostics")
    local nowS = (D and D.nowSec and D.nowSec()) or 0

    local mc = self.moduleCache
    local baleInv = mc.baleInventory
    if rawget(_G, "InventoryScan") and InventoryScan.mergeBaleExports then
        if rawget(_G, "FieldDataCollector") and FieldDataCollector.getBaleFieldRollup then
            local fieldRollup = FieldDataCollector.getBaleFieldRollup()
            if fieldRollup and type(fieldRollup.byFarm) == "table" and next(fieldRollup.byFarm) then
                baleInv = InventoryScan.mergeBaleExports(baleInv, fieldRollup)
            end
        end
        if rawget(_G, "StockDataCollector") and StockDataCollector._baleLast then
            baleInv = InventoryScan.mergeBaleExports(baleInv, StockDataCollector._baleLast)
        elseif type(mc.stock) == "table" and type(mc.stock.byFarm) == "table" then
            local farmIds = InventoryScan.collectPlayerFarmIds()
            local derived = InventoryScan.newBaleState(farmIds)
            InventoryScan.deriveBaleCountsFromStock(mc.stock.byFarm, derived)
            baleInv = InventoryScan.mergeBaleExports(
                baleInv,
                InventoryScan.finalizeBales(derived, self:getActiveFarmId())
            )
        end
    end
    local data = {
        -- Plan v5 Phase 0: schemaVersion + serverTimeSec on every emission.
        schemaVersion = DATA_SCHEMA_VERSION,
        serverTimeSec = nowS,
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
        economy    = mc.economy or {},
        stock      = mc.stock or { enabled = false, byFarm = {} },
        redTape    = mc.redTape or { enabled = false, byFarm = {} },
        --- Physical bales by fill + placement (BaleInventoryCollector / InventoryScan).
        baleInventory = baleInv or { farmId = nil, byFarm = {}, onField = {}, offField = {} }
    }

    _finalizeFillTypeNames(data)

    if rawget(_G, "FieldDataCollector") and FieldDataCollector.getCachedGameplayFlags then
        data.gameSettings = FieldDataCollector.getCachedGameplayFlags()
    end

    if data.finance and data.finance.money then
        data.money = data.finance.money
    end

    data.adsSummary = self:buildAdsSummary(mc.vehicles)
    data.vehicleYearsSummary = self:buildVehicleYearsSummary(mc.vehicles, data.gameTime)

    data.collectorModules = {
        animals = self.config.enableAnimals ~= false,
        vehicles = self.config.enableVehicles ~= false,
        fields = self.config.enableFields ~= false,
        finance = self.config.enableFinance ~= false,
        weather = self.config.enableWeather ~= false,
        economy = self.config.enableEconomy ~= false,
        production = self.config.enableProduction ~= false,
        stock = self.config.enableStock ~= false,
        redTape = self.config.enableRedTape ~= false,
    }

    self.data = data
    return data
end

--- Fleet aggregates when FS25_AdvancedDamageSystem vehicles are present in moduleCache.
function FarmDashboardDataCollector:buildAdsSummary(vehicles)
    if type(vehicles) ~= "table" then return nil end
    local summary = {
        enabled = false,
        vehicleCount = 0,
        inServiceCount = 0,
        breakdownVehicleCount = 0,
        overdueMaintenanceCount = 0,
    }
    for _, v in ipairs(vehicles) do
        local ads = v and v.ads
        if ads and ads.enabled then
            summary.enabled = true
            summary.vehicleCount = summary.vehicleCount + 1
            if ads.inService then
                summary.inServiceCount = summary.inServiceCount + 1
            end
            if (ads.breakdownCount or 0) > 0 then
                summary.breakdownVehicleCount = summary.breakdownVehicleCount + 1
            end
            if ads.intervalRatio ~= nil and ads.intervalRatio > 1 then
                summary.overdueMaintenanceCount = summary.overdueMaintenanceCount + 1
            end
        end
    end
    if not summary.enabled then return nil end
    return summary
end

function FarmDashboardDataCollector:isAdvancedDamageSystemLoaded()
    if _G.g_modIsLoaded and _G.g_modIsLoaded["FS25_AdvancedDamageSystem"] then
        return true
    end
    if _G.g_modManager and _G.g_modManager.getActiveModByName then
        local ok, mod = pcall(function()
            return _G.g_modManager:getActiveModByName("FS25_AdvancedDamageSystem")
        end)
        if ok and mod ~= nil then return true end
    end
    return false
end

function FarmDashboardDataCollector:isVehicleYearsLoaded()
    if _G.VehicleYears and _G.VehicleYears.modActivated then
        return true
    end
    if _G.g_modIsLoaded and _G.g_modIsLoaded["FS25_Vehicle_Years"] then
        return true
    end
    if _G.g_modManager and _G.g_modManager.getActiveModByName then
        local ok, mod = pcall(function()
            return _G.g_modManager:getActiveModByName("FS25_Vehicle_Years")
        end)
        if ok and mod ~= nil then return true end
    end
    return false
end

--- Fleet aggregates when FS25_Vehicle_Years data is present on exported vehicles.
function FarmDashboardDataCollector:buildVehicleYearsSummary(vehicles, gameTime)
    if type(vehicles) ~= "table" then return nil end

    local summary = {
        enabled = false,
        knownCount = 0,
        missingCount = 0,
        averageModelYear = nil,
        pre2000Count = 0,
        byDecade = {},
    }

    local yearSum = 0
    for _, v in ipairs(vehicles) do
        local vy = v and v.vehicleYears
        if vy and vy.enabled then
            summary.enabled = true
            if vy.yearKnown and vy.modelYear then
                summary.knownCount = summary.knownCount + 1
                yearSum = yearSum + vy.modelYear
                if vy.modelYear < 2000 then
                    summary.pre2000Count = summary.pre2000Count + 1
                end
                local decadeId = vy.decadeId or "unknown"
                summary.byDecade[decadeId] = (summary.byDecade[decadeId] or 0) + 1
            else
                summary.missingCount = summary.missingCount + 1
            end
        end
    end

    if not summary.enabled then return nil end
    if summary.knownCount > 0 then
        summary.averageModelYear = math.floor(yearSum / summary.knownCount + 0.5)
    end
    if gameTime and gameTime.year and summary.averageModelYear then
        summary.averageModelAge = math.max(0, tonumber(gameTime.year) - summary.averageModelYear)
    end
    return summary
end

--- @return boolean hasIncrementalCollector
function FarmDashboardDataCollector:collectorSupportsIncremental(name)
    if not self.coroutinesAvailable and COROUTINE_INCREMENTAL_COLLECTORS[name] then
        return false
    end
    local c = self.collectors[name]
    return c ~= nil and type(c.collectBegin) == "function" and type(c.collectStep) == "function"
end

function FarmDashboardDataCollector:collectorStepUsesCoroutine(name)
    return self.coroutinesAvailable and COROUTINE_INCREMENTAL_COLLECTORS[name] == true
end

function FarmDashboardDataCollector:startModuleSlice(name, order)
    if (name == "vehicles" or name == "finance") and self:shouldDeferVehicleFleetWork() then
        self:_skipFleetSliceForSpawnGrace(order, name)
        return
    end
    if self:collectorSupportsIncremental(name) then
        local c = self.collectors[name]
        local t0 = self:_diagNow()
        local ok, err = pcall(function() c:collectBegin() end)
        if t0 and self:_diagEnabled() then
            local ms = (self:_diagNow() - t0) * 1000
            self:_diagTrace("collectBegin %s ms=%.2f%s", name, ms, self:_diagMarkHitch(ms))
        end
        if not ok then
            FarmDashLog.devWarn("collectBegin failed for %s: %s", tostring(name), _farmDashFormatError(err))
            self:runLegacyModuleSlice(name, order)
            return
        end
    end
    self._incActiveModule = name
    self:_diagTrace("module active %s (incremental)", name)
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
    self:_diagTrace(
        "module done %s incremental=%s cycleProgress=%d/%d nextIdx=%d",
        name, usedIncremental and "yes" or "no", self:_cycleFreshCount(order), n, self.nextSliceIdx or 1
    )
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
    self._diagExportCycle = (self._diagExportCycle or 0) + 1
    self:_diagTrace("=== export cycle #%d complete — starting cycle tail ===", self._diagExportCycle)
    self._cycleFresh = {}
    if not self._cycleTailJob then
        self._cycleTailJob = { order = order, step = 1 }
    end
end

--- Spread end-of-cycle housekeeping across frames (adaptive probe, detail rotation, etc.).
function FarmDashboardDataCollector:cycleTailStep()
    local job = self._cycleTailJob
    if not job then return true end

    local tailNames = {
        "adaptiveProbe", "detectAnimalMode", "pollRequests",
        "rotateStaleDetails", "sweepTmp", "autoTuner", "primeDirtyPens",
    }
    local stepName = tailNames[job.step] or ("step" .. tostring(job.step))
    local t0 = self:_diagNow()

    if job.step == 1 then
        self:runAdaptiveProbeOnce()
        job.step = 2
    elseif job.step == 2 then
        if self._animalMode == "unknown" then
            self:detectAnimalModeOnce()
        end
        job.step = 3
    elseif job.step == 3 then
        self:_pollRequestsFile()
        job.step = 4
    elseif job.step == 4 then
        self:_rotateStaleDetailsByAge()
        job.step = 5
    elseif job.step == 5 then
        self:_sweepStaleTmpFiles()
        job.step = 6
    elseif job.step == 6 then
        self:_runAutoTunerOnce()
        job.step = 7
    elseif job.step == 7 then
        if not self._primedAfterFirstCycle then
            self._primedAfterFirstCycle = true
            self:_primeDirtyPensFromOwnedHusbandries()
        end
        self._cycleTailJob = nil
        if t0 and self:_diagEnabled() then
            local ms = (self:_diagNow() - t0) * 1000
            self:_diagTrace("cycleTail %s ms=%.2f%s — tail finished", stepName, ms, self:_diagMarkHitch(ms))
        end
        return true
    else
        self._cycleTailJob = nil
        return true
    end

    if t0 and self:_diagEnabled() then
        local ms = (self:_diagNow() - t0) * 1000
        self:_diagTrace("cycleTail %s ms=%.2f%s", stepName, ms, self:_diagMarkHitch(ms))
    end
    return false
end

--- Deferred disk write so JSON string concat and file I/O do not share one frame.
function FarmDashboardDataCollector:jsonDiskWriteStep()
    local pending = self._jsonPendingDisk
    if not pending then return true end

    local t0 = self:_diagNow()
    local bytes = pending.jsonString and #pending.jsonString or 0
    self:_writeJsonStringToDisk(pending.jsonString, pending.savegameDir)
    self._jsonPendingDisk = nil
    if t0 and self:_diagEnabled() then
        local ms = (self:_diagNow() - t0) * 1000
        self:_diagTrace("jsonDiskWrite bytes=%d ms=%.2f%s", bytes, ms, self:_diagMarkHitch(ms))
    end

    if self._jsonWritePending then
        local p = self._jsonWritePending
        self._jsonWritePending = nil
        self:beginDeferredJsonWrite(p)
    end
    return true
end

--- Plan v5 B8: rebuild _detailLedger from disk by reading the first 1 KiB of each
--- `details/animals_*.json` and pulling generatedAt from a regex match.
--- No reliance on `getFileTime` (not present in our Giants Lua surface).
function FarmDashboardDataCollector:_bootstrapDetailLedgerFromDisk()
    local dir = self:_detailDirPath()
    if type(io) ~= "table" or type(io.open) ~= "function" then return end

    local list = _tryGetFilesList(dir)
    if type(list) ~= "table" then return end

    local seeded = 0
    for _, name in ipairs(list) do
        if seeded >= 1024 then break end
        if type(name) == "string" and string.sub(name, 1, 8) == "animals_" and string.sub(name, -5) == ".json" then
            local head = _readPathLimited(dir .. name, 1024) or ""
            if #head > 0 then
                local g = string.match(head, '"generatedAt"%s*:%s*(%-?%d+%.?%d*)')
                local penFromName = string.sub(name, 9, -6) -- strip "animals_" and ".json"
                if penFromName ~= nil and #penFromName > 0 then
                    local ts = tonumber(g) or 0
                    self._detailLedger[penFromName] = { ts = ts, animalCount = 0, placeableId = 0 }
                    seeded = seeded + 1
                end
            end
        end
    end
    if seeded > 0 then
        FarmDashLog.dev("bootstrapped %d detail ledger entries from disk", seeded)
    end
end

--- Plan v5 B8: prime _dirtyPens with up to DIRTY_PENS_HARD_CAP owned-husbandry pens.
function FarmDashboardDataCollector:_primeDirtyPensFromOwnedHusbandries()
    if not _G.g_currentMission or not _G.g_currentMission.husbandrySystem then return end
    local D = rawget(_G, "FarmDashDiagnostics")
    local nowS = (D and D.nowSec and D.nowSec()) or 0
    local primed = 0
    for _, p in pairs(_G.g_currentMission.husbandrySystem.placeables or {}) do
        if (self._dirtyPensCount or 0) >= DIRTY_PENS_HARD_CAP then break end
        if p then
            local key = self:_penKeyFor(p)
            if key ~= nil and self._dirtyPens[key] == nil then
                self._dirtyPens[key] = nowS
                self._dirtyPensCount = (self._dirtyPensCount or 0) + 1
                primed = primed + 1
            end
        end
    end
    if primed > 0 then
        FarmDashLog.dev("primed _dirtyPens with %d owned husbandries (idScheme=%s)", primed, tostring(self._idScheme))
    end
end

--- Plan v5 B10: always-on auto-tuner. Reads diag bucket stats for animals_collectStep, scales
--- animalRowsPerSlice up/down by 20% with a 60s damping window and a [64..8192] clamp.
--- Persisted to config.xml only on shutdown to avoid disk churn.
function FarmDashboardDataCollector:_runAutoTunerOnce()
    local D = rawget(_G, "FarmDashDiagnostics")
    if not D or type(D.bucketStats) ~= "function" then return end
    local now = (D.nowSec and D.nowSec()) or 0
    if (now - (self._lastAutoTuneSec or 0)) < 60 then return end

    local stats = D:bucketStats("animals_collectStep")
    if not stats or not stats.median then return end

    local slice = self.config.sliceBudgetMs or 4
    local cur = self.config.animalRowsPerSlice or 256
    local nextVal = cur

    if stats.median > slice * 0.7 then
        nextVal = math.max(64, math.floor(cur * 0.8))
    elseif stats.median < slice * 0.3 and (stats.p99 or 0) < slice then
        nextVal = math.min(8192, math.floor(cur * 1.2))
    end

    if nextVal ~= cur then
        self._lastAutoTuneSec = now
        self.config.animalRowsPerSlice = nextVal
        if D:isEnabled() then
            FarmDashLog.dev("[autotune] animalRowsPerSlice %d -> %d (median=%.2fms p99=%.2fms slice=%dms)",
                cur, nextVal, stats.median, stats.p99 or 0, slice)
        end
    end
end

--- Phase 7.1 + Plan v5 B11: schedule re-write for any pen whose detail file is older than
--- detailMaxAgeSec. Uses bounded _dirtyPens insertion (drops oldest at cap).
function FarmDashboardDataCollector:_rotateStaleDetailsByAge()
    local D = rawget(_G, "FarmDashDiagnostics")
    local nowS = (D and D.nowSec and D.nowSec()) or 0
    local maxAge = self.config.detailMaxAgeSec or 60
    local cutoff = nowS - maxAge

    for penKey, info in pairs(self._detailLedger) do
        if (info.ts or 0) < cutoff then
            if self._dirtyPens[penKey] == nil and (self._dirtyPensCount or 0) < DIRTY_PENS_HARD_CAP then
                self._dirtyPens[penKey] = nowS
                self._dirtyPensCount = (self._dirtyPensCount or 0) + 1
            end
        end
    end
end

--- Run at most one incremental step for the active module (same frame as slot start is allowed).
function FarmDashboardDataCollector:runIncrementalActiveStep(order)
    local name = self._incActiveModule
    if not name then return end
    if (name == "vehicles" or name == "finance") and self:shouldDeferVehicleFleetWork() then
        self:_skipFleetSliceForSpawnGrace(order, name)
        return
    end
    local c = self.collectors[name]
    if not c or not c.collectStep then
        self._incActiveModule = nil
        return
    end

    local sliceMs = self.config.sliceBudgetMs or 4
    local arps = self.config.animalRowsPerSlice or 256
    local D = rawget(_G, "FarmDashDiagnostics")
    if D and type(D.getLoadInfo) == "function" then
        local info = D:getLoadInfo(sliceMs)
        local stress = false
        if info.animalsCollectMedianMs and sliceMs > 0 and info.animalsCollectMedianMs > sliceMs * 0.5 then
            stress = true
        end
        if info.animalsCollectP99Ms and sliceMs > 0 and info.animalsCollectP99Ms > sliceMs then
            stress = true
        end
        if info.lastUpdateDtMs and info.lastUpdateDtMs > 25 then
            stress = true
        end
        if stress then
            arps = math.min(arps, 64)
        end
    end

    local opts = {
        batchSize = self.config.fieldsPerFrame or 1,
        animalBatch = self.config.animalsPerFrame or 1,
        baleBudget = self.config.baleEntitiesBudget or 8,
        baleWorldEntitiesPerFrame = self.config.baleWorldEntitiesPerFrame or 8,
        vehicleBatch = self.config.vehiclesPerFrame or 2,
        financeVehiclesPerFrame = self.config.financeVehiclesPerFrame or 4,
        redTapeFarmsPerFrame = self.config.redTapeFarmsPerFrame or 1,
        economyYieldStride = self.config.economyYieldStride or 20,
        productionChainsPerYield = self.config.productionChainsPerYield or 1,
        productionPlaceablesPerYield = self.config.productionPlaceablesPerYield or 4,
        stockPlaceablesPerFrame = self.config.stockPlaceablesPerFrame or 3,
        balePlaceablesPerFrame = self.config.stockPlaceablesPerFrame or 3,
        --- Phase 2: row-count caps as primary safety net + opportunistic wall-clock budget.
        animalRowsPerSlice = arps,
        sliceBudgetMs = sliceMs,
    }

    local collectTok = D and D:start("collectStep_" .. name)
    local stepTok = self:_diagNow()
    local done, payload
    if self:collectorStepUsesCoroutine(name) then
        -- coroutine.resume/yield must not cross pcall/xpcall — call collectStep directly.
        done, payload = c:collectStep(opts)
    else
        local ok, stepErr = pcall(function()
            done, payload = c:collectStep(opts)
        end)
        if not ok then
            if collectTok and D then D:stop(collectTok) end
            FarmDashLog.devWarn("collectStep failed for %s: %s", tostring(name), _farmDashFormatError(stepErr))
            self.moduleCache[name] = {}
            self:finishModuleSlice(name, order, true)
            return
        end
    end
    if collectTok and D then D:stop(collectTok) end
    if stepTok and self:_diagEnabled() then
        local ms = (self:_diagNow() - stepTok) * 1000
        self:_diagTrace(
            "collectStep %s done=%s ms=%.2f frameDt=%.2fms%s",
            name, tostring(done), ms,
            D and D.lastUpdateDtMs or 0,
            self:_diagMarkHitch(ms)
        )
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
    elseif name ~= "production" then
        self.moduleCache[name] = payload or {}
    end

    --- Partial incremental steps skip refreshAssembledInMemory (full assemble every frame hitched while driving).

    if done and name ~= "production" then
        self:finishModuleSlice(name, order, true)
    end
end

--- Legacy synchronous collect for one module name.
function FarmDashboardDataCollector:runLegacyModuleSlice(name, order)
    self:_diagTrace("legacy collect start %s", name)
    local t0 = self:_diagNow()
    local result = self:safeCollect(name)
    if t0 and self:_diagEnabled() then
        local ms = (self:_diagNow() - t0) * 1000
        self:_diagTrace("legacy collect done %s ms=%.2f%s", name, ms, self:_diagMarkHitch(ms))
    end
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
    local cycleMs = self.config.collectionCycleMs or 60000
    local slotMs = cycleMs / n

    if self:_cycleFreshCount(order) == 0 and not self._incActiveModule then
        self._diagSlotCycle = (self._diagSlotCycle or 0) + 1
        self:_diagTrace(
            "=== slot cycle #%d begin modules=%d slotMs=%.0f cycleMs=%d order=%s ===",
            self._diagSlotCycle, n, slotMs, cycleMs, table.concat(order, ",")
        )
    end

    if self:collectorSupportsIncremental(name) then
        self:_diagTrace("slot #%d/%d start %s (incremental)", idx, n, name)
        self:startModuleSlice(name, order)
        --- First collectStep runs next frame (update drain) so slot boundary does not stack collectBegin + collectStep in one frame.
        return
    end

    self:_diagTrace("slot #%d/%d start %s (legacy)", idx, n, name)
    self:runLegacyModuleSlice(name, order)
end

function FarmDashboardDataCollector:update(dt)
    if type(dt) ~= "number" then return end
    local diagEarly = rawget(_G, "FarmDashDiagnostics")
    if diagEarly and dt > 0 then
        diagEarly.lastUpdateDtMs = dt * 1000
    end
    if not _G.g_currentMission then return end

    local diag = rawget(_G, "FarmDashDiagnostics")
    local updTok = (diag and diag:isEnabled()) and diag:start("update_total") or nil

    self:_updateBody(dt)

    if diag and updTok then diag:stop(updTok) end
    if diag and diag:isEnabled() then
        diag:maybeDump({
            animalMode = self._animalMode,
            totalAnimals = self._lastAnimalProbe and self._lastAnimalProbe.total or nil,
            totalPens = self._lastAnimalProbe and self._lastAnimalProbe.pens or nil,
            cycleMs = self.config and self.config.collectionCycleMs or nil,
            jsonBytes = self._lastJsonBytes,
        })
    end
end

function FarmDashboardDataCollector:_updateBody(dt)
    self:_pollShopPendingLoads()
    if self:_isServerShopFreeze() then
        self:_updateCollectionPauseLatch(true)
        return
    end
    if not self:_isServerExportHost() then
        self:_updateVehicleSpawnGrace()
        if self:_isServerShopFreeze() then
            self:_updateCollectionPauseLatch(true)
            return
        end
    end
    -- Phase 5: re-detect animal mode until stable (cheap call: returns early once husbandry has data).
    if self._animalMode == nil or self._animalMode == "unknown" then
        self:detectAnimalModeOnce()
    end

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
    local deferHeavy = self:shouldDeferCollectionWork(dt)
    self:_updateCollectionPauseLatch(deferHeavy)

    --- One engine work unit per frame: JSON serialize, disk write, cycle tail, or collector step.
    local frameWorkDone = false

    if self._jsonWriteJob then
        self:jsonWriteStep()
        frameWorkDone = true
    elseif self._jsonPendingDisk then
        self:jsonDiskWriteStep()
        frameWorkDone = true
    elseif self._cycleTailJob then
        self:cycleTailStep()
        frameWorkDone = true
    end

    if not deferHeavy and not frameWorkDone then
        if self._incActiveModule then
            self:runIncrementalActiveStep(order)
            frameWorkDone = true
        elseif self._husbandryJob then
            self:husbandryTotalsStep()
            frameWorkDone = true
        end
    end

    if self._incActiveModule or self._husbandryJob or self._jsonWriteJob or self._jsonPendingDisk or self._cycleTailJob then
        return
    end

    if effDt <= 0 then
        self:_maybeProcessDetailQueueTail()
        return
    end

    -- All modules disabled in config: still emit data.json on a heartbeat (otherwise file never appears).
    if n < 1 then
        if not self.staggerFirstRunDone then
            self.staggerFirstRunDone = true
            self.nextSliceIdx = 1
            self.slotAccumulator = 0
            local assembled = self:assembleDataFromModuleCache()
            if assembled then self:writeDataToFile(assembled) end
            self:_maybeProcessDetailQueueTail()
            return
        end
        self.slotAccumulator = (self.slotAccumulator or 0) + effDt
        while self.slotAccumulator >= cycleMs do
            self.slotAccumulator = self.slotAccumulator - cycleMs
            local assembled = self:assembleDataFromModuleCache()
            if assembled then self:writeDataToFile(assembled) end
        end
        self:_maybeProcessDetailQueueTail()
        return
    end

    --- Next inter-module slot after this many ms of mission time (same units as collectionCycleMs / dt).
    --- Example: 60000 ms cycle, 5 modules enabled → ~12s between periodic export slot boundaries.
    local slotMs = cycleMs / n

    if not self.staggerFirstRunDone then
        if deferHeavy then
            self:_maybeProcessDetailQueueTail()
            return
        end
        self.staggerFirstRunDone = true
        self.nextSliceIdx = 1
        self.slotAccumulator = 0
        self:consumeOneModuleSlot(order)
        self:_maybeProcessDetailQueueTail()
        return
    end

    self.slotAccumulator = (self.slotAccumulator or 0) + effDt
    --- At most one inter-module slot per engine tick to avoid multi-collector spikes in a single frame.
    if self.slotAccumulator >= slotMs then
        if deferHeavy then
            self.slotAccumulator = math.min(self.slotAccumulator, slotMs)
        else
            self.slotAccumulator = self.slotAccumulator - slotMs
            self:consumeOneModuleSlot(order)
        end
    end

    -- Phase 7: one cooperative detail write per frame when no collector/JSON work ran this tick.
    if not frameWorkDone then
        self:_maybeProcessDetailQueueTail()
    end
end

--- Runs after stagger / slot logic. At most one pen per tick; refreshes index when the queue drains.
function FarmDashboardDataCollector:_maybeProcessDetailQueueTail()
    if next(self._dirtyPens) == nil then return end
    local hasMore = self:processDetailQueueOnce()
    if not hasMore then
        self:_sweepDetailRotation()
        self:_writeDirtyPensIndex()
    end
end

--- Phase 6: per-farm aggregation. Adds one placeable's husbandry fill readings into `totalsByFarm`
--- (a map farmId -> {fillType -> level}). The legacy single-farm `totals` view is reconstructed
--- by callers that need it (typically farmId == activeFarmId).
function FarmDashboardDataCollector:accumulateHusbandryTotalsForPlaceable(placeable, totalsByFarm)
    if not placeable or type(totalsByFarm) ~= "table" then return end

    local farmId
    local okFarm, fid = pcall(function() return placeable:getOwnerFarmId() end)
    if okFarm and type(fid) == "number" then farmId = fid else farmId = 0 end

    local farmTable = totalsByFarm[farmId]
    if not farmTable then
        farmTable = {}
        totalsByFarm[farmId] = farmTable
    end

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
            farmTable[typeName] = (farmTable[typeName] or 0) + fillLevel
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
                    farmTable[typeName] = (farmTable[typeName] or 0) + unit.fillLevel
                end
            end
        end
    end
end

function FarmDashboardDataCollector:startHusbandryJobAfterProduction(order, incrementalFlag)
    self._slicePendingFinish = nil
    self._husbandryJob = nil
    -- Phase 6: include all farms; per-farm split is computed in accumulator.
    local list = {}
    if _G.g_currentMission and _G.g_currentMission.husbandrySystem then
        for _, placeable in pairs(_G.g_currentMission.husbandrySystem.placeables or {}) do
            if placeable then
                table.insert(list, placeable)
            end
        end
    end
    if #list < 1 then
        return
    end
    self._husbandryJob = { list = list, idx = 1, totalsByFarm = {} }
    self._slicePendingFinish = { name = "production", order = order, incremental = incrementalFlag }
end

--- @return boolean true when job finished (or none)
function FarmDashboardDataCollector:husbandryTotalsStep()
    local job = self._husbandryJob
    if not job then return true end
    local per = self.config.husbandryPlaceablesPerFrame or 3
    local n = #job.list
    local hi = math.min(job.idx + per - 1, n)
    local fromIdx = job.idx
    local t0 = self:_diagNow()
    for i = job.idx, hi do
        local ok, err = pcall(function()
            self:accumulateHusbandryTotalsForPlaceable(job.list[i], job.totalsByFarm)
        end)
        if not ok then
            FarmDashLog.devWarn("husbandryTotalsStep placeable: %s", tostring(err))
        end
    end
    job.idx = hi + 1
    if t0 and self:_diagEnabled() then
        local ms = (self:_diagNow() - t0) * 1000
        self:_diagTrace(
            "husbandryTotals %d-%d/%d ms=%.2f%s",
            fromIdx, hi, n, ms, self:_diagMarkHitch(ms)
        )
    end
    if job.idx > n then
        if self.moduleCache.production then
            local activeFarmId = self:getActiveFarmId()
            self.moduleCache.production.husbandryTotals = job.totalsByFarm[activeFarmId] or {}
            self.moduleCache.production.husbandryTotalsByFarm = job.totalsByFarm
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

--- The "active" farm whose totals are surfaced via legacy `husbandryTotals`. v1 picks farmId=1
--- (matches existing UI). Phase 6 still publishes per-farm splits via `husbandryTotalsByFarm`.
function FarmDashboardDataCollector:getActiveFarmId()
    return 1
end

--- Spread top-level JSON keys across frames, then write the file once.
--- Each top-level key's encoded string is held in `parts`; final write does table.concat.
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
    data.serverInfo = data.serverInfo or {}
    data.serverInfo.mapName = currentMapName
    data.serverInfo.saveSlot = savegameDir
    if self._animalMode then
        data.serverInfo.animalMode = self._animalMode
    end
    data.serverInfo.idScheme = self._idScheme
    if _G.FarmDashboard and _G.FarmDashboard.VERSION then
        data.serverInfo.modVersion = _G.FarmDashboard.VERSION
    end
    if self:isAdvancedDamageSystemLoaded() or (data.adsSummary and data.adsSummary.enabled) then
        data.serverInfo.adsEnabled = true
    end
    if self:isVehicleYearsLoaded() or (data.vehicleYearsSummary and data.vehicleYearsSummary.enabled) then
        data.serverInfo.vehicleYearsEnabled = true
    end
    data.serverInfo.mapBounds = self:getMapBounds()
    data.serverInfo.mapBounds = self:refineMapBoundsFromWorldActivity(data, data.serverInfo.mapBounds)
    if _G.g_currentMission and _G.g_currentMission.missionInfo then
        local info = _G.g_currentMission.missionInfo
        if info.mapId and info.mapId ~= "" then
            data.serverInfo.mapId = tostring(info.mapId)
        end
    end
    pcall(function() self:_exportMapOverviewForDashboard() end)
    -- Plan v5 Phase 0: schemaVersion + serverTimeSec.
    data.schemaVersion = DATA_SCHEMA_VERSION
    if data.serverTimeSec == nil then
        local D = rawget(_G, "FarmDashDiagnostics")
        data.serverTimeSec = (D and D.nowSec and D.nowSec()) or 0
    end

    -- Do not nuke an in-flight write: clobbering `_jsonWriteJob` mid-serialization can leave
    -- data.json stuck at the empty bootstrap forever (no key ever reaches disk). Queue the
    -- latest snapshot and apply it when the current job finishes.
    if self._jsonWriteJob then
        self._jsonWritePending = data
        self:_diagTrace("jsonWrite deferred (job in flight)")
        return
    end

    local keys = {}
    for k in pairs(data) do
        keys[#keys + 1] = tostring(k)
    end
    table.sort(keys, function(a, b) return a < b end)

    self._jsonWriteJob = {
        data = data,
        keys = keys,
        i = 1,
        parts = { "{\n" },
    }
    self:_diagTrace("jsonWrite begin keys=%d keysPerFrame=%d", #keys, self.config.jsonTopLevelKeysPerFrame or 1)
end

function FarmDashboardDataCollector:jsonWriteStep()
    local job = self._jsonWriteJob
    if not job then return true end

    local diag = rawget(_G, "FarmDashDiagnostics")
    local tok = (diag and diag:isEnabled()) and diag:start("jsonWriteStep") or nil

    local nk = #job.keys
    local per = math.max(1, self.config.jsonTopLevelKeysPerFrame or 1)
    local parts = job.parts
    local stepStart = job.i
    local stepTok = self:_diagNow()
    for _ = 1, per do
        if job.i > nk then break end
        local k = job.keys[job.i]
        local v = job.data[k]
        parts[#parts + 1] = '  "'
        parts[#parts + 1] = _escapeJsonKey(tostring(k))
        parts[#parts + 1] = '": '

        local okJson, err = xpcall(function()
            self:_toJSONInto(parts, v, false, 1)
        end, _farmDashFormatError)
        if not okJson then
            FarmDashLog.devWarn("json chunk toJSON failed for key '%s': %s", tostring(k), tostring(err))
            parts[#parts + 1] = "null"
        end

        if job.i < nk then parts[#parts + 1] = "," end
        parts[#parts + 1] = "\n"
        job.i = job.i + 1
    end

    if job.i > nk then
        parts[#parts + 1] = "}"
        local jsonString = table.concat(parts)
        self._lastJsonBytes = #jsonString
        local savegameDir = self:getSavegameDirName()
        self._jsonPendingDisk = { jsonString = jsonString, savegameDir = savegameDir }
        self._jsonWriteJob = nil
        if diag and tok then diag:stop(tok) end
        if stepTok and self:_diagEnabled() then
            local ms = (self:_diagNow() - stepTok) * 1000
            self:_diagTrace(
                "jsonWrite complete bytes=%d ms=%.2f%s",
                #jsonString, ms, self:_diagMarkHitch(ms)
            )
        end
        return true
    end

    if diag and tok then diag:stop(tok) end
    if stepTok and self:_diagEnabled() then
        local ms = (self:_diagNow() - stepTok) * 1000
        local keyList = {}
        for i = stepStart, math.min(job.i - 1, nk) do
            keyList[#keyList + 1] = job.keys[i]
        end
        self:_diagTrace(
            "jsonWrite step keys=%d/%d [%s] ms=%.2f%s",
            job.i - 1, nk, table.concat(keyList, ","), ms, self:_diagMarkHitch(ms)
        )
    end
    return false
end

--- Write a fully built JSON string to data.json (I/O only).
function FarmDashboardDataCollector:_writeJsonStringToDisk(jsonData, savegameDir)
    if not jsonData or jsonData == "" then
        FarmDashLog.devWarn("skip write: empty JSON string")
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
        FarmDashLog.devWarn("Lua io.open is not available; cannot write data.json.")
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
            FarmDashLog.dev("data.json write OK: %s", tostring(normPath))
        end
        self._writeFailLogged = nil
        self._writeFailCount = 0
    else
        self._writeFailCount = (self._writeFailCount or 0) + 1
        if not self._writeFailLogged or self._writeFailCount % 40 == 0 then
            self._writeFailLogged = true
            FarmDashLog.devWarn("Could not write data.json (path: %s) [fail #%d]", tostring(normPath), self._writeFailCount)
        end
    end
end

--- Aggregate milk/manure/slurry totals across all husbandry buildings.
--- Returns the active-farm view (legacy callers); the per-farm map is filled in via the
--- deferred husbandry job (`production.husbandryTotalsByFarm`).
function FarmDashboardDataCollector:collectHusbandryTotals()
    local byFarm = {}
    if not _G.g_currentMission or not _G.g_currentMission.husbandrySystem then
        return {}, byFarm
    end
    local ok, err = pcall(function()
        for _, placeable in pairs(_G.g_currentMission.husbandrySystem.placeables or {}) do
            self:accumulateHusbandryTotalsForPlaceable(placeable, byFarm)
        end
    end)
    if not ok then
        FarmDashLog.devWarn("collectHusbandryTotals failed: %s", tostring(err))
    end
    local activeFarmId = self:getActiveFarmId()
    return byFarm[activeFarmId] or {}, byFarm
end

function FarmDashboardDataCollector:safeCollect(collectorName)
    local collector = self.collectors[collectorName]
    if not collector or not collector.collect then return {} end

    local success, result = pcall(function() return collector:collect() end)
    if success then
        return result or {}
    else
        FarmDashLog.devWarn("Failed to collect %s", tostring(collectorName))
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

--- World bounds for dashboard fleet map (terrain half-extent in metres).
function FarmDashboardDataCollector:refineMapBoundsFromWorldActivity(data, bounds)
    if not bounds or type(bounds) ~= "table" then
        return bounds
    end
    local half = tonumber(bounds.halfSize) or 1024
    local maxAbs = 0
    local function consider(x, z)
        x = tonumber(x)
        z = tonumber(z)
        if x and z and (math.abs(x) > 0.5 or math.abs(z) > 0.5) then
            maxAbs = math.max(maxAbs, math.abs(x), math.abs(z))
        end
    end
    if data and data.vehicles then
        for _, v in pairs(data.vehicles) do
            if v and v.position then
                consider(v.position.x, v.position.z)
            end
        end
    end
    if maxAbs <= half * 0.98 then
        return bounds
    end
    local newHalf = 1024
    while newHalf < maxAbs and newHalf < 8192 do
        newHalf = newHalf * 2
    end
    if newHalf <= half then
        return bounds
    end
    bounds.halfSize = newHalf
    bounds.terrainSize = newHalf * 2
    bounds.minX = -newHalf
    bounds.maxX = newHalf
    bounds.minZ = -newHalf
    bounds.maxZ = newHalf
    return bounds
end

function FarmDashboardDataCollector:getMapBounds()
    local half = 1024
    local ok, ts = pcall(function()
        local mission = _G.g_currentMission
        if not mission then return nil end
        local full = tonumber(mission.terrainSize)
        if full and full >= 128 then
            return full * 0.5
        end
        if mission.terrainRootNodeId and type(getTerrainSize) == "function" then
            local size = tonumber(getTerrainSize(mission.terrainRootNodeId))
            if size and size >= 128 then
                return size * 0.5
            end
        end
        return nil
    end)
    if ok and ts and ts >= 64 then
        half = ts
    end
    return {
        minX = -half,
        maxX = half,
        minZ = -half,
        maxZ = half,
        halfSize = half,
        terrainSize = half * 2
    }
end

function FarmDashboardDataCollector:getFarmInfo()
    local farms = {}
    if _G.g_farmManager then
        for _, farm in pairs(_G.g_farmManager.farms) do
            local farmId = tonumber(farm.farmId) or 0
            if farmId > 0 then
                local farmData = {
                    id      = farmId,
                    farmId  = farmId,
                    name    = farm.name   or ("Farm " .. tostring(farmId)),
                    color   = farm.color  or 0,
                    loan    = farm.loan   or 0,
                    money   = farm.money  or 0,
                    players = {},
                    isPlayer = false,
                }
                if farm.players then
                    for _, player in pairs(farm.players) do
                        farmData.isPlayer = true
                        table.insert(farmData.players, {
                            name   = player.nickname or "Unknown",
                            id     = player.userId
                        })
                    end
                end
                local farmName = farm.name and tostring(farm.name):match("^%s*(.-)%s*$") or ""
                if not farmData.isPlayer and farmName ~= "" then
                    farmData.isPlayer = true
                end
                -- Dedicated MP: only farms with assigned players (excludes 0, 100, empty NPC slots).
                if farmId == 0 or farmId == 100 then
                    -- skip contractor pool / unassigned
                elseif #farmData.players > 0 then
                    table.insert(farms, farmData)
                end
            end
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
    data.serverInfo = {
        mapName = currentMapName,
        saveSlot = savegameDir,
        mapBounds = self:refineMapBoundsFromWorldActivity(data, self:getMapBounds()),
    }
    if _G.g_currentMission and _G.g_currentMission.missionInfo then
        local info = _G.g_currentMission.missionInfo
        if info.mapId and info.mapId ~= "" then
            data.serverInfo.mapId = tostring(info.mapId)
        end
    end

    local okJson, jsonData = pcall(function() return self:toJSON(data, 0) end)
    if not okJson then
        FarmDashLog.devWarn("toJSON failed: %s", tostring(jsonData))
        return
    end
    self:_writeJsonStringToDisk(jsonData, savegameDir)
end

--- @param depth number|nil nil = compact (legacy); 0+ = pretty-print with 2-space indent
--- O(N) build via parts table + table.concat. Backwards-compat wrapper around _toJSONInto.
--- nan / inf serialize as JSON null. Sparse number-keyed tables serialize as objects.
--- Object keys are sorted lexicographically to keep the byte stream deterministic.
function FarmDashboardDataCollector:toJSON(data, depth)
    local diag = rawget(_G, "FarmDashDiagnostics")
    local tok = (diag and diag:isEnabled()) and diag:start("toJSON") or nil

    local parts = {}
    local compact = (depth == nil)
    local level = compact and 0 or depth or 0
    self:_toJSONInto(parts, data, compact, level)
    local result = table.concat(parts)

    if diag and tok then diag:stop(tok) end
    self._lastJsonBytes = #result
    return result
end

--- Append the JSON encoding of `data` to `parts` (1-based array of strings).
--- `compact==true` skips whitespace; otherwise pretty-prints with 2-space indent at `level`.
function FarmDashboardDataCollector:_toJSONInto(parts, data, compact, level)
    if type(data) == "string" and data == "__FD_JSON_NULL__" then
        parts[#parts + 1] = "null"
        return
    end

    local t = type(data)
    if t == "table" then
        local isArray = true
        local count = 0
        for k in pairs(data) do
            count = count + 1
            if type(k) ~= "number" or k ~= count then
                isArray = false
                break
            end
        end

        if count == 0 then
            if compact then
                parts[#parts + 1] = "{}"
            else
                parts[#parts + 1] = "{\n"
                parts[#parts + 1] = string.rep("  ", level)
                parts[#parts + 1] = "}"
            end
            return
        end

        local nl = compact and "" or "\n"
        local ind = compact and "" or string.rep("  ", level)
        local ind1 = compact and "" or string.rep("  ", level + 1)
        local sp = compact and "" or " "

        if isArray then
            parts[#parts + 1] = "["
            parts[#parts + 1] = nl
            for i = 1, count do
                if i > 1 then
                    parts[#parts + 1] = ","
                    parts[#parts + 1] = nl
                end
                parts[#parts + 1] = ind1
                self:_toJSONInto(parts, data[i], compact, level + 1)
            end
            parts[#parts + 1] = nl
            parts[#parts + 1] = ind
            parts[#parts + 1] = "]"
        else
            local keys = {}
            for k in pairs(data) do
                keys[#keys + 1] = k
            end
            table.sort(keys, function(a, b) return tostring(a) < tostring(b) end)

            parts[#parts + 1] = "{"
            parts[#parts + 1] = nl
            for i = 1, #keys do
                if i > 1 then
                    parts[#parts + 1] = ","
                    parts[#parts + 1] = nl
                end
                local k = keys[i]
                parts[#parts + 1] = ind1
                parts[#parts + 1] = '"'
                parts[#parts + 1] = _escapeJsonKey(tostring(k))
                parts[#parts + 1] = '":'
                parts[#parts + 1] = sp
                self:_toJSONInto(parts, data[k], compact, level + 1)
            end
            parts[#parts + 1] = nl
            parts[#parts + 1] = ind
            parts[#parts + 1] = "}"
        end
        return
    end

    if t == "string" then
        parts[#parts + 1] = '"'
        parts[#parts + 1] = _escapeJsonString(data)
        parts[#parts + 1] = '"'
    elseif t == "number" then
        parts[#parts + 1] = _formatNumber(data)
    elseif t == "boolean" then
        parts[#parts + 1] = data and "true" or "false"
    else
        parts[#parts + 1] = "null"
    end
end

function FarmDashboardDataCollector:getCurrentData() return self.data end

--- Phase 7: detail-mode helpers ------------------------------------------

function FarmDashboardDataCollector:_detailDirPath()
    local base = getUserProfileAppPath() .. "modSettings/FS25_FarmDashboard/" .. self:getSavegameDirName() .. "/details/"
    createFolder(base)
    return base
end

function FarmDashboardDataCollector:_requestDirPath()
    local base = getUserProfileAppPath() .. "modSettings/FS25_FarmDashboard/" .. self:getSavegameDirName() .. "/requests/"
    createFolder(base)
    return base
end

--- Plan v5 B5: look up a placeable by penKey (composite-v1 or integer-v1).
function FarmDashboardDataCollector:_findPlaceableByKey(penKey)
    if penKey == nil then return nil end
    if not _G.g_currentMission or not _G.g_currentMission.husbandrySystem then return nil end
    for _, p in pairs(_G.g_currentMission.husbandrySystem.placeables or {}) do
        if p then
            local k = self:_penKeyFor(p)
            if k == penKey then return p end
        end
    end
    return nil
end

--- Legacy adapter: keeps old call sites working (treats numeric id as integer-v1 key).
function FarmDashboardDataCollector:_findPlaceableById(penId)
    if penId == nil then return nil end
    -- Try integer match first (legacy), then composite key match.
    if not _G.g_currentMission or not _G.g_currentMission.husbandrySystem then return nil end
    local idNum = tonumber(penId)
    for _, p in pairs(_G.g_currentMission.husbandrySystem.placeables or {}) do
        if p then
            if idNum ~= nil and tonumber(p.id) == idNum then return p end
            local k = self:_penKeyFor(p)
            if k == tostring(penId) then return p end
        end
    end
    return nil
end

--- Plan v5 B4: atomic-ish write with retries + throttled error log.
--- Tmp + rename/move. FS25 builds may omit `os.rename`; fall back to copy/delete or direct write.
--- On Windows, target may be briefly held open by another reader; busy-spin under 50 ms then retry.
function FarmDashboardDataCollector:_writeFileAtomic(path, contents)
    if type(io) ~= "table" or type(io.open) ~= "function" then return false end
    local tmp = path .. ".tmp"
    self._activeTmpPaths[tmp] = true
    local f, openErr = io.open(tmp, "w")
    if not f then
        self._activeTmpPaths[tmp] = nil
        self:_logWriteFail(string.format("open(%s): %s", tostring(tmp), tostring(openErr)))
        return false
    end
    f:write(contents)
    f:close()

    for attempt = 1, 3 do
        if _movePathBestEffort(tmp, path) then
            self._activeTmpPaths[tmp] = nil
            return true
        end
        if attempt == 3 then
            self:_logWriteFail(string.format("replace(%s -> %s): blocked or no rename API", tostring(tmp), tostring(path)))
        end
        local D = rawget(_G, "FarmDashDiagnostics")
        if D and type(D.nowSec) == "function" then
            local t0 = D.nowSec()
            if type(t0) == "number" then
                local spins = 0
                while type(D.nowSec()) == "number" and D.nowSec() < t0 + 0.05 and spins < 500000 do
                    spins = spins + 1
                end
            end
        end
    end
    -- Last resort: write destination from memory (no os.rename / copyFile required).
    local outf, errDirect = io.open(path, "w")
    if outf then
        pcall(function() outf:write(contents) end)
        pcall(function() outf:close() end)
        if type(deleteFile) == "function" then pcall(function() deleteFile(tmp) end) end
        if type(os) == "table" and type(os.remove) == "function" then pcall(function() os.remove(tmp) end) end
        self._activeTmpPaths[tmp] = nil
        return true
    end
    self._activeTmpPaths[tmp] = nil
    self:_logWriteFail(string.format("open(%s) fallback: %s", tostring(path), tostring(errDirect)))
    return false
end

--- Plan v5 B4: throttled write-failure log (1/30s).
function FarmDashboardDataCollector:_logWriteFail(msg)
    local D = rawget(_G, "FarmDashDiagnostics")
    local nowS = (D and D.nowSec and D.nowSec()) or 0
    if (nowS - (self._writeFailLogAtSec or 0)) >= 30 then
        self._writeFailLogAtSec = nowS
        FarmDashLog.devWarn("write failure: %s", tostring(msg))
    end
end

--- Plan v5 B4: end-of-cycle stale .tmp sweep. Skips paths in `_activeTmpPaths` so we never race
--- `_writeFileAtomic`. Without reliable mtime in all builds, only remove non-active tmps.
function FarmDashboardDataCollector:_sweepStaleTmpFiles()
    local detailDir = self:_detailDirPath()
    local base = getUserProfileAppPath() .. "modSettings/FS25_FarmDashboard/" .. self:getSavegameDirName() .. "/"
    local active = self._activeTmpPaths or {}

    local function tryRemove(p)
        if active[p] then return end
        if type(deleteFile) == "function" then pcall(function() deleteFile(p) end) end
        if type(os) == "table" and type(os.remove) == "function" then pcall(function() os.remove(p) end) end
    end

    local list = _tryGetFilesList(detailDir)
    if type(list) == "table" then
        for _, name in ipairs(list) do
            if type(name) == "string" and string.sub(name, -4) == ".tmp" then
                tryRemove(detailDir .. name)
            end
        end
    end
    -- Also sweep the slot dir for top-level tmp files (data.json.tmp / dirtyPens.json.tmp).
    for _, name in ipairs({ "data.json.tmp", "dirtyPens.json.tmp", "requests.json.tmp" }) do
        local full = base .. name
        if type(fileExists) == "function" and fileExists(full) then
            tryRemove(full)
        end
    end
end

--- Plan v5 B4: one-time writability self-test on details/. When it fails we disable detail writes.
function FarmDashboardDataCollector:_ensureDetailsWritable()
    if self._detailsDisabled then return false end
    if self._detailsWritabilityChecked then return true end
    self._detailsWritabilityChecked = true
    local probe = self:_detailDirPath() .. ".writetest"
    if type(io) ~= "table" or type(io.open) ~= "function" then
        self._detailsDisabled = true
        FarmDashLog.devWarn("io.open unavailable; detail writes disabled this session")
        return false
    end
    local f, err = io.open(probe, "w")
    if not f then
        self._detailsDisabled = true
        FarmDashLog.devWarn("details/ not writable (%s); detail writes disabled this session: %s",
            tostring(probe), tostring(err))
        return false
    end
    f:write("1"); f:close()
    if type(deleteFile) == "function" then pcall(function() deleteFile(probe) end) end
    if type(os) == "table" and type(os.remove) == "function" then pcall(function() os.remove(probe) end) end
    return true
end

--- Plan v5 B5+B8: build & write a single per-pen detail file (penKey-aware).
--- Now writes schemaVersion, idScheme, placeableId, generatedAt, mode.
function FarmDashboardDataCollector:_writePenDetail(penKey)
    if penKey == nil then return false end
    if self._detailsDisabled then return false end
    if not self:_ensureDetailsWritable() then return false end

    local placeable = self:_findPlaceableByKey(penKey) or self:_findPlaceableById(penKey)
    if not placeable then return false end

    local detail
    local ok, err = xpcall(function()
        detail = AnimalDataCollector:collectPenDetail(placeable)
    end, _farmDashFormatError)
    if not ok or not detail then
        FarmDashLog.devWarn("pen detail collection failed for key=%s: %s", tostring(penKey), tostring(err))
        return false
    end

    local D = rawget(_G, "FarmDashDiagnostics")
    local nowS = (D and D.nowSec and D.nowSec()) or 0
    detail.schemaVersion = DETAIL_SCHEMA_VERSION
    detail.idScheme       = self._idScheme
    detail.penId          = tostring(penKey)
    detail.placeableId    = tonumber(placeable.id) or 0
    detail.generatedAt    = nowS
    detail.serverTimeSec  = nowS
    detail.mode           = (self._animalMode == "RL") and "RL" or "base"
    detail.animalMode     = self._animalMode
    detail.lod            = "full"

    local parts = {}
    self:_toJSONInto(parts, detail, false, 0)
    local jsonStr = table.concat(parts)

    local fname = self:_penKeyToFilename(penKey)
    local path = self:_detailDirPath() .. "animals_" .. tostring(fname) .. ".json"
    local wrote = self:_writeFileAtomic(path, jsonStr)
    if wrote then
        self._detailLedger[penKey] = {
            ts = nowS,
            animalCount = (detail.animals and #detail.animals) or 0,
            placeableId = tonumber(placeable.id) or 0,
        }
    else
        self:_logWriteFail(string.format("pen detail %s", tostring(penKey)))
    end
    return wrote
end

--- Phase 7.2 + Plan v5 B5: write the dirtyPens.json index with schemaVersion + idScheme.
--- Sets semantics — every entry is a pen with a detail file the App can pull.
--- App keeps last-seen mtime to dedup; consults the per-pen ts before refetching.
function FarmDashboardDataCollector:_writeDirtyPensIndex()
    local entries = {}
    local count = 0
    for penKey, info in pairs(self._detailLedger) do
        if count >= DIRTY_MAX_ENTRIES then break end
        entries[#entries + 1] = {
            id = tostring(penKey),
            ts = info.ts or 0,
            animalCount = info.animalCount or 0,
        }
        count = count + 1
    end
    table.sort(entries, function(a, b) return tostring(a.id) < tostring(b.id) end)

    local D = rawget(_G, "FarmDashDiagnostics")
    local nowS = (D and D.nowSec and D.nowSec()) or 0
    local doc = {
        schemaVersion = DIRTY_SCHEMA_VERSION,
        idScheme = self._idScheme,
        updatedAt = nowS,
        animalMode = self._animalMode,
        pens = entries,
    }
    local parts = {}
    self:_toJSONInto(parts, doc, false, 0)
    local jsonStr = table.concat(parts)

    local base = getUserProfileAppPath() .. "modSettings/FS25_FarmDashboard/" .. self:getSavegameDirName() .. "/"
    self:_writeFileAtomic(base .. "dirtyPens.json", jsonStr)
end

--- Phase 7.1 + Plan v5 B5: rotation cap by penKey. Keeps at most max(detailFileCapBase, totalPens+64).
function FarmDashboardDataCollector:_sweepDetailRotation()
    local pens = (self._lastAnimalProbe and self._lastAnimalProbe.pens) or 0
    local cap = math.max(self.config.detailFileCapBase or 512, pens + 64)

    local count = 0
    for _ in pairs(self._detailLedger) do count = count + 1 end
    if count <= cap then return end

    local arr = {}
    for penKey, info in pairs(self._detailLedger) do
        arr[#arr + 1] = { id = penKey, ts = info.ts or 0 }
    end
    table.sort(arr, function(a, b) return a.ts < b.ts end)

    local toEvict = count - cap
    local dir = self:_detailDirPath()
    for i = 1, toEvict do
        local penKey = arr[i].id
        local fname = self:_penKeyToFilename(penKey)
        local path = dir .. "animals_" .. tostring(fname) .. ".json"
        if type(os) == "table" and type(os.remove) == "function" then
            pcall(function() os.remove(path) end)
        elseif type(deleteFile) == "function" then
            pcall(function() deleteFile(path) end)
        end
        self._detailLedger[penKey] = nil
    end
end

--- Plan v5 B9: bounded, schema-checked requests.json parser.
--- - Reject when blob > REQUESTS_MAX_BYTES.
--- - Reject when no schemaVersion=1 substring is present.
--- - Walk at most REQUESTS_MAX_ENTRIES "id":<int> matches.
--- - Validate each id integer in [1, 2^31).
--- - Returns table of {id} entries (nil ts skipped — caller assumes nowS).
--- On unparseable: caller renames source to requests.broken.<ts>.json and logs once / 60s.
function FarmDashboardDataCollector:_parseRequestsBlob(blob)
    if type(blob) ~= "string" or #blob == 0 then return nil, "empty" end
    if #blob > REQUESTS_MAX_BYTES then return nil, "too big" end
    if string.find(blob, '"schemaVersion"%s*:%s*' .. tostring(REQUESTS_SCHEMA_VERSION), 1, false) == nil then
        return nil, "missing schemaVersion=1"
    end
    local out = {}
    local n = 0
    local pos = 1
    while n < REQUESTS_MAX_ENTRIES do
        local iStart, iEnd, idStr = string.find(blob, '"id"%s*:%s*(%-?%d+)', pos, false)
        if not iStart then break end
        local id = tonumber(idStr)
        if id ~= nil and id == math.floor(id) and id >= 1 and id < 2147483647 then
            local sliceEnd = math.min(iEnd + 320, #blob)
            local slice = string.sub(blob, iEnd + 1, sliceEnd)
            local _tsS, _tsE, tsStr = string.find(slice, '"ts"%s*:%s*(%d+%.?%d*)')
            local ts = nil
            if tsStr ~= nil then ts = tonumber(tsStr) end
            out[#out + 1] = { id = id, ts = ts }
            n = n + 1
        end
        pos = iEnd + 1
    end
    return out, nil
end

--- Phase 7.3 + Plan v5 B9: poll requests.json with bounded parser and quarantine on failure.
function FarmDashboardDataCollector:_pollRequestsFile()
    local base = getUserProfileAppPath() .. "modSettings/FS25_FarmDashboard/" .. self:getSavegameDirName() .. "/"
    local path = base .. "requests.json"
    if not fileExists(path) then return end
    -- Read at most REQUESTS_MAX_BYTES + 1 to detect oversized files cheaply.
    local content = _readPathLimited(path, REQUESTS_MAX_BYTES + 1)
    if content == nil then return end

    local parsed, perr = self:_parseRequestsBlob(content or "")
    if not parsed then
        local D = rawget(_G, "FarmDashDiagnostics")
        local nowS = (D and D.nowSec and D.nowSec()) or 0
        if (nowS - (self._requestsParseLogAtSec or 0)) >= 60 then
            self._requestsParseLogAtSec = nowS
            FarmDashLog.devWarn("requests.json rejected (%s); quarantining", tostring(perr))
        end
        local broken = base .. "requests.broken." .. tostring(math.floor(nowS or 0)) .. ".json"
        _movePathBestEffort(path, broken)
        return
    end

    local D = rawget(_G, "FarmDashDiagnostics")
    local nowS = (D and D.nowSec and D.nowSec()) or 0
    -- Translate integer ids back into pen keys via lookup against the husbandry system.
    for _, e in ipairs(parsed) do
        local placeable = self:_findPlaceableById(e.id)
        if placeable then
            self:_addDirtyPen(placeable)
        else
            -- Fallback: still queue raw integer id as a key when no placeable lookup is available.
            local key = tostring(e.id)
            if self._dirtyPens[key] == nil and (self._dirtyPensCount or 0) < DIRTY_PENS_HARD_CAP then
                self._dirtyPens[key] = nowS
                self._dirtyPensCount = (self._dirtyPensCount or 0) + 1
            end
        end
    end
end

--- Phase 7 + Plan v5 B11: drive detail writes from the dirty set, one pen per call.
function FarmDashboardDataCollector:processDetailQueueOnce()
    if next(self._dirtyPens) == nil then return false end

    local penKey
    for k in pairs(self._dirtyPens) do penKey = k; break end
    if penKey == nil then return false end

    self._dirtyPens[penKey] = nil
    self._dirtyPensCount = math.max(0, (self._dirtyPensCount or 0) - 1)
    local t0 = self:_diagNow()
    self:_writePenDetail(penKey)
    if t0 and self:_diagEnabled() then
        local ms = (self:_diagNow() - t0) * 1000
        self:_diagTrace("penDetail %s ms=%.2f%s", tostring(penKey), ms, self:_diagMarkHitch(ms))
    end

    return next(self._dirtyPens) ~= nil
end

function FarmDashboardDataCollector:shutdown()
    if _G.g_messageCenter then
        local mc = _G.g_messageCenter
        if type(mc.unsubscribeAll) == "function" then
            pcall(function() mc:unsubscribeAll(self) end)
        elseif type(mc.unsubscribe) == "function" then
            for _, t in ipairs(self._rlSubscriptionTokens or {}) do
                pcall(function() mc:unsubscribe(t.token) end)
            end
        end
        self._rlSubscriptionTokens = {}
        self._rlSubscribed = false
        self._vehicleFleetSubscribed = false
    end

    -- Plan v5 B10: persist auto-tuned value once, here, instead of on every change.
    if self.config and self.config.animalRowsPerSlice and self.config.animalRowsPerSlice ~= self._autoTuneInitialRowsPerSlice then
        self:_persistAnimalRowsPerSlice(self.config.animalRowsPerSlice)
    end

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
        AnimalDataCollector._iter = nil
        AnimalDataCollector._co = nil
        AnimalDataCollector._yieldEvery = nil
    end
    self:resetStaggerState()
end

--- Plan v5 B10: persist autotuned animalRowsPerSlice. Best-effort; failures are silent.
function FarmDashboardDataCollector:_persistAnimalRowsPerSlice(value)
    local configPath = getUserProfileAppPath() .. "modSettings/FS25_FarmDashboard/config.xml"
    if not fileExists(configPath) then return end
    local xmlFile = loadXMLFile("FarmDashboardConfig", configPath)
    if not xmlFile or xmlFile == 0 then return end
    setXMLInt(xmlFile, "farmDashboard.settings#animalRowsPerSlice", value)
    saveXMLFile(xmlFile)
    delete(xmlFile)
end
