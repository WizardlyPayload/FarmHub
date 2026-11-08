-- Hand Tool Drop v1.0.0.0: current world positions of this farm's dropped hand tools.
-- HandToolSystem.handTools is separate from VehicleSystem; never call the mod's save hook.
local MAX_SCAN = 150
local MAX_ROWS = 100

local function farmNumber(value)
    local n = tonumber(value)
    if n and n == n and n > 0 and n == math.floor(n) then return n end
    return nil
end

local function coordinate(value)
    local n = tonumber(value)
    if n and n == n and math.abs(n) <= 1000000 then
        return math.floor(n * 100 + 0.5) / 100
    end
    return nil
end

CompanionPages.register({
    key = "handToolDrop",
    modNames = { "KM_82920_Hand_Tool_Drop" },
    collect = function(ctx)
        if ctx.version ~= "1.0.0.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmId = farmNumber(ctx.farmId)
        if farmId == nil then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-hand-tool-state-only" }
        end
        local mod = ctx.symbol("HandToolDrop")
        local specName = "spec_" .. ctx.modName .. ".handToolDrop"
        if type(mod) ~= "table" or mod.SPEC_TABLE_NAME ~= specName then
            return { readState = "settings-only", reason = "unverified-specialization" }
        end
        local system = type(ctx.mission) == "table" and ctx.mission.handToolSystem or nil
        local tools = type(system) == "table" and system.handTools or nil
        if type(tools) ~= "table" then
            return { readState = "settings-only", reason = "hand-tools-unavailable" }
        end
        local getPosition = ctx.global("getWorldTranslation")
        if type(getPosition) ~= "function" then
            return { readState = "settings-only", reason = "world-position-unavailable" }
        end

        local rows, ids = {}, {}
        local scanned, applicable, dropped = 0, 0, 0
        local invalid, truncated = false, false
        for _, tool in pairs(tools) do
            scanned = scanned + 1
            if scanned > MAX_SCAN then
                truncated = true
                break
            end
            if type(tool) == "table" and not tool.isDeleted and not tool.isDeleting then
                local owner = farmNumber(ctx.call(tool, "getOwnerFarmId"))
                local spec = rawget(tool, specName)
                if owner == farmId and type(spec) == "table" then
                    applicable = applicable + 1
                    if spec.isDropped == true then
                        local id = ctx.call(tool, "getUniqueId")
                        local object = spec.droppedHandTool
                        local objectOwner = type(object) == "table"
                            and farmNumber(ctx.call(object, "getOwnerFarmId")) or nil
                        local nodeId = type(object) == "table" and object.nodeId or nil
                        local x, _, z
                        if type(nodeId) == "number" and nodeId > 0
                            and object.handTool == tool and objectOwner == farmId
                            and not object.isDeleted and not object.isDeleting then
                            x, _, z = ctx.try(getPosition, nodeId)
                        end
                        x, z = coordinate(x), coordinate(z)
                        if type(id) ~= "string" or id == "" or #id > 80
                            or x == nil or z == nil then
                            -- A pending restore or failed spawn is not an in-world dropped tool.
                            invalid = true
                        else
                            ids[id] = (ids[id] or 0) + 1
                            if ids[id] > 1 then invalid = true end
                            dropped = dropped + 1
                            if #rows < MAX_ROWS then
                                rows[#rows + 1] = {
                                    farmId = farmId,
                                    toolId = id,
                                    tool = ctx.clip(ctx.call(tool, "getName") or id, 80),
                                    x = x,
                                    z = z,
                                }
                            else
                                truncated = true
                            end
                        end
                    elseif spec.isDropped ~= false then
                        invalid = true
                    end
                end
            end
        end
        if invalid then
            local unique = {}
            for _, row in ipairs(rows) do
                if ids[row.toolId] == 1 then unique[#unique + 1] = row end
            end
            rows = unique
        end
        table.sort(rows, function(a, b) return a.toolId < b.toolId end)
        local complete = not invalid and not truncated
        return {
            readState = not complete and "partial" or applicable == 0
                and "settings-only" or "ok",
            reason = invalid and "unresolved-owned-drop"
                or truncated and "scan-truncated"
                or applicable == 0 and "no-applicable-owned-hand-tool" or nil,
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            byFarm = complete and { [tostring(farmId)] = {
                handToolCount = applicable,
                droppedCount = dropped,
            } } or nil,
            rows = rows,
        }
    end,
})
