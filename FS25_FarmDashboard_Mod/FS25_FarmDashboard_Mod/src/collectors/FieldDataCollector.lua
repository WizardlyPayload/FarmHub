-- FS25 FarmDashboard | FieldDataCollector.lua | v2.0.0

FieldDataCollector = {}

function FieldDataCollector:init()
    print("[FarmDashboard] Field data collector initialized (Hybrid: NPC State + Physical HUD Probe)")
end

function FieldDataCollector:collect()
    local fieldData = {}
    
    if not _G.g_currentMission then return fieldData end
    if not _G.g_fieldManager or not _G.g_fieldManager.fields then return fieldData end

    --- Shown on lime / fertiliser / nitrogen / weed-spray suggestions (limit crop trampling).
    local TYRE_NOTE_ON_CROP = " Use narrow tyres when working on the crop (lime, fertiliser, spray)."
    --- When combining several nutrient sources, organic liquids/solids before mineral (player guidance).
    local FERT_ORGANIC_FIRST = " Prefer manure or slurry before solid or liquid mineral fertilizer when using multiple products."
    --- If N or pH is within this fraction of target, treat as met so the next suggestion can surface (dashboard tuning).
    local NUTRIENT_CLOSE_FRAC = 0.05
    --- FS25 grass: exactly 4 growth stages on the field map. Other crops use their fruit type's own stage count
    --- (`numGrowthStates`, min/max harvest) — e.g. maize 7, wheat 8. Grass may still report extra engine indices;
    --- we cap exported `maxGrowthState` to this value for the dashboard while keeping `engineNumGrowthStates` raw.
    local GRASS_GROWTH_STAGES = 4

    -- ====================================================================
    -- PRECISION FARMING DETECTION
    -- ====================================================================
    local isPF = false
    local pfInstance = nil
    if _G.FS25_precisionFarming and _G.FS25_precisionFarming.g_precisionFarming then 
        isPF = true 
        pfInstance = _G.FS25_precisionFarming.g_precisionFarming
    elseif _G.g_precisionFarming then 
        isPF = true 
        pfInstance = _G.g_precisionFarming
    end
    
    local currentFarmId = 1
    if _G.g_currentMission.getFarmId then
        currentFarmId = _G.g_currentMission:getFarmId()
    elseif _G.g_currentMission.player and _G.g_currentMission.player.farmId then
        currentFarmId = _G.g_currentMission.player.farmId
    end
    
    local function callMethod(instance, methodName, ...)
        if not instance then return nil end
        if type(instance[methodName]) == "function" then
            local ok, res = pcall(instance[methodName], instance, ...)
            if ok and res ~= nil then return res end
        end
        return nil
    end

    --- Roller / soil compaction: FS `FieldState.rollerLevel` (FieldState.lua). After `update`, higher values mean *more rolling
    --- still required* / less compacted; lower = already rolled — opposite of a 0–1 “rolled progress”. We export `rollerLevel`
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

    --- Engine raw: low = already rolled, high = still needs rolling (0–1). Output: rolled fraction 0–1 for JSON/UI.
    local function rollerLevelAsRolledFraction(raw)
        raw = raw or 0
        if raw < 0 then raw = 0 end
        if raw > 1 and raw <= 255 then raw = raw / 255 end
        if raw > 1 then raw = 1 end
        return 1 - raw
    end

    --- Weed: integer 0–4 = FS stages; else 0–1 fraction; else 0–100 = percent. Normalize to 0–1.
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

    -- Create the NPC FieldState object (Used ONLY for unowned fields)
    local probeState = nil
    if _G.FieldState and _G.FieldState.new then
        local ok, fs = pcall(function() return _G.FieldState.new() end)
        if ok then probeState = fs end
    end
    
    for fieldId, field in pairs(_G.g_fieldManager.fields) do
        
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
            --- Raw `numGrowthStates` from fruit desc (per crop); grass may report extra indices vs the 4 map stages — see §2.
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
                elseif not foundCrop then
                    fData.fertilizationLevel = fs.sprayLevel or fData.fertilizationLevel
                    fData.plowLevel          = fs.plowLevel or fData.plowLevel
                    fData.limeLevel          = fs.limeLevel or fData.limeLevel
                    fData.weedLevel          = fs.weedState or fData.weedLevel
                    fData.mulchLevel         = fs.stubbleShredLevel or fData.mulchLevel
                    fData.groundType         = fs.groundType or fData.groundType
                end
            end
        end

        -- 1d. Grass: minimum growth state across field samples — the first hit offset often stays on the last
        -- "tall" stage briefly after mowing while other strips already read regrowth (fixes stale harvest_ready).
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
                    local localMin = fData.growthState or 999
                    local grassOffsets = {
                        {0, 0}, {5, 5}, {-5, -5}, {5, -5}, {-5, 5},
                        {12, 0}, {-12, 0}, {0, 12}, {0, -12},
                        {20, 0}, {-20, 0}, {0, 20}, {0, -20},
                    }
                    for _, off in ipairs(grassOffsets) do
                        local sx, sz = cx + off[1], cz + off[2]
                        if sampleOnThisFarmland(sx, sz) then
                            pcall(function() probeState:update(sx, sz) end)
                            local g = probeState.growthState
                            if g ~= nil and probeState.fruitTypeIndex == fi and g < localMin then localMin = g end
                        end
                    end
                    if localMin < 999 then fData.growthState = localMin end
                end
            end
        end

        -- 1b. No crop on probe: center read often misses mulched stubble — max stubble across offsets on this farmland
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

        -- 1c. Roller: read raw `rollerLevel`, export inverted rolled fraction for API/UI parity with HUD.
        do
            local raw = 0
            if field.fieldState and type(field.fieldState.update) == "function" then
                pcall(function() field.fieldState:update(cx, cz) end)
                raw = readRollerFromState(field.fieldState)
            elseif probeState and type(probeState.update) == "function" then
                pcall(function() probeState:update(cx, cz) end)
                raw = readRollerFromState(probeState)
            end
            fData.rollerLevel = rollerLevelAsRolledFraction(raw)
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
                if gsName == "harvested" then
                    fData.isHarvested  = true
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
                if ftUpper == "GRASS" and (fData.maxGrowthState or 0) > 0 and (fData.growthState or 0) > 0
                    and (fData.growthState or 0) < fData.maxGrowthState then
                    fData.harvestReady = false
                    fData.growthLabel  = "growing"
                    fData.stateName    = "Growing"
                    if maxStateToShow > 0 then
                        fData.growthStatePercentage = math.min(99, math.floor((fData.growthState / maxStateToShow) * 100))
                    end
                end
                -- Grass: growth index above the 4 map stages = mown / regrowth (not a 5th "growth" stage).
                if ftUpper == "GRASS" and (fData.growthState or 0) > (fData.maxGrowthState or GRASS_GROWTH_STAGES) then
                    fData.harvestReady = false
                    fData.growthLabel  = "growing"
                    fData.stateName    = "Growing"
                    if maxStateToShow > 0 then
                        local cap = fData.maxGrowthState or GRASS_GROWTH_STAGES
                        local pctGs = math.min(fData.growthState or 0, cap)
                        fData.growthStatePercentage = math.min(99, math.floor((pctGs / maxStateToShow) * 100))
                    end
                end
            end
        end

        -- ====================================================================
        -- 3. PRECISION FARMING RADIUS SCANNER
        -- ====================================================================
        local nLevel, nTarget, phLevel, phTarget = 0, 0, 0, 0
        local isScanned = false
        local sumPhBarMin, validPhBarMin = 0, 0

        --- Decode PF pH map raw 1..31 scale to pH if needed (same as ptPh).
        local function decodePhRaw(v)
            if not v or type(v) ~= "number" then return nil end
            if v >= 1 and v <= 31 and v % 1 == 0 then return (v * 0.125) + 4.375 end
            return v
        end

        --- Lower end of the "healthy" pH range for this soil type (for UI bar + lime band).
        --- Tries PF pHMap methods; falls back to optimal − margin (per soil sample).
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
                    -- skip points outside this field's farmland (prevents Field 4 inheriting Field 3 PF)
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
        fData.needsPlowing = fData.plowLevel < 1
        -- ~15%+ weeds (handles 0–1, 0–4 stages, or 0–100 percent-style reads)
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
                fData.nitrogenText       = string.format("%.0f / %.0f kg/ha", nLevel, nTarget)
                fData.limeText           = string.format("%.1f pH", phLevel)
                fData.fertilizationLevel = nTarget > 0 and math.min(2, (nLevel / nTarget) * 2) or 0
                -- Lime: use PF optimal pH for sampled soil types (targetPh); band matches in-game recommendation (~0.2 below target).
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
                -- N: within 5% of target → no further mineral fert suggestion (replaces fixed −10 kg/ha buffer).
                fData.needsFertilizer = nTarget > 0 and (nLevel < nTarget * (1 - NUTRIENT_CLOSE_FRAC))
            end
        else
            -- Non-PF: spray 0–2 and lime 0–1 — within ~5% of “full” counts as done for suggestion ordering.
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
        --- Grass regrowth after mowing (engine stage above map stages or explicit mown label) — not the same as first growth after seeding; lime + optional organic + mineral fertiliser.
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
            --- Fallow: Soil map → mulch (arable) → plow → cultivate → lime → organic → sow (sow only after PF scan if PF).
            if isPF and not isScanned then
                table.insert(fData.suggestions, {priority = PR.fallow_soil, type = "preparation", action = "Soil Map", reason = "Scan field before lime and planting decisions"})
            end
            if not isGrass and fData.needsPlowing and mulchLv < 1 then
                table.insert(fData.suggestions, {
                    priority = PR.fallow_mulch, type = "preparation", action = "Mulch field",
                    reason = "Shred stubble after harvest before ploughing (not used for grass reseeding)."
                })
            elseif fData.needsPlowing then
                table.insert(fData.suggestions, {
                    priority = PR.fallow_plow, type = "preparation", action = "Plow field",
                    reason = "Soil map indicates this field should be ploughed before continuing."
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
                    reason = "With Precision Farming, scan the field first; then lime/organic targets apply before drilling."
                })
            end
        elseif not noCrop and fData.growthState > 0 and not fData.harvestReady then
            local deferEarlyN = isPF and isScanned and nTarget > 0 and gsGrow <= 2 and nLevel >= (nTarget * (1 - NUTRIENT_CLOSE_FRAC))
            local limeOkGrow = fData.needsLime and (isGrass or gsGrow <= 3)

            --- Grass after mowing: only lime + any fertiliser (regrowth is not the same as first stage after seeding).
            if grassMownRegrowth then
                if isPF and not isScanned then
                    table.insert(fData.suggestions, {priority = PR.grow_soil, type = "info", action = "Soil Map", reason = "Scan for pH and nitrogen on regrowth after mowing."})
                end
                if isPF and isScanned and limeOkGrow then
                    local tgt = phTarget > 0 and string.format("%.1f", phTarget) or "6.5"
                    local band = phTarget > 0 and string.format("%.1f", phTarget - 0.2) or "6.3"
                    table.insert(fData.suggestions, {priority = PR.grow_lime, type = "maintenance", action = "Apply lime", reason = string.format("Regrowth after cut — pH %.1f / target %s (below ~%s).%s", phLevel, tgt, band, TYRE_NOTE_ON_CROP)})
                elseif not isPF and limeOkGrow then
                    table.insert(fData.suggestions, {priority = PR.grow_lime, type = "maintenance", action = "Apply lime", reason = "Regrowth after mowing — correct pH if needed." .. TYRE_NOTE_ON_CROP})
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
                        reason = "Grass regrowth after cut — top up with any fertiliser type as needed." .. TYRE_NOTE_ON_CROP
                    })
                end
            else
                --- Growing crop: soil → lime → roll → mechanical weeds → organic → mineral → herbicide.
                if isPF and not isScanned then
                    table.insert(fData.suggestions, {priority = PR.grow_soil, type = "info", action = "Soil Map", reason = "Scan field for nitrogen and pH targets"})
                end
                if isPF and isScanned and limeOkGrow then
                    local tgt = phTarget > 0 and string.format("%.1f", phTarget) or "6.5"
                    local band = phTarget > 0 and string.format("%.1f", phTarget - 0.2) or "6.3"
                    table.insert(fData.suggestions, {priority = PR.grow_lime, type = "maintenance", action = "Apply lime", reason = string.format("Avg pH %.1f / soil target %s (below ~%s)%s", phLevel, tgt, band, TYRE_NOTE_ON_CROP)})
                elseif not isPF and limeOkGrow then
                    table.insert(fData.suggestions, {priority = PR.grow_lime, type = "maintenance", action = "Apply lime", reason = "Soil pH needs correction" .. TYRE_NOTE_ON_CROP})
                end
                if fData.needsRolling then
                    table.insert(fData.suggestions, {priority = PR.grow_roll, type = "maintenance", action = "Roll field", reason = "First growth stage after planting — roll if needed."})
                end
                if weedUseMechanical then
                    local wp = weedPercentForDisplay(fData.weedLevel)
                    table.insert(fData.suggestions, {
                        priority = PR.grow_weed_m, type = "maintenance", action = "Weed with weeder or hoe",
                        reason = string.format("Weeds ~%.0f%% — use weeder or hoe at early growth (about stage 2 or below).", wp)
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
                        reason = string.format("Nitrogen: %.0f / %.0f kg/ha — mineral fertiliser after organic if used.%s%s", nLevel, nTarget, FERT_ORGANIC_FIRST, TYRE_NOTE_ON_CROP)
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
                        reason = string.format("Weeds ~%.0f%% — past early growth; use herbicide sprayer if mechanical weeding is no longer ideal.%s", wp, TYRE_NOTE_ON_CROP)
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

        table.insert(fieldData, fData)
    end

    table.sort(fieldData, function(a, b) return a.id < b.id end)
    return fieldData
end