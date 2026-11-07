-- Farm Limit Manager v1.0.0.0: save-wide configured caps, not farm utilization.
-- The live server manager loads its settings from the current save slot.

CompanionPages.register({
    key = "farmLimitManager",
    modNames = { "FS25_FarmLimitManager", "FS25_372370_Farm_Limit_Manager", "KM_82655_Farm_Limit_Manager" },
    substrings = { "farmlimitmanager", "farm_limit_manager" },
    collect = function(ctx)
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-policy-only", scope = "save-wide" }
        end
        if ctx.version ~= nil and ctx.version ~= "1.0.0.0" then
            return { readState = "settings-only", reason = "version-unreviewed", scope = "save-wide" }
        end
        local manager = ctx.symbol("g_farmLimitManager") or ctx.global("g_farmLimitManager")
        if type(manager) ~= "table" or manager.settingsSynchronized ~= true
            or type(manager.settings) ~= "table" then
            return { readState = "unavailable", reason = "live-policy-unavailable", scope = "save-wide" }
        end
        local keys = { "maxAIWorkers", "maxHusbandries", "maxGreenhouses", "maxFactories", "maxContracts" }
        local limits = {}
        local nondefault = false
        for _, key in ipairs(keys) do
            local value = ctx.num(manager.settings[key])
            if value == nil or value < 0 or value > 10 or value ~= math.floor(value) then
                return { readState = "partial", reason = "invalid-limit", scope = "save-wide" }
            end
            limits[key] = value
            if value ~= 1 then nondefault = true end
        end
        return {
            readState = nondefault and "ok" or "settings-only",
            reason = nondefault and nil or "default-policy",
            coverage = "complete",
            scope = "save-wide",
            limits = limits,
        }
    end,
})
