-- Realistic Crop Rotation 1.1.0.1 saves history and plans by farmland, not farm.
-- Resolve current ownership for every farmland before exporting any saved row.

local MAX_SCAN = 500
local MAX_ROWS = 80

local function crop(value, ctx)
    if type(value) ~= "string" or value == "" then return nil end
    return ctx.clip(value, 48)
end

local function slots(source, ctx, history)
    local out = {}
    for i = 1, 4 do
        local item = type(source) == "table" and source[i] or nil
        local name = history and type(item) == "table" and item.crop or item
        out[i] = crop(name, ctx) or ""
    end
    return out
end

-- Predictive pressure and visible outbreaks are distinct. Read only tracked
-- parcel keys; the mod's disease save has no farm id of its own.
local function diseaseSnapshot(ctx, mod, farmlandManager, farmId)
    if ctx.version ~= "1.1.0.1" then
        return { readState = "unavailable", reason = "unreviewed-version" }
    end
    if ctx.call(ctx.mission, "getIsServer") ~= true then
        return { readState = "unavailable", reason = "server-disease-state-only" }
    end
    local disease = type(mod) == "table" and mod.disease or nil
    if type(disease) ~= "table" or type(disease.state) ~= "table"
        or type(disease.reservoir) ~= "table" then
        return { readState = "unavailable", reason = "no-disease-state" }
    end
    local ids, seen, scanned, truncated = {}, {}, 0, false
    for _, source in ipairs({ disease.state, disease.reservoir, disease.crop or {} }) do
        if type(source) == "table" then
            for key in pairs(source) do
                scanned = scanned + 1
                if scanned > MAX_SCAN then truncated = true; break end
                local id = ctx.num(key)
                if id ~= nil and id > 0 and id == math.floor(id) and not seen[id] then
                    seen[id] = true
                    ids[#ids + 1] = id
                end
            end
        end
        if truncated then break end
    end
    table.sort(ids)
    local rows, riskCount, outbreakCount, unknownOwner = {}, 0, 0, false
    for _, id in ipairs(ids) do
        local owner = ctx.num(ctx.call(farmlandManager, "getFarmlandOwner", id))
        if owner == nil then
            unknownOwner = true
        elseif owner == farmId then
            local band = ctx.num(ctx.call(disease, "getRiskBand", id))
            local group = ctx.call(disease, "getWorstGroup", id)
            if band == nil or band < 0 or band > 3 or band ~= math.floor(band)
                or (group ~= nil and type(group) ~= "string") then
                truncated = true
            elseif band > 0 or (type(group) == "string" and group ~= "") then
                if band > 0 then riskCount = riskCount + 1 end
                if group ~= nil and group ~= "" then outbreakCount = outbreakCount + 1 end
                if #rows < MAX_ROWS then
                    local name = group ~= nil and ctx.call(disease, "getDisplayName", group) or nil
                    rows[#rows + 1] = {
                        farmId = farmId,
                        farmlandId = id,
                        riskBand = band,
                        visibleOutbreak = group ~= nil and group ~= "" and
                            ctx.clip(type(name) == "string" and name or group, 64) or nil,
                    }
                else
                    truncated = true
                end
            end
        end
    end
    local complete = not truncated and not unknownOwner
    return {
        readState = complete and "ok" or "partial",
        coverage = complete and "tracked-parcels" or "partial",
        atRiskCount = complete and riskCount or nil,
        visibleOutbreakCount = complete and outbreakCount or nil,
        rows = rows,
    }
end

CompanionPages.register({
    key = "realisticCropRotation",
    modNames = { "FS25_370461_Realistic_Crop_Rotation", "KM_83006_Realistic_Crop_Rotation" },
    substrings = {},
    collect = function(ctx)
        local farmId = ctx.farmId
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        local mod = ctx.symbol("RealisticCropRotation")
        local repository = type(mod) == "table" and type(mod.manager) == "table"
            and mod.manager.repository or nil
        if type(repository) ~= "table" then
            return { readState = "settings-only", reason = "no-repository" }
        end
        local farmlandManager = ctx.global("g_farmlandManager")
        if type(farmlandManager) ~= "table" or type(farmlandManager.getFarmlandOwner) ~= "function" then
            return { readState = "settings-only", reason = "no-ownership-api" }
        end

        local ids, seen = {}, {}
        local scanned, truncated = 0, false
        local function addIds(store)
            if type(store) == "table" then
                for key in pairs(store) do
                    scanned = scanned + 1
                    if scanned > MAX_SCAN then truncated = true; break end
                    local id = ctx.num(key)
                    if id ~= nil and id > 0 and id == math.floor(id) and not seen[id] then
                        seen[id] = true
                        ids[#ids + 1] = id
                    end
                end
            end
        end
        addIds(repository.history)
        if not truncated then addIds(repository.plans) end
        if not truncated then addIds(repository.coverPlans) end
        if not truncated then addIds(repository.lastKnownActiveCrop) end
        table.sort(ids)

        local rows, planned, withHistory = {}, 0, 0
        for _, id in ipairs(ids) do
            local owner = ctx.num(ctx.call(farmlandManager, "getFarmlandOwner", id))
            if owner == farmId then
                local history = slots(type(repository.history) == "table" and
                    (repository.history[id] or repository.history[tostring(id)]) or nil, ctx, true)
                local plan = slots(type(repository.plans) == "table" and
                    (repository.plans[id] or repository.plans[tostring(id)]) or nil, ctx, false)
                local cover = slots(type(repository.coverPlans) == "table" and
                    (repository.coverPlans[id] or repository.coverPlans[tostring(id)]) or nil, ctx, false)
                local active = type(repository.lastKnownActiveCrop) == "table" and
                    (repository.lastKnownActiveCrop[id] or repository.lastKnownActiveCrop[tostring(id)]) or nil
                local hasPlan, hasHistory = false, false
                for i = 1, 4 do
                    hasPlan = hasPlan or plan[i] ~= "" or cover[i] ~= ""
                    hasHistory = hasHistory or history[i] ~= ""
                end
                if hasPlan then planned = planned + 1 end
                if hasHistory then withHistory = withHistory + 1 end
                if hasPlan or hasHistory or crop(active, ctx) ~= nil then
                    if #rows < MAX_ROWS then
                        rows[#rows + 1] = {
                            farmId = farmId, farmlandId = id,
                            activeCrop = crop(active, ctx),
                            history = history, plan = plan, coverPlan = cover,
                        }
                    else
                        truncated = true
                    end
                end
            end
        end
        return {
            readState = "ok",
            coverage = truncated and "truncated" or "complete",
            byFarm = { [tostring(farmId)] = {
                farmlandCount = #rows, plannedCount = planned, historyCount = withHistory,
            } },
            rows = rows,
            disease = diseaseSnapshot(ctx, mod, farmlandManager, farmId),
        }
    end,
})
