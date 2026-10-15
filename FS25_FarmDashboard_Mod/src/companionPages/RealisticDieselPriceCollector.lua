-- FS25 FarmDashboard | companionPages/RealisticDieselPriceCollector.lua | v1.0.0
-- Realistic Diesel Price (KryskiPL): RealisticDieselPrice (mod env) holds regions[].countries[] price
-- presets, currentRegion/currentCountry, customMode/customPrice. applyCurrentPrice writes the chosen
-- price to the DIESEL fill type once on load and on each settings change; nothing re-applies it later.

local MAX_REGIONS = 8
local MAX_COUNTRIES = 60

local function gameDieselPrice(ctx)
    local ftm = ctx.global("g_fillTypeManager")
    local diesel = type(ftm) == "table" and ctx.call(ftm, "getFillTypeByName", "DIESEL") or nil
    return type(diesel) == "table" and ctx.num(diesel.pricePerLiter) or nil
end

CompanionPages.register({
    key = "realisticDieselPrice",
    modNames = { "FS25_RealisticDieselPrice", "FS25_363612_Realistic_Diesel_Price" },
    substrings = { "realisticdieselprice" },
    collect = function(ctx)
        local rdp = ctx.symbol("RealisticDieselPrice")
        if type(rdp) ~= "table" then
            rdp = ctx.symbol("rdp")
        end
        local gamePrice = gameDieselPrice(ctx)
        if type(rdp) ~= "table" then
            return { readState = "detection-only", gamePrice = ctx.round2(gamePrice) }
        end

        local regionIndex = ctx.num(rdp.currentRegion)
        local countryIndex = ctx.num(rdp.currentCountry)
        local regions, total = {}, 0
        local selectedRegion, selectedCountry, presetPrice = nil, nil, nil
        if type(rdp.regions) == "table" then
            for ri, region in ipairs(rdp.regions) do
                if ri > MAX_REGIONS then
                    break
                end
                if type(region) == "table" then
                    local countries = {}
                    for ci, country in ipairs(type(region.countries) == "table" and region.countries or {}) do
                        if type(country) == "table" and total < MAX_COUNTRIES then
                            total = total + 1
                            local selected = ri == regionIndex and ci == countryIndex
                            local price = ctx.round2(country.price)
                            countries[#countries + 1] = {
                                label = ctx.clip(country.label, 60),
                                price = price,
                                selected = selected,
                            }
                            if selected then
                                selectedCountry = ctx.clip(country.label, 60)
                                presetPrice = price
                            end
                        end
                    end
                    if ri == regionIndex then
                        selectedRegion = ctx.clip(region.name, 60)
                    end
                    regions[#regions + 1] = {
                        name = ctx.clip(region.name, 60),
                        selected = ri == regionIndex,
                        countries = countries,
                    }
                end
            end
        end

        local customMode = rdp.customMode == true
        local target = customMode and ctx.round2(rdp.customPrice) or presetPrice
        local inSync = nil
        if target and gamePrice then
            inSync = math.abs(target - gamePrice) < 0.005
        end
        local fdp = CompanionPages.loadedName and CompanionPages.loadedName("fluctuatingDieselPrice") or nil

        return {
            readState = "ok",
            customMode = customMode,
            customPrice = ctx.round2(rdp.customPrice),
            region = selectedRegion,
            country = selectedCountry,
            presetPrice = presetPrice,
            targetPrice = target,
            gamePrice = ctx.round2(gamePrice),
            inSync = inSync,
            otherDieselMod = fdp ~= nil and "fluctuatingDieselPrice" or nil,
            settingsMenuInstalled = rdp.menuInstalled == true,
            regions = regions,
        }
    end,
})
