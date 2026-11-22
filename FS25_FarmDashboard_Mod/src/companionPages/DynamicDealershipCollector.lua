-- Dynamic Dealership 2.0.0.0: pending customer orders live on mission.dealerManager.
-- Dealer stock orders and inventory are shared state, not farm-owned orders.

local MAX_SCAN = 200
local MAX_ROWS = 60

CompanionPages.register({
    key = "dynamicDealership",
    modNames = { "FS25_DynamicDealership", "FS25_369544_Dynamic_Dealership", "KM_80444_Dynamic_Dealership" },
    substrings = { "dynamicdealership", "dynamic_dealership" },
    collect = function(ctx)
        local farmId = ctx.farmId
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-orders-only" }
        end
        local dealer = type(ctx.mission) == "table" and ctx.mission.dealerManager or nil
        if type(dealer) ~= "table" or dealer.mission ~= ctx.mission
            or dealer.modName ~= ctx.modName or dealer.isInitialised ~= true
            or type(dealer.purchaseOrders) ~= "table" then
            return { readState = "settings-only", reason = "dealer-register-unavailable" }
        end
        local store = ctx.global("g_storeManager")
        local rows, count, scanned = {}, 0, 0
        local scanIncomplete, rowsTruncated, invalid = false, false, false
        for _, order in ipairs(dealer.purchaseOrders) do
            scanned = scanned + 1
            if scanned > MAX_SCAN then scanIncomplete = true; break end
            if type(order) == "table" and order.orderType == "CUSTOMER"
                and ctx.num(order.farmId) == farmId then
                local item = ctx.call(store, "getItemByXMLFilename", order.xmlFilename)
                local name = type(item) == "table" and (item.name or item.title) or nil
                local quantity = ctx.num(order.quantity)
                local deliveryDay = ctx.num(order.deliveryDay)
                local paid = ctx.num(order.paidAmount)
                local remaining = ctx.num(order.remainingAmount)
                if not name or quantity == nil or quantity < 1 or deliveryDay == nil
                    or paid == nil or paid < 0 or remaining == nil or remaining < 0 then
                    invalid = true
                else
                    count = count + 1
                    if #rows < MAX_ROWS then
                        rows[#rows + 1] = {
                            farmId = farmId,
                            orderId = ctx.num(order.id),
                            vehicle = ctx.clip(name, 80),
                            quantity = quantity,
                            deliveryDay = deliveryDay,
                            paidAmount = ctx.round2(paid),
                            remainingAmount = ctx.round2(remaining),
                            financed = order.finance ~= nil,
                            deliveryStatus = ctx.clip(order.deliveryStatus or order.financeStatus, 48),
                        }
                    else
                        rowsTruncated = true
                    end
                end
            end
        end
        local complete = not invalid and not scanIncomplete
        return {
            readState = not complete and "partial" or (count > 0 and "ok" or "settings-only"),
            reason = complete and count == 0 and "no-customer-orders" or nil,
            coverage = (scanIncomplete or rowsTruncated) and "truncated"
                or invalid and "partial" or "complete",
            byFarm = complete and { [tostring(farmId)] = { orderCount = count } } or nil,
            rows = rows,
        }
    end,
})
