-- Animal Planner 1.0.0.0 keeps administrator offsets and logistics routes by
-- husbandry uniqueId. Read only currently owned pens; never call its getters
-- that create routes/offsets or normalize legacy data.

local MAX_PENS = 80
local MAX_PER_KIND = 16
local MAX_ROWS = 100

local function whole(value, minimum, maximum)
    local n = tonumber(value)
    if n ~= nil and n == n and n >= minimum and n <= maximum and n == math.floor(n) then
        return n
    end
    return nil
end

CompanionPages.register({
    key = "animalPlanner",
    modNames = { "FS25_368672_Animal_Planner" },
    substrings = {},
    collect = function(ctx)
        if ctx.version ~= "1.0.0.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmId = whole(ctx.farmId, 1, 8)
        if farmId == nil then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-husbandry-state-only" }
        end
        local system = type(ctx.mission) == "table" and ctx.mission.husbandrySystem or nil
        local placeables = type(system) == "table" and system.placeables or nil
        local admin = ctx.symbol("AnimalPlannerAdminManager")
        local logistics = ctx.symbol("AnimalPlannerLogisticsManager")
        if type(placeables) ~= "table" or type(admin) ~= "table"
            or type(admin.customOffsets) ~= "table" or type(logistics) ~= "table"
            or type(logistics.routes) ~= "table" then
            return { readState = "settings-only", reason = "planner-state-not-ready" }
        end

        local fillManager = ctx.global("g_fillTypeManager")
        local candidates, idCounts, scanned = {}, {}, 0
        local truncated, invalid = false, false
        for _, pen in pairs(placeables) do
            scanned = scanned + 1
            if scanned > MAX_PENS then truncated = true; break end
            if type(pen) == "table" then
                local id = type(pen.uniqueId) == "string" and pen.uniqueId or nil
                if id ~= nil and id ~= "" then
                    idCounts[id] = (idCounts[id] or 0) + 1
                end
                if ctx.num(ctx.call(pen, "getOwnerFarmId")) == farmId then
                    if id == nil or id == "" then invalid = true
                    else
                        candidates[#candidates + 1] = { pen = pen, id = id }
                    end
                end
            end
        end

        local rows, owned, adjusted, routes = {}, 0, 0, 0
        local function add(row)
            if #rows < MAX_ROWS then rows[#rows + 1] = row else truncated = true end
        end
        local function fillName(index)
            return ctx.clip(ctx.call(fillManager, "getFillTypeTitleByIndex", index)
                or ctx.call(fillManager, "getFillTypeNameByIndex", index), 80)
        end
        for _, candidate in ipairs(candidates) do
            local pen, id = candidate.pen, candidate.id
            if idCounts[id] ~= 1 then invalid = true
            else
                owned = owned + 1
                local name = ctx.clip(ctx.call(pen, "getName"), 80)
                local offsets = admin.customOffsets[id]
                if type(offsets) == "table" then
                    for _, field in ipairs({ "animalOffset", "foodOffset", "sharedOffset" }) do
                        local value = offsets[field]
                        if value ~= nil then
                            local amount = whole(value, 0, 2147483647)
                            if amount == nil then invalid = true
                            elseif amount > 0 then
                                adjusted = adjusted + 1
                                add({ farmId = farmId, penId = ctx.clip(id, 80), name = name,
                                      kind = field, amount = amount })
                            end
                        end
                    end
                    for _, field in ipairs({ "fillTypeOffsets", "virtualFillTypeOffsets" }) do
                        local values = offsets[field]
                        if values ~= nil and type(values) ~= "table" then invalid = true
                        elseif type(values) == "table" then
                            local count = 0
                            for index, value in pairs(values) do
                                count = count + 1
                                if count > MAX_PER_KIND then truncated = true; break end
                                local fillId = whole(index, 1, 65535)
                                local amount = whole(value, 0, 2147483647)
                                if fillId == nil or amount == nil then invalid = true
                                elseif amount > 0 then
                                    adjusted = adjusted + 1
                                    add({ farmId = farmId, penId = ctx.clip(id, 80), name = name,
                                          kind = field, fillTypeIndex = fillId,
                                          item = fillName(fillId), amount = amount })
                                end
                            end
                        end
                    end
                    for _, field in ipairs({ "distributionEnabled", "autoSellEnabled" }) do
                        if type(offsets[field]) ~= "boolean" then invalid = true
                        else
                            add({ farmId = farmId, penId = ctx.clip(id, 80), name = name,
                                  kind = field, enabled = offsets[field] })
                        end
                    end
                elseif offsets ~= nil then invalid = true end

                local penRoutes = logistics.routes[id]
                if penRoutes ~= nil and type(penRoutes) ~= "table" then invalid = true
                elseif type(penRoutes) == "table" then
                    local count = 0
                    for index, route in pairs(penRoutes) do
                        count = count + 1
                        if count > MAX_PER_KIND then truncated = true; break end
                        local fillId = whole(index, 1, 65535)
                        local mode = type(route) == "table" and whole(route.mode, 0, 3) or nil
                        if fillId == nil or mode == nil then invalid = true
                        elseif mode > 0 then
                            routes = routes + 1
                            local eligible = mode == 1 and type(offsets) == "table" and offsets.distributionEnabled == true
                                or mode == 3 and type(offsets) == "table" and offsets.autoSellEnabled == true
                                or mode == 2
                            add({ farmId = farmId, penId = ctx.clip(id, 80), name = name,
                                  kind = "route", fillTypeIndex = fillId,
                                  item = fillName(fillId), mode = mode, featureEnabled = eligible == true })
                        end
                    end
                end
            end
        end
        table.sort(rows, function(a, b)
            return tostring(a.name or "") .. tostring(a.penId or "") .. tostring(a.kind) .. tostring(a.fillTypeIndex or "")
                < tostring(b.name or "") .. tostring(b.penId or "") .. tostring(b.kind) .. tostring(b.fillTypeIndex or "")
        end)
        return {
            readState = invalid and "partial" or "ok",
            reason = invalid and "ambiguous-or-unreadable-planner-state" or nil,
            coverage = truncated and "truncated" or "complete",
            byFarm = { [tostring(farmId)] = {
                ownedPenCount = owned, adjustmentCount = adjusted, routeCount = routes,
            } },
            rows = rows,
        }
    end,
})
