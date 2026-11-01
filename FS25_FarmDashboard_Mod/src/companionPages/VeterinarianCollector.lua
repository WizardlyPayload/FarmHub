-- Veterinarian 0.9.0.1 stores disease state by husbandry configuration and position.
-- Join the live state to a currently owned pen before exporting any illness count.

local MAX_SCAN = 250
local MAX_ROWS = 40

CompanionPages.register({
    key = "veterinarian",
    modNames = { "FS25_Veterinarian", "GH_Cobra-Modding__FS25_Veterinarian_FS25_Veterinarian" },
    substrings = { "fs25_veterinarian" },
    collect = function(ctx)
        local farmId = ctx.farmId
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-state-only" }
        end
        local veterinarian = ctx.symbol("g_veterinarian")
        local system = type(ctx.mission) == "table" and ctx.mission.placeableSystem or nil
        local placeables = type(system) == "table" and system.placeables or nil
        local world = ctx.global("getWorldTranslation")
        if type(veterinarian) ~= "table" or type(veterinarian.states) ~= "table"
            or type(placeables) ~= "table" or type(world) ~= "function" then
            return { readState = "settings-only", reason = "no-husbandry-state" }
        end

        local rows, owned, matched, sickTotal = {}, 0, 0, 0
        local scanned, truncated = 0, false
        for _, pen in pairs(placeables) do
            scanned = scanned + 1
            if scanned > MAX_SCAN then truncated = true; break end
            if type(pen) == "table" and pen.spec_husbandryAnimals ~= nil
                and type(pen.getNumOfAnimals) == "function"
                and ctx.num(ctx.call(pen, "getOwnerFarmId")) == farmId then
                owned = owned + 1
                -- Match the exact key format in Veterinarian.lua:getKey.
                local x, _, z = 0, 0, 0
                if pen.rootNode ~= nil then
                    x, _, z = ctx.try(world, pen.rootNode)
                end
                if ctx.num(x) ~= nil and ctx.num(z) ~= nil then
                    local key = string.format("%s@%.1f@%.1f", pen.configFileName or "husbandry", x, z)
                    local state = veterinarian.states[key]
                    if type(state) == "table" and ctx.num(state.sick) ~= nil then
                        matched = matched + 1
                        local sick = math.max(0, math.floor(ctx.num(state.sick)))
                        sickTotal = sickTotal + sick
                        if #rows < MAX_ROWS then
                            local disease = ctx.num(state.disease)
                            rows[#rows + 1] = {
                                farmId = farmId,
                                pen = ctx.clip(ctx.call(pen, "getName"), 70),
                                animals = ctx.num(ctx.call(pen, "getNumOfAnimals")),
                                sick = sick,
                                diseaseIndex = sick > 0 and disease and math.floor(disease) or nil,
                            }
                        else
                            truncated = true
                        end
                    end
                end
            end
        end
        table.sort(rows, function(a, b) return tostring(a.pen or "") < tostring(b.pen or "") end)
        local incomplete = owned > matched
        return {
            readState = matched == 0 and "settings-only" or incomplete and "partial" or "ok",
            reason = matched == 0 and "no-owned-pen-state" or incomplete and "pen-states-incomplete" or nil,
            coverage = truncated and "truncated" or incomplete and "partial" or "complete",
            byFarm = { [tostring(farmId)] = {
                ownedPens = owned, observedPens = matched, sickAnimals = sickTotal,
            } },
            rows = rows,
        }
    end,
})
