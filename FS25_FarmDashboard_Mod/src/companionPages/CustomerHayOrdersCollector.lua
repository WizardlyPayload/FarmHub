-- Customer Hay Orders 0.9.9.3: save-local offers and accepted bale-delivery progress.
-- The mod stores no order farm ID. Expose its shared register only in single-player
-- for the sole player farm; multiplayer orders cannot be attributed safely.

local MAX_ORDERS = 5

CompanionPages.register({
    key = "customerHayOrders",
    modNames = { "KM_81634_Custom_Hay_Orders" },
    substrings = {},
    collect = function(ctx)
        local mission = ctx.mission
        if ctx.version ~= "0.9.9.3" then
            return { readState = "unavailable", reason = "unreviewed-version" }
        end
        if ctx.farmId ~= 1 or type(mission) ~= "table"
            or type(mission.missionDynamicInfo) ~= "table"
            or mission.missionDynamicInfo.isMultiplayer ~= false then
            return { readState = "unavailable", reason = "single-player-only" }
        end
        if ctx.call(mission, "getIsServer") ~= true then
            return { readState = "unavailable", reason = "server-register-only" }
        end
        local mod = ctx.symbol("CustomerHayOrders")
        if type(mod) ~= "table" or type(mod.orders) ~= "table" then
            return { readState = "unavailable", reason = "order-register-unavailable" }
        end

        local rows, pendingCount, acceptedCount = {}, 0, 0
        local invalid, truncated = false, false
        for index, order in ipairs(mod.orders) do
            if index > MAX_ORDERS then truncated = true; break end
            if type(order) ~= "table" then
                invalid = true
            else
                local required = ctx.num(order.required)
                local progress = ctx.num(order.progress)
                local reward = ctx.num(order.reward)
                local deadline = ctx.num(order.deadline)
                local pending = order.pending == true
                local accepted = order.accepted == true
                local customer = type(order.customer) == "string" and order.customer or ""
                local fillType = type(order.fillTypeName) == "string" and order.fillTypeName or ""
                local dropName = type(order.dropName) == "string" and order.dropName or ""
                if (pending == accepted) or type(order.round) ~= "boolean"
                    or type(order.wrapped) ~= "boolean" or customer == "" or fillType == ""
                    or dropName == "" or required == nil or required < 1
                    or required ~= math.floor(required) or progress == nil or progress < 0
                    or progress > required or progress ~= math.floor(progress)
                    or reward == nil or reward < 0 or reward ~= math.floor(reward)
                    or deadline == nil or deadline < 0 or deadline ~= math.floor(deadline) then
                    invalid = true
                else
                    if pending then pendingCount = pendingCount + 1 else acceptedCount = acceptedCount + 1 end
                    rows[#rows + 1] = {
                        farmId = 1,
                        customer = ctx.clip(customer, 80),
                        fillType = ctx.clip(fillType, 60),
                        dropName = ctx.clip(dropName, 80),
                        round = order.round,
                        wrapped = order.wrapped,
                        status = pending and "offer" or "accepted",
                        required = required,
                        progress = progress,
                        rewardOffered = reward,
                        deadlineDay = deadline,
                    }
                end
            end
        end
        if #mod.orders > MAX_ORDERS then truncated = true end
        return {
            readState = (invalid or truncated) and "partial" or #rows > 0 and "ok" or "settings-only",
            reason = #rows == 0 and not invalid and not truncated and "no-current-orders" or nil,
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            byFarm = { ["1"] = { orderCount = #rows, offerCount = pendingCount, acceptedCount = acceptedCount } },
            rows = rows,
        }
    end,
})
