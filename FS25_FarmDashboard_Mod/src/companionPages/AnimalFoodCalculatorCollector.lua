-- FS25 FarmDashboard | AnimalFoodCalculatorCollector.lua
-- Dedicated page reader for FS25_AnimalFoodCalculator ([Weekend Farmers]).
-- Reads the consumption-scaling settings (AFCConsumptionScaling getters) and, per pen owned by the export
-- farm, the per-pen cache the mod itself fills (AnimalFoodCalculator.data) when animals change or the pen
-- is opened in the Animals menu. Inputs are shown with the same display scale the mod applies.
-- Never calls onAnimalsChanged / getOrCalculatePlaceableEntry (they recompute 12-month curves and write
-- the mod's cache); a pen without a cache entry is reported as "not calculated yet".

local MAX_SCAN = 300
local MAX_PENS = 24
local MAX_OUTPUTS = 6
local INPUTS = { "food", "water", "straw" }
local HOOKS = {
    food = "foodHookInstalled",
    water = "waterHookInstalled",
    straw = "strawHookInstalled",
    milk = "milkHookInstalled",
    liquidManure = "liquidManureHookInstalled",
    pallets = "palletHookInstalled",
}

local function ownedHusbandries(ctx)
    local out, truncated = {}, false
    local farmId = ctx.farmId
    local mission = ctx.mission
    if farmId == nil or type(mission) ~= "table" then
        return out, truncated
    end
    local list = type(mission.husbandrySystem) == "table" and mission.husbandrySystem.placeables or nil
    if type(list) ~= "table" then
        list = type(mission.placeableSystem) == "table" and mission.placeableSystem.placeables or nil
    end
    if type(list) ~= "table" then
        return out, truncated
    end
    local scanned = 0
    for _, placeable in pairs(list) do
        scanned = scanned + 1
        if scanned > MAX_SCAN then
            truncated = true
            break
        end
        if type(placeable) == "table" and type(placeable.spec_husbandryAnimals) == "table" then
            local owner = ctx.num(ctx.call(placeable, "getOwnerFarmId")) or ctx.num(placeable.ownerFarmId)
            if owner == farmId then
                out[#out + 1] = placeable
            end
        end
    end
    return out, truncated
end

local function cacheEntry(calc, placeable)
    local data = type(calc) == "table" and calc.data or nil
    if type(data) ~= "table" then
        return nil
    end
    if placeable.id ~= nil then
        local hit = data["placeable_" .. tostring(placeable.id)]
        if type(hit) == "table" then
            return hit
        end
    end
    local hit = data[tostring(placeable)]
    if type(hit) == "table" then
        return hit
    end
    return nil
end

local function readPen(ctx, calc, placeable, scales)
    local entry = cacheEntry(calc, placeable)
    local row = {
        name = ctx.clip(ctx.call(placeable, "getName"), 60),
        animals = ctx.num(ctx.call(placeable, "getNumOfAnimals")),
        calculated = entry ~= nil,
    }
    if entry == nil then
        return row
    end
    row.referenceSource = ctx.clip(entry.referenceSource, 24)
    local inputs = type(entry.inputs) == "table" and entry.inputs or {}
    for _, name in ipairs(INPUTS) do
        local input = inputs[name]
        if type(input) == "table" and input.supported == true then
            local scale = scales[name] or 1
            row[name .. "Daily"] = ctx.round2((ctx.num(input.daily) or 0) * scale)
            row[name .. "Yearly"] = ctx.round2((ctx.num(input.yearly) or 0) * scale)
        end
    end
    local outputs = {}
    if type(entry.outputs) == "table" then
        for _, output in pairs(entry.outputs) do
            if #outputs >= MAX_OUTPUTS then
                break
            end
            if type(output) == "table" and output.supported ~= false then
                local daily, yearly = ctx.round2(output.daily), ctx.round2(output.yearly)
                if daily ~= nil and yearly ~= nil then
                    outputs[#outputs + 1] = { title = ctx.clip(output.title or output.outputName, 40) or "?", daily = daily, yearly = yearly }
                end
            end
        end
        table.sort(outputs, function(a, b) return a.title < b.title end)
    end
    -- Parallel arrays: the registry drops tables nested deeper than six levels.
    row.outputTitles, row.outputDaily, row.outputYearly = {}, {}, {}
    for i, output in ipairs(outputs) do
        row.outputTitles[i] = output.title
        row.outputDaily[i] = output.daily
        row.outputYearly[i] = output.yearly
    end
    return row
end

CompanionPages.register({
    key = "animalFoodCalculator",
    modNames = { "FS25_AnimalFoodCalculator", "FS25_338159_Animal_Food_Calculator" },
    substrings = { "animalfoodcalculator", "animal_food_calculator" },
    collect = function(ctx)
        local scaling = ctx.symbol("AFCConsumptionScaling")
        local calc = ctx.symbol("AnimalFoodCalculator")
        if type(scaling) ~= "table" and type(calc) ~= "table" then
            return nil
        end

        local out = { readState = "ok", settings = {}, hooks = {} }
        local mission = ctx.mission
        local env = type(mission) == "table" and mission.environment or nil
        local days = type(env) == "table" and ctx.num(env.daysPerPeriod) or nil
        out.daysPerPeriod = days

        local scales = {}
        if type(scaling) == "table" then
            out.settings.enabled = scaling.enabled == true
            out.settings.autoScaleByDays = scaling.autoScaleByDays == true
            out.settings.mode = ctx.clip(ctx.call(scaling, "getModeName"), 24)
            out.settings.customMultiplier = ctx.round2(ctx.call(scaling, "getCustomMultiplier"))
            out.settings.referenceSource = ctx.clip(ctx.call(scaling, "getReferenceSourceName"), 24)
            local restricted = ctx.call(scaling, "isAnimalPackageRestricted")
            if restricted == true or restricted == false then
                out.settings.animalPackageRestricted = restricted
            end
            for _, name in ipairs(INPUTS) do
                out.settings[name .. "Scale"] = ctx.round2(ctx.call(scaling, "getScaleFactor", name, days))
            end
        end

        if type(calc) ~= "table" then
            out.readState = "settings-only"
            return out
        end
        for label, field in pairs(HOOKS) do
            out.hooks[label] = calc[field] == true
        end
        out.enhancedAnimalSystem = calc.isEAS == true
        for _, name in ipairs(INPUTS) do
            scales[name] = ctx.num(ctx.call(calc, "getDisplayScaleFactor", name)) or 1
        end

        if ctx.farmId ~= nil then
            local owned, truncated = ownedHusbandries(ctx)
            local pens, failed = {}, false
            local totals = { calculatedPens = 0, foodDaily = 0, waterDaily = 0, strawDaily = 0 }
            for _, placeable in ipairs(owned) do
                local okRow, row = pcall(readPen, ctx, calc, placeable, scales)
                if not okRow then
                    failed = true
                elseif row ~= nil then
                    if #pens < MAX_PENS then
                        pens[#pens + 1] = row
                    else
                        truncated = true
                    end
                    if row.calculated then
                        totals.calculatedPens = totals.calculatedPens + 1
                        totals.foodDaily = totals.foodDaily + (row.foodDaily or 0)
                        totals.waterDaily = totals.waterDaily + (row.waterDaily or 0)
                        totals.strawDaily = totals.strawDaily + (row.strawDaily or 0)
                    end
                end
            end
            out.byFarm = {
                [tostring(ctx.farmId)] = {
                    penCount = #pens,
                    calculatedPens = totals.calculatedPens,
                    foodDaily = ctx.round2(totals.foodDaily),
                    waterDaily = ctx.round2(totals.waterDaily),
                    strawDaily = ctx.round2(totals.strawDaily),
                    truncated = truncated,
                    pens = pens,
                },
            }
            if failed then
                out.readState = "partial"
            end
        end
        return out
    end,
})
