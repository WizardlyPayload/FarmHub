-- Agro Realistic v1.0.0.0: active zero-health timers, scoped to owned husbandries.
-- The saved timer table has no farm ID. Join it to live placeable and cluster IDs;
-- never export orphaned timers or a different farm's husbandry.

local MAX_HUSBANDRIES = 200
local MAX_CLUSTERS = 500
local MAX_ROWS = 80

CompanionPages.register({
    key = "agroRealisticHealthLoss",
    modNames = { "FS25_AgroRealistic", "FS25_371987_Agro_Realistic" },
    substrings = { "agrorealistic", "agro_realistic" },
    collect = function(ctx)
        if ctx.farmId == nil or ctx.farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-timers-only" }
        end
        if ctx.version ~= "1.0.0.0" then
            return { readState = "settings-only", reason = "version-unreviewed" }
        end
        local mod = ctx.symbol("LeandroFarmRulesAnimalHealthLoss")
            or ctx.global("LeandroFarmRulesAnimalHealthLoss")
        local timers = type(mod) == "table" and mod.timers or nil
        if type(timers) ~= "table" then
            return { readState = "unavailable", reason = "timers-unavailable" }
        end
        local husbandries = type(ctx.mission) == "table" and ctx.mission.husbandrySystem or nil
        husbandries = type(husbandries) == "table" and husbandries.clusterHusbandries or nil
        if type(husbandries) ~= "table" then
            return { readState = "unavailable", reason = "husbandries-unavailable" }
        end

        local rows, scannedPens, scannedClusters, active = {}, 0, 0, 0
        local truncated, unresolved = false, false
        for _, husbandry in pairs(husbandries) do
            scannedPens = scannedPens + 1
            if scannedPens > MAX_HUSBANDRIES then truncated = true; break end
            local placeable = ctx.call(husbandry, "getPlaceable")
            if type(placeable) == "table" then
                local owner = ctx.num(ctx.call(placeable, "getOwnerFarmId"))
                if owner == nil then
                    unresolved = true
                elseif owner == ctx.farmId then
                    local placeableId = ctx.call(placeable, "getUniqueId")
                    local clusters = ctx.call(placeable, "getClusters")
                    if placeableId == nil or type(clusters) ~= "table" then
                        unresolved = true
                    else
                        local name = ctx.clip(ctx.call(placeable, "getName"), 60)
                        for _, cluster in ipairs(clusters) do
                            scannedClusters = scannedClusters + 1
                            if scannedClusters > MAX_CLUSTERS then truncated = true; break end
                            if type(cluster) == "table" then
                                local clusterId = ctx.num(cluster.id)
                                local health = ctx.num(cluster.health)
                                local animals = ctx.num(ctx.call(cluster, "getNumAnimals"))
                                    or ctx.num(cluster.numAnimals)
                                if clusterId ~= nil and clusterId == math.floor(clusterId)
                                    and health ~= nil and health <= 0
                                    and animals ~= nil and animals > 0 then
                                    local key = string.format("%s|%d", tostring(placeableId), clusterId)
                                    local timer = timers[key]
                                    local hours = type(timer) == "table" and ctx.num(timer.hours) or nil
                                    if hours ~= nil and hours >= 0 and hours < 24
                                        and hours == math.floor(hours) then
                                        active = active + 1
                                        if #rows < MAX_ROWS then
                                            rows[#rows + 1] = {
                                                placeableId = ctx.clip(tostring(placeableId), 80),
                                                placeableName = name,
                                                clusterId = clusterId,
                                                animals = animals,
                                                hoursAtZero = hours,
                                                thresholdHours = 24,
                                            }
                                        else
                                            truncated = true
                                        end
                                    end
                                end
                            end
                        end
                    end
                end
            end
        end
        if unresolved then
            return { readState = "unavailable", reason = "ownership-or-cluster-unresolved" }
        end
        table.sort(rows, function(a, b)
            if a.placeableId == b.placeableId then return a.clusterId < b.clusterId end
            return a.placeableId < b.placeableId
        end)
        return {
            readState = active > 0 and "ok" or "settings-only",
            reason = active == 0 and "no-active-zero-health-timer" or nil,
            coverage = truncated and "truncated" or "complete",
            thresholdHours = 24,
            lossFractionAtThreshold = 0.5,
            byFarm = { [tostring(ctx.farmId)] = { activeTimerCount = active } },
            timers = rows,
        }
    end,
})
