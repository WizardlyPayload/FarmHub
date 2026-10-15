-- FS25 FarmDashboard | companionPages/TimeSavingStockCheckCollector.lua | v1.0.0
-- Time Saving Stock Check (twproductions). ModHub zip ships as FS25_TSStockCheck.
-- The mod has no manager: its table lives on the in-game menu page (InGameMenuStockCheck frame,
-- registered as inGameMenu.ingameMenuTSStockCheck) and is rebuilt only when the player opens that page
-- (onFrameOpen -> updateContent). This page copies the frame's last table (inStockData rows) and the
-- class thresholds. There is no GUI on a dedicated server, so there the page is settings-only.
-- The frame's table is always for the local player's farm (g_currentMission:getFarmId()).

local MAX_ROWS = 50

local function guideFor(current, best, good, veryGood)
    if current == nil or best == nil or best <= 0 then
        return nil
    end
    if current >= best then
        return "great"
    elseif veryGood ~= nil and current >= best * veryGood then
        return "veryGood"
    elseif good ~= nil and current >= best * good then
        return "good"
    end
    return "normal"
end

local function findFrame(ctx)
    local gui = ctx.global("g_gui")
    local menuClass = ctx.global("InGameMenu")
    if type(gui) ~= "table" or type(gui.screenControllers) ~= "table" or menuClass == nil then
        return nil
    end
    local menu = gui.screenControllers[menuClass]
    if type(menu) ~= "table" then
        return nil
    end
    local frame = menu.ingameMenuTSStockCheck
    return type(frame) == "table" and frame or nil
end

CompanionPages.register({
    key = "timeSavingStockCheck",
    modNames = { "FS25_TSStockCheck", "FS25_TimeSavingStockCheck", "FS25_302852_Time_Saving_Stock_Check" },
    substrings = { "tsstockcheck", "timesavingstockcheck", "time_saving_stock_check" },
    collect = function(ctx)
        local cls = ctx.symbol("InGameMenuStockCheck")
        local good = type(cls) == "table" and ctx.num(cls.goodPriceThreshold) or nil
        local veryGood = type(cls) == "table" and ctx.num(cls.vGoodPriceThreshold) or nil
        local out = {
            thresholds = { good = good, veryGood = veryGood },
            currentPeriod = ctx.envMonth(),
            snapshot = "lastMenuOpen",
        }
        local frame = findFrame(ctx)
        if frame == nil then
            out.readState = "settings-only"
            out.reason = ctx.global("g_gui") == nil and "no-gui" or "menu-not-registered"
            return out
        end
        out.showAllItems = frame.showAllItems == true
        local rows = type(frame.inStockData) == "table" and frame.inStockData or nil
        if rows == nil then
            out.readState = "settings-only"
            out.reason = "menu-not-opened"
            return out
        end
        local mission = ctx.mission
        local menuFarm = type(mission) == "table" and ctx.num(ctx.call(mission, "getFarmId")) or nil
        local farmId = ctx.farmId
        out.menuFarmId = menuFarm
        out.collectorFarmId = farmId
        if farmId == nil or menuFarm == nil then
            out.readState = "settings-only"
            out.reason = "farm-unknown"
            return out
        end
        if menuFarm ~= farmId then
            out.readState = "settings-only"
            out.reason = "other-farm"
            return out
        end

        local farm = {
            itemCount = 0,
            totalLiters = 0,
            totalValue = 0,
            bestTotalValue = 0,
            atBestCount = 0,
            noSellPointCount = 0,
            items = {},
        }
        local truncated = false
        for i = 1, #rows do
            local row = rows[i]
            if type(row) == "table" then
                local liters = ctx.num(row.currentStockLevel) or 0
                local price = ctx.num(row.bestBuyingPricePerLiter)
                local maxPrice = ctx.num(row.maxPricePerLiter)
                local scale = ctx.num(row.bestPriceScale) or 1
                local noSellPoint = row.noSellPoint == true
                local current = (not noSellPoint and price ~= nil) and liters * price or nil
                local best = maxPrice ~= nil and liters * maxPrice * scale or nil
                local guide = noSellPoint and "noSellPoint" or guideFor(current, best, good, veryGood)
                farm.itemCount = farm.itemCount + 1
                farm.totalLiters = farm.totalLiters + liters
                if current ~= nil then
                    farm.totalValue = farm.totalValue + current
                end
                if best ~= nil then
                    farm.bestTotalValue = farm.bestTotalValue + best
                end
                if guide == "great" then
                    farm.atBestCount = farm.atBestCount + 1
                elseif noSellPoint then
                    farm.noSellPointCount = farm.noSellPointCount + 1
                end
                if #farm.items < MAX_ROWS then
                    farm.items[#farm.items + 1] = {
                        fillType = ctx.clip(row.name, 40),
                        title = ctx.clip(row.title, 60),
                        liters = ctx.round2(liters),
                        pricePer1000 = price ~= nil and ctx.round2(price * 1000) or nil,
                        value = ctx.round2(current),
                        sellAt = not noSellPoint and ctx.clip(row.bestBuyingStation, 60) or nil,
                        bestPricePer1000 = maxPrice ~= nil and ctx.round2(maxPrice * 1000 * scale) or nil,
                        bestValue = ctx.round2(best),
                        bestPeriod = ctx.num(row.bestMonth),
                        greatDemand = row.greatDemand == true,
                        noSellPoint = noSellPoint,
                        guide = guide,
                    }
                else
                    truncated = true
                end
            end
        end
        farm.totalLiters = ctx.round2(farm.totalLiters)
        farm.totalValue = ctx.round2(farm.totalValue)
        farm.bestTotalValue = ctx.round2(farm.bestTotalValue)
        out.readState = "ok"
        out.coverage = truncated and "truncated" or "complete"
        out.byFarm = { [tostring(farmId)] = farm }
        return out
    end,
})
