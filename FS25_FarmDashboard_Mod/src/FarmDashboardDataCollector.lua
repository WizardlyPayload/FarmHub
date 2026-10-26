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
local EXPORT_ORPHAN_RELEASE_MS = 5000

-- These descriptor rows are immutable. Keep one copy rather than rebuilding
-- the same nested tables on every game update; enable flags and loaded-mod
-- checks below are still evaluated on every call.
local _collectorOrderSpec
local _rfForceSpec

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

--- Emit at most maxOut escaped bytes from s, starting at index. A 2-byte escape is not split.
--- mode "key" strips every control character. mode "string" uses the JSON string escapes.
local function _jsonEscapePiece(s, index, maxOut, mode)
    local n = #s
    if index > n then return "", index, true, 0 end
    if maxOut <= 0 then return "", index, false, 0 end
    local out = {}
    local used = 0
    local i = index
    while i <= n and used < maxOut do
        local c = string.byte(s, i)
        local frag
        if mode == "key" then
            if c < 32 then frag = ""
            elseif c == 92 then frag = "\\\\"
            elseif c == 34 then frag = '\\"'
            else frag = string.char(c) end
        else
            if c == 92 then frag = "\\\\"
            elseif c == 34 then frag = '\\"'
            elseif c == 10 then frag = "\\n"
            elseif c == 13 then frag = "\\r"
            elseif c == 9 then frag = "\\t"
            elseif c <= 8 or c == 11 or c == 12 or (c >= 14 and c <= 31) then frag = ""
            else frag = string.char(c) end
        end
        if frag ~= "" and used + #frag > maxOut then break end
        if frag == "" and used + 1 > maxOut then break end
        if frag ~= "" then out[#out + 1] = frag end
        used = used + (frag == "" and 1 or #frag)
        i = i + 1
    end
    return table.concat(out), i, i > n, used
end

local function _formatNumber(n)
    if n ~= n then return "null" end
    if n == math.huge or n == -math.huge then return "null" end
    if n % 1 == 0 and n > -1e15 and n < 1e15 then
        return string.format("%d", n)
    end
    return string.format("%.14g", n)
end

--- Wall clock in seconds, or nil when the host offers neither source. Same ladder Diagnostics uses.
--- Must stay above jsonWriteStep. A `local function` below that method is not in scope there;
--- Lua resolves the name as a global and the call is nil ("attempt to call a nil value").
local function _jsonWalkNowSec()
    if type(getTimeSec) == "function" then
        local ok, v = pcall(getTimeSec)
        if ok and type(v) == "number" then return v end
    end
    if type(os) == "table" and type(os.clock) == "function" then
        local ok, v = pcall(os.clock)
        if ok and type(v) == "number" then return v end
    end
    return nil
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
    local ftm = _G.g_fillTypeManager
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
    if rawget(_G, "FillTypeUtils") and FillTypeUtils.fillTypePhysicsForJson then
        data.fillTypePhysics = FillTypeUtils.fillTypePhysicsForJson()
    end
    if rawget(_G, "FillTypeUtils") and FillTypeUtils.unitDisplayForJson then
        data.unitDisplay = FillTypeUtils.unitDisplayForJson()
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
--   * copyFile(src, dst, forceOverwrite: Bool) — Bool only; never Number 1/0.
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
    fields = true,
}

--- copyFile(src, dst, forceOverwrite: Bool). Never pass Number 1/0 — engine type-checks
--- arg3 as Bool even inside pcall, and wrong-type trials flood the script log every cycle.
local function _copyFileFs25BestEffort(src, dst)
    if type(copyFile) ~= "function" or type(src) ~= "string" or type(dst) ~= "string" then
        return false
    end
    -- forceOverwrite true first; false only if dest already exists and true did not stick.
    local trials = {
        function() copyFile(src, dst, true) end,
        function() copyFile(src, dst, false) end,
    }
    for _, fn in ipairs(trials) do
        local ok = pcall(fn)
        if ok and _pathExists(dst) then return true end
    end
    return false
end

-- fileExists also accepts an empty placeholder. The destination is in the writable
-- profile, so confirm at least one byte before treating a map export as usable.
local function _mapOverviewHasData(path)
    if not _pathExists(path) then return false end
    -- Some dedicated runtimes cannot expose profile files through io.open even
    -- though the engine's fileExists/copyFile APIs work. In that case retain
    -- the old existence behavior; only reject an empty file we actually read.
    if type(io) ~= "table" or type(io.open) ~= "function" then return true end
    local ok, handle = pcall(io.open, path, "rb")
    if not ok or handle == nil then return true end
    if type(handle.read) ~= "function" then
        pcall(function() handle:close() end)
        return true
    end
    local readOk, firstByte = pcall(function() return handle:read(1) end)
    pcall(function() handle:close() end)
    if not readOk then return true end
    return type(firstByte) == "string" and #firstByte > 0
end

local function _parentDir(filePath)
    if type(filePath) ~= "string" or filePath == "" then return nil end
    return filePath:match("^(.+)[/\\][^/\\]+$")
end

--- Overview export retries at most once per MAP_OVERVIEW_EXPORT_RETRY_MS of mission time: DLC maps
--- (e.g. Kinlaig in highlandsFishingPack) mount inside proprietary .dlc containers the desktop app
--- cannot open, so this in-game export is the only reliable overview source — don't latch failure on
--- the first miss (HUD map overlay / VFS paths may not be ready during the first cycles).
local MAP_OVERVIEW_EXPORT_MAX_ATTEMPTS = 5
local MAP_OVERVIEW_EXPORT_RETRY_MS = 60000
local MAP_OVERVIEW_MAX_CANDIDATES = 64
local MAP_OVERVIEW_LOGGED_SOURCES = 3

--- Folder name under mapOverview/: keep the raw mapId/title readable, but strip characters
--- Windows cannot use in folder names (meta.json keeps the exact ids for the desktop app).
local function _sanitizeMapOverviewKey(key)
    local sanitized = tostring(key):gsub('[/\\:%*%?"<>|]', "_")
    return sanitized
end

local WINDOWS_RESERVED_DEVICE_NAMES = { CON = true, PRN = true, AUX = true, NUL = true }
for i = 1, 9 do
    WINDOWS_RESERVED_DEVICE_NAMES["COM" .. i] = true
    WINDOWS_RESERVED_DEVICE_NAMES["LPT" .. i] = true
end

--- Directory key for mapOverview/<key>/, or nil when no safe folder exists. Windows drops trailing dots and
--- spaces from a path segment, so "..", ". ." or "map. " would resolve to the parent or to another name; the
--- trimmed form is what Windows opens anyway. Empty results and device names (CON, NUL.txt, ...) are rejected.
local function _mapOverviewDirKey(rawKey)
    local key = _sanitizeMapOverviewKey(rawKey):gsub("%c", "_")
    key = key:gsub("[%. ]+$", "")
    if key == "" then return nil end
    local stem = (key:match("^[^%.]*") or ""):gsub(" +$", ""):upper()
    if WINDOWS_RESERVED_DEVICE_NAMES[stem] then return nil end
    return key
end

--- Best-effort meta.json write as one guarded unit; returns "written" or the failure stage. Serialises before
--- opening so a serializer failure leaves the prior file untouched; a failed write after open can still leave it
--- truncated. An opened handle is always closed.
local function _writeMapOverviewMeta(metaPath, meta)
    if type(io) ~= "table" or type(io.open) ~= "function" then return "unavailable" end
    local okJson, body = pcall(function() return toJSON(meta) end)
    if not okJson or type(body) ~= "string" then return "serialize-failed" end
    local okOpen, fh = pcall(io.open, metaPath, "w")
    if not okOpen or not fh then return "open-failed" end
    local okWrite, written = pcall(function() return fh:write(body) end)
    local okClose, closed, closeErr = pcall(function() return fh:close() end)
    if not okWrite or not written then return "write-failed" end
    if not okClose or closed == false or (closed == nil and closeErr ~= nil) then return "close-failed" end
    return "written"
end

local function _overviewImageExtension(p)
    if type(p) ~= "string" then return nil end
    local low = p:lower()
    if low:match("%.dds$") then return ".dds" end
    if low:match("%.png$") then return ".png" end
    return nil
end

--- Install root for exactly-"data/" references; GIANTS prefixes getAppBasePath() for its own install-file
--- copies (main.lua copyFile of VERSION).
local function _overviewAppBase()
    if type(getAppBasePath) ~= "function" then return nil end
    local ok, base = pcall(getAppBasePath)
    if not ok or type(base) ~= "string" or base == "" then return nil end
    if not base:match("[/\\]$") then base = base .. "/" end
    return base
end

--- Utils.getFilename(path, nil) strips "$" and prepends g_gameBasePath (utils/Utils.lua:413). Only called for
--- exactly-"$data/" references without backslashes, which it would warn about.
local function _overviewEngineDataPath(p)
    if type(Utils) ~= "table" or type(Utils.getFilename) ~= "function" or p:find("\\", 1, true) then return nil end
    local ok, resolved = pcall(Utils.getFilename, p, nil)
    if ok and type(resolved) == "string" and resolved ~= "" then return resolved end
    return nil
end

--- Forms worth probing for one reference, raw first. Only exactly "$data/" goes through Utils.getFilename, and
--- only an exactly "data/" result gains an install-root alias; absolute drive, UNC, rooted, DLC, VFS, mod and
--- other token paths (e.g. $moddir$, which belongs to the map's own mod) are probed exactly as given.
local function _overviewPathForms(p, appBase)
    local forms = { { path = p, label = p } }
    local rel = nil
    if p:sub(1, 6) == "$data/" then
        local resolved = _overviewEngineDataPath(p)
        if resolved then
            forms[#forms + 1] = { path = resolved, label = resolved }
            if resolved:sub(1, 5) == "data/" then rel = resolved end
        end
    elseif p:sub(1, 5) == "data/" then
        rel = p
    end
    if rel and appBase then
        forms[#forms + 1] = { path = appBase .. rel, label = rel .. " (app root)" }
    end
    return forms
end

--- Maps reference overview.png while the shipped texture is the same-stem .dds beside it.
local function _overviewDdsSibling(p)
    local stem = p:match("^(.*)%.[Pp][Nn][Gg]$")
    return stem and (stem .. ".dds") or nil
end

--- Retry gate bound to the mission object: only a new mission starts a fresh budget. A mission clock that went
--- backwards lets the next attempt run now instead of waiting on a stale timestamp, but spends the same budget, and
--- a finished or exhausted mission stays done. Without a numeric clock every call may attempt (still capped).
function FarmDashboardDataCollector:_mapOverviewAttemptDue(mission)
    local state = self._mapOverviewExportState
    if state == nil or state.mission ~= mission then
        state = { mission = mission }
        self._mapOverviewExportState = state
        self._mapOverviewExportAttempts = 0
        self._mapOverviewExportDone = false
        self._mapOverviewExportOutcome = nil
        self._mapOverviewMetaOutcome = nil
    end
    if self._mapOverviewExportDone then return false end
    -- Not _missionNowMs(): its constant 0 fallback would hold the gate shut after the first attempt.
    local now = nil
    if type(_G.g_time) == "number" then
        now = _G.g_time
    else
        local D = rawget(_G, "FarmDashDiagnostics")
        if D and type(D.nowSec) == "function" then
            local ok, t = pcall(D.nowSec)
            if ok and type(t) == "number" then now = t * 1000 end
        end
    end
    local last = state.lastAttemptMs
    if now ~= nil and last ~= nil and now >= last and now - last < MAP_OVERVIEW_EXPORT_RETRY_MS then
        return false
    end
    state.lastAttemptMs = now
    return true
end

--- Cache PDA overview.dds for the desktop fleet map (DLC maps are not in mods/*.zip).
function FarmDashboardDataCollector:_exportMapOverviewForDashboard()
    local mission = _G.g_currentMission
    if not mission or not mission.missionInfo then return end
    local info = mission.missionInfo
    local mapId = (info.mapId and tostring(info.mapId) ~= "") and tostring(info.mapId) or nil
    local mapTitle = (info.mapTitle and tostring(info.mapTitle) ~= "") and tostring(info.mapTitle) or nil
    if not mapId and not mapTitle then return end
    if not self:_mapOverviewAttemptDue(mission) then return end

    -- Spend the attempt before any optional I/O so no failure path can bypass the cap.
    local attempt = (self._mapOverviewExportAttempts or 0) + 1
    if attempt > MAP_OVERVIEW_EXPORT_MAX_ATTEMPTS then
        self._mapOverviewExportDone = true
        return
    end
    self._mapOverviewExportAttempts = attempt

    local key = _mapOverviewDirKey(mapId or mapTitle)
    if not key then
        self._mapOverviewExportDone = true
        self._mapOverviewExportOutcome = "invalid-destination-key"
        if type(Logging) == "table" and type(Logging.warning) == "function" then
            Logging.warning(string.format(
                "[FarmDash] map overview export skipped: map id %q has no safe folder name; not retrying this session",
                tostring(mapId or mapTitle)
            ))
        end
        return
    end
    local okDest, overviewRoot = pcall(function()
        return getUserProfileAppPath() .. "modSettings/FS25_FarmDashboard/mapOverview/"
    end)
    local destDir = nil
    if okDest and type(overviewRoot) == "string" then
        destDir = overviewRoot .. key .. "/"
        -- createFolder makes one level (vanilla SavegameController creates parent then child); a fresh
        -- dedicated profile has no mapOverview/ yet, so the per-map folder needs its parent first.
        pcall(createFolder, overviewRoot)
        pcall(createFolder, destDir)
    end

    local appBase = _overviewAppBase()
    local candidates = {}
    local candidateLabel = {}
    local function addForms(p)
        for _, form in ipairs(_overviewPathForms(p, appBase)) do
            if #candidates < MAP_OVERVIEW_MAX_CANDIDATES and candidateLabel[form.path] == nil then
                candidateLabel[form.path] = form.label
                candidates[#candidates + 1] = form.path
            end
        end
    end
    local function addCandidate(p)
        if type(p) ~= "string" or p == "" then return end
        addForms(p)
        local sibling = _overviewDdsSibling(p)
        if sibling then addForms(sibling) end
    end

    -- Engine-resolved map image (mission00.lua: Utils.getFilename(map#imageFilename, baseDirectory)); set when
    -- the mission loads, so it does not wait for the HUD.
    local okImage, missionImage = pcall(function() return mission.mapImageFilename end)
    if okImage and _overviewImageExtension(missionImage) then
        addCandidate(missionImage)
    end
    local function addDirCandidates(dir)
        if type(dir) ~= "string" or dir == "" then return end
        if not dir:match("[/\\]$") then dir = dir .. "/" end
        addCandidate(dir .. "textures/ui/overview.dds")
        addCandidate(dir .. "textures/ui/overview.png")
        addCandidate(dir .. "overview.dds")
        addCandidate(dir .. "overview.png")
    end

    -- The texture the in-game PDA map is rendering right now — authoritative even for DLC maps,
    -- but the HUD may not be built during the first collection cycles (hence the retry loop).
    local okOverlay, overlayFile = pcall(function()
        local hud = mission.hud
        local ingameMap = hud and hud.ingameMap
        local overlay = ingameMap and ingameMap.mapOverlay
        return overlay and overlay.filename
    end)
    if okOverlay and _overviewImageExtension(overlayFile) then
        addCandidate(overlayFile)
    end

    if type(info.mapXMLFilename) == "string" then
        local mapDir = _parentDir(info.mapXMLFilename)
        if mapDir then addDirCandidates(mapDir) end
    end
    if type(info.map) == "table" and type(info.map.mapXMLFilename) == "string" then
        local mapDir = _parentDir(info.map.mapXMLFilename)
        if mapDir then addDirCandidates(mapDir) end
    end
    if type(info.filename) == "string" then
        local mapDir = _parentDir(info.filename)
        if mapDir then addDirCandidates(mapDir) end
    end
    local function addBaseDirCandidates(base)
        if type(base) ~= "string" or base == "" then return end
        if not base:match("[/\\]$") then base = base .. "/" end
        addDirCandidates(base)
        addDirCandidates(base .. "map")
    end
    addBaseDirCandidates(mission.baseDirectory)
    if type(info.map) == "table" then
        addBaseDirCandidates(info.map.baseDirectory)
    end
    addBaseDirCandidates(info.baseDirectory)

    local readable, copyFailed = {}, {}
    for i = 1, #candidates do
        local src = candidates[i]
        if destDir and _pathExists(src) then
            readable[#readable + 1] = src
            local ext = _overviewImageExtension(src) or ".dds"
            local dest = destDir .. "overview" .. ext
            -- The shared helper counts "destination exists" as success and native copyFile has no documented
            -- return value, so a copy over an existing image cannot be told apart from a silent no-op.
            local priorImage = _mapOverviewHasData(dest)
            if not priorImage and _pathExists(dest) and type(deleteFile) == "function" then
                pcall(function() deleteFile(dest) end)
            end
            local copied = _copyFileFs25BestEffort(src, dest)
            if not copied or (not priorImage and not _mapOverviewHasData(dest)) then
                copyFailed[#copyFailed + 1] = src
                if not priorImage and _pathExists(dest) and not _mapOverviewHasData(dest)
                    and type(deleteFile) == "function" then
                    pcall(function() deleteFile(dest) end)
                end
            elseif priorImage then
                self._mapOverviewExportDone = true
                self._mapOverviewExportOutcome = "retained-unconfirmed"
                self._mapOverviewMetaOutcome = "kept"
                FarmDashLog.dev("map overview for %s: existing image kept, fresh copy from %s unconfirmed; metadata unchanged", key, src)
                return
            else
                self._mapOverviewExportDone = true
                self._mapOverviewExportOutcome = "exported"
                -- Drop a stale export in the other format so the desktop app never picks it first.
                local staleExt = (ext == ".dds") and ".png" or ".dds"
                local stale = destDir .. "overview" .. staleExt
                if type(deleteFile) == "function" and _pathExists(stale) then
                    pcall(function() deleteFile(stale) end)
                end
                local metaStatus = _writeMapOverviewMeta(destDir .. "meta.json", {
                    mapId = mapId,
                    mapTitle = mapTitle,
                    sourcePath = src,
                    exportedAt = os and os.time and os.time() or 0,
                })
                self._mapOverviewMetaOutcome = metaStatus
                FarmDashLog.dev("exported map overview for fleet map: %s (source: %s; metadata: %s)", key, src, metaStatus)
                if type(Logging) == "table" and type(Logging.info) == "function" then
                    Logging.info(string.format("[FarmDash] map overview exported for %s (source: %s; metadata: %s)",
                        tostring(key), tostring(candidateLabel[src]), metaStatus))
                end
                return
            end
        end
    end

    -- Outcome of this attempt, without the install root or profile path (labels are the engine/raw forms).
    local outcome, shown
    if not destDir then
        outcome, shown = "destination-unavailable", {}
    elseif #readable == 0 then
        outcome, shown = "no-readable-candidate", candidates
    else
        outcome, shown = "copy-or-destination-failed", copyFailed
    end
    local names = {}
    for i = 1, math.min(#shown, MAP_OVERVIEW_LOGGED_SOURCES) do
        names[#names + 1] = tostring(candidateLabel[shown[i]])
    end
    local detail = string.format("%s; candidates=%d readable=%d copyFailed=%d; sources: %s",
        outcome, #candidates, #readable, #copyFailed, (#names > 0) and table.concat(names, ", ") or "none")
    self._mapOverviewExportOutcome = outcome

    if attempt < MAP_OVERVIEW_EXPORT_MAX_ATTEMPTS then
        -- Retry after MAP_OVERVIEW_EXPORT_RETRY_MS: candidate sources (HUD overlay, DLC VFS mounts)
        -- can appear after mission load settles. Diagnostics-only line — no log spam.
        FarmDashLog.dev(
            "map overview export attempt %d/%d for %s: %s; retrying later",
            attempt, MAP_OVERVIEW_EXPORT_MAX_ATTEMPTS, key, detail
        )
        return
    end

    -- Out of attempts: latch so we never retry every export cycle forever. Optional asset.
    self._mapOverviewExportDone = true
    local previousExport = destDir ~= nil and
        (_mapOverviewHasData(destDir .. "overview.dds") or _mapOverviewHasData(destDir .. "overview.png"))
    if previousExport then
        FarmDashLog.dev("map overview export found no new source for %s (%s); keeping previous export", key, detail)
        return
    end
    if type(Logging) == "table" and type(Logging.warning) == "function" then
        Logging.warning(string.format(
            "[FarmDash] map overview export failed after %d attempts for %s (fleet map may lack overview image); not retrying this session (%s)",
            MAP_OVERVIEW_EXPORT_MAX_ATTEMPTS, tostring(key), detail
        ))
    end
end

--- Copy fill-type HUD overlays out of the engine VFS so the dashboard can show crop icons.
--- One file per tick (copyFile of packed dataS can hitch if batched).
function FarmDashboardDataCollector:_exportFillTypeHudIcons()
    if self._fillTypeHudExportDone then return end
    if type(copyFile) ~= "function" then
        self._fillTypeHudExportDone = true
        return
    end
    local ftm = _G.g_fillTypeManager
    if not ftm or type(ftm.fillTypes) ~= "table" then return end
    local destDir = getUserProfileAppPath() .. "modSettings/FS25_FarmDashboard/fillTypeHud/"
    createFolder(destDir)
    local i = self._fillTypeHudNext or 1
    local n = #ftm.fillTypes
    local didSlot = false
    while i <= n and not didSlot do
        local ft = ftm.fillTypes[i]
        i = i + 1
        if type(ft) == "table" and ft.name then
            local name = tostring(ft.name)
            local src = ft.hudOverlayFilename or ft.hudFilename
            if type(src) == "string" and src ~= "" then
                didSlot = true
                local ext = src:match("%.[^./\\]+$") or ".dds"
                local dest = destDir .. name .. ext
                local altExt = (string.lower(ext) == ".png") and ".dds" or ".png"
                local destAlt = destDir .. name .. altExt
                if _pathExists(dest) or _pathExists(destAlt) then
                    self._fillTypeHudCopied = (self._fillTypeHudCopied or 0) + 1
                else
                    local ok = _copyFileFs25BestEffort(src, dest)
                    if not ok then
                        ok = _copyFileFs25BestEffort(src, destAlt)
                    end
                    if ok then
                        self._fillTypeHudCopied = (self._fillTypeHudCopied or 0) + 1
                    end
                end
            end
        end
    end
    self._fillTypeHudNext = i
    if i > n then
        self._fillTypeHudPasses = (self._fillTypeHudPasses or 0) + 1
        if (self._fillTypeHudCopied or 0) > 0 or self._fillTypeHudPasses >= 2 then
            self._fillTypeHudExportDone = true
        else
            self._fillTypeHudNext = 1
        end
    end
end

--- Cap for read/write fallback when rename/copy fail (atomic write recovery only). Bounds hitch vs huge tmp→final copies.
local MOVE_FALLBACK_READ_MAX = 2 * 1024 * 1024

--- Giants io:write and io:close (extract/decompiled/scripts/io.lua) return no values.
--- A throw, false, or nil plus an error value is failure. A nil with no error is the
--- host's normal return and is not success until the closed file matches the payload.
--- A truthy return is a checked host result and still requires that byte check.
local function _classifyReturned(first, second)
    if first == false then
        return false, "false", second
    end
    if first == nil and second ~= nil then
        return false, "error", second
    end
    if first == nil then
        return true, "void", nil
    end
    return true, "checked", nil
end

local function _handleWriteAndClose(handle, payload)
    local writeOkCall, wrote, writeErr = pcall(function()
        return handle:write(payload)
    end)
    local writeOk, writeKind, writeDetail
    if not writeOkCall then
        writeOk, writeKind, writeDetail = false, "throw", wrote
    else
        writeOk, writeKind, writeDetail = _classifyReturned(wrote, writeErr)
    end
    local closeOkCall, closed, closeErr = pcall(function()
        return handle:close()
    end)
    local closeOk, closeKind, closeDetail
    if not closeOkCall then
        closeOk, closeKind, closeDetail = false, "throw", closed
    else
        closeOk, closeKind, closeDetail = _classifyReturned(closed, closeErr)
    end
    if not writeOk then
        return false, "write", writeKind, writeDetail
    end
    if not closeOk then
        return false, "close", closeKind, closeDetail
    end
    return true, "closed", writeKind, nil
end

--- Replace `src` with `dst` (move). Works when `os` is nil. Returns true on success.
--- Destination already existing is NOT success — that may be the previous export (MOD-02).
local function _movePathBestEffort(src, dst)
    if type(src) ~= "string" or type(dst) ~= "string" then return false end
    if src == dst then return _pathExists(dst) end
    if type(os) == "table" and type(os.rename) == "function" then
        local okCall, renameOk = pcall(os.rename, src, dst)
        if okCall and renameOk then
            return true
        end
    end
    if type(deleteFile) == "function" and _copyFileFs25BestEffort(src, dst) then
        pcall(function() deleteFile(src) end)
        if _pathExists(dst) and not _pathExists(src) then return true end
        return false
    end
    local body = _readPathLimited(src, MOVE_FALLBACK_READ_MAX)
    if body and type(io) == "table" and type(io.open) == "function" then
        local o = io.open(dst, "w")
        if o then
            local wrote = _handleWriteAndClose(o, body)
            if not wrote then return false end
            if type(deleteFile) == "function" then pcall(function() deleteFile(src) end) end
            if type(os) == "table" and type(os.remove) == "function" then
                pcall(function() os.remove(src) end)
            end
            return _pathExists(dst) and not _pathExists(src)
        end
    end
    return false
end

function FarmDashboardDataCollector:init()
    self.coroutinesAvailable = _probeCoroutinesAvailable()
    if not self.coroutinesAvailable and FarmDashLog and FarmDashLog.devWarn then
        FarmDashLog.devWarn(
            "Lua coroutines unavailable on this machine: fields use per-field fallback; economy/production use sync collect per slot"
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
        invoices       = InvoicesDataCollector,
        hirePurchasing = HirePurchasingDataCollector,
        companionMods  = CompanionModsDataCollector,
        companionPages = rawget(_G, "CompanionPagesDataCollector"),
        -- Realistic Farming suite (Coordinator registry; domain agents fill stub bodies)
        rfSoilFertilizer     = RfSoilFertilizerDataCollector,
        rfCropStress         = RfCropStressDataCollector,
        rfTax                = RfTaxDataCollector,
        rfMarketDynamics     = RfMarketDynamicsDataCollector,
        rfFuelCosts          = RfFuelCostsDataCollector,
        rfWorkerCosts        = RfWorkerCostsDataCollector,
        rfIncome             = RfIncomeDataCollector,
        rfWorkplaceTriggers  = RfWorkplaceTriggersDataCollector,
        rfDairy              = RfDairyDataCollector,
        rfNpcFavor           = RfNpcFavorDataCollector,
        rfWorldEvents        = RfWorldEventsDataCollector,
        rfProStaff           = RfProStaffDataCollector,
        rfFertilizerDepot    = RfFertilizerDepotDataCollector,
        rfWeatherGuard       = RfWeatherGuardDataCollector,
        rfTimeGuard          = RfTimeGuardDataCollector,
        rfPresence           = RfPresenceDataCollector,
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
    -- Engine class inherited through this mod's _G (mods.lua); rawget only sees this mod's own keys.
    local evt = _G.AnimalClusterUpdateEvent
    if type(evt) ~= "table" then return end
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
    local nowS = self:_missionNowSec()

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

--- Resource ids are a stricter class than JSON filenames. Encoding every
--- non-alphanumeric byte keeps distinct pen keys from collapsing into one id.
function FarmDashboardDataCollector:_resourceIdForPen(penKey)
    if penKey == nil then return nil end
    local s = tostring(penKey)
    if s == "" then return nil end
    local out = {}
    for i = 1, #s do
        local c = string.sub(s, i, i)
        if string.match(c, "^[A-Za-z0-9]$") then
            out[#out + 1] = c
        else
            out[#out + 1] = string.format("_%02X", string.byte(c))
        end
    end
    local id = table.concat(out)
    if #id > 64 then
        -- A composite pen key can contain an absolute mod path. Refusing its
        -- resource id makes the same detail rebuild on every game frame. Keep
        -- short legacy ids unchanged and use a bounded, stable 128-bit digest
        -- for long keys. Each multiplication stays below 2^53 for exact Lua
        -- number arithmetic; livestockDetail.js uses the same byte algorithm.
        local h1, h2, h3, h4 = 2166136261, 2246822519, 3266489917, 668265263
        for i = 1, #s do
            local b = string.byte(s, i)
            h1 = (h1 * 131 + b) % 4294967296
            h2 = (h2 * 137 + b) % 4294967296
            h3 = (h3 * 149 + b) % 4294967296
            h4 = (h4 * 163 + b) % 4294967296
        end
        local function hex32(value)
            local digits = "0123456789ABCDEF"
            local chars = {}
            for i = 8, 1, -1 do
                local nibble = math.floor(value % 16)
                chars[i] = string.sub(digits, nibble + 1, nibble + 1)
                value = math.floor(value / 16)
            end
            return table.concat(chars)
        end
        return "H_" .. hex32(h1) .. hex32(h2) .. hex32(h3) .. hex32(h4)
    end
    return id
end

function FarmDashboardDataCollector:noteResourceAdmission(kind, resourceId, version, record)
    if version == nil then return false end
    if type(record) == "table" and record.indexRevision ~= nil then
        self._resourceByVersion = self._resourceByVersion or {}
        self._resourceByVersion[version] = {
            kind = "dirtyPens",
            revision = record.indexRevision,
            session = self._exportSession,
            version = version,
        }
        return true
    end
    local key = tostring(kind) .. ":" .. tostring(resourceId or "index")
    local source = nil
    if type(record) == "table" and type(record.ledger) == "table" then
        source = record
    else
        source = self._resourcePending and self._resourcePending[key]
    end
    if type(source) ~= "table" or type(source.ledger) ~= "table" then return false end
    local ledger = {}
    for name, value in pairs(source.ledger) do ledger[name] = value end
    self._resourceByVersion = self._resourceByVersion or {}
    self._resourceByVersion[version] = {
        penKey = source.penKey,
        ledger = ledger,
        version = version,
        session = self._exportSession,
    }
    return true
end

function FarmDashboardDataCollector:_retainPenRetry(penKey, session)
    if penKey == nil then return false end
    if session ~= nil and session ~= self._exportSession then return false end
    self._dirtyPens = self._dirtyPens or {}
    self._penRetryAt = self._penRetryAt or {}
    if self._dirtyPens[penKey] == nil then
        self._dirtyPensCount = (self._dirtyPensCount or 0) + 1
    end
    self._dirtyPens[penKey] = 1
    if type(_G.g_time) == "number" then
        self._penRetryAt[penKey] = self:_missionTimeMs() + 1000
    else
        self._penRetryAt[penKey] = nil
        self._penRetrySkips = self._penRetrySkips or {}
        self._penRetrySkips[penKey] = 2
    end
    return true
end

function FarmDashboardDataCollector:onResourceSettled(kind, resourceId, version, outcome)
    if version == nil then return false end
    if outcome == "durable" then
        return self:onResourceDurable(kind, resourceId, version)
    end
    local snap = self._resourceByVersion and self._resourceByVersion[version]
    local key = tostring(kind) .. ":" .. tostring(resourceId)
    local pending = self._resourcePending and self._resourcePending[key]
    local newer = type(pending) == "table" and pending.version ~= nil and pending.version ~= version
    if self._resourceByVersion then self._resourceByVersion[version] = nil end
    if type(pending) == "table" and (pending.version == nil or pending.version == version) then
        self._resourcePending[key] = nil
    end
    if outcome == "failed" and not newer and type(snap) == "table" then
        if snap.kind == "dirtyPens" then
            local owns = self._indexInFlightAdmission == snap.version
                and self._indexInFlightRevision == snap.revision
                and (snap.session == nil or self._indexInFlightSession == snap.session)
            if owns and (snap.session == nil or snap.session == self._exportSession) then
                self._indexInFlightRevision = nil
                self._indexInFlightSession = nil
                self._indexInFlightAdmission = nil
                self:_armIndexRetry()
            end
        else
            self:_retainPenRetry(snap.penKey, snap.session)
        end
    end
    return true
end

function FarmDashboardDataCollector:onResourceDurable(kind, resourceId, version)
    local pending = nil
    if version ~= nil and self._resourceByVersion and self._resourceByVersion[version] ~= nil then
        pending = self._resourceByVersion[version]
        self._resourceByVersion[version] = nil
        if type(pending) == "table" and pending.session ~= nil and pending.session ~= self._exportSession then
            return false
        end
        local pendingKey = tostring(kind) .. ":" .. tostring(resourceId)
        if self._resourcePending and self._resourcePending[pendingKey] ~= nil then
            local live = self._resourcePending[pendingKey]
            if type(live) ~= "table" or live.version == nil or live.version == version then
                self._resourcePending[pendingKey] = nil
            end
        end
    elseif version == nil then
        pending = self._resourcePending and self._resourcePending[tostring(kind) .. ":" .. tostring(resourceId)]
        if self._resourcePending then self._resourcePending[tostring(kind) .. ":" .. tostring(resourceId)] = nil end
    else
        return false
    end
    if type(pending) ~= "table" then return false end
    if kind == "penDetail" and pending.penKey ~= nil and type(pending.ledger) == "table" then
        self._detailLedger[pending.penKey] = pending.ledger
        self._dirtyIndexRevision = (self._dirtyIndexRevision or 0) + 1
        self._dirtyIndexDue = true
    elseif pending.kind == "dirtyPens" then
        if self._indexInFlightAdmission == pending.version
            and self._indexInFlightRevision == pending.revision
            and (pending.session == nil or self._indexInFlightSession == pending.session) then
            self._indexInFlightRevision = nil
            self._indexInFlightSession = nil
            self._indexInFlightAdmission = nil
        end
        if (self._dirtyIndexRevision or 0) == pending.revision
            and (pending.session == nil or pending.session == self._exportSession) then
            self._dirtyIndexDue = false
        end
    end
    return true
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

    local userMs = tonumber(self._userCollectionCycleMs) or tonumber(self.config.collectionCycleMs) or 60000
    cycleMs = math.max(cycleMs, userMs)
    cycleMs = math.min(1800000, cycleMs)
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

function FarmDashboardDataCollector:_usesXmlTransport()
    if self._transportProtocol == "json" then return false end
    if self._transportProtocol == "xml" then return true end
    if ExportEnvelopePublisher == nil or FarmDashboardExportRoute == nil then return false end
    local reader = readFile or rawget(_G, "readFile")
    local renameOk = type(os) == "table" and type(os.rename) == "function"
    if type(reader) == "function" and renameOk then return false end
    return true
end

function FarmDashboardDataCollector:_xmlRecord(jsonText, generation, collectorSession, exportClass)
    local root = self:getDataOutputDir()
    return {
        json = jsonText,
        generation = generation,
        collectorSession = collectorSession,
        exportClass = exportClass,
        root = root,
        sourceSlot = self:getSavegameDirName(),
        simulationTime = self:_missionTimeMs(),
        authority = true,
    }
end

function FarmDashboardDataCollector:onExportTransactionCommitted(info)
    if type(info) ~= "table" then return false end
    if info.collectorSession ~= nil and info.collectorSession ~= self._exportSession then
        return false
    end
    local gen = tonumber(info.generation) or 0
    if gen <= 0 then return false end
    self._completedGeneration = gen
    self._activeCandidateGeneration = nil
    self._xmlInFlight = false
    self._wroteRichExport = true
    Logging.info(
        "[FarmDash] export committed generation=%d sequence=%s slot=%s",
        gen,
        tostring(info.sequence),
        tostring(info.sourceSlot)
    )
    return true
end

function FarmDashboardDataCollector:onExportTransactionFailed(info)
    if type(info) ~= "table" then return false end
    if info.collectorSession ~= nil and info.collectorSession ~= self._exportSession then
        return false
    end
    local gen = tonumber(info.generation)
    if gen ~= nil and self._activeCandidateGeneration ~= nil and gen ~= self._activeCandidateGeneration then
        return false
    end
    self._xmlInFlight = false
    self._activeCandidateGeneration = nil
    return true
end

function FarmDashboardDataCollector:_beginQueuedExport(record)
    if type(record) ~= "table" or type(record.data) ~= "table" then return false end
    if record.session ~= nil and record.session ~= self._exportSession then return false end
    if self._jsonWriteJob or self._jsonPendingDisk or self._xmlInFlight then return false end
    local className = record.class or "gameplay"
    if className ~= "gameplay" and self._wroteRichExport and not self:_exportHasGameplayRows(record.data) then
        return true
    end
    if not self:_exportBudgetAllows(3) then return false end
    if self:_jsonBudgetRemaining() == nil then
        self:_stampExportGeneration(record.data, className)
        local okJson, jsonData = pcall(function() return self:toJSON(record.data, 0) end)
        if not okJson or type(jsonData) ~= "string" then return false end
        if self:_usesXmlTransport() then
            local route = rawget(_G, "FarmDashboardExportRoute")
            if not (route and route.submit) then return false end
            local queued = route:submit(self:_xmlRecord(jsonData, record.data.exportGeneration, self._exportSession, className))
            if queued == "queued" or queued == "coalesced" then
                if className == "gameplay" then self._xmlInFlight = true end
                return true
            end
            return false
        end
        return self:_writeJsonStringToDisk(jsonData, self:getSavegameDirName()) == true
    end
    self:beginDeferredJsonWrite(record.data, className)
    return self._jsonWriteJob ~= nil or self._jsonPendingDisk ~= nil
end

--- An in-flight gameplay commit is released by the route callback. If the route has gone idle
--- with nothing owed, that callback can never arrive; log it and let the next snapshot proceed.
function FarmDashboardDataCollector:_checkExportLiveness()
    if not self._xmlInFlight then
        self._xmlOrphanSinceMs = nil
        return false
    end
    local route = rawget(_G, "FarmDashboardExportRoute")
    if not (route and type(route.hasPendingSnapshot) == "function") then return false end
    local okPending, pending = pcall(function() return route:hasPendingSnapshot() end)
    if not okPending or pending == true then
        self._xmlOrphanSinceMs = nil
        return false
    end
    local nowMs = self:_missionTimeMs()
    if self._xmlOrphanSinceMs == nil then
        self._xmlOrphanSinceMs = nowMs
        return false
    end
    if (nowMs - self._xmlOrphanSinceMs) < EXPORT_ORPHAN_RELEASE_MS then return false end
    Logging.warning(
        "[FarmDash] export route idle without a commit for generation=%s; releasing the collector so the next snapshot can publish",
        tostring(self._activeCandidateGeneration)
    )
    self._xmlOrphanSinceMs = nil
    self._xmlInFlight = false
    self._activeCandidateGeneration = nil
    self._reservedGeneration = nil
    return true
end

function FarmDashboardDataCollector:pumpHeldExport()
    if self._pumpingHeld or self._xmlInFlight then return false end
    local held = self._heldGameplay
    if type(held) ~= "table" then return false end
    local record = type(held.data) == "table" and held or { data = held, class = "gameplay", session = self._exportSession }
    self._pumpingHeld = true
    local started = false
    local ok = pcall(function()
        started = self:_beginQueuedExport(record) == true
    end)
    self._pumpingHeld = false
    if ok and started then self._heldGameplay = nil end
    return ok and started
end

function FarmDashboardDataCollector:resetStaggerState(options)
    local route = rawget(_G, "FarmDashboardExportRoute")
    if route and type(route.cancelCurrent) == "function" then
        pcall(function() route:cancelCurrent() end)
    end
    local preserveSession = type(options) == "table" and options.preserveSession == true
    local ident = rawget(_G, "FarmDashboardCareerIdentity")
    if not preserveSession and ident and type(ident.status) == "function" and type(ident.rotateSession) == "function" then
        local live = ident.status()
        if live.captured == true and live.waitingForIdentity ~= true and live.recoveryNeeded ~= true and live.allocationFailed ~= true then
            ident.rotateSession()
        end
    end
    self._exportSession = (self._exportSession or 0) + 1
    self._completedGeneration = 0
    self._activeCandidateGeneration = nil
    self._reservedGeneration = nil
    self._xmlInFlight = false
    self._xmlOrphanSinceMs = nil
    self._heldGameplay = nil
    self._resourcePending = nil
    self._resourceByVersion = nil
    self.moduleCache = {}
    self._companionFarmScopeReady = false
    self._companionFarmInfo = nil
    self._companionExportFarmId = nil
    self._sectionOutcomes = {}
    self._sectionStaging = {}
    self._productionCandidate = nil
    self.staggerFirstRunDone = false
    self.nextSliceIdx = 1
    self.slotAccumulator = 0
    self._lastSliceGTime = nil
    self._lastModLinkedCheckGTime = nil
    self._firstWriteLogged = nil
    self._incActiveModule = nil
    self._cycleFresh = {}
    self._husbandryJob = nil
    self._slicePendingFinish = nil
    self._jsonWriteJob = nil
    self._jsonWritePending = nil
    self._jsonPendingDisk = nil
    self._dirtyPens = {}
    self._dirtyPensCount = 0
    self._penRetryAt = nil
    self._penRetrySkips = nil
    self._penJsonJob = nil
    self._dirtyIndexDue = nil
    self._dirtyIndexRevision = nil
    self._dirtyIndexBuiltRevision = nil
    self._dirtyIndexRetryAt = nil
    self._dirtyIndexSkips = nil
    self._indexJsonJob = nil
    self._indexInFlightRevision = nil
    self._indexInFlightSession = nil
    self._indexInFlightAdmission = nil
    self._recoveryTxn = nil
    self._recoveryByTarget = nil
    self._writeEpisodes = nil
    self._writeEpisodeOverflow = nil
    self._writeEpisodeOverflowAt = nil
    self._wroteRichExport = false
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
    if rawget(_G, "InvoicesDataCollector") then
        InvoicesDataCollector._inc = false
    end
    if rawget(_G, "HirePurchasingDataCollector") then
        HirePurchasingDataCollector._inc = false
    end
    if rawget(_G, "CompanionModsDataCollector") then
        CompanionModsDataCollector._inc = nil
    end
    if rawget(_G, "CompanionPagesDataCollector") then
        CompanionPagesDataCollector._inc = nil
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
        enableInvoices      = true,
        enableHirePurchasing = true,
        enableCompanionMods = true,
        -- RF suite collectors: default OFF. ensureModLinkedCollectorsEnabled flips them on
        -- only when soft-detect finds the companion. Leaving them default-on bloated the
        -- stagger to ~28 slots on vanilla/PF demos and delayed fields/companions.
        enableRfSoilFertilizer = false,
        enableRfCropStress = false,
        enableRfTax = false,
        enableRfMarketDynamics = false,
        enableRfFuelCosts = false,
        enableRfWorkerCosts = false,
        enableRfIncome = false,
        enableRfWorkplaceTriggers = false,
        enableRfDairy = false,
        enableRfNpcFavor = false,
        enableRfWorldEvents = false,
        enableRfProStaff = false,
        enableRfFertilizerDepot = false,
        enableRfWeatherGuard = false,
        enableRfTimeGuard = false,
        enableRfPresence = false,
        stockPlaceablesPerFrame = 3,
        baleWorldEntitiesPerFrame = 8,
        financeVehiclesPerFrame = 4,
        redTapeFarmsPerFrame = 1,
        invoicesFarmsPerFrame = 1,
        hirePurchasingFarmsPerFrame = 1,
        --- When true, FieldDataCollector prints a throttled line to log.txt after bale scans (see FieldDataCollector.lua).
        debugBaleScan       = false,
        --- When true, FarmDash periodically logs median/p99 collectStep + serializer timings. Verification only.
        diagnostics         = false,
        --- MP XML/network compat — ExportMirror always streams to joined clients (these flags are ignored).
        allowExportMirror   = true,
        --- Kept for older config.xml / settings sync; does not gate mirroring.
        mirrorExport        = true,
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
        -- FH-20260914: market prices move slowly, so the economy module refreshes every
        -- Nth collection cycle rather than every one. 1 restores the old behaviour.
        -- Nothing leaves the export when a cycle is skipped: assembleDataFromModuleCache
        -- serves the module cache, so the last collected prices are still written.
        economyRefreshEveryNCycles  = 3,
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
            self.config.enableInvoices = Utils.getNoNil(getXMLBool(xmlFile, "farmDashboard.modules#invoices"), true)
            self.config.enableHirePurchasing = Utils.getNoNil(
                getXMLBool(xmlFile, "farmDashboard.modules#hirePurchasing"),
                true
            )
            self.config.enableCompanionMods = Utils.getNoNil(
                getXMLBool(xmlFile, "farmDashboard.modules#companionMods"),
                true
            )
            self.config.enableRfSoilFertilizer = Utils.getNoNil(getXMLBool(xmlFile, "farmDashboard.modules#rfSoilFertilizer"), false)
            self.config.enableRfCropStress = Utils.getNoNil(getXMLBool(xmlFile, "farmDashboard.modules#rfCropStress"), false)
            self.config.enableRfTax = Utils.getNoNil(getXMLBool(xmlFile, "farmDashboard.modules#rfTax"), false)
            self.config.enableRfMarketDynamics = Utils.getNoNil(getXMLBool(xmlFile, "farmDashboard.modules#rfMarketDynamics"), false)
            self.config.enableRfFuelCosts = Utils.getNoNil(getXMLBool(xmlFile, "farmDashboard.modules#rfFuelCosts"), false)
            self.config.enableRfWorkerCosts = Utils.getNoNil(getXMLBool(xmlFile, "farmDashboard.modules#rfWorkerCosts"), false)
            self.config.enableRfIncome = Utils.getNoNil(getXMLBool(xmlFile, "farmDashboard.modules#rfIncome"), false)
            self.config.enableRfWorkplaceTriggers = Utils.getNoNil(getXMLBool(xmlFile, "farmDashboard.modules#rfWorkplaceTriggers"), false)
            self.config.enableRfDairy = Utils.getNoNil(getXMLBool(xmlFile, "farmDashboard.modules#rfDairy"), false)
            self.config.enableRfNpcFavor = Utils.getNoNil(getXMLBool(xmlFile, "farmDashboard.modules#rfNpcFavor"), false)
            self.config.enableRfWorldEvents = Utils.getNoNil(getXMLBool(xmlFile, "farmDashboard.modules#rfWorldEvents"), false)
            self.config.enableRfProStaff = Utils.getNoNil(getXMLBool(xmlFile, "farmDashboard.modules#rfProStaff"), false)
            self.config.enableRfFertilizerDepot = Utils.getNoNil(getXMLBool(xmlFile, "farmDashboard.modules#rfFertilizerDepot"), false)
            self.config.enableRfWeatherGuard = Utils.getNoNil(getXMLBool(xmlFile, "farmDashboard.modules#rfWeatherGuard"), false)
            self.config.enableRfTimeGuard = Utils.getNoNil(getXMLBool(xmlFile, "farmDashboard.modules#rfTimeGuard"), false)
            self.config.enableRfPresence = Utils.getNoNil(getXMLBool(xmlFile, "farmDashboard.modules#rfPresence"), false)
            self.config.debugBaleScan = Utils.getNoNil(getXMLBool(xmlFile, "farmDashboard.settings#debugBaleScan"), false)
            self.config.diagnostics = Utils.getNoNil(getXMLBool(xmlFile, "farmDashboard.settings#diagnostics"), false)
            self.config.allowExportMirror = Utils.getNoNil(getXMLBool(xmlFile, "farmDashboard.settings#allowExportMirror"), true)
            self.config.mirrorExport = Utils.getNoNil(getXMLBool(xmlFile, "farmDashboard.settings#mirrorExport"), true)
            -- 3.4.0.10+: keep legacy mirror flags true for XML compat (ExportMirror ignores them).
            local mirrorDefaultOnApplied = Utils.getNoNil(
                getXMLBool(xmlFile, "farmDashboard.settings#mirrorDefaultOnApplied"),
                false
            )
            if mirrorDefaultOnApplied ~= true then
                self.config.allowExportMirror = true
                self.config.mirrorExport = true
                setXMLBool(xmlFile, "farmDashboard.settings#allowExportMirror", true)
                setXMLBool(xmlFile, "farmDashboard.settings#mirrorExport", true)
                setXMLBool(xmlFile, "farmDashboard.settings#mirrorDefaultOnApplied", true)
                saveXMLFile(xmlFile)
            end
            local arps = getXMLInt(xmlFile, "farmDashboard.settings#animalRowsPerSlice")
            if arps and arps > 0 then self.config.animalRowsPerSlice = arps end
            local sbm = getXMLInt(xmlFile, "farmDashboard.settings#sliceBudgetMs")
            if sbm and sbm > 0 then self.config.sliceBudgetMs = sbm end
            local ern = getXMLInt(xmlFile, "farmDashboard.settings#economyRefreshEveryNCycles")
            if ern and ern > 0 then self.config.economyRefreshEveryNCycles = ern end
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
            local ifp = getXMLInt(xmlFile, "farmDashboard.settings#invoicesFarmsPerFrame")
            if ifp and ifp > 0 then self.config.invoicesFarmsPerFrame = ifp end
            local hfp = getXMLInt(xmlFile, "farmDashboard.settings#hirePurchasingFarmsPerFrame")
            if hfp and hfp > 0 then self.config.hirePurchasingFarmsPerFrame = hfp end
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
            -- Painted / merged field outlines need the fields collector. Older configs
            -- (and hitch workarounds) left modules#fields=false, so the map fell back
            -- to static i3d polygons.
            if not Utils.getNoNil(getXMLBool(xmlFile, "farmDashboard.settings#collectionSafetyV6Applied"), false) then
                if self.config.enableFields ~= true then
                    self.config.enableFields = true
                    Logging.info("[FarmDash] Field export re-enabled (needed for merged / extended map outlines).")
                end
                setXMLBool(xmlFile, "farmDashboard.modules#fields", true)
                setXMLBool(xmlFile, "farmDashboard.settings#collectionSafetyV6Applied", true)
                saveXMLFile(xmlFile)
            end
            -- ESC settings clone used to fire onClick at inject time and persist Off for
            -- fields / economy / production. Restore those core exporters once.
            if not Utils.getNoNil(getXMLBool(xmlFile, "farmDashboard.settings#collectionSafetyV7Applied"), false) then
                local restored = {}
                if self.config.enableFields ~= true then
                    self.config.enableFields = true
                    restored[#restored + 1] = "fields"
                end
                if self.config.enableEconomy ~= true then
                    self.config.enableEconomy = true
                    restored[#restored + 1] = "economy"
                end
                if self.config.enableProduction ~= true then
                    self.config.enableProduction = true
                    restored[#restored + 1] = "production"
                end
                setXMLBool(xmlFile, "farmDashboard.modules#fields", true)
                setXMLBool(xmlFile, "farmDashboard.modules#economy", true)
                setXMLBool(xmlFile, "farmDashboard.modules#production", true)
                setXMLBool(xmlFile, "farmDashboard.settings#collectionSafetyV7Applied", true)
                saveXMLFile(xmlFile)
                if #restored > 0 then
                    Logging.info("[FarmDash] Re-enabled export modules: %s", table.concat(restored, ", "))
                end
            end
            -- V7 already ran on this profile, then hitch workarounds / ESC clone persisted
            -- fields / economy / production Off again. Restore once more so PF N/pH export.
            if not Utils.getNoNil(getXMLBool(xmlFile, "farmDashboard.settings#collectionSafetyV8Applied"), false) then
                local restoredV8 = {}
                if self.config.enableFields ~= true then
                    self.config.enableFields = true
                    restoredV8[#restoredV8 + 1] = "fields"
                end
                if self.config.enableEconomy ~= true then
                    self.config.enableEconomy = true
                    restoredV8[#restoredV8 + 1] = "economy"
                end
                if self.config.enableProduction ~= true then
                    self.config.enableProduction = true
                    restoredV8[#restoredV8 + 1] = "production"
                end
                setXMLBool(xmlFile, "farmDashboard.modules#fields", true)
                setXMLBool(xmlFile, "farmDashboard.modules#economy", true)
                setXMLBool(xmlFile, "farmDashboard.modules#production", true)
                setXMLBool(xmlFile, "farmDashboard.settings#collectionSafetyV8Applied", true)
                saveXMLFile(xmlFile)
                if #restoredV8 > 0 then
                    Logging.info("[FarmDash] Re-enabled export modules (V8): %s", table.concat(restoredV8, ", "))
                end
            end
            -- V8 already applied, then Settings / hitch workarounds flipped fields / economy /
            -- production Off again (empty Fields page with collectorModules.fields=false).
            if not Utils.getNoNil(getXMLBool(xmlFile, "farmDashboard.settings#collectionSafetyV9Applied"), false) then
                local restoredV9 = {}
                if self.config.enableFields ~= true then
                    self.config.enableFields = true
                    restoredV9[#restoredV9 + 1] = "fields"
                end
                if self.config.enableEconomy ~= true then
                    self.config.enableEconomy = true
                    restoredV9[#restoredV9 + 1] = "economy"
                end
                if self.config.enableProduction ~= true then
                    self.config.enableProduction = true
                    restoredV9[#restoredV9 + 1] = "production"
                end
                setXMLBool(xmlFile, "farmDashboard.modules#fields", true)
                setXMLBool(xmlFile, "farmDashboard.modules#economy", true)
                setXMLBool(xmlFile, "farmDashboard.modules#production", true)
                setXMLBool(xmlFile, "farmDashboard.settings#collectionSafetyV9Applied", true)
                saveXMLFile(xmlFile)
                if #restoredV9 > 0 then
                    Logging.info("[FarmDash] Re-enabled export modules (V9): %s", table.concat(restoredV9, ", "))
                end
            end
            -- Every cold load: never start a session with core exporters Off. One-shot
            -- migrations get burned, then Settings/ESC can flip them off again and the
            -- next boot keeps the dead export (no PF N/pH, empty companions/economy).
            do
                local forced = {}
                if self.config.enableFields ~= true then
                    self.config.enableFields = true
                    forced[#forced + 1] = "fields"
                end
                if self.config.enableEconomy ~= true then
                    self.config.enableEconomy = true
                    forced[#forced + 1] = "economy"
                end
                if self.config.enableProduction ~= true then
                    self.config.enableProduction = true
                    forced[#forced + 1] = "production"
                end
                if self.config.enableCompanionMods ~= true then
                    self.config.enableCompanionMods = true
                    forced[#forced + 1] = "companionMods"
                end
                if #forced > 0 then
                    setXMLBool(xmlFile, "farmDashboard.modules#fields", true)
                    setXMLBool(xmlFile, "farmDashboard.modules#economy", true)
                    setXMLBool(xmlFile, "farmDashboard.modules#production", true)
                    setXMLBool(xmlFile, "farmDashboard.modules#companionMods", true)
                    saveXMLFile(xmlFile)
                    Logging.info("[FarmDash] Core exporters forced on at load: %s", table.concat(forced, ", "))
                end
            end
            -- Ensure all core + optional module collectors default ON (older installs may have toggled off).
            if not Utils.getNoNil(getXMLBool(xmlFile, "farmDashboard.settings#modulesDefaultOnApplied"), false) then
                self.config.enableAnimals = true
                self.config.enableVehicles = true
                self.config.enableWeather = true
                self.config.enableFields = true
                self.config.enableFinance = true
                self.config.enableEconomy = true
                self.config.enableProduction = true
                self.config.enableStock = true
                self.config.enableBaleInventory = true
                self.config.enableRedTape = true
                self.config.enableInvoices = true
                self.config.enableHirePurchasing = true
                self.config.enableCompanionMods = true
                setXMLBool(xmlFile, "farmDashboard.modules#animals", true)
                setXMLBool(xmlFile, "farmDashboard.modules#vehicles", true)
                setXMLBool(xmlFile, "farmDashboard.modules#weather", true)
                setXMLBool(xmlFile, "farmDashboard.modules#fields", true)
                setXMLBool(xmlFile, "farmDashboard.modules#finance", true)
                setXMLBool(xmlFile, "farmDashboard.modules#economy", true)
                setXMLBool(xmlFile, "farmDashboard.modules#production", true)
                setXMLBool(xmlFile, "farmDashboard.modules#stock", true)
                setXMLBool(xmlFile, "farmDashboard.modules#baleInventory", true)
                setXMLBool(xmlFile, "farmDashboard.modules#redTape", true)
                setXMLBool(xmlFile, "farmDashboard.modules#invoices", true)
                setXMLBool(xmlFile, "farmDashboard.modules#hirePurchasing", true)
                setXMLBool(xmlFile, "farmDashboard.modules#companionMods", true)
                setXMLBool(xmlFile, "farmDashboard.settings#modulesDefaultOnApplied", true)
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
        setXMLBool(xmlFile, "farmDashboard.settings#allowExportMirror", true)
        setXMLBool(xmlFile, "farmDashboard.settings#mirrorExport", true)
        setXMLBool(xmlFile, "farmDashboard.settings#mirrorDefaultOnApplied", true)
        setXMLInt(xmlFile, "farmDashboard.settings#animalRowsPerSlice", self.config.animalRowsPerSlice)
        setXMLInt(xmlFile, "farmDashboard.settings#sliceBudgetMs", self.config.sliceBudgetMs)
        setXMLInt(xmlFile, "farmDashboard.settings#economyRefreshEveryNCycles", self.config.economyRefreshEveryNCycles)
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
        setXMLBool(xmlFile, "farmDashboard.modules#invoices", true)
        setXMLBool(xmlFile, "farmDashboard.modules#hirePurchasing", true)
        setXMLBool(xmlFile, "farmDashboard.modules#companionMods", true)
        setXMLInt(xmlFile, "farmDashboard.settings#stockPlaceablesPerFrame", self.config.stockPlaceablesPerFrame)
        setXMLInt(xmlFile, "farmDashboard.settings#baleWorldEntitiesPerFrame", self.config.baleWorldEntitiesPerFrame)
        setXMLInt(xmlFile, "farmDashboard.settings#financeVehiclesPerFrame", self.config.financeVehiclesPerFrame)
        setXMLInt(xmlFile, "farmDashboard.settings#redTapeFarmsPerFrame", self.config.redTapeFarmsPerFrame)
        setXMLInt(xmlFile, "farmDashboard.settings#invoicesFarmsPerFrame", self.config.invoicesFarmsPerFrame)
        setXMLInt(xmlFile, "farmDashboard.settings#hirePurchasingFarmsPerFrame", self.config.hirePurchasingFarmsPerFrame)
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
        setXMLBool(xmlFile, "farmDashboard.settings#collectionSafetyV6Applied", true)
        setXMLInt(xmlFile, "farmDashboard.settings#economyRowsPerSlice", self.config.economyRowsPerSlice)
        saveXMLFile(xmlFile)
        delete(xmlFile)
    end

    -- Keep staggered collection on a slow cadence by default: never faster than 60s per full pass.
    self.config.collectionCycleMs = math.max(60000, math.min(1800000, self.config.collectionCycleMs or 60000))
    self._userCollectionCycleMs = self.config.collectionCycleMs
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
    self.config.invoicesFarmsPerFrame = math.max(1, math.min(8, self.config.invoicesFarmsPerFrame or 1))
    self.config.hirePurchasingFarmsPerFrame = math.max(1, math.min(8, self.config.hirePurchasingFarmsPerFrame or 1))
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
    setXMLBool(xmlFile, "farmDashboard.settings#allowExportMirror", Utils.getNoNil(cfg.allowExportMirror, true))
    setXMLBool(xmlFile, "farmDashboard.settings#mirrorExport", Utils.getNoNil(cfg.mirrorExport, true))
    setXMLBool(xmlFile, "farmDashboard.settings#mirrorDefaultOnApplied", true)
    setXMLInt(xmlFile, "farmDashboard.settings#animalRowsPerSlice", cfg.animalRowsPerSlice or 256)
    setXMLInt(xmlFile, "farmDashboard.settings#sliceBudgetMs", cfg.sliceBudgetMs or 4)
    setXMLInt(xmlFile, "farmDashboard.settings#economyRefreshEveryNCycles", cfg.economyRefreshEveryNCycles or 3)
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
    setXMLInt(xmlFile, "farmDashboard.settings#invoicesFarmsPerFrame", cfg.invoicesFarmsPerFrame or 1)
    setXMLInt(xmlFile, "farmDashboard.settings#hirePurchasingFarmsPerFrame", cfg.hirePurchasingFarmsPerFrame or 1)
    setXMLInt(xmlFile, "farmDashboard.settings#postLoadCollectionGraceSec", cfg.postLoadCollectionGraceSec or POST_LOAD_COLLECTION_GRACE_SEC)
    setXMLInt(xmlFile, "farmDashboard.settings#economyRowsPerSlice", cfg.economyRowsPerSlice or 64)
    setXMLBool(xmlFile, "farmDashboard.settings#useStateMachine_economy", Utils.getNoNil(cfg.useStateMachine_economy, false))
    setXMLBool(xmlFile, "farmDashboard.settings#useStateMachine_fields", Utils.getNoNil(cfg.useStateMachine_fields, false))
    setXMLBool(xmlFile, "farmDashboard.settings#useStateMachine_production", Utils.getNoNil(cfg.useStateMachine_production, false))
    setXMLBool(xmlFile, "farmDashboard.settings#collectionSafetyV6Applied", true)
    setXMLBool(xmlFile, "farmDashboard.settings#collectionSafetyV7Applied", true)
    setXMLBool(xmlFile, "farmDashboard.settings#collectionSafetyV8Applied", true)
    setXMLBool(xmlFile, "farmDashboard.settings#modulesDefaultOnApplied", true)

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
    setXMLBool(xmlFile, "farmDashboard.modules#invoices", Utils.getNoNil(cfg.enableInvoices, true))
    setXMLBool(xmlFile, "farmDashboard.modules#hirePurchasing", Utils.getNoNil(cfg.enableHirePurchasing, true))
    setXMLBool(xmlFile, "farmDashboard.modules#companionMods", Utils.getNoNil(cfg.enableCompanionMods, true))
    setXMLBool(xmlFile, "farmDashboard.modules#rfSoilFertilizer", Utils.getNoNil(cfg.enableRfSoilFertilizer, false))
    setXMLBool(xmlFile, "farmDashboard.modules#rfCropStress", Utils.getNoNil(cfg.enableRfCropStress, false))
    setXMLBool(xmlFile, "farmDashboard.modules#rfTax", Utils.getNoNil(cfg.enableRfTax, false))
    setXMLBool(xmlFile, "farmDashboard.modules#rfMarketDynamics", Utils.getNoNil(cfg.enableRfMarketDynamics, false))
    setXMLBool(xmlFile, "farmDashboard.modules#rfFuelCosts", Utils.getNoNil(cfg.enableRfFuelCosts, false))
    setXMLBool(xmlFile, "farmDashboard.modules#rfWorkerCosts", Utils.getNoNil(cfg.enableRfWorkerCosts, false))
    setXMLBool(xmlFile, "farmDashboard.modules#rfIncome", Utils.getNoNil(cfg.enableRfIncome, false))
    setXMLBool(xmlFile, "farmDashboard.modules#rfWorkplaceTriggers", Utils.getNoNil(cfg.enableRfWorkplaceTriggers, false))
    setXMLBool(xmlFile, "farmDashboard.modules#rfDairy", Utils.getNoNil(cfg.enableRfDairy, false))
    setXMLBool(xmlFile, "farmDashboard.modules#rfNpcFavor", Utils.getNoNil(cfg.enableRfNpcFavor, false))
    setXMLBool(xmlFile, "farmDashboard.modules#rfWorldEvents", Utils.getNoNil(cfg.enableRfWorldEvents, false))
    setXMLBool(xmlFile, "farmDashboard.modules#rfProStaff", Utils.getNoNil(cfg.enableRfProStaff, false))
    setXMLBool(xmlFile, "farmDashboard.modules#rfFertilizerDepot", Utils.getNoNil(cfg.enableRfFertilizerDepot, false))
    setXMLBool(xmlFile, "farmDashboard.modules#rfWeatherGuard", Utils.getNoNil(cfg.enableRfWeatherGuard, false))
    setXMLBool(xmlFile, "farmDashboard.modules#rfTimeGuard", Utils.getNoNil(cfg.enableRfTimeGuard, false))
    setXMLBool(xmlFile, "farmDashboard.modules#rfPresence", Utils.getNoNil(cfg.enableRfPresence, false))

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
    local gui = _G.g_gui
    if type(gui) ~= "table" then return nil end
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
    if _G.g_dedicatedServer ~= nil then return true end
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

--- True while shop spawn grace is active — fleet scans pause; other collectors keep running.
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
        -- Abort only fleet walks. Cancelling JSON / fields here left the Fields page
        -- on a stale snapshot until the next full cycle (and Courseplay can extend grace).
        local name = self._incActiveModule
        if name == "vehicles" or name == "finance" then
            self:_abortActiveIncrementalWork()
        end
    end

    local nowS = self:_missionNowSec()
    if (nowS - (self._vehicleSpawnGraceLogAt or 0)) >= 2 then
        self._vehicleSpawnGraceLogAt = nowS
        Logging.info(
            "[FarmDash] Shop spawn freeze %ds (%s) — fleet scan paused; fields keep exporting",
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
        local evt = _G[name]
        if type(evt) == "table" then
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
        if (self._postLoadCollectionGraceUntil - nowS) > 600 then
            self._postLoadCollectionGraceUntil = nil
            self._postLoadSilenceUntil = nil
        else
            self._vehicleCountProbe = total
            self._vehicleReadyCountProbe = ready
            return
        end
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

--- True when post-load grace should defer starting new collector slots.
--- Esc/pause/dt<=0 must NOT fully freeze collection (fields stalled as {} historically).
function FarmDashboardDataCollector:shouldDeferCollectionWork(dt)
    if not _G.g_currentMission then return true end

    -- Shop / Esc / PDA must not freeze Fields. Pausing the whole stagger (and aborting the
    -- fields coroutine) left vanilla savegame4 data.json with fields:{} so the dashboard
    -- only had fields.xml — leftover HARVEST_READY ground after straw was baled.
    -- Fleet scans still skip via shouldDeferVehicleFleetWork.

    local nowS = self:_missionNowSec()
    local graceUntil = self._postLoadCollectionGraceUntil
    if type(graceUntil) == "number" and nowS < graceUntil then
        -- Belt-and-braces: if grace was armed on a wall-clock epoch (legacy bug), mission
        -- time can never catch up — drop the latch so collectors run.
        if (graceUntil - nowS) > 600 then
            self._postLoadCollectionGraceUntil = nil
            self._postLoadSilenceUntil = nil
            Logging.info("[FarmDash] Cleared absurd post-load grace (until=%.0f now=%.1f) — collectors resuming", graceUntil, nowS)
        else
            return true
        end
    end

    -- Do not treat dt<=0 or mission.paused as a full collection freeze. Esc/PDA often
    -- reports dt=0 while g_time still advances; slot timing already uses effDt from g_time.
    -- Fleet still skips via shouldDeferVehicleFleetWork; pause abort only clears fleet coroutines.

    return false
end

--- Drop in-flight fleet work when entering pause/menu (stale vehicle refs during shop sell).
--- Leave fields / economy / production coroutines parked — killing them published fields:{}.
function FarmDashboardDataCollector:_abortActiveIncrementalWork()
    local name = self._incActiveModule
    if name == "fields" or name == "economy" or name == "production" then
        return
    end
    if name == "vehicles" and rawget(_G, "VehicleDataCollector") then
        VehicleDataCollector._inc = nil
    elseif name == "finance" and rawget(_G, "FinanceDataCollector") then
        FinanceDataCollector._inc = nil
    elseif name == "animals" and rawget(_G, "AnimalDataCollector") then
        AnimalDataCollector._iter = nil
        AnimalDataCollector._co = nil
    elseif name == "stock" and rawget(_G, "StockDataCollector") then
        StockDataCollector._inc = nil
    end
    if name == "vehicles" or name == "finance" or name == "animals" or name == "stock" then
        self._incActiveModule = nil
    end
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
    self._lastModLinkedCheckGTime = nil
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
    self._wroteRichExport = false
    self._latchedTerrainHalf = nil

    -- MUST use the same clock as shouldDeferCollectionWork (_missionNowSec → g_time/1000).
    -- Setting grace from FarmDashDiagnostics.nowSec() (getTimeSec / os.clock) while the
    -- defer gate reads g_time left collection paused forever after the empty bootstrap
    -- write — Fields stayed on XML fertilizer steps, companionMods never ran.
    local nowS = self:_missionNowSec()
    self._postLoadSilenceUntil = nowS + POST_LOAD_SILENCE_SEC
    local graceSec = self.config.postLoadCollectionGraceSec or POST_LOAD_COLLECTION_GRACE_SEC
    self._postLoadCollectionGraceUntil = nowS + graceSec
    self._collectionPausedLatch = false
    Logging.info(
        "[FarmDash] Post-load collection grace %ds (mission clock now=%.1fs until=%.1fs)",
        graceSec, nowS, self._postLoadCollectionGraceUntil
    )

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

    -- Companion mods present → keep matching collectors on (and persist if we flipped flags).
    self:ensureModLinkedCollectorsEnabled(true)
end

--- Stable order must match slice spacing (one module per slot over collectionCycleMs).
--- Optional third-party collectors stay in the rotation whenever their mod is loaded,
--- even if an older config.xml left the module flag off.
function FarmDashboardDataCollector:getEnabledCollectorOrder()
    -- Active mods are stable during a loaded save. Check for late-loaded
    -- companions once per mission second instead of scanning every mod on
    -- every frame. Direct config flag changes still affect the order below
    -- immediately. Missing/restarted game clocks retain the safe scan path.
    local nowMs = rawget(_G, "g_time")
    local lastMs = self._lastModLinkedCheckGTime
    if type(nowMs) ~= "number" or type(lastMs) ~= "number"
        or nowMs < lastMs or nowMs - lastMs >= 1000 then
        self:ensureModLinkedCollectorsEnabled(false)
        self._lastModLinkedCheckGTime = type(nowMs) == "number" and nowMs or nil
    end
    local order = {}
    if _collectorOrderSpec == nil then _collectorOrderSpec = {
        -- Fields before animals/vehicles so PF N/pH reaches the dashboard before a long
        -- husbandry/fleet pass (Montana + Courseplay). Weather is cheap; keep it early too.
        { "fields",     "enableFields" },
        { "weather",    "enableWeather" },
        { "animals",    "enableAnimals" },
        { "vehicles",   "enableVehicles" },
        { "finance",    "enableFinance" },
        { "economy",    "enableEconomy" },
        { "production", "enableProduction" },
        { "stock",          "enableStock" },
        { "baleInventory",  "enableBaleInventory" },
        { "companionMods",  "enableCompanionMods" },
        -- Dedicated companion pages share the companion-mods switch.
        { "companionPages", "enableCompanionMods" },
        { "redTape",        "enableRedTape" },
        { "invoices",       "enableInvoices" },
        { "hirePurchasing", "enableHirePurchasing" },
        { "rfSoilFertilizer",    "enableRfSoilFertilizer" },
        { "rfCropStress",        "enableRfCropStress" },
        { "rfTax",               "enableRfTax" },
        { "rfMarketDynamics",    "enableRfMarketDynamics" },
        { "rfFuelCosts",         "enableRfFuelCosts" },
        { "rfWorkerCosts",       "enableRfWorkerCosts" },
        { "rfIncome",            "enableRfIncome" },
        { "rfWorkplaceTriggers", "enableRfWorkplaceTriggers" },
        { "rfDairy",             "enableRfDairy" },
        { "rfNpcFavor",          "enableRfNpcFavor" },
        { "rfWorldEvents",       "enableRfWorldEvents" },
        { "rfProStaff",          "enableRfProStaff" },
        { "rfFertilizerDepot",   "enableRfFertilizerDepot" },
        { "rfWeatherGuard",      "enableRfWeatherGuard" },
        { "rfTimeGuard",         "enableRfTimeGuard" },
        { "rfPresence",          "enableRfPresence" },
    } end
    for _, row in ipairs(_collectorOrderSpec) do
        local name, flag = row[1], row[2]
        if self.config[flag] then
            table.insert(order, name)
        end
    end
    return order
end

--- When a companion mod is active, keep the matching collector enabled (default-on path).
--- persist=true writes config.xml so older default-off saves flip permanently.
function FarmDashboardDataCollector:ensureModLinkedCollectorsEnabled(persist)
    if type(self.config) ~= "table" then
        return false
    end
    local changed = false

    local function forceOn(flag)
        if self.config[flag] ~= true then
            self.config[flag] = true
            changed = true
        end
    end

    -- Core exporters — always on unless an admin deliberately turned them off after upgrade.
    -- (No companion mod.) Left alone here except the one-time modulesDefaultOn migration.

    local inv = rawget(_G, "InvoicesDataCollector")
    if inv and type(inv.isModLoaded) == "function" and inv.isModLoaded() then
        forceOn("enableInvoices")
    end
    local hp = rawget(_G, "HirePurchasingDataCollector")
    if hp and type(hp.isModLoaded) == "function" and hp.isModLoaded() then
        forceOn("enableHirePurchasing")
    end
    local cm = rawget(_G, "CompanionModsDataCollector")
    if cm and type(cm.isModLoaded) == "function" and cm.isModLoaded() then
        forceOn("enableCompanionMods")
    end
    local cp = rawget(_G, "CompanionPagesDataCollector")
    if cp and type(cp.isModLoaded) == "function" and cp.isModLoaded() then
        forceOn("enableCompanionMods")
    end
    local rt = rawget(_G, "RedTapeDataCollector")
    if rt and type(rt.isModLoaded) == "function" and rt.isModLoaded() then
        forceOn("enableRedTape")
    end

    -- Realistic Farming collectors — keep slots on when soft-detect says the companion is loaded.
    if _rfForceSpec == nil then _rfForceSpec = {
        { "RfSoilFertilizerDataCollector", "enableRfSoilFertilizer" },
        { "RfCropStressDataCollector", "enableRfCropStress" },
        { "RfTaxDataCollector", "enableRfTax" },
        { "RfMarketDynamicsDataCollector", "enableRfMarketDynamics" },
        { "RfFuelCostsDataCollector", "enableRfFuelCosts" },
        { "RfWorkerCostsDataCollector", "enableRfWorkerCosts" },
        { "RfIncomeDataCollector", "enableRfIncome" },
        { "RfWorkplaceTriggersDataCollector", "enableRfWorkplaceTriggers" },
        { "RfDairyDataCollector", "enableRfDairy" },
        { "RfNpcFavorDataCollector", "enableRfNpcFavor" },
        { "RfWorldEventsDataCollector", "enableRfWorldEvents" },
        { "RfProStaffDataCollector", "enableRfProStaff" },
        { "RfFertilizerDepotDataCollector", "enableRfFertilizerDepot" },
        { "RfWeatherGuardDataCollector", "enableRfWeatherGuard" },
        { "RfTimeGuardDataCollector", "enableRfTimeGuard" },
        { "RfPresenceDataCollector", "enableRfPresence" },
    } end
    for _, row in ipairs(_rfForceSpec) do
        local coll = rawget(_G, row[1])
        if coll and type(coll.isModLoaded) == "function" and coll.isModLoaded() then
            forceOn(row[2])
            -- Soil / crop-stress overlays are merged onto field rows.
            if row[1] == "RfSoilFertilizerDataCollector" or row[1] == "RfCropStressDataCollector" then
                forceOn("enableFields")
            end
        end
    end

    -- ADS / Vehicle Years / Mileage nest under the vehicles collector.
    if self:isAdvancedDamageSystemLoaded() or self:isVehicleYearsLoaded() or self:isVehicleMileageLoaded() then
        forceOn("enableVehicles")
    end
    -- Precision Farming N/pH/soil type live on field rows. Buying soil maps in the PDA
    -- does not populate the dashboard if this collector is off (export stays fields: {}).
    if self:isPrecisionFarmingLoaded() then
        forceOn("enableFields")
    end
    -- Moisture System samples live on fields + stock paths.
    if self:isMoistureSystemLoaded() then
        forceOn("enableFields")
        forceOn("enableStock")
        forceOn("enableBaleInventory")
    end
    -- Realistic Livestock benefits from animals exporter.
    if self:isRealisticLivestockLoaded() then
        forceOn("enableAnimals")
    end

    if changed and persist and type(self.saveConfig) == "function" then
        pcall(function() self:saveConfig() end)
    end
    return changed
end

function FarmDashboardDataCollector:isAdvancedDamageSystemLoaded()
    if _G.g_modIsLoaded and _G.g_modIsLoaded["FS25_AdvancedDamageSystem"] then
        return true
    end
    if _G.g_currentMission and _G.g_currentMission.advancedDamageSystem then
        return true
    end
    return rawget(_G, "AdvancedDamageSystem") ~= nil
end

function FarmDashboardDataCollector:isVehicleMileageLoaded()
    if _G.g_modIsLoaded and (_G.g_modIsLoaded["FS25_VehicleMileage"] or _G.g_modIsLoaded["FS25_Vehicle_Mileage"]) then
        return true
    end
    return rawget(_G, "VehicleMileage") ~= nil or rawget(_G, "nxMileage") ~= nil
end

function FarmDashboardDataCollector:isMoistureSystemLoaded()
    if _G.g_modIsLoaded and (_G.g_modIsLoaded["FS25_MoistureSystem"] or _G.g_modIsLoaded["FS25_Moisture"]) then
        return true
    end
    local m = _G.g_currentMission
    return m ~= nil and m.MoistureSystem ~= nil
end

function FarmDashboardDataCollector:isPrecisionFarmingLoaded()
    if _G.g_modIsLoaded and (_G.g_modIsLoaded["FS25_precisionFarming"] or _G.g_modIsLoaded["FS25_PrecisionFarming"]) then
        return true
    end
    -- The mod namespace is an engine key (mods.lua _G[modName] = modEnv) inherited here, and it exists
    -- for every available mod, so only a populated g_precisionFarming counts as loaded.
    local ns = _G.FS25_precisionFarming
    if type(ns) == "table" and ns ~= _G and rawget(ns, "g_precisionFarming") ~= nil then
        return true
    end
    return rawget(_G, "g_precisionFarming") ~= nil
end

function FarmDashboardDataCollector:isRealisticLivestockLoaded()
    if _G.g_modIsLoaded and (_G.g_modIsLoaded["FS25_RealisticLivestock"] or _G.g_modIsLoaded["FS25_RealisticLiveStock"]) then
        return true
    end
    return rawget(_G, "RealisticLivestock") ~= nil
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

--- Merge RF soil/cropStress caches onto fields[] rows (Coordinator-owned; Land fills caches).
function FarmDashboardDataCollector:_mergeRfFieldEnrichment(fields, mc)
    if type(fields) ~= "table" then
        return fields or {}
    end
    local soil = mc and mc.rfSoilFertilizer
    local stress = mc and mc.rfCropStress
    local soilBy = (type(soil) == "table" and type(soil.byField) == "table") and soil.byField or nil
    local stressBy = (type(stress) == "table" and type(stress.byField) == "table") and stress.byField or nil
    if not soilBy and not stressBy then
        return fields
    end
    local out = {}
    for i, row in ipairs(fields) do
        if type(row) == "table" then
            local copy = {}
            for k, v in pairs(row) do
                copy[k] = v
            end
            local fid = tonumber(row.farmlandId or row.id or row.fieldId)
            if fid and soilBy then
                local soilRow = soilBy[fid] or soilBy[tostring(fid)]
                if type(soilRow) == "table" then
                    copy.soilFertilizer = {}
                    for sk, sv in pairs(soilRow) do
                        copy.soilFertilizer[sk] = sv
                    end
                    if copy.soilFertilizer.enabled == nil and soil.enabled ~= nil then
                        copy.soilFertilizer.enabled = soil.enabled
                    end
                end
            end
            if fid and stressBy then
                local stressRow = stressBy[fid] or stressBy[tostring(fid)]
                if type(stressRow) == "table" then
                    copy.cropStress = {}
                    for sk, sv in pairs(stressRow) do
                        copy.cropStress[sk] = sv
                    end
                    if copy.cropStress.enabled == nil and stress.enabled ~= nil then
                        copy.cropStress.enabled = stress.enabled
                    end
                end
            end
            out[i] = copy
        else
            out[i] = row
        end
    end
    return out
end

--- Nest RF collector caches under top-level realisticFarming (see docs/rf-suite/SCHEMAS.md).
function FarmDashboardDataCollector:_assembleRealisticFarming(mc)
    mc = mc or {}
    local soil = mc.rfSoilFertilizer or { enabled = false }
    local stress = mc.rfCropStress or { enabled = false }
    local soilSummary = {
        enabled = soil.enabled == true,
        pfConflict = soil.pfConflict,
        fieldCount = soil.fieldCount,
        -- Why SF produced no field rows (nil when enabled) so the dashboard can say
        -- so instead of silently falling back to base-game fertiliser bars.
        reason = soil.reason,
        modLoaded = soil.modLoaded,
        managerPresent = soil.managerPresent,
        systemPresent = soil.systemPresent,
        settingsEnabled = soil.settingsEnabled,
    }
    local stressSummary = {
        enabled = stress.enabled == true,
        fieldCount = stress.fieldCount,
        alertHint = stress.alertHint,
    }
    return {
        soilFertilizer = soilSummary,
        cropStress = stressSummary,
        tax = mc.rfTax or { enabled = false },
        marketDynamics = mc.rfMarketDynamics or { enabled = false },
        fuelCosts = mc.rfFuelCosts or { enabled = false },
        workerCosts = mc.rfWorkerCosts or { enabled = false },
        income = mc.rfIncome or { enabled = false },
        workplaceTriggers = mc.rfWorkplaceTriggers or { enabled = false },
        dairy = mc.rfDairy or { enabled = false },
        npcFavor = mc.rfNpcFavor or { enabled = false },
        worldEvents = mc.rfWorldEvents or { enabled = false },
        proStaff = mc.rfProStaff or { enabled = false },
        fertilizerDepot = mc.rfFertilizerDepot or { enabled = false },
        weatherGuard = mc.rfWeatherGuard or { enabled = false },
        timeGuard = mc.rfTimeGuard or { enabled = false },
        presence = mc.rfPresence or { enabled = false, mods = {} },
    }
end

--- FH-20260914: is the economy refresh due this cycle?
--- Returns true to SKIP. The very first pass always collects, so the export is never missing prices
--- on a fresh load; only later refreshes are spaced out. A value of 1, or a missing module cache
--- entry, always collects.
function FarmDashboardDataCollector:_shouldSkipEconomyThisCycle()
    local every = tonumber(self.config and self.config.economyRefreshEveryNCycles) or 1
    if every <= 1 then return false end
    local mc = self.moduleCache
    if type(mc) ~= "table" or mc.economy == nil then
        return false
    end
    local seen = (self._economyCycleCount or 0) + 1
    self._economyCycleCount = seen
    return (seen % every) ~= 0
end

-- Freeze the same player-farm list and selected farm for both companion collectors in this cycle.
function FarmDashboardDataCollector:beginCompanionFarmSnapshot()
    local farmInfo = self:getFarmInfo()
    local companion = rawget(_G, "CompanionModsDataCollector")
    local helpers = type(companion) == "table" and companion.helpers or nil
    self._companionFarmInfo = farmInfo
    self._companionExportFarmId = nil
    if type(helpers) == "table" and type(helpers.resolveExportFarmId) == "function" then
        self._companionExportFarmId = helpers.resolveExportFarmId(farmInfo)
    end
    self._companionFarmScopeReady = true
end

function FarmDashboardDataCollector:assembleDataFromModuleCache()
    if not _G.g_currentMission then return nil end
    if not self._companionFarmScopeReady then
        self:beginCompanionFarmSnapshot()
    end

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
        farmInfo   = self._companionFarmInfo,
        animals    = mc.animals or {},
        vehicles   = mc.vehicles or {},
        fields     = mc.fields or {},
        production = mc.production or {},
        finance    = mc.finance or {},
        weather    = mc.weather or {},
        economy    = self:_stripEconomyDebugForExport(mc.economy),
        stock      = mc.stock or { enabled = false, byFarm = {} },
        redTape    = mc.redTape or { enabled = false, byFarm = {} },
        invoices   = mc.invoices or { enabled = false },
        hirePurchasing = mc.hirePurchasing or { enabled = false },
        companionMods = mc.companionMods or { enabled = false, mods = {} },
        companionPages = mc.companionPages or { enabled = false, schema = 1, pages = {} },
        --- Physical bales by fill + placement (BaleInventoryCollector / InventoryScan).
        baleInventory = baleInv or { farmId = nil, byFarm = {}, onField = {}, offField = {} }
    }

    data.fields = self:_mergeRfFieldEnrichment(data.fields, mc)
    data.realisticFarming = self:_assembleRealisticFarming(mc)

    _finalizeFillTypeNames(data)

    if rawget(_G, "FieldDataCollector") and FieldDataCollector.getCachedGameplayFlags then
        data.gameSettings = FieldDataCollector.getCachedGameplayFlags()
    end

    if data.finance and data.finance.money then
        data.money = data.finance.money
    end

    data.adsSummary = self:buildAdsSummary(mc.vehicles)
    data.vehicleYearsSummary = self:buildVehicleYearsSummary(mc.vehicles, data.gameTime)
    data.mileageSummary = self:buildMileageSummary(mc.vehicles)

    local clock = _G.g_time
    if type(clock) ~= "number" then clock = nil end
    local recorded = type(self._sectionOutcomes) == "table" and self._sectionOutcomes or {}
    local function exportOutcome(name, enabled)
        if enabled == false then
            return {
                outcome = "disabled",
                readState = "ok",
                coverage = "complete",
                provider = "vanilla",
                sampledAt = clock,
                sessionId = nil,
            }
        end
        local prior = recorded[name]
        if type(prior) == "table" and prior.outcome ~= nil then
            return prior
        end
        return {
            outcome = "unknown",
            readState = nil,
            coverage = "unknown",
            provider = nil,
            sampledAt = nil,
            sessionId = nil,
        }
    end
    local cfg = self.config or {}
    data.sectionOutcomes = {
        animals = exportOutcome("animals", cfg.enableAnimals ~= false),
        vehicles = exportOutcome("vehicles", cfg.enableVehicles ~= false),
        fields = exportOutcome("fields", cfg.enableFields ~= false),
        production = exportOutcome("production", cfg.enableProduction ~= false),
        finance = exportOutcome("finance", cfg.enableFinance ~= false),
        weather = exportOutcome("weather", cfg.enableWeather ~= false),
        economy = exportOutcome("economy", cfg.enableEconomy ~= false),
        stock = exportOutcome("stock", cfg.enableStock ~= false),
        redTape = exportOutcome("redTape", cfg.enableRedTape ~= false),
    }

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
        invoices = self.config.enableInvoices ~= false,
        hirePurchasing = self.config.enableHirePurchasing ~= false,
        companionMods = self.config.enableCompanionMods ~= false,
        companionPages = self.config.enableCompanionMods ~= false,
        rfSoilFertilizer = self.config.enableRfSoilFertilizer ~= false,
        rfCropStress = self.config.enableRfCropStress ~= false,
        rfTax = self.config.enableRfTax ~= false,
        rfMarketDynamics = self.config.enableRfMarketDynamics ~= false,
        rfFuelCosts = self.config.enableRfFuelCosts ~= false,
        rfWorkerCosts = self.config.enableRfWorkerCosts ~= false,
        rfIncome = self.config.enableRfIncome ~= false,
        rfWorkplaceTriggers = self.config.enableRfWorkplaceTriggers ~= false,
        rfDairy = self.config.enableRfDairy ~= false,
        rfNpcFavor = self.config.enableRfNpcFavor ~= false,
        rfWorldEvents = self.config.enableRfWorldEvents ~= false,
        rfProStaff = self.config.enableRfProStaff ~= false,
        rfFertilizerDepot = self.config.enableRfFertilizerDepot ~= false,
        rfWeatherGuard = self.config.enableRfWeatherGuard ~= false,
        rfTimeGuard = self.config.enableRfTimeGuard ~= false,
        rfPresence = self.config.enableRfPresence ~= false,
    }

    self.data = data
    return data
end

--- Remove economy debug scaffolding from export payloads (keeps moduleCache debug intact).
function FarmDashboardDataCollector:_stripEconomyDebugForExport(econ)
    if type(econ) ~= "table" then return {} end
    local out = {}
    for k, v in pairs(econ) do
        if k ~= "debug" then
            out[k] = v
        end
    end
    if type(out.marketPrices) == "table" and out.marketPrices.debug ~= nil then
        local mp = {}
        for mk, mv in pairs(out.marketPrices) do
            if mk ~= "debug" then
                mp[mk] = mv
            end
        end
        out.marketPrices = mp
    end
    return out
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

--- Fleet aggregates when FS25_VehicleMileage data is present on exported vehicles.
function FarmDashboardDataCollector:buildMileageSummary(vehicles)
    if type(vehicles) ~= "table" then return nil end
    local summary = {
        enabled = false,
        vehicleCount = 0,
        totalOdoKm = 0,
        totalTripKm = 0,
    }
    for _, v in ipairs(vehicles) do
        local mileage = v and v.mileage
        if mileage and mileage.enabled then
            summary.enabled = true
            summary.vehicleCount = summary.vehicleCount + 1
            summary.totalOdoKm = summary.totalOdoKm + (tonumber(mileage.odoKm) or 0)
            summary.totalTripKm = summary.totalTripKm + (tonumber(mileage.tripKm) or 0)
        end
    end
    if not summary.enabled then return nil end
    summary.totalOdoKm = math.floor(summary.totalOdoKm * 1000 + 0.5) / 1000
    summary.totalTripKm = math.floor(summary.totalTripKm * 1000 + 0.5) / 1000
    return summary
end

--- @return boolean hasIncrementalCollector
function FarmDashboardDataCollector:collectorSupportsIncremental(name)
    -- FieldDataCollector has its own per-field collectBegin/collectStep fallback when
    -- coroutine.create is unavailable. Do not route it through full sync collect().
    if not self.coroutinesAvailable and COROUTINE_INCREMENTAL_COLLECTORS[name] and name ~= "fields" then
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
    self._sliceSession = self._exportSession or 0
    self:_diagTrace("module active %s (incremental)", name)
end

--- After a module produces fresh data (partial or final), refresh in-memory payload without disk write.
function FarmDashboardDataCollector:refreshAssembledInMemory()
    local assembled = self:assembleDataFromModuleCache()
    if assembled then
        self.data = assembled
    end
end

--- Copy one finished section. The first return is the detached table.
--- The second return is nil on success, or an error token when the section cannot be admitted.
--- Empty tables stay empty. A scalar root, metatable, cycle, unsupported key or value,
--- or a tree past the serializer depth (JSON_MAX_DEPTH is 32) or the node budget fails the whole section.
function FarmDashboardDataCollector:_admitSection(payload)
    if type(payload) ~= "table" then
        return nil, "root"
    end
    local maxDepth = 32
    local maxNodes = 262144
    local function copyPlain(value, seen, depth, budget)
        if type(value) ~= "table" then
            return nil, "value"
        end
        if depth > maxDepth then
            return nil, "depth"
        end
        if getmetatable(value) ~= nil then
            return nil, "metatable"
        end
        if seen[value] then
            return nil, "cycle"
        end
        budget.nodes = budget.nodes + 1
        if budget.nodes > maxNodes then
            return nil, "resource"
        end
        seen[value] = true
        local copy = {}
        for key, item in pairs(value) do
            budget.nodes = budget.nodes + 1
            if budget.nodes > maxNodes then
                seen[value] = nil
                return nil, "resource"
            end
            local keyKind = type(key)
            if keyKind ~= "number" and keyKind ~= "string" then
                seen[value] = nil
                return nil, "key"
            end
            local itemKind = type(item)
            if itemKind == "number" or itemKind == "string" or itemKind == "boolean" then
                copy[key] = item
            elseif itemKind == "table" then
                local nested, err = copyPlain(item, seen, depth + 1, budget)
                if err ~= nil then
                    seen[value] = nil
                    return nil, err
                end
                copy[key] = nested
            else
                seen[value] = nil
                return nil, "value"
            end
        end
        seen[value] = nil
        return copy, nil
    end
    return copyPlain(payload, {}, 0, { nodes = 0 })
end

function FarmDashboardDataCollector:_detachData(value, seen, depth)
    return self:_admitSection(value)
end

function FarmDashboardDataCollector:_rememberModuleOutcome(name, failed)
    if type(self._sectionOutcomes) ~= "table" then self._sectionOutcomes = {} end
    local clock = _G.g_time
    if type(clock) ~= "number" then clock = nil end
    if failed then
        local prev = self._sectionOutcomes[name]
        self._sectionOutcomes[name] = {
            outcome = "failed",
            readState = "failed",
            coverage = "partial",
            provider = "vanilla",
            sampledAt = type(prev) == "table" and prev.sampledAt or nil,
            sessionId = nil,
        }
        return
    end
    local section = type(self.moduleCache) == "table" and self.moduleCache[name] or nil
    local outcome = "ok"
    local coverage = "complete"
    local readState = "ok"
    if name == "animals" then
        if type(section) ~= "table" then
            outcome = "unknown"
            coverage = "unknown"
            readState = nil
        elseif next(section) == nil then
            outcome = "empty"
        else
            local counted = false
            local missingCount = false
            for _, row in pairs(section) do
                if type(row) ~= "table" then
                    missingCount = true
                else
                    local heads = row.animalCount
                    if type(heads) ~= "number" or heads ~= heads or heads == math.huge or heads == -math.huge then
                        missingCount = true
                    elseif heads > 0 then
                        counted = true
                    end
                end
            end
            if missingCount then
                outcome = "unknown"
                coverage = "partial"
                readState = nil
            elseif counted then
                outcome = "ok"
            else
                outcome = "empty"
            end
        end
    elseif name == "stock" then
        if type(section) ~= "table" then
            outcome = "unknown"
            coverage = "unknown"
            readState = nil
        elseif section.enabled == false then
            outcome = "disabled"
        elseif type(section.byFarm) ~= "table" then
            outcome = "unknown"
            coverage = "unknown"
            readState = nil
        else
            local nonzero = false
            local missingNumber = false
            for _, farm in pairs(section.byFarm) do
                if type(farm) ~= "table" or type(farm.items) ~= "table" then
                    missingNumber = true
                else
                    for _, item in pairs(farm.items) do
                        if type(item) ~= "table" then
                            missingNumber = true
                        else
                            local liters = item.totalLiters
                            if type(liters) ~= "number" or liters ~= liters or liters == math.huge or liters == -math.huge then
                                missingNumber = true
                            elseif liters ~= 0 then
                                nonzero = true
                            end
                        end
                    end
                end
            end
            if missingNumber then
                outcome = "unknown"
                coverage = "partial"
                readState = nil
            elseif nonzero then
                outcome = "ok"
            else
                outcome = "zero"
            end
        end
    elseif name == "fields" or name == "production" then
        if type(section) ~= "table" then
            outcome = "unknown"
            coverage = "unknown"
            readState = nil
        elseif name == "production" then
            local chains = section.chains
            if chains == nil and next(section) == nil then
                outcome = "empty"
            elseif type(chains) ~= "table" then
                outcome = "unknown"
                coverage = "partial"
                readState = nil
            else
                local chainCount = 0
                local badChain = false
                for _, chain in pairs(chains) do
                    chainCount = chainCount + 1
                    if type(chain) ~= "table" then
                        badChain = true
                    end
                end
                if badChain then
                    outcome = "unknown"
                    coverage = "partial"
                    readState = nil
                elseif chainCount == 0 then
                    outcome = "empty"
                else
                    outcome = "ok"
                end
            end
        elseif next(section) == nil then
            outcome = "empty"
        end
    end
    self._sectionOutcomes[name] = {
        outcome = outcome,
        readState = readState,
        coverage = coverage,
        provider = "vanilla",
        sampledAt = clock,
        sessionId = nil,
    }
end

--- When a module slice completes (full collect or incremental done), advance schedule and maybe flush JSON.
function FarmDashboardDataCollector:finishModuleSlice(name, order, usedIncremental, failed)
    if self._sliceSession ~= nil and self._sliceSession ~= (self._exportSession or 0) then
        self._incActiveModule = nil
        return
    end
    if type(self._cycleFresh) ~= "table" then self._cycleFresh = {} end
    self._incActiveModule = nil
    local n = #order
    if n > 0 then
        self.nextSliceIdx = (self.nextSliceIdx or 1) % n + 1
    end

    self:_rememberModuleOutcome(name, failed == true)
    if not failed then
        self._cycleFresh[name] = true
    end
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
    if type(self._cycleFresh) ~= "table" then self._cycleFresh = {} end
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
    local session = self._exportSession or 0
    if pending.session ~= nil and pending.session ~= session then
        Logging.info(
            "[FarmDash] dropped stale export session=%s current=%s",
            tostring(pending.session),
            tostring(session)
        )
        self._jsonPendingDisk = nil
        local recoveryMap = self._recoveryByTarget
        if type(recoveryMap) == "table" then
            for key, txn in pairs(recoveryMap) do
                if type(txn) ~= "table" or txn.session ~= session then
                    recoveryMap[key] = nil
                end
            end
        end
        return true
    end

    if not self:_diskRetryDue(pending) then
        return "deferred"
    end

    local t0 = self:_diagNow()
    local bytes = pending.jsonString and #pending.jsonString or 0
    if self:_usesXmlTransport() then
        if self._xmlInFlight then return "deferred" end
        local route = rawget(_G, "FarmDashboardExportRoute")
        local pendingClass = pending.exportClass or "gameplay"
        local record = self:_xmlRecord(pending.jsonString, pending.generation, pending.session, pendingClass)
        local queued = (route and route.submit) and route:submit(record) or "refused"
        if queued == "queued" or queued == "coalesced" then
            -- Generation 0 never receives a commit callback; only gameplay may hold the collector.
            if pendingClass == "gameplay" then self._xmlInFlight = true end
            self._jsonPendingDisk = nil
            return "queued"
        end
        pending.attempts = (pending.attempts or 0) + 1
        pending.nextRetryAt = self:_missionTimeMs() + 250
        return false
    end
    local written = self:_writeJsonStringToDisk(pending.jsonString, pending.savegameDir)
    if written ~= true then
        local attempts = (pending.attempts or 0) + 1
        pending.attempts = attempts
        local delay = 5000
        if attempts == 1 then delay = 250
        elseif attempts == 2 then delay = 500
        elseif attempts == 3 then delay = 1000
        end
        pending.nextRetryAt = self:_missionTimeMs() + delay
        if FarmDashLog and FarmDashLog.error then
            FarmDashLog.error("export write failed slot=%s", tostring(pending.savegameDir))
        end
        return false
    end
    self._jsonPendingDisk = nil
    local gen = tonumber(pending.generation) or 0
    if gen > 0 then
        self._completedGeneration = gen
        self._activeCandidateGeneration = nil
        self._wroteRichExport = true
        if (pending.attempts or 0) > 0 and FarmDashLog and FarmDashLog.error then
            FarmDashLog.error("export write recovered generation=%d", gen)
        end
        Logging.info("[FarmDash] export committed generation=%d bytes=%d slot=%s", gen, bytes, tostring(pending.savegameDir))
    end
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
    if self._sliceSession ~= nil and self._sliceSession ~= (self._exportSession or 0) then
        self._incActiveModule = nil
        return
    end
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
        invoicesFarmsPerFrame = self.config.invoicesFarmsPerFrame or 1,
        hirePurchasingFarmsPerFrame = self.config.hirePurchasingFarmsPerFrame or 1,
        rfLandFieldsPerFrame = self.config.rfLandFieldsPerFrame or 8,
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
            -- Keep the last good cache. Publishing {} wiped Fields on the dashboard.
            -- Do not mark the module fresh: reused data is stale (MOD-09).
            self:finishModuleSlice(name, order, true, true)
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
        if payload == nil then
            self._productionCandidate = nil
            self:finishModuleSlice("production", order, true, true)
        else
            local detached, admitErr = self:_admitSection(payload)
            if admitErr ~= nil then
                self._productionCandidate = nil
                self:finishModuleSlice("production", order, true, true)
            else
                self:startHusbandryJobAfterProduction(order, true)
                if self._husbandryJob then
                    self._productionCandidate = { session = self._exportSession or 0, data = detached }
                    self._incActiveModule = nil
                else
                    detached.husbandryTotals = {}
                    self.moduleCache.production = detached
                    self:finishModuleSlice("production", order, true, false)
                end
            end
        end
    elseif name ~= "production" then
        -- A partial payload stays staged. The committed cache keeps the last finished sample.
        if done and payload ~= nil then
            local detached, admitErr = self:_admitSection(payload)
            if admitErr ~= nil then
                if type(self._sectionStaging) == "table" then
                    self._sectionStaging[name] = nil
                end
                self:finishModuleSlice(name, order, true, true)
                return
            end
            self.moduleCache[name] = detached
            if type(self._sectionStaging) == "table" then
                self._sectionStaging[name] = nil
            end
        elseif payload ~= nil then
            if type(self._sectionStaging) ~= "table" then self._sectionStaging = {} end
            self._sectionStaging[name] = payload
        end
    end

    --- Partial incremental steps skip refreshAssembledInMemory (full assemble every frame hitched while driving).

    if done and name ~= "production" then
        self:finishModuleSlice(name, order, true, payload == nil)
    end
end

--- Legacy synchronous collect for one module name.
function FarmDashboardDataCollector:runLegacyModuleSlice(name, order)
    self._sliceSession = self._exportSession or 0
    self:_diagTrace("legacy collect start %s", name)
    local t0 = self:_diagNow()
    local result, collectFailed = self:safeCollect(name)
    if t0 and self:_diagEnabled() then
        local ms = (self:_diagNow() - t0) * 1000
        self:_diagTrace("legacy collect done %s ms=%.2f%s", name, ms, self:_diagMarkHitch(ms))
    end
    if name == "production" then
        if collectFailed == true then
            self._productionCandidate = nil
            self:finishModuleSlice(name, order, false, true)
            return
        end
        local detached, admitErr = self:_admitSection(result)
        if admitErr ~= nil then
            self._productionCandidate = nil
            self:finishModuleSlice(name, order, false, true)
            return
        end
        self:startHusbandryJobAfterProduction(order, false)
        if self._husbandryJob then
            self._productionCandidate = { session = self._exportSession or 0, data = detached }
            return
        end
        detached.husbandryTotals = {}
        self.moduleCache.production = detached
        self:finishModuleSlice(name, order, false, false)
        return
    end
    if collectFailed == true then
        self:finishModuleSlice(name, order, false, true)
        return
    end
    local detached, admitErr = self:_admitSection(result)
    if admitErr ~= nil then
        self:finishModuleSlice(name, order, false, true)
        return
    end
    self.moduleCache[name] = detached
    self:finishModuleSlice(name, order, false, false)
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
        self:beginCompanionFarmSnapshot()
        self._diagSlotCycle = (self._diagSlotCycle or 0) + 1
        self:_diagTrace(
            "=== slot cycle #%d begin modules=%d slotMs=%.0f cycleMs=%d order=%s ===",
            self._diagSlotCycle, n, slotMs, cycleMs, table.concat(order, ",")
        )
    end

    -- FH-20260914: skip the economy refresh on cycles where it is not due. The module cache still
    -- supplies the last collected prices to every export, so the file never loses the block; only
    -- the cost of gathering it is skipped. Any other module is unaffected.
    if name == "economy" and self:_shouldSkipEconomyThisCycle() then
        self:_diagTrace("slot #%d/%d skip %s (cadence, cache retained)", idx, n, name)
        self.nextSliceIdx = idx % n + 1
        return
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
        diagEarly.lastUpdateDtMs = dt
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
    self._frameExportBytes = 0
    self:_pollShopPendingLoads()
    pcall(function() self:_exportFillTypeHudIcons() end)

    -- Always tick export-mirror first so shop-freeze / early returns cannot stall an in-flight stream.
    local mirrorEarly = rawget(_G, "FarmDashboardExportMirror")
    if mirrorEarly and mirrorEarly.update and mirrorEarly._job then
        pcall(function() mirrorEarly:update(dt) end)
    end

    if not self:_isServerExportHost() then
        self:_updateVehicleSpawnGrace()
    end
    -- Fleet slices skip themselves during spawn grace; fields/soil must keep writing.
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
    if self:_checkExportLiveness() then
        self:pumpHeldExport()
    end
    self:_promoteQueuedSnapshot()
    local frameWorkDone = false
    local penWaiting = type(self._dirtyPens) == "table" and next(self._dirtyPens) ~= nil
    -- A persistent dirty pen must share frames with an active collector too.
    -- Otherwise non-core collectors (notably stock) can be starved after JSON drains.
    if penWaiting and (self._jsonWriteJob or self._jsonPendingDisk or self._incActiveModule) then
        self._exportFair = (self._exportFair == "pen") and "snapshot" or "pen"
    end
    if penWaiting and self._exportFair == "pen" and self:_exportBudgetAllows(1) then
        self:processDetailQueueOnce()
        frameWorkDone = true
    elseif self._jsonWriteJob then
        self:jsonWriteStep()
        frameWorkDone = true
    elseif self._jsonPendingDisk then
        local diskOutcome = self:jsonDiskWriteStep()
        if diskOutcome ~= "deferred" then
            frameWorkDone = true
        end
    elseif self._cycleTailJob then
        self:cycleTailStep()
        frameWorkDone = true
    end

    -- Until fields/vehicles/animals exist, do not let JSON serialization starve collectors.
    -- Also continue an in-flight core collector during soft defer (dt<=0 / menu): blocking
    -- collectStep here parked fields forever while Esc was open.
    local cacheLooksEmpty = not self:_exportHasGameplayRows(self.moduleCache)
    local incName = self._incActiveModule
    local coreInc = (incName == "fields" or incName == "economy" or incName == "production"
        or incName == "companionMods" or incName == "weather")

    if (not deferHeavy or cacheLooksEmpty or coreInc) and (not frameWorkDone or cacheLooksEmpty or coreInc) then
        if self._incActiveModule then
            self:runIncrementalActiveStep(order)
            frameWorkDone = true
        elseif self._husbandryJob and not deferHeavy then
            self:husbandryTotalsStep()
            frameWorkDone = true
        end
    end

    if self._incActiveModule or self._husbandryJob then
        return
    end
    local diskBlocking = self._jsonPendingDisk and self:_diskRetryDue(self._jsonPendingDisk)
    if (self._jsonWriteJob or diskBlocking or self._cycleTailJob) and not cacheLooksEmpty then
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
            if assembled then self:writeDataToFile(assembled, "gameplay") end
            self:_maybeProcessDetailQueueTail()
            return
        end
        self.slotAccumulator = (self.slotAccumulator or 0) + effDt
        while self.slotAccumulator >= cycleMs do
            self.slotAccumulator = self.slotAccumulator - cycleMs
            local assembled = self:assembleDataFromModuleCache()
            if assembled then self:writeDataToFile(assembled, "gameplay") end
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
function FarmDashboardDataCollector:_armIndexRetry()
    if type(_G.g_time) == "number" then
        self._dirtyIndexRetryAt = self:_missionTimeMs() + 1000
    else
        self._dirtyIndexSkips = 2
    end
end

function FarmDashboardDataCollector:_indexRetryDue()
    if type(_G.g_time) == "number" then
        return self:_missionTimeMs() >= (self._dirtyIndexRetryAt or 0)
    end
    local skips = self._dirtyIndexSkips or 0
    if skips > 0 then
        self._dirtyIndexSkips = skips - 1
        return false
    end
    return true
end

function FarmDashboardDataCollector:_maybeProcessDetailQueueTail()
    local idle = type(self._dirtyPens) ~= "table" or next(self._dirtyPens) == nil
    if idle and self._dirtyIndexDue and self:_exportBudgetAllows(3) and self:_indexRetryDue() then
        local wrote = self:_writeDirtyPensIndex()
        if wrote ~= "queued" and wrote ~= "held" and wrote ~= "deferred" then self:_armIndexRetry() end
        return
    end
    if idle then return end
    local hasMore = self:processDetailQueueOnce()
    if not hasMore and self:_exportBudgetAllows(3) and self._dirtyIndexDue and self:_indexRetryDue() then
        local wrote = self:_writeDirtyPensIndex()
        if wrote ~= "queued" and wrote ~= "held" and wrote ~= "deferred" then
            self:_armIndexRetry()
        end
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
    self._husbandryJob = { list = list, idx = 1, totalsByFarm = {}, failed = false, session = self._exportSession or 0 }
    self._slicePendingFinish = { name = "production", order = order, incremental = incrementalFlag, failed = false }
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
            job.failed = true
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
        local sessionOk = (job.session or 0) == (self._exportSession or 0)
        local followFailed = job.failed == true
        local candidate = self._productionCandidate
        if sessionOk and not followFailed and type(candidate) == "table" and type(candidate.data) == "table" and candidate.session == (self._exportSession or 0) then
            local activeFarmId = self:getActiveFarmId()
            candidate.data.husbandryTotals = job.totalsByFarm[activeFarmId] or {}
            candidate.data.husbandryTotalsByFarm = job.totalsByFarm
            if type(self.moduleCache) ~= "table" then self.moduleCache = {} end
            self.moduleCache.production = candidate.data
        end
        self._productionCandidate = nil
        self._husbandryJob = nil
        self:refreshAssembledInMemory()
        local pending = self._slicePendingFinish
        self._slicePendingFinish = nil
        if pending and sessionOk then
            self:finishModuleSlice(pending.name, pending.order, pending.incremental, pending.failed == true or followFailed)
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

--- One successor only. Called from the scheduler, not from the serialize exception handler.
function FarmDashboardDataCollector:_promoteQueuedSnapshot()
    if self._jsonWriteJob or self._jsonPendingDisk or self._xmlInFlight then return end
    local queued = self._jsonWritePending
    if type(queued) ~= "table" then return end
    local record = type(queued.data) == "table" and queued or { data = queued, class = "gameplay", session = self._exportSession }
    if self:_beginQueuedExport(record) then
        self._jsonWritePending = nil
    end
end

--- Spread top-level JSON keys across frames, then write the file once.
--- Each top-level key's encoded string is held in `parts`; final write does table.concat.
function FarmDashboardDataCollector:beginDeferredJsonWrite(data, exportClass)
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
    pcall(function()
        if _G.FarmDashboard and FarmDashboard.buildExportDiagnostics then
            data.diagnostics = FarmDashboard:buildExportDiagnostics()
        end
    end)
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
    pcall(function() self:_exportFillTypeHudIcons() end)
    -- Plan v5 Phase 0: schemaVersion + serverTimeSec.
    data.schemaVersion = DATA_SCHEMA_VERSION
    if self._jsonWriteJob or self._jsonPendingDisk or self._xmlInFlight then
        self._jsonWritePending = data
        self:_diagTrace("jsonWrite deferred (job in flight)")
        return
    end
    --- No active job: this submission is newer than any aborted successor still queued.
    self._jsonWritePending = nil
    self:_stampExportGeneration(data, exportClass or "gameplay")
    if data.serverTimeSec == nil then
        local D = rawget(_G, "FarmDashDiagnostics")
        data.serverTimeSec = (D and D.nowSec and D.nowSec()) or 0
    end

    local walk = self:_jsonWalkBegin(data, 0)
    -- The published snapshot is machine-readable. Avoid paying for pretty
    -- whitespace in every frame-bounded write and envelope readback.
    walk.compact = true
    if walk.stack[1] then walk.stack[1].knownObject = true end
    self._jsonWriteJob = {
        data = data,
        session = self._exportSession or 0,
        exportClass = data.exportClass,
        parts = {},
        walk = walk,
    }
    self:_diagTrace("jsonWrite begin root walk")
end

function FarmDashboardDataCollector:jsonWriteStep()
    local job = self._jsonWriteJob
    if not job then return true end
    local frame = self._frameBudget
    if type(frame) == "table" and (tonumber(frame.bytes) or 0) <= 0 then
        return "deferred"
    end
    if job.walk ~= nil or job.concatPending then
        if job.walk ~= nil then
            local okWalk, finished = xpcall(function()
                return self:_jsonWalkStep(job.walk, job.parts, nil)
            end, _farmDashFormatError)
            if not okWalk then
                local abortedGen = job.data and tonumber(job.data.exportGeneration) or nil
                local diskGen = self._jsonPendingDisk and tonumber(self._jsonPendingDisk.generation) or nil
                self._jsonWriteJob = nil
                if abortedGen and abortedGen > 0 and abortedGen ~= diskGen
                    and self._activeCandidateGeneration == abortedGen then
                    self._activeCandidateGeneration = nil
                end
                return false
            end
            if not finished then return false end
            job.walk = nil
            job.concatPending = true
            if self:_jsonBudgetRemaining() == 0 then return false end
        end
        local jsonString = table.concat(job.parts or {})
        self._lastJsonBytes = #jsonString
        self._jsonPendingDisk = {
            jsonString = jsonString,
            savegameDir = self:getSavegameDirName(),
            generation = job.data and job.data.exportGeneration or 0,
            session = job.session,
            exportClass = job.exportClass or (job.data and job.data.exportClass) or "gameplay",
        }
        self._jsonWriteJob = nil
        return true
    end

    local diag = rawget(_G, "FarmDashDiagnostics")
    local tok = (diag and diag:isEnabled()) and diag:start("jsonWriteStep") or nil

    local nk = #job.keys
    local per = math.max(1, self.config.jsonTopLevelKeysPerFrame or 1)
    local parts = job.parts
    local stepStart = job.i
    local stepTok = self:_diagNow()

    -- FH-20260914: the frame is now bounded by TIME, not by a key count. A single top-level key can
    -- be 1.4 MB on a real save, so "one key per frame" was never a bound on anything. The walk below
    -- stops between two JSON tokens when the slice budget is spent and resumes on the next frame,
    -- which is why a driving frame no longer disappears into economy.
    local budgetMs = self.config.sliceBudgetMs or 4
    local startSec = _jsonWalkNowSec()
    local deadline = (startSec ~= nil) and (startSec + (budgetMs / 1000)) or nil
    local keysThisFrame = 0

    while job.i <= nk do
        if job.walk == nil then
            if keysThisFrame >= per and deadline == nil then break end
            local k = job.keys[job.i]
            if job.prefixRest == nil then
                job.prefixRest = '  "' .. _escapeJsonKey(tostring(k)) .. '": '
                job.walkKey = k
            end
            local left = self:_jsonBudgetRemaining()
            if left ~= nil and left <= 0 then
                return "deferred"
            end
            if left ~= nil and #job.prefixRest > left then
                parts[#parts + 1] = string.sub(job.prefixRest, 1, left)
                self:_chargeExportBytes(left)
                job.prefixRest = string.sub(job.prefixRest, left + 1)
                return false
            end
            if job.prefixRest ~= "" then
                parts[#parts + 1] = job.prefixRest
                if left ~= nil then self:_chargeExportBytes(#job.prefixRest) end
            end
            job.prefixRest = nil
            job.walk = self:_jsonWalkBegin(job.data[job.walkKey], 1)
        end

        local okJson, finished = xpcall(function()
            return self:_jsonWalkStep(job.walk, parts, deadline)
        end, _farmDashFormatError)
        if not okJson then
            if FarmDashLog and FarmDashLog.error then
                FarmDashLog.error("json serialize failed key=%s err=%s", tostring(job.walkKey), tostring(finished))
            end
            self._jsonWriteJob = nil
            local abortedGen = job.data and tonumber(job.data.exportGeneration) or nil
            local diskGen = self._jsonPendingDisk and tonumber(self._jsonPendingDisk.generation) or nil
            if abortedGen and abortedGen > 0 and abortedGen ~= diskGen
                and self._activeCandidateGeneration == abortedGen then
                self._activeCandidateGeneration = nil
            end
            return false
        end

        if not finished then
            -- Budget spent mid-value. Keep the walk and continue on the next frame.
            return false
        end

        job.walk = nil
        job.walkKey = nil
        if job.i < nk then parts[#parts + 1] = "," end
        parts[#parts + 1] = "\n"
        job.i = job.i + 1
        keysThisFrame = keysThisFrame + 1

        if deadline ~= nil then
            local now = _jsonWalkNowSec()
            if now ~= nil and now >= deadline then break end
        elseif keysThisFrame >= per then
            break
        end
    end

    if job.i > nk then
        parts[#parts + 1] = "}"
        local jsonString = table.concat(parts)
        self._lastJsonBytes = #jsonString
        local savegameDir = self:getSavegameDirName()
        self._jsonPendingDisk = {
            jsonString = jsonString,
            savegameDir = savegameDir,
            generation = job.data and job.data.exportGeneration or 0,
        session = job.session,
            exportClass = job.exportClass or (job.data and job.data.exportClass) or "gameplay",
        }
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
        return false
    end
    savegameDir = savegameDir or self:getSavegameDirName()
    local dataPath = self:getDataOutputDir()
    local filePath = dataPath .. "data.json"
    local normPath = string.gsub(filePath, "\\", "/")
    local written = false
    self._exportSafetyRefusal = false

    if type(io) == "table" and type(io.open) == "function" then
        written = self:_writeFileAtomic(normPath, jsonData)
    elseif not self._ioNilLogged then
        self._ioNilLogged = true
        FarmDashLog.devWarn("Lua io.open is not available; cannot write data.json.")
    end

    if not written and self._exportSafetyRefusal ~= true and type(_G.saveFile) == "function" then
        -- Local extract has no saveFile return contract. A thrown error, false, or a
        -- void/nil result does not prove the file landed. Only an explicit true commits.
        local rel = "modSettings/FS25_FarmDashboard/" .. savegameDir .. "/data.json"
        local okSf, result = pcall(function() return _G.saveFile(rel, jsonData) end)
        if okSf and result == true then
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
        local mirror = rawget(_G, "FarmDashboardExportMirror")
        if mirror and mirror.onAuthorityDataWritten then
            pcall(function()
                mirror:onAuthorityDataWritten(jsonData, savegameDir)
            end)
        end
    else
        self._writeFailCount = (self._writeFailCount or 0) + 1
        if not self._writeFailLogged or self._writeFailCount % 40 == 0 then
            self._writeFailLogged = true
            FarmDashLog.devWarn("Could not write data.json (path: %s) [fail #%d]", tostring(normPath), self._writeFailCount)
        end
    end
    return written == true
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
    if type(self.collectors) ~= "table" then return {}, true end
    local collector = self.collectors[collectorName]
    if not collector or type(collector.collect) ~= "function" then return {}, true end

    local success, result = pcall(function() return collector:collect() end)
    if success then
        if result == nil then return {}, true end
        return result, false
    end
    FarmDashLog.devWarn("Failed to collect %s", tostring(collectorName))
    return {}, true
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
--- UV must match IngameMapElement:worldToLocalPos (getTerrainSize). Do not enlarge
--- because a rim field sits at ~±1020 m on a 2048 m map — that doubled Riverbend to 4 km.
function FarmDashboardDataCollector:refineMapBoundsFromWorldActivity(data, bounds)
    if not bounds or type(bounds) ~= "table" then
        return bounds
    end
    local engineHalf = tonumber(bounds.halfSize) or 1024
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
    if data and data.fields then
        for _, f in pairs(data.fields) do
            if type(f) == "table" then
                local pos = f.position
                consider(f.posX or (pos and pos.x), f.posZ or (pos and pos.z))
            end
        end
    end
    -- Keep engine square unless activity is clearly outside it (4 km map reported as 2 km).
    if maxAbs <= engineHalf * 1.02 then
        bounds.halfSize = engineHalf
        bounds.terrainSize = engineHalf * 2
        bounds.minX = -engineHalf
        bounds.maxX = engineHalf
        bounds.minZ = -engineHalf
        bounds.maxZ = engineHalf
        self._latchedTerrainHalf = engineHalf
        return bounds
    end
    local newHalf = 1024
    while newHalf < maxAbs and newHalf < 8192 do
        newHalf = newHalf * 2
    end
    if newHalf < engineHalf then
        newHalf = engineHalf
    end
    bounds.halfSize = newHalf
    bounds.terrainSize = newHalf * 2
    bounds.minX = -newHalf
    bounds.maxX = newHalf
    bounds.minZ = -newHalf
    bounds.maxZ = newHalf
    self._latchedTerrainHalf = newHalf
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
    local mission = _G.g_currentMission
    return {
        minX = -half,
        maxX = half,
        minZ = -half,
        maxZ = half,
        halfSize = half,
        terrainSize = half * 2,
        mapWidth = mission and tonumber(mission.mapWidth) or nil,
        mapHeight = mission and tonumber(mission.mapHeight) or nil,
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
                -- Dedicated / MP: export every named player farm on the save (matches
                -- InventoryScan.collectPlayerFarmIds). Requiring online players hid farms
                -- the client wasn't currently joined to, and the app then pruned their data.
                if farmId == 0 or farmId == 100 then
                    -- skip contractor pool / unassigned
                elseif farmData.isPlayer then
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

--- Always store a number. Bootstrap and other empty snapshots record 0.
--- A missing key is not the same as generation zero, and nonempty rows are not completeness.
function FarmDashboardDataCollector:_missionTimeMs()
    if type(_G.g_time) == "number" then return _G.g_time end
    return 0
end

function FarmDashboardDataCollector:_diskRetryDue(pending)
    if type(pending) ~= "table" or pending.nextRetryAt == nil then
        return true
    end
    return self:_missionTimeMs() >= pending.nextRetryAt
end

--- Bootstrap is an explicit lifecycle class. Gameplay candidates are numbered
--- here but _completedGeneration advances only after a verified disk commit.
function FarmDashboardDataCollector:_stampExportGeneration(data, exportClass)
    if type(data) ~= "table" then
        return 0
    end
    if exportClass == "gameplay" then
        local candidate = self._activeCandidateGeneration
        if self._xmlInFlight then
            local floor = math.max(self._completedGeneration or 0, candidate or 0, self._reservedGeneration or 0)
            candidate = floor + 1
            self._reservedGeneration = candidate
        elseif candidate == nil then
            candidate = (self._completedGeneration or 0) + 1
            self._activeCandidateGeneration = candidate
            self._reservedGeneration = candidate
        end
        data.exportGeneration = candidate
        data.exportClass = "gameplay"
        return candidate
    end
    data.exportGeneration = 0
    data.exportClass = "bootstrap"
    return 0
end

function FarmDashboardDataCollector:_exportHasGameplayRows(data)
    if type(data) ~= "table" then
        return false
    end
    local function hasRows(t)
        if type(t) ~= "table" then
            return false
        end
        for _ in pairs(t) do
            return true
        end
        return false
    end
    if hasRows(data.vehicles) or hasRows(data.fields) or hasRows(data.animals) then
        return true
    end
    return false
end

function FarmDashboardDataCollector:writeDataToFile(data, exportClass)
    --- Gameplay is an explicit class. Empty fields/vehicles/animals still publish.
    --- The row guard only blocks a later bootstrap/unload write from replacing a committed gameplay file.
    local className = exportClass or "bootstrap"
    if className ~= "gameplay" and self._wroteRichExport and not self:_exportHasGameplayRows(data) then
        return
    end
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

    if className == "gameplay" and self._xmlInFlight and self:_usesXmlTransport() then
        self._heldGameplay = { data = data, class = "gameplay", session = self._exportSession }
        return "queued"
    end
    if self:_jsonBudgetRemaining() ~= nil then
        local record = { data = data, class = className, session = self._exportSession }
        if className == "gameplay" then
            self._heldGameplay = record
        else
            self._jsonWritePending = record
        end
        return "queued"
    end

    self:_stampExportGeneration(data, className)

    local okJson, jsonData = pcall(function() return self:toJSON(data) end)
    if not okJson then
        FarmDashLog.devWarn("toJSON failed: %s", tostring(jsonData))
        return false
    end
    if self:_usesXmlTransport() then
        local route = rawget(_G, "FarmDashboardExportRoute")
        if route and route.submit then
            local record = self:_xmlRecord(jsonData, data.exportGeneration, self._exportSession, className)
            local queued = route:submit(record)
            if queued == "queued" or queued == "coalesced" then
                if className == "gameplay" then self._xmlInFlight = true end
                return "queued"
            end
            return false
        end
        return false
    end
    local written = self:_writeJsonStringToDisk(jsonData, savegameDir)
    if written and data.exportClass == "gameplay" then
        self._completedGeneration = tonumber(data.exportGeneration) or 0
        self._activeCandidateGeneration = nil
        self._wroteRichExport = true
    elseif written and self:_exportHasGameplayRows(data) then
        self._wroteRichExport = true
    end
    return written == true
end

--- @param depth number|nil nil = compact (legacy); 0+ = pretty-print with 2-space indent
--- O(N) build via parts table + table.concat. Backwards-compat wrapper around _toJSONInto.
--- nan / inf serialize as JSON null. Sparse number-keyed tables serialize as objects.
--- Object keys are sorted lexicographically to keep the byte stream deterministic.
function FarmDashboardDataCollector:_jsonBudgetRemaining()
    local frame = self._frameBudget
    if type(frame) ~= "table" or type(frame.bytes) ~= "number" then return nil end
    return frame.bytes
end

function FarmDashboardDataCollector:_exportBudgetAllows(minBytes)
    local left = self:_jsonBudgetRemaining()
    if left == nil then return true end
    return left >= (minBytes or 1)
end

function FarmDashboardDataCollector:_emitJsonBudget(parts, holder, text)
    if type(holder) ~= "table" then return true end
    if type(holder.pendingEmit) == "string" and holder.pendingEmit ~= "" then
        text = holder.pendingEmit .. (text or "")
        holder.pendingEmit = nil
    end
    if type(text) ~= "string" or text == "" then return true end
    local left = self:_jsonBudgetRemaining()
    if left == nil then
        parts[#parts + 1] = text
        return true
    end
    if left <= 0 then
        holder.pendingEmit = text
        return false
    end
    if #text <= left then
        parts[#parts + 1] = text
        self:_chargeExportBytes(#text)
        return true
    end
    parts[#parts + 1] = string.sub(text, 1, left)
    self:_chargeExportBytes(left)
    holder.pendingEmit = string.sub(text, left + 1)
    return false
end

function FarmDashboardDataCollector:_chargeExportBytes(count)
    local n = tonumber(count) or 0
    if n <= 0 then return 0 end
    self._frameExportBytes = (self._frameExportBytes or 0) + n
    local budget = self._frameBudget
    if type(budget) == "table" and type(budget.bytes) == "number" then
        budget.bytes = math.max(0, budget.bytes - n)
        budget.charged = (budget.charged or 0) + n
    end
    return n
end

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
local JSON_MAX_DEPTH = 32

function FarmDashboardDataCollector:_toJSONInto(parts, data, compact, level, seen)
    if (level or 0) > JSON_MAX_DEPTH then
        parts[#parts + 1] = "null"
        return
    end

    local t = type(data)
    if t == "table" then
        seen = seen or {}
        if seen[data] then
            parts[#parts + 1] = "null"
            return
        end
        seen[data] = true
    end

    if type(data) == "string" and data == "__FD_JSON_NULL__" then
        parts[#parts + 1] = "null"
        return
    end

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
            seen[data] = nil
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
                self:_toJSONInto(parts, data[i], compact, level + 1, seen)
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
                self:_toJSONInto(parts, data[k], compact, level + 1, seen)
            end
            parts[#parts + 1] = nl
            parts[#parts + 1] = ind
            parts[#parts + 1] = "}"
        end
        seen[data] = nil
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

--- FH-20260914: a resumable JSON walker for the top-level export pass.
---
--- Why this exists. jsonWriteStep used to hand a whole top-level value to _toJSONInto, which
--- recurses the entire subtree in one call. On this machine's own export that meant a single frame
--- serialising economy at 1,446,512 bytes, of which marketPrices is 1,422,184. One frame, 1.4 MB of
--- string building, on the authority: single player FPS drop, and on a dedicated host a sim-thread
--- stall for every joined player.
---
--- What it guarantees. Byte-identical output to _toJSONInto at compact=true, because it emits the
--- same tokens in the same order: the same sorted object keys,
--- the same array-versus-object test, the same depth cap, the same cycle guard, the same
--- __FD_JSON_NULL__ sentinel. It differs only in being able to stop between two tokens and carry on
--- next frame.
local JSON_WALK_UNITS_PER_TIME_CHECK = 512

--- Begin a resumable serialisation of one value at the given indent level.
function FarmDashboardDataCollector:_jsonWalkBegin(value, level)
    return { stack = { { v = value, level = level or 1, phase = "open" } }, seen = {} }
end

--- Emit as much of the walk as the deadline allows.
--- Returns true when this value is complete, false when it must resume on a later frame.
--- deadline is an absolute wall-clock second value, or nil to run to completion.
function FarmDashboardDataCollector:_jsonWalkStepBudgeted(walk, parts)
    local compact = walk.compact == true
    local function left()
        return self:_jsonBudgetRemaining() or 0
    end
    local function put(text)
        return self:_emitJsonBudget(parts, walk, text)
    end
    while true do
        if type(walk.pendingEmit) == "string" and walk.pendingEmit ~= "" then
            if left() <= 0 then return false end
            if not put(nil) then return false end
        end
        local stack = walk.stack
        if #stack == 0 then return true end
        if left() <= 0 then return false end
        local frame = stack[#stack]
        local data = frame.v
        if frame.phase == "open" or frame.phase == nil then
            if frame.knownObject and not frame.preambleDone then
                frame.phase = "preamble"
            elseif (frame.level or 0) > JSON_MAX_DEPTH or (type(data) == "string" and data == "__FD_JSON_NULL__") then
                frame.phase = "lit"
                frame.literal = "null"
            elseif type(data) ~= "table" then
                frame.phase = "lit"
                local ty = type(data)
                if ty == "string" then
                    frame.phase = "str"
                    frame.src = data
                    frame.si = 1
                    frame.strStage = "openq"
                elseif ty == "number" then frame.literal = _formatNumber(data)
                elseif ty == "boolean" then frame.literal = data and "true" or "false"
                else frame.literal = "null" end
            else
                frame.phase = "classify"
                frame.keys = {}
                frame.scanK = nil
            end
        end
        if frame.phase == "preamble" then
            if not frame.preambleHanded then
                frame.preambleHanded = true
                if not put(compact and "{" or "{\n") then return false end
            end
            frame.preambleDone = true
            frame.phase = "classify"
            frame.keys = frame.keys or {}
            if left() <= 0 then return false end
        end
        if frame.phase == "classify" then
            local allowance = left()
            if allowance <= 0 then return false end
            local steps = 0
            local seen = walk.seen
            if seen[data] then
                frame.phase = "lit"
                frame.literal = "null"
            else
                while steps < allowance do
                    local k = next(data, frame.scanK)
                    if k == nil then frame.scanDone = true break end
                    frame.scanK = k
                    frame.keys[#frame.keys + 1] = k
                    steps = steps + 1
                end
                if steps > 0 then self:_chargeExportBytes(steps) end
                if not frame.scanDone then return false end
                seen[data] = true
                local n = #frame.keys
                local isArray = n > 0
                local count = 0
                for _, k in ipairs(frame.keys) do
                    count = count + 1
                    if type(k) ~= "number" or k ~= count then
                        isArray = false
                        break
                    end
                end
                frame.isArray = isArray and not frame.preambleDone
                frame.count = n
                frame.i = 1
                frame.ind = compact and "" or string.rep("  ", frame.level or 0)
                frame.ind1 = compact and "" or string.rep("  ", (frame.level or 0) + 1)
                if frame.preambleDone and n == 0 then
                    frame.phase = "lit"
                    frame.literal = "}"
                elseif n > 0 and not frame.isArray then
                    frame.phase = "order"
                    frame.orderI = 2
                    frame.orderJ = nil
                    frame.afterOrder = frame.preambleDone and "items" or "openTok"
                    if not frame.preambleDone then frame.openText = compact and "{" or "{\n" end
                else
                    frame.phase = "openTok"
                    frame.openText = n == 0 and (compact and "{}" or ("{\n" .. frame.ind .. "}"))
                        or ((frame.isArray and "[" or "{") .. (compact and "" or "\n"))
                    if n == 0 then frame.empty = true end
                end
            end
        end
        if frame.phase == "order" then
            local keys = frame.keys or {}
            local n = #keys
            if frame.orderI == nil then frame.orderI = 2 end
            if n <= 1 or frame.orderI > n then
                frame.phase = frame.afterOrder or "openTok"
                frame.i = 1
                if frame.phase == "openTok" and frame.openText == nil then frame.openText = compact and "{" or "{\n" end
            else
                if left() <= 0 then return false end
                if frame.orderJ == nil then frame.orderJ = frame.orderI end
                local j = frame.orderJ
                if j > 1 and tostring(keys[j]) < tostring(keys[j - 1]) then
                    keys[j], keys[j - 1] = keys[j - 1], keys[j]
                    frame.orderJ = j - 1
                else
                    frame.orderI = frame.orderI + 1
                    frame.orderJ = nil
                end
                self:_chargeExportBytes(1)
                if left() <= 0 then return false end
            end
        end
        if frame.phase == "openTok" then
            if not frame.openHanded then
                frame.openHanded = true
                if not put(frame.openText) then return false end
            end
            if frame.empty then
                walk.seen[data] = nil
                stack[#stack] = nil
            else
                frame.phase = "items"
            end
        elseif frame.phase == "lit" then
            if not frame.litHanded then
                frame.litHanded = true
                if not put(frame.literal) then return false end
            end
            stack[#stack] = nil
        elseif frame.phase == "str" then
            if frame.strStage == "openq" then
                if not frame.qHanded then
                    frame.qHanded = true
                    if not put('"') then return false end
                end
                frame.strStage = "body"
                if left() <= 0 then return false end
            end
            if frame.strStage == "body" then
                local piece, nxt, done, work = _jsonEscapePiece(frame.src, frame.si or 1, left(), "string")
                local extra = (tonumber(work) or 0) - #piece
                if extra > 0 then self:_chargeExportBytes(extra) end
                frame.si = nxt
                if piece ~= "" and not put(piece) then return false end
                if not done then return false end
                frame.strStage = "closeq"
                frame.qHanded = nil
                if left() <= 0 then return false end
            end
            if frame.strStage == "closeq" then
                if not frame.qHanded then
                    frame.qHanded = true
                    if not put('"') then return false end
                end
                stack[#stack] = nil
            end
        elseif frame.phase == "items" then
            if frame.i > frame.count then
                if not frame.closeHanded then
                    frame.closeHanded = true
                    frame.closeText = (compact and "" or "\n") .. frame.ind .. (frame.isArray and "]" or "}")
                    if not put(frame.closeText) then return false end
                end
                walk.seen[frame.v] = nil
                stack[#stack] = nil
            else
                if frame.itemStage == nil then frame.itemStage = "sep" end
                if frame.itemStage == "sep" then
                    if frame.i > 1 and not frame.sepHanded then
                        frame.sepHanded = true
                        if not put(compact and "," or ",\n") then return false end
                    end
                    frame.itemStage = "indent"
                    frame.sepHanded = nil
                    if left() <= 0 then return false end
                end
                if frame.itemStage == "indent" then
                    if not frame.indHanded then
                        frame.indHanded = true
                        if not put(frame.ind1) then return false end
                    end
                    frame.itemStage = frame.isArray and "child" or "key"
                    frame.indHanded = nil
                    if left() <= 0 then return false end
                end
                if frame.itemStage == "key" then
                    local k = frame.keys[frame.i]
                    if not frame.keyOpen then
                        frame.keyOpen = true
                        if not put('"') then return false end
                        frame.keyAt = 1
                        if left() <= 0 then return false end
                    end
                    local piece, nxt, done, work = _jsonEscapePiece(tostring(k), frame.keyAt or 1, left(), "key")
                    local extra = (tonumber(work) or 0) - #piece
                    if extra > 0 then self:_chargeExportBytes(extra) end
                    frame.keyAt = nxt
                    if piece ~= "" and not put(piece) then return false end
                    if not done then return false end
                    if not frame.keyClose then
                        frame.keyClose = true
                        if not put(compact and '":' or '": ') then return false end
                    end
                    frame.itemStage = "child"
                    if left() <= 0 then return false end
                end
                if frame.itemStage == "child" then
                    local child = frame.isArray and frame.v[frame.i] or frame.v[frame.keys[frame.i]]
                    frame.i = frame.i + 1
                    frame.itemStage = nil
                    frame.keyOpen = nil
                    frame.keyClose = nil
                    stack[#stack + 1] = { v = child, level = (frame.level or 0) + 1, phase = "open" }
                end
            end
        end
    end
end

function FarmDashboardDataCollector:_jsonWalkStep(walk, parts, deadline)
    if self:_jsonBudgetRemaining() ~= nil then
        return self:_jsonWalkStepBudgeted(walk, parts)
    end
    local stack = walk.stack
    local seen = walk.seen
    local compact = walk.compact == true
    local units = 0

    while true do
        local depth = #stack
        if depth == 0 then return true end

        units = units + 1
        if deadline ~= nil and units >= JSON_WALK_UNITS_PER_TIME_CHECK then
            units = 0
            local now = _jsonWalkNowSec()
            if now ~= nil and now >= deadline then return false end
        end

        local frame = stack[depth]
        if type(walk.pendingEmit) == "string" and walk.pendingEmit ~= "" then
            local pendingLeft = self:_jsonBudgetRemaining()
            if pendingLeft ~= nil and pendingLeft <= 0 then return false end
            if not self:_emitJsonBudget(parts, walk, nil) then return false end
        end
        local leftNow = self:_jsonBudgetRemaining()
        if leftNow ~= nil and leftNow <= 0 then return false end

        if frame.phase == "str" then
            local limit = leftNow or (#frame.src + 2)
            if frame.strStage == nil then frame.strStage = "openq" end
            if frame.strStage == "openq" then
                if not self:_emitJsonBudget(parts, walk, '"') then return false end
                frame.strStage = "body"
                leftNow = self:_jsonBudgetRemaining()
                if leftNow ~= nil and leftNow <= 0 then return false end
                limit = leftNow or limit
            end
            if frame.strStage == "body" then
                local piece, nxt, done = _jsonEscapePiece(frame.src, frame.si or 1, limit, "string")
                frame.si = nxt
                if piece ~= "" and not self:_emitJsonBudget(parts, walk, piece) then return false end
                if not done then return false end
                frame.strStage = "closeq"
                leftNow = self:_jsonBudgetRemaining()
                if leftNow ~= nil and leftNow <= 0 then return false end
            end
            if frame.strStage == "closeq" then
                if not self:_emitJsonBudget(parts, walk, '"') then return false end
                stack[depth] = nil
            end

        elseif frame.phase == "open" then
            local data = frame.v
            local level = frame.level

            if level > JSON_MAX_DEPTH then
                parts[#parts + 1] = "null"
                stack[depth] = nil
            elseif type(data) == "string" and data == "__FD_JSON_NULL__" then
                parts[#parts + 1] = "null"
                stack[depth] = nil
            elseif type(data) == "table" then
                if seen[data] then
                    parts[#parts + 1] = "null"
                    stack[depth] = nil
                else
                    seen[data] = true
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
                        parts[#parts + 1] = compact and "{" or "{\n"
                        if not compact then parts[#parts + 1] = string.rep("  ", level) end
                        parts[#parts + 1] = "}"
                        seen[data] = nil
                        stack[depth] = nil
                    else
                        frame.isArray = isArray
                        frame.count = count
                        frame.i = 1
                        frame.ind = compact and "" or string.rep("  ", level)
                        frame.ind1 = compact and "" or string.rep("  ", level + 1)
                        if not isArray then
                            local keys = {}
                            for k in pairs(data) do
                                keys[#keys + 1] = k
                            end
                            table.sort(keys, function(a, b) return tostring(a) < tostring(b) end)
                            frame.keys = keys
                            frame.count = #keys
                        end
                        parts[#parts + 1] = isArray and "[" or "{"
                        if not compact then parts[#parts + 1] = "\n" end
                        frame.phase = "items"
                    end
                end
            else
                local ty = type(data)
                local popped = true
                if ty == "string" then
                    local budgeted = self:_jsonBudgetRemaining()
                    if budgeted == nil then
                        parts[#parts + 1] = '"'
                        parts[#parts + 1] = _escapeJsonString(data)
                        parts[#parts + 1] = '"'
                    else
                        frame.phase = "str"
                        frame.src = data
                        frame.si = 1
                        frame.strStage = "openq"
                        popped = false
                    end
                elseif ty == "number" then
                    if not frame.handed then
                        frame.handed = true
                        if not self:_emitJsonBudget(parts, walk, _formatNumber(data)) then return false end
                    end
                elseif ty == "boolean" then
                    if not frame.handed then
                        frame.handed = true
                        if not self:_emitJsonBudget(parts, walk, data and "true" or "false") then return false end
                    end
                else
                    if not frame.handed then
                        frame.handed = true
                        if not self:_emitJsonBudget(parts, walk, "null") then return false end
                    end
                end
                if popped then stack[depth] = nil end
            end

        else -- "items"
            if frame.i > frame.count then
                if not compact then parts[#parts + 1] = "\n" end
                parts[#parts + 1] = frame.ind
                parts[#parts + 1] = frame.isArray and "]" or "}"
                seen[frame.v] = nil
                stack[depth] = nil
            else
                local i = frame.i
                if i > 1 then
                    parts[#parts + 1] = ","
                    if not compact then parts[#parts + 1] = "\n" end
                end
                if not compact then parts[#parts + 1] = frame.ind1 end
                local child
                if frame.isArray then
                    child = frame.v[i]
                else
                    local k = frame.keys[i]
                    parts[#parts + 1] = '"'
                    parts[#parts + 1] = _escapeJsonKey(tostring(k))
                    parts[#parts + 1] = '":'
                    if not compact then parts[#parts + 1] = " " end
                    child = frame.v[k]
                end
                frame.i = i + 1
                stack[#stack + 1] = { v = child, level = frame.level + 1, phase = "open" }
            end
        end
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

--- Auxiliary recovery records. The authority data.json entry is not counted and is never evicted.
local RECOVERY_AUX_CAP = 8

local function _normRecoveryPath(path)
    return string.gsub(tostring(path or ""), "\\", "/")
end

local function _isAuthorityRecoveryPath(path)
    local norm = _normRecoveryPath(path)
    return norm == "data.json" or string.sub(norm, -10) == "/data.json"
end

--- Full-file reader. io.open is write-only in the Giants sandbox, so this does not
--- try a read mode. readFile is the existing sandbox reader when the host provides it.
--- An empty string is a complete body. Nil, a throw, or a non-string is not.
local function _readWholeFile(path)
    if type(readFile) ~= "function" then
        return nil, "reader unavailable"
    end
    local ok, data, extra = pcall(readFile, path)
    if not ok then
        return nil, "read throw"
    end
    -- A second result is an explicit read error even when the first result is a partial string.
    if extra ~= nil then
        return nil, "read error"
    end
    if type(data) ~= "string" then
        return nil, "read incomplete"
    end
    return data, "complete"
end

local function _captureWholeFile(path)
    local data, reason = _readWholeFile(path)
    if reason == "complete" then return data end
    return nil
end

--- Presence states: absent (definite no), complete (definite yes plus whole bytes),
--- unreadable (definite yes, bytes unavailable), unknown (throw, missing API, or ambiguous).
--- Unknown is never treated as absent. The bounded preview reader is not used here.
local function _readExportPrevious(path)
    if type(fileExists) ~= "function" then
        local data = _captureWholeFile(path)
        if data ~= nil then return data, "unknown" end
        return nil, "unknown"
    end
    local ok, present = pcall(fileExists, path)
    if not ok or (present ~= true and present ~= false) then
        local data = _captureWholeFile(path)
        if data ~= nil then return data, "unknown" end
        return nil, "unknown"
    end
    if present == false then
        return nil, "absent"
    end
    local data = _captureWholeFile(path)
    if data == nil then return nil, "unreadable" end
    return data, "complete"
end

local function _verifyExportBytes(path, expected)
    if type(expected) ~= "string" then return false, "expected missing" end
    local data, reason = _readWholeFile(path)
    if reason ~= "complete" then return false, reason end
    if data ~= expected then return false, "byte mismatch" end
    return true, "match"
end

--- Stage the recovery copy, then replace path.bak only after the stage verifies.
--- An already-matching bak is left untouched.
function FarmDashboardDataCollector:_ensureRecoveryBackup(path, previous)
    local bakPath = path .. ".bak"
    if _verifyExportBytes(bakPath, previous) then return true end
    local stage = bakPath .. ".tmp"
    local f = io.open(stage, "w")
    if not f then return false end
    local staged = _handleWriteAndClose(f, previous)
    if not staged or not _verifyExportBytes(stage, previous) then return false end
    if type(os) == "table" and type(os.rename) == "function" then
        local okCall, renameOk = pcall(os.rename, stage, bakPath)
        if okCall and renameOk and _verifyExportBytes(bakPath, previous) then
            return true
        end
    end
    local out = io.open(bakPath, "w")
    if not out then return false end
    local wrote = _handleWriteAndClose(out, previous)
    if not wrote or not _verifyExportBytes(bakPath, previous) then return false end
    return true
end

--- One staging write, then one rename or one direct write of the exact payload.
--- No same-frame busy-spin. Direct destination write is not atomic.
--- A complete previous body is backed up once per failed transaction and is not
--- rebuilt from a damaged destination on retry.
function FarmDashboardDataCollector:_writeFileAtomic(path, contents)
    if type(io) ~= "table" or type(io.open) ~= "function" then return false end
    if type(self._activeTmpPaths) ~= "table" then self._activeTmpPaths = {} end
    local tmp = path .. ".tmp"
    self._activeTmpPaths[tmp] = true
    local f, openErr = io.open(tmp, "w")
    if not f then
        self._activeTmpPaths[tmp] = nil
        self:_logWriteFail(path, "open", "failed", openErr)
        return false
    end
    local staged, stageOp, stageKind, stageDetail = _handleWriteAndClose(f, contents)
    if not staged then
        self._activeTmpPaths[tmp] = nil
        self:_logWriteFail(path, stageOp, stageKind, stageDetail)
        return false
    end
    local stagedBytes, verifyReason = _verifyExportBytes(tmp, contents)
    if not stagedBytes then
        self._activeTmpPaths[tmp] = nil
        self:_logWriteFail(path, "verify", verifyReason, nil)
        return false
    end

    local session = self._exportSession or 0
    local key = _normRecoveryPath(path)
    if type(self._recoveryByTarget) ~= "table" then self._recoveryByTarget = {} end
    local map = self._recoveryByTarget
    local txn = map[key]
    if type(txn) == "table" and txn.session ~= session then
        map[key] = nil
        txn = nil
    end

    local function auxCount()
        local n = 0
        for entryKey, entry in pairs(map) do
            if type(entry) == "table" and not _isAuthorityRecoveryPath(entryKey) then
                n = n + 1
            end
        end
        return n
    end

    local function refuse(category)
        self._activeTmpPaths[tmp] = nil
        self._exportSafetyRefusal = true
        self:_logWriteFail(path, "refuse", category, nil)
        return false
    end

    local destinationTouched = type(txn) == "table" and txn.destinationTouched == true
    local backupVerified = type(txn) == "table" and txn.backupVerified == true
    local confirmedAbsent = type(txn) == "table" and txn.confirmedAbsent == true
    local previous = type(txn) == "table" and txn.backup or nil
    local phase = type(txn) == "table" and txn.phase or "inspect"

    if destinationTouched then
        --- Recover: the destination may already be damaged. Do not recapture it.
    elseif phase == "protect" and type(previous) == "string" and not backupVerified then
        --- Retry on-disk protection. A Lua copy of the old body is not a verified backup.
    else
        if map[key] == nil and not _isAuthorityRecoveryPath(key) and auxCount() >= RECOVERY_AUX_CAP then
            return refuse("recovery registry full")
        end
        local body, status = _readExportPrevious(path)
        if status == "unknown" or status == "unreadable" then
            map[key] = {
                path = key,
                session = session,
                phase = "inspect",
                destinationTouched = false,
                backupVerified = false,
                confirmedAbsent = false,
                backup = nil,
                status = status,
                untrusted = true,
            }
            return refuse(status)
        end
        if status == "absent" then
            previous = nil
            confirmedAbsent = true
            backupVerified = true
            phase = "replace"
        else
            previous = body
            confirmedAbsent = false
            backupVerified = false
            phase = "protect"
        end
    end

    if not destinationTouched and not confirmedAbsent and not backupVerified then
        if type(previous) ~= "string" or not self:_ensureRecoveryBackup(path, previous) then
            map[key] = {
                path = key,
                session = session,
                phase = "protect",
                destinationTouched = false,
                backupVerified = false,
                confirmedAbsent = false,
                backup = previous,
                status = "complete",
                untrusted = true,
            }
            return refuse("backup failed")
        end
        backupVerified = true
        phase = "replace"
    end

    local renamed = false
    if type(os) == "table" and type(os.rename) == "function" then
        local okCall, renameOk = pcall(os.rename, tmp, path)
        renamed = okCall and renameOk and true or false
    end
    if renamed then
        destinationTouched = true
    end
    local renamedBytes, renamedReason = false, nil
    if renamed then
        renamedBytes, renamedReason = _verifyExportBytes(path, contents)
    end
    if renamed and renamedBytes then
        self._activeTmpPaths[tmp] = nil
        map[key] = nil
        self:_noteWriteRecovered(path)
        return true
    end
    if renamed and renamedReason ~= "byte mismatch" then
        self._activeTmpPaths[tmp] = nil
        map[key] = {
            path = key,
            session = session,
            phase = "recover",
            destinationTouched = true,
            backupVerified = backupVerified,
            confirmedAbsent = confirmedAbsent,
            backup = previous,
            status = confirmedAbsent and "absent" or "complete",
            untrusted = true,
        }
        self:_logWriteFail(path, "verify", renamedReason, nil)
        return false
    end

    local outf, errDirect = io.open(path, "w")
    destinationTouched = true
    if not outf then
        self._activeTmpPaths[tmp] = nil
        map[key] = {
            path = key,
            session = session,
            phase = "recover",
            destinationTouched = true,
            backupVerified = backupVerified,
            confirmedAbsent = confirmedAbsent,
            backup = previous,
            status = confirmedAbsent and "absent" or "complete",
            untrusted = true,
        }
        self:_logWriteFail(path, "open", "fallback", errDirect)
        return false
    end
    local directOk, directOp, directKind, directDetail = _handleWriteAndClose(outf, contents)
    if type(os) == "table" and type(os.remove) == "function" then pcall(os.remove, tmp) end
    self._activeTmpPaths[tmp] = nil
    local published, publishReason = _verifyExportBytes(path, contents)
    if directOk and published then
        map[key] = nil
        self:_noteWriteRecovered(path)
        return true
    end

    local restored = false
    if type(previous) == "string" then
        local restore = io.open(path, "w")
        if restore then
            local rok = _handleWriteAndClose(restore, previous)
            restored = rok and _verifyExportBytes(path, previous) or false
        end
    end
    map[key] = {
        path = key,
        session = session,
        phase = "recover",
        destinationTouched = true,
        backupVerified = backupVerified,
        confirmedAbsent = confirmedAbsent,
        backup = previous,
        status = confirmedAbsent and "absent" or "complete",
        untrusted = true,
    }
    if type(previous) == "string" and not restored and FarmDashLog and FarmDashLog.error then
        FarmDashLog.error("export restore failed path=%s", tostring(path))
    end
    if not directOk then
        self:_logWriteFail(path, directOp, directKind, directDetail)
    else
        self:_logWriteFail(path, "verify", publishReason, nil)
    end
    return false
end

--- One open failure episode per target and export session. Every new admission
--- counts toward 32. One seat stays free for this save's exact data.json
--- (getDataOutputDir() .. "data.json") until that path is logged. Other paths
--- that only end in /data.json use the remaining seats. Each episode remembers
--- up to 8 stage/reason keys. A repeated reason waits 60s even if another
--- reason was logged in between. Recovery closes only that episode. This does
--- not touch recovery transactions or FarmDashLog._errLast.
function FarmDashboardDataCollector:_logWriteFail(path, stage, reason, detail)
    local session = self._exportSession or 0
    local target = _normRecoveryPath(path)
    local reservedTarget = nil
    if type(self.getDataOutputDir) == "function" then
        local dirOk, dir = pcall(self.getDataOutputDir, self)
        if dirOk and type(dir) == "string" and dir ~= "" then
            local normDir = _normRecoveryPath(dir)
            if string.sub(normDir, -1) ~= "/" then normDir = normDir .. "/" end
            reservedTarget = normDir .. "data.json"
        end
    end
    local designated = reservedTarget ~= nil and target == reservedTarget
    if type(self._writeEpisodes) ~= "table" then self._writeEpisodes = {} end
    local map = self._writeEpisodes
    local key = tostring(session) .. "|" .. target
    local stageText = tostring(stage or "write")
    local reasonText = tostring(reason or "failed")
    local now = (type(_G.g_time) == "number") and _G.g_time or 0
    local entry = map[key]
    if type(entry) == "table" and entry.session ~= session then
        map[key] = nil
        entry = nil
    end
    if entry == nil then
        for oldKey, old in pairs(map) do
            if type(old) ~= "table" or old.open ~= true or old.session ~= session then
                map[oldKey] = nil
            end
        end
        local n = 0
        local reservedPresent = false
        for _, old in pairs(map) do
            n = n + 1
            if type(old) == "table" and reservedTarget ~= nil and old.target == reservedTarget then
                reservedPresent = true
            end
        end
        local room = n < 32
        if not designated and reservedTarget ~= nil and not reservedPresent then
            room = n < 31
        end
        if not room then
            local prev = self._writeEpisodeOverflowAt or -60000
            self._writeEpisodeOverflow = (self._writeEpisodeOverflow or 0) + 1
            if not (now >= prev and (now - prev) < 60000) then
                self._writeEpisodeOverflowAt = now
                if type(Logging) == "table" and type(Logging.warning) == "function" then
                    Logging.warning(string.format(
                        "[FarmDash] write failure overflow: auxiliary targets not logged count=%d",
                        self._writeEpisodeOverflow
                    ))
                end
            end
            return
        end
        entry = {
            session = session,
            target = target,
            open = true,
            authority = designated,
            seen = {},
        }
        map[key] = entry
    elseif entry.open ~= true then
        entry.open = true
        entry.seen = {}
        entry.authority = designated
    end
    local seen = entry.seen
    if type(seen) ~= "table" then
        seen = {}
        entry.seen = seen
    end
    local reasonKey = stageText .. "|" .. reasonText
    local prevAt = seen[reasonKey]
    if type(prevAt) == "number" and now >= prevAt and (now - prevAt) < 60000 then
        return
    end
    if seen[reasonKey] == nil then
        local reasonCount = 0
        for _ in pairs(seen) do reasonCount = reasonCount + 1 end
        if reasonCount >= 8 then
            local prev = self._writeEpisodeOverflowAt or -60000
            self._writeEpisodeOverflow = (self._writeEpisodeOverflow or 0) + 1
            if not (now >= prev and (now - prev) < 60000) then
                self._writeEpisodeOverflowAt = now
                if type(Logging) == "table" and type(Logging.warning) == "function" then
                    Logging.warning(string.format(
                        "[FarmDash] write failure overflow: auxiliary targets not logged count=%d",
                        self._writeEpisodeOverflow
                    ))
                end
            end
            return
        end
    end
    seen[reasonKey] = now
    entry.stage = stageText
    entry.reason = reasonText
    entry.lastAt = now
    if type(Logging) == "table" and type(Logging.warning) == "function" then
        Logging.warning(string.format(
            "[FarmDash] write failure: %s(%s): %s: %s",
            stageText, target, reasonText, tostring(detail)
        ))
    end
end

function FarmDashboardDataCollector:_noteWriteRecovered(path)
    local session = self._exportSession or 0
    local target = _normRecoveryPath(path)
    local map = self._writeEpisodes
    if type(map) ~= "table" then return end
    local entry = map[tostring(session) .. "|" .. target]
    if type(entry) ~= "table" or entry.open ~= true or entry.session ~= session then
        return
    end
    entry.open = false
    entry.seen = nil
    entry.stage = nil
    entry.reason = nil
    entry.lastAt = nil
    if type(Logging) == "table" and type(Logging.warning) == "function" then
        Logging.warning("[FarmDash] export write recovered: " .. target)
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

function FarmDashboardDataCollector:_submitBoundedPen(job, jsonStr)
    local penKey = job.penKey
    local ledger = job.ledger
    local route = rawget(_G, "FarmDashboardExportRoute")
    if not (self:_usesXmlTransport() and route and route.submitResource) then
        local fname = self:_penKeyToFilename(penKey)
        local path = self:_detailDirPath() .. "animals_" .. tostring(fname) .. ".json"
        local wrote = self:_writeFileAtomic(path, jsonStr)
        if wrote then self._detailLedger[penKey] = ledger end
        self._penJsonJob = nil
        return wrote
    end
    local record = self:_xmlRecord(jsonStr, 0, self._exportSession, "resource")
    record.resourceId = self:_resourceIdForPen(penKey)
    record.penKey = penKey
    record.ledger = ledger
    if record.resourceId == nil then
        self._penJsonJob = nil
        return false
    end
    local outcome = route:submitResource("penDetail", jsonStr, record)
    if outcome == "queued" or outcome == "held" then
        self._resourcePending = self._resourcePending or {}
        self._resourcePending["penDetail:" .. record.resourceId] = {
            penKey = penKey,
            ledger = ledger,
            version = record.admissionVersion,
        }
        self._penJsonJob = nil
        return outcome
    end
    return false
end

function FarmDashboardDataCollector:_writePenDetailBounded(penKey)
    local job = self._penJsonJob
    if type(job) == "table" and job.penKey ~= penKey then return "deferred" end
    if type(job) ~= "table" then
        if self._detailsDisabled then return false end
        if not self:_ensureDetailsWritable() then return false end
        local placeable = self:_findPlaceableByKey(penKey) or self:_findPlaceableById(penKey)
        if not placeable then return false end
        local detail
        local ok, err = xpcall(function()
            detail = AnimalDataCollector:collectPenDetail(placeable)
        end, _farmDashFormatError)
        if not ok or not detail then return false end
        local D = rawget(_G, "FarmDashDiagnostics")
        local nowS = (D and D.nowSec and D.nowSec()) or 0
        detail.schemaVersion = DETAIL_SCHEMA_VERSION
        detail.idScheme = self._idScheme
        detail.penId = tostring(penKey)
        detail.placeableId = tonumber(placeable.id) or 0
        detail.generatedAt = nowS
        detail.serverTimeSec = nowS
        detail.mode = (self._animalMode == "RL") and "RL" or "base"
        detail.animalMode = self._animalMode
        detail.lod = "full"
        job = {
            penKey = penKey,
            session = self._exportSession,
            ledger = {
                ts = nowS,
                animalCount = (detail.animals and #detail.animals) or 0,
                placeableId = tonumber(placeable.id) or 0,
            },
            walk = self:_jsonWalkBegin(detail, 0),
            parts = {},
        }
        self._penJsonJob = job
    end
    if job.session ~= self._exportSession then
        self._penJsonJob = nil
        return false
    end
    if type(job.jsonStr) ~= "string" then
        local finished = self:_jsonWalkStep(job.walk, job.parts, nil)
        if not finished then return "deferred" end
        job.jsonStr = table.concat(job.parts)
        job.walk = nil
        job.parts = nil
    end
    return self:_submitBoundedPen(job, job.jsonStr)
end

--- Plan v5 B5+B8: build & write a single per-pen detail file (penKey-aware).
--- Now writes schemaVersion, idScheme, placeableId, generatedAt, mode.
function FarmDashboardDataCollector:_writePenDetail(penKey)
    if penKey == nil then return false end
    if not self:_exportBudgetAllows(3) then return "deferred" end
    if self:_jsonBudgetRemaining() ~= nil then
        return self:_writePenDetailBounded(penKey)
    end
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
    local wrote = false
    if self:_usesXmlTransport() then
        local route = rawget(_G, "FarmDashboardExportRoute")
        if route and route.submitResource then
            local ledger = {
                ts = nowS,
                animalCount = (detail.animals and #detail.animals) or 0,
                placeableId = tonumber(placeable.id) or 0,
            }
            local record = self:_xmlRecord(jsonStr, 0, self._exportSession, "resource")
            record.resourceId = self:_resourceIdForPen(penKey)
            record.penKey = penKey
            record.ledger = ledger
            if record.resourceId == nil then return false end
            local outcome = route:submitResource("penDetail", jsonStr, record)
            if outcome == "queued" or outcome == "held" then
                self._resourcePending = self._resourcePending or {}
                self._resourcePending["penDetail:" .. record.resourceId] = {
                    penKey = penKey,
                    ledger = ledger,
                    version = record.admissionVersion,
                }
                self:_chargeExportBytes(#jsonStr)
                return outcome
            end
            return false
        end
    else
        wrote = self:_writeFileAtomic(path, jsonStr)
    end
    if wrote then
        self._detailLedger[penKey] = {
            ts = nowS,
            animalCount = (detail.animals and #detail.animals) or 0,
            placeableId = tonumber(placeable.id) or 0,
        }
    end
    return wrote
end

--- Phase 7.2 + Plan v5 B5: write the dirtyPens.json index with schemaVersion + idScheme.
--- Sets semantics — every entry is a pen with a detail file the App can pull.
--- App keeps last-seen mtime to dedup; consults the per-pen ts before refetching.
function FarmDashboardDataCollector:_writeDirtyPensIndex()
    local revision = self._dirtyIndexRevision or 0
    if self._indexInFlightRevision == revision and self._indexInFlightSession == self._exportSession then
        return "queued"
    end
    local resume = self._indexJsonJob
    if type(resume) == "table" and resume.revision == revision and resume.session == self._exportSession then
        if type(resume.jsonStr) ~= "string" then
            if not self:_jsonWalkStep(resume.walk, resume.parts, nil) then return "deferred" end
            resume.jsonStr = table.concat(resume.parts)
        end
        self._dirtyIndexBuiltRevision = revision
        if self:_usesXmlTransport() then
            local route = rawget(_G, "FarmDashboardExportRoute")
            if route and route.submitResource then
                local record = self:_xmlRecord(resume.jsonStr, 0, self._exportSession, "resource")
                record.indexRevision = revision
                local outcome = route:submitResource("dirtyPens", resume.jsonStr, record)
                if outcome == "queued" or outcome == "held" then
                    self._indexJsonJob = nil
                    self._indexInFlightRevision = revision
                    self._indexInFlightSession = self._exportSession
                    self._indexInFlightAdmission = record.admissionVersion
                end
                return outcome
            end
        end
    end
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
    self._dirtyIndexBuiltRevision = self._dirtyIndexRevision or 0
    local jsonStr
    if self:_jsonBudgetRemaining() ~= nil then
        local job = self._indexJsonJob
        if type(job) ~= "table" or job.revision ~= self._dirtyIndexBuiltRevision or job.session ~= self._exportSession then
            job = { walk = self:_jsonWalkBegin(doc, 0), parts = {}, revision = self._dirtyIndexBuiltRevision, session = self._exportSession }
            self._indexJsonJob = job
        end
        if type(job.jsonStr) ~= "string" then
            if not self:_jsonWalkStep(job.walk, job.parts, nil) then return "deferred" end
            job.jsonStr = table.concat(job.parts)
        end
        jsonStr = job.jsonStr
    else
        local parts = {}
        self:_toJSONInto(parts, doc, false, 0)
        jsonStr = table.concat(parts)
    end

    if self:_usesXmlTransport() then
        local route = rawget(_G, "FarmDashboardExportRoute")
        if route and route.submitResource then
            local record = self:_xmlRecord(jsonStr, 0, self._exportSession, "resource")
            record.indexRevision = self._dirtyIndexBuiltRevision
            local outcome = route:submitResource("dirtyPens", jsonStr, record)
            if outcome == "queued" or outcome == "held" then
                self._indexJsonJob = nil
                self._indexInFlightRevision = self._dirtyIndexBuiltRevision
                self._indexInFlightSession = self._exportSession
                self._indexInFlightAdmission = record.admissionVersion
            end
            return outcome
        end
    end
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
    if type(self._dirtyPens) ~= "table" or next(self._dirtyPens) == nil then return false end
    if not self:_exportBudgetAllows(1) then return true end

    local now = self:_missionTimeMs()
    local penKey
    for k in pairs(self._dirtyPens) do
        local skips = self._penRetrySkips and self._penRetrySkips[k]
        if type(skips) == "number" and skips > 0 then
            self._penRetrySkips[k] = skips - 1
        else
            local retryAt = self._penRetryAt and self._penRetryAt[k]
            if type(retryAt) ~= "number" or now >= retryAt then
                penKey = k
                break
            end
        end
    end
    if penKey == nil then return false end

    self._dirtyPens[penKey] = nil
    if self._penRetryAt then self._penRetryAt[penKey] = nil end
    self._dirtyPensCount = math.max(0, (self._dirtyPensCount or 0) - 1)
    local t0 = self:_diagNow()
    local wrote = self:_writePenDetail(penKey)
    if wrote ~= true and wrote ~= "queued" and wrote ~= "held" then
        self._dirtyPens[penKey] = 1
        self._dirtyPensCount = (self._dirtyPensCount or 0) + 1
    end
    if t0 and self:_diagEnabled() then
        local ms = (self:_diagNow() - t0) * 1000
        self:_diagTrace("penDetail %s ms=%.2f%s", tostring(penKey), ms, self:_diagMarkHitch(ms))
    end

    return next(self._dirtyPens) ~= nil
end

function FarmDashboardDataCollector:shutdown()
    local mirror = rawget(_G, "FarmDashboardExportMirror")
    if mirror and mirror.cancelJob then
        pcall(function() mirror:cancelJob() end)
    end
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
