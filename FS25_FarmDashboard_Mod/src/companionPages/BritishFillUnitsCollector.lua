-- FS25 FarmDashboard | companionPages/BritishFillUnitsCollector.lua | v1.0.0
-- British Fill Units (BigMacJ 1.3.0.0). Display-only: solids are shown in kg / t (from the fill type's
-- massPerLiter, tonnes per litre), prices of solids in money per tonne, liquids stay in litres and
-- length consumables (net wrap, twine) in metres. Mod-env tables read here:
--   BFU.Runtime { VERSION, getSessionRole() }   (pure: reads g_server / g_client / mission info)
--   FillMassDisplay { shopCapacityInstalled, shopCapacitySpecInstalled, fillLevelsDisplayInstalled,
--     controlBarDisplayInstalled, priceStatisticsFrameContextInstalled, i18nFormatMoneyInstalled,
--     textElementSetTextInstalled, i18nFormatVolumeInstalled } hook flags,
--     getShouldKeepVolumeFillType(desc) / getShouldKeepLengthFillType(desc) (pure classification).
-- The mod has no settings and syncs nothing; each client formats its own UI.

local SAMPLE_FILLTYPES = {
    "WHEAT", "BARLEY", "OAT", "CANOLA", "MAIZE", "SOYBEAN", "SUNFLOWER", "POTATO", "SUGARBEET",
    "GRASS_WINDROW", "SILAGE", "STRAW", "LIME", "FERTILIZER", "MANURE", "MILK", "LIQUIDFERTILIZER", "DIESEL",
}
local SCAN_FILLTYPES = 400

local function hookFlags(fmd)
    if type(fmd) ~= "table" then
        return nil
    end
    return {
        storeCapacity = fmd.shopCapacityInstalled == true or fmd.shopCapacitySpecInstalled == true,
        quantityHud = fmd.fillLevelsDisplayInstalled == true or fmd.controlBarDisplayInstalled == true,
        pricesFrame = fmd.priceStatisticsFrameContextInstalled == true,
        priceMoney = fmd.i18nFormatMoneyInstalled == true,
        textFormatting = fmd.textElementSetTextInstalled == true and fmd.i18nFormatVolumeInstalled == true,
    }
end

local function classify(ctx, fmd, desc)
    if type(fmd) ~= "table" then
        return nil
    end
    if ctx.call(fmd, "getShouldKeepLengthFillType", desc) == true then
        return "length"
    end
    if ctx.call(fmd, "getShouldKeepVolumeFillType", desc) == true then
        return "litres"
    end
    local mass = ctx.num(desc.massPerLiter)
    if mass ~= nil and mass > 0 then
        return "mass"
    end
    return "litres"
end

local function readSamples(ctx, ftm, fmd)
    local rows = {}
    for _, name in ipairs(SAMPLE_FILLTYPES) do
        local desc = ctx.call(ftm, "getFillTypeByName", name)
        if type(desc) == "table" then
            local mass = ctx.num(desc.massPerLiter)
            rows[#rows + 1] = {
                fillType = name,
                title = type(desc.title) == "string" and ctx.clip(desc.title, 40) or nil,
                tonnesPer1000L = mass ~= nil and mass > 0 and math.floor(mass * 1000 * 1000 + 0.5) / 1000 or nil,
                shownAs = classify(ctx, fmd, desc),
            }
        end
    end
    return rows
end

local function readCatalog(ctx, ftm, fmd)
    local list = type(ftm.fillTypes) == "table" and ftm.fillTypes or nil
    if list == nil or type(fmd) ~= "table" then
        return nil
    end
    local counts = { mass = 0, litres = 0, length = 0 }
    for i = 1, math.min(#list, SCAN_FILLTYPES) do
        local desc = list[i]
        if type(desc) == "table" then
            local kind = classify(ctx, fmd, desc)
            if kind ~= nil then
                counts[kind] = counts[kind] + 1
            end
        end
    end
    counts.truncated = #list > SCAN_FILLTYPES
    return counts
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
    key = "britishFillUnits",
    modNames = { "FS25_BritishFillUnits", "FS25_BritishUnits" },
    substrings = { "britishfillunits", "british_fill_units", "britishunits" },
    collect = function(ctx)
        local bfu = ctx.symbol("BFU")
        local fmd = ctx.symbol("FillMassDisplay")
        if type(bfu) ~= "table" and type(fmd) ~= "table" then
            return nil
        end
        local runtime = type(bfu) == "table" and type(bfu.Runtime) == "table" and bfu.Runtime or nil
        local out = {
            runtimeVersion = runtime and type(runtime.VERSION) == "string" and ctx.clip(runtime.VERSION, 20) or nil,
            sessionRole = runtime and ctx.clip(ctx.try(runtime.getSessionRole), 30) or nil,
            hooks = hookFlags(fmd),
            gameUnits = gameUnits(ctx),
        }
        local ftm = ctx.global("g_fillTypeManager")
        if type(ftm) == "table" then
            out.samples = readSamples(ctx, ftm, fmd)
            out.catalog = readCatalog(ctx, ftm, fmd)
        end
        out.readState = (type(fmd) == "table" and type(ftm) == "table") and "ok" or "partial"
        return out
    end,
})
