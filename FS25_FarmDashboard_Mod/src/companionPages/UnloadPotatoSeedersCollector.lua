-- Unload Potato Seeders v1.0.0.2: current selected unload fill type.
-- The choice is synchronized while loaded but is reset on reload; no unload ledger.
local MAX_ROWS = 80

local function positiveInteger(value)
    local n = tonumber(value)
    if n and n == n and n > 0 and n == math.floor(n) then return n end
    return nil
end

CompanionPages.register({
    key = "unloadPotatoSeeders",
    modNames = { "FS25_UnloadPotatoSeeders", "FS25_326817_Unload_Potato_Seeders" },
    substrings = { "unloadpotatoseeders", "unload_potato_seeders" },
    collect = function(ctx)
        if ctx.version ~= "1.0.0.2" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmId = positiveInteger(ctx.farmId)
        if not farmId then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-seeder-state-only" }
        end
        local fill = ctx.global("FillType")
        if type(fill) ~= "table" or not positiveInteger(fill.POTATO)
            or not positiveInteger(fill.SEEDS) or not positiveInteger(fill.FERTILIZER)
            or fill.POTATO == fill.SEEDS or fill.POTATO == fill.FERTILIZER
            or fill.SEEDS == fill.FERTILIZER then
            return { readState = "settings-only", reason = "fill-types-unavailable" }
        end
        local vehicles = ctx.ownedVehicles()
        if type(vehicles) ~= "table" then
            return { readState = "settings-only", reason = "no-owned-vehicle-list" }
        end

        local rows, ids = {}, {}
        local count, potato, seeds, fertilizer = 0, 0, 0, 0
        local invalid, truncated = false, ctx.ownedScanTruncated == true
        for _, vehicle in ipairs(vehicles) do
            local spec = type(vehicle) == "table" and vehicle.spec_unloadPotatoSeeder or nil
            local owner = type(vehicle) == "table" and ctx.num(
                ctx.call(vehicle, "getOwnerFarmId") or vehicle.ownerFarmId) or nil
            if owner == farmId and type(spec) == "table" and spec.isPotatoSeeder == true then
                local id = ctx.call(vehicle, "getUniqueId") or vehicle.uniqueId
                local chosen = positiveInteger(spec.unloadFillTypeIndex)
                local mode = chosen == fill.POTATO and "potato"
                    or chosen == fill.SEEDS and "seeds"
                    or chosen == fill.FERTILIZER and "fertilizer" or nil
                if type(id) ~= "string" or id == "" or #id > 80
                    or type(spec.supportsFertilizer) ~= "boolean" or mode == nil
                    or (mode == "fertilizer" and not spec.supportsFertilizer) then
                    invalid = true
                else
                    ids[id] = (ids[id] or 0) + 1
                    if ids[id] > 1 then invalid = true end
                    count = count + 1
                    if mode == "potato" then potato = potato + 1
                    elseif mode == "seeds" then seeds = seeds + 1
                    else fertilizer = fertilizer + 1 end
                    if #rows < MAX_ROWS then
                        rows[#rows + 1] = {
                            farmId = farmId,
                            vehicleId = id,
                            vehicle = ctx.clip(ctx.call(vehicle, "getFullName")
                                or ctx.call(vehicle, "getName") or id, 80),
                            selectedUnload = mode,
                            supportsFertilizer = spec.supportsFertilizer,
                        }
                    else
                        truncated = true
                    end
                end
            end
        end
        if invalid then
            local unique = {}
            for _, row in ipairs(rows) do
                if ids[row.vehicleId] == 1 then unique[#unique + 1] = row end
            end
            rows = unique
        end
        table.sort(rows, function(a, b) return a.vehicleId < b.vehicleId end)
        local complete = not invalid and not truncated
        return {
            readState = not complete and "partial" or count == 0
                and "settings-only" or "ok",
            reason = invalid and "invalid-or-ambiguous-owned-seeder"
                or truncated and "scan-truncated"
                or count == 0 and "no-applicable-owned-seeder" or nil,
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            byFarm = complete and { [tostring(farmId)] = {
                seederCount = count,
                potatoCount = potato,
                seedsCount = seeds,
                fertilizerCount = fertilizer,
            } } or nil,
            rows = rows,
        }
    end,
})
