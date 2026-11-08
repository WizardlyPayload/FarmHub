-- Farm Contractor Services 3.0.1.1: copy current single-player work orders.
-- refreshWorkOrders can allocate identities; persistence writers mutate state.
-- Neither is called by this reader.

local MAX_SCAN = 100
local MAX_ROWS = 25
local MAX_ID = 1000000000
local MAX_MONEY = 1000000000000
local MAX_AREA_HA = 1000000

local function finite(value, maximum)
    local n = tonumber(value)
    if n ~= nil and n == n and n ~= math.huge and n ~= -math.huge
        and n >= 0 and n <= maximum then return n end
    return nil
end

local function integer(value, maximum)
    local n = finite(value, maximum)
    return n and n == math.floor(n) and n or nil
end

local function label(ctx, value, maximum)
    if type(value) == "string" and value ~= "" then
        return ctx.clip(value, maximum)
    end
    return nil
end

CompanionPages.register({
    key = "farmContractorServices",
    modNames = { "KM_82945_Farm_Contractor_Services" },
    substrings = {},
    collect = function(ctx)
        if ctx.version ~= "3.0.1.1" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        if ctx.isMultiplayer then
            return { readState = "settings-only", reason = "single-player-only" }
        end
        local farmId = integer(ctx.farmId, 8)
        if not farmId or farmId == 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        local mission = ctx.mission
        if ctx.call(mission, "getIsServer") ~= true or
            (type(mission) == "table" and mission.isMissionStarted == false) then
            return { readState = "settings-only", reason = "server-world-not-ready" }
        end
        local manager = ctx.symbol("ContractorHarvesting")
        if type(manager) ~= "table" or type(manager.workOrders) ~= "table" then
            return { readState = "settings-only", reason = "order-register-not-ready" }
        end
        if manager.persistenceRecoveryError ~= nil then
            return { readState = "partial", reason = "persistence-recovery-error" }
        end

        local rows, seen = {}, {}
        local scanned, invalid, truncated = 0, false, false
        for key, order in pairs(manager.workOrders) do
            scanned = scanned + 1
            if scanned > MAX_SCAN then truncated = true; break end
            if type(order) == "table" and integer(order.farmId, 8) == farmId then
                local id = integer(order.id, MAX_ID)
                local farmlandId = integer(order.farmlandId, MAX_ID)
                local operation = type(order.operations) == "table" and order.operations[1] or nil
                local record = type(operation) == "table" and operation.record or nil
                local state = label(ctx, order.state, 40)
                local service = type(operation) == "table"
                    and label(ctx, operation.serviceType, 40) or nil
                local price = type(record) == "table" and finite(record.price, MAX_MONEY) or nil
                local area = type(record) == "table" and finite(record.areaHa, MAX_AREA_HA) or nil
                if not id or id == 0 or integer(key, MAX_ID) ~= id or seen[id]
                    or not farmlandId or farmlandId == 0 or not state or not service
                    or type(record) ~= "table" or integer(record.farmId, 8) ~= farmId
                    or type(order.operations[2]) ~= "nil" or not price or not area then
                    invalid = true
                else
                    seen[id] = true
                    if #rows < MAX_ROWS then
                        rows[#rows + 1] = {
                            farmId = farmId,
                            orderId = id,
                            farmlandId = farmlandId,
                            fieldName = label(ctx, order.fieldName, 80),
                            service = service,
                            state = state,
                            bookedPrice = price,
                            areaHa = area,
                        }
                    else truncated = true end
                end
            end
        end
        table.sort(rows, function(a, b) return a.orderId < b.orderId end)
        local complete = not invalid and not truncated
        return {
            readState = (invalid or truncated) and "partial"
                or #rows > 0 and "ok" or "settings-only",
            reason = invalid and "invalid-or-ambiguous-order"
                or truncated and "order-scan-truncated"
                or #rows == 0 and "no-current-farm-orders" or nil,
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            byFarm = complete and { [tostring(farmId)] = { currentOrderCount = #rows } } or nil,
            rows = rows,
        }
    end,
})
