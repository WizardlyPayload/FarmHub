-- FS25 FarmDashboard | FarmDashboardDataCollector.lua | v2.3.0 (Plan v5)
-- Inter-module staggering: one collector slot per collectionCycleMs / N (same as v2).
-- Intra-module: collectors are explicit state machines (no coroutines, no yield-across-pcall)
--   when farmDashboard.settings#useStateMachine_<name>=true (default true).
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
            Logging.info("[FarmDash] AnimalClusterUpdateEvent first-hit signature types=[%s]", table.concat(types, ","))
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
        end, function(e)
            return tostring(e) .. "\n" .. debug.traceback("", 2)
        end)
        if not ok then
            local D = rawget(_G, "FarmDashDiagnostics")
            local nowS = (D and D.nowSec and D.nowSec()) or 0
            if (nowS - (self_ref._rlEventErrLogAt or 0)) >= 60 then
                self_ref._rlEventErrLogAt = nowS
                Logging.warning("[FarmDash] AnimalClusterUpdateEvent handler error: %s", tostring(err))
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
        Logging.info("[FarmDash] subscribed to AnimalClusterUpdateEvent")
    else
        Logging.warning("[FarmDash] could not subscribe to AnimalClusterUpdateEvent: %s", tostring(subscribeErr))
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
                Logging.info("[FarmDash] _dirtyPens at cap %d; dropped oldest %s", DIRTY_PENS_HARD_CAP, tostring(oldestKey))
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
    local vehicles = _G.g_currentMission.vehicles
    if not vehicles and _G.g_currentMission.vehicleSystem then
        vehicles = _G.g_currentMission.vehicleSystem.vehicles
    end
    if vehicles then
        for _ in pairs(vehicles) do totalVehicles = totalVehicles + 1 end
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
        Logging.info("[FarmDash] adaptive cadence: animals=%d pens=%d vehicles=%d cycleMs=%d",
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
        Logging.info("[FarmDash] calibrated animalRowsPerSlice=%d (synthetic %d rows in %.2fms, target %.2fms)",
            cap, SAMPLES, elapsedMs, targetMs)
    else
        Logging.info("[FarmDash] calibration kept animalRowsPerSlice=%d (synthetic %d rows in %.2fms)",
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
    if rawget(_G, "VehicleDataCollector") then
        VehicleDataCollector._inc = nil
    end
    if rawget(_G, "FieldDataCollector") then
        FieldDataCollector._smState = nil
        FieldDataCollector._fdCo = nil
        FieldDataCollector._yieldEvery = nil
        FieldDataCollector._baleYieldStride = nil
        FieldDataCollector._yieldBaleCounter = nil
        FieldDataCollector._yieldFieldCounter = nil
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
        --- When true, FarmDash periodically logs median/p99 collectStep + serializer timings. Verification only.
        diagnostics         = false,
        --- Intra-module budgets (collectStep); see FieldDataCollector / VehicleDataCollector.
        fieldsPerFrame      = 1,
        baleEntitiesBudget  = 32,
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
        --- Plan v5 B1/B2/B3: per-collector kill switches for incremental collection ports.
        --- Default true (use the budgeted collector path); set false for legacy fallback behavior.
        useStateMachine_economy     = true,
        useStateMachine_fields      = true,
        useStateMachine_production  = true,
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
            self.config.useStateMachine_economy    = Utils.getNoNil(getXMLBool(xmlFile, "farmDashboard.settings#useStateMachine_economy"),    true)
            self.config.useStateMachine_fields     = Utils.getNoNil(getXMLBool(xmlFile, "farmDashboard.settings#useStateMachine_fields"),     true)
            self.config.useStateMachine_production = Utils.getNoNil(getXMLBool(xmlFile, "farmDashboard.settings#useStateMachine_production"), true)
            local erp = getXMLInt(xmlFile, "farmDashboard.settings#economyRowsPerSlice")
            if erp and erp > 0 then self.config.economyRowsPerSlice = erp end
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
        setXMLInt(xmlFile, "farmDashboard.settings#fieldsPerFrame", self.config.fieldsPerFrame)
        setXMLInt(xmlFile, "farmDashboard.settings#baleEntitiesBudget", self.config.baleEntitiesBudget)
        setXMLInt(xmlFile, "farmDashboard.settings#vehiclesPerFrame", self.config.vehiclesPerFrame)
        setXMLInt(xmlFile, "farmDashboard.settings#husbandryPlaceablesPerFrame", self.config.husbandryPlaceablesPerFrame)
        setXMLInt(xmlFile, "farmDashboard.settings#jsonTopLevelKeysPerFrame", self.config.jsonTopLevelKeysPerFrame)
        setXMLInt(xmlFile, "farmDashboard.settings#economyYieldStride", self.config.economyYieldStride)
        -- Plan v5 B1/B2/B3 + B10:
        setXMLBool(xmlFile, "farmDashboard.settings#useStateMachine_economy",    true)
        setXMLBool(xmlFile, "farmDashboard.settings#useStateMachine_fields",     true)
        setXMLBool(xmlFile, "farmDashboard.settings#useStateMachine_production", true)
        setXMLInt(xmlFile, "farmDashboard.settings#economyRowsPerSlice", self.config.economyRowsPerSlice)
        saveXMLFile(xmlFile)
        delete(xmlFile)
    end

    -- Keep staggered collection on a slow cadence by default: never faster than 60s per full pass.
    self.config.collectionCycleMs = math.max(60000, math.min(1800000, self.config.collectionCycleMs or 60000))
    self.config.fieldsPerFrame = math.max(1, math.min(12, self.config.fieldsPerFrame or 1))
    self.config.baleEntitiesBudget = math.max(4, math.min(128, self.config.baleEntitiesBudget or 32))
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
    FarmDashboard.UPDATE_INTERVAL = self.config.collectionCycleMs
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

    local D = rawget(_G, "FarmDashDiagnostics")
    local nowS = (D and D.nowSec and D.nowSec()) or 0
    self._postLoadSilenceUntil = nowS + POST_LOAD_SILENCE_SEC

    -- Re-bootstrap from disk so we know which pens were already covered last session.
    self:_bootstrapDetailLedgerFromDisk()
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

    local D = rawget(_G, "FarmDashDiagnostics")
    local nowS = (D and D.nowSec and D.nowSec()) or 0

    local mc = self.moduleCache
    local baleInv = nil
    if FieldDataCollector and FieldDataCollector.getLastBaleInventory then
        baleInv = FieldDataCollector.getLastBaleInventory()
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
        --- Physical bales by fill + placement (FieldDataCollector last collect).
        baleInventory = baleInv or { farmId = nil, onField = {}, offField = {} }
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
        local ok, err = xpcall(function() c:collectBegin() end, function(e)
            return tostring(e) .. "\n" .. debug.traceback("", 2)
        end)
        if not ok then
            Logging.warning("[FarmDash] collectBegin failed for %s: %s", tostring(name), tostring(err))
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

    -- Phase 5.2: at the end of each completed cycle, re-evaluate scale and adapt cadence.
    self:runAdaptiveProbeOnce()
    -- Re-verify animal mode in case mods changed during the session (e.g. RL hot-reload).
    if self._animalMode == "unknown" then
        self:detectAnimalModeOnce()
    end

    -- Phase 7: poll the App's requests.json once per cycle and rotate stale details.
    self:_pollRequestsFile()
    self:_rotateStaleDetailsByAge()

    -- Plan v5 B4: cleanup any leftover .tmp files from failed atomic renames.
    self:_sweepStaleTmpFiles()

    -- Plan v5 B10: always-on autotuner (verbose log only when diagnostics enabled).
    self:_runAutoTunerOnce()

    -- Plan v5 B8: prime the dirty set after the first cycle so the App gets a complete sync.
    if not self._primedAfterFirstCycle then
        self._primedAfterFirstCycle = true
        self:_primeDirtyPensFromOwnedHusbandries()
    end
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
        Logging.info("[FarmDash] bootstrapped %d detail ledger entries from disk", seeded)
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
        Logging.info("[FarmDash] primed _dirtyPens with %d owned husbandries (idScheme=%s)", primed, tostring(self._idScheme))
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
            Logging.info("[FarmDash][autotune] animalRowsPerSlice %d -> %d (median=%.2fms p99=%.2fms slice=%dms)",
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
        batchSize = self.config.fieldsPerFrame or 8,
        animalBatch = self.config.animalsPerFrame or 2,
        baleBudget = self.config.baleEntitiesBudget or 32,
        vehicleBatch = self.config.vehiclesPerFrame or 12,
        economyYieldStride = self.config.economyYieldStride or 55,
        productionChainsPerYield = self.config.productionChainsPerYield or 2,
        productionPlaceablesPerYield = self.config.productionPlaceablesPerYield or 10,
        --- Phase 2: row-count caps as primary safety net + opportunistic wall-clock budget.
        animalRowsPerSlice = arps,
        sliceBudgetMs = sliceMs,
    }

    local results = { xpcall(function() return c:collectStep(opts) end, function(e)
        return tostring(e) .. "\n" .. debug.traceback("", 2)
    end) }
    local ok = results[1]
    if not ok then
        Logging.warning("[FarmDash] collectStep failed for %s: %s", tostring(name), tostring(results[2]))
        self.moduleCache[name] = {}
        self:finishModuleSlice(name, order, true)
        return
    end
    local done, payload = results[2], results[3]

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
        self.slotAccumulator = self.slotAccumulator - slotMs
        self:consumeOneModuleSlot(order)
    end

    -- Phase 7: one cooperative detail write per frame after main work (does not block stagger).
    self:_maybeProcessDetailQueueTail()
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
    for i = job.idx, hi do
        local ok, err = pcall(function()
            self:accumulateHusbandryTotalsForPlaceable(job.list[i], job.totalsByFarm)
        end)
        if not ok then
            Logging.warning("[FarmDash] husbandryTotalsStep placeable: " .. tostring(err))
        end
    end
    job.idx = hi + 1
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
end

function FarmDashboardDataCollector:jsonWriteStep()
    local job = self._jsonWriteJob
    if not job then return true end

    local diag = rawget(_G, "FarmDashDiagnostics")
    local tok = (diag and diag:isEnabled()) and diag:start("jsonWriteStep") or nil

    local nk = #job.keys
    local basePer = math.max(1, self.config.jsonTopLevelKeysPerFrame or 1)
    -- Typical data.json has < 32 top-level keys. Flushing the whole object in one step avoids
    -- multi-frame stalls and reduces chances of a second beginDeferred clobbering the job.
    local per = basePer
    if nk <= 48 then
        per = math.max(basePer, nk - job.i + 1)
    else
        per = math.min(20, basePer)
    end
    local parts = job.parts
    for _ = 1, per do
        if job.i > nk then break end
        local k = job.keys[job.i]
        local v = job.data[k]
        parts[#parts + 1] = '  "'
        parts[#parts + 1] = _escapeJsonKey(tostring(k))
        parts[#parts + 1] = '": '

        local okJson, err = xpcall(function()
            self:_toJSONInto(parts, v, false, 1)
        end, function(e)
            return tostring(e) .. "\n" .. debug.traceback("", 2)
        end)
        if not okJson then
            Logging.error("[FarmDash] json chunk toJSON failed for key '%s': %s", tostring(k), tostring(err))
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
        self:_writeJsonStringToDisk(jsonString, savegameDir)
        self._jsonWriteJob = nil
        if diag and tok then diag:stop(tok) end
        -- Apply the latest queued snapshot (if another slice finished while we were serializing).
        -- Do not recurse into jsonWriteStep here: same-frame tail recursion could stack-deep if many
        -- snapshots queued; the next update() tick will run jsonWriteStep again immediately while
        -- _jsonWriteJob is set (still processed before stagger work returns early).
        if self._jsonWritePending then
            local p = self._jsonWritePending
            self._jsonWritePending = nil
            self:beginDeferredJsonWrite(p)
        end
        return true
    end

    if diag and tok then diag:stop(tok) end
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
        Logging.warning("[FarmDash] collectHusbandryTotals failed: " .. tostring(err))
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
        Logging.warning("[FarmDash] write failure: %s", tostring(msg))
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
        Logging.warning("[FarmDash] io.open unavailable; detail writes disabled this session")
        return false
    end
    local f, err = io.open(probe, "w")
    if not f then
        self._detailsDisabled = true
        Logging.warning("[FarmDash] details/ not writable (%s); detail writes disabled this session: %s",
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
    end, function(e)
        return tostring(e) .. "\n" .. debug.traceback("", 2)
    end)
    if not ok or not detail then
        Logging.warning("[FarmDash] pen detail collection failed for key=%s: %s", tostring(penKey), tostring(err))
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
            Logging.warning("[FarmDash] requests.json rejected (%s); quarantining", tostring(perr))
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
    self:_writePenDetail(penKey)

    return next(self._dirtyPens) ~= nil
end

function FarmDashboardDataCollector:shutdown()
    -- Plan v5 B7: clean unsubscribe from RL events.
    if self._rlSubscribed and _G.g_messageCenter then
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
    end

    -- Plan v5 B10: persist auto-tuned value once, here, instead of on every change.
    if self.config and self.config.animalRowsPerSlice and self.config.animalRowsPerSlice ~= self._autoTuneInitialRowsPerSlice then
        self:_persistAnimalRowsPerSlice(self.config.animalRowsPerSlice)
    end

    for name, collector in pairs(self.collectors) do
        if collector.shutdown then collector:shutdown() end
    end
    if rawget(_G, "FieldDataCollector") then
        FieldDataCollector._smState = nil
        FieldDataCollector._fdCo = nil
        FieldDataCollector._yieldEvery = nil
        FieldDataCollector._baleYieldStride = nil
        FieldDataCollector._yieldBaleCounter = nil
        FieldDataCollector._yieldFieldCounter = nil
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
