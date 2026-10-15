-- FS25 FarmDashboard | AnimalFoodOverviewCollector.lua
-- Dedicated page reader for FS25_AnimalFoodOverview (Fetty42).
-- The mod keeps no state: its dialog lists the game's own animalFoodSystem (food groups per animal type,
-- production/eat weights, accepted foods, mixtures and TMR recipes). This reader exports the same table,
-- bounded, while the mod is loaded. The table is static for a session, so it is cached per mission.

local MAX_ANIMALS = 16
local MAX_GROUPS = 8
local MAX_FOODS = 12
local MAX_MIXTURES = 6
local MAX_RECIPES = 8
local MAX_INGREDIENTS = 8

local cache = setmetatable({}, { __mode = "v" })

local function each(tbl, fn)
    if #tbl > 0 then
        for i = 1, #tbl do
            if fn(tbl[i]) == false then
                return
            end
        end
        return
    end
    for _, value in pairs(tbl) do
        if fn(value) == false then
            return
        end
    end
end

local function isSlider(name)
    return type(name) == "string" and string.sub(name, 1, -3) == "SLIDER"
end

local function fillTypeInfo(ctx, ftm, index)
    local ft = ctx.call(ftm, "getFillTypeByIndex", index)
    if type(ft) ~= "table" then
        return nil
    end
    return ft
end

local function readGroups(ctx, ftm, animalFood)
    local groups = {}
    if type(animalFood.groups) ~= "table" then
        return groups
    end
    each(animalFood.groups, function(group)
        if #groups >= MAX_GROUPS then
            return false
        end
        if type(group) == "table" then
            local foods = {}
            if type(group.fillTypes) == "table" then
                each(group.fillTypes, function(index)
                    if #foods >= MAX_FOODS then
                        return false
                    end
                    local ft = fillTypeInfo(ctx, ftm, index)
                    if ft ~= nil and not isSlider(ft.name) then
                        foods[#foods + 1] = ctx.clip(ft.title or ft.name, 40)
                    end
                end)
                -- The mod's dialog lists direct foods alphabetically.
                table.sort(foods)
            end
            groups[#groups + 1] = {
                title = ctx.clip(group.title, 40),
                productionWeight = ctx.round2(group.productionWeight),
                eatWeight = ctx.round2(group.eatWeight),
                foods = foods,
            }
        end
    end)
    table.sort(groups, function(a, b)
        local pa, pb = a.productionWeight or 0, b.productionWeight or 0
        if pa == pb then
            return tostring(a.title) < tostring(b.title)
        end
        return pa > pb
    end)
    return groups
end

local function readMixtures(ctx, ftm, system, typeIndex)
    local mixtures = {}
    local byType = type(system.animalMixtures) == "table" and system.animalMixtures[typeIndex] or nil
    local lookup = type(system.mixtureFillTypeIndexToMixture) == "table" and system.mixtureFillTypeIndexToMixture or nil
    if type(byType) ~= "table" or lookup == nil then
        return mixtures
    end
    each(byType, function(mixIndex)
        if #mixtures >= MAX_MIXTURES then
            return false
        end
        local mixture = lookup[mixIndex]
        local ft = fillTypeInfo(ctx, ftm, mixIndex)
        if type(mixture) == "table" and ft ~= nil then
            -- Parallel arrays: the registry drops tables nested deeper than six levels.
            local weights, foods = {}, {}
            if type(mixture.ingredients) == "table" then
                each(mixture.ingredients, function(ingredient)
                    if #weights >= MAX_INGREDIENTS then
                        return false
                    end
                    local weight = type(ingredient) == "table" and ctx.num(ingredient.weight) or nil
                    if weight ~= nil and weight > 0 then
                        local titles = {}
                        if type(ingredient.fillTypes) == "table" then
                            each(ingredient.fillTypes, function(idx)
                                local ift = fillTypeInfo(ctx, ftm, idx)
                                if ift ~= nil and #titles < 4 then
                                    titles[#titles + 1] = ctx.clip(ift.title or ift.name, 32)
                                end
                            end)
                        end
                        weights[#weights + 1] = math.floor(weight * 100 + 0.5)
                        foods[#foods + 1] = table.concat(titles, ", ")
                    end
                end)
            end
            mixtures[#mixtures + 1] = {
                title = ctx.clip(ft.title or ft.name, 40),
                ingredientWeights = weights,
                ingredientFoods = foods,
            }
        end
    end)
    return mixtures
end

local function readRecipes(ctx, ftm, system)
    local recipes = {}
    if type(system.recipes) ~= "table" then
        return recipes
    end
    each(system.recipes, function(recipe)
        if #recipes >= MAX_RECIPES then
            return false
        end
        local ft = type(recipe) == "table" and fillTypeInfo(ctx, ftm, recipe.fillType) or nil
        if ft ~= nil then
            local ingredients = {}
            if type(recipe.ingredients) == "table" then
                each(recipe.ingredients, function(ingredient)
                    if #ingredients >= MAX_INGREDIENTS then
                        return false
                    end
                    if type(ingredient) == "table" then
                        local minP, maxP = ctx.num(ingredient.minPercentage), ctx.num(ingredient.maxPercentage)
                        ingredients[#ingredients + 1] = {
                            title = ctx.clip(ingredient.title or ingredient.name, 40),
                            minPercent = minP ~= nil and math.floor(minP * 100 + 0.5) or nil,
                            maxPercent = maxP ~= nil and math.floor(maxP * 100 + 0.5) or nil,
                        }
                    end
                end)
            end
            recipes[#recipes + 1] = { title = ctx.clip(ft.title or ft.name, 40), ingredients = ingredients }
        end
    end)
    return recipes
end

local function readSystem(ctx)
    local mission = ctx.mission
    local system = type(mission) == "table" and mission.animalFoodSystem or nil
    local animalSystem = type(mission) == "table" and mission.animalSystem or nil
    local ftm = ctx.global("g_fillTypeManager")
    if type(system) ~= "table" or type(system.animalFood) ~= "table" or ftm == nil then
        return nil
    end
    local animals, truncated = {}, false
    each(system.animalFood, function(animalFood)
        if #animals >= MAX_ANIMALS then
            truncated = true
            return false
        end
        if type(animalFood) == "table" then
            local typeIndex = animalFood.animalTypeIndex
            local animalType = ctx.call(animalSystem, "getTypeByIndex", typeIndex)
            local title = type(animalType) == "table" and (animalType.groupTitle or animalType.name) or nil
            animals[#animals + 1] = {
                animalType = ctx.clip(type(animalType) == "table" and animalType.name or tostring(typeIndex), 24),
                title = ctx.clip(title or tostring(typeIndex), 40),
                consumption = animalFood.consumptionType == 1 and "sequential" or "parallel",
                groups = readGroups(ctx, ftm, animalFood),
                mixtures = readMixtures(ctx, ftm, system, typeIndex),
            }
        end
    end)
    table.sort(animals, function(a, b) return tostring(a.title) < tostring(b.title) end)
    return {
        animals = animals,
        recipes = readRecipes(ctx, ftm, system),
        truncated = truncated,
    }
end

CompanionPages.register({
    key = "animalFoodOverview",
    modNames = { "FS25_AnimalFoodOverview", "FS25_309457_Animal_Food_Overview" },
    substrings = { "animalfoodoverview", "animal_food_overview" },
    collect = function(ctx)
        local mod = ctx.symbol("AnimalFoodOverview")
        local out = {
            readState = "ok",
            source = "animalFoodSystem",
            modStateReadable = type(mod) == "table",
            keybindAction = "ShowAnimalFoodDlg",
        }
        local data = cache.mission == ctx.mission and cache.data or nil
        if data == nil then
            data = readSystem(ctx)
            cache.mission = ctx.mission
            cache.data = data
        end
        if data == nil then
            out.readState = type(mod) == "table" and "settings-only" or "detection-only"
            return out
        end
        out.animals = data.animals
        out.recipes = data.recipes
        out.truncated = data.truncated
        out.animalTypeCount = #data.animals
        return out
    end,
})
