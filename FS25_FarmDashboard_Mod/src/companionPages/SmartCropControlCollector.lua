-- FS25 FarmDashboard | companionPages/SmartCropControlCollector.lua | v1.0.0
-- Smart Crop Control (Razak, 1.2.0.0). Mod-env global SmartFruitControl:
--   settings.<category>_chance_<band>  0..100, category root|vegetable|special, band 0_3|3_8|8_20|20_30|30_plus
--   rootFruitNames / vegetableFruitNames / specialFruitNames  controlled fruit names (upper case, no punctuation)
-- When the game plans a controlled crop for an NPC field, the mod keeps it with the band's chance, otherwise it
-- swaps in a standard crop. Settings live in the user profile (modSettings/FS25_SmartFruitControl.xml), not in
-- the save. The map view reads only plain Field members (areaHa, plannedFruitTypeIndex, fieldState.fruitTypeIndex)
-- of fields without an owner; no density-map probes.

local FIELD_SCAN = 400
local FIELD_LIST = 40

local BANDS = { "0_3", "3_8", "8_20", "20_30", "30_plus" }
local CATEGORIES = { "root", "vegetable", "special" }
local NAME_SETS = { root = "rootFruitNames", vegetable = "vegetableFruitNames", special = "specialFruitNames" }

local function bandFor(areaHa)
    if areaHa < 3 then
        return 1
    elseif areaHa < 8 then
        return 2
    elseif areaHa < 20 then
        return 3
    elseif areaHa < 30 then
        return 4
    end
    return 5
end

local function normalize(name)
    return (string.upper(tostring(name)):gsub("[^A-Z0-9]", ""))
end

CompanionPages.register({
    key = "smartCropControl",
    modNames = { "FS25_SmartCropControl", "FS25_366374_Smart_Crop_Control" },
    substrings = { "smartcropcontrol", "smart_crop_control" },
    collect = function(ctx)
        local sfc = ctx.symbol("SmartFruitControl")
        if type(sfc) ~= "table" or type(sfc.settings) ~= "table" then
            return nil
        end
        local settings = sfc.settings
        local chances = {}
        for _, category in ipairs(CATEGORIES) do
            local row = {}
            for i, band in ipairs(BANDS) do
                row[i] = ctx.num(settings[category .. "_chance_" .. band])
            end
            chances[category] = row
        end

        local lookup, controlled = {}, {}
        for _, category in ipairs(CATEGORIES) do
            local set = sfc[NAME_SETS[category]]
            controlled[category] = {}
            if type(set) == "table" then
                for name, on in pairs(set) do
                    if on == true and type(name) == "string" then
                        lookup[name] = category
                    end
                end
            end
        end

        local out = { chances = chances, debug = settings.debug == true }

        local fruitMgr = ctx.global("g_fruitTypeManager")
        local function fruitName(index)
            if index == nil or index == 0 then
                return nil
            end
            local name = fruitMgr and ctx.call(fruitMgr, "getFruitTypeNameByIndex", index) or nil
            return type(name) == "string" and name or nil
        end
        local function categoryOf(index)
            local name = fruitName(index)
            if name == nil then
                return nil, nil
            end
            return lookup[normalize(name)], name
        end

        local fieldMgr = ctx.global("g_fieldManager") or (ctx.mission and ctx.mission.fieldManager)
        if type(fieldMgr) ~= "table" then
            out.readState = "settings-only"
            return out
        end

        local onMap = {}
        if type(fieldMgr.availableFruitTypeIndices) == "table" then
            for _, index in ipairs(fieldMgr.availableFruitTypeIndices) do
                local category, name = categoryOf(index)
                if category then
                    onMap[normalize(name)] = name
                end
            end
        end
        for name, category in pairs(lookup) do
            local list = controlled[category]
            list[#list + 1] = { crop = name, onMap = onMap[name] ~= nil }
        end
        for _, category in ipairs(CATEGORIES) do
            table.sort(controlled[category], function(a, b) return a.crop < b.crop end)
        end
        out.crops = controlled

        local bands = {}
        for i, band in ipairs(BANDS) do
            bands[i] = { band = band, fields = 0, areaHa = 0, growing = { root = 0, vegetable = 0, special = 0 }, planned = { root = 0, vegetable = 0, special = 0 } }
        end
        local fields, npc, scanned, truncated = {}, 0, 0, false
        for _, field in pairs(type(fieldMgr.fields) == "table" and fieldMgr.fields or {}) do
            scanned = scanned + 1
            if scanned > FIELD_SCAN then
                truncated = true
                break
            end
            if type(field) == "table" and field.isMissionAllowed ~= false and not field.grassMissionOnly
                and ctx.call(field, "getHasOwner") == false then
                local area = ctx.num(ctx.call(field, "getAreaHa")) or ctx.num(field.areaHa)
                if area and area > 0 then
                    npc = npc + 1
                    local b = bandFor(area)
                    local bucket = bands[b]
                    bucket.fields = bucket.fields + 1
                    bucket.areaHa = bucket.areaHa + area
                    local state = type(field.fieldState) == "table" and field.fieldState or nil
                    local growingCat, growingName = nil, nil
                    if state and state.isValid ~= false then
                        growingCat, growingName = categoryOf(state.fruitTypeIndex)
                    end
                    local plannedCat, plannedName = categoryOf(field.plannedFruitTypeIndex)
                    if growingCat then
                        bucket.growing[growingCat] = bucket.growing[growingCat] + 1
                    end
                    if plannedCat then
                        bucket.planned[plannedCat] = bucket.planned[plannedCat] + 1
                    end
                    local cat, name, stage = growingCat, growingName, "growing"
                    if cat == nil and plannedCat then
                        cat, name, stage = plannedCat, plannedName, "planned"
                    end
                    if cat and #fields < FIELD_LIST then
                        fields[#fields + 1] = {
                            fieldId = ctx.num(ctx.call(field, "getId")),
                            name = ctx.clip(ctx.call(field, "getName") or "?", 40),
                            areaHa = ctx.round2(area),
                            band = BANDS[b],
                            crop = name,
                            category = cat,
                            stage = stage,
                            keepChance = chances[cat][b],
                        }
                    elseif cat then
                        truncated = true
                    end
                end
            end
        end
        for _, bucket in ipairs(bands) do
            bucket.areaHa = ctx.round2(bucket.areaHa)
        end
        table.sort(fields, function(a, b) return (a.fieldId or 0) < (b.fieldId or 0) end)
        out.npcFieldCount = npc
        out.bands = bands
        out.fields = fields
        out.coverage = truncated and "sampled" or "complete"
        out.readState = "ok"
        return out
    end,
})
