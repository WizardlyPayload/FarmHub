-- FS25 FarmDashboard | FillTypeUtils.lua | v2.0.0
-- Authoritative fill-type index ↔ name resolution (TSStockCheck + EconomyDataCollector patterns).

FillTypeUtils = {}

--- MoistureSystem CropValueMap.getGrade returns 1–4 (Grades.A–D); dashboard export/UI use letter grades.
function FillTypeUtils.moistureGradeLetter(grade)
    if grade == nil then return nil end
    if type(grade) == "string" then
        local s = string.upper(grade)
        if s == "A" or s == "B" or s == "C" or s == "D" then return s end
        return grade
    end
    local n = tonumber(grade)
    if not n then return nil end
    local cvm = rawget(_G, "CropValueMap")
    if cvm and cvm.Grades then
        if n == cvm.Grades.A then return "A" end
        if n == cvm.Grades.B then return "B" end
        if n == cvm.Grades.C then return "C" end
        if n == cvm.Grades.D then return "D" end
    end
    local map = { [1] = "A", [2] = "B", [3] = "C", [4] = "D" }
    return map[n]
end

local _catalog = nil
local _titles = nil
FillTypeUtils._cropIndexMap = nil

local _SKIP_CROP_NAMES = {
    UNKNOWN = true, EMPTY = true, GRASS = true, MULCHED_STUBBLE = true,
}

local function _ftm()
    return rawget(_G, "g_fillTypeManager")
end

--- Resolve a fill-type index from a number, string name, or FillType table.
function FillTypeUtils.indexForName(name)
    if name == nil then return nil end
    name = tostring(name)
    if name == "" then return nil end
    local n = tonumber(name)
    if n then return n end
    local ftm = _ftm()
    if not ftm then return nil end
    local upper = string.upper(name)
    if ftm.nameToIndex then
        if ftm.nameToIndex[upper] then return tonumber(ftm.nameToIndex[upper]) end
        if ftm.nameToIndex[name] then return tonumber(ftm.nameToIndex[name]) end
    end
    if ftm.getFillTypeIndexByName then
        for _, variant in ipairs({ upper, name, string.lower(name) }) do
            local ok, idx = pcall(function() return ftm:getFillTypeIndexByName(variant) end)
            if ok and idx then return tonumber(idx) end
        end
    end
    return nil
end

function FillTypeUtils.coerceFillTypeIndex(val)
    if val == nil then return nil end
    if type(val) == "number" then return val end
    if type(val) == "string" then return FillTypeUtils.indexForName(val) end
    if type(val) == "table" then
        local idx = tonumber(val.index or val.fillTypeIndex)
        if idx then return idx end
        if val.name then return FillTypeUtils.coerceFillTypeIndex(val.name) end
    end
    if type(val) == "userdata" then
        local idx = tonumber(val)
        if idx then return idx end
        if type(val.getFillTypeIndex) == "function" then
            local ok, r = pcall(function() return val:getFillTypeIndex() end)
            if ok then return tonumber(r) end
        end
        if type(val.getIndex) == "function" then
            local ok, r = pcall(function() return val:getIndex() end)
            if ok then return tonumber(r) end
        end
    end
    return nil
end

function FillTypeUtils.indexFromBaleXml(path)
    path = string.lower(tostring(path or ""))
    if path == "" then return nil end
    local rules = {
        { "straw", "STRAW" },
        { "drygrass", "DRYGRASS_WINDROW" },
        { "silage", "SILAGE" },
        { "ferment", "SILAGE" },
        { "grass_windrow", "GRASS_WINDROW" },
        { "grass", "GRASS_WINDROW" },
        { "hay", "DRYGRASS_WINDROW" },
    }
    for _, rule in ipairs(rules) do
        if string.find(path, rule[1], 1, true) then
            return FillTypeUtils.indexForName(rule[2])
        end
    end
    return nil
end

local function _put(catalog, idx, name)
    local n = tonumber(idx)
    local nm = tostring(name or "")
    if n and nm ~= "" and not tonumber(nm) then
        catalog[n] = nm
    end
end

local function _putTitle(titles, idx, title)
    local n = tonumber(idx)
    local t = tostring(title or "")
    if n and t ~= "" then
        titles[n] = t
    end
end

local function _observeIdx(observed, val)
    if observed == nil then return end
    local idx = FillTypeUtils.coerceFillTypeIndex(val)
    if idx and idx > 0 then observed[idx] = true end
end

--- Resolve one index via all engine APIs; cache internal name and localized title.
function FillTypeUtils.probeIndex(ftm, idx)
    local n = tonumber(idx)
    if not n or n <= 0 then return nil, nil end
    _catalog = _catalog or {}
    _titles = _titles or {}
    ftm = ftm or _ftm()
    if not ftm then return nil, nil end

    local name, title = nil, nil

    if ftm.getFillTypeByIndex then
        local ok, ft = pcall(function() return ftm:getFillTypeByIndex(n) end)
        if ok and ft then
            if ft.name and tostring(ft.name) ~= "" and not tonumber(tostring(ft.name)) then
                name = tostring(ft.name)
            end
            if ft.title and tostring(ft.title) ~= "" then
                title = tostring(ft.title)
            end
        end
    end
    if (not name or name == "") and ftm.getFillTypeNameByIndex then
        local ok, nm = pcall(function() return ftm:getFillTypeNameByIndex(n) end)
        if ok and nm and tostring(nm) ~= "" and not tonumber(tostring(nm)) then
            name = tostring(nm)
        end
    end
    if (not title or title == "") and ftm.getFillTypeTitleByIndex then
        local ok, tl = pcall(function() return ftm:getFillTypeTitleByIndex(n) end)
        if ok and tl and tostring(tl) ~= "" then
            title = tostring(tl)
        end
    end
    if not name and ftm.indexToName and ftm.indexToName[n] then
        local nm = tostring(ftm.indexToName[n])
        if nm ~= "" and not tonumber(nm) then name = nm end
    end
    if not name and ftm.fillTypeIndexToName and ftm.fillTypeIndexToName[n] then
        local nm = tostring(ftm.fillTypeIndexToName[n])
        if nm ~= "" and not tonumber(nm) then name = nm end
    end
    if not title and ftm.indexToTitle and ftm.indexToTitle[n] then
        local tl = tostring(ftm.indexToTitle[n])
        if tl ~= "" then title = tl end
    end

    if name then _put(_catalog, n, name) end
    if title then _putTitle(_titles, n, title) end
    return name, title
end

--- Probe indices 1..max (cap 512) when sparse DS maps omit entries.
function FillTypeUtils.probeAllFillTypes(maxHint, observed)
    _catalog = _catalog or {}
    _titles = _titles or {}
    local ftm = _ftm()
    if not ftm then return end

    local maxIdx = tonumber(maxHint) or 0
    local function bump(v)
        local n = tonumber(v)
        if n and n > maxIdx then maxIdx = n end
    end

    for idx in pairs(_catalog) do bump(idx) end
    for idx in pairs(_titles) do bump(idx) end
    if type(observed) == "table" then
        for idx in pairs(observed) do bump(idx) end
    end
    if ftm.fillTypeIndexToName then
        for idx in pairs(ftm.fillTypeIndexToName) do bump(idx) end
    end
    if ftm.indexToName then
        for idx in pairs(ftm.indexToName) do bump(idx) end
    end
    if ftm.indexToTitle then
        for idx in pairs(ftm.indexToTitle) do bump(idx) end
    end
    if ftm.nameToIndex then
        for _, idx in pairs(ftm.nameToIndex) do bump(idx) end
    end
    if ftm.fillTypes then
        for idx, ft in pairs(ftm.fillTypes) do
            bump(ft and ft.index or idx)
        end
    end
    if ftm.getFillTypes then
        local ok, fillTypes = pcall(function() return ftm:getFillTypes() end)
        if ok and type(fillTypes) == "table" then
            for idx, ft in pairs(fillTypes) do
                bump(ft and ft.index or idx)
            end
        end
    end

    maxIdx = math.max(maxIdx, 1)
    maxIdx = math.min(maxIdx + 16, 512)

    for i = 1, maxIdx do
        local cached = _catalog[i]
        local hasName = cached and cached ~= "" and not tonumber(cached)
        local hasTitle = _titles[i] and _titles[i] ~= ""
        if not hasName or not hasTitle then
            FillTypeUtils.probeIndex(ftm, i)
        end
    end
end

local function _registerLoadingStation(ls)
    if not ls or type(ls) ~= "table" then return end
    local ftm = _ftm()
    if ls.supportedFillTypes and type(ls.supportedFillTypes) == "table" then
        for k, v in pairs(ls.supportedFillTypes) do
            local idx = FillTypeUtils.coerceFillTypeIndex(k)
            if not idx and type(v) == "table" then
                idx = FillTypeUtils.coerceFillTypeIndex(v.index or v.fillTypeIndex or v.name)
            end
            if not idx then idx = FillTypeUtils.coerceFillTypeIndex(v) end
            if idx then
                if type(v) == "table" and v.name and tostring(v.name) ~= "" then
                    _put(_catalog, idx, v.name)
                    if v.title then _putTitle(_titles, idx, v.title) end
                else
                    FillTypeUtils.probeIndex(ftm, idx)
                end
            end
        end
    end
    for _, key in ipairs({ "acceptedFillTypes", "fillTypes", "fillTypeIndices" }) do
        local tbl = rawget(ls, key)
        if type(tbl) == "table" then
            for k, v in pairs(tbl) do
                local idx = FillTypeUtils.coerceFillTypeIndex(k)
                if not idx then idx = FillTypeUtils.coerceFillTypeIndex(v) end
                if idx then FillTypeUtils.probeIndex(ftm, idx) end
            end
        end
    end
    if ls.getSupportedFillTypes then
        local ok, types = pcall(function() return ls:getSupportedFillTypes() end)
        if ok and type(types) == "table" then
            for k, v in pairs(types) do
                local idx = FillTypeUtils.coerceFillTypeIndex(k)
                if not idx and type(v) == "table" then
                    idx = FillTypeUtils.coerceFillTypeIndex(v.index or v.fillTypeIndex)
                end
                if idx then
                    if type(v) == "table" and v.name then _put(_catalog, idx, v.name) end
                    FillTypeUtils.probeIndex(ftm, idx)
                end
            end
        end
    end
end

local function _registerStorageIndex(idx, ls)
    idx = tonumber(FillTypeUtils.coerceFillTypeIndex(idx))
    if not idx or idx <= 0 then return end
    FillTypeUtils.probeIndex(_ftm(), idx)
    local cached = _catalog[idx]
    if cached and cached ~= "" and not tonumber(cached) then return end
    if not ls or not ls.supportedFillTypes then return end
    if ls.supportedFillTypes[idx] or ls.supportedFillTypes[tostring(idx)] then
        FillTypeUtils.probeIndex(_ftm(), idx)
        return
    end
    local onlyIdx, onlyName = nil, nil
    local count = 0
    for k in pairs(ls.supportedFillTypes) do
        local i = FillTypeUtils.coerceFillTypeIndex(k)
        if i then
            count = count + 1
            onlyIdx = i
            onlyName = FillTypeUtils.displayForIndex(i) or FillTypeUtils.titleForIndex(i)
        end
    end
    if count == 1 and onlyName and onlyName ~= "" then
        _put(_catalog, idx, onlyName)
    end
end

local function _registerMoistureObject(uid, idx)
    if uid == nil then return end
    local mission = rawget(_G, "g_currentMission")
    local ms = mission and (mission.MoistureSystem or mission.moistureSystem)
    if not ms or not ms.objectInfo then return end
    local bucket = ms.objectInfo[tostring(uid)] or ms.objectInfo[uid]
    if not bucket then return end
    for ftName in pairs(bucket) do
        if type(ftName) == "string" and ftName ~= "" then
            local i = FillTypeUtils.indexForName(ftName)
            if i then
                _put(_catalog, i, string.upper(ftName))
                if idx and tonumber(idx) == i then return end
            end
        end
    end
end

--- Walk live placeables: loading stations + storage fillLevels (authoritative on DS).
function FillTypeUtils.enrichFromMissionPlaceables()
    _catalog = _catalog or {}
    _titles = _titles or {}
    local mission = rawget(_G, "g_currentMission")
    if not mission or not mission.placeableSystem or not mission.placeableSystem.placeables then return end
    for _, placeable in pairs(mission.placeableSystem.placeables) do
        if type(placeable) == "table" then
            local uid = rawget(placeable, "uniqueId")
            if uid == nil and type(placeable.getUniqueId) == "function" then
                local ok, v = pcall(function() return placeable:getUniqueId() end)
                if ok and v ~= nil then uid = v end
            end
            local spec = rawget(placeable, "spec_silo")
            if spec then
                _registerLoadingStation(spec.loadingStation)
                if spec.storages then
                    for _, st in ipairs(spec.storages) do
                        if st and st.fillLevels then
                            for ftIdx, lit in pairs(st.fillLevels) do
                                if (tonumber(lit) or 0) > 0 then
                                    _registerStorageIndex(ftIdx, spec.loadingStation)
                                    _registerMoistureObject(uid, ftIdx)
                                end
                            end
                        end
                    end
                end
            end
            local hs = rawget(placeable, "spec_husbandry")
            if hs then
                _registerLoadingStation(hs.loadingStation)
                if hs.storage and hs.storage.fillLevels then
                    for ftIdx, lit in pairs(hs.storage.fillLevels) do
                        if (tonumber(lit) or 0) > 0 then
                            _registerStorageIndex(ftIdx, hs.loadingStation)
                            _registerMoistureObject(uid, ftIdx)
                        end
                    end
                end
            end
        end
    end
end

--- Resolve fill-type label from placeable context when g_fillTypeManager maps are sparse.
function FillTypeUtils.resolveIndexAtPlaceable(placeable, fillTypeIndex)
    local idx = tonumber(FillTypeUtils.coerceFillTypeIndex(fillTypeIndex))
    if not idx or idx <= 0 then return nil, nil end
    FillTypeUtils.enrichFromMissionPlaceables()
    local name = FillTypeUtils.displayForIndex(idx)
    if name and name ~= "" then return name, FillTypeUtils.titleForIndex(idx) end

    if type(placeable) == "table" then
        local uid = rawget(placeable, "uniqueId")
        if uid == nil and type(placeable.getUniqueId) == "function" then
            local ok, v = pcall(function() return placeable:getUniqueId() end)
            if ok and v ~= nil then uid = v end
        end
        _registerMoistureObject(uid, idx)
        name = FillTypeUtils.displayForIndex(idx)
        if name and name ~= "" then return name, FillTypeUtils.titleForIndex(idx) end

        local spec = rawget(placeable, "spec_silo") or rawget(placeable, "spec_husbandry")
        local ls = spec and spec.loadingStation
        if ls then
            _registerLoadingStation(ls)
            _registerStorageIndex(idx, ls)
            name = FillTypeUtils.displayForIndex(idx)
            if name and name ~= "" then return name, FillTypeUtils.titleForIndex(idx) end
        end
    end
    return nil, nil
end

--- Collect every fill-type index referenced in an export payload.
function FillTypeUtils.collectObservedIndices(data)
    local observed = {}
    if type(data) ~= "table" then return observed end

    for _, farm in pairs((data.stock or {}).byFarm or {}) do
        for _, item in ipairs(farm.items or {}) do
            _observeIdx(observed, item.fillTypeIndex)
            if type(item.fillType) == "number" then _observeIdx(observed, item.fillType) end
        end
    end

    for _, v in pairs(data.vehicles or {}) do
        if type(v) == "table" then
            for _, fu in pairs(v.fillUnits or v.fillUnitLevels or v.levels or {}) do
                if type(fu) == "table" then
                    _observeIdx(observed, fu.fillType or fu.fillTypeIndex)
                end
            end
        end
    end

    local mp = data.economy and data.economy.marketPrices
    if mp then
        for idx in pairs(mp.fillTypesByIndex or {}) do _observeIdx(observed, idx) end
        for _, idx in pairs(mp.nameToIndex or {}) do _observeIdx(observed, idx) end
        for _, crop in pairs(mp.crops or {}) do
            _observeIdx(observed, crop and crop.fillTypeIndex)
        end
        for _, station in pairs(mp.sellPoints or {}) do
            if type(station) == "table" and type(station.prices) == "table" then
                for _, priceInfo in pairs(station.prices) do
                    _observeIdx(observed, priceInfo and priceInfo.fillTypeIndex)
                end
            end
        end
    end

    for _, prod in pairs(data.production or {}) do
        if type(prod) == "table" then
            for _, chain in pairs(prod.chains or prod) do
                if type(chain) == "table" then
                    for _, slot in pairs(chain.inputs or {}) do
                        _observeIdx(observed, slot and (slot.fillTypeIndex or slot.fillType))
                    end
                    for _, slot in pairs(chain.outputs or {}) do
                        _observeIdx(observed, slot and (slot.fillTypeIndex or slot.fillType))
                    end
                end
            end
        end
    end

    for _, animal in pairs(data.animals or {}) do
        if type(animal) == "table" then
            for _, row in pairs(animal.husbandries or animal.rows or {}) do
                if type(row) == "table" then
                    for ftKey in pairs(row.fillLevels or row.storageData or {}) do
                        _observeIdx(observed, ftKey)
                    end
                end
            end
        end
    end

    for _, f in pairs(data.fields or {}) do
        if type(f) == "table" then
            _observeIdx(observed, f.windrowFillTypeIndex)
            if type(f.windrowFillTypes) == "table" then
                for _, idx in pairs(f.windrowFillTypes) do _observeIdx(observed, idx) end
            end
        end
    end

    for idx in pairs(data.fillTypeCatalog or {}) do _observeIdx(observed, idx) end
    for idx in pairs(data.fillTypeTitles or {}) do _observeIdx(observed, idx) end

    return observed
end

function FillTypeUtils.rebuildCatalog()
    _catalog = {}
    _titles = {}
    FillTypeUtils._cropIndexMap = {}
    local ftm = _ftm()
    if not ftm then return _catalog end

    if ftm.fillTypeIndexToName then
        for idx, name in pairs(ftm.fillTypeIndexToName) do
            _put(_catalog, idx, name)
        end
    end
    if ftm.nameToIndex then
        for name, idx in pairs(ftm.nameToIndex) do
            _put(_catalog, idx, name)
        end
    end
    if ftm.getFillTypes then
        local ok, fillTypes = pcall(function() return ftm:getFillTypes() end)
        if ok and type(fillTypes) == "table" then
            for idx, fillType in pairs(fillTypes) do
                if fillType and fillType.name then
                    _put(_catalog, fillType.index or idx, fillType.name)
                end
            end
        end
    end
    if ftm.fillTypes then
        for _, filltype in pairs(ftm.fillTypes) do
            if filltype and filltype.name then
                _put(_catalog, filltype.index, filltype.name)
            end
        end
    end
    if ftm.indexToName then
        for idx, name in pairs(ftm.indexToName) do
            _put(_catalog, idx, name)
        end
    end
    if ftm.indexToTitle then
        for idx, title in pairs(ftm.indexToTitle) do
            local n = tonumber(idx)
            local t = tostring(title or "")
            if n and t ~= "" then
                _putTitle(_titles, n, t)
                if not _catalog[n] or _catalog[n] == "" or tonumber(_catalog[n]) then
                    if not tonumber(t) then _catalog[n] = t end
                end
            end
        end
    end

    FillTypeUtils.enrichFromMissionPlaceables()
    FillTypeUtils.probeAllFillTypes()

    return _catalog
end

function FillTypeUtils.catalog()
    if not _catalog then FillTypeUtils.rebuildCatalog() end
    return _catalog
end

function FillTypeUtils.catalogForJson()
    local out = {}
    for idx, name in pairs(FillTypeUtils.catalog()) do
        out[tostring(idx)] = name
    end
    return out
end

function FillTypeUtils.catalogTitlesForJson()
    if not _titles and FillTypeUtils.catalog then FillTypeUtils.catalog() end
    local out = {}
    for idx, title in pairs(_titles or {}) do
        out[tostring(idx)] = title
    end
    return out
end

function FillTypeUtils.cropIndexMapForJson()
    local out = {}
    if type(FillTypeUtils._cropIndexMap) == "table" then
        for crop, idx in pairs(FillTypeUtils._cropIndexMap) do
            local n = tonumber(idx)
            if n and n > 0 and crop and crop ~= "" then
                out[tostring(crop)] = n
            end
        end
    end
    return out
end

--- Map-specific / mod crops: resolve names from fields, fruit types, economy, and stock indices.
function FillTypeUtils.enrichCatalogFromData(data)
    if not _catalog then FillTypeUtils.rebuildCatalog() end
    FillTypeUtils.enrichFromMissionPlaceables()
    FillTypeUtils._cropIndexMap = FillTypeUtils._cropIndexMap or {}

    local cropNames = {}
    local function addCrop(n)
        if not n or type(n) ~= "string" then return end
        local u = string.upper(tostring(n):match("^%s*(.-)%s*$") or "")
        if u == "" or _SKIP_CROP_NAMES[u] then return end
        cropNames[u] = true
    end

    if type(data) == "table" then
        for _, f in pairs(data.fields or {}) do
            addCrop(f and f.fruitType)
        end
        local mp = data.economy and data.economy.marketPrices
        if mp and mp.crops then
            for name in pairs(mp.crops) do addCrop(name) end
        end
        if mp and mp.nameToIndex then
            for name in pairs(mp.nameToIndex) do addCrop(name) end
        end
        for _, farm in pairs((data.stock or {}).byFarm or {}) do
            for _, item in ipairs(farm.items or {}) do
                addCrop(item.fillType)
                if item.fillTypeTitle and tostring(item.fillTypeTitle) ~= "" then
                    addCrop(item.fillTypeTitle)
                end
            end
        end
    end

    local frm = rawget(_G, "g_fruitTypeManager")
    if frm and frm.fruitTypes then
        for _, fruit in pairs(frm.fruitTypes) do
            if fruit and fruit.name then addCrop(fruit.name) end
        end
    end
    if frm and frm.getFruitTypes then
        local ok, fruits = pcall(function() return frm:getFruitTypes() end)
        if ok and type(fruits) == "table" then
            for _, fruit in pairs(fruits) do
                if fruit and fruit.name then addCrop(fruit.name) end
            end
        end
    end

    for crop in pairs(cropNames) do
        local idx = FillTypeUtils.indexForName(crop)
        if idx then
            _put(_catalog, idx, crop)
            FillTypeUtils._cropIndexMap[crop] = idx
        end
    end

    local observed = FillTypeUtils.collectObservedIndices(data)
    FillTypeUtils.probeAllFillTypes(nil, observed)

    if frm and frm.getFruitTypeByName then
        for crop in pairs(cropNames) do
            local ok, fruit = pcall(function() return frm:getFruitTypeByName(crop) end)
            if ok and fruit then
                local ftIdx = tonumber(fruit.fillTypeIndex or fruit.harvestFillType or fruit.fillType)
                if ftIdx and ftIdx > 0 then
                    _put(_catalog, ftIdx, crop)
                    FillTypeUtils._cropIndexMap[crop] = ftIdx
                end
            end
        end
    end

    for idx in pairs(observed) do
        local key = tonumber(idx)
        local cached = _catalog[key]
        if not cached or cached == "" or tonumber(cached) then
            FillTypeUtils.probeIndex(_ftm(), key)
            cached = _catalog[key]
        end
        if not cached or cached == "" or tonumber(cached) then
            local name = FillTypeUtils.displayForIndex(key) or FillTypeUtils.titleForIndex(key)
            if name and not tonumber(name) then
                local u = string.upper(tostring(name))
                _put(_catalog, key, u)
                FillTypeUtils._cropIndexMap[u] = key
            else
                for crop in pairs(cropNames) do
                    local i2 = FillTypeUtils.indexForName(crop)
                    if i2 == key then
                        _put(_catalog, key, crop)
                        FillTypeUtils._cropIndexMap[crop] = key
                        break
                    end
                end
            end
        end
        if not _titles[key] or _titles[key] == "" then
            local _, title = FillTypeUtils.probeIndex(_ftm(), key)
            if not title then
                title = FillTypeUtils.titleForIndex(key)
            end
            if title then _putTitle(_titles, key, title) end
        end
    end

    return _catalog
end

--- Returns a fill-type name or nil — never a bare numeric string.
function FillTypeUtils.nameForIndex(fillTypeIndex)
    if fillTypeIndex == nil then return nil end
    if type(fillTypeIndex) == "string" and not tonumber(fillTypeIndex) then
        return fillTypeIndex
    end

    local idx = tonumber(fillTypeIndex)
    if not idx then return nil end

    local ftm = _ftm()
    if ftm and ftm.fillTypeIndexToName then
        local direct = ftm.fillTypeIndexToName[idx]
        if direct and tostring(direct) ~= "" and not tonumber(direct) then
            _catalog = _catalog or {}
            _catalog[idx] = tostring(direct)
            return tostring(direct)
        end
    end
    if ftm and ftm.indexToName then
        local direct = ftm.indexToName[idx]
        if direct and tostring(direct) ~= "" and not tonumber(direct) then
            _catalog = _catalog or {}
            _catalog[idx] = tostring(direct)
            return tostring(direct)
        end
    end

    local cached = FillTypeUtils.catalog()[idx]
    if cached and not tonumber(cached) then return cached end

    if ftm and ftm.getFillTypeByIndex then
        local ok, ft = pcall(function() return ftm:getFillTypeByIndex(idx) end)
        if ok and ft and ft.name and tostring(ft.name) ~= "" then
            _catalog = _catalog or {}
            _catalog[idx] = tostring(ft.name)
            return _catalog[idx]
        end
        if ok and ft and ft.title and tostring(ft.title) ~= "" then
            _catalog = _catalog or {}
            _catalog[idx] = tostring(ft.title)
            return _catalog[idx]
        end
    end
    if ftm and ftm.getFillTypeNameByIndex then
        local ok, name = pcall(function() return ftm:getFillTypeNameByIndex(idx) end)
        if ok and name and tostring(name) ~= "" and not tonumber(name) then
            _catalog = _catalog or {}
            _catalog[idx] = tostring(name)
            return _catalog[idx]
        end
    end

    return nil
end

--- Localized HUD title (works for map/mod fill types when name lookup fails).
function FillTypeUtils.titleForIndex(fillTypeIndex)
    local idx = tonumber(fillTypeIndex)
    if not idx then return nil end
    if _titles and _titles[idx] and _titles[idx] ~= "" then
        return _titles[idx]
    end
    local ftm = _ftm()
    if ftm and ftm.indexToTitle and ftm.indexToTitle[idx] then
        local t = tostring(ftm.indexToTitle[idx])
        if t ~= "" then return t end
    end
    if ftm and ftm.getFillTypeByIndex then
        local ok, ft = pcall(function() return ftm:getFillTypeByIndex(idx) end)
        if ok and ft and ft.title and tostring(ft.title) ~= "" then
            return tostring(ft.title)
        end
    end
    if ftm and ftm.getFillTypeTitleByIndex then
        local ok, title = pcall(function() return ftm:getFillTypeTitleByIndex(idx) end)
        if ok and title and tostring(title) ~= "" then
            _titles = _titles or {}
            _putTitle(_titles, idx, title)
            return tostring(title)
        end
    end
    return nil
end

--- Best display label: internal name, else localized title.
function FillTypeUtils.displayForIndex(fillTypeIndex)
    return FillTypeUtils.nameForIndex(fillTypeIndex) or FillTypeUtils.titleForIndex(fillTypeIndex)
end

function FillTypeUtils.baleCategoryFromIndex(fillTypeIndex)
    local idx = tonumber(fillTypeIndex)
    if not idx then return nil end

    local label = FillTypeUtils.displayForIndex(idx) or FillTypeUtils.titleForIndex(idx)
    if label and label ~= "" then
        local fromName = FillTypeUtils.baleCategoryFromName(label)
        if fromName ~= "other" then return fromName end
    end

    local ftm = _ftm()
    if ftm and ftm.getIsFillTypeInCategory then
        local function inCat(categoryName)
            local ok, hit = pcall(function() return ftm:getIsFillTypeInCategory(idx, categoryName) end)
            return ok and hit
        end
        if inCat("STRAW") then return "straw" end
        if inCat("SILAGE") or inCat("FERMENTED") then return "silage" end
        if inCat("DRYGRASS") or inCat("DRYGRASS_WINDROW") then return "hay" end
        if inCat("WINDROW") or inCat("GRASS") or inCat("GRASS_WINDROW") then
            if label and string.find(string.upper(tostring(label)), "DRYGRASS") then return "hay" end
            if label and string.find(string.upper(tostring(label)), "STRAW") then return "straw" end
            return "grass"
        end
    end

    local legacy = {
        [25] = "silage",
        [26] = "grass",
        [28] = "grass",
        [30] = "hay",
        [31] = "straw",
    }
    if legacy[idx] then return legacy[idx] end

    if label and label ~= "" then
        return FillTypeUtils.baleCategoryFromName(label)
    end
    return nil
end

function FillTypeUtils.baleCategoryFromName(name)
    name = string.upper(tostring(name or ""))
    if name == "" then return "other" end
    if string.find(name, "STRAW", 1, true) then return "straw" end
    if string.find(name, "SILAGE", 1, true) then return "silage" end
    if string.find(name, "FERMENT", 1, true) then return "silage" end
    if string.find(name, "DRYGRASS", 1, true) then return "hay" end
    if string.find(name, "HAY", 1, true) then return "hay" end
    if string.find(name, "GRASS_WINDROW", 1, true) then return "grass" end
    if string.find(name, "GRASS", 1, true) and not string.find(name, "FERT", 1, true) then return "grass" end
    return "other"
end

function FillTypeUtils.unwrapBaleEntity(it)
    if not it then return nil end
    if type(it.getRealObject) == "function" then
        local ok, real = pcall(function() return it:getRealObject() end)
        if ok and real then return real end
    end
    local inner = rawget(it, "baleObject")
    if inner then return inner end
    return it
end

local function _fillTypeIndexFromMoistureSystem(entity)
    if not entity then return nil end
    local uid = rawget(entity, "uniqueId")
    if not uid then return nil end
    local mission = rawget(_G, "g_currentMission")
    local ms = mission and mission.MoistureSystem
    if not ms then return nil end

    if ms.objectInfo and ms.objectInfo[uid] then
        for fillTypeName, info in pairs(ms.objectInfo[uid]) do
            if info and type(fillTypeName) == "string" and fillTypeName ~= "" then
                local idx = FillTypeUtils.indexForName(fillTypeName)
                if idx then return idx end
            end
        end
    end

    if ms.getObjectMoisture then
        for _, idx in ipairs({ 26, 28, 30, 25, 31 }) do
            local ok, m = pcall(function() return ms:getObjectMoisture(uid, idx) end)
            if ok and m ~= nil then return idx end
        end
    end
    return nil
end

function FillTypeUtils.fillTypeIndexFromEntity(it)
    if not it then return nil end

    local function indexFromAttrs(attrs)
        if not attrs then return nil end
        local ftRaw = rawget(attrs, "fillType")
        if type(ftRaw) == "string" and not tonumber(ftRaw) then
            local byName = FillTypeUtils.indexForName(ftRaw)
            if byName then return byName end
        end
        local aidx = FillTypeUtils.coerceFillTypeIndex(
            ftRaw or rawget(attrs, "fillTypeIndex")
        )
        if aidx then return aidx end
        for _, key in ipairs({ "fillTypeName", "fillTypeStr" }) do
            local nm = rawget(attrs, key)
            if type(nm) == "string" and nm ~= "" then
                local i2 = FillTypeUtils.indexForName(nm)
                if i2 then return i2 end
            end
        end
        return FillTypeUtils.indexFromBaleXml(rawget(attrs, "xmlFilename"))
    end

    --- Giants objectStorage abstract entries (bale sheds on dedicated server).
    local idx = indexFromAttrs(rawget(it, "baleAttributes"))
    if idx then return idx end

    if type(it.getBaleAttributes) == "function" then
        local ok, attrs = pcall(function() return it:getBaleAttributes() end)
        if ok then
            idx = indexFromAttrs(attrs)
            if idx then return idx end
        end
    end

    local function indexFromBaleType(bt)
        if bt == nil then return nil end
        local coerced = FillTypeUtils.coerceFillTypeIndex(bt)
        if coerced then return coerced end
        local btm = rawget(_G, "g_baleManager")
        if btm and type(btm.baleTypes) == "table" then
            local entry = btm.baleTypes[bt] or btm.baleTypes[tonumber(bt)]
            if entry then
                return FillTypeUtils.coerceFillTypeIndex(
                    rawget(entry, "fillType") or rawget(entry, "fillTypeIndex")
                )
            end
        end
        return nil
    end

    local function indexFromEntity(entity)
        if not entity then return nil end
        local ftRaw = rawget(entity, "fillType")
        if type(ftRaw) == "string" and not tonumber(ftRaw) then
            local byName = FillTypeUtils.indexForName(ftRaw)
            if byName then return byName end
        end
        local direct = FillTypeUtils.coerceFillTypeIndex(
            ftRaw or rawget(entity, "fillTypeIndex") or rawget(entity, "fillIndex")
        )
        if direct then return direct end

        local btIdx = indexFromBaleType(rawget(entity, "baleType"))
        if btIdx then return btIdx end

        for _, key in ipairs({ "fillTypeName", "fillTypeStr", "lastFillTypeName" }) do
            local nm = rawget(entity, key)
            if type(nm) == "string" and nm ~= "" then
                local i2 = FillTypeUtils.indexForName(nm)
                if i2 then return i2 end
            end
        end

        if type(entity.getFillType) == "function" then
            local ok, ft = pcall(function() return entity:getFillType() end)
            if ok and ft ~= nil then
                direct = FillTypeUtils.coerceFillTypeIndex(ft)
                if direct then return direct end
            end
        end

        local bspec = rawget(entity, "spec_bale")
        if bspec then
            direct = FillTypeUtils.coerceFillTypeIndex(
                rawget(bspec, "fillType") or rawget(bspec, "fillTypeIndex")
            )
            if direct then return direct end
        end

        local fuSpec = rawget(entity, "spec_fillUnit")
        if fuSpec and type(fuSpec.fillUnits) == "table" then
            for _, fu in pairs(fuSpec.fillUnits) do
                if fu and fu.fillType and (tonumber(fu.fillLevel) or 0) > 0 then
                    direct = FillTypeUtils.coerceFillTypeIndex(fu.fillType)
                    if direct then return direct end
                end
            end
        end

        return FillTypeUtils.indexFromBaleXml(
            rawget(entity, "xmlFilename") or rawget(entity, "configFileName")
        )
    end

    idx = indexFromEntity(it)
    if idx then return idx end
    idx = _fillTypeIndexFromMoistureSystem(it)
    if idx then return idx end

    local inner = rawget(it, "item")
    if inner and inner ~= it then
        idx = indexFromEntity(inner)
        if idx then return idx end
        idx = _fillTypeIndexFromMoistureSystem(inner)
        if idx then return idx end
    end

    local unwrapped = FillTypeUtils.unwrapBaleEntity(it)
    idx = indexFromEntity(unwrapped)
    if idx then return idx end
    return _fillTypeIndexFromMoistureSystem(unwrapped)
end

function FillTypeUtils.resolveBale(it)
    local idx = FillTypeUtils.fillTypeIndexFromEntity(it)
    local label = idx and (FillTypeUtils.displayForIndex(idx) or FillTypeUtils.titleForIndex(idx)) or nil
    local category = FillTypeUtils.baleCategoryFromName(label or "")
    if category == "other" and idx then
        category = FillTypeUtils.baleCategoryFromIndex(idx) or category
    end
    return idx, label or "", category
end

function FillTypeUtils.newBaleBucket()
    return { straw = 0, grass = 0, hay = 0, silage = 0, other = 0, byFillType = {} }
end

local function _tallyBaleResolved(bucket, idx, label, cat, count)
    count = tonumber(count) or 1
    if count < 1 or not bucket then return end
    bucket.byFillType = bucket.byFillType or {}
    if (not label or label == "") and idx then
        label = FillTypeUtils.displayForIndex(idx) or FillTypeUtils.titleForIndex(idx) or ""
    end
    if cat == "other" and label ~= "" then
        cat = FillTypeUtils.baleCategoryFromName(label)
    end
    if cat == "other" and idx then
        cat = FillTypeUtils.baleCategoryFromIndex(idx) or cat
    end
    bucket[cat] = (bucket[cat] or 0) + count
    if label and label ~= "" and not tonumber(label) then
        bucket.byFillType[label] = (bucket.byFillType[label] or 0) + count
    end
end

function FillTypeUtils.tallyBale(bucket, it)
    if not bucket then return end
    local idx, label, cat = FillTypeUtils.resolveBale(it)
    if not idx and (not label or label == "") then
        cat = "other"
    end
    _tallyBaleResolved(bucket, idx, label, cat, 1)
end

--- Tally multiple identical stored bales (objectStorage DS aggregate: numObjects > 1).
function FillTypeUtils.tallyBales(bucket, it, count)
    if not bucket then return end
    local idx, label, cat = FillTypeUtils.resolveBale(it)
    _tallyBaleResolved(bucket, idx, label, cat, count)
end

--- Tally when fill-type index is already known (objectStorage groups).
function FillTypeUtils.tallyBalesByIndex(bucket, fillTypeIndex, count)
    if not bucket then return end
    local idx = FillTypeUtils.coerceFillTypeIndex(fillTypeIndex)
    if not idx then
        count = tonumber(count) or 1
        if count > 0 then
            bucket.other = (bucket.other or 0) + count
        end
        return
    end
    local label = FillTypeUtils.displayForIndex(idx) or FillTypeUtils.titleForIndex(idx) or ""
    local cat = FillTypeUtils.baleCategoryFromName(label)
    if cat == "other" then
        cat = FillTypeUtils.baleCategoryFromIndex(idx) or cat
    end
    _tallyBaleResolved(bucket, idx, label, cat, count)
end

function FillTypeUtils.serializeBaleBucket(src)
    src = src or {}
    local byFill = {}
    if src.byFillType then
        for k, v in pairs(src.byFillType) do
            if (tonumber(v) or 0) > 0 and not tonumber(tostring(k)) then
                byFill[tostring(k)] = v
            end
        end
    end
    return {
        straw = src.straw or 0,
        grass = src.grass or 0,
        hay = src.hay or 0,
        silage = src.silage or 0,
        other = src.other or 0,
        byFillType = byFill,
    }
end

--- Rebuild category counts from named breakdown (used at JSON assembly).
function FillTypeUtils.reconcileBaleBucket(src)
    src = src or {}
    local out = FillTypeUtils.newBaleBucket()
    out.byFillType = {}
    if src.byFillType then
        for k, v in pairs(src.byFillType) do
            local n = tonumber(v) or 0
            if n > 0 and not tonumber(tostring(k)) then
                out.byFillType[tostring(k)] = n
                local cat = FillTypeUtils.baleCategoryFromName(k)
                out[cat] = (out[cat] or 0) + n
            end
        end
    end
    for _, cat in ipairs({ "straw", "grass", "hay", "silage", "other" }) do
        if (out[cat] or 0) == 0 and (tonumber(src[cat]) or 0) > 0 then
            out[cat] = src[cat]
        end
    end
    return FillTypeUtils.serializeBaleBucket(out)
end
