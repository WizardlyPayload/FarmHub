-- RC Sheep Barn and Storage 1.1.1.0. Read the barn's saved straw and its
-- configured ration groups from currently owned, loaded placeables only.
-- Native ManureHeap objects remain the source for physical manure stock.

local MAX_SCAN = 500
local MAX_ROWS = 40
local MAX_LEVEL = 100000000
local WEIGHTS = { 0.50, 0.40, 0.05, 0.05 }
local GROUP_KEYS = { "hay", "silage", "grain", "mineral" }

local function amount(value, maxValue)
    local n = tonumber(value)
    if n ~= nil and n == n and n ~= math.huge and n ~= -math.huge
        and n >= 0 and n <= maxValue then return n end
    return nil
end

local function identity(value)
    return type(value) == "string" and value ~= "" and #value <= 80 and value or nil
end

CompanionPages.register({
    key = "rcSheepBarn",
    modNames = { "KM_82926_Sheep_Barn" },
    substrings = {},
    collect = function(ctx)
        if ctx.version ~= "1.1.1.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmId = amount(ctx.farmId, 8)
        if not farmId or farmId == 0 or farmId ~= math.floor(farmId) then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-barn-state-only" }
        end
        local system = type(ctx.mission) == "table" and ctx.mission.placeableSystem or nil
        local placeables = type(system) == "table" and system.placeables or nil
        if type(placeables) ~= "table" then
            return { readState = "settings-only", reason = "placeables-not-ready" }
        end

        local candidates, counts = {}, {}
        local invalid, truncated, scanned = false, false, 0
        for _, placeable in pairs(placeables) do
            scanned = scanned + 1
            if scanned > MAX_SCAN then truncated = true; break end
            if type(placeable) == "table" and type(placeable.rcCurableManure) == "table"
                and amount(ctx.call(placeable, "getOwnerFarmId"), 8) == farmId then
                local id = identity(placeable.uniqueId or ctx.call(placeable, "getUniqueId"))
                if not id then invalid = true
                else
                    counts[id] = (counts[id] or 0) + 1
                    candidates[#candidates + 1] = { placeable = placeable, id = id }
                end
            end
        end

        local rows, totalStraw, completeRations = {}, 0, 0
        for _, candidate in ipairs(candidates) do
            if counts[candidate.id] ~= 1 then invalid = true
            else
                local barn = candidate.placeable
                local manure = barn.rcCurableManure
                local capacity = amount(manure.capacity, MAX_LEVEL)
                local straw = amount(manure.straw, MAX_LEVEL)
                local groups = barn.rcRationGroups
                local food = type(barn.spec_husbandryFood) == "table"
                    and barn.spec_husbandryFood.fillLevels or nil
                if manure.ready ~= true or not capacity or capacity <= 0
                    or not straw or straw > capacity or barn.rcRationValid ~= true
                    or type(groups) ~= "table" or #groups ~= 4 or type(food) ~= "table" then
                    invalid = true
                else
                    local groupRows, available = {}, math.huge
                    local seenFillTypes = {}
                    local valid = true
                    for index = 1, 4 do
                        local group = groups[index]
                        local types = type(group) == "table" and group.fillTypes or nil
                        if type(group) ~= "table" or type(types) ~= "table"
                            or #types < 1 or #types > 2 or group.weight ~= WEIGHTS[index] then
                            valid = false; break
                        end
                        local level = 0
                        for _, fillType in ipairs(types) do
                            if type(fillType) ~= "number" or fillType ~= math.floor(fillType)
                                or fillType <= 0 or seenFillTypes[fillType] then
                                valid = false; break
                            end
                            seenFillTypes[fillType] = true
                            local part = amount(food[fillType], MAX_LEVEL)
                            if part == nil then valid = false; break end
                            level = level + part
                        end
                        if not valid or level > MAX_LEVEL then valid = false; break end
                        available = math.min(available, level / WEIGHTS[index])
                        groupRows[#groupRows + 1] = {
                            group = GROUP_KEYS[index], requiredPercent = WEIGHTS[index] * 100,
                            storedLitres = level,
                        }
                    end
                    if not valid then invalid = true
                    else
                        local row = {
                            farmId = farmId, placeableId = candidate.id,
                            barn = ctx.clip(ctx.call(barn, "getName") or candidate.id, 80),
                            strawLitres = straw, strawCapacityLitres = capacity,
                            availableRationLitres = available,
                            groups = groupRows,
                        }
                        totalStraw = totalStraw + straw
                        completeRations = completeRations + 1
                        if #rows < MAX_ROWS then rows[#rows + 1] = row
                        else truncated = true end
                    end
                end
            end
        end
        table.sort(rows, function(a, b) return a.placeableId < b.placeableId end)
        return {
            readState = invalid and "partial" or #rows == 0 and not truncated and "settings-only" or "ok",
            reason = invalid and "invalid-or-ambiguous-owned-barn" or #rows == 0 and not truncated
                and "no-owned-barn" or nil,
            coverage = truncated and "truncated" or "complete",
            byFarm = { [tostring(farmId)] = {
                barnCount = completeRations, storedStrawLitres = totalStraw,
            } },
            rows = rows,
        }
    end,
})
