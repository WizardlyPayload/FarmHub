-- FS25 FarmDashboard | companionPages/ProductionWatcherCollector.lua | v1.0.0
-- Production Watcher (Temmmych) keeps its instance private: ProductionWatcher.new() is never stored,
-- so its message window cannot be read. The mod's alert rules are plain thresholds on native
-- production data (ProductionWatcher:check), so this page applies the same rules to the game's own
-- ProductionChainManager points for the export farm. Nothing here is read from the mod itself.

local SCAN_POINTS = 250
local MAX_POINTS = 30
local MAX_STORAGE_ROWS = 10
local MAX_PRODUCTIONS = 12

-- ProductionPoint.PROD_STATUS / OUTPUT_MODE (dataS/scripts/objects/ProductionPoint.lua)
local STATUS_MISSING_INPUTS = 2
local STATUS_NO_OUTPUT_SPACE = 3
local OUTPUT_DIRECT_SELL = 1
local OUTPUT_AUTO_DELIVER = 2

-- Production Watcher only watches these placeable types (exact match in the mod).
local WATCHED_TYPES = { productionPoint = true, greenhouse = true }

local INPUT_RANK = { low = 1, missing = 3 }
local OUTPUT_RANK = { nearlyFull = 2, full = 4 }

local function fillTypeInfo(ctx, index)
    local ftm = ctx.global("g_fillTypeManager")
    if type(ftm) ~= "table" or ctx.num(index) == nil then
        return nil, nil
    end
    local name = ctx.call(ftm, "getFillTypeNameByIndex", index)
    local title = nil
    local ft = ctx.call(ftm, "getFillTypeByIndex", index)
    if type(ft) == "table" then
        title = ft.title
        name = name or ft.name
    end
    return ctx.clip(name, 40), ctx.clip(title, 60)
end

local function percentOf(level, capacity)
    if level == nil or capacity == nil or capacity <= 0 then
        return nil
    end
    return math.floor((level / capacity) * 1000 + 0.5) / 10
end

local function worse(current, candidate, rank)
    if candidate == nil then
        return current
    end
    if current == nil or rank[candidate] > rank[current] then
        return candidate
    end
    return current
end

local function readPoint(ctx, point)
    local placeable = type(point.owningPlaceable) == "table" and point.owningPlaceable or nil
    local typeName = placeable and type(placeable.typeName) == "string" and placeable.typeName or nil
    local name = ctx.call(point, "getName") or (placeable and ctx.call(placeable, "getName")) or nil
    local storage = type(point.storage) == "table" and point.storage or nil
    local row = {
        id = placeable and placeable.uniqueId ~= nil and ctx.clip(placeable.uniqueId, 60) or nil,
        name = ctx.clip(name, 60),
        typeName = ctx.clip(typeName, 40),
        watched = typeName ~= nil and WATCHED_TYPES[typeName] == true,
        productions = 0,
        active = 0,
        missingInputLines = 0,
        noSpaceLines = 0,
        storage = {},
    }
    local seen = {}
    local inputAlert, outputAlert = nil, nil

    local function storageRow(fillType, role)
        local level = storage and ctx.num(ctx.call(storage, "getFillLevel", fillType)) or nil
        local capacity = storage and ctx.num(ctx.call(storage, "getCapacity", fillType)) or nil
        local key = role .. ":" .. tostring(fillType)
        if not seen[key] and #row.storage < MAX_STORAGE_ROWS then
            seen[key] = true
            local ftName, ftTitle = fillTypeInfo(ctx, fillType)
            row.storage[#row.storage + 1] = {
                fillType = ftName,
                title = ftTitle,
                role = role,
                level = ctx.round2(level),
                capacity = ctx.round2(capacity),
                percent = percentOf(level, capacity),
            }
        end
        return level, capacity
    end

    local productions = type(point.productions) == "table" and point.productions or {}
    local scanned = 0
    for _, production in pairs(productions) do
        scanned = scanned + 1
        if scanned > MAX_PRODUCTIONS then
            row.truncated = true
            break
        end
        if type(production) == "table" then
            row.productions = row.productions + 1
            local status = ctx.num(production.status) or 0
            if status == STATUS_MISSING_INPUTS then
                row.missingInputLines = row.missingInputLines + 1
            elseif status == STATUS_NO_OUTPUT_SPACE then
                row.noSpaceLines = row.noSpaceLines + 1
            end
            local watchedLine = status > 0
            if watchedLine then
                row.active = row.active + 1
            end
            for _, input in ipairs(type(production.inputs) == "table" and production.inputs or {}) do
                if type(input) == "table" and ctx.num(input.type) then
                    local level, capacity = storageRow(input.type, "input")
                    if watchedLine and level ~= nil and capacity ~= nil and capacity > 0 then
                        local amount = ctx.num(input.amount) or 0
                        if status == STATUS_MISSING_INPUTS or level < amount then
                            inputAlert = worse(inputAlert, "missing", INPUT_RANK)
                        elseif (level / capacity) * 100 < 5 then
                            inputAlert = worse(inputAlert, "low", INPUT_RANK)
                        end
                    end
                end
            end
            for _, output in ipairs(type(production.outputs) == "table" and production.outputs or {}) do
                if type(output) == "table" and ctx.num(output.type) then
                    local level, capacity = storageRow(output.type, "output")
                    local mode = ctx.num(ctx.call(point, "getOutputDistributionMode", output.type)) or 0
                    if watchedLine and mode ~= OUTPUT_DIRECT_SELL and mode ~= OUTPUT_AUTO_DELIVER
                        and level ~= nil and capacity ~= nil and capacity > 0 then
                        local pct = (level / capacity) * 100
                        if status == STATUS_NO_OUTPUT_SPACE or pct > 99.5 then
                            outputAlert = worse(outputAlert, "full", OUTPUT_RANK)
                        elseif pct > 95 then
                            outputAlert = worse(outputAlert, "nearlyFull", OUTPUT_RANK)
                        end
                    end
                end
            end
        end
    end
    if row.watched then
        row.inputAlert = inputAlert
        row.outputAlert = outputAlert
    end
    return row
end

CompanionPages.register({
    key = "productionWatcher",
    modNames = { "FS25_ProductionWatcher", "FS25_319635_Production_Watcher" },
    substrings = { "productionwatcher", "production_watcher" },
    collect = function(ctx)
        local farmId = ctx.farmId
        local mission = ctx.mission
        local pcm = type(mission) == "table" and mission.productionChainManager or nil
        local base = { alertsReadable = false, alertSource = "rulesMirror" }
        if farmId == nil or farmId <= 0 then
            base.readState = "settings-only"
            base.reason = "no-farm"
            return base
        end
        if type(pcm) ~= "table" or type(pcm.productionPoints) ~= "table" then
            base.readState = "settings-only"
            base.reason = "no-production-manager"
            return base
        end

        local farm = {
            pointCount = 0,
            watchedCount = 0,
            activeLines = 0,
            missingInputs = 0,
            lowInputs = 0,
            outputFull = 0,
            outputNearlyFull = 0,
        }
        local points = {}
        local rows = {}
        local scanned, truncated, failed = 0, false, 0
        for _, point in pairs(pcm.productionPoints) do
            scanned = scanned + 1
            if scanned > SCAN_POINTS then
                truncated = true
                break
            end
            if type(point) == "table" and ctx.num(point.ownerFarmId) == farmId then
                local ok, row = pcall(readPoint, ctx, point)
                if not ok or type(row) ~= "table" then
                    failed = failed + 1
                else
                    farm.pointCount = farm.pointCount + 1
                    farm.activeLines = farm.activeLines + row.active
                    if row.watched then
                        farm.watchedCount = farm.watchedCount + 1
                    end
                    if row.inputAlert == "missing" then
                        farm.missingInputs = farm.missingInputs + 1
                    elseif row.inputAlert == "low" then
                        farm.lowInputs = farm.lowInputs + 1
                    end
                    if row.outputAlert == "full" then
                        farm.outputFull = farm.outputFull + 1
                    elseif row.outputAlert == "nearlyFull" then
                        farm.outputNearlyFull = farm.outputNearlyFull + 1
                    end
                    rows[#rows + 1] = row
                end
            end
        end
        -- Alerts first so the bounded list always carries the points the mod would flag.
        table.sort(rows, function(a, b)
            local ra = (INPUT_RANK[a.inputAlert or ""] or 0) + (OUTPUT_RANK[a.outputAlert or ""] or 0)
            local rb = (INPUT_RANK[b.inputAlert or ""] or 0) + (OUTPUT_RANK[b.outputAlert or ""] or 0)
            if ra ~= rb then
                return ra > rb
            end
            return tostring(a.name or "") < tostring(b.name or "")
        end)
        for i = 1, math.min(#rows, MAX_POINTS) do
            rows[i].farmId = farmId
            points[i] = rows[i]
        end
        if #rows > MAX_POINTS then
            truncated = true
        end
        base.readState = failed > 0 and "partial" or "ok"
        base.coverage = truncated and "truncated" or "complete"
        base.byFarm = { [tostring(farmId)] = farm }
        -- Top level, not under byFarm: point -> storage rows would pass the registry's depth cap.
        base.points = points
        return base
    end,
})
