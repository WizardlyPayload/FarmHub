-- FS25 FarmDashboard | InventoryScan.lua | v1.0.0
-- Single scan pipeline aligned with TSStockCheck (InGameMenuTSStockCheck.lua) + MoistureSystem hooks.
-- Used by StockDataCollector (liters) and BaleInventoryCollector (physical bale counts).

InventoryScan = {}

local MAX_FILL_TYPES_PER_FARM = 64
local MAX_LOCATIONS_PER_FILL = 16
local MAX_FARMS = 8
local BALE_LITER_ESTIMATE = 4000

local function _mission()
    return rawget(_G, "g_currentMission")
end

local function _ftm()
    return rawget(_G, "g_fillTypeManager")
end

local function _roundLiters(n)
    local v = tonumber(n)
    if v == nil then return 0 end
    return math.floor(v + 0.5)
end

function InventoryScan.collectPlayerFarmIds()
    local ids = {}
    local seen = {}
    if _G.g_farmManager and _G.g_farmManager.farms then
        for _, farm in pairs(_G.g_farmManager.farms) do
            local fid = farm and tonumber(farm.farmId)
            if fid and fid > 0 and not seen[fid] then
                local ok = false
                if farm.players then
                    for _ in pairs(farm.players) do ok = true break end
                end
                if not ok then
                    local name = farm.name and tostring(farm.name):match("^%s*(.-)%s*$") or ""
                    if name ~= "" then ok = true end
                end
                if ok then
                    seen[fid] = true
                    table.insert(ids, fid)
                end
            end
        end
    end
    if #ids == 0 then
        local m = _mission()
        if m and m.getFarmId then
            local ok, fid = pcall(function() return m:getFarmId() end)
            if ok and fid and fid > 0 then table.insert(ids, fid) end
        end
    end
    return ids
end

function InventoryScan.isPlayerFarmId(farmId)
    local fid = tonumber(farmId)
    if not fid or fid <= 0 then return false end
    for _, id in ipairs(InventoryScan.collectPlayerFarmIds()) do
        if id == fid then return true end
    end
    return false
end

--- TSStockCheck: placeable.ownerFarmId == farmId OR ownerFarmId == 0 on SP neutral buildings.
function InventoryScan.placeableOwnedByFarm(placeable, farmId)
    if not placeable then return false end
    local owner = tonumber(placeable.ownerFarmId)
    if owner == farmId then return true end
    if owner == 0 then
        local m = _mission()
        local cur = m and m.getFarmId and m:getFarmId() or 1
        return farmId == cur
    end
    return false
end

function InventoryScan.placeableName(placeable, fallback)
    if placeable and placeable.getName then
        local ok, n = pcall(function() return placeable:getName() end)
        if ok and n and tostring(n) ~= "" then return tostring(n) end
    end
    return fallback or "Storage"
end

function InventoryScan.resolveFillTypeIndex(val)
    if rawget(_G, "FillTypeUtils") and FillTypeUtils.coerceFillTypeIndex then
        return FillTypeUtils.coerceFillTypeIndex(val)
    end
    return tonumber(val)
end

--- Name + title from engine fillTypes table (TSStockCheck updateContent lines 167-180).
function InventoryScan.fillTypeMeta(fillTypeIndex)
    local idx = InventoryScan.resolveFillTypeIndex(fillTypeIndex)
    if not idx then return nil, nil end
    local ftm = _ftm()
    if ftm and ftm.fillTypes then
        for _, ft in pairs(ftm.fillTypes) do
            if ft and tonumber(ft.index) == idx then
                return tostring(ft.name or ""), tostring(ft.title or ft.name or "")
            end
        end
    end
    if rawget(_G, "FillTypeUtils") then
        return FillTypeUtils.nameForIndex(idx), FillTypeUtils.titleForIndex(idx)
    end
    return nil, nil
end

function InventoryScan.rebuildFillTypeCatalog()
    if rawget(_G, "FillTypeUtils") and FillTypeUtils.rebuildCatalog then
        FillTypeUtils.rebuildCatalog()
    end
    local out = {}
    if rawget(_G, "FillTypeUtils") and FillTypeUtils.catalogForJson then
        out = FillTypeUtils.catalogForJson()
    end
    local ftm = _ftm()
    if ftm and ftm.fillTypes then
        for _, ft in pairs(ftm.fillTypes) do
            if ft and ft.index and ft.name then
                out[tostring(ft.index)] = tostring(ft.name)
            end
        end
    end
    return out
end

local function _moistureSystem()
    local mission = _mission()
    if not mission then return nil end
    return mission.MoistureSystem or mission.moistureSystem
end

--- Moisture System keys silo fill by owning placeable.uniqueId (see FS25_MoistureSystem LoadingStationExtension).
local function _readUniqueId(entity)
    if not entity then return nil end
    local uid = rawget(entity, "uniqueId")
    if uid ~= nil then return tostring(uid) end
    if type(entity.getUniqueId) == "function" then
        local ok, v = pcall(function() return entity:getUniqueId() end)
        if ok and v ~= nil then return tostring(v) end
    end
    return nil
end

local function _objectInfoBucket(ms, uniqueId)
    if not ms or not ms.objectInfo or uniqueId == nil then return nil end
    local key = tostring(uniqueId)
    return ms.objectInfo[key] or ms.objectInfo[uniqueId]
end

local function _collectPlaceableMoistureIds(placeable, spec)
    local out, seen = {}, {}
    local function add(entity)
        local uid = _readUniqueId(entity)
        if uid and not seen[uid] then
            seen[uid] = true
            table.insert(out, uid)
        end
    end
    local function walk(tbl, depth)
        if not tbl or type(tbl) ~= "table" or depth > 4 then return end
        add(tbl)
        for k, v in pairs(tbl) do
            if type(v) == "table" and type(k) == "string" then
                if k:sub(1, 4) == "spec" or k:find("Trigger", 1, true) or k:find("info", 1, true) then
                    walk(v, depth + 1)
                end
            end
        end
    end
    walk(placeable, 0)
    if spec then walk(spec, 0) end
    return out
end

local function _siloFillTypeSet(placeable)
    local set = {}
    local spec = placeable and placeable.spec_silo
    if not spec then return set end
    local function absorb(levels)
        if not levels then return end
        for ftIdx, lit in pairs(levels) do
            if (tonumber(lit) or 0) > 0 then
                local idx = InventoryScan.resolveFillTypeIndex(ftIdx)
                if idx then set[idx] = true end
            end
        end
    end
    if spec.storages then
        for _, st in ipairs(spec.storages) do absorb(st and st.fillLevels) end
    end
    if spec.loadingStation and spec.loadingStation.getAllFillLevels then
        for _, farmId in ipairs({ 0, 1, 2, 3, 4, 5, 6, 7, 8 }) do
            local ok, levels = pcall(function() return spec.loadingStation:getAllFillLevels(farmId) end)
            if ok and type(levels) == "table" then absorb(levels) end
        end
    end
    return set
end

local function _scoreMoistureUid(ms, uid, siloFills)
    local bucket = _objectInfoBucket(ms, uid)
    local ftm = _ftm()
    if not bucket or not ftm or not ftm.getFillTypeIndexByName then return 0 end
    local score = 0
    for ftName, info in pairs(bucket) do
        if info then
            local ok, idx = pcall(function() return ftm:getFillTypeIndexByName(ftName) end)
            if ok and idx and siloFills[idx] then score = score + 1 end
        end
    end
    return score
end

local function _resolveMoistureUidForPlaceable(ms, placeable)
    if not ms or not placeable or not placeable.spec_silo then return nil end
    local siloFills = _siloFillTypeSet(placeable)
    if not next(siloFills) then return nil end
    local bestUid, bestScore = nil, 0
    for _, uid in ipairs(_collectPlaceableMoistureIds(placeable, placeable.spec_silo)) do
        local score = _scoreMoistureUid(ms, uid, siloFills)
        if score > bestScore then bestScore, bestUid = score, uid end
    end
    if ms.objectInfo then
        for uid, _ in pairs(ms.objectInfo) do
            local score = _scoreMoistureUid(ms, uid, siloFills)
            if score > bestScore then bestScore, bestUid = score, tostring(uid) end
        end
    end
    if bestScore > 0 then return bestUid end
    return nil
end

local function _buildSiloMoistureUidByLocation()
    local out = {}
    local ms = _moistureSystem()
    local mission = _mission()
    local ps = mission and mission.placeableSystem
    if not ms or not ps or not ps.placeables then return out end
    for _, placeable in ipairs(ps.placeables) do
        if placeable and placeable.spec_silo then
            local uid = _resolveMoistureUidForPlaceable(ms, placeable)
            if uid then
                out[InventoryScan.placeableName(placeable)] = uid
            end
        end
    end
    return out
end

local function _patchLocationMoisture(loc, uid, fillTypeIndex)
    if not loc or not uid then return end
    local mPct, grade, qualityPct = _moistureGrade(uid, fillTypeIndex)
    if mPct ~= nil then loc.moisturePct = mPct end
    if qualityPct ~= nil then loc.qualityPct = qualityPct end
    if grade then loc.grade = grade end
end

local function _siloMoistureUniqueId(placeable, spec, storage)
    local uid = _readUniqueId(placeable)
    if uid then return uid end
    if spec and spec.loadingStation then
        local ls = spec.loadingStation
        if ls.owningPlaceable then
            uid = _readUniqueId(ls.owningPlaceable)
            if uid then return uid end
        end
        uid = _readUniqueId(ls)
        if uid then return uid end
    end
    if placeable and placeable.spec_infoTrigger then
        uid = _readUniqueId(placeable.spec_infoTrigger)
        if uid then return uid end
    end
    local ms = _moistureSystem()
    if ms and placeable and placeable.spec_silo then
        uid = _resolveMoistureUidForPlaceable(ms, placeable)
        if uid then return uid end
    end
    return nil
end

local function _moistureGradeFromInfo(info, fillTypeIndex)
    if type(info) ~= "table" then return nil, nil, nil end
    local moisture, grade, qualityPct = nil, nil, nil
    if info.moisture ~= nil then
        moisture = math.floor((tonumber(info.moisture) or 0) * 1000 + 0.5) / 10
    end
    if info.quality ~= nil then
        qualityPct = math.floor(tonumber(info.quality) + 0.5)
    end
    if qualityPct == nil and moisture ~= nil and _G.CropValueMap and _G.CropValueMap.getGrade then
        local okG, g = pcall(function()
            return _G.CropValueMap.getGrade(fillTypeIndex, (tonumber(moisture) or 0) / 100)
        end)
        if okG and g then
            grade = (FillTypeUtils and FillTypeUtils.moistureGradeLetter and FillTypeUtils.moistureGradeLetter(g)) or g
        end
    end
    return moisture, grade, qualityPct
end

local function _fillTypeNameForIndex(fillTypeIndex)
    local idx = InventoryScan.resolveFillTypeIndex(fillTypeIndex)
    if not idx then return nil end
    local ftm = _ftm()
    if ftm and ftm.getFillTypeNameByIndex then
        local ok, name = pcall(function() return ftm:getFillTypeNameByIndex(idx) end)
        if ok and name and tostring(name) ~= "" then return tostring(name) end
    end
    if rawget(_G, "FillTypeUtils") and FillTypeUtils.nameForIndex then
        return FillTypeUtils.nameForIndex(idx)
    end
    return nil
end

local function _moistureGradeScanByFillType(ms, fillTypeIndex)
    if not ms or not ms.objectInfo or fillTypeIndex == nil then return nil, nil, nil end
    local ftName = _fillTypeNameForIndex(fillTypeIndex)
    if not ftName then return nil, nil, nil end
    local idx = InventoryScan.resolveFillTypeIndex(fillTypeIndex) or tonumber(fillTypeIndex)
    local bestScore, bestM, bestG, bestQ = 0, nil, nil, nil
    for uid, bucket in pairs(ms.objectInfo) do
        if type(bucket) == "table" and bucket[ftName] then
            local m, g, q = _moistureGradeFromInfo(bucket[ftName], idx)
            local score = (m ~= nil and 1 or 0) + (q ~= nil and 1 or 0)
            if score > bestScore then
                bestScore, bestM, bestG, bestQ = score, m, g, q
            end
        end
    end
    if bestScore > 0 then return bestM, bestG, bestQ end
    return nil, nil, nil
end

local function _moistureGrade(uniqueId, fillTypeIndex)
    local ms = _moistureSystem()
    if not ms or fillTypeIndex == nil then return nil, nil, nil end
    local idx = InventoryScan.resolveFillTypeIndex(fillTypeIndex) or tonumber(fillTypeIndex)
    if not idx then return nil, nil, nil end
    local ftName = _fillTypeNameForIndex(idx)

    local moisture, grade, qualityPct = nil, nil, nil
    if uniqueId and ms.getObjectMoisture then
        local ok, m = pcall(function() return ms:getObjectMoisture(uniqueId, idx) end)
        if ok and m ~= nil then moisture = math.floor((tonumber(m) or 0) * 1000 + 0.5) / 10 end
        if moisture == nil and ftName then
            ok, m = pcall(function() return ms:getObjectMoisture(uniqueId, ftName) end)
            if ok and m ~= nil then moisture = math.floor((tonumber(m) or 0) * 1000 + 0.5) / 10 end
        end
    end
    if uniqueId and ms.getObjectQuality then
        local okQ, q = pcall(function() return ms:getObjectQuality(uniqueId, idx) end)
        if okQ and q ~= nil then qualityPct = math.floor(tonumber(q) + 0.5) end
        if qualityPct == nil and ftName then
            okQ, q = pcall(function() return ms:getObjectQuality(uniqueId, ftName) end)
            if okQ and q ~= nil then qualityPct = math.floor(tonumber(q) + 0.5) end
        end
    end
    if uniqueId and moisture == nil and ms.getObjectInfo then
        local okI, info = pcall(function() return ms:getObjectInfo(uniqueId, idx) end)
        if okI then
            local m2, g2, q2 = _moistureGradeFromInfo(info, idx)
            if moisture == nil then moisture = m2 end
            if grade == nil then grade = g2 end
            if qualityPct == nil then qualityPct = q2 end
        end
        if moisture == nil and ftName then
            local okN, infoN = pcall(function() return ms:getObjectInfo(uniqueId, ftName) end)
            if okN then
                local m3, g3, q3 = _moistureGradeFromInfo(infoN, idx)
                if moisture == nil then moisture = m3 end
                if grade == nil then grade = g3 end
                if qualityPct == nil then qualityPct = q3 end
            end
        end
    end
    if uniqueId and moisture == nil and ms.objectInfo then
        local bucket = _objectInfoBucket(ms, uniqueId)
        local ftm = _ftm()
        if bucket and ftm and ftm.getFillTypeNameByIndex then
            local okN, name = pcall(function() return ftm:getFillTypeNameByIndex(idx) end)
            if okN and name and bucket[name] then
                local m3, g3, q3 = _moistureGradeFromInfo(bucket[name], idx)
                if moisture == nil then moisture = m3 end
                if grade == nil then grade = g3 end
                if qualityPct == nil then qualityPct = q3 end
            end
        end
    end
    if qualityPct == nil and moisture ~= nil and grade == nil and _G.CropValueMap and _G.CropValueMap.getGrade then
        local okG, g = pcall(function()
            return _G.CropValueMap.getGrade(idx, (tonumber(moisture) or 0) / 100)
        end)
        if okG and g then
            grade = (FillTypeUtils and FillTypeUtils.moistureGradeLetter and FillTypeUtils.moistureGradeLetter(g)) or g
        end
    end
    if moisture == nil and qualityPct == nil and grade == nil then
        local sm, sg, sq = _moistureGradeScanByFillType(ms, idx)
        moisture, grade, qualityPct = sm, sg, sq
    end
    return moisture, grade, qualityPct
end

local function _applyMoistureToLoc(loc, uniqueId, fillTypeIndex)
    if not loc or not uniqueId then return end
    _patchLocationMoisture(loc, uniqueId, fillTypeIndex)
end

local function _storageOwnedByFarm(storage, farmId)
    if not storage then return false end
    local owner = tonumber(storage.ownerFarmId)
    if owner == farmId then return true end
    if owner == 0 or owner == nil then return true end
    return false
end

function InventoryScan.enrichSiloMoisture(stockState)
    if not stockState or not stockState.byFarm then return end
    if not _moistureSystem() then return end
    local locNameToUid = _buildSiloMoistureUidByLocation()
    for _, bucket in pairs(stockState.byFarm) do
        for _, item in ipairs(bucket.items or {}) do
            local idx = item.fillTypeIndex
            for _, loc in ipairs(item.locations or {}) do
                if loc and (loc.kind == "silo" or loc.kind == "siloExtension") then
                    local uid = locNameToUid[loc.name]
                    if uid then _patchLocationMoisture(loc, uid, idx) end
                end
            end
        end
    end
end

--- Patch finalized stock export with per-crop silo moisture (runs at JSON assembly when MoistureSystem is live).
function InventoryScan.applyStockMoistureToExport(stock)
    if type(stock) ~= "table" or type(stock.byFarm) ~= "table" then return end
    if not _moistureSystem() then return end
    local locNameToUid = _buildSiloMoistureUidByLocation()
    for _, farm in pairs(stock.byFarm) do
        for _, item in ipairs(farm.items or {}) do
            local idx = tonumber(item.fillTypeIndex)
            if idx then
                for _, loc in ipairs(item.locations or {}) do
                    if loc and (loc.kind == "silo" or loc.kind == "siloExtension") then
                        if loc.moisturePct == nil and loc.qualityPct == nil and not loc.grade then
                            local uid = locNameToUid[loc.name]
                            if uid then
                                _patchLocationMoisture(loc, uid, idx)
                            else
                                local m, g, q = _moistureGradeScanByFillType(_moistureSystem(), idx)
                                if m ~= nil then loc.moisturePct = m end
                                if q ~= nil then loc.qualityPct = q end
                                if g then loc.grade = g end
                            end
                        end
                    end
                end
            end
        end
    end
end

function InventoryScan.newStockState(farmIds)
    local byFarm = {}
    for _, fid in ipairs(farmIds or {}) do
        byFarm[tostring(fid)] = { farmId = fid, items = {}, _idx = {} }
    end
    return { byFarm = byFarm, farmIds = farmIds or {} }
end

function InventoryScan.newBaleState(farmIds)
    local byFarm = {}
    for _, fid in ipairs(farmIds or {}) do
        local bucketFactory = rawget(_G, "FillTypeUtils") and FillTypeUtils.newBaleBucket
        local onField = bucketFactory and bucketFactory() or { straw = 0, grass = 0, hay = 0, silage = 0, other = 0, byFillType = {} }
        local inStorage = bucketFactory and bucketFactory() or { straw = 0, grass = 0, hay = 0, silage = 0, other = 0, byFillType = {} }
        byFarm[tostring(fid)] = {
            farmId = fid,
            onField = onField,
            inStorage = inStorage,
        }
    end
    return { byFarm = byFarm, farmIds = farmIds or {}, moistureByFarm = {} }
end

local function _mergeSerializedBaleBucket(dst, src)
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

--- Merge shed/world bale rows (stock scan + loose bale scan).
function InventoryScan.mergeBaleExports(primary, secondary)
    primary = primary or {}
    secondary = secondary or {}
    local out = {
        farmId = primary.farmId or secondary.farmId or 0,
        byFarm = {},
        onField = {},
        inStorage = {},
        offField = {},
        moisture = primary.moisture or secondary.moisture or { enabled = false, byFarm = {} },
    }
    local farms = {}
    for fid, row in pairs(primary.byFarm or {}) do farms[fid] = true end
    for fid, row in pairs(secondary.byFarm or {}) do farms[fid] = true end
    for fid in pairs(farms) do
        local a = primary.byFarm and primary.byFarm[fid] or {}
        local b = secondary.byFarm and secondary.byFarm[fid] or {}
        local onField = _mergeSerializedBaleBucket(
            InventoryScan.serializeBaleBucket(a.onField or {}),
            InventoryScan.serializeBaleBucket(b.onField or {})
        )
        local inStorage = _mergeSerializedBaleBucket(
            InventoryScan.serializeBaleBucket(a.inStorage or {}),
            InventoryScan.serializeBaleBucket(b.inStorage or {})
        )
        out.byFarm[fid] = {
            onField = onField,
            inStorage = inStorage,
            offField = inStorage,
        }
    end
    local legacyFarm = tostring(out.farmId or 1)
    local legacy = out.byFarm[legacyFarm] or out.byFarm["1"] or { onField = {}, inStorage = {}, offField = {} }
    out.onField = legacy.onField or {}
    out.inStorage = legacy.inStorage or {}
    out.offField = legacy.offField or legacy.inStorage or {}
    return out
end

--- Fallback: estimate bale counts from stock objectStorage rows (uses totalLiters when location list is capped).
function InventoryScan.deriveBaleCountsFromStock(stockByFarm, baleState)
    if not stockByFarm or not baleState then return end
    for fid, farm in pairs(stockByFarm) do
        local farmId = tonumber(farm and farm.farmId) or tonumber(fid)
        if farmId and InventoryScan.isPlayerFarmId(farmId) then
            for _, item in ipairs(farm.items or {}) do
                local idx = InventoryScan.resolveFillTypeIndex(item.fillTypeIndex)
                if idx then
                    local locLiters, locCount = 0, 0
                    for _, loc in ipairs(item.locations or {}) do
                        if loc and (loc.kind == "objectStorage" or loc.kind == "objectStorageMod") then
                            locLiters = locLiters + (tonumber(loc.liters) or 0)
                            locCount = locCount + 1
                        end
                    end
                    if locCount > 0 or (tonumber(item.totalLiters) or 0) > 0 then
                        local totalLiters = math.max(locLiters, tonumber(item.totalLiters) or 0)
                        if totalLiters > 0 then
                            local baleSize = (locCount > 0 and locLiters > 0)
                                and (locLiters / locCount) or BALE_LITER_ESTIMATE
                            local n = math.max(1, math.floor(totalLiters / baleSize + 0.5))
                            InventoryScan.tallyBale(baleState, farmId, "inStorage", idx, n)
                        end
                    end
                end
            end
        end
    end
end

local function _stockEnsureItem(farmBucket, fillTypeIndex)
    if not farmBucket then return nil end
    local idx = InventoryScan.resolveFillTypeIndex(fillTypeIndex)
    if not idx then return nil end
    local key = tostring(idx)
    if not farmBucket._idx[key] then
        if #farmBucket.items >= MAX_FILL_TYPES_PER_FARM then return nil end
        local name, title = InventoryScan.fillTypeMeta(idx)
        farmBucket._idx[key] = {
            fillTypeIndex = idx,
            fillType = name or "",
            fillTypeTitle = title,
            totalLiters = 0,
            locations = {},
            _locCount = 0,
        }
        table.insert(farmBucket.items, farmBucket._idx[key])
    end
    return farmBucket._idx[key]
end

function InventoryScan.addStockLiters(stockState, farmId, fillTypeIndex, liters, locName, kind, extra, uniqueId)
    if not stockState or not farmId then return end
    local lit = _roundLiters(liters)
    if lit <= 0 then return end
    local bucket = stockState.byFarm[tostring(farmId)]
    if not bucket then return end
    local item = _stockEnsureItem(bucket, fillTypeIndex)
    if not item then return end
    item.totalLiters = item.totalLiters + lit
    if item._locCount >= MAX_LOCATIONS_PER_FILL then return end
    item._locCount = item._locCount + 1
    local idx = item.fillTypeIndex
    local mPct, grade, qualityPct = _moistureGrade(uniqueId, idx)
    local loc = { name = tostring(locName or "Storage"), kind = kind or "storage", liters = lit }
    if extra and extra ~= "" then loc.extra = tostring(extra) end
    if mPct ~= nil then loc.moisturePct = mPct end
    if qualityPct ~= nil then loc.qualityPct = qualityPct end
    if grade then loc.grade = grade end
    table.insert(item.locations, loc)
end

function InventoryScan.tallyBale(baleState, farmId, placement, fillTypeIndex, count)
    if not baleState or not farmId then return end
    count = tonumber(count) or 1
    if count < 1 then return end
    local row = baleState.byFarm[tostring(farmId)]
    if not row then return end
    local bucket = (placement == "onField") and row.onField or row.inStorage
    if not bucket then return end
    if rawget(_G, "FillTypeUtils") and FillTypeUtils.tallyBalesByIndex then
        FillTypeUtils.tallyBalesByIndex(bucket, fillTypeIndex, count)
    elseif rawget(_G, "FillTypeUtils") and FillTypeUtils.tallyBales then
        FillTypeUtils.tallyBales(bucket, { fillType = fillTypeIndex }, count)
    else
        bucket.other = (bucket.other or 0) + count
    end
end

--- Field centres for on-cropland vs yard/shed placement (same logic as FieldDataCollector).
function InventoryScan.buildFieldGeometries()
    local out = {}
    if not _G.g_fieldManager or not _G.g_fieldManager.fields then return out end
    for _, fld in pairs(_G.g_fieldManager.fields) do
        local pid = fld.farmland and fld.farmland.id
        local areaHa = tonumber(fld.areaHa) or 0
        local farmId = tonumber(fld.farmland and fld.farmland.farmId) or 0
        if pid and pid > 0 and areaHa > 0 and farmId > 0 then
            local cx0 = tonumber(fld.posX) or 0
            local cz0 = tonumber(fld.posZ) or 0
            if type(fld.getCenterOfFieldWorldPosition) == "function" then
                local okC, gx, gz = pcall(function() return fld:getCenterOfFieldWorldPosition() end)
                if okC and tonumber(gx) and tonumber(gz) then cx0, cz0 = gx, gz end
            end
            local r = math.sqrt((areaHa * 10000) / math.pi)
            local effRadius = r + math.max(r * 0.5, 5) + 2
            table.insert(out, { farmlandId = pid, farmId = farmId, cx = cx0, cz = cz0, effRadius = effRadius })
        end
    end
    return out
end

local function _farmlandIdAtWithRing(fm, x, z)
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
            local n = tonumber(fmo)
            return (n and n > 0) and n or nil
        end
        if type(fmo) == "table" then
            local p = tonumber(fmo.farmlandId or fmo.id)
            if p and p > 0 then return p end
            if type(fmo.getId) == "function" then
                local okI, ii = pcall(function() return fmo:getId() end)
                if okI and ii ~= nil then
                    local n = tonumber(ii)
                    if n and n > 0 then return n end
                end
            end
        end
        return nil
    end
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

function InventoryScan.bestFieldKeyForBaleAtXZ(x, z, fieldGeometries)
    local fm = _G.g_farmlandManager
    if not fm then return nil end
    local parcel = _farmlandIdAtWithRing(fm, x, z)
    if parcel == nil or parcel <= 0 then return nil end
    local bestKey, bestDistSq = nil, math.huge
    for _, g in ipairs(fieldGeometries or {}) do
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

--- Shared runtime for loose-world bale scans (sync + incremental).
local function _buildLooseBaleScanRuntime(baleState, farmIds)
    local m = _mission()
    local fm = _G.g_farmlandManager
    if not baleState or not m or not fm or type(fm.getFarmlandAtWorldPosition) ~= "function" then
        return nil
    end

    local playerFarmSet = {}
    for _, fid in ipairs(farmIds or {}) do playerFarmSet[tonumber(fid)] = true end

    local fieldGeometries = InventoryScan.buildFieldGeometries()
    local farmByParcel = {}
    for _, g in ipairs(fieldGeometries) do
        farmByParcel[g.farmlandId] = g.farmId
    end

    local function getFarmIdForParcel(parcelId)
        if farmByParcel[parcelId] then return farmByParcel[parcelId] end
        if type(fm.getFarmlandById) == "function" then
            local ok, land = pcall(function() return fm:getFarmlandById(parcelId) end)
            if ok and land then
                local fid = tonumber(land.farmId)
                if fid and fid > 0 then return fid end
            end
        end
        return nil
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

    local function isHeuristicBale(it)
        if not it then return false end
        if it.isBale == true or it.baleType ~= nil then return true end
        if it.isRoundBale == true or it.isRoundbale == true or it.isSquareBale == true then return true end
        return isPhysicalBale(it)
    end

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
                    if type(entityExists) ~= "function" or entityExists(nid) then
                        local ox, oy, oz = getWorldTranslation(nid)
                        if ox ~= nil and oz ~= nil then return ox, oz end
                    end
                end
            end
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

    local seen = {}
    local function baleDedupKey(it)
        local uid = rawget(it, "uniqueId")
        local oid = rawget(it, "id")
        if uid ~= nil then return "u:" .. tostring(uid) end
        if oid ~= nil then return "id:" .. tostring(oid) end
        local x, z = itemWorldXZ(it)
        if x and z then return string.format("xz:%.1f:%.1f", x, z) end
        return "t:" .. tostring(it)
    end

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

    local function tallyWorldBale(it)
        local x, z = itemWorldXZ(it)
        if x == nil or z == nil then return end

        local fieldKey = InventoryScan.bestFieldKeyForBaleAtXZ(x, z, fieldGeometries)
        if fieldKey ~= nil and fieldKey > 0 then
            local farmId = getFarmIdForParcel(fieldKey)
            if farmId and playerFarmSet[farmId] then
                local row = baleState.byFarm[tostring(farmId)]
                local bucket = row and row.onField
                if bucket and rawget(_G, "FillTypeUtils") and FillTypeUtils.tallyBale then
                    FillTypeUtils.tallyBale(bucket, it)
                else
                    local ftIdx = FillTypeUtils and FillTypeUtils.fillTypeIndexFromEntity and FillTypeUtils.fillTypeIndexFromEntity(it)
                    InventoryScan.tallyBale(baleState, farmId, "onField", ftIdx, 1)
                end
                return
            end
        end
        local parcel = _farmlandIdAtWithRing(fm, x, z)
        if parcel ~= nil and parcel > 0 then
            local farmId = getFarmIdForParcel(parcel)
            if farmId and playerFarmSet[farmId] then
                local row = baleState.byFarm[tostring(farmId)]
                local bucket = row and row.inStorage
                if bucket and rawget(_G, "FillTypeUtils") and FillTypeUtils.tallyBale then
                    FillTypeUtils.tallyBale(bucket, it)
                else
                    local ftIdx = FillTypeUtils and FillTypeUtils.fillTypeIndexFromEntity and FillTypeUtils.fillTypeIndexFromEntity(it)
                    InventoryScan.tallyBale(baleState, farmId, "inStorage", ftIdx, 1)
                end
            end
        end
    end

    local function tryBale(it, assumeBale)
        if not assumeBale and not isHeuristicBale(it) then return end
        if not baleIsOnGround(it) then return end
        local dk = baleDedupKey(it)
        if dk and seen[dk] then return end
        if dk then seen[dk] = true end
        tallyWorldBale(it)
    end

    local function nodeObjectLikelyBale(obj)
        if type(obj) ~= "table" then return false end
        local cn = rawget(obj, "className")
        if type(cn) == "string" then
            local u = string.upper(cn)
            if u == "BALE" or string.find(u, "BALE", 1, true) then return true end
        end
        return rawget(obj, "baleType") or rawget(obj, "isRoundBale") or rawget(obj, "isSquareBale")
    end

    return {
        m = m,
        tryBale = tryBale,
        nodeObjectLikelyBale = nodeObjectLikelyBale,
    }
end

local LOOSE_BALE_SOURCES = { "items", "itemsToSave", "baleMgr", "slot", "btc", "nodeObjects" }

function InventoryScan.newLooseBaleScanContext(farmIds)
    return {
        farmIds = farmIds,
        rt = nil,
        sourceIdx = 1,
        listData = {},
        listPos = {},
        listBuilt = {},
        enumState = {},
    }
end

--- Process up to `budget` bale entities; returns true when scan complete.
function InventoryScan.scanLooseWorldBalesStep(ctx, baleState, budget)
    if not ctx or not baleState then return true end
    budget = math.max(1, tonumber(budget) or 8)

    if not ctx.rt then
        if rawget(_G, "FillTypeUtils") and FillTypeUtils.rebuildCatalog then
            FillTypeUtils.rebuildCatalog()
        end
        ctx.rt = _buildLooseBaleScanRuntime(baleState, ctx.farmIds)
        if not ctx.rt then return true end
    end

    local rt = ctx.rt
    local m = rt.m
    local spent = 0

    while spent < budget do
        local src = LOOSE_BALE_SOURCES[ctx.sourceIdx]
        if not src then return true end

        if not ctx.listBuilt[src] then
            local enum = ctx.enumState[src]
            if not enum then
                enum = { keys = nil, keyIdx = 1, pairKey = nil, done = false }
                if src == "items" then
                    local itemSys = m.itemSystem
                    local items = nil
                    if itemSys and type(itemSys.getItems) == "function" then
                        local ok, r = pcall(function() return itemSys:getItems() end)
                        if ok and type(r) == "table" then items = r end
                    end
                    if items == nil and itemSys and type(itemSys.items) == "table" then
                        items = itemSys.items
                    end
                    enum.tableRef = items
                elseif src == "itemsToSave" then
                    enum.tableRef = m.itemSystem and m.itemSystem.itemsToSave
                elseif src == "baleMgr" then
                    local bm = rawget(_G, "g_baleManager")
                    if bm then
                        if type(bm.getBales) == "function" then
                            local ok, r = pcall(function() return bm:getBales() end)
                            if ok and r ~= nil then enum.tableRef = r end
                        elseif type(bm.bales) == "table" then
                            enum.tableRef = bm.bales
                        end
                    end
                elseif src == "slot" then
                    local SlotSystem = rawget(_G, "SlotSystem")
                    if SlotSystem and m.slotSystem and m.slotSystem.objectLimits then
                        local lim = m.slotSystem.objectLimits[SlotSystem.LIMITED_OBJECT_BALE]
                        if lim and type(lim.objects) == "table" then
                            enum.tableRef = lim.objects
                        end
                    end
                elseif src == "btc" then
                    local btc = rawget(_G, "g_baleToCollectManager")
                    if btc and type(btc.getBales) == "function" then
                        local okBtc, bl = pcall(function() return btc:getBales() end)
                        if okBtc and type(bl) == "table" then enum.tableRef = bl end
                    end
                elseif src == "nodeObjects" then
                    enum.tableRef = type(m.nodeToObject) == "table" and m.nodeToObject
                end
                ctx.enumState[src] = enum
                ctx.listData[src] = {}
            end

            if enum.done or not enum.tableRef then
                ctx.listBuilt[src] = true
                ctx.listPos[src] = 1
                ctx.sourceIdx = ctx.sourceIdx + 1
            else
                local list = ctx.listData[src]
                if not enum.seenKeys then enum.seenKeys = {} end
                local added = 0
                local cap = math.min(budget - spent, 32)

                if src == "itemsToSave" then
                    for _, wrap in pairs(enum.tableRef) do
                        if added >= cap then break end
                        local it = wrap
                        if type(wrap) == "table" then it = rawget(wrap, "item") or wrap end
                        local dk = tostring(it)
                        if not enum.seenKeys[dk] then
                            enum.seenKeys[dk] = true
                            list[#list + 1] = { it = it, assume = false }
                            added = added + 1
                        end
                    end
                    if added < cap then enum.done = true end
                elseif src == "nodeObjects" then
                    for _, obj in pairs(enum.tableRef) do
                        if added >= cap then break end
                        local dk = tostring(obj)
                        if not enum.seenKeys[dk] then
                            enum.seenKeys[dk] = true
                            if rt.nodeObjectLikelyBale(obj) then
                                list[#list + 1] = { it = obj, assume = false }
                                added = added + 1
                            end
                        end
                    end
                    if added < cap then enum.done = true end
                else
                    for _, it in pairs(enum.tableRef) do
                        if added >= cap then break end
                        local dk = tostring(it)
                        if not enum.seenKeys[dk] then
                            enum.seenKeys[dk] = true
                            local assume = src ~= "items"
                            list[#list + 1] = { it = it, assume = assume }
                            added = added + 1
                        end
                    end
                    if added < cap then enum.done = true end
                end

                if enum.done then
                    ctx.listBuilt[src] = true
                    ctx.listPos[src] = 1
                    ctx.sourceIdx = ctx.sourceIdx + 1
                end
                spent = spent + math.max(1, added)
                if spent >= budget then return false end
            end
        else
            local list = ctx.listData[src] or {}
            local pos = ctx.listPos[src] or 1
            while pos <= #list and spent < budget do
                local entry = list[pos]
                if entry and entry.it then
                    rt.tryBale(entry.it, entry.assume)
                end
                pos = pos + 1
                spent = spent + 1
            end
            ctx.listPos[src] = pos
            if pos > #list then
                ctx.sourceIdx = ctx.sourceIdx + 1
            else
                return false
            end
        end
    end
    return false
end

--- Loose world bales: on registered field geometry vs yards/sheds (FieldDataCollector parity).
function InventoryScan.scanLooseWorldBales(baleState, farmIds)
    local ctx = InventoryScan.newLooseBaleScanContext(farmIds)
    while not InventoryScan.scanLooseWorldBalesStep(ctx, baleState, 99999) do end
end

--- TSStockCheck objectStorage object → fillTypeIndex, fillLevel, baleCount.
local function _objectStorageEntry(obj, numObjects)
    numObjects = tonumber(numObjects) or 1
    if not obj or numObjects < 1 then return nil, 0, 0 end
    local fillTypeIndex, fillLevel = nil, 0
    local attrs = rawget(obj, "baleAttributes")
    local bo = rawget(obj, "baleObject")
    local pa = rawget(obj, "palletAttributes")
    if attrs then
        fillLevel = (tonumber(attrs.fillLevel) or 0) * numObjects
        fillTypeIndex = attrs.fillType
    elseif bo then
        fillLevel = (tonumber(bo.fillLevel) or 0) * numObjects
        fillTypeIndex = bo.fillType
    elseif pa then
        fillLevel = (tonumber(pa.fillLevel) or 0) * numObjects
        fillTypeIndex = pa.fillType
    end
    fillTypeIndex = InventoryScan.resolveFillTypeIndex(fillTypeIndex)
    local baleCount = numObjects
    if fillLevel > 0 and fillTypeIndex then
        local est = math.max(1, math.floor(fillLevel / BALE_LITER_ESTIMATE + 0.5))
        if est > baleCount then baleCount = est end
    end
    return fillTypeIndex, fillLevel, baleCount
end

local function _objectBelongsToFarm(obj, farmId)
    local attrs = rawget(obj, "baleAttributes")
    if attrs and attrs.farmId ~= nil then
        return tonumber(attrs.farmId) == farmId
    end
    local bo = rawget(obj, "baleObject")
    if bo and bo.ownerFarmId ~= nil then
        return tonumber(bo.ownerFarmId) == farmId
    end
    local pa = rawget(obj, "palletAttributes")
    if pa and pa.ownerFarmId ~= nil then
        return tonumber(pa.ownerFarmId) == farmId
    end
    return true
end

--- Giants spec_objectStorage (AUTO BALE STORAGE etc.) — TSStockCheck lines 618-750.
function InventoryScan.scanGiantsObjectStorage(placeable, farmId, stockState, baleState, tagPrefix)
    local osSpec = placeable.spec_objectStorage
    if not osSpec or not InventoryScan.placeableOwnedByFarm(placeable, farmId) then return end
    if type(osSpec.objectInfos) ~= "table" then return end
    local pname = InventoryScan.placeableName(placeable, "Bale storage")
    tagPrefix = tagPrefix or "OS"

    for obi, objectInfo in ipairs(osSpec.objectInfos) do
        if objectInfo and type(objectInfo.objects) == "table" then
            if #objectInfo.objects == 1 and objectInfo.numObjects ~= nil and objectInfo.numObjects ~= 1 then
                local numObjects = tonumber(objectInfo.numObjects) or 1
                local ftIdx, fillLevel, baleCount = _objectStorageEntry(objectInfo.objects[1], numObjects)
                if ftIdx and fillLevel > 0 then
                    InventoryScan.addStockLiters(stockState, farmId, ftIdx, fillLevel, pname, "objectStorage", nil, nil)
                end
                if baleState and ftIdx and baleCount > 0 then
                    InventoryScan.tallyBale(baleState, farmId, "inStorage", ftIdx, baleCount)
                end
            else
                for _, obj in ipairs(objectInfo.objects) do
                    if _objectBelongsToFarm(obj, farmId) then
                        local ftIdx, fillLevel, baleCount = _objectStorageEntry(obj, 1)
                        if ftIdx and fillLevel > 0 then
                            InventoryScan.addStockLiters(stockState, farmId, ftIdx, fillLevel, pname, "objectStorage", nil, nil)
                        end
                        if baleState and ftIdx and baleCount > 0 then
                            InventoryScan.tallyBale(baleState, farmId, "inStorage", ftIdx, baleCount)
                        end
                    end
                end
            end
        end
    end
end

--- TSStockCheck spec_objectStorageMod — lines 502-616.
function InventoryScan.scanObjectStorageMod(placeable, farmId, stockState, baleState)
    local osMod = placeable.spec_objectStorageMod
    if not osMod or not osMod.objectStorage then return end
    local thisOS = osMod.objectStorage
    if tonumber(thisOS.ownerFarmId) ~= farmId then return end
    if not InventoryScan.placeableOwnedByFarm(placeable, farmId) then return end
    local pname = InventoryScan.placeableName(placeable, "Object storage")
    if type(thisOS.storageAreasByFillType) ~= "table" then return end

    for fillTypeIndex, fillTypeTable in pairs(thisOS.storageAreasByFillType) do
        for _, areaEntry in pairs(fillTypeTable) do
            local function scanObjects(objects)
                if type(objects) ~= "table" then return end
                for _, object in ipairs(objects) do
                    local ft = InventoryScan.resolveFillTypeIndex(object.fillType) or InventoryScan.resolveFillTypeIndex(fillTypeIndex)
                    local fillLevel = tonumber(object.fillLevel) or 0
                    if fillLevel > 0 and ft then
                        InventoryScan.addStockLiters(stockState, farmId, ft, fillLevel, pname, "objectStorageMod", nil, nil)
                        if baleState then
                            local n = math.max(1, math.floor(fillLevel / BALE_LITER_ESTIMATE + 0.5))
                            InventoryScan.tallyBale(baleState, farmId, "inStorage", ft, n)
                        end
                    end
                end
            end
            if type(areaEntry) == "table" then
                if areaEntry.objects then
                    scanObjects(areaEntry.objects)
                else
                    for _, nested in pairs(areaEntry) do
                        if type(nested) == "table" and nested.objects then
                            scanObjects(nested.objects)
                        end
                    end
                end
            end
        end
    end
end

function InventoryScan.scanPlaceable(placeable, farmIds, stockState, baleState)
    if not placeable then return end
    for _, farmId in ipairs(farmIds or {}) do
        InventoryScan.scanPlaceableForFarm(placeable, farmId, stockState, baleState)
    end
end

function InventoryScan.scanPlaceableForFarm(placeable, farmId, stockState, baleState)
    if not placeable or not farmId then return end
    local pname = InventoryScan.placeableName(placeable)

    if placeable.spec_silo and InventoryScan.placeableOwnedByFarm(placeable, farmId) then
        local spec = placeable.spec_silo
        local moistureUid = _siloMoistureUniqueId(placeable, spec, nil)
        local siloLitersFromStorages = 0
        if spec.storages then
            for _, storage in ipairs(spec.storages) do
                if storage and _storageOwnedByFarm(storage, farmId) and storage.fillLevels then
                    for ftIdx, lit in pairs(storage.fillLevels) do
                        local n = tonumber(lit) or 0
                        if n > 0 then
                            siloLitersFromStorages = siloLitersFromStorages + n
                            InventoryScan.addStockLiters(stockState, farmId, ftIdx, lit, pname, "silo", nil, moistureUid)
                        end
                    end
                end
            end
        end
        if siloLitersFromStorages <= 0 and spec.loadingStation and spec.loadingStation.getAllFillLevels then
            local ok, levels = pcall(function() return spec.loadingStation:getAllFillLevels(farmId) end)
            if ok and type(levels) == "table" then
                for ftIdx, lit in pairs(levels) do
                    InventoryScan.addStockLiters(stockState, farmId, ftIdx, lit, pname, "silo", nil, moistureUid)
                end
            end
        end
    end

    if placeable.spec_siloExtension and InventoryScan.placeableOwnedByFarm(placeable, farmId) then
        local storage = placeable.spec_siloExtension.storage
        local extUid = _siloMoistureUniqueId(placeable, nil, storage)
        if storage and _storageOwnedByFarm(storage, farmId) and storage.fillLevels then
            for ftIdx, lit in pairs(storage.fillLevels) do
                InventoryScan.addStockLiters(stockState, farmId, ftIdx, lit, pname, "siloExtension", nil, extUid)
            end
        end
    end

    if placeable.spec_husbandry and tonumber(placeable.ownerFarmId) == farmId then
        local spec = placeable.spec_husbandry
        if spec.storage and spec.storage.fillLevels then
            local ls = spec.loadingStation
            for ftIdx, lit in pairs(spec.storage.fillLevels) do
                if lit > 0 and (not ls or not ls.supportedFillTypes or ls.supportedFillTypes[ftIdx]) then
                    InventoryScan.addStockLiters(stockState, farmId, ftIdx, lit, pname, "husbandry")
                end
            end
        end
    end

    if placeable.spec_beehivePalletSpawner and tonumber(placeable.ownerFarmId) == farmId then
        local spec = placeable.spec_beehivePalletSpawner
        if spec.pendingLiters and spec.pendingLiters > 0 and spec.fillType then
            InventoryScan.addStockLiters(stockState, farmId, spec.fillType, spec.pendingLiters, pname, "beehive")
        end
    end

    if placeable.spec_manureHeap and tonumber(placeable.ownerFarmId) == farmId and placeable.spec_manureHeap.manureHeap then
        for ftIdx, lit in pairs(placeable.spec_manureHeap.manureHeap.fillLevels or {}) do
            if lit > 0 then
                InventoryScan.addStockLiters(stockState, farmId, ftIdx, lit, pname, "manureHeap")
            end
        end
    end

    if placeable.spec_bunkerSilo and tonumber(placeable.ownerFarmId) == farmId and placeable.spec_bunkerSilo.bunkerSilo then
        local bs = placeable.spec_bunkerSilo.bunkerSilo
        local fillLevel = tonumber(bs.fillLevel) or 0
        local ftIdx = bs.inputFillType
        local extra = ""
        if rawget(_G, "BunkerSilo") and bs.state ~= nil then
            if bs.state == BunkerSilo.STATE_FILL and bs.compactedPercent then
                extra = "compacting " .. tostring(math.floor(bs.compactedPercent)) .. "%"
            elseif bs.state == BunkerSilo.STATE_CLOSED and bs.fermentingPercent then
                extra = "fermenting " .. tostring(math.ceil((tonumber(bs.fermentingPercent) or 0) * 100)) .. "%"
            elseif bs.state == BunkerSilo.STATE_DRAIN or bs.state == BunkerSilo.STATE_FERMENTED then
                ftIdx = bs.outputFillType or ftIdx
            end
        end
        if fillLevel > 0 and ftIdx then
            InventoryScan.addStockLiters(stockState, farmId, ftIdx, fillLevel, pname, "bunkerSilo", extra)
        end
    end

    InventoryScan.scanObjectStorageMod(placeable, farmId, stockState, baleState)
    InventoryScan.scanGiantsObjectStorage(placeable, farmId, stockState, baleState)
end

function InventoryScan.finalizeStock(stockState)
    InventoryScan.enrichSiloMoisture(stockState)
    local catalog = InventoryScan.rebuildFillTypeCatalog()
    local out = { enabled = true, fillTypeCatalog = catalog, byFarm = {} }
    local n = 0
    for fid, bucket in pairs(stockState.byFarm or {}) do
        n = n + 1
        if n > MAX_FARMS then break end
        local items = {}
        for _, item in ipairs(bucket.items or {}) do
            local liters = _roundLiters(item.totalLiters)
            if liters > 0 then
                local idx = item.fillTypeIndex
                local name, title = InventoryScan.fillTypeMeta(idx)
                if (not name or name == "") and rawget(_G, "FillTypeUtils") and FillTypeUtils.displayForIndex then
                    name = FillTypeUtils.displayForIndex(idx)
                end
                if name and name ~= "" then item.fillType = name end
                local display = title
                if (not display or display == "") and item.fillTypeTitle and item.fillTypeTitle ~= "" then
                    display = item.fillTypeTitle
                end
                if (not display or display == "") and name and name ~= "" then
                    display = name
                end
                if rawget(_G, "FillTypeUtils") and FillTypeUtils.displayForIndex then
                    local resolved = FillTypeUtils.displayForIndex(idx)
                    if resolved and resolved ~= "" then
                        if not name or name == "" then item.fillType = resolved end
                        if not display or display == "" then display = resolved end
                    end
                end
                table.insert(items, {
                    fillTypeIndex = idx,
                    fillType = (name and name ~= "") and name or (item.fillType or ""),
                    fillTypeDisplay = (display and display ~= "" and ((not name or name == "") or display ~= name)) and display or nil,
                    totalLiters = liters,
                    locations = item.locations,
                    bestSellPrice = item.bestSellPrice,
                    bestSellStation = item.bestSellStation,
                    greatDemand = item.greatDemand == true,
                    priceTrend = item.priceTrend,
                })
            end
        end
        table.sort(items, function(a, b) return (a.totalLiters or 0) > (b.totalLiters or 0) end)
        out.byFarm[fid] = { farmId = bucket.farmId, fillTypeCount = #items, items = items }
    end
    return out
end

function InventoryScan.serializeBaleBucket(src)
    if rawget(_G, "FillTypeUtils") and FillTypeUtils.serializeBaleBucket then
        return FillTypeUtils.serializeBaleBucket(src)
    end
    return src or {}
end

function InventoryScan.finalizeBales(baleState, currentFarmId)
    local byFarmOut = {}
    for fid, row in pairs(baleState.byFarm or {}) do
        if InventoryScan.isPlayerFarmId(tonumber(fid)) then
            local storage = InventoryScan.serializeBaleBucket(row.inStorage)
            byFarmOut[fid] = {
                onField = InventoryScan.serializeBaleBucket(row.onField),
                inStorage = storage,
                offField = storage,
            }
        end
    end
    local legacy = byFarmOut[tostring(currentFarmId or 1)] or { onField = {}, inStorage = {}, offField = {} }
    return {
        byFarm = byFarmOut,
        farmId = currentFarmId or 0,
        onField = legacy.onField or {},
        inStorage = legacy.inStorage or {},
        offField = legacy.offField or legacy.inStorage or {},
        moisture = { enabled = false, byFarm = baleState.moistureByFarm or {} },
    }
end
