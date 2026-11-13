-- Wood Manager 1.0.0.0: applied save-local split-wood price/chip overrides.
-- Settings are save-wide, not farm sales, harvested wood or realized revenue.

local MAX_OVERRIDES = 80

CompanionPages.register({
    key = "woodManager",
    modNames = { "FS25_347200_Wood_Manager", "FS25_woodManager" },
    substrings = { "wood_manager", "woodmanager" },
    collect = function(ctx)
        local scope = "save-wide"
        if ctx.version ~= "1.0.0.0" then
            return { readState = "settings-only", reason = "unreviewed-version", scope = scope }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-rule-only", scope = scope }
        end
        if ctx.global("g_server") == nil then
            return { readState = "settings-only", reason = "server-state-unavailable", scope = scope }
        end
        local info = type(ctx.mission) == "table" and ctx.mission.missionInfo or nil
        if type(info) ~= "table" or type(info.savegameDirectory) ~= "string"
            or info.savegameDirectory == "" then
            return { readState = "settings-only", reason = "save-identity-unavailable", scope = scope }
        end
        local mod = ctx.symbol("woodManager")
        local manager = ctx.global("g_splitShapeManager")
        if type(mod) ~= "table" or mod.defaultCaptured ~= true or type(mod.overrides) ~= "table"
            or type(mod.defaultSplitTypes) ~= "table" or type(manager) ~= "table"
            or type(manager.typesByIndex) ~= "table" then
            return { readState = "settings-only", reason = "live-overrides-unavailable", scope = scope }
        end
        local rows, scanned, unresolved = {}, 0, 0
        local truncated = false
        for index, override in pairs(mod.overrides) do
            scanned = scanned + 1
            if scanned > MAX_OVERRIDES then truncated = true; break end
            local current = manager.typesByIndex[index]
            local baseline = mod.defaultSplitTypes[index]
            if type(index) == "number" and index > 0 and index == math.floor(index)
                and type(override) == "table" and type(current) == "table" and type(baseline) == "table" then
                local price = ctx.num(current.pricePerLiter)
                local chips = ctx.num(current.woodChipsPerLiter)
                local basePrice = ctx.num(baseline.pricePerLiter)
                local baseChips = ctx.num(baseline.woodChipsPerLiter)
                local overridePrice = ctx.num(override.pricePerLiter)
                local overrideChips = ctx.num(override.woodChipsPerLiter)
                if price and price >= 0 and chips and chips >= 0 and basePrice and basePrice >= 0
                    and baseChips and baseChips >= 0 and overridePrice and overridePrice >= 0
                    and overrideChips and overrideChips >= 0
                    and math.abs(price - overridePrice) < 0.000001
                    and math.abs(chips - overrideChips) < 0.000001 then
                    if math.abs(price - basePrice) >= 0.000001 or math.abs(chips - baseChips) >= 0.000001 then
                        rows[#rows + 1] = {
                            splitType = ctx.clip(current.name, 60),
                            title = ctx.clip(current.title or current.name, 80),
                            pricePerLitre = price,
                            defaultPricePerLitre = basePrice,
                            woodChipsPerLitre = chips,
                            defaultWoodChipsPerLitre = baseChips,
                        }
                    end
                else
                    unresolved = unresolved + 1
                end
            else
                unresolved = unresolved + 1
            end
        end
        table.sort(rows, function(a, b) return (a.title or "") < (b.title or "") end)
        return {
            readState = (truncated or unresolved > 0) and "partial" or (#rows > 0 and "ok" or "settings-only"),
            reason = #rows == 0 and "no-applied-overrides" or nil,
            scope = scope,
            overrideCount = #rows,
            unresolvedCount = unresolved,
            truncated = truncated,
            rows = rows,
        }
    end,
})
