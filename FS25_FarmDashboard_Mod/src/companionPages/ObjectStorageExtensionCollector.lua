-- Object Storage Extension v1.0.2.0: configured capacity, accepted objects,
-- and input-trigger state for currently owned placeables. Stored objects are
-- already counted by the native inventory scan and are not repeated here.
local MAX_SCAN = 500
local MAX_ROWS = 60

local function whole(value, maximum)
    local n = tonumber(value)
    if n ~= nil and n == n and n >= 0 and n <= maximum
        and n == math.floor(n) then return n end
    return nil
end

CompanionPages.register({
    key = "objectStorageExtension",
    modNames = { "FS25_342403_Object_Storage_Extension", "FS25_ObjectStorageExtension" },
    substrings = { "object_storage_extension", "objectstorageextension" },
    collect = function(ctx)
        if ctx.version ~= "1.0.2.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmId = whole(ctx.farmId, 8)
        if farmId == nil or farmId == 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-placeable-state-only" }
        end
        local cls = ctx.symbol("PlaceableObjectStorageExtension")
        local specKey = type(cls) == "table" and cls.SPEC_TABLE_NAME or nil
        if type(specKey) ~= "string" or #specKey > 100
            or string.sub(specKey, 1, 5) ~= "spec_" then
            return { readState = "settings-only", reason = "no-extension-specialization" }
        end
        local system = type(ctx.mission) == "table" and ctx.mission.placeableSystem or nil
        local placeables = type(system) == "table" and system.placeables or nil
        if type(placeables) ~= "table" then
            return { readState = "settings-only", reason = "placeables-not-ready" }
        end

        local rows, ids = {}, {}
        local scanned, owned, disabled, invalid, truncated = 0, 0, 0, false, false
        for _, placeable in pairs(placeables) do
            scanned = scanned + 1
            if scanned > MAX_SCAN then truncated = true; break end
            if type(placeable) == "table" and type(placeable.spec_objectStorage) == "table"
                and type(placeable[specKey]) == "table"
                and whole(ctx.call(placeable, "getOwnerFarmId"), 8) == farmId then
                local spec = placeable[specKey]
                local id = placeable.uniqueId
                local capacity = whole(spec.capacity, 1000000)
                local typeId = whole(spec.supportedTypeId, 3)
                local triggerDisabled = spec.objectTriggerDisabled
                if type(id) ~= "string" or id == "" or #id > 80
                    or capacity == nil or typeId == nil or typeId < 1
                    or type(triggerDisabled) ~= "boolean" then
                    invalid = true
                else
                    ids[id] = (ids[id] or 0) + 1
                    if ids[id] > 1 then invalid = true end
                    owned = owned + 1
                    if triggerDisabled then disabled = disabled + 1 end
                    if #rows < MAX_ROWS then
                        rows[#rows + 1] = {
                            farmId = farmId,
                            placeableId = id,
                            name = ctx.clip(ctx.call(placeable, "getName") or id, 80),
                            configuredObjectCapacity = capacity,
                            acceptedObjectType = typeId == 1 and "bales-and-pallets"
                                or typeId == 2 and "bales" or "pallets",
                            inputTriggerDisabled = triggerDisabled,
                        }
                    else truncated = true end
                end
            end
        end
        if invalid then
            local unique = {}
            for _, row in ipairs(rows) do
                if ids[row.placeableId] == 1 then unique[#unique + 1] = row end
            end
            rows = unique
        end
        table.sort(rows, function(a, b) return a.placeableId < b.placeableId end)
        local complete = not invalid and not truncated
        return {
            readState = not complete and "partial" or owned == 0
                and "settings-only" or "ok",
            reason = invalid and "invalid-or-ambiguous-owned-storage"
                or truncated and "scan-truncated"
                or owned == 0 and "no-owned-storage" or nil,
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            byFarm = complete and { [tostring(farmId)] = {
                ownedStorageCount = owned,
                inputDisabledCount = disabled,
            } } or nil,
            rows = rows,
        }
    end,
})
