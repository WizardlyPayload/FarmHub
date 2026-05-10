-- FS25 FarmDashboard | AnimalDataCollector.lua | v2.3.0
-- Pure state-machine collector. NO coroutines. NO yields.
-- Phase 1: single-pass cluster walk; Phase 2: row-count caps + opportunistic wall-clock budget;
-- Phase 4: hard LOD with dual-mode (base sums numAnimals, RL buckets individual Animal instances).
-- The legacy fabricated-individuals fallback is removed: data.animals[i].animals is intentionally empty
-- in the LOD export. Per-pen detail rows live in details/animals_<id>.json (see Phase 7).

AnimalDataCollector = {}

local STAGE_INIT       = 0
local STAGE_PLACEABLES = 1
local STAGE_DONE       = 2

--- RL LOD: beyond this individual count per pen, walk a systematic subsample and scale aggregates.
local RL_SAMPLE_THRESHOLD = 50
local RL_SAMPLE_RATE      = 0.1

local function _subtypeMix(str)
    if type(str) ~= "string" or str == "" then return 0 end
    local h = 0
    for i = 1, math.min(#str, 48) do
        h = (h * 33 + string.byte(str, i)) % 4096
    end
    return h
end

--- Numeric bucket key for RL individuals (avoids per-animal string concat GC).
local function _packRlAnimalKey(a)
    local sti = math.floor(tonumber(a.subTypeIndex) or 0)
    if sti < 0 then sti = 0 end
    if sti > 65535 then sti = 65535 end
    local ageMonths = math.floor(a.age or 0)
    local ageDecile = math.floor(ageMonths / 12)
    if ageDecile > 255 then ageDecile = 255 end
    local male = (a.gender == "male") and 1 or 0
    local preg = a.isPregnant and 1 or 0
    local lac = a.isLactating and 1 or 0
    local mix = 0
    if sti == 0 then
        mix = _subtypeMix(tostring(a.subType or ""))
    end
    return sti * 1073741824 + ageDecile * 4194304 + male * 2097152 + preg * 1048576 + lac * 524288 + mix
end

--- Numeric bucket key for base-game cluster rows.
local function _packBaseClusterKey(c)
    local sti = math.floor(tonumber(c.subTypeIndex) or 0)
    if sti < 0 then sti = 0 end
    if sti > 65535 then sti = 65535 end
    local ageMonths = math.floor(c.age or 0)
    local ageDecile = math.floor(ageMonths / 12)
    if ageDecile > 255 then ageDecile = 255 end
    local male = (c.gender == "male") and 1 or 0
    local mix = 0
    if sti == 0 then
        mix = _subtypeMix(tostring(c.subType or c.fillType or ""))
    end
    return sti * 1073741824 + ageDecile * 4194304 + male * 2097152 + mix
end

local function _scaleRlSampledBuckets(st)
    local sc = st.rlScale or 1
    if sc <= 1 then return end
    local function ri(x)
        x = tonumber(x) or 0
        return math.floor(x * sc + 0.5)
    end
    for _, key in ipairs(st.bucketKeys) do
        local b = st.buckets[key]
        if b then
            b.count = ri(b.count)
            b.sumWeight = (b.sumWeight or 0) * sc
            b.sumHealth = (b.sumHealth or 0) * sc
            b.sumAgeMonths = (b.sumAgeMonths or 0) * sc
            b.sumGenFert = (b.sumGenFert or 0) * sc
            b.sumGenProd = (b.sumGenProd or 0) * sc
            b.sumGenHealth = (b.sumGenHealth or 0) * sc
            b.sumGenMetabolism = (b.sumGenMetabolism or 0) * sc
            b.sumGenQuality = (b.sumGenQuality or 0) * sc
            b.castratedCount = ri(b.castratedCount or 0)
            b.diseasedCount = ri(b.diseasedCount or 0)
            b.markedCount = ri(b.markedCount or 0)
        end
    end
end

--- Full pass over RL individuals (age only) to fix min/max after sampling distorted within-bucket extrema.
local function _patchRlAgeMinMaxFromFullScan(st)
    local sc = st.rlScale or 1
    if sc <= 1 then return end
    if not st.rlAnimals or not st.clusterKeys then return end
    local mmByKey = {}
    for _, kk in ipairs(st.clusterKeys) do
        local a = st.rlAnimals[kk]
        if a and a.subType then
            local kn = _packRlAnimalKey(a)
            local am = math.floor(a.age or 0)
            local e = mmByKey[kn]
            if not e then
                mmByKey[kn] = { min = am, max = am }
            else
                if am < e.min then e.min = am end
                if am > e.max then e.max = am end
            end
        end
    end
    for _, key in ipairs(st.bucketKeys) do
        local b = st.buckets[key]
        local mm = mmByKey[key]
        if b and mm then
            b.minAgeMonths = mm.min
            b.maxAgeMonths = mm.max
        end
    end
end

function AnimalDataCollector:init()
    self._iter = nil
end

local function diagToken(name)
    local D = rawget(_G, "FarmDashDiagnostics")
    if D and D:isEnabled() then return D, D:start(name) end
    return nil, nil
end

local function diagStop(D, tok)
    if D and tok then D:stop(tok) end
end

-- After `local function` (load order). Used only from `_walkRL` which is defined below.
local function _anyMarkActive(marks)
    if type(marks) ~= "table" then return false end
    for _, mark in pairs(marks) do
        if mark and (mark.active == true or mark == true) then return true end
    end
    return false
end

--- Cached per collectBegin(); keyed by uniqueId when present.
local function _anyMarkActiveCached(a)
    local marks = a and a.marks
    if type(marks) ~= "table" then return false end
    local uid = rawget(a, "uniqueId")
    local cache = AnimalDataCollector._markCache
    if uid ~= nil and cache then
        local hit = cache[uid]
        if hit ~= nil then return hit end
    end
    local v = _anyMarkActive(marks)
    if uid ~= nil and cache then
        cache[uid] = v
    end
    return v
end

--- Public hooks -------------------------------------------------------------

function AnimalDataCollector:collectBegin()
    AnimalDataCollector._markCache = {}
    self._iter = {
        stage = STAGE_INIT,
        list = {},
        idx = 1,
        out = {},
        penState = nil,
        rowsThisSlice = 0,
        sliceDeadline = nil,
        startedAt = nil,
    }
end

--- Returns done(boolean), payload(table-or-nil partial array of pen rows so far).
--- collectStep is called repeatedly by the orchestrator until done==true.
--- IMPORTANT: This function never yields. State lives in self._iter.
function AnimalDataCollector:collectStep(opts)
    if not self._iter then return true, {} end

    opts = opts or {}
    local maxRows = math.max(32, tonumber(opts.animalRowsPerSlice) or 256)
    local budgetMs = math.max(0, tonumber(opts.sliceBudgetMs) or 0)

    local D = rawget(_G, "FarmDashDiagnostics")
    -- Plan v5 B10: animals_collectStep is an always-on bucket; D:start handles the gate.
    local stepTok = D and D:start("animals_collectStep") or nil

    local it = self._iter
    it.rowsThisSlice = 0
    if budgetMs > 0 and D and D.nowSec then
        local t = D.nowSec()
        if t then it.sliceDeadline = t + (budgetMs / 1000) end
    else
        it.sliceDeadline = nil
    end

    if it.stage == STAGE_INIT then
        self:_buildPlaceableList(it)
        it.stage = STAGE_PLACEABLES
    end

    if it.stage == STAGE_PLACEABLES then
        self:_walkPlaceables(it, maxRows)
    end

    diagStop(D, stepTok)

    if it.stage == STAGE_DONE then
        local result = it.out
        self._iter = nil
        return true, result
    end
    return false, it.out
end

function AnimalDataCollector:collect()
    -- Synchronous fallback for legacy callers. Same single-pass walker, no caps.
    self:collectBegin()
    local guard = 0
    while self._iter and guard < 100000 do
        local done, _ = self:collectStep({ animalRowsPerSlice = 8192, sliceBudgetMs = 0 })
        guard = guard + 1
        if done then break end
    end
    return (self._iter == nil and self._lastSyncResult) or {}
end

function AnimalDataCollector:shutdown()
    self._iter = nil
end

--- Internals --------------------------------------------------------------

function AnimalDataCollector:_buildPlaceableList(it)
    if not _G.g_currentMission or not _G.g_currentMission.husbandrySystem then return end
    local placeables = _G.g_currentMission.husbandrySystem.placeables
    if not placeables then return end
    for _, placeable in pairs(placeables) do
        if placeable then
            it.list[#it.list + 1] = placeable
        end
    end
end

function AnimalDataCollector:_isOutOfBudget(it)
    if not it.sliceDeadline then return false end
    local D = rawget(_G, "FarmDashDiagnostics")
    if not D or not D.nowSec then return false end
    local t = D.nowSec()
    if not t then return false end
    return t >= it.sliceDeadline
end

function AnimalDataCollector:_walkPlaceables(it, maxRows)
    while it.idx <= #it.list do
        if it.rowsThisSlice >= maxRows then return end
        if self:_isOutOfBudget(it) then return end

        local placeable = it.list[it.idx]

        if it.penState == nil then
            it.penState = self:_beginPen(placeable)
        end

        if it.penState then
            local penDone = self:_continuePen(placeable, it.penState, maxRows - it.rowsThisSlice)
            it.rowsThisSlice = it.rowsThisSlice + (it.penState.rowsConsumedThisStep or 0)
            it.penState.rowsConsumedThisStep = 0
            if penDone then
                local row = self:_finalizePen(placeable, it.penState)
                if row then it.out[#it.out + 1] = row end
                it.penState = nil
                it.idx = it.idx + 1
            end
        else
            it.idx = it.idx + 1
        end
    end

    it.stage = STAGE_DONE
    self._lastSyncResult = it.out
end

--- Pen processing ---------------------------------------------------------

function AnimalDataCollector:_beginPen(placeable)
    if not placeable then return nil end

    local row = {
        id = placeable.id or 0,
        name = "Unknown",
        position = self:_getPosition(placeable),
        ownerFarmId = 0,
        animalType = placeable.animalTypeIndex or 0,
        animals = {},          -- intentionally empty: LOD aggregates only; details live elsewhere
        clusters = {},
        fillLevels = {},
        storageData = {},
        productivity = 0,
        health = 0,
        capacity = 0,
        animalCount = 0,
        lod = "agg",
    }

    local nameOk, nameVal = pcall(function() return placeable:getName() end)
    if nameOk and type(nameVal) == "string" and nameVal ~= "" then
        row.name = nameVal
    end

    local farmOk, farmId = pcall(function() return placeable:getOwnerFarmId() end)
    if farmOk and type(farmId) == "number" then
        row.ownerFarmId = farmId
    end

    if placeable.animalTypeIndex and _G.g_animalManager and _G.g_animalManager.nameToType then
        local at = _G.g_animalManager.nameToType[placeable.animalTypeIndex]
        if at and at.name then
            row.animalTypeName = at.name
        end
    end

    -- Fill levels (one consolidated read per pen)
    self:_collectFillLevels(placeable, row)

    -- Capacity / productivity / health (cheap getters; if any blow up, fall back to defaults)
    local capOk, cap = pcall(function() return placeable:getCapacity() end)
    if capOk and type(cap) == "number" then row.capacity = cap end

    local prodOk, prod = pcall(function() return placeable:getGlobalProductionFactor() end)
    if prodOk and type(prod) == "number" then row.productivity = prod end

    local condOk, cond = pcall(function() return placeable:getConditionInfos() end)
    if condOk and type(cond) == "table" and cond.health then
        local hv = cond.health.value or 0
        if hv <= 2 then hv = hv * 100 end
        row.health = hv
    end

    return {
        row = row,
        clusters = nil,
        clusterIdx = 1,
        animalIdx = 1,
        buckets = {},
        bucketKeys = {},
        animalsInPen = nil,
        mode = nil,
        rowsConsumedThisStep = 0,
    }
end

function AnimalDataCollector:_collectFillLevels(placeable, row)
    local fillLevels = {}

    if placeable.getFillLevels then
        local ok, levels = pcall(function() return placeable:getFillLevels() end)
        if ok and type(levels) == "table" then
            for k, v in pairs(levels) do fillLevels[k] = v end
        end
    end
    if placeable.spec_husbandryFood and placeable.spec_husbandryFood.fillLevels then
        for fillType, level in pairs(placeable.spec_husbandryFood.fillLevels) do
            fillLevels[fillType] = level
        end
    end
    if placeable.spec_husbandryWater and placeable.spec_husbandryWater.fillLevel then
        fillLevels["WATER"] = placeable.spec_husbandryWater.fillLevel
    end
    if placeable.spec_husbandryStraw and placeable.spec_husbandryStraw.fillLevel then
        fillLevels["STRAW"] = placeable.spec_husbandryStraw.fillLevel
    end

    if next(fillLevels) == nil then return end

    local availableFood = 0
    local edibleFoods = {
        WHEAT=1, BARLEY=1, OAT=1, CANOLA=1, SORGHUM=1, MAIZE=1, CORN=1,
        SUNFLOWER=1, SOYBEAN=1, POTATO=1, SUGARBEET=1, SUGARBEET_CUT=1,
        DRYGRASS_WINDROW=1, GRASS_WINDROW=1, SILAGE=1, HAY=1, STRAW=1,
        FORAGE=1, CHAFF=1, WOODCHIPS=1,
        PIGFOOD=1, MINERAL_FEED=1, TOTAL_MIXED_RATION=1, FORAGE_MIXING=1,
    }

    for fillType, fillLevel in pairs(fillLevels) do
        if fillType and fillLevel and type(fillLevel) == "number" and fillLevel > 0 then
            local fillTypeName = fillType
            if type(fillType) == "number" and _G.g_fillTypeManager then
                local ft = _G.g_fillTypeManager:getFillTypeByIndex(fillType)
                if ft and ft.name then fillTypeName = ft.name end
            end
            row.fillLevels[fillTypeName] = fillLevel
            row.storageData[fillTypeName] = fillLevel
            if edibleFoods[string.upper(tostring(fillTypeName))] then
                availableFood = availableFood + fillLevel
            end
        end
    end

    if availableFood > 0 then
        row.fillLevels["Available Food"] = availableFood
        row.storageData["Available Food"] = availableFood
        row.storageData["availableFood"] = availableFood
    end
end

--- Continue cluster walk for one pen across multiple slices.
--- @return boolean done (true when all clusters in this pen are processed)
function AnimalDataCollector:_continuePen(placeable, st, remainingRows)
    if not st.clusters then
        local ok, clusters = pcall(function() return placeable:getClusters() end)
        st.clusters = (ok and type(clusters) == "table") and clusters or {}
    end

    local clusters = st.clusters

    if st.mode == nil then
        for _, c in pairs(clusters) do
            if c then
                st.mode = (c.isIndividual == true) and "rl" or "base"
                break
            end
        end
        if st.mode == nil then return true end
    end

    local rowsLeft = remainingRows
    if rowsLeft <= 0 then return false end

    if st.mode == "base" then
        return self:_walkBase(clusters, st, rowsLeft)
    else
        return self:_walkRL(clusters, st, rowsLeft)
    end
end

--- Base game: each cluster has numAnimals; aggregate per (subType, age, gender) bucket.
function AnimalDataCollector:_walkBase(clusters, st, rowsLeft)
    -- pairs() order is non-deterministic; use sequential keys collected once.
    if not st.clusterKeys then
        st.clusterKeys = {}
        for k in pairs(clusters) do
            st.clusterKeys[#st.clusterKeys + 1] = k
        end
        st.clusterIdx = 1
    end

    local keys = st.clusterKeys
    local n = #keys
    local processed = 0

    while st.clusterIdx <= n and processed < rowsLeft do
        local c = clusters[keys[st.clusterIdx]]
        if c and type(c.numAnimals) == "number" and c.numAnimals > 0 then
            local subType = tostring(c.subType or c.fillType or "UNKNOWN")
            local subTypeIndex = c.subTypeIndex or 0
            local ageMonths = math.floor(c.age or 0)
            local ageDecile = math.floor(ageMonths / 12)
            local gender = (c.gender == "male") and "male" or "female"
            local key = _packBaseClusterKey(c)
            local b = st.buckets[key]
            if not b then
                b = {
                    subType = subType,
                    subTypeIndex = subTypeIndex,
                    ageDecile = ageDecile,
                    ageMonths = ageMonths,
                    gender = gender,
                    isPregnant = c.isPregnant == true,
                    isLactating = c.isLactating == true,
                    count = 0,
                    sumWeight = 0,
                    sumHealth = 0,
                }
                st.buckets[key] = b
                st.bucketKeys[#st.bucketKeys + 1] = key
            end
            local n2 = c.numAnimals
            b.count = b.count + n2
            b.sumWeight = b.sumWeight + (c.weight or 0) * n2
            local h = c.health
            if type(h) == "number" then
                if h <= 2 then h = h * 100 end
                b.sumHealth = b.sumHealth + h * n2
            end
        end
        st.clusterIdx = st.clusterIdx + 1
        processed = processed + 1
    end

    st.rowsConsumedThisStep = (st.rowsConsumedThisStep or 0) + processed
    return st.clusterIdx > n
end

--- RealisticLivestock: each cluster IS an individual animal; bucket by (subType, ageDecile, gender, pregnant, lactating).
--- isCastrated and hasDisease are tracked as counts inside each bucket, never in the key.
--- Large herds: systematic sampling + scale (see RL_SAMPLE_*); marks cached by uniqueId per slice.
function AnimalDataCollector:_walkRL(animals, st, rowsLeft)
    if not st.clusterKeys then
        st.clusterKeys = {}
        for k in pairs(animals) do
            st.clusterKeys[#st.clusterKeys + 1] = k
        end
        st.clusterIdx = 1
        st.rlAnimals = animals
        local nTotal = #st.clusterKeys
        st.rlStride = 1
        st.rlScale = 1
        if nTotal >= RL_SAMPLE_THRESHOLD then
            st.rlStride = math.max(2, math.ceil(1.0 / RL_SAMPLE_RATE))
            st.rlScale = st.rlStride
        end
    end

    local D = rawget(_G, "FarmDashDiagnostics")
    local innerTok = (D and D:isEnabled()) and D:start("animals_rlInner_perBatch") or nil

    local keys = st.clusterKeys
    local n = #keys
    local stride = st.rlStride or 1
    local heavyProcessed = 0

    while st.clusterIdx <= n do
        if heavyProcessed >= rowsLeft then break end

        local idx = st.clusterIdx
        local a = animals[keys[idx]]
        local doHeavy = (stride <= 1) or (((idx - 1) % stride) == 0)

        if a and a.subType and doHeavy then
            local ageMonths = math.floor(a.age or 0)
            local ageDecile = math.floor(ageMonths / 12)
            local gender = (a.gender == "male") and "male" or "female"
            local key = _packRlAnimalKey(a)

            local b = st.buckets[key]
            if not b then
                b = {
                    subType = tostring(a.subType),
                    subTypeIndex = a.subTypeIndex or 0,
                    ageDecile = ageDecile,
                    ageMonths = ageMonths,
                    gender = gender,
                    isPregnant = a.isPregnant == true,
                    isLactating = a.isLactating == true,
                    count = 0,
                    sumWeight = 0,
                    sumHealth = 0,
                    sumGenFert = 0,
                    sumGenProd = 0,
                    sumGenHealth = 0,
                    sumGenMetabolism = 0,
                    sumGenQuality = 0,
                    castratedCount = 0,
                    diseasedCount = 0,
                    markedCount = 0,
                    sumAgeMonths = 0,
                    minAgeMonths = ageMonths,
                    maxAgeMonths = ageMonths,
                }
                st.buckets[key] = b
                st.bucketKeys[#st.bucketKeys + 1] = key
            end
            b.count = b.count + 1
            b.sumWeight = b.sumWeight + (a.weight or 0)
            local h = a.health
            if type(h) == "number" then
                if h <= 2 then h = h * 100 end
                b.sumHealth = b.sumHealth + h
            end
            b.sumAgeMonths = b.sumAgeMonths + ageMonths
            if ageMonths < b.minAgeMonths then b.minAgeMonths = ageMonths end
            if ageMonths > b.maxAgeMonths then b.maxAgeMonths = ageMonths end
            local g = a.genetics
            if type(g) == "table" then
                b.sumGenFert       = b.sumGenFert       + (g.fertility       or 0)
                b.sumGenProd       = b.sumGenProd       + (g.productivity    or 0)
                b.sumGenHealth     = b.sumGenHealth     + (g.health          or 0)
                b.sumGenMetabolism = b.sumGenMetabolism + (g.metabolism      or 0)
                b.sumGenQuality    = b.sumGenQuality    + (g.quality         or 0)
            end
            if a.isCastrated then b.castratedCount = b.castratedCount + 1 end
            if type(a.diseases) == "table" and #a.diseases > 0 then
                b.diseasedCount = b.diseasedCount + 1
            end
            if type(a.marks) == "table" and _anyMarkActiveCached(a) then
                b.markedCount = b.markedCount + 1
            end
            heavyProcessed = heavyProcessed + 1
        end
        st.clusterIdx = idx + 1
    end

    diagStop(D, innerTok)
    st.rowsConsumedThisStep = (st.rowsConsumedThisStep or 0) + heavyProcessed
    return st.clusterIdx > n
end

--- Build the final per-pen JSON row from accumulated buckets.
function AnimalDataCollector:_finalizePen(placeable, st)
    local row = st.row
    if not row then return nil end

    if (st.rlScale or 1) > 1 then
        _scaleRlSampledBuckets(st)
        _patchRlAgeMinMaxFromFullScan(st)
    end

    local clustersOut = {}
    local totalCount = 0
    local subTypeCounts = {}

    for _, key in ipairs(st.bucketKeys) do
        local b = st.buckets[key]
        if b and b.count > 0 then
            local entry = {
                subType       = b.subType,
                subTypeIndex  = b.subTypeIndex,
                ageDecile     = b.ageDecile,
                ageMonths     = b.ageMonths,
                gender        = b.gender,
                isPregnant    = b.isPregnant,
                isLactating   = b.isLactating,
                count         = b.count,
                avgWeight     = (b.count > 0) and (b.sumWeight / b.count) or 0,
                avgHealth     = (b.count > 0) and (b.sumHealth / b.count) or 0,
            }
            if b.sumGenFert ~= nil then
                entry.avgGenFert       = (b.count > 0) and (b.sumGenFert       / b.count) or 0
                entry.avgGenProd       = (b.count > 0) and (b.sumGenProd       / b.count) or 0
                entry.avgGenHealth     = (b.count > 0) and (b.sumGenHealth     / b.count) or 0
                entry.avgGenMetabolism = (b.count > 0) and (b.sumGenMetabolism / b.count) or 0
                entry.avgGenQuality    = (b.count > 0) and (b.sumGenQuality    / b.count) or 0
                entry.castratedCount   = b.castratedCount or 0
                entry.diseasedCount    = b.diseasedCount or 0
                entry.markedCount      = b.markedCount or 0
                entry.minAgeMonths     = b.minAgeMonths or 0
                entry.maxAgeMonths     = b.maxAgeMonths or 0
                entry.avgAgeMonths     = (b.count > 0) and (b.sumAgeMonths / b.count) or 0
            end
            clustersOut[#clustersOut + 1] = entry
            totalCount = totalCount + b.count
            subTypeCounts[b.subType] = (subTypeCounts[b.subType] or 0) + b.count
        end
    end

    table.sort(clustersOut, function(a, c)
        if a.subType ~= c.subType then return a.subType < c.subType end
        if a.ageDecile ~= c.ageDecile then return a.ageDecile < c.ageDecile end
        return a.gender < c.gender
    end)

    row.clusters = clustersOut
    row.subTypeCounts = subTypeCounts
    row.animalCount = totalCount
    row.lod = "agg"

    -- Try max capacity (separate from getCapacity which can return per-fill values).
    local mxOk, maxN = pcall(function()
        if placeable.getMaxNumOfAnimals then return placeable:getMaxNumOfAnimals(nil) end
        return nil
    end)
    if mxOk and type(maxN) == "number" then
        row.maxAnimals = maxN
    end

    -- Try base getNumOfAnimals as a sanity cross-check (may differ from sum on RL during sync).
    local nOk, numA = pcall(function()
        if placeable.getNumOfAnimals then return placeable:getNumOfAnimals() end
        return nil
    end)
    if nOk and type(numA) == "number" then
        row.numOfAnimalsReported = numA
    end

    return row
end

function AnimalDataCollector:_getPosition(placeable)
    if placeable and placeable.rootNode then
        local ok, x, y, z = pcall(getWorldTranslation, placeable.rootNode)
        if ok and x and y and z then
            return { x = x, y = y, z = z }
        end
    end
    return { x = 0, y = 0, z = 0 }
end

--- Detail collection (Phase 7) -------------------------------------------
--- Builds full per-animal row list for one pen, used by per-pen detail file.
--- Caller is expected to handle file writing and rotation.

function AnimalDataCollector:collectPenDetail(placeable)
    if not placeable then return nil end

    local out = {
        id = placeable.id or 0,
        animals = {},
    }

    local nameOk, nameVal = pcall(function() return placeable:getName() end)
    if nameOk and type(nameVal) == "string" then out.name = nameVal end

    local farmOk, farmId = pcall(function() return placeable:getOwnerFarmId() end)
    if farmOk and type(farmId) == "number" then out.ownerFarmId = farmId end

    local clOk, clusters = pcall(function() return placeable:getClusters() end)
    if not clOk or type(clusters) ~= "table" then return out end

    local nextId = 1
    for _, c in pairs(clusters) do
        if c then
            if c.isIndividual == true then
                local finalId
                if c.uniqueId then
                    if type(c.uniqueId) == "string" and tonumber(c.uniqueId) then
                        finalId = tonumber(c.uniqueId)
                    elseif type(c.uniqueId) == "number" then
                        finalId = c.uniqueId
                    else
                        finalId = tostring(c.uniqueId)
                    end
                end
                if finalId == nil then
                    finalId = (out.id or 0) * 1000000 + nextId
                    nextId = nextId + 1
                end

                local healthValue = c.health or 1
                if type(healthValue) == "number" and healthValue <= 2 then
                    healthValue = healthValue * 100
                end

                local entry = {
                    id          = finalId,
                    uniqueId    = c.uniqueId,
                    name        = c.subType or "Unknown",
                    subType     = c.subType,
                    subTypeIndex = c.subTypeIndex,
                    age         = c.age or 0,
                    productivity = (c.reproduction and (c.reproduction / 100)) or 0,
                    health      = healthValue,
                    gender      = c.gender or "Unknown",
                    weight      = c.weight or 0,
                    type        = c.subType or "Unknown",
                    isPregnant  = c.isPregnant or false,
                    isLactating = c.isLactating or false,
                    isDirty     = c.isDirty or false,
                    fitness     = c.fitness or 0,
                    dirt        = c.dirt or 0,
                    variation   = c.variation or 1,
                    isCastrated = c.isCastrated or false,
                    motherId    = c.motherId,
                    fatherId    = c.fatherId,
                    birthday    = c.birthday,
                    breed       = c.breed,
                }
                local g = c.genetics
                if type(g) == "table" then
                    entry.genetics = {
                        fertility    = g.fertility,
                        productivity = g.productivity,
                        health       = g.health,
                        metabolism   = g.metabolism,
                        quality      = g.quality,
                    }
                end
                if type(c.diseases) == "table" then
                    entry.diseaseCount = #c.diseases
                end
                out.animals[#out.animals + 1] = entry
            else
                local n = (type(c.numAnimals) == "number") and c.numAnimals or 0
                if n > 0 then
                    out.animals[#out.animals + 1] = {
                        id          = (out.id or 0) * 1000 + nextId,
                        name        = tostring(c.subType or c.fillType or "Cluster"),
                        subType     = c.subType,
                        subTypeIndex = c.subTypeIndex,
                        age         = c.age or 0,
                        weight      = c.weight or 0,
                        gender      = c.gender or "Unknown",
                        type        = "cluster",
                        count       = n,
                        isPregnant  = c.isPregnant or false,
                        isLactating = c.isLactating or false,
                    }
                    nextId = nextId + 1
                end
            end
        end
    end

    return out
end
