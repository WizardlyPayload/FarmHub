-- Udder to Tank: read stored udder milk for producing animals in this farm's pens.
-- Do not call ensure/capacityFor/showInfo: those initialise or mutate animal records.

local MAX_PLACEABLES, MAX_PENS, MAX_CLUSTERS, MAX_ANIMALS, MAX_ROWS = 300, 40, 240, 2000, 60

CompanionPages.register({
    key = "udderToTank",
    modNames = { "KM_82886_Udder_to_Tank" },
    collect = function(ctx)
        local farmId = ctx.farmId
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-animals-only" }
        end
        local mod = ctx.symbol("UdderMilk")
        if type(mod) ~= "table" or type(mod.hasMilkDisplay) ~= "function"
            or type(mod.isGoat) ~= "function" then
            return { readState = "settings-only", reason = "no-udder-register" }
        end
        local mission = ctx.mission
        local list = type(mission.husbandrySystem) == "table" and mission.husbandrySystem.placeables or nil
        if type(list) ~= "table" then
            list = type(mission.placeableSystem) == "table" and mission.placeableSystem.placeables or nil
        end
        if type(list) ~= "table" then
            return { readState = "settings-only", reason = "no-husbandry-list" }
        end

        local rows, penCount, clusterCount, animalCount = {}, 0, 0, 0
        local totalLitres, totalCapacity = 0, 0
        local scannedPens, scannedClusters, scannedAnimals = 0, 0, 0
        local truncated, partial = false, false
        for _, pen in pairs(list) do
            scannedPens = scannedPens + 1
            if scannedPens > MAX_PLACEABLES then truncated = true; break end
            if type(pen) == "table"
                and (ctx.num(ctx.call(pen, "getOwnerFarmId")) or ctx.num(pen.ownerFarmId)) == farmId then
                local spec = pen.spec_husbandryAnimals
                local system = type(spec) == "table" and spec.clusterSystem or nil
                if type(system) == "table" then
                    penCount = penCount + 1
                    if penCount > MAX_PENS then truncated = true; break end
                    local clusters = ctx.call(system, "getClusters")
                    if type(clusters) ~= "table" then
                        partial = true
                    else
                        for _, cluster in pairs(clusters) do
                            scannedClusters = scannedClusters + 1
                            if scannedClusters > MAX_CLUSTERS then truncated = true; break end
                            if type(cluster) == "table" then
                                -- Both functions are pure reads in the exact reviewed v1.0.0.0 source.
                                local okDisplay, display = pcall(mod.hasMilkDisplay, cluster)
                                if not okDisplay then partial = true end
                                if okDisplay and display == true then
                                    local okGoat, goat = pcall(mod.isGoat, cluster)
                                    local count = ctx.num(ctx.call(cluster, "getNumAnimals"))
                                    local records = cluster.udderMilkAnimals
                                    local base = okGoat and (goat and ctx.num(mod.goatCapacity)
                                        or ctx.num(mod.capacity)) or nil
                                    if not okGoat or count == nil or count <= 0 or count ~= math.floor(count)
                                        or type(records) ~= "table" or base == nil or base <= 0
                                        or #records ~= count then
                                        partial = true
                                    else
                                        local litres, capacity, valid = 0, 0, true
                                        for i = 1, count do
                                            scannedAnimals = scannedAnimals + 1
                                            if scannedAnimals > MAX_ANIMALS then truncated = true; valid = false; break end
                                            local record = records[i]
                                            local stored = type(record) == "table" and ctx.num(record.liters) or nil
                                            local factor = type(record) == "table" and ctx.num(record.capacityFactor) or nil
                                            if stored == nil or stored < 0 or factor == nil
                                                or factor < 0.5 or factor > 1.5 or stored > base * factor + 0.01 then
                                                valid = false; partial = true; break
                                            end
                                            litres = litres + stored
                                            capacity = capacity + base * factor
                                        end
                                        if valid then
                                            clusterCount = clusterCount + 1
                                            animalCount = animalCount + count
                                            totalLitres = totalLitres + litres
                                            totalCapacity = totalCapacity + capacity
                                            if #rows < MAX_ROWS then
                                                rows[#rows + 1] = {
                                                    farmId = farmId,
                                                    pen = ctx.clip(ctx.call(pen, "getName") or "", 60),
                                                    milkType = goat and "goat" or "dairy",
                                                    animals = count,
                                                    avgStoredLitres = ctx.round2(litres / count),
                                                    avgCapacityLitres = ctx.round2(capacity / count),
                                                    totalStoredLitres = ctx.round2(litres),
                                                }
                                            else truncated = true end
                                        end
                                    end
                                end
                            end
                        end
                    end
                end
            end
        end
        table.sort(rows, function(a, b) return (a.pen or "") < (b.pen or "") end)
        return {
            readState = partial and "partial" or "ok",
            reason = clusterCount == 0 and "no-producing-animal-reading" or nil,
            coverage = truncated and "truncated" or partial and "partial" or "complete",
            byFarm = { [tostring(farmId)] = {
                penCount = penCount, clusterCount = clusterCount, animalCount = animalCount,
                storedLitres = ctx.round2(totalLitres), capacityLitres = ctx.round2(totalCapacity),
            } },
            rows = rows,
        }
    end,
})
