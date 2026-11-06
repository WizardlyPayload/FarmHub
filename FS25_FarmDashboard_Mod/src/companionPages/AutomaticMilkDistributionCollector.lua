-- Automatic Milk Distribution 1.1.0.0 saves an autoMilkActive flag per barn.
-- Report only milk-capable placeables owned by the export farm. This is a
-- configuration snapshot, not evidence that any milk was moved or charged.

local MAX_SCAN = 300
local MAX_ROWS = 60

local function milkTypes(ctx, placeable, fillTypeManager)
    local types = {}
    for _, name in ipairs({ "MILK", "BUFFALOMILK" }) do
        local index = ctx.num(ctx.call(fillTypeManager, "getFillTypeIndexByName", name))
        if index ~= nil and index > 0 then
            local storage = type(placeable.spec_husbandry) == "table"
                and placeable.spec_husbandry.storage or nil
            local capacity = ctx.num(ctx.call(storage, "getCapacity", index))
            local fillUnit = ctx.num(ctx.call(placeable, "getFillUnitIndexFromFillTypeIndex", index))
            if (capacity ~= nil and capacity > 0) or fillUnit ~= nil
                or (name == "MILK" and type(placeable.spec_husbandryMilk) == "table") then
                types[#types + 1] = name
            end
        end
    end
    return types
end

CompanionPages.register({
    key = "automaticMilkDistribution",
    modNames = { "FS25_Automatic_Milk_Distribution", "FS25_356022_Automatic_Milk_Distribution" },
    substrings = { "automatic_milk_distribution", "automaticmilkdistribution" },
    collect = function(ctx)
        local farmId = ctx.farmId
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-barn-state-only" }
        end
        local system = type(ctx.mission) == "table" and ctx.mission.placeableSystem or nil
        local placeables = type(system) == "table" and system.placeables or nil
        local fillTypeManager = ctx.global("g_fillTypeManager")
        if type(placeables) ~= "table" or type(fillTypeManager) ~= "table" then
            return { readState = "settings-only", reason = "no-placeable-or-fill-type-state" }
        end

        local rows, barnCount, enabledCount, unreadableCount, scanned = {}, 0, 0, 0, 0
        local truncated = false
        for _, placeable in pairs(placeables) do
            scanned = scanned + 1
            if scanned > MAX_SCAN then truncated = true; break end
            if type(placeable) == "table"
                and (placeable.spec_husbandryAnimals ~= nil or placeable.spec_husbandryMilk ~= nil
                    or placeable.spec_husbandry ~= nil)
                and ctx.num(ctx.call(placeable, "getOwnerFarmId")) == farmId then
                local types = milkTypes(ctx, placeable, fillTypeManager)
                if #types > 0 then
                    if type(placeable.autoMilkActive) == "boolean" then
                        barnCount = barnCount + 1
                        if placeable.autoMilkActive then enabledCount = enabledCount + 1 end
                        if #rows < MAX_ROWS then
                            rows[#rows + 1] = {
                                farmId = farmId,
                                barn = ctx.clip(ctx.call(placeable, "getName"), 70),
                                enabled = placeable.autoMilkActive,
                                milkTypes = types,
                            }
                        else
                            truncated = true
                        end
                    else
                        unreadableCount = unreadableCount + 1
                    end
                end
            end
        end
        table.sort(rows, function(a, b) return tostring(a.barn or "") < tostring(b.barn or "") end)
        return {
            readState = unreadableCount == 0 and "ok"
                or barnCount > 0 and "partial" or "settings-only",
            reason = unreadableCount > 0 and "barn-switch-unavailable" or nil,
            coverage = truncated and "truncated" or unreadableCount > 0 and "partial" or "complete",
            byFarm = { [tostring(farmId)] = {
                barnCount = barnCount, enabledCount = enabledCount, unreadableCount = unreadableCount,
            } },
            rows = rows,
        }
    end,
})
