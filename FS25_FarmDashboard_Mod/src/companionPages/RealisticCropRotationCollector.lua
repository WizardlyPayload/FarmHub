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
        }
    end,
})
