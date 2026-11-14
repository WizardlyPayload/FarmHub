-- Sell To The Best Bidder v1.0.0.1 persists current vehicle listings.
-- Offers are provisional; completed sales are reflected in native farm money.

local MAX_SCAN, MAX_ROWS = 300, 60

CompanionPages.register({
    key = "sellToTheBestBidder",
    modNames = { "FS25_359753_Sell_To_The_Best_Bidder", "FS25_SellToTheBestBidder" },
    substrings = { "sell_to_the_best_bidder", "selltothebestbidder" },
    collect = function(ctx)
        local farmId = ctx.num(ctx.farmId)
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-listings-only" }
        end
        if ctx.version ~= "1.0.0.1" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local mod = ctx.symbol("stbb") or ctx.global("stbb")
        local listings = type(mod) == "table" and mod.vehiclesForSale or nil
        if type(listings) ~= "table" then
            return { readState = "settings-only", reason = "listing-register-unavailable" }
        end

        local rows, count, pending, offered = {}, 0, 0, 0
        local scanned, withheld, invalid, truncated = 0, 0, false, false
        for vehicle, sale in pairs(listings) do
            scanned = scanned + 1
            if scanned > MAX_SCAN then truncated = true; break end
            if type(sale) == "table" and ctx.num(sale.farmId) == farmId then
                -- Saved farm IDs can outlive ownership changes. Both must agree.
                if type(vehicle) ~= "table" or ctx.num(vehicle.ownerFarmId) ~= farmId then
                    withheld = withheld + 1
                else
                    local asking = ctx.num(sale.askingPrice)
                    local offer = ctx.num(sale.offerPrice)
                    local buyerArrived = sale.buyerArrived == true
                    local name = ctx.clip(ctx.call(vehicle, "getName") or vehicle.name, 80)
                    local brand = type(vehicle.brand) == "table" and ctx.clip(vehicle.brand.title, 40) or nil
                    if asking == nil or asking < 0 or name == nil or name == "" then
                        invalid = true
                    else
                        count = count + 1
                        if buyerArrived and offer ~= nil and offer > 0 then offered = offered + 1
                        else pending = pending + 1 end
                        if #rows >= MAX_ROWS then truncated = true
                        else
                            rows[#rows + 1] = {
                                farmId = farmId,
                                vehicle = brand and brand ~= "" and (brand .. " " .. name) or name,
                                askingPrice = asking,
                                offerPrice = buyerArrived and offer and offer > 0 and offer or nil,
                                workshopPrice = buyerArrived and ctx.num(sale.workshopPrice) or nil,
                                buyerArrived = buyerArrived,
                                buyerDelayMinutes = not buyerArrived and ctx.num(sale.buyerDelayMinutes) or nil,
                                elapsedGameMinutes = not buyerArrived and ctx.num(sale.elapsedGameMinutes) or nil,
                                buyerWaitElapsed = buyerArrived and ctx.num(sale.buyerWaitElapsed) or nil,
                            }
                        end
                    end
                end
            end
        end
        table.sort(rows, function(a, b) return a.vehicle < b.vehicle end)
        return {
            readState = (invalid or withheld > 0) and "partial" or
                (count > 0 and "ok" or "settings-only"),
            reason = count == 0 and "no-current-owned-listings" or nil,
            coverage = truncated and "truncated" or
                (invalid or withheld > 0) and "partial" or "complete",
            byFarm = { [tostring(farmId)] = {
                listingCount = count, pendingCount = pending,
                activeOfferCount = offered, withheldOwnership = withheld,
            } },
            rows = rows,
        }
    end,
})
