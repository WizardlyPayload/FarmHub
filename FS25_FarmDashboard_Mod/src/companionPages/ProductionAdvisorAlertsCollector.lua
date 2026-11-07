-- Production Advisor 1.0.0.1: selected-farm configured product and sowing alerts.
-- Live recommendation/profit tables are projections, not recorded events.

local MAX_SCAN = 300
local MAX_ROWS = 60

local function finite(value, min, max, integer)
    local n = tonumber(value)
    if n == nil or n ~= n or n == math.huge or n == -math.huge
        or n < min or n > max or (integer and n ~= math.floor(n)) then return nil end
    return n
end

CompanionPages.register({
    key = "productionAdvisorAlerts",
    modNames = { "FS25_ProductionAdvisor", "KM_81606_Production_Advisor" },
    substrings = { "productionadvisor", "production_advisor" },
    collect = function(ctx)
        local farmId = finite(ctx.farmId, 1, 1000000, true)
        if farmId == nil then return { readState = "settings-only", reason = "no-farm" } end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-alerts-only" }
        end
        if ctx.version ~= nil and ctx.version ~= "1.0.0.1" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local advisor = ctx.symbol("g_productionAdvisor")
        if type(advisor) ~= "table" or type(advisor.alertSettingsByFarmId) ~= "table"
            or type(advisor.farmlandSowingAlertsById) ~= "table" then
            return { readState = "settings-only", reason = "alerts-not-ready" }
        end

        local rows, count, enabledCount, sowingCount = {}, 0, 0, 0
        local truncated, partial, scanned = false, false, 0
        local fillManager = ctx.global("g_fillTypeManager")
        local farmSettings = advisor.alertSettingsByFarmId[farmId]
        if type(farmSettings) == "table" then
            for index, setting in pairs(farmSettings) do
                scanned = scanned + 1
                if scanned > MAX_SCAN then truncated = true; break end
                local fillTypeIndex = finite(index, 1, 100000, true)
                local threshold = type(setting) == "table" and finite(setting.threshold, 0, 1000000000, false) or nil
                local mode = type(setting) == "table" and finite(setting.mode, 1, 2, true) or nil
                if fillTypeIndex ~= nil and threshold ~= nil and mode ~= nil
                    and type(setting.enabled) == "boolean" then
                    local fillType = ctx.call(fillManager, "getFillTypeByIndex", fillTypeIndex)
                    local title = ctx.call(fillManager, "getFillTypeTitleByIndex", fillTypeIndex)
                    if type(title) ~= "string" and type(fillType) == "table" then
                        title = fillType.title or fillType.name
                    end
                    count = count + 1
                    if setting.enabled then enabledCount = enabledCount + 1 end
                    if #rows < MAX_ROWS then
                        rows[#rows + 1] = {
                            farmId = farmId, kind = "product", fillTypeIndex = fillTypeIndex,
                            title = ctx.clip(title, 70), threshold = threshold,
                            enabled = setting.enabled, mode = mode,
                        }
                    else truncated = true end
                else partial = true end
            end
        end

        local farmlandManager = ctx.global("g_farmlandManager")
        local alerts = advisor.farmlandSowingAlertsById
        scanned = 0
        for key, alert in pairs(alerts) do
            scanned = scanned + 1
            if scanned > MAX_SCAN then truncated = true; break end
            if type(alert) == "table" and finite(alert.farmId, 1, 1000000, true) == farmId then
                local farmlandId = finite(alert.farmlandId or key, 1, 1000000, true)
                local fruit = type(alert.fruitTypeName) == "string" and alert.fruitTypeName or nil
                if farmlandId ~= nil and fruit ~= nil and fruit ~= "" then
                    local farmland = ctx.call(farmlandManager, "getFarmlandById", farmlandId)
                    if type(farmland) == "table" and finite(farmland.farmId, 1, 1000000, true) == farmId then
                        count = count + 1
                        sowingCount = sowingCount + 1
                        if #rows < MAX_ROWS then
                            rows[#rows + 1] = {
                                farmId = farmId, kind = "sowing", farmlandId = farmlandId,
                                fruitTypeName = ctx.clip(fruit, 64),
                            }
                        else truncated = true end
                    else partial = true end
                else partial = true end
            end
        end
        table.sort(rows, function(a, b)
            if a.kind ~= b.kind then return a.kind < b.kind end
            return (a.fillTypeIndex or a.farmlandId) < (b.fillTypeIndex or b.farmlandId)
        end)
        return {
            readState = count == 0 and "settings-only" or partial and "partial" or "ok",
            reason = count == 0 and "no-verified-configured-alerts" or nil,
            coverage = truncated and "truncated" or partial and "partial" or "complete",
            byFarm = { [tostring(farmId)] = {
                configuredCount = count, enabledProductCount = enabledCount,
                sowingCount = sowingCount,
            } },
            rows = rows,
        }
    end,
})
