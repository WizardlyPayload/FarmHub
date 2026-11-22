-- Chainsaw Consumables 1.0.0: saved current condition on currently owned saws.
-- Never call ChainsawConsumables.state(tool): it creates default state.

local MAX_TOOLS = 100
local MAX_ROWS = 30

local function valid(value, maximum)
    local n = tonumber(value)
    if n ~= nil and n == n and n >= 0 and n <= maximum then return n end
    return nil
end

CompanionPages.register({
    key = "chainsawConsumables",
    modNames = { "KM_82857_Chainsaw_Consumables" },
    substrings = {},
    collect = function(ctx)
        if ctx.version ~= "1.0.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmId = valid(ctx.farmId, 8)
        if farmId == nil or farmId < 1 or farmId ~= math.floor(farmId) then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-hand-tool-state-only" }
        end
        local system = type(ctx.mission) == "table" and ctx.mission.handToolSystem or nil
        local tools = type(system) == "table" and system.handTools or nil
        if type(tools) ~= "table" then
            return { readState = "settings-only", reason = "hand-tool-list-not-ready" }
        end

        local candidates, ids, scanned = {}, {}, 0
        local invalid, truncated = false, false
        for _, tool in ipairs(tools) do
            scanned = scanned + 1
            if scanned > MAX_TOOLS then truncated = true; break end
            if type(tool) == "table" and tool.spec_chainsaw ~= nil
                and ctx.num(ctx.call(tool, "getOwnerFarmId")) == farmId then
                local id = ctx.call(tool, "getUniqueId")
                if type(id) ~= "string" or id == "" then invalid = true
                else
                    ids[id] = (ids[id] or 0) + 1
                    candidates[#candidates + 1] = { tool = tool, id = id }
                end
            end
        end

        local rows = {}
        for _, candidate in ipairs(candidates) do
            local tool, id = candidate.tool, candidate.id
            local state = tool.ccState
            if ids[id] ~= 1 or type(state) ~= "table" then invalid = true
            else
                local fuel = valid(state.fuel, 0.55)
                local oil = valid(state.oil, 0.25)
                local sharpness = valid(state.sharpness, 1)
                local chainLife = valid(state.chainLife, 1)
                local engine = valid(state.engine, 1)
                if not fuel or not oil or not sharpness or not chainLife or not engine then
                    invalid = true
                elseif #rows < MAX_ROWS then
                    rows[#rows + 1] = {
                        farmId = farmId, toolId = ctx.clip(id, 80),
                        tool = ctx.clip(ctx.call(tool, "getName"), 80),
                        fuelLitres = fuel, chainOilLitres = oil,
                        sharpnessPercent = sharpness * 100,
                        chainLifePercent = chainLife * 100,
                        enginePercent = engine * 100,
                    }
                else truncated = true end
            end
        end
        if #rows == 0 and not invalid and not truncated then
            return { readState = "settings-only", reason = "no-owned-chainsaw" }
        end
        table.sort(rows, function(a, b) return tostring(a.toolId) < tostring(b.toolId) end)
        return {
            readState = invalid and "partial" or "ok",
            reason = invalid and "ambiguous-or-unreadable-saw" or nil,
            coverage = truncated and "truncated" or "complete",
            byFarm = { [tostring(farmId)] = { sawCount = not invalid and not truncated and #rows or nil } },
            rows = rows,
        }
    end,
})
