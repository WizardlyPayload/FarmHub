-- FS25 FarmDashboard | FieldDataCollector.lua | v2.1.0

FieldDataCollector = {}

--- Serialized as JSON `null` (see `FarmDashboardDataCollector:toJSON` string handling).
local FD_JSON_NULL_STR = "__FD_JSON_NULL__"

--- Module-local keyed pools (integer/string keys only). Cleared at reuse â€” reduces GC churn on large saves.
local _pool_farmlandBaleCounts = {}
local _pool_farmlandBaleOnFieldBuckets = {}
local _pool_farmlandBaleYardBuckets = {}
local _pool_baleSeen = {}
local _pool_fillIdxSeen = {}
local _pool_windByIdx = {}
local _pool_moistureByFarm = {}

local MOISTURE_WORST_MAX = 24

local function _newMoistureFarmRow()
    return {
        gradeCounts = { A = 0, B = 0, C = 0, D = 0 },
        rottingCount = 0,
        gettingWetCount = 0,
        worst = {},
        _worstCount = 0,
    }
end

local function _moistureRotLabel(statusNum)
    local brs = rawget(_G, "BaleRottingSystem")
    if not brs or not brs.BALE_STATUS or statusNum == nil then return nil end
    local s = tonumber(statusNum)
    if s == brs.BALE_STATUS.GETTING_WET then return "gettingWet" end
    if s == brs.BALE_STATUS.DRYING then return "drying" end
    if s == brs.BALE_STATUS.ROTTING_SLOWLY then return "rottingSlowly" end
    if s == brs.BALE_STATUS.ROTTING then return "rotting" end
    if s == brs.BALE_STATUS.ROTTING_QUICKLY then return "rottingQuickly" end
    return nil
end

local function _moistureRotSeverity(rotLabel)
    if rotLabel == "rottingQuickly" then return 5 end
    if rotLabel == "rotting" then return 4 end
    if rotLabel == "rottingSlowly" then return 3 end
    if rotLabel == "gettingWet" then return 2 end
    if rotLabel == "drying" then return 1 end
    return 0
end

local function _fillTypeNameForIndex(fillTypeIndex)
    if rawget(_G, "FillTypeUtils") and FillTypeUtils.nameForIndex then
        return FillTypeUtils.nameForIndex(fillTypeIndex)
    end
    if fillTypeIndex == nil then return "unknown" end
    return tostring(fillTypeIndex)
end

local function _attachFieldMoisture(fData, cx, cz)
    if not fData or not cx or not cz then return end
    local ms = _G.g_currentMission and _G.g_currentMission.MoistureSystem
    if not ms or not ms.getMoistureAtPosition then return end
    local ok, mFrac = pcall(function() return ms:getMoistureAtPosition(cx, cz) end)
    if not ok or mFrac == nil then return end
    local pct = math.floor((tonumber(mFrac) or 0) * 1000 + 0.5) / 10
    local block = { enabled = true, percent = pct }
    local fi = tonumber(fData.fruitTypeIndex) or 0
    if fi > 0 and _G.CropValueMap and _G.CropValueMap.getGrade then
        local okG, grade = pcall(function() return _G.CropValueMap.getGrade(fi, tonumber(mFrac) or 0) end)
        if okG and grade and FillTypeUtils.moistureGradeLetter then
            block.grade = FillTypeUtils.moistureGradeLetter(grade)
        elseif okG and grade then
            block.grade = grade
        end
    end
    fData.moisture = block
end

local function _recordBaleMoisture(moistureByFarm, baleItem, ownerFarmId)
    local ms = _G.g_currentMission and _G.g_currentMission.MoistureSystem
    if not ms or not baleItem or not ownerFarmId or ownerFarmId <= 0 then return end
    local fid = tostring(ownerFarmId)
    if not moistureByFarm[fid] then moistureByFarm[fid] = _newMoistureFarmRow() end
    local row = moistureByFarm[fid]

    local uid = rawget(baleItem, "uniqueId")
    local fillTypeIndex = rawget(baleItem, "fillType")
    if fillTypeIndex == nil and baleItem.getFillType then
        local ok, ft = pcall(function() return baleItem:getFillType() end)
        if ok then fillTypeIndex = ft end
    end

    local moistureFrac = nil
    if uid and fillTypeIndex and ms.getObjectMoisture then
        local ok, m = pcall(function() return ms:getObjectMoisture(uid, fillTypeIndex) end)
        if ok and m ~= nil then moistureFrac = tonumber(m) end
    end

    local grade = nil
    if moistureFrac ~= nil and _G.CropValueMap and _G.CropValueMap.getGrade then
        local okG, g = pcall(function() return _G.CropValueMap.getGrade(fillTypeIndex, moistureFrac) end)
        if okG and g and FillTypeUtils.moistureGradeLetter then
            grade = FillTypeUtils.moistureGradeLetter(g)
        elseif okG and g then
            grade = g
        end
    end
    if grade and row.gradeCounts[grade] ~= nil then
        row.gradeCounts[grade] = row.gradeCounts[grade] + 1
    end

    local rotLabel = nil
    local brs = _G.g_currentMission and _G.g_currentMission.baleRottingSystem
    if uid and brs and brs.baleRainExposureTimes then
        local entry = brs.baleRainExposureTimes[uid]
        if entry and entry.status then
            rotLabel = _moistureRotLabel(entry.status)
        end
    end
    if rotLabel == "gettingWet" then
        row.gettingWetCount = row.gettingWetCount + 1
    elseif rotLabel == "rottingSlowly" or rotLabel == "rotting" or rotLabel == "rottingQuickly" then
        row.rottingCount = row.rottingCount + 1
    end

    if row._worstCount < MOISTURE_WORST_MAX and (moistureFrac ~= nil or rotLabel) then
        row._worstCount = row._worstCount + 1
        table.insert(row.worst, {
            fillType = _fillTypeNameForIndex(fillTypeIndex),
            moisturePct = moistureFrac ~= nil and math.floor(moistureFrac * 1000 + 0.5) / 10 or nil,
            grade = grade,
            rotStatus = rotLabel,
            severity = _moistureRotSeverity(rotLabel),
        })
    end
end

local function _clearKeyedPool(t)
    for k in pairs(t) do
        t[k] = nil
    end
end

--- Cached `g_fillTypeManager:getFillTypeIndexByName` for STRAW / GRASS_WINDROW / DRYGRASS_WINDROW (refreshed in collect when mission is up).
FieldDataCollector._windrowFillIdxCache = nil

function FieldDataCollector:cacheWindrowFillTypeIndices()
    local ftm = rawget(_G, "g_fillTypeManager")
    if not ftm or type(ftm.getFillTypeIndexByName) ~= "function" then
        return nil
    end
    if FieldDataCollector._windrowFillIdxCache ~= nil then
        return FieldDataCollector._windrowFillIdxCache
    end
    local c = { STRAW = nil, GRASS_WINDROW = nil, DRYGRASS_WINDROW = nil }
    for _, nm in ipairs({ "STRAW", "GRASS_WINDROW", "DRYGRASS_WINDROW" }) do
        local ok, idx = pcall(function()
            return ftm:getFillTypeIndexByName(nm)
        end)
        if ok and type(idx) == "number" and idx > 0 then
            c[nm] = idx
        end
    end
    FieldDataCollector._windrowFillIdxCache = c
    return c
end

--- Gameplay toggles from the **active save** (`careerSavegame.xml` â†’ `settings.*`) â€” same file on dedi as on client.
--- Install-dir XML is only defaults for new careers; runtime truth is this save + `g_gameSettings` when exposed.
FieldDataCollector._lastGameplayFlags = nil

local function farmDashJoinSavePath(dir, filename)
    if type(dir) ~= "string" or dir == "" then return nil end
    dir = string.gsub(dir, "\\", "/")
    local last = string.sub(dir, -1)
    if last ~= "/" then dir = dir .. "/" end
    return dir .. filename
end

local function farmDashReadBoolFromCareerXml(fh, elemName, defaultTrue)
    local key = "careerSavegame.settings." .. elemName
    local s = getXMLString(fh, key)
    if s == "true" then return true end
    if s == "false" then return false end
    if type(hasXMLProperty) == "function" then
        local ok, exists = pcall(hasXMLProperty, fh, key)
        if ok and exists then
            local b = getXMLBool(fh, key, defaultTrue)
            if type(b) == "boolean" then return b end
        end
    end
    return defaultTrue
end

function FieldDataCollector.readCareerGameplayFlags()
    local out = {
        plowingRequired = true,
        limeRequired    = true,
        weedsEnabled    = true,
        stonesEnabled   = true,
    }

    local m = rawget(_G, "g_currentMission")
    local xmlPath = m and farmDashJoinSavePath(m.missionInfo and m.missionInfo.savegameDirectory, "careerSavegame.xml")
    if xmlPath then
        local okLoad, fh = pcall(loadXMLFile, "FarmDashCareerGameplay", xmlPath)
        if okLoad and fh and fh ~= 0 then
            out.plowingRequired = farmDashReadBoolFromCareerXml(fh, "plowingRequiredEnabled", true)
            out.limeRequired    = farmDashReadBoolFromCareerXml(fh, "limeRequired", true)
            out.weedsEnabled    = farmDashReadBoolFromCareerXml(fh, "weedsEnabled", true)
            out.stonesEnabled   = farmDashReadBoolFromCareerXml(fh, "stonesEnabled", true)
            pcall(delete, fh)
        end
    end

    --- Prefer in-memory mission / game settings over disk (XML updates on save; menu toggles are immediate).
    if m and m.plowingRequiredEnabled ~= nil then
        out.plowingRequired = m.plowingRequiredEnabled == true
    end

    local ggs = rawget(_G, "g_gameSettings")
    local GS = rawget(_G, "GameSettings")
    if ggs and type(ggs.getValue) == "function" and GS and GS.SETTING then
        for _, name in ipairs({ "PLOWING_REQUIRED", "PERIODIC_PLOWING", "PLOWING" }) do
            local sid = GS.SETTING[name]
            if sid ~= nil then
                local ok, v = pcall(function() return ggs:getValue(sid) end)
                if ok and type(v) == "boolean" then
                    out.plowingRequired = v
                    break
                end
            end
        end
    end

    FieldDataCollector._lastGameplayFlags = out
    return out
end

function FieldDataCollector.getCachedGameplayFlags()
    return FieldDataCollector._lastGameplayFlags or FieldDataCollector.readCareerGameplayFlags()
end

--- Dominant tipped windrow class for JSON `windrowType` (Straw / Grass / Hay), or FD_JSON_NULL_STR â†’ JSON null.
local function classifyWindrowTypeForJson(strawL, grassL, hayL, totalL)
    local EPS = 0.01
    totalL = tonumber(totalL) or 0
    if totalL <= EPS then
        return FD_JSON_NULL_STR
    end
    local s = math.max(0, tonumber(strawL) or 0)
    local g = math.max(0, tonumber(grassL) or 0)
    local h = math.max(0, tonumber(hayL) or 0)
    local m = math.max(s, g, h)
    if m <= EPS then
        return FD_JSON_NULL_STR
    end
    if s >= g and s >= h then
        return "Straw"
    elseif g >= h then
        return "Grass"
    else
        return "Hay"
    end
end

function FieldDataCollector:init()
    FieldDataCollector._windrowFillIdxCache = nil
    FieldDataCollector._fdCo = nil
    FieldDataCollector._lastGameplayFlags = nil
end

--- Bale economy inventory moved to BaleInventoryCollector + InventoryScan (TSStockCheck pipeline).
function FieldDataCollector.getLastBaleInventory()
    if BaleInventoryCollector and BaleInventoryCollector.getLastBaleInventory then
        return BaleInventoryCollector.getLastBaleInventory()
    end
    return nil
end

FieldDataCollector._baleFieldRollup = nil

--- Yard bale buckets from the field scan (merged into baleInventory.inStorage at assemble).
--- On-field totals come from BaleInventoryCollector; per-field breakdown stays on fields[].
function FieldDataCollector.getBaleFieldRollup()
    return FieldDataCollector._baleFieldRollup
end

local function _mergeBaleBucketInto(dst, src)
    if type(dst) ~= "table" or type(src) ~= "table" then return dst end
    for _, cat in ipairs({ "straw", "grass", "hay", "silage", "other" }) do
        dst[cat] = (tonumber(dst[cat]) or 0) + (tonumber(src[cat]) or 0)
    end
    dst.byFillType = dst.byFillType or {}
    for label, count in pairs(src.byFillType or {}) do
        local n = tonumber(count) or 0
        if n > 0 then
            dst.byFillType[tostring(label)] = (tonumber(dst.byFillType[tostring(label)]) or 0) + n
        end
    end
    return dst
end

local function _finalizeBaleFieldRollup(onFieldByParcel, yardByParcel, getFarmIdForParcel, legacyFarmId)
    local byFarm = {}
    local function farmRow(fid)
        local key = tostring(fid)
        if not byFarm[key] then
            local factory = rawget(_G, "FillTypeUtils") and FillTypeUtils.newBaleBucket
            local empty = factory and factory() or { straw = 0, grass = 0, hay = 0, silage = 0, other = 0, byFillType = {} }
            byFarm[key] = { farmId = fid, onField = factory and factory() or { straw = 0, grass = 0, hay = 0, silage = 0, other = 0, byFillType = {} }, inStorage = factory and factory() or { straw = 0, grass = 0, hay = 0, silage = 0, other = 0, byFillType = {} } }
        end
        return byFarm[key]
    end
    for parcelId, bucket in pairs(yardByParcel or {}) do
        local farmId = getFarmIdForParcel(parcelId)
        if farmId then
            _mergeBaleBucketInto(farmRow(farmId).inStorage, bucket)
        end
    end
    --- Do not merge onFieldByParcel here — same bales are counted by BaleInventoryCollector.
    for _, row in pairs(byFarm) do
        row.offField = row.inStorage
    end
    FieldDataCollector._baleFieldRollup = {
        farmId = legacyFarmId or 0,
        byFarm = byFarm,
        onField = byFarm[tostring(legacyFarmId or 1)] and byFarm[tostring(legacyFarmId or 1)].onField or {},
        inStorage = byFarm[tostring(legacyFarmId or 1)] and byFarm[tostring(legacyFarmId or 1)].inStorage or {},
        offField = byFarm[tostring(legacyFarmId or 1)] and byFarm[tostring(legacyFarmId or 1)].inStorage or {},
    }
end

local function _attachWindrowMoisture(fData, cx, cz, grassIdx, hayIdx, aggG, aggH)
    local mission = _G.g_currentMission
    local gpt = mission and mission.groundPropertyTracker
    if not gpt or type(gpt.getPilePropertiesAtPosition) ~= "function" then return end
    if (tonumber(aggG) or 0) <= 0 and (tonumber(aggH) or 0) <= 0 then return end

    local DRY_THRESH = 0.07
    local moistFrac = nil
    local function probeAt(idx)
        if not idx or idx <= 0 then return nil end
        local ok, props = pcall(function() return gpt:getPilePropertiesAtPosition(cx, cz, idx) end)
        if ok and props and props.moisture ~= nil then return tonumber(props.moisture) end
        return nil
    end

    if (tonumber(aggG) or 0) >= (tonumber(aggH) or 0) then
        moistFrac = probeAt(grassIdx) or probeAt(hayIdx)
    else
        moistFrac = probeAt(hayIdx) or probeAt(grassIdx)
    end
    if moistFrac == nil then return end

    local pct = math.floor(moistFrac * 1000 + 0.5) / 10
    local isHayState = moistFrac <= DRY_THRESH or fData.hasLooseHayWindrow == true
    fData.windrowMoisture = {
        enabled = true,
        percent = pct,
        dryThresholdPct = 7,
        isHay = isHayState,
    }
    if moistFrac <= DRY_THRESH and (tonumber(aggG) or 0) > 0 and fData.windrowType ~= FD_JSON_NULL_STR then
        fData.windrowType = "Hay"
        fData.hasLooseHayWindrow = true
        fData.hasLooseGrassWindrow = false
    elseif moistFrac > DRY_THRESH and (tonumber(aggG) or 0) > 0 then
        fData.windrowType = "Grass"
        fData.hasLooseGrassWindrow = true
    end
end

--- Plan v5 B2: state-machine path runs sync; step iterator spreads work across frames (DS-safe).
local function _fieldsUseStateMachine()
    local cfg = rawget(_G, "FarmDashboardDataCollector")
    if cfg and cfg.config and cfg.config.useStateMachine_fields ~= nil then
        return cfg.config.useStateMachine_fields and true or false
    end
    return false
end

function FieldDataCollector:collectBegin()
    if _fieldsUseStateMachine() then
        FieldDataCollector._smState = { stage = "INIT" }
        FieldDataCollector._fdCo = nil
        FieldDataCollector._fieldStep = nil
        return
    end

    FieldDataCollector._smState = nil
    FieldDataCollector._fdCo = nil
    FieldDataCollector._fieldStep = {
        fieldIds = {},
        idx = 1,
        fieldData = {},
        preambleDone = false,
        batchSize = 1,
        partial = false,
        ctx = nil,
    }

    local st = FieldDataCollector._fieldStep
    local fm = _G.g_fieldManager
    if fm and fm.fields then
        for id in pairs(fm.fields) do
            table.insert(st.fieldIds, id)
        end
        table.sort(st.fieldIds)
    end

    FieldDataCollector._yieldEvery = nil
    FieldDataCollector._baleYieldStride = nil
end

--- @return boolean done, table fieldArrayPartialOrFinal
function FieldDataCollector:collectStep(opts)
    opts = opts or {}
    if FieldDataCollector._smState ~= nil then
        FieldDataCollector._yieldEvery = nil
        FieldDataCollector._baleYieldStride = nil
        local result = FieldDataCollector:_collectImpl()
        FieldDataCollector._smState = nil
        return true, result or {}
    end

    local st = FieldDataCollector._fieldStep
    if not st then
        return true, {}
    end

    if not st.preambleDone then
        st.batchSize = math.max(1, tonumber(opts.batchSize) or 1)
        FieldDataCollector._yieldEvery = nil
        FieldDataCollector._baleYieldStride = nil
        FieldDataCollector._runPreambleOnly = true
        FieldDataCollector:_collectImpl()
        FieldDataCollector._runPreambleOnly = nil
        return false, st.fieldData or {}
    end

    st.batchSize = math.max(1, tonumber(opts.batchSize) or 1)
    FieldDataCollector._yieldEvery = nil
    FieldDataCollector._baleYieldStride = nil

    local result = FieldDataCollector:_collectImpl()
    if st.partial then
        st.fieldData = result or st.fieldData or {}
        return false, st.fieldData
    end

    FieldDataCollector._fieldStep = nil
    return true, result or {}
end

function FieldDataCollector:collect()
    FieldDataCollector._yieldEvery = nil
    FieldDataCollector._baleYieldStride = nil
    return FieldDataCollector:_collectImpl()
end

function FieldDataCollector:_collectImpl()
    local st = FieldDataCollector._fieldStep
    local fieldData = {}
    if st and st.fieldData and #st.fieldData > 0 then
        fieldData = st.fieldData
    elseif st then
        st.fieldData = fieldData
    end

    local function coopProgress()
        if FieldDataCollector._yieldEvery then
            coroutine.yield("progress", fieldData)
        end
    end
    local function baleCoopTick()
        if not FieldDataCollector._yieldEvery then return end
        local stride = FieldDataCollector._baleYieldStride or 48
        FieldDataCollector._yieldBaleCounter = (FieldDataCollector._yieldBaleCounter or 0) + 1
        if FieldDataCollector._yieldBaleCounter % stride == 0 then
            coopProgress()
        end
    end
    local function fieldCoopTick()
        if not FieldDataCollector._yieldEvery then return end
        FieldDataCollector._yieldFieldCounter = (FieldDataCollector._yieldFieldCounter or 0) + 1
        if FieldDataCollector._yieldFieldCounter % FieldDataCollector._yieldEvery == 0 then
            coopProgress()
        end
    end

    FieldDataCollector._yieldFieldCounter = 0
    
    if not _G.g_currentMission then return fieldData end
    if not _G.g_fieldManager or not _G.g_fieldManager.fields then return fieldData end

    local careerGameplayFlags
    local periodicPlowingRequired
    local TYRE_NOTE_ON_CROP
    local FERT_ORGANIC_FIRST
    local NUTRIENT_CLOSE_FRAC
    local GRASS_GROWTH_STAGES
    local isPF
    local pfInstance
    local currentFarmId
    local probeState
    local getFarmIdForParcel

    if st and st.preambleDone and st.ctx then
        local ctx = st.ctx
        careerGameplayFlags = ctx.careerGameplayFlags
        periodicPlowingRequired = ctx.periodicPlowingRequired
        TYRE_NOTE_ON_CROP = ctx.TYRE_NOTE_ON_CROP
        FERT_ORGANIC_FIRST = ctx.FERT_ORGANIC_FIRST
        NUTRIENT_CLOSE_FRAC = ctx.NUTRIENT_CLOSE_FRAC
        GRASS_GROWTH_STAGES = ctx.GRASS_GROWTH_STAGES
        isPF = ctx.isPF
        pfInstance = ctx.pfInstance
        currentFarmId = ctx.currentFarmId
        probeState = ctx.probeState
        getFarmIdForParcel = ctx.getFarmIdForParcel
    else
        careerGameplayFlags = FieldDataCollector.readCareerGameplayFlags()
        periodicPlowingRequired = (careerGameplayFlags.plowingRequired ~= false)
        TYRE_NOTE_ON_CROP = " Use narrow tyres when working on the crop (lime, fertiliser, spray)."
        FERT_ORGANIC_FIRST = " Prefer manure or slurry before solid or liquid mineral fertilizer when using multiple products."
        NUTRIENT_CLOSE_FRAC = 0.10
        GRASS_GROWTH_STAGES = 4

        isPF = false
        pfInstance = nil
        if _G.FS25_precisionFarming and _G.FS25_precisionFarming.g_precisionFarming then
            isPF = true
            pfInstance = _G.FS25_precisionFarming.g_precisionFarming
        elseif _G.g_precisionFarming then
            isPF = true
            pfInstance = _G.g_precisionFarming
        end

        currentFarmId = 1
        if _G.g_currentMission.getFarmId then
            currentFarmId = _G.g_currentMission:getFarmId()
        elseif _G.g_currentMission.player and _G.g_currentMission.player.farmId then
            currentFarmId = _G.g_currentMission.player.farmId
        end

        probeState = nil
        if _G.FieldState and _G.FieldState.new then
            local okFs, fs = pcall(function() return _G.FieldState.new() end)
            if okFs then probeState = fs end
        end
    end

    local runBalePreamble = not st or not st.preambleDone
    local function callMethod(instance, methodName, ...)
        if not instance then return nil end
        if type(instance[methodName]) == "function" then
            local ok, res = pcall(instance[methodName], instance, ...)
            if ok and res ~= nil then return res end
        end
        return nil
    end

    --- Roller / soil compaction: FS `FieldState.rollerLevel` (FieldState.lua). After `update`, higher values mean *more rolling
    --- still required* / less compacted; lower = already rolled â€” opposite of a 0â€“1 â€œrolled progressâ€. We export `rollerLevel`
    --- as rolled fraction (1 = done, 0 = not rolled) so JSON/UI match the HUD.
    local function readRollerFromState(st)
        if not st then return 0 end
        local ok, v = pcall(function()
            local r = st.rollerLevel or st.rollLevel or st.rollingLevel
            if r ~= nil and type(r) == "number" then return r end
            return 0
        end)
        if ok and type(v) == "number" then return v end
        return 0
    end

    --- Engine raw: low = already rolled, high = still needs rolling (0â€“1). Output: rolled fraction 0â€“1 for JSON/UI.
    local function rollerLevelAsRolledFraction(raw)
        raw = raw or 0
        if raw < 0 then raw = 0 end
        if raw > 1 and raw <= 255 then raw = raw / 255 end
        if raw > 1 then raw = 1 end
        return 1 - raw
    end

    --- `FieldState.stoneLevel` after `update` â€” same signal the game uses for stones on the field.
    local function readStoneFromState(st)
        if not st then return 0 end
        local ok, v = pcall(function()
            local s = st.stoneLevel
            if s ~= nil and type(s) == "number" then return s end
            return 0
        end)
        if ok and type(v) == "number" and v > 0 then return v end
        return 0
    end

    --- Weed: integer 0â€“4 = FS stages; else 0â€“1 fraction; else 0â€“100 = percent. Normalize to 0â€“1.
    local function weedNorm01(w)
        w = w or 0
        if w < 0 then w = 0 end
        if w <= 4 and w == math.floor(w) then
            return math.min(1, w / 4)
        end
        if w <= 1 then return w end
        if w <= 100 then return math.min(1, w / 100) end
        return math.min(1, w / 255)
    end

    local function weedPercentForDisplay(w)
        return math.min(100, math.floor(weedNorm01(w) * 100 + 0.5))
    end

    local farmlandBaleCounts = _pool_farmlandBaleCounts
    local farmlandBaleOnFieldBuckets = _pool_farmlandBaleOnFieldBuckets
    local farmlandBaleYardBuckets = _pool_farmlandBaleYardBuckets

    if runBalePreamble then
    --- Bale counts per farmland: scan **all** known bale sources (item list + bale manager), dedupe by stable key.
    --- FS25: `itemSystem.items` may exist but be empty â€” we must still call `g_baleManager` (previous code skipped it).
    _clearKeyedPool(_pool_farmlandBaleCounts)
    _clearKeyedPool(_pool_farmlandBaleOnFieldBuckets)
    _clearKeyedPool(_pool_farmlandBaleYardBuckets)
    FieldDataCollector._baleFieldRollup = nil
    do
        local mission = _G.g_currentMission
        local fm = _G.g_farmlandManager
        if mission and fm and type(fm.getFarmlandAtWorldPosition) == "function" then
            if rawget(_G, "FillTypeUtils") and FillTypeUtils.rebuildCatalog then
                FillTypeUtils.rebuildCatalog()
            end
            local BaleRef = rawget(_G, "Bale")
            local function isPhysicalBale(it)
                if not it then return false end
                if BaleRef and type(it.isa) == "function" then
                    local okb, bb = pcall(function() return it:isa(BaleRef) end)
                    if okb and bb then return true end
                end
                local cn = it.className
                if type(cn) == "string" then
                    local u = string.upper(cn)
                    if u == "BALE" or string.find(u, "BALE", 1, true) then return true end
                end
                return false
            end
            --- Prefer cheap ItemSystem flags before isa(Bale) â€” see FarmHub/docs/FS25 Engine Interaction Modules.txt Â§Module 1.
            local function isHeuristicBale(it)
                if not it then return false end
                if it.isBale == true then return true end
                if it.baleType ~= nil then return true end
                if it.isRoundBale == true or it.isRoundbale == true or it.isSquareBale == true then return true end
                if isPhysicalBale(it) then return true end
                return false
            end
            --- Try several nodes â€” FS uses rootNode, componentNode, or first component for bales.
            local function itemWorldXZ(it)
                if not it then return nil, nil end
                local nids = {}
                local function push(n)
                    if n ~= nil and n ~= 0 then table.insert(nids, n) end
                end
                push(it.nodeId)
                push(it.rootNode)
                push(it.node)
                if it.componentNode then push(it.componentNode) end
                if it.rootComponent then push(it.rootComponent) end
                if it.components then
                    local okc, t = pcall(function()
                        if type(it.components) == "table" then
                            return it.components[1] or it.components.main or it.components.root
                        end
                        return nil
                    end)
                    if okc then push(t) end
                end
                if type(getWorldTranslation) == "function" then
                    for _, nid in ipairs(nids) do
                        if nid ~= nil and nid ~= 0 then
                            -- Prefer valid entities; some modded bales briefly report invalid nodes â€” try anyway below.
                            if type(entityExists) ~= "function" or entityExists(nid) then
                                local ox, oy, oz = getWorldTranslation(nid)
                                if ox ~= nil and oz ~= nil then return ox, oz end
                            end
                        end
                    end
                    --- Last resort: first non-zero node even if entityExists is false (coords often still valid).
                    for _, nid in ipairs(nids) do
                        if nid ~= nil and nid ~= 0 then
                            local ox, oy, oz = getWorldTranslation(nid)
                            if ox ~= nil and oz ~= nil then return ox, oz end
                        end
                    end
                end
                if type(it.getWorldPosition) == "function" then
                    local cr = nil
                    local okp = pcall(function() cr = { it:getWorldPosition() } end)
                    if okp and type(cr) == "table" and cr[1] ~= nil then
                        return cr[1], cr[3] or cr[2]
                    end
                end
                if it.position then
                    local px = it.position.x or it.position[1]
                    local pz = it.position.z or it.position[3]
                    if px ~= nil and pz ~= nil then return px, pz end
                end
                return nil, nil
            end
            --- Parcel id (farmland.id) at world XZ, with a small offset ring so bales resting a hair
            --- off the parcel polygon still resolve to a parcel. Returns parcel id, or nil if the
            --- engine reports no farmland here at all (e.g. truly off the map).
            local function farmlandIdAtWithRing(x, z)
                local function tryAt(px, pz)
                    if type(fm.getFarmlandIdAtWorldPosition) == "function" then
                        local ok, fid = pcall(function() return fm:getFarmlandIdAtWorldPosition(px, pz) end)
                        if ok and fid ~= nil then
                            local n = tonumber(fid)
                            if n and n > 0 then return n end
                        end
                    end
                    local okF, fmo = pcall(function() return fm:getFarmlandAtWorldPosition(px, pz) end)
                    if not okF or fmo == nil then return nil end
                    if type(fmo) == "number" then
                        local n = tonumber(fmo); return (n and n > 0) and n or nil
                    end
                    if type(fmo) == "table" then
                        local p = tonumber(fmo.farmlandId or fmo.id)
                        if p and p > 0 then return p end
                        if type(fmo.getId) == "function" then
                            local okI, ii = pcall(function() return fmo:getId() end)
                            if okI and ii ~= nil then
                                local n = tonumber(ii); if n and n > 0 then return n end
                            end
                        end
                    end
                    return nil
                end
                --- Offsets when the bale origin sits on a parcel edge or slightly off the farmland nav mesh.
                local offs = {
                    { 0, 0 }, { 0.6, 0 }, { -0.6, 0 }, { 0, 0.6 }, { 0, -0.6 },
                    { 1.2, 0 }, { -1.2, 0 }, { 0, 1.2 }, { 0, -1.2 }, { 0.85, 0.85 }, { -0.85, -0.85 },
                }
                for _, o in ipairs(offs) do
                    local k = tryAt(x + o[1], z + o[2])
                    if k ~= nil and k > 0 then return k end
                end
                return nil
            end
            --- A field's farmland parcel can also contain non-field areas â€” yards, driveways, lanes.
            --- Counting *every* bale on the parcel attributes yard bales to the small grass field that
            --- happens to share parcel id (e.g. on Witcombe, parcel 98 covers both the 1.16 ha grass
            --- field and a yard area ~110 m away). We pre-compute each registered field's centre + an
            --- effective radius, and only count a bale toward a parcel if there's a field on that
            --- parcel whose centre is within range of the bale.
            ---
            --- effRadius = equiv-circle radius (sqrt(area/Ï€)) + 50% shape slack (covers most non-circular
            --- polygons â€” long rectangular fields included; a 4 ha 200Ã—200 m square has corners ~141 m
            --- from centre vs. equiv radius 113 m, well under 1.5Ã—) + 2 m boundary tolerance the user
            --- asked for. For fields with bogus posX/posZ, prefer `field:getCenterOfFieldWorldPosition()`.
            local fieldGeometries = {}
            if _G.g_fieldManager and _G.g_fieldManager.fields then
                for _, fld in pairs(_G.g_fieldManager.fields) do
                    local pid = (fld.farmland and fld.farmland.id) or nil
                    local areaHa = tonumber(fld.areaHa) or 0
                    if pid and pid > 0 and areaHa > 0 then
                        local cx0 = tonumber(fld.posX) or 0
                        local cz0 = tonumber(fld.posZ) or 0
                        if type(fld.getCenterOfFieldWorldPosition) == "function" then
                            local okC, gx, gz = pcall(function() return fld:getCenterOfFieldWorldPosition() end)
                            if okC and tonumber(gx) and tonumber(gz) then cx0, cz0 = gx, gz end
                        end
                        local r = math.sqrt((areaHa * 10000) / math.pi)
                        local effRadius = r + math.max(r * 0.5, 5) + 2
                        table.insert(fieldGeometries, { farmlandId = pid, cx = cx0, cz = cz0, effRadius = effRadius })
                    end
                end
            end
            --- Returns the parcel id (= field.farmland.id, the bucket key) to credit a bale to, OR
            --- nil to drop the bale (the bale is on a yard / driveway / lane portion of a parcel
            --- whose registered field(s) sit too far from the bale to plausibly own it).
            local function bestFieldKeyForBaleAtXZ(x, z)
                local parcel = farmlandIdAtWithRing(x, z)
                if parcel == nil or parcel <= 0 then return nil end
                local bestKey, bestDistSq = nil, math.huge
                for _, g in ipairs(fieldGeometries) do
                    if g.farmlandId == parcel then
                        local dx = x - g.cx
                        local dz = z - g.cz
                        local d2 = dx * dx + dz * dz
                        local er = g.effRadius
                        if d2 <= er * er and d2 < bestDistSq then
                            bestDistSq = d2
                            bestKey = parcel
                        end
                    end
                end
                return bestKey
            end
            local function parcelBucket(pool, parcelId)
                if not parcelId or parcelId <= 0 then return nil end
                local b = pool[parcelId]
                if not b then
                    if rawget(_G, "FillTypeUtils") and FillTypeUtils.newBaleBucket then
                        b = FillTypeUtils.newBaleBucket()
                    else
                        b = { straw = 0, grass = 0, hay = 0, silage = 0, other = 0, byFillType = {} }
                    end
                    pool[parcelId] = b
                end
                return b
            end
            local function tallyBalePlacement(it)
                local x, z = itemWorldXZ(it)
                if x == nil or z == nil then return end
                local parcel = farmlandIdAtWithRing(x, z)
                if parcel == nil or parcel <= 0 then return end
                local fieldKey = bestFieldKeyForBaleAtXZ(x, z)
                if fieldKey ~= nil and fieldKey > 0 then
                    farmlandBaleCounts[fieldKey] = (farmlandBaleCounts[fieldKey] or 0) + 1
                    local bucket = parcelBucket(farmlandBaleOnFieldBuckets, parcel)
                    if bucket and rawget(_G, "FillTypeUtils") and FillTypeUtils.tallyBale then
                        FillTypeUtils.tallyBale(bucket, it)
                    end
                else
                    local bucket = parcelBucket(farmlandBaleYardBuckets, parcel)
                    if bucket and rawget(_G, "FillTypeUtils") and FillTypeUtils.tallyBale then
                        FillTypeUtils.tallyBale(bucket, it)
                    end
                end
            end

            local function getFarmIdForParcelFn(parcelId)
                if not parcelId or parcelId <= 0 then return nil end
                if fm and type(fm.getFarmlandById) == "function" then
                    local ok, land = pcall(function() return fm:getFarmlandById(parcelId) end)
                    if ok and land then
                        local fid = tonumber(land.farmId)
                        if fid and fid > 0 then return fid end
                    end
                end
                return nil
            end

            local function getBaleOwnerFarmId(it)
                if not it then return nil end
                local fid = tonumber(rawget(it, "ownerFarmId") or rawget(it, "ownerId"))
                if not fid or fid <= 0 then
                    fid = tonumber(rawget(it, "farmId"))
                end
                if fid and fid > 0 then return fid end
                local attrs = rawget(it, "baleAttributes")
                if attrs then
                    fid = tonumber(rawget(attrs, "farmId"))
                    if fid and fid > 0 then return fid end
                end
                if type(it.getOwnerFarmId) == "function" then
                    local ok, r = pcall(function() return it:getOwnerFarmId() end)
                    if ok then
                        local n = tonumber(r)
                        if n and n > 0 then return n end
                    end
                end
                return nil
            end

            local function getPlaceableFarmId(placeable)
                if not placeable then return nil end
                if type(placeable.getOwnerFarmId) == "function" then
                    local ok, fid = pcall(function() return placeable:getOwnerFarmId() end)
                    if ok then
                        local n = tonumber(fid)
                        if n and n > 0 then return n end
                    end
                end
                local n = tonumber(rawget(placeable, "ownerFarmId") or rawget(placeable, "farmId"))
                if n and n > 0 then return n end
                return nil
            end

            local function isMountedInBaleStorage(it)
                local mount = rawget(it, "mountObject")
                if mount and type(mount) == "table" then
                    if mount.spec_baleStorage or mount.spec_bales or mount.spec_heapSpawner or mount.spec_objectStorage then
                        return true
                    end
                end
                return false
            end

            local function playerOwnsFieldOnParcel(parcelId)
                if not parcelId or parcelId <= 0 then return false end
                if not _G.g_fieldManager or not _G.g_fieldManager.fields then return false end
                for _, fld in pairs(_G.g_fieldManager.fields) do
                    local pid = fld.farmland and fld.farmland.id
                    if pid == parcelId then
                        local of = tonumber(fld.farmland and fld.farmland.farmId) or 0
                        if of == currentFarmId then return true end
                    end
                end
                return false
            end

            _clearKeyedPool(_pool_baleSeen)
            local baleSeen = _pool_baleSeen
            local function baleDedupKey(it)
                if not it then return nil end
                --- uniqueId is stable across saves; id is network id â€” prefer both for dedup.
                local uid = rawget(it, "uniqueId")
                local oid = rawget(it, "id")
                if uid ~= nil then return "u:" .. tostring(uid) end
                if oid ~= nil then return "id:" .. tostring(oid) end
                local k = it.nodeId or it.rootNode
                if k ~= nil then return "o:" .. tostring(k) end
                local x, z = itemWorldXZ(it)
                if x and z then return string.format("xz:%.1f:%.1f", x, z) end
                return "t:" .. tostring(it)
            end
            --- Count bales on the ground, or seated in bale sheds / heap storage placeables.
            local function baleIsOnGround(it)
                if not it then return false end
                local mount = rawget(it, "mountObject")
                if mount ~= nil then
                    if type(mount) == "table" then
                        if mount.spec_objectStorage then return false end
                        if mount.spec_baleStorage or mount.spec_bales or mount.spec_heapSpawner then
                            return true
                        end
                        if mount.spec_fillUnit and mount.spec_fillUnit.fillUnits then
                            return true
                        end
                    end
                    return false
                end
                if rawget(it, "currentlyLoadedOnAPalletAutoLoaderId") ~= nil then return false end
                return true
            end
            local function tryCountBale(it, assumeBale)
                if not assumeBale and not isHeuristicBale(it) then return end
                if not baleIsOnGround(it) then return end
                local dk = baleDedupKey(it)
                if dk and baleSeen[dk] then return end
                if dk then baleSeen[dk] = true end
                tallyBalePlacement(it)
            end
            --- Module 1 (Engine Interaction doc): master list is itemSystem:getItems(); .items is a legacy/shape fallback.
            local itemSys = mission.itemSystem
            local items = nil
            if itemSys and type(itemSys.getItems) == "function" then
                local okL, r = pcall(function() return itemSys:getItems() end)
                if okL and type(r) == "table" then items = r end
            end
            if items == nil and itemSys and type(itemSys.items) == "table" then
                items = itemSys.items
            end
            if type(items) == "table" then
                for _, it in pairs(items) do
                    tryCountBale(it)
                    baleCoopTick()
                end
            end
            if itemSys and type(itemSys.itemsToSave) == "table" then
                for _, wrap in pairs(itemSys.itemsToSave) do
                    local it = wrap
                    if type(wrap) == "table" then
                        it = rawget(wrap, "item") or wrap
                    end
                    tryCountBale(it)
                    baleCoopTick()
                end
            end
            --- Always merge bale manager list (round/round wrapped etc.), not only when items is missing.
            local bm = rawget(_G, "g_baleManager")
            local list = nil
            if bm then
                if type(bm.getBales) == "function" then
                    local okL, r = pcall(function() return bm:getBales() end)
                    if okL and r ~= nil then list = r end
                elseif type(bm.getItems) == "function" then
                    local okL, r = pcall(function() return bm:getItems() end)
                    if okL and r ~= nil then list = r end
                elseif type(bm.bales) == "table" then
                    list = bm.bales
                end
            end
            if type(list) == "table" then
                for _, b in pairs(list) do
                    tryCountBale(b, true)
                    baleCoopTick()
                end
            end
            --- FS25: world bales also live in the mission slot system limited-object bucket (same source the game uses for bale limits).
            local SlotSystem = rawget(_G, "SlotSystem")
            if SlotSystem and mission.slotSystem and mission.slotSystem.objectLimits then
                local lim = mission.slotSystem.objectLimits[SlotSystem.LIMITED_OBJECT_BALE]
                if lim and type(lim.objects) == "table" then
                    for _, b in pairs(lim.objects) do
                        tryCountBale(b, true)
                        baleCoopTick()
                    end
                end
            end
            --- Optional `g_baleToCollectManager:getBales()` merges the same slot list when the mission exposes it.
            local btc = rawget(_G, "g_baleToCollectManager")
            if btc and type(btc.getBales) == "function" then
                local okBtc, bl = pcall(function() return btc:getBales() end)
                if okBtc and type(bl) == "table" then
                    for _, b in pairs(bl) do
                        tryCountBale(b, true)
                        baleCoopTick()
                    end
                end
            end
            --- Fallback: scan mission.nodeToObject for Bale-class objects. Item / baleManager can miss bales on some MP or mod maps.
            if type(mission.nodeToObject) == "table" then
                for _, obj in pairs(mission.nodeToObject) do
                    baleCoopTick()
                    if type(obj) == "table" then
                        local likely = false
                        local cn = rawget(obj, "className")
                        if type(cn) == "string" then
                            local u = string.upper(cn)
                            if u == "BALE" or string.find(u, "BALE", 1, true) then likely = true end
                        end
                        if not likely then
                            if rawget(obj, "baleType") ~= nil or rawget(obj, "isRoundBale") ~= nil
                                or rawget(obj, "isSquareBale") ~= nil or rawget(obj, "isRoundbale") ~= nil then
                                likely = true
                            end
                        end
                        --- Do not call isa(Bale) on every node here â€” nodeToObject is huge; className + bale fields suffice.
                        if likely then tryCountBale(obj) end
                    end
                end
            end
            --- Optional: log to game log.txt (throttled) when farmDashboard.settings#debugBaleScan is true in config.xml
            do
                local FDC = rawget(_G, "FarmDashboardDataCollector")
                local cfg = FDC and FDC.config
                if cfg and cfg.debugBaleScan then
                    local t = rawget(_G, "g_time") or 0
                    local last = rawget(_G, "_FarmDashLastBaleDebugMs") or 0
                    if t - last >= 30000 then
                        rawset(_G, "_FarmDashLastBaleDebugMs", t)
                        local nb, nk, tot = 0, 0, 0
                        for _ in pairs(baleSeen) do nb = nb + 1 end
                        for k, c in pairs(farmlandBaleCounts) do
                            nk = nk + 1
                            tot = tot + (c or 0)
                        end
                        FarmDashLog.dev(
                            "Bale scan: uniqueBales=%d onFieldKeys=%d yardParcels=%d totalOnField=%d",
                            nb, nk, (function()
                                local y = 0
                                for _ in pairs(farmlandBaleYardBuckets) do y = y + 1 end
                                return y
                            end)(), tot
                        )
                    end
                end
            end
            getFarmIdForParcel = getFarmIdForParcelFn
            _finalizeBaleFieldRollup(
                farmlandBaleOnFieldBuckets,
                farmlandBaleYardBuckets,
                getFarmIdForParcel,
                currentFarmId
            )
        end
    end

    if st and runBalePreamble then
        st.ctx = {
            careerGameplayFlags = careerGameplayFlags,
            periodicPlowingRequired = periodicPlowingRequired,
            TYRE_NOTE_ON_CROP = TYRE_NOTE_ON_CROP,
            FERT_ORGANIC_FIRST = FERT_ORGANIC_FIRST,
            NUTRIENT_CLOSE_FRAC = NUTRIENT_CLOSE_FRAC,
            GRASS_GROWTH_STAGES = GRASS_GROWTH_STAGES,
            isPF = isPF,
            pfInstance = pfInstance,
            currentFarmId = currentFarmId,
            probeState = probeState,
            getFarmIdForParcel = getFarmIdForParcel,
        }
        st.preambleDone = true
    end
    end

    if FieldDataCollector._runPreambleOnly then
        return fieldData
    end

    local fieldIterList = {}
    if st then
        local batch = st.batchSize or 1
        local endIdx = math.min(st.idx + batch - 1, #st.fieldIds)
        for ii = st.idx, endIdx do
            local fid = st.fieldIds[ii]
            fieldIterList[#fieldIterList + 1] = { fid, _G.g_fieldManager.fields[fid] }
        end
        st.idx = endIdx + 1
        st.partial = st.idx <= #st.fieldIds
    else
        for fieldId, field in pairs(_G.g_fieldManager.fields) do
            fieldIterList[#fieldIterList + 1] = { fieldId, field }
        end
    end

    for _, fieldPair in ipairs(fieldIterList) do
        local fieldId, field = fieldPair[1], fieldPair[2]
        if not field then
        else
        local ownerFarmId = field.farmland and field.farmland.farmId or 0
        local isOwned = (ownerFarmId > 0 and ownerFarmId == currentFarmId)
        local displayId = fieldId
        
        if field.farmland and field.farmland.id and field.farmland.id > 0 then
            displayId = field.farmland.id
        end
        
        local fData = {
            id                    = fieldId,
            name                  = string.format("Field %d", displayId),
            hectares              = field.areaHa or 0,
            fieldAreaInSqm        = (field.areaHa or 0) * 10000,
            isOwned               = isOwned,
            ownerFarmId           = ownerFarmId,
            farmlandId            = displayId,
            posX                  = field.posX or 0,
            posZ                  = field.posZ or 0,
            fruitType             = "unknown",
            fruitTypeIndex        = 0,
            growthState           = 0,
            maxGrowthState        = 0,
            growthStatePercentage = 0,
            --- Grass only: display ring 1â€“4 (perennial cycles map engine stage >4 back into the 4 map stages).
            grassRingStage        = 0,
            --- Raw `numGrowthStates` from fruit desc (per crop); grass may report extra indices vs the 4 map stages â€” see Â§2.
            engineNumGrowthStates = 0,
            harvestReady          = false,
            isWithered            = false,
            isHarvested           = false,
            stateName             = "Empty",
            growthLabel           = "empty",
            fertilizationLevel    = 0,
            plowLevel             = 0,
            limeLevel             = 0,
            weedLevel             = 0,
            mulchLevel            = 0,
            rollerLevel           = 0,
            stubbleLevel          = 0,
            sprayLevel            = 0,
            stoneLevel            = 0,
            groundType            = 0,
            isPrecisionFarming    = isPF,
            nitrogenLevel         = 0,
            targetNitrogen        = 0,
            phValue               = 0,
            targetPh              = 0,
            isScanned             = false,
            nitrogenText          = "",
            limeText              = "",
            phLimeBarMin          = 0,
            phLimeBarMax          = 0,
            needsWork             = false,
            needsPlowing          = false,
            needsLime             = false,
            needsFertilizer       = false,
            needsWeeding          = false,
            needsRolling          = false,
            --- Loose straw / grass / hay (TEDDER + STRAW) from density probes â€” see windrow block; not cereal swaths alone.
            needsBaling           = false,
            baleableLooseLiters   = 0,
            --- Split from windrowByFillName for JSON + forage suggestions (STRAW / GRASS_WINDROW / DRYGRASS_WINDROW â€” Dynamic Ground Material doc).
            looseStrawLiters           = 0,
            looseGrassWindrowLiters      = 0,
            looseDryGrassWindrowLiters   = 0,
            --- Presence only (rules / next-stage workflow): any probe volume above noise floor for that channel â€” no need to expose litres in UI.
            hasLooseStraw                = false,
            hasLooseGrassWindrow         = false,
            hasLooseHayWindrow           = false,
            hasLooseForage               = false,
            --- Windrow probe diagnostics (see windrow block): util reachable; fill-type count; sum of all probed types at field centre (large sample) â€” if 0 everywhere but material visible in-game, dedicated/Lua may not see height-map litres.
            windrowUtilAvailable         = false,
            windrowFillTypesRegistered   = 0,
            windrowCenterProbeTotalL     = 0,
            suggestions           = {}
        }

        -- Get True Center Coordinates
        local cx = fData.posX
        local cz = fData.posZ
        if field.getCenterOfFieldWorldPosition then
            local ok, x, z = pcall(function() return field:getCenterOfFieldWorldPosition() end)
            if ok and x and z then cx, cz = x, z end
        end

        -- ====================================================================
        -- 1. THE HYBRID PROBE 
        -- ====================================================================
        if not isOwned then
            -- [UNOWNED FIELDS]: Use the NPC Contract Planner (Saves CPU, highly accurate for AI)
            if probeState and type(probeState.update) == "function" then
                local foundCrop = false
                local offsets = { {0,0}, {5,5}, {-5,-5}, {5,-5}, {-5,5} }
                for _, off in ipairs(offsets) do
                    pcall(function() probeState:update(cx + off[1], cz + off[2]) end)
                    if probeState.fruitTypeIndex and probeState.fruitTypeIndex > 0 then
                        fData.fruitTypeIndex     = probeState.fruitTypeIndex
                        fData.growthState        = probeState.growthState or 0
                        fData.fertilizationLevel = probeState.sprayLevel or 0
                        fData.plowLevel          = probeState.plowLevel or 0
                        fData.limeLevel          = probeState.limeLevel or 0
                        fData.weedLevel          = probeState.weedState or 0
                        fData.mulchLevel         = probeState.stubbleShredLevel or 0
                        fData.groundType         = probeState.groundType or 0
                        foundCrop = true
                        break
                    end
                end
                if not foundCrop then
                    pcall(function() probeState:update(cx, cz) end)
                    fData.fertilizationLevel = probeState.sprayLevel or 0
                    fData.plowLevel          = probeState.plowLevel or 0
                    fData.limeLevel          = probeState.limeLevel or 0
                    fData.weedLevel          = probeState.weedState or 0
                    fData.mulchLevel         = probeState.stubbleShredLevel or 0
                    fData.groundType         = probeState.groundType or 0
                end
            end
        else
            -- [OWNED FIELDS]: Use the same FieldState world sampling as unowned/NPC fields.
            -- HUD (fieldInfoSystem.getFieldInfoAtWorldPosition) + getFruitTypeIndexAtWorldPos(2-arg)
            -- were giving stale data for player farmland; FieldState:update matches FieldManager / map.
            local offsets = { {0,0}, {5,5}, {-5,-5}, {5,-5}, {-5,5}, {10,0}, {-10,0}, {0,10}, {0,-10} }
            local foundCrop = false

            if probeState and type(probeState.update) == "function" then
                local maxWeed = 0
                for _, off in ipairs(offsets) do
                    pcall(function() probeState:update(cx + off[1], cz + off[2]) end)
                    if probeState.fruitTypeIndex and probeState.fruitTypeIndex > 0 then
                        if off[1] == 0 and off[2] == 0 then
                            fData.fruitTypeIndex     = probeState.fruitTypeIndex
                            fData.growthState        = probeState.growthState or 0
                            fData.fertilizationLevel = probeState.sprayLevel or 0
                            fData.plowLevel          = probeState.plowLevel or 0
                            fData.limeLevel          = probeState.limeLevel or 0
                            fData.mulchLevel         = probeState.stubbleShredLevel or 0
                            fData.groundType         = probeState.groundType or 0
                            foundCrop = true
                        elseif not foundCrop then
                            fData.fruitTypeIndex     = probeState.fruitTypeIndex
                            fData.growthState        = probeState.growthState or 0
                            fData.fertilizationLevel = probeState.sprayLevel or 0
                            fData.plowLevel          = probeState.plowLevel or 0
                            fData.limeLevel          = probeState.limeLevel or 0
                            fData.mulchLevel         = probeState.stubbleShredLevel or 0
                            fData.groundType         = probeState.groundType or 0
                            foundCrop = true
                        end
                        local w = tonumber(probeState.weedState) or 0
                        if w > maxWeed then maxWeed = w end
                    end
                end
                if foundCrop then
                    fData.weedLevel = maxWeed
                else
                    pcall(function() probeState:update(cx, cz) end)
                    fData.fertilizationLevel = probeState.sprayLevel or 0
                    fData.plowLevel          = probeState.plowLevel or 0
                    fData.limeLevel          = probeState.limeLevel or 0
                    fData.weedLevel          = probeState.weedState or 0
                    fData.mulchLevel         = probeState.stubbleShredLevel or 0
                    fData.groundType         = probeState.groundType or 0
                end
            end

            -- Per-field FieldState (engine-owned) as a second opinion when probeState missed crop
            if field.fieldState and type(field.fieldState.update) == "function" then
                pcall(function() field.fieldState:update(cx, cz) end)
                local fs = field.fieldState
                if (not foundCrop or (fData.fruitTypeIndex or 0) == 0) and fs.fruitTypeIndex and fs.fruitTypeIndex > 0 then
                    fData.fruitTypeIndex     = fs.fruitTypeIndex
                    fData.growthState        = fs.growthState or 0
                    fData.fertilizationLevel = fs.sprayLevel or 0
                    fData.plowLevel          = fs.plowLevel or 0
                    fData.limeLevel          = fs.limeLevel or 0
                    fData.weedLevel          = fs.weedState or 0
                    fData.mulchLevel         = fs.stubbleShredLevel or 0
                    fData.groundType         = fs.groundType or 0
                    foundCrop = true
                elseif foundCrop then
                    local w = tonumber(fs.weedState) or 0
                    if w > (tonumber(fData.weedLevel) or 0) then
                        fData.weedLevel = w
                    end
                else
                    fData.fertilizationLevel = fs.sprayLevel or fData.fertilizationLevel
                    fData.plowLevel          = fs.plowLevel or fData.plowLevel
                    fData.limeLevel          = fs.limeLevel or fData.limeLevel
                    fData.weedLevel          = fs.weedState or fData.weedLevel
                    fData.mulchLevel         = fs.stubbleShredLevel or fData.mulchLevel
                    fData.groundType         = fs.groundType or fData.groundType
                end
            end
        end

        -- 1d. Grass: sample growth across the parcel. Use field centre when growth is uniform (matches
        -- in-game field map). Use minimum only when spread is large or engine stage > map cap (mown mix).
        do
            local fi = fData.fruitTypeIndex or 0
            if fi > 0 and _G.g_fruitTypeManager and probeState and type(probeState.update) == "function" then
                local ftd = _G.g_fruitTypeManager:getFruitTypeByIndex(fi)
                if ftd and string.upper(tostring(ftd.name or "")) == "GRASS" then
                    local myFarmlandId = field.farmland and field.farmland.id or nil
                    local function sampleOnThisFarmland(sx, sz)
                        if not myFarmlandId or not _G.g_farmlandManager or not _G.g_farmlandManager.getFarmlandAtWorldPosition then
                            return true
                        end
                        local ok, fm = pcall(function()
                            return _G.g_farmlandManager:getFarmlandAtWorldPosition(sx, sz)
                        end)
                        if not ok or not fm then return false end
                        return fm.id == myFarmlandId
                    end
                    local grassOffsets = {
                        {0, 0}, {5, 5}, {-5, -5}, {5, -5}, {-5, 5},
                        {12, 0}, {-12, 0}, {0, 12}, {0, -12},
                        {20, 0}, {-20, 0}, {0, 20}, {0, -20},
                    }
                    local centerGs, localMin, localMax = nil, nil, nil
                    for _, off in ipairs(grassOffsets) do
                        local sx, sz = cx + off[1], cz + off[2]
                        if sampleOnThisFarmland(sx, sz) then
                            pcall(function() probeState:update(sx, sz) end)
                            local g = probeState.growthState
                            if g ~= nil and probeState.fruitTypeIndex == fi then
                                if off[1] == 0 and off[2] == 0 then centerGs = g end
                                if localMin == nil or g < localMin then localMin = g end
                                if localMax == nil or g > localMax then localMax = g end
                            end
                        end
                    end
                    if localMin ~= nil then
                        local spread = (localMax or localMin) - localMin
                        if (localMax or localMin) > GRASS_GROWTH_STAGES or spread >= 2 then
                            fData.growthState = localMin
                        elseif centerGs ~= nil then
                            fData.growthState = centerGs
                        else
                            fData.growthState = localMax or localMin
                        end
                    end
                end
            end
        end

        -- 1b. No crop on probe: center read often misses mulched stubble â€” max stubble across offsets on this farmland
        local mulchBefore1b = fData.mulchLevel or 0
        if (fData.fruitTypeIndex or 0) == 0 then
            local soilOffsets = {
                {0, 0}, {5, 5}, {-5, -5}, {5, -5}, {-5, 5},
                {10, 0}, {-10, 0}, {0, 10}, {0, -10},
                {20, 0}, {-20, 0}, {0, 20}, {0, -20},
                {15, 15}, {-15, -15}
            }
            local myFarmlandId = field.farmland and field.farmland.id or nil
            local function sampleOnThisFarmland(sx, sz)
                if not myFarmlandId or not _G.g_farmlandManager or not _G.g_farmlandManager.getFarmlandAtWorldPosition then
                    return true
                end
                local ok, fm = pcall(function()
                    return _G.g_farmlandManager:getFarmlandAtWorldPosition(sx, sz)
                end)
                if not ok or not fm then return false end
                return fm.id == myFarmlandId
            end
            local maxMulch = mulchBefore1b
            if probeState and type(probeState.update) == "function" then
                for _, off in ipairs(soilOffsets) do
                    local sx, sz = cx + off[1], cz + off[2]
                    if sampleOnThisFarmland(sx, sz) then
                        pcall(function() probeState:update(sx, sz) end)
                        local m = probeState.stubbleShredLevel or 0
                        if m > maxMulch then maxMulch = m end
                    end
                end
            end
            if field.fieldState and type(field.fieldState.update) == "function" then
                for _, off in ipairs(soilOffsets) do
                    local sx, sz = cx + off[1], cz + off[2]
                    if sampleOnThisFarmland(sx, sz) then
                        pcall(function() field.fieldState:update(sx, sz) end)
                        local fs = field.fieldState
                        local m = fs and fs.stubbleShredLevel or 0
                        if m > maxMulch then maxMulch = m end
                    end
                end
            end
            fData.mulchLevel = maxMulch
        end

        -- 1c. Roller: sample multiple points â€” use worst (least rolled) so one rolled strip does not clear the flag.
        do
            local minRolled = 1
            local rollerOffsets = {
                {0, 0}, {5, 5}, {-5, -5}, {5, -5}, {-5, 5},
                {10, 0}, {-10, 0}, {0, 10}, {0, -10},
            }
            local function sampleRollerAt(px, pz)
                local raw = 0
                if field.fieldState and type(field.fieldState.update) == "function" then
                    pcall(function() field.fieldState:update(px, pz) end)
                    raw = readRollerFromState(field.fieldState)
                elseif probeState and type(probeState.update) == "function" then
                    pcall(function() probeState:update(px, pz) end)
                    raw = readRollerFromState(probeState)
                end
                local rolled = rollerLevelAsRolledFraction(raw)
                if rolled < minRolled then minRolled = rolled end
            end
            for _, off in ipairs(rollerOffsets) do
                sampleRollerAt(cx + off[1], cz + off[2])
            end
            fData.rollerLevel = minRolled
        end

        -- 1e. Stones: worst `stoneLevel` across samples (FieldState â€” matches in-field map / work flags).
        do
            local maxStone = 0
            local stoneOffsets = {
                {0, 0}, {5, 5}, {-5, -5}, {5, -5}, {-5, 5},
                {10, 0}, {-10, 0}, {0, 10}, {0, -10},
            }
            if probeState and type(probeState.update) == "function" then
                for _, off in ipairs(stoneOffsets) do
                    pcall(function() probeState:update(cx + off[1], cz + off[2]) end)
                    local sl = readStoneFromState(probeState)
                    if sl > maxStone then maxStone = sl end
                end
            end
            if field.fieldState and type(field.fieldState.update) == "function" then
                for _, off in ipairs(stoneOffsets) do
                    pcall(function() field.fieldState:update(cx + off[1], cz + off[2]) end)
                    local sl = readStoneFromState(field.fieldState)
                    if sl > maxStone then maxStone = sl end
                end
            end
            fData.stoneLevel = maxStone
        end

        -- Engine GroundType cache: only adjust "visual dirt" when there is NO crop.
        -- If we clobber growthState with groundType while fruit is planted, rolling / stage-1 tasks
        -- disagree with the in-game field map (e.g. field still shows "needs rolling").
        local gType = fData.groundType
        if (fData.fruitTypeIndex or 0) == 0 then
            if gType == 3 or gType == 4 then
                if fData.growthState == 0 then fData.growthState = 1 end
                fData.harvestReady = false
            elseif gType == 1 or gType == 2 then
                fData.growthState  = 0
                fData.harvestReady = false
            end
        end

        -- ====================================================================
        -- 2. CROP CLASSIFICATION & HARVEST MATH
        -- ====================================================================
        if fData.fruitTypeIndex > 0 and _G.g_fruitTypeManager then
            local ftDesc = _G.g_fruitTypeManager:getFruitTypeByIndex(fData.fruitTypeIndex)
            if ftDesc then
                fData.fruitType      = ftDesc.name or "unknown"
                fData.engineNumGrowthStates = ftDesc.numGrowthStates or 0
                fData.maxGrowthState = fData.engineNumGrowthStates
                local ftUpper = string.upper(tostring(fData.fruitType or ""))
                -- Grass: map/UI has exactly GRASS_GROWTH_STAGES; engine index range can be larger (mown / internal).
                if ftUpper == "GRASS" and fData.maxGrowthState > GRASS_GROWTH_STAGES then
                    fData.maxGrowthState = GRASS_GROWTH_STAGES
                end
                local gs             = fData.growthState
                local gsName         = ftDesc.growthStateToName and ftDesc.growthStateToName[gs]
                local gsNameLower    = gsName and string.lower(tostring(gsName)) or nil
                
                local minHarvest = ftDesc.minHarvestingGrowthState or fData.maxGrowthState
                local maxHarvest = ftDesc.maxHarvestingGrowthState or fData.maxGrowthState
                local maxStateToShow = minHarvest
                if ftDesc.yieldScales and ftDesc.yieldScales[minHarvest] ~= nil and ftDesc.yieldScales[minHarvest] ~= 1 then
                    maxStateToShow = maxHarvest
                end

                -- Grass is perennial: do not use arable "withered" / over-max rules (regrowth confuses them).
                -- Withered: trust the engine name only. `gs > maxHarvestingGrowthState` matches post-harvest /
                -- stubble / extra engine stages (e.g. maize gs 10 vs max harvest 7) and must NOT imply withered.
                local isWitheredState = (gsName == "withered")
                local isPostHarvestState = false
                if ftUpper ~= "GRASS" and gsNameLower then
                    if gsNameLower == "harvested"
                        or gsNameLower == "cut"
                        or gsNameLower == "mown"
                        or gsNameLower == "mowed"
                        or gsNameLower:find("stubble", 1, true) then
                        isPostHarvestState = true
                    end
                end

                --- Arable: the Giants *window* minHarvest..maxHarvest can span several indices. Treating any index
                --- in that band as "ready" made barley show harvest at 7/8 while the bar is still growing. Align with
                --- the last harvestable index (maxHarvestingGrowthState) unless the engine names the state harvestReady.
                --- If the probe reports gs above maxHarvest but still <= numGrowthStates and not withered, canola etc.
                --- often remain harvestable (previously stayed "growing" at e.g. gs 10 vs maxHarvest 9).
                local numGs = ftDesc.numGrowthStates or fData.maxGrowthState or 0
                local inHarvestWindow = false
                if ftUpper ~= "GRASS" and ftDesc.minHarvestingGrowthState then
                    if gs >= minHarvest and gs <= maxHarvest then
                        inHarvestWindow = (gs == maxHarvest)
                    elseif gs > maxHarvest and numGs > 0 and gs <= numGs and not isWitheredState then
                        inHarvestWindow = true
                    end
                end
                if isPostHarvestState then
                    fData.isHarvested  = true
                    fData.harvestReady = false
                    fData.growthLabel  = "harvested"
                    fData.stateName    = "Harvested"
                elseif ftUpper ~= "GRASS" and isWitheredState then
                    fData.isWithered   = true
                    fData.growthLabel  = "withered"
                    fData.stateName    = "Withered"
                    fData.harvestReady = false
                elseif gsName == "harvestReady" or (ftUpper ~= "GRASS" and inHarvestWindow) then
                    fData.harvestReady = true
                    fData.growthLabel  = "harvest_ready"
                    fData.stateName    = "Ready"
                elseif gs > 0 then
                    fData.growthLabel  = "growing"
                    fData.stateName    = "Growing"
                else
                    fData.growthLabel  = "empty"
                    fData.stateName    = "Empty"
                end

                -- FS25 grass: mown / early regrowth may use distinct `growthStateToName` entries at the same index as tall grass.
                if ftUpper == "GRASS" and gsName then
                    local ln = string.lower(tostring(gsName))
                    if ln == "cut" or ln == "mown" or ln == "mowed" or ln:find("stubble", 1, true)
                        or ln == "secondgrowth" or ln == "thirdgrowth" then
                        fData.harvestReady = false
                        fData.growthLabel  = "mown_regrowth"
                        fData.stateName    = "Mown / regrowing"
                    end
                end
                
                if maxStateToShow > 0 then
                    -- Use engine stage count for the bar when it exceeds yield-based maxStateToShow (avoids 7/8 barley at 100%).
                    local denom = maxStateToShow
                    if ftUpper ~= "GRASS" and numGs > 0 then
                        denom = math.max(maxStateToShow, numGs)
                    end
                    fData.growthStatePercentage = math.min(100, math.floor((fData.growthState / denom) * 100))
                    if fData.harvestReady then fData.growthStatePercentage = 100 end
                end

                -- Grass: only the last of the 4 map stages is "ready to cut" (not earlier engine-ready substates).
                --- Do not overwrite mown / regrowth labels set from `growthStateToName` (cut / stubble / second growth).
                if ftUpper == "GRASS" and (fData.maxGrowthState or 0) > 0 and (fData.growthState or 0) > 0
                    and (fData.growthState or 0) < fData.maxGrowthState
                    and fData.growthLabel ~= "mown_regrowth" then
                    fData.harvestReady = false
                    fData.growthLabel  = "growing"
                    fData.stateName    = "Growing"
                    if maxStateToShow > 0 then
                        fData.growthStatePercentage = math.min(99, math.floor((fData.growthState / maxStateToShow) * 100))
                    end
                end
                -- Grass: engine index above the 4 map stages = after cut / internal cycle â€” keep mown_regrowth for suggestions + UI.
                if ftUpper == "GRASS" and (fData.growthState or 0) > (fData.maxGrowthState or GRASS_GROWTH_STAGES) then
                    fData.harvestReady = false
                    fData.growthLabel  = "mown_regrowth"
                    fData.stateName    = "Mown / regrowing"
                    if maxStateToShow > 0 then
                        local gsMap = ((fData.growthState - 1) % GRASS_GROWTH_STAGES) + 1
                        fData.growthStatePercentage = math.min(99, math.floor((gsMap / maxStateToShow) * 100))
                    end
                end

                if ftUpper == "GRASS" and (fData.growthState or 0) > 0 then
                    local gsv = fData.growthState or 0
                    if fData.growthLabel == "mown_regrowth" or gsv > GRASS_GROWTH_STAGES then
                        fData.grassRingStage = ((gsv - 1) % GRASS_GROWTH_STAGES) + 1
                    else
                        fData.grassRingStage = math.min(gsv, GRASS_GROWTH_STAGES)
                    end
                end
            end
        end

        -- ====================================================================
        -- 3. SOIL MAP RADIUS SCAN (N / pH sampling)
        -- ====================================================================
        local nLevel, nTarget, phLevel, phTarget = 0, 0, 0, 0
        local isScanned = false
        local sumPhBarMin, validPhBarMin = 0, 0

        --- Decode soil-map pH raw 1..31 scale to pH if needed (same as ptPh).
        local function decodePhRaw(v)
            if not v or type(v) ~= "number" then return nil end
            if v >= 1 and v <= 31 and v % 1 == 0 then return (v * 0.125) + 4.375 end
            return v
        end

        --- Lower end of the "healthy" pH range for this soil type (for UI bar + lime band).
        --- Tries pH map getters; falls back to optimal âˆ’ margin (per soil sample).
        local function getPhBarMinForSoilType(pHMap, soilTypeIdx, optimalPh)
            local tryNames = {
                "getMinimumPHValueForSoilTypeIndex",
                "getMinPHValueForSoilTypeIndex",
                "getMinimumRecommendedPHForSoilTypeIndex",
                "getMinRecommendedPHForSoilTypeIndex",
            }
            for _, nm in ipairs(tryNames) do
                local v = callMethod(pHMap, nm, soilTypeIdx)
                v = decodePhRaw(v)
                if v and v > 0 and v < (optimalPh or 99) then return v end
            end
            if optimalPh and optimalPh > 0 then
                return math.max(4.3, optimalPh - 1.2)
            end
            return 5.5
        end

        if isPF and pfInstance then
            local baseRadius = math.sqrt(fData.fieldAreaInSqm / math.pi)
            local sampleOffsets = {
                {0, 0}, {0.25, 0}, {-0.25, 0}, {0, 0.25}, {0, -0.25},
                {0.5, 0.5}, {-0.5, -0.5}, {0.5, -0.5}, {-0.5, 0.5},
                {0.6, 0}, {-0.6, 0}, {0, 0.6}, {0, -0.6}
            }
            local sumN, sumNTarget, validN = 0, 0, 0
            local sumPh, sumPhTarget, validPh = 0, 0, 0

            -- Ignore sample points that fall on a neighbour field (offsets can cross the boundary).
            local myFarmlandId = field.farmland and field.farmland.id or nil
            local function sampleOnThisFarmland(sx, sz)
                if not myFarmlandId or not _G.g_farmlandManager or not _G.g_farmlandManager.getFarmlandAtWorldPosition then
                    return true
                end
                local ok, fm = pcall(function()
                    return _G.g_farmlandManager:getFarmlandAtWorldPosition(sx, sz)
                end)
                if not ok or not fm then return false end
                return fm.id == myFarmlandId
            end

            for _, offset in ipairs(sampleOffsets) do
                local sX = cx + (offset[1] * baseRadius)
                local sZ = cz + (offset[2] * baseRadius)
                if not sampleOnThisFarmland(sX, sZ) then
                    -- skip points outside this field's farmland (prevents neighbour field bleed in samples)
                else
                local soilType = callMethod(pfInstance.soilMap, "getTypeIndexAtWorldPos", sX, sZ)
                
                if soilType and type(soilType) == "number" and soilType > 0 then
                    isScanned = true
                    local ptN = callMethod(pfInstance.nitrogenMap, "getLevelAtWorldPos", sX, sZ)
                    if ptN and type(ptN) == "number" then
                        if ptN <= 45 and ptN % 1 == 0 then ptN = math.max(0, (ptN - 1) * 5) end
                        if ptN > 0 then sumN = sumN + ptN; validN = validN + 1 end
                    end
                    local ptNTgt = callMethod(pfInstance.nitrogenMap, "getTargetLevelAtWorldPos", sX, sZ)
                    if ptNTgt == nil or ptNTgt == 0 then
                        ptNTgt = callMethod(pfInstance.nitrogenMap, "getTargetLevelAtWorldPos", sX, sZ, fData.fruitTypeIndex)
                    end
                    if ptNTgt and type(ptNTgt) == "number" then
                        if ptNTgt <= 45 and ptNTgt % 1 == 0 then ptNTgt = math.max(0, (ptNTgt - 1) * 5) end
                        sumNTarget = sumNTarget + ptNTgt
                    end
                    local ptPh = callMethod(pfInstance.pHMap, "getLevelAtWorldPos", sX, sZ)
                    if ptPh and type(ptPh) == "number" then
                        if ptPh >= 1 and ptPh <= 31 and ptPh % 1 == 0 then ptPh = (ptPh * 0.125) + 4.375 end
                        if ptPh > 0 then sumPh = sumPh + ptPh; validPh = validPh + 1 end
                    end
                    local ptPhTgt = callMethod(pfInstance.pHMap, "getOptimalPHValueForSoilTypeIndex", soilType)
                    if ptPhTgt and type(ptPhTgt) == "number" then
                        if ptPhTgt >= 1 and ptPhTgt <= 31 and ptPhTgt % 1 == 0 then ptPhTgt = (ptPhTgt * 0.125) + 4.375 end
                        sumPhTarget = sumPhTarget + ptPhTgt
                    end
                    local optForBar = ptPhTgt
                    if optForBar and optForBar > 0 then
                        local barMinPt = getPhBarMinForSoilType(pfInstance.pHMap, soilType, optForBar)
                        if barMinPt and barMinPt > 0 then
                            sumPhBarMin = sumPhBarMin + barMinPt
                            validPhBarMin = validPhBarMin + 1
                        end
                    end
                end
                end
            end

            if validN  > 0 then nLevel  = sumN  / validN;  nTarget  = sumNTarget  / validN  end
            if validPh > 0 then phLevel = sumPh / validPh; phTarget = sumPhTarget / validPh end
        end

        local phBarMinAvg = 0
        if validPhBarMin > 0 then phBarMinAvg = sumPhBarMin / validPhBarMin end
        if phBarMinAvg <= 0 and phTarget > 0 then phBarMinAvg = math.max(4.3, phTarget - 1.2) end
        if phBarMinAvg <= 0 then phBarMinAvg = 5.5 end

        fData.isScanned      = isScanned
        fData.nitrogenLevel  = nLevel
        fData.targetNitrogen = nTarget
        fData.phValue        = phLevel
        fData.targetPh       = phTarget
        fData.phLimeBarMin   = phBarMinAvg
        fData.phLimeBarMax   = phTarget

        -- ====================================================================
        -- 4. STATUS FLAGS AND SUGGESTIONS
        -- ====================================================================
        fData.needsPlowing = periodicPlowingRequired and (fData.plowLevel < 1)
        -- ~15%+ weeds (handles 0â€“1, 0â€“4 stages, or 0â€“100 percent-style reads)
        fData.needsWeeding = weedNorm01(fData.weedLevel) > 0.15

        if isPF then
            if not isScanned then
                fData.fertilizationLevel = 0
                fData.limeLevel          = 0
                fData.needsLime          = true
                fData.needsFertilizer    = true
                fData.nitrogenText       = "Needs Scan"
                fData.limeText           = "Needs Scan"
            else
                --- Grass: PF map can report very high kg/ha targets; keep raw `targetNitrogen` for logic, cap dashboard display only.
                local nTextTarget = nTarget
                local ftUpN = string.upper(tostring(fData.fruitType or ""))
                local grassForN = (ftUpN == "GRASS")
                if not grassForN and (fData.fruitTypeIndex or 0) > 0 and _G.g_fruitTypeManager then
                    local ftdN = _G.g_fruitTypeManager:getFruitTypeByIndex(fData.fruitTypeIndex)
                    if ftdN and string.upper(tostring(ftdN.name or "")) == "GRASS" then grassForN = true end
                end
                if grassForN and nTarget > 0 then
                    nTextTarget = math.min(nTarget, math.max(nLevel * 1.15 + 30, 90))
                    fData.nitrogenTargetDisplay = nTextTarget
                end
                fData.nitrogenText       = string.format("%.0f / %.0f kg/ha", nLevel, nTextTarget)
                fData.limeText           = string.format("%.1f pH", phLevel)
                fData.fertilizationLevel = nTarget > 0 and math.min(2, (nLevel / nTarget) * 2) or 0
                -- Lime: use soil-map optimal pH for sampled soil types (targetPh); band ~0.2 below target.
                local limeBand = 0.2
                if phTarget > 0 then
                    local idealMin = phTarget - limeBand
                    local gapBelow = idealMin - phLevel
                    local needLimeByPh = phLevel < idealMin
                    if needLimeByPh and gapBelow > 0 and gapBelow <= (NUTRIENT_CLOSE_FRAC * math.max(idealMin, 0.01)) then
                        needLimeByPh = false
                    end
                    fData.needsLime = needLimeByPh
                    fData.limeLevel = (not needLimeByPh) and 1 or 0
                else
                    local idealRef = 6.5
                    local needLimeByPh = phLevel < idealRef
                    if needLimeByPh and (idealRef - phLevel) <= (NUTRIENT_CLOSE_FRAC * idealRef) then
                        needLimeByPh = false
                    end
                    fData.needsLime = needLimeByPh
                    fData.limeLevel = (not needLimeByPh) and 1 or 0
                end
                -- N: within 10% of target â†’ no further mineral fert suggestion (spatial variation across the field).
                fData.needsFertilizer = nTarget > 0 and (nLevel < nTarget * (1 - NUTRIENT_CLOSE_FRAC))
            end
        else
            -- Without soil maps: spray 0â€“2 and lime 0â€“1 â€” within ~5% of â€œfullâ€ counts as done for suggestion ordering.
            fData.needsFertilizer = (fData.fertilizationLevel or 0) < 1.9
            fData.needsLime       = (fData.limeLevel or 0) < 0.95
            fData.nitrogenText    = string.format("%d/2", fData.fertilizationLevel)
            fData.limeText        = fData.needsLime and "Needed" or "Done"
        end

        --- Grass: use fruit type manager when index is set (name is still "unknown" until end of collect for some fields).
        local fruitUp = string.upper(tostring(fData.fruitType or ""))
        local isGrass = (fruitUp == "GRASS")
        if not isGrass and (fData.fruitTypeIndex or 0) > 0 and _G.g_fruitTypeManager then
            local ftd = _G.g_fruitTypeManager:getFruitTypeByIndex(fData.fruitTypeIndex)
            if ftd and string.upper(tostring(ftd.name or "")) == "GRASS" then isGrass = true end
        end
        local mulchLv = fData.mulchLevel or 0
        --- Grass regrowth after mowing (engine stage above map stages or explicit mown label) â€” not the same as first growth after seeding; lime + optional organic + mineral fertiliser.
        local grassMownRegrowth = isGrass and (
            (fData.growthLabel == "mown_regrowth")
            or ((fData.growthState or 0) > (fData.maxGrowthState or GRASS_GROWTH_STAGES))
        )

        -- Lime on growing crops: not practical after emergence past stage 3 (arable only).
        if not isGrass and (fData.fruitTypeIndex or 0) > 0 and (fData.growthState or 0) > 3 then
            fData.needsLime = false
        end

        -- Roll: first growth stage only; `rollerLevel` here is rolled fraction (1 = done), so need roll while < 1.
        fData.needsRolling = false
        if (fData.fruitTypeIndex or 0) > 0 and not fData.harvestReady and not fData.isWithered
            and (fData.rollerLevel or 0) < 1 and not grassMownRegrowth then
            local engMax = fData.engineNumGrowthStates or 0
            if engMax <= 0 then engMax = fData.maxGrowthState or 0 end
            local gs = fData.growthState or 0
            local ftUp = string.upper(tostring(fData.fruitType or ""))
            local inFirstStage = false
            if ftUp == "GRASS" and engMax > GRASS_GROWTH_STAGES then
                inFirstStage = (math.ceil((gs * GRASS_GROWTH_STAGES) / engMax) == 1)
            else
                inFirstStage = (gs == 1)
            end
            fData.needsRolling = inFirstStage
        end

        fData.needsWork = fData.needsFertilizer or fData.needsLime or fData.needsWeeding or fData.needsPlowing or fData.needsRolling

        --- No crop planted yet (even if groundType forced growthState>0 for cultivated soil).
        local noCrop = (fData.fruitTypeIndex or 0) == 0
        local gsGrow = fData.growthState or 0
        --- Weeds: weeder/hoe only at growth stage 2 or below; herbicide once past that (if still weedy).
        local weedUseMechanical = fData.needsWeeding and gsGrow <= 2
        local weedUseHerbicide = fData.needsWeeding and gsGrow > 2

        --- Unique priorities (ascending = suggested order). Avoid ties so sort is stable across Lua versions.
        local PR = {
            harvest = 10,
            fallow_soil = 101, fallow_mulch = 102, fallow_plow = 103, fallow_cult = 104,
            fallow_lime = 105, fallow_organic = 106, fallow_sow = 107, fallow_wait = 108,
            grow_soil = 201, grow_lime = 202, grow_roll = 203, grow_weed_m = 204,
            grow_organic = 205, grow_fert = 206, grow_herb = 207
        }

        if fData.isWithered then
            if isGrass then
                table.insert(fData.suggestions, {priority = PR.harvest, type = "harvest", action = "Harvest grass", reason = "Grass is ready to cut"})
            else
                table.insert(fData.suggestions, {priority = PR.harvest, type = "harvest", action = "Harvest withered crop", reason = "Crop has withered"})
            end
        elseif not noCrop and fData.harvestReady and mulchLv < 1 and not fData.isHarvested and fData.growthLabel ~= "harvested" then
            local harvestAction = isGrass and "Harvest grass" or "Harvest crop"
            local harvestReason = isGrass and "Grass is ready to cut" or "Crop is ready for harvest"
            table.insert(fData.suggestions, {priority = PR.harvest, type = "harvest", action = harvestAction, reason = harvestReason})
        elseif noCrop and fData.hectares > 0 then
            --- Fallow: soil scan â†’ mulch (arable) â†’ plow â†’ cultivate â†’ lime â†’ organic â†’ sow (scan first when soil maps are active).
            if isPF and not isScanned then
                table.insert(fData.suggestions, {priority = PR.fallow_soil, type = "preparation", action = "Soil scan", reason = "Scan field before lime and planting decisions"})
            end
            if not isGrass and fData.needsPlowing and mulchLv < 1 then
                table.insert(fData.suggestions, {
                    priority = PR.fallow_mulch, type = "preparation", action = "Mulch field",
                    reason = "Shred stubble after harvest before ploughing (not used for grass reseeding)."
                })
            elseif fData.needsPlowing then
                table.insert(fData.suggestions, {
                    priority = PR.fallow_plow, type = "preparation", action = "Plow field",
                    reason = "Field data indicates this parcel should be ploughed before continuing."
                })
            end
            if mulchLv >= 1 then
                table.insert(fData.suggestions, {
                    priority = PR.fallow_cult, type = "preparation", action = "Cultivate field",
                    reason = "Work in mulched stubble before lime and drilling."
                })
            end
            if isPF and isScanned and fData.needsLime then
                local tgt = phTarget > 0 and string.format("%.1f", phTarget) or "6.5"
                local band = phTarget > 0 and string.format("%.1f", phTarget - 0.2) or "6.3"
                table.insert(fData.suggestions, {priority = PR.fallow_lime, type = "maintenance", action = "Apply lime", reason = string.format("Avg pH %.1f / target %s (lime before seeding; below ~%s)%s", phLevel, tgt, band, TYRE_NOTE_ON_CROP)})
            elseif not isPF and fData.needsLime then
                table.insert(fData.suggestions, {priority = PR.fallow_lime, type = "maintenance", action = "Apply lime", reason = "Correct pH before seeding" .. TYRE_NOTE_ON_CROP})
            end
            if isPF and isScanned and nTarget > 0 and fData.needsFertilizer then
                table.insert(fData.suggestions, {
                    priority = PR.fallow_organic, type = "maintenance", action = "Spread manure or slurry",
                    reason = "Optional organic application before mineral fertiliser if you use manure/slurry in your rotation." .. FERT_ORGANIC_FIRST
                })
            end
            local canSowFallow = (not fData.needsPlowing) or ((fData.plowLevel or 0) >= 1)
            local pfReadyToSow = (not isPF) or isScanned
            if canSowFallow and pfReadyToSow then
                local mulched = mulchLv >= 1
                local reason = mulched
                    and "Soil prepared after mulching/cultivation; sow or plant."
                    or "Soil prepared; sow or plant your next crop."
                table.insert(fData.suggestions, {priority = PR.fallow_sow, type = "planting", action = "Sow or plant crop", reason = reason})
            elseif not canSowFallow then
                table.insert(fData.suggestions, {
                    priority = PR.fallow_wait, type = "planting", action = "Cultivate or direct drill",
                    reason = "Complete mulch and ploughing first, then sow or plant."
                })
            elseif isPF and not isScanned then
                table.insert(fData.suggestions, {
                    priority = PR.fallow_wait, type = "planting", action = "Sow after soil scan",
                    reason = "When soil mapping is active, scan the field first; then lime and organic targets apply before drilling."
                })
            end
        elseif not noCrop and fData.growthState > 0 and not fData.harvestReady then
            local deferEarlyN = isPF and isScanned and nTarget > 0 and gsGrow <= 2 and nLevel >= (nTarget * (1 - NUTRIENT_CLOSE_FRAC))
            local limeOkGrow = fData.needsLime and (isGrass or gsGrow <= 3)

            --- Grass after mowing: lime + fertiliser only (no tillage scan â€” PF scan is optional for pasture; use HUD / manual sampling).
            if grassMownRegrowth then
                if isPF and isScanned and limeOkGrow then
                    local tgt = phTarget > 0 and string.format("%.1f", phTarget) or "6.5"
                    local band = phTarget > 0 and string.format("%.1f", phTarget - 0.2) or "6.3"
                    table.insert(fData.suggestions, {priority = PR.grow_lime, type = "maintenance", action = "Apply lime", reason = string.format("Regrowth after cut â€” pH %.1f / target %s (below ~%s).%s", phLevel, tgt, band, TYRE_NOTE_ON_CROP)})
                elseif not isPF and limeOkGrow then
                    table.insert(fData.suggestions, {priority = PR.grow_lime, type = "maintenance", action = "Apply lime", reason = "Regrowth after mowing â€” correct pH if needed." .. TYRE_NOTE_ON_CROP})
                end
                if isPF and isScanned and nTarget > 0 and fData.needsFertilizer then
                    table.insert(fData.suggestions, {
                        priority = PR.grow_organic, type = "maintenance", action = "Spread slurry or manure",
                        reason = "Optional on grass: apply slurry or manure if you use organic nutrients before mineral fertiliser." .. FERT_ORGANIC_FIRST
                    })
                end
                if isPF and isScanned and fData.needsFertilizer and nTarget > 0 then
                    table.insert(fData.suggestions, {
                        priority = PR.grow_fert, type = "maintenance", action = "Apply fertiliser",
                        reason = string.format("Grass regrowth: solid or liquid mineral fertiliser to match target (~%.0f kg N/ha) if needed.%s", nTarget, TYRE_NOTE_ON_CROP)
                    })
                elseif not isPF and fData.needsFertilizer then
                    table.insert(fData.suggestions, {
                        priority = PR.grow_fert, type = "maintenance", action = "Apply fertiliser",
                        reason = "Grass regrowth after cut â€” top up with any fertiliser type as needed." .. TYRE_NOTE_ON_CROP
                    })
                end
                do
                    local canAssess = (not isPF) or isScanned
                    if canAssess and (not fData.needsLime) and (not fData.needsFertilizer) then
                        table.insert(fData.suggestions, {
                            priority = 208,
                            type = "info",
                            action = "Allow regrowth",
                            reason = "Lime and fertiliser needs are met â€” grass will progress toward the next cut.",
                        })
                    end
                end
            else
                --- Growing crop: soil â†’ lime â†’ roll â†’ mechanical weeds â†’ organic â†’ mineral â†’ herbicide.
                if isPF and not isScanned then
                    table.insert(fData.suggestions, {priority = PR.grow_soil, type = "info", action = "Soil scan", reason = "Scan field for nitrogen and pH targets"})
                end
                if isPF and isScanned and limeOkGrow then
                    local tgt = phTarget > 0 and string.format("%.1f", phTarget) or "6.5"
                    local band = phTarget > 0 and string.format("%.1f", phTarget - 0.2) or "6.3"
                    table.insert(fData.suggestions, {priority = PR.grow_lime, type = "maintenance", action = "Apply lime", reason = string.format("Avg pH %.1f / soil target %s (below ~%s)%s", phLevel, tgt, band, TYRE_NOTE_ON_CROP)})
                elseif not isPF and limeOkGrow then
                    table.insert(fData.suggestions, {priority = PR.grow_lime, type = "maintenance", action = "Apply lime", reason = "Soil pH needs correction" .. TYRE_NOTE_ON_CROP})
                end
                if fData.needsRolling then
                    table.insert(fData.suggestions, {priority = PR.grow_roll, type = "maintenance", action = "Roll field", reason = "First growth stage after planting â€” roll if needed."})
                end
                if weedUseMechanical then
                    local wp = weedPercentForDisplay(fData.weedLevel)
                    table.insert(fData.suggestions, {
                        priority = PR.grow_weed_m, type = "maintenance", action = "Weed with weeder or hoe",
                        reason = string.format("Weeds ~%.0f%% â€” use weeder or hoe at early growth (about stage 2 or below).", wp)
                    })
                end
                if isPF and isScanned and nTarget > 0 and fData.needsFertilizer then
                    table.insert(fData.suggestions, {
                        priority = PR.grow_organic, type = "maintenance", action = "Spread slurry or manure",
                        reason = "If using organic nutrients, apply slurry or solid manure before mineral fertiliser." .. FERT_ORGANIC_FIRST
                    })
                end
                if isPF and isScanned and fData.needsFertilizer and nTarget > 0 and not deferEarlyN then
                    table.insert(fData.suggestions, {
                        priority = PR.grow_fert, type = "maintenance", action = "Apply fertiliser (solid or liquid)",
                        reason = string.format("Nitrogen: %.0f / %.0f kg/ha â€” mineral fertiliser after organic if used.%s%s", nLevel, nTarget, FERT_ORGANIC_FIRST, TYRE_NOTE_ON_CROP)
                    })
                elseif not isPF and fData.needsFertilizer then
                    local reason = string.format("Fertilization level: %d/2.%s", fData.fertilizationLevel or 0, FERT_ORGANIC_FIRST)
                    if (fData.fertilizationLevel or 0) >= 1 then
                        reason = reason .. " Second pass to reach full level."
                    end
                    table.insert(fData.suggestions, {priority = PR.grow_fert, type = "maintenance", action = "Apply fertiliser (solid or liquid)", reason = reason .. TYRE_NOTE_ON_CROP})
                end
                if weedUseHerbicide then
                    local wp = weedPercentForDisplay(fData.weedLevel)
                    table.insert(fData.suggestions, {
                        priority = PR.grow_herb, type = "maintenance", action = "Apply herbicide",
                        reason = string.format("Weeds ~%.0f%% â€” past early growth; use herbicide sprayer if mechanical weeding is no longer ideal.%s", wp, TYRE_NOTE_ON_CROP)
                    })
                end
            end
        end

        table.sort(fData.suggestions, function(a, b)
            local pa, pb = a.priority or 999, b.priority or 999
            if pa ~= pb then return pa < pb end
            return tostring(a.action or "") < tostring(b.action or "")
        end)

        -- Stubble mulch (same source as fields.xml stubbleShredLevel); expose for API/UI parity
        local stubble = fData.mulchLevel or 0
        fData.stubbleShredLevel = stubble
        fData.isMulched = (stubble >= 1)

        if (fData.fruitTypeIndex or 0) == 0 then
            if stubble >= 1 then
                fData.fruitType = "mulched_stubble"
                fData.stateName = "Mulched"
                fData.growthLabel = "mulched_fallow"
            else
                fData.fruitType = "empty"
            end
        end

        -- ====================================================================
        -- Windrow / swath + bales (whole-field â€” rules-engine.js Layer 1 heuristics)
        -- Loose swaths are DensityMapHeightTypes, not FieldState properties.
        -- Module 2 in FarmHub/docs/FS25 Engine Interaction Modules.txt shows getDensityAtWorldPos(terrainDetailHeightId);
        -- FS25 windrow litres per material use DensityMapHeightUtil.getFillLevelAtArea(fillTypeIndex, ...) instead (fill-type channels).
        -- Uses DensityMapHeightUtil.getFillLevelAtArea(fillTypeIndex, sx,sz, wx,wz, hx,hz)
        -- Bale-relevant: STRAW + TEDDER converter sources/targets (grass/hay families) + named windrow fallbacks
        -- (grass â†” hay / dry grass), optional HAY; cereal *_SWATH types are probed for totals only.
        -- windrowByFillName: per-type summed probe volume (engine liters) for UI / classification.
        -- needsBaling / baleableLooseLiters: straw + grass/hay only (not unthreshed crop swaths).
        -- ====================================================================
        fData.windrowLiters = 0
        fData.windrowType = FD_JSON_NULL_STR
        fData.windrowArea = 0
        fData.windrowSamples = {}
        fData.hasWindrow = false
        fData.windrowByFillName = {}
        fData.needsBaling = false
        fData.baleableLooseLiters = 0
        fData.baleCountOnField = 0

        FieldDataCollector:cacheWindrowFillTypeIndices()

        local myFid = field.farmland and field.farmland.id or nil
        local function farmlandIdAtWorld(sx, sz)
            if not _G.g_farmlandManager or not _G.g_farmlandManager.getFarmlandAtWorldPosition then
                return nil
            end
            local ok, fm = pcall(function()
                return _G.g_farmlandManager:getFarmlandAtWorldPosition(sx, sz)
            end)
            if not ok or not fm then return nil end
            local fid = fm.id
            if fid == nil and type(fm.getId) == "function" then
                local ok2, id2 = pcall(function() return fm:getId() end)
                if ok2 and id2 ~= nil then fid = id2 end
            end
            if fid == nil then fid = fm end
            return tonumber(fid)
        end
        local function onThisField(sx, sz)
            if not myFid then
                return true
            end
            local fid = farmlandIdAtWorld(sx, sz)
            if fid == nil then
                return false
            end
            return fid == tonumber(myFid)
        end

        --- Axis-aligned rectangle as three corners (parallelogram API): s, s+w, s+h
        local function fillLevelSumAtRect(dmhu, fillTypeIndex, cx, cz, half)
            if not dmhu or not fillTypeIndex or fillTypeIndex <= 0 then return 0 end
            local sx, sz = cx - half, cz - half
            local wx, wz = cx + half, cz - half
            local hx, hz = cx - half, cz + half
            local ok, v = pcall(function()
                return dmhu.getFillLevelAtArea(fillTypeIndex, sx, sz, wx, wz, hx, hz)
            end)
            if ok and v ~= nil and type(v) == "number" and v == v then
                return math.max(0, v)
            end
            return 0
        end

        --- Same entry point as stock / Moisture System (`DensityMapHeightUtil.getFillLevelAtArea`).
        --- Try several bindings: global can be absent from `rawget(_G,â€¦)` in some loads; mission may expose an instance.
        local function resolveDensityMapHeightUtil()
            local function tryUtil(u)
                if u == nil or type(u) ~= "table" then
                    return nil
                end
                local fn = u.getFillLevelAtArea
                if type(fn) == "function" then
                    return u
                end
                return nil
            end
            local mission = _G.g_currentMission
            local function add(u)
                local t = tryUtil(u)
                if t then return t end
                return nil
            end
            local a = add(rawget(_G, "DensityMapHeightUtil"))
            if a then return a end
            local okb, bare = pcall(function()
                return DensityMapHeightUtil
            end)
            if okb then
                a = add(bare)
                if a then return a end
            end
            a = add(rawget(_G, "g_densityMapHeightUtil"))
            if a then return a end
            if mission then
                a = add(mission.densityMapHeightUtil)
                if a then return a end
                a = add(mission.densityHeightUtil)
                if a then return a end
                if type(mission.getDensityMapHeightUtil) == "function" then
                    local ok, r = pcall(function() return mission:getDensityMapHeightUtil() end)
                    if ok then
                        a = add(r)
                        if a then return a end
                    end
                end
                local mgr = rawget(_G, "g_densityMapHeightManager")
                if mgr then
                    if type(mgr.getDensityMapHeightUtil) == "function" then
                        local ok2, r2 = pcall(function() return mgr:getDensityMapHeightUtil() end)
                        if ok2 then
                            a = add(r2)
                            if a then return a end
                        end
                    end
                    if type(mgr.getUtil) == "function" then
                        local ok3, r3 = pcall(function() return mgr:getUtil() end)
                        if ok3 then
                            a = add(r3)
                            if a then return a end
                        end
                    end
                end
            end
            return nil
        end

        local dmhu = resolveDensityMapHeightUtil()
        if dmhu and type(dmhu.getFillLevelAtArea) == "function" then
            local ftm = _G.g_fillTypeManager
            --- Classify bale pickup types: STRAW, TEDDER grass/hay pairs, optional HAY + GRASS_WINDROW / DRYGRASS_WINDROW names
            local function fillDisplayName(idx)
                if not ftm or type(ftm.getFillTypeNameByIndex) ~= "function" then
                    return "FILL_" .. tostring(idx)
                end
                local okn, nn = pcall(function() return ftm:getFillTypeNameByIndex(idx) end)
                if okn and nn and nn ~= "" then return nn end
                return "FILL_" .. tostring(idx)
            end
            local function buildBaleableEntries()
                local list = {}
                _clearKeyedPool(_pool_fillIdxSeen)
                local seen = _pool_fillIdxSeen
                local function addIndex(idx)
                    if not idx or type(idx) ~= "number" or idx <= 0 or seen[idx] then return end
                    seen[idx] = true
                    table.insert(list, { name = fillDisplayName(idx), index = idx, baleable = true })
                end
                local FillTypeT = rawget(_G, "FillType")
                if FillTypeT and FillTypeT.STRAW then
                    addIndex(FillTypeT.STRAW)
                end
                if ftm and type(ftm.getFillTypeIndexByName) == "function" then
                    local okS, stIdx = pcall(function() return ftm:getFillTypeIndexByName("STRAW") end)
                    if okS and stIdx and type(stIdx) == "number" and stIdx > 0 then addIndex(stIdx) end
                    local okH, hayIdx = pcall(function() return ftm:getFillTypeIndexByName("HAY") end)
                    if okH and hayIdx and type(hayIdx) == "number" and hayIdx > 0 then addIndex(hayIdx) end
                end
                if ftm and type(ftm.getConverterDataByName) == "function" then
                    local okc, conv = pcall(function() return ftm:getConverterDataByName("TEDDER") end)
                    if okc and type(conv) == "table" then
                        for fromFt, to in pairs(conv) do
                            if to and to.targetFillTypeIndex then
                                local tgt = to.targetFillTypeIndex
                                if fromFt and tgt and fromFt ~= tgt then
                                    addIndex(fromFt)
                                    addIndex(tgt)
                                end
                            end
                        end
                    end
                end
                if ftm and type(ftm.getFillTypeIndexByName) == "function" then
                    for _, nm in ipairs({ "GRASS_WINDROW", "DRYGRASS_WINDROW" }) do
                        local okx, j = pcall(function() return ftm:getFillTypeIndexByName(nm) end)
                        if okx and j and type(j) == "number" and j > 0 and not seen[j] then
                            seen[j] = true
                            table.insert(list, { name = nm, index = j, baleable = true })
                        end
                    end
                end
                return list
            end
            --- Cereal / crop swaths (combine pick-up etc.) â€” included in windrowLiters / hasWindrow, not in needsBaling.
            local swathFillNames = {
                "WHEAT_SWATH", "BARLEY_SWATH", "OAT_SWATH", "CANOLA_SWATH", "SORGHUM_SWATH", "SOYBEAN_SWATH",
                "SUNFLOWER_SWATH", "MAIZE_SWATH", "RICE_SWATH", "COTTON_SWATH", "GREENBEAN_SWATH",
            }
            local function buildSwathOnlyEntries()
                local list = {}
                if not ftm or type(ftm.getFillTypeIndexByName) ~= "function" then return list end
                for _, nm in ipairs(swathFillNames) do
                    local okIdx, idx = pcall(function() return ftm:getFillTypeIndexByName(nm) end)
                    if okIdx and idx ~= nil and type(idx) == "number" and idx > 0 then
                        table.insert(list, { name = nm, index = idx, baleable = false })
                    end
                end
                return list
            end
            local balePart = buildBaleableEntries()
            local swathPart = buildSwathOnlyEntries()
            _clearKeyedPool(_pool_windByIdx)
            local byIdx = _pool_windByIdx
            for _, ent in ipairs(balePart) do
                byIdx[ent.index] = { name = ent.name, index = ent.index, baleable = true }
            end
            for _, ent in ipairs(swathPart) do
                if not byIdx[ent.index] then
                    byIdx[ent.index] = { name = ent.name, index = ent.index, baleable = false }
                end
            end
            --- Align with the engine object list: `g_densityMapHeightManager:getDensityMapHeightTypes()`
            --- lists every fill type registered on the terrain detail height map (straw, windrows, chaff heaps, etc.).
            --- Probing only TEDDER + hardcoded swaths can miss types; merging the manager list matches what the game uses for map / tip visibility.
            do
                local dmm = rawget(_G, "g_densityMapHeightManager")
                if dmm and type(dmm.getIsValid) == "function" and dmm:getIsValid() and type(dmm.getDensityMapHeightTypes) == "function" then
                    local okList, htypes = pcall(function() return dmm:getDensityMapHeightTypes() end)
                    if okList and type(htypes) == "table" then
                        local FillTypeT = rawget(_G, "FillType")
                        local skipTarp = FillTypeT and FillTypeT.TARP or nil
                        for _, heightType in ipairs(htypes) do
                            if heightType and type(heightType.fillTypeIndex) == "number" and heightType.fillTypeIndex > 0 then
                                local fidx = heightType.fillTypeIndex
                                if skipTarp and fidx == skipTarp then
                                    -- Skip TARP for ground material lists (matches engine ground-tip visibility)
                                elseif not byIdx[fidx] then
                                    byIdx[fidx] = { name = fillDisplayName(fidx), index = fidx, baleable = false }
                                end
                            end
                        end
                    end
                end
            end
            local windEntries = {}
            for _, ent in pairs(byIdx) do
                table.insert(windEntries, ent)
            end

            fData.windrowUtilAvailable = true
            fData.windrowFillTypesRegistered = #windEntries
            do
                local ctot = 0
                for _, ent in ipairs(windEntries) do
                    ctot = ctot + fillLevelSumAtRect(dmhu, ent.index, cx, cz, 12.0)
                end
                --- One large sample at field centre across STRAW / windrows / swaths â€” matches what balers read from the same height-map channels.
                fData.windrowCenterProbeTotalL = ctot
            end

            --- Sparse grid scaled to field size (~18 m minimum step; wider on large parcels so swaths away from center are seen).
            local halfM = 9.0
            local areaSqm = fData.fieldAreaInSqm or 0
            local rf = math.sqrt(math.max(1, areaSqm) / math.pi)
            local step1 = math.min(72, math.max(18, rf * 0.28))
            local step2 = step1 * 2
            local step3 = math.min(90, step1 * 3)
            local windProbeOffsets = {
                {0, 0},
                {step1, 0}, {-step1, 0}, {0, step1}, {0, -step1},
                {step1, step1}, {-step1, -step1}, {step1, -step1}, {-step1, step1},
                {step2, 0}, {-step2, 0}, {0, step2}, {0, -step2},
                {step3, 0}, {-step3, 0}, {0, step3}, {0, -step3},
            }
            local totalVol = 0
            local baleVol = 0
            local function addProbeCell(sx, sz)
                local cellSum = 0
                for _, ent in ipairs(windEntries) do
                    local v = fillLevelSumAtRect(dmhu, ent.index, sx, sz, halfM)
                    cellSum = cellSum + v
                    fData.windrowByFillName[ent.name] = (fData.windrowByFillName[ent.name] or 0) + v
                    if ent.baleable then
                        baleVol = baleVol + v
                    end
                end
                totalVol = totalVol + cellSum
                table.insert(fData.windrowSamples, cellSum)
            end
            local samplesAdded = 0
            for _, off in ipairs(windProbeOffsets) do
                local sx, sz = cx + off[1], cz + off[2]
                if onThisField(sx, sz) then
                    addProbeCell(sx, sz)
                    samplesAdded = samplesAdded + 1
                end
            end
            --- If every probe was rejected (farmland id mismatch at center/edges, or map returns nil), still sample at field center â€” otherwise windrow stays blank for valid in-field material.
            if samplesAdded == 0 then
                addProbeCell(cx, cz)
            end
            fData.windrowLiters = math.floor(math.max(0, tonumber(totalVol) or 0) + 0.5)
            fData.baleableLooseLiters = baleVol
            --- needsBaling set after hasLoose* from straw/grass/hay aggregates (see below)
            local nS = #(fData.windrowSamples)
            if totalVol > 0 and fData.fieldAreaInSqm and fData.fieldAreaInSqm > 0 and nS > 0 then
                local tileSq = (2 * halfM) * (2 * halfM)
                fData.windrowArea = math.min(fData.fieldAreaInSqm, nS * tileSq)
            else
                fData.windrowArea = 0
            end
            fData.hasWindrow = (fData.windrowLiters > 0)
            --- Aggregate per fill name (terrainDetailHeight grass/straw/hay channels â€” see Dynamic Ground Material & Transform doc).
            --- Cereal / crop *_SWATH channels count toward looseStrawLiters for dashboard + rules (same as loose harvest residue before baling).
            local aggS, aggG, aggH = 0, 0, 0
            for name, vol in pairs(fData.windrowByFillName) do
                local u = string.upper(tostring(name))
                local vv = tonumber(vol) or 0
                if u == "STRAW" then
                    aggS = aggS + vv
                elseif string.sub(u, -6) == "_SWATH" then
                    aggS = aggS + vv
                elseif u == "GRASS_WINDROW" then
                    aggG = aggG + vv
                elseif u == "DRYGRASS_WINDROW" or u == "HAY" then
                    aggH = aggH + vv
                end
            end
            fData.looseStrawLiters = aggS
            fData.looseGrassWindrowLiters = aggG
            fData.looseDryGrassWindrowLiters = aggH
            --- Noise floor (L) â€” any amount above this counts as "present" for workflow; not shown as a quantity to the player.
            local PRESENCE_EPS = 0.01
            fData.hasLooseStraw = (aggS > PRESENCE_EPS)
            fData.hasLooseGrassWindrow = (aggG > PRESENCE_EPS)
            fData.hasLooseHayWindrow = (aggH > PRESENCE_EPS)
            fData.hasLooseForage = fData.hasLooseStraw or fData.hasLooseGrassWindrow or fData.hasLooseHayWindrow
            --- Align "needs baling / clear forage" step with straw+grass+hay presence (not cereal swath-only heaps).
            fData.needsBaling = fData.hasLooseForage
            --- Below this combined bale-relevant volume (straw + grass + hay windrows, engine litres), skip forage / baling workflow â€” trace residue only.
            local FORAGE_WORKFLOW_MIN_L = 2000
            local combinedForageL = aggS + aggG + aggH
            if combinedForageL < FORAGE_WORKFLOW_MIN_L then
                fData.hasLooseStraw = false
                fData.hasLooseGrassWindrow = false
                fData.hasLooseHayWindrow = false
                fData.hasLooseForage = false
                fData.needsBaling = false
            end
            --- Single dominant class for dashboard (Straw / Grass / Hay); JSON null when empty (see FD_JSON_NULL_STR).
            fData.windrowType = classifyWindrowTypeForJson(aggS, aggG, aggH, fData.windrowLiters)
            local grassIdx, hayIdx = nil, nil
            if ftm and type(ftm.getFillTypeIndexByName) == "function" then
                local okG, gi = pcall(function() return ftm:getFillTypeIndexByName("GRASS_WINDROW") end)
                if okG then grassIdx = tonumber(gi) end
                local okH, hi = pcall(function() return ftm:getFillTypeIndexByName("DRYGRASS_WINDROW") end)
                if okH then hayIdx = tonumber(hi) end
            end
            _attachWindrowMoisture(fData, cx, cz, grassIdx, hayIdx, aggG, aggH)
        else
            fData.windrowLiters = 0
            fData.windrowType = FD_JSON_NULL_STR
            fData.windrowArea = 0
            fData.hasWindrow = false
            fData.windrowByFillName = {}
            fData.needsBaling = false
            fData.baleableLooseLiters = 0
            fData.looseStrawLiters = 0
            fData.looseGrassWindrowLiters = 0
            fData.looseDryGrassWindrowLiters = 0
            fData.hasLooseStraw = false
            fData.hasLooseGrassWindrow = false
            fData.hasLooseHayWindrow = false
            fData.hasLooseForage = false
            fData.windrowUtilAvailable = false
            fData.windrowFillTypesRegistered = 0
            fData.windrowCenterProbeTotalL = 0
        end

        --- Match counts to this row: try farmland id, FieldManager field id, and internal index (keys may differ by map).
        if displayId and displayId > 0 then
            local n = farmlandBaleCounts[displayId] or 0
            if fieldId and tonumber(fieldId) and tonumber(fieldId) ~= tonumber(displayId) then
                n = math.max(n, farmlandBaleCounts[tonumber(fieldId)] or 0)
            end
            if type(field.getId) == "function" then
                local okFi, fi = pcall(function() return field:getId() end)
                if okFi and fi ~= nil then
                    local fk = tonumber(fi)
                    if fk and fk > 0 then
                        n = math.max(n, farmlandBaleCounts[fk] or 0)
                    end
                end
            end
            fData.baleCountOnField = n
            local onFieldBucket = farmlandBaleOnFieldBuckets[displayId]
            if onFieldBucket and rawget(_G, "FillTypeUtils") and FillTypeUtils.serializeBaleBucket then
                fData.baleOnFieldByCategory = FillTypeUtils.serializeBaleBucket(onFieldBucket)
            end
            --- When bales are counted, surface an explicit suggestion (priority before grow_herb / fallow so JSON + UI match).
            if n > 0 then
                local act = (n == 1) and "Collect or move 1 bale off this field"
                    or string.format("Collect or move %d bales off this field", n)
                table.insert(fData.suggestions, {
                    priority = 18,
                    type     = "maintenance",
                    action   = act,
                    reason   = "Physical bale(s) on this farmland â€” clear them before cultivation or drilling.",
                })
            end
            --- Loose straw / grass / hay: presence-only (next workflow stage when all false).
            local PR_FORAGE = 11
            local hs = fData.hasLooseStraw == true
            local hg = fData.hasLooseGrassWindrow == true
            local hh = fData.hasLooseHayWindrow == true
            if hs or hg or hh then
                local function ins(pri, act, rsn)
                    table.insert(fData.suggestions, { priority = pri, type = "maintenance", action = act, reason = rsn })
                end
                if hs and not hg and not hh then
                    ins(PR_FORAGE, "Bale loose straw or pick up with a forage wagon",
                        "Loose straw on the field â€” bale or collect before tillage or the next pass.")
                elseif hg and not hs and not hh then
                    ins(PR_FORAGE, "Tedder to make hay, or bale wet and wrap for silage",
                        "Fresh grass windrow on the field â€” tedder to dry for hay, or bale while wet and wrap bales for silage.")
                elseif hh and not hs and not hg then
                    ins(PR_FORAGE, "Bale hay windrow or collect dry forage",
                        "Hay / dry grass windrow on the field â€” bale or load before rain or soil work.")
                elseif hs and hg and hh then
                    ins(PR_FORAGE, "Clear loose straw, grass, or hay windrows",
                        "Straw, grass, and hay windrows detected on the ground â€” clear forage before the next field stage.")
                elseif hs and hg then
                    ins(PR_FORAGE, "Clear loose straw and grass windrows",
                        "Straw and grass windrows on the field â€” bale or collect before continuing.")
                elseif hs and hh then
                    ins(PR_FORAGE, "Clear loose straw and hay",
                        "Straw and hay windrows on the field â€” bale or collect before continuing.")
                elseif hg and hh then
                    ins(PR_FORAGE, "Clear grass and hay windrows",
                        "Grass and hay windrows on the field â€” finish drying/baling before the next stage.")
                else
                    ins(PR_FORAGE, "Clear loose forage on the field",
                        "Loose forage material detected â€” bale or collect before the next field stage.")
                end
            end
            if (n or 0) > 0 or (fData.hasLooseForage == true) then
                table.sort(fData.suggestions, function(a, b)
                    local pa, pb = a.priority or 999, b.priority or 999
                    if pa ~= pb then return pa < pb end
                    return tostring(a.action or "") < tostring(b.action or "")
                end)
            end
        else
            fData.baleCountOnField = 0
        end

        _attachFieldMoisture(fData, cx, cz)
        fData.weedPercent = weedPercentForDisplay(fData.weedLevel)
        fData.weedAlertThresholdPct = 15

        table.insert(fieldData, fData)
        fieldCoopTick()
        end
    end

    if st and st.partial then
        st.fieldData = fieldData
        return fieldData
    end

    table.sort(fieldData, function(a, b) return a.id < b.id end)
    if FieldDataCollector._yieldEvery then
        FieldDataCollector._yieldEvery = nil
        FieldDataCollector._baleYieldStride = nil
    end
    return fieldData
end
