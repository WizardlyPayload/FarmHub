-- Automatic Bale Storage 1.0.0.3. Its pending unload count is mod-owned
-- transient state on an owned object-storage placeable. Stored objects are
-- native storage state; this is neither a delivered count nor a bale total.

local MAX_SCAN = 500
local MAX_ROWS = 60
local MAX_PENDING = 100000

local function integer(value, maximum)
    local n = tonumber(value)
    if n ~= nil and n == n and n ~= math.huge and n ~= -math.huge
        and n >= 0 and n <= maximum and n == math.floor(n) then return n end
    return nil
end

local function identity(value)
    return type(value) == "string" and value ~= "" and #value <= 80 and value or nil
end

CompanionPages.register({
    key = "automaticBaleStorage",
    modNames = { "FS25_363427_FS25_AutomaticBaleStorage", "KM_78542_Automatic_Bale_Storage" },
    substrings = {},
    collect = function(ctx)
        if ctx.version ~= "1.0.0.3" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmId = integer(ctx.farmId, 8)
        if not farmId or farmId == 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-queue-state-only" }
        end
        local system = type(ctx.mission) == "table" and ctx.mission.placeableSystem or nil
        local placeables = type(system) == "table" and system.placeables or nil
        if type(placeables) ~= "table" then
            return { readState = "settings-only", reason = "placeables-not-ready" }
        end

        local candidates, idCounts = {}, {}
        local scanned, invalid, truncated = 0, false, false
        for _, placeable in pairs(placeables) do
            scanned = scanned + 1
            if scanned > MAX_SCAN then truncated = true; break end
            if type(placeable) == "table" and type(placeable.spec_objectStorage) == "table"
                and type(placeable.spec_automaticBaleStorage) == "table"
                and integer(ctx.call(placeable, "getOwnerFarmId"), 8) == farmId then
                local id = identity(placeable.uniqueId)
                if not id then invalid = true
                else
                    idCounts[id] = (idCounts[id] or 0) + 1
                    candidates[#candidates + 1] = { placeable = placeable, id = id }
                end
            end
        end

        local rows, owned, queued, pending = {}, 0, 0, 0
        for _, candidate in ipairs(candidates) do
            if idCounts[candidate.id] ~= 1 then invalid = true
            else
                local count = integer(candidate.placeable.spec_automaticBaleStorage.remainingUnload, MAX_PENDING)
                if not count then invalid = true
                else
                    owned = owned + 1
                    if count > 0 then
                        queued = queued + 1
                        pending = pending + count
                        if #rows < MAX_ROWS then
                            rows[#rows + 1] = {
                                farmId = farmId,
                                placeableId = candidate.id,
                                storage = ctx.clip(ctx.call(candidate.placeable, "getName") or candidate.id, 80),
                                pendingUnload = count,
                            }
                        else truncated = true end
                    end
                end
            end
        end
        table.sort(rows, function(a, b) return a.placeableId < b.placeableId end)
        local complete = not invalid and not truncated
        return {
            readState = (invalid or truncated) and "partial" or owned == 0
                and "settings-only" or "ok",
            reason = invalid and "invalid-or-ambiguous-owned-storage"
                or truncated and "scan-truncated"
                or owned == 0 and "no-owned-object-storage" or nil,
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            byFarm = complete and { [tostring(farmId)] = {
                ownedStorageCount = owned,
                queuedStorageCount = queued,
                pendingUnload = pending,
            } } or nil,
            rows = rows,
        }
    end,
})
