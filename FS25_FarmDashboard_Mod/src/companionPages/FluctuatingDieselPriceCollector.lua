-- FS25 FarmDashboard | companionPages/FluctuatingDieselPriceCollector.lua | v1.0.0
-- Fluctuating Diesel Price (Premium AG): randomDieselPrice re-rolls the DIESEL fill type price at
-- 00:00, 06:00, 12:00 and 18:00 inside a band set by economic difficulty. The mod keeps no state or
-- history, so this page reads the live game price and remembers the prices FarmHub has observed.

local BANDS = {
    [1] = { min = 1.0, max = 1.5 },
    [2] = { min = 1.25, max = 1.75 },
    [3] = { min = 1.5, max = 2.0 },
}
local CHANGE_HOURS = { 0, 6, 12, 18 }
local MAX_HISTORY = 28

-- Observed samples persist across export cycles for this session only (not saved).
local history = {}

local function gameDieselPrice(ctx)
    local ftm = ctx.global("g_fillTypeManager")
    local diesel = type(ftm) == "table" and ctx.call(ftm, "getFillTypeByName", "DIESEL") or nil
    return type(diesel) == "table" and ctx.num(diesel.pricePerLiter) or nil
end

local function slotOf(hour)
    return math.floor((hour or 0) / 6) * 6
end

local function nextChange(hour)
    if hour == nil then
        return nil, nil
    end
    local h = math.floor(hour)
    for _, change in ipairs(CHANGE_HOURS) do
        if change > h then
            return change, change - h
        end
    end
    return 0, 24 - h
end

local function remember(day, hour, price)
    if price == nil then
        return
    end
    local slot = slotOf(hour)
    local last = history[#history]
    if last and last.day == day and last.slot == slot then
        last.price = price
        return
    end
    history[#history + 1] = { day = day, slot = slot, price = price }
    while #history > MAX_HISTORY do
        table.remove(history, 1)
    end
end

CompanionPages.register({
    key = "fluctuatingDieselPrice",
    modNames = { "FS25_FluctuatingDieselPrice", "FS25_303059_Fluctuating_Diesel_Price" },
    substrings = { "fluctuatingdieselprice" },
    collect = function(ctx)
        local mission = type(ctx.mission) == "table" and ctx.mission or {}
        local env = type(mission.environment) == "table" and mission.environment or {}
        local info = type(mission.missionInfo) == "table" and mission.missionInfo or {}
        local difficulty = ctx.num(info.economicDifficulty)
        local band = difficulty and BANDS[math.floor(difficulty)] or nil
        local price = gameDieselPrice(ctx)
        local hour = ctx.num(env.currentHour)
        local day = ctx.num(env.currentMonotonicDay) or ctx.num(env.currentDay)
        remember(day, hour, ctx.round2(price))

        local position, outsideBand = nil, nil
        if band and price then
            position = ctx.round2((price - band.min) / (band.max - band.min))
            outsideBand = price < band.min - 0.005 or price > band.max + 0.005
        end
        local nextHour, hoursUntil = nextChange(hour)

        local samples, low, high, sum = {}, nil, nil, 0
        for _, s in ipairs(history) do
            samples[#samples + 1] = { day = s.day, hour = s.slot, price = s.price }
            low = (low == nil or s.price < low) and s.price or low
            high = (high == nil or s.price > high) and s.price or high
            sum = sum + s.price
        end
        local rdp = CompanionPages.loadedName and CompanionPages.loadedName("realisticDieselPrice") or nil

        return {
            readState = price and "ok" or "partial",
            modActive = type(ctx.symbol("randomDieselPrice")) == "table",
            price = ctx.round2(price),
            difficulty = difficulty,
            bandMin = band and band.min or nil,
            bandMax = band and band.max or nil,
            bandPosition = position,
            outsideBand = outsideBand,
            currentHour = hour,
            nextChangeHour = nextHour,
            hoursUntilChange = hoursUntil,
            observed = {
                count = #samples,
                low = low,
                high = high,
                average = #samples > 0 and ctx.round2(sum / #samples) or nil,
                samples = samples,
            },
            otherDieselMod = rdp ~= nil and "realisticDieselPrice" or nil,
        }
    end,
})
