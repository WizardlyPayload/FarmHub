-- Workplan 1.0.0.0 saves farm-keyed field plans. Its ownership helper only
-- reads the live field-to-farmland mapping and farmland owner; no edit calls.

local MAX_SCAN, MAX_ROWS = 500, 80
local TASK_FIELDS = {
    lime = "stateLime", mulching = "stateMulching", plow = "statePlow",
    roller = "stateRoller", fertilizer1 = "stateFert1_state",
    fertilizer2 = "stateFert2_state", weedGrooming = "stateWeed_grooming",
    weedSpray = "stateWeed_spray", stone = "stateStone",
}

local function integer(ctx, value, min, max)
    local n = ctx.num(value)
    if n ~= nil and n == math.floor(n) and n >= min and n <= max then return n end
    return nil
end

CompanionPages.register({
    key = "workplan",
    modNames = { "FS25_352974_Workplan", "FS25_Workplan" },
    substrings = { "workplan" },
    collect = function(ctx)
        local farmId = integer(ctx, ctx.farmId, 1, 1000000)
        if farmId == nil then return { readState = "settings-only", reason = "selected-farm-unavailable" } end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-plan-only" }
        end
        if ctx.version ~= "1.0.0.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local plan = type(ctx.mission) == "table" and ctx.mission.workplan or nil
        if type(plan) ~= "table" or type(plan.fieldEntries) ~= "table"
            or type(plan.getFarmlandIdByFieldId) ~= "function"
            or type(plan.getIsFieldOwnedByPlayer) ~= "function" then
            return { readState = "settings-only", reason = "plan-register-unavailable" }
        end
        local fruitManager = ctx.global("g_fruitTypeManager")
        local function fruit(index)
            local id = integer(ctx, index, 1, 1000000)
            if id == nil then return nil end
            local name = type(fruitManager) == "table"
                and ctx.call(fruitManager, "getFruitTypeNameByIndex", id) or nil
            return type(name) == "string" and ctx.clip(name, 64) or nil
        end

        local rows, owned, withheld, scanned, invalid, truncated, scanIncomplete = {}, 0, 0, 0, false, false, false
        for _, entry in pairs(plan.fieldEntries) do
            scanned = scanned + 1
            if scanned > MAX_SCAN then truncated = true; scanIncomplete = true; break end
            if type(entry) == "table" and integer(ctx, entry.farmId, 1, 1000000) == farmId then
                local fieldId = integer(ctx, entry.fieldId, 1, 1000000)
                if fieldId == nil then invalid = true
                else
                    local farmlandId = integer(ctx,
                        ctx.call(plan, "getFarmlandIdByFieldId", fieldId), 1, 1000000)
                    if farmlandId == nil or
                        ctx.call(plan, "getIsFieldOwnedByPlayer", fieldId, farmId) ~= true then
                        withheld = withheld + 1
                    else
                        owned = owned + 1
                        local tasks = {}
                        for key, sourceField in pairs(TASK_FIELDS) do
                            local state = integer(ctx, entry[sourceField], 1, 5)
                            if state == nil then invalid = true end
                            tasks[key] = state
                        end
                        local fertilizer1Type = integer(ctx, entry.stateFert1_type, 1, 7)
                        local fertilizer2Type = integer(ctx, entry.stateFert2_type, 1, 7)
                        local currentCropIndex = integer(ctx, entry.currentFruit, 0, 1000000)
                        local plannedCropIndex = integer(ctx, entry.plannedFruit, 0, 1000000)
                        if fertilizer1Type == nil or fertilizer2Type == nil
                            or currentCropIndex == nil or plannedCropIndex == nil then invalid = true end
                        if #rows >= MAX_ROWS then truncated = true
                        else
                            rows[#rows + 1] = {
                                farmId = farmId,
                                fieldId = fieldId,
                                farmlandId = farmlandId,
                                currentCrop = fruit(currentCropIndex),
                                currentCropIndex = currentCropIndex,
                                plannedCrop = fruit(plannedCropIndex),
                                plannedCropIndex = plannedCropIndex,
                                tasks = tasks,
                                fertilizer1Type = fertilizer1Type,
                                fertilizer2Type = fertilizer2Type,
                            }
                        end
                    end
                end
            end
        end
        table.sort(rows, function(a, b) return a.fieldId < b.fieldId end)
        return {
            readState = (invalid or withheld > 0) and "partial" or
                (owned > 0 and "ok" or "settings-only"),
            reason = owned == 0 and "no-current-owned-plans" or nil,
            coverage = truncated and "truncated" or
                (invalid or withheld > 0) and "partial" or "complete",
            byFarm = { [tostring(farmId)] = {
                ownedPlanCount = not scanIncomplete and not invalid and withheld == 0 and owned or nil,
                withheldOwnership = not scanIncomplete and withheld or nil,
            } },
            rows = rows,
        }
    end,
})
