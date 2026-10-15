-- FS25 FarmDashboard | companionPages/ImperialSystemCollector.lua | v1.0.0
-- Imperial System Conversion Settings (FastFarm Dad 1.1.0.0). Display-only unit switcher with an ESC
-- "Unit Conversion" section. Mod-env table UnitConversionMod:
--   settings (UnitConversionManager, created at Mission00.setMissionInfo, saved per profile in
--     modSettings/<mod>/unitSettings.xml): liquidUnit 0 L / 1 US gal, cropsUnit 0 L / 1 bushel+lbs,
--     weightUnit 0 kg-t / 1 lbs-US tn, measureUnit 0 m / 1 ft, weightScale 0 auto / 1 lbs only / 2 tons only
--   factors LITERS_PER_GALLON, LITERS_PER_BUSHEL, KG_PER_POUND, METERS_PER_FOOT, LBS_PER_US_TON, KG_PER_US_TON
--   BUSHEL_CROPS (grains quoted per bushel), BULK_DENSITY (kg/L for other solids), DEFAULT_BULK_DENSITY.
-- Speed and area stay on the game's own miles / acres settings, exported alongside for context.

local MAX_BUSHEL_CROPS = 40

local function choice(value, names)
    local n = tonumber(value)
    if n == nil then
        return nil
    end
    return names[math.floor(n) + 1]
end

local function readSettings(ctx, s)
    if type(s) ~= "table" then
        return nil
    end
    local out = {
        liquid = choice(ctx.num(s.liquidUnit), { "liters", "gallons" }),
        crops = choice(ctx.num(s.cropsUnit), { "liters", "imperial" }),
        weight = choice(ctx.num(s.weightUnit), { "metric", "imperial" }),
        measure = choice(ctx.num(s.measureUnit), { "metric", "imperial" }),
        weightScale = choice(ctx.num(s.weightScale), { "auto", "pounds", "tons" }),
    }
    if next(out) == nil then
        return nil
    end
    return out
end

local function readFactors(ctx, ucm)
    return {
        litersPerGallon = ctx.num(ucm.LITERS_PER_GALLON),
        litersPerBushel = ctx.num(ucm.LITERS_PER_BUSHEL),
        kgPerPound = ctx.num(ucm.KG_PER_POUND),
        metersPerFoot = ctx.num(ucm.METERS_PER_FOOT),
        lbsPerUsTon = ctx.num(ucm.LBS_PER_US_TON),
        kgPerUsTon = ctx.num(ucm.KG_PER_US_TON),
        defaultBulkDensity = ctx.num(ucm.DEFAULT_BULK_DENSITY),
    }
end

local function readBushelCrops(ctx, ucm)
    local names = {}
    if type(ucm.BUSHEL_CROPS) ~= "table" then
        return names
    end
    local scanned = 0
    for name, on in pairs(ucm.BUSHEL_CROPS) do
        scanned = scanned + 1
        if scanned > 200 then
            break
        end
        if on == true and type(name) == "string" then
            names[#names + 1] = ctx.clip(name, 40)
        end
    end
    table.sort(names)
    local out = {}
    for i = 1, math.min(#names, MAX_BUSHEL_CROPS) do
        out[i] = names[i]
    end
    return out
end

local function gameUnits(ctx)
    local settings = ctx.global("g_gameSettings")
    if type(settings) ~= "table" then
        return nil
    end
    local out = {}
    for _, name in ipairs({ "useMiles", "useAcre", "useFahrenheit" }) do
        local value = ctx.call(settings, "getValue", name)
        if value == true or value == false then
            out[name] = value
        end
    end
    return next(out) ~= nil and out or nil
end

CompanionPages.register({
    key = "imperialSystem",
    modNames = { "FS25_ImperialSystem", "FS25_ImperialUnits", "FS25_316812_Imperial_System" },
    substrings = { "imperialsystem", "imperial_system", "imperialunits" },
    collect = function(ctx)
        local ucm = ctx.symbol("UnitConversionMod")
        if type(ucm) ~= "table" then
            return nil
        end
        local settings = ctx.try(readSettings, ctx, ucm.settings)
        local out = {
            settings = settings,
            factors = readFactors(ctx, ucm),
            bushelCrops = readBushelCrops(ctx, ucm),
            bulkDensityCount = type(ucm.BULK_DENSITY) == "table" and ctx.count(ucm.BULK_DENSITY) or nil,
            gameUnits = gameUnits(ctx),
        }
        out.readState = settings ~= nil and "ok" or "partial"
        if settings == nil then
            out.reason = "settings-not-created"
        end
        return out
    end,
})
