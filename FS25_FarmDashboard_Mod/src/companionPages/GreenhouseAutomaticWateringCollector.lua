-- Greenhouse Automatic Watering 1.0.0.0 persists AutoWatering on each production placeable.
-- Report the owned building's configured switch, not water delivered or money charged.

local MAX_POINTS = 80
local MAX_ROWS = 60

CompanionPages.register({
    key = "greenhouseAutomaticWatering",
    modNames = { "FS25_303379_Greenhouse_Automatic_Watering" },
    substrings = {},
    collect = function(ctx)
        if ctx.version ~= "1.0.0.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmId = ctx.num(ctx.farmId)
        if farmId == nil or farmId <= 0 or farmId ~= math.floor(farmId) then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-production-state-only" }
        end
        local manager = type(ctx.mission) == "table" and ctx.mission.productionChainManager or nil
        local fillTypes = ctx.global("FillType")
        local waterId = type(fillTypes) == "table" and ctx.num(fillTypes.WATER) or nil
        if type(manager) ~= "table" or waterId == nil or waterId <= 0 then
            return { readState = "settings-only", reason = "production-water-not-ready" }
        end
        local points = ctx.call(manager, "getProductionPointsForFarmId", farmId)
        if type(points) ~= "table" then
            return { readState = "settings-only", reason = "no-owned-production-list" }
        end

        local rows, count, enabled, scanned = {}, 0, 0, 0
        local truncated, invalid = false, false
        for _, point in pairs(points) do
            scanned = scanned + 1
            if scanned > MAX_POINTS then truncated = true; break end
            if type(point) == "table" and ctx.num(point.ownerFarmId) == farmId then
                local placeable = point.owningPlaceable
                if type(placeable) == "table" and ctx.num(ctx.call(placeable, "getOwnerFarmId")) == farmId then
                    local storage = point.storage
                    if type(storage) == "table" and ctx.call(storage, "getIsFillTypeSupported", waterId) == true then
                        if type(placeable.AutoWatering) ~= "boolean" then
                            invalid = true
                        else
                            count = count + 1
                            if placeable.AutoWatering then enabled = enabled + 1 end
                            if #rows < MAX_ROWS then
                                rows[#rows + 1] = {
                                    farmId = farmId,
                                    placeableId = ctx.clip(placeable.uniqueId, 80),
                                    name = ctx.clip(ctx.call(point, "getName") or ctx.call(placeable, "getName"), 80),
                                    enabled = placeable.AutoWatering,
                                }
                            else
                                truncated = true
                            end
                        end
                    end
                end
            end
        end
        table.sort(rows, function(a, b)
            return tostring(a.name or "") .. tostring(a.placeableId or "")
                < tostring(b.name or "") .. tostring(b.placeableId or "")
        end)
        return {
            readState = invalid and "partial" or "ok",
            reason = invalid and "unreadable-auto-watering-switch" or nil,
            coverage = truncated and "truncated" or "complete",
            byFarm = { [tostring(farmId)] = { eligibleCount = count, enabledCount = enabled } },
            rows = rows,
        }
    end,
})
