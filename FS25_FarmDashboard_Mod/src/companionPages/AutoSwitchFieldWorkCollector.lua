-- AutoSwitch 1.0.3.0 records the last substantial sow/fertiliser/herbicide pass by field.
-- Records have no actor farm ID. A row describes the history of land owned now,
-- not work proved to have been done by its current owner.
local MAX_FIELDS = 500
local MAX_RECORDS = 500
local MAX_ROWS = 100

local function integer(value, low, high)
    local n = tonumber(value)
    if n == nil or n ~= n or n == math.huge or n == -math.huge
        or n ~= math.floor(n) or n < low or n > high then return nil end
    return n
end

local function date(value)
    if type(value) ~= "table" then return nil end
    local year = integer(value.year, 1, 10000)
    local period = integer(value.period, 1, 12)
    local day = integer(value.dayInPeriod, 1, 100)
    local monotonicDay = integer(value.mday, 1, 1000000)
    if year == nil or period == nil or day == nil or monotonicDay == nil then return nil end
    return { year = year, period = period, dayInPeriod = day,
        monotonicDay = monotonicDay }
end

CompanionPages.register({
    key = "autoSwitchFieldWork",
    modNames = { "KM_82844_AutoSwitch", "FS25_AutoSwitch" },
    substrings = { "autoswitch" },
    collect = function(ctx)
        if ctx.version ~= "1.0.3.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmId = integer(ctx.farmId, 1, 1024)
        if farmId == nil then return { readState = "settings-only", reason = "no-farm" } end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-field-history-only" }
        end
        if ctx.mission.isMissionStarted == false then
            return { readState = "settings-only", reason = "world-not-started" }
        end
        local module = ctx.symbol("AS_Fields") or ctx.global("AS_Fields")
        local records = type(module) == "table" and module.records or nil
        if type(records) ~= "table" then
            return { readState = "settings-only", reason = "field-history-unavailable" }
        end
        local fieldManager = ctx.global("g_fieldManager")
        local farmlandManager = ctx.global("g_farmlandManager")
        if type(fieldManager) ~= "table" or type(fieldManager.getFields) ~= "function"
            or type(farmlandManager) ~= "table"
            or type(farmlandManager.getFarmlandOwner) ~= "function" then
            return { readState = "settings-only", reason = "ownership-api-unavailable" }
        end
        local fields = ctx.call(fieldManager, "getFields")
        if type(fields) ~= "table" then
            return { readState = "settings-only", reason = "fields-unavailable" }
        end
        local byId, fieldCount = {}, 0
        for _, field in pairs(fields) do
            fieldCount = fieldCount + 1
            if fieldCount > MAX_FIELDS then
                return { readState = "partial", coverage = "truncated", reason = "field-limit" }
            end
            if type(field) == "table" then
                local id = integer(ctx.call(field, "getId"), 1, 1000000)
                local landId = type(field.farmland) == "table"
                    and integer(field.farmland.id, 1, 1000000) or nil
                if id ~= nil and landId == id then
                    if byId[id] ~= nil then
                        return { readState = "partial", coverage = "partial",
                            reason = "duplicate-field-id" }
                    end
                    byId[id] = field
                end
            end
        end
        local fruitManager = ctx.global("g_fruitTypeManager")
        local rows, seen, incomplete = {}, 0, false
        for key, record in pairs(records) do
            seen = seen + 1
            if seen > MAX_RECORDS then
                return { readState = "partial", coverage = "truncated", reason = "record-limit" }
            end
            local id = integer(key, 1, 1000000)
            local field = id and byId[id] or nil
            if id == nil or field == nil then
                incomplete = true
            else
                local owner = integer(ctx.call(farmlandManager, "getFarmlandOwner", id), 0, 1024)
                if owner == nil then
                    incomplete = true
                elseif owner == farmId then
                    if type(record) ~= "table" then
                        incomplete = true
                    else
                        local row = { farmId = farmId, fieldId = id }
                        local valid = true
                        if record.sow ~= nil then
                            row.sown = date(record.sow.date)
                            local index = integer(record.sow.fruit, 1, 10000)
                            local fruit = index and type(fruitManager) == "table"
                                and ctx.call(fruitManager, "getFruitTypeByIndex", index) or nil
                            row.crop = type(fruit) == "table"
                                and ctx.clip(fruit.title or fruit.name, 80) or nil
                            if row.sown == nil then valid = false end
                        end
                        if record.fert ~= nil then
                            row.fertilised = date(record.fert.date)
                            row.fertiliserPasses = integer(record.fert.n, 1, 1000)
                            row.fertiliser = type(record.fert.fill) == "string"
                                and ctx.clip(record.fert.fill, 60) or nil
                            if row.fertilised == nil or row.fertiliserPasses == nil then
                                valid = false
                            end
                        end
                        if record.herb ~= nil then
                            row.herbicide = date(record.herb.date)
                            if row.herbicide == nil then valid = false end
                        end
                        if record.sow == nil and record.fert == nil and record.herb == nil then
                            valid = false
                        end
                        if valid then
                            if #rows >= MAX_ROWS then
                                return { readState = "partial", coverage = "truncated",
                                    reason = "row-limit" }
                            end
                            rows[#rows + 1] = row
                        else
                            incomplete = true
                        end
                    end
                end
            end
        end
        table.sort(rows, function(a, b) return a.fieldId < b.fieldId end)
        if incomplete then
            return { readState = "partial", coverage = "partial",
                reason = "unresolved-field-history", rows = rows }
        end
        if #rows == 0 then
            return { readState = "settings-only", coverage = "complete",
                reason = "no-owned-field-history" }
        end
        return { readState = "ok", coverage = "complete",
            byFarm = { [tostring(farmId)] = { recordedFieldCount = #rows } },
            rows = rows }
    end,
})
