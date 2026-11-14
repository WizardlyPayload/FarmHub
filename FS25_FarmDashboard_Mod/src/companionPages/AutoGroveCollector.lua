-- Auto Grove 1.0.0.0 keeps last successful planting records by field.
-- A record is not proof that the grove or all planted units still exist.

local MAX_SCAN, MAX_ROWS = 500, 80

local function positiveInt(ctx, value)
    local n = ctx.num(value)
    return n ~= nil and n > 0 and n == math.floor(n) and n or nil
end

CompanionPages.register({
    key = "autoGrovePlantings",
    modNames = { "FS25_AutoGrove", "KM_82201_Auto_Grove" },
    substrings = { "autogrove", "auto_grove" },
    collect = function(ctx)
        local farmId = positiveInt(ctx, ctx.farmId)
        if farmId == nil then return { readState = "settings-only", reason = "no-farm" } end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-plantings-only" }
        end
        if ctx.version ~= "1.0.0.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local loaded = ctx.global("g_modIsLoaded")
        if type(loaded) == "table" and loaded.FS25_FSCoreAutoPlant == true then
            return { readState = "settings-only", reason = "other-edition-loaded" }
        end
        local mod = ctx.symbol("FSCoreAutoPlant")
        local data = type(mod) == "table" and mod.Data or nil
        local plantings = type(data) == "table" and data.plantings or nil
        if type(mod) ~= "table" or mod.initialized ~= true
            or type(plantings) ~= "table" or data._loading == true then
            return { readState = "settings-only", reason = "planting-register-not-ready" }
        end
        local fields = ctx.global("g_fieldManager")
        local land = ctx.global("g_farmlandManager")
        if type(fields) ~= "table" or type(land) ~= "table" then
            return { readState = "settings-only", reason = "ownership-managers-unavailable" }
        end

        local rows, count, units, withheld = {}, 0, 0, 0
        local scanned, invalid, truncated = 0, false, false
        for fieldKey, record in pairs(plantings) do
            scanned = scanned + 1
            if scanned > MAX_SCAN then truncated = true; break end
            if type(record) == "table" and positiveInt(ctx, record.farmId) == farmId then
                local fieldId = positiveInt(ctx, fieldKey)
                local field = fieldId and ctx.call(fields, "getFieldById", fieldId) or nil
                local fieldNumber = field and positiveInt(ctx, ctx.call(field, "getId")) or nil
                local farmlandId = field and type(field.farmland) == "table"
                    and positiveInt(ctx, field.farmland.id) or nil
                local owner = farmlandId and ctx.num(ctx.call(land, "getFarmlandOwner", farmlandId)) or nil
                if fieldId == nil or fieldNumber ~= fieldId or farmlandId ~= fieldId
                    or owner ~= farmId then
                    withheld = withheld + 1
                else
                    local crop = ctx.clip(record.crop, 64)
                    local planted = positiveInt(ctx, record.count)
                    local heading = ctx.num(record.headingDeg)
                    local rowSpacing = ctx.num(record.rowSpacing)
                    local plantSpacing = ctx.num(record.plantSpacing)
                    if crop == nil or crop == "" or planted == nil or heading == nil
                        or rowSpacing == nil or rowSpacing < 0
                        or plantSpacing == nil or plantSpacing < 0 then
                        invalid = true
                    else
                        count = count + 1
                        units = units + planted
                        if #rows >= MAX_ROWS then truncated = true
                        else
                            rows[#rows + 1] = {
                                farmId = farmId, fieldId = fieldId, crop = crop,
                                plantedCount = planted, headingDeg = heading,
                                rowSpacing = rowSpacing, plantSpacing = plantSpacing,
                                treeMode = record.useTrees == true,
                                placeableLinked = type(record.placeableId) == "string"
                                    and record.placeableId ~= "",
                            }
                        end
                    end
                end
            end
        end
        table.sort(rows, function(a, b) return a.fieldId < b.fieldId end)
        return {
            readState = (invalid or withheld > 0) and "partial" or
                (count > 0 and "ok" or "settings-only"),
            reason = count == 0 and "no-current-owned-plantings" or nil,
            coverage = truncated and "truncated" or
                (invalid or withheld > 0) and "partial" or "complete",
            byFarm = { [tostring(farmId)] = {
                recordedFieldCount = count,
                recordedUnitCount = units,
                withheldOwnership = withheld,
            } },
            rows = rows,
        }
    end,
})
