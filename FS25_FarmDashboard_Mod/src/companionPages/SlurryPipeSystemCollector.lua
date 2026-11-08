-- Slurry Pipe System v1.0.1.7: read the live, farm-owned store settling pools.
-- Pipe connections are map-wide; native storage levels and vehicle WATER are excluded.

local MAX_PLACES, MAX_STORES, MAX_ROWS = 300, 600, 80

CompanionPages.register({
    key = "slurryPipeSystem",
    modNames = { "FS25_SlurryPipeSystem" },
    substrings = { "slurrypipesystem", "slurry_pipe_system" },
    collect = function(ctx)
        local farmId = ctx.num(ctx.farmId)
        if farmId == nil or farmId <= 0 or farmId ~= math.floor(farmId) then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-stores-only" }
        end
        if ctx.mission.isMissionStarted == false then
            return { readState = "settings-only", reason = "world-not-started" }
        end
        if ctx.version ~= "1.0.1.7" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local manager = ctx.global("g_slurryPipeManager")
        if type(manager) ~= "table" or type(manager.registeredPlaceables) ~= "table"
            or ctx.call(manager, "isFeatureEnabled") ~= true then
            return { readState = "settings-only", reason = "live-store-state-unavailable" }
        end

        local rows, ownedStores, scannedPlaces, scannedStores = {}, 0, 0, 0
        local partial, truncated = false, false
        for _, entry in ipairs(manager.registeredPlaceables) do
            scannedPlaces = scannedPlaces + 1
            if scannedPlaces > MAX_PLACES then truncated = true; break end
            local placeable = type(entry) == "table" and entry.placeable or nil
            if type(placeable) == "table" and placeable.isDeleted ~= true
                and placeable.isDeleting ~= true then
                local owner = ctx.num(ctx.call(placeable, "getOwnerFarmId"))
                if owner == nil then partial = true end
                if owner == farmId then
                    local sources = ctx.call(manager, "getStoreSources", entry)
                    if type(sources) ~= "table" then
                        partial = true
                    else
                        for storeIndex, source in ipairs(sources) do
                            scannedStores = scannedStores + 1
                            if scannedStores > MAX_STORES then truncated = true; break end
                            if type(source) == "table" and source.type == "STORAGE_PLANE"
                                and source.thickeningEnabled == true then
                                local solids = ctx.num(source.solids)
                                local settle = ctx.num(source.settle)
                                if solids == nil or solids < 0 or settle == nil
                                    or settle < 0 or settle > 1 then
                                    partial = true
                                else
                                    ownedStores = ownedStores + 1
                                    if #rows < MAX_ROWS then
                                        rows[#rows + 1] = {
                                            farmId = farmId,
                                            placeable = ctx.clip(ctx.call(placeable, "getName")
                                                or placeable.configFileName or "Slurry store", 60),
                                            storeId = ctx.num(source.storeId) or storeIndex,
                                            storeIndex = storeIndex,
                                            settlingPercent = ctx.round2(settle * 100),
                                            dryMatterPoolLitres = ctx.round2(solids),
                                        }
                                    else truncated = true end
                                end
                            end
                        end
                    end
                end
            end
            if scannedStores > MAX_STORES then break end
        end
        return {
            readState = (partial or truncated) and "partial"
                or ownedStores > 0 and "ok" or "settings-only",
            reason = ownedStores == 0 and not (partial or truncated)
                and "no-owned-live-stores" or nil,
            coverage = truncated and "truncated" or partial and "partial" or "complete",
            byFarm = { [tostring(farmId)] = {
                activeStores = not (partial or truncated) and ownedStores or nil,
            } },
            stores = rows,
        }
    end,
})
