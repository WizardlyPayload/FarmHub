-- FS25 FarmDashboard | Diagnostics.lua | v2.2.0
-- Gated by farmDashboard.settings#diagnostics (default false). Zero overhead when disabled.
-- Time source: getTimeSec() preferred, os.clock() fallback. If neither exists, all timers no-op.
--
-- Phase 8 — manual validation (four profiles): SP base game, SP + RealisticLivestock, dedicated base,
-- dedicated + RL. Pass when `[FarmDash][diag]` lines show acceptable median/p99 for update_total,
-- toJSON, jsonWriteStep, animals_rlInner (RL only). Do not use total frame time as the primary
-- pass/fail signal (other mods can spike the frame). Enable diagnostics, run a heavy save at target
-- scale, capture log.txt for 10+ minutes, compare medians to your SLO.

FarmDashDiagnostics = {}

local D = FarmDashDiagnostics

D.enabled = false
D.buckets = {}
D.lastDumpClockSec = 0
D.dumpIntervalSec = 60
--- Last mission-frame dt in ms (written by FarmDashboardDataCollector:update when dt > 0).
D.lastUpdateDtMs = nil

-- Plan v5 B10: even with diagnostics disabled (verbose logging off), the autotuner needs a
-- minimal histogram for `animals_collectStep`. Buckets in this set are always collected.
D.alwaysOnBuckets = { ["animals_collectStep"] = true }

local SAMPLE_RING_CAP = 200

local function nowSec()
    if type(getTimeSec) == "function" then
        local ok, v = pcall(getTimeSec)
        if ok and type(v) == "number" then return v end
    end
    if type(os) == "table" and type(os.clock) == "function" then
        return os.clock()
    end
    return nil
end

D.nowSec = nowSec

function D:setEnabled(flag)
    self.enabled = flag and true or false
    if not self.enabled then
        -- Plan v5 B10: preserve always-on buckets so the autotuner keeps a valid histogram
        -- when verbose diagnostics are turned off mid-session.
        local kept = {}
        for name in pairs(D.alwaysOnBuckets) do
            if self.buckets[name] then kept[name] = self.buckets[name] end
        end
        self.buckets = kept
    end
end

function D:isEnabled()
    return self.enabled
end

local function getBucket(name)
    local b = D.buckets[name]
    if not b then
        b = {
            count = 0,
            sumMs = 0,
            maxMs = 0,
            samples = {},
            sampleHead = 1,
            sampleCount = 0,
        }
        D.buckets[name] = b
    end
    return b
end

--- Returns a token used to stop the timer. Returns nil if no time source.
--- Always-on buckets (Plan v5 B10) are timed even when verbose diagnostics are disabled.
function D:start(name)
    if not self.enabled and not D.alwaysOnBuckets[name] then return nil end
    local t = nowSec()
    if t == nil then return nil end
    return { name = name, t = t }
end

--- Stops a previously-started timer. Safe with nil token.
function D:stop(token)
    if token == nil then return end
    if not self.enabled and not D.alwaysOnBuckets[token.name] then return end
    local t = nowSec()
    if t == nil then return end
    local elapsedMs = (t - token.t) * 1000
    if elapsedMs < 0 then elapsedMs = 0 end
    local b = getBucket(token.name)
    b.count = b.count + 1
    b.sumMs = b.sumMs + elapsedMs
    if elapsedMs > b.maxMs then b.maxMs = elapsedMs end
    b.samples[b.sampleHead] = elapsedMs
    b.sampleHead = b.sampleHead + 1
    if b.sampleHead > SAMPLE_RING_CAP then b.sampleHead = 1 end
    if b.sampleCount < SAMPLE_RING_CAP then b.sampleCount = b.sampleCount + 1 end
end

--- Tracks a counter (e.g. byte size, animal count) instead of time.
function D:counter(name, value)
    if not self.enabled then return end
    if type(value) ~= "number" then return end
    local b = getBucket(name)
    b.count = b.count + 1
    b.sumMs = b.sumMs + value
    if value > b.maxMs then b.maxMs = value end
end

local function percentile(samples, n, p)
    if n == 0 then return 0 end
    local sorted = {}
    for i = 1, n do sorted[i] = samples[i] end
    table.sort(sorted)
    local idx = math.ceil(n * p)
    if idx < 1 then idx = 1 end
    if idx > n then idx = n end
    return sorted[idx]
end

function D:bucketStats(name)
    local b = self.buckets[name]
    if not b or b.sampleCount == 0 then return nil end
    local n = b.sampleCount
    local median = percentile(b.samples, n, 0.5)
    local p99 = percentile(b.samples, n, 0.99)
    local avg = b.sumMs / b.count
    return {
        count = b.count,
        median = median,
        p99 = p99,
        max = b.maxMs,
        avg = avg,
    }
end

--- Plain snapshot for orchestrator stress heuristics (no engine cpuLoad in FS25 Lua).
--- sliceBudgetMs is optional; matches farmDashboard.settings#sliceBudgetMs when passed.
function D:getLoadInfo(sliceBudgetMs)
    local ac = self:bucketStats("animals_collectStep")
    return {
        cpuLoad = nil,
        animalsCollectMedianMs = ac and ac.median or nil,
        animalsCollectP99Ms = ac and ac.p99 or nil,
        sliceBudgetMs = sliceBudgetMs,
        lastUpdateDtMs = self.lastUpdateDtMs,
    }
end

--- Resets counters but keeps sample rings (for next interval).
function D:resetIntervalCounters()
    for _, b in pairs(self.buckets) do
        b.count = 0
        b.sumMs = 0
        b.maxMs = 0
        b.samples = {}
        b.sampleHead = 1
        b.sampleCount = 0
    end
end

--- Emits one summary line if dumpIntervalSec has elapsed since last dump. Caller passes contextual info.
--- Args optional: animalMode, totalAnimals, totalPens, cycleMs, lastFullAgeSec, jsonBytes.
function D:maybeDump(ctx)
    if not self.enabled then return end
    local t = nowSec()
    if t == nil then return end
    if self.lastDumpClockSec == 0 then
        self.lastDumpClockSec = t
        return
    end
    if (t - self.lastDumpClockSec) < self.dumpIntervalSec then return end
    self.lastDumpClockSec = t

    local upd = self:bucketStats("update_total")
    local toJ = self:bucketStats("toJSON")
    local jws = self:bucketStats("jsonWriteStep")
    local rlInner = self:bucketStats("animals_rlInner_perBatch")

    local parts = {}
    parts[#parts + 1] = "[FarmDash][diag]"
    if ctx and ctx.animalMode then
        parts[#parts + 1] = string.format("mode=%s", tostring(ctx.animalMode))
    end
    if upd then
        parts[#parts + 1] = string.format("median=%.2fms p99=%.2fms maxMs=%.2fms n=%d",
            upd.median, upd.p99, upd.max, upd.count)
    end
    if toJ then
        parts[#parts + 1] = string.format("toJSON=%.2fms", toJ.avg)
    end
    if jws then
        parts[#parts + 1] = string.format("jsonWrite=%.2fms", jws.avg)
    end
    if rlInner then
        parts[#parts + 1] = string.format("rlInner=%.2fms", rlInner.avg)
    end
    if ctx and ctx.jsonBytes then
        parts[#parts + 1] = string.format("bytes=%d", ctx.jsonBytes)
    end
    if ctx and ctx.totalAnimals then
        parts[#parts + 1] = string.format("animals=%d", ctx.totalAnimals)
    end
    if ctx and ctx.totalPens then
        parts[#parts + 1] = string.format("pens=%d", ctx.totalPens)
    end
    if ctx and ctx.cycleMs then
        parts[#parts + 1] = string.format("cycle=%ds", math.floor(ctx.cycleMs / 1000))
    end
    if ctx and ctx.lastFullAgeSec then
        parts[#parts + 1] = string.format("lastFullAge=%ds", math.floor(ctx.lastFullAgeSec))
    end

    local line = table.concat(parts, " ")
    if type(Logging) == "table" and type(Logging.info) == "function" then
        Logging.info(line)
    else
        print(line)
    end

    self:resetIntervalCounters()
end

function D:reset()
    self.buckets = {}
    self.lastDumpClockSec = 0
end
