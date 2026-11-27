-- Bull Milk Production 2.8.0.0. Read the mod's last calculated bull-milk
-- hourly rate from currently owned cow husbandries. Actual litres are native
-- husbandry storage; this rate is neither an output history nor a sale.

local MAX_SCAN = 500
local MAX_ROWS = 60
local MAX_ANIMALS = 100000
local MAX_RATE = 1000000

local function number(value, maximum)
    local n = tonumber(value)
    if n ~= nil and n == n and n ~= math.huge and n ~= -math.huge
        and n >= 0 and n <= maximum then return n end
    return nil
end

local function identity(value)
    return type(value) == "string" and value ~= "" and #value <= 80 and value or nil
end

CompanionPages.register({
    key = "bullMilkProduction",
    modNames = { "KM_82260_Bull_milk_production" },
    substrings = {},
    collect = function(ctx)
        if ctx.version ~= "2.8.0.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmId = number(ctx.farmId, 8)
        if not farmId or farmId == 0 or farmId ~= math.floor(farmId) then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-husbandry-state-only" }
        end
        local mod = ctx.symbol("BullMilkStandalone") or ctx.global("BullMilkStandalone")
        local fillTypes = ctx.global("g_fillTypeManager")
        local animalSystem = type(ctx.mission) == "table" and ctx.mission.animalSystem or nil
        local system = type(ctx.mission) == "table" and ctx.mission.placeableSystem or nil
        local placeables = type(system) == "table" and system.placeables or nil
        if type(mod) ~= "table" or mod.FILL_TYPE_NAME ~= "BULLMILK"
            or type(fillTypes) ~= "table" or type(animalSystem) ~= "table"
            or type(placeables) ~= "table" then
            return { readState = "settings-only", reason = "bull-milk-state-not-ready" }
        end
        local fillType = number(ctx.call(fillTypes, "getFillTypeIndexByName", "BULLMILK"), 65535)
        if not fillType or fillType == 0 or fillType ~= math.floor(fillType) then
            return { readState = "settings-only", reason = "bull-milk-fill-type-not-ready" }
        end

        local candidates, idCounts = {}, {}
        local scanned, invalid, truncated = 0, false, false
        for _, barn in pairs(placeables) do
            scanned = scanned + 1
            if scanned > MAX_SCAN then truncated = true; break end
            if type(barn) == "table" and type(barn.spec_husbandryMilk) == "table"
                and number(ctx.call(barn, "getOwnerFarmId"), 8) == farmId then
                local typeIndex = number(ctx.call(barn, "getAnimalTypeIndex"), 65535)
                local animalType = typeIndex and ctx.call(animalSystem, "getTypeByIndex", typeIndex) or nil
                if type(animalType) == "table" and animalType.name == "COW" then
                    local id = identity(barn.uniqueId)
                    if not id then invalid = true
                    else
                        idCounts[id] = (idCounts[id] or 0) + 1
                        candidates[#candidates + 1] = { barn = barn, id = id }
                    end
                end
            end
        end

        local rows, bullCount, hourlyRate = {}, 0, 0
        for _, candidate in ipairs(candidates) do
            if idCounts[candidate.id] ~= 1 then invalid = true
            else
                local barn = candidate.barn
                local milk = barn.spec_husbandryMilk
                local husbandry = barn.spec_husbandry
                local storage = type(husbandry) == "table" and husbandry.storage or nil
                local bulls = number(milk.bullMilkDetectedAnimals, MAX_ANIMALS)
                local rate = number(milk.bullMilkLitersPerHour, MAX_RATE)
                local currentRate = type(milk.litersPerHour) == "table"
                    and number(milk.litersPerHour[fillType], MAX_RATE) or nil
                if milk.hasMilkProduction ~= true or type(storage) ~= "table"
                    or type(storage.fillTypes) ~= "table" or storage.fillTypes[fillType] ~= true
                    or not bulls or bulls ~= math.floor(bulls) or not rate
                    or not currentRate or math.abs(rate - currentRate) > 0.000001
                    or (bulls == 0 and rate > 0) then
                    invalid = true
                else
                    bullCount = bullCount + bulls
                    hourlyRate = hourlyRate + rate
                    if #rows < MAX_ROWS then
                        rows[#rows + 1] = {
                            farmId = farmId, placeableId = candidate.id,
                            barn = ctx.clip(ctx.call(barn, "getName") or candidate.id, 80),
                            detectedBulls = bulls, calculatedLitresPerHour = rate,
                        }
                    else truncated = true end
                end
            end
        end
        table.sort(rows, function(a, b) return a.placeableId < b.placeableId end)
        local complete = not invalid and not truncated
        return {
            readState = invalid and "partial" or #rows == 0 and not truncated
                and "settings-only" or "ok",
            reason = invalid and "invalid-or-ambiguous-owned-cow-barn"
                or #rows == 0 and not truncated and "no-captured-owned-cow-barn" or nil,
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            byFarm = complete and { [tostring(farmId)] = {
                barnCount = #rows, detectedBulls = bullCount,
                calculatedLitresPerHour = hourlyRate,
            } } or nil,
            rows = rows,
        }
    end,
})
