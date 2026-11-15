-- Invoices - Production Sales v1.0.0.0 keeps farm-keyed posted offers.
-- Read the server register directly; buildSnapshot and validateOffers mutate state.

local MAX_SCAN = 300
local MAX_ROWS = 40

CompanionPages.register({
    key = "invoicesProductionSalesOffers",
    modNames = { "FS25_373258_Invoices_-_Production_Sales", "KM_82919_Invoices_-_Production_Sales", "FS25_InvoicesProductionSales" },
    substrings = { "invoices_-_production_sales", "invoicesproductionsales" },
    collect = function(ctx)
        local farmId = ctx.farmId
        local mission = ctx.mission
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-register-only" }
        end
        local manager = type(mission) == "table" and mission.invoicesProductionSalesManager or nil
        if type(manager) ~= "table" or manager.integrationAvailable ~= true
            or type(manager.offers) ~= "table" or type(manager.productionByUniqueId) ~= "table" then
            return { readState = "settings-only", reason = "offer-register-unavailable" }
        end

        local rows, posted, withheld = {}, 0, 0
        local scanned, truncated = 0, false
        for _, offer in pairs(manager.offers) do
            scanned = scanned + 1
            if scanned > MAX_SCAN then truncated = true; break end
            if type(offer) == "table" and ctx.num(offer.sellerFarmId) == farmId and offer.enabled == true then
                local point = manager.productionByUniqueId[offer.productionUniqueId]
                local placeable = type(point) == "table" and point.owningPlaceable or nil
                local currentOwner = ctx.num(ctx.call(placeable, "getOwnerFarmId"))
                local fillIndex = ctx.num(offer.fillTypeIndex)
                local remaining = ctx.num(offer.remainingLiters)
                local price = ctx.num(offer.price)
                local output = fillIndex and type(point.outputFillTypeIds) == "table"
                    and point.outputFillTypeIds[fillIndex] == true
                local stored = output
                    and not (type(point.outputFillTypeIdsDirectSell) == "table" and point.outputFillTypeIdsDirectSell[fillIndex])
                    and not (type(point.outputFillTypeIdsAutoDeliver) == "table" and point.outputFillTypeIdsAutoDeliver[fillIndex])
                if currentOwner ~= farmId or not stored or remaining == nil or remaining <= 0
                    or price == nil or price < 0 then
                    withheld = withheld + 1
                else
                    posted = posted + 1
                    if #rows < MAX_ROWS then
                        local product = ctx.call(manager, "getFillTypeMetadata", fillIndex)
                        rows[#rows + 1] = {
                            farmId = farmId,
                            production = ctx.clip(ctx.call(point, "getName") or ctx.call(placeable, "getName"), 70),
                            product = ctx.clip(product, 60),
                            pricePer1000L = ctx.round2(price),
                            listedLiters = ctx.round2(offer.listedLiters),
                            remainingLiters = ctx.round2(remaining),
                            listedPallets = ctx.num(offer.listedPallets),
                            remainingPallets = ctx.num(offer.remainingPallets),
                        }
                    else
                        truncated = true
                    end
                end
            end
        end
        table.sort(rows, function(a, b)
            local pa, pb = tostring(a.production or ""), tostring(b.production or "")
            if pa ~= pb then return pa < pb end
            return tostring(a.product or "") < tostring(b.product or "")
        end)
        return {
            readState = (truncated or withheld > 0) and "partial" or "ok",
            coverage = truncated and "truncated" or withheld > 0 and "partial" or "complete",
            byFarm = { [tostring(farmId)] = truncated and {} or {
                postedCount = posted,
                withheldCount = withheld,
            } },
            offers = rows,
        }
    end,
})
