-- Grape And Olive Yield Settings 1.0.0.0: read the active server rule, not the
-- profile XML. The multiplier is save-wide and is not a measured harvest.

local function validMultiplier(ctx, value)
    local n = ctx.num(value)
    if n == nil or n < 1 or n > 10 then return nil end
    return n
end

local function currentRate(ctx, name)
    local manager = ctx.global("g_fruitTypeManager")
    local fruit = ctx.call(manager, "getFruitTypeByName", name)
    if type(fruit) ~= "table" then return nil end
    local n = ctx.num(fruit.literPerSqm)
    if n == nil or n < 0 then return nil end
    return n
end

CompanionPages.register({
    key = "grapeOliveYieldSettings",
    modNames = { "FS25_366544_Grape_And_Olive_Yield_Settings", "FS25_GrapeOliveYield" },
    substrings = { "grape_and_olive_yield_settings", "grapeoliveyield" },
    collect = function(ctx)
        local scope = "save-wide"
        if ctx.version ~= "1.0.0.0" then
            return { readState = "settings-only", reason = "unreviewed-version", scope = scope }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-rule-only", scope = scope }
        end
        local mod = ctx.symbol("grapeOliveYield")
        if type(mod) ~= "table" or mod.isInitialized ~= true or mod.isPatched ~= true
            or type(mod.settings) ~= "table" then
            return { readState = "settings-only", reason = "rule-not-applied", scope = scope }
        end
        local grape = validMultiplier(ctx, mod.settings.grapeMultiplier)
        local olive = validMultiplier(ctx, mod.settings.oliveMultiplier)
        if grape == nil or olive == nil then
            return { readState = "partial", reason = "invalid-multiplier", scope = scope }
        end
        return {
            readState = (grape ~= 1 or olive ~= 1) and "ok" or "settings-only",
            scope = scope,
            grapeMultiplier = grape,
            oliveMultiplier = olive,
            grapeLitresPerSqm = currentRate(ctx, "grape"),
            oliveLitresPerSqm = currentRate(ctx, "olive"),
        }
    end,
})
