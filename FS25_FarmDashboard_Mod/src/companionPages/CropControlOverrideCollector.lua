-- Crop Control Override 2.0.3.6 / 2.1.0.0-beta.2: read the live server crop rules.
-- These rules apply to the whole save. Do not attribute them to ctx.farmId, call
-- the mod's apply/write/reset methods, or read a profile/template XML as live state.

local MAX_SCAN = 300
local MAX_ROWS = 60
local DEFAULT_RESEED_WEIGHT = 5 -- Both inspected versions' DEFAULT_FRUIT_RESEED_WEIGHT.

CompanionPages.register({
    key = "cropControlOverride",
    modNames = { "FS25_CropControlOverride", "FS25_365010_FS25_CropControlOverride",
        "KM_78768_Crop_Control_Override", "GH_SimGamerJen__FS25_CropControlOverride_FS25_CropControlOverride" },
    substrings = { "cropcontroloverride", "crop_control_override" },
    collect = function(ctx)
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-policy-only", scope = "save-wide" }
        end
        local mod = ctx.symbol("CropControlOverride")
        if type(mod) ~= "table" or type(mod._rules) ~= "table" or mod._configPath == nil then
            return { readState = "settings-only", reason = "live-policy-unavailable", scope = "save-wide" }
        end
        local version = tostring(mod.VERSION or "")
        if version ~= "2.0.3.6" and version ~= "2.1.0.0-beta.2" then
            return { readState = "settings-only", reason = "version-unreviewed", scope = "save-wide" }
        end

        local names = {}
        local scanned = 0
        for name, rule in pairs(mod._rules) do
            scanned = scanned + 1
            if scanned > MAX_SCAN then break end
            if type(name) == "string" and type(rule) == "table" and #name > 0 then
                names[#names + 1] = name
            end
        end
        if #names == 0 then
            return { readState = "settings-only", reason = "live-policy-empty", scope = "save-wide" }
        end
        table.sort(names)
        local rows = {}
        local changed = 0
        for _, name in ipairs(names) do
            local rule = mod._rules[name]
            local maxHa = ctx.num(rule.npcMaxHa)
            local weight = ctx.num(rule.reseedWeight)
            if rule.enabled == false or rule.npcAllowed ~= nil or (maxHa ~= nil and maxHa > 0)
                or rule.resetNpcFields == false or (weight ~= nil and weight ~= DEFAULT_RESEED_WEIGHT) then
                changed = changed + 1
                if #rows < MAX_ROWS then
                    local npcAllowed = nil
                    if type(rule.npcAllowed) == "boolean" then npcAllowed = rule.npcAllowed end
                    rows[#rows + 1] = {
                        crop = ctx.clip(name, 60),
                        playerEnabled = rule.enabled ~= false,
                        npcAllowed = npcAllowed,
                        npcMaxHa = maxHa ~= nil and maxHa > 0 and ctx.round2(maxHa) or nil,
                        resetNpcFields = rule.resetNpcFields ~= false,
                        reseedWeight = weight,
                    }
                end
            end
        end
        local truncated = scanned > MAX_SCAN or changed > MAX_ROWS
        local incomplete = scanned ~= #names
        return {
            scope = "save-wide",
            sourceVersion = version,
            readState = incomplete and "partial" or changed > 0 and "ok" or "settings-only",
            reason = incomplete and "incomplete-rules" or changed == 0 and "default-rules" or nil,
            coverage = truncated and "truncated" or incomplete and "partial" or "complete",
            ruleCount = #names,
            changedCount = changed,
            rules = rows,
        }
    end,
})
