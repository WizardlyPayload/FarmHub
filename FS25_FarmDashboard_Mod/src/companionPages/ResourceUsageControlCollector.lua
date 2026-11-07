-- Resource Usage Control v1.0.0.0: active save-wide policy, not consumption history.
-- Read the live mod object on the server. Never open profile XML or apply settings.

local MAX_SCAN = 200
local MAX_ROWS = 40

local function slotName(directory)
    if type(directory) ~= "string" then return nil end
    local normalized = directory:gsub("\\", "/"):gsub("/+$", "")
    return normalized:match("([^/]+)$")
end

CompanionPages.register({
    key = "resourceUsageControl",
    modNames = { "FS25_ResourceUsageControl", "KM_82082_resource-usage-control" },
    substrings = { "resourceusagecontrol", "resource_usage_control", "resource-usage-control" },
    collect = function(ctx)
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-policy-only", scope = "save-wide" }
        end
        if ctx.version ~= nil and ctx.version ~= "1.0.0.0" then
            return { readState = "settings-only", reason = "version-unreviewed", scope = "save-wide" }
        end
        local mod = ctx.symbol("ResourceUsageControl")
        if type(mod) ~= "table" or mod.catalogBuilt ~= true then
            return { readState = "unavailable", reason = "live-policy-unavailable", scope = "save-wide" }
        end
        local missionInfo = type(ctx.mission) == "table" and ctx.mission.missionInfo or nil
        local expectedSlot = type(missionInfo) == "table" and slotName(missionInfo.savegameDirectory) or nil
        if expectedSlot == nil or mod.savegameKey ~= expectedSlot then
            return { readState = "unavailable", reason = "save-slot-mismatch", scope = "save-wide" }
        end

        local individual = mod.individualEnabled == true
        local global = ctx.num(mod.globalMultiplier)
        local seed = ctx.num(mod.seedMultiplier)
        if global == nil or global <= 0 or seed == nil or seed <= 0 then
            return { readState = "partial", reason = "invalid-multiplier", scope = "save-wide" }
        end
        local cropMode = individual and mod.seedPerCropEnabled == true
        local resourceMode = individual and mod.resourceCategoryEnabled == true
        local crops, resources = {}, {}
        local scanned, changed = 0, 0
        local invalid = false
        local function readOverrides(source, output)
            if type(source) ~= "table" then invalid = true; return end
            for name, raw in pairs(source) do
                scanned = scanned + 1
                if scanned > MAX_SCAN then return end
                local value = ctx.num(raw)
                if type(name) ~= "string" or name == "" or value == nil or value <= 0 then
                    invalid = true
                elseif math.abs(value - 1) > 0.0001 then
                    changed = changed + 1
                    if #output < MAX_ROWS then
                        output[#output + 1] = { name = ctx.clip(name, 60), multiplier = ctx.round2(value) }
                    end
                end
            end
            table.sort(output, function(a, b) return a.name < b.name end)
        end
        if cropMode then readOverrides(mod.cropMultipliers, crops) end
        if resourceMode then readOverrides(mod.resourceMultipliers, resources) end
        local nondefault = individual and (cropMode and #crops > 0 or resourceMode and #resources > 0
            or not cropMode and math.abs(seed - 1) > 0.0001)
            or not individual and math.abs(global - 1) > 0.0001
        local truncated = scanned > MAX_SCAN or changed > #crops + #resources
        return {
            scope = "save-wide",
            readState = invalid and "partial" or nondefault and "ok" or "settings-only",
            reason = invalid and "invalid-override" or not nondefault and "default-policy" or nil,
            coverage = truncated and "truncated" or invalid and "partial" or "complete",
            individualMode = individual,
            globalMultiplier = ctx.round2(global),
            seedMultiplier = individual and not cropMode and ctx.round2(seed) or nil,
            seedPerCropEnabled = cropMode,
            resourceCategoryEnabled = resourceMode,
            cropOverrides = crops,
            resourceOverrides = resources,
            changedOverrideCount = changed,
        }
    end,
})
