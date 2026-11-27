-- Production Supply Manager 1.0.0.0 stores automatic purchase history per farm.
-- The active fields follow the local player; select them only for their loaded farm.
-- Destination names in history are historical labels, not proof of current ownership.

local MAX_HISTORY = 12 -- Exact mod's AUTO_PURCHASE_HISTORY_LIMIT.

CompanionPages.register({
    key = "productionSupplyManager",
    modNames = { "KM_82199_Production_Supply_Manager", "FS25_ProductionSupplyManager" },
    substrings = { "production_supply_manager", "productionsupplymanager" },
    collect = function(ctx)
        if ctx.version ~= "1.0.0.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmId = ctx.farmId
        if farmId == nil or farmId <= 0 then
            return { readState = "settings-only", reason = "no-farm" }
        end
        local manager = ctx.symbol("g_productionSupplyManager")
        if type(manager) ~= "table" then
            return { readState = "settings-only", reason = "no-manager" }
        end

        local settings
        if ctx.num(manager.loadedSettingsFarmId) == farmId then
            settings = {
                autoPurchaseEnabled = manager.autoPurchaseEnabled,
                autoPurchaseHistory = manager.autoPurchaseHistory,
            }
        elseif type(manager.savedFarmSettings) == "table" then
            settings = manager.savedFarmSettings[farmId] or manager.savedFarmSettings[tostring(farmId)]
        end
        if type(settings) ~= "table" or type(settings.autoPurchaseHistory) ~= "table" then
            return { readState = "settings-only", reason = "no-farm-history" }
        end

        local history, invalid = {}, false
        local source = settings.autoPurchaseHistory
        for index = 1, math.min(#source, MAX_HISTORY) do
            local entry = source[index]
            local liters = type(entry) == "table" and ctx.num(entry.liters) or nil
            local cost = type(entry) == "table" and ctx.num(entry.cost) or nil
            if liters == nil or liters <= 0 or cost == nil or cost < 0 then
                invalid = true
            else
                history[#history + 1] = {
                    farmId = farmId,
                    production = ctx.clip(entry.production, 80),
                    product = ctx.clip(entry.product, 60),
                    station = ctx.clip(entry.station, 80),
                    daySerial = ctx.num(entry.daySerial),
                    liters = ctx.round2(liters),
                    cost = ctx.round2(cost),
                }
            end
        end
        return {
            readState = invalid and "partial" or (#history > 0 and "ok" or "settings-only"),
            reason = #history == 0 and "no-purchase-history" or nil,
            coverage = #source > MAX_HISTORY and "truncated" or "complete",
            byFarm = { [tostring(farmId)] = {
                autoPurchaseEnabled = settings.autoPurchaseEnabled == true,
                historyCount = #source,
            } },
            purchases = history,
        }
    end,
})
