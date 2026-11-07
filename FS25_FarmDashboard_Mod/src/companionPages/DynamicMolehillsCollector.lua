-- Dynamic Molehills v1.0.0.2: live mound states on currently owned farmland.
-- Saved farmland IDs identify parcels, but ownership must be rechecked each export.
-- Removed mounds are omitted by the provider and cannot form a removal history.

local MAX_SCAN = 5000
local MAX_FARMLANDS = 80

CompanionPages.register({
    key = "dynamicMolehills",
    modNames = { "FS25_DynamicMolehills", "FS25_370425_FS25_DynamicMoleHills" },
    substrings = { "dynamicmolehills", "dynamic_molehills" },
    collect = function(ctx)
        local farmId = ctx.farmId
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-state-only" }
        end
        local provider = ctx.symbol("DynamicMolehills")
        local manager = type(provider) == "table" and provider.manager or nil
        local mounds = type(manager) == "table" and manager.molehills or nil
        local farmlands = ctx.global("g_farmlandManager")
        if type(mounds) ~= "table" or type(farmlands) ~= "table"
            or type(farmlands.getFarmlandOwner) ~= "function" then
            return { readState = "unavailable", reason = "provider-unavailable" }
        end

        local totals = { active = 0, compressed = 0, smoothed = 0 }
        local byLand = {}
        local scanned, partial, truncated = 0, false, false
        for _, mound in pairs(mounds) do
            scanned = scanned + 1
            if scanned > MAX_SCAN then
                truncated = true
                break
            end
            if type(mound) == "table" then
                local id = ctx.num(mound.farmlandId)
                local state = ctx.num(mound.state)
                if id ~= nil and id > 0 and id == math.floor(id) then
                    local owner = ctx.num(ctx.call(farmlands, "getFarmlandOwner", id))
                    if owner == nil then
                        partial = true
                    elseif owner == farmId and (state == 1 or state == 2 or state == 3) then
                        local name = state == 1 and "active" or state == 2 and "compressed" or "smoothed"
                        totals[name] = totals[name] + 1
                        local row = byLand[id]
                        if row == nil then
                            row = { farmlandId = id, active = 0, compressed = 0, smoothed = 0 }
                            byLand[id] = row
                        end
                        row[name] = row[name] + 1
                    elseif owner == farmId and state ~= 4 then
                        partial = true
                    end
                elseif state ~= 4 then
                    partial = true
                end
            else
                partial = true
            end
        end

        local rows = {}
        for id, row in pairs(byLand) do
            local land = ctx.call(farmlands, "getFarmlandById", id)
            row.name = ctx.clip(type(land) == "table" and
                (ctx.call(land, "getName") or land.name) or ("Farmland " .. tostring(id)), 60)
            rows[#rows + 1] = row
        end
        table.sort(rows, function(a, b) return a.farmlandId < b.farmlandId end)
        if #rows > MAX_FARMLANDS then
            truncated = true
            for i = #rows, MAX_FARMLANDS + 1, -1 do rows[i] = nil end
        end
        totals.current = totals.active + totals.compressed + totals.smoothed
        return {
            readState = partial and "partial" or "ok",
            reason = totals.current == 0 and "no-owned-mounds" or nil,
            coverage = truncated and "sampled" or partial and "partial" or "complete",
            byFarm = { [tostring(farmId)] = totals },
            farmlands = rows,
            scannedMounds = math.min(scanned, MAX_SCAN),
        }
    end,
})
