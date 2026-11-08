-- Buy Used Equipment 1.0.1.0 stores pending broker searches on each Farm.
-- Read only the selected farm's queue. The private tts timer is deliberately
-- withheld: a pending search is neither a guaranteed find nor a purchase.

local MAX_SCAN = 120
local MAX_ROWS = 60
local LEVELS = { "Regular", "Extended", "Continuous" }

CompanionPages.register({
    key = "buyUsedEquipment",
    modNames = { "FS25_312631_Buy_Used_Equipment", "FS25_BuyUsedEquipment" },
    collect = function(ctx)
        if ctx.version ~= "1.0.1.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmId = ctx.num(ctx.farmId)
        if farmId == nil or farmId < 1 or farmId ~= math.floor(farmId) then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-queue-only" }
        end
        local farmManager = ctx.global("g_farmManager")
        local farm = type(farmManager) == "table" and ctx.call(farmManager, "getFarmById", farmId) or nil
        if type(farm) ~= "table" or ctx.num(farm.farmId) ~= farmId then
            return { readState = "settings-only", reason = "farm-unavailable" }
        end
        local queue = farm.buyUsedVehicles
        if type(queue) ~= "table" then
            return { readState = "unavailable", reason = "queue-unavailable" }
        end

        local rows, count, invalid, truncated = {}, 0, false, false
        for i, assignment in ipairs(queue) do
            count = count + 1
            if count > MAX_SCAN then truncated = true; break end
            if type(assignment) ~= "table" then
                invalid = true
            else
                local originalFilename = assignment.filename
                local filename = type(originalFilename) == "string" and originalFilename or nil
                local level = ctx.num(assignment.level)
                local hours = ctx.num(assignment.ttl)
                if filename == nil or filename == "" or #filename > 180 or level == nil
                    or level ~= math.floor(level) or LEVELS[level] == nil
                    or hours == nil or hours < 0 or hours > 10000 then
                    invalid = true
                elseif #rows < MAX_ROWS then
                    local storeManager = ctx.global("g_storeManager")
                    local item = type(storeManager) == "table"
                        and ctx.call(storeManager, "getItemByXMLFilename", filename) or nil
                    rows[#rows + 1] = {
                        farmId = farmId,
                        queueIndex = i,
                        equipment = ctx.clip(type(item) == "table" and item.name or nil, 80),
                        equipmentXml = filename,
                        searchLevel = LEVELS[level],
                        hoursRemaining = math.ceil(hours),
                    }
                else
                    truncated = true
                end
            end
        end
        local incomplete = invalid or truncated
        return {
            readState = incomplete and "partial" or count > 0 and "ok" or "settings-only",
            reason = invalid and "invalid-search-state" or count == 0 and not incomplete
                and "no-pending-searches" or nil,
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            byFarm = not incomplete and { [tostring(farmId)] = { pendingSearchCount = count } } or nil,
            rows = rows,
        }
    end,
})
