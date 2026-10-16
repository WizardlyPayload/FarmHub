-- FS25 FarmDashboard | companionPages/SoilWorkYieldBonusCollector.lua | v1.0.0
-- Soil Work Yield Bonus (moji, 1.3.0.1). Mod-env global g_soilWorkYieldBonus:
--   settings { enabled, showOverlay, cellSizeMeters, bonusDiscHarrow, bonusCultivatorDeep,
--              bonusCultivatorShallow, bonusPowerHarrow, bonusSubsoiler, bonusPlow }   (fractions)
--   cellSize   effective grid size in metres (1 .. 40)
--   cells      [cellKey] = bonus fraction; one map-wide grid, not split by farm or field.
--              Harvesting or mowing a cell consumes (clears) its bonus.
-- Only aggregates leave this file: worked cell counts and area per bonus tier. Cell keys encode world
-- coordinates and are never exported. The scan is capped per cycle; when the cap is hit the totals are
-- lower bounds (coverage = "sampled").

local SCAN_CELLS = 20000
local BONUS_MAX = 0.12

local TIERS = {
    { key = "discHarrow", setting = "bonusDiscHarrow" },
    { key = "cultivatorShallow", setting = "bonusCultivatorShallow" },
    { key = "cultivatorDeep", setting = "bonusCultivatorDeep" },
    { key = "powerHarrow", setting = "bonusPowerHarrow" },
    { key = "subsoiler", setting = "bonusSubsoiler" },
    { key = "plow", setting = "bonusPlow" },
}

local function readSettings(ctx, settings)
    local out = {
        enabled = settings.enabled == true,
        showOverlay = settings.showOverlay == true,
        cellSizeMeters = ctx.num(settings.cellSizeMeters),
        tools = {},
    }
    for _, tier in ipairs(TIERS) do
        out.tools[#out.tools + 1] = { tool = tier.key, bonus = ctx.num(settings[tier.setting]) }
    end
    return out
end

--- Tools whose configured bonus matches this value (several tools can share one value).
local function toolsFor(tools, bonus)
    local out = {}
    for _, t in ipairs(tools) do
        if t.bonus ~= nil and math.abs(t.bonus - bonus) < 0.0005 then
            out[#out + 1] = t.tool
        end
    end
    return out
end

CompanionPages.register({
    key = "soilWorkYieldBonus",
    modNames = { "FS25_SoilWorkYieldBonus", "FS25_367297_Soil_Work_Yield_Bonus" },
    substrings = { "soilworkyieldbonus", "soil_work_yield_bonus" },
    collect = function(ctx)
        local mgr = ctx.symbol("g_soilWorkYieldBonus")
        if type(mgr) ~= "table" then
            return nil
        end
        local settings = type(mgr.settings) == "table" and readSettings(ctx, mgr.settings) or nil
        local cellSize = ctx.num(mgr.cellSize)
        local out = {
            settings = settings,
            cellSize = cellSize,
            bonusMax = BONUS_MAX,
        }
        if type(mgr.cells) ~= "table" or cellSize == nil or cellSize <= 0 then
            out.readState = settings and "settings-only" or "detection-only"
            return out
        end

        local buckets = {}
        local scanned, worked, sum, best = 0, 0, 0, 0
        local truncated = false
        for _, bonus in pairs(mgr.cells) do
            scanned = scanned + 1
            if scanned > SCAN_CELLS then
                truncated = true
                break
            end
            local b = type(bonus) == "number" and bonus or nil
            if b ~= nil and b > 0 and b == b then
                worked = worked + 1
                sum = sum + b
                if b > best then
                    best = b
                end
                local key = math.floor(b * 1000 + 0.5)
                buckets[key] = (buckets[key] or 0) + 1
            end
        end

        local cellHa = cellSize * cellSize / 10000
        local tools = settings and settings.tools or {}
        local tiers = {}
        for key, count in pairs(buckets) do
            local bonus = key / 1000
            tiers[#tiers + 1] = {
                bonus = bonus,
                cells = count,
                areaHa = ctx.round2(count * cellHa),
                tools = toolsFor(tools, bonus),
            }
        end
        table.sort(tiers, function(a, b) return a.bonus > b.bonus end)
        while #tiers > 12 do
            table.remove(tiers)
        end

        out.workedCells = worked
        out.workedAreaHa = ctx.round2(worked * cellHa)
        out.averageBonus = worked > 0 and math.floor(sum / worked * 10000 + 0.5) / 10000 or nil
        out.bestBonus = worked > 0 and best or nil
        out.tiers = tiers
        out.coverage = truncated and "sampled" or "complete"
        out.scannedCells = math.min(scanned, SCAN_CELLS)
        out.readState = settings and "ok" or "partial"
        return out
    end,
})
