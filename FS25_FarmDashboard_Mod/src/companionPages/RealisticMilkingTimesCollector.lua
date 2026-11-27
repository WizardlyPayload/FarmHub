-- Realistic Milking Times v1.0.0.0: milk held between its 06:00/18:00 releases.
-- This is the mod's saved husbandry buffer, not native stored or sold milk.

local MAX_SCAN = 300
local MAX_ROWS = 60
local MAX_BUFFER = 100000000

CompanionPages.register({
    key = "realisticMilkingTimes",
    modNames = { "FS25_RealisticMilkingTimes", "FS25_303654_Realistic_Milking_Times" },
    collect = function(ctx)
        if ctx.version ~= "1.0.0.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmId = ctx.num(ctx.farmId)
        if farmId == nil or farmId < 1 or farmId ~= math.floor(farmId) then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-husbandry-state-only" }
        end
        local system = type(ctx.mission) == "table" and ctx.mission.placeableSystem or nil
        local placeables = type(system) == "table" and system.placeables or nil
        if type(placeables) ~= "table" then
            return { readState = "settings-only", reason = "no-placeable-list" }
        end

        local candidates, ids = {}, {}
        local invalid, truncated, scanned = false, false, 0
        for _, pen in pairs(placeables) do
            scanned = scanned + 1
            if scanned > MAX_SCAN then truncated = true; break end
            if type(pen) == "table" and type(pen.spec_husbandryMilk) == "table" then
                local owner = ctx.num(ctx.call(pen, "getOwnerFarmId") or pen.ownerFarmId)
                if owner == farmId then
                    local id = pen.uniqueId
                    local husbandry = pen.spec_husbandry
                    local buffered = type(husbandry) == "table"
                        and ctx.num(husbandry.RDM_RealisticMilkingTimeFillLevel) or nil
                    if type(id) ~= "string" or id == "" or #id > 80
                        or buffered == nil or buffered < 0 or buffered > MAX_BUFFER then
                        invalid = true
                    else
                        ids[id] = (ids[id] or 0) + 1
                        candidates[#candidates + 1] = {
                            farmId = farmId, placeableId = id,
                            barn = ctx.clip(ctx.call(pen, "getName") or id, 80),
                            pendingLitres = buffered,
                        }
                    end
                end
            end
        end

        local rows, total = {}, 0
        for _, row in ipairs(candidates) do
            if ids[row.placeableId] ~= 1 then invalid = true
            else
                total = total + row.pendingLitres
                if #rows < MAX_ROWS then rows[#rows + 1] = row
                else truncated = true end
            end
        end
        table.sort(rows, function(a, b) return a.placeableId < b.placeableId end)
        local incomplete = invalid or truncated
        return {
            readState = incomplete and "partial" or #rows > 0 and "ok" or "settings-only",
            reason = invalid and "invalid-milk-buffer" or #rows == 0 and not incomplete and "no-owned-milk-pen" or nil,
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            byFarm = not incomplete and { [tostring(farmId)] = {
                penCount = #rows, pendingLitres = total,
            } } or nil,
            rows = rows,
        }
    end,
})
