-- Upgrade Your Factory v1.0.1.0: read live levels on selected-farm production points.
-- The source saves only farmIds[1] and debits farm 1, so no multiplayer claim is safe.

local MAX_POINTS, MAX_ROWS = 120, 80

local function whole(ctx, value)
    local n = ctx.num(value)
    return n ~= nil and n >= 0 and n == math.floor(n) and n or nil
end

CompanionPages.register({
    key = "upgradeYourFactory",
    modNames = { "FS25_335994_Upgrade_Your_Factory", "FS25_UpgradeYourFactory" },
    substrings = { "upgrade_your_factory", "upgradeyourfactory" },
    collect = function(ctx)
        local farmId, mission = whole(ctx, ctx.farmId), ctx.mission
        if farmId == nil or farmId == 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if type(mission) ~= "table" or type(mission.missionDynamicInfo) ~= "table"
            or mission.missionDynamicInfo.isMultiplayer ~= false then
            return { readState = "settings-only", reason = "single-player-only" }
        end
        if ctx.call(mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-productions-only" }
        end
        if mission.isMissionStarted == false then
            return { readState = "settings-only", reason = "world-not-started" }
        end
        if ctx.version ~= "1.0.1.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local mod = ctx.symbol("UpgradeYourFactory")
        local maxLevel = type(mod) == "table" and whole(ctx, mod.MAX_LEVEL) or nil
        local manager = mission.productionChainManager
        local points = ctx.call(manager, "getProductionPointsForFarmId", farmId)
        if maxLevel == nil or maxLevel < 1 or maxLevel > 99 or type(points) ~= "table" then
            return { readState = "settings-only", reason = "upgrade-state-unavailable" }
        end

        local rows, count, upgraded, scanned = {}, 0, 0, 0
        local partial, truncated = false, false
        for _, point in ipairs(points) do
            scanned = scanned + 1
            if scanned > MAX_POINTS then truncated = true; break end
            local placeable = type(point) == "table" and point.owningPlaceable or nil
            if type(placeable) == "table" and placeable.isDeleted ~= true
                and placeable.isDeleting ~= true then
                local pointOwner = ctx.num(point.ownerFarmId)
                local placeOwner = ctx.num(ctx.call(placeable, "getOwnerFarmId"))
                if pointOwner == nil or placeOwner == nil or pointOwner ~= placeOwner then
                    partial = true
                elseif pointOwner == farmId and point.isUpgradable == true then
                    local level = whole(ctx, point.productionLevel)
                    if level == nil or level < 1 or level > maxLevel then
                        partial = true
                    else
                        count = count + 1
                        if level > 1 then upgraded = upgraded + 1 end
                        local nextPrice = level < maxLevel and ctx.num(placeable.upgradePrice) or nil
                        if nextPrice ~= nil and nextPrice < 0 then nextPrice = nil end
                        if level < maxLevel and nextPrice == nil then partial = true end
                        if #rows < MAX_ROWS then
                            rows[#rows + 1] = {
                                farmId = farmId,
                                production = ctx.clip(point.baseName
                                    or ctx.call(point, "getName") or ctx.call(placeable, "getName")
                                    or "Production", 60),
                                level = level,
                                maxLevel = maxLevel,
                                nextUpgradePrice = nextPrice and ctx.round2(nextPrice) or nil,
                            }
                        else truncated = true end
                    end
                end
            end
        end
        table.sort(rows, function(a, b) return a.production < b.production end)
        return {
            readState = (partial or truncated) and "partial"
                or count > 0 and "ok" or "settings-only",
            reason = count == 0 and not (partial or truncated)
                and "no-owned-upgradable-productions" or nil,
            coverage = truncated and "truncated" or partial and "partial" or "complete",
            byFarm = { [tostring(farmId)] = {
                upgradableCount = not (partial or truncated) and count or nil,
                upgradedCount = not (partial or truncated) and upgraded or nil,
            } },
            productions = rows,
        }
    end,
})
