-- Realistic Fueling System 1.0.0.0 persists diesel/DEF quotes on each fuel silo.
-- These are configured prices, not fuel transactions or revenue.

local MAX_SCAN = 500
local MAX_ROWS = 60

local function validPrice(value)
    local n = tonumber(value)
    return n ~= nil and n == n and n >= 0.1 and n <= 5 and n or nil
end

CompanionPages.register({
    key = "realisticFuelingSilos",
    modNames = { "FS25_344040_Realistic_Fueling_System" },
    substrings = {},
    collect = function(ctx)
        if ctx.version ~= "1.0.0.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmId = ctx.num(ctx.farmId)
        if farmId == nil or farmId <= 0 or farmId ~= math.floor(farmId) then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-silo-prices-only" }
        end
        local system = type(ctx.mission.placeableSystem) == "table" and ctx.mission.placeableSystem or nil
        local placeables = system and system.placeables or nil
        if type(placeables) ~= "table" then
            return { readState = "settings-only", reason = "placeables-not-ready" }
        end

        local rows, count, scanned = {}, 0, 0
        local truncated, invalid = false, false
        for _, placeable in pairs(placeables) do
            scanned = scanned + 1
            if scanned > MAX_SCAN then truncated = true; break end
            if type(placeable) == "table" and type(placeable.spec_dynamicPricingSilo) == "table" then
                if ctx.num(ctx.call(placeable, "getOwnerFarmId")) == farmId then
                    local prices = placeable.spec_dynamicPricingSilo.currentPrices
                    local diesel = type(prices) == "table" and validPrice(prices.DIESEL) or nil
                    local def = type(prices) == "table" and validPrice(prices.DEF) or nil
                    if diesel == nil or def == nil then
                        invalid = true
                    else
                        count = count + 1
                        if #rows < MAX_ROWS then
                            rows[#rows + 1] = {
                                farmId = farmId,
                                placeableId = ctx.clip(placeable.uniqueId, 80),
                                name = ctx.clip(ctx.call(placeable, "getName"), 80),
                                dieselPerLitre = diesel,
                                defPerLitre = def,
                            }
                        else
                            truncated = true
                        end
                    end
                end
            end
        end
        table.sort(rows, function(a, b)
            return tostring(a.name or "") .. tostring(a.placeableId or "")
                < tostring(b.name or "") .. tostring(b.placeableId or "")
        end)
        return {
            readState = invalid and "partial" or "ok",
            reason = invalid and "invalid-owned-silo-price" or nil,
            coverage = truncated and "truncated" or "complete",
            byFarm = { [tostring(farmId)] = { siloCount = count } },
            rows = rows,
        }
    end,
})
