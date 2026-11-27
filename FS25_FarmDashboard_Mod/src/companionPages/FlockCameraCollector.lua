-- Flock Camera 1.0.0.0 stores status, settings and a short event log on each placeable.
-- This is an owned-placeable view, not a video feed, violation log or historical farm ledger.

local MAX_SCAN = 500
local MAX_CAMERAS = 40
local MAX_EVENTS = 30

local function validMode(value)
    local n = tonumber(value)
    return n ~= nil and n == math.floor(n) and n >= 0 and n <= 2 and n or nil
end

CompanionPages.register({
    key = "flockCamera",
    modNames = { "KM_82460_Flock_Camera" },
    substrings = {},
    collect = function(ctx)
        if ctx.version ~= "1.0.0.0" then
            return { readState = "settings-only", reason = "unreviewed-version" }
        end
        local farmId = ctx.num(ctx.farmId)
        if farmId == nil or farmId <= 0 or farmId ~= math.floor(farmId) then
            return { readState = "settings-only", reason = "no-farm" }
        end
        if ctx.call(ctx.mission, "getIsServer") ~= true then
            return { readState = "settings-only", reason = "server-placeables-only" }
        end
        local klass = ctx.symbol("FlockCamera")
        local specKey = type(klass) == "table" and klass.SPEC_KEY or nil
        if type(specKey) ~= "string" or specKey ~= "spec_" .. ctx.modName .. ".flockCamera" then
            return { readState = "settings-only", reason = "specialization-not-ready" }
        end
        local system = type(ctx.mission.placeableSystem) == "table" and ctx.mission.placeableSystem or nil
        local placeables = system and system.placeables or nil
        if type(placeables) ~= "table" then
            return { readState = "settings-only", reason = "placeables-not-ready" }
        end

        local rows, scanned, count = {}, 0, 0
        local truncated = false
        for _, placeable in pairs(placeables) do
            scanned = scanned + 1
            if scanned > MAX_SCAN then truncated = true; break end
            if type(placeable) == "table" then
                local spec = placeable[specKey]
                if type(spec) == "table" then
                    local owner = ctx.num(ctx.call(placeable, "getOwnerFarmId"))
                    if owner == farmId then
                        if spec.valid ~= true or spec.ready ~= true or type(spec.events) ~= "table"
                            or type(spec.fallen) ~= "boolean" then
                            return { readState = "partial", reason = "camera-state-not-ready" }
                        end
                        local ledMode, alertMode = validMode(spec.ledMode), validMode(spec.alertMode)
                        if ledMode == nil or alertMode == nil then
                            return { readState = "partial", reason = "invalid-camera-mode" }
                        end
                        local events = {}
                        for index, event in ipairs(spec.events) do
                            if index > MAX_EVENTS then truncated = true; break end
                            if type(event) ~= "string" then
                                return { readState = "partial", reason = "invalid-camera-event" }
                            end
                            events[#events + 1] = ctx.clip(event, 120)
                        end
                        count = count + 1
                        if #rows < MAX_CAMERAS then
                            rows[#rows + 1] = {
                                farmId = farmId,
                                placeableId = ctx.clip(placeable.uniqueId, 80),
                                name = ctx.clip(ctx.call(placeable, "getName") or "Flock Camera", 80),
                                ledMode = ledMode,
                                alertMode = alertMode,
                                fallen = spec.fallen,
                                events = events,
                            }
                        else
                            truncated = true
                        end
                    end
                end
            end
        end
        if count == 0 then
            return { readState = "settings-only", reason = "no-owned-cameras" }
        end
        table.sort(rows, function(a, b)
            return tostring(a.name or "") .. tostring(a.placeableId or "")
                < tostring(b.name or "") .. tostring(b.placeableId or "")
        end)
        return {
            readState = "ok", coverage = truncated and "truncated" or "complete",
            byFarm = { [tostring(farmId)] = { cameraCount = count } },
            rows = rows,
        }
    end,
})
