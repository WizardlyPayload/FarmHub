-- Market Price Helper 1.0.0.1: client-side observed best selling-station prices.
-- Its history belongs to the local single-player save, not to an individual farm.

local MAX_TYPES = 80
local MAX_SAMPLES = 320

CompanionPages.register({
    key = "marketPriceHelper",
    modNames = { "FS25_362332_Market_Price_Helper", "KM_79555_Market_Price_Helper", "FS25_PriceTicker" },
    substrings = { "market_price_helper" },
    collect = function(ctx)
        local scope = "save-wide"
        if ctx.version ~= "1.0.0.1" then
            return { readState = "settings-only", reason = "unreviewed-version", scope = scope }
        end
        if ctx.isMultiplayer or ctx.global("g_client") == nil or ctx.global("g_server") == nil then
            return { readState = "settings-only", reason = "local-single-player-only", scope = scope }
        end
        local ticker = ctx.symbol("g_priceTicker")
        if type(ticker) ~= "table" or ticker.mission ~= ctx.mission or ticker.isClient ~= true
            or type(ticker.history) ~= "table" then
            return { readState = "settings-only", reason = "local-history-unavailable", scope = scope }
        end
        local manager = ctx.global("g_fillTypeManager")
        if type(manager) ~= "table" then
            return { readState = "partial", reason = "fill-types-unavailable", scope = scope }
        end
        local rows, scanned, truncated = {}, 0, false
        for index, values in pairs(ticker.history) do
            scanned = scanned + 1
            if scanned > MAX_TYPES then truncated = true; break end
            if type(index) == "number" and index > 0 and index == math.floor(index)
                and type(values) == "table" and #values > 0 then
                local fillType = ctx.call(manager, "getFillTypeByIndex", index)
                if type(fillType) == "table" then
                    local samples, low, high, latest = 0, nil, nil, nil
                    local first = math.max(1, #values - MAX_SAMPLES + 1)
                    for i = first, #values do
                        local entry = values[i]
                        if type(entry) == "table" then
                            local price, day, hour, period = ctx.num(entry.price), ctx.num(entry.day), ctx.num(entry.hour), ctx.num(entry.period)
                            if price and price > 0 and day and day >= 0 and hour and hour >= 0 and hour < 24
                                and period and period >= 0 and period <= 12 then
                                samples = samples + 1
                                low = low and math.min(low, price) or price
                                high = high and math.max(high, price) or price
                                latest = { pricePerLitre = price, day = day, hour = hour, period = period }
                            end
                        end
                    end
                    if latest then
                        rows[#rows + 1] = {
                            fillType = ctx.clip(fillType.name, 60),
                            title = ctx.clip(fillType.title or fillType.name, 80),
                            latest = latest,
                            lowPricePerLitre = low,
                            highPricePerLitre = high,
                            sampleCount = samples,
                            historyTruncated = #values > MAX_SAMPLES,
                        }
                    end
                end
            end
        end
        table.sort(rows, function(a, b) return (a.title or "") < (b.title or "") end)
        return {
            readState = truncated and "partial" or (#rows > 0 and "ok" or "settings-only"),
            reason = #rows == 0 and "no-observations" or nil,
            scope = scope,
            priceBasis = "best-station-price-per-litre",
            fillTypeCount = #rows,
            truncated = truncated,
            rows = rows,
        }
    end,
})
