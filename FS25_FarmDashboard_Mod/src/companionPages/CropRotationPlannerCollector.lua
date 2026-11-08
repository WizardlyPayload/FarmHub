-- Crop Rotation 1.0.1.0 keeps named, farm-keyed templates in cropRotationPlanner.xml.
-- These are intentions, not assigned fields, completed rotations or saved yield estimates.

local MAX_SCAN = 200
local MAX_STEPS = 16
local MAX_ROWS = 160

local function positiveInteger(ctx, value)
    local n = ctx.num(value)
    return n ~= nil and n > 0 and n == math.floor(n) and n or nil
end

local function stateNames(states, ctx)
    if type(states) ~= "table" then return nil end
    local names, scanned = {}, 0
    for _, state in pairs(states) do
        scanned = scanned + 1
        if scanned > 300 then return nil end
        if type(state) == "table" then
            local index = ctx.num(state.cropIndex)
            if index ~= nil and index >= 0 and index == math.floor(index)
                and type(state.name) == "string" and state.name ~= "" then
                names[index] = ctx.clip(state.name, 64)
            end
        end
    end
    return names
end

CompanionPages.register({
    key = "cropRotationPlanner",
    modNames = { "FS25_347316_Crop_Rotation" },
    substrings = {},
    collect = function(ctx)
        if ctx.version ~= "1.0.1.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmId = positiveInteger(ctx, ctx.farmId)
        if farmId == nil then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-plans-only" }
        end
        local planner = ctx.symbol("g_cropRotationPlanner")
        local rotationMod = ctx.symbol("g_cropRotation")
        if type(planner) ~= "table" or type(planner.cropRotations) ~= "table" then
            return { readState = "settings-only", reason = "no-planner" }
        end
        local crops = type(rotationMod) == "table" and stateNames(rotationMod.possibleCropStates, ctx) or nil
        local catches = type(rotationMod) == "table" and stateNames(rotationMod.possibleCatchCropStates, ctx) or nil
        if crops == nil or catches == nil then
            return { readState = "partial", reason = "state-names-unavailable" }
        end
        local rows, planCount, stepCount, scanned = {}, 0, 0, 0
        for _, plan in pairs(planner.cropRotations) do
            scanned = scanned + 1
            if scanned > MAX_SCAN then
                return { readState = "partial", reason = "plan-scan-limit" }
            end
            if type(plan) == "table" and ctx.num(plan.farmId) == farmId then
                local index = positiveInteger(ctx, plan.index)
                if index == nil or type(plan.name) ~= "string" or plan.name == ""
                    or type(plan.rotations) ~= "table" then
                    return { readState = "partial", reason = "invalid-plan" }
                end
                local name = ctx.clip(plan.name, 80)
                local steps = 0
                for _, rotation in ipairs(plan.rotations) do
                    steps = steps + 1
                    if steps > MAX_STEPS or type(rotation) ~= "table" then
                        return { readState = "partial", reason = "invalid-steps" }
                    end
                    local cropIndex = ctx.num(rotation.state)
                    local catchIndex = ctx.num(rotation.catchCropState)
                    if cropIndex == nil or catchIndex == nil
                        or cropIndex < 0 or catchIndex < 0
                        or cropIndex ~= math.floor(cropIndex) or catchIndex ~= math.floor(catchIndex)
                        or (cropIndex ~= 0 and crops[cropIndex] == nil)
                        or (catchIndex ~= 0 and catches[catchIndex] == nil) then
                        return { readState = "partial", reason = "unresolved-state" }
                    end
                    if #rows >= MAX_ROWS then
                        return { readState = "partial", reason = "row-limit" }
                    end
                    rows[#rows + 1] = {
                        farmId = farmId, planIndex = index, planName = name, step = steps,
                        crop = cropIndex == 0 and (crops[0] or "Fallow") or crops[cropIndex],
                        catchCrop = catchIndex == 0 and (catches[0] or "None") or catches[catchIndex],
                    }
                    stepCount = stepCount + 1
                end
                if steps == 0 then return { readState = "partial", reason = "invalid-steps" } end
                planCount = planCount + 1
            end
        end
        if planCount == 0 then
            return { readState = "settings-only", reason = "no-farm-plans" }
        end
        table.sort(rows, function(a, b)
            if a.planIndex ~= b.planIndex then return a.planIndex < b.planIndex end
            return a.step < b.step
        end)
        return {
            readState = "ok", coverage = "complete",
            byFarm = { [tostring(farmId)] = { planCount = planCount, stepCount = stepCount } },
            rows = rows,
        }
    end,
})
