-- Harvest Ledger v1.2.0.9 keeps measured harvest events on the server mission.
-- Legacy saved events without farmId are assigned farm 1 by that mod, so the
-- runtime table cannot prove their owner in multiplayer. Export SP only.

local MAX_EVENTS = 300
local MAX_ROWS = 80
local MAX_SLICES = 24
local MAX_PRODUCTS = 8

CompanionPages.register({
    key = "harvestLedger",
    modNames = { "FS25_HarvestLedger", "KM_82914_Harvest_Ledger" },
    substrings = { "harvestledger", "harvest_ledger" },
    collect = function(ctx)
        local farmId = ctx.farmId
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.isMultiplayer then
            return { readState = "settings-only", reason = "legacy-farm-identity-unproved" }
        end
        local mission = ctx.mission
        local ledger = type(mission) == "table" and mission.harvestLedger or nil
        local data = type(ledger) == "table" and ledger.data or nil
        if type(data) ~= "table" or type(data.events) ~= "table" then
            return { readState = "settings-only", reason = "no-server-ledger" }
        end

        local rows, events, open = {}, 0, 0
        local truncated = false
        for index, event in ipairs(data.events) do
            if index > MAX_EVENTS then
                truncated = true
                break
            end
            if type(event) == "table" and ctx.num(event.farmId) == farmId
                and (event.scope == "farm" or event.scope == "contract") then
                events = events + 1
                if event.closed ~= true then open = open + 1 end
                if type(event.slices) == "table" then
                    local sliceKeys = {}
                    for key in pairs(event.slices) do
                        if type(key) == "string" then
                            if #sliceKeys < MAX_SLICES then sliceKeys[#sliceKeys + 1] = key
                            else truncated = true end
                        end
                    end
                    table.sort(sliceKeys)
                    for _, key in ipairs(sliceKeys) do
                        local slice = event.slices[key]
                        if type(slice) == "table" and type(slice.products) == "table" then
                            local productKeys = {}
                            for productKey in pairs(slice.products) do
                                if type(productKey) == "string" then
                                    if #productKeys < MAX_PRODUCTS then productKeys[#productKeys + 1] = productKey
                                    else truncated = true end
                                end
                            end
                            table.sort(productKeys)
                            for _, productKey in ipairs(productKeys) do
                                local product = slice.products[productKey]
                                local liters = type(product) == "table" and ctx.num(product.liters) or nil
                                local area = type(product) == "table" and ctx.num(product.areaSqm) or nil
                                if liters and liters >= 0 and area and area >= 0 then
                                    if #rows < MAX_ROWS then
                                        rows[#rows + 1] = {
                                            farmId = farmId,
                                            eventId = ctx.num(event.id),
                                            scope = event.scope,
                                            field = ctx.clip(event.fieldLabel or event.fieldKey, 64),
                                            fieldNumber = ctx.num(event.fieldNumber),
                                            crop = ctx.clip(event.cropTitle or event.cropName, 64),
                                            product = ctx.clip(product.title or productKey, 64),
                                            year = ctx.num(slice.year),
                                            month = ctx.num(slice.month),
                                            areaSqm = area,
                                            liters = liters,
                                            closed = event.closed == true,
                                        }
                                    else
                                        truncated = true
                                    end
                                end
                            end
                        end
                    end
                end
            end
        end
        table.sort(rows, function(a, b)
            if (a.year or 0) ~= (b.year or 0) then return (a.year or 0) > (b.year or 0) end
            if (a.month or 0) ~= (b.month or 0) then return (a.month or 0) > (b.month or 0) end
            if (a.eventId or 0) ~= (b.eventId or 0) then return (a.eventId or 0) > (b.eventId or 0) end
            return (a.product or "") < (b.product or "")
        end)
        return {
            readState = "ok",
            coverage = truncated and "truncated" or "complete",
            byFarm = { [tostring(farmId)] = { eventCount = events, openCount = open } },
            rows = rows,
        }
    end,
})
