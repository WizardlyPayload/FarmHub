-- Field To-Do List 0.1.0.17 saves planned crops by field ID only.
-- Engine field IDs match farmland IDs; its pseudo-field ID is 1,000,000 + farmland ID.
-- Resolve current land ownership before exposing a saved plan. Task records are withheld:
-- loading the mod migrates legacy unkeyed tasks to the local farm in memory.

local MAX_SCAN = 500
local MAX_ROWS = 80
local PSEUDO_OFFSET = 1000000

local function integer(value, low, high)
    local n = tonumber(value)
    if n == nil or n ~= n or n == math.huge or n == -math.huge
        or n ~= math.floor(n) or n < low or n > high then return nil end
    return n
end

CompanionPages.register({
    key = "fieldToDoPlannedCrops",
    modNames = { "FS25_FieldToDoList", "GH_knoellix__FS25_ToDo_FS25_FieldToDoList" },
    collect = function(ctx)
        local farmId = integer(ctx.farmId, 1, 1000000)
        if farmId == nil then return { readState = "settings-only", reason = "no-farm" } end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-register-only" }
        end
        if ctx.version ~= nil and ctx.version ~= "0.1.0.17" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local mod = ctx.symbol("FieldPlannedCrop")
        local plans = type(mod) == "table" and mod.byFieldId or nil
        if type(plans) ~= "table" then
            return { readState = "settings-only", reason = "plan-register-not-ready" }
        end
        local farmlandManager = ctx.global("g_farmlandManager")
        if type(farmlandManager) ~= "table" or type(farmlandManager.getFarmlandOwner) ~= "function" then
            return { readState = "settings-only", reason = "no-ownership-api" }
        end
        local advisor = ctx.symbol("FieldAdvisor")
        local rows, scanned, partial = {}, 0, false
        for key, rawIndex in pairs(plans) do
            scanned = scanned + 1
            if scanned > MAX_SCAN then partial = true; break end
            local fieldId = integer(key, 1, 1999999)
            local index = integer(rawIndex, -1, 1000000)
            if fieldId == nil or index == nil or index == 0 then
                partial = true
            else
                local landId = fieldId >= PSEUDO_OFFSET and fieldId - PSEUDO_OFFSET or fieldId
                local owner = integer(ctx.call(farmlandManager, "getFarmlandOwner", landId), 0, 1000000)
                if owner == nil then
                    partial = true
                elseif owner == farmId then
                    local label = nil
                    if index > 0 and type(advisor) == "table" then
                        label = ctx.try(advisor.getLocalizedFruitTitle, index)
                    end
                    if type(label) ~= "string" or label == "" or label == "-" then
                        label = nil
                    end
                    rows[#rows + 1] = {
                        farmId = farmId,
                        fieldId = fieldId,
                        farmlandId = landId,
                        fruitTypeIndex = index > 0 and index or nil,
                        plannedCrop = index == -1 and "farmyard" or
                            (label and ctx.clip(label, 64) or "crop-index-unresolved"),
                    }
                end
            end
        end
        table.sort(rows, function(a, b) return a.fieldId < b.fieldId end)
        if #rows > MAX_ROWS then
            partial = true
            while #rows > MAX_ROWS do table.remove(rows) end
        end
        return {
            readState = partial and "partial" or "ok",
            coverage = partial and "partial" or "complete",
            byFarm = { [tostring(farmId)] = { plannedCountScanned = #rows } },
            rows = rows,
        }
    end,
})
