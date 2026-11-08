-- Farm Gate Keys v1.0.0.0: live locks held by the selected farm.
-- A lock holder is not necessarily the property owner. No key/entry history exists.

local MAX_ROWS = 120
local MAX_SCANNED = 2000

CompanionPages.register({
    key = "farmGateKeys",
    modNames = { "FS25_356593_Farm_Gate_Keys" },
    collect = function(ctx)
        if ctx.version ~= "1.0.0.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmId = ctx.num(ctx.farmId)
        if farmId == nil or farmId < 1 or farmId ~= math.floor(farmId) then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-gate-state-only" }
        end

        local sources = {}
        local onCreate = ctx.mission and ctx.mission.onCreateObjectSystem
        if type(onCreate) == "table" and type(onCreate.objects) == "table" then
            sources[#sources + 1] = { kind = "map", parent = nil, objects = onCreate.objects }
        end
        local placeables = ctx.mission and ctx.mission.placeableSystem
            and ctx.mission.placeableSystem.placeables
        if type(placeables) == "table" then
            for _, placeable in pairs(placeables) do
                if type(placeable) == "table" then
                    for _, spec in pairs({ placeable.spec_animatedObjects,
                        placeable.spec_fence }) do
                        if type(spec) == "table" and type(spec.animatedObjects) == "table" then
                            sources[#sources + 1] = {
                                kind = "placeable", parent = placeable,
                                objects = spec.animatedObjects,
                            }
                        end
                    end
                end
            end
        end
        if #sources == 0 then
            return { readState = "settings-only", reason = "no-animated-object-registry" }
        end

        local candidates, ids, seenObjects = {}, {}, {}
        local invalid, truncated, scanned = false, false, 0
        for _, source in ipairs(sources) do
            local parentId = source.parent and source.parent.uniqueId or nil
            for _, gate in pairs(source.objects) do
                scanned = scanned + 1
                if scanned > MAX_SCANNED then truncated = true; break end
                if type(gate) == "table" and not seenObjects[gate] then
                    seenObjects[gate] = true
                    if gate.farmGateKeysEnabled == true then
                        local state = gate.farmGateKeysState
                        if type(state) ~= "table" or type(state.isLocked) ~= "boolean" then
                            invalid = true
                        elseif state.isLocked then
                            local holder = ctx.num(state.lockedFarmId)
                            if holder == nil or holder < 1 or holder ~= math.floor(holder) then
                                invalid = true
                            elseif holder == farmId then
                                local id = gate.saveId
                                if type(id) ~= "string" or id == "" or #id > 80
                                    or (source.kind == "placeable" and
                                        (type(parentId) ~= "string" or parentId == "" or #parentId > 80)) then
                                    invalid = true
                                else
                                    local key = source.kind .. ":" .. (parentId or "") .. ":" .. id
                                    ids[key] = (ids[key] or 0) + 1
                                    candidates[#candidates + 1] = {
                                        farmId = farmId, gateId = key,
                                        gate = ctx.clip(id, 80),
                                        placeableId = parentId,
                                        source = source.kind,
                                        locked = true,
                                    }
                                end
                            end
                        end
                    end
                end
            end
            if truncated then break end
        end

        local rows, count = {}, 0
        for _, row in ipairs(candidates) do
            if ids[row.gateId] ~= 1 then invalid = true
            else
                count = count + 1
                if #rows < MAX_ROWS then rows[#rows + 1] = row
                else truncated = true end
            end
        end
        table.sort(rows, function(a, b) return a.gateId < b.gateId end)
        local incomplete = invalid or truncated
        return {
            readState = incomplete and "partial" or count > 0 and "ok" or "settings-only",
            reason = invalid and "invalid-gate-lock-state" or count == 0 and not incomplete
                and "no-farm-held-gate-locks" or nil,
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            byFarm = not incomplete and { [tostring(farmId)] = { heldLockCount = count } } or nil,
            rows = rows,
        }
    end,
})
