-- Production Pallet Manager 1.0.0.0 saves farm defaults and source-specific
-- pallet capacities. Rules have no farm ID: join only to the mod's current
-- entries for placeables that still belong to the export farm.

local MAX_PLACEABLES = 400
local MAX_ENTRIES = 160
local MAX_ROWS = 100
local CAPACITY = { [1000] = true, [2000] = true, [3000] = true,
    [4000] = true, [5000] = true, [10000] = true }

CompanionPages.register({
    key = "productionPalletManager",
    modNames = { "FS25_ProductionPalletManager", "FS25_376956_Production_Pallet_Manager" },
    substrings = { "productionpalletmanager", "production_pallet_manager" },
    collect = function(ctx)
        local farmId, mission = ctx.farmId, ctx.mission
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-pallet-state-only" }
        end
        local manager = ctx.symbol("PalletManager")
        local placeables = type(mission) == "table" and mission.placeableSystem
            and mission.placeableSystem.placeables or nil
        if type(manager) ~= "table" or manager.isInitialized ~= true
            or type(manager.rules) ~= "table" or type(placeables) ~= "table" then
            return { readState = "settings-only", reason = "no-pallet-manager-state" }
        end
        if #placeables > MAX_PLACEABLES then
            return { readState = "partial", reason = "placeable-scan-limit",
                coverage = "truncated" }
        end
        local defaultCapacity = ctx.num(type(manager.farmDefaults) == "table"
            and manager.farmDefaults[farmId]) or ctx.num(manager.DEFAULT_CAPACITY)
        if not CAPACITY[defaultCapacity] then
            return { readState = "partial", reason = "invalid-default-capacity",
                coverage = "partial" }
        end
        local normalWeight = not (type(manager.farmNormalWeight) == "table"
            and manager.farmNormalWeight[farmId] == false)
        -- collectEntries is a read-only enumeration in this exact ZIP. It
        -- filters current placeable ownership and returns live source names.
        local entries = ctx.call(manager, "collectEntries", farmId)
        if type(entries) ~= "table" then
            return { readState = "partial", reason = "no-owned-source-list",
                coverage = "partial" }
        end

        local rows, sourceCount, overrideCount = {}, 0, 0
        local incomplete, truncated, seenSources = false, false, {}
        for index, entry in ipairs(entries) do
            if index > MAX_ENTRIES then truncated = true; break end
            local source = type(entry) == "table" and entry.object or nil
            local placeable = type(source) == "table"
                and (source.owningPlaceable or source) or nil
            local owner = type(placeable) == "table" and
                (ctx.call(placeable, "getOwnerFarmId") or placeable.ownerFarmId) or nil
            local sourceKey = type(entry) == "table" and entry.sourceKey or nil
            local fillTypeId = type(entry) == "table" and ctx.num(entry.fillTypeIndex) or nil
            if type(entry) ~= "table" or ctx.num(entry.farmId) ~= farmId
                or ctx.num(owner) ~= farmId
                or type(sourceKey) ~= "string" or sourceKey == ""
                or fillTypeId == nil or fillTypeId <= 0
                or fillTypeId ~= math.floor(fillTypeId) then
                incomplete = true
            else
                if not seenSources[sourceKey] then
                    seenSources[sourceKey] = true
                    sourceCount = sourceCount + 1
                end
                local rule = ctx.num(manager.rules[sourceKey .. "|" .. fillTypeId])
                if rule ~= nil and rule ~= 0 then
                    if rule ~= -1 and not CAPACITY[rule] then
                        incomplete = true
                    else
                        overrideCount = overrideCount + 1
                        if #rows < MAX_ROWS then
                            rows[#rows + 1] = {
                                farmId = farmId,
                                source = ctx.clip(entry.sourceName, 64),
                                product = ctx.clip(entry.outputName, 48),
                                disabled = rule == -1,
                                capacityLitres = rule > 0 and rule or nil,
                            }
                        else truncated = true end
                    end
                end
            end
        end
        table.sort(rows, function(a, b)
            return (a.source or "") .. "|" .. (a.product or "")
                < (b.source or "") .. "|" .. (b.product or "")
        end)
        local nondefault = defaultCapacity ~= manager.DEFAULT_CAPACITY
            or not normalWeight or overrideCount > 0
        return {
            readState = (incomplete or truncated) and "partial"
                or nondefault and "ok" or "settings-only",
            reason = not nondefault and "default-settings-only" or nil,
            coverage = truncated and "truncated" or incomplete and "partial" or "complete",
            byFarm = { [tostring(farmId)] = {
                defaultCapacityLitres = defaultCapacity,
                normalWeight = normalWeight,
                sourceCount = sourceCount,
                overrideCount = overrideCount,
            } },
            rows = rows,
        }
    end,
})
