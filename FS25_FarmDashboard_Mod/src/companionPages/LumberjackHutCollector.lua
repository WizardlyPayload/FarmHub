-- Lumberjack Hut 1.0.0.1 keeps production credit and suspension per placeable.
-- Native production storage and finance already cover delivered wood and costs.

local MAX_PLACEABLES = 400
local MAX_HUTS = 60

CompanionPages.register({
    key = "lumberjackHut",
    modNames = { "KM_83343_Lumberjack_Hut", "FS25_LumberjackHut" },
    substrings = { "lumberjack_hut", "lumberjackhut" },
    collect = function(ctx)
        local farmId = ctx.farmId
        if ctx.version ~= "1.0.0.1" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-state-only" }
        end
        local system = type(ctx.mission) == "table" and ctx.mission.placeableSystem or nil
        local placeables = type(system) == "table" and system.placeables or nil
        if type(placeables) ~= "table" then
            return { readState = "settings-only", reason = "no-placeable-list" }
        end

        local rows, seen = {}, {}
        local scanned, invalid, truncated = 0, false, false
        local pendingTotal, suspendedCount = 0, 0
        for _, placeable in pairs(placeables) do
            scanned = scanned + 1
            if scanned > MAX_PLACEABLES then truncated = true; break end
            if type(placeable) == "table" and type(placeable.spec_lumberjackHut) == "table" then
                local owner = ctx.num(ctx.call(placeable, "getOwnerFarmId")) or ctx.num(placeable.ownerFarmId)
                if owner == farmId then
                    local spec = placeable.spec_lumberjackHut
                    local id = ctx.num(placeable.id) or ctx.num(placeable.rootNode)
                    local farmland = ctx.num(spec.farmlandId)
                    local pending = ctx.num(spec.pendingLiters)
                    local progress = ctx.num(spec.cycleProgress)
                    local suspended = spec.autoSuspended
                    if id == nil or id <= 0 or seen[id] or farmland == nil or farmland <= 0
                        or pending == nil or pending < 0 or progress == nil or progress < 0 or progress >= 1.000001
                        or type(suspended) ~= "boolean" then
                        invalid = true
                    else
                        seen[id] = true
                        if #rows >= MAX_HUTS then
                            truncated = true
                        else
                            pendingTotal = pendingTotal + pending
                            if suspended then suspendedCount = suspendedCount + 1 end
                            rows[#rows + 1] = {
                                farmId = farmId,
                                siteId = tostring(id),
                                site = ctx.clip(ctx.call(placeable, "getName") or "Lumberjack Hut", 70),
                                farmlandId = farmland,
                                pendingLitres = ctx.round2(pending),
                                cycleProgressPercent = ctx.round2(progress * 100),
                                autoSuspended = suspended,
                            }
                        end
                    end
                end
            end
        end
        table.sort(rows, function(a, b)
            if a.farmlandId ~= b.farmlandId then return a.farmlandId < b.farmlandId end
            return a.siteId < b.siteId
        end)
        local complete = not invalid and not truncated
        return {
            readState = complete and (#rows > 0 and "ok" or "settings-only") or "partial",
            reason = complete and #rows == 0 and "no-owned-huts" or nil,
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            byFarm = { [tostring(farmId)] = complete and {
                hutCount = #rows,
                autoSuspendedCount = suspendedCount,
                pendingLitres = ctx.round2(pendingTotal),
            } or {} },
            rows = rows,
        }
    end,
})
