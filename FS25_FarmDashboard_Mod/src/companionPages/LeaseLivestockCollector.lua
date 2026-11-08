-- Lease Livestock v1.0.0.0 records #isLeased on animal clusters.
-- Read only current leased animals in husbandries owned by the selected farm.
-- The source's period charge formula is an estimate, not a payment ledger.

local MAX_PENS, MAX_CLUSTERS, MAX_ROWS = 300, 2500, 80

local function positiveInt(ctx, value)
    local n = ctx.num(value)
    return n ~= nil and n > 0 and n == math.floor(n) and n or nil
end

CompanionPages.register({
    key = "leaseLivestock",
    modNames = { "KM_81709_Lease_Livestock", "FS25_LeaseLivestock", "FS25_Lease_Livestock" },
    substrings = { "lease_livestock", "leaselivestock" },
    collect = function(ctx)
        local farmId, mission = positiveInt(ctx, ctx.farmId), ctx.mission
        if farmId == nil then return { readState = "settings-only", reason = "no-farm" } end
        if ctx.call(mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-animals-only" }
        end
        if ctx.version ~= nil and ctx.version ~= "1.0.0.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local mod = ctx.global("LL_LeaseLivestock")
        local pens = type(mission) == "table" and type(mission.husbandrySystem) == "table"
            and mission.husbandrySystem.placeables or nil
        local animals = type(mission) == "table" and mission.animalSystem or nil
        if type(mod) ~= "table" or type(pens) ~= "table" or type(animals) ~= "table" then
            return { readState = "settings-only", reason = "lease-state-unavailable" }
        end

        local rows, count, ownedPens, scannedPens, scannedClusters = {}, 0, 0, 0, 0
        local totalCharge, completeRate, partial, truncated = 0, true, false, false
        for _, pen in pairs(pens) do
            scannedPens = scannedPens + 1
            if scannedPens > MAX_PENS then truncated = true; break end
            if type(pen) == "table" then
                local owner = ctx.num(ctx.call(pen, "getOwnerFarmId"))
                    or ctx.num(pen.ownerFarmId)
                if owner == farmId then
                    ownedPens = ownedPens + 1
                    local clusters = ctx.call(pen, "getClusters")
                    if type(clusters) ~= "table" then
                        partial = true
                    else
                        local grouped = {}
                        for _, cluster in pairs(clusters) do
                            scannedClusters = scannedClusters + 1
                            if scannedClusters > MAX_CLUSTERS then truncated = true; break end
                            if type(cluster) == "table" and cluster.isLeased == true then
                                local subtype = positiveInt(ctx, cluster.subTypeIndex)
                                local n = positiveInt(ctx, cluster.numAnimals)
                                if subtype == nil or n == nil then
                                    partial = true
                                else
                                    count = count + n
                                    grouped[subtype] = (grouped[subtype] or 0) + n
                                end
                            end
                        end
                        local penName = ctx.clip(ctx.call(pen, "getName"), 60) or "Husbandry"
                        for subtype, groupCount in pairs(grouped) do
                            local sub = ctx.call(animals, "getSubTypeByIndex", subtype)
                            local name = type(sub) == "table" and ctx.clip(sub.name, 50) or nil
                            local price = ctx.num(ctx.call(animals, "getAnimalBuyPrice", subtype, 18))
                            local rate = price ~= nil and price >= 0 and math.ceil(price / 24) or nil
                            local charge = rate and rate * groupCount or nil
                            if charge == nil then completeRate = false; partial = true
                            else totalCharge = totalCharge + charge end
                            if #rows < MAX_ROWS then
                                rows[#rows + 1] = {
                                    farmId = farmId, pen = penName, subTypeIndex = subtype,
                                    animal = name or ("Subtype " .. tostring(subtype)),
                                    leasedCount = groupCount, ratePerAnimal = rate,
                                    estimatedPeriodCharge = charge,
                                }
                            else truncated = true end
                        end
                    end
                end
            end
            if scannedClusters > MAX_CLUSTERS then break end
        end
        table.sort(rows, function(a, b)
            if a.pen == b.pen then return a.subTypeIndex < b.subTypeIndex end
            return a.pen < b.pen
        end)
        return {
            readState = (partial or truncated) and "partial" or
                (count > 0 and "ok" or "settings-only"),
            reason = count == 0 and "no-leased-animals" or nil,
            coverage = truncated and "truncated" or partial and "partial" or "complete",
            byFarm = { [tostring(farmId)] = {
                ownedPensScanned = ownedPens,
                leasedAnimals = count,
                estimatedPeriodCharge = completeRate and not truncated and not partial
                    and count > 0 and totalCharge or nil,
            } },
            rows = rows,
        }
    end,
})
