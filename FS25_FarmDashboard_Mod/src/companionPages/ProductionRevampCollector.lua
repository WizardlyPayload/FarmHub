-- Production Revamp 1.0.0.0 stores its extra STORE mode and distribution
-- priorities on production points. Read owned, live points only; never call
-- Revamp.refreshDistributionTargets or any setter (both mutate game state).

local MAX_POINTS = 80
local MAX_OUTPUTS_PER_POINT = 50
local MAX_TARGETS_PER_OUTPUT = 40
local MAX_ROWS = 100
local LEVEL = { PRIMARY = true, SECONDARY = true, REST = true, NEVER = true }

CompanionPages.register({
    key = "productionRevamp",
    modNames = { "FS25_378044_Production_Revamp", "FS25_ProductionRevamp" },
    substrings = { "production_revamp", "productionrevamp" },
    collect = function(ctx)
        local farmId, mission = ctx.farmId, ctx.mission
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-production-state-only" }
        end
        local revamp = ctx.symbol("Revamp")
        local settings = type(revamp) == "table" and revamp.settings or nil
        local manager = type(mission) == "table" and mission.productionChainManager or nil
        local fillManager = ctx.global("g_fillTypeManager")
        if type(settings) ~= "table" or type(manager) ~= "table"
            or type(fillManager) ~= "table" then
            return { readState = "settings-only", reason = "no-revamp-production-state" }
        end
        local points = ctx.call(manager, "getProductionPointsForFarmId", farmId)
        if type(points) ~= "table" then
            return { readState = "settings-only", reason = "no-production-list" }
        end

        -- Resolve destination IDs only against this same farm's live points.
        -- A saved unique ID is local to the server and can be stale after a
        -- placeable is sold or removed. Never export the opaque ID itself.
        local owned, byUniqueId = {}, {}
        local scanned, truncated = 0, false
        for _, point in pairs(points) do
            scanned = scanned + 1
            if scanned > MAX_POINTS then truncated = true; break end
            if type(point) == "table" and ctx.num(point.ownerFarmId) == farmId then
                local placeable = point.owningPlaceable
                if type(placeable) == "table" then
                    local uniqueId = ctx.call(placeable, "getUniqueId")
                    if type(uniqueId) == "string" and uniqueId ~= "" then
                        owned[#owned + 1] = point
                        byUniqueId[uniqueId] = point
                    end
                end
            end
        end

        local rows, storeCount, targetCount = {}, 0, 0
        local incomplete = false
        for _, point in ipairs(owned) do
            local sourceName = ctx.clip(ctx.call(point, "getName")
                or ctx.call(point.owningPlaceable, "getName"), 64)
            local outputs = type(point.outputFillTypeIds) == "table"
                and point.outputFillTypeIds or {}
            local store = type(point.outputFillTypeIdsStorage) == "table"
                and point.outputFillTypeIdsStorage or nil
            local targets = type(point.distributionTargets) == "table"
                and point.distributionTargets or {}
            local autoDeliver = type(point.outputFillTypeIdsAutoDeliver) == "table"
                and point.outputFillTypeIdsAutoDeliver or {}
            if store == nil then incomplete = true end
            local outputCount = 0
            for fillTypeId in pairs(outputs) do
                outputCount = outputCount + 1
                if outputCount > MAX_OUTPUTS_PER_POINT then truncated = true; break end
                local fillName = ctx.call(fillManager, "getFillTypeNameByIndex", fillTypeId)
                if type(fillName) ~= "string" or fillName == "" then
                    incomplete = true
                else
                    if store and store[fillTypeId] then
                        storeCount = storeCount + 1
                        if #rows < MAX_ROWS then
                            rows[#rows + 1] = {
                                farmId = farmId, source = sourceName,
                                product = ctx.clip(fillName, 48), kind = "STORE",
                                active = settings.storageActive == true,
                            }
                        else truncated = true end
                    end
                    local perOutput = targets[fillTypeId]
                    if type(perOutput) == "table" then
                        local seen = 0
                        for targetId, entry in pairs(perOutput) do
                            seen = seen + 1
                            if seen > MAX_TARGETS_PER_OUTPUT then truncated = true; break end
                            local destination = byUniqueId[targetId]
                            local level = type(entry) == "table" and entry.level or nil
                            local limit = type(entry) == "table" and ctx.num(entry.limit) or nil
                            if destination == nil or destination == point or not LEVEL[level]
                                or (limit ~= nil and (limit < 0 or limit ~= math.floor(limit))) then
                                incomplete = true
                            else
                                targetCount = targetCount + 1
                                if #rows < MAX_ROWS then
                                    rows[#rows + 1] = {
                                        farmId = farmId, source = sourceName,
                                        product = ctx.clip(fillName, 48),
                                        kind = "TARGET", level = level,
                                        destination = ctx.clip(ctx.call(destination, "getName")
                                            or ctx.call(destination.owningPlaceable, "getName"), 64),
                                        limitLitres = limit,
                                        active = settings.distributionActive == true
                                            and autoDeliver[fillTypeId] ~= nil,
                                    }
                                else truncated = true end
                            end
                        end
                    end
                end
            end
        end
        table.sort(rows, function(a, b)
            local ka = table.concat({ a.source or "", a.product or "", a.kind or "",
                a.destination or "" }, "|")
            local kb = table.concat({ b.source or "", b.product or "", b.kind or "",
                b.destination or "" }, "|")
            return ka < kb
        end)
        return {
            readState = incomplete and "partial" or (#rows > 0 and "ok" or "settings-only"),
            reason = #rows == 0 and "no-owned-revamp-settings" or nil,
            coverage = truncated and "truncated" or incomplete and "partial" or "complete",
            byFarm = { [tostring(farmId)] = {
                productionCount = #owned, storeCount = storeCount, targetCount = targetCount,
                storageActive = settings.storageActive == true,
                distributionActive = settings.distributionActive == true,
            } },
            rows = rows,
        }
    end,
})
